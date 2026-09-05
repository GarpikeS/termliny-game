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
const preview = spawn(
  process.execPath,
  [path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { cwd: frontendRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);

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

async function newPage(browser, viewport, currency = 37) {
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
  await context.route('**/api/auth/me', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Войдите в профиль.' }),
  }));
  await context.addInitScript(progress => {
    localStorage.setItem('termliny-progress', JSON.stringify(progress));
    localStorage.setItem('termliny-progress-owner', 'guest');
  }, { ...progressSeed(), currency });
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
  await page.getByText('Цель 50 · бесплатный час', { exact: true }).waitFor();
  await page.getByText('До цели ещё 13', { exact: true }).waitFor();

  const geometry = await page.evaluate(selector => {
    const navElement = document.querySelector('.bottom-nav');
    const statusElement = document.querySelector('[data-game-status]');
    const surfaceElement = selector ? document.querySelector(selector) : null;
    const contentElement = document.querySelector('.phone-screen');
    const navRect = navElement?.getBoundingClientRect();
    const statusRect = statusElement?.getBoundingClientRect();
    const surfaceRect = surfaceElement?.getBoundingClientRect();
    const contentRect = contentElement?.getBoundingClientRect();
    return {
      nav: navRect && { top: navRect.top, bottom: navRect.bottom, width: navRect.width },
      status: statusRect && { top: statusRect.top, bottom: statusRect.bottom, width: statusRect.width },
      surface: surfaceRect && { top: surfaceRect.top, bottom: surfaceRect.bottom, width: surfaceRect.width, height: surfaceRect.height },
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
  if (preview.exitCode === null) preview.kill();
  await new Promise(resolve => {
    if (preview.exitCode !== null) return resolve();
    preview.once('exit', resolve);
    setTimeout(resolve, 3_000);
  });
}

const scenarios = [
  { name: 'slavich', route: '/games/2048', surface: '.game-2048-board' },
  { name: 'biryulki', route: '/games/bubbles', surface: '.bubble-field-surface' },
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
    const { context, page, runtimeErrors } = await newPage(browser, { width: 390, height: 844 }, 50);
    await page.goto(`${baseUrl}/games/2048`, { waitUntil: 'domcontentloaded' });
    const wallet = page.locator('[data-game-wallet]');
    await wallet.waitFor();
    assert.equal(await wallet.getAttribute('data-wallet-goal-reached'), 'true');
    await wallet.getByText('Накоплено 50 · проверить', { exact: true }).waitFor();
    await wallet.click();
    await page.waitForURL('**/shop');
    assert.deepEqual(runtimeErrors, []);
    await context.close();
  }
  console.log('game shell and wallet browser QA passed');
} finally {
  if (browser) await browser.close();
  await closePreview();
}
