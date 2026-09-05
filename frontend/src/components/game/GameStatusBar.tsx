import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { FREE_HOUR_PRICE } from '@/features/rewards/rewardRules';
import { GAME_LEVEL_TOTAL, clampGameLevel } from '@/data/gameProgression';
import { cn } from '@/utils/cn';

interface GameStatusBarProps {
  level: number;
  totalLevels?: number;
  metricLabel: string;
  metricValue: number | string;
  detailLabel?: string;
  detailValue?: number | string;
  detailValueDataAttribute?: `data-${string}`;
  currency: number;
  className?: string;
}

function formatValue(value: number | string) {
  return typeof value === 'number' ? value.toLocaleString('ru-RU') : value;
}

export function GameStatusBar({
  level,
  totalLevels = GAME_LEVEL_TOTAL,
  metricLabel,
  metricValue,
  detailLabel,
  detailValue,
  detailValueDataAttribute,
  currency,
  className,
}: GameStatusBarProps) {
  const safeTotal = Number.isFinite(totalLevels) ? Math.max(1, Math.floor(totalLevels)) : GAME_LEVEL_TOTAL;
  const safeLevel = Math.min(safeTotal, clampGameLevel(level));
  const safeCurrency = Number.isFinite(currency) ? Math.max(0, Math.floor(currency)) : 0;
  const hasReachedGoal = safeCurrency >= FREE_HOUR_PRICE;
  const remaining = Math.max(0, FREE_HOUR_PRICE - safeCurrency);
  const walletAria = hasReachedGoal
    ? `Кошелёк: ${safeCurrency.toLocaleString('ru-RU')} термокоинов. Накоплено достаточно для цели ${FREE_HOUR_PRICE}. Проверить доступность награды в магазине.`
    : `Кошелёк: ${safeCurrency.toLocaleString('ru-RU')} термокоинов. Цель — ${FREE_HOUR_PRICE} термокоинов за бесплатный час. Осталось накопить ${remaining}. Перейти в магазин.`;

  return (
    <div className={cn('game-status-shell', className)}>
      <div
        className="grid grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)_minmax(4.75rem,0.8fr)] overflow-hidden rounded-xl border border-white/15 bg-black/45 backdrop-blur-sm"
        role="group"
        aria-label="Статус игры"
        data-game-status
        data-game-status-bar
      >
        <div
          className="flex min-h-[60px] min-w-0 flex-col items-center justify-center border-r border-white/10 px-1.5 py-1.5 text-center"
          data-game-level
        >
          <span className="text-[9px] font-semibold leading-tight text-white/55">Уровень</span>
          <strong className="mt-0.5 whitespace-nowrap text-[13px] font-bold tabular-nums text-white/95">
            <span data-game-level-current>{safeLevel}</span>{' из '}
            <span data-game-level-total>{safeTotal}</span>
          </strong>
        </div>

        <div className="flex min-h-[60px] min-w-0 flex-col items-center justify-center border-r border-white/10 px-1.5 py-1.5 text-center">
          <span className="text-[9px] font-semibold leading-tight text-white/55">{metricLabel}</span>
          <strong
            className={cn(
              'mt-0.5 max-w-full whitespace-nowrap font-bold tabular-nums text-primary',
              typeof metricValue === 'string' ? 'text-[13px]' : 'text-[13px] min-[360px]:text-base',
            )}
            data-game-score
            data-game-current-metric
          >
            {formatValue(metricValue)}
          </strong>
          {detailLabel && detailValue !== undefined && (
            <span className="mt-0.5 max-w-full whitespace-nowrap text-[10px] font-semibold leading-none text-white/70">
              {detailLabel}{' '}
              <b
                className="font-bold tabular-nums text-white/75"
                {...(detailValueDataAttribute ? { [detailValueDataAttribute]: '' } : {})}
                data-game-secondary-metric
              >
                {formatValue(detailValue)}
              </b>
            </span>
          )}
        </div>

        <Link
          to="/shop"
          aria-label={walletAria}
          title={walletAria}
          className={cn(
            'flex min-h-[60px] min-w-0 flex-col items-center justify-center px-1.5 py-1.5 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
            hasReachedGoal ? 'bg-emerald-400/15 hover:bg-emerald-400/20' : 'bg-primary/15 hover:bg-primary/20',
          )}
          data-game-wallet
          data-wallet-goal-reached={hasReachedGoal ? 'true' : 'false'}
        >
          <span className="text-[9px] font-semibold leading-tight text-white/65">Кошелёк</span>
          <span className="mt-0.5 flex min-w-0 items-center justify-center gap-0.5">
            <Wallet size={14} className="shrink-0 text-primary" aria-hidden="true" />
            <strong className="max-w-full whitespace-nowrap text-[11px] font-bold tabular-nums text-primary min-[360px]:text-sm" data-game-wallet-balance>
              {safeCurrency.toLocaleString('ru-RU')}
            </strong>
          </span>
        </Link>
      </div>
    </div>
  );
}
