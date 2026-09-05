import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Eye, EyeOff, LoaderCircle, LockKeyhole, MapPin, Phone, ShieldCheck, UserRound } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/account/AuthContext';
import { ACCOUNT_CONSENT_VERSION, AccountApiError } from '@/features/account/accountApi';
import { getDeviceId } from '@/features/account/device';
import { useGameContext } from '@/store/GameContext';
import { GUEST_PROGRESS_OWNER, createDefaultProgress, loadProgressOwner } from '@/store/storage';
import { cn } from '@/utils/cn';

type AuthMode = 'login' | 'register';

const PERSONAL_DATA_URL = '/legal/consent';
const PRIVACY_URL = '/legal/privacy';
const DEFAULT_PASSWORD_MIN_LENGTH = 4;
const PASSWORD_MAX_LENGTH = 128;
const CITY_MAX_LENGTH = 40;
const SAFE_RETURN_PATHS = new Set([
  '/profile',
  '/shop/free-hour?campaign=four-games-v1',
]);

function digitsOnly(value: string) {
  return value.replace(/\D/g, '').slice(0, 11);
}

function displayPhone(value: string) {
  let digits = digitsOnly(value);
  if (digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (!digits.startsWith('7') && digits) digits = `7${digits}`;
  const local = digits.slice(1);
  const parts = [local.slice(0, 3), local.slice(3, 6), local.slice(6, 8), local.slice(8, 10)].filter(Boolean);
  if (!parts.length) return '';
  let result = `+7 (${parts[0]}`;
  if (parts[0].length === 3) result += ')';
  if (parts[1]) result += ` ${parts[1]}`;
  if (parts[2]) result += `-${parts[2]}`;
  if (parts[3]) result += `-${parts[3]}`;
  return result;
}

function errorMessage(error: unknown) {
  return error instanceof AccountApiError ? error.message : 'Не удалось выполнить запрос. Попробуйте ещё раз.';
}

function browserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function getSafeReturnPath(search: string) {
  const requested = new URLSearchParams(search).get('returnTo');
  if (!requested?.startsWith('/') || requested.includes('\\')) return '/profile';

  try {
    const internalOrigin = 'https://termburg.local';
    const parsed = new URL(requested, internalOrigin);
    if (parsed.origin !== internalOrigin) return '/profile';
    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return SAFE_RETURN_PATHS.has(normalized) ? normalized : '/profile';
  } catch {
    return '/profile';
  }
}

export function AuthScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { progress } = useGameContext();
  const { status, session, config, login, register } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [identifier, setIdentifier] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const unavailable = config?.available === false;
  const passwordMinLength = config?.passwordMinLength || DEFAULT_PASSWORD_MIN_LENGTH;
  const returnTo = getSafeReturnPath(location.search);

  useEffect(() => {
    if (status === 'authenticated' && session) navigate(returnTo, { replace: true });
  }, [navigate, returnTo, session, status]);

  const changeMode = (next: AuthMode) => {
    if (pending || mode === next) return;
    setMode(next);
    setPassword('');
    setPasswordRepeat('');
    setError('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedCity = city.trim();
    if (mode === 'register' && password.length < passwordMinLength) {
      setError(`Пароль должен содержать не менее ${passwordMinLength} символов.`);
      return;
    }
    if (mode === 'register' && password !== passwordRepeat) {
      setError('Пароли не совпадают.');
      return;
    }
    if (mode === 'register' && !normalizedCity) {
      setError('Укажите город.');
      return;
    }
    if (mode === 'register' && !consent) {
      setError('Подтвердите согласие на обработку персональных данных.');
      return;
    }

    setPending(true);
    setError('');
    try {
      const canTransferLocalProgress = loadProgressOwner() === GUEST_PROGRESS_OWNER;
      if (mode === 'login') {
        await login({
          identifier,
          password,
          deviceId: getDeviceId(),
          ...(canTransferLocalProgress ? { fourGameChallenge: progress.fourGameChallenge } : {}),
        });
      } else {
        await register({
          phone,
          password,
          deviceId: getDeviceId(),
          name: name.trim(),
          city: normalizedCity,
          timeZone: browserTimeZone(),
          consent: true,
          consentVersion: ACCOUNT_CONSENT_VERSION,
          progress: canTransferLocalProgress ? progress : createDefaultProgress(),
        });
      }
      navigate(returnTo, { replace: true });
    } catch (authError) {
      setError(errorMessage(authError));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-dark-surface">
      <header className="screen-safe-header px-5 pb-4">
        <div className="grid grid-cols-[44px_1fr_44px] items-center">
          <button type="button" aria-label="Назад в профиль" onClick={() => navigate('/profile')} className="min-h-11 min-w-11 flex items-center justify-center rounded-xl text-white/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            <ArrowLeft size={21} />
          </button>
          <div className="text-center">
            <h1 className="font-heading text-sm font-bold uppercase tracking-wider text-primary">Профиль игрока</h1>
            <p className="mt-0.5 text-[10px] text-white/40">Сохраняется между устройствами</p>
          </div>
          <span aria-hidden="true" />
        </div>
      </header>
      <div className="gold-separator" />

      <main className="phone-scroll flex-1 overflow-y-auto px-5 py-5">
        <section className="mx-auto max-w-sm rounded-3xl border border-primary/25 bg-white/[0.055] p-4 shadow-2xl">
          <div className="grid grid-cols-2 rounded-2xl bg-black/25 p-1" role="group" aria-label="Вход или регистрация">
            {(['login', 'register'] as const).map(item => (
              <button key={item} type="button" aria-pressed={mode === item} onClick={() => changeMode(item)} className={cn('min-h-11 rounded-xl px-3 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary', mode === item ? 'bg-primary text-[#171320]' : 'text-white/55 hover:text-white')}>
                {item === 'login' ? 'Войти' : 'Регистрация'}
              </button>
            ))}
          </div>

          {unavailable ? (
            <div className="py-8 text-center" role="status">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary"><LockKeyhole size={28} /></span>
              <h2 className="mt-5 font-heading text-lg text-white">Вход временно недоступен</h2>
              <p className="mx-auto mt-2 max-w-[280px] text-sm leading-relaxed text-white/55">Можно продолжить играть гостем. Прогресс останется в этом браузере.</p>
              <button type="button" onClick={() => navigate('/games')} className="mt-6 min-h-12 w-full rounded-xl bg-primary px-4 font-bold text-[#171320]">Продолжить без входа</button>
            </div>
          ) : (
            <form className="pt-5" onSubmit={submit}>
              <div className="mb-5">
                <h2 className="font-heading text-lg text-white">{mode === 'login' ? 'С возвращением' : 'Создать профиль'}</h2>
                <p className="mt-1 text-sm leading-relaxed text-white/50">{mode === 'login' ? 'Введите телефон или логин и пароль.' : 'Сохраним игровой прогресс в вашем профиле.'}</p>
              </div>

              {mode === 'register' && (
                <label className="mb-4 block">
                  <span className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-white/65"><UserRound size={14} /> Имя</span>
                  <input value={name} onChange={event => setName(event.target.value.slice(0, 80))} autoComplete="name" required minLength={2} className="min-h-12 w-full rounded-xl border border-white/15 bg-black/25 px-4 text-base text-white outline-none placeholder:text-white/25 focus:border-primary focus:ring-2 focus:ring-primary/25" placeholder="Как к вам обращаться" />
                </label>
              )}

              {mode === 'login' ? (
                <label className="mb-4 block">
                  <span className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-white/65"><UserRound size={14} /> Телефон или логин</span>
                  <input value={identifier} onChange={event => setIdentifier(event.target.value.slice(0, 40))} autoComplete="username" autoCapitalize="none" spellCheck={false} required className="min-h-12 w-full rounded-xl border border-white/15 bg-black/25 px-4 text-base text-white outline-none placeholder:text-white/25 focus:border-primary focus:ring-2 focus:ring-primary/25" placeholder="Телефон или логин" />
                </label>
              ) : (
                <label className="mb-4 block">
                  <span className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-white/65"><Phone size={14} /> Телефон</span>
                  <input value={displayPhone(phone)} onChange={event => setPhone(digitsOnly(event.target.value))} inputMode="tel" autoComplete="tel" required className="min-h-12 w-full rounded-xl border border-white/15 bg-black/25 px-4 text-base text-white outline-none placeholder:text-white/25 focus:border-primary focus:ring-2 focus:ring-primary/25" placeholder="+7 (900) 000-00-00" />
                </label>
              )}

              <div className="mb-4">
                <label htmlFor="account-password" className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-white/65"><LockKeyhole size={14} /> Пароль</label>
                <span className="relative block">
                  <input id="account-password" value={password} onChange={event => setPassword(event.target.value.slice(0, PASSWORD_MAX_LENGTH))} type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? passwordMinLength : 1} maxLength={PASSWORD_MAX_LENGTH} aria-describedby={mode === 'register' ? 'registration-password-hint' : undefined} className="min-h-12 w-full rounded-xl border border-white/15 bg-black/25 px-4 pr-12 text-base text-white outline-none placeholder:text-white/25 focus:border-primary focus:ring-2 focus:ring-primary/25" placeholder={mode === 'register' ? 'Придумайте пароль' : 'Ваш пароль'} />
                  <button type="button" aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'} onClick={() => setShowPassword(value => !value)} className="absolute inset-y-0 right-0 flex min-w-12 items-center justify-center text-white/45 hover:text-white">
                    {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                  </button>
                </span>
                {mode === 'register' && <span id="registration-password-hint" className="mt-1.5 block text-[11px] text-white/40">Не менее {passwordMinLength} символов</span>}
              </div>

              {mode === 'register' && (
                <label className="mb-4 block">
                  <span className="mb-2 block text-xs font-semibold text-white/65">Повторите пароль</span>
                  <input value={passwordRepeat} onChange={event => setPasswordRepeat(event.target.value.slice(0, PASSWORD_MAX_LENGTH))} type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={passwordMinLength} maxLength={PASSWORD_MAX_LENGTH} className="min-h-12 w-full rounded-xl border border-white/15 bg-black/25 px-4 text-base text-white outline-none placeholder:text-white/25 focus:border-primary focus:ring-2 focus:ring-primary/25" placeholder="Ещё раз" />
                </label>
              )}

              {mode === 'register' && (
                <label className="mb-4 block">
                  <span className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-white/65"><MapPin size={14} aria-hidden="true" /> Ваш город</span>
                  <input value={city} onChange={event => setCity(event.target.value.slice(0, CITY_MAX_LENGTH))} autoComplete="address-level2" autoCapitalize="words" required maxLength={CITY_MAX_LENGTH} className="min-h-12 w-full rounded-xl border border-white/15 bg-black/25 px-4 text-base text-white outline-none placeholder:text-white/25 focus:border-primary focus:ring-2 focus:ring-primary/25" placeholder="Например, Казань" />
                </label>
              )}

              {mode === 'register' && (
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/15 p-3">
                  <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#D7B85B]" />
                  <span className="text-xs leading-relaxed text-white/55">Согласен на <a href={PERSONAL_DATA_URL} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">обработку персональных данных</a> и ознакомлен с <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">политикой конфиденциальности</a>.</span>
                </label>
              )}

              {error && <p className="mt-3 rounded-xl border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-200" role="alert">{error}</p>}
              <button type="submit" disabled={pending || config?.available !== true} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-bold text-[#171320] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                {pending ? <LoaderCircle className="animate-spin" size={19} /> : <LockKeyhole size={19} />}
                {mode === 'login' ? 'Войти' : 'Создать профиль'}
              </button>
            </form>
          )}
        </section>

        {!unavailable && (
          <div className="mx-auto mt-4 flex max-w-sm items-start gap-3 rounded-2xl border border-green-400/15 bg-green-400/[0.06] p-3 text-xs leading-relaxed text-white/50">
            <ShieldCheck className="mt-0.5 shrink-0 text-green-400" size={18} />
            Вход работает по номеру телефона или выданному логину и паролю. Пароль хранится в защищённом виде.
          </div>
        )}
      </main>
    </div>
  );
}
