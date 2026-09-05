import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
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
const outputRoot = path.join(projectRoot, 'docs', 'qa', externalBaseUrl ? 'bubbles-production' : 'bubbles');
const port = 43992;
const baseUrl = externalBaseUrl ?? `http://127.0.0.1:${port}`;
const preview = externalBaseUrl
  ? null
  : spawn(process.execPath, [path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
      cwd: frontendRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

let previewOutput = '';
preview?.stdout.on('data', chunk => { previewOutput += chunk.toString(); });
preview?.stderr.on('data', chunk => { previewOutput += chunk.toString(); });

const progress = JSON.stringify({
  currentLevel: 1,
  levels: {},
  currency: 0,
  lives: 5,
  nextLifeAt: null,
  selectedCharacter: 'yaromir',
  tutorialCompleted: true,
  tutorialFlags: ['bubbles-aim', 'bubbles-match'],
  best2048Score: 0,
  bubbleLevelsCompleted: 0,
  pet: null,
  unlockedCharacters: ['yaromir'],
  inventory: {},
  cart: [],
  orders: [],
});
const tutorialProgress = JSON.stringify({ ...JSON.parse(progress), tutorialFlags: [] });

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
    const expectedGuestProbe = text.includes('Failed to load resource') && text.includes('401');
    if (message.type() === 'error' && !expectedGuestProbe) report.consoleErrors.push(`${label}: ${text}`);
  });
  page.on('pageerror', error => report.pageErrors.push(`${label}: ${error.message}`));
  page.on('requestfailed', request => report.requestFailures.push(`${label}: ${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'failed'}`));
}

async function mockGuestAuth(context) {
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
}

async function seedAndOpen(page) {
  await page.addInitScript(value => localStorage.setItem('termliny-progress', value), progress);
  await page.goto(`${baseUrl}/games/bubbles`, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.getByText('Бирюльки — Ур. 1/50', { exact: true }).waitFor();
  await page.waitForTimeout(500);
}

async function getShots(page) {
  return Number(await page.locator('[data-game-secondary-metric]').textContent());
}

async function waitForShotToLand(page) {
  try {
    await page.waitForFunction(() => !document.querySelector('[data-flying-bubble]'), null, { timeout: 8_000 });
  } catch (error) {
    const debug = await page.evaluate(() => {
      const flying = document.querySelector('[data-flying-bubble]');
      const field = document.querySelector('.bubble-field-surface');
      return {
        flyingStyle: flying?.getAttribute('style') ?? null,
        fieldRect: field?.getBoundingClientRect().toJSON() ?? null,
        bubbleCount: field?.querySelectorAll('.venik-bubble').length ?? 0,
      };
    });
    throw new Error(`Бросок не завершился: ${JSON.stringify(debug)}`, { cause: error });
  }
}

async function inspectLayout(page) {
  return page.evaluate(() => {
    const field = document.querySelector('.bubble-field-surface');
    if (!field) throw new Error('Игровое поле не найдено');
    const fieldRect = field.getBoundingClientRect();
    const bubbles = [...field.querySelectorAll('.venik-bubble')];
    const bubbleRects = bubbles.map(bubble => bubble.getBoundingClientRect());
    const colors = new Set(bubbles.map(bubble => bubble.firstElementChild?.getAttribute('style') ?? ''));
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bubbleCount: bubbles.length,
      colorCount: colors.size,
      field: { left: fieldRect.left, right: fieldRect.right, top: fieldRect.top, bottom: fieldRect.bottom },
      bubblesInside: bubbleRects.every(rect => rect.left >= fieldRect.left - 1 && rect.right <= fieldRect.right + 1 && rect.top >= fieldRect.top - 1 && rect.bottom <= fieldRect.bottom + 1),
    };
  });
}

async function runInteractive(browser, report) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await mockGuestAuth(context);
  const page = await context.newPage();
  observe(page, 'webkit-390', report);
  try {
    await seedAndOpen(page);
    const layout = await inspectLayout(page);
    assert.equal(layout.documentWidth, layout.viewportWidth);
    assert.equal(layout.bubbleCount, 33);
    assert.equal(layout.colorCount, 3);
    assert.equal(layout.bubblesInside, true);
    assert.equal(await getShots(page), 29);
    assert.equal(await page.locator('[data-bubbles-daily-limit]').textContent(), 'За день: 0/30');
    assert.equal(await page.getByText('+10 за победу', { exact: true }).isVisible(), true);

    const field = page.locator('.bubble-field-surface');
    assert.equal(await field.locator('.bubble-shooter > div').count(), 1, 'под пусковым шаром не должно быть отдельной подставки');
    const initialPattern = await field.locator('.venik-bubble > div:first-child').evaluateAll(nodes => nodes.map(node => node.getAttribute('style')));
    const box = await field.boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 54);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.03, box.y + box.height * 0.18, { steps: 5 });
    const shotStartedAt = Date.now();
    await page.mouse.up();
    await page.waitForFunction(() => Number(document.querySelector('[data-game-secondary-metric]')?.textContent) === 28);
    await waitForShotToLand(page);
    const flightDuration = Date.now() - shotStartedAt;
    assert.ok(flightDuration < 1800, `бросок с рикошетом должен завершаться быстрее 1800 мс, получено ${flightDuration} мс`);
    assert.equal(await getShots(page), 28);
    const leftAttachedCount = await field.locator('.venik-bubble').count();
    assert.notEqual(leftAttachedCount, 33, 'бросок через левую стенку должен закрепиться или собрать группу');

    await page.getByRole('button', { name: 'Начать заново' }).click();
    await page.waitForTimeout(300);
    assert.equal(await getShots(page), 29);
    const restartedPattern = await field.locator('.venik-bubble > div:first-child').evaluateAll(nodes => nodes.map(node => node.getAttribute('style')));
    assert.deepEqual(restartedPattern, initialPattern);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 54);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.97, box.y + box.height * 0.18, { steps: 5 });
    await page.mouse.up();
    await page.waitForFunction(() => Number(document.querySelector('[data-game-secondary-metric]')?.textContent) === 28);
    await waitForShotToLand(page);
    const rightAttachedCount = await field.locator('.venik-bubble').count();
    assert.notEqual(rightAttachedCount, 33, 'бросок через правую стенку должен закрепиться или собрать группу');

    const smallButtons = await page.locator('button:visible').evaluateAll(buttons => buttons
      .map(button => ({ label: button.getAttribute('aria-label') || button.textContent?.trim(), width: button.getBoundingClientRect().width, height: button.getBoundingClientRect().height }))
      .filter(button => button.width < 44 || button.height < 44));
    assert.deepEqual(smallButtons, []);
    report.layouts.push({ breakpoint: 'webkit-390', flightDuration, ...layout });
    await page.screenshot({ path: path.join(outputRoot, 'webkit-390.png'), fullPage: true });
  } finally {
    await context.close();
  }
}

async function runTutorialVisibility(browser, report) {
  const context = await browser.newContext({ viewport: { width: 390, height: 600 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await mockGuestAuth(context);
  const page = await context.newPage();
  observe(page, 'webkit-390x600-tutorial', report);
  await page.addInitScript(value => localStorage.setItem('termliny-progress', value), tutorialProgress);
  try {
    await page.goto(`${baseUrl}/games/bubbles`, { waitUntil: 'networkidle' });
    await page.getByText('Наведи бросок', { exact: true }).waitFor();
    const geometry = await page.evaluate(() => {
      const field = document.querySelector('.bubble-field-surface');
      const fieldArea = document.querySelector('.bubble-field-area');
      const shooter = document.querySelector('.bubble-shooter');
      const ability = document.querySelector('.character-ability-bar');
      const coach = document.querySelector('.bubble-game-screen__coach');
      if (!field || !fieldArea || !shooter || !ability || !coach) throw new Error('Не найдены элементы игрового поля');
      const fieldRect = field.getBoundingClientRect();
      const areaRect = fieldArea.getBoundingClientRect();
      const shooterRect = shooter.getBoundingClientRect();
      const abilityRect = ability.getBoundingClientRect();
      const visibleElement = document.elementFromPoint(shooterRect.left + shooterRect.width / 2, shooterRect.top + shooterRect.height / 2);
      const coachRect = coach.getBoundingClientRect();
      const previousCoachPointerEvents = coach.style.pointerEvents;
      coach.style.pointerEvents = 'auto';
      const coachElementAtCenter = document.elementFromPoint(coachRect.left + coachRect.width / 2, coachRect.top + coachRect.height / 2);
      coach.style.pointerEvents = previousCoachPointerEvents;
      return {
        fieldBottom: fieldRect.bottom,
        areaBottom: areaRect.bottom,
        shooterTop: shooterRect.top,
        shooterBottom: shooterRect.bottom,
        abilityTop: abilityRect.top,
        shooterVisibleAtCenter: Boolean(visibleElement && shooter.contains(visibleElement)),
        coachVisibleAtCenter: Boolean(coachElementAtCenter && coach.contains(coachElementAtCenter)),
        coachZIndex: getComputedStyle(coach).zIndex,
        fieldAreaZIndex: getComputedStyle(fieldArea).zIndex,
      };
    });
    await page.screenshot({ path: path.join(outputRoot, 'webkit-390x600-tutorial.png'), fullPage: true });
    assert.ok(geometry.shooterBottom <= Math.min(geometry.fieldBottom, geometry.areaBottom) + 1, `пусковой шар обрезан: ${JSON.stringify(geometry)}`);
    assert.ok(geometry.shooterBottom <= geometry.abilityTop + 1, `панель перекрывает шар: ${JSON.stringify(geometry)}`);
    assert.equal(geometry.shooterVisibleAtCenter, true);
    assert.equal(geometry.coachVisibleAtCenter, true, `карточка обучения должна находиться поверх игрового поля: ${JSON.stringify(geometry)}`);
    report.layouts.push({ breakpoint: 'webkit-390x600-tutorial', ...geometry });
  } finally {
    await context.close();
  }
}

async function runSnapshot(browser, viewport, report) {
  const context = await browser.newContext({ viewport });
  await mockGuestAuth(context);
  const page = await context.newPage();
  const label = `chromium-${viewport.width}`;
  observe(page, label, report);
  try {
    await seedAndOpen(page);
    const layout = await inspectLayout(page);
    assert.equal(layout.documentWidth, layout.viewportWidth);
    assert.equal(layout.bubblesInside, true);
    assert.equal(layout.bubbleCount, 33);
    report.layouts.push({ breakpoint: label, ...layout });
    await page.screenshot({ path: path.join(outputRoot, `${label}.png`), fullPage: true });
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
  await runInteractive(webkitBrowser, report);
  await runTutorialVisibility(webkitBrowser, report);
  chromiumBrowser = await chromium.launch({ channel: 'chrome', headless: true });
  await runSnapshot(chromiumBrowser, { width: 375, height: 812 }, report);
  await runSnapshot(chromiumBrowser, { width: 768, height: 1024 }, report);
  await runSnapshot(chromiumBrowser, { width: 1440, height: 900 }, report);
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
