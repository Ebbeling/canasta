import { useParams } from 'react-router';
import { useGameRules } from '@/hooks/useGameData';
import { AppBar } from '@/ui/app/AppBar';
import { GameNav } from '@/ui/app/GameNav';
import { LoadingState } from '@/ui/common/primitives';
import { RuleSetView } from '@/ui/rules/RuleSetView';
import { GameNotFound } from './GameNotFound';

/**
 * The rules of *this* game, read from its frozen snapshot.
 *
 * Deliberately not the current built-in: a rule set edited after the game began
 * must not change what this screen shows (spec §13, §18). That is also why the
 * screen is read-only — there is nothing here to change.
 */
export function GameRulesRoute() {
  const { gameId } = useParams();
  const rules = useGameRules(gameId);

  if (rules.status === 'loading') return <LoadingState label="Spelregels laden…" />;
  if (rules.status === 'missing') return <GameNotFound />;

  return (
    <div className="flex flex-1 flex-col">
      <AppBar
        title="Spelregels"
        subtitle="Vastgelegd bij de start van deze partij"
        back={`/games/${gameId}`}
      />

      <div className="flex-1 pt-1">
        <RuleSetView description={rules.data} />
      </div>

      <GameNav gameId={gameId ?? ''} />
    </div>
  );
}
