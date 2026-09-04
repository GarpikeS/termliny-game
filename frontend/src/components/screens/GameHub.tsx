import { useNavigate } from 'react-router-dom';
import { useGameContext } from '@/store/GameContext';
import { SceneCanvas } from '@/components/ui/SceneCanvas';
import { CurrencyDisplay } from '@/components/ui/CurrencyDisplay';
import { PlayerStatusButton } from '@/components/ui/PlayerStatusButton';
import { GAME_NAMES } from '@/data/gameNames';

// Positions measured from 894x1760 source image → % of image
const portals = [
  { id: 'slavich',  title: GAME_NAMES.game2048, path: '/games/2048',    x: 26, y: 54, w: 28, h: 18 },
  { id: 'biryulki', title: GAME_NAMES.bubbles,  path: '/games/bubbles', x: 74, y: 54, w: 28, h: 18 },
  { id: 'pestun',   title: GAME_NAMES.pet,      path: '/games/pet',     x: 26, y: 76, w: 28, h: 18 },
  { id: 'horovod',  title: GAME_NAMES.match3,   path: '/games/match3',  x: 74, y: 76, w: 28, h: 18 },
] as const;

export function GameHub() {
  const navigate = useNavigate();
  const { progress } = useGameContext();

  return (
    <div className="h-full relative bg-[#080c08] overflow-hidden">
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
        <div className="game-hub__currency">
          <CurrencyDisplay amount={progress.currency} className="bg-black/50 border border-primary/30 py-1.5" />
        </div>
        <PlayerStatusButton />
      </div>
    </div>
  );
}
