import type { Objective } from '@/types/game';
import { TOKEN_COLORS } from '@/types/game';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Pause, Sparkles } from 'lucide-react';
import type { Termlin } from '@/data/termliny';
import { ELEMENT_COLORS } from '@/data/termliny';
import { TokenIcon } from '@/components/ui/TokenIcon';
import { Match3Coach } from './Match3Coach';
import type { Match3TutorialStep } from './Match3Coach';
import { GameStatusBar } from './GameStatusBar';
import type { CSSProperties } from 'react';

interface GameHUDProps {
  levelName: string;
  score: number;
  movesLeft: number;
  currency: number;
  objectives: Objective[];
  onPause: () => void;
  character?: Termlin;
  abilityReady?: boolean;
  onAbility?: () => void;
  highlightAbility?: boolean;
  abilityTutorial?: Extract<Match3TutorialStep, { kind: 'ability' }> | null;
}

export function GameHUD({ levelName, score, movesLeft, currency, objectives, onPause, character, abilityReady, onAbility, highlightAbility, abilityTutorial }: GameHUDProps) {
  return (
    <div className="game-hud game-hud--match3 text-white px-4 pb-3">
      {/* Top row */}
      <div className="game-hud__top">
        <div className="game-hud__side game-hud__side--left">
          <button
            type="button"
            onClick={onPause}
            aria-label="Пауза"
            className="game-icon-button"
          >
            <Pause size={20} />
          </button>
        </div>
        <h3 title={levelName}>{levelName}</h3>
        <div className="game-hud__side game-hud__side--right">
          {character ? (
            abilityReady && onAbility ? (
              <button
                type="button"
                onClick={onAbility}
                aria-label={`Использовать способность персонажа ${character.name}`}
                className={`game-hud__character game-hud__character--ready${highlightAbility ? ' game-hud__character--tutorial' : ''}`}
                style={{ '--character-color': ELEMENT_COLORS[character.element] ?? '#BA9B4F' } as CSSProperties}
              >
                <img src={character.image} alt="" />
                <span aria-hidden="true"><Sparkles size={11} /></span>
              </button>
            ) : (
              <div
                className="game-hud__character"
                style={{ '--character-color': ELEMENT_COLORS[character.element] ?? '#BA9B4F' } as CSSProperties}
                title={character.name}
              >
                <img src={character.image} alt={character.name} />
              </div>
            )
          ) : null}
        </div>
      </div>

      {abilityTutorial && (
        <div className="game-hud__ability-coach">
          <Match3Coach step={abilityTutorial} characterImage={character?.image} />
        </div>
      )}

      <GameStatusBar
        metricLabel="Счёт игры"
        metricValue={score}
        secondaryLabel="Ходы"
        secondaryValue={movesLeft}
        secondaryValueDataAttribute="data-game-moves"
        currency={currency}
      />

      {/* Goals */}
      <div className="game-hud__goals mt-3 space-y-2">
        {objectives.map((obj, i) => {
          const done = obj.current >= obj.target;
          return (
            <div key={i} className="flex items-center gap-2">
              <div
                className="game-hud__goal-icon rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${TOKEN_COLORS[obj.type]}30` }}
              >
                <TokenIcon type={obj.type} className="h-8 w-8" />
              </div>
              <div className="flex-1">
                <ProgressBar
                  current={obj.current}
                  max={obj.target}
                  color={done ? '#5DB879' : TOKEN_COLORS[obj.type]}
                  className="h-2 bg-white/10"
                />
              </div>
              <span className="text-sm tabular-nums font-bold min-w-[48px] text-right text-white/90">
                {Math.min(obj.current, obj.target)}/{obj.target}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
