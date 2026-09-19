import { useParams } from 'react-router';
import { useGameRules } from '@/hooks/useGameData';
import { Card, LinkButton, LoadingState, Muted, PageTitle } from '@/ui/common/primitives';
import { RuleSetView } from '@/ui/rules/RuleSetView';
import { GameNotFound } from './GameNotFound';

/**
 * The rules of *this* game, read from its frozen snapshot.
 *
 * Deliberately not the current built-in: a rule set edited after the game began
 * must not change what this screen shows (spec §13, §18).
 */
export function GameRulesRoute() {
  const { gameId } = useParams();
  const rules = useGameRules(gameId);

  if (rules.status === 'loading') return <LoadingState label="Spelregels laden…" />;
  if (rules.status === 'missing') return <GameNotFound />;

  return (
    <div className="space-y-4">
      <PageTitle>Spelregels</PageTitle>
      <Card>
        <Muted>
          Dit zijn de regels waarmee deze partij is gestart. Ze veranderen niet meer, ook niet als
          de regelset later wordt aangepast.
        </Muted>
      </Card>

      <RuleSetView description={rules.data} />

      <LinkButton to={`/games/${gameId}`}>Terug naar het scorebord</LinkButton>
    </div>
  );
}
