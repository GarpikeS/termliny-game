import { useState, useCallback, useEffect, useRef } from 'react';
import { initGrid, spawnTile, resetTileIdCounter } from '@/engine/engine-2048/grid2048';
import type { Grid2048 } from '@/engine/engine-2048/grid2048';
import { applyMove, canMove, type Direction } from '@/engine/engine-2048/moves2048';
import { useGameContext } from '@/store/GameContext';
import { getSlavichMilestoneRewards } from '@/data/economy';
import {
  GAME_LEVEL_TOTAL,
  clampGameLevel,
  getNextPlayableLevel,
  getSlavichLevelTarget,
  isSlavichLevelComplete,
} from '@/data/gameProgression';

interface Game2048State {
  grid: Grid2048;
  level: number;
  targetScore: number;
  score: number;
  bestScore: number;
  moveCount: number;
  lastScoreGained: number;
  isWon: boolean;
  isLost: boolean;
  canUndo: boolean;
  campaignCompleted: boolean;
}

interface Game2048Snapshot {
  grid: Grid2048;
  score: number;
  moveCount: number;
  lastScoreGained: number;
  isWon: boolean;
  isLost: boolean;
}

function createRound(level: number, bestScore: number, campaignCompleted = false): Game2048State {
  const safeLevel = clampGameLevel(level);
  resetTileIdCounter();
  return {
    grid: initGrid(),
    level: safeLevel,
    targetScore: getSlavichLevelTarget(safeLevel),
    score: 0,
    bestScore,
    moveCount: 0,
    lastScoreGained: 0,
    isWon: false,
    isLost: false,
    canUndo: false,
    campaignCompleted,
  };
}

export function useGame2048(scoreMultiplier = 1) {
  const { progress, update2048Score, complete2048Level, awardGameCurrency } = useGameContext();
  const [earnedReward, setEarnedReward] = useState<number | null>(null);
  const [state, setState] = useState<Game2048State>(() => (
    createRound(
      getNextPlayableLevel(progress.game2048LevelsCompleted),
      progress.best2048Score,
      progress.game2048LevelsCompleted >= GAME_LEVEL_TOTAL,
    )
  ));

  const rewardedMilestones = useRef(new Set<number>());
  const previousMove = useRef<Game2048Snapshot | null>(null);

  const move = useCallback((direction: Direction) => {
    setState(prev => {
      if (prev.isLost || prev.isWon) return prev;

      const { grid: newGrid, scoreGained, moved } = applyMove(prev.grid, direction);
      if (!moved) return prev;

      const afterSpawn = spawnTile(newGrid);
      const newScore = prev.score + scoreGained;
      const newBest = Math.max(prev.bestScore, newScore);
      const displayedScore = Math.round(newScore * scoreMultiplier);
      const won = !prev.campaignCompleted && isSlavichLevelComplete(displayedScore, prev.level);
      const lost = !canMove(afterSpawn);

      previousMove.current = {
        grid: prev.grid,
        score: prev.score,
        moveCount: prev.moveCount,
        lastScoreGained: prev.lastScoreGained,
        isWon: prev.isWon,
        isLost: prev.isLost,
      };

      return {
        ...prev,
        grid: afterSpawn,
        score: newScore,
        bestScore: newBest,
        moveCount: prev.moveCount + 1,
        lastScoreGained: scoreGained,
        isWon: won,
        isLost: lost,
        canUndo: true,
      };
    });
  }, [scoreMultiplier]);

  // Save best score
  useEffect(() => {
    if (state.score > 0) {
      update2048Score(state.score);
    }
  }, [state.score, update2048Score]);

  useEffect(() => {
    if (state.isWon) complete2048Level(state.level);
  }, [complete2048Level, state.isWon, state.level]);

  // Rewards grow with the difficulty while the total remains equal to the
  // other games' daily limit of 30 termcoins.
  useEffect(() => {
    const maxTile = state.grid.flat().reduce((maximum, tile) => Math.max(maximum, tile?.value ?? 0), 0);
    const reached = getSlavichMilestoneRewards(maxTile, rewardedMilestones.current);
    if (reached.length === 0) return;

    for (const { tile } of reached) rewardedMilestones.current.add(tile);
    const requestedReward = reached.reduce((total, milestone) => total + milestone.reward, 0);
    const awarded = awardGameCurrency('game2048', requestedReward);
    queueMicrotask(() => setEarnedReward(awarded));
  }, [state.grid, awardGameCurrency]);

  const continueGame = useCallback(() => {
    setEarnedReward(null);
    previousMove.current = null;
    const campaignCompleted = state.campaignCompleted || state.level >= GAME_LEVEL_TOTAL;
    const nextLevel = campaignCompleted ? GAME_LEVEL_TOTAL : state.level + 1;
    if (state.isLost) {
      rewardedMilestones.current.clear();
      setState(createRound(nextLevel, state.bestScore, campaignCompleted));
      return;
    }
    setState(prev => {
      return {
        ...prev,
        level: nextLevel,
        targetScore: getSlavichLevelTarget(nextLevel),
        isWon: false,
        canUndo: false,
        campaignCompleted,
      };
    });
  }, [state.bestScore, state.campaignCompleted, state.isLost, state.level]);

  const undo = useCallback(() => {
    const snapshot = previousMove.current;
    if (!snapshot) return;
    previousMove.current = null;
    setState(prev => ({
      ...prev,
      ...snapshot,
      bestScore: prev.bestScore,
      canUndo: false,
    }));
  }, []);

  const restart = useCallback(() => {
    rewardedMilestones.current.clear();
    setEarnedReward(null);
    previousMove.current = null;
    setState(prev => createRound(prev.level, prev.bestScore, prev.campaignCompleted));
  }, []);

  // Keyboard controls
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const map: Record<string, Direction> = {
        ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      };
      const dir = map[e.key];
      if (dir) {
        e.preventDefault();
        move(dir);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [move]);

  return { state, earnedReward, move, continueGame, undo, restart };
}
