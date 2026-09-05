import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ObjectiveDisplay } from '@/components/game/ObjectiveDisplay';
import { LivesDisplay } from '@/components/ui/LivesDisplay';
import { LIFE_PRICE, MAX_LIVES } from '@/store/lives';
import type { LevelConfig } from '@/types/game';
import { GAME_LEVEL_TOTAL } from '@/data/gameProgression';

interface LevelStartPopupProps {
  open: boolean;
  config: LevelConfig;
  lives: number;
  currency: number;
  nextLifeAt: number | null;
  onStart: () => void;
  onBuyLife: () => void;
  onBack: () => void;
}

export function LevelStartPopup({
  open,
  config,
  lives,
  currency,
  nextLifeAt,
  onStart,
  onBuyLife,
  onBack,
}: LevelStartPopupProps) {
  const objectives = config.objectives.map(o => ({ ...o, current: 0 }));
  const hasLives = lives > 0;
  const canBuyLife = lives < MAX_LIVES && currency >= LIFE_PRICE;

  return (
    <Modal open={open}>
      <div className="text-center space-y-4">
        <h2 className="font-heading text-2xl text-primary font-bold">{config.name}</h2>
        <p className="text-white/50 text-sm">Уровень {config.id} из {GAME_LEVEL_TOTAL}</p>

        <div className="space-y-2">
          <p className="text-white/40 text-xs uppercase tracking-wider">Собери</p>
          <div className="bg-white/5 border border-white/10 rounded-xl p-3">
            <ObjectiveDisplay objectives={objectives} />
          </div>
        </div>

        <p className="text-white/50 text-sm">{config.moves} ходов</p>

        <LivesDisplay
          lives={lives}
          nextLifeAt={nextLifeAt}
          showTimer
          className="mx-auto justify-center bg-rose-950/35"
        />

        {!hasLives && (
          <div className="rounded-xl border border-rose-300/20 bg-rose-400/10 p-3">
            <p className="text-sm font-bold text-rose-100">Жизни закончились</p>
            <p className="mt-1 text-xs leading-relaxed text-white/60">
              Одна жизнь восстановится через 15 минут. Если не хочется ждать — купи одну за {LIFE_PRICE} термокоинов.
            </p>
          </div>
        )}

        {lives < MAX_LIVES && (
          <div>
            <Button
              variant="outline"
              onClick={onBuyLife}
              disabled={!canBuyLife}
              className="w-full"
              data-buy-life
            >
              Купить +1 жизнь · {LIFE_PRICE} термокоинов
            </Button>
            {!canBuyLife && (
              <p className="mt-2 text-xs font-semibold text-amber-300">
                Не хватает {LIFE_PRICE - currency} термокоинов
              </p>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onBack} className="flex-1">Назад</Button>
          <Button onClick={onStart} disabled={!hasLives} className="flex-1">Играть</Button>
        </div>
      </div>
    </Modal>
  );
}
