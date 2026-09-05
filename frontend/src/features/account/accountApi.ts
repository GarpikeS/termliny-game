import type { FourGameChallengeProgress, PlayerProgress } from '@/types/game';

export const ACCOUNT_CONSENT_VERSION = 'account-2026-08-15';

export interface PlayerAccount {
  id: string;
  name: string;
  city: string;
  phoneMasked: string;
  login: string | null;
  isTest: boolean;
  createdAt: number;
  lastLoginAt: number;
}

export interface AuthConfig {
  available: boolean;
  method: 'password';
  passwordMinLength: number;
}

export interface AccountSession {
  account: PlayerAccount;
  progress: PlayerProgress;
  revision: number;
}

export interface LoginPayload {
  identifier: string;
  password: string;
  deviceId: string;
  fourGameChallenge?: FourGameChallengeProgress;
}

export interface RegisterPayload {
  phone: string;
  password: string;
  deviceId: string;
  name: string;
  city: string;
  timeZone: string;
  consent: true;
  consentVersion: typeof ACCOUNT_CONSENT_VERSION;
  progress: PlayerProgress;
}

interface ApiErrorBody {
  error?: string;
  field?: string;
  code?: string;
  retryAfter?: number;
  attemptsLeft?: number;
}

export class AccountApiError extends Error {
  status: number;
  field?: string;
  code?: string;
  retryAfter?: number;
  attemptsLeft?: number;

  constructor(status: number, message: string, details: ApiErrorBody = {}) {
    super(message);
    this.name = 'AccountApiError';
    this.status = status;
    this.field = details.field;
    this.code = details.code;
    this.retryAfter = details.retryAfter;
    this.attemptsLeft = details.attemptsLeft;
  }
}

async function readBody(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: 'include', ...init });
  } catch {
    throw new AccountApiError(0, 'Нет связи с сервером. Проверьте интернет.');
  }
  const body = await readBody(response) as ApiErrorBody & T;
  if (!response.ok) {
    throw new AccountApiError(response.status, body.error || 'Не удалось выполнить запрос.', body);
  }
  return body;
}

export function getAuthConfig(signal?: AbortSignal): Promise<AuthConfig> {
  return api<AuthConfig>('/api/auth/config', { signal });
}

export async function getAccountSession(signal?: AbortSignal): Promise<AccountSession | null> {
  try {
    return await api<AccountSession>('/api/auth/me', { signal });
  } catch (error) {
    if (error instanceof AccountApiError && error.status === 401) return null;
    throw error;
  }
}

export function loginAccount(payload: LoginPayload, signal?: AbortSignal): Promise<AccountSession> {
  return api<AccountSession>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
}

export function registerAccount(payload: RegisterPayload, signal?: AbortSignal): Promise<AccountSession> {
  return api<AccountSession>('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
}

export async function logoutAccount(signal?: AbortSignal): Promise<void> {
  await api<{ ok: true }>('/api/auth/logout', { method: 'POST', signal });
}

export function saveAccountProgress(
  progress: PlayerProgress,
  expectedAccountId: string,
  signal?: AbortSignal,
): Promise<{
  progress: PlayerProgress;
  revision: number;
  savedAt: number;
}> {
  return api('/api/account/progress', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ progress, expectedAccountId }),
    signal,
  });
}
