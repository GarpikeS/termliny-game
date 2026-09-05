import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
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
const port = 43997;
const baseUrl = externalBaseUrl ?? `http://127.0.0.1:${port}`;
const preview = externalBaseUrl ? null : spawn(
  process.execPath,
  [path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { cwd: frontendRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
const outputRoot = path.join(projectRoot, 'docs', 'qa', externalBaseUrl ? 'shop-pilot-production' : 'shop-pilot');

let previewOutput = '';
preview?.stdout.on('data', chunk => { previewOutput += chunk.toString(); });
preview?.stderr.on('data', chunk => { previewOutput += chunk.toString(); });

const baseProgress = {
  currentLevel: 6,
  levels: { 1: { stars: 3, bestScore: 2500, completed: true } },
  currency: 180,
  lives: 5,
  nextLifeAt: null,
  selectedCharacter: 'yaromir',
  tutorialCompleted: true,
  tutorialFlags: [],
  best2048Score: 512,
  bubbleLevelsCompleted: 1,
  pet: null,
  petDeparture: null,
  unlockedCharacters: ['yaromir'],
  inventory: {},
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
    if (message.type() === 'error') report.consoleErrors.push(`${label}: ${message.text()}`);
  });
  page.on('pageerror', error => report.pageErrors.push(`${label}: ${error.message}`));
  page.on('requestfailed', request => report.requestFailures.push(`${label}: ${request.method()} ${request.url()} — ${request.failure()?.errorText ?? 'failed'}`));
}

async function assertNoOverflow(page, label, report) {
  const metrics = await page.evaluate(() => ({
    viewportWidth: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    frameWidth: document.querySelector('.phone-frame')?.getBoundingClientRect().width ?? 0,
  }));
  assert.equal(metrics.documentWidth, metrics.viewportWidth, `${label}: document overflows horizontally`);
  assert.equal(metrics.bodyWidth, metrics.viewportWidth, `${label}: body overflows horizontally`);
  report.layouts.push({ label, ...metrics });
}

async function mockRewards(page, state) {
  await page.route('**/api/rewards/free-hour**', async route => {
    const request = route.request();
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(state.claim ? { available: false, claim: state.claim, nextPurchaseAt: state.claim.nextPurchaseAt } : { available: true }),
      });
      return;
    }
    const payload = request.postDataJSON();
    assert.equal(payload.name, 'Анна');
    assert.equal(payload.city, 'Москва');
    assert.equal(payload.consent, true);
    assert.equal(payload.balance, 180);
    assert.equal(payload.source, 'moscow_cashier');
    const purchasedAt = Date.UTC(2026, 7, 12, 12, 0, 0);
    state.claim = {
      id: 'qa-claim',
      rewardId: 'ticket-free',
      code: 'TB-A1B2C3D4',
      purchasedAt,
      expiresAt: purchasedAt + 7 * 24 * 60 * 60 * 1000,
      nextPurchaseAt: purchasedAt + 7 * 24 * 60 * 60 * 1000,
    };
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ ok: true, claim: state.claim }) });
  });
}

async function mockAccount(page) {
  const account = {
    id: 'qa-shop-account',
    name: 'Анна',
    city: 'Москва',
    phoneMasked: '+7 999 ***-**-67',
    login: null,
    isTest: false,
    createdAt: Date.now() - 86_400_000,
    lastLoginAt: Date.now(),
  };
  await page.route('**/api/auth/config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ available: true, method: 'password', passwordMinLength: 4 }),
  }));
  await page.route('**/api/auth/me', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ account, progress: baseProgress, revision: 1 }),
  }));
  await page.route('**/api/account/progress', async route => {
    const payload = route.request().postDataJSON();
    assert.equal(payload.expectedAccountId, account.id);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ progress: payload.progress, revision: 2, savedAt: Date.now() }),
    });
  });
}

async function verify(browser, label, viewport, report, fullFlow = false) {
  const context = await browser.newContext({ viewport, isMobile: viewport.width <= 430, hasTouch: viewport.width <= 430 });
  const page = await context.newPage();
  const state = { claim: null };
  observe(page, label, report);
  await mockRewards(page, state);
  await mockAccount(page);
  await page.addInitScript(progress => localStorage.setItem('termliny-progress', JSON.stringify(progress)), baseProgress);
  try {
    await page.goto(`${baseUrl}/games`, { waitUntil: 'networkidle' });
    await page.locator('[data-player-status]').waitFor();
    assert.equal(await page.locator('[data-player-status]').getAttribute('aria-label'), 'Открыть профиль Анна');
    assert.equal(await page.getByText(/Гостевой профиль|этот браузер/).count(), 0);
    await assertNoOverflow(page, `${label}-hub`, report);
    await page.screenshot({ path: path.join(outputRoot, `${label}-hub-profile.png`), fullPage: true });
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('[data-player-status]').getAttribute('aria-label'), 'Открыть профиль Анна');

    await page.goto(`${baseUrl}/shop?source=moscow_cashier`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole('heading', { name: 'Магазин' }).waitFor();
    assert.equal(await page.getByText('Сгорит через 7 дней.').isVisible(), true);
    assert.equal(await page.getByRole('heading', { name: 'VIP — бесплатное посещение' }).isVisible(), true);
    assert.equal(await page.getByText('50 термокоинов', { exact: true }).isVisible(), true);
    assert.equal(await page.getByText('Футболка Термлины').count(), 0);
    await assertNoOverflow(page, label, report);
    await page.screenshot({ path: path.join(outputRoot, `${label}-shop.png`), fullPage: true });

    await page.getByRole('button', { name: 'Мерч' }).click();
    await page.getByRole('heading', { name: 'Банная шапка' }).waitFor();
    assert.equal(await page.locator('.shop-merch-card').count(), 1);
    const merchImage = page.locator('.shop-merch-card__image img');
    assert.equal(await merchImage.getAttribute('src'), '/images/shop/merch-bath-hat.webp');
    await merchImage.evaluate(image => {
      if (image.complete && image.naturalWidth > 0) return;
      return new Promise((resolve, reject) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', reject, { once: true });
      });
    });
    assert.deepEqual(await merchImage.evaluate(image => ({ width: image.naturalWidth, height: image.naturalHeight })), { width: 960, height: 960 });
    await page.getByText('6 000 термокоинов', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Купить', exact: true }).click();
    await page.getByText('Не хватает 5820 термокоинов', { exact: true }).waitFor();
    const failedPurchaseProgress = await page.evaluate(() => JSON.parse(localStorage.getItem('termliny-progress')));
    assert.equal(failedPurchaseProgress.currency, 180);
    assert.equal(failedPurchaseProgress.inventory['merch-hat'] ?? 0, 0);
    await page.screenshot({ path: path.join(outputRoot, `${label}-merch-hat.png`), fullPage: true });

    await page.getByRole('button', { name: 'Билеты' }).click();
    await page.getByRole('button', { name: 'Получить', exact: true }).click();
    await page.getByRole('heading', { name: 'Бесплатный час' }).waitFor();
    await page.getByText('50 термокоинов', { exact: true }).waitFor();
    assert.match(await page.locator('.reward-rule-card').textContent(), /Час действует только 7 дней/);
    assert.equal(await page.getByRole('navigation').count(), 0, 'bottom navigation must not cover the claim form');
    await assertNoOverflow(page, `${label}-form`, report);
    await page.screenshot({ path: path.join(outputRoot, `${label}-form.png`), fullPage: true });

    if (fullFlow) {
      await page.getByLabel('Имя').fill('Анна');
      await page.getByRole('textbox', { name: 'Телефон', exact: true }).fill('+7 999 123-45-67');
      await page.getByRole('spinbutton', { name: 'Возраст', exact: true }).fill('64');
      await page.getByRole('checkbox').check();
      await page.getByRole('button', { name: 'Получить за 50' }).click();
      await page.getByText('TB-A1B2C3D4', { exact: true }).waitFor();
      const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('termliny-progress')));
      assert.equal(progress.currency, 130);
      assert.equal(progress.rewardClaims.length, 0, 'reward codes must not be persisted in shared browser storage');
      await Promise.all([
        page.waitForURL('**/profile'),
        page.getByRole('button', { name: 'Открыть профиль' }).click(),
      ]);
      await page.getByRole('heading', { name: 'Профиль', exact: true }).waitFor();
      await page.getByText('TB-A1B2C3D4', { exact: true }).waitFor();
      assert.equal(await page.getByText('Гостевой профиль', { exact: true }).count(), 0);
      assert.equal(await page.getByText('Прогресс хранится только в этом браузере. На другом телефоне пока не появится.', { exact: true }).count(), 0);
      await page.screenshot({ path: path.join(outputRoot, `${label}-profile-storage.png`), fullPage: true });
      for (const gameName of ['Хоровод', 'Славич', 'Бирюльки', 'Пестун']) {
        assert.ok(await page.getByText(gameName, { exact: true }).count() >= 1, `в профиле должно быть название игры «${gameName}»`);
      }
      for (const legacyName of ['Match-3', '2048', 'Шарики', 'Тамагочи']) {
        assert.equal(await page.getByText(legacyName, { exact: true }).count(), 0, `в профиле не должно оставаться названия «${legacyName}»`);
      }
      await page.getByRole('heading', { name: 'Игры', exact: true }).scrollIntoViewIfNeeded();
      await page.locator('img[alt]:not([alt=""])').first().evaluate(image => {
        if (image.complete && image.naturalWidth > 0) return;
        return new Promise((resolve, reject) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', reject, { once: true });
        });
      });
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: path.join(outputRoot, `${label}-profile-reward.png`), fullPage: true });
    }

    await page.goto(`${baseUrl}/bathhouses/1/schedule`, { waitUntil: 'networkidle' });
    const brandLogo = page.locator('.schedule-mobile__brand img');
    assert.equal(await brandLogo.getAttribute('src'), '/images/brand/termburg-fish-96-v2.webp');
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
  chromiumBrowser = await chromium.launch({ channel: 'chrome', headless: true });
  if (existsSync(webkit.executablePath())) {
    webkitBrowser = await webkit.launch({ headless: true });
    await verify(webkitBrowser, 'webkit-390x844', { width: 390, height: 844 }, report, true);
  } else {
    console.warn('WebKit runtime is unavailable; running the mobile purchase flow in Chrome.');
    await verify(chromiumBrowser, 'chromium-390x844', { width: 390, height: 844 }, report, true);
  }
  await verify(chromiumBrowser, 'chromium-375x667', { width: 375, height: 667 }, report);
  await verify(chromiumBrowser, 'chromium-1440x900', { width: 1440, height: 900 }, report);
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
      setTimeout(resolve, 3000);
    });
  }
}
