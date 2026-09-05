import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const playwrightRoots = [
  path.join(process.env.USERPROFILE || '', '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'node', 'node_modules', 'playwright'),
  'C:/Claude Code/node_modules/playwright',
];
const playwrightRoot = playwrightRoots.find(candidate => fs.existsSync(candidate));
if (!playwrightRoot) throw new Error('Playwright is unavailable for bathhouses browser QA.');
const { chromium, webkit } = require(playwrightRoot);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frontendRoot = path.join(projectRoot, 'frontend');
const previewOutDir = process.env.QA_PREVIEW_ROOT
  ? path.resolve(process.env.QA_PREVIEW_ROOT)
  : path.join(frontendRoot, 'build');
const externalBaseUrl = process.env.QA_BASE_URL?.replace(/\/$/, '');
const screenshotDir = process.env.QA_SCREENSHOT_DIR
  ? path.resolve(process.env.QA_SCREENSHOT_DIR)
  : null;
if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive: true });
const port = 43994;
const baseUrl = externalBaseUrl ?? `http://127.0.0.1:${port}`;

function launchOptions(browserType) {
  const bundledExecutable = browserType.executablePath();
  if (fs.existsSync(bundledExecutable)) return {};
  if (browserType === chromium) {
    const systemChrome = [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    ].find(candidate => fs.existsSync(candidate));
    if (systemChrome) return { channel: 'chrome' };
    const systemEdge = [
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    ].find(candidate => fs.existsSync(candidate));
    if (systemEdge) return { channel: 'msedge' };
  }
  return null;
}

const preview = externalBaseUrl ? null : spawn(process.execPath, [path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--outDir', previewOutDir, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
  cwd: frontendRoot,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let previewOutput = '';
preview?.stdout.on('data', chunk => { previewOutput += chunk.toString(); });
preview?.stderr.on('data', chunk => { previewOutput += chunk.toString(); });

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
  page.on('requestfailed', request => {
    const error = request.failure()?.errorText ?? 'failed';
    if (request.url().includes('/fonts/') && error === 'net::ERR_ABORTED') return;
    report.requestFailures.push(`${label}: ${request.method()} ${request.url()} — ${error}`);
  });
}

async function verify(browser, label, viewport, report) {
  const context = await browser.newContext({ viewport, isMobile: viewport.width <= 430, hasTouch: viewport.width <= 430 });
  const page = await context.newPage();
  observe(page, label, report);
  try {
    await page.route('**/api/auth/config', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ available: true, method: 'password', passwordMinLength: 4 }),
    }));
    await page.route('**/api/auth/me', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: 'null',
    }));
    await page.goto(`${baseUrl}/bathhouses`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.locator('[data-termburg-app-ready]').waitFor({ state: 'attached', timeout: 15_000 });
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.getByRole('heading', { level: 1, name: 'ТЕРМБУРГИ' }).count(), 1);
    assert.equal(await page.getByRole('heading', { level: 2, name: 'Москва' }).count(), 1);
    assert.equal(await page.getByRole('heading', { level: 2, name: 'Зеленогорск' }).count(), 1);
    assert.equal(await page.getByText('Расписание', { exact: true }).count(), 2);
    assert.equal(await page.getByText('Перейти на сайт', { exact: true }).count(), 2);
    assert.equal(await page.getByText('Ежедневно: 09:00–23:00', { exact: true }).isVisible(), true);
    assert.equal(await page.getByText('Первый понедельник месяца — санитарный день', { exact: true }).isVisible(), true);
    assert.equal(await page.getByText('Пн–чт 10:00–21:00 · Пт 10:00–22:00', { exact: true }).isVisible(), true);
    assert.equal(await page.getByText('Сб–вс 09:00–22:00', { exact: true }).isVisible(), true);
    assert.equal(await page.getByRole('link', { name: '+7 (495) 191-64-38' }).getAttribute('href'), 'tel:+74951916438');
    assert.equal(await page.getByRole('link', { name: '+7 (902) 990-70-70' }).getAttribute('href'), 'tel:+79029907070');

    const cards = page.locator('article');
    assert.equal(await cards.count(), 2);
    const expectedLinks = [
      { schedule: '/bathhouses/1/schedule', website: 'https://termburg.ru' },
      { schedule: '/bathhouses/2/schedule', website: 'https://termburg45.ru' },
    ];

    for (let index = 0; index < expectedLinks.length; index += 1) {
      const card = cards.nth(index);
      const schedule = card.locator(`a[href="${expectedLinks[index].schedule}"]`);
      const website = card.locator(`a[href="${expectedLinks[index].website}"]`);
      assert.equal(await schedule.count(), 1);
      assert.equal(await website.count(), 1);

      const metrics = await card.evaluate(element => {
        const heading = element.querySelector('h2');
        const scheduleLink = element.querySelector('a[href*="/schedule"]');
        const websiteLink = element.querySelector('a[target="_blank"]');
        const phoneLink = element.querySelector('a[href^="tel:"]');
        if (!heading || !scheduleLink || !websiteLink || !phoneLink) {
          throw new Error('Bathhouse card is missing a required element');
        }
        const headingBox = heading.getBoundingClientRect();
        const scheduleBox = scheduleLink.getBoundingClientRect();
        const websiteBox = websiteLink.getBoundingClientRect();
        const phoneBox = phoneLink.getBoundingClientRect();
        return {
          cityFontSize: Number.parseFloat(getComputedStyle(heading).fontSize),
          detailFontSize: Number.parseFloat(getComputedStyle(phoneLink).fontSize),
          scheduleHeight: scheduleBox.height,
          websiteHeight: websiteBox.height,
          cityTop: headingBox.top,
          actionsTop: Math.min(scheduleBox.top, websiteBox.top),
          phoneTop: phoneBox.top,
          websiteBottom: websiteBox.bottom,
        };
      });

      assert.ok(metrics.cityFontSize >= 24, `${label}: city heading must be at least 24px`);
      assert.ok(metrics.cityFontSize > metrics.detailFontSize, `${label}: city heading must dominate details`);
      assert.ok(metrics.scheduleHeight >= 44, `${label}: schedule target must be at least 44px high`);
      assert.ok(metrics.websiteHeight >= 44, `${label}: website target must be at least 44px high`);
      assert.ok(metrics.cityTop < metrics.actionsTop, `${label}: actions must follow the city`);
      assert.ok(metrics.actionsTop < metrics.phoneTop, `${label}: contact details must follow the actions`);
      report.cardMetrics.push({ label, index, ...metrics });
    }

    for (const feature of ['Термальные ванны', 'Парные', 'Детская зона', 'Спа-процедуры', '3 бассейна', 'Кафе']) {
      assert.equal(await page.getByText(feature, { exact: true }).count(), 0);
    }

    const layout = await page.evaluate(() => {
      const subtitle = [...document.querySelectorAll('p')]
        .find(element => element.textContent?.trim() === 'Наши термальные комплексы');
      if (!subtitle) throw new Error('Page subtitle is missing');
      return {
        viewportWidth: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        subtitleFontSize: Number.parseFloat(getComputedStyle(subtitle).fontSize),
      };
    });
    assert.equal(layout.documentWidth, layout.viewportWidth);
    assert.equal(layout.bodyWidth, layout.viewportWidth);
    assert.ok(layout.subtitleFontSize >= 16, `${label}: subtitle must be at least 16px`);

    if (viewport.width === 390 && viewport.height >= 756) {
      const nav = page.getByRole('navigation', { name: 'Нижняя навигация' });
      const navBox = await nav.boundingBox();
      const secondWebsite = cards.nth(1).locator('a[target="_blank"]');
      const secondWebsiteBox = await secondWebsite.boundingBox();
      assert.ok(navBox && secondWebsiteBox, `${label}: first-screen bounds must be measurable`);
      assert.ok(secondWebsiteBox.y + secondWebsiteBox.height <= navBox.y, `${label}: both cards and their actions must fit above the bottom navigation`);
    }

    if (screenshotDir) {
      const screenshotPath = path.join(screenshotDir, `${label}.png`);
      await page.screenshot({ path: screenshotPath });
      report.screenshots.push(screenshotPath);
    }

    report.layouts.push({ label, ...layout });
  } finally {
    await context.close();
  }
}

const report = { consoleErrors: [], pageErrors: [], requestFailures: [], layouts: [], cardMetrics: [], screenshots: [], skipped: [] };
let chromiumBrowser;
let webkitBrowser;
try {
  await waitForSite();
  const webkitOptions = launchOptions(webkit);
  if (webkitOptions) {
    webkitBrowser = await webkit.launch({ headless: true, ...webkitOptions });
    await verify(webkitBrowser, 'webkit-390', { width: 390, height: 844 }, report);
  } else {
    report.skipped.push('WebKit executable is not installed for the active Playwright runtime.');
  }

  const chromiumOptions = launchOptions(chromium);
  if (!chromiumOptions) throw new Error('Chromium executable is unavailable for bathhouses browser QA.');
  chromiumBrowser = await chromium.launch({ headless: true, ...chromiumOptions });
  await verify(chromiumBrowser, 'chromium-320', { width: 320, height: 568 }, report);
  await verify(chromiumBrowser, 'chromium-390-short', { width: 390, height: 756 }, report);
  await verify(chromiumBrowser, 'chromium-390', { width: 390, height: 844 }, report);
  await verify(chromiumBrowser, 'chromium-1440', { width: 1440, height: 900 }, report);
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
