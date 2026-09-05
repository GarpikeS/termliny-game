import type { Bathhouse } from '@/types/game';

// Реальные зоны Термбурга
// Каноническая шкала игры: 100 уровней. Существующие ID 1-100 не перенумеровываем.
export const bathhouses: Bathhouse[] = [
  { id: 1, name: 'Русская баня', color: '#8B6F47', levelsRange: [1, 10], position: { x: 30, y: 86 } },
  { id: 2, name: 'Финская сауна', color: '#C4956C', levelsRange: [11, 20], position: { x: 74, y: 79 } },
  { id: 3, name: 'Турецкий хаммам', color: '#6DB4C9', levelsRange: [21, 30], position: { x: 30, y: 70 } },
  { id: 4, name: 'Сибирская парная', color: '#7FA99B', levelsRange: [31, 40], position: { x: 74, y: 63 } },
  { id: 5, name: 'Баня-бочка', color: '#A67C52', levelsRange: [41, 52], position: { x: 30, y: 54 } },
  { id: 6, name: 'Липовая сауна', color: '#D4B896', levelsRange: [53, 62], position: { x: 74, y: 47 } },
  { id: 7, name: 'Травяная сауна', color: '#6EAA5E', levelsRange: [63, 72], position: { x: 30, y: 39 } },
  { id: 8, name: 'Инфракрасная сауна', color: '#E88B5C', levelsRange: [73, 82], position: { x: 74, y: 32 } },
  { id: 9, name: 'Соляная парная', color: '#E8B4D4', levelsRange: [83, 96], position: { x: 30, y: 24 } },
  { id: 10, name: 'Мультикаменная баня', color: '#8B8D8F', levelsRange: [97, 100], position: { x: 74, y: 17 } },
];

export function getBathhouseById(id: number): Bathhouse | undefined {
  return bathhouses.find(b => b.id === id);
}

export function getBathhouseForLevel(levelId: number): Bathhouse | undefined {
  return bathhouses.find(b => levelId >= b.levelsRange[0] && levelId <= b.levelsRange[1]);
}
