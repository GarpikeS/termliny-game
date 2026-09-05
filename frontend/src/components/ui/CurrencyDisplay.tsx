import { Wallet } from 'lucide-react';
import { cn } from '@/utils/cn';

interface CurrencyDisplayProps {
  amount: number;
  className?: string;
  label?: string;
}

export function CurrencyDisplay({ amount, className, label }: CurrencyDisplayProps) {
  const formattedAmount = amount.toLocaleString('ru-RU');

  return (
    <div
      className={cn('flex items-center gap-1.5 bg-primary/20 rounded-full px-2.5 py-1', className)}
      aria-label={`${label ? `${label}. ` : ''}Баланс: ${formattedAmount} термокоинов`}
      title={`${formattedAmount} термокоинов`}
    >
      {label && <Wallet size={16} className="shrink-0 text-primary" aria-hidden="true" />}
      <span className="termcoin-mark" aria-hidden="true">
        <img src="/images/brand/termburg-fish-96-v2.webp" alt="" width="48" height="48" />
      </span>
      {label ? (
        <span className="grid min-w-0 leading-none text-left">
          <small className="text-[8px] font-semibold uppercase tracking-wide text-white/55">{label}</small>
          <strong className="mt-0.5 text-xs font-bold tabular-nums text-primary">{formattedAmount}</strong>
        </span>
      ) : (
        <span className="text-primary font-bold text-xs tabular-nums">{formattedAmount}</span>
      )}
    </div>
  );
}
