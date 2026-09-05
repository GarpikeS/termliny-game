import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startFeedbackService } from './feedback-service.mjs';

const sha256 = value => createHash('sha256').update(value, 'utf8').digest('hex');

test('feedback service validates and stores a message', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'termburg-feedback-'));
  const dataFile = path.join(tempRoot, 'feedback.jsonl');
  const claimsDataFile = path.join(tempRoot, 'reward-claims.jsonl');
  const service = await startFeedbackService({
    dataFile,
    claimsDataFile,
    host: '127.0.0.1',
    port: 0,
    allowedOrigin: 'https://tbgame.ru',
    logger: { info() {}, error() {} },
  });
  const origin = `http://127.0.0.1:${service.port}`;

  try {
    const health = await fetch(`${origin}/api/feedback/health`);
    assert.equal(health.status, 200);

    const foreign = await fetch(`${origin}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
      body: JSON.stringify({ category: 'bug', message: 'Подробное описание ошибки' }),
    });
    assert.equal(foreign.status, 403);

    const invalid = await fetch(`${origin}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://tbgame.ru' },
      body: JSON.stringify({ category: 'bug', message: 'Коротко' }),
    });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).field, 'message');

    const saved = await fetch(`${origin}/api/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://tbgame.ru',
        'User-Agent': 'Termburg QA',
        'X-Forwarded-For': '203.0.113.4',
      },
      body: JSON.stringify({
        category: 'idea',
        rating: 5,
        message: 'Добавьте, пожалуйста, новое испытание.',
        contact: '@tester',
        page: '/profile/feedback',
      }),
    });
    assert.equal(saved.status, 201);
    assert.equal((await saved.json()).ok, true);

    const entries = (await readFile(dataFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.equal(entries.length, 1);
    assert.equal(entries[0].category, 'idea');
    assert.equal(entries[0].rating, 5);
    assert.equal(entries[0].contact, '@tester');
    assert.equal(entries[0].userAgent, 'Termburg QA');
    assert.equal('ip' in entries[0], false);
  } finally {
    await service.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('free hour is stored for seven days and cannot be claimed again by phone or device', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'termburg-rewards-'));
  const dataFile = path.join(tempRoot, 'feedback.jsonl');
  const claimsDataFile = path.join(tempRoot, 'reward-claims.jsonl');
  let currentTime = Date.UTC(2026, 7, 12, 12, 0, 0);
  const service = await startFeedbackService({
    dataFile,
    claimsDataFile,
    host: '127.0.0.1',
    port: 0,
    allowedOrigin: 'https://tbgame.ru',
    logger: { info() {}, error() {} },
    now: () => currentTime,
    cashierExportToken: 'cashier-test-token',
  });
  const origin = `http://127.0.0.1:${service.port}`;
  const headers = {
    'Content-Type': 'application/json',
    Origin: 'https://tbgame.ru',
    'User-Agent': 'Termburg iPhone QA',
  };
  const basePayload = {
    name: 'Анна',
    phone: '8 999 123-45-67',
    age: 64,
    city: 'Москва',
    deviceId: 'device-1234567890-abcd',
    consent: true,
    consentVersion: 'reward-2026-08-12',
    balance: 50,
    source: 'moscow-cashier',
  };

  try {
    const first = await fetch(`${origin}/api/rewards/free-hour`, {
      method: 'POST',
      headers,
      body: JSON.stringify(basePayload),
    });
    assert.equal(first.status, 201);
    const firstBody = await first.json();
    assert.match(firstBody.claim.code, /^TB-[A-F0-9]{8}$/);
    assert.equal(firstBody.claim.expiresAt - firstBody.claim.purchasedAt, 7 * 24 * 60 * 60 * 1000);

    const status = await fetch(`${origin}/api/rewards/free-hour?deviceId=${basePayload.deviceId}`);
    assert.equal(status.status, 200);
    const statusBody = await status.json();
    assert.equal(statusBody.available, false);
    assert.equal(statusBody.claim.id, firstBody.claim.id);
    assert.equal(statusBody.claim.code, firstBody.claim.code);

    const campaignStatus = await fetch(`${origin}/api/rewards/free-hour?deviceId=${basePayload.deviceId}&campaignId=four-games-v1`);
    assert.equal(campaignStatus.status, 401);
    assert.equal((await campaignStatus.json()).code, 'AUTH_REQUIRED');

    const duplicatePhone = await fetch(`${origin}/api/rewards/free-hour`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...basePayload, deviceId: 'device-9876543210-wxyz' }),
    });
    assert.equal(duplicatePhone.status, 409);
    const duplicatePhoneBody = await duplicatePhone.json();
    assert.equal(duplicatePhoneBody.code, 'REWARD_COOLDOWN');
    assert.equal(duplicatePhoneBody.claim.id, firstBody.claim.id);
    assert.equal(duplicatePhoneBody.claim.code, firstBody.claim.code);

    currentTime += 7 * 24 * 60 * 60 * 1000 + 1;
    const nextWeek = await fetch(`${origin}/api/rewards/free-hour`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...basePayload, deviceId: 'device-9876543210-wxyz' }),
    });
    assert.equal(nextWeek.status, 201);

    const entries = (await readFile(claimsDataFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.equal(entries.length, 2);
    assert.equal(entries[0].phone, '+79991234567');
    assert.equal(entries[0].city, 'Москва');
    assert.equal(entries[0].price, 50);
    assert.equal(entries[0].currency, 'termcoins');
    assert.equal(entries[0].consentVersion, 'reward-2026-08-12');
    assert.equal('ip' in entries[0], false);

    const deniedExport = await fetch(`${origin}/api/admin/rewards/free-hour/export?date=2026-08-12`);
    assert.equal(deniedExport.status, 401);

    const exportResponse = await fetch(`${origin}/api/admin/rewards/free-hour/export?date=2026-08-12&city=Москва`, {
      headers: { Authorization: 'Bearer cashier-test-token' },
    });
    assert.equal(exportResponse.status, 200);
    assert.match(exportResponse.headers.get('content-type') || '', /text\/csv/);
    const exportBody = await exportResponse.text();
    assert.match(exportBody, /TB-[A-F0-9]{8}/);
    assert.match(exportBody, /Анна/);
    assert.match(exportBody, /expired/);
  } finally {
    await service.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('four-game campaign keeps codes private and grants one lifetime promotional claim under concurrency', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'termburg-four-game-campaign-'));
  const dataFile = path.join(tempRoot, 'feedback.jsonl');
  const claimsDataFile = path.join(tempRoot, 'reward-claims.jsonl');
  let currentTime = Date.UTC(2026, 7, 21, 12, 0, 0);
  const service = await startFeedbackService({
    dataFile,
    claimsDataFile,
    host: '127.0.0.1',
    port: 0,
    allowedOrigin: 'https://tbgame.ru',
    rateLimit: 20,
    logger: { info() {}, error() {} },
    now: () => currentTime,
    accountOptions: {
      databaseFile: path.join(tempRoot, 'accounts.sqlite'),
      authSecret: 'synthetic-test-secret-that-is-long-enough-for-campaign-authentication',
      secureCookies: true,
    },
  });
  const origin = `http://127.0.0.1:${service.port}`;
  const headers = {
    'Content-Type': 'application/json',
    Origin: 'https://tbgame.ru',
    'User-Agent': 'Termburg Campaign QA',
  };
  const rewardPayload = {
    name: 'Ольга',
    phone: '8 999 444-55-66',
    age: 38,
    city: 'Москва',
    deviceId: 'device-four-game-claim-0001',
    consent: true,
    consentVersion: 'reward-2026-08-12',
    balance: 0,
    source: 'four-game-hub',
    campaignId: 'four-games-v1',
  };

  try {
    const unknownCampaign = await fetch(`${origin}/api/rewards/free-hour`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...rewardPayload, campaignId: 'unknown-campaign' }),
    });
    assert.equal(unknownCampaign.status, 400);
    assert.equal((await unknownCampaign.json()).code, 'UNKNOWN_REWARD_CAMPAIGN');

    const guestClaim = await fetch(`${origin}/api/rewards/free-hour`, {
      method: 'POST',
      headers,
      body: JSON.stringify(rewardPayload),
    });
    assert.equal(guestClaim.status, 401);
    assert.equal((await guestClaim.json()).code, 'AUTH_REQUIRED');

    const register = await fetch(`${origin}/api/auth/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: rewardPayload.phone,
        password: '4321',
        name: rewardPayload.name,
        city: rewardPayload.city,
        timeZone: 'Europe/Moscow',
        consent: true,
        consentVersion: 'account-2026-08-15',
        deviceId: 'device-four-game-account-0001',
        progress: {
          fourGameChallenge: {
            version: 1,
            completedGames: ['match3', 'game2048', 'bubbles'],
          },
        },
      }),
    });
    assert.equal(register.status, 201);
    const sessionCookie = String(register.headers.get('set-cookie') || '').split(';')[0];
    const registered = await register.json();
    rewardPayload.expectedAccountId = registered.account.id;

    const switchedAccountGet = await fetch(
      `${origin}/api/rewards/free-hour?campaignId=four-games-v1&expectedAccountId=another-account`,
      { headers: { Cookie: sessionCookie } },
    );
    assert.equal(switchedAccountGet.status, 409);
    const switchedAccountGetBody = await switchedAccountGet.json();
    assert.equal(switchedAccountGetBody.code, 'ACCOUNT_SESSION_CHANGED');
    assert.equal('claim' in switchedAccountGetBody, false);

    const switchedAccountPost = await fetch(`${origin}/api/rewards/free-hour`, {
      method: 'POST',
      headers: { ...headers, Cookie: sessionCookie },
      body: JSON.stringify({ ...rewardPayload, expectedAccountId: 'another-account' }),
    });
    assert.equal(switchedAccountPost.status, 409);
    const switchedAccountPostBody = await switchedAccountPost.json();
    assert.equal(switchedAccountPostBody.code, 'ACCOUNT_SESSION_CHANGED');
    assert.equal('claim' in switchedAccountPostBody, false);

    const incomplete = await fetch(`${origin}/api/rewards/free-hour`, {
      method: 'POST',
      headers: { ...headers, Cookie: sessionCookie },
      body: JSON.stringify(rewardPayload),
    });
    assert.equal(incomplete.status, 409);
    const incompleteBody = await incomplete.json();
    assert.equal(incompleteBody.code, 'CAMPAIGN_INCOMPLETE');
    assert.deepEqual(incompleteBody.completedGames, ['game2048', 'bubbles', 'match3']);

    const mismatchedPhone = await fetch(`${origin}/api/rewards/free-hour`, {
      method: 'POST',
      headers: { ...headers, Cookie: sessionCookie },
      body: JSON.stringify({ ...rewardPayload, phone: '8 999 000-00-01' }),
    });
    assert.equal(mismatchedPhone.status, 403);
    assert.equal((await mismatchedPhone.json()).code, 'ACCOUNT_PHONE_MISMATCH');

    const completedProgress = {
      ...registered.progress,
      fourGameChallenge: { version: 1, completedGames: ['pet'] },
    };
    const progressSync = await fetch(`${origin}/api/account/progress`, {
      method: 'PUT',
      headers: { ...headers, Cookie: sessionCookie },
      body: JSON.stringify({ progress: completedProgress, expectedAccountId: registered.account.id }),
    });
    assert.equal(progressSync.status, 200);
    assert.deepEqual((await progressSync.json()).progress.fourGameChallenge.completedGames, [
      'game2048', 'bubbles', 'pet', 'match3',
    ]);

    const concurrentClaims = await Promise.all([
      fetch(`${origin}/api/rewards/free-hour`, {
        method: 'POST',
        headers: { ...headers, Cookie: sessionCookie },
        body: JSON.stringify(rewardPayload),
      }),
      fetch(`${origin}/api/rewards/free-hour`, {
        method: 'POST',
        headers: { ...headers, Cookie: sessionCookie },
        body: JSON.stringify(rewardPayload),
      }),
    ]);
    assert.deepEqual(concurrentClaims.map(response => response.status).sort(), [201, 409]);
    const awardedBody = await concurrentClaims.find(response => response.status === 201).json();
    const concurrentDuplicateBody = await concurrentClaims.find(response => response.status === 409).json();
    assert.equal(awardedBody.claim.campaignId, 'four-games-v1');
    assert.equal('accountId' in awardedBody.claim, false);
    assert.equal(concurrentDuplicateBody.code, 'CAMPAIGN_ALREADY_CLAIMED');
    assert.equal(concurrentDuplicateBody.claim.id, awardedBody.claim.id);

    const privateCampaignStatus = await fetch(`${origin}/api/rewards/free-hour?deviceId=${rewardPayload.deviceId}&campaignId=four-games-v1`);
    assert.equal(privateCampaignStatus.status, 401);
    const privateCampaignStatusBody = await privateCampaignStatus.json();
    assert.equal(privateCampaignStatusBody.code, 'AUTH_REQUIRED');
    assert.equal('claim' in privateCampaignStatusBody, false);

    const campaignStatus = await fetch(
      `${origin}/api/rewards/free-hour?deviceId=device-does-not-select-claim&campaignId=four-games-v1&expectedAccountId=${registered.account.id}`,
      { headers: { Cookie: sessionCookie } },
    );
    assert.equal(campaignStatus.status, 200);
    const campaignStatusBody = await campaignStatus.json();
    assert.equal(campaignStatusBody.available, false);
    assert.equal(campaignStatusBody.claim.id, awardedBody.claim.id);
    assert.equal(campaignStatusBody.claim.campaignId, 'four-games-v1');

    const legacyStatus = await fetch(`${origin}/api/rewards/free-hour?deviceId=${rewardPayload.deviceId}`);
    assert.equal(legacyStatus.status, 200);
    const legacyStatusBody = await legacyStatus.json();
    assert.equal(legacyStatusBody.available, false);
    assert.equal('claim' in legacyStatusBody, false);
    assert.equal(JSON.stringify(legacyStatusBody).includes(awardedBody.claim.code), false);

    const regularDuringCooldown = await fetch(`${origin}/api/rewards/free-hour`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...rewardPayload, campaignId: undefined, balance: 50 }),
    });
    assert.equal(regularDuringCooldown.status, 409);
    const regularDuringCooldownBody = await regularDuringCooldown.json();
    assert.equal(regularDuringCooldownBody.code, 'REWARD_COOLDOWN');
    assert.equal('claim' in regularDuringCooldownBody, false);
    assert.equal(JSON.stringify(regularDuringCooldownBody).includes(awardedBody.claim.code), false);

    const account = await fetch(`${origin}/api/auth/me`, { headers: { Cookie: sessionCookie } });
    assert.equal(account.status, 200);
    const accountBody = await account.json();
    assert.equal(accountBody.progress.rewardClaims[0].campaignId, 'four-games-v1');
    assert.equal('accountId' in accountBody.progress.rewardClaims[0], false);
    assert.equal(accountBody.progress.inventory['ticket-free'], 1);

    const secondPhone = '8 999 444-55-77';
    const secondRegister = await fetch(`${origin}/api/auth/register`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: secondPhone,
        password: '4321',
        name: 'Ирина',
        city: 'Москва',
        timeZone: 'Europe/Moscow',
        consent: true,
        consentVersion: 'account-2026-08-15',
        deviceId: 'device-four-game-account-0002',
        progress: {
          fourGameChallenge: {
            version: 1,
            completedGames: ['game2048', 'bubbles', 'pet', 'match3'],
          },
        },
      }),
    });
    assert.equal(secondRegister.status, 201);
    const secondSessionCookie = String(secondRegister.headers.get('set-cookie') || '').split(';')[0];
    const secondRegistered = await secondRegister.json();

    const secondAccountStatus = await fetch(
      `${origin}/api/rewards/free-hour?deviceId=${rewardPayload.deviceId}&campaignId=four-games-v1&expectedAccountId=${secondRegistered.account.id}`,
      { headers: { Cookie: secondSessionCookie } },
    );
    assert.equal(secondAccountStatus.status, 200);
    assert.deepEqual(await secondAccountStatus.json(), { available: true });

    const deviceDuplicate = await fetch(`${origin}/api/rewards/free-hour`, {
      method: 'POST',
      headers: { ...headers, Cookie: secondSessionCookie },
      body: JSON.stringify({
        ...rewardPayload,
        expectedAccountId: secondRegistered.account.id,
        name: 'Ирина',
        phone: secondPhone,
      }),
    });
    assert.equal(deviceDuplicate.status, 409);
    const deviceDuplicateBody = await deviceDuplicate.json();
    assert.equal(deviceDuplicateBody.code, 'CAMPAIGN_ALREADY_CLAIMED');
    assert.equal('claim' in deviceDuplicateBody, false);
    assert.equal(JSON.stringify(deviceDuplicateBody).includes(awardedBody.claim.code), false);

    currentTime += 7 * 24 * 60 * 60 * 1000 + 1;
    const repeated = await fetch(`${origin}/api/rewards/free-hour`, {
      method: 'POST',
      headers: { ...headers, Cookie: sessionCookie },
      body: JSON.stringify({ ...rewardPayload, deviceId: 'device-four-game-claim-0002' }),
    });
    assert.equal(repeated.status, 409);
    const repeatedBody = await repeated.json();
    assert.equal(repeatedBody.code, 'CAMPAIGN_ALREADY_CLAIMED');
    assert.equal(repeatedBody.claim.id, awardedBody.claim.id);
    assert.equal(repeatedBody.claim.campaignId, 'four-games-v1');

    const expiredCampaignStatus = await fetch(
      `${origin}/api/rewards/free-hour?deviceId=${rewardPayload.deviceId}&campaignId=four-games-v1&expectedAccountId=${registered.account.id}`,
      { headers: { Cookie: sessionCookie } },
    );
    assert.equal(expiredCampaignStatus.status, 200);
    const expiredCampaignStatusBody = await expiredCampaignStatus.json();
    assert.equal(expiredCampaignStatusBody.available, false);
    assert.equal(expiredCampaignStatusBody.claim.status, 'expired');
    assert.equal(expiredCampaignStatusBody.claim.id, awardedBody.claim.id);

    const claims = (await readFile(claimsDataFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    assert.equal(claims.length, 1);
    assert.equal(claims[0].price, 0);
    assert.equal(claims[0].currency, 'promotion');
    assert.equal(claims[0].campaignId, 'four-games-v1');
    assert.equal(claims[0].accountId, registered.account.id);
  } finally {
    await service.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('server redemption import is protected, dry-run safe and idempotent', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'termburg-redemptions-'));
  const dataFile = path.join(tempRoot, 'feedback.jsonl');
  const claimsDataFile = path.join(tempRoot, 'reward-claims.jsonl');
  const redemptionsDataFile = path.join(tempRoot, 'reward-redemptions.jsonl');
  const currentTime = Date.UTC(2026, 7, 18, 12, 30, 0);
  const service = await startFeedbackService({
    dataFile,
    claimsDataFile,
    redemptionsDataFile,
    host: '127.0.0.1',
    port: 0,
    allowedOrigin: 'https://tbgame.ru',
    logger: { info() {}, error() {} },
    now: () => currentTime,
    cashierExportToken: 'cashier-test-token',
    rewardAdminToken: 'reward-admin-test-token',
    dolphinConnectorToken: 'dolphin-connector-test-token',
    accountOptions: {
      databaseFile: path.join(tempRoot, 'accounts.sqlite'),
      authSecret: 'synthetic-test-secret-that-is-long-enough-for-account-authentication',
      secureCookies: true,
    },
  });
  const origin = `http://127.0.0.1:${service.port}`;
  const rewardHeaders = {
    'Content-Type': 'application/json',
    Origin: 'https://tbgame.ru',
  };
  const claimPayload = {
    name: 'Анна',
    phone: '8 999 123-45-67',
    age: 64,
    city: 'Москва',
    deviceId: 'device-redemption-test-0001',
    consent: true,
    consentVersion: 'reward-2026-08-12',
    balance: 50,
    source: 'moscow-cashier',
  };

  try {
    const claimResponse = await fetch(`${origin}/api/rewards/free-hour`, {
      method: 'POST',
      headers: rewardHeaders,
      body: JSON.stringify(claimPayload),
    });
    assert.equal(claimResponse.status, 201);
    const claim = (await claimResponse.json()).claim;

    const connectorClaimResponse = await fetch(`${origin}/api/rewards/free-hour`, {
      method: 'POST',
      headers: rewardHeaders,
      body: JSON.stringify({
        ...claimPayload,
        name: 'Борис',
        phone: '8 999 123-45-68',
        deviceId: 'device-redemption-test-0002',
      }),
    });
    assert.equal(connectorClaimResponse.status, 201);
    const connectorClaim = (await connectorClaimResponse.json()).claim;

    const rows = [
      { code: claim.code, redeemedAt: '2026-08-18T15:10:00+03:00', sourceRecordId: '0000160961' },
      { code: claim.code, redeemedAt: '2026-08-18T15:10:00+03:00', sourceRecordId: 'duplicate-row' },
      { code: 'TB-1234567', sourceRecordId: 'invalid-row' },
      { code: 'TB-FFFFFFFF', sourceRecordId: 'unknown-row' },
    ];
    const denied = await fetch(`${origin}/api/admin/rewards/free-hour/redemptions/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: true, rows }),
    });
    assert.equal(denied.status, 401);

    const adminHeaders = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer reward-admin-test-token',
    };
    const preview = await fetch(`${origin}/api/admin/rewards/free-hour/redemptions/import`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ dryRun: true, source: 'dolphin-xls', rows }),
    });
    assert.equal(preview.status, 200);
    const previewBody = await preview.json();
    assert.equal(previewBody.dryRun, true);
    assert.equal(previewBody.summary.would_redeem, 1);
    assert.equal(previewBody.summary.already_redeemed, 1);
    assert.equal(previewBody.summary.invalid, 1);
    assert.equal(previewBody.summary.unknown, 1);
    await assert.rejects(readFile(redemptionsDataFile, 'utf8'), { code: 'ENOENT' });

    const deniedConnector = await fetch(`${origin}/api/integrations/dolphin/redemptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong-token' },
      body: JSON.stringify({
        dryRun: false,
        deviceId: 'moscow-cashier-01',
        rows: [{ code: connectorClaim.code, sourceRecordId: 'connector-denied' }],
      }),
    });
    assert.equal(deniedConnector.status, 401);

    const connectorHeaders = {
      'Content-Type': 'application/json',
      Authorization: 'Bearer dolphin-connector-test-token',
    };
    const connectorHealth = await fetch(`${origin}/api/integrations/dolphin/health`, {
      headers: { Authorization: 'Bearer dolphin-connector-test-token' },
    });
    assert.equal(connectorHealth.status, 200);
    assert.equal((await connectorHealth.json()).service, 'dolphin-redemption-import');

    const connectorApplied = await fetch(`${origin}/api/integrations/dolphin/redemptions`, {
      method: 'POST',
      headers: connectorHeaders,
      body: JSON.stringify({
        dryRun: false,
        source: 'ignored-client-source',
        deviceId: 'moscow-cashier-01',
        rows: [{
          code: connectorClaim.code,
          redeemedAt: '2026-08-18T15:11:00+03:00',
          sourceRecordId: '0000160962',
        }],
      }),
    });
    assert.equal(connectorApplied.status, 200);
    const connectorAppliedBody = await connectorApplied.json();
    assert.equal(connectorAppliedBody.source, 'dolphin-agent:moscow-cashier-01');
    assert.equal(connectorAppliedBody.summary.redeemed, 1);

    const connectorRepeated = await fetch(`${origin}/api/integrations/dolphin/redemptions`, {
      method: 'POST',
      headers: connectorHeaders,
      body: JSON.stringify({
        dryRun: false,
        deviceId: 'moscow-cashier-01',
        rows: [{ code: connectorClaim.code, sourceRecordId: '0000160962' }],
      }),
    });
    assert.equal(connectorRepeated.status, 200);
    assert.equal((await connectorRepeated.json()).summary.already_redeemed, 1);

    const applied = await fetch(`${origin}/api/admin/rewards/free-hour/redemptions/import`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ dryRun: false, source: 'dolphin-xls', rows: rows.slice(0, 1) }),
    });
    assert.equal(applied.status, 200);
    assert.equal((await applied.json()).summary.redeemed, 1);

    const repeated = await fetch(`${origin}/api/admin/rewards/free-hour/redemptions/import`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ dryRun: false, source: 'dolphin-xls', rows: rows.slice(0, 1) }),
    });
    assert.equal(repeated.status, 200);
    assert.equal((await repeated.json()).summary.already_redeemed, 1);
    assert.equal((await readFile(redemptionsDataFile, 'utf8')).trim().split('\n').length, 2);

    const status = await fetch(`${origin}/api/rewards/free-hour?deviceId=${claimPayload.deviceId}`);
    const statusBody = await status.json();
    assert.equal(statusBody.claim.status, 'redeemed');
    assert.equal(statusBody.claim.redeemedAt, Date.parse('2026-08-18T15:10:00+03:00'));

    const register = await fetch(`${origin}/api/auth/register`, {
      method: 'POST',
      headers: rewardHeaders,
      body: JSON.stringify({
        phone: claimPayload.phone,
        password: 'test-only-passphrase',
        name: claimPayload.name,
        city: claimPayload.city,
        consent: true,
        consentVersion: 'account-2026-08-15',
        deviceId: 'device-account-test-0001',
        progress: { currency: 50, inventory: { 'ticket-free': 1 } },
      }),
    });
    assert.equal(register.status, 201);
    const accountBody = await register.json();
    assert.deepEqual(accountBody.progress.rewardClaims, []);
    assert.equal(accountBody.progress.inventory['ticket-free'], 0);

    const exportResponse = await fetch(`${origin}/api/admin/rewards/free-hour/export?date=2026-08-18&city=Москва`, {
      headers: { Authorization: 'Bearer cashier-test-token' },
    });
    assert.equal(exportResponse.status, 200);
    assert.match(await exportResponse.text(), /redeemed/);
  } finally {
    await service.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('Dolphin installer enrolls once and receives a device-bound connector token', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'termburg-dolphin-enrollment-'));
  const enrollmentToken = 'installer-one-time-token-for-test-only';
  const deviceToken = 'a'.repeat(64);
  const deviceId = 'dolphin-zelenogorsk-11111111-2222-4333-8444-555555555555';
  const connectorsDataFile = path.join(tempRoot, 'dolphin-connectors.json');
  const service = await startFeedbackService({
    dataFile: path.join(tempRoot, 'feedback.jsonl'),
    claimsDataFile: path.join(tempRoot, 'reward-claims.jsonl'),
    redemptionsDataFile: path.join(tempRoot, 'reward-redemptions.jsonl'),
    dolphinConnectorsDataFile: connectorsDataFile,
    dolphinEnrollmentTokenHash: sha256(enrollmentToken),
    dolphinConnectorToken: 'legacy-dolphin-connector-token-for-test-only',
    dolphinSourceApiKey: 'dolphin-source-api-key-for-test-only',
    dolphinSourceApiUrls: 'http://127.0.0.1:60888,http://10.10.0.250:60888,http://85.202.234.197:60888',
    dolphinSourceApiPath: '/api/v1/barcodes/game',
    dolphinSourceApply: false,
    dolphinSourceLookbackDays: 2,
    dolphinSourceProfiles: {
      zelenogorsk: {
        apiKey: 'zelenogorsk-source-api-key-for-test-only',
        apiUrls: 'http://127.0.0.1:61888',
        apiPath: '/api/v1/barcodes/game',
        apply: true,
        lookbackDays: 3,
      },
    },
    host: '127.0.0.1',
    port: 0,
    logger: { info() {}, error() {} },
    accountOptions: {
      databaseFile: path.join(tempRoot, 'accounts.sqlite'),
      authSecret: 'synthetic-test-secret-that-is-long-enough-for-account-authentication',
    },
  });
  const origin = `http://127.0.0.1:${service.port}`;
  const enroll = body => fetch(`${origin}/api/integrations/dolphin/enroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const enrollmentPayload = { enrollmentToken, deviceId, deviceToken };

  try {
    const denied = await enroll({ ...enrollmentPayload, enrollmentToken: 'wrong' });
    assert.equal(denied.status, 401);

    const created = await enroll(enrollmentPayload);
    assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), { ok: true, deviceId, repeated: false });

    const repeated = await enroll(enrollmentPayload);
    assert.equal(repeated.status, 200);
    assert.equal((await repeated.json()).repeated, true);

    const stolen = await enroll({
      ...enrollmentPayload,
      deviceId: 'dolphin-another-computer-0002',
      deviceToken: 'b'.repeat(64),
    });
    assert.equal(stolen.status, 409);

    const health = await fetch(`${origin}/api/integrations/dolphin/health`, {
      headers: { Authorization: `Bearer ${deviceToken}` },
    });
    assert.equal(health.status, 200);
    assert.equal((await health.json()).deviceId, deviceId);

    const deniedSourceConfig = await fetch(`${origin}/api/integrations/dolphin/source-config`);
    assert.equal(deniedSourceConfig.status, 401);

    const sourceConfig = await fetch(`${origin}/api/integrations/dolphin/source-config`, {
      headers: { Authorization: `Bearer ${deviceToken}` },
    });
    assert.equal(sourceConfig.status, 200);
    assert.deepEqual(await sourceConfig.json(), {
      enabled: true,
      baseUrls: ['http://127.0.0.1:61888'],
      apiKey: 'zelenogorsk-source-api-key-for-test-only',
      apiPath: '/api/v1/barcodes/game',
      lookbackDays: 3,
      applyRedemptions: true,
    });

    const legacySourceConfig = await fetch(`${origin}/api/integrations/dolphin/source-config`, {
      headers: { Authorization: 'Bearer legacy-dolphin-connector-token-for-test-only' },
    });
    assert.equal(legacySourceConfig.status, 200);
    assert.deepEqual(await legacySourceConfig.json(), {
      enabled: true,
      baseUrls: ['http://127.0.0.1:60888', 'http://10.10.0.250:60888'],
      apiKey: 'dolphin-source-api-key-for-test-only',
      apiPath: '/api/v1/barcodes/game',
      lookbackDays: 2,
      applyRedemptions: false,
    });

    const heartbeat = await fetch(`${origin}/api/integrations/dolphin/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
      body: JSON.stringify({
        appVersion: '1.1.0',
        queueSize: 0,
        sourceApi: {
          status: 'diagnostic',
          sourceRows: 18,
          redemptions: 2,
          schemaKeys: ['barcode', 'entry_time'],
          apiKey: 'must-not-be-persisted',
        },
      }),
    });
    assert.equal(heartbeat.status, 200);
    assert.equal((await heartbeat.json()).heartbeat.sourceApi.status, 'diagnostic');

    const imported = await fetch(`${origin}/api/integrations/dolphin/redemptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
      body: JSON.stringify({
        dryRun: true,
        deviceId: 'spoofed-device-id-0001',
        rows: [{ code: 'TB-FFFFFFFF', sourceRecordId: 'enrollment-test' }],
      }),
    });
    assert.equal(imported.status, 200);
    assert.equal((await imported.json()).source, `dolphin-agent:${deviceId}`);

    const stored = await readFile(connectorsDataFile, 'utf8');
    assert.equal(stored.includes(enrollmentToken), false);
    assert.equal(stored.includes(deviceToken), false);
    assert.equal(stored.includes('must-not-be-persisted'), false);
    assert.equal(stored.includes('dolphin-source-api-key-for-test-only'), false);
    assert.match(stored, /"appVersion": "1\.1\.0"/);
    assert.match(stored, new RegExp(sha256(deviceToken)));
  } finally {
    await service.close();
    await rm(tempRoot, { recursive: true, force: true });
  }
});
