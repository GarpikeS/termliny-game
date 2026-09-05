export const TokenType = {
  Water: 'water',
  Leaf: 'leaf',
  Stone: 'stone',
  Steam: 'steam',
  Fire: 'fire',
  Wood: 'wood',
} as const;

export type TokenType = (typeof TokenType)[keyof typeof TokenType];

export const SpecialType = {
  Helicopter: 'helicopter',
  Barrel: 'barrel',
} as const;

export type SpecialType = (typeof SpecialType)[keyof typeof SpecialType];

export const TOKEN_COLORS: Record<TokenType, string> = {
  water: '#32B8FF',
  leaf: '#42D879',
  stone: '#B8B7D2',
  steam: '#B184FF',
  fire: '#FF8A4C',
  wood: '#E7A146',
};

export const ALL_TOKEN_TYPES: TokenType[] = Object.values(TokenType) as TokenType[];

export interface Position {
  row: number;
  col: number;
}

export interface Cell {
  type: TokenType;
  id: number;
  special?: SpecialType;
}

export type Grid = (Cell | null)[][];

export interface MatchGroup {
  positions: Position[];
  type: TokenType;
  shape?: 'horizontal' | 'vertical' | 'square';
}

export interface SwapAction {
  from: Position;
  to: Position;
}

export type AnimationPhase =
  | 'idle'
  | 'swap'
  | 'swap_back'
  | 'match_hold'
  | 'match'
  | 'powerup'
  | 'score'
  | 'fall'
  | 'spawn'
  | 'cascade_check';

export interface AnimationState {
  phase: AnimationPhase;
  startTime: number;
  duration: number;
  data?: unknown;
}

export interface Objective {
  type: TokenType;
  target: number;
  current: number;
}

export type Difficulty = 'classic' | 'premium' | 'vip';

export interface LevelConfig {
  id: number;
  name: string;
  difficulty: Difficulty;
  bathhouseId: number;
  rows: number;
  cols: number;
  tokenTypes: TokenType[];
  moves: number;
  objectives: { type: TokenType; target: number }[];
  starThresholds: [number, number, number];
  reward: number;
  characterId: string;
}

export interface Bathhouse {
  id: number;
  name: string;
  color: string;
  levelsRange: [number, number];
  position: { x: number; y: number };
}

export interface LevelProgress {
  stars: number;
  bestScore: number;
  completed: boolean;
}

export interface GameState {
  grid: Grid;
  score: number;
  movesLeft: number;
  objectives: Objective[];
  combo: number;
  phase: AnimationPhase;
  selectedCell: Position | null;
  levelConfig: LevelConfig;
  isWon: boolean;
  isLost: boolean;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface Order {
  id: string;
  items: CartItem[];
  total: number;
  name: string;
  phone: string;
  email?: string;
  createdAt: number;
  status: 'pending' | 'confirmed' | 'completed';
}

export interface RewardClaim {
  id: string;
  rewardId: 'ticket-free';
  campaignId?: 'four-games-v1';
  code: string;
  purchasedAt: number;
  expiresAt: number;
  nextPurchaseAt: number;
  status?: 'active' | 'redeemed' | 'expired';
  redeemedAt?: number;
}

export interface PetState {
  adoptionId: string;
  characterId: string;
  name: string;
  hunger: number;
  happiness: number;
  energy: number;
  cleanliness: number;
  age: number;
  stage: 'baby' | 'teen' | 'adult';
  lastUpdated: number;
  cooldowns: Record<string, number>;
  activityCooldowns: Record<string, number>;
  experience: number;
  bond: number;
  careStreak: number;
  lastCareDate: string | null;
  daily: PetDailyState;
  diary: PetDiaryEntry[];
}

export type PetStatKey = 'hunger' | 'happiness' | 'energy' | 'cleanliness';

export interface PetDeparture {
  adoptionId?: string;
  characterId: string;
  name: string;
  depletedStat: PetStatKey;
  departedAt: number;
  experience?: number;
}

export interface PetDailyState {
  date: string;
  giftClaimed: boolean;
  taskProgress: Record<string, number>;
  taskClaimed: string[];
}

export interface PetDiaryEntry {
  id: string;
  createdAt: number;
  title: string;
  detail: string;
  kind: 'care' | 'activity' | 'reward' | 'growth';
}

export type GameRewardSource = 'match3' | 'game2048' | 'bubbles' | 'pet';

export interface FourGameChallengeProgress {
  version: 1;
  completedGames: GameRewardSource[];
}

export interface DailyGameRewards {
  date: string;
  earned: Record<GameRewardSource, number>;
}

export interface PlayerProgress {
  currentLevel: number;
  levels: Record<number, LevelProgress>;
  currency: number;
  dailyGameRewards: DailyGameRewards;
  fourGameChallenge: FourGameChallengeProgress;
  lives: number;
  nextLifeAt: number | null;
  selectedCharacter: string;
  tutorialCompleted: boolean;
  tutorialFlags: string[];
  best2048Score: number;
  game2048LevelsCompleted: number;
  bubbleLevelsCompleted: number;
  pet: PetState | null;
  petDeparture: PetDeparture | null;
  unlockedCharacters: string[];
  inventory: Record<string, number>;
  rewardClaims: RewardClaim[];
  cart: CartItem[];
  orders: Order[];
}
