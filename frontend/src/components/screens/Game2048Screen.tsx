import { useRef, useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, BookOpenText, MoveHorizontal, Plus, RotateCcw, Sparkles, Undo2 } from 'lucide-react';
import { useGame2048 } from '@/hooks/useGame2048';
import { useGameContext } from '@/store/GameContext';
import { getTermlinById, ELEMENT_COLORS } from '@/data/termliny';
import { Tile2048 } from '@/components/game/Tile2048';
import { Win2048Popup } from '@/popups/Win2048Popup';
import { CharacterAbilityBar } from '@/components/game/CharacterAbilityBar';
import { CoachGesture, GameCoach, type GameCoachStep } from '@/components/game/GameCoach';
import { GameStatusBar } from '@/components/game/GameStatusBar';
import type { Direction } from '@/engine/engine-2048/moves2048';
import { triggerHaptic } from '@/utils/haptics';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { LivesDisplay } from '@/components/ui/LivesDisplay';
import { DAILY_GAME_REWARD_LIMIT, normalizeDailyGameRewards } from '@/data/economy';
import { useVisualViewportSize } from '@/hooks/useVisualViewportSize';

const GRID_SIZE = 4;
const GAP = 6;
const MOVE_TUTORIAL_ID = 'game2048-move';
const MERGE_TUTORIAL_ID = 'game2048-merge';
type Game2048CoachStep = 'move' | 'merge' | null;

export function Game2048Screen() {
  const navigate = useNavigate();
  const { progress, markTutorialSeen, spendLife } = useGameContext();
  const { state, earnedReward, move, continueGame, undo, restart } = useGame2048();
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const boardAreaRef = useRef<HTMLDivElement>(null);
  const previousMoveCount = useRef(state.moveCount);
  const lifeSpentForLoss = useRef(false);
  const [abilityUsed, setAbilityUsed] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);
  const [boardAreaSize, setBoardAreaSize] = useState({ width: 0, height: 0 });
  const viewport = useVisualViewportSize();
  const [coachStep, setCoachStep] = useState<Game2048CoachStep>(() => {
    if (!progress.tutorialFlags.includes(MOVE_TUTORIAL_ID)) return 'move';
    if (!progress.tutorialFlags.includes(MERGE_TUTORIAL_ID)) return 'merge';
    return null;
  });

  const character = getTermlinById(progress.selectedCharacter);
  const charColor = character ? (ELEMENT_COLORS[character.element] ?? '#BA9B4F') : '#BA9B4F';
  const slavichCoinsToday = normalizeDailyGameRewards(progress.dailyGameRewards).earned.game2048;

  useEffect(() => {
    const area = boardAreaRef.current;
    if (!area) return;

    let frame = 0;
    const measureArea = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const rect = area.getBoundingClientRect();
        const next = { width: Math.round(rect.width), height: Math.round(rect.height) };
        setBoardAreaSize(current => (
          current.width === next.width && current.height === next.height ? current : next
        ));
      });
    };

    const observer = new ResizeObserver(measureArea);
    observer.observe(area);
    measureArea();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  // Use the real flex area once it is measured so the persistent navigation
  // can never cover the board on short screens.
  const verticalUiSpace = coachStep ? 405 : 330;
  const fallbackHeightLimit = Math.max(144, viewport.height - verticalUiSpace);
  const widthLimit = boardAreaSize.width > 0 ? boardAreaSize.width - 32 : viewport.width - 40;
  const heightLimit = boardAreaSize.height > 0 ? boardAreaSize.height - 16 : fallbackHeightLimit;
  const containerSize = Math.max(128, Math.min(300, widthLimit, heightLimit));
  const cellSize = (containerSize - GAP * (GRID_SIZE + 1)) / GRID_SIZE;

  // Score multiplier
  const scoreMultiplier = progress.selectedCharacter === 'pereslav' ? 1.15
    : progress.selectedCharacter === 'yaromir' ? 1.10 : 1.0;
  const displayScore = Math.round(state.score * scoreMultiplier);

  const duplicateValue = useMemo(() => {
    const counts = new Map<number, number>();
    for (const tile of state.grid.flat()) {
      if (!tile) continue;
      counts.set(tile.value, (counts.get(tile.value) ?? 0) + 1);
    }
    return [...counts.entries()].find(([, count]) => count >= 2)?.[0];
  }, [state.grid]);

  const coachContent: GameCoachStep | null = coachStep === 'move'
    ? {
        id: MOVE_TUTORIAL_ID,
        title: 'Сдвинь всё поле',
        message: 'Проведи пальцем в любую сторону. На компьютере используй стрелки.',
        icon: <MoveHorizontal size={21} />,
      }
    : coachStep === 'merge'
      ? {
          id: MERGE_TUTORIAL_ID,
          title: 'Сложи одинаковые',
          message: 'Сведи две плитки с одним числом: 2 + 2 станет 4, 4 + 4 станет 8.',
          icon: <Plus size={21} />,
        }
      : null;

  useEffect(() => {
    const previous = previousMoveCount.current;
    previousMoveCount.current = state.moveCount;
    if (state.moveCount <= previous) return;

    triggerHaptic(state.lastScoreGained > 0 ? 'match' : 'move');

    if (coachStep === 'move') {
      const timer = window.setTimeout(() => {
        markTutorialSeen(MOVE_TUTORIAL_ID);
        if (state.lastScoreGained > 0) {
          markTutorialSeen(MERGE_TUTORIAL_ID);
          setCoachStep(null);
        } else {
          setCoachStep('merge');
        }
      }, 0);
      return () => window.clearTimeout(timer);
    }

    if (coachStep === 'merge' && state.lastScoreGained > 0) {
      const timer = window.setTimeout(() => {
        markTutorialSeen(MERGE_TUTORIAL_ID);
        setCoachStep(null);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [coachStep, markTutorialSeen, state.lastScoreGained, state.moveCount]);

  useEffect(() => {
    if (state.isWon) triggerHaptic('success');
    else if (state.isLost) {
      triggerHaptic('warning');
      if (!lifeSpentForLoss.current) {
        lifeSpentForLoss.current = true;
        spendLife();
      }
    }
  }, [spendLife, state.isLost, state.isWon]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return;

    let dir: Direction;
    if (Math.abs(dx) > Math.abs(dy)) {
      dir = dx > 0 ? 'right' : 'left';
    } else {
      dir = dy > 0 ? 'down' : 'up';
    }
    move(dir);
    touchRef.current = null;
  }, [move]);

  const handleAbility = useCallback(() => {
    if (abilityUsed) return;
    if (
      progress.selectedCharacter === 'kazimir'
      || progress.selectedCharacter === 'vedagor'
      || progress.selectedCharacter === 'milovan'
    ) {
      setAbilityUsed(true);
    }
  }, [abilityUsed, progress.selectedCharacter]);

  const handleRestart = useCallback(() => {
    setAbilityUsed(false);
    setShowRestartConfirm(false);
    lifeSpentForLoss.current = false;
    restart();
  }, [restart]);

  const handleUndo = useCallback(() => {
    if (!state.canUndo) return;
    undo();
    triggerHaptic('selection');
  }, [state.canUndo, undo]);

  const hasActiveAbility = !abilityUsed && (
    progress.selectedCharacter === 'kazimir' ||
    progress.selectedCharacter === 'vedagor' ||
    progress.selectedCharacter === 'milovan'
  );

  const tiles = state.grid.flatMap(row => row.filter((t): t is NonNullable<typeof t> => t !== null));

  return (
    <div
      className="game-2048-screen immersive-background game-polished h-full min-h-0 flex flex-col bg-dark-surface"
      style={{ '--game-background': 'url(/images/ui/game-2048-bg.webp)' } as CSSProperties}
    >
      {/* Header */}
      <div className="game-2048-screen__header screen-safe-header pb-2 px-4 bg-black/50 backdrop-blur-sm">
        <div className="grid grid-cols-[44px_1fr_auto] items-center">
          <button type="button" aria-label="Назад к играм" onClick={() => navigate('/games')} className="min-w-11 min-h-11 flex items-center justify-center text-white/80 hover:text-primary transition-colors">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-center font-heading text-base font-bold text-primary tracking-wider">Славич</h2>
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              aria-label="Отменить последний ход"
              onClick={handleUndo}
              disabled={!state.canUndo}
              className="min-w-11 min-h-11 flex items-center justify-center text-primary disabled:text-white/20 disabled:cursor-not-allowed transition-colors"
            >
              <Undo2 size={19} />
            </button>
            <button
              type="button"
              aria-label="Перезапустить игру"
              onClick={() => setShowRestartConfirm(true)}
              className="min-w-11 min-h-11 flex items-center justify-center text-red-300 hover:text-red-200 transition-colors"
            >
              <RotateCcw size={18} />
            </button>
            {hasActiveAbility && (
              <button
                type="button"
                onClick={handleAbility}
                aria-label="Использовать способность персонажа"
                className="min-h-11 min-w-11 rounded-xl border bg-white/5 flex items-center justify-center animate-pulse"
                style={{ borderColor: `${charColor}40` }}
              >
                <Sparkles size={18} style={{ color: charColor }} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="game-2048-screen__rewards px-4 py-1 bg-black/40 flex items-center justify-between gap-2">
        <LivesDisplay lives={progress.lives} nextLifeAt={progress.nextLifeAt} className="min-h-9 px-2.5" />
        <span
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-white/10 bg-black/45 px-2.5 text-white/60"
          aria-label="Награды Славича: 5 термокоинов за 512, 10 за 1024 и 15 за 2048"
        >
          <span className="termcoin-mark termcoin-mark--compact" aria-hidden="true">
            <img src="/images/brand/termburg-fish-96-v2.webp" alt="" width="48" height="48" />
          </span>
          <span className="flex flex-col leading-none">
            <strong className="text-[11px] text-primary">+5 / +10 / +15</strong>
            <small className="mt-1 text-[8px]">за 512 / 1024 / 2048</small>
            <small data-slavich-daily-limit className="mt-1 text-[8px] font-bold text-white/80">
              Лимит за день: {slavichCoinsToday}/{DAILY_GAME_REWARD_LIMIT}
            </small>
          </span>
        </span>
      </div>

      <GameStatusBar
        metricLabel="Счёт игры"
        metricValue={displayScore}
        secondaryLabel="Рекорд"
        secondaryValue={state.bestScore}
        currency={progress.currency}
        className="game-2048-screen__status bg-black/40 px-4 pb-2"
        action={(
          <button
            type="button"
            onClick={() => setCoachStep('move')}
            aria-label="Показать обучение"
            aria-pressed={coachStep !== null}
            className="game-icon-button min-h-11 min-w-11 rounded-xl"
          >
            <BookOpenText size={18} className="text-primary" />
          </button>
        )}
      />

      <div className="game-2048-screen__separator gold-separator" />

      <GameCoach step={coachContent} className="game-2048-screen__coach game-coach--screen" />

      {/* Game board */}
      <div
        ref={boardAreaRef}
        className="game-2048-screen__board-area min-h-0 flex-1 flex items-center justify-center px-4 py-2"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className={`game-2048-board game-panel relative rounded-xl backdrop-blur-sm${coachStep ? ' game-tutorial-target' : ''}`}
          style={{
            width: containerSize,
            height: containerSize,
            padding: GAP,
          }}
        >
          {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => {
            const r = Math.floor(i / GRID_SIZE);
            const c = i % GRID_SIZE;
            return (
              <div
                key={i}
                className="absolute bg-white/5 rounded-lg"
                style={{
                  width: cellSize,
                  height: cellSize,
                  left: GAP + c * (cellSize + GAP),
                  top: GAP + r * (cellSize + GAP),
                }}
              />
            );
          })}

          {/* Tiles — same coordinate space as background cells */}
          {tiles.map(tile => (
            <Tile2048
              key={tile.id}
              tile={tile}
              cellSize={cellSize}
              gap={GAP}
              tutorialFocus={coachStep === 'merge' && duplicateValue !== undefined && tile.value === duplicateValue}
            />
          ))}

          {coachStep === 'move' && <CoachGesture kind="swipe" />}

          {state.isLost && (
            <motion.div
              className="absolute inset-0 bg-black/60 rounded-xl flex flex-col items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <p className="text-white font-bold text-xl mb-2">Игра окончена</p>
              <p className="text-white/50 text-sm mb-4">Очки: {displayScore}</p>
              <button
                type="button"
                onClick={handleRestart}
                className="bg-primary/20 border border-primary/30 text-primary px-6 py-2 rounded-xl font-medium text-sm"
              >
                Заново
              </button>
            </motion.div>
          )}
        </div>
      </div>

      {/* Character ability bar */}
      <CharacterAbilityBar game="game2048" />

      <Win2048Popup
        open={state.isWon}
        score={displayScore}
        earnedReward={earnedReward}
        onContinue={continueGame}
        onRestart={handleRestart}
      />

      <Modal open={showRestartConfirm}>
        <div className="text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-red-300/25 bg-red-400/10 text-red-300">
            <RotateCcw size={26} />
          </div>
          <div>
            <h2 className="font-heading text-xl font-bold text-red-200">Начать игру заново?</h2>
            <p className="mt-2 text-sm text-white/55">Поле и текущие очки будут сброшены. Для одного шага используйте кнопку отмены ↶.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setShowRestartConfirm(false)} className="flex-1">Оставить</Button>
            <Button onClick={handleRestart} className="flex-1 bg-red-400 text-[#251111] hover:bg-red-300">Сбросить</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
