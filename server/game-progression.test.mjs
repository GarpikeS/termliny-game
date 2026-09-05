import assert from 'node:assert/strict';
import test from 'node:test';
import { bathhouses } from '../frontend/src/data/bathhouses.ts';
import { getLevelsForBathhouse, levels as match3Levels } from '../frontend/src/data/levels.ts';
import { getBubbleLevel, getTotalLevels } from '../frontend/src/engine/engine-bubbles/bubbleLevels.ts';
import { getPetLevel, getPetLevelProgress } from '../frontend/src/engine/engine-pet/petEngine.ts';
import {
  GAME_LEVEL_TOTAL,
  getNextPlayableLevel,
  getSlavichLevelTarget,
  isSlavichLevelComplete,
} from '../frontend/src/data/gameProgression.ts';

test('Хоровод и Бирюльки содержат непрерывные 50 уровней', () => {
  assert.equal(GAME_LEVEL_TOTAL, 50);
  assert.equal(match3Levels.length, GAME_LEVEL_TOTAL);
  assert.deepEqual(match3Levels.map(level => level.id), Array.from({ length: GAME_LEVEL_TOTAL }, (_, index) => index + 1));
  assert.equal(bathhouses.length, 10);
  assert.deepEqual(
    bathhouses.map(bathhouse => bathhouse.levelsRange),
    Array.from({ length: 10 }, (_, index) => [index * 5 + 1, (index + 1) * 5]),
  );
  for (const bathhouse of bathhouses) {
    assert.deepEqual(
      getLevelsForBathhouse(bathhouse.id).map(level => level.id),
      Array.from({ length: 5 }, (_, index) => bathhouse.levelsRange[0] + index),
    );
  }
  const finalMatch3Level = match3Levels.at(-1);
  assert.equal(finalMatch3Level?.moves, 6);
  assert.deepEqual(finalMatch3Level?.objectives.map(objective => objective.target), [42, 35]);

  assert.equal(getTotalLevels(), GAME_LEVEL_TOTAL);
  for (let id = 1; id <= GAME_LEVEL_TOTAL; id += 1) {
    assert.equal(getBubbleLevel(id)?.id, id);
  }
  assert.equal(getBubbleLevel(GAME_LEVEL_TOTAL + 1), undefined);
});

test('Славич имеет 50 последовательных раундов с реальной целью по очкам', () => {
  assert.equal(getNextPlayableLevel(0), 1);
  assert.equal(getNextPlayableLevel(49), 50);
  assert.equal(getNextPlayableLevel(50), 50);
  assert.equal(getNextPlayableLevel(100), 50);
  assert.equal(getSlavichLevelTarget(1), 64);
  assert.equal(getSlavichLevelTarget(50), 3200);

  for (let level = 1; level <= GAME_LEVEL_TOTAL; level += 1) {
    const target = getSlavichLevelTarget(level);
    assert.equal(isSlavichLevelComplete(target - 1, level), false);
    assert.equal(isSlavichLevelComplete(target, level), true);
    if (level > 1) assert.ok(target > getSlavichLevelTarget(level - 1));
  }
});

test('Пестун растёт до 50 уровня без изменения накопленного опыта', () => {
  assert.equal(getPetLevel({ experience: 0 }), 1);
  assert.equal(getPetLevel({ experience: 4_899 }), 49);
  assert.equal(getPetLevel({ experience: 4_900 }), 50);
  assert.equal(getPetLevel({ experience: 99_999 }), 50);
  assert.deepEqual(getPetLevelProgress({ experience: 4_900 }), { current: 100, max: 100 });
});
