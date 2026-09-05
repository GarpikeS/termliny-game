import { useState, useCallback, useRef, useEffect } from 'react';
import type { Bubble, BubbleColor } from '@/engine/engine-bubbles/bubbleTypes';
import { ALL_BUBBLE_COLORS } from '@/engine/engine-bubbles/bubbleTypes';
import { BUBBLE_RADIUS, findAttachmentCell, GRID_ROWS, hexToPixel } from '@/engine/engine-bubbles/hexGrid';
import { BUBBLE_FLIGHT_SPEED, BUBBLE_TRAJECTORY_STEP, calculateTrajectory, getShooterBottomGutter } from '@/engine/engine-bubbles/bubblePhysics';
import { checkCollision, isLevelCleared } from '@/engine/engine-bubbles/bubbleMatching';
import { resolveBubblePlacement, type BubbleRemoval } from '@/engine/engine-bubbles/bubbleResolution';
import {
  generateBubbles,
  getActiveBubbleColors,
  getBubbleLevel,
  getBubbleShotBonus,
  getShooterColors,
  nextBubbleId,
  type BubbleLevel,
} from '@/engine/engine-bubbles/bubbleLevels';
import { useGameContext } from '@/store/GameContext';
import { getNextPlayableLevel } from '@/data/gameProgression';

interface BubbleGameState {
  bubbles: Bubble[];
  shooterColor: BubbleColor;
  nextColor: BubbleColor;
  score: number;
  level: number;
  levelName: string;
  isWon: boolean;
  isLost: boolean;
  shotsLeft: number;
}

export type BubbleBurst = BubbleRemoval;

export interface BubbleTrailPoint {
  id: number;
  x: number;
  y: number;
  color: BubbleColor;
}

function randomColor(colors: BubbleColor[]): BubbleColor {
  return colors[Math.floor(Math.random() * colors.length)];
}

function createLevelState(level: BubbleLevel, fieldWidth: number, shotBonus: number): BubbleGameState {
  const bubbles = generateBubbles(level, fieldWidth);
  const shooterColors = getShooterColors(bubbles, level.colors);
  return {
    bubbles,
    shooterColor: randomColor(shooterColors),
    nextColor: randomColor(shooterColors),
    score: 0,
    level: level.id,
    levelName: level.name,
    isWon: false,
    isLost: false,
    shotsLeft: level.shots + shotBonus,
  };
}

export function useBubbles(fieldWidth: number) {
  const {
    progress,
    completeBubbleLevel,
    awardGameCurrency,
    recordFourGameCompletion,
    spendLife,
  } = useGameContext();
  const shotBonus = getBubbleShotBonus(progress.selectedCharacter);

  const [state, setState] = useState<BubbleGameState>(() => {
    const level = getBubbleLevel(getNextPlayableLevel(progress.bubbleLevelsCompleted)) ?? getBubbleLevel(1)!;
    return createLevelState(level, fieldWidth, shotBonus);
  });

  const [aimAngle, setAimAngle] = useState(0);
  const [earnedReward, setEarnedReward] = useState<number | null>(null);
  const [flying, setFlying] = useState<{ x: number; y: number; color: BubbleColor } | null>(null);
  const [flightTrail, setFlightTrail] = useState<BubbleTrailPoint[]>([]);
  const [bursts, setBursts] = useState<BubbleBurst[]>([]);
  const animRef = useRef<number>(0);
  const trailPointIdRef = useRef(0);
  const trailClearRef = useRef<number>(0);
  const burstClearRef = useRef<number>(0);
  const burstQueueRef = useRef<BubbleBurst[]>([]);
  const roundRef = useRef(0);
  const flightActiveRef = useRef(false);
  const lifeSpentForLoss = useRef(false);
  const trajectoryRef = useRef<{ x: number; y: number }[]>([]);
  const trajectoryIdx = useRef(0);

  const currentLevel = getBubbleLevel(state.level);

  const resizeField = useCallback((nextFieldWidth: number) => {
    roundRef.current += 1;
    trajectoryRef.current = [];
    window.cancelAnimationFrame(animRef.current);
    window.clearTimeout(trailClearRef.current);
    window.clearTimeout(burstClearRef.current);
    flightActiveRef.current = false;
    setFlying(null);
    setFlightTrail([]);
    setBursts([]);
    setState(prev => ({
      ...prev,
      bubbles: prev.bubbles.map(bubble => ({
        ...bubble,
        ...hexToPixel(bubble.row, bubble.col, nextFieldWidth),
      })),
    }));
  }, []);

  const shoot = useCallback((angle: number) => {
    if (flightActiveRef.current || flying || state.isWon || state.isLost) return;

    const startX = fieldWidth / 2;
    const fieldHeight = fieldWidth * 1.4;
    const startY = fieldHeight - getShooterBottomGutter(window.innerHeight);

    const traj = calculateTrajectory(startX, startY, angle, fieldWidth, fieldHeight);
    trajectoryRef.current = traj;
    trajectoryIdx.current = 0;
    window.clearTimeout(trailClearRef.current);
    setFlightTrail([]);

    flightActiveRef.current = true;
    setFlying({ x: startX, y: startY, color: state.shooterColor });

    setState(prev => ({
      ...prev,
      shooterColor: prev.nextColor,
      nextColor: randomColor(getShooterColors(prev.bubbles, currentLevel?.colors ?? ALL_BUBBLE_COLORS)),
      shotsLeft: prev.shotsLeft - 1,
    }));
  }, [flying, state.isWon, state.isLost, state.shooterColor, fieldWidth, currentLevel]);

  const placeBubble = useCallback((row: number, col: number, x: number, y: number, color: BubbleColor) => {
    setState(prev => {
      const occupied = prev.bubbles.find(b => b.row === row && b.col === col);
      if (occupied) return prev;

      const newBubble: Bubble = { id: nextBubbleId(), color, row, col, x, y };
      const resolution = resolveBubblePlacement(prev.bubbles, newBubble);
      let newBubbles = resolution.bubbles;
      const scoreGained = resolution.scoreGained;
      burstQueueRef.current = resolution.removals;

      const won = isLevelCleared(newBubbles);
      if (won) newBubbles = [];
      const lost = !won && prev.shotsLeft <= 0;
      const bottomReached = newBubbles.some(b => b.row >= GRID_ROWS - 1);
      const activeColors = getActiveBubbleColors(newBubbles, currentLevel?.colors ?? ALL_BUBBLE_COLORS);
      const shooterColors = getShooterColors(newBubbles, activeColors);

      return {
        ...prev,
        bubbles: newBubbles,
        shooterColor: shooterColors.includes(prev.shooterColor) ? prev.shooterColor : randomColor(shooterColors),
        nextColor: shooterColors.includes(prev.nextColor) ? prev.nextColor : randomColor(shooterColors),
        score: prev.score + scoreGained,
        isWon: won,
        isLost: lost || bottomReached,
      };
    });
  }, [currentLevel]);

  // Animate flying bubble
  const flyingColor = flying?.color;
  useEffect(() => {
    if (!flyingColor) return;
    const round = roundRef.current;
    const startedAt = window.performance.now();

    const finishFlight = (point: { x: number; y: number }, hit?: Bubble | null) => {
      if (round !== roundRef.current) return;
      const attachment = findAttachmentCell(point.x, point.y, fieldWidth, state.bubbles, hit ?? undefined);
      if (attachment) placeBubble(attachment.row, attachment.col, attachment.x, attachment.y, flyingColor);
      flightActiveRef.current = false;
      setFlying(null);
      trailClearRef.current = window.setTimeout(() => setFlightTrail([]), 140);
    };

    const animate = (timestamp: number) => {
      if (round !== roundRef.current) return;
      const traj = trajectoryRef.current;
      const distanceTravelled = Math.max(0, (timestamp - startedAt) * BUBBLE_FLIGHT_SPEED / 1000);
      const targetIdx = Math.min(traj.length - 1, Math.floor(distanceTravelled / BUBBLE_TRAJECTORY_STEP));

      while (trajectoryIdx.current <= targetIdx) {
        const idx = trajectoryIdx.current;
        const point = traj[idx];
        trajectoryIdx.current = idx + 1;

        // Check every simulation point even after a dropped frame so the
        // slower animation cannot pass through a bubble.
        const hit = checkCollision(state.bubbles, point.x, point.y, BUBBLE_RADIUS);
        if (hit || point.y <= BUBBLE_RADIUS) {
          finishFlight(point, hit);
          return;
        }
      }

      if (targetIdx >= traj.length - 1) {
        finishFlight(traj.at(-1) ?? { x: fieldWidth / 2, y: BUBBLE_RADIUS });
        return;
      }

      const visiblePoint = traj[Math.max(0, targetIdx)];
      setFlying(prev => prev ? { ...prev, x: visiblePoint.x, y: visiblePoint.y } : null);
      setFlightTrail(previous => [
        ...previous,
        { id: ++trailPointIdRef.current, ...visiblePoint, color: flyingColor },
      ].slice(-8));
      animRef.current = window.requestAnimationFrame(animate);
    };

    animRef.current = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(animRef.current);
  }, [fieldWidth, flyingColor, placeBubble, state.bubbles]);

  useEffect(() => {
    if (burstQueueRef.current.length === 0) return;
    window.clearTimeout(burstClearRef.current);
    setBursts(burstQueueRef.current);
    burstQueueRef.current = [];
    burstClearRef.current = window.setTimeout(() => setBursts([]), 620);
  }, [state.score]);

  useEffect(() => () => {
    window.cancelAnimationFrame(animRef.current);
    window.clearTimeout(trailClearRef.current);
    window.clearTimeout(burstClearRef.current);
  }, []);

  // Handle win
  useEffect(() => {
    if (state.isWon && currentLevel) {
      completeBubbleLevel(state.level);
      recordFourGameCompletion('bubbles');
      const awarded = awardGameCurrency('bubbles', currentLevel.reward);
      queueMicrotask(() => setEarnedReward(awarded));
    }
  }, [state.isWon]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!state.isLost || lifeSpentForLoss.current) return;
    lifeSpentForLoss.current = true;
    spendLife();
  }, [spendLife, state.isLost]);

  const nextLevel = useCallback(() => {
    const next = getBubbleLevel(state.level + 1);
    if (!next) return;
    roundRef.current += 1;
    flightActiveRef.current = false;
    lifeSpentForLoss.current = false;
    setFlying(null);
    setFlightTrail([]);
    setBursts([]);
    burstQueueRef.current = [];
    trajectoryRef.current = [];
    setEarnedReward(null);
    setState(createLevelState(next, fieldWidth, shotBonus));
  }, [state.level, fieldWidth, shotBonus]);

  const restart = useCallback(() => {
    const level = getBubbleLevel(state.level) ?? getBubbleLevel(1)!;
    roundRef.current += 1;
    flightActiveRef.current = false;
    lifeSpentForLoss.current = false;
    setFlying(null);
    setFlightTrail([]);
    setBursts([]);
    burstQueueRef.current = [];
    trajectoryRef.current = [];
    setEarnedReward(null);
    setState(createLevelState(level, fieldWidth, shotBonus));
  }, [state.level, fieldWidth, shotBonus]);

  return { state, earnedReward, aimAngle, setAimAngle, shoot, flying, flightTrail, bursts, nextLevel, restart, resizeField };
}
