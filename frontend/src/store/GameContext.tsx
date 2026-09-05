import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import type { PlayerProgress, LevelProgress, PetDeparture, PetState, Order, RewardClaim, GameRewardSource } from '@/types/game';
import {
  GUEST_PROGRESS_OWNER,
  accountProgressOwner,
  createDefaultProgress,
  loadProgress,
  loadProgressOwner,
  resetProgress,
  saveProgress,
} from './storage';
import { buyLifeProgress, spendLifeProgress, syncLifeProgress } from './lives';
import { awardDailyGameReward } from '@/data/economy';
import { syncTermlinUnlocks } from '@/data/termliny';
import { useAuth } from '@/features/account/AuthContext';
import {
  addFourGameCompletion,
  getFourGameChallengeCount,
  mergeFourGameChallengeProgress,
  normalizeFourGameChallengeProgress,
} from '@/features/rewards/fourGameChallenge';
import { GAME_LEVEL_TOTAL } from '@/data/gameProgression';
import { normalizePetState } from '@/engine/engine-pet/petEngine';

interface GameContextValue {
  progress: PlayerProgress;
  completeLevelAction: (levelId: number, stars: number, score: number, reward: number) => number;
  awardGameCurrency: (source: GameRewardSource, amount: number) => number;
  recordFourGameCompletion: (source: GameRewardSource) => void;
  spendLife: () => void;
  buyLife: () => void;
  buyWithCoins: (productId: string, price: number) => void;
  consumeInventoryItem: (productId: string) => void;
  completeRewardClaim: (claim: RewardClaim, price: number, expectedAccountId?: string) => void;
  restoreRewardClaim: (claim: RewardClaim, expectedAccountId?: string) => void;
  selectCharacter: (id: string) => void;
  setTutorialCompleted: () => void;
  markTutorialSeen: (tutorialId: string) => void;
  update2048Score: (score: number) => void;
  complete2048Level: (levelId: number) => void;
  completeBubbleLevel: (levelId: number) => void;
  updatePet: (pet: PetState | null) => void;
  departPet: (departure: PetDeparture) => void;
  unlockCharacter: (id: string) => void;
  addToCart: (productId: string) => void;
  removeFromCart: (productId: string) => void;
  updateCartQty: (productId: string, quantity: number) => void;
  placeOrder: (order: Omit<Order, 'id' | 'createdAt' | 'status'>) => string;
}

const GameContext = createContext<GameContextValue | null>(null);
const UNAVAILABLE_PROGRESS_VIEWER = 'auth:unavailable';

function normalizeRuntimeProgress(progress: PlayerProgress): PlayerProgress {
  return progress.pet
    ? { ...progress, pet: normalizePetState(progress.pet) }
    : progress;
}

export function GameProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, session: authSession, syncProgress: syncAccountProgress } = useAuth();
  const [progress, setProgress] = useState<PlayerProgress>(() => syncTermlinUnlocks(loadProgress()));
  const [hydratedProgressViewer, setHydratedProgressViewer] = useState<string | null>(null);
  const progressRef = useRef(progress);
  const storedOwnerRef = useRef(loadProgressOwner());
  const accountIdRef = useRef<string | null>(null);
  const syncTimerRef = useRef<number | null>(null);
  const syncSequenceRef = useRef(0);
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const authRef = useRef({
    status: authStatus,
    accountId: authSession?.account.id ?? null,
    syncProgress: syncAccountProgress,
  });

  useEffect(() => {
    authRef.current = {
      status: authStatus,
      accountId: authSession?.account.id ?? null,
      syncProgress: syncAccountProgress,
    };
  }, [authSession?.account.id, authStatus, syncAccountProgress]);

  const scheduleRemoteSync = useCallback((next: PlayerProgress) => {
    const scheduledAccountId = accountIdRef.current;
    if (
      authRef.current.status !== 'authenticated'
      || !scheduledAccountId
      || authRef.current.accountId !== scheduledAccountId
    ) return;
    syncSequenceRef.current += 1;
    const sequence = syncSequenceRef.current;
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      syncQueueRef.current = syncQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          if (
            sequence !== syncSequenceRef.current
            || accountIdRef.current !== scheduledAccountId
            || authRef.current.accountId !== scheduledAccountId
          ) return;
          const saved = await authRef.current.syncProgress(next);
          if (
            sequence !== syncSequenceRef.current
            || accountIdRef.current !== scheduledAccountId
            || authRef.current.accountId !== scheduledAccountId
          ) return;
          const normalized = syncTermlinUnlocks(normalizeRuntimeProgress({
            ...saved,
            fourGameChallenge: mergeFourGameChallengeProgress(
              saved.fourGameChallenge,
              next.fourGameChallenge,
            ),
          }));
          progressRef.current = normalized;
          saveProgress(normalized, storedOwnerRef.current);
          setProgress(normalized);
        })
        .catch(() => undefined);
    }, 700);
  }, []);

  const update = useCallback((updater: (prev: PlayerProgress) => PlayerProgress) => {
    const previous = progressRef.current;
    const next = syncTermlinUnlocks(updater(previous));
    if (next === previous) return previous;
    progressRef.current = next;
    saveProgress(next, storedOwnerRef.current);
    setProgress(next);
    scheduleRemoteSync(next);
    return next;
  }, [scheduleRemoteSync]);

  useEffect(() => {
    if (authStatus === 'authenticated' && authSession) {
      const nextOwner = accountProgressOwner(authSession.account.id);
      if (accountIdRef.current !== authSession.account.id) {
        if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
        syncSequenceRef.current += 1;
        const serverChallenge = normalizeFourGameChallengeProgress(authSession.progress.fourGameChallenge);
        const canMergeCachedChallenge = storedOwnerRef.current === GUEST_PROGRESS_OWNER
          || storedOwnerRef.current === nextOwner;
        const mergedChallenge = canMergeCachedChallenge
          ? mergeFourGameChallengeProgress(serverChallenge, progressRef.current.fourGameChallenge)
          : serverChallenge;
        const hydrated = syncTermlinUnlocks(normalizeRuntimeProgress({
          ...authSession.progress,
          fourGameChallenge: mergedChallenge,
        }));
        const shouldSyncGuestChallenge = getFourGameChallengeCount(mergedChallenge)
          > getFourGameChallengeCount(serverChallenge);
        accountIdRef.current = authSession.account.id;
        storedOwnerRef.current = nextOwner;
        progressRef.current = hydrated;
        saveProgress(hydrated, nextOwner);
        setProgress(hydrated);
        if (shouldSyncGuestChallenge) scheduleRemoteSync(hydrated);
      }
      setHydratedProgressViewer(nextOwner);
      return;
    }

    if (authStatus === 'guest') {
      if (accountIdRef.current !== null || storedOwnerRef.current !== GUEST_PROGRESS_OWNER) {
        if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
        syncSequenceRef.current += 1;
        const fresh = syncTermlinUnlocks(createDefaultProgress());
        accountIdRef.current = null;
        storedOwnerRef.current = GUEST_PROGRESS_OWNER;
        progressRef.current = fresh;
        resetProgress();
        setProgress(fresh);
      }
      setHydratedProgressViewer(GUEST_PROGRESS_OWNER);
      return;
    }

    setHydratedProgressViewer(authStatus === 'unavailable' ? UNAVAILABLE_PROGRESS_VIEWER : null);
  }, [authSession, authStatus, scheduleRemoteSync]);

  useEffect(() => () => {
    if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      update(prev => syncLifeProgress(prev));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [update]);

  const completeLevelAction = useCallback((levelId: number, stars: number, score: number, reward: number) => {
    let earnedReward = 0;
    if (levelId < 1 || levelId > GAME_LEVEL_TOTAL) return earnedReward;
    update(prev => {
      const existing: LevelProgress = prev.levels[levelId] ?? { stars: 0, bestScore: 0, completed: false };
      const newStars = Math.max(existing.stars, stars);
      const newBest = Math.max(existing.bestScore, score);
      const dailyReward = awardDailyGameReward(prev.dailyGameRewards, 'match3', reward);
      earnedReward = dailyReward.awarded;

      return {
        ...prev,
        currentLevel: Math.min(GAME_LEVEL_TOTAL + 1, Math.max(prev.currentLevel, levelId + 1)),
        currency: prev.currency + earnedReward,
        dailyGameRewards: dailyReward.rewards,
        fourGameChallenge: addFourGameCompletion(prev.fourGameChallenge, 'match3'),
        levels: {
          ...prev.levels,
          [levelId]: { stars: newStars, bestScore: newBest, completed: true },
        },
      };
    });
    return earnedReward;
  }, [update]);

  const awardGameCurrency = useCallback((source: GameRewardSource, amount: number) => {
    let earnedReward = 0;
    update(prev => {
      const dailyReward = awardDailyGameReward(prev.dailyGameRewards, source, amount);
      earnedReward = dailyReward.awarded;
      if (earnedReward === 0 && dailyReward.rewards === prev.dailyGameRewards) return prev;
      return {
        ...prev,
        currency: prev.currency + earnedReward,
        dailyGameRewards: dailyReward.rewards,
      };
    });
    return earnedReward;
  }, [update]);

  const recordFourGameCompletion = useCallback((source: GameRewardSource) => {
    update(prev => {
      const current = normalizeFourGameChallengeProgress(prev.fourGameChallenge);
      if (current.completedGames.includes(source)) return prev;
      return {
        ...prev,
        fourGameChallenge: addFourGameCompletion(current, source),
      };
    });
  }, [update]);

  const spendLife = useCallback(() => {
    update(prev => spendLifeProgress(prev));
  }, [update]);

  const buyLife = useCallback(() => {
    update(prev => buyLifeProgress(prev));
  }, [update]);

  const buyWithCoins = useCallback((productId: string, price: number) => {
    update(prev => {
      if (price < 0 || prev.currency < price) return prev;
      return {
        ...prev,
        currency: prev.currency - price,
        inventory: {
          ...prev.inventory,
          [productId]: (prev.inventory[productId] ?? 0) + 1,
        },
      };
    });
  }, [update]);

  const consumeInventoryItem = useCallback((productId: string) => {
    update(prev => {
      const count = prev.inventory[productId] ?? 0;
      if (count <= 0) return prev;
      return {
        ...prev,
        inventory: {
          ...prev.inventory,
          [productId]: count - 1,
        },
      };
    });
  }, [update]);

  const completeRewardClaim = useCallback((claim: RewardClaim, price: number, expectedAccountId?: string) => {
    if (expectedAccountId && (
      accountIdRef.current !== expectedAccountId
      || authRef.current.status !== 'authenticated'
      || authRef.current.accountId !== expectedAccountId
    )) return;
    update(prev => {
      if (price < 0 || prev.currency < price || prev.rewardClaims.some(item => item.id === claim.id)) {
        return prev;
      }
      return {
        ...prev,
        currency: prev.currency - price,
        inventory: { ...prev.inventory, [claim.rewardId]: 1 },
        rewardClaims: [...prev.rewardClaims, { ...claim, status: claim.status ?? 'active' }],
      };
    });
  }, [update]);

  const restoreRewardClaim = useCallback((claim: RewardClaim, expectedAccountId?: string) => {
    if (expectedAccountId && (
      accountIdRef.current !== expectedAccountId
      || authRef.current.status !== 'authenticated'
      || authRef.current.accountId !== expectedAccountId
    )) return;
    update(prev => {
      const rewardClaims = prev.rewardClaims.some(item => item.id === claim.id)
        ? prev.rewardClaims.map(item => item.id === claim.id ? claim : item)
        : [...prev.rewardClaims, claim];
      const hasUsableClaim = rewardClaims.some(item => (
        item.rewardId === 'ticket-free'
        && item.status !== 'redeemed'
        && item.expiresAt > Date.now()
      ));
      return {
        ...prev,
        inventory: { ...prev.inventory, [claim.rewardId]: hasUsableClaim ? 1 : 0 },
        rewardClaims,
      };
    });
  }, [update]);

  const selectCharacter = useCallback((id: string) => {
    update(prev => ({ ...prev, selectedCharacter: id }));
  }, [update]);

  const setTutorialCompleted = useCallback(() => {
    update(prev => ({ ...prev, tutorialCompleted: true }));
  }, [update]);

  const markTutorialSeen = useCallback((tutorialId: string) => {
    update(prev => (
      prev.tutorialFlags.includes(tutorialId)
        ? prev
        : { ...prev, tutorialFlags: [...prev.tutorialFlags, tutorialId] }
    ));
  }, [update]);

  const update2048Score = useCallback((score: number) => {
    update(prev => ({
      ...prev,
      best2048Score: Math.max(prev.best2048Score, score),
    }));
  }, [update]);

  const complete2048Level = useCallback((levelId: number) => {
    update(prev => {
      if (prev.game2048LevelsCompleted >= GAME_LEVEL_TOTAL) return prev;
      const currentUnlockedLevel = prev.game2048LevelsCompleted + 1;
      if (levelId !== currentUnlockedLevel) return prev;
      return {
        ...prev,
        game2048LevelsCompleted: levelId,
        fourGameChallenge: addFourGameCompletion(prev.fourGameChallenge, 'game2048'),
      };
    });
  }, [update]);

  const completeBubbleLevel = useCallback((levelId: number) => {
    update(prev => {
      if (prev.bubbleLevelsCompleted >= GAME_LEVEL_TOTAL) return prev;
      const currentUnlockedLevel = prev.bubbleLevelsCompleted + 1;
      if (levelId !== currentUnlockedLevel) return prev;
      return { ...prev, bubbleLevelsCompleted: levelId };
    });
  }, [update]);

  const updatePet = useCallback((pet: PetState | null) => {
    // Keep a departure tombstone beside a newly adopted pet until the server
    // acknowledges the replacement. This prevents the debounced sync from
    // collapsing a fast depart -> adopt transition into an unrelated pet swap.
    update(prev => ({ ...prev, pet }));
  }, [update]);

  const departPet = useCallback((departure: PetDeparture) => {
    update(prev => ({ ...prev, pet: null, petDeparture: departure }));
  }, [update]);

  const unlockCharacter = useCallback((id: string) => {
    update(prev => {
      if (prev.unlockedCharacters.includes(id)) return prev;
      return { ...prev, unlockedCharacters: [...prev.unlockedCharacters, id] };
    });
  }, [update]);

  const addToCart = useCallback((productId: string) => {
    update(prev => {
      const existing = prev.cart.find(c => c.productId === productId);
      if (existing) {
        return {
          ...prev,
          cart: prev.cart.map(c =>
            c.productId === productId ? { ...c, quantity: c.quantity + 1 } : c,
          ),
        };
      }
      return { ...prev, cart: [...prev.cart, { productId, quantity: 1 }] };
    });
  }, [update]);

  const removeFromCart = useCallback((productId: string) => {
    update(prev => ({
      ...prev,
      cart: prev.cart.filter(c => c.productId !== productId),
    }));
  }, [update]);

  const updateCartQty = useCallback((productId: string, quantity: number) => {
    update(prev => {
      if (quantity <= 0) {
        return { ...prev, cart: prev.cart.filter(c => c.productId !== productId) };
      }
      return {
        ...prev,
        cart: prev.cart.map(c =>
          c.productId === productId ? { ...c, quantity } : c,
        ),
      };
    });
  }, [update]);

  const placeOrder = useCallback((orderData: Omit<Order, 'id' | 'createdAt' | 'status'>): string => {
    const orderId = `ORD-${Date.now().toString(36).toUpperCase()}`;
    update(prev => ({
      ...prev,
      cart: [],
      orders: [
        ...prev.orders,
        {
          ...orderData,
          id: orderId,
          createdAt: Date.now(),
          status: 'pending' as const,
        },
      ],
    }));
    return orderId;
  }, [update]);

  const expectedProgressViewer = authStatus === 'authenticated' && authSession
    ? accountProgressOwner(authSession.account.id)
    : authStatus === 'guest'
      ? GUEST_PROGRESS_OWNER
      : authStatus === 'unavailable'
        ? UNAVAILABLE_PROGRESS_VIEWER
        : null;
  const progressIsReady = expectedProgressViewer !== null
    && hydratedProgressViewer === expectedProgressViewer;

  if (!progressIsReady) {
    return (
      <div className="app-shell relative" role="status" aria-label="Загружаем игровой прогресс">
        <div className="route-loading" aria-hidden="true" />
      </div>
    );
  }

  return (
    <GameContext.Provider value={{
      progress,
      completeLevelAction,
      awardGameCurrency,
      recordFourGameCompletion,
      spendLife,
      buyLife,
      buyWithCoins,
      consumeInventoryItem,
      completeRewardClaim,
      restoreRewardClaim,
      selectCharacter,
      setTutorialCompleted,
      markTutorialSeen,
      update2048Score,
      complete2048Level,
      completeBubbleLevel,
      updatePet,
      departPet,
      unlockCharacter,
      addToCart,
      removeFromCart,
      updateCartQty,
      placeOrder,
    }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGameContext() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGameContext must be used within GameProvider');
  return ctx;
}
