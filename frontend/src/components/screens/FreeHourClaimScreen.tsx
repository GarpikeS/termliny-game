import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, CalendarClock, CheckCircle2, Gift, ShieldCheck, Ticket, UserRound } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay';
import { useGameContext } from '@/store/GameContext';
import {
  RewardApiError,
  claimFreeHour,
  getFreeHourStatus,
} from '@/features/rewards/rewardApi';
import {
  FREE_HOUR_PRICE,
  FREE_HOUR_VALID_DAYS,
  activeFreeHourClaim,
  formatRewardDate,
  isRewardClaimRedeemed,
} from '@/features/rewards/rewardRules';
import type { RewardClaim } from '@/types/game';
import { getEntrySource } from '@/features/rewards/acquisition';
import { useAuth } from '@/features/account/AuthContext';
import {
  FOUR_GAME_CHALLENGE_ID,
  isFourGameChallengeComplete,
} from '@/features/rewards/fourGameChallenge';

type City = 'Москва' | 'Зеленогорск';
type FieldName = 'name' | 'phone' | 'age' | 'city' | 'consent';
type RewardStatusScope = 'regular' | typeof FOUR_GAME_CHALLENGE_ID;

interface CheckedRewardStatus {
  scope: RewardStatusScope;
  owner: string;
  available: boolean;
  claim: RewardClaim | null;
  nextPurchaseAt?: number;
}

const fieldClass = 'reward-form__input';

export function FreeHourClaimScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { progress, completeRewardClaim, restoreRewardClaim } = useGameContext();
  const { status: authStatus, session: authSession, syncProgress } = useAuth();
  const searchParams = new URLSearchParams(location.search);
  const campaignMode = searchParams.get('campaign') === FOUR_GAME_CHALLENGE_ID;
  const rewardScope: RewardStatusScope = campaignMode ? FOUR_GAME_CHALLENGE_ID : 'regular';
  const rewardOwner = campaignMode ? (authSession?.account.id ?? 'guest') : 'regular';
  const activeViewerRef = useRef({ status: authStatus, accountId: authSession?.account.id ?? null });
  const source = searchParams.get('source') || getEntrySource();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [city, setCity] = useState<City>('Москва');
  const [consent, setConsent] = useState(false);
  const [checkedReward, setCheckedReward] = useState<CheckedRewardStatus | null>(null);
  const [screenOpenedAt] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [fieldError, setFieldError] = useState<FieldName | null>(null);
  const localClaim = useMemo(() => activeFreeHourClaim(
    progress.rewardClaims.filter(item => item.campaignId === undefined),
  ), [progress.rewardClaims]);
  const checkedForCurrentViewer = checkedReward?.scope === rewardScope && checkedReward.owner === rewardOwner;
  const currentStatus = checkedForCurrentViewer ? checkedReward : null;
  const serverClaim = currentStatus?.claim ?? null;
  const checking = !checkedForCurrentViewer;
  // Campaign codes belong to an account, so only trust the authenticated server response.
  const claim = campaignMode ? serverClaim : (serverClaim ?? localClaim);
  const challengeComplete = isFourGameChallengeComplete(progress.fourGameChallenge);
  const price = campaignMode ? 0 : FREE_HOUR_PRICE;
  const claimExpired = Boolean(claim && (claim.status === 'expired' || claim.expiresAt <= screenOpenedAt));
  const rewardUnavailable = Boolean(currentStatus && !currentStatus.available && !claim);

  useEffect(() => {
    activeViewerRef.current = { status: authStatus, accountId: authSession?.account.id ?? null };
  }, [authSession?.account.id, authStatus]);

  const isCurrentCampaignViewer = useCallback((expectedAccountId: string | null) => !campaignMode || (
    Boolean(expectedAccountId)
    && activeViewerRef.current.status === 'authenticated'
    && activeViewerRef.current.accountId === expectedAccountId
  ), [campaignMode]);

  useEffect(() => {
    if (campaignMode && authStatus !== 'authenticated') return;
    const expectedAccountId = campaignMode ? (authSession?.account.id ?? null) : null;
    if (campaignMode && !expectedAccountId) return;

    const controller = new AbortController();
    getFreeHourStatus(
      controller.signal,
      campaignMode ? FOUR_GAME_CHALLENGE_ID : undefined,
      expectedAccountId ?? undefined,
    )
      .then(status => {
        if (!isCurrentCampaignViewer(expectedAccountId)) return;
        const nextClaim = status.claim ?? null;
        setCheckedReward({
          scope: rewardScope,
          owner: rewardOwner,
          available: status.available,
          claim: nextClaim,
          nextPurchaseAt: status.nextPurchaseAt,
        });
        if (status.claim) {
          restoreRewardClaim(status.claim, expectedAccountId ?? undefined);
        }
      })
      .catch(error => {
        if (!isCurrentCampaignViewer(expectedAccountId)) return;
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setCheckedReward({ scope: rewardScope, owner: rewardOwner, available: true, claim: null });
          setMessage(error instanceof Error ? error.message : 'Не удалось проверить награду.');
        }
      });
    return () => controller.abort();
  }, [authSession?.account.id, authStatus, campaignMode, isCurrentCampaignViewer, restoreRewardClaim, rewardOwner, rewardScope]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setMessage('');
    setFieldError(null);

    if (campaignMode && !challengeComplete) {
      setMessage('Сначала пройдите первый этап во всех четырёх играх.');
      return;
    }
    if (!campaignMode && progress.currency < FREE_HOUR_PRICE) {
      setMessage(`Не хватает ${FREE_HOUR_PRICE - progress.currency} термокоинов. Их можно заработать в играх.`);
      return;
    }
    if (!consent) {
      setFieldError('consent');
      setMessage('Отметьте отдельное согласие на обработку данных.');
      return;
    }

    const expectedAccountId = campaignMode ? (authSession?.account.id ?? null) : null;
    if (campaignMode && !isCurrentCampaignViewer(expectedAccountId)) {
      setMessage('Профиль изменился. Повторите оформление для текущего профиля.');
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    setSubmitting(true);
    try {
      if (campaignMode) {
        await syncProgress(progress, controller.signal);
        if (!isCurrentCampaignViewer(expectedAccountId)) return;
      }
      const nextClaim = await claimFreeHour({
        name,
        phone,
        age: Number(age),
        city,
        consent: true,
        balance: progress.currency,
        source,
        ...(campaignMode ? {
          campaignId: FOUR_GAME_CHALLENGE_ID,
          expectedAccountId: expectedAccountId ?? undefined,
        } : {}),
      }, controller.signal);
      if (!isCurrentCampaignViewer(expectedAccountId)) return;
      completeRewardClaim(nextClaim, price, expectedAccountId ?? undefined);
      setCheckedReward({
        scope: rewardScope,
        owner: rewardOwner,
        available: false,
        claim: nextClaim,
        nextPurchaseAt: nextClaim.nextPurchaseAt,
      });
      setMessage('Бесплатный час готов. Покажите код на кассе.');
    } catch (error) {
      if (!isCurrentCampaignViewer(expectedAccountId)) return;
      if (error instanceof RewardApiError) {
        if (error.claim) {
          restoreRewardClaim(error.claim, expectedAccountId ?? undefined);
          setCheckedReward({
            scope: rewardScope,
            owner: rewardOwner,
            available: false,
            claim: error.claim,
            nextPurchaseAt: error.availableAt ?? error.claim.nextPurchaseAt,
          });
        }
        setFieldError((error.field as FieldName | undefined) ?? null);
        setMessage(error.message);
      } else {
        setMessage('Не удалось получить награду. Термокоины не списаны.');
      }
    } finally {
      window.clearTimeout(timeout);
      setSubmitting(false);
    }
  }

  return (
    <div className="reward-screen">
      <header className="screen-safe-header reward-screen__header">
        <button
          type="button"
          aria-label={campaignMode ? 'Назад к играм' : 'Назад в магазин'}
          onClick={() => navigate(campaignMode ? '/games' : '/shop')}
          className="reward-screen__back"
        >
          <ArrowLeft size={22} />
        </button>
        <div>
          <span>{campaignMode ? 'Приз за 4 игры' : 'Награда Термбурга'}</span>
          <h1>Бесплатный час</h1>
        </div>
        <CurrencyDisplay amount={progress.currency} />
      </header>

      <main className="reward-screen__content phone-scroll">
        <section className="reward-rule-card" aria-labelledby="reward-rule-title">
          {campaignMode ? <Gift size={28} aria-hidden="true" /> : <CalendarClock size={28} aria-hidden="true" />}
          <div>
            <h2 id="reward-rule-title">{campaignMode ? 'Подарок за первые 4 игры' : 'Обратите внимание'}</h2>
            {campaignMode && <p>Завершите первый этап в каждой игре и получите час <strong>за 0 термокоинов</strong>.</p>}
            <p>Час действует только <strong>{FREE_HOUR_VALID_DAYS} дней с момента получения</strong>.</p>
            <p>{campaignMode ? 'Акционный час за четыре игры выдаётся один раз.' : 'Новый бесплатный час можно получить только через неделю.'}</p>
          </div>
        </section>

        {campaignMode && !challengeComplete ? (
          <section className="reward-status-card" aria-labelledby="challenge-required-title">
            <h2 id="challenge-required-title" className="font-heading text-lg text-white">Пока не все 4 игры пройдены</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/65">Вернитесь к играм: прогресс можно собирать постепенно и он не пропадёт.</p>
            <Button type="button" size="lg" className="mt-4 w-full" onClick={() => navigate('/games')}>Вернуться к играм</Button>
          </section>
        ) : campaignMode && authStatus === 'loading' ? (
          <div className="reward-status-card" role="status">Проверяем профиль…</div>
        ) : campaignMode && authStatus === 'unavailable' ? (
          <section className="reward-status-card" aria-labelledby="challenge-auth-unavailable-title">
            <UserRound size={30} className="text-primary" aria-hidden="true" />
            <h2 id="challenge-auth-unavailable-title" className="mt-3 font-heading text-lg text-white">Не удалось проверить профиль</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/65">Проверьте интернет и попробуйте ещё раз. Сохранённый прогресс останется на устройстве.</p>
            <Button type="button" size="lg" className="mt-4 w-full" onClick={() => window.location.reload()}>Повторить проверку</Button>
          </section>
        ) : campaignMode && authStatus !== 'authenticated' ? (
          <section className="reward-status-card" aria-labelledby="challenge-auth-title">
            <UserRound size={30} className="text-primary" aria-hidden="true" />
            <h2 id="challenge-auth-title" className="mt-3 font-heading text-lg text-white">Сохраните приз в профиле</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/65">Войдите или зарегистрируйтесь, чтобы код бесплатного часа не потерялся и не выдавался повторно.</p>
            <Button
              type="button"
              size="lg"
              className="mt-4 w-full"
              onClick={() => navigate(`/account?returnTo=${encodeURIComponent(`/shop/free-hour?campaign=${FOUR_GAME_CHALLENGE_ID}`)}`)}
            >
              Войти или создать профиль
            </Button>
          </section>
        ) : checking ? (
          <div className="reward-status-card" role="status">Проверяем, доступна ли награда…</div>
        ) : rewardUnavailable ? (
          <section className="reward-status-card" aria-labelledby="reward-cooldown-title">
            <CalendarClock size={30} className="text-primary" aria-hidden="true" />
            <h2 id="reward-cooldown-title" className="mt-3 font-heading text-lg text-white">Бесплатный час пока недоступен</h2>
            <p className="mt-2 text-sm leading-relaxed text-white/65">
              На этом устройстве или номере уже получен бесплатный час.
              {currentStatus?.nextPurchaseAt ? ` Новый можно оформить после ${formatRewardDate(currentStatus.nextPurchaseAt)}.` : ''}
            </p>
            <Button type="button" size="lg" className="mt-4 w-full" onClick={() => navigate('/games')}>Вернуться к играм</Button>
          </section>
        ) : claim ? (
          <section className="reward-success" aria-labelledby="reward-success-title">
            <CheckCircle2 size={42} aria-hidden="true" />
            <span>Награда в профиле</span>
            <h2 id="reward-success-title">{isRewardClaimRedeemed(claim) ? 'Код использован' : claimExpired ? 'Срок кода истёк' : 'Ваш код'}</h2>
            <strong className="reward-success__code">{claim.code}</strong>
            {isRewardClaimRedeemed(claim) && claim.redeemedAt
              ? <p>Погашен <strong>{formatRewardDate(claim.redeemedAt)}</strong>.</p>
              : claimExpired
                ? <p>Акционный час уже был получен, но срок его кода закончился.</p>
                : <p>Покажите его на кассе до <strong>{formatRewardDate(claim.expiresAt)}</strong>.</p>}
            {campaignMode
              ? <p>Акционный час за четыре игры выдаётся один раз.</p>
              : <p>Следующий час будет доступен {formatRewardDate(claim.nextPurchaseAt)}.</p>}
            <Button type="button" className="w-full" onClick={() => navigate('/profile')}>Открыть профиль</Button>
          </section>
        ) : (
          <form className="reward-form" onSubmit={handleSubmit} noValidate>
            <div className="reward-price-row">
              <Ticket size={30} aria-hidden="true" />
              <div>
                <span>{campaignMode ? 'Ваш приз' : 'Стоимость'}</span>
                <strong>{campaignMode ? 'Бесплатно · 0 термокоинов' : `${FREE_HOUR_PRICE} термокоинов`}</strong>
              </div>
            </div>

            <p className="reward-form__intro">Заполните анкету — по ней касса найдёт вашу награду. {campaignMode && 'Укажите тот же номер, что в профиле. '}Анкету заполняет совершеннолетний гость.</p>

            <label className="reward-form__field">
              <span>Имя</span>
              <input className={fieldClass} name="name" autoComplete="name" value={name} onChange={event => setName(event.target.value)} required minLength={2} aria-invalid={fieldError === 'name'} />
            </label>

            <label className="reward-form__field">
              <span>Телефон</span>
              <input className={fieldClass} name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 999 000-00-00" value={phone} onChange={event => setPhone(event.target.value)} required aria-invalid={fieldError === 'phone'} />
            </label>

            <div className="reward-form__row">
              <label className="reward-form__field">
                <span>Возраст</span>
                <input className={fieldClass} name="age" type="number" inputMode="numeric" min={18} max={100} value={age} onChange={event => setAge(event.target.value)} required aria-invalid={fieldError === 'age'} />
              </label>
              <label className="reward-form__field">
                <span>Город</span>
                <select className={fieldClass} name="city" value={city} onChange={event => setCity(event.target.value as City)} aria-invalid={fieldError === 'city'}>
                  <option>Москва</option>
                  <option>Зеленогорск</option>
                </select>
              </label>
            </div>

            <label className={`reward-consent ${fieldError === 'consent' ? 'reward-consent--error' : ''}`}>
              <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} aria-invalid={fieldError === 'consent'} />
              <span>
                Я отдельно соглашаюсь на обработку имени, телефона, возраста и города для выдачи награды.{' '}
                <a href="https://termburg.ru/soglasie-na-obrabotku-personalnyh-dannyh" target="_blank" rel="noreferrer">Текст согласия</a>
                {' · '}
                <a href="https://termburg.ru/privacy/" target="_blank" rel="noreferrer">Политика</a>
              </span>
            </label>

            {message && <p className="reward-form__message" role="alert">{message}</p>}

            <Button type="submit" size="lg" className="w-full" aria-disabled={submitting} onClick={event => { if (submitting) event.preventDefault(); }}>
              {submitting ? 'Оформляем…' : campaignMode ? 'Получить бесплатный час' : `Получить за ${FREE_HOUR_PRICE}`}
            </Button>
            <p className="reward-form__privacy"><ShieldCheck size={15} aria-hidden="true" /> Код и срок сразу появятся в профиле.</p>
          </form>
        )}

        {message && claim && <p className="reward-screen__message" role="status">{message}</p>}
      </main>
    </div>
  );
}
