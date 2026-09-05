import assert from 'node:assert/strict';
import test from 'node:test';
import { bathhouses } from '../frontend/src/data/bathhouses.ts';
import { levels as match3Levels } from '../frontend/src/data/levels.ts';
import { getBubbleLevel, getTotalLevels } from '../frontend/src/engine/engine-bubbles/bubbleLevels.ts';
import { getPetLevel, getPetLevelProgress } from '../frontend/src/engine/engine-pet/petEngine.ts';
import {
  GAME_LEVEL_TOTAL,
  getNextPlayableLevel,
  getSlavichLevelTarget,
  isSlavichLevelComplete,
} from '../frontend/src/data/gameProgression.ts';

test('Хоровод и Бирюльки содержат непрерывные 100 уровней', () => {
  assert.equal(GAME_LEVEL_TOTAL, 100);
  assert.equal(match3Levels.length, GAME_LEVEL_TOTAL);
  assert.deepEqual(match3Levels.map(level => level.id), Array.from({ length: 100 }, (_, index) => index + 1));
  assert.deepEqual(bathhouses.at(-1)?.levelsRange, [97, 100]);
  const finalMatch3Level = match3Levels.at(-1);
  assert.equal(finalMatch3Level?.moves, 8);
  assert.deepEqual(finalMatch3Level?.objectives.map(objective => objective.target), [86, 73]);

  assert.equal(getTotalLevels(), GAME_LEVEL_TOTAL);
  for (let id = 1; id <= GAME_LEVEL_TOTAL; id += 1) {
    assert.equal(getBubbleLevel(id)?.id, id);
  }
  assert.equal(getBubbleLevel(GAME_LEVEL_TOTAL + 1), undefined);
});

test('Славич имеет 100 последовательных раундов с реальной целью по очкам', () => {
  assert.equal(getNextPlayableLevel(0), 1);
  assert.equal(getNextPlayableLevel(99), 100);
  assert.equal(getNextPlayableLevel(100), 100);
  assert.equal(getSlavichLevelTarget(1), 64);
  assert.equal(getSlavichLevelTarget(100), 6400);

  for (let level = 1; level <= GAME_LEVEL_TOTAL; level += 1) {
    const target = getSlavichLevelTarget(level);
    assert.equal(isSlavichLevelComplete(target - 1, level), false);
    assert.equal(isSlavichLevelComplete(target, level), true);
    if (level > 1) assert.ok(target > getSlavichLevelTarget(level - 1));
  }
});

test('Пестун растёт до 100 уровня без изменения накопленного опыта', () => {
  assert.equal(getPetLevel({ experience: 0 }), 1);
  assert.equal(getPetLevel({ experience: 9_899 }), 99);
  assert.equal(getPetLevel({ experience: 9_900 }), 100);
  assert.equal(getPetLevel({ experience: 99_999 }), 100);
  assert.deepEqual(getPetLevelProgress({ experience: 9_900 }), { current: 100, max: 100 });
});
