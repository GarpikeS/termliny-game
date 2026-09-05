import type { PlayerProgress } from '@/types/game';
import { MAX_LIVES, syncLifeProgress } from './lives';
import { normalizePetState } from '@/engine/engine-pet/petEngine';
import { createDailyGameRewards, normalizeDailyGameRewards } from '@/data/economy';
import {
  FOUR_GAME_CHALLENGE_ID,
  createFourGameChallengeProgress,
  normalizeFourGameChallengeProgress,
} from '@/features/rewards/fourGameChallenge';

const STORAGE_KEY = 'termliny-progress';
const STORAGE_OWNER_KEY = 'termliny-progress-owner';
export const GUEST_PROGRESS_OWNER = 'guest';
export const UNKNOWN_ACCOUNT_PROGRESS_OWNER = 'account:unknown';

function normalizeProgressOwner(value: string | null): string | null {
  if (value === GUEST_PROGRESS_OWNER) return value;
  if (value?.startsWith('account:') && value.length <= 120) return value;
  return null;
}

export function accountProgressOwner(accountId: string): string {
  return `account:${accountId}`;
}

const DEFAULT_PROGRESS: PlayerProgress = {
  currentLevel: 1,
  levels: {},
  currency: 0,
  dailyGameRewards: createDailyGameRewards(),
  fourGameChallenge: createFourGameChallengeProgress(),
  lives: MAX_LIVES,
  nextLifeAt: null,
  selectedCharacter: 'yaromir',
  tutorialCompleted: false,
  tutorialFlags: [],
  best2048Score: 0,
  bubbleLevelsCompleted: 0,
  pet: null,
  petDeparture: null,
  unlockedCharacters: ['yaromir'],
  inventory: {},
  rewardClaims: [],
  cart: [],
  orders: [],
};

export function createDefaultProgress(): PlayerProgress {
  return {
    ...DEFAULT_PROGRESS,
    levels: {},
    dailyGameRewards: createDailyGameRewards(),
    fourGameChallenge: createFourGameChallengeProgress(),
    tutorialFlags: [],
    unlockedCharacters: ['yaromir'],
    inventory: {},
    rewardClaims: [],
    cart: [],
    orders: [],
  };
}

export function loadProgress(): PlayerProgress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultProgress();
    const storedValue = JSON.parse(raw) as Record<string, unknown> | null;
    const storedClaims: unknown[] = Array.isArray(storedValue?.rewardClaims) ? storedValue.rewardClaims : [];
    const hadAccountCampaignClaim = storedClaims.some(claim => (
      Boolean(claim)
      && typeof claim === 'object'
      && (claim as { campaignId?: unknown }).campaignId === FOUR_GAME_CHALLENGE_ID
    ));
    const owner = normalizeProgressOwner(localStorage.getItem(STORAGE_OWNER_KEY))
      ?? (hadAccountCampaignClaim ? UNKNOWN_ACCOUNT_PROGRESS_OWNER : GUEST_PROGRESS_OWNER);
    const parsed = { ...DEFAULT_PROGRESS, ...storedValue } as PlayerProgress;
    if (!Array.isArray(parsed.tutorialFlags)) {
      parsed.tutorialFlags = [];
    }
    // Reward codes are restored from the server and never kept in shared browser storage.
    parsed.rewardClaims = [];
    if (
      !parsed.petDeparture
      || typeof parsed.petDeparture.name !== 'string'
      || typeof parsed.petDeparture.characterId !== 'string'
      || !['hunger', 'happiness', 'energy', 'cleanliness'].includes(parsed.petDeparture.depletedStat)
    ) {
      parsed.petDeparture = null;
    }
    if (parsed.pet) parsed.pet = normalizePetState(parsed.pet);
    parsed.dailyGameRewards = normalizeDailyGameRewards(parsed.dailyGameRewards);
    parsed.fourGameChallenge = normalizeFourGameChallengeProgress(parsed.fourGameChallenge);
    const normalized = syncLifeProgress(parsed);
    saveProgress(normalized, owner);
    return normalized;
  } catch {
    return createDefaultProgress();
  }
}

export function loadProgressOwner(): string {
  try {
    return normalizeProgressOwner(localStorage.getItem(STORAGE_OWNER_KEY)) ?? GUEST_PROGRESS_OWNER;
  } catch {
    return UNKNOWN_ACCOUNT_PROGRESS_OWNER;
  }
}

export function saveProgress(progress: PlayerProgress, owner = GUEST_PROGRESS_OWNER): void {
  try {
    const safeOwner = normalizeProgressOwner(owner) ?? GUEST_PROGRESS_OWNER;
    const persisted = {
      ...progress,
      // Reward codes are server-owned secrets and are restored after the viewer is identified.
      rewardClaims: [],
    };
    localStorage.setItem(STORAGE_OWNER_KEY, safeOwner);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // localStorage full or unavailable
  }
}

export function resetProgress(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_OWNER_KEY);
  } catch {
    // localStorage unavailable
  }
}
