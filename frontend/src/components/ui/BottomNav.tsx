import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarClock, Gamepad2, Wallet, Users, User, type LucideIcon } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useGameContext } from '@/store/GameContext';

interface BottomNavTab {
  path: string;
  icon: LucideIcon;
  label: string;
  ariaLabel?: string;
  featured?: boolean;
  cartBadge?: boolean;
  wallet?: boolean;
}

const tabs: readonly BottomNavTab[] = [
  { path: '/games', icon: Gamepad2, label: 'Игры' },
  { path: '/bathhouses', icon: CalendarClock, label: 'Термбурги', ariaLabel: 'Термбурги и расписание', featured: true },
  { path: '/shop', icon: Wallet, label: 'Кошелёк', ariaLabel: 'Кошелёк и магазин', cartBadge: true, wallet: true },
  { path: '/collection', icon: Users, label: 'Термлины' },
  { path: '/profile', icon: User, label: 'Профиль' },
];

const HIDDEN_PREFIXES = ['/shop/free-hour', '/schedule', '/account', '/legal'];

export function isBottomNavHidden(pathname: string) {
  return pathname === '/' || HIDDEN_PREFIXES.some(prefix => pathname.startsWith(prefix));
}

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { progress } = useGameContext();

  if (isBottomNavHidden(location.pathname)) return null;

  const cartCount = progress.cart.reduce((s, c) => s + c.quantity, 0);
  const walletAmount = progress.currency.toLocaleString('ru-RU');

  return (
    <nav aria-label="Нижняя навигация" className="bottom-nav bottom-nav--enter absolute bottom-0 left-0 right-0 bg-dark-surface border-t border-dark-border z-40">
      <div className="bottom-nav__items grid grid-cols-5 items-start">
        {tabs.map(tab => {
          const active = location.pathname === tab.path ||
            (tab.path === '/games' && location.pathname.startsWith('/games')) ||
            (tab.path === '/bathhouses' && location.pathname.startsWith('/bathhouses')) ||
            (tab.path === '/shop' && location.pathname.startsWith('/shop')) ||
            (tab.path === '/collection' && location.pathname.startsWith('/collection')) ||
            (tab.path === '/profile' && location.pathname.startsWith('/profile'));
          return (
            <button
              type="button"
              key={tab.path}
              onClick={() => navigate(tab.path)}
              aria-label={tab.wallet
                ? `${tab.ariaLabel}. Баланс: ${walletAmount} термокоинов`
                : (tab.ariaLabel ?? tab.label)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'bottom-nav__item min-w-0 min-h-12 flex flex-col items-center justify-center gap-1 px-1 py-1 rounded-lg transition-colors relative',
                tab.featured && 'bottom-nav__item--featured',
                active ? 'text-primary' : tab.featured ? 'text-white/60 hover:text-primary' : 'text-white/50 hover:text-white/80',
              )}
            >
              <span className={cn('bottom-nav__icon relative flex items-center justify-center', tab.featured && 'bottom-nav__schedule-icon')}>
                <tab.icon size={20} strokeWidth={tab.featured ? 2.2 : 2} aria-hidden="true" />
                {tab.wallet && (
                  <span
                    className={cn(
                      'absolute -top-2 left-[calc(50%+2px)] max-w-[2.8rem] truncate rounded-full border px-1.5 py-0.5 text-[8px] font-extrabold leading-none tabular-nums shadow-sm',
                      progress.currency >= 50
                        ? 'border-emerald-300/50 bg-emerald-900/95 text-emerald-200'
                        : 'border-primary/45 bg-[#292235]/95 text-primary',
                    )}
                    data-global-wallet
                    title={`${walletAmount} термокоинов`}
                    aria-hidden="true"
                  >
                    {walletAmount}
                  </span>
                )}
                {tab.cartBadge && cartCount > 0 && (
                  <span className="absolute -top-1.5 -left-2.5 bg-red-500 text-white text-[8px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {cartCount > 9 ? '9+' : cartCount}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium">{tab.label}</span>
              {active && (
                <div className="absolute -bottom-1 w-1 h-1 bg-primary rounded-full" />
              )}
            </button>
          );
        })}
      </div>
      <div className="gold-separator" />
    </nav>
  );
}
