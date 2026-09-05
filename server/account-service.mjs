import { createHash, createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { mkdirSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';

export const ACCOUNT_CONSENT_VERSION = 'account-2026-08-15';

const COOKIE_NAME = 'tb_session';
const PASSWORD_MIN_LENGTH = 4;
const PASSWORD_MAX_LENGTH = 128;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_PHONE_FAILURE_LIMIT = 5;
const LOGIN_IP_FAILURE_LIMIT = 20;
const DEVICE_REGISTRATION_LIMIT = 2;
const DEVICE_REGISTRATION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 192 * 1024;
const MAX_PROGRESS_BYTES = 128 * 1024;
const DEFAULT_LEGACY_COIN_CAP = 600;
const GAME_REWARD_SOURCES = ['match3', 'game2048', 'bubbles', 'pet'];
const FOUR_GAME_CAMPAIGN_ID = 'four-games-v1';
const FOUR_GAME_CHALLENGE_SOURCES = ['game2048', 'bubbles', 'pet', 'match3'];
const DAILY_GAME_REWARD_LIMIT = 30;
const DAILY_TOTAL_REWARD_LIMIT = 120;
const GAME_LEVEL_TOTAL = 50;
const DEFAULT_CITY = 'Москва';
const DEFAULT_TIME_ZONE = 'Europe/Moscow';
const CITY_TIMEZONES = {
  Москва: DEFAULT_TIME_ZONE,
  Зеленогорск: 'Asia/Krasnoyarsk',
};
const CHARACTER_IDS = new Set(['yaromir', 'valkiriya', 'pereslav', 'kazimir', 'vedagor', 'milovan', 'lelya']);
const PET_DEPLETED_STATS = new Set(['hunger', 'happiness', 'energy', 'cleanliness']);
const PRODUCT_PRICES = {
  'ticket-vip': 5000,
  'merch-hat': 6000,
  'booster-hint': 20,
  'booster-shuffle': 30,
  'booster-bomb': 50,
};

const scryptAsync = promisify(scrypt);

const DEFAULT_PROGRESS = Object.freeze({
  currentLevel: 1,
  levels: {},
  currency: 0,
  dailyGameRewards: null,
  fourGameChallenge: { version: 1, completedGames: [] },
  lives: 5,
  nextLifeAt: null,
  selectedCharacter: 'yaromir',
  tutorialCompleted: false,
  tutorialFlags: [],
  best2048Score: 0,
  game2048LevelsCompleted: 0,
  bubbleLevelsCompleted: 0,
  pet: null,
  petDeparture: null,
  unlockedCharacters: ['yaromir'],
  inventory: {},
  rewardClaims: [],
  cart: [],
  orders: [],
});

class AccountHttpError extends Error {
  constructor(status, message, details = {}, headers = {}) {
    super(message);
    this.name = 'AccountHttpError';
    this.status = status;
    this.details = details;
    this.headers = headers;
  }
}

function sendJson(response, statusCode, value, extraHeaders = {}) {
  const body = JSON.stringify(value);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    ...extraHeaders,
  });
  response.end(body);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new AccountHttpError(413, 'Запрос слишком большой.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AccountHttpError(400, 'Не удалось прочитать запрос.');
  }
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizePhone(value) {
  const digits = cleanText(value, 40).replace(/\D/g, '');
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`;
  if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`;
  return '';
}

function normalizeLogin(value) {
  const login = cleanText(value, 40).toLowerCase();
  return /^[a-z][a-z0-9_-]{2,31}$/.test(login) ? login : '';
}

function maskedPhone(last4) {
  return `+7 ••• •••-${String(last4).slice(0, 2)}-${String(last4).slice(2)}`;
}

function requestIp(request) {
  const realIp = request.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp) return realIp.trim();
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return request.socket.remoteAddress || 'unknown';
}

function hmac(secret, value) {
  return createHmac('sha256', secret).update(String(value)).digest('hex');
}

function tokenHash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

async function derivePassword(password, salt) {
  const derived = await scryptAsync(password, salt, 64, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return Buffer.from(derived);
}

async function passwordRecord(password) {
  const salt = randomBytes(16).toString('base64url');
  const hash = await derivePassword(password, salt);
  return { salt, hash: hash.toString('base64url') };
}

async function passwordMatches(password, salt, encodedHash) {
  try {
    const expected = Buffer.from(encodedHash, 'base64url');
    const actual = await derivePassword(password, salt);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

function parseCookies(header) {
  const result = new Map();
  for (const part of String(header || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator <= 0) continue;
    result.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  }
  return result;
}

function sessionCookie(token, secure, maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000)) {
  return [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

function normalizeTimeZone(value, city) {
  const timeZone = cleanText(value, 100);
  if (timeZone) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone });
      return timeZone;
    } catch {
      // Fall back to the known city zone for older or malformed clients.
    }
  }
  return CITY_TIMEZONES[city] || DEFAULT_TIME_ZONE;
}

function localDateKey(timestamp, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || DEFAULT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const value = type => parts.find(item => item.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function safeInteger(value, min, max, fallback = min) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.floor(number))) : fallback;
}

function safeTimestamp(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function uniqueStrings(value, maxItems, maxLength) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => cleanText(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function normalizeDailyRewards(value, now, timeZone) {
  const currentDate = localDateKey(now, timeZone);
  const source = plainObject(value);
  const earned = plainObject(source.earned);
  const normalized = {};
  for (const game of GAME_REWARD_SOURCES) {
    normalized[game] = source.date === currentDate
      ? safeInteger(earned[game], 0, DAILY_GAME_REWARD_LIMIT, 0)
      : 0;
  }
  const total = GAME_REWARD_SOURCES.reduce((sum, game) => sum + normalized[game], 0);
  if (total > DAILY_TOTAL_REWARD_LIMIT) {
    let remaining = DAILY_TOTAL_REWARD_LIMIT;
    for (const game of GAME_REWARD_SOURCES) {
      normalized[game] = Math.min(normalized[game], remaining);
      remaining -= normalized[game];
    }
  }
  return { date: currentDate, earned: normalized };
}

function normalizeFourGameChallenge(value, previousValue = null) {
  const incoming = plainObject(value);
  const previous = plainObject(previousValue);
  const completed = new Set([
    ...(Array.isArray(previous.completedGames) ? previous.completedGames : []),
    ...(Array.isArray(incoming.completedGames) ? incoming.completedGames : []),
  ]);
  return {
    version: 1,
    completedGames: FOUR_GAME_CHALLENGE_SOURCES.filter(source => completed.has(source)),
  };
}

function backfillFourGameChallenge(progress) {
  const completed = new Set(normalizeFourGameChallenge(progress.fourGameChallenge).completedGames);
  const levels = plainObject(progress.levels);
  const currentLevel = safeInteger(progress.currentLevel, 1, GAME_LEVEL_TOTAL + 1, 1);
  const pet = plainObject(progress.pet);
  const petDeparture = plainObject(progress.petDeparture);

  if (safeInteger(progress.game2048LevelsCompleted, 0, GAME_LEVEL_TOTAL, 0) > 0) completed.add('game2048');
  if (safeInteger(progress.bubbleLevelsCompleted, 0, GAME_LEVEL_TOTAL, 0) > 0) completed.add('bubbles');
  if (currentLevel > 1 || Object.values(levels).some(level => plainObject(level).completed === true)) completed.add('match3');
  if (
    safeInteger(pet.experience, 0, 100_000_000, 0) >= 100
    || safeInteger(petDeparture.experience, 0, 100_000_000, 0) >= 100
  ) completed.add('pet');

  return normalizeFourGameChallenge({ completedGames: [...completed] });
}

function normalizePetDeparture(value) {
  const source = plainObject(value);
  const adoptionId = cleanText(source.adoptionId, 100);
  const characterId = cleanText(source.characterId, 40);
  const name = cleanText(source.name, 40);
  const depletedStat = cleanText(source.depletedStat, 20);
  const departedAt = safeTimestamp(source.departedAt, null);
  if (!CHARACTER_IDS.has(characterId) || !name || !PET_DEPLETED_STATS.has(depletedStat) || !departedAt) return null;
  return {
    ...(adoptionId ? { adoptionId } : {}),
    characterId,
    name,
    depletedStat,
    departedAt,
    experience: safeInteger(source.experience, 0, 100_000_000, 0),
  };
}

function getPetAdoptionId(value) {
  const source = plainObject(value);
  const explicitId = cleanText(source.adoptionId, 100);
  if (explicitId) return explicitId;
  const diary = Array.isArray(source.diary) ? source.diary : [];
  const adoptionEntry = diary.find(entry => cleanText(plainObject(entry).id, 100).startsWith('adopt-'));
  const legacyId = cleanText(plainObject(adoptionEntry).id, 100);
  if (legacyId) return `legacy-${legacyId}`.slice(0, 100);
  const characterId = cleanText(source.characterId, 40);
  return characterId ? `legacy-${characterId}`.slice(0, 100) : null;
}

function isSamePetInstance(firstId, secondId, firstCharacterId, secondCharacterId) {
  if (firstId || secondId) return Boolean(firstId && secondId && firstId === secondId);
  return Boolean(firstCharacterId && firstCharacterId === secondCharacterId);
}

function mergeLevels(incomingValue, previousValue) {
  const incoming = plainObject(incomingValue);
  const previous = plainObject(previousValue);
  const merged = {};
  const levelIds = [...new Set([...Object.keys(previous), ...Object.keys(incoming)])]
    .filter(key => /^\d{1,3}$/.test(key))
    .map(Number)
    .filter(id => id >= 1 && id <= GAME_LEVEL_TOTAL)
    .sort((first, second) => first - second);
  for (const id of levelIds) {
    const key = String(id);
    const before = plainObject(previous[key]);
    const next = plainObject(incoming[key]);
    merged[id] = {
      stars: Math.max(safeInteger(before.stars, 0, 3, 0), safeInteger(next.stars, 0, 3, 0)),
      bestScore: Math.max(safeInteger(before.bestScore, 0, 100_000_000, 0), safeInteger(next.bestScore, 0, 100_000_000, 0)),
      completed: before.completed === true || next.completed === true,
    };
  }
  return merged;
}

function normalizeInventory(value, previousValue, availableSpend, initial) {
  const incoming = plainObject(value);
  const previous = plainObject(previousValue);
  const normalized = {};
  let requiredSpend = 0;

  for (const [productId, price] of Object.entries(PRODUCT_PRICES)) {
    const before = safeInteger(previous[productId], 0, 100, 0);
    const requested = safeInteger(incoming[productId], 0, 100, before);
    if (requested > before) requiredSpend += (requested - before) * price;
    normalized[productId] = requested;
  }

  if (!initial && requiredSpend > availableSpend) {
    for (const productId of Object.keys(PRODUCT_PRICES)) {
      const before = safeInteger(previous[productId], 0, 100, 0);
      normalized[productId] = Math.min(normalized[productId], before);
    }
  }

  return normalized;
}

function sanitizeCart(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).flatMap(item => {
    const source = plainObject(item);
    const productId = cleanText(source.productId, 64);
    if (!productId) return [];
    return [{ productId, quantity: safeInteger(source.quantity, 1, 20, 1) }];
  });
}

function sanitizeOrders(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-50).flatMap(item => {
    const source = plainObject(item);
    const id = cleanText(source.id, 80);
    if (!id) return [];
    return [{
      id,
      items: sanitizeCart(source.items),
      total: safeInteger(source.total, 0, 10_000_000, 0),
      name: cleanText(source.name, 80),
      phone: cleanText(source.phone, 40),
      ...(cleanText(source.email, 120) ? { email: cleanText(source.email, 120) } : {}),
      createdAt: safeTimestamp(source.createdAt, Date.now()),
      status: ['pending', 'confirmed', 'completed'].includes(source.status) ? source.status : 'pending',
    }];
  });
}

function publicClaim(claim, currentTime) {
  const status = claim.redeemedAt ? 'redeemed' : claim.expiresAt > currentTime ? 'active' : 'expired';
  return {
    id: claim.id,
    rewardId: 'ticket-free',
    code: claim.code,
    purchasedAt: claim.purchasedAt,
    expiresAt: claim.expiresAt,
    nextPurchaseAt: claim.nextPurchaseAt,
    status,
    ...(claim.campaignId === FOUR_GAME_CAMPAIGN_ID ? { campaignId: FOUR_GAME_CAMPAIGN_ID } : {}),
    ...(claim.redeemedAt ? { redeemedAt: claim.redeemedAt } : {}),
  };
}

function sanitizeProgress(inputValue, options) {
  const {
    now,
    timeZone,
    previous = DEFAULT_PROGRESS,
    initial = false,
    legacyCoinCap = DEFAULT_LEGACY_COIN_CAP,
    validClaims = [],
  } = options;
  const input = plainObject(inputValue);
  const before = plainObject(previous);
  const previousDaily = normalizeDailyRewards(before.dailyGameRewards, now, timeZone);
  const incomingDaily = normalizeDailyRewards(input.dailyGameRewards, now, timeZone);
  const mergedEarned = {};
  let dailyGain = 0;
  for (const source of GAME_REWARD_SOURCES) {
    const merged = initial
      ? incomingDaily.earned[source]
      : Math.max(previousDaily.earned[source], incomingDaily.earned[source]);
    mergedEarned[source] = merged;
    dailyGain += Math.max(0, merged - previousDaily.earned[source]);
  }
  const dailyGameRewards = { date: incomingDaily.date, earned: mergedEarned };
  const fourGameChallenge = normalizeFourGameChallenge(input.fourGameChallenge, before.fourGameChallenge);

  const previousCurrency = safeInteger(before.currency, 0, 1_000_000, 0);
  const requestedCurrency = safeInteger(input.currency, 0, 1_000_000, 0);
  const currencyCeiling = initial ? legacyCoinCap : previousCurrency + dailyGain;
  const currency = Math.min(requestedCurrency, currencyCeiling);
  const availableSpend = Math.max(0, previousCurrency + dailyGain - currency);
  const inventory = normalizeInventory(input.inventory, before.inventory, availableSpend, initial);
  inventory['ticket-free'] = validClaims.some(claim => !claim.redeemedAt && claim.expiresAt > now) ? 1 : 0;

  const previousUnlocks = uniqueStrings(before.unlockedCharacters, 20, 40).filter(id => CHARACTER_IDS.has(id));
  const incomingUnlocks = uniqueStrings(input.unlockedCharacters, 20, 40).filter(id => CHARACTER_IDS.has(id));
  const unlockedCharacters = [...new Set(['yaromir', ...previousUnlocks, ...incomingUnlocks])];
  const selectedCharacter = unlockedCharacters.includes(input.selectedCharacter)
    ? input.selectedCharacter
    : (unlockedCharacters.includes(before.selectedCharacter) ? before.selectedCharacter : 'yaromir');
  const tutorialFlags = [...new Set([
    ...uniqueStrings(before.tutorialFlags, 80, 80),
    ...uniqueStrings(input.tutorialFlags, 80, 80),
  ])].slice(0, 80);

  const incomingPet = plainObject(input.pet);
  const previousPet = plainObject(before.pet);
  const previousPetDeparture = normalizePetDeparture(before.petDeparture);
  const incomingPetDeparture = normalizePetDeparture(input.petDeparture);
  const hasPreviousPet = Object.keys(previousPet).length > 0;
  const hasIncomingPet = Object.keys(incomingPet).length > 0;
  const previousPetAdoptionId = getPetAdoptionId(previousPet);
  const incomingPetAdoptionId = getPetAdoptionId(incomingPet);
  const incomingPetIsCurrent = hasPreviousPet && isSamePetInstance(
    previousPetAdoptionId,
    incomingPetAdoptionId,
    cleanText(previousPet.characterId, 40),
    cleanText(incomingPet.characterId, 40),
  );
  const incomingDepartureAdoptionId = incomingPetDeparture?.adoptionId ?? null;
  const permitsLegacyDepartureFallback = !incomingDepartureAdoptionId
    && (!previousPetAdoptionId || previousPetAdoptionId.startsWith('legacy-'));
  const incomingDepartureMatchesCurrent = hasPreviousPet && Boolean(incomingPetDeparture) && isSamePetInstance(
    permitsLegacyDepartureFallback ? null : previousPetAdoptionId,
    incomingDepartureAdoptionId,
    cleanText(previousPet.characterId, 40),
    incomingPetDeparture?.characterId ?? '',
  );
  const incomingDepartureUpdatesPrevious = !hasPreviousPet && Boolean(previousPetDeparture) && Boolean(incomingPetDeparture)
    && isSamePetInstance(
      previousPetDeparture?.adoptionId ?? null,
      incomingPetDeparture?.adoptionId ?? null,
      previousPetDeparture?.characterId ?? '',
      incomingPetDeparture?.characterId ?? '',
    );
  const incomingPetIsNewAdoption = !hasPreviousPet
    && Boolean(previousPetDeparture)
    && Boolean(incomingPetAdoptionId)
    && incomingDepartureUpdatesPrevious
    && (incomingPetDeparture?.departedAt ?? 0) >= (previousPetDeparture?.departedAt ?? 0)
    && safeTimestamp(incomingPet.lastUpdated, 0) >= (incomingPetDeparture?.departedAt ?? 0)
    && (previousPetDeparture?.adoptionId
      ? incomingPetAdoptionId !== previousPetDeparture.adoptionId
      : !incomingPetAdoptionId.startsWith('legacy-'));
  const incomingDepartureIsInitial = !hasPreviousPet
    && !previousPetDeparture
    && Boolean(incomingPetDeparture);
  const previousPetEventAt = Math.max(
    safeTimestamp(previousPet.lastUpdated, 0),
    previousPetDeparture?.departedAt ?? 0,
  );
  const incomingPetReplacesDeparted = hasPreviousPet
    && hasIncomingPet
    && incomingDepartureMatchesCurrent
    && Boolean(incomingPetAdoptionId)
    && incomingPetAdoptionId !== previousPetAdoptionId
    && (incomingPetDeparture?.departedAt ?? 0) >= previousPetEventAt
    && safeTimestamp(incomingPet.lastUpdated, 0) >= (incomingPetDeparture?.departedAt ?? 0);
  const acceptsIncomingPet = hasIncomingPet
    && safeTimestamp(incomingPet.lastUpdated, 0) >= previousPetEventAt
    && (
      !hasPreviousPet && !previousPetDeparture
      || incomingPetIsCurrent
      || incomingPetIsNewAdoption
      || incomingPetReplacesDeparted
    );
  const acceptsIncomingDeparture = input.pet === null
    && incomingPetDeparture
    && incomingPetDeparture.departedAt >= previousPetEventAt
    && (incomingDepartureMatchesCurrent || incomingDepartureUpdatesPrevious || incomingDepartureIsInitial);
  const preservedPetExperience = Math.max(
    safeInteger(previousPet.experience, 0, 100_000_000, 0),
    previousPetDeparture?.experience ?? 0,
    incomingPetReplacesDeparted ? (incomingPetDeparture?.experience ?? 0) : 0,
  );
  const pet = acceptsIncomingDeparture
    ? null
    : acceptsIncomingPet
      ? {
          ...incomingPet,
          ...(incomingPetAdoptionId ? { adoptionId: incomingPetAdoptionId } : {}),
          experience: Math.max(
            preservedPetExperience,
            safeInteger(incomingPet.experience, 0, 100_000_000, 0),
          ),
        }
      : (Object.keys(previousPet).length > 0 ? previousPet : null);
  const petDeparture = acceptsIncomingDeparture
    ? {
        ...incomingPetDeparture,
        ...((incomingPetDeparture.adoptionId || previousPetAdoptionId)
          ? { adoptionId: incomingPetDeparture.adoptionId || previousPetAdoptionId }
          : {}),
        experience: Math.max(preservedPetExperience, incomingPetDeparture.experience),
      }
    : acceptsIncomingPet
      ? null
      : previousPetDeparture;

  const progress = {
    currentLevel: Math.max(
      safeInteger(before.currentLevel, 1, GAME_LEVEL_TOTAL + 1, 1),
      safeInteger(input.currentLevel, 1, GAME_LEVEL_TOTAL + 1, 1),
    ),
    levels: mergeLevels(input.levels, before.levels),
    currency,
    dailyGameRewards,
    fourGameChallenge,
    lives: safeInteger(input.lives, 0, 5, safeInteger(before.lives, 0, 5, 5)),
    nextLifeAt: input.nextLifeAt === null ? null : safeTimestamp(input.nextLifeAt, before.nextLifeAt ?? null),
    selectedCharacter,
    tutorialCompleted: before.tutorialCompleted === true || input.tutorialCompleted === true,
    tutorialFlags,
    best2048Score: Math.max(safeInteger(before.best2048Score, 0, 1_000_000_000, 0), safeInteger(input.best2048Score, 0, 1_000_000_000, 0)),
    game2048LevelsCompleted: Math.max(
      safeInteger(before.game2048LevelsCompleted, 0, GAME_LEVEL_TOTAL, 0),
      safeInteger(input.game2048LevelsCompleted, 0, GAME_LEVEL_TOTAL, 0),
    ),
    bubbleLevelsCompleted: Math.max(
      safeInteger(before.bubbleLevelsCompleted, 0, GAME_LEVEL_TOTAL, 0),
      safeInteger(input.bubbleLevelsCompleted, 0, GAME_LEVEL_TOTAL, 0),
    ),
    pet,
    petDeparture,
    unlockedCharacters,
    inventory,
    rewardClaims: validClaims.map(claim => publicClaim(claim, now)),
    cart: sanitizeCart(input.cart),
    orders: sanitizeOrders(input.orders),
  };

  const migratedProgress = {
    ...progress,
    fourGameChallenge: backfillFourGameChallenge(progress),
  };
  const serialized = JSON.stringify(migratedProgress);
  if (Buffer.byteLength(serialized) > MAX_PROGRESS_BYTES) {
    throw new AccountHttpError(413, 'Прогресс слишком большой для синхронизации.');
  }
  return migratedProgress;
}

function parseProgress(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : { ...DEFAULT_PROGRESS };
  } catch {
    return { ...DEFAULT_PROGRESS };
  }
}

function publicAccount(row) {
  return {
    id: row.id,
    name: row.name,
    city: row.city,
    phoneMasked: row.login_name ? '' : maskedPhone(row.phone_last4),
    login: row.login_name || null,
    isTest: Boolean(row.is_test),
    createdAt: Number(row.created_at),
    lastLoginAt: Number(row.last_login_at),
  };
}

function initializeDatabase(database) {
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone_hash TEXT NOT NULL UNIQUE,
      phone_last4 TEXT NOT NULL,
      login_name TEXT,
      is_test INTEGER NOT NULL DEFAULT 0 CHECK(is_test IN (0, 1)),
      allow_legacy_reward_claims INTEGER NOT NULL DEFAULT 0 CHECK(allow_legacy_reward_claims IN (0, 1)),
      name TEXT NOT NULL,
      city TEXT NOT NULL,
      time_zone TEXT NOT NULL DEFAULT 'Europe/Moscow',
      consent_version TEXT NOT NULL,
      consent_at INTEGER NOT NULL,
      registration_device_hash TEXT NOT NULL,
      progress_json TEXT NOT NULL,
      progress_revision INTEGER NOT NULL DEFAULT 1,
      password_salt TEXT,
      password_hash TEXT,
      password_changed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_login_at INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS auth_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone_hash TEXT NOT NULL,
      ip_hash TEXT NOT NULL,
      success INTEGER NOT NULL CHECK(success IN (0, 1)),
      created_at INTEGER NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS auth_attempts_phone_idx ON auth_attempts(phone_hash, created_at);
    CREATE INDEX IF NOT EXISTS auth_attempts_ip_idx ON auth_attempts(ip_hash, created_at);

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id, expires_at);
  `);

  const userColumns = new Set(database.prepare('PRAGMA table_info(users)').all().map(column => column.name));
  const needsTimeZoneMigration = !userColumns.has('time_zone');
  // Preserve phone-only claims for existing profiles; fresh profiles stay account-bound because registration has no OTP.
  for (const [name, definition] of [
    ['password_salt', 'TEXT'],
    ['password_hash', 'TEXT'],
    ['password_changed_at', 'INTEGER'],
    ['login_name', 'TEXT'],
    ['is_test', 'INTEGER NOT NULL DEFAULT 0'],
    ['allow_legacy_reward_claims', 'INTEGER NOT NULL DEFAULT 1'],
    ['time_zone', `TEXT NOT NULL DEFAULT '${DEFAULT_TIME_ZONE}'`],
  ]) {
    if (!userColumns.has(name)) database.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
  }
  if (needsTimeZoneMigration) {
    database.prepare('UPDATE users SET time_zone = ? WHERE city = ?')
      .run(CITY_TIMEZONES.Зеленогорск, 'Зеленогорск');
  }
  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_login_name_idx ON users(login_name) WHERE login_name IS NOT NULL');

  // Password auth fully replaces the former one-time-code flow.
  database.exec('DROP TABLE IF EXISTS otp_challenges');
}

function withTransaction(database, task) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = task();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function createAccountService(options) {
  const {
    databaseFile,
    claimsDataFile = '',
    redemptionsDataFile = '',
    allowedOrigin = '',
    authSecret = '',
    secureCookies = true,
    legacyCoinCap = DEFAULT_LEGACY_COIN_CAP,
    testProfile = null,
    now = () => Date.now(),
    logger = console,
  } = options;

  if (!databaseFile) throw new Error('databaseFile is required');
  const resolvedDatabaseFile = path.resolve(databaseFile);
  const resolvedRedemptionsDataFile = redemptionsDataFile ? path.resolve(redemptionsDataFile) : '';
  const authConfigured = cleanText(authSecret, 500).length >= 32;
  const secret = authConfigured ? authSecret : randomBytes(32).toString('hex');
  mkdirSync(path.dirname(resolvedDatabaseFile), { recursive: true, mode: 0o750 });
  const database = new DatabaseSync(resolvedDatabaseFile, { timeout: 5000 });
  initializeDatabase(database);

  const statements = {
    userByPhone: database.prepare('SELECT * FROM users WHERE phone_hash = ?'),
    userById: database.prepare('SELECT * FROM users WHERE id = ?'),
    sessionWithUser: database.prepare(`
      SELECT s.token_hash, s.user_id, s.device_hash, s.expires_at, s.last_seen_at,
             u.id, u.phone_hash, u.phone_last4, u.login_name, u.is_test, u.allow_legacy_reward_claims,
             u.name, u.city, u.time_zone, u.progress_json,
             u.progress_revision, u.created_at, u.updated_at, u.last_login_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
    `),
  };

  const configuredTestUsername = cleanText(testProfile?.username, 40);
  const normalizedTestUsername = normalizeLogin(configuredTestUsername);
  const configuredTestPassword = typeof testProfile?.password === 'string' ? testProfile.password : '';
  const configuredTestCity = cleanText(testProfile?.city, 40) || DEFAULT_CITY;
  const configuredTestTimeZone = normalizeTimeZone(testProfile?.timeZone, configuredTestCity);
  const hasAnyTestProfileSetting = Boolean(configuredTestUsername || configuredTestPassword);
  if (hasAnyTestProfileSetting && (!authConfigured || !normalizedTestUsername || !configuredTestPassword || configuredTestPassword.length > PASSWORD_MAX_LENGTH)) {
    throw new Error('Test profile configuration is incomplete or invalid.');
  }

  const ready = hasAnyTestProfileSetting ? (async () => {
    const currentTime = now();
    const identityHash = hmac(secret, `login:${normalizedTestUsername}`);
    const passwordData = await passwordRecord(configuredTestPassword);
    const existing = statements.userByPhone.get(identityHash);
    if (existing) {
      database.prepare(`
        UPDATE users SET login_name = ?, is_test = 1, name = ?, city = ?, time_zone = ?,
          password_salt = ?, password_hash = ?, password_changed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(
        configuredTestUsername,
        cleanText(testProfile?.name, 80) || 'Тестовый профиль',
        configuredTestCity,
        configuredTestTimeZone,
        passwordData.salt,
        passwordData.hash,
        currentTime,
        currentTime,
        existing.id,
      );
      return;
    }
    database.prepare(`
      INSERT INTO users (
        id, phone_hash, phone_last4, login_name, is_test, name, city, time_zone,
        consent_version, consent_at, registration_device_hash, progress_json, progress_revision,
        password_salt, password_hash, password_changed_at, created_at, updated_at, last_login_at
      ) VALUES (?, ?, '', ?, 1, ?, ?, ?, 'internal-test-profile', ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      identityHash,
      configuredTestUsername,
      cleanText(testProfile?.name, 80) || 'Тестовый профиль',
      configuredTestCity,
      configuredTestTimeZone,
      currentTime,
      hmac(secret, `test-device:${normalizedTestUsername}`),
      JSON.stringify(DEFAULT_PROGRESS),
      passwordData.salt,
      passwordData.hash,
      currentTime,
      currentTime,
      currentTime,
      currentTime,
    );
  })() : Promise.resolve();

  async function validClaims(account) {
    if (!claimsDataFile) return [];
    const accountId = cleanText(account?.id, 80);
    const phoneHash = cleanText(account?.phone_hash, 80);
    const allowLegacyClaims = Number(account?.allow_legacy_reward_claims) === 1;
    try {
      const redeemedByCode = new Map();
      if (resolvedRedemptionsDataFile) {
        try {
          const redemptionRaw = await fs.readFile(resolvedRedemptionsDataFile, 'utf8');
          for (const line of redemptionRaw.split('\n').filter(Boolean)) {
            try {
              const redemption = JSON.parse(line);
              if (redemption?.code && !redeemedByCode.has(redemption.code)) {
                redeemedByCode.set(redemption.code, redemption);
              }
            } catch {
              // A malformed audit line is ignored without affecting valid claims.
            }
          }
        } catch (error) {
          if (error?.code !== 'ENOENT') logger.error?.('[account-redemptions]', error);
        }
      }
      const raw = await fs.readFile(path.resolve(claimsDataFile), 'utf8');
      const seen = new Set();
      return raw.split('\n').filter(Boolean).flatMap(line => {
        try {
          const claim = JSON.parse(line);
          const claimAccountId = cleanText(claim.accountId, 80);
          if (claimAccountId) {
            if (!accountId || claimAccountId !== accountId) return [];
          } else {
            const phone = normalizePhone(claim.phone);
            if (!allowLegacyClaims || !phone || hmac(secret, `phone:${phone}`) !== phoneHash) return [];
          }
          if (!claim.id || !claim.code || seen.has(claim.id)) return [];
          seen.add(claim.id);
          const redemption = redeemedByCode.get(claim.code);
          return [{
            ...claim,
            ...(redemption ? { redeemedAt: redemption.redeemedAt } : {}),
          }];
        } catch {
          return [];
        }
      });
    } catch (error) {
      if (error?.code !== 'ENOENT') logger.error?.('[account-claims]', error);
      return [];
    }
  }

  function validateOrigin(request) {
    const origin = cleanText(request.headers.origin, 300);
    if (allowedOrigin && origin !== allowedOrigin) {
      throw new AccountHttpError(403, 'Этот сайт не может изменять профиль.');
    }
  }

  function requireJson(request) {
    if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      throw new AccountHttpError(415, 'Нужен формат JSON.');
    }
  }

  function cleanup(currentTime) {
    database.prepare('DELETE FROM auth_attempts WHERE created_at < ?').run(currentTime - 24 * 60 * 60 * 1000);
    database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(currentTime);
  }

  function requireAuthConfigured() {
    if (!authConfigured) {
      throw new AccountHttpError(503, 'Вход в профиль временно недоступен. Играть пока можно без регистрации.', {
        code: 'AUTH_NOT_CONFIGURED',
      });
    }
  }

  function sessionFromRequest(request, currentTime) {
    const token = parseCookies(request.headers.cookie).get(COOKIE_NAME);
    if (!token || token.length < 32 || token.length > 200) return null;
    const hash = tokenHash(token);
    const row = statements.sessionWithUser.get(hash);
    if (!row || Number(row.expires_at) <= currentTime) {
      if (row) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash);
      return null;
    }
    if (currentTime - Number(row.last_seen_at) > 60 * 60 * 1000) {
      database.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(currentTime, hash);
      row.last_seen_at = currentTime;
    }
    return { token, hash, row };
  }

  function requireSession(request, currentTime) {
    const session = sessionFromRequest(request, currentTime);
    if (!session) throw new AccountHttpError(401, 'Войдите в профиль.', { code: 'AUTH_REQUIRED' });
    return session;
  }

  async function getRewardAccountIdentity(request, expectedAccountId = null) {
    await ready;
    const currentTime = now();
    cleanup(currentTime);
    const session = sessionFromRequest(request, currentTime);
    if (!session) {
      return {
        ok: false,
        status: 401,
        error: 'Войдите в профиль, чтобы получить награду за четыре игры.',
        code: 'AUTH_REQUIRED',
      };
    }

    if (expectedAccountId !== null) {
      const expected = cleanText(expectedAccountId, 80);
      if (!expected || expected !== session.row.id) {
        return {
          ok: false,
          status: 409,
          error: 'Профиль изменился. Обновите страницу перед получением награды.',
          code: 'ACCOUNT_SESSION_CHANGED',
        };
      }
    }

    const accountPhoneHash = session.row.phone_hash;
    const allowLegacyClaims = Number(session.row.allow_legacy_reward_claims) === 1;
    const matchesPhone = value => {
      const phone = normalizePhone(value);
      if (!phone || !/^[a-f0-9]{64}$/i.test(accountPhoneHash)) return false;
      const candidateHash = hmac(secret, `phone:${phone}`);
      return timingSafeEqual(Buffer.from(candidateHash, 'hex'), Buffer.from(accountPhoneHash, 'hex'));
    };
    return {
      ok: true,
      accountId: session.row.id,
      matchesPhone,
      matchesClaim(claim) {
        const claimAccountId = cleanText(claim?.accountId, 80);
        return claimAccountId
          ? claimAccountId === session.row.id
          : allowLegacyClaims && matchesPhone(claim?.phone);
      },
    };
  }

  async function accountPayload(row) {
    const latest = statements.userById.get(row.id) || row;
    const claims = await validClaims(latest);
    const stored = parseProgress(latest.progress_json);
    const progress = sanitizeProgress(stored, {
      now: now(),
      timeZone: latest.time_zone,
      previous: stored,
      validClaims: claims,
      legacyCoinCap,
    });
    return {
      account: publicAccount(latest),
      progress,
      revision: Number(latest.progress_revision),
    };
  }

  function validatePassword(password, registration = false) {
    if (typeof password !== 'string' || password.length === 0) {
      throw new AccountHttpError(400, 'Введите пароль.', { field: 'password' });
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
      throw new AccountHttpError(400, 'Пароль слишком длинный.', { field: 'password' });
    }
    if (registration && password.length < PASSWORD_MIN_LENGTH) {
      throw new AccountHttpError(400, `Пароль должен содержать не менее ${PASSWORD_MIN_LENGTH} символов.`, { field: 'password' });
    }
  }

  function validateDevice(deviceId) {
    if (!/^[a-zA-Z0-9-]{16,100}$/.test(deviceId)) {
      throw new AccountHttpError(400, 'Не удалось определить устройство.', { field: 'deviceId' });
    }
  }

  function checkLoginLimits(phoneHash, ipHash, currentTime) {
    const since = currentTime - LOGIN_WINDOW_MS;
    const phoneStats = database.prepare(`
      SELECT COUNT(*) AS count, MIN(created_at) AS oldest
      FROM auth_attempts WHERE phone_hash = ? AND success = 0 AND created_at >= ?
    `).get(phoneHash, since);
    const ipStats = database.prepare(`
      SELECT COUNT(*) AS count, MIN(created_at) AS oldest
      FROM auth_attempts WHERE ip_hash = ? AND success = 0 AND created_at >= ?
    `).get(ipHash, since);
    const blocked = Number(phoneStats?.count || 0) >= LOGIN_PHONE_FAILURE_LIMIT ? phoneStats
      : Number(ipStats?.count || 0) >= LOGIN_IP_FAILURE_LIMIT ? ipStats
        : null;
    if (!blocked) return;
    const retry = Math.max(1, Math.ceil((LOGIN_WINDOW_MS - (currentTime - Number(blocked.oldest))) / 1000));
    throw new AccountHttpError(429, `Слишком много попыток. Попробуйте через ${Math.ceil(retry / 60)} мин.`, {
      code: 'LOGIN_RATE_LIMIT',
      retryAfter: retry,
    }, { 'Retry-After': String(retry) });
  }

  function issueSession(userId, deviceHash, currentTime) {
    const token = randomBytes(32).toString('base64url');
    withTransaction(database, () => {
      database.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?').run(userId, currentTime);
      const activeSessions = database.prepare('SELECT token_hash FROM sessions WHERE user_id = ? ORDER BY created_at ASC').all(userId);
      for (const stale of activeSessions.slice(0, Math.max(0, activeSessions.length - 4))) {
        database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(stale.token_hash);
      }
      database.prepare(`
        INSERT INTO sessions (token_hash, user_id, device_hash, created_at, expires_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(tokenHash(token), userId, deviceHash, currentTime, currentTime + SESSION_TTL_MS, currentTime);
    });
    return token;
  }

  async function handleRegister(request, response) {
    validateOrigin(request);
    requireJson(request);
    requireAuthConfigured();
    const payload = await readJsonBody(request);
    const phone = normalizePhone(payload.phone);
    const password = payload.password;
    const name = cleanText(payload.name, 80);
    const city = cleanText(payload.city, 40);
    const deviceId = cleanText(payload.deviceId, 100);
    if (!phone) throw new AccountHttpError(400, 'Укажите российский номер телефона.', { field: 'phone' });
    validatePassword(password, true);
    validateDevice(deviceId);
    if (name.length < 2) throw new AccountHttpError(400, 'Укажите имя.', { field: 'name' });
    if (!city) throw new AccountHttpError(400, 'Укажите город.', { field: 'city' });
    const timeZone = normalizeTimeZone(payload.timeZone, city);
    if (payload.consent !== true || payload.consentVersion !== ACCOUNT_CONSENT_VERSION) {
      throw new AccountHttpError(400, 'Для регистрации нужно согласие на обработку данных.', { field: 'consent' });
    }

    const currentTime = now();
    cleanup(currentTime);
    const phoneHash = hmac(secret, `phone:${phone}`);
    if (statements.userByPhone.get(phoneHash)) {
      throw new AccountHttpError(409, 'Профиль с этим номером уже существует. Войдите по паролю.', { code: 'ACCOUNT_EXISTS' });
    }
    const deviceHash = hmac(secret, `device:${deviceId}`);
    const registrations = database.prepare(`
      SELECT COUNT(*) AS count FROM users
      WHERE registration_device_hash = ? AND created_at >= ?
    `).get(deviceHash, currentTime - DEVICE_REGISTRATION_WINDOW_MS);
    if (Number(registrations?.count || 0) >= DEVICE_REGISTRATION_LIMIT) {
      throw new AccountHttpError(429, 'На этом устройстве уже зарегистрировано несколько профилей.', { code: 'DEVICE_REGISTRATION_LIMIT' });
    }

    const progress = sanitizeProgress(payload.progress, {
      now: currentTime,
      timeZone,
      initial: true,
      legacyCoinCap,
      validClaims: [],
    });
    const passwordData = await passwordRecord(password);
    const userId = randomUUID();
    database.prepare(`
      INSERT INTO users (
        id, phone_hash, phone_last4, allow_legacy_reward_claims, name, city, time_zone, consent_version, consent_at,
        registration_device_hash, progress_json, progress_revision,
        password_salt, password_hash, password_changed_at,
        created_at, updated_at, last_login_at
      ) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
    `).run(
      userId, phoneHash, phone.slice(-4), name, city, timeZone, ACCOUNT_CONSENT_VERSION, currentTime,
      deviceHash, JSON.stringify(progress), passwordData.salt, passwordData.hash, currentTime,
      currentTime, currentTime, currentTime,
    );
    const user = statements.userById.get(userId);
    const token = issueSession(userId, deviceHash, currentTime);
    sendJson(response, 201, { ok: true, ...(await accountPayload(user)) }, {
      'Set-Cookie': sessionCookie(token, secureCookies),
    });
  }

  async function handleLogin(request, response) {
    validateOrigin(request);
    requireJson(request);
    requireAuthConfigured();
    const payload = await readJsonBody(request);
    await ready;
    const identifier = cleanText(payload.identifier ?? payload.phone, 40);
    const phone = normalizePhone(identifier);
    const login = phone ? '' : normalizeLogin(identifier);
    const password = payload.password;
    const deviceId = cleanText(payload.deviceId, 100);
    if (!phone && !login) throw new AccountHttpError(400, 'Укажите телефон или логин.', { field: 'identifier' });
    validatePassword(password);
    validateDevice(deviceId);

    const currentTime = now();
    cleanup(currentTime);
    const phoneHash = hmac(secret, phone ? `phone:${phone}` : `login:${login}`);
    const ipHash = hmac(secret, `ip:${requestIp(request)}`);
    const deviceHash = hmac(secret, `device:${deviceId}`);
    checkLoginLimits(phoneHash, ipHash, currentTime);
    const user = statements.userByPhone.get(phoneHash);
    let valid = false;
    if (user?.password_salt && user?.password_hash) {
      valid = await passwordMatches(password, user.password_salt, user.password_hash);
    } else {
      const dummy = await derivePassword(password, hmac(secret, 'password-dummy').slice(0, 22));
      timingSafeEqual(dummy, Buffer.alloc(dummy.length));
    }
    if (!valid) {
      database.prepare('INSERT INTO auth_attempts (phone_hash, ip_hash, success, created_at) VALUES (?, ?, 0, ?)')
        .run(phoneHash, ipHash, currentTime);
      throw new AccountHttpError(401, 'Неверный телефон, логин или пароль.', { code: 'INVALID_CREDENTIALS' });
    }

    database.prepare('DELETE FROM auth_attempts WHERE (phone_hash = ? OR ip_hash = ?) AND success = 0').run(phoneHash, ipHash);
    const latestUserId = withTransaction(database, () => {
      const latestUser = statements.userById.get(user.id);
      if (!latestUser) {
        throw new AccountHttpError(401, 'Неверный телефон, логин или пароль.', { code: 'INVALID_CREDENTIALS' });
      }
      const hasChallengeProgress = payload.fourGameChallenge !== undefined;
      const storedProgress = parseProgress(latestUser.progress_json);
      const previousChallenge = normalizeFourGameChallenge(storedProgress.fourGameChallenge);
      const mergedChallenge = hasChallengeProgress
        ? normalizeFourGameChallenge(payload.fourGameChallenge, previousChallenge)
        : previousChallenge;
      const challengeChanged = hasChallengeProgress && (
        JSON.stringify(storedProgress.fourGameChallenge) !== JSON.stringify(mergedChallenge)
      );
      if (challengeChanged) {
        database.prepare(`
          UPDATE users SET progress_json = ?, progress_revision = progress_revision + 1,
            last_login_at = ?, updated_at = ? WHERE id = ?
        `).run(
          JSON.stringify({ ...storedProgress, fourGameChallenge: mergedChallenge }),
          currentTime,
          currentTime,
          latestUser.id,
        );
      } else {
        database.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(currentTime, currentTime, latestUser.id);
      }
      return latestUser.id;
    });
    const refreshedUser = statements.userById.get(latestUserId);
    const token = issueSession(latestUserId, deviceHash, currentTime);
    sendJson(response, 200, { ok: true, ...(await accountPayload(refreshedUser)) }, {
      'Set-Cookie': sessionCookie(token, secureCookies),
    });
  }

  async function handleMe(request, response) {
    const currentTime = now();
    cleanup(currentTime);
    const session = requireSession(request, currentTime);
    sendJson(response, 200, { ok: true, ...(await accountPayload(session.row)) });
  }

  async function handleLogout(request, response) {
    validateOrigin(request);
    const currentTime = now();
    const session = sessionFromRequest(request, currentTime);
    if (session) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(session.hash);
    sendJson(response, 200, { ok: true }, {
      'Set-Cookie': sessionCookie('', secureCookies, 0),
    });
  }

  async function handleProgress(request, response) {
    validateOrigin(request);
    requireJson(request);
    const currentTime = now();
    const session = requireSession(request, currentTime);
    const payload = await readJsonBody(request);
    if (!payload.progress || typeof payload.progress !== 'object') {
      throw new AccountHttpError(400, 'Не найден прогресс для сохранения.', { field: 'progress' });
    }
    const expectedAccountId = cleanText(payload.expectedAccountId, 80);
    if (!expectedAccountId || expectedAccountId !== session.row.id) {
      throw new AccountHttpError(409, 'Профиль изменился. Обновите страницу перед сохранением.', {
        code: 'ACCOUNT_SESSION_CHANGED',
      });
    }
    const claims = await validClaims(session.row);
    const saved = withTransaction(database, () => {
      const currentUser = statements.userById.get(session.row.id);
      if (!currentUser) {
        throw new AccountHttpError(401, 'Войдите в профиль.', { code: 'AUTH_REQUIRED' });
      }
      const previous = parseProgress(currentUser.progress_json);
      const progress = sanitizeProgress(payload.progress, {
        now: currentTime,
        timeZone: currentUser.time_zone,
        previous,
        validClaims: claims,
        legacyCoinCap,
      });
      const revision = Number(currentUser.progress_revision) + 1;
      database.prepare(`
        UPDATE users SET progress_json = ?, progress_revision = ?, updated_at = ? WHERE id = ?
      `).run(JSON.stringify(progress), revision, currentTime, currentUser.id);
      return { progress, revision };
    });
    sendJson(response, 200, { ok: true, ...saved, savedAt: currentTime });
  }

  async function verifyRewardCampaign(request, { campaignId, phone, expectedAccountId }) {
    await ready;
    if (campaignId !== FOUR_GAME_CAMPAIGN_ID) {
      return {
        ok: false,
        status: 400,
        error: 'Неизвестная акция.',
        code: 'UNKNOWN_REWARD_CAMPAIGN',
      };
    }

    const identity = await getRewardAccountIdentity(request, expectedAccountId);
    if (!identity.ok) return identity;
    if (!identity.matchesPhone(phone)) {
      return {
        ok: false,
        status: 403,
        error: 'Телефон должен совпадать с номером в профиле.',
        field: 'phone',
        code: 'ACCOUNT_PHONE_MISMATCH',
      };
    }

    const currentTime = now();
    const currentUser = statements.userById.get(identity.accountId);
    const stored = parseProgress(currentUser.progress_json);
    const progress = sanitizeProgress(stored, {
      now: currentTime,
      timeZone: currentUser.time_zone,
      previous: stored,
      legacyCoinCap,
    });
    const completedGames = progress.fourGameChallenge.completedGames;
    if (!FOUR_GAME_CHALLENGE_SOURCES.every(source => completedGames.includes(source))) {
      return {
        ok: false,
        status: 409,
        error: 'Сначала пройдите по одному уровню в каждой из четырёх игр.',
        code: 'CAMPAIGN_INCOMPLETE',
        completedGames,
      };
    }

    return {
      ok: true,
      accountId: currentUser.id,
      completedGames,
      matchesClaim: identity.matchesClaim,
    };
  }

  async function handle(request, response, url) {
    const startedAt = Date.now();
    try {
      if (url.pathname === '/api/auth/config' && request.method === 'GET') {
        sendJson(response, 200, {
          available: authConfigured,
          method: 'password',
          passwordMinLength: PASSWORD_MIN_LENGTH,
        });
        return;
      }
      if (url.pathname === '/api/auth/register' && request.method === 'POST') {
        await handleRegister(request, response);
        return;
      }
      if (url.pathname === '/api/auth/login' && request.method === 'POST') {
        await handleLogin(request, response);
        return;
      }
      if (url.pathname === '/api/auth/me' && request.method === 'GET') {
        await handleMe(request, response);
        return;
      }
      if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
        await handleLogout(request, response);
        return;
      }
      if (url.pathname === '/api/account/progress' && request.method === 'PUT') {
        await handleProgress(request, response);
        return;
      }
      throw new AccountHttpError(405, 'Метод не поддерживается.');
    } catch (error) {
      if (error instanceof AccountHttpError) {
        sendJson(response, error.status, { error: error.message, ...error.details }, error.headers);
      } else {
        logger.error?.('[account-service]', error);
        sendJson(response, 500, { error: 'Не удалось обработать профиль. Попробуйте ещё раз.' });
      }
    } finally {
      logger.info?.(`${request.method} ${url.pathname} ${response.statusCode} ${Date.now() - startedAt}ms`);
    }
  }

  return {
    ready,
    handle,
    getRewardAccountIdentity,
    verifyRewardCampaign,
    matches(pathname) {
      return pathname.startsWith('/api/auth/') || pathname === '/api/account/progress';
    },
    close() {
      database.close();
    },
    databaseFile: resolvedDatabaseFile,
    get configured() {
      return authConfigured;
    },
  };
}
