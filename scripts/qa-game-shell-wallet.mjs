import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const playwrightRoot = [
  process.env.CODEX_PLAYWRIGHT_PATH,
  'C:/Users/vasiv/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright',
  'C:/Claude Code/node_modules/playwright',
].find(candidate => candidate && existsSync(path.join(candidate, 'package.json')));
if (!playwrightRoot) throw new Error('Playwright runtime was not found. Set CODEX_PLAYWRIGHT_PATH.');

const { chromium, webkit } = require(playwrightRoot);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendRoot = path.join(projectRoot, 'frontend');
const externalBaseUrl = process.env.QA_BASE_URL?.replace(/\/$/, '');
const outputRoot = path.join(projectRoot, 'artifacts', externalBaseUrl ? 'qa-game-shell-wallet-production' : 'qa-game-shell-wallet');
const port = 43998;
const baseUrl = externalBaseUrl ?? `http://127.0.0.1:${port}`;
let previewClosing = false;
let previewDiagnostics = '';
const preview = externalBaseUrl ? null : spawn(
  process.execPath,
  [path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { cwd: frontendRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
for (const stream of [preview?.stdout, preview?.stderr]) {
  if (!stream) continue;
  stream.on('data', chunk => {
    previewDiagnostics = `${previewDiagnostics}${chunk}`.slice(-4_000);
  });
}
preview?.on('exit', (code, signal) => {
  if (!previewClosing) {
    console.error(`Vite preview exited early (code=${code}, signal=${signal}).\n${previewDiagnostics}`);
  }
});

function dateKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function progressSeed() {
  const now = Date.now();
  return {
    currentLevel: 1,
    levels: {},
    currency: 37,
    dailyGameRewards: {
      date: dateKey(),
      earned: { match3: 10, game2048: 10, bubbles: 10, pet: 7 },
    },
    fourGameChallenge: { version: 1, completedGames: [] },
    lives: 5,
    nextLifeAt: null,
    selectedCharacter: 'yaromir',
    tutorialCompleted: true,
    tutorialFlags: [
      'four-games-challenge-intro-v1',
      'four-games-portal-tour-v1',
      'game2048-move',
      'game2048-merge',
      'bubbles-aim',
      'bubbles-match',
      'match3-move-level-1',
      'match3-ability-yaromir',
    ],
    best2048Score: 128,
    game2048LevelsCompleted: 0,
    bubbleLevelsCompleted: 0,
    pet: {
      characterId: 'yaromir',
      name: 'Яромир',
      hunger: 80,
      happiness: 80,
      energy: 80,
      cleanliness: 80,
      age: 0,
      stage: 'baby',
      lastUpdated: now,
      cooldowns: {},
      activityCooldowns: {},
      experience: 14,
      bond: 20,
      careStreak: 1,
      lastCareDate: null,
      daily: { date: dateKey(), giftClaimed: false, taskProgress: {}, taskClaimed: [] },
      diary: [],
    },
    petDeparture: null,
    unlockedCharacters: ['yaromir'],
    inventory: {},
    rewardClaims: [],
    cart: [],
    orders: [],
  };
}

async function waitForPreview() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error('Vite preview did not start');
}

async function newPage(browser, viewport, currency = 37, progressOverrides = {}, authSession = null, authDelayMs = 0) {
  const context = await browser.newContext({
    viewport,
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
  });
  await context.route('**/api/auth/config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ available: true, method: 'password', passwordMinLength: 4 }),
  }));
  await context.route('**/api/auth/me', async route => {
    if (authDelayMs > 0) await new Promise(resolve => setTimeout(resolve, authDelayMs));
    await route.fulfill(authSession ? {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(authSession),
    } : {
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Войдите в профиль.' }),
    });
  });
  await context.addInitScript(progress => {
    if (!localStorage.getItem('termliny-progress')) {
      localStorage.setItem('termliny-progress', JSON.stringify(progress));
      localStorage.setItem('termliny-progress-owner', 'guest');
    }
  }, { ...progressSeed(), ...progressOverrides, currency });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(`page: ${error.message}`));
  page.on('console', message => {
    const text = message.text();
    const expectedAuthProbe = message.type() === 'error' && text.includes('401');
    if (message.type() === 'error' && !expectedAuthProbe) runtimeErrors.push(`console: ${text}`);
  });
  return { context, page, runtimeErrors };
}

async function assertNoHorizontalOverflow(page) {
  const widths = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.equal(widths.document, widths.viewport, 'page must not overflow horizontally');
}

async function dispatchSyntheticTouchSwipe(page, dx, dy) {
  await page.locator('.game-2048-board').evaluate((element, vector) => {
    const rect = element.getBoundingClientRect();
    const start = { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    const finish = { clientX: start.clientX + vector.dx, clientY: start.clientY + vector.dy };
    const dispatch = (type, touches, changedTouches) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        touches: { value: touches },
        changedTouches: { value: changedTouches },
      });
      element.dispatchEvent(event);
    };
    dispatch('touchstart', [start], [start]);
    dispatch('touchmove', [finish], [finish]);
    dispatch('touchend', [], [finish]);
  }, { dx, dy });
}

async function dispatchChromiumTouchSwipe(page, dx, dy) {
  const box = await page.locator('.game-2048-board').boundingBox();
  assert.ok(box, 'Славич: игровое поле должно принимать touch-события');
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const finish = { x: start.x + dx, y: start.y + dy };
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [finish] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await session.detach();
  }
}

async function assertStableSlavichLayout(page, engine = 'chromium') {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const initial = await page.evaluate(() => {
    const shell = document.querySelector('.app-shell');
    const frame = document.querySelector('.phone-frame');
    const board = document.querySelector('.game-2048-board');
    const interactionArea = document.querySelector('.game-2048-screen__board-area');
    const shellRect = shell?.getBoundingClientRect();
    const frameRect = frame?.getBoundingClientRect();
    const boardRect = board?.getBoundingClientRect();
    return {
      hasStableClass: shell?.classList.contains('app-shell--stable-game') ?? false,
      inlineViewportHeight: shell instanceof HTMLElement ? shell.style.getPropertyValue('--app-viewport-height') : '',
      touchAction: interactionArea ? getComputedStyle(interactionArea).touchAction : '',
      shell: shellRect && { top: shellRect.top, height: shellRect.height },
      frame: frameRect && { top: frameRect.top, height: frameRect.height },
      board: boardRect && { top: boardRect.top, width: boardRect.width, height: boardRect.height },
    };
  });

  assert.equal(initial.hasStableClass, true, 'Славич: игровая оболочка должна использовать стабильную высоту');
  assert.equal(initial.inlineViewportHeight, '', 'Славич: visualViewport не должен задавать игровую высоту inline');
  assert.equal(initial.touchAction, 'none', 'Славич: свайп не должен передаваться браузерному скроллу');
  assert.ok(initial.shell && initial.frame && initial.board, 'Славич: геометрия экрана должна быть доступна');

  const afterViewportChromeEvent = await page.evaluate(async () => {
    const viewport = window.visualViewport;
    if (!viewport) return null;
    Object.defineProperty(viewport, 'height', {
      configurable: true,
      value: Math.max(320, viewport.height - 96),
    });
    viewport.dispatchEvent(new Event('resize'));
    viewport.dispatchEvent(new Event('scroll'));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const shellRect = document.querySelector('.app-shell')?.getBoundingClientRect();
    const frameRect = document.querySelector('.phone-frame')?.getBoundingClientRect();
    const boardRect = document.querySelector('.game-2048-board')?.getBoundingClientRect();
    return {
      shell: shellRect && { top: shellRect.top, height: shellRect.height },
      frame: frameRect && { top: frameRect.top, height: frameRect.height },
      board: boardRect && { top: boardRect.top, width: boardRect.width, height: boardRect.height },
    };
  });

  if (afterViewportChromeEvent) {
    for (const region of ['shell', 'frame', 'board']) {
      const before = initial[region];
      const after = afterViewportChromeEvent[region];
      assert.ok(before && after, `Славич: область ${region} должна существовать`);
      for (const dimension of Object.keys(before)) {
        assert.ok(
          Math.abs(before[dimension] - after[dimension]) <= 1,
          `Славич: ${region}.${dimension} не должен прыгать при движении адресной панели (до ${before[dimension]}, после ${after[dimension]})`,
        );
      }
    }
  }

  const vectors = [[-56, 0], [0, 56], [56, 0], [0, -56], [-56, 0], [0, 56]];
  for (const [dx, dy] of vectors) {
    if (engine === 'chromium') await dispatchChromiumTouchSwipe(page, dx, dy);
    else await dispatchSyntheticTouchSwipe(page, dx, dy);
    await page.waitForTimeout(60);
    const afterMove = await page.locator('.game-2048-board').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, width: rect.width, height: rect.height };
    });
    for (const dimension of ['top', 'width', 'height']) {
      assert.ok(
        Math.abs(initial.board[dimension] - afterMove[dimension]) <= 1,
        `Славич: поле.${dimension} не должно прыгать между touch-ходами в ${engine}`,
      );
    }
  }
  assert.equal(await page.getByRole('button', { name: 'Отменить последний ход' }).isDisabled(), false, `Славич: touch-свайп должен работать в ${engine}`);
}

async function assertGameShell(page, route, viewport, surfaceSelector, gameTitle, engine = 'chromium') {
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-termburg-app-ready]').waitFor({ state: 'attached' });
  if (route.startsWith('/games/match3/play/')) {
    await page.getByRole('button', { name: 'Играть', exact: true }).click();
  }

  const nav = page.locator('.bottom-nav');
  const status = page.locator('[data-game-status]');
  await nav.waitFor();
  await status.waitFor();
  await page.getByText(gameTitle, { exact: true }).first().waitFor();
  await page.evaluate(() => document.fonts?.ready);
  assert.equal(await page.getByRole('button', { name: 'Игры', exact: true }).getAttribute('aria-current'), 'page');
  assert.equal((await page.locator('[data-global-wallet]').textContent())?.trim(), '37');
  assert.equal((await page.locator('[data-game-wallet-balance]').textContent())?.trim(), '37');
  assert.equal((await page.locator('[data-game-level-current]').textContent())?.trim(), '1');
  assert.equal((await page.locator('[data-game-level-total]').textContent())?.trim(), '50');
  assert.match((await page.locator('[data-game-level]').textContent()) ?? '', /Уровень\s*1 из 50/);

  const geometry = await page.evaluate(selector => {
    const navElement = document.querySelector('.bottom-nav');
    const statusElement = document.querySelector('[data-game-status]');
    const surfaceElement = selector ? document.querySelector(selector) : null;
    const fieldAreaElement = document.querySelector('.bubble-field-area');
    const contentElement = document.querySelector('.phone-screen');
    const navRect = navElement?.getBoundingClientRect();
    const statusRect = statusElement?.getBoundingClientRect();
    const surfaceRect = surfaceElement?.getBoundingClientRect();
    const fieldAreaRect = fieldAreaElement?.getBoundingClientRect();
    const contentRect = contentElement?.getBoundingClientRect();
    return {
      nav: navRect && { top: navRect.top, bottom: navRect.bottom, width: navRect.width },
      status: statusRect && { top: statusRect.top, bottom: statusRect.bottom, width: statusRect.width },
      surface: surfaceRect && { top: surfaceRect.top, bottom: surfaceRect.bottom, width: surfaceRect.width, height: surfaceRect.height },
      fieldArea: fieldAreaRect && {
        top: fieldAreaRect.top,
        bottom: fieldAreaRect.bottom,
        width: fieldAreaRect.width,
        height: fieldAreaRect.height,
        scale: fieldAreaElement?.firstElementChild?.getAttribute('data-bubble-field-scale'),
      },
      content: contentRect && { top: contentRect.top, bottom: contentRect.bottom, width: contentRect.width },
    };
  }, surfaceSelector);

  assert.ok(geometry.nav && geometry.status && geometry.content, `${route}: shell geometry must exist`);
  assert.ok(geometry.nav.width <= viewport.width + 1, `${route}: nav must fit viewport`);
  assert.ok(geometry.status.width <= viewport.width + 1, `${route}: status must fit viewport`);
  assert.ok(geometry.status.bottom <= geometry.nav.top + 1, `${route}: status must stay above nav`);
  if (geometry.surface) {
    assert.ok(
      geometry.surface.bottom <= geometry.nav.top + 1,
      `${route}: game surface must stay above nav (${JSON.stringify(geometry)})`,
    );
    if (route.startsWith('/games/match3/play/') && viewport.width <= 320 && viewport.height <= 568) {
      assert.ok(
        geometry.surface.width >= 210 && geometry.surface.height >= 210,
        `${route}: match-3 board must remain playable on a short phone (${JSON.stringify(geometry.surface)})`,
      );
    }
  }

  if (route === '/games/2048') await assertStableSlavichLayout(page, engine);

  const walletTarget = await page.locator('[data-game-wallet]').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  assert.ok(walletTarget.width >= 44 && walletTarget.height >= 44, `${route}: wallet target must be at least 44×44px`);
  await assertNoHorizontalOverflow(page);
}

async function closePreview() {
  if (!preview) return;
  previewClosing = true;
  if (preview.exitCode === null) preview.kill();
  await new Promise(resolve => {
    if (preview.exitCode !== null) return resolve();
    preview.once('exit', resolve);
    setTimeout(resolve, 3_000);
  });
}

const scenarios = [
  { name: 'slavich', title: 'Славич', route: '/games/2048', surface: '.game-2048-board' },
  { name: 'biryulki', title: 'Бирюльки', route: '/games/bubbles', surface: '.bubble-field-area' },
  { name: 'pestun', title: 'Пестун', route: '/games/pet', surface: null },
  { name: 'horovod', title: 'Хоровод', route: '/games/match3/play/1', surface: '.match3-board' },
];
const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
];

let browser;
let webkitBrowser;
try {
  await fs.mkdir(outputRoot, { recursive: true });
  await waitForPreview();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const viewport of viewports) {
    for (const scenario of scenarios) {
      const { context, page, runtimeErrors } = await newPage(browser, viewport);
      await assertGameShell(page, scenario.route, viewport, scenario.surface, scenario.title);
      await page.screenshot({
        path: path.join(outputRoot, `${scenario.name}-${viewport.width}x${viewport.height}.png`),
        fullPage: true,
      });
      assert.deepEqual(runtimeErrors, [], `${scenario.route}: runtime errors`);
      await page.locator('[data-game-wallet]').click();
      await page.waitForURL('**/shop');
      await context.close();
    }
  }

  {
    const { context, page, runtimeErrors } = await newPage(browser, { width: 390, height: 844 });
    await page.goto(`${baseUrl}/games/match3`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-termburg-app-ready]').waitFor({ state: 'attached' });
    const bathhouseButtons = page.locator('.scene-canvas button[aria-label]');
    assert.equal(await bathhouseButtons.count(), 10, 'Хоровод: карта должна содержать десять глав по 5 уровней');
    await bathhouseButtons.last().waitFor({ state: 'visible' });
    await page.waitForTimeout(900);
    await page.screenshot({
      path: path.join(outputRoot, 'horovod-bathhouse-map-390x844.png'),
      fullPage: true,
    });
    await page.goto(`${baseUrl}/games/match3/levels/10`, { waitUntil: 'domcontentloaded' });
    const finalBathhouseLevels = page.locator('.scene-canvas button[aria-label^="Уровень "]');
    await page.getByRole('button', { name: /^Уровень 46:/ }).waitFor();
    assert.equal(await finalBathhouseLevels.count(), 5, 'Хоровод: в десятой главе должны быть уровни 46–50');
    await page.getByRole('button', { name: /^Уровень 50:/ }).waitFor();
    await page.goto(`${baseUrl}/games/match3/play/51`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Уровень не найден', { exact: true }).waitFor();
    assert.deepEqual(runtimeErrors, [], 'Хоровод: карта и граница 50-го уровня');
    await context.close();
  }

  {
    const { context, page, runtimeErrors } = await newPage(browser, { width: 390, height: 844 });
    await page.goto(`${baseUrl}/games/2048`, { waitUntil: 'domcontentloaded' });
    const completedHeading = page.getByRole('heading', { name: 'Уровень 1 из 50 пройден!', exact: true });
    const directions = ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'];
    for (let move = 0; move < 160 && !(await completedHeading.isVisible()); move += 1) {
      await page.keyboard.press(directions[move % directions.length]);
    }
    await completedHeading.waitFor();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('termliny-progress') ?? '{}').game2048LevelsCompleted === 1);
    const scoreBeforeNextLevel = Number((await page.locator('[data-game-current-metric]').textContent())?.replace(/\D/g, ''));
    assert.ok(scoreBeforeNextLevel >= 64, 'Славич: completed level must have a real score');
    await page.getByRole('button', { name: 'Продолжить — уровень 2', exact: true }).click();
    await page.locator('[data-game-level-current]').getByText('2', { exact: true }).waitFor();
    const scoreAfterNextLevel = Number((await page.locator('[data-game-current-metric]').textContent())?.replace(/\D/g, ''));
    assert.equal(scoreAfterNextLevel, scoreBeforeNextLevel, 'Славич: next level must continue the current board and score');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-game-level-current]').getByText('2', { exact: true }).waitFor();
    assert.deepEqual(runtimeErrors, [], 'Славич: level completion and reload errors');
    await context.close();
  }

  {
    const { context, page, runtimeErrors } = await newPage(
      browser,
      { width: 390, height: 844 },
      37,
      { bubbleLevelsCompleted: 49 },
    );
    await page.goto(`${baseUrl}/games/bubbles`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-game-level-current]').getByText('50', { exact: true }).waitFor();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-game-level-current]').getByText('50', { exact: true }).waitFor();
    assert.deepEqual(runtimeErrors, [], 'Бирюльки: saved level resume errors');
    await context.close();
  }

  {
    const { context, page, runtimeErrors } = await newPage(
      browser,
      { width: 390, height: 844 },
      37,
      {
        pet: null,
        petDeparture: {
          adoptionId: 'pet-yaromir-departed',
          characterId: 'yaromir',
          name: 'Яромир',
          depletedStat: 'energy',
          departedAt: Date.now() - 1_000,
          experience: 9_899,
        },
      },
    );
    await page.goto(`${baseUrl}/games/pet`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-game-level-current]').getByText('50', { exact: true }).waitFor();
    assert.equal((await page.locator('[data-game-current-metric]').textContent())?.trim(), '100/100');
    await page.goto(`${baseUrl}/profile`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Уровень 50 из 50', { exact: true }).waitFor();
    assert.deepEqual(runtimeErrors, [], 'Пестун: retained departure level errors');
    await context.close();
  }

  {
    const { context, page, runtimeErrors } = await newPage(browser, { width: 390, height: 844 }, 50);
    await page.goto(`${baseUrl}/games/2048`, { waitUntil: 'domcontentloaded' });
    const wallet = page.locator('[data-game-wallet]');
    await wallet.waitFor();
    assert.equal(await wallet.getAttribute('data-wallet-goal-reached'), 'true');
    assert.match(await wallet.getAttribute('aria-label') ?? '', /Накоплено достаточно для цели 50/);
    await wallet.click();
    await page.waitForURL('**/shop');
    assert.deepEqual(runtimeErrors, []);
    await context.close();
  }

  {
    const viewport = { width: 320, height: 568 };
    const { context, page, runtimeErrors } = await newPage(
      browser,
      viewport,
      1_000_000,
      {
        game2048LevelsCompleted: 99,
        best2048Score: 100_000_000,
        currentLevel: 117,
        levels: {
          50: { stars: 3, bestScore: 12_000, completed: true },
          51: { stars: 3, bestScore: 12_500, completed: true },
          116: { stars: 3, bestScore: 15_000, completed: true },
        },
      },
    );
    await page.goto(`${baseUrl}/games/2048`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-game-level-current]').getByText('50', { exact: true }).waitFor();
    const statusValuesFit = await page.evaluate(() => {
      const wallet = document.querySelector('[data-game-wallet-balance]');
      const level = document.querySelector('[data-game-level] strong');
      return {
        walletText: wallet?.textContent ?? '',
        walletFits: Boolean(wallet && wallet.scrollWidth <= wallet.clientWidth + 1),
        levelFits: Boolean(level && level.scrollWidth <= level.clientWidth + 1),
      };
    });
    assert.equal(Number(statusValuesFit.walletText.replace(/\D/g, '')), 1_000_000);
    assert.ok(statusValuesFit.walletFits, 'large wallet balance must remain fully visible');
    assert.ok(statusValuesFit.levelFits, 'level 50 of 50 must remain fully visible');
    const storedMatch3LevelIds = await page.evaluate(() => (
      Object.keys(JSON.parse(localStorage.getItem('termliny-progress') ?? '{}').levels ?? {}).map(Number)
    ));
    assert.deepEqual(storedMatch3LevelIds, [50], 'legacy Match-3 levels above 50 must be removed');
    assert.deepEqual(
      await page.evaluate(() => JSON.parse(localStorage.getItem('termliny-progress') ?? '{}').fourGameChallenge?.completedGames),
      ['game2048', 'match3'],
      'legacy completions must remain eligible for the four-game challenge',
    );
    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      path: path.join(outputRoot, 'slavich-level-50-large-wallet-320x568.png'),
      fullPage: true,
    });
    assert.deepEqual(runtimeErrors, [], 'max level and large wallet errors');
    await context.close();
  }

  {
    const serverProgress = {
      ...progressSeed(),
      currency: 321,
      currentLevel: 117,
      dailyGameRewards: {
        date: '2000-01-01',
        earned: { match3: 30, game2048: 20, bubbles: 10, pet: 0 },
      },
      levels: {
        50: { stars: 3, bestScore: 12_000, completed: true },
        51: { stars: 3, bestScore: 12_500, completed: true },
      },
      game2048LevelsCompleted: 99,
      bubbleLevelsCompleted: 99,
    };
    const authSession = {
      account: {
        id: 'qa-account-level-hydration',
        name: 'Анна',
        city: 'Владивосток',
        phoneMasked: '+7 ••• •••-45-67',
        login: null,
        isTest: true,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      },
      progress: serverProgress,
      revision: 7,
    };
    const { context, page, runtimeErrors } = await newPage(
      browser,
      { width: 390, height: 844 },
      37,
      {},
      authSession,
      250,
    );
    await page.goto(`${baseUrl}/games/bubbles`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-game-level-current]').getByText('50', { exact: true }).waitFor();
    assert.equal(Number((await page.locator('[data-game-wallet-balance]').textContent())?.replace(/\D/g, '')), 321);
    const hydratedProgress = await page.evaluate(() => JSON.parse(localStorage.getItem('termliny-progress') ?? '{}'));
    assert.equal(hydratedProgress.currentLevel, 51);
    assert.equal(hydratedProgress.game2048LevelsCompleted, 50);
    assert.equal(hydratedProgress.bubbleLevelsCompleted, 50);
    assert.deepEqual(Object.keys(hydratedProgress.levels ?? {}).map(Number), [50]);
    assert.deepEqual(hydratedProgress.dailyGameRewards, serverProgress.dailyGameRewards);
    assert.deepEqual(hydratedProgress.fourGameChallenge?.completedGames, ['game2048', 'bubbles', 'match3']);
    assert.equal(
      await page.evaluate(() => localStorage.getItem('termliny-progress-owner')),
      'account:qa-account-level-hydration',
      'server progress must own the first mounted game round',
    );
    assert.deepEqual(runtimeErrors, [], 'delayed account hydration errors');
    await context.close();
  }

  {
    webkitBrowser = await webkit.launch({ headless: true });
    const viewport = { width: 390, height: 844 };
    const { context, page, runtimeErrors } = await newPage(webkitBrowser, viewport);
    await assertGameShell(page, '/games/2048', viewport, '.game-2048-board', 'Славич', 'webkit');
    assert.deepEqual(runtimeErrors, [], 'Славич: WebKit mobile layout errors');
    await context.close();
  }
  console.log('game shell and wallet browser QA passed');
} finally {
  if (webkitBrowser) await webkitBrowser.close();
  if (browser) await browser.close();
  await closePreview();
}
