import { useRef, useCallback, useEffect, useLayoutEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, BookOpenText, Layers3, RotateCcw, Sparkles, Target, Trophy } from 'lucide-react';
import { useBubbles, type BubbleBurst } from '@/hooks/useBubbles';
import { useGameContext } from '@/store/GameContext';
import { getTermlinById, ELEMENT_COLORS } from '@/data/termliny';
import { BUBBLE_HEX_COLORS, BUBBLE_NAMES, type BubbleColor } from '@/engine/engine-bubbles/bubbleTypes';
import { BUBBLE_DIAMETER, BUBBLE_RADIUS, GRID_COLS } from '@/engine/engine-bubbles/hexGrid';
import { getCollisionAwareAimLine, getShooterBottomGutter } from '@/engine/engine-bubbles/bubblePhysics';
import { getTotalLevels } from '@/engine/engine-bubbles/bubbleLevels';
import { Button } from '@/components/ui/Button';
import { CharacterAbilityBar } from '@/components/game/CharacterAbilityBar';
import { CoachGesture, GameCoach, type GameCoachStep } from '@/components/game/GameCoach';
import { GameStatusBar } from '@/components/game/GameStatusBar';
import { triggerHaptic } from '@/utils/haptics';
import { LivesDisplay } from '@/components/ui/LivesDisplay';
import { DAILY_GAME_REWARD_LIMIT, STANDARD_WIN_REWARD, normalizeDailyGameRewards } from '@/data/economy';

const MAX_FIELD_WIDTH = 336;
const FIELD_SIDE_GUTTER = 32;
const FIELD_INNER_PADDING = 8;
const FIELD_BORDER_ALLOWANCE = 2;
const MIN_FIELD_WIDTH = GRID_COLS * BUBBLE_DIAMETER + FIELD_INNER_PADDING * 2 + FIELD_BORDER_ALLOWANCE;
const SHOOTER_HIT_RADIUS = 34;
const AIM_TUTORIAL_ID = 'bubbles-aim';
const MATCH_TUTORIAL_ID = 'bubbles-match';
type BubbleCoachStep = 'aim' | 'match' | null;

function getResponsiveFieldWidth() {
  if (typeof window === 'undefined') return MAX_FIELD_WIDTH;
  const heightLimit = window.innerHeight <= 700 ? 320 : MAX_FIELD_WIDTH;
  return Math.max(MIN_FIELD_WIDTH, Math.min(MAX_FIELD_WIDTH, heightLimit, window.innerWidth - FIELD_SIDE_GUTTER));
}

// Компонент веника вместо шарика
function VenikBubble({ x, y, color, size = BUBBLE_RADIUS, tutorialRole, isFlying = false }: { x: number; y: number; color: BubbleColor; size?: number; tutorialRole?: 'focus' | 'dim'; isFlying?: boolean }) {
  const hex = BUBBLE_HEX_COLORS[color];
  return (
    <motion.div
      className={`venik-bubble absolute flex items-center justify-center${tutorialRole ? ` venik-bubble--tutorial-${tutorialRole}` : ''}`}
      data-flying-bubble={isFlying ? 'true' : undefined}
      aria-hidden="true"
      style={{
        width: size * 2,
        height: size * 2,
        left: x - size,
        top: y - size,
      }}
    >
      {/* Фоновый круг */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `linear-gradient(155deg, ${hex}e6, ${hex}a8)`,
          border: `1px solid ${hex}99`,
          boxShadow: 'inset 0 -3px 6px rgba(0,0,0,0.26), 0 3px 7px rgba(0,0,0,0.24)',
        }}
      />
      {/* Иконка веника */}
      <span className="relative text-base" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}>
        🌿
      </span>
    </motion.div>
  );
}

const BURST_DIRECTIONS = [
  { x: -24, y: -17 },
  { x: 22, y: -20 },
  { x: -27, y: 18 },
  { x: 25, y: 19 },
  { x: 0, y: -30 },
  { x: 2, y: 29 },
] as const;

function BubbleBurstEffect({ burst }: { burst: BubbleBurst }) {
  const hex = BUBBLE_HEX_COLORS[burst.color];
  const distanceScale = burst.kind === 'drop' ? 1.25 : 1;
  return (
    <motion.span
      className="pointer-events-none absolute z-20"
      style={{ left: burst.x, top: burst.y, color: hex }}
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ duration: 0.58, ease: 'easeOut' }}
      aria-hidden="true"
    >
      <motion.i
        className="bubble-pop-ring"
        style={{ borderColor: hex, boxShadow: `0 0 14px ${hex}aa` }}
        initial={{ scale: 0.25, opacity: 0.95 }}
        animate={{ scale: 1.8, opacity: 0 }}
        transition={{ duration: 0.42, ease: 'easeOut' }}
      />
      {BURST_DIRECTIONS.map((direction, index) => (
        <motion.i
          key={index}
          className="bubble-pop-particle"
          style={{ backgroundColor: index % 2 === 0 ? '#fff1ad' : hex }}
          initial={{ x: 0, y: 0, scale: 1, opacity: 1, rotate: index * 30 }}
          animate={{
            x: direction.x * distanceScale,
            y: direction.y * distanceScale + (burst.kind === 'drop' ? 18 : 0),
            scale: 0.15,
            opacity: 0,
            rotate: index * 30 + 120,
          }}
          transition={{ duration: burst.kind === 'drop' ? 0.58 : 0.46, ease: 'easeOut' }}
        />
      ))}
    </motion.span>
  );
}

export function BubbleShooterScreen() {
  const navigate = useNavigate();
  const { progress, markTutorialSeen } = useGameContext();
  const [fieldWidth, setFieldWidth] = useState(getResponsiveFieldWidth);
  const fieldWidthRef = useRef(fieldWidth);
  const fieldHeight = fieldWidth * 1.4;
  const { state, earnedReward, aimAngle, setAimAngle, shoot, flying, flightTrail, bursts, nextLevel, restart, resizeField } = useBubbles(fieldWidth);
  const fieldAreaRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const [fieldScale, setFieldScale] = useState(1);
  const dragging = useRef(false);
  const activePointerId = useRef<number | null>(null);
  const aimAngleRef = useRef(aimAngle);
  const [isAiming, setIsAiming] = useState(false);
  const previousScore = useRef(state.score);
  const [abilityUsed, setAbilityUsed] = useState(false);
  const [showTrajectory, setShowTrajectory] = useState(false);
  const [coachStep, setCoachStep] = useState<BubbleCoachStep>(() => {
    if (!progress.tutorialFlags.includes(AIM_TUTORIAL_ID)) return 'aim';
    if (!progress.tutorialFlags.includes(MATCH_TUTORIAL_ID)) return 'match';
    return null;
  });

  const cancelAim = useCallback(() => {
    const pointerId = activePointerId.current;
    activePointerId.current = null;
    dragging.current = false;
    setIsAiming(false);
    if (pointerId !== null && fieldRef.current?.hasPointerCapture(pointerId)) {
      fieldRef.current.releasePointerCapture(pointerId);
    }
  }, []);

  useEffect(() => {
    const updateFieldWidth = () => {
      const nextWidth = getResponsiveFieldWidth();
      if (nextWidth === fieldWidthRef.current) return;
      cancelAim();
      fieldWidthRef.current = nextWidth;
      resizeField(nextWidth);
      setFieldWidth(nextWidth);
    };
    window.addEventListener('resize', updateFieldWidth);
    return () => window.removeEventListener('resize', updateFieldWidth);
  }, [cancelAim, resizeField]);

  useLayoutEffect(() => {
    const area = fieldAreaRef.current;
    if (!area) return;

    let frame = 0;
    const fitField = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const rect = area.getBoundingClientRect();
        const availableHeight = Math.max(1, rect.height - 4);
        const nextScale = Math.min(1, rect.width / fieldWidth, availableHeight / fieldHeight);
        setFieldScale(current => Math.abs(current - nextScale) < 0.002 ? current : nextScale);
      });
    };

    const observer = new ResizeObserver(fitField);
    observer.observe(area);
    fitField();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [fieldHeight, fieldWidth]);

  const character = getTermlinById(progress.selectedCharacter);
  const charColor = character ? (ELEMENT_COLORS[character.element] ?? '#BA9B4F') : '#BA9B4F';
  const bubblesCoinsToday = normalizeDailyGameRewards(progress.dailyGameRewards).earned.bubbles;

  const scoreMult = progress.selectedCharacter === 'pereslav' ? 1.20 : 1.0;

  const shooterX = fieldWidth / 2;
  const shooterY = fieldHeight - getShooterBottomGutter(window.innerHeight);

  const totalLevels = getTotalLevels();

  const coachContent: GameCoachStep | null = coachStep === 'aim'
    ? {
        id: AIM_TUTORIAL_ID,
        title: 'Наведи бросок',
        message: 'Коснись нужного места или потяни прицел и отпусти — веник полетит по линии.',
        icon: <Target size={21} />,
      }
    : coachStep === 'match'
      ? {
          id: MATCH_TUTORIAL_ID,
          title: 'Собери три',
          message: 'Бросай к подсвеченным веникам того же цвета. Группа из трёх исчезнет.',
          icon: <Layers3 size={21} />,
        }
      : null;

  useEffect(() => {
    const before = previousScore.current;
    previousScore.current = state.score;
    if (state.score <= before) return;
    triggerHaptic('match');
    if (coachStep !== 'match') return;
    const timer = window.setTimeout(() => {
      markTutorialSeen(MATCH_TUTORIAL_ID);
      setCoachStep(null);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [coachStep, markTutorialSeen, state.score]);

  useEffect(() => {
    if (state.isWon) triggerHaptic('success');
    else if (state.isLost) triggerHaptic('warning');
  }, [state.isLost, state.isWon]);

  const getLogicalPointer = useCallback((clientX: number, clientY: number) => {
    const rect = fieldRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * fieldWidth,
      y: ((clientY - rect.top) / rect.height) * fieldHeight,
    };
  }, [fieldHeight, fieldWidth]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    if (
      activePointerId.current !== null
      || flying
      || state.isWon
      || state.isLost
      || (e.pointerType === 'mouse' && e.button !== 0)
    ) return;
    const point = getLogicalPointer(e.clientX, e.clientY);
    if (!point) return;
    const { x, y } = point;
    const startsOnShooter = Math.hypot(x - shooterX, y - shooterY) <= SHOOTER_HIT_RADIUS;
    if (!startsOnShooter && y >= shooterY - SHOOTER_HIT_RADIUS) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    activePointerId.current = e.pointerId;
    dragging.current = true;
    setIsAiming(true);
    const angle = Math.atan2(x - shooterX, shooterY - y);
    const nextAngle = Math.max(-1.2, Math.min(1.2, angle));
    aimAngleRef.current = nextAngle;
    setAimAngle(nextAngle);
  }, [flying, getLogicalPointer, shooterX, shooterY, setAimAngle, state.isLost, state.isWon]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current || activePointerId.current !== e.pointerId) return;
    const point = getLogicalPointer(e.clientX, e.clientY);
    if (!point) return;
    const { x, y } = point;
    const angle = Math.atan2(x - shooterX, shooterY - y);
    const nextAngle = Math.max(-1.2, Math.min(1.2, angle));
    aimAngleRef.current = nextAngle;
    setAimAngle(nextAngle);
  }, [getLogicalPointer, shooterX, shooterY, setAimAngle]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (dragging.current && activePointerId.current === e.pointerId) {
      // Some WebKit touch releases expose (0, 0); keep the last reliable
      // down/move direction in that case instead of redirecting the shot.
      const point = e.clientX !== 0 || e.clientY !== 0
        ? getLogicalPointer(e.clientX, e.clientY)
        : null;
      if (point) {
        const angle = Math.atan2(point.x - shooterX, shooterY - point.y);
        aimAngleRef.current = Math.max(-1.2, Math.min(1.2, angle));
      }
      const shotAngle = aimAngleRef.current;
      cancelAim();
      shoot(shotAngle);
      triggerHaptic('selection');
      if (coachStep === 'aim') {
        markTutorialSeen(AIM_TUTORIAL_ID);
        setCoachStep('match');
      }
    }
  }, [cancelAim, coachStep, getLogicalPointer, markTutorialSeen, shoot, shooterX, shooterY]);

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    if (activePointerId.current !== e.pointerId) return;
    cancelAim();
  }, [cancelAim]);

  const handleLostPointerCapture = useCallback((e: React.PointerEvent) => {
    if (activePointerId.current !== e.pointerId) return;
    cancelAim();
  }, [cancelAim]);

  const suppressNativeFieldInteraction = useCallback((e: React.SyntheticEvent) => {
    e.preventDefault();
  }, []);

  const handleAbility = useCallback(() => {
    if (abilityUsed) return;
    setAbilityUsed(true);
    setShowTrajectory(true);
    window.setTimeout(() => setShowTrajectory(false), 5000);
  }, [abilityUsed]);

  const handleRestart = useCallback(() => {
    cancelAim();
    setShowTrajectory(false);
    setAbilityUsed(false);
    restart();
  }, [cancelAim, restart]);

  const handleNextLevel = useCallback(() => {
    cancelAim();
    setShowTrajectory(false);
    setAbilityUsed(false);
    nextLevel();
  }, [cancelAim, nextLevel]);

  const hasActiveAbility = !abilityUsed && (
    progress.selectedCharacter === 'kazimir' ||
    progress.selectedCharacter === 'milovan'
  );

  const aimLine = useMemo(() => {
    if (state.isWon || state.isLost) return [];
    return getCollisionAwareAimLine(shooterX, shooterY, aimAngle, fieldWidth, fieldHeight, state.bubbles);
  }, [aimAngle, fieldHeight, fieldWidth, shooterX, shooterY, state.bubbles, state.isWon, state.isLost]);

  const displayScore = Math.round(state.score * scoreMult);
  const currentVenikName = BUBBLE_NAMES[state.shooterColor] || 'Веник';

  return (
    <div
      className="bubble-game-screen immersive-background game-polished h-full min-h-0 overflow-hidden flex flex-col bg-dark-surface"
      style={{ '--game-background': 'url(/images/ui/game-bubbles-bg.webp)' } as CSSProperties}
    >
      {/* Header */}
      <div className="bubble-game-screen__header screen-safe-header pb-2 px-4 bg-black/50 backdrop-blur-sm">
        <div className="grid grid-cols-[44px_1fr_auto] items-center">
          <button type="button" aria-label="Назад к играм" onClick={() => navigate('/games')} className="min-w-11 min-h-11 flex items-center justify-center text-white/80 hover:text-primary transition-colors">
            <ArrowLeft size={20} />
          </button>
          <div className="text-center">
            <h2 className="font-heading text-sm font-bold text-primary tracking-wider">
              Бирюльки
            </h2>
            <p className="text-white/40 text-[10px]">{state.levelName}</p>
          </div>
          <div className="flex items-center justify-end">
            {hasActiveAbility && (
              <button
                type="button"
                onClick={handleAbility}
                aria-label="Показать траекторию"
                className="min-h-11 min-w-11 rounded-xl border bg-white/5 flex items-center justify-center animate-pulse"
                style={{ borderColor: `${charColor}40` }}
              >
                <Sparkles size={16} style={{ color: charColor }} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setCoachStep('aim')}
              aria-label="Показать обучение"
              aria-pressed={coachStep !== null}
              className="min-h-11 min-w-11 flex items-center justify-center text-primary transition-colors"
            >
              <BookOpenText size={17} />
            </button>
            <button type="button" aria-label="Начать заново" onClick={handleRestart} className="min-w-11 min-h-11 flex items-center justify-center text-white/80 hover:text-primary transition-colors">
              <RotateCcw size={18} />
            </button>
          </div>
        </div>
      </div>

      <GameStatusBar
        level={state.level}
        totalLevels={totalLevels}
        metricLabel="Счёт игры"
        metricValue={displayScore}
        detailLabel="Бросков"
        detailValue={state.shotsLeft}
        detailValueDataAttribute="data-bubbles-shots"
        currency={progress.currency}
        className="bubble-game-screen__status bg-black/40 px-4 pb-1"
      />

      <div className="bubble-game-screen__rewards bg-black/40 px-4 pb-1 flex items-center justify-between gap-2">
        <LivesDisplay lives={progress.lives} nextLifeAt={progress.nextLifeAt} className="min-h-9 px-2.5" />
        <div
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-2.5"
          aria-label={`Награда Бирюлек: ${STANDARD_WIN_REWARD} термокоинов за победу. Получено сегодня: ${bubblesCoinsToday} из ${DAILY_GAME_REWARD_LIMIT}`}
        >
          <span className="termcoin-mark" aria-hidden="true">
            <img src="/images/brand/termburg-fish-96-v2.webp" alt="" width="48" height="48" />
          </span>
          <span className="flex flex-col leading-none">
            <strong className="text-[10px] text-primary">+{STANDARD_WIN_REWARD} за победу</strong>
            <small data-bubbles-daily-limit className="mt-1 text-[8px] font-bold text-white/75">
              За день: {bubblesCoinsToday}/{DAILY_GAME_REWARD_LIMIT}
            </small>
          </span>
        </div>
      </div>

      <GameCoach step={coachContent} className="bubble-game-screen__coach game-coach--screen game-coach--bubbles" />

      {/* Game field */}
      <div ref={fieldAreaRef} className="bubble-field-area flex-1 min-h-0 flex items-start justify-center pt-1 overflow-hidden">
        <div
          className="relative shrink-0"
          style={{ width: fieldWidth * fieldScale, height: fieldHeight * fieldScale }}
          data-bubble-field-scale={fieldScale.toFixed(3)}
        >
          <div
            ref={fieldRef}
            className="bubble-field-surface game-panel relative backdrop-blur-sm rounded-xl overflow-hidden touch-none"
            style={{
              width: fieldWidth,
              height: fieldHeight,
              transform: `scale(${fieldScale})`,
              transformOrigin: 'top left',
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onLostPointerCapture={handleLostPointerCapture}
            onContextMenu={suppressNativeFieldInteraction}
            onDragStart={suppressNativeFieldInteraction}
          >
          {isAiming && aimLine.length > 1 && (
            <svg className="bubble-aim-line absolute inset-0 pointer-events-none" style={{ width: fieldWidth, height: fieldHeight }} aria-hidden="true">
              <polyline
                points={aimLine.map(p => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={showTrajectory ? '#ffe78a' : 'rgba(255,255,255,0.72)'}
                strokeWidth={showTrajectory ? 4 : 3}
                strokeDasharray={showTrajectory ? '3,7' : '2,7'}
                strokeLinecap="round"
              />
              <circle
                cx={aimLine[aimLine.length - 1].x}
                cy={aimLine[aimLine.length - 1].y}
                r={showTrajectory ? BUBBLE_RADIUS + 3 : 5}
                fill="none"
                stroke={showTrajectory ? '#ffe78a' : 'rgba(255,255,255,0.78)'}
                strokeWidth={showTrajectory ? 2 : 1.5}
              />
            </svg>
          )}

          {flightTrail.map((point, index) => {
            const progress = (index + 1) / flightTrail.length;
            const size = 3 + progress * 9;
            return (
              <span
                key={point.id}
                className="bubble-flight-trail pointer-events-none absolute z-[4] rounded-full"
                style={{
                  left: point.x - size / 2,
                  top: point.y - size / 2,
                  width: size,
                  height: size,
                  opacity: 0.08 + progress * 0.42,
                  backgroundColor: BUBBLE_HEX_COLORS[point.color],
                  boxShadow: `0 0 ${5 + progress * 8}px ${BUBBLE_HEX_COLORS[point.color]}`,
                }}
                aria-hidden="true"
              />
            );
          })}

          {state.bubbles.map(b => (
            <VenikBubble
              key={b.id}
              x={b.x}
              y={b.y}
              color={b.color}
              tutorialRole={coachStep === 'match' ? (b.color === state.shooterColor ? 'focus' : 'dim') : undefined}
            />
          ))}

          {flying && (
            <VenikBubble x={flying.x} y={flying.y} color={flying.color} isFlying />
          )}

          <AnimatePresence>
            {bursts.map(burst => <BubbleBurstEffect key={`${burst.id}-${burst.kind}`} burst={burst} />)}
          </AnimatePresence>

          {/* Shooter */}
          <div
            className={`bubble-shooter absolute flex flex-col items-center${coachStep ? ' game-tutorial-target' : ''}${isAiming ? ' bubble-shooter--aiming' : ''}`}
            style={{ left: shooterX - 22, top: shooterY - 22 }}
            data-bubble-shooter
            data-aiming={isAiming ? 'true' : 'false'}
          >
            <div
              className="w-11 h-11 rounded-full border-3 border-white/60 flex items-center justify-center"
              style={{
                backgroundColor: BUBBLE_HEX_COLORS[state.shooterColor],
                boxShadow: `0 0 16px ${BUBBLE_HEX_COLORS[state.shooterColor]}70, inset 0 -3px 6px rgba(0,0,0,0.28)`,
              }}
            >
              <span className="text-lg">🌿</span>
            </div>
          </div>

          {coachStep === 'aim' && <CoachGesture kind="aim" />}

          {/* Next color */}
          <div
            className="absolute flex items-center gap-1.5"
            style={{ left: shooterX + 30, top: shooterY - 8 }}
          >
            <span className="text-white/50 text-[9px] font-medium">След:</span>
            <div
              className="w-5 h-5 rounded-full border-2 border-white/30 flex items-center justify-center"
              style={{
                backgroundColor: BUBBLE_HEX_COLORS[state.nextColor],
                boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.22)',
              }}
            >
              <span className="text-[10px]">🌿</span>
            </div>
          </div>

          {/* Current venik name */}
          <div
            className="absolute text-center"
            style={{ left: 8, top: shooterY - 10 }}
          >
            <span className="text-white/40 text-[8px]">{currentVenikName}</span>
          </div>

          {/* Win/Lose */}
          <AnimatePresence>
            {state.isWon && (
              <motion.div
                className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-10"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              >
                <Trophy size={40} className="text-primary mb-3" />
                <p className="text-primary font-bold text-lg mb-1">Победа!</p>
                <p className="text-white/70 text-xs mb-1">{state.levelName}</p>
                <p className="text-white/50 text-sm mb-4">Очки: {displayScore}</p>
                <p className="text-primary text-xs font-bold mb-4">
                  {earnedReward === null
                    ? 'Считаем награду…'
                    : earnedReward > 0
                      ? `+${earnedReward} термокоинов`
                      : 'Лимит Бирюлек на сегодня достигнут'}
                </p>
                <div className="space-y-2">
                  {state.level < totalLevels && (
                    <Button onClick={handleNextLevel} size="sm">Следующий уровень</Button>
                  )}
                  <button type="button" onClick={handleRestart} className="min-h-11 px-4 block text-white/60 text-xs mx-auto hover:text-white">Заново</button>
                </div>
              </motion.div>
            )}
            {state.isLost && (
              <motion.div
                className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-10"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              >
                <p className="text-white font-bold text-lg mb-1">Бирюльки закончились!</p>
                <p className="text-white/50 text-sm mb-4">Очки: {displayScore}</p>
                <Button onClick={handleRestart} size="sm">Попробовать снова</Button>
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Character ability bar */}
      <CharacterAbilityBar game="bubbles" />

    </div>
  );
}
