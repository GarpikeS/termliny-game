import type { FourGameChallengeProgress, GameRewardSource } from '../../types/game.ts';

export const FOUR_GAME_CHALLENGE_ID = 'four-games-v1' as const;

export const FOUR_GAME_CHALLENGE_SOURCES = [
  'game2048',
  'bubbles',
  'pet',
  'match3',
] as const satisfies readonly GameRewardSource[];

const FOUR_GAME_CHALLENGE_SOURCE_SET = new Set<string>(FOUR_GAME_CHALLENGE_SOURCES);

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

export function getFourGameChallengeCount(progress: unknown): number {
  return normalizeFourGameChallengeProgress(progress).completedGames.length;
}

export function isFourGameChallengeComplete(progress: unknown): boolean {
  return getFourGameChallengeCount(progress) === FOUR_GAME_CHALLENGE_SOURCES.length;
}
