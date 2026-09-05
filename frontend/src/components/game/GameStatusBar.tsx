import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { FREE_HOUR_PRICE } from '@/features/rewards/rewardRules';
import { cn } from '@/utils/cn';

interface GameStatusBarProps {
  metricLabel: string;
  metricValue: number | string;
  secondaryLabel: string;
  secondaryValue: number | string;
  secondaryValueDataAttribute?: `data-${string}`;
  currency: number;
  action?: ReactNode;
  className?: string;
}

function formatValue(value: number | string) {
  return typeof value === 'number' ? value.toLocaleString('ru-RU') : value;
}

export function GameStatusBar({
  metricLabel,
  metricValue,
  secondaryLabel,
  secondaryValue,
  secondaryValueDataAttribute,
  currency,
  action,
  className,
}: GameStatusBarProps) {
  const safeCurrency = Math.max(0, Math.floor(currency));
  const hasReachedGoal = safeCurrency >= FREE_HOUR_PRICE;
  const remaining = Math.max(0, FREE_HOUR_PRICE - safeCurrency);
  const walletAria = hasReachedGoal
    ? `Кошелёк: ${safeCurrency.toLocaleString('ru-RU')} термокоинов. Накоплено достаточно для цели ${FREE_HOUR_PRICE}. Проверить доступность награды в магазине.`
    : `Кошелёк: ${safeCurrency.toLocaleString('ru-RU')} термокоинов. Цель — ${FREE_HOUR_PRICE} термокоинов за бесплатный час. Осталось накопить ${remaining}. Перейти в магазин.`;

  return (
    <div
      className={cn(
        'grid items-stretch gap-2',
        action
          ? 'grid-cols-[minmax(0,0.75fr)_minmax(0,0.75fr)_minmax(7rem,1.4fr)_2.75rem]'
          : 'grid-cols-[minmax(0,0.75fr)_minmax(0,0.75fr)_minmax(6.25rem,1.4fr)]',
        className,
      )}
      role="group"
      aria-label="Показатели игры и общий кошелёк"
      data-game-status
      data-game-status-bar
    >
      <div className="flex min-h-[60px] min-w-0 flex-col items-center justify-center rounded-xl border border-white/15 bg-black/40 px-1.5 py-1.5 text-center backdrop-blur-sm">
        <span className="text-[9px] font-semibold leading-tight text-white/55">{metricLabel}</span>
        <strong
          className={cn(
            'mt-0.5 max-w-full truncate font-bold tabular-nums text-primary',
            typeof metricValue === 'string' ? 'text-[13px]' : 'text-base',
          )}
          data-game-score
          data-game-current-metric
        >
          {formatValue(metricValue)}
        </strong>
      </div>

      <div className="flex min-h-[60px] min-w-0 flex-col items-center justify-center rounded-xl border border-white/15 bg-black/40 px-1.5 py-1.5 text-center backdrop-blur-sm">
        <span className="text-[9px] font-semibold leading-tight text-white/55">{secondaryLabel}</span>
        <strong
          className="mt-0.5 max-w-full truncate text-base font-bold tabular-nums text-white/90"
          {...(secondaryValueDataAttribute ? { [secondaryValueDataAttribute]: '' } : {})}
          data-game-secondary-metric
        >
          {formatValue(secondaryValue)}
        </strong>
      </div>

      <Link
        to="/shop"
        aria-label={walletAria}
        title={walletAria}
        className={cn(
          'flex min-h-[60px] min-w-0 flex-col justify-center rounded-xl border px-2 py-1.5 text-left backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          hasReachedGoal
            ? 'border-emerald-300/45 bg-emerald-400/15 hover:bg-emerald-400/20'
            : 'border-primary/35 bg-primary/15 hover:bg-primary/20',
        )}
        data-game-wallet
        data-wallet-goal-reached={hasReachedGoal ? 'true' : 'false'}
      >
        <span className="flex min-w-0 items-center gap-1 text-[9px] font-bold leading-none text-white/75">
          <Wallet size={13} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">Кошелёк</span>
          <span className="termcoin-mark termcoin-mark--compact shrink-0" aria-hidden="true">
            <img src="/images/brand/termburg-fish-96-v2.webp" alt="" width="48" height="48" />
          </span>
          <strong className="text-sm font-bold tabular-nums text-primary" data-game-wallet-balance>
            {safeCurrency.toLocaleString('ru-RU')}
          </strong>
        </span>
        <span className="mt-1 truncate text-[8px] font-semibold leading-none text-white/65">
          Цель {FREE_HOUR_PRICE} · бесплатный час
        </span>
        <span className={cn('mt-1 truncate text-[8px] font-semibold leading-none', hasReachedGoal ? 'text-emerald-200' : 'text-white/55')}>
          {hasReachedGoal ? `Накоплено ${FREE_HOUR_PRICE} · проверить` : `До цели ещё ${remaining}`}
        </span>
      </Link>

      {action && <div className="flex min-h-11 items-center justify-center">{action}</div>}
    </div>
  );
}
