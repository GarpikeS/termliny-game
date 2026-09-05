import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyAction,
  applyActivity,
  claimDailyGift,
  claimDailyTask,
  createPet,
  getDepletedPetStat,
  getPetLevel,
  hasPetAdvancedLevel,
  normalizePetState,
  qualifiesPetLevelCompletion,
  renamePet,
  syncPetState,
} from '../frontend/src/engine/engine-pet/petEngine.ts';

const START = new Date(2026, 7, 10, 12, 0, 0).getTime();

test('старое сохранение получает новые поля без потери состояния', () => {
  const legacy = {
    characterId: 'yaromir',
    hunger: 54,
    happiness: 63,
    energy: 72,
    cleanliness: 81,
    age: 42,
    stage: 'baby',
    lastUpdated: START,
    cooldowns: {},
  };

  const migrated = normalizePetState(legacy, START);
  assert.equal(migrated.hunger, 54);
  assert.equal(migrated.name, 'Яромир');
  assert.equal(migrated.experience, 0);
  assert.equal(migrated.daily.giftClaimed, false);
  assert.deepEqual(migrated.activityCooldowns, {});
});

test('гостинец выдаётся один раз в день и обновляет ежедневное дело', () => {
  const pet = createPet('yaromir', START);
  const first = claimDailyGift(pet, START + 1_000);
  assert.equal(first.ok, true);
  assert.equal(first.coins, 10);
  assert.equal(first.pet.daily.giftClaimed, true);
  assert.equal(first.pet.daily.taskProgress['balance-70'], 1);

  const second = claimDailyGift(first.pet, START + 2_000);
  assert.equal(second.ok, false);
  assert.match(second.reason, /уже получен/i);
});

test('три разных действия ухода завершают ежедневное дело и дают серию', () => {
  let pet = createPet('yaromir', START);
  for (const action of ['feed', 'play', 'wash']) {
    const result = applyAction(pet, action, START + 1_000);
    assert.equal(result.ok, true);
    pet = result.pet;
  }

  assert.equal(pet.daily.taskProgress['care-3'], 3);
  assert.equal(pet.careStreak, 1);
  assert.ok(pet.experience > 0);

  const reward = claimDailyTask(pet, 'care-3', START + 2_000);
  assert.equal(reward.ok, true);
  assert.equal(reward.coins, 8);
  assert.equal(reward.pet.daily.taskClaimed.includes('care-3'), true);

  const duplicate = claimDailyTask(reward.pet, 'care-3', START + 3_000);
  assert.equal(duplicate.ok, false);
});

test('кулдаун блокирует повтор ухода, но занятия имеют отдельный цикл', () => {
  const pet = createPet('yaromir', START);
  const firstCare = applyAction(pet, 'feed', START + 1_000);
  assert.equal(firstCare.ok, true);
  const secondCare = applyAction(firstCare.pet, 'feed', START + 2_000);
  assert.equal(secondCare.ok, false);

  const tea = applyActivity(firstCare.pet, 'tea', START + 2_000);
  assert.equal(tea.ok, true);
  assert.equal(tea.pet.daily.taskProgress['activity-1'], 1);
  const teaAgain = applyActivity(tea.pet, 'tea', START + 3_000);
  assert.equal(teaAgain.ok, false);
});

test('занятия открываются по уровню и взросление следует прогрессу', () => {
  const baby = createPet('yaromir', START);
  const locked = applyActivity(baby, 'herbs', START + 1_000);
  assert.equal(locked.ok, false);
  assert.match(locked.reason, /2 уровне/i);

  const experienced = { ...baby, experience: 500 };
  const adult = syncPetState(experienced, START + 1_000);
  assert.equal(getPetLevel(adult), 6);
  assert.equal(adult.stage, 'adult');
});

test('новый термлин сохраняет общий уровень, а этап считается только при его повышении', () => {
  const previous = createPet('yaromir', START, 4_899);
  const adopted = createPet('valkiriya', START + 1_000, previous.experience);
  assert.equal(getPetLevel(adopted), 49);
  assert.equal(adopted.stage, 'adult');
  assert.equal(hasPetAdvancedLevel(previous, adopted), false);
  assert.equal(hasPetAdvancedLevel(adopted, { ...adopted, experience: 4_900 }), true);
  const maxLevelPet = { ...adopted, experience: 4_900 };
  assert.equal(qualifiesPetLevelCompletion(maxLevelPet, maxLevelPet), true);
});

test('имя очищается, ограничивается и попадает в дневник', () => {
  const pet = createPet('yaromir', START);
  const renamed = renamePet(pet, '  Банник   Добрыня  ', START + 1_000);
  assert.equal(renamed.ok, true);
  assert.equal(renamed.pet.name, 'Банник Добрыня');
  assert.equal(renamed.pet.diary[0].title, 'Новое имя');
});

test('термлин уходит, когда хотя бы один показатель падает до нуля', () => {
  const pet = { ...createPet('yaromir', START), hunger: 1, lastUpdated: START };
  const neglected = syncPetState(pet, START + 10 * 60_000);

  assert.equal(neglected.hunger, 0);
  assert.equal(getDepletedPetStat(neglected), 'hunger');
  assert.equal(getDepletedPetStat({ ...neglected, hunger: 1 }), null);
});
