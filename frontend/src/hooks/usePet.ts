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
  qualifiesPetLevelCompletion,
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
        adoptionId: next.adoptionId,
        characterId: next.characterId,
        name: next.name,
        depletedStat,
        departedAt: Date.now(),
        experience: next.experience,
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
    const retainedExperience = Number.isFinite(progress.petDeparture?.experience)
      ? Math.max(0, Math.floor(progress.petDeparture?.experience ?? 0))
      : 0;
    const next = createPet(characterId, Date.now(), retainedExperience);
    petRef.current = next;
    updatePet(next);
  }, [progress.petDeparture?.experience, updatePet]);

  const commit = useCallback((result: PetInteractionResult): PetInteractionResult => {
    const previousPet = petRef.current;
    const completedLevel = Boolean(
      result.ok
      && previousPet
      && qualifiesPetLevelCompletion(previousPet, result.pet),
    );
    const persistResult = (nextPet: NonNullable<typeof pet>) => {
      saveOrDepart(nextPet);
      if (completedLevel) recordFourGameCompletion('pet');
    };
    if (!result.ok || result.coins <= 0) {
      persistResult(result.pet);
      return result;
    }
    if (getDepletedPetStat(result.pet)) {
      persistResult(result.pet);
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
    persistResult(petWithActualReward);
    return {
      ...result,
      pet: petWithActualReward,
      coins: awarded,
      message: result.message.replace(/\+\d+ термокоинов/, rewardText),
    };
  }, [awardGameCurrency, recordFourGameCompletion, saveOrDepart]);

  const doAction = useCallback((action: PetAction): PetInteractionResult | null => {
    const current = getActivePet();
    if (!current) return null;
    return commit(applyAction(current, action));
  }, [commit, getActivePet]);

  const doActivity = useCallback((activity: PetActivity): PetInteractionResult | null => {
    const current = getActivePet();
    if (!current) return null;
    return commit(applyActivity(current, activity));
  }, [commit, getActivePet]);

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

  const retainedExperience = pet?.experience ?? progress.petDeparture?.experience ?? 0;
  const mood: PetMood = pet ? getMood(pet) : 'happy';
  const warning = pet ? getStatWarning(pet) : null;
  const level = getPetLevel({ experience: retainedExperience });
  const levelProgress = getPetLevelProgress({ experience: retainedExperience });

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
