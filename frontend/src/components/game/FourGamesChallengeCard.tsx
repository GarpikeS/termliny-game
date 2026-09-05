import { Check, ChevronUp, Gift, Trophy, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { GameRewardSource } from '@/types/game';

interface ChallengeGoal {
  source: GameRewardSource;
  title: string;
  instruction: string;
  path: string;
  cta: string;
}

const CHALLENGE_GOALS: readonly ChallengeGoal[] = [
  {
    source: 'game2048',
    title: 'Славич',
    instruction: 'собери 2048',
    path: '/games/2048',
    cta: 'Начать со Славича',
  },
  {
    source: 'bubbles',
    title: 'Бирюльки',
    instruction: 'пройди уровень',
    path: '/games/bubbles',
    cta: 'Дальше: Бирюльки',
  },
  {
    source: 'pet',
    title: 'Пестун',
    instruction: 'заверши занятие',
    path: '/games/pet',
    cta: 'Дальше: Пестун',
  },
  {
    source: 'match3',
    title: 'Хоровод',
    instruction: 'пройди уровень',
    path: '/games/match3',
    cta: 'Дальше: Хоровод',
  },
];

interface FourGamesChallengeCardProps {
  completedGames: readonly GameRewardSource[];
  count: number;
  complete: boolean;
  expanded: boolean;
  attention?: boolean;
  onExpand: () => void;
  onDismiss: () => void;
  onAction: (path: string) => void;
}

export function FourGamesChallengeCard({
  completedGames,
  count,
  complete,
  expanded,
  attention = false,
  onExpand,
  onDismiss,
  onAction,
}: FourGamesChallengeCardProps) {
  const completedSet = new Set(completedGames);
  const nextGoal = CHALLENGE_GOALS.find(goal => !completedSet.has(goal.source));

  if (!expanded) {
    return (
      <button
        type="button"
        className="four-game-challenge four-game-challenge--compact"
        data-four-game-challenge
        data-four-game-challenge-state="compact"
        onClick={onExpand}
        aria-label={`${complete ? 'Получить бесплатный час' : 'Открыть задание на бесплатный час'}. Пройдено ${count} из 4 игр`}
      >
        <Gift size={20} aria-hidden="true" />
        <span>Бесплатный час</span>
        <strong data-four-game-progress>{count}/4</strong>
        <ChevronUp size={18} aria-hidden="true" />
      </button>
    );
  }

  const title = complete ? 'Бесплатный час разблокирован' : 'Выиграй бесплатный час в Термбурге';
  const description = complete
    ? 'Все четыре этапа пройдены. Оформи награду и получи код для кассы.'
    : 'Пройди первый этап в каждой из четырёх игр. Можно не подряд — прогресс сохранится.';
  const actionPath = complete ? '/shop/free-hour?campaign=four-games-v1' : (nextGoal?.path ?? '/games/2048');
  const actionLabel = complete ? 'Получить бесплатный час' : (nextGoal?.cta ?? 'Начать играть');

  return (
    <aside
      className={`four-game-challenge four-game-challenge--expanded${attention ? ' four-game-challenge--attention' : ''}${complete ? ' four-game-challenge--complete' : ''}`}
      data-four-game-challenge
      data-four-game-challenge-state={complete ? 'complete' : 'intro'}
      aria-labelledby="four-game-challenge-title"
      aria-describedby="four-game-challenge-description"
    >
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {complete
          ? 'Задание выполнено. Бесплатный час разблокирован.'
          : `Новое задание на бесплатный час. Пройдено ${count} из 4 игр.`}
      </p>

      <header className="four-game-challenge__header">
        <span className="four-game-challenge__hero-icon" aria-hidden="true">
          {complete ? <Trophy size={25} /> : <Gift size={25} />}
        </span>
        <div>
          <span className="four-game-challenge__eyebrow">Задание Термбурга</span>
          <h2 id="four-game-challenge-title">{title}</h2>
        </div>
        <button
          type="button"
          className="four-game-challenge__dismiss"
          data-four-game-dismiss
          onClick={onDismiss}
          aria-label="Свернуть задание"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </header>

      <p id="four-game-challenge-description" className="four-game-challenge__description">
        {description}
      </p>

      <div className="four-game-challenge__progress-copy">
        <span>Пройдено игр</span>
        <strong data-four-game-progress>{count} из 4</strong>
      </div>
      <div
        className="four-game-challenge__progress-track"
        role="progressbar"
        aria-label="Прогресс задания"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={count}
      >
        <span style={{ width: `${Math.min(100, (count / 4) * 100)}%` }} />
      </div>

      <ul className="four-game-challenge__goals" aria-label="Этапы задания">
        {CHALLENGE_GOALS.map((goal, index) => {
          const done = completedSet.has(goal.source);
          return (
            <li key={goal.source} className={done ? 'is-complete' : undefined}>
              <span className="four-game-challenge__goal-marker" aria-hidden="true">
                {done ? <Check size={15} strokeWidth={3} /> : index + 1}
              </span>
              <span className="four-game-challenge__goal-copy">
                <strong>{goal.title}</strong>
                <span>{goal.instruction}</span>
              </span>
              <span className="sr-only">{done ? 'выполнено' : 'ещё не выполнено'}</span>
            </li>
          );
        })}
      </ul>

      <Button
        type="button"
        className="four-game-challenge__action w-full"
        data-four-game-start
        onClick={() => onAction(actionPath)}
      >
        {actionLabel}
      </Button>
    </aside>
  );
}
