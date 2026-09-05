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

const { chromium } = require(playwrightRoot);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendRoot = path.join(projectRoot, 'frontend');
const outputRoot = path.join(projectRoot, 'artifacts', 'qa-game-shell-wallet');
const port = 43998;
const baseUrl = `http://127.0.0.1:${port}`;
let previewClosing = false;
let previewDiagnostics = '';
const preview = spawn(
  process.execPath,
  [path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { cwd: frontendRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
for (const stream of [preview.stdout, preview.stderr]) {
  stream.on('data', chunk => {
    previewDiagnostics = `${previewDiagnostics}${chunk}`.slice(-4_000);
  });
}
preview.on('exit', (code, signal) => {
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

async function assertGameShell(page, route, viewport, surfaceSelector) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-termburg-app-ready]').waitFor({ state: 'attached' });
  if (route.startsWith('/games/match3/play/')) {
    await page.getByRole('button', { name: 'Играть', exact: true }).click();
  }

  const nav = page.locator('.bottom-nav');
  const status = page.locator('[data-game-status]');
  await nav.waitFor();
  await status.waitFor();
  assert.equal(await page.getByRole('button', { name: 'Игры', exact: true }).getAttribute('aria-current'), 'page');
  assert.equal((await page.locator('[data-global-wallet]').textContent())?.trim(), '37');
  assert.equal((await page.locator('[data-game-wallet-balance]').textContent())?.trim(), '37');
  assert.equal((await page.locator('[data-game-level-current]').textContent())?.trim(), '1');
  assert.equal((await page.locator('[data-game-level-total]').textContent())?.trim(), '100');
  assert.match((await page.locator('[data-game-level]').textContent()) ?? '', /Уровень\s*1 из 100/);

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

  const walletTarget = await page.locator('[data-game-wallet]').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  assert.ok(walletTarget.width >= 44 && walletTarget.height >= 44, `${route}: wallet target must be at least 44×44px`);
  await assertNoHorizontalOverflow(page);
}

async function closePreview() {
  previewClosing = true;
  if (preview.exitCode === null) preview.kill();
  await new Promise(resolve => {
    if (preview.exitCode !== null) return resolve();
    preview.once('exit', resolve);
    setTimeout(resolve, 3_000);
  });
}

const scenarios = [
  { name: 'slavich', route: '/games/2048', surface: '.game-2048-board' },
  { name: 'biryulki', route: '/games/bubbles', surface: '.bubble-field-area' },
  { name: 'pestun', route: '/games/pet', surface: null },
  { name: 'horovod', route: '/games/match3/play/1', surface: '.match3-board' },
];
const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
];

let browser;
try {
  await fs.mkdir(outputRoot, { recursive: true });
  await waitForPreview();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const viewport of viewports) {
    for (const scenario of scenarios) {
      const { context, page, runtimeErrors } = await newPage(browser, viewport);
      await assertGameShell(page, scenario.route, viewport, scenario.surface);
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
    await page.goto(`${baseUrl}/games/2048`, { waitUntil: 'domcontentloaded' });
    const completedHeading = page.getByRole('heading', { name: 'Уровень 1 из 100 пройден!', exact: true });
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
    await page.locator('[data-game-level-current]').getByText('99', { exact: true }).waitFor();
    assert.equal((await page.locator('[data-game-current-metric]').textContent())?.trim(), '99/100');
    await page.goto(`${baseUrl}/profile`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Уровень 99 из 100', { exact: true }).waitFor();
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
          100: { stars: 3, bestScore: 12_000, completed: true },
          101: { stars: 3, bestScore: 12_500, completed: true },
          116: { stars: 3, bestScore: 15_000, completed: true },
        },
      },
    );
    await page.goto(`${baseUrl}/games/2048`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-game-level-current]').getByText('100', { exact: true }).waitFor();
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
    assert.ok(statusValuesFit.levelFits, 'level 100 of 100 must remain fully visible');
    const storedMatch3LevelIds = await page.evaluate(() => (
      Object.keys(JSON.parse(localStorage.getItem('termliny-progress') ?? '{}').levels ?? {}).map(Number)
    ));
    assert.deepEqual(storedMatch3LevelIds, [100], 'legacy Match-3 levels above 100 must be removed');
    await assertNoHorizontalOverflow(page);
    await page.screenshot({
      path: path.join(outputRoot, 'slavich-level-100-large-wallet-320x568.png'),
      fullPage: true,
    });
    assert.deepEqual(runtimeErrors, [], 'max level and large wallet errors');
    await context.close();
  }

  {
    const serverProgress = {
      ...progressSeed(),
      currency: 321,
      bubbleLevelsCompleted: 49,
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
    assert.equal(
      await page.evaluate(() => localStorage.getItem('termliny-progress-owner')),
      'account:qa-account-level-hydration',
      'server progress must own the first mounted game round',
    );
    assert.deepEqual(runtimeErrors, [], 'delayed account hydration errors');
    await context.close();
  }
  console.log('game shell and wallet browser QA passed');
} finally {
  if (browser) await browser.close();
  await closePreview();
}
