import { type BubbleColor, ALL_BUBBLE_COLORS } from './bubbleTypes.ts';
import type { Bubble } from './bubbleTypes.ts';
import { getNeighbors, hexToPixel, GRID_COLS, GRID_ROWS } from './hexGrid.ts';
import { findColorGroup } from './bubbleMatching.ts';
import { STANDARD_WIN_REWARD } from '../../data/economy.ts';
import { GAME_LEVEL_TOTAL } from '../../data/gameProgression.ts';

export type BubblePattern = 'woven' | 'paired' | 'zigzag' | 'fortified' | 'random';

export interface BubbleLevel {
  id: number;
  name: string;
  rows: number;
  colors: BubbleColor[];
  shots: number;
  reward: number;
  pattern: BubblePattern;
  seed: number;
}

// Названия уровней по банной тематике
const levelNames = [
  'Парилка',
  'Предбанник',
  'Купель',
  'Веничная',
  'Каменка',
  'Полок',
  'Банный жар',
  'Травяная',
  'Ледяная купель',
  'Контрастная',
  'Турецкая',
  'Финская',
  'Русская баня',
  'Хаммам',
  'Офуро',
  'Сауна',
  'Римские термы',
  'Японская баня',
  'Ирландская баня',
  'Сандуновская',
  'Горячий источник',
  'Банные чары',
  'Пар костей не ломит',
  'Легкий пар',
  'С легким паром',
  'Жаркий полок',
  'Банный день',
  'Парься на здоровье',
  'Дубовый жар',
  'Берёзовый рай',
  'Эвкалиптовый туман',
  'Можжевеловый лес',
  'Крапивный массаж',
  'Пихтовый аромат',
  'Липовый мёд',
  'Веничный мастер',
  'Банщик года',
  'Парильщик',
  'Любитель бани',
  'Знаток веников',
  'Термальный король',
  'Повелитель пара',
  'Банный гуру',
  'Мастер парения',
  'Хранитель традиций',
  'Банная легенда',
  'Непревзойдённый',
  'Великий парильщик',
  'Термбург чемпион',
  'Абсолютный мастер',
];

function generateLevel(id: number): BubbleLevel {
  // Старт больше не проходится готовыми полосами: уже на первом уровне
  // четыре ряда, три цвета и только небольшой запас на промахи.
  const rows = Math.min(4 + Math.floor((id - 1) / 4), 10);
  const numColors = Math.min(3 + Math.floor((id - 1) / 4), 8);
  const bubbleCount = rows * GRID_COLS - Math.floor(rows / 2);
  const pressure = Math.max(0.36, 0.5 - (id - 1) * 0.003);
  const introAllowance = id === 1 ? 9 : id === 2 ? 6 : id === 3 ? 4 : 1;
  const shots = Math.max(14, Math.ceil(bubbleCount * pressure) + introAllowance);
  const reward = STANDARD_WIN_REWARD;

  const patterns: BubblePattern[] = ['woven', 'paired', 'zigzag', 'fortified', 'random'];
  const pattern = patterns[(id - 1) % patterns.length];

  const colors = ALL_BUBBLE_COLORS.slice(0, numColors);
  const name = levelNames[id - 1] || `Уровень ${id}`;

  return { id, name, rows, colors, shots, reward, pattern, seed: Math.imul(id, 2654435761) >>> 0 };
}

// Общая для всех игр шкала из 50 реально генерируемых уровней.
const levels: BubbleLevel[] = Array.from({ length: GAME_LEVEL_TOTAL }, (_, i) => generateLevel(i + 1));

export function getBubbleLevel(id: number): BubbleLevel | undefined {
  return levels.find(l => l.id === id);
}

export function getTotalLevels(): number {
  return levels.length;
}

export function getBubbleShotBonus(characterId: string): number {
  if (characterId === 'yaromir') return 3;
  if (characterId === 'valkiriya') return 2;
  return 0;
}

export function getActiveBubbleColors(bubbles: Bubble[], fallback: BubbleColor[]): BubbleColor[] {
  const active = new Set(bubbles.map(bubble => bubble.color));
  const ordered = fallback.filter(color => active.has(color));
  if (ordered.length > 0) return ordered;
  const remaining = [...active];
  return remaining.length > 0 ? remaining : fallback;
}

let _nextBubbleId = 1;
export function resetBubbleIdCounter() { _nextBubbleId = 1; }

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

function getConnectedSize(
  placed: Map<string, Bubble>,
  row: number,
  col: number,
  color: BubbleColor,
): number {
  const queue: Array<[number, number]> = [[row, col]];
  const visited = new Set<string>();
  let size = 0;

  while (queue.length > 0) {
    const [currentRow, currentCol] = queue.shift()!;
    const key = cellKey(currentRow, currentCol);
    if (visited.has(key)) continue;
    visited.add(key);

    if (currentRow === row && currentCol === col) {
      size += 1;
    } else {
      const bubble = placed.get(key);
      if (!bubble || bubble.color !== color) continue;
      size += 1;
    }

    for (const neighbor of getNeighbors(currentRow, currentCol)) queue.push(neighbor);
  }

  return size;
}

export function findPlayableBubbleColors(bubbles: Bubble[]): BubbleColor[] {
  return [...new Set(
    bubbles
      .filter(bubble => getConnectedSize(
        new Map(bubbles.map(item => [cellKey(item.row, item.col), item])),
        bubble.row,
        bubble.col,
        bubble.color,
      ) >= 2)
      .map(bubble => bubble.color),
  )];
}

export function getShooterColors(bubbles: Bubble[], fallback: BubbleColor[]): BubbleColor[] {
  const active = getActiveBubbleColors(bubbles, fallback);
  const placed = new Map(bubbles.map(bubble => [cellKey(bubble.row, bubble.col), bubble]));
  const exposed = active.filter(color => {
    for (let row = 0; row < GRID_ROWS; row += 1) {
      const maxCols = row % 2 === 1 ? GRID_COLS - 1 : GRID_COLS;
      for (let col = 0; col < maxCols; col += 1) {
        if (placed.has(cellKey(row, col))) continue;
        const attached = row === 0 || getNeighbors(row, col).some(([r, c]) => placed.has(cellKey(r, c)));
        if (attached && getConnectedSize(placed, row, col, color) >= 3) return true;
      }
    }
    return false;
  });
  if (exposed.length > 0) return exposed;
  const playable = findPlayableBubbleColors(bubbles).filter(color => active.includes(color));
  return playable.length > 0 ? playable : active;
}

function hashCell(seed: number, row: number, col: number): number {
  let value = seed ^ Math.imul(row + 1, 0x9e3779b1) ^ Math.imul(col + 1, 0x85ebca6b);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  return value >>> 0;
}

function getPreferredColorIndex(level: BubbleLevel, row: number, col: number): number {
  const count = level.colors.length;
  const phase = level.id % count;
  switch (level.pattern) {
    case 'paired':
      return (Math.floor(col / 2) + row * 2 + phase) % count;
    case 'zigzag':
      return (col * 2 + row + Math.floor(col / 3) + phase) % count;
    case 'fortified':
      return (Math.floor(col / 2) + Math.floor(row / 2) * 2 + phase) % count;
    case 'random':
      return hashCell(level.seed, row, col) % count;
    default:
      return (col + row * 2 + phase) % count;
  }
}

function getColorCandidates(level: BubbleLevel, row: number, col: number, placed: Map<string, Bubble>): BubbleColor[] {
  const preferred = getPreferredColorIndex(level, row, col);
  const candidates: BubbleColor[] = [];
  for (let offset = 0; offset < level.colors.length; offset += 1) {
    const color = level.colors[(preferred + offset) % level.colors.length];
    const connectedSize = getConnectedSize(placed, row, col, color);
    if (connectedSize <= 2) candidates.push(color);
  }
  return candidates;
}

export function generateBubbles(level: BubbleLevel, fieldWidth: number): Bubble[] {
  const positions: Array<Pick<Bubble, 'row' | 'col' | 'x' | 'y'>> = [];
  const placed = new Map<string, Bubble>();

  for (let row = 0; row < level.rows; row++) {
    const maxCols = row % 2 === 1 ? GRID_COLS - 1 : GRID_COLS;
    for (let col = 0; col < maxCols; col++) {
      const { x, y } = hexToPixel(row, col, fieldWidth);
      positions.push({ row, col, x, y });
    }
  }

  const assigned: BubbleColor[] = [];
  const assignColor = (index: number): boolean => {
    if (index >= positions.length) return true;
    const position = positions[index];
    const candidates = getColorCandidates(level, position.row, position.col, placed);

    for (const color of candidates) {
      const bubble: Bubble = { id: index + 1, color, ...position };
      assigned[index] = color;
      placed.set(cellKey(position.row, position.col), bubble);
      if (assignColor(index + 1)) return true;
      placed.delete(cellKey(position.row, position.col));
    }

    return false;
  };

  if (!assignColor(0)) throw new Error(`Не удалось собрать раскладку Бирюлек для уровня ${level.id}`);

  let bubbles = positions.map((position, index) => ({
    id: index + 1,
    color: assigned[index],
    ...position,
  }));

  // The opening shot must be understandable and useful. Expose an existing
  // two-bubble group by removing one blocking bubble directly below it.
  if (level.id <= 3 && level.rows >= 2) {
    const pairs = bubbles.filter(bubble => findColorGroup(bubbles, bubble.row, bubble.col).length === 2);
    const pair = pairs
      .map(bubble => findColorGroup(bubbles, bubble.row, bubble.col))
      .find((group, index, groups) => (
        groups.findIndex(candidate => candidate[0]?.id === group[0]?.id) === index
        && group.some(item => item.row >= level.rows - 2)
      ));

    if (pair) {
      const pairIds = new Set(pair.map(bubble => bubble.id));
      const blocker = bubbles
        .filter(bubble => !pairIds.has(bubble.id) && bubble.row > Math.min(...pair.map(item => item.row)))
        .filter(bubble => pair.some(item => getNeighbors(item.row, item.col).some(([row, col]) => row === bubble.row && col === bubble.col)))
        .sort((a, b) => b.row - a.row)[0];
      if (blocker) bubbles = bubbles.filter(bubble => bubble.id !== blocker.id);
    }
  }
  _nextBubbleId = bubbles.length + 1;
  return bubbles;
}

export function nextBubbleId(): number {
  return _nextBubbleId++;
}
