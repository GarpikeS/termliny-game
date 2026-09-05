import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
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
const outputRoot = path.join(projectRoot, 'artifacts', 'qa-four-game-challenge');
const port = 43997;
const baseUrl = `http://127.0.0.1:${port}`;
const preview = spawn(
  process.execPath,
  [path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
  { cwd: frontendRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);

function baseProgress(overrides = {}) {
  return {
    currentLevel: 1,
    levels: {},
    currency: 0,
    dailyGameRewards: {
      date: '2026-09-05',
      earned: { match3: 0, game2048: 0, bubbles: 0, pet: 0 },
    },
    fourGameChallenge: { version: 1, completedGames: [] },
    lives: 5,
    nextLifeAt: null,
    selectedCharacter: 'yaromir',
    tutorialCompleted: true,
    tutorialFlags: [],
    best2048Score: 0,
    bubbleLevelsCompleted: 0,
    pet: null,
    petDeparture: null,
    unlockedCharacters: ['yaromir'],
    inventory: {},
    rewardClaims: [],
    cart: [],
    orders: [],
    ...overrides,
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

async function createScenario(browser, {
  progress,
  progressOwner = 'guest',
  viewport = { width: 390, height: 844 },
  reducedMotion = 'no-preference',
  accountSession = null,
  accountProbeStatus = null,
  loginResponse = null,
  rewardStatus = { available: true },
  requestOrder = null,
  syncAccountIds = null,
}) {
  const context = await browser.newContext({
    viewport,
    reducedMotion,
    isMobile: viewport.width <= 430,
    hasTouch: viewport.width <= 430,
  });
  await context.route('**/api/auth/config', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ available: true, method: 'password', passwordMinLength: 4 }),
  }));
  await context.route('**/api/auth/me', route => route.fulfill({
    status: accountSession ? 200 : (accountProbeStatus ?? 401),
    contentType: 'application/json',
    body: JSON.stringify(accountSession ?? {
      error: accountProbeStatus ? 'Сервис профиля временно недоступен.' : 'Войдите в профиль.',
    }),
  }));
  if (loginResponse) {
    await context.route('**/api/auth/login', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(loginResponse),
    }));
  }
  await context.route('**/api/account/progress', async route => {
    requestOrder?.push('sync');
    const body = route.request().postDataJSON();
    syncAccountIds?.push(body.expectedAccountId);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ progress: body.progress, revision: 2, savedAt: Date.now() }),
    });
  });
  await context.route('**/api/rewards/free-hour**', async route => {
    if (route.request().method() === 'POST') {
      requestOrder?.push('claim');
      const now = Date.now();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          claim: {
            id: 'qa-campaign-claim',
            rewardId: 'ticket-free',
            campaignId: 'four-games-v1',
            code: 'TB-QA12AB34',
            purchasedAt: now,
            expiresAt: now + 604_800_000,
            nextPurchaseAt: now + 604_800_000,
            status: 'active',
          },
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(rewardStatus),
    });
  });
  await context.addInitScript(seed => {
    if (!sessionStorage.getItem('termburg-qa-progress-seeded')) {
      localStorage.setItem('termliny-progress', JSON.stringify(seed.progress));
      if (seed.owner === null) localStorage.removeItem('termliny-progress-owner');
      else localStorage.setItem('termliny-progress-owner', seed.owner);
      sessionStorage.setItem('termburg-qa-progress-seeded', '1');
    }
  }, { progress, owner: progressOwner });

  const page = await context.newPage();
  const runtimeErrors = [];
  page.on('console', message => {
    const text = message.text();
    const expectedAuthProbe = text.includes('Failed to load resource')
      && (text.includes('401') || text.includes('503'));
    if (message.type() === 'error' && !expectedAuthProbe) runtimeErrors.push(`console: ${text}`);
  });
  page.on('pageerror', error => runtimeErrors.push(`page: ${error.message}`));
  return { context, page, runtimeErrors };
}

async function assertNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.equal(dimensions.document, dimensions.viewport, 'page must not overflow horizontally');
}

async function getPortalTourVisualState(page) {
  return page.locator('[data-portal-sequence]').evaluateAll(elements => elements.map(element => {
    const style = getComputedStyle(element, '::before');
    const matrix = style.transform === 'none' ? null : new DOMMatrixReadOnly(style.transform);
    return {
      animationName: style.animationName,
      animationIterationCount: style.animationIterationCount,
      opacity: Number(style.opacity),
      scaleX: matrix?.a ?? 1,
      scaleY: matrix?.d ?? 1,
    };
  }));
}

async function assertPortalTourSettled(page, message) {
  assert.equal(await page.locator('[data-portal-tour]').getAttribute('data-portal-tour'), 'idle', `${message}: tour must be idle`);
  const states = await getPortalTourVisualState(page);
  assert.ok(states.every(state => state.animationName === 'none'), `${message}: portal animation must be removed`);
  assert.ok(states.every(state => state.opacity === 0), `${message}: portal glow must be transparent`);
  assert.ok(states.every(state => Math.abs(state.scaleX - 1) < 0.001 && Math.abs(state.scaleY - 1) < 0.001), `${message}: portal scale must return to 1`);
}

async function closePreview() {
  if (preview.exitCode === null) preview.kill();
  await new Promise(resolve => {
    if (preview.exitCode !== null) return resolve();
    preview.once('exit', resolve);
    setTimeout(resolve, 3_000);
  });
}

let browser;
try {
  await fs.mkdir(outputRoot, { recursive: true });
  await waitForPreview();
  browser = await chromium.launch({ channel: 'chrome', headless: true });

  {
    const { context, page, runtimeErrors } = await createScenario(browser, {
      progress: baseProgress(),
    });
    const startedAt = Date.now();
    await page.goto(`${baseUrl}/games`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('[data-portal-sequence]').count(), 4);
    assert.equal(await page.locator('[data-portal-tour]').getAttribute('data-portal-tour'), 'active', 'first visit must run the portal tour');
    const activeTourStates = await getPortalTourVisualState(page);
    assert.ok(activeTourStates.every(state => state.animationName === 'game-hub-portal-invite'));
    assert.ok(activeTourStates.every(state => state.animationIterationCount === '1'), 'each portal must pulse exactly once');
    assert.equal(await page.locator('[data-four-game-challenge]').count(), 0, 'challenge must wait for portal tour');
    const challenge = page.locator('[data-four-game-challenge]');
    await challenge.waitFor({ timeout: 8_500 });
    const revealDelay = Date.now() - startedAt;
    assert.ok(revealDelay >= 3_900, `challenge appeared too early (${revealDelay}ms)`);
    assert.equal(await challenge.getAttribute('data-four-game-challenge-state'), 'intro');
    await page.getByText('Выиграй бесплатный час в Термбурге', { exact: true }).waitFor();
    await page.getByText('Пройди первый этап в каждой из 4 игр. Первый час — за 4 игры и 0 термокоинов. Монеты останутся в кошельке.', { exact: true }).waitFor();
    await page.getByText('Следующий час — за 50 термокоинов', { exact: true }).waitFor();
    await page.getByText('Сейчас в кошельке: 0', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Открыть кошелёк. Баланс: 0 термокоинов' }).waitFor();
    const globalWallet = page.locator('[data-global-wallet]');
    assert.equal(await globalWallet.textContent(), '0');
    const sceneControlsDisabled = await page.locator('[data-portal-sequence], .game-hub__house').evaluateAll(elements => (
      elements.every(element => element.disabled && element.getAttribute('aria-hidden') === 'true')
    ));
    assert.equal(sceneControlsDisabled, true, 'covered scene controls must leave the tab order while the card is expanded');
    assert.equal(await challenge.getByText('0 из 4', { exact: true }).count(), 1);
    const attentionIterations = await challenge.evaluate(element => getComputedStyle(element, '::before').animationIterationCount);
    assert.equal(attentionIterations, '2');
    await assertPortalTourSettled(page, 'after the first tour');
    await assertNoHorizontalOverflow(page);
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(outputRoot, 'intro-390x844.png'), fullPage: true });

    await challenge.locator('[data-four-game-dismiss]').click();
    const compact = page.locator('[data-four-game-challenge-state="compact"]');
    await compact.waitFor();
    assert.equal(await page.locator('[data-portal-sequence]:disabled, .game-hub__house:disabled').count(), 0, 'scene controls must return after the card is collapsed');
    const storedFlags = await page.evaluate(() => JSON.parse(localStorage.getItem('termliny-progress') || '{}').tutorialFlags);
    assert.ok(storedFlags.includes('four-games-challenge-intro-v1'));
    assert.ok(storedFlags.includes('four-games-portal-tour-v1'), 'completed portal tour must be persisted');
    await page.locator('[data-portal-sequence="1"]').click();
    await page.waitForURL('**/games/2048');
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-four-game-challenge-state="compact"]').waitFor({ timeout: 1_500 });
    assert.equal(await page.locator('[data-four-game-challenge-state="intro"]').count(), 0);
    await assertPortalTourSettled(page, 'after returning to the hub');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-four-game-challenge-state="compact"]').waitFor({ timeout: 1_500 });
    await assertPortalTourSettled(page, 'after reloading the hub');
    assert.deepEqual(runtimeErrors, []);
    await context.close();
  }

  {
    const { context, page, runtimeErrors } = await createScenario(browser, {
      progress: baseProgress({
        tutorialFlags: ['four-games-challenge-intro-v1'],
        fourGameChallenge: { version: 1, completedGames: ['game2048', 'bubbles'] },
      }),
    });
    await page.goto(`${baseUrl}/games`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-four-game-challenge-state="compact"]').click();
    const action = page.locator('[data-four-game-start]');
    await action.getByText('Дальше: Пестун', { exact: true }).waitFor();
    await action.click();
    await page.waitForURL('**/games/pet');
    assert.deepEqual(runtimeErrors, []);
    await context.close();
  }

  {
    const { context, page, runtimeErrors } = await createScenario(browser, {
      progress: baseProgress({
        tutorialFlags: ['four-games-challenge-intro-v1'],
        fourGameChallenge: { version: 1, completedGames: ['match3', 'pet', 'bubbles', 'game2048'] },
      }),
      viewport: { width: 320, height: 568 },
    });
    await page.goto(`${baseUrl}/games`, { waitUntil: 'domcontentloaded' });
    const complete = page.locator('[data-four-game-challenge-state="complete"]');
    await complete.waitFor();
    await page.getByText('Бесплатный час разблокирован', { exact: true }).waitFor();
    const targets = await complete.locator('[data-four-game-dismiss], [data-four-game-start]').evaluateAll(elements => (
      elements.map(element => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }))
    ));
    assert.ok(targets.every(target => target.width >= 44 && target.height >= 44), 'challenge controls must be at least 44×44px');
    await assertNoHorizontalOverflow(page);
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(outputRoot, 'complete-320x568.png'), fullPage: true });
    await complete.locator('[data-four-game-start]').click();
    await page.waitForURL('**/shop/free-hour?campaign=four-games-v1');
    await page.getByText('Сохраните приз в профиле', { exact: true }).waitFor();
    await page.getByText(/0 термокоинов/).waitFor();
    assert.deepEqual(runtimeErrors, []);
    await context.close();
  }

  {
    const campaignClaim = {
      id: 'claim-four-games-1',
      rewardId: 'ticket-free',
      campaignId: 'four-games-v1',
      code: 'TB-1234ABCD',
      purchasedAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
      nextPurchaseAt: Date.now() + 604_800_000,
      status: 'active',
    };
    const progress = baseProgress({
      tutorialFlags: ['four-games-challenge-intro-v1'],
      fourGameChallenge: { version: 1, completedGames: ['game2048', 'bubbles', 'pet', 'match3'] },
      rewardClaims: [campaignClaim],
    });
    const { context, page, runtimeErrors } = await createScenario(browser, {
      progress,
      progressOwner: 'account:qa-claimed-account',
      accountSession: {
        account: {
          id: 'qa-claimed-account',
          name: 'Ольга',
          city: 'Москва',
          phoneMasked: '+7 ••• •••-55-66',
          login: null,
          isTest: false,
          createdAt: Date.now(),
          lastLoginAt: Date.now(),
        },
        progress,
        revision: 1,
      },
    });
    await page.goto(`${baseUrl}/games`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(350);
    assert.equal(await page.locator('[data-four-game-challenge]').count(), 0, 'claimed campaign must stay hidden');
    assert.deepEqual(runtimeErrors, []);
    await context.close();
  }

  {
    const campaignClaim = {
      id: 'claim-on-shared-device',
      rewardId: 'ticket-free',
      campaignId: 'four-games-v1',
      code: 'TB-PRIVATE1',
      purchasedAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
      nextPurchaseAt: Date.now() + 604_800_000,
      status: 'active',
    };
    const { context, page, runtimeErrors } = await createScenario(browser, {
      progress: baseProgress({
        fourGameChallenge: { version: 1, completedGames: ['game2048', 'bubbles', 'pet', 'match3'] },
        rewardClaims: [campaignClaim],
      }),
      progressOwner: null,
    });
    await page.goto(`${baseUrl}/profile`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Гостевая игра', { exact: true }).waitFor();
    assert.equal(await page.getByText(campaignClaim.code, { exact: true }).count(), 0, 'guest profile must not expose a prior account campaign code');
    const coldGuestStorage = await page.evaluate(code => ({
      codePersisted: (localStorage.getItem('termliny-progress') || '').includes(code),
      owner: localStorage.getItem('termliny-progress-owner'),
    }), campaignClaim.code);
    assert.equal(coldGuestStorage.codePersisted, false, 'legacy campaign code must be scrubbed from localStorage');
    assert.equal(coldGuestStorage.owner, null, 'confirmed guest must clear account-scoped progress owner');
    await page.goto(`${baseUrl}/shop`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.getByText(campaignClaim.code, { exact: true }).count(), 0, 'regular shop must not expose a campaign code');
    await page.goto(`${baseUrl}/shop/free-hour`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.getByText(campaignClaim.code, { exact: true }).count(), 0, 'regular reward route must not expose a campaign code');
    await page.goto(`${baseUrl}/shop/free-hour?campaign=four-games-v1`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Пока не все 4 игры пройдены', { exact: true }).waitFor();
    assert.equal(await page.getByText(campaignClaim.code, { exact: true }).count(), 0, 'guest must not see a prior account claim code');
    assert.deepEqual(runtimeErrors, []);
    await context.close();
  }

  {
    const progress = baseProgress({
      tutorialFlags: ['four-games-challenge-intro-v1'],
      fourGameChallenge: { version: 1, completedGames: ['game2048', 'bubbles', 'pet', 'match3'] },
    });
    const requestOrder = [];
    const syncAccountIds = [];
    const { context, page, runtimeErrors } = await createScenario(browser, {
      progress,
      accountSession: {
        account: {
          id: 'qa-account',
          name: 'Ольга',
          city: 'Москва',
          phoneMasked: '+7 ••• •••-55-66',
          login: null,
          isTest: false,
          createdAt: Date.now(),
          lastLoginAt: Date.now(),
        },
        progress,
        revision: 1,
      },
      requestOrder,
      syncAccountIds,
    });
    await page.goto(`${baseUrl}/shop/free-hour?campaign=four-games-v1`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[name="name"]').fill('Ольга');
    await page.locator('input[name="phone"]').fill('+7 999 444-55-66');
    await page.locator('input[name="age"]').fill('38');
    await page.locator('select[name="city"]').selectOption('Москва');
    await page.locator('.reward-consent input').check();
    await page.getByRole('button', { name: 'Получить бесплатный час' }).click();
    await page.getByText('TB-QA12AB34', { exact: true }).waitFor();
    assert.deepEqual(requestOrder.slice(0, 2), ['sync', 'claim'], '4/4 progress must reach the server before claim POST');
    assert.deepEqual(syncAccountIds, ['qa-account'], 'progress sync must be bound to the current account');
    const persistedClaim = await page.evaluate(() => localStorage.getItem('termliny-progress') || '');
    assert.equal(persistedClaim.includes('TB-QA12AB34'), false, 'account campaign code must not be persisted in localStorage');
    assert.deepEqual(runtimeErrors, []);
    await context.close();
  }

  {
    const staleClaim = {
      id: 'claim-from-another-session',
      rewardId: 'ticket-free',
      campaignId: 'four-games-v1',
      code: 'TB-OLDSESSION',
      purchasedAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
      nextPurchaseAt: Date.now() + 604_800_000,
      status: 'active',
    };
    const progress = baseProgress({
      fourGameChallenge: { version: 1, completedGames: ['game2048', 'bubbles', 'pet', 'match3'] },
      rewardClaims: [staleClaim],
    });
    const { context, page, runtimeErrors } = await createScenario(browser, {
      progress,
      progressOwner: 'account:qa-current-account',
      accountSession: {
        account: {
          id: 'qa-current-account',
          name: 'Ольга',
          city: 'Москва',
          phoneMasked: '+7 ••• •••-55-66',
          login: null,
          isTest: false,
          createdAt: Date.now(),
          lastLoginAt: Date.now(),
        },
        progress,
        revision: 1,
      },
    });
    await page.goto(`${baseUrl}/shop/free-hour?campaign=four-games-v1`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Получить бесплатный час' }).waitFor();
    assert.equal(await page.getByText(staleClaim.code, { exact: true }).count(), 0, 'campaign route must trust the scoped server response, not a stale local code');
    assert.deepEqual(runtimeErrors, []);
    await context.close();
  }

  {
    const cachedCampaignClaim = {
      id: 'claim-cached-during-outage',
      rewardId: 'ticket-free',
      campaignId: 'four-games-v1',
      code: 'TB-OFFLINE1',
      purchasedAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
      nextPurchaseAt: Date.now() + 604_800_000,
      status: 'active',
    };
    const progress = baseProgress({
      currency: 77,
      fourGameChallenge: { version: 1, completedGames: ['game2048', 'bubbles'] },
      rewardClaims: [cachedCampaignClaim],
    });
    const { context, page, runtimeErrors } = await createScenario(browser, {
      progress,
      progressOwner: 'account:qa-offline-account',
      accountProbeStatus: 503,
    });
    await page.goto(`${baseUrl}/profile`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Не удалось проверить вход. Гостевая игра продолжает работать.').waitFor();
    const cachedState = await page.evaluate(code => ({
      progress: JSON.parse(localStorage.getItem('termliny-progress') || '{}'),
      owner: localStorage.getItem('termliny-progress-owner'),
      codePersisted: (localStorage.getItem('termliny-progress') || '').includes(code),
    }), cachedCampaignClaim.code);
    assert.equal(cachedState.progress.currency, 77, 'temporary auth outage must not erase cached account progress');
    assert.equal(cachedState.owner, 'account:qa-offline-account', 'temporary auth outage must preserve the account scope');
    assert.equal(cachedState.codePersisted, false, 'campaign code must still be scrubbed during an auth outage');
    assert.deepEqual(runtimeErrors, []);
    await context.close();
  }

  {
    const accountAProgress = baseProgress({
      currency: 91,
      fourGameChallenge: { version: 1, completedGames: ['game2048', 'bubbles', 'pet', 'match3'] },
    });
    const accountBProgress = baseProgress({ currency: 4 });
    const accountB = {
      account: {
        id: 'qa-outage-login-account-b',
        name: 'Борис после сбоя',
        city: 'Омск',
        phoneMasked: '+7 ••• •••-42-42',
        login: null,
        isTest: false,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      },
      progress: accountBProgress,
      revision: 1,
    };
    let loginPayload = null;
    let currentSession = null;
    const { context, page, runtimeErrors } = await createScenario(browser, {
      progress: accountAProgress,
      progressOwner: 'account:qa-outage-account-a',
      accountProbeStatus: 503,
    });
    await context.unroute('**/api/auth/me');
    await context.route('**/api/auth/me', route => route.fulfill({
      status: currentSession ? 200 : 503,
      contentType: 'application/json',
      body: JSON.stringify(currentSession ?? { error: 'Сервис профиля временно недоступен.' }),
    }));
    await context.route('**/api/auth/login', async route => {
      loginPayload = route.request().postDataJSON();
      currentSession = accountB;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(accountB) });
    });

    await page.goto(`${baseUrl}/account`, { waitUntil: 'domcontentloaded' });
    await page.getByPlaceholder('Телефон или логин').fill('+7 999 222-42-42');
    await page.locator('#account-password').fill('4321');
    await page.locator('form button[type="submit"]').click();
    await page.getByText(accountB.account.name, { exact: true }).waitFor();
    assert.equal('fourGameChallenge' in loginPayload, false, 'account-owned cache A must not be merged into login B after an auth outage');
    assert.deepEqual(runtimeErrors, []);
    await context.close();
  }

  {
    const accountAProgress = baseProgress({
      currency: 91,
      fourGameChallenge: { version: 1, completedGames: ['game2048', 'bubbles', 'pet', 'match3'] },
    });
    const accountBProgress = baseProgress();
    const accountB = {
      account: {
        id: 'qa-outage-register-account-b',
        name: 'Вера после сбоя',
        city: 'Томск',
        phoneMasked: '+7 ••• •••-43-43',
        login: null,
        isTest: false,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      },
      progress: accountBProgress,
      revision: 1,
    };
    let registerPayload = null;
    let currentSession = null;
    const { context, page, runtimeErrors } = await createScenario(browser, {
      progress: accountAProgress,
      progressOwner: 'account:qa-outage-account-a',
      accountProbeStatus: 503,
    });
    await context.unroute('**/api/auth/me');
    await context.route('**/api/auth/me', route => route.fulfill({
      status: currentSession ? 200 : 503,
      contentType: 'application/json',
      body: JSON.stringify(currentSession ?? { error: 'Сервис профиля временно недоступен.' }),
    }));
    await context.route('**/api/auth/register', async route => {
      registerPayload = route.request().postDataJSON();
      currentSession = accountB;
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(accountB) });
    });

    await page.goto(`${baseUrl}/account`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Регистрация' }).click();
    await page.getByPlaceholder('Как к вам обращаться').fill('Вера');
    await page.getByPlaceholder('+7 (900) 000-00-00').fill('+7 999 222-43-43');
    await page.getByPlaceholder('Придумайте пароль').fill('4321');
    await page.getByPlaceholder('Ещё раз').fill('4321');
    await page.getByPlaceholder('Например, Казань').fill('Томск');
    await page.locator('form input[type="checkbox"]').check();
    await page.locator('form button[type="submit"]').click();
    await page.getByText(accountB.account.name, { exact: true }).waitFor();
    assert.deepEqual(registerPayload.progress.fourGameChallenge.completedGames, [], 'account-owned cache A must not seed registration B after an auth outage');
    assert.equal(registerPayload.progress.currency, 0, 'account-owned balance A must not seed registration B');
    assert.deepEqual(runtimeErrors, []);
    await context.close();
  }

  {
    const campaignClaim = {
      id: 'claim-multitab-session',
      rewardId: 'ticket-free',
      campaignId: 'four-games-v1',
      code: 'TB-MULTITAB',
      purchasedAt: Date.now(),
      expiresAt: Date.now() + 86_400_000,
      nextPurchaseAt: Date.now() + 604_800_000,
      status: 'active',
    };
    const progress = baseProgress({
      fourGameChallenge: { version: 1, completedGames: ['game2048', 'bubbles', 'pet', 'match3'] },
      rewardClaims: [campaignClaim],
    });
    const accountSession = {
      account: {
        id: 'qa-multitab-account',
        name: 'Ольга',
        city: 'Москва',
        phoneMasked: '+7 ••• •••-55-66',
        login: null,
        isTest: false,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      },
      progress,
      revision: 1,
    };
    const { context, page: profilePage, runtimeErrors } = await createScenario(browser, {
      progress,
      progressOwner: 'account:qa-multitab-account',
      accountSession,
      rewardStatus: { available: false, claim: campaignClaim, nextPurchaseAt: campaignClaim.nextPurchaseAt },
    });
    let signedIn = true;
    await context.unroute('**/api/auth/me');
    await context.route('**/api/auth/me', route => route.fulfill({
      status: signedIn ? 200 : 401,
      contentType: 'application/json',
      body: JSON.stringify(signedIn ? accountSession : { error: 'Войдите в профиль.' }),
    }));
    await context.route('**/api/auth/logout', route => {
      signedIn = false;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });

    await profilePage.goto(`${baseUrl}/profile`, { waitUntil: 'domcontentloaded' });
    await profilePage.getByText(campaignClaim.code, { exact: true }).waitFor();
    const claimPage = await context.newPage();
    await claimPage.goto(`${baseUrl}/shop/free-hour?campaign=four-games-v1`, { waitUntil: 'domcontentloaded' });
    await claimPage.getByText(campaignClaim.code, { exact: true }).waitFor();
    const logoutPage = await context.newPage();
    await logoutPage.goto(`${baseUrl}/profile`, { waitUntil: 'domcontentloaded' });
    await logoutPage.getByRole('button', { name: 'Выйти из профиля' }).waitFor();
    logoutPage.once('dialog', dialog => dialog.accept());
    await logoutPage.getByRole('button', { name: 'Выйти из профиля' }).click();

    await profilePage.getByText(campaignClaim.code, { exact: true }).waitFor({ state: 'detached' });
    await claimPage.getByText(campaignClaim.code, { exact: true }).waitFor({ state: 'detached' });
    assert.equal(await profilePage.getByText(campaignClaim.code, { exact: true }).count(), 0, 'logout in another tab must hide the profile code');
    assert.equal(await claimPage.getByText(campaignClaim.code, { exact: true }).count(), 0, 'logout in another tab must hide the scoped claim code');
    assert.deepEqual(runtimeErrors, []);
    await context.close();
  }

  {
    const nextPurchaseAt = Date.now() + 604_800_000;
    const { context, page, runtimeErrors } = await createScenario(browser, {
      progress: baseProgress(),
      rewardStatus: { available: false, nextPurchaseAt },
    });
    await page.goto(`${baseUrl}/shop`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Бесплатный час пока недоступен', { exact: true }).waitFor();
    await page.goto(`${baseUrl}/shop/free-hour`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Бесплатный час пока недоступен', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Получить бесплатный час' }).count(), 0, 'suppressed campaign cooldown must not show a claim form');
    assert.deepEqual(runtimeErrors, []);
    await context.close();
  }

  {
    const accountAProgress = baseProgress({
      currency: 31,
      fourGameChallenge: { version: 1, completedGames: ['game2048', 'bubbles', 'pet', 'match3'] },
    });
    const accountBProgress = baseProgress({ currency: 9 });
    const accountA = {
      account: {
        id: 'qa-race-account-a',
        name: 'Анна А',
        city: 'Москва',
        phoneMasked: '+7 ••• •••-11-11',
        login: null,
        isTest: false,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      },
      progress: accountAProgress,
      revision: 1,
    };
    const accountB = {
      account: {
        id: 'qa-race-account-b',
        name: 'Борис Б',
        city: 'Казань',
        phoneMasked: '+7 ••• •••-22-22',
        login: null,
        isTest: false,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      },
      progress: accountBProgress,
      revision: 1,
    };
    const { context, page: claimPage, runtimeErrors } = await createScenario(browser, {
      progress: accountAProgress,
      progressOwner: 'account:qa-race-account-a',
      accountSession: accountA,
    });
    let currentSession = accountA;
    let claimRequests = 0;
    let releaseSync;
    let markSyncStarted;
    const syncReleased = new Promise(resolve => { releaseSync = resolve; });
    const syncStarted = new Promise(resolve => { markSyncStarted = resolve; });

    await context.unroute('**/api/auth/me');
    await context.route('**/api/auth/me', route => route.fulfill({
      status: currentSession ? 200 : 401,
      contentType: 'application/json',
      body: JSON.stringify(currentSession ?? { error: 'Войдите в профиль.' }),
    }));
    await context.route('**/api/auth/logout', route => {
      currentSession = null;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    await context.route('**/api/auth/login', route => {
      currentSession = accountB;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(accountB) });
    });
    await context.unroute('**/api/account/progress');
    await context.route('**/api/account/progress', async route => {
      const body = route.request().postDataJSON();
      markSyncStarted(body.expectedAccountId);
      await syncReleased;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ progress: body.progress, revision: 2, savedAt: Date.now() }),
      });
    });
    await context.unroute('**/api/rewards/free-hour**');
    await context.route('**/api/rewards/free-hour**', route => {
      if (route.request().method() === 'POST') claimRequests += 1;
      return route.fulfill({
        status: route.request().method() === 'POST' ? 201 : 200,
        contentType: 'application/json',
        body: JSON.stringify(route.request().method() === 'POST'
          ? { ok: true, claim: { id: 'must-not-issue', rewardId: 'ticket-free', campaignId: 'four-games-v1', code: 'TB-WRONGACCT', purchasedAt: Date.now(), expiresAt: Date.now() + 1000, nextPurchaseAt: Date.now() + 1000, status: 'active' } }
          : { available: true }),
      });
    });

    await claimPage.goto(`${baseUrl}/shop/free-hour?campaign=four-games-v1`, { waitUntil: 'domcontentloaded' });
    await claimPage.locator('input[name="name"]').fill('Анна');
    await claimPage.locator('input[name="phone"]').fill('+7 999 111-11-11');
    await claimPage.locator('input[name="age"]').fill('35');
    await claimPage.locator('select[name="city"]').selectOption('Москва');
    await claimPage.locator('.reward-consent input').check();
    await claimPage.getByRole('button', { name: 'Получить бесплатный час' }).click();
    assert.equal(await syncStarted, 'qa-race-account-a', 'delayed sync must start under account A');

    const switchPage = await context.newPage();
    await switchPage.goto(`${baseUrl}/profile`, { waitUntil: 'domcontentloaded' });
    switchPage.once('dialog', dialog => dialog.accept());
    await switchPage.getByRole('button', { name: 'Выйти из профиля' }).click();
    await switchPage.getByText('Гостевая игра', { exact: true }).waitFor();
    await switchPage.goto(`${baseUrl}/account`, { waitUntil: 'domcontentloaded' });
    await switchPage.getByPlaceholder('Телефон или логин').fill('+7 999 222-22-22');
    await switchPage.locator('#account-password').fill('4321');
    await switchPage.locator('form button[type="submit"]').click();
    await switchPage.getByText('Борис Б', { exact: true }).waitFor();

    releaseSync();
    await claimPage.waitForTimeout(350);
    assert.equal(claimRequests, 0, 'an account-A sync finishing after the switch must not continue to a reward claim under account B');
    await claimPage.goto(`${baseUrl}/profile`, { waitUntil: 'domcontentloaded' });
    await claimPage.getByText('Борис Б', { exact: true }).waitFor();
    assert.equal(await claimPage.getByText('TB-WRONGACCT', { exact: true }).count(), 0);
    assert.deepEqual(runtimeErrors, []);
    await context.close();
  }

  {
    const completedChallenge = { version: 1, completedGames: ['game2048', 'bubbles', 'pet', 'match3'] };
    const accountAProgress = baseProgress({ currency: 18, fourGameChallenge: completedChallenge });
    const accountBProgress = baseProgress({ currency: 7, fourGameChallenge: completedChallenge });
    const accountA = {
      account: {
        id: 'qa-claim-race-account-a',
        name: 'Анна Claim A',
        city: 'Москва',
        phoneMasked: '+7 ••• •••-31-31',
        login: null,
        isTest: false,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      },
      progress: accountAProgress,
      revision: 1,
    };
    const accountB = {
      account: {
        id: 'qa-claim-race-account-b',
        name: 'Борис Claim B',
        city: 'Тула',
        phoneMasked: '+7 ••• •••-32-32',
        login: null,
        isTest: false,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      },
      progress: accountBProgress,
      revision: 1,
    };
    const { context, page: claimPage, runtimeErrors } = await createScenario(browser, {
      progress: accountAProgress,
      progressOwner: 'account:qa-claim-race-account-a',
      accountSession: accountA,
    });
    let currentSession = accountA;
    let releaseClaim;
    let markClaimStarted;
    const claimReleased = new Promise(resolve => { releaseClaim = resolve; });
    const claimStarted = new Promise(resolve => { markClaimStarted = resolve; });
    const scopedStatusAccountIds = [];
    let claimExpectedAccountId = null;

    await context.unroute('**/api/auth/me');
    await context.route('**/api/auth/me', route => route.fulfill({
      status: currentSession ? 200 : 401,
      contentType: 'application/json',
      body: JSON.stringify(currentSession ?? { error: 'Войдите в профиль.' }),
    }));
    await context.route('**/api/auth/logout', route => {
      currentSession = null;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    await context.route('**/api/auth/login', route => {
      currentSession = accountB;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(accountB) });
    });
    await context.unroute('**/api/rewards/free-hour**');
    await context.route('**/api/rewards/free-hour**', async route => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON();
        claimExpectedAccountId = body.expectedAccountId;
        markClaimStarted();
        await claimReleased;
        const now = Date.now();
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            claim: {
              id: 'late-account-a-claim',
              rewardId: 'ticket-free',
              campaignId: 'four-games-v1',
              code: 'TB-LATEACCT',
              purchasedAt: now,
              expiresAt: now + 604_800_000,
              nextPurchaseAt: now + 604_800_000,
              status: 'active',
            },
          }),
        });
        return;
      }
      const requestUrl = new URL(route.request().url());
      if (requestUrl.searchParams.get('campaignId') === 'four-games-v1') {
        scopedStatusAccountIds.push(requestUrl.searchParams.get('expectedAccountId'));
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ available: true }),
      });
    });

    await claimPage.goto(`${baseUrl}/shop/free-hour?campaign=four-games-v1`, { waitUntil: 'domcontentloaded' });
    await claimPage.locator('input[name="name"]').fill('Анна');
    await claimPage.locator('input[name="phone"]').fill('+7 999 111-31-31');
    await claimPage.locator('input[name="age"]').fill('35');
    await claimPage.locator('select[name="city"]').selectOption('Москва');
    await claimPage.locator('.reward-consent input').check();
    await claimPage.getByRole('button', { name: 'Получить бесплатный час' }).click();
    await claimStarted;
    assert.equal(claimExpectedAccountId, accountA.account.id, 'campaign claim POST must be bound to account A');
    assert.ok(scopedStatusAccountIds.includes(accountA.account.id), 'campaign status GET must be bound to account A');

    const switchPage = await context.newPage();
    await switchPage.goto(`${baseUrl}/profile`, { waitUntil: 'domcontentloaded' });
    switchPage.once('dialog', dialog => dialog.accept());
    await switchPage.getByRole('button', { name: 'Выйти из профиля' }).click();
    await switchPage.getByText('Гостевая игра', { exact: true }).waitFor();
    await switchPage.goto(`${baseUrl}/account`, { waitUntil: 'domcontentloaded' });
    await switchPage.getByPlaceholder('Телефон или логин').fill('+7 999 222-32-32');
    await switchPage.locator('#account-password').fill('4321');
    await switchPage.locator('form button[type="submit"]').click();
    await switchPage.getByText(accountB.account.name, { exact: true }).waitFor();
    await claimPage.waitForFunction(owner => localStorage.getItem('termliny-progress-owner') === owner, `account:${accountB.account.id}`);

    releaseClaim();
    await claimPage.waitForTimeout(500);
    await claimPage.goto(`${baseUrl}/profile`, { waitUntil: 'domcontentloaded' });
    await claimPage.getByText(accountB.account.name, { exact: true }).waitFor();
    assert.equal(await claimPage.getByText('TB-LATEACCT', { exact: true }).count(), 0, 'late account-A claim must not enter account B progress');
    assert.deepEqual(runtimeErrors, []);
    await context.close();
  }

  {
    const progress = baseProgress();
    const loginResponse = {
      account: {
        id: 'qa-return-account',
        name: 'Ольга',
        city: 'Москва',
        phoneMasked: '+7 ••• •••-55-66',
        login: null,
        isTest: false,
        createdAt: Date.now(),
        lastLoginAt: Date.now(),
      },
      progress,
      revision: 1,
    };
    for (const encodedReturnTo of [
      '%2F%5Cevil.example',
      '%2F%252e%252e%2F%2Fevil.example',
    ]) {
      const { context, page, runtimeErrors } = await createScenario(browser, {
        progress,
        loginResponse,
      });
      await page.goto(`${baseUrl}/account?returnTo=${encodedReturnTo}`, { waitUntil: 'domcontentloaded' });
      await page.getByPlaceholder('Телефон или логин').fill('+7 999 444-55-66');
      await page.locator('#account-password').fill('4321');
      await page.locator('form button[type="submit"]').click();
      await page.waitForURL(`${baseUrl}/profile`);
      assert.equal(new URL(page.url()).origin, baseUrl, 'login return path must stay on the app origin');
      assert.deepEqual(runtimeErrors, []);
      await context.close();
    }
  }

  {
    const { context, page, runtimeErrors } = await createScenario(browser, {
      progress: baseProgress(),
      reducedMotion: 'reduce',
      viewport: { width: 1440, height: 900 },
    });
    const startedAt = Date.now();
    await page.goto(`${baseUrl}/games`, { waitUntil: 'domcontentloaded' });
    const challenge = page.locator('[data-four-game-challenge-state="intro"]');
    await challenge.waitFor({ timeout: 1_500 });
    assert.ok(Date.now() - startedAt < 1_500, 'reduced-motion reveal should be prompt');
    assert.equal(await page.locator('[data-portal-tour]').getAttribute('data-portal-tour'), 'idle', 'reduced motion must skip the portal tour');
    const animations = await page.locator('[data-portal-sequence="1"]').evaluate(element => ({
      portal: getComputedStyle(element, '::before').animationName,
      challenge: getComputedStyle(document.querySelector('[data-four-game-challenge]'), '::before').animationName,
    }));
    assert.equal(animations.portal, 'none');
    assert.equal(animations.challenge, 'none');
    await assertNoHorizontalOverflow(page);
    assert.deepEqual(runtimeErrors, []);
    await context.close();
  }

  console.log('four-game challenge browser QA passed');
} finally {
  if (browser) await browser.close();
  await closePreview();
}
