import { TokenType, type LevelConfig, type Difficulty } from '../types/game.ts';
import { STANDARD_WIN_REWARD } from './economy.ts';
import { GAME_LEVEL_TOTAL } from './gameProgression.ts';

const W = TokenType.Water;
const L = TokenType.Leaf;
const S = TokenType.Stone;
const St = TokenType.Steam;
const F = TokenType.Fire;
const Wd = TokenType.Wood;

function lvl(
  id: number, name: string, difficulty: Difficulty, bathhouseId: number,
  rows: number, cols: number, tokenTypes: TokenType[], moves: number,
  objectives: { type: TokenType; target: number }[],
  starThresholds: [number, number, number], _reward: number, characterId: string,
): LevelConfig {
  return { id, name, difficulty, bathhouseId, rows, cols, tokenTypes, moves, objectives, starThresholds, reward: STANDARD_WIN_REWARD, characterId };
}

export const levels: LevelConfig[] = [
  // Bathhouse 1: Русская баня (1-10) — вводные уровни
  lvl(1, 'Первый пар', 'classic', 1, 8, 8, [W, St, L, S], 14, [{ type: W, target: 18 }, { type: St, target: 15 }], [600, 1200, 2400], 30, 'ai-concierge'),
  lvl(2, 'Берёзовый веник', 'classic', 1, 8, 8, [L, Wd, W, St], 13, [{ type: L, target: 20 }, { type: Wd, target: 16 }], [700, 1400, 2800], 35, 'ai-concierge'),
  lvl(3, 'Горячий камень', 'classic', 1, 8, 8, [S, St, W, L], 13, [{ type: S, target: 19 }, { type: St, target: 17 }], [800, 1600, 3200], 40, 'ai-concierge'),
  lvl(4, 'Дубовый дух', 'classic', 1, 8, 8, [Wd, L, St, W], 12, [{ type: Wd, target: 20 }, { type: L, target: 18 }], [900, 1800, 3600], 45, 'ai-concierge'),
  lvl(5, 'Парная истома', 'classic', 1, 8, 8, [St, W, S, L], 12, [{ type: St, target: 21 }, { type: W, target: 18 }], [1000, 2000, 4000], 50, 'ai-concierge'),
  lvl(6, 'Травяной настой', 'premium', 1, 8, 8, [L, W, St, S], 12, [{ type: L, target: 28 }, { type: W, target: 25 }], [1100, 2200, 4400], 55, 'ai-concierge'),
  lvl(7, 'Кедровый аромат', 'premium', 1, 8, 8, [Wd, St, L, W], 12, [{ type: Wd, target: 30 }, { type: St, target: 25 }], [1200, 2400, 4800], 60, 'ai-concierge'),
  lvl(8, 'Ледяная купель', 'premium', 1, 8, 8, [W, S, St, L], 11, [{ type: W, target: 32 }, { type: S, target: 25 }], [1400, 2800, 5200], 65, 'ai-concierge'),
  lvl(9, 'Огненный жар', 'premium', 1, 8, 8, [F, St, W, S, L], 11, [{ type: F, target: 28 }, { type: St, target: 28 }], [1500, 3000, 5600], 70, 'ai-concierge'),
  lvl(10, 'Русский дух', 'vip', 1, 8, 8, [W, St, L, S, F, Wd], 10, [{ type: W, target: 30 }, { type: St, target: 28 }, { type: L, target: 22 }], [1800, 3600, 6000], 80, 'ai-concierge'),

  // Bathhouse 2: Финская сауна (11-20) — жар и дерево
  lvl(11, 'Хвойный жар', 'classic', 2, 8, 8, [L, Wd, St], 14, [{ type: L, target: 30 }, { type: Wd, target: 25 }], [1400, 2800, 5000], 45, 'term-master'),
  lvl(12, 'Берёзовый полок', 'classic', 2, 8, 8, [Wd, St, W], 13, [{ type: Wd, target: 28 }, { type: St, target: 25 }], [1500, 3000, 5400], 50, 'term-master'),
  lvl(13, 'Лёгкий пар', 'classic', 2, 8, 8, [St, L, W], 13, [{ type: St, target: 32 }, { type: L, target: 25 }], [1600, 3200, 5800], 55, 'term-master'),
  lvl(14, 'Смолистый дух', 'premium', 2, 8, 8, [Wd, St, L, S], 12, [{ type: Wd, target: 30 }, { type: St, target: 28 }], [1800, 3600, 6200], 60, 'term-master'),
  lvl(15, 'Горячий камень', 'premium', 2, 8, 8, [S, St, Wd, W], 12, [{ type: S, target: 30 }, { type: St, target: 28 }], [1900, 3800, 6600], 65, 'term-master'),
  lvl(16, 'Сосновый аромат', 'premium', 2, 8, 8, [L, Wd, St, W, S], 11, [{ type: L, target: 32 }, { type: Wd, target: 28 }], [2100, 4200, 7000], 70, 'term-master'),
  lvl(17, 'Финский ритуал', 'premium', 2, 8, 8, [St, W, L, Wd, F], 11, [{ type: St, target: 32 }, { type: W, target: 28 }], [2200, 4400, 7400], 75, 'term-master'),
  lvl(18, 'Ледяное озеро', 'vip', 2, 8, 8, [W, S, St, L, Wd], 10, [{ type: W, target: 35 }, { type: S, target: 28 }], [2400, 4800, 7800], 80, 'term-master'),
  lvl(19, 'Северное сияние', 'vip', 2, 8, 8, [L, St, W, Wd, S, F], 10, [{ type: L, target: 32 }, { type: St, target: 30 }], [2600, 5200, 8200], 85, 'term-master'),
  lvl(20, 'Лапландская ночь', 'vip', 2, 8, 8, [Wd, L, St, W, S, F], 9, [{ type: Wd, target: 35 }, { type: L, target: 30 }, { type: St, target: 25 }], [2800, 5600, 8600], 90, 'term-master'),

  // Bathhouse 3: Турецкий хаммам (21-30) — вода и пар
  lvl(21, 'Мраморный зал', 'classic', 3, 8, 8, [W, St, S], 13, [{ type: W, target: 32 }, { type: St, target: 28 }], [2000, 4000, 7000], 55, 'ai-concierge'),
  lvl(22, 'Тёплый туман', 'classic', 3, 8, 8, [St, W, L], 12, [{ type: St, target: 35 }, { type: W, target: 28 }], [2200, 4400, 7500], 60, 'ai-concierge'),
  lvl(23, 'Восточная нега', 'premium', 3, 8, 8, [W, St, L, S], 12, [{ type: W, target: 32 }, { type: St, target: 30 }], [2400, 4800, 8000], 65, 'ai-concierge'),
  lvl(24, 'Мыльный массаж', 'premium', 3, 8, 8, [W, L, St, S], 11, [{ type: W, target: 35 }, { type: L, target: 28 }], [2600, 5200, 8500], 70, 'ai-concierge'),
  lvl(25, 'Горячий мрамор', 'premium', 3, 8, 8, [S, St, W, F], 11, [{ type: S, target: 32 }, { type: St, target: 30 }], [2800, 5600, 9000], 75, 'ai-concierge'),
  lvl(26, 'Благовония', 'premium', 3, 8, 8, [L, St, W, S, F], 10, [{ type: L, target: 35 }, { type: St, target: 30 }], [3000, 6000, 9500], 80, 'ai-concierge'),
  lvl(27, 'Купол неба', 'vip', 3, 8, 8, [St, W, S, L, Wd], 10, [{ type: St, target: 35 }, { type: W, target: 32 }], [3200, 6400, 10000], 85, 'ai-concierge'),
  lvl(28, 'Звёздный свод', 'vip', 3, 8, 8, [W, St, L, S, F], 9, [{ type: W, target: 38 }, { type: St, target: 32 }], [3400, 6800, 10500], 90, 'ai-concierge'),
  lvl(29, 'Султанский отдых', 'vip', 3, 8, 8, [St, W, L, S, F, Wd], 9, [{ type: St, target: 35 }, { type: W, target: 35 }], [3600, 7200, 11000], 95, 'ai-concierge'),
  lvl(30, 'Тайны Востока', 'vip', 3, 8, 8, [W, St, S, L, F, Wd], 8, [{ type: W, target: 38 }, { type: St, target: 35 }, { type: L, target: 28 }], [4000, 8000, 12000], 100, 'ai-concierge'),

  // Bathhouse 4: Сибирская парная (31-40) — мороз и жар
  lvl(31, 'Таёжный дух', 'premium', 4, 8, 8, [Wd, L, St], 12, [{ type: Wd, target: 35 }, { type: L, target: 30 }], [3200, 6400, 10000], 65, 'term-master'),
  lvl(32, 'Кедровая бочка', 'premium', 4, 8, 8, [Wd, St, W], 11, [{ type: Wd, target: 35 }, { type: St, target: 30 }], [3400, 6800, 10500], 70, 'term-master'),
  lvl(33, 'Морозный контраст', 'premium', 4, 8, 8, [W, S, St, Wd], 11, [{ type: W, target: 38 }, { type: S, target: 30 }], [3600, 7200, 11000], 75, 'term-master'),
  lvl(34, 'Пихтовый веник', 'premium', 4, 8, 8, [L, Wd, St, W], 10, [{ type: L, target: 38 }, { type: Wd, target: 32 }], [3800, 7600, 11500], 80, 'term-master'),
  lvl(35, 'Сибирский мёд', 'vip', 4, 8, 8, [F, L, Wd, St, W], 10, [{ type: F, target: 30 }, { type: L, target: 35 }], [4000, 8000, 12000], 85, 'term-master'),
  lvl(36, 'Тайга пробудилась', 'vip', 4, 8, 8, [Wd, L, S, St, W], 9, [{ type: Wd, target: 38 }, { type: L, target: 35 }], [4200, 8400, 12500], 90, 'term-master'),
  lvl(37, 'Снежная буря', 'vip', 4, 8, 8, [W, S, St, L, Wd], 9, [{ type: W, target: 40 }, { type: S, target: 32 }], [4400, 8800, 13000], 95, 'term-master'),
  lvl(38, 'Медвежий жар', 'vip', 4, 8, 8, [F, Wd, St, L, W, S], 8, [{ type: F, target: 35 }, { type: Wd, target: 35 }], [4600, 9200, 13500], 100, 'term-master'),
  lvl(39, 'Полярная ночь', 'vip', 4, 8, 8, [W, S, St, Wd, L, F], 8, [{ type: W, target: 40 }, { type: S, target: 35 }], [4800, 9600, 14000], 105, 'term-master'),
  lvl(40, 'Сердце Сибири', 'vip', 4, 8, 8, [Wd, L, St, W, S, F], 7, [{ type: Wd, target: 40 }, { type: L, target: 38 }, { type: St, target: 30 }], [5000, 10000, 15000], 110, 'term-master'),

  // Bathhouse 5: Баня-бочка (41-52) — дерево и уют, 12 уровней
  lvl(41, 'Дубовая бочка', 'premium', 5, 8, 8, [Wd, W, St], 11, [{ type: Wd, target: 38 }, { type: W, target: 32 }], [4200, 8400, 13000], 75, 'ar-guide'),
  lvl(42, 'Липовый аромат', 'premium', 5, 8, 8, [L, Wd, St], 10, [{ type: L, target: 40 }, { type: Wd, target: 35 }], [4400, 8800, 13500], 80, 'ar-guide'),
  lvl(43, 'Берёзовый сок', 'premium', 5, 8, 8, [W, L, Wd, St], 10, [{ type: W, target: 38 }, { type: L, target: 35 }], [4600, 9200, 14000], 85, 'ar-guide'),
  lvl(44, 'Деревенский уют', 'vip', 5, 8, 8, [Wd, L, St, W], 9, [{ type: Wd, target: 40 }, { type: L, target: 38 }], [4800, 9600, 14500], 90, 'ar-guide'),
  lvl(45, 'Еловые ветки', 'vip', 5, 8, 8, [L, Wd, St, S, W], 9, [{ type: L, target: 42 }, { type: Wd, target: 38 }], [5000, 10000, 15000], 95, 'ar-guide'),
  lvl(46, 'Медовый пар', 'vip', 5, 8, 8, [F, L, Wd, St, W], 8, [{ type: F, target: 35 }, { type: L, target: 40 }], [5200, 10400, 15500], 100, 'ar-guide'),
  lvl(47, 'Травяной чай', 'vip', 5, 8, 8, [L, W, Wd, St, S], 8, [{ type: L, target: 45 }, { type: W, target: 38 }], [5400, 10800, 16000], 105, 'ar-guide'),
  lvl(48, 'Русская душа', 'vip', 5, 8, 8, [Wd, L, St, W, F, S], 7, [{ type: Wd, target: 42 }, { type: L, target: 40 }], [5600, 11200, 16500], 110, 'ar-guide'),
  lvl(49, 'Банный день', 'vip', 5, 8, 8, [St, Wd, L, W, F, S], 7, [{ type: St, target: 40 }, { type: Wd, target: 40 }], [5800, 11600, 17000], 115, 'ar-guide'),
  lvl(50, 'Дымок над бочкой', 'vip', 5, 8, 8, [St, F, Wd, L, W, S], 6, [{ type: St, target: 42 }, { type: F, target: 35 }], [6000, 12000, 17500], 118, 'ar-guide'),
  lvl(51, 'Тепло дерева', 'vip', 5, 8, 8, [Wd, L, St, W, F, S], 6, [{ type: Wd, target: 45 }, { type: L, target: 40 }], [6200, 12400, 18000], 120, 'ar-guide'),
  lvl(52, 'Благодать', 'vip', 5, 8, 8, [Wd, L, W, St, F, S], 5, [{ type: Wd, target: 48 }, { type: L, target: 45 }, { type: St, target: 38 }], [6500, 13000, 19000], 125, 'ar-guide'),

  // Bathhouse 6-10: продвинутые бани с высокой сложностью
  ...generateBathhouse(6, 'Липовая сауна', 53, 10, [L, Wd, St, W, F, S], 'ai-concierge'),
  ...generateBathhouse(7, 'Травяная сауна', 63, 10, [L, W, St, Wd, F, S], 'term-master'),
  ...generateBathhouse(8, 'Инфракрасная сауна', 73, 10, [F, St, W, S, L, Wd], 'ar-guide'),
  ...generateBathhouse(9, 'Соляная парная', 83, 14, [S, W, St, L, F, Wd], 'ai-concierge'),
  ...generateBathhouse(10, 'Мультикаменная баня', 97, GAME_LEVEL_TOTAL - 96, [S, F, W, St, Wd, L], 'term-master', 20),
];

function generateBathhouse(
  bathhouseId: number, _name: string, startId: number, count: number,
  types: TokenType[], characterId: string, difficultySpan = count,
): LevelConfig[] {
  const levelNames: Record<number, string[]> = {
    6: ['Липовый цвет', 'Медовый нектар', 'Золотой сок', 'Душистый пар', 'Сладкий сон', 'Пчелиный рай', 'Летний полдень', 'Янтарный жар', 'Цветочный мёд', 'Липовое блаженство'],
    7: ['Мятная свежесть', 'Лавандовый сон', 'Ромашковый луг', 'Чабрецовый дух', 'Шалфейный ветер', 'Травяная симфония', 'Полынная ночь', 'Зверобойный жар', 'Иван-чай', 'Травяная гармония'],
    8: ['Тёплый свет', 'Глубокий прогрев', 'Мягкое тепло', 'Красный спектр', 'Целебный жар', 'Детокс-волна', 'Клеточное обновление', 'Инфракрасная нега', 'Световая терапия', 'Тепло изнутри'],
    9: ['Солёный ветер', 'Морской бриз', 'Соляной кристалл', 'Галотерапия', 'Пещерный воздух', 'Минеральный туман', 'Соляная пыль', 'Белая комната', 'Гималайский покой', 'Розовый кристалл', 'Морская соль', 'Галит', 'Соляной ветер', 'Соляное исцеление'],
    10: ['Гранитный жар', 'Жадеитовый пар', 'Базальтовая мощь', 'Кварцевый блеск', 'Нефритовый сон', 'Мраморный холод', 'Вулканический огонь', 'Каменная симфония', 'Минеральный ритуал', 'Яшмовый свет', 'Габбро-диабаз', 'Порфирит', 'Серпентинит', 'Талькохлорит', 'Хромит', 'Дунит', 'Оникс', 'Родонит', 'Шунгит', 'Вечный камень'],
  };

  const baseNames = levelNames[bathhouseId] ?? [];
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    names.push(baseNames[i] ?? `Уровень ${i + 1}`);
  }

  // Базовая сложность растёт с номером бани
  const difficultyMult = 1 + (bathhouseId - 6) * 0.12;

  return names.map((n, i) => {
    const id = startId + i;
    // The final bathhouse keeps the original 20-level difficulty curve even
    // though the unified campaign ends at level 100 after its first 4 levels.
    const progress = i / (Math.max(2, difficultySpan) - 1); // 0 to 1
    const tokenCount = Math.min(4 + Math.floor(progress * 3), 6);
    const usedTypes = types.slice(0, tokenCount);

    // Меньше ходов на поздних уровнях
    const moves = Math.max(4, Math.round(11 - progress * 6 - (bathhouseId - 6) * 0.5));

    // Выше цели
    const baseTarget = Math.round((35 + progress * 20 + (bathhouseId - 6) * 5) * difficultyMult);

    const difficulty: Difficulty = progress < 0.2 ? 'premium' : 'vip';

    const objectives = [
      { type: usedTypes[0], target: baseTarget },
      { type: usedTypes[1], target: Math.max(25, Math.round(baseTarget * 0.85)) },
    ];
    if (progress >= 0.4) {
      objectives.push({ type: usedTypes[2], target: Math.max(20, Math.round(baseTarget * 0.7)) });
    }

    const baseScore = 5000 + bathhouseId * 500 + Math.round(progress * 3000);
    return lvl(
      id, n, difficulty, bathhouseId,
      8, 8, usedTypes, moves, objectives,
      [baseScore, Math.round(baseScore * 1.8), Math.round(baseScore * 2.8)],
      100 + bathhouseId * 15 + Math.round(progress * 50),
      characterId,
    );
  });
}

export function getLevelConfig(id: number): LevelConfig | undefined {
  return levels.find(l => l.id === id);
}

export function getLevelsForBathhouse(bathhouseId: number): LevelConfig[] {
  return levels.filter(l => l.bathhouseId === bathhouseId);
}
