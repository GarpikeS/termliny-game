import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Trophy, Star, Target, Award, Grid3x3, Circle, Heart, Droplets, Sparkles, Ticket, MessageCircle, ChevronRight, Cloud, CloudAlert, LogIn, LogOut, UserRound } from 'lucide-react';
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { useGameContext } from '@/store/GameContext';
import { getTermlinById, ELEMENT_COLORS } from '@/data/termliny';
import { MOOD_LABELS, STAGE_LABELS, getMood, getPetLevel } from '@/engine/engine-pet/petEngine';
import { getProductById } from '@/data/shopData';
import { formatRewardDate, isRewardClaimRedeemed } from '@/features/rewards/rewardRules';
import { GAME_NAMES } from '@/data/gameNames';
import {
  DAILY_GAME_REWARD_LIMIT,
  DAILY_TOTAL_REWARD_LIMIT,
  GAME_REWARD_LABELS,
  GAME_REWARD_SOURCES,
  getDailyRewardTotal,
  normalizeDailyGameRewards,
} from '@/data/economy';
import { cn } from '@/utils/cn';
import { useAuth } from '@/features/account/AuthContext';
import {
  GUEST_PROGRESS_OWNER,
  accountProgressOwner,
  loadProgressOwner,
} from '@/store/storage';
import { GAME_LEVEL_TOTAL, clampGameLevel, getNextPlayableLevel } from '@/data/gameProgression';

const achievements = [
  { name: 'Новичок', desc: 'Пройти 1 уровень', icon: Trophy, color: '#6AABDA', check: (p: Stat) => p.completedLevels >= 1 },
  { name: 'Коллекционер', desc: 'Заработать 100 термокоинов', icon: Star, color: '#D4956A', check: (p: Stat) => p.currency >= 100 },
  { name: 'Мастер уровней', desc: 'Пройти 5 уровней', icon: Target, color: '#5DB879', check: (p: Stat) => p.completedLevels >= 5 },
  { name: 'Перфекционист', desc: '3 звезды на 10 уровнях', icon: Award, color: '#9B7EC8', check: (p: Stat) => p.threeStarLevels >= 10 },
  { name: 'Рекордсмен', desc: 'Набрать 512 в Славиче', icon: Grid3x3, color: '#6AABDA', check: (p: Stat) => p.best2048 >= 512 },
  { name: 'Снайпер', desc: 'Пройти 5 уровней Бирюлек', icon: Circle, color: '#5DB879', check: (p: Stat) => p.bubbleLevels >= 5 },
  { name: 'Заботливый', desc: 'Вырастить взрослого питомца', icon: Heart, color: '#E87CA0', check: (p: Stat) => p.petAdult },
];

const ELEMENT_LABELS: Record<string, string> = {
  fire: 'Огонь',
  herb: 'Травы',
  home: 'Дом',
  wind: 'Ветер',
  wisdom: 'Мудрость',
  love: 'Любовь',
  water: 'Вода',
};

interface Stat {
  completedLevels: number;
  totalStars: number;
  threeStarLevels: number;
  currency: number;
  best2048: number;
  bubbleLevels: number;
  petAdult: boolean;
}

export function ProfileScreen() {
  const navigate = useNavigate();
  const { progress } = useGameContext();
  const { status: authStatus, session: authSession, config: authConfig, startupError, syncState, lastSyncedAt, logout } = useAuth();
  const [screenOpenedAt] = useState(Date.now);
  const [logoutPending, setLogoutPending] = useState(false);
  const [accountError, setAccountError] = useState('');
  const expectedProgressOwner = authStatus === 'authenticated' && authSession
    ? accountProgressOwner(authSession.account.id)
    : authStatus === 'guest' ? GUEST_PROGRESS_OWNER : null;
  const progressScopeVerified = expectedProgressOwner !== null && loadProgressOwner() === expectedProgressOwner;
  const visibleOrders = progressScopeVerified ? progress.orders : [];
  const visibleRewardClaims = progressScopeVerified
    ? progress.rewardClaims.filter(claim => claim.campaignId === undefined || authStatus === 'authenticated')
    : [];

  const handleLogout = async () => {
    const confirmed = window.confirm('Выйти из профиля? Прогресс останется в профиле, а на этом устройстве откроется новая гостевая игра.');
    if (!confirmed) return;
    setLogoutPending(true);
    setAccountError('');
    try {
      await logout();
    } catch {
      setAccountError('Не удалось выйти. Проверьте интернет и попробуйте ещё раз.');
    } finally {
      setLogoutPending(false);
    }
  };

  const character = getTermlinById(progress.selectedCharacter);
  const color = character ? (ELEMENT_COLORS[character.element] ?? '#BA9B4F') : '#BA9B4F';
  const match3Progress = Object.entries(progress.levels)
    .filter(([id]) => Number(id) >= 1 && Number(id) <= GAME_LEVEL_TOTAL)
    .map(([, value]) => value);
  const completedLevels = match3Progress.filter(l => l.completed).length;
  const totalStars = match3Progress.reduce((sum, l) => sum + l.stars, 0);
  const threeStarLevels = match3Progress.filter(l => l.stars >= 3).length;
  const match3Level = clampGameLevel(progress.currentLevel);
  const slavichLevel = getNextPlayableLevel(progress.game2048LevelsCompleted);
  const bubblesLevel = getNextPlayableLevel(progress.bubbleLevelsCompleted);
  const petLevel = getPetLevel({
    experience: progress.pet?.experience ?? progress.petDeparture?.experience ?? 0,
  });
  const earnedCount = achievements.filter(a => a.check({
    completedLevels, totalStars, threeStarLevels,
    currency: progress.currency,
    best2048: progress.best2048Score,
    bubbleLevels: progress.bubbleLevelsCompleted,
    petAdult: progress.pet?.stage === 'adult',
  })).length;
  const dailyGameRewards = normalizeDailyGameRewards(progress.dailyGameRewards);
  const dailyRewardTotal = getDailyRewardTotal(dailyGameRewards);

  const stat: Stat = {
    completedLevels,
    totalStars,
    threeStarLevels,
    currency: progress.currency,
    best2048: progress.best2048Score,
    bubbleLevels: progress.bubbleLevelsCompleted,
    petAdult: progress.pet?.stage === 'adult',
  };

  // XP-like progress
  const xpCurrent = totalStars + completedLevels * 5 + progress.best2048Score + progress.bubbleLevelsCompleted * 10;
  const playerLevel = Math.floor(xpCurrent / 50) + 1;
  const xpInLevel = xpCurrent % 50;

  return (
    <div className="h-full flex flex-col bg-dark-surface">
      {/* Header */}
      <div className="screen-safe-header pb-4 px-5">
        <div className="flex items-center justify-between">
          <button type="button" aria-label="Назад к играм" onClick={() => navigate('/games')} className="min-w-11 min-h-11 flex items-center justify-center text-white/50 hover:text-primary transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h2 className="font-heading text-sm font-bold text-primary tracking-wider uppercase">Профиль</h2>
          <CurrencyDisplay amount={progress.currency} />
        </div>
      </div>
      <div className="gold-separator" />

      <div className="flex-1 overflow-y-auto phone-scroll">
        <section className="px-4 pt-4" aria-labelledby="account-status-title" data-account-status>
          <motion.div
            className="relative overflow-hidden rounded-[28px] border border-primary/30 bg-[#211B2A] p-4 shadow-[0_18px_45px_rgba(0,0,0,0.28)]"
            style={{ background: `linear-gradient(145deg, ${color}18 0%, #26202f 42%, #19151f 100%)` }}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full blur-3xl" style={{ backgroundColor: `${color}20` }} aria-hidden="true" />
            <span className="pointer-events-none absolute -bottom-24 -left-16 h-44 w-44 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />

            <div className="relative flex items-start gap-4">
              <div className="relative shrink-0">
                {character ? (
                  <img
                    src={character.image}
                    alt={character.name}
                    className="h-[92px] w-[92px] rounded-[25px] border-2 object-cover shadow-lg"
                    style={{ borderColor: `${color}B0`, boxShadow: `0 12px 30px ${color}25` }}
                  />
                ) : (
                  <span className="flex h-[92px] w-[92px] items-center justify-center rounded-[25px] border-2 border-primary/40 bg-primary/15">
                    <UserRound size={36} className="text-primary" />
                  </span>
                )}
                <span
                  className="absolute -bottom-2 left-1/2 min-w-[56px] -translate-x-1/2 rounded-full border bg-[#19151f] px-2 py-1 text-center text-[10px] font-bold"
                  style={{ borderColor: `${color}70`, color }}
                >
                  Ур. {playerLevel}
                </span>
              </div>

              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary/80">Профиль игрока</p>
                {authStatus === 'loading' ? (
                  <div className="mt-2" role="status">
                    <h2 id="account-status-title" className="text-lg font-bold text-white">Проверяем вход</h2>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-white/55"><Cloud className="animate-pulse text-primary" size={14} /> Загружаем профиль…</p>
                  </div>
                ) : authStatus === 'authenticated' && authSession ? (
                  <>
                    <h2 id="account-status-title" className="mt-1 truncate text-xl font-bold leading-tight text-white">{authSession.account.name}</h2>
                    <p className="mt-1 text-xs leading-relaxed text-white/60">{authSession.account.login ? `Логин: ${authSession.account.login}` : authSession.account.phoneMasked}<br />г. {authSession.account.city}</p>
                    <p className={cn('mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold', syncState === 'error' ? 'border-red-300/25 bg-red-400/10 text-red-200' : 'border-green-300/20 bg-green-400/10 text-green-200')} aria-live="polite">
                      {syncState === 'error' ? <CloudAlert size={13} /> : <Cloud size={13} className={syncState === 'saving' ? 'animate-pulse' : ''} />}
                      <span className="truncate">
                        {syncState === 'saving'
                          ? 'Сохраняем…'
                          : syncState === 'error'
                            ? 'Не сохранено'
                            : lastSyncedAt
                              ? `Сохранено в ${new Date(lastSyncedAt).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`
                              : 'Прогресс сохранён'}
                      </span>
                    </p>
                  </>
                ) : (
                  <>
                    <h2 id="account-status-title" className="mt-1 text-xl font-bold leading-tight text-white">Гостевая игра</h2>
                    <p className="mt-1 text-xs leading-relaxed text-white/55">Прогресс хранится только на этом устройстве.</p>
                  </>
                )}
              </div>
            </div>

            {character && (
              <div className="relative mt-5 rounded-2xl border border-white/10 bg-black/20 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Ваш термлин</p>
                    <h3 className="mt-1 truncate font-heading text-sm text-white">{character.name}</h3>
                    <p className="mt-0.5 truncate text-[11px] text-white/45">{character.title}</p>
                  </div>
                  <span className="shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold" style={{ backgroundColor: `${color}16`, borderColor: `${color}45`, color }}>
                    {ELEMENT_LABELS[character.element] ?? character.element}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-[10px] text-white/40">
                  <span>Опыт уровня</span>
                  <span className="tabular-nums">{xpInLevel}/50</span>
                </div>
                <ProgressBar current={xpInLevel} max={50} color={color} className="mt-1.5 h-2" />
                <div className="mt-3 flex items-start gap-2 border-t border-white/[0.08] pt-3">
                  <Sparkles size={15} className="mt-0.5 shrink-0" style={{ color }} />
                  <p className="min-w-0 text-[11px] leading-relaxed text-white/55">
                    <strong className="font-semibold" style={{ color }}>{character.ability.name}</strong>
                    <span> · {character.ability.description}</span>
                  </p>
                </div>
              </div>
            )}

            {(startupError || accountError) && (
              <p className="relative mt-3 rounded-xl border border-red-400/20 bg-red-400/[0.08] px-3 py-2 text-xs text-red-200" role="alert">{accountError || startupError}</p>
            )}

            {authStatus === 'authenticated' && authSession ? (
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={logoutPending}
                className="relative mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-semibold text-white/45 transition-colors hover:bg-white/[0.05] hover:text-white/75 disabled:opacity-45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
              >
                <LogOut size={15} />
                {logoutPending ? 'Выходим…' : 'Выйти из профиля'}
              </button>
            ) : authStatus !== 'loading' ? (
              <button
                type="button"
                onClick={() => navigate('/account')}
                className="relative mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-[#171320] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <LogIn size={18} />
                {authConfig?.available === false ? 'Вход временно недоступен' : 'Войти или зарегистрироваться'}
              </button>
            ) : null}
          </motion.div>
        </section>

        <div className="space-y-5 px-5 pb-5 pt-5">
          {/* Quick stats row */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { value: completedLevels, label: 'Уровни', icon: Target },
              { value: totalStars, label: 'Звёзды', icon: Star },
              { value: `${slavichLevel}/${GAME_LEVEL_TOTAL}`, label: GAME_NAMES.game2048, icon: Grid3x3 },
              { value: earnedCount, label: 'Ачивки', icon: Trophy },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                className="bg-white/5 border border-white/10 rounded-xl p-2.5 text-center"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <s.icon size={14} className="text-primary mx-auto mb-1" />
                <p className="text-white font-bold text-base">{s.value}</p>
                <p className="text-white/30 text-[9px]">{s.label}</p>
              </motion.div>
            ))}
          </div>

          <section className="rounded-2xl border border-primary/25 bg-primary/[0.07] p-4" aria-labelledby="daily-rewards-title" data-daily-game-rewards>
            <div className="flex items-end justify-between gap-3">
              <div>
                <h3 id="daily-rewards-title" className="font-heading text-sm text-primary">Термокоины за сегодня</h3>
                <p className="mt-1 text-[11px] text-white/45">До 30 в каждой игре · обновится завтра</p>
              </div>
              <strong className="text-base text-white tabular-nums">{dailyRewardTotal}/{DAILY_TOTAL_REWARD_LIMIT}</strong>
            </div>
            <ProgressBar current={dailyRewardTotal} max={DAILY_TOTAL_REWARD_LIMIT} className="mt-3 h-2.5" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              {GAME_REWARD_SOURCES.map(source => (
                <div key={source} className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2">
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-white/60">{GAME_REWARD_LABELS[source]}</span>
                    <strong className="text-white/85 tabular-nums">{dailyGameRewards.earned[source]}/{DAILY_GAME_REWARD_LIMIT}</strong>
                  </div>
                  <ProgressBar current={dailyGameRewards.earned[source]} max={DAILY_GAME_REWARD_LIMIT} className="mt-1.5 h-1.5" />
                </div>
              ))}
            </div>
          </section>

          <button
            type="button"
            onClick={() => navigate('/profile/feedback')}
            className="w-full min-h-[72px] rounded-xl border border-primary/25 bg-gradient-to-r from-primary/[0.12] to-white/[0.04] p-3 flex items-center gap-3 text-left transition-colors hover:border-primary/45 active:bg-primary/15"
            data-feedback-entry
          >
            <span className="w-11 h-11 shrink-0 rounded-xl bg-primary/15 flex items-center justify-center">
              <MessageCircle size={21} className="text-primary" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-white/90 text-sm font-semibold">Обратная связь</span>
              <span className="block text-white/40 text-xs mt-0.5">Сообщить об ошибке или предложить идею</span>
            </span>
            <ChevronRight size={20} className="text-primary/70 shrink-0" />
          </button>

          {/* Purchased tickets & orders */}
          <div>
            <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-primary mb-3">
              Мои билеты и заказы
            </h3>
            {visibleOrders.length === 0 && visibleRewardClaims.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Ticket size={18} className="text-primary" />
                </div>
                <div className="flex-1">
                  <p className="text-white/40 text-sm">Нет заказов</p>
                  <p className="text-white/25 text-[10px]">Купите билеты или мерч в магазине</p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {[...visibleRewardClaims].reverse().map(claim => {
                  const redeemed = isRewardClaimRedeemed(claim);
                  const active = !redeemed && claim.status !== 'expired' && claim.expiresAt > screenOpenedAt;
                  const statusLabel = redeemed ? 'Использован' : active ? 'Активен' : 'Сгорел';
                  return (
                    <div key={claim.id} className="bg-white/5 border border-primary/25 rounded-xl p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-10 h-10 shrink-0 rounded-lg bg-primary/15 flex items-center justify-center">
                            <Ticket size={19} className="text-primary" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-white/90 text-sm font-semibold">Бесплатный час</p>
                            <p className="text-primary font-bold text-base tracking-wider mt-0.5">{claim.code}</p>
                          </div>
                        </div>
                        <span className={cn(
                          'text-[10px] px-2 py-1 rounded-full font-bold',
                          redeemed ? 'bg-blue-500/15 text-blue-300' : active ? 'bg-green-500/15 text-green-400' : 'bg-white/5 text-white/35',
                        )}>
                          {statusLabel}
                        </span>
                      </div>
                      <p className="mt-2 text-white/50 text-xs">
                        {redeemed && claim.redeemedAt
                          ? `Использован ${formatRewardDate(claim.redeemedAt)}`
                          : active ? `Покажите код на кассе до ${formatRewardDate(claim.expiresAt)}` : `Истёк ${formatRewardDate(claim.expiresAt)}`}
                      </p>
                    </div>
                  );
                })}
                {visibleOrders.map(order => (
                  <div
                    key={order.id}
                    className="bg-white/5 border border-white/10 rounded-xl p-3"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Ticket size={14} className="text-primary" />
                        <span className="text-white/70 text-xs font-medium">{order.id}</span>
                      </div>
                      <span className={cn(
                        'text-[10px] px-2 py-0.5 rounded-full font-medium',
                        order.status === 'completed' ? 'bg-green-500/15 text-green-400'
                          : order.status === 'confirmed' ? 'bg-blue-500/15 text-blue-400'
                          : 'bg-yellow-500/15 text-yellow-400',
                      )}>
                        {order.status === 'completed' ? 'Готов' : order.status === 'confirmed' ? 'Подтверждён' : 'Ожидание'}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {order.items.map((item, idx) => {
                        const product = getProductById(item.productId);
                        return (
                          <div key={idx} className="flex justify-between text-xs">
                            <span className="text-white/50">{product?.name ?? item.productId} {item.quantity > 1 ? `×${item.quantity}` : ''}</span>
                            <span className="text-white/30">{product ? (product.currency === 'rub' ? `${product.price * item.quantity} ₽` : `${product.price * item.quantity} термокоинов`) : ''}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between mt-2 pt-2 border-t border-white/5">
                      <span className="text-white/30 text-[10px]">{new Date(order.createdAt).toLocaleDateString('ru')}</span>
                      <span className="text-primary text-xs font-bold">{order.total} ₽</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Game progress cards */}
          <div>
            <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-primary mb-3">Игры</h3>
            <div className="space-y-2">
              {/* Хоровод */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#D4956A]/15 flex items-center justify-center">
                  <Droplets size={18} className="text-[#D4956A]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <p className="text-white/90 text-sm font-medium">{GAME_NAMES.match3}</p>
                    <p className="text-white/40 text-xs">Уровень {match3Level} из {GAME_LEVEL_TOTAL}</p>
                  </div>
                  <ProgressBar current={match3Level} max={GAME_LEVEL_TOTAL} color="#D4956A" className="mt-1.5" />
                </div>
              </div>

              {/* Славич */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#6AABDA]/15 flex items-center justify-center">
                  <Grid3x3 size={18} className="text-[#6AABDA]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <p className="text-white/90 text-sm font-medium">{GAME_NAMES.game2048}</p>
                    <p className="text-white/40 text-xs">Уровень {slavichLevel} из {GAME_LEVEL_TOTAL}</p>
                  </div>
                  <ProgressBar current={slavichLevel} max={GAME_LEVEL_TOTAL} color="#6AABDA" className="mt-1.5" />
                  <p className="mt-1 text-[10px] text-white/30">Рекорд: {progress.best2048Score}</p>
                </div>
              </div>

              {/* Бирюльки */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#5DB879]/15 flex items-center justify-center">
                  <Circle size={18} className="text-[#5DB879]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <p className="text-white/90 text-sm font-medium">{GAME_NAMES.bubbles}</p>
                    <p className="text-white/40 text-xs">Уровень {bubblesLevel} из {GAME_LEVEL_TOTAL}</p>
                  </div>
                  <ProgressBar current={bubblesLevel} max={GAME_LEVEL_TOTAL} color="#5DB879" className="mt-1.5" />
                </div>
              </div>

              {/* Пестун */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#9B7EC8]/15 flex items-center justify-center">
                  {progress.pet ? (
                    (() => {
                      const petChar = getTermlinById(progress.pet!.characterId);
                      return petChar ? (
                        <img src={petChar.image} alt="" className="w-8 h-8 rounded-md object-cover" />
                      ) : (
                        <Heart size={18} className="text-[#9B7EC8]" />
                      );
                    })()
                  ) : (
                    <Heart size={18} className="text-[#9B7EC8]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center">
                    <p className="text-white/90 text-sm font-medium">{GAME_NAMES.pet}</p>
                    <p className="text-white/40 text-xs">Уровень {petLevel} из {GAME_LEVEL_TOTAL}</p>
                  </div>
                  <ProgressBar current={petLevel} max={GAME_LEVEL_TOTAL} color="#9B7EC8" className="mt-1.5" />
                  <p className="mt-1 text-[10px] text-white/30">
                    {progress.pet ? `${STAGE_LABELS[progress.pet.stage]} · ${MOOD_LABELS[getMood(progress.pet)]}` : 'Термлин ещё не выбран'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="gold-separator" />

          {/* Achievements */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-heading text-xs font-semibold uppercase tracking-wider text-primary">
                Достижения
              </h3>
              <span className="text-white/30 text-xs">{earnedCount}/{achievements.length}</span>
            </div>
            <div className="space-y-2.5">
              {achievements.map(a => {
                const earned = a.check(stat);
                return (
                  <div
                    key={a.name}
                    className={cn(
                      'bg-white/5 border rounded-xl p-3 flex items-center gap-3',
                      earned ? 'border-white/15' : 'border-white/5',
                    )}
                  >
                    <div
                      className={cn(
                        'w-10 h-10 rounded-full flex items-center justify-center transition-all',
                        !earned && 'opacity-25 grayscale',
                      )}
                      style={{ backgroundColor: `${a.color}20` }}
                    >
                      <a.icon size={18} style={{ color: a.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn('font-medium text-sm', earned ? 'text-white/90' : 'text-white/40')}>{a.name}</p>
                      <p className="text-white/30 text-xs">{a.desc}</p>
                    </div>
                    {earned && (
                      <motion.span
                        className="text-xs font-bold px-2 py-1 rounded-lg"
                        style={{ backgroundColor: `${a.color}20`, color: a.color }}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                      >
                        ✓
                      </motion.span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
