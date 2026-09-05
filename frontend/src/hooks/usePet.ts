import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameContext } from '@/store/GameContext';
import {
  PET_ACTIVITIES,
  applyAction,
  applyActivity,
  claimDailyGift,
  claimDailyTask,
  createPet,
  getDepletedPetStat,
  getActivityCooldownRemaining,
  getCooldownRemaining,
  getMood,
  getPetLevel,
  getPetLevelProgress,
  getStatWarning,
  renamePet,
  syncPetState,
  type PetAction,
  type PetActivity,
  type PetDailyTaskId,
  type PetInteractionResult,
  type PetMood,
} from '@/engine/engine-pet/petEngine';

export function usePet() {
  const { progress, updatePet, departPet, awardGameCurrency, recordFourGameCompletion } = useGameContext();
  const pet = progress.pet;
  const petRef = useRef(pet);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [activityCooldowns, setActivityCooldowns] = useState<Record<string, number>>({});

  useEffect(() => {
    petRef.current = pet;
  }, [pet]);

  const saveOrDepart = useCallback((next: NonNullable<typeof pet>): boolean => {
    const depletedStat = getDepletedPetStat(next);
    if (depletedStat) {
      petRef.current = null;
      departPet({
        characterId: next.characterId,
        name: next.name,
        depletedStat,
        departedAt: Date.now(),
      });
      return false;
    }
    petRef.current = next;
    updatePet(next);
    return true;
  }, [departPet, updatePet]);

  const getActivePet = useCallback(() => {
    const current = petRef.current;
    if (!current) return null;
    const synced = syncPetState(current);
    return saveOrDepart(synced) ? synced : null;
  }, [saveOrDepart]);

  useEffect(() => {
    getActivePet();
  }, [pet?.characterId, getActivePet]);

  useEffect(() => {
    if (!pet?.characterId) return;
    const timer = window.setInterval(() => {
      getActivePet();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [pet?.characterId, getActivePet]);

  useEffect(() => {
    if (!pet?.characterId) return;
    const updateTimers = () => {
      const current = petRef.current;
      if (!current) return;
      const nextCare: Record<string, number> = {};
      for (const action of ['feed', 'play', 'rest', 'wash'] as PetAction[]) {
        nextCare[action] = getCooldownRemaining(current, action);
      }
      const nextActivities: Record<string, number> = {};
      for (const activity of PET_ACTIVITIES) {
        nextActivities[activity.id] = getActivityCooldownRemaining(current, activity.id);
      }
      setCooldowns(nextCare);
      setActivityCooldowns(nextActivities);
    };
    updateTimers();
    const timer = window.setInterval(updateTimers, 1000);
    return () => window.clearInterval(timer);
  }, [pet?.characterId]);

  const adopt = useCallback((characterId: string) => {
    const next = createPet(characterId);
    petRef.current = next;
    updatePet(next);
  }, [updatePet]);

  const commit = useCallback((result: PetInteractionResult): PetInteractionResult => {
    if (!result.ok || result.coins <= 0) {
      saveOrDepart(result.pet);
      return result;
    }
    if (getDepletedPetStat(result.pet)) {
      saveOrDepart(result.pet);
      return result;
    }

    const awarded = awardGameCurrency('pet', result.coins);
    const rewardText = awarded > 0
      ? `+${awarded} термокоинов`
      : 'лимит Пестуна на сегодня достигнут';
    const diaryRewardText = awarded > 0
      ? `${awarded} термокоинов`
      : 'термокоины не начислены: дневной лимит достигнут';
    const petWithActualReward = {
      ...result.pet,
      diary: result.pet.diary.map((entry, index) => (
        index === 0
          ? { ...entry, detail: entry.detail.replace(/\d+ термокоинов/, diaryRewardText) }
          : entry
      )),
    };
    saveOrDepart(petWithActualReward);
    return {
      ...result,
      pet: petWithActualReward,
      coins: awarded,
      message: result.message.replace(/\+\d+ термокоинов/, rewardText),
    };
  }, [awardGameCurrency, saveOrDepart]);

  const doAction = useCallback((action: PetAction): PetInteractionResult | null => {
    const current = getActivePet();
    if (!current) return null;
    return commit(applyAction(current, action));
  }, [commit, getActivePet]);

  const doActivity = useCallback((activity: PetActivity): PetInteractionResult | null => {
    const current = getActivePet();
    if (!current) return null;
    const result = commit(applyActivity(current, activity));
    if (result.ok) recordFourGameCompletion('pet');
    return result;
  }, [commit, getActivePet, recordFourGameCompletion]);

  const takeDailyGift = useCallback((): PetInteractionResult | null => {
    const current = getActivePet();
    if (!current) return null;
    return commit(claimDailyGift(current));
  }, [commit, getActivePet]);

  const collectTask = useCallback((taskId: PetDailyTaskId): PetInteractionResult | null => {
    const current = getActivePet();
    if (!current) return null;
    return commit(claimDailyTask(current, taskId));
  }, [commit, getActivePet]);

  const changeName = useCallback((name: string): PetInteractionResult | null => {
    const current = getActivePet();
    if (!current) return null;
    return commit(renamePet(current, name));
  }, [commit, getActivePet]);

  const mood: PetMood = pet ? getMood(pet) : 'happy';
  const warning = pet ? getStatWarning(pet) : null;
  const level = pet ? getPetLevel(pet) : 1;
  const levelProgress = pet ? getPetLevelProgress(pet) : { current: 0, max: 100 };

  return {
    pet,
    mood,
    level,
    levelProgress,
    adopt,
    doAction,
    doActivity,
    takeDailyGift,
    collectTask,
    changeName,
    warning,
    cooldowns,
    activityCooldowns,
  };
}
