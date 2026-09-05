import type { FourGameChallengeProgress, GameRewardSource } from '../../types/game.ts';

export const FOUR_GAME_CHALLENGE_ID = 'four-games-v1' as const;

export const FOUR_GAME_CHALLENGE_SOURCES = [
  'game2048',
  'bubbles',
  'pet',
  'match3',
] as const satisfies readonly GameRewardSource[];

const FOUR_GAME_CHALLENGE_SOURCE_SET = new Set<string>(FOUR_GAME_CHALLENGE_SOURCES);

interface FourGameCompletionEvidence {
  currentLevel?: unknown;
  levels?: unknown;
  game2048LevelsCompleted?: unknown;
  bubbleLevelsCompleted?: unknown;
  pet?: unknown;
  petDeparture?: unknown;
}

function isGameRewardSource(value: unknown): value is GameRewardSource {
  return typeof value === 'string' && FOUR_GAME_CHALLENGE_SOURCE_SET.has(value);
}

export function createFourGameChallengeProgress(): FourGameChallengeProgress {
  return { version: 1, completedGames: [] };
}

export function normalizeFourGameChallengeProgress(value: unknown): FourGameChallengeProgress {
  if (!value || typeof value !== 'object') return createFourGameChallengeProgress();

  const completedGames = Array.isArray((value as { completedGames?: unknown }).completedGames)
    ? (value as { completedGames: unknown[] }).completedGames
    : [];
  const completedSet = new Set(completedGames.filter(isGameRewardSource));

  return {
    version: 1,
    completedGames: FOUR_GAME_CHALLENGE_SOURCES.filter(source => completedSet.has(source)),
  };
}

export function mergeFourGameChallengeProgress(
  ...progresses: readonly unknown[]
): FourGameChallengeProgress {
  const completedSet = new Set<GameRewardSource>();

  for (const progress of progresses) {
    for (const source of normalizeFourGameChallengeProgress(progress).completedGames) {
      completedSet.add(source);
    }
  }

  return {
    version: 1,
    completedGames: FOUR_GAME_CHALLENGE_SOURCES.filter(source => completedSet.has(source)),
  };
}

export function addFourGameCompletion(
  progress: unknown,
  source: unknown,
): FourGameChallengeProgress {
  const normalized = normalizeFourGameChallengeProgress(progress);
  if (!isGameRewardSource(source) || normalized.completedGames.includes(source)) return normalized;

  return mergeFourGameChallengeProgress(normalized, {
    version: 1,
    completedGames: [source],
  });
}

function hasCompletedMatch3Level(evidence: FourGameCompletionEvidence): boolean {
  const currentLevel = Number(evidence.currentLevel);
  if (Number.isFinite(currentLevel) && currentLevel > 1) return true;
  if (!evidence.levels || typeof evidence.levels !== 'object' || Array.isArray(evidence.levels)) return false;
  return Object.values(evidence.levels).some(level => (
    Boolean(level)
    && typeof level === 'object'
    && (level as { completed?: unknown }).completed === true
  ));
}

function hasCompletedPetLevel(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const experience = Number((value as { experience?: unknown }).experience);
  return Number.isFinite(experience) && experience >= 100;
}

export function backfillFourGameChallengeProgress(
  value: unknown,
  evidence: FourGameCompletionEvidence,
): FourGameChallengeProgress {
  let progress = normalizeFourGameChallengeProgress(value);
  const completed2048 = Number(evidence.game2048LevelsCompleted);
  const completedBubbles = Number(evidence.bubbleLevelsCompleted);

  if (Number.isFinite(completed2048) && completed2048 > 0) progress = addFourGameCompletion(progress, 'game2048');
  if (Number.isFinite(completedBubbles) && completedBubbles > 0) progress = addFourGameCompletion(progress, 'bubbles');
  if (hasCompletedMatch3Level(evidence)) progress = addFourGameCompletion(progress, 'match3');
  if (hasCompletedPetLevel(evidence.pet) || hasCompletedPetLevel(evidence.petDeparture)) {
    progress = addFourGameCompletion(progress, 'pet');
  }

  return progress;
}

export function getFourGameChallengeCount(progress: unknown): number {
  return normalizeFourGameChallengeProgress(progress).completedGames.length;
}

export function isFourGameChallengeComplete(progress: unknown): boolean {
  return getFourGameChallengeCount(progress) === FOUR_GAME_CHALLENGE_SOURCES.length;
}
