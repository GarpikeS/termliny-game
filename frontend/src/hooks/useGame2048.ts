import { useState, useCallback, useEffect, useRef } from 'react';
import { initGrid, spawnTile, resetTileIdCounter } from '@/engine/engine-2048/grid2048';
import type { Grid2048 } from '@/engine/engine-2048/grid2048';
import { applyMove, canMove, hasWon, type Direction } from '@/engine/engine-2048/moves2048';
import { useGameContext } from '@/store/GameContext';
import { getSlavichMilestoneRewards } from '@/data/economy';

interface Game2048State {
  grid: Grid2048;
  score: number;
  bestScore: number;
  moveCount: number;
  lastScoreGained: number;
  isWon: boolean;
  isLost: boolean;
  continueMode: boolean;
  canUndo: boolean;
}

interface Game2048Snapshot {
  grid: Grid2048;
  score: number;
  moveCount: number;
  lastScoreGained: number;
  isWon: boolean;
  isLost: boolean;
  continueMode: boolean;
}

export function useGame2048() {
  const { progress, update2048Score, awardGameCurrency, recordFourGameCompletion } = useGameContext();
  const [earnedReward, setEarnedReward] = useState<number | null>(null);
  const [state, setState] = useState<Game2048State>(() => {
    resetTileIdCounter();
    return {
      grid: initGrid(),
      score: 0,
      bestScore: progress.best2048Score,
      moveCount: 0,
      lastScoreGained: 0,
      isWon: false,
      isLost: false,
      continueMode: false,
      canUndo: false,
    };
  });

  const rewardedMilestones = useRef(new Set<number>());
  const previousMove = useRef<Game2048Snapshot | null>(null);

  const move = useCallback((direction: Direction) => {
    setState(prev => {
      if (prev.isLost || (prev.isWon && !prev.continueMode)) return prev;

      const { grid: newGrid, scoreGained, moved } = applyMove(prev.grid, direction);
      if (!moved) return prev;

      const afterSpawn = spawnTile(newGrid);
      const newScore = prev.score + scoreGained;
      const newBest = Math.max(prev.bestScore, newScore);
      const won = !prev.continueMode && hasWon(afterSpawn);
      const lost = !canMove(afterSpawn);

      previousMove.current = {
        grid: prev.grid,
        score: prev.score,
        moveCount: prev.moveCount,
        lastScoreGained: prev.lastScoreGained,
        isWon: prev.isWon,
        isLost: prev.isLost,
        continueMode: prev.continueMode,
      };

      return {
        grid: afterSpawn,
        score: newScore,
        bestScore: newBest,
        moveCount: prev.moveCount + 1,
        lastScoreGained: scoreGained,
        isWon: won,
        isLost: lost,
        continueMode: prev.continueMode,
        canUndo: true,
      };
    });
  }, []);

  // Save best score
  useEffect(() => {
    if (state.score > 0) {
      update2048Score(state.score);
    }
  }, [state.score, update2048Score]);

  useEffect(() => {
    if (state.isWon) recordFourGameCompletion('game2048');
  }, [recordFourGameCompletion, state.isWon]);

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
    setState(prev => ({ ...prev, isWon: false, continueMode: true }));
  }, []);

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
    resetTileIdCounter();
    rewardedMilestones.current.clear();
    setEarnedReward(null);
    previousMove.current = null;
    setState(prev => ({
      grid: initGrid(),
      score: 0,
      bestScore: prev.bestScore,
      moveCount: 0,
      lastScoreGained: 0,
      isWon: false,
      isLost: false,
      continueMode: false,
      canUndo: false,
    }));
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
