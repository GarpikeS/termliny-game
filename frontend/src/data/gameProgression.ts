export const GAME_LEVEL_TOTAL = 50;

export const SLAVICH_LEVEL_BASE_SCORE = 64;
export const SLAVICH_LEVEL_SCORE_STEP = 64;

export function clampGameLevel(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(GAME_LEVEL_TOTAL, Math.floor(value)));
}

export function getNextPlayableLevel(completedLevels: number): number {
  if (!Number.isFinite(completedLevels)) return 1;
  return clampGameLevel(Math.floor(completedLevels) + 1);
}

export function getSlavichLevelTarget(level: number): number {
  const safeLevel = clampGameLevel(level);
  return SLAVICH_LEVEL_BASE_SCORE + (safeLevel - 1) * SLAVICH_LEVEL_SCORE_STEP;
}

export function isSlavichLevelComplete(score: number, level: number): boolean {
  const safeScore = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
  return safeScore >= getSlavichLevelTarget(level);
}
