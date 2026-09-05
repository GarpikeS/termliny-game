import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
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
const port = 43995;
const baseUrl = externalBaseUrl ?? `http://127.0.0.1:${port}`;
const preview = externalBaseUrl ? null : spawn(
  process.execPath,
  [path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { cwd: frontendRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
const outputRoot = path.join(projectRoot, 'docs', 'qa', externalBaseUrl ? 'game-feedback-production' : 'game-feedback');

let previewOutput = '';
preview?.stdout.on('data', chunk => { previewOutput += chunk.toString(); });
preview?.stderr.on('data', chunk => { previewOutput += chunk.toString(); });

const baseProgress = {
  currentLevel: 3,
  levels: { 1: { stars: 2, bestScore: 1500, completed: true } },
  currency: 0,
  lives: 4,
  nextLifeAt: Date.now() + 15 * 60 * 1000,
  selectedCharacter: 'yaromir',
  tutorialCompleted: true,
  tutorialFlags: ['match3-move-level-1', 'match3-ability-yaromir', 'game2048-move', 'game2048-merge', 'bubbles-aim', 'bubbles-match'],
  best2048Score: 1148,
  game2048LevelsCompleted: 0,
  bubbleLevelsCompleted: 0,
  pet: null,
  petDeparture: null,
  unlockedCharacters: ['yaromir'],
  inventory: { 'booster-hint': 1, 'booster-shuffle': 1, 'booster-bomb': 1 },
  rewardClaims: [],
  cart: [],
  orders: [],
};

async function waitForSite() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Preview did not start. ${previewOutput}`);
}

function observe(page, label, report) {
  page.on('console', message => {
    const text = message.text();
    const expectedAuthProbe = message.type() === 'error' && text.includes('401');
    if (message.type() === 'error' && !expectedAuthProbe) report.consoleErrors.push(`${label}: ${text}`);
  });
  page.on('pageerror', error => report.pageErrors.push(`${label}: ${error.message}`));
  page.on('requestfailed', request => report.requestFailures.push(`${label}: ${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'failed'}`));
}

async function seed(page, progress = baseProgress) {
  await page.route('**/api/auth/config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ available: true, method: 'password', passwordMinLength: 4 }),
  }));
  await page.route('**/api/auth/me', route => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Войдите в профиль.' }),
  }));
  await page.addInitScript(value => localStorage.setItem('termliny-progress', JSON.stringify(value)), progress);
}

async function verify2048(browser, label, viewport, report) {
  const context = await browser.newContext({ viewport, isMobile: viewport.width <= 430, hasTouch: viewport.width <= 430 });
  const page = await context.newPage();
  observe(page, label, report);
  try {
    await seed(page);
    await page.goto(`${baseUrl}/games/2048`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);

    const soundPreference = await page.evaluate(() => localStorage.getItem('termliny-sound-enabled'));
    assert.equal(soundPreference, null, 'первый запуск не должен молча включать звук');
    await page.getByLabel('Жизни: 4 из 5').waitFor();
    assert.equal(await page.locator('[data-slavich-daily-limit]').textContent(), 'Лимит за день: 0/30');

    const undo = page.getByRole('button', { name: 'Отменить последний ход' });
    assert.equal(await undo.isDisabled(), true);
    const boardBefore = await page.locator('.game-2048-tile').evaluateAll(nodes => nodes.map(node => node.textContent).sort());
    let moved = false;
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
      await page.keyboard.press(key);
      if (!(await undo.isDisabled())) {
        moved = true;
        break;
      }
    }
    assert.equal(moved, true, 'не удалось сделать проверяемый ход 2048');
    await undo.click();
    assert.equal(await undo.isDisabled(), true);
    const boardAfterUndo = await page.locator('.game-2048-tile').evaluateAll(nodes => nodes.map(node => node.textContent).sort());
    assert.deepEqual(boardAfterUndo, boardBefore, 'отмена должна вернуть ровно предыдущее поле');

    await page.getByRole('button', { name: 'Перезапустить игру' }).click();
    await page.getByRole('heading', { name: 'Начать игру заново?' }).waitFor();
    assert.equal(await page.getByText('Поле и текущие очки будут сброшены.', { exact: false }).isVisible(), true);
    await page.getByRole('button', { name: 'Оставить' }).click();

    const layout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    assert.equal(layout.document, layout.viewport);
    report.layouts.push({ label, ...layout });
    await page.screenshot({ path: path.join(outputRoot, `${label}.png`), fullPage: true });
  } finally {
    await context.close();
  }
}

async function verifyMatch3Training(browser, report) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  observe(page, 'webkit-match3-level-2', report);
  try {
    await seed(page);
    await page.goto(`${baseUrl}/games/match3/play/2`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Играть' }).click();
    await page.waitForTimeout(900);
    assert.equal(await page.getByText('Собери три', { exact: true }).count(), 0, 'базовая подсказка не должна повторяться на втором уровне');
    assert.equal(await page.evaluate(() => localStorage.getItem('termliny-sound-enabled')), null);
    const movesBeforeAbility = Number(await page.locator('[data-game-moves]').textContent());
    await page.locator('.game-hud__character--ready').click();
    await page.waitForTimeout(100);
    const movesAfterAbility = Number(await page.locator('[data-game-moves]').textContent());
    assert.equal(movesAfterAbility, movesBeforeAbility + 2, 'Жар пара должен начислять два хода при нажатии на портрет');
    assert.equal(await page.locator('.game-gem').evaluateAll(nodes => nodes.filter(node => node.querySelector('.ring-yellow-300')).length), 2);
    await page.getByRole('button', { name: 'Подсказка. Осталось: 1' }).click();
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.game-gem').evaluateAll(nodes => nodes.filter(node => node.querySelector('.ring-yellow-300')).length), 2);
    await page.getByRole('button', { name: 'Перемешать. Осталось: 1' }).click();
    await page.getByRole('button', { name: 'Взрыв 3 на 3. Осталось: 1' }).click();
    await page.locator('.game-gem').first().click();
    await page.waitForTimeout(1100);
    const inventory = await page.evaluate(() => JSON.parse(localStorage.getItem('termliny-progress')).inventory);
    assert.deepEqual(inventory, { 'booster-hint': 0, 'booster-shuffle': 0, 'booster-bomb': 0 });
    const layout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    assert.equal(layout.document, layout.viewport);
    report.layouts.push({ label: 'webkit-match3-level-2', ...layout });
    await page.screenshot({ path: path.join(outputRoot, 'webkit-match3-level-2.png'), fullPage: true });
  } finally {
    await context.close();
  }
}

async function verifyBubbles(browser, report) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  observe(page, 'webkit-bubbles', report);
  try {
    await seed(page);
    await page.goto(`${baseUrl}/games/bubbles`, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { name: 'Бирюльки', exact: true }).waitFor();
    await page.getByText('1 из 100', { exact: true }).waitFor();
    await page.getByLabel('Жизни: 4 из 5').waitFor();
    assert.equal(await page.locator('[data-bubbles-shots]').textContent(), '29');
    const layout = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    assert.equal(layout.document, layout.viewport);
    report.layouts.push({ label: 'webkit-bubbles', ...layout });
    await page.screenshot({ path: path.join(outputRoot, 'webkit-bubbles.png'), fullPage: true });
  } finally {
    await context.close();
  }
}

const report = { consoleErrors: [], pageErrors: [], requestFailures: [], layouts: [] };
let chromiumBrowser;
let webkitBrowser;
try {
  await mkdir(outputRoot, { recursive: true });
  await waitForSite();
  try {
    webkitBrowser = await webkit.launch({ headless: true });
  } catch (error) {
    if (!String(error).includes('Executable doesn\'t exist')) throw error;
    webkitBrowser = await chromium.launch({ channel: 'chrome', headless: true });
  }
  await verify2048(webkitBrowser, 'webkit-390-2048', { width: 390, height: 844 }, report);
  await verifyMatch3Training(webkitBrowser, report);
  await verifyBubbles(webkitBrowser, report);
  chromiumBrowser = await chromium.launch({ channel: 'chrome', headless: true });
  await verify2048(chromiumBrowser, 'chromium-375-2048', { width: 375, height: 812 }, report);
  await verify2048(chromiumBrowser, 'chromium-1440-2048', { width: 1440, height: 900 }, report);
  assert.deepEqual(report.consoleErrors, []);
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.requestFailures, []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (chromiumBrowser) await chromiumBrowser.close();
  if (webkitBrowser) await webkitBrowser.close();
  if (preview) {
    preview.kill();
    await new Promise(resolve => {
      if (preview.exitCode !== null) return resolve();
      preview.once('exit', resolve);
      setTimeout(resolve, 3_000);
    });
  }
}
