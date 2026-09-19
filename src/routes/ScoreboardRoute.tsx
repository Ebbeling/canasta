import { useParams } from 'react-router';
import { useScoreboard } from '@/hooks/useGameData';
import type { ScoreboardVM } from '@/application/viewmodels/scoreboard';
import {
  Button,
  Card,
  ErrorPanel,
  LinkButton,
  LoadingState,
  Muted,
  PageTitle,
  ProgressBar,
  SectionTitle,
} from '@/ui/common/primitives';
import { downloadTextFile } from '@/ui/common/files';
import { useServices } from '@/app/servicesContext';
import { useCommand } from '@/hooks/useCommand';
import { GameNotFound } from './GameNotFound';

function Outcome({ board }: { board: ScoreboardVM }) {
  switch (board.outcome.kind) {
    case 'won':
      return (
        <Card className="border-[--color-accent]">
          <SectionTitle>Uitslag</SectionTitle>
          <p className="mt-1 text-lg font-semibold">
            {board.outcome.tie ? 'Gedeelde winst: ' : 'Gewonnen: '}
            {board.outcome.winnerNames.join(' en ')}
          </p>
          <Muted>
            Beslist na ronde {board.outcome.decidedAfterRound} · doel {board.targetScoreText} punten
          </Muted>
        </Card>
      );

    case 'tieBreakRound':
      return (
        <Card className="border-[--color-warning]">
          <SectionTitle>Gelijkspel</SectionTitle>
          <p className="mt-1 font-medium">
            {board.outcome.leaderNames.join(' en ')} staan precies gelijk op {board.targetScoreText}{' '}
            punten of meer.
          </p>
          {/* An app choice, presented as one — no source describes an exact tie. */}
          <Muted>{board.outcome.note}</Muted>
        </Card>
      );

    default:
      return null;
  }
}

export function ScoreboardRoute() {
  const { gameId } = useParams();
  const board = useScoreboard(gameId);
  const services = useServices();

  const exportGame = useCommand(async (id: string) => {
    const result = await services.transfer.exportGame(id);
    // The file itself is a browser concern; the service only produced text.
    if (result.ok) downloadTextFile(result.fileName, result.json);
    return result;
  });

  if (board.status === 'loading') return <LoadingState label="Partij laden…" />;
  if (board.status === 'missing') return <GameNotFound />;

  const { data } = board;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <PageTitle>{data.gameName ?? data.ruleSetName}</PageTitle>
        <Muted>
          {data.ruleSetName} · doel {data.targetScoreText} punten ·{' '}
          {data.roundCount === 1 ? '1 ronde' : `${data.roundCount} rondes`}
        </Muted>
      </header>

      <Outcome board={data} />

      <section aria-label="Stand" className="space-y-3">
        {data.teams.map((team) => (
          <Card key={team.teamId}>
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {team.name}
                  {team.isWinner ? (
                    <span className="ml-2 rounded-full bg-[--color-accent] px-2 py-0.5 text-xs text-[--color-accent-ink]">
                      Gewonnen
                    </span>
                  ) : null}
                </p>
                <p className="truncate text-sm text-[--color-ink-muted]">
                  {team.memberNames.join(' & ')}
                </p>
              </div>
              <p className="shrink-0 text-2xl font-semibold tabular">{team.totalText}</p>
            </div>

            <div className="mt-3 space-y-1">
              <ProgressBar
                value={team.progress}
                label={`${team.name}: voortgang naar de doelscore`}
              />
              {team.infoLines.map((line) => (
                <p key={line} className="text-xs text-[--color-ink-muted]">
                  {line}
                </p>
              ))}
            </div>
          </Card>
        ))}
      </section>

      <div className="flex flex-wrap gap-2">
        {data.canAddRound ? (
          <LinkButton to={`/games/${data.gameId}/round`} variant="primary">
            Ronde invoeren
          </LinkButton>
        ) : (
          <Muted>Deze partij is afgerond. Corrigeer een ronde om verder te spelen.</Muted>
        )}
        <LinkButton to={`/games/${data.gameId}/history`}>Geschiedenis</LinkButton>
        <LinkButton to={`/games/${data.gameId}/rules`}>Spelregels</LinkButton>
        <Button
          disabled={exportGame.state === 'running'}
          onClick={() => void exportGame.run(data.gameId)}
        >
          Exporteren
        </Button>
      </div>

      {exportGame.state === 'failed' || (exportGame.result && !exportGame.result.ok) ? (
        <ErrorPanel title="Exporteren is niet gelukt.">
          {exportGame.error?.message ?? 'Deze partij kon niet worden gevonden.'}
        </ErrorPanel>
      ) : null}
    </div>
  );
}
