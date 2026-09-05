import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowLeft,
  Bath,
  BookOpenText,
  Check,
  Coffee,
  Flame,
  Gamepad2,
  Gift,
  Heart,
  Leaf,
  LockKeyhole,
  Moon,
  MousePointer2,
  Pencil,
  ScrollText,
  Sparkles,
  Star,
  Utensils,
  X,
} from 'lucide-react';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { GameCoach, type GameCoachStep } from '@/components/game/GameCoach';
import { GameStatusBar } from '@/components/game/GameStatusBar';
import { usePet } from '@/hooks/usePet';
import { useGameContext } from '@/store/GameContext';
import { termliny, ELEMENT_COLORS, getTermlinById } from '@/data/termliny';
import {
  MOOD_COLORS,
  MOOD_LABELS,
  PET_ACTIVITIES,
  PET_DAILY_TASKS,
  STAGE_LABELS,
  STAGE_SIZES,
  type PetAction,
  type PetActivity,
  type PetDailyTaskId,
  type PetInteractionResult,
} from '@/engine/engine-pet/petEngine';
import { cn } from '@/utils/cn';
import { triggerHaptic } from '@/utils/haptics';
import type { PetStatKey } from '@/types/game';
import { DAILY_GAME_REWARD_LIMIT, normalizeDailyGameRewards } from '@/data/economy';

type CareStat = 'hunger' | 'happiness' | 'energy' | 'cleanliness';
type PetCoachStep = 'choose' | 'care' | null;
type PetTab = 'care' | 'activities' | 'diary';

const CHOOSE_TUTORIAL_ID = 'pet-choose';
const CARE_TUTORIAL_ID = 'pet-care';

const DEPARTURE_REASONS: Record<PetStatKey, string> = {
  hunger: 'Сытость опустилась до нуля',
  happiness: 'Счастье опустилось до нуля',
  energy: 'Энергия опустилась до нуля',
  cleanliness: 'Чистота опустилась до нуля',
};

const actions: Array<{
  action: PetAction;
  label: string;
  statLabel: string;
  shortEffect: string;
  icon: typeof Utensils;
  color: string;
  stat: CareStat;
}> = [
  { action: 'feed', label: 'Покормить', statLabel: 'Сытость', shortEffect: '+30', icon: Utensils, color: '#D4956A', stat: 'hunger' },
  { action: 'play', label: 'Поиграть', statLabel: 'Счастье', shortEffect: '+35', icon: Gamepad2, color: '#5DB879', stat: 'happiness' },
  { action: 'rest', label: 'Уложить спать', statLabel: 'Энергия', shortEffect: '+32', icon: Moon, color: '#9B7EC8', stat: 'energy' },
  { action: 'wash', label: 'Помыть', statLabel: 'Чистота', shortEffect: '+36', icon: Bath, color: '#6AABDA', stat: 'cleanliness' },
];

const tabs: Array<{ id: PetTab; label: string; icon: typeof Heart }> = [
  { id: 'care', label: 'Уход', icon: Heart },
  { id: 'activities', label: 'Занятия', icon: Sparkles },
  { id: 'diary', label: 'Дневник', icon: ScrollText },
];

const activityIcons: Record<PetActivity, typeof Coffee> = {
  tea: Coffee,
  herbs: Leaf,
  ritual: Flame,
};

function formatCooldown(milliseconds: number): string {
  if (milliseconds <= 0) return '';
  const seconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}:${rest.toString().padStart(2, '0')}` : `${rest} с`;
}

function formatDiaryTime(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? `Сегодня, ${date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`
    : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function TermlinPortrait({ src, name, color }: { src: string; name: string; color: string }) {
  const fallbackSrc = src.replace(/\.webp$/i, '.jpg');
  const [currentSrc, setCurrentSrc] = useState(src);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  function handleError() {
    if (currentSrc !== fallbackSrc) {
      setCurrentSrc(fallbackSrc);
      setLoaded(false);
      return;
    }
    setFailed(true);
  }

  return (
    <span
      className="relative flex w-16 h-16 items-center justify-center overflow-hidden rounded-full mx-auto border-2 bg-black/35"
      style={{ borderColor: color }}
      data-termlin-portrait
      data-loaded={loaded ? 'true' : 'false'}
      title={name}
    >
      {!loaded && <Sparkles size={22} className="absolute text-primary/55" aria-hidden="true" />}
      {!failed && (
        <img
          key={currentSrc}
          src={currentSrc}
          alt=""
          loading="eager"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={handleError}
          className={cn('absolute inset-0 w-full h-full object-cover transition-opacity duration-200', loaded ? 'opacity-100' : 'opacity-0')}
        />
      )}
    </span>
  );
}

export function TamagotchiScreen() {
  const navigate = useNavigate();
  const { progress, markTutorialSeen } = useGameContext();
  const {
    pet,
    mood,
    level,
    levelProgress,
    adopt,
    doAction,
    doActivity,
    takeDailyGift,
    collectTask,
    changeName,
    warning,
    cooldowns,
    activityCooldowns,
  } = usePet();
  const [activeTab, setActiveTab] = useState<PetTab>('care');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [satisfactionId, setSatisfactionId] = useState(0);
  const [isSatisfied, setIsSatisfied] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const petDepartureAt = progress.petDeparture?.departedAt;
  const [coachStep, setCoachStep] = useState<PetCoachStep>(() => {
    if (!progress.pet && !progress.tutorialFlags.includes(CHOOSE_TUTORIAL_ID)) return 'choose';
    if (progress.pet && !progress.tutorialFlags.includes(CARE_TUTORIAL_ID)) return 'care';
    return null;
  });

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!isSatisfied) return;
    const timer = window.setTimeout(() => setIsSatisfied(false), 1700);
    return () => window.clearTimeout(timer);
  }, [isSatisfied, satisfactionId]);

  useEffect(() => {
    if (petDepartureAt) triggerHaptic('warning');
  }, [petDepartureAt]);

  const availableActions = actions.filter(action => (cooldowns[action.action] ?? 0) <= 0);
  const careCandidates = availableActions.length > 0 ? availableActions : actions;
  const recommendedAction = pet
    ? careCandidates.reduce((lowest, action) => pet[action.stat] < pet[lowest.stat] ? action : lowest)
    : actions[0];

  const coachContent: GameCoachStep | null = coachStep === 'choose'
    ? {
        id: CHOOSE_TUTORIAL_ID,
        title: 'Выбери термлина',
        message: 'Нажми на героя, за которым хочешь ухаживать. У каждого свой бонус.',
        icon: <MousePointer2 size={21} />,
      }
    : coachStep === 'care'
      ? {
          id: CARE_TUTORIAL_ID,
          title: `Нажми: «${recommendedAction.statLabel}»`,
          message: `Показатель и действие объединены. Нажми на шкалу «${recommendedAction.statLabel}», чтобы выполнить действие «${recommendedAction.label.toLowerCase()}».`,
          icon: <Heart size={21} />,
        }
      : null;

  function showResult(result: PetInteractionResult | null) {
    if (!result) return;
    triggerHaptic(result.ok ? 'match' : 'warning');
    setNotice({ tone: result.ok ? 'success' : 'error', text: result.ok ? result.message : result.reason });
  }

  function handleAdopt(characterId: string) {
    triggerHaptic('selection');
    adopt(characterId);
    markTutorialSeen(CHOOSE_TUTORIAL_ID);
    setCoachStep(progress.tutorialFlags.includes(CARE_TUTORIAL_ID) ? null : 'care');
  }

  function handleCareAction(action: PetAction) {
    const result = doAction(action);
    showResult(result);
    if (result?.ok) {
      setSatisfactionId(current => current + 1);
      setIsSatisfied(true);
    }
    if (!result?.ok || coachStep !== 'care' || action !== recommendedAction.action) return;
    markTutorialSeen(CARE_TUTORIAL_ID);
    setCoachStep(null);
  }

  function handleRename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = changeName(nameDraft);
    showResult(result);
    if (result?.ok) setRenameOpen(false);
  }

  if (!pet) {
    return (
      <div className="immersive-background game-polished h-full flex flex-col bg-dark-surface" style={{ '--game-background': 'url(/images/ui/game-pet-bg.webp)' } as CSSProperties}>
        <div className="screen-safe-header pb-4 px-5 bg-black/50 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <button type="button" aria-label="Назад к играм" onClick={() => navigate('/games')} className="min-w-11 min-h-11 flex items-center justify-center text-white/80 hover:text-primary transition-colors">
              <ArrowLeft size={20} />
            </button>
            <h1 className="font-heading text-sm font-bold text-primary tracking-wider uppercase">Пестун</h1>
            <button
              type="button"
              onClick={() => setCoachStep('choose')}
              aria-label="Показать обучение"
              aria-pressed={coachStep !== null}
              className="game-icon-button"
            >
              <BookOpenText size={17} className="text-primary" />
            </button>
          </div>
        </div>
        <GameStatusBar
          metricLabel="Опыт"
          metricValue={0}
          secondaryLabel="Уровень"
          secondaryValue="—"
          currency={progress.currency}
          className="bg-black/50 px-5 pb-2"
        />
        <div className="gold-separator" />
        <div className="flex-1 overflow-y-auto phone-scroll px-5 py-4 bg-black/30">
          {progress.petDeparture && (
            <motion.section
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="game-panel rounded-2xl border border-primary/55 bg-[#17131f]/95 px-4 py-4 mb-4 text-center shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
              data-pet-departure
            >
              <span className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-xl border border-primary/40 bg-primary/10 text-primary">
                <AlertTriangle size={22} aria-hidden="true" />
              </span>
              <h2 className="font-heading text-base text-primary">Термлин ушёл в Термбург</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/75">
                {progress.petDeparture.name}: {DEPARTURE_REASONS[progress.petDeparture.depletedStat].toLowerCase()}.
                Теперь ему нужен отдых.
              </p>
              <button
                type="button"
                onClick={() => document.querySelector('[data-pet-choices]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="mt-3 min-h-11 rounded-xl border border-primary/45 bg-primary px-4 py-2 text-sm font-bold text-[#17131f] transition-transform active:scale-95"
              >
                Выбрать нового термлина
              </button>
            </motion.section>
          )}
          <GameCoach step={progress.petDeparture ? null : coachContent} className="game-coach--inline" />
          <h2 className="font-heading text-lg text-white text-center mt-2">{progress.petDeparture ? 'Кого позовём теперь?' : 'Кого возьмём под опеку?'}</h2>
          <p className="text-white/50 text-sm text-center mb-4 mt-1">Имя позже можно изменить. Бонус героя действует постоянно.</p>
          <div data-pet-choices className={cn('grid grid-cols-2 gap-3 rounded-2xl scroll-mt-4', coachStep === 'choose' && 'game-tutorial-target')}>
            {termliny.map((termlin, index) => {
              const color = ELEMENT_COLORS[termlin.element] ?? '#BA9B4F';
              return (
                <motion.button
                  type="button"
                  key={termlin.id}
                  className={cn('pet-choice game-panel min-h-[154px] backdrop-blur-sm rounded-2xl p-3 text-center transition-all', termlin.isLegendary && 'border-yellow-500/30')}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => handleAdopt(termlin.id)}
                >
                  <TermlinPortrait src={termlin.image} name={termlin.name} color={color} />
                  <p className="text-white/90 font-bold text-sm mt-2">{termlin.name}</p>
                  {termlin.ability.pet && <p className="text-[10px] leading-snug mt-1" style={{ color }}>{termlin.ability.pet}</p>}
                </motion.button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const termlin = getTermlinById(pet.characterId);
  const color = termlin ? (ELEMENT_COLORS[termlin.element] ?? '#BA9B4F') : '#BA9B4F';
  const moodColor = MOOD_COLORS[mood];
  const avatarSize = Math.min(STAGE_SIZES[pet.stage], 104);
  const expressions = termlin?.expressions ?? [];
  const expression = expressions.length > 0
    ? expressions[mood === 'ecstatic' ? 0 : mood === 'happy' ? Math.min(1, expressions.length - 1) : expressions.length - 1]
    : '';
  const averageStat = (pet.hunger + pet.happiness + pet.energy + pet.cleanliness) / 4;
  const petCoinsToday = normalizeDailyGameRewards(progress.dailyGameRewards).earned.pet;

  return (
    <div className="relative immersive-background game-polished h-full flex flex-col bg-dark-surface" style={{ '--game-background': 'url(/images/ui/game-pet-bg.webp)' } as CSSProperties} data-pet-screen>
      <header className="screen-safe-header pb-2 px-4 bg-black/55 backdrop-blur-sm">
        <div className="grid grid-cols-[44px_1fr_auto] items-center gap-2">
          <button type="button" aria-label="Назад к играм" onClick={() => navigate('/games')} className="min-w-11 min-h-11 flex items-center justify-center text-white/80 hover:text-primary transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 text-center">
            <p className="font-heading text-sm font-bold text-primary tracking-wide truncate">{pet.name}</p>
            <p className="text-white/45 text-[10px]">Ур. {level} · {STAGE_LABELS[pet.stage]}</p>
          </div>
          <button
            type="button"
            onClick={() => setCoachStep('care')}
            aria-label="Показать обучение"
            aria-pressed={coachStep !== null}
            className="game-icon-button min-h-11 min-w-11"
          >
            <BookOpenText size={17} className="text-primary" />
          </button>
        </div>
      </header>
      <GameStatusBar
        metricLabel="Опыт"
        metricValue={`${levelProgress.current}/${levelProgress.max}`}
        secondaryLabel="Уровень"
        secondaryValue={level}
        currency={progress.currency}
        className="bg-black/55 px-4 pb-2"
      />
      <div className="gold-separator" />

      <div className="bg-black/45 px-4 py-2" data-pet-daily-coins>
        <div className="flex items-center justify-between gap-3 text-[11px]">
          <span className="text-white/55">Термокоины Пестуна сегодня</span>
          <strong className="text-primary tabular-nums">{petCoinsToday}/{DAILY_GAME_REWARD_LIMIT}</strong>
        </div>
        <ProgressBar current={petCoinsToday} max={DAILY_GAME_REWARD_LIMIT} className="mt-1.5 h-1.5" />
      </div>

      <AnimatePresence>
        {notice && (
          <motion.div
            className={cn(
              'absolute z-40 left-4 right-4 top-[calc(env(safe-area-inset-top,0px)+68px)] rounded-xl border px-4 py-3 text-sm font-semibold shadow-xl backdrop-blur-md',
              notice.tone === 'success' ? 'bg-[#163723]/95 border-[#5DB879]/40 text-[#8CE0A6]' : 'bg-[#441E26]/95 border-red-400/35 text-red-200',
            )}
            role="status"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            data-pet-notice
          >
            {notice.text}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 min-h-0 overflow-y-auto phone-scroll bg-black/30">
        <div className="px-4 pt-3 pb-2">
          <GameCoach step={coachContent} className="game-coach--inline" />
          {warning && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/15 border border-red-400/25 mb-3" role="alert">
              <AlertTriangle size={16} className="text-red-300 shrink-0" />
              <span className="text-red-200 text-xs font-semibold">{warning}</span>
            </div>
          )}

          <section className="game-panel rounded-2xl p-3 backdrop-blur-sm" aria-label="Состояние термлина">
            <div className="flex items-center gap-3">
              <div
                className={cn('pet-stage relative shrink-0', isSatisfied && 'pet-stage--satisfied')}
                style={{ background: `radial-gradient(circle, ${color}24 0%, transparent 70%)`, padding: 6, borderRadius: '50%' }}
              >
                {isSatisfied && <span className="pet-stage__motes" aria-hidden="true" />}
                <motion.img
                  key={`${pet.characterId}-${satisfactionId}`}
                  src={termlin?.image ?? ''}
                  alt={termlin?.name ?? ''}
                  className="rounded-full object-cover border-2"
                  style={{ width: avatarSize, height: avatarSize, borderColor: color, boxShadow: `0 0 24px ${color}30` }}
                  animate={isSatisfied
                    ? { y: [0, -8, 0], scale: [1, 1.07, 1], rotate: [0, -2, 2, 0] }
                    : undefined}
                  transition={{ duration: 0.72, ease: 'easeOut' }}
                />
                <AnimatePresence>
                  {isSatisfied && (
                    <motion.span
                      className="pet-satisfaction-bubble"
                      role="status"
                      initial={{ opacity: 0, y: 7, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -5, scale: 0.95 }}
                      data-pet-satisfaction
                    >
                      <Heart size={14} fill="currentColor" aria-hidden="true" />
                      Вот теперь хорошо!
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <h2 className="font-heading text-lg text-white truncate">{pet.name}</h2>
                  <button
                    type="button"
                    aria-label="Изменить имя"
                    onClick={() => { setNameDraft(pet.name); setRenameOpen(true); }}
                    className="min-w-11 min-h-11 -my-2 flex items-center justify-center text-white/45 hover:text-primary"
                    data-pet-rename-open
                  >
                    <Pencil size={15} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border" style={{ color: moodColor, borderColor: `${moodColor}45`, backgroundColor: `${moodColor}18` }}>{MOOD_LABELS[mood]}</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/5 text-white/55">Общее {Math.round(averageStat)}%</span>
                </div>
                {expression && !isSatisfied && <p className="text-white/45 text-xs italic mt-2 line-clamp-1">«{expression}»</p>}
              </div>
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-3 items-end mt-3 pt-3 border-t border-white/10">
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-white/55 font-semibold">Привязанность · уровень {level}</span>
                  <span className="text-primary tabular-nums">{levelProgress.current}/{levelProgress.max}</span>
                </div>
                <ProgressBar current={levelProgress.current} max={levelProgress.max} color={color} />
              </div>
              <div className="flex items-center gap-1 text-orange-300" aria-label={`Серия ухода: ${pet.careStreak} дней`}>
                <Flame size={16} fill="currentColor" />
                <strong className="text-sm tabular-nums">{pet.careStreak}</strong>
              </div>
            </div>
          </section>
        </div>

        <nav className="sticky top-0 z-20 px-4 py-2 bg-[#171323]/95 backdrop-blur-md border-y border-white/5" aria-label="Разделы Пестуна">
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/30 p-1">
            {tabs.map(tab => (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-current={activeTab === tab.id ? 'page' : undefined}
                className={cn(
                  'min-h-11 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors',
                  activeTab === tab.id ? 'bg-primary text-[#1E1A2E]' : 'text-white/50 hover:text-white/80',
                )}
                data-pet-tab={tab.id}
              >
                <tab.icon size={15} />{tab.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="px-4 pt-3 pb-[max(18px,env(safe-area-inset-bottom))]">
          {activeTab === 'care' && (
            <div className="space-y-3" data-pet-panel="care">
              <section aria-labelledby="care-controls-title">
                <div className="flex items-end justify-between mb-2">
                  <div>
                    <h3 id="care-controls-title" className="font-heading text-sm text-white">Уход</h3>
                    <p className="text-white/40 text-[10px] mt-0.5">Нажми на показатель, чтобы позаботиться</p>
                  </div>
                  <button type="button" onClick={() => setCoachStep('care')} className="min-h-11 px-2 flex items-center gap-1 text-xs text-primary"><BookOpenText size={14} />Показать совет</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {actions.map(action => {
                  const value = pet[action.stat];
                  const low = value < 20;
                  const cooldown = cooldowns[action.action] ?? 0;
                  const onCooldown = cooldown > 0;
                  return (
                    <motion.button
                      type="button"
                      key={action.action}
                      className={cn(
                        'pet-care-control game-panel rounded-xl p-3 text-left transition-all',
                        onCooldown && 'opacity-[0.58]',
                        coachStep === 'care' && action.action === recommendedAction.action && 'game-tutorial-target',
                      )}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => handleCareAction(action.action)}
                      aria-disabled={onCooldown}
                      aria-label={`${action.statLabel}: ${Math.round(value)} процентов. ${onCooldown ? `Доступно через ${formatCooldown(cooldown)}` : action.label}`}
                      data-pet-care={action.action}
                    >
                      <span className="flex items-center gap-2">
                        <span className="pet-care-control__icon" style={{ color: low ? '#E85C5C' : action.color, backgroundColor: `${low ? '#E85C5C' : action.color}1F` }}>
                          <action.icon size={24} strokeWidth={2.2} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline justify-between gap-1">
                            <strong className="text-white/90 text-sm truncate">{action.statLabel}</strong>
                            <strong className={cn('text-sm tabular-nums', low ? 'text-red-300' : 'text-white/85')}>{Math.round(value)}%</strong>
                          </span>
                          <ProgressBar current={value} max={100} color={low ? '#E85C5C' : action.color} className="mt-1.5 h-1.5" />
                        </span>
                      </span>
                      <span className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                        <strong style={{ color: onCooldown ? undefined : action.color }} className={cn(onCooldown && 'text-white/45')}>{action.label}</strong>
                        <span className="text-white/40 tabular-nums">{onCooldown ? `Ещё ${formatCooldown(cooldown)}` : action.shortEffect}</span>
                      </span>
                    </motion.button>
                  );
                })}
                </div>
              </section>

              <section className="game-panel rounded-2xl overflow-hidden" aria-labelledby="daily-title">
                <button
                  type="button"
                  onClick={() => showResult(takeDailyGift())}
                  aria-disabled={pet.daily.giftClaimed}
                  className={cn('w-full min-h-[74px] px-4 py-3 flex items-center gap-3 text-left border-b border-white/10', pet.daily.giftClaimed ? 'opacity-[0.55]' : 'bg-primary/10')}
                  data-pet-daily-gift
                >
                  <span className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center shrink-0"><Gift size={21} className="text-primary" /></span>
                  <span className="flex-1">
                    <strong className="block text-white text-sm">Ежедневный гостинец</strong>
                    <span className="block text-white/45 text-xs mt-0.5">+8 ко всем шкалам · +10 опыта · +10 термокоинов</span>
                  </span>
                  {pet.daily.giftClaimed ? <Check size={20} className="text-[#5DB879]" /> : <span className="text-primary text-xs font-bold">Забрать</span>}
                </button>
                <div className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 id="daily-title" className="font-heading text-sm text-white">Дела на сегодня</h3>
                    <span className="text-white/35 text-[10px]">Обновятся завтра</span>
                  </div>
                  <div className="space-y-2">
                    {PET_DAILY_TASKS.map(task => {
                      const progressValue = Math.min(task.target, pet.daily.taskProgress[task.id] ?? 0);
                      const complete = progressValue >= task.target;
                      const claimed = pet.daily.taskClaimed.includes(task.id);
                      return (
                        <div key={task.id} className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3" data-pet-task={task.id}>
                          <div className="flex items-center gap-2">
                            <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', claimed ? 'bg-[#5DB879]/15 text-[#76D494]' : 'bg-primary/10 text-primary')}>
                              {claimed ? <Check size={16} /> : <Star size={16} />}
                            </span>
                            <div className="flex-1 min-w-0">
                              <strong className="block text-white/80 text-xs">{task.title}</strong>
                              <span className="block text-white/40 text-[10px] mt-0.5">{task.description}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => showResult(collectTask(task.id as PetDailyTaskId))}
                              aria-disabled={!complete || claimed}
                              className={cn('min-h-11 min-w-[70px] rounded-lg px-2 text-[10px] font-bold', complete && !claimed ? 'bg-primary text-[#1E1A2E]' : 'bg-white/5 text-white/35')}
                              data-pet-task-claim={task.id}
                            >
                              {claimed ? 'Готово' : complete ? `+${task.rewardCoins} термокоинов` : `${progressValue}/${task.target}`}
                            </button>
                          </div>
                          {!claimed && <ProgressBar current={progressValue} max={task.target} color={complete ? '#5DB879' : '#BA9B4F'} className="mt-2" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'activities' && (
            <div className="space-y-3" data-pet-panel="activities">
              <div className="rounded-xl border border-primary/20 bg-primary/10 p-3 flex items-start gap-2">
                <Sparkles size={18} className="text-primary shrink-0 mt-0.5" />
                <p className="text-white/60 text-xs leading-relaxed">Занятия дают больше опыта и открывают новые стадии взросления. Следи за условиями перед походом.</p>
              </div>
              {PET_ACTIVITIES.map(activity => {
                const ActivityIcon = activityIcons[activity.id];
                const locked = level < activity.minLevel;
                const cooldown = activityCooldowns[activity.id] ?? 0;
                const onCooldown = cooldown > 0;
                const requirementFailed = activity.requirement && pet[activity.requirement.stat] < activity.requirement.minimum;
                return (
                  <motion.button
                    type="button"
                    key={activity.id}
                    onClick={() => showResult(doActivity(activity.id))}
                    aria-disabled={locked || onCooldown || Boolean(requirementFailed)}
                    className={cn('w-full game-panel rounded-2xl p-4 text-left transition-all', (locked || onCooldown || requirementFailed) && 'opacity-65')}
                    whileTap={{ scale: 0.98 }}
                    data-pet-activity={activity.id}
                  >
                    <div className="flex items-start gap-3">
                      <span className="w-12 h-12 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0">
                        {locked ? <LockKeyhole size={21} className="text-white/45" /> : <ActivityIcon size={22} className="text-primary" />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center justify-between gap-2">
                          <strong className="font-heading text-base text-white">{activity.title}</strong>
                          <span className="text-primary text-xs font-bold whitespace-nowrap">+{activity.rewardCoins} термокоинов</span>
                        </span>
                        <span className="block text-white/45 text-xs leading-relaxed mt-1">{activity.description}</span>
                        <span className="flex flex-wrap gap-1.5 mt-2">
                          <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-white/55">+{activity.rewardExperience} опыта</span>
                          {locked && <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-white/55">С уровня {activity.minLevel}</span>}
                          {onCooldown && <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-white/55">Через {formatCooldown(cooldown)}</span>}
                          {!locked && !onCooldown && requirementFailed && <span className="rounded-full bg-red-400/10 px-2 py-1 text-[10px] text-red-200">{activity.requirement?.message}</span>}
                        </span>
                      </span>
                    </div>
                  </motion.button>
                );
              })}

              {termlin?.ability.pet && (
                <div className="game-panel rounded-2xl p-4 flex items-start gap-3">
                  <img src={termlin.image} alt="" className="w-11 h-11 rounded-full object-cover border border-primary/35" />
                  <div>
                    <h3 className="font-heading text-sm text-primary">Дар термлина</h3>
                    <p className="text-white/55 text-xs leading-relaxed mt-1">{termlin.ability.pet}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'diary' && (
            <div className="space-y-3" data-pet-panel="diary">
              <section className="grid grid-cols-2 gap-2">
                <div className="game-panel rounded-xl p-3">
                  <span className="text-white/35 text-[10px]">Вместе дней</span>
                  <strong className="block font-heading text-xl text-white mt-1">{Math.max(1, Math.ceil(pet.age / 1440))}</strong>
                </div>
                <div className="game-panel rounded-xl p-3">
                  <span className="text-white/35 text-[10px]">Крепость связи</span>
                  <strong className="block font-heading text-xl text-white mt-1">{Math.round(pet.bond)}%</strong>
                </div>
              </section>

              <section className="game-panel rounded-2xl p-4">
                <h3 className="font-heading text-sm text-white mb-3">Путь взросления</h3>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {(['baby', 'teen', 'adult'] as const).map((stage, index) => {
                    const reached = ['baby', 'teen', 'adult'].indexOf(pet.stage) >= index;
                    return (
                      <div key={stage} className={cn('rounded-xl border p-2', reached ? 'border-primary/30 bg-primary/10' : 'border-white/[0.08] bg-white/[0.03] opacity-50')}>
                        <span className="block text-lg">{reached ? '✦' : '◇'}</span>
                        <span className="block text-[10px] text-white/65 mt-1">{STAGE_LABELS[stage]}</span>
                        {stage === 'teen' && <span className="block text-[9px] text-white/35">с 3 уровня</span>}
                        {stage === 'adult' && <span className="block text-[9px] text-white/35">с 6 уровня</span>}
                      </div>
                    );
                  })}
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-heading text-sm text-white">Летопись</h3>
                  <span className="text-white/35 text-[10px]">Последние {pet.diary.length}</span>
                </div>
                <div className="space-y-2">
                  {pet.diary.map(entry => (
                    <article key={entry.id} className="game-panel rounded-xl p-3 flex items-start gap-3">
                      <span className={cn(
                        'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
                        entry.kind === 'reward' ? 'bg-primary/15 text-primary' : entry.kind === 'growth' ? 'bg-[#9B7EC8]/15 text-[#C6A8EE]' : entry.kind === 'activity' ? 'bg-[#5DB879]/15 text-[#76D494]' : 'bg-[#6AABDA]/15 text-[#82C5F2]',
                      )}>
                        {entry.kind === 'reward' ? <Gift size={16} /> : entry.kind === 'growth' ? <Star size={16} /> : entry.kind === 'activity' ? <Sparkles size={16} /> : <Heart size={16} />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <strong className="text-white/80 text-xs">{entry.title}</strong>
                          <time className="text-white/30 text-[9px] whitespace-nowrap">{formatDiaryTime(entry.createdAt)}</time>
                        </div>
                        <p className="text-white/40 text-[11px] leading-relaxed mt-1">{entry.detail}</p>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {renameOpen && (
          <motion.div className="absolute inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.form
              onSubmit={handleRename}
              className="w-full max-w-sm game-panel rounded-2xl p-5"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              data-pet-rename-form
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-heading text-lg text-white">Новое имя</h2>
                <button type="button" onClick={() => setRenameOpen(false)} aria-label="Закрыть" className="min-w-11 min-h-11 flex items-center justify-center text-white/55"><X size={20} /></button>
              </div>
              <label htmlFor="pet-name" className="block text-white/65 text-sm mb-2">Имя термлина</label>
              <input
                id="pet-name"
                value={nameDraft}
                onChange={event => setNameDraft(event.target.value)}
                minLength={2}
                maxLength={20}
                autoFocus
                className="w-full min-h-12 rounded-xl border border-white/15 bg-black/25 px-4 text-base text-white focus:outline-none focus:border-primary"
              />
              <p className="text-white/35 text-xs mt-2">От 2 до 20 символов</p>
              <button type="submit" className="w-full min-h-12 rounded-xl bg-primary text-[#1E1A2E] font-bold mt-4">Сохранить имя</button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
