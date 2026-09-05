import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useGameContext } from '@/store/GameContext';
import { FourGamesChallengeCard } from '@/components/game/FourGamesChallengeCard';
import { SceneCanvas } from '@/components/ui/SceneCanvas';
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay';
import { PlayerStatusButton } from '@/components/ui/PlayerStatusButton';
import { GAME_NAMES } from '@/data/gameNames';
import {
  FOUR_GAME_CHALLENGE_ID,
  FOUR_GAME_CHALLENGE_SOURCES,
  getFourGameChallengeCount,
  isFourGameChallengeComplete,
} from '@/features/rewards/fourGameChallenge';

const CHALLENGE_INTRO_FLAG = 'four-games-challenge-intro-v1';
const CHALLENGE_COMPLETE_FLAG = 'four-games-challenge-complete-v1';
const PORTAL_TOUR_FLAG = 'four-games-portal-tour-v1';
const PORTAL_TOUR_END_DELAY_MS = 4_300;
const REDUCED_MOTION_REVEAL_DELAY_MS = 200;

// Positions measured from 894x1760 source image → % of image
const portals = [
  { id: 'slavich',  title: GAME_NAMES.game2048, path: '/games/2048',    x: 26, y: 54, w: 28, h: 18 },
  { id: 'biryulki', title: GAME_NAMES.bubbles,  path: '/games/bubbles', x: 74, y: 54, w: 28, h: 18 },
  { id: 'pestun',   title: GAME_NAMES.pet,      path: '/games/pet',     x: 26, y: 76, w: 28, h: 18 },
  { id: 'horovod',  title: GAME_NAMES.match3,   path: '/games/match3',  x: 74, y: 76, w: 28, h: 18 },
] as const;

export function GameHub() {
  const navigate = useNavigate();
  const reducedMotion = useReducedMotion();
  const { progress, markTutorialSeen } = useGameContext();
  const completedGames = FOUR_GAME_CHALLENGE_SOURCES.filter(source => (
    progress.fourGameChallenge.completedGames.includes(source)
  ));
  const completedCount = getFourGameChallengeCount(progress.fourGameChallenge);
  const challengeComplete = isFourGameChallengeComplete(progress.fourGameChallenge);
  const introSeen = progress.tutorialFlags.includes(CHALLENGE_INTRO_FLAG);
  const completionSeen = progress.tutorialFlags.includes(CHALLENGE_COMPLETE_FLAG);
  const portalTourSeen = progress.tutorialFlags.includes(PORTAL_TOUR_FLAG);
  const hasChallengeClaim = progress.rewardClaims.some(claim => claim.campaignId === FOUR_GAME_CHALLENGE_ID);
  const [portalTourActive, setPortalTourActive] = useState(() => (
    !reducedMotion && !portalTourSeen && !introSeen && !challengeComplete && !hasChallengeClaim
  ));
  const [introReady, setIntroReady] = useState(() => introSeen || challengeComplete || portalTourSeen);
  const [manuallyExpanded, setManuallyExpanded] = useState(false);
  const [introDismissed, setIntroDismissed] = useState(false);
  const [completionDismissed, setCompletionDismissed] = useState(false);
  const portalTourPlaying = portalTourActive
    && !reducedMotion
    && !introSeen
    && !challengeComplete
    && !hasChallengeClaim;
  const autoIntroExpanded = introReady && !introSeen && !challengeComplete && !introDismissed;
  const autoCompletionExpanded = challengeComplete && !completionSeen && !completionDismissed;
  const challengeVisible = !hasChallengeClaim && (introReady || introSeen || challengeComplete);
  const challengeExpanded = manuallyExpanded || autoIntroExpanded || autoCompletionExpanded;
  const challengeAttention = !manuallyExpanded && (autoIntroExpanded || autoCompletionExpanded);

  useEffect(() => {
    if (hasChallengeClaim || challengeComplete || introSeen || introReady) return;

    // Persist when the tour starts so route changes cannot replay it on return.
    markTutorialSeen(PORTAL_TOUR_FLAG);
    const timer = window.setTimeout(() => {
      setPortalTourActive(false);
      setIntroReady(true);
    }, portalTourPlaying ? PORTAL_TOUR_END_DELAY_MS : REDUCED_MOTION_REVEAL_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [challengeComplete, hasChallengeClaim, introReady, introSeen, markTutorialSeen, portalTourPlaying]);

  const dismissChallenge = () => {
    markTutorialSeen(challengeComplete ? CHALLENGE_COMPLETE_FLAG : CHALLENGE_INTRO_FLAG);
    setManuallyExpanded(false);
    if (challengeComplete) setCompletionDismissed(true);
    else setIntroDismissed(true);
  };

  const openChallenge = () => {
    setManuallyExpanded(true);
  };

  const followChallengeAction = (path: string) => {
    markTutorialSeen(challengeComplete ? CHALLENGE_COMPLETE_FLAG : CHALLENGE_INTRO_FLAG);
    setManuallyExpanded(false);
    navigate(path);
  };

  return (
    <div
      className={`game-hub h-full relative bg-[#080c08] overflow-hidden${portalTourPlaying ? ' game-hub--portal-tour' : ''}`}
      data-portal-tour={portalTourPlaying ? 'active' : 'idle'}
    >
      <SceneCanvas
        src="/images/ui/app-bg-extended-games-v3.webp"
        srcSet="/images/ui/app-bg-extended-games-v3-480.webp 480w, /images/ui/app-bg-extended-games-v3-768.webp 768w, /images/ui/app-bg-extended-games-v3.webp 894w"
        sizes="(max-width: 479px) 70vw, 390px"
        alt="Термбург"
        sourceWidth={894}
        sourceHeight={1760}
        maxTopCropRatio={0.25}
        fetchPriority="high"
        className="scene-stage--bottom"
      >
        {/* Portal hotspots — positioned relative to image */}
        {portals.map((portal, index) => (
          <button
            type="button"
            key={portal.id}
            className={`game-hub__portal game-hub__portal--${portal.id} absolute rounded-[50%] z-10`}
            data-portal-sequence={index + 1}
            style={{
              left: `${portal.x}%`,
              top: `${portal.y}%`,
              width: `${portal.w}%`,
              height: `${portal.h}%`,
              transform: 'translate(-50%, -50%)',
            }}
            disabled={challengeExpanded}
            aria-hidden={challengeExpanded || undefined}
            onClick={() => navigate(portal.path)}
            aria-label={`Открыть игру ${portal.title}`}
          />
        ))}

        {/* House — Termliny collection (избушка) */}
        <button
          type="button"
          className="game-hub__house absolute z-10"
          style={{
            left: '50%',
            top: '91%',
            width: '76%',
            height: '18%',
            transform: 'translate(-50%, -50%)',
          }}
          disabled={challengeExpanded}
          aria-hidden={challengeExpanded || undefined}
          onClick={() => navigate('/collection')}
          aria-label="Открыть коллекцию термлинов"
        >
          <div
            className="game-hub__house-glow absolute rounded-[30%]"
            style={{
              inset: '-15%',
              background: 'radial-gradient(ellipse at center, rgba(255,200,100,0.25) 0%, transparent 70%)',
            }}
          />
        </button>
      </SceneCanvas>

      {/* Dark gradient for top UI */}
      <div className="absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/50 to-transparent z-20" />

      {/* Floating UI - термокоины */}
      <div className="safe-top-overlay absolute left-4 right-4 flex items-center justify-between gap-3 z-30">
        <button
          type="button"
          className="game-hub__currency min-h-11 rounded-full text-left"
          onClick={() => navigate('/shop')}
          aria-label={`Открыть кошелёк. Баланс: ${progress.currency.toLocaleString('ru-RU')} термокоинов`}
        >
          <CurrencyDisplay amount={progress.currency} label="Кошелёк" className="min-h-11 bg-black/50 border border-primary/30 py-1.5" />
        </button>
        <PlayerStatusButton />
      </div>

      {challengeVisible && (
        <FourGamesChallengeCard
          completedGames={completedGames}
          count={completedCount}
          currency={progress.currency}
          complete={challengeComplete}
          expanded={challengeExpanded}
          attention={challengeAttention}
          onExpand={openChallenge}
          onDismiss={dismissChallenge}
          onAction={followChallengeAction}
        />
      )}
    </div>
  );
}
