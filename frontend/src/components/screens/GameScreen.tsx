import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Bomb, Lightbulb, Shuffle } from 'lucide-react';
import { getLevelConfig } from '@/data/levels';
import { getBathhouseForLevel } from '@/data/bathhouses';
import { getTermlinById } from '@/data/termliny';
import { useGame } from '@/hooks/useGame';
import { useGameContext } from '@/store/GameContext';
import { getStars, getReward } from '@/engine/scorer';
import { GameBoard } from '@/components/game/GameBoard';
import { GameHUD } from '@/components/game/GameHUD';
import { ComboText } from '@/components/game/ComboText';
import { CharacterAbilityBar } from '@/components/game/CharacterAbilityBar';
import { Match3Coach } from '@/components/game/Match3Coach';
import type { Match3TutorialStep } from '@/components/game/Match3Coach';
import { WinPopup } from '@/popups/WinPopup';
import { LosePopup } from '@/popups/LosePopup';
import { PausePopup } from '@/popups/PausePopup';
import { LevelStartPopup } from '@/popups/LevelStartPopup';
import { useSound } from '@/hooks/useSound';
import { triggerHaptic } from '@/utils/haptics';
import { getHint } from '@/engine/hints';
import { SpecialType } from '@/types/game';
import type { Position, SpecialType as SpecialTypeValue } from '@/types/game';
import type { CSSProperties } from 'react';

const GUIDED_LEVEL_COUNT = 1;
const MATCH3_TUTORIAL_TEST_MODE = false;

interface PendingSpecialTutorial {
  id: string;
  special: SpecialTypeValue;
  cellId: number;
}

const isSamePosition = (a: Position, b: Position) => (
  a.row === b.row && a.col === b.col
);

export function GameScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    completeLevelAction,
    progress,
    markTutorialSeen,
    setTutorialCompleted,
    spendLife,
    buyLife,
    consumeInventoryItem,
  } = useGameContext();
  const levelId = Number(id) || 1;
  const config = getLevelConfig(levelId);
  const bathhouse = getBathhouseForLevel(levelId);
  const character = getTermlinById(progress.selectedCharacter);
  const match3Background = '/images/ui/game-match3-bg-v2.webp';

  const [showStart, setShowStart] = useState(true);
  const [showPause, setShowPause] = useState(false);
  const [abilityUsed, setAbilityUsed] = useState(false);
  const [abilityTargeting, setAbilityTargeting] = useState(false);
  const [boosterBombTargeting, setBoosterBombTargeting] = useState(false);
  const [hintPositions, setHintPositions] = useState<Position[]>([]);
  const [tutorialStep, setTutorialStep] = useState<Match3TutorialStep | null>(null);
  const [earnedReward, setEarnedReward] = useState<number | null>(null);
  const completedLevelRef = useRef<number | null>(null);
  const lifeSpentForLossRef = useRef<number | null>(null);
  const lastAutoHintMove = useRef(-1);
  const pendingSpecialTutorialRef = useRef<PendingSpecialTutorial | null>(null);
  const tutorialsShownThisRunRef = useRef(new Set<string>());
  const seenTutorials = useMemo(
    () => new Set(progress.tutorialFlags),
    [progress.tutorialFlags]
  );
  const tutorialRunKey = useCallback(
    (tutorialId: string) => `${levelId}:${tutorialId}`,
    [levelId]
  );
  const hasSeenTutorial = useCallback((tutorialId: string) => (
    MATCH3_TUTORIAL_TEST_MODE
      ? tutorialsShownThisRunRef.current.has(tutorialRunKey(tutorialId))
      : seenTutorials.has(tutorialId)
  ), [seenTutorials, tutorialRunKey]);
  const rememberTutorialForRun = useCallback((tutorialId: string) => {
    tutorialsShownThisRunRef.current.add(tutorialRunKey(tutorialId));
  }, [tutorialRunKey]);

  // Apply passive starting bonuses.
  const safeConfig = useMemo(() => {
    const base = config ?? getLevelConfig(1)!;
    if (progress.selectedCharacter === 'valkiriya') return { ...base, moves: base.moves + 3 };
    return base;
  }, [config, progress.selectedCharacter]);

  const game = useGame(safeConfig);
  const {
    state, animData, handleCellClick, handleSwipe, advanceAnimation, resetGame,
    destroyCell, activateBoosterBomb, shuffleBoard, addMoves,
  } = game;
  const { play, toggle: toggleSound, enabled: soundEnabled } = useSound();
  const lastSoundPhase = useRef(state.phase);

  useEffect(() => {
    if (lastSoundPhase.current === state.phase) return;
    lastSoundPhase.current = state.phase;

    if (state.phase === 'swap') {
      play('swap');
      triggerHaptic('selection');
    }
    if (state.phase === 'match') {
      play(state.combo > 0 ? 'cascade' : 'match');
      triggerHaptic(state.combo > 0 ? 'cascade' : 'match');
    }
    if (state.phase === 'powerup') {
      play('cascade');
      triggerHaptic('powerup');
    }
  }, [play, state.combo, state.phase]);

  useEffect(() => {
    if (state.isWon) {
      play('win');
      triggerHaptic('success');
    }
  }, [play, state.isWon]);

  useEffect(() => {
    if (state.isLost) triggerHaptic('warning');
  }, [state.isLost]);

  // One active Match-3 ability per level.
  const hasActiveAbility = !abilityUsed && (
    progress.selectedCharacter === 'yaromir' ||
    progress.selectedCharacter === 'kazimir' ||
    progress.selectedCharacter === 'milovan'
  );

  const clearMoveHint = useCallback(() => {
    setHintPositions([]);
  }, []);

  const finishTutorialStep = useCallback((tutorialId: string) => {
    markTutorialSeen(tutorialId);
    if (!MATCH3_TUTORIAL_TEST_MODE && tutorialId === `match3-move-level-${GUIDED_LEVEL_COUNT}`) {
      setTutorialCompleted();
    }
    setTutorialStep(current => current?.id === tutorialId ? null : current);
  }, [markTutorialSeen, setTutorialCompleted]);

  // Remember a newly created power-up until cascades finish and its final cell is known.
  useEffect(() => {
    if (
      state.phase !== 'score'
      || !animData.createdSpecial
      || !animData.specialCreation
    ) return;

    const tutorialId = `match3-special-${animData.createdSpecial}`;
    if (hasSeenTutorial(tutorialId)) return;

    const { position } = animData.specialCreation;
    const createdCell = state.grid[position.row]?.[position.col];
    if (!createdCell) return;

    pendingSpecialTutorialRef.current = {
      id: tutorialId,
      special: animData.createdSpecial,
      cellId: createdCell.id,
    };
  }, [animData.createdSpecial, animData.specialCreation, hasSeenTutorial, state.grid, state.phase]);

  // Contextual coaching appears only when the board is ready for the requested action.
  useEffect(() => {
    if (
      showStart
      || tutorialStep
      || state.phase !== 'idle'
      || state.isWon
      || state.isLost
    ) return;

    const revealTutorialStep = (step: Match3TutorialStep, delay = 120) => {
      const timer = window.setTimeout(() => {
        setTutorialStep(current => {
          if (current) return current;
          rememberTutorialForRun(step.id);
          return step;
        });
      }, delay);

      return () => window.clearTimeout(timer);
    };

    const guidedMoveId = `match3-move-level-${levelId}`;
    if (
      (MATCH3_TUTORIAL_TEST_MODE || (
        levelId <= GUIDED_LEVEL_COUNT
        && !progress.tutorialCompleted
      ))
      && !hasSeenTutorial(guidedMoveId)
    ) {
      const move = getHint(state.grid);
      if (!move) {
        rememberTutorialForRun(guidedMoveId);
        markTutorialSeen(guidedMoveId);
        return;
      }

      return revealTutorialStep({
        id: guidedMoveId,
        kind: 'swap',
        title: 'Собери три',
        message: 'Поменяй подсвеченные фишки местами — одинаковые сложатся в линию.',
        from: move.from,
        to: move.to,
      }, 420);
    }

    // The selected character is the player's primary action, so its coach has
    // priority over a power-up that the guided move may have created.
    const abilityTutorialId = character ? `match3-ability-${character.id}` : '';
    if (
      character
      && hasActiveAbility
      && abilityTutorialId
      && !hasSeenTutorial(abilityTutorialId)
    ) {
      return revealTutorialStep({
        id: abilityTutorialId,
        kind: 'ability',
        title: `Способность: ${character.ability.name}`,
        message: `Нажми на сияющий портрет сверху. ${character.ability.match3 ?? ''}`.trim(),
      });
    }

    const pendingSpecial = pendingSpecialTutorialRef.current;
    if (pendingSpecial && !hasSeenTutorial(pendingSpecial.id)) {
      let target: Position | undefined;
      for (let row = 0; row < state.grid.length; row++) {
        const col = state.grid[row].findIndex(cell => cell?.id === pendingSpecial.cellId);
        if (col >= 0) {
          target = { row, col };
          break;
        }
      }

      if (target) {
        const isHelicopter = pendingSpecial.special === SpecialType.Helicopter;
        const step: Match3TutorialStep = {
          id: pendingSpecial.id,
          kind: 'special',
          special: pendingSpecial.special,
          target,
          title: isHelicopter ? 'Вертолётик готов' : 'Пороховая бочка готова',
          message: isHelicopter
            ? 'Нажми на него: он очистит соседей и долетит до нужной цели.'
            : 'Нажми на неё: взрыв очистит большую область вокруг.',
        };
        pendingSpecialTutorialRef.current = null;
        return revealTutorialStep(step);
      }
      pendingSpecialTutorialRef.current = null;
    }

  }, [
    character,
    hasActiveAbility,
    hasSeenTutorial,
    levelId,
    markTutorialSeen,
    progress.tutorialCompleted,
    rememberTutorialForRun,
    showStart,
    state.grid,
    state.isLost,
    state.isWon,
    state.phase,
    tutorialStep,
  ]);

  const handleAbility = useCallback(() => {
    if (tutorialStep && tutorialStep.kind !== 'ability') return;
    if (abilityUsed || state.phase !== 'idle' || state.isWon || state.isLost) return;
    if (tutorialStep?.kind === 'ability') finishTutorialStep(tutorialStep.id);
    if (progress.selectedCharacter === 'milovan') {
      setAbilityTargeting(true);
      return;
    }

    if (progress.selectedCharacter === 'yaromir') addMoves(2);
    const hint = getHint(state.grid);
    setHintPositions(hint ? [hint.from, hint.to] : []);
    setAbilityUsed(true);
  }, [abilityUsed, addMoves, finishTutorialStep, progress.selectedCharacter, state.grid, state.isLost, state.isWon, state.phase, tutorialStep]);

  const handleGameCellClick = useCallback((position: Position) => {
    if (tutorialStep?.kind === 'ability') return;

    if (tutorialStep?.kind === 'special') {
      if (!isSamePosition(position, tutorialStep.target)) return;
      finishTutorialStep(tutorialStep.id);
    }

    if (tutorialStep?.kind === 'swap') {
      const isTutorialCell = isSamePosition(position, tutorialStep.from)
        || isSamePosition(position, tutorialStep.to);
      if (!isTutorialCell) return;

      const selected = state.selectedCell;
      if (
        selected
        && !isSamePosition(selected, position)
        && (
          (isSamePosition(selected, tutorialStep.from) && isSamePosition(position, tutorialStep.to))
          || (isSamePosition(selected, tutorialStep.to) && isSamePosition(position, tutorialStep.from))
        )
      ) {
        finishTutorialStep(tutorialStep.id);
      }
    }

    play('tap');
    clearMoveHint();
    if (boosterBombTargeting) {
      activateBoosterBomb(position);
      consumeInventoryItem('booster-bomb');
      setBoosterBombTargeting(false);
      triggerHaptic('powerup');
      return;
    }
    if (abilityTargeting) {
      destroyCell(position);
      setAbilityTargeting(false);
      setAbilityUsed(true);
      return;
    }
    handleCellClick(position);
  }, [
    abilityTargeting,
    activateBoosterBomb,
    boosterBombTargeting,
    clearMoveHint,
    consumeInventoryItem,
    destroyCell,
    finishTutorialStep,
    handleCellClick,
    play,
    state.selectedCell,
    tutorialStep,
  ]);

  const handleGameSwipe = useCallback((position: Position, dx: number, dy: number) => {
    if (abilityTargeting || boosterBombTargeting) return;

    if (tutorialStep?.kind === 'ability' || tutorialStep?.kind === 'special') return;
    if (tutorialStep?.kind === 'swap') {
      const destination = { row: position.row + dy, col: position.col + dx };
      const followsCue = (
        isSamePosition(position, tutorialStep.from)
        && isSamePosition(destination, tutorialStep.to)
      ) || (
        isSamePosition(position, tutorialStep.to)
        && isSamePosition(destination, tutorialStep.from)
      );
      if (!followsCue) return;
      finishTutorialStep(tutorialStep.id);
    }

    play('tap');
    clearMoveHint();
    handleSwipe(position, dx, dy);
  }, [abilityTargeting, boosterBombTargeting, clearMoveHint, finishTutorialStep, handleSwipe, play, tutorialStep]);

  const useHintBooster = useCallback(() => {
    if (state.phase !== 'idle' || tutorialStep || boosterBombTargeting) return;
    const hint = getHint(state.grid);
    if (!hint) return;
    setHintPositions([hint.from, hint.to]);
    consumeInventoryItem('booster-hint');
    triggerHaptic('selection');
  }, [boosterBombTargeting, consumeInventoryItem, state.grid, state.phase, tutorialStep]);

  const useShuffleBooster = useCallback(() => {
    if (state.phase !== 'idle' || tutorialStep || boosterBombTargeting) return;
    shuffleBoard();
    clearMoveHint();
    consumeInventoryItem('booster-shuffle');
    triggerHaptic('selection');
  }, [boosterBombTargeting, clearMoveHint, consumeInventoryItem, shuffleBoard, state.phase, tutorialStep]);

  const useBombBooster = useCallback(() => {
    if (state.phase !== 'idle' || tutorialStep) return;
    setAbilityTargeting(false);
    setBoosterBombTargeting(current => !current);
    clearMoveHint();
    triggerHaptic('selection');
  }, [clearMoveHint, state.phase, tutorialStep]);

  // Vedagor automatically reveals a valid move every ten completed moves.
  useEffect(() => {
    if (tutorialStep || progress.selectedCharacter !== 'vedagor' || state.phase !== 'idle') return;
    const movesMade = safeConfig.moves - state.movesLeft;
    if (movesMade <= 0 || movesMade % 10 !== 0 || lastAutoHintMove.current === movesMade) return;

    lastAutoHintMove.current = movesMade;
    const hint = getHint(state.grid);
    setHintPositions(hint ? [hint.from, hint.to] : []);
  }, [progress.selectedCharacter, safeConfig.moves, state.grid, state.movesLeft, state.phase, tutorialStep]);

  useEffect(() => {
    if (state.isWon && completedLevelRef.current !== levelId) {
      completedLevelRef.current = levelId;
      let score = state.score;
      // pereslav: +25% combo score bonus
      if (progress.selectedCharacter === 'pereslav') {
        score = Math.round(score * 1.25);
      }
      const stars = getStars(score, state.levelConfig.starThresholds);
      const reward = getReward(stars, state.levelConfig.reward);
      const awarded = completeLevelAction(levelId, stars, score, reward);
      queueMicrotask(() => setEarnedReward(awarded));
    }
  }, [state.isWon, state.score, state.levelConfig, levelId, completeLevelAction, progress.selectedCharacter]);

  useEffect(() => {
    if (state.isLost && lifeSpentForLossRef.current !== levelId) {
      lifeSpentForLossRef.current = levelId;
      spendLife();
    }
  }, [levelId, spendLife, state.isLost]);

  const handleRestart = useCallback(() => {
    setShowPause(false);
    completedLevelRef.current = null;
    setEarnedReward(null);
    lifeSpentForLossRef.current = null;
    setAbilityUsed(false);
    setAbilityTargeting(false);
    setBoosterBombTargeting(false);
    setTutorialStep(null);
    pendingSpecialTutorialRef.current = null;
    clearMoveHint();
    lastAutoHintMove.current = -1;
    resetGame(safeConfig);
  }, [clearMoveHint, safeConfig, resetGame]);

  const handleNext = useCallback(() => {
    const nextConfig = getLevelConfig(levelId + 1);
    if (nextConfig) {
      navigate(`/games/match3/play/${levelId + 1}`);
      completedLevelRef.current = null;
      setEarnedReward(null);
      lifeSpentForLossRef.current = null;
      setAbilityUsed(false);
      setAbilityTargeting(false);
      setBoosterBombTargeting(false);
      setTutorialStep(null);
      pendingSpecialTutorialRef.current = null;
      clearMoveHint();
      lastAutoHintMove.current = -1;
      setShowStart(true);
      resetGame(nextConfig);
    }
  }, [clearMoveHint, levelId, navigate, resetGame]);

  const handleStartPlay = useCallback(() => {
    if (progress.lives <= 0) return;
    setShowStart(false);
    lifeSpentForLossRef.current = null;
    setAbilityTargeting(false);
    setBoosterBombTargeting(false);
    setTutorialStep(null);
    pendingSpecialTutorialRef.current = null;
    clearMoveHint();
    lastAutoHintMove.current = -1;
    resetGame(safeConfig);
  }, [clearMoveHint, progress.lives, safeConfig, resetGame]);

  if (!config) {
    return (
      <div className="h-full flex items-center justify-center bg-dark-surface">
        <p className="text-white/50">Уровень не найден</p>
      </div>
    );
  }

  const isBoardTutorialVisible = tutorialStep !== null && tutorialStep.kind !== 'ability';

  return (
    <div
      className="match3-screen immersive-background game-polished h-full flex flex-col bg-dark-surface"
      style={{ '--game-background': `url(${match3Background})` } as CSSProperties}
    >
      <GameHUD
        levelName={config.name}
        score={state.score}
        movesLeft={state.movesLeft}
        currency={progress.currency}
        objectives={state.objectives}
        onPause={() => setShowPause(true)}
        character={character}
        abilityReady={hasActiveAbility}
        onAbility={handleAbility}
        highlightAbility={tutorialStep?.kind === 'ability'}
        abilityTutorial={tutorialStep?.kind === 'ability' ? tutorialStep : null}
      />

      {tutorialStep && tutorialStep.kind !== 'ability' && (
        <div className="match3-coach-slot">
          <Match3Coach
            step={tutorialStep}
            characterImage={character?.image}
          />
        </div>
      )}

      <div className="match3-board-area flex-1 min-h-0 flex items-center justify-center relative px-1">
        <GameBoard
          grid={state.grid}
          rows={state.levelConfig.rows}
          cols={state.levelConfig.cols}
          phase={state.phase}
          animData={animData}
          selectedCell={state.selectedCell}
          hintPositions={hintPositions}
          tutorialStep={tutorialStep}
          onCellClick={handleGameCellClick}
          onSwipe={handleGameSwipe}
          onAnimationComplete={advanceAnimation}
        />
        <ComboText
          combo={state.combo}
          score={animData.scoreGained ?? 0}
          phase={state.phase}
          matchSize={animData.matchSize}
          matchedCount={animData.matchedCount}
          sizeBonus={animData.sizeBonus}
          isIntersection={animData.isIntersection}
          createdSpecial={animData.createdSpecial}
          activatedSpecial={animData.activatedSpecial}
        />
        {abilityTargeting && (
          <div
            className="absolute top-1 left-1/2 -translate-x-1/2 z-20 rounded-full bg-black/80 border border-primary/40 px-4 py-2 text-sm font-bold text-primary"
            role="status"
          >
            Выберите фишку для удара
          </div>
        )}
        {boosterBombTargeting && (
          <div className="absolute top-1 left-1/2 -translate-x-1/2 z-20 rounded-full bg-black/85 border border-orange-300/50 px-4 py-2 text-sm font-bold text-orange-200" role="status">
            Выберите центр взрыва 3×3
          </div>
        )}
      </div>

      {!isBoardTutorialVisible && (
        <div className="match3-booster-bar" aria-label="Бустеры игры Хоровод">
          <button type="button" onClick={useHintBooster} disabled={(progress.inventory['booster-hint'] ?? 0) < 1 || state.phase !== 'idle'} aria-label={`Подсказка. Осталось: ${progress.inventory['booster-hint'] ?? 0}`}>
            <Lightbulb size={18} /><span>Подсказка</span><strong>{progress.inventory['booster-hint'] ?? 0}</strong>
          </button>
          <button type="button" onClick={useShuffleBooster} disabled={(progress.inventory['booster-shuffle'] ?? 0) < 1 || state.phase !== 'idle'} aria-label={`Перемешать. Осталось: ${progress.inventory['booster-shuffle'] ?? 0}`}>
            <Shuffle size={18} /><span>Перемешать</span><strong>{progress.inventory['booster-shuffle'] ?? 0}</strong>
          </button>
          <button type="button" onClick={useBombBooster} disabled={(progress.inventory['booster-bomb'] ?? 0) < 1 || state.phase !== 'idle'} aria-pressed={boosterBombTargeting} aria-label={`Взрыв 3 на 3. Осталось: ${progress.inventory['booster-bomb'] ?? 0}`}>
            <Bomb size={18} /><span>Взрыв 3×3</span><strong>{progress.inventory['booster-bomb'] ?? 0}</strong>
          </button>
        </div>
      )}

      {/* Character ability bar */}
      {!isBoardTutorialVisible && <CharacterAbilityBar game="match3" />}

      <LevelStartPopup
        open={showStart}
        config={safeConfig}
        lives={progress.lives}
        currency={progress.currency}
        nextLifeAt={progress.nextLifeAt}
        onStart={handleStartPlay}
        onBuyLife={buyLife}
        onBack={() => navigate(bathhouse ? `/games/match3/levels/${bathhouse.id}` : '/games/match3')}
      />

      <WinPopup
        open={state.isWon}
        score={state.score}
        levelConfig={state.levelConfig}
        earnedReward={earnedReward}
        onNext={handleNext}
        onMap={() => navigate(bathhouse ? `/games/match3/levels/${bathhouse.id}` : '/games/match3')}
      />

      <LosePopup
        open={state.isLost}
        lives={progress.lives}
        currency={progress.currency}
        nextLifeAt={progress.nextLifeAt}
        onRetry={handleRestart}
        onBuyLife={buyLife}
        onMap={() => navigate(bathhouse ? `/games/match3/levels/${bathhouse.id}` : '/games/match3')}
      />

      <PausePopup
        open={showPause}
        onResume={() => setShowPause(false)}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
        onRestart={handleRestart}
        onQuit={() => navigate(bathhouse ? `/games/match3/levels/${bathhouse.id}` : '/games/match3')}
      />
    </div>
  );
}
