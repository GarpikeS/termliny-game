import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FOUR_GAME_CHALLENGE_ID,
  FOUR_GAME_CHALLENGE_SOURCES,
  addFourGameCompletion,
  createFourGameChallengeProgress,
  getFourGameChallengeCount,
  isFourGameChallengeComplete,
  mergeFourGameChallengeProgress,
  normalizeFourGameChallengeProgress,
} from '../frontend/src/features/rewards/fourGameChallenge.ts';

test('отсутствующий или повреждённый прогресс мигрирует в пустую кампанию v1', () => {
  const empty = { version: 1, completedGames: [] };

  assert.equal(FOUR_GAME_CHALLENGE_ID, 'four-games-v1');
  assert.deepEqual(createFourGameChallengeProgress(), empty);
  assert.deepEqual(normalizeFourGameChallengeProgress(undefined), empty);
  assert.deepEqual(normalizeFourGameChallengeProgress(null), empty);
  assert.deepEqual(normalizeFourGameChallengeProgress('broken'), empty);
  assert.deepEqual(normalizeFourGameChallengeProgress({ version: 9, completedGames: 'match3' }), empty);
});

test('нормализация удаляет неизвестные и повторные игры и возвращает канонический порядок', () => {
  const normalized = normalizeFourGameChallengeProgress({
    version: 0,
    completedGames: ['pet', 'unknown', 'game2048', 'pet', null, 'bubbles'],
  });

  assert.deepEqual(FOUR_GAME_CHALLENGE_SOURCES, ['game2048', 'bubbles', 'pet', 'match3']);
  assert.deepEqual(normalized, {
    version: 1,
    completedGames: ['game2048', 'bubbles', 'pet'],
  });
});

test('повтор одной игры идемпотентен, а четыре разные игры завершают кампанию', () => {
  let progress = createFourGameChallengeProgress();
  progress = addFourGameCompletion(progress, 'game2048');
  progress = addFourGameCompletion(progress, 'game2048');
  progress = addFourGameCompletion(progress, 'unknown-game');

  assert.equal(getFourGameChallengeCount(progress), 1);
  assert.equal(isFourGameChallengeComplete(progress), false);

  progress = addFourGameCompletion(progress, 'bubbles');
  progress = addFourGameCompletion(progress, 'pet');
  progress = addFourGameCompletion(progress, 'match3');

  assert.equal(getFourGameChallengeCount(progress), 4);
  assert.equal(isFourGameChallengeComplete(progress), true);
  assert.deepEqual(progress.completedGames, FOUR_GAME_CHALLENGE_SOURCES);
});

test('слияние прогресса монотонно и не меняет входные значения', () => {
  const guest = { version: 1, completedGames: ['game2048', 'pet'] };
  const account = { version: 1, completedGames: ['bubbles', 'game2048'] };
  const guestSnapshot = structuredClone(guest);
  const accountSnapshot = structuredClone(account);

  const merged = mergeFourGameChallengeProgress(account, guest);
  const mergedAgain = mergeFourGameChallengeProgress(merged, account);

  assert.deepEqual(merged, {
    version: 1,
    completedGames: ['game2048', 'bubbles', 'pet'],
  });
  assert.deepEqual(mergedAgain, merged);
  assert.deepEqual(guest, guestSnapshot);
  assert.deepEqual(account, accountSnapshot);
});
