import type { RewardClaim } from '@/types/game';
import { getDeviceId } from '@/features/account/device';
import { FOUR_GAME_CHALLENGE_ID } from './fourGameChallenge';

export const REWARD_CONSENT_VERSION = 'reward-2026-08-12';

export interface RewardStatus {
  available: boolean;
  claim?: RewardClaim;
  nextPurchaseAt?: number;
}

export interface FreeHourClaimPayload {
  name: string;
  phone: string;
  age: number;
  city: 'Москва' | 'Зеленогорск';
  consent: true;
  balance: number;
  source: string;
  campaignId?: typeof FOUR_GAME_CHALLENGE_ID;
  expectedAccountId?: string;
}

interface RewardErrorBody {
  error?: string;
  field?: string;
  code?: string;
  claim?: RewardClaim;
  availableAt?: number;
}

export class RewardApiError extends Error {
  field?: string;
  code?: string;
  claim?: RewardClaim;
  availableAt?: number;

  constructor(message: string, details: RewardErrorBody = {}) {
    super(message);
    this.name = 'RewardApiError';
    this.field = details.field;
    this.code = details.code;
    this.claim = details.claim;
    this.availableAt = details.availableAt;
  }
}

export { getDeviceId } from '@/features/account/device';

async function readBody(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function getFreeHourStatus(
  signal?: AbortSignal,
  campaignId?: typeof FOUR_GAME_CHALLENGE_ID,
  expectedAccountId?: string,
): Promise<RewardStatus> {
  let response: Response;
  try {
    const params = new URLSearchParams({ deviceId: getDeviceId() });
    if (campaignId) params.set('campaignId', campaignId);
    if (campaignId && expectedAccountId) params.set('expectedAccountId', expectedAccountId);
    response = await fetch(`/api/rewards/free-hour?${params.toString()}`, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new RewardApiError('Нет связи с сервером наград. Проверьте интернет.');
  }
  const body = await readBody(response);
  if (!response.ok) throw new RewardApiError(String(body.error || 'Не удалось проверить награду.'));
  return body as unknown as RewardStatus;
}

export async function claimFreeHour(
  payload: FreeHourClaimPayload,
  signal?: AbortSignal,
): Promise<RewardClaim> {
  let response: Response;
  try {
    response = await fetch('/api/rewards/free-hour', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        deviceId: getDeviceId(),
        consentVersion: REWARD_CONSENT_VERSION,
      }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new RewardApiError('Сервер отвечает слишком долго. Попробуйте ещё раз.');
    }
    throw new RewardApiError('Нет связи с сервером. Термокоины не списаны.');
  }

  const body = await readBody(response) as RewardErrorBody & { claim?: RewardClaim };
  if (!response.ok || !body.claim) {
    throw new RewardApiError(body.error || 'Не удалось получить бесплатный час.', body);
  }
  return body.claim;
}
