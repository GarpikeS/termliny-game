import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowLeft, Lock, Star } from 'lucide-react';
import { useGameContext } from '@/store/GameContext';
import { getLevelsForBathhouse } from '@/data/levels';
import { getBathhouseById } from '@/data/bathhouses';
import { cn } from '@/utils/cn';
import { SceneCanvas } from '@/components/ui/SceneCanvas';
import { LivesDisplay } from '@/components/ui/LivesDisplay';
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay';
import type { MouseEvent as ReactMouseEvent } from 'react';

// Конфигурация для каждой бани: позиции кругов и флаг квадратности
const BATH_CONFIGS: Record<number, { positions: { x: number; y: number }[]; isSquare: boolean }> = {
  // bath-1: Русская баня — вертикальное изображение, 10 кругов
  1: {
    isSquare: false,
    positions: [
      { x: 30, y: 91 }, { x: 70, y: 81.5 }, { x: 30, y: 74 }, { x: 70, y: 65.5 },
      { x: 30, y: 58.5 }, { x: 70, y: 50.5 }, { x: 30, y: 40.5 }, { x: 70, y: 32.7 },
      { x: 30, y: 24.5 }, { x: 67, y: 17 },
    ],
  },
  // bath-2: Финская сауна — вертикальное, 10 кругов
  2: {
    isSquare: false,
    positions: [
      { x: 30, y: 90 }, { x: 70, y: 81.5 }, { x: 30, y: 72 }, { x: 70, y: 63.5 },
      { x: 30, y: 56.5 }, { x: 70, y: 48.5 }, { x: 30, y: 40.5 }, { x: 70, y: 32.5 },
      { x: 30, y: 24.8 }, { x: 67, y: 17.5 },
    ],
  },
  // bath-3: Турецкий хаммам — квадратное, 10 кругов
  3: {
    isSquare: true,
    positions: [
      { x: 33, y: 91.5 }, { x: 50, y: 84 }, { x: 63.5, y: 77.4 }, { x: 50, y: 69.5 },
      { x: 37, y: 61.5 }, { x: 50, y: 54.5 }, { x: 63.5, y: 47.5 }, { x: 50, y: 39.5 },
      { x: 36, y: 32.2 }, { x: 50, y: 22.5 },
    ],
  },
  // bath-4: Сибирская парная — вертикальное, 10 кругов
  4: {
    isSquare: false,
    positions: [
      { x: 30, y: 92 }, { x: 70, y: 82 }, { x: 30, y: 72.5 }, { x: 70, y: 65 },
      { x: 30, y: 56 }, { x: 70, y: 48 }, { x: 30, y: 40 }, { x: 70, y: 32.5 },
      { x: 30, y: 24.5 }, { x: 70, y: 16.5 },
    ],
  },
  // bath-5: Баня-бочка — квадратное, 10 кругов
  5: {
    isSquare: true,
    positions: [
      { x: 47, y: 85 }, { x: 64, y: 79 }, { x: 48, y: 72 }, { x: 34, y: 65 },
      { x: 51, y: 58 }, { x: 66, y: 51 }, { x: 49, y: 44 }, { x: 34, y: 37 },
      { x: 55, y: 29 }, { x: 43, y: 22.8 },
    ],
  },
  // bath-6: Липовая сауна — квадратное, 10 кругов
  6: {
    isSquare: true,
    positions: [
      { x: 36, y: 98 }, { x: 36, y: 91.5 }, { x: 62.5, y: 82 }, { x: 36, y: 73.5 },
      { x: 62.5, y: 63.5 }, { x: 36, y: 54.5 }, { x: 62.5, y: 44.5 }, { x: 36, y: 35.5 },
      { x: 50.5, y: 25.5 }, { x: 50.5, y: 8.5 },
    ],
  },
  // bath-7: Травяная сауна — квадратное, 10 кругов
  7: {
    isSquare: true,
    positions: [
      { x: 36, y: 98 }, { x: 36, y: 91.5 }, { x: 63, y: 82 }, { x: 36, y: 73 },
      { x: 63, y: 63 }, { x: 36, y: 55 }, { x: 63, y: 45 }, { x: 36, y: 35.5 },
      { x: 51, y: 25.5 }, { x: 51, y: 8.5 },
    ],
  },
  // bath-8: Инфракрасная сауна — квадратное, 10 кругов
  8: {
    isSquare: true,
    positions: [
      { x: 36, y: 98 }, { x: 36, y: 91.5 }, { x: 63, y: 82 }, { x: 36, y: 73 },
      { x: 63, y: 63 }, { x: 36, y: 55 }, { x: 63, y: 45 }, { x: 36, y: 35.5 },
      { x: 51, y: 25.5 }, { x: 51, y: 8.5 },
    ],
  },
  // bath-9: Соляная парная — квадратное, 14 кругов
  9: {
    isSquare: true,
    positions: [
      { x: 52, y: 92 }, { x: 33, y: 82 }, { x: 51, y: 76 }, { x: 66, y: 70 },
      { x: 51, y: 65 }, { x: 37, y: 60 }, { x: 49, y: 55 }, { x: 61, y: 51 },
      { x: 49, y: 46 }, { x: 35, y: 41 }, { x: 49, y: 36 }, { x: 61, y: 30 },
      { x: 45, y: 24 }, { x: 50, y: 9.5 },
    ],
  },
  // bath-10: Мультикаменная баня — квадратное, 20 кругов
  10: {
    isSquare: true,
    positions: [
      { x: 53, y: 98 }, { x: 53, y: 92 }, { x: 42, y: 85 }, { x: 33, y: 79 },
      { x: 42, y: 74.5 }, { x: 51.5, y: 71.5 }, { x: 64, y: 68 }, { x: 57, y: 63.5 },
      { x: 48.5, y: 60 }, { x: 36, y: 56.5 }, { x: 44.5, y: 51.5 }, { x: 53.5, y: 49 },
      { x: 63.5, y: 45 }, { x: 56.5, y: 40.5 }, { x: 48, y: 38 }, { x: 36, y: 33.5 },
      { x: 44.5, y: 28.5 }, { x: 55.5, y: 23.5 }, { x: 53, y: 16 }, { x: 50, y: 9.5 },
    ],
  },
};

function selectLevelPositions(positions: { x: number; y: number }[], levelCount: number) {
  if (levelCount <= 0) return [];
  if (levelCount === 1) return positions.slice(0, 1);
  if (levelCount >= positions.length) return positions.slice(0, levelCount);

  return Array.from({ length: levelCount }, (_, index) => (
    positions[Math.round((index * (positions.length - 1)) / (levelCount - 1))]
  ));
}

export function LevelMap() {
  const navigate = useNavigate();
  const { bathhouseId } = useParams<{ bathhouseId: string }>();
  const { progress } = useGameContext();
  const bhId = Number(bathhouseId) || 1;
  const bathhouse = getBathhouseById(bhId);
  const bLevels = getLevelsForBathhouse(bhId);

  // Конфигурация бани
  const config = BATH_CONFIGS[bhId] ?? BATH_CONFIGS[1];
  const levelPositions = selectLevelPositions(config.positions, bLevels.length);
  const bathImage = `/images/levels/bath-${bhId}.jpg`;

  const handleMapPointerClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    // Keyboard activation has detail=0 and should reach the semantic button.
    if (event.detail === 0) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * 100;
    const pointerY = ((event.clientY - bounds.top) / bounds.height) * 100;

    const nearest = levelPositions.reduce(
      (best, position, index) => {
        const dx = ((pointerX - position.x) / 100) * bounds.width;
        const dy = ((pointerY - position.y) / 100) * bounds.height;
        const distance = Math.hypot(dx, dy);
        return distance < best.distance ? { index, distance } : best;
      },
      { index: -1, distance: Number.POSITIVE_INFINITY },
    );

    if (nearest.index < 0 || nearest.distance > 30) return;

    event.preventDefault();
    event.stopPropagation();
    const level = bLevels[nearest.index];
    if (level && level.id <= progress.currentLevel) {
      navigate(`/games/match3/play/${level.id}`);
    }
  };

  return (
    <div className="h-full relative bg-[#080c08] overflow-hidden flex flex-col">
      {/* Header — over the map */}
      <div className="safe-top-overlay absolute left-4 right-4 flex items-center justify-between z-20">
        <motion.button
          type="button"
          aria-label="Назад к карте бань"
          className="min-w-11 min-h-11 bg-black/50 backdrop-blur-sm border border-white/20 rounded-full flex items-center justify-center"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/games/match3')}
        >
          <ArrowLeft size={16} className="text-white/80" />
        </motion.button>

        <motion.div
          className="max-w-[36%] min-w-0 bg-black/50 backdrop-blur-sm border border-primary/30 rounded-full px-3 py-1.5"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="block truncate text-primary font-bold text-xs">{bathhouse?.name ?? 'Уровни'}</span>
        </motion.div>

        <motion.div
          className="flex items-center gap-1.5"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <LivesDisplay lives={progress.lives} nextLifeAt={progress.nextLifeAt} className="px-2.5" />
          <CurrencyDisplay amount={progress.currency} className="min-h-11 border border-primary/30 bg-black/50 px-2.5 backdrop-blur-sm" />
        </motion.div>
      </div>

      {/* Dark gradient for top UI */}
      <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/50 to-transparent z-10" />

      <div className="flex-1 min-h-0">
        <SceneCanvas
          src={bathImage}
          alt={bathhouse?.name ?? 'Карта уровней'}
          sourceWidth={config.isSquare ? 1024 : 585}
          sourceHeight={1024}
        >
          <div className="absolute inset-0 z-10" onClickCapture={handleMapPointerClick}>
          {levelPositions.map((pos, idx) => {
            const level = bLevels[idx];
            if (!level) return null;
            const lp = progress.levels[level.id];
            const unlocked = level.id <= progress.currentLevel;
            const stars = lp?.stars ?? 0;
            const current = level.id === progress.currentLevel;

            // Размер зоны клика
            const compactNode = config.isSquare || levelPositions.length > 12;
            const clickSize = compactNode ? 'w-11 h-11' : 'w-14 h-14';

            return (
              <div
                key={level.id}
                className={cn('absolute', clickSize)}
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
              <motion.button
                type="button"
                className={cn(
                  'w-full h-full rounded-full border bg-black/10',
                  unlocked ? 'border-primary/35' : 'border-white/10',
                )}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.02 }}
                onClick={() => unlocked && navigate(`/games/match3/play/${level.id}`)}
                disabled={!unlocked}
                aria-label={`Уровень ${level.id}: ${level.name}${unlocked ? '' : ', закрыто'}`}
              >
                {/* Glow for current level */}
                {current && (
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{ boxShadow: `0 0 25px 10px ${bathhouse?.color ?? '#BA9B4F'}90` }}
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                  />
                )}

                {/* Номер уровня в правом нижнем углу под кругом */}
                <div
                  className={cn(
                    'absolute flex items-center justify-center',
                    compactNode ? 'w-5 h-5 -right-1 -bottom-1' : 'w-6 h-6 -right-1 -bottom-1',
                    unlocked
                      ? 'bg-gradient-to-br from-primary to-primary/80 border-2 border-white/30'
                      : 'bg-black/70 border border-white/20',
                    'rounded-full shadow-lg',
                  )}
                >
                  {unlocked ? (
                    <span className={cn('text-white font-bold drop-shadow', compactNode ? 'text-[10px]' : 'text-xs')}>
                      {level.id}
                    </span>
                  ) : (
                    <Lock size={compactNode ? 8 : 10} className="text-white/50" />
                  )}
                </div>

                {/* Stars под номером */}
                {unlocked && (
                  <div className={cn(
                    'absolute flex gap-0.5',
                    compactNode ? '-bottom-4 right-0' : '-bottom-5 right-0',
                  )}>
                    {[0, 1, 2].map(s => (
                      <Star
                        key={s}
                        size={compactNode ? 6 : 7}
                        className={cn(
                          s < stars ? 'fill-yellow-400 text-yellow-400' : 'text-white/30',
                          'drop-shadow',
                        )}
                      />
                    ))}
                  </div>
                )}
              </motion.button>
              </div>
            );
          })}
          </div>
        </SceneCanvas>
      </div>
    </div>
  );
}
