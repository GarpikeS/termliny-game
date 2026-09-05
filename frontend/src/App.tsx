import { lazy, Suspense, useEffect, type CSSProperties } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { GameProvider } from '@/store/GameContext';
import { AuthProvider } from '@/features/account/AuthContext';
import { BottomNav, isBottomNavHidden } from '@/components/ui/BottomNav';
import { GameHub } from '@/components/screens/GameHub';
import { rememberEntrySource } from '@/features/rewards/acquisition';
import { useVisualViewportSize } from '@/hooks/useVisualViewportSize';

const SplashScreen = lazy(() => import('@/components/screens/SplashScreen').then(module => ({ default: module.SplashScreen })));
const BathhouseMap = lazy(() => import('@/components/screens/BathhouseMap').then(module => ({ default: module.BathhouseMap })));
const BathhousesScreen = lazy(() => import('@/components/screens/BathhousesScreen').then(module => ({ default: module.BathhousesScreen })));
const LevelMap = lazy(() => import('@/components/screens/LevelMap').then(module => ({ default: module.LevelMap })));
const GameScreen = lazy(() => import('@/components/screens/GameScreen').then(module => ({ default: module.GameScreen })));
const Game2048Screen = lazy(() => import('@/components/screens/Game2048Screen').then(module => ({ default: module.Game2048Screen })));
const BubbleShooterScreen = lazy(() => import('@/components/screens/BubbleShooterScreen').then(module => ({ default: module.BubbleShooterScreen })));
const TamagotchiScreen = lazy(() => import('@/components/screens/TamagotchiScreen').then(module => ({ default: module.TamagotchiScreen })));
const ShopScreen = lazy(() => import('@/components/screens/ShopScreen').then(module => ({ default: module.ShopScreen })));
const FreeHourClaimScreen = lazy(() => import('@/components/screens/FreeHourClaimScreen').then(module => ({ default: module.FreeHourClaimScreen })));
const CartScreen = lazy(() => import('@/components/screens/CartScreen').then(module => ({ default: module.CartScreen })));
const CheckoutScreen = lazy(() => import('@/components/screens/CheckoutScreen').then(module => ({ default: module.CheckoutScreen })));
const TermlinyCollection = lazy(() => import('@/components/screens/TermlinyCollection').then(module => ({ default: module.TermlinyCollection })));
const TermlinDetail = lazy(() => import('@/components/screens/TermlinDetail').then(module => ({ default: module.TermlinDetail })));
const ProfileScreen = lazy(() => import('@/components/screens/ProfileScreen').then(module => ({ default: module.ProfileScreen })));
const AuthScreen = lazy(() => import('@/components/screens/AuthScreen').then(module => ({ default: module.AuthScreen })));
const LegalScreen = lazy(() => import('@/components/screens/LegalScreen').then(module => ({ default: module.LegalScreen })));
const FeedbackScreen = lazy(() => import('@/components/screens/FeedbackScreen').then(module => ({ default: module.FeedbackScreen })));
const ScheduleMobileScreen = lazy(() => import('@/components/screens/ScheduleMobileScreen').then(module => ({ default: module.ScheduleMobileScreen })));
const ScheduleDisplayScreen = lazy(() => import('@/components/screens/ScheduleDisplayScreen').then(module => ({ default: module.ScheduleDisplayScreen })));
const SchedulePrintScreen = lazy(() => import('@/components/screens/SchedulePrintScreen').then(module => ({ default: module.SchedulePrintScreen })));
const ScheduleAdminAccessScreen = lazy(() => import('@/components/screens/ScheduleAdminAccessScreen').then(module => ({ default: module.ScheduleAdminAccessScreen })));
const SchedulePosterScreen = lazy(() => import('@/components/screens/SchedulePosterScreen').then(module => ({ default: module.SchedulePosterScreen })));

function AppLayout() {
  const location = useLocation();
  const viewport = useVisualViewportSize();
  const withBottomNav = !isBottomNavHidden(location.pathname);
  const standaloneSchedule = location.pathname === '/schedule' || location.pathname.startsWith('/schedule/');
  const stableGameViewport = location.pathname === '/games' || location.pathname.startsWith('/games/');

  useEffect(() => {
    rememberEntrySource(location.search);
  }, [location.search]);

  return (
    <div
      className={`app-shell ${stableGameViewport ? 'app-shell--stable-game' : ''} ${standaloneSchedule ? 'schedule-standalone-shell' : ''}`}
      style={stableGameViewport ? undefined : { '--app-viewport-height': `${viewport.height}px` } as CSSProperties}
    >
      <div className={`phone-frame bg-dark-surface relative flex flex-col ${standaloneSchedule ? 'phone-frame--standalone' : ''}`}>
        <main
          className={`phone-screen ${withBottomNav ? 'phone-screen--with-nav' : ''} ${standaloneSchedule ? 'phone-screen--standalone' : ''}`}
          data-termburg-route-key={location.key}
        >
          <Suspense fallback={<div className="route-loading" role="status" aria-label="Загрузка страницы" />}>
            <Routes>
              <Route path="/" element={<SplashScreen />} />
              <Route path="/games" element={<GameHub />} />
              <Route path="/bathhouses" element={<BathhousesScreen />} />
              <Route path="/games/match3" element={<BathhouseMap />} />
              <Route path="/games/match3/levels/:bathhouseId" element={<LevelMap />} />
              <Route path="/games/match3/play/:id" element={<GameScreen />} />
              <Route path="/games/2048" element={<Game2048Screen />} />
              <Route path="/games/bubbles" element={<BubbleShooterScreen />} />
              <Route path="/games/pet" element={<TamagotchiScreen />} />
              <Route path="/shop" element={<ShopScreen />} />
              <Route path="/shop/free-hour" element={<FreeHourClaimScreen />} />
              <Route path="/shop/cart" element={<CartScreen />} />
              <Route path="/shop/checkout" element={<CheckoutScreen />} />
              <Route path="/collection" element={<TermlinyCollection />} />
              <Route path="/collection/:id" element={<TermlinDetail />} />
              <Route path="/profile" element={<ProfileScreen />} />
              <Route path="/account" element={<AuthScreen />} />
              <Route path="/legal/privacy" element={<LegalScreen kind="privacy" />} />
              <Route path="/legal/consent" element={<LegalScreen kind="consent" />} />
              <Route path="/profile/feedback" element={<FeedbackScreen />} />
              <Route path="/bathhouses/:locationId/schedule" element={<ScheduleMobileScreen />} />
              <Route path="/schedule/admin" element={<ScheduleAdminAccessScreen />} />
              <Route path="/schedule/screen/:locationId/:layout" element={<ScheduleDisplayScreen />} />
              <Route path="/schedule/screen/:locationId" element={<ScheduleDisplayScreen />} />
              <Route path="/schedule/print/:locationId" element={<SchedulePrintScreen />} />
              <Route path="/schedule/poster/:locationId" element={<SchedulePosterScreen />} />
              <Route path="/schedule" element={<Navigate to="/schedule/admin" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            {location.pathname !== '/' && <span data-termburg-app-ready={location.key} hidden />}
          </Suspense>
          <BottomNav />
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <GameProvider>
        <BrowserRouter>
          <AppLayout />
        </BrowserRouter>
      </GameProvider>
    </AuthProvider>
  );
}
