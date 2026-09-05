import type { PetDailyState, PetDiaryEntry, PetState, PetStatKey } from '../../types/game.ts';
import { PET_DAILY_REWARD } from '../../data/economy.ts';
import { GAME_LEVEL_TOTAL } from '../../data/gameProgression.ts';

export type PetAction = 'feed' | 'play' | 'rest' | 'wash';
export type PetActivity = 'tea' | 'herbs' | 'ritual';
export type PetMood = 'ecstatic' | 'happy' | 'content' | 'sad' | 'critical';
export type PetDailyTaskId = 'care-3' | 'balance-70' | 'activity-1';

export interface PetActivityConfig {
  id: PetActivity;
  title: string;
  description: string;
  minLevel: number;
  cooldownMs: number;
  rewardCoins: number;
  rewardExperience: number;
  effects: Partial<Record<'hunger' | 'happiness' | 'energy' | 'cleanliness', number>>;
  requirement?: { stat: 'hunger' | 'energy'; minimum: number; message: string };
}

export interface PetDailyTaskConfig {
  id: PetDailyTaskId;
  title: string;
  description: string;
  target: number;
  rewardCoins: number;
}

export type PetInteractionResult =
  | { ok: true; pet: PetState; coins: number; message: string }
  | { ok: false; pet: PetState; reason: string };

const BASE_DECAY: Record<'hunger' | 'happiness' | 'energy' | 'cleanliness', number> = {
  hunger: 0.16,
  happiness: 0.12,
  energy: 0.14,
  cleanliness: 0.1,
};

const STAGE_DECAY_MULT: Record<PetState['stage'], number> = {
  baby: 0.75,
  teen: 1,
  adult: 1.15,
};

const ACTION_EFFECTS: Record<PetAction, Partial<Record<'hunger' | 'happiness' | 'energy' | 'cleanliness', number>>> = {
  feed: { hunger: 30, happiness: 5, energy: 5, cleanliness: -3 },
  play: { happiness: 35, energy: -18, hunger: -10, cleanliness: -5 },
  rest: { energy: 32, happiness: 5, hunger: -5 },
  wash: { cleanliness: 36, happiness: 8, energy: -4, hunger: -3 },
};

const STAGE_ACTION_BONUS: Record<PetState['stage'], Partial<Record<PetAction, number>>> = {
  baby: { feed: 10, wash: 5 },
  teen: { play: 5 },
  adult: { play: 10, rest: 5 },
};

export const ACTION_COOLDOWNS: Record<PetAction, number> = {
  feed: 60 * 1000,
  play: 90 * 1000,
  rest: 75 * 1000,
  wash: 60 * 1000,
};

const BASE_COINS: Record<PetAction, number> = {
  feed: 2,
  play: 4,
  rest: 2,
  wash: 3,
};

const CARE_EXPERIENCE: Record<PetAction, number> = {
  feed: 8,
  play: 12,
  rest: 8,
  wash: 10,
};

const ACTION_LABELS: Record<PetAction, string> = {
  feed: 'Кормление',
  play: 'Игра',
  rest: 'Отдых',
  wash: 'Купание',
};

const CHARACTER_BONUSES: Record<string, { stat: string; reduction: number }> = {
  yaromir: { stat: 'all', reduction: 0.15 },
  valkiriya: { stat: 'hunger', reduction: 0.3 },
  pereslav: { stat: 'happiness', reduction: 0.25 },
  kazimir: { stat: 'energy', reduction: 0.25 },
  vedagor: { stat: 'cleanliness', reduction: 0.3 },
  milovan: { stat: 'happiness', reduction: 0.2 },
  lelya: { stat: 'hunger', reduction: 0.2 },
};

export const PET_ACTIVITIES: PetActivityConfig[] = [
  {
    id: 'tea',
    title: 'Чаепитие у печи',
    description: 'Тёплый травяной чай возвращает силы и укрепляет дружбу.',
    minLevel: 1,
    cooldownMs: 8 * 60 * 1000,
    rewardCoins: 4,
    rewardExperience: 18,
    effects: { hunger: 12, happiness: 12, energy: 8 },
  },
  {
    id: 'herbs',
    title: 'Прогулка за травами',
    description: 'Небольшое путешествие: радости много, но придётся устать.',
    minLevel: 2,
    cooldownMs: 12 * 60 * 1000,
    rewardCoins: 7,
    rewardExperience: 28,
    effects: { happiness: 24, energy: -16, hunger: -8, cleanliness: -6 },
    requirement: { stat: 'energy', minimum: 35, message: 'Для прогулки нужно хотя бы 35% энергии.' },
  },
  {
    id: 'ritual',
    title: 'Банный обряд',
    description: 'Освой старинный ритуал пара и получи большую награду.',
    minLevel: 4,
    cooldownMs: 18 * 60 * 1000,
    rewardCoins: 10,
    rewardExperience: 42,
    effects: { happiness: 18, cleanliness: 28, energy: -10, hunger: -6 },
    requirement: { stat: 'hunger', minimum: 30, message: 'Сначала покорми термлина хотя бы до 30% сытости.' },
  },
];

export const PET_DAILY_TASKS: PetDailyTaskConfig[] = [
  {
    id: 'care-3',
    title: 'Заботливый хозяин',
    description: 'Выполни 3 действия ухода.',
    target: 3,
    rewardCoins: 8,
  },
  {
    id: 'balance-70',
    title: 'Лад в доме',
    description: 'Подними общее состояние до 70%.',
    target: 1,
    rewardCoins: 10,
  },
  {
    id: 'activity-1',
    title: 'День с приключением',
    description: 'Заверши одно занятие.',
    target: 1,
    rewardCoins: 12,
  },
];

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function getPetDateKey(now = Date.now()): string {
  const date = new Date(now);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createDailyState(now = Date.now()): PetDailyState {
  return {
    date: getPetDateKey(now),
    giftClaimed: false,
    taskProgress: {},
    taskClaimed: [],
  };
}

function getDefaultName(characterId: string): string {
  const names: Record<string, string> = {
    yaromir: 'Яромир',
    valkiriya: 'Валькирия',
    pereslav: 'Переслав',
    kazimir: 'Казимир',
    vedagor: 'Ведагор',
    milovan: 'Милован',
    lelya: 'Леля',
  };
  return names[characterId] ?? 'Термлин';
}

function createAdoptionId(characterId: string, now: number): string {
  const randomPart = globalThis.crypto?.randomUUID?.()
    ?? Math.random().toString(36).slice(2, 14);
  return `pet-${characterId}-${now}-${randomPart}`.slice(0, 100);
}

function resolveAdoptionId(pet: PetState): string {
  if (typeof pet.adoptionId === 'string' && pet.adoptionId.trim()) {
    return pet.adoptionId.trim().slice(0, 100);
  }
  const adoptionEntry = Array.isArray(pet.diary)
    ? pet.diary.find(entry => typeof entry?.id === 'string' && entry.id.startsWith('adopt-'))
    : null;
  if (adoptionEntry) return `legacy-${adoptionEntry.id}`.slice(0, 100);
  return `legacy-${pet.characterId || 'yaromir'}`.slice(0, 100);
}

export function createPet(
  characterId: string,
  now = Date.now(),
  retainedExperience = 0,
  adoptionId = createAdoptionId(characterId, now),
): PetState {
  const pet: PetState = {
    adoptionId,
    characterId,
    name: getDefaultName(characterId),
    hunger: 80,
    happiness: 80,
    energy: 80,
    cleanliness: 80,
    age: 0,
    stage: 'baby',
    lastUpdated: now,
    cooldowns: {},
    activityCooldowns: {},
    experience: Math.max(0, Math.floor(Number.isFinite(retainedExperience) ? retainedExperience : 0)),
    bond: 10,
    careStreak: 0,
    lastCareDate: null,
    daily: createDailyState(now),
    diary: [{
      id: `adopt-${now}`,
      createdAt: now,
      title: 'Новый друг',
      detail: 'Сегодня термлин поселился у тебя.',
      kind: 'growth',
    }],
  };
  return { ...pet, stage: resolveStage(pet) };
}

export function normalizePetState(pet: PetState, now = Date.now()): PetState {
  const fallback = createPet(pet.characterId || 'yaromir', now);
  const currentDate = getPetDateKey(now);
  const daily = pet.daily && pet.daily.date === currentDate
    ? {
        date: currentDate,
        giftClaimed: Boolean(pet.daily.giftClaimed),
        taskProgress: pet.daily.taskProgress && typeof pet.daily.taskProgress === 'object'
          ? pet.daily.taskProgress
          : {},
        taskClaimed: Array.isArray(pet.daily.taskClaimed) ? pet.daily.taskClaimed : [],
      }
    : createDailyState(now);

  return {
    ...fallback,
    ...pet,
    adoptionId: resolveAdoptionId(pet),
    name: typeof pet.name === 'string' && pet.name.trim() ? pet.name.trim().slice(0, 20) : fallback.name,
    hunger: clamp(Number.isFinite(pet.hunger) ? pet.hunger : fallback.hunger),
    happiness: clamp(Number.isFinite(pet.happiness) ? pet.happiness : fallback.happiness),
    energy: clamp(Number.isFinite(pet.energy) ? pet.energy : fallback.energy),
    cleanliness: clamp(Number.isFinite(pet.cleanliness) ? pet.cleanliness : fallback.cleanliness),
    experience: Math.max(0, Math.floor(Number.isFinite(pet.experience) ? pet.experience : 0)),
    bond: clamp(Number.isFinite(pet.bond) ? pet.bond : 10),
    careStreak: Math.max(0, Math.floor(Number.isFinite(pet.careStreak) ? pet.careStreak : 0)),
    lastCareDate: typeof pet.lastCareDate === 'string' ? pet.lastCareDate : null,
    lastUpdated: Number.isFinite(pet.lastUpdated) ? pet.lastUpdated : now,
    cooldowns: pet.cooldowns && typeof pet.cooldowns === 'object' ? pet.cooldowns : {},
    activityCooldowns: pet.activityCooldowns && typeof pet.activityCooldowns === 'object'
      ? pet.activityCooldowns
      : {},
    daily,
    diary: Array.isArray(pet.diary) ? pet.diary.slice(0, 20) : fallback.diary,
  };
}

function getDecayRate(stat: keyof typeof BASE_DECAY, pet: PetState): number {
  const bonus = CHARACTER_BONUSES[pet.characterId];
  const reduction = bonus && (bonus.stat === 'all' || bonus.stat === stat) ? bonus.reduction : 0;
  return BASE_DECAY[stat] * STAGE_DECAY_MULT[pet.stage] * (1 - reduction);
}

export function getPetLevel(pet: Pick<PetState, 'experience'>): number {
  return Math.min(GAME_LEVEL_TOTAL, Math.floor(Math.max(0, pet.experience) / 100) + 1);
}

export function getPetLevelProgress(pet: Pick<PetState, 'experience'>): { current: number; max: number } {
  const level = getPetLevel(pet);
  if (level >= GAME_LEVEL_TOTAL) return { current: 100, max: 100 };
  return { current: pet.experience % 100, max: 100 };
}

export function hasPetAdvancedLevel(previous: PetState, next: PetState): boolean {
  return getPetLevel(next) > getPetLevel(previous);
}

export function qualifiesPetLevelCompletion(previous: PetState, next: PetState): boolean {
  return hasPetAdvancedLevel(previous, next) || getPetLevel(previous) >= GAME_LEVEL_TOTAL;
}

function resolveStage(pet: PetState): PetState['stage'] {
  const level = getPetLevel(pet);
  if (pet.age >= 4320 || level >= 6) return 'adult';
  if (pet.age >= 1440 || level >= 3) return 'teen';
  return 'baby';
}

export function syncPetState(pet: PetState, now = Date.now()): PetState {
  const normalized = normalizePetState(pet, now);
  const elapsedMinutes = Math.max(0, (now - normalized.lastUpdated) / 60000);
  if (elapsedMinutes < 0.05) return { ...normalized, stage: resolveStage(normalized) };
  const capped = Math.min(elapsedMinutes, 720);
  const aged = {
    ...normalized,
    hunger: clamp(normalized.hunger - getDecayRate('hunger', normalized) * capped),
    happiness: clamp(normalized.happiness - getDecayRate('happiness', normalized) * capped),
    energy: clamp(normalized.energy - getDecayRate('energy', normalized) * capped),
    cleanliness: clamp(normalized.cleanliness - getDecayRate('cleanliness', normalized) * capped),
    age: normalized.age + elapsedMinutes,
    lastUpdated: now,
  };
  return { ...aged, stage: resolveStage(aged) };
}

export function getDepletedPetStat(pet: PetState): PetStatKey | null {
  for (const stat of ['hunger', 'happiness', 'energy', 'cleanliness'] as PetStatKey[]) {
    if (pet[stat] <= 0) return stat;
  }
  return null;
}

export function isOnCooldown(pet: PetState, action: PetAction, now = Date.now()): boolean {
  return (pet.cooldowns[action] ?? 0) > now;
}

export function getCooldownRemaining(pet: PetState, action: PetAction, now = Date.now()): number {
  return Math.max(0, (pet.cooldowns[action] ?? 0) - now);
}

export function getActivityCooldownRemaining(pet: PetState, activity: PetActivity, now = Date.now()): number {
  return Math.max(0, (pet.activityCooldowns[activity] ?? 0) - now);
}

function getMainStat(action: PetAction): keyof typeof BASE_DECAY {
  return { feed: 'hunger', play: 'happiness', rest: 'energy', wash: 'cleanliness' }[action] as keyof typeof BASE_DECAY;
}

function getAverageStat(pet: PetState): number {
  return (pet.hunger + pet.happiness + pet.energy + pet.cleanliness) / 4;
}

function incrementDailyTask(pet: PetState, taskId: PetDailyTaskId, amount = 1): PetState {
  const task = PET_DAILY_TASKS.find(item => item.id === taskId);
  if (!task) return pet;
  return {
    ...pet,
    daily: {
      ...pet.daily,
      taskProgress: {
        ...pet.daily.taskProgress,
        [taskId]: Math.min(task.target, (pet.daily.taskProgress[taskId] ?? 0) + amount),
      },
    },
  };
}

function updateCareStreak(pet: PetState, now: number): PetState {
  const today = getPetDateKey(now);
  if (pet.lastCareDate === today) return pet;
  if (!pet.lastCareDate) return { ...pet, careStreak: 1, lastCareDate: today };
  const previous = new Date(`${pet.lastCareDate}T12:00:00`);
  const current = new Date(`${today}T12:00:00`);
  const dayDifference = Math.round((current.getTime() - previous.getTime()) / 86400000);
  return {
    ...pet,
    careStreak: dayDifference === 1 ? pet.careStreak + 1 : 1,
    lastCareDate: today,
  };
}

function appendDiary(pet: PetState, entry: Omit<PetDiaryEntry, 'id'>): PetState {
  return {
    ...pet,
    diary: [{ ...entry, id: `${entry.kind}-${entry.createdAt}-${Math.random().toString(36).slice(2, 7)}` }, ...pet.diary].slice(0, 20),
  };
}

function addGrowthEntryIfNeeded(pet: PetState, previousLevel: number, now: number): PetState {
  const level = getPetLevel(pet);
  if (level <= previousLevel) return pet;
  return appendDiary(pet, {
    createdAt: now,
    title: `Новый уровень: ${level}`,
    detail: 'Связь с термлином стала крепче. Открываются новые занятия.',
    kind: 'growth',
  });
}

export function applyAction(pet: PetState, action: PetAction, now = Date.now()): PetInteractionResult {
  const synced = syncPetState(pet, now);
  if (isOnCooldown(synced, action, now)) {
    return { ok: false, pet: synced, reason: 'Термлин ещё отдыхает после этого действия.' };
  }

  const previousLevel = getPetLevel(synced);
  const effects = ACTION_EFFECTS[action];
  const stageBonus = STAGE_ACTION_BONUS[synced.stage][action] ?? 0;
  const mainStat = getMainStat(action);
  const mood = getMood(synced);
  const moodMultiplier = mood === 'ecstatic' ? 2 : mood === 'happy' ? 1.5 : mood === 'content' ? 1 : mood === 'sad' ? 0.75 : 0.5;
  const coins = Math.max(1, Math.round(BASE_COINS[action] * moodMultiplier));

  let next: PetState = {
    ...synced,
    hunger: clamp(synced.hunger + (effects.hunger ?? 0) + (mainStat === 'hunger' ? stageBonus : 0)),
    happiness: clamp(synced.happiness + (effects.happiness ?? 0) + (mainStat === 'happiness' ? stageBonus : 0)),
    energy: clamp(synced.energy + (effects.energy ?? 0) + (mainStat === 'energy' ? stageBonus : 0)),
    cleanliness: clamp(synced.cleanliness + (effects.cleanliness ?? 0) + (mainStat === 'cleanliness' ? stageBonus : 0)),
    experience: synced.experience + CARE_EXPERIENCE[action],
    bond: clamp(synced.bond + 3),
    lastUpdated: now,
    cooldowns: { ...synced.cooldowns, [action]: now + ACTION_COOLDOWNS[action] },
  };
  next = updateCareStreak(next, now);
  next = incrementDailyTask(next, 'care-3');
  if (getAverageStat(next) >= 70) next = incrementDailyTask(next, 'balance-70');
  next = { ...next, stage: resolveStage(next) };
  next = appendDiary(next, {
    createdAt: now,
    title: ACTION_LABELS[action],
    detail: `Забота принесла ${CARE_EXPERIENCE[action]} опыта и ${coins} термокоинов.`,
    kind: 'care',
  });
  next = addGrowthEntryIfNeeded(next, previousLevel, now);

  return { ok: true, pet: next, coins, message: `+${CARE_EXPERIENCE[action]} опыта · +${coins} термокоинов` };
}

export function applyActivity(pet: PetState, activityId: PetActivity, now = Date.now()): PetInteractionResult {
  const synced = syncPetState(pet, now);
  const activity = PET_ACTIVITIES.find(item => item.id === activityId);
  if (!activity) return { ok: false, pet: synced, reason: 'Занятие не найдено.' };
  if (getPetLevel(synced) < activity.minLevel) {
    return { ok: false, pet: synced, reason: `Откроется на ${activity.minLevel} уровне привязанности.` };
  }
  if (getActivityCooldownRemaining(synced, activityId, now) > 0) {
    return { ok: false, pet: synced, reason: 'Это занятие пока восстанавливается.' };
  }
  if (activity.requirement && synced[activity.requirement.stat] < activity.requirement.minimum) {
    return { ok: false, pet: synced, reason: activity.requirement.message };
  }

  const previousLevel = getPetLevel(synced);
  let next: PetState = {
    ...synced,
    hunger: clamp(synced.hunger + (activity.effects.hunger ?? 0)),
    happiness: clamp(synced.happiness + (activity.effects.happiness ?? 0)),
    energy: clamp(synced.energy + (activity.effects.energy ?? 0)),
    cleanliness: clamp(synced.cleanliness + (activity.effects.cleanliness ?? 0)),
    experience: synced.experience + activity.rewardExperience,
    bond: clamp(synced.bond + 5),
    lastUpdated: now,
    activityCooldowns: {
      ...synced.activityCooldowns,
      [activityId]: now + activity.cooldownMs,
    },
  };
  next = updateCareStreak(next, now);
  next = incrementDailyTask(next, 'activity-1');
  if (getAverageStat(next) >= 70) next = incrementDailyTask(next, 'balance-70');
  next = { ...next, stage: resolveStage(next) };
  next = appendDiary(next, {
    createdAt: now,
    title: activity.title,
    detail: `Получено ${activity.rewardExperience} опыта и ${activity.rewardCoins} термокоинов.`,
    kind: 'activity',
  });
  next = addGrowthEntryIfNeeded(next, previousLevel, now);
  return {
    ok: true,
    pet: next,
    coins: activity.rewardCoins,
    message: `+${activity.rewardExperience} опыта · +${activity.rewardCoins} термокоинов`,
  };
}

export function claimDailyGift(pet: PetState, now = Date.now()): PetInteractionResult {
  const synced = syncPetState(pet, now);
  if (synced.daily.giftClaimed) {
    return { ok: false, pet: synced, reason: 'Сегодняшний гостинец уже получен.' };
  }
  const previousLevel = getPetLevel(synced);
  const coins = PET_DAILY_REWARD;
  let next: PetState = {
    ...synced,
    hunger: clamp(synced.hunger + 8),
    happiness: clamp(synced.happiness + 8),
    energy: clamp(synced.energy + 8),
    cleanliness: clamp(synced.cleanliness + 8),
    experience: synced.experience + 10,
    bond: clamp(synced.bond + 2),
    daily: { ...synced.daily, giftClaimed: true },
    lastUpdated: now,
  };
  if (getAverageStat(next) >= 70) next = incrementDailyTask(next, 'balance-70');
  next = { ...next, stage: resolveStage(next) };
  next = appendDiary(next, {
    createdAt: now,
    title: 'Ежедневный гостинец',
    detail: `Все показатели улучшены, получено 10 опыта и ${PET_DAILY_REWARD} термокоинов.`,
    kind: 'reward',
  });
  next = addGrowthEntryIfNeeded(next, previousLevel, now);
  return { ok: true, pet: next, coins, message: `+10 опыта · +${PET_DAILY_REWARD} термокоинов · +8 ко всем шкалам` };
}

export function claimDailyTask(pet: PetState, taskId: PetDailyTaskId, now = Date.now()): PetInteractionResult {
  const synced = syncPetState(pet, now);
  const task = PET_DAILY_TASKS.find(item => item.id === taskId);
  if (!task) return { ok: false, pet: synced, reason: 'Задание не найдено.' };
  if (synced.daily.taskClaimed.includes(taskId)) {
    return { ok: false, pet: synced, reason: 'Награда уже получена.' };
  }
  if ((synced.daily.taskProgress[taskId] ?? 0) < task.target) {
    return { ok: false, pet: synced, reason: 'Сначала заверши это дело.' };
  }
  const previousLevel = getPetLevel(synced);
  const experience = task.rewardCoins * 2;
  let next: PetState = {
    ...synced,
    experience: synced.experience + experience,
    bond: clamp(synced.bond + 2),
    daily: {
      ...synced.daily,
      taskClaimed: [...synced.daily.taskClaimed, taskId],
    },
    lastUpdated: now,
  };
  next = { ...next, stage: resolveStage(next) };
  next = appendDiary(next, {
    createdAt: now,
    title: `Дело выполнено: ${task.title}`,
    detail: `Награда: ${task.rewardCoins} термокоинов и ${experience} опыта.`,
    kind: 'reward',
  });
  next = addGrowthEntryIfNeeded(next, previousLevel, now);
  return { ok: true, pet: next, coins: task.rewardCoins, message: `+${experience} опыта · +${task.rewardCoins} термокоинов` };
}

export function renamePet(pet: PetState, name: string, now = Date.now()): PetInteractionResult {
  const synced = syncPetState(pet, now);
  const cleanName = name.trim().replace(/\s+/g, ' ').slice(0, 20);
  if (cleanName.length < 2) return { ok: false, pet: synced, reason: 'Имя должно быть не короче 2 букв.' };
  const next = appendDiary({ ...synced, name: cleanName, lastUpdated: now }, {
    createdAt: now,
    title: 'Новое имя',
    detail: `Теперь термлина зовут ${cleanName}.`,
    kind: 'growth',
  });
  return { ok: true, pet: next, coins: 0, message: `Теперь его зовут ${cleanName}` };
}

export function getMood(pet: PetState): PetMood {
  const average = getAverageStat(pet);
  if (average >= 85) return 'ecstatic';
  if (average >= 65) return 'happy';
  if (average >= 40) return 'content';
  if (average >= 18) return 'sad';
  return 'critical';
}

export function getStatWarning(pet: PetState): string | null {
  if (pet.hunger < 15) return 'Термлин очень голоден!';
  if (pet.happiness < 15) return 'Термлин очень грустит!';
  if (pet.energy < 15) return 'Термлин совсем без сил!';
  if (pet.cleanliness < 15) return 'Термлину срочно нужно помыться!';
  return null;
}

export const MOOD_LABELS: Record<PetMood, string> = {
  ecstatic: 'В восторге',
  happy: 'Счастлив',
  content: 'Доволен',
  sad: 'Грустит',
  critical: 'Плохо',
};

export const MOOD_COLORS: Record<PetMood, string> = {
  ecstatic: '#FFD76A',
  happy: '#5DB879',
  content: '#6AABDA',
  sad: '#D4956A',
  critical: '#E85C5C',
};

export const STAGE_LABELS: Record<PetState['stage'], string> = {
  baby: 'Малыш',
  teen: 'Подросток',
  adult: 'Взрослый',
};

export const STAGE_SIZES: Record<PetState['stage'], number> = {
  baby: 92,
  teen: 104,
  adult: 116,
};
