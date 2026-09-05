import { motion } from 'motion/react';
import { Star } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { StarRating } from '@/components/ui/StarRating';
import { getStars, getReward } from '@/engine/scorer';
import type { LevelConfig } from '@/types/game';
import { GAME_LEVEL_TOTAL } from '@/data/gameProgression';

interface WinPopupProps {
  open: boolean;
  score: number;
  levelConfig: LevelConfig;
  onNext: () => void;
  onMap: () => void;
  earnedReward?: number | null;
}

export function WinPopup({ open, score, levelConfig, onNext, onMap, earnedReward }: WinPopupProps) {
  const stars = getStars(score, levelConfig.starThresholds);
  const reward = earnedReward === undefined ? getReward(stars, levelConfig.reward) : earnedReward;

  return (
    <Modal open={open}>
      <div className="text-center space-y-4">
        <motion.div
          className="w-20 h-20 bg-primary/20 border border-primary/30 rounded-full flex items-center justify-center mx-auto"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
        >
          <Star size={36} className="text-primary fill-primary" />
        </motion.div>

        <h2 className="font-heading text-2xl text-primary font-bold">Победа!</h2>
        <p className="text-sm font-semibold text-white/60">
          Уровень {levelConfig.id} из {GAME_LEVEL_TOTAL} пройден
        </p>

        <StarRating stars={stars} size={36} animated className="justify-center" />

        <div className="space-y-2">
          <p className="text-white text-lg font-bold tabular-nums">{score.toLocaleString()} очков</p>
          {reward !== null && reward > 0 && (
            <div className="bg-primary/10 border border-primary/20 rounded-xl px-4 py-2 inline-block">
              <p className="text-primary font-bold">+{reward} термокоинов</p>
            </div>
          )}
          {reward === null && <p className="text-white/45 text-xs">Считаем награду…</p>}
          {reward === 0 && (
            <p className="text-white/45 text-xs">Лимит Хоровода на сегодня достигнут</p>
          )}
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onMap} className="flex-1">Карта</Button>
          {levelConfig.id < GAME_LEVEL_TOTAL && (
            <Button onClick={onNext} className="flex-1">Дальше</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
