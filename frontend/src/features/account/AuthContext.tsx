import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { PlayerProgress } from '@/types/game';
import {
  getAccountSession,
  getAuthConfig,
  loginAccount,
  logoutAccount,
  registerAccount,
  saveAccountProgress,
  type AccountSession,
  type AuthConfig,
  type LoginPayload,
  type RegisterPayload,
} from './accountApi';

export type AuthStatus = 'loading' | 'guest' | 'authenticated' | 'unavailable';
export type AccountSyncState = 'idle' | 'saving' | 'saved' | 'error';

interface AuthContextValue {
  status: AuthStatus;
  session: AccountSession | null;
  config: AuthConfig | null;
  startupError: string;
  syncState: AccountSyncState;
  lastSyncedAt: number | null;
  login: (payload: LoginPayload, signal?: AbortSignal) => Promise<AccountSession>;
  register: (payload: RegisterPayload, signal?: AbortSignal) => Promise<AccountSession>;
  syncProgress: (progress: PlayerProgress, signal?: AbortSignal) => Promise<PlayerProgress>;
  logout: (signal?: AbortSignal) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_SYNC_KEY = 'termburg-auth-sync-v1';
const AUTH_SYNC_CHANNEL = 'termburg-auth-v1';

function announceAuthChange() {
  const token = `${Date.now()}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  try {
    localStorage.setItem(AUTH_SYNC_KEY, token);
  } catch {
    // BroadcastChannel below remains available when storage access is blocked.
  }
  try {
    const channel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
    channel.postMessage(token);
    channel.close();
  } catch {
    // Older browsers still receive the storage event.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [session, setSession] = useState<AccountSession | null>(null);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [startupError, setStartupError] = useState('');
  const [syncState, setSyncState] = useState<AccountSyncState>('idle');
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const sessionCheckRevisionRef = useRef(0);
  const activeAccountIdRef = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const revision = ++sessionCheckRevisionRef.current;

    void Promise.allSettled([
      getAuthConfig(controller.signal).then(setConfig),
      getAccountSession(controller.signal).then(next => {
        if (revision !== sessionCheckRevisionRef.current) return;
        activeAccountIdRef.current = next?.account.id ?? null;
        setSession(next);
        setStatus(next ? 'authenticated' : 'guest');
      }),
    ]).then(results => {
      if (controller.signal.aborted || revision !== sessionCheckRevisionRef.current) return;
      const sessionResult = results[1];
      if (sessionResult.status === 'rejected') {
        activeAccountIdRef.current = null;
        setSession(null);
        setStatus('unavailable');
        setStartupError('Не удалось проверить вход. Гостевая игра продолжает работать.');
      }
    });

    return () => controller.abort();
  }, []);

  const applySession = useCallback((next: AccountSession) => {
    sessionCheckRevisionRef.current += 1;
    activeAccountIdRef.current = next.account.id;
    setSession(next);
    setStatus('authenticated');
    setStartupError('');
    setSyncState('saved');
    setLastSyncedAt(Date.now());
    return next;
  }, []);

  useEffect(() => {
    let controller: AbortController | null = null;
    let lastToken = '';

    const refreshSession = (token: string) => {
      if (!token || token === lastToken) return;
      lastToken = token;
      controller?.abort();
      controller = new AbortController();
      const revision = ++sessionCheckRevisionRef.current;
      void getAccountSession(controller.signal)
        .then(next => {
          if (revision !== sessionCheckRevisionRef.current) return;
          activeAccountIdRef.current = next?.account.id ?? null;
          setSession(next);
          setStatus(next ? 'authenticated' : 'guest');
          setStartupError('');
          setSyncState(next ? 'saved' : 'idle');
          setLastSyncedAt(next ? Date.now() : null);
        })
        .catch(error => {
          if (controller?.signal.aborted || revision !== sessionCheckRevisionRef.current) return;
          activeAccountIdRef.current = null;
          setSession(null);
          setStatus('unavailable');
          setSyncState('idle');
          setLastSyncedAt(null);
          setStartupError(error instanceof Error
            ? 'Не удалось обновить состояние входа. Проверьте интернет.'
            : 'Не удалось проверить вход.');
        });
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === AUTH_SYNC_KEY && event.newValue) refreshSession(event.newValue);
    };
    window.addEventListener('storage', handleStorage);

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
      channel.addEventListener('message', event => refreshSession(String(event.data || '')));
    } catch {
      channel = null;
    }

    return () => {
      controller?.abort();
      window.removeEventListener('storage', handleStorage);
      channel?.close();
    };
  }, []);

  const login = useCallback(async (payload: LoginPayload, signal?: AbortSignal) => {
    const next = applySession(await loginAccount(payload, signal));
    announceAuthChange();
    return next;
  }, [applySession]);

  const register = useCallback(async (payload: RegisterPayload, signal?: AbortSignal) => {
    const next = applySession(await registerAccount(payload, signal));
    announceAuthChange();
    return next;
  }, [applySession]);

  const syncProgress = useCallback(async (progress: PlayerProgress, signal?: AbortSignal) => {
    const expectedAccountId = session?.account.id;
    if (
      status !== 'authenticated'
      || !expectedAccountId
      || activeAccountIdRef.current !== expectedAccountId
    ) return progress;
    setSyncState('saving');
    try {
      const saved = await saveAccountProgress(progress, expectedAccountId, signal);
      if (activeAccountIdRef.current !== expectedAccountId) {
        throw new Error('Профиль изменился во время сохранения.');
      }
      setSession(current => current?.account.id === expectedAccountId ? {
        ...current,
        progress: saved.progress,
        revision: saved.revision,
      } : current);
      setSyncState('saved');
      setLastSyncedAt(saved.savedAt || Date.now());
      return saved.progress;
    } catch (error) {
      if (activeAccountIdRef.current === expectedAccountId) setSyncState('error');
      throw error;
    }
  }, [session?.account.id, status]);

  const logout = useCallback(async (signal?: AbortSignal) => {
    await logoutAccount(signal);
    sessionCheckRevisionRef.current += 1;
    activeAccountIdRef.current = null;
    setSession(null);
    setStatus('guest');
    setStartupError('');
    setSyncState('idle');
    setLastSyncedAt(null);
    announceAuthChange();
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    status,
    session,
    config,
    startupError,
    syncState,
    lastSyncedAt,
    login,
    register,
    syncProgress,
    logout,
  }), [config, lastSyncedAt, login, logout, register, session, startupError, status, syncProgress, syncState]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Context and hook intentionally share this module so their public contract stays together.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
