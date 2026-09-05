import { motion, AnimatePresence } from 'motion/react';
import { Trophy } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { GAME_LEVEL_TOTAL } from '@/data/gameProgression';

interface Win2048PopupProps {
  open: boolean;
  level: number;
  score: number;
  earnedReward: number | null;
  onContinue: () => void;
  onRestart: () => void;
}

export function Win2048Popup({ open, level, score, earnedReward, onContinue, onRestart }: Win2048PopupProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="bg-dark-surface border border-primary/30 rounded-2xl p-6 w-[85%] max-w-sm text-center"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
          >
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
              <Trophy size={32} className="text-primary" />
            </div>
            <h3 className="font-heading text-xl font-bold text-primary">
              Уровень {level} из {GAME_LEVEL_TOTAL} пройден!
            </h3>
            <p className="text-white/50 text-sm mt-2">Очки: {score}</p>
            <p className="text-white/55 text-sm mt-2 font-semibold">
              {earnedReward === null
                ? 'Прогресс сохранён'
                : earnedReward > 0
                  ? `+${earnedReward} термокоинов`
                  : 'Лимит Славича на сегодня достигнут'}
            </p>
            <div className="space-y-2 mt-5">
              <Button className="w-full" onClick={onContinue}>
                {level < GAME_LEVEL_TOTAL ? `Продолжить — уровень ${level + 1}` : 'Продолжить игру'}
              </Button>
              <button
                onClick={onRestart}
                className="w-full py-2 text-white/50 text-sm hover:text-white/80 transition-colors"
              >
                Начать уровень заново
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
