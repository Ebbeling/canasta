import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { formatDelta } from '@/application/labels/format';
import type { ScoreboardVM, TeamStandingVM } from '@/application/viewmodels/scoreboard';
import { useScoreboard } from '@/hooks/useGameData';
import { useServices } from '@/app/servicesContext';
import { useCommand } from '@/hooks/useCommand';
import { downloadTextFile } from '@/ui/common/files';
import { AppBar } from '@/ui/app/AppBar';
import { GameNav } from '@/ui/app/GameNav';
import { More, Plus } from '@/ui/common/icons';
import { Sheet } from '@/ui/common/Sheet';
import { Suit } from '@/ui/common/Suit';
import { suitFor } from '@/ui/common/suits';
import {
  Badge,
  Block,
  Button,
  Card,
  ErrorPanel,
  IconButton,
  LinkButton,
  LoadingState,
  Note,
  ProgressBar,
  Score,
  SectionLabel,
} from '@/ui/common/primitives';
import { GameNotFound } from './GameNotFound';

/** One team's column in the score card: name, total, who is in it. */
function TeamColumn({
  team,
  index,
  align,
}: {
  team: TeamStandingVM;
  index: number;
  align: 'start' | 'end';
}) {
  const right = align === 'end';

  return (
    <div className={`flex min-w-0 flex-col gap-1 ${right ? 'items-end text-right' : ''}`}>
      <div className="flex max-w-full items-center gap-1.5 text-note font-semibold text-muted">
        {right ? null : <Suit index={index} className="text-body" />}
        <span className="truncate text-ink">{team.name}</span>
        {right ? <Suit index={index} className="text-body" /> : null}
      </div>
      {team.isWinner ? <Badge tone="accent">Gewonnen</Badge> : null}
      <Score className="text-[2.75rem] leading-none">{team.totalText}</Score>
      <p className="max-w-full truncate text-caption text-muted">{team.memberNames.join(' & ')}</p>
    </div>
  );
}

/**
 * The score card — the one thing on this screen that must read from across the
 * table. Both totals sit at the top in the display face, the lead between them,
 * and the two progress bars sit underneath so "how far to the target" never
 * competes with the score itself.
 */
function ScoreCard({ board }: { board: ScoreboardVM }) {
  const [first, second] = board.teams;
  const ranked = [...board.teams].sort((a, b) => b.total - a.total);
  const lead = ranked.length > 1 ? ranked[0]!.total - ranked[1]!.total : 0;
  const leaderIndex = board.teams.findIndex((team) => team.teamId === ranked[0]?.teamId);
  // The opening requirement can differ per team, so it is only folded into one
  // line when every team happens to need the same. The sentences themselves
  // come from the view model and are never reworded here.
  const meldLines = [...new Set(board.teams.map((team) => team.infoLines[1]).filter(Boolean))];

  return (
    <Card className="px-5 pb-5 pt-5.5">
      <div className="grid grid-cols-[1fr_5.25rem_1fr] items-start gap-x-1.5">
        {first ? <TeamColumn team={first} index={0} align="start" /> : null}

        <div className="flex flex-col items-center gap-1 self-center pt-3.5">
          {lead > 0 ? (
            <>
              <span className="text-micro font-semibold uppercase tracking-label text-muted">
                Voor
              </span>
              <Score
                tight={false}
                className="whitespace-nowrap rounded-full bg-accent-soft px-2.5 py-1 text-sm text-accent"
              >
                {suitFor(leaderIndex)} {formatDelta(lead)}
              </Score>
            </>
          ) : (
            <span className="text-micro font-semibold uppercase tracking-label text-muted">
              Gelijk
            </span>
          )}
        </div>

        {second ? <TeamColumn team={second} index={1} align="end" /> : null}
      </div>

      <div className="mt-5.5 flex flex-col gap-2.5">
        {board.teams.map((team, index) => (
          <div key={team.teamId} className="flex items-center gap-2.5">
            <Suit index={index} className="w-3.5 shrink-0 text-center text-note" />
            <div className="min-w-0 flex-1">
              <ProgressBar
                value={team.progress}
                label={`${team.name}: voortgang naar de doelscore`}
                dimmed={!team.isLeader}
              />
            </div>
            <span className="shrink-0 whitespace-nowrap text-right text-caption tabular text-muted">
              {team.infoLines[0]}
            </span>
          </div>
        ))}

        <div className="mt-1 flex flex-col gap-1 border-t border-border pt-3 text-caption text-muted">
          <span>
            Doel <b className="tabular text-ink">{board.targetScoreText}</b>
          </span>
          {meldLines.length === 1 ? <span>{meldLines[0]}</span> : null}
          {meldLines.length > 1
            ? board.teams.map((team, index) =>
                team.infoLines[1] ? (
                  <span key={team.teamId} className="flex items-baseline gap-1.5">
                    <Suit index={index} />
                    {team.infoLines[1]}
                  </span>
                ) : null,
              )
            : null}
        </div>
      </div>
    </Card>
  );
}

/** The result banner, in the accent so a finished game announces itself. */
function WonCard({
  board,
  target,
}: {
  board: Extract<ScoreboardVM['outcome'], { kind: 'won' }>;
  target: string;
}) {
  return (
    <Card className="flex flex-col items-center gap-1.5 bg-accent px-5 pb-5 pt-5.5 text-center text-accent-ink">
      <SectionLabel as="h2" className="text-accent-ink/85">
        Uitslag
      </SectionLabel>
      <p className="font-display text-[1.875rem] font-semibold leading-tight tracking-title">
        {board.tie ? 'Gedeelde winst: ' : 'Gewonnen: '}
        {board.winnerNames.join(' en ')}
      </p>
      <p className="text-sm text-accent-ink/90">
        Beslist na ronde {board.decidedAfterRound} · doel {target} punten
      </p>
    </Card>
  );
}

export function ScoreboardRoute() {
  const { gameId } = useParams();
  const board = useScoreboard(gameId);
  const services = useServices();
  const [menuOpen, setMenuOpen] = useState(false);

  const exportGame = useCommand(async (id: string) => {
    const result = await services.transfer.exportGame(id);
    // The file itself is a browser concern; the service only produced text.
    if (result.ok) downloadTextFile(result.fileName, result.json);
    return result;
  });

  if (board.status === 'loading') return <LoadingState label="Partij laden…" />;
  if (board.status === 'missing') return <GameNotFound />;

  const { data } = board;
  const lastDeltaIndex = data.roundCount - 1;

  return (
    <div className="flex flex-1 flex-col">
      <AppBar
        title={data.gameName ?? data.teams.map((team) => team.name).join(' · ')}
        subtitle={`${data.ruleSetName} · doel ${data.targetScoreText} punten`}
        back="/"
        action={
          <IconButton label="Meer acties" onClick={() => setMenuOpen(true)}>
            <More />
          </IconButton>
        }
      />

      <div className="flex flex-1 flex-col gap-3.5 pt-1">
        {data.outcome.kind === 'won' ? (
          <WonCard board={data.outcome} target={data.targetScoreText} />
        ) : null}

        {data.outcome.kind === 'tieBreakRound' ? (
          <Card className="flex flex-col gap-1.5 bg-warn-soft px-5 py-4">
            <SectionLabel as="h2" className="text-warn">
              Gelijkspel
            </SectionLabel>
            <p className="text-body font-medium">
              {data.outcome.leaderNames.join(' en ')} staan precies gelijk op{' '}
              {data.targetScoreText} punten of meer.
            </p>
            {/* An app choice, presented as one — no source describes an exact tie. */}
            <p className="text-note leading-snug text-muted">{data.outcome.note}</p>
          </Card>
        ) : null}

        <ScoreCard board={data} />

        {data.canAddRound ? (
          <LinkButton to={`/games/${data.gameId}/round`} variant="primary" size="xl" block>
            <Plus />
            Ronde {data.nextRoundNumber} invoeren
          </LinkButton>
        ) : (
          <>
            <Note lead="Afgerond" tone="info">
              Deze partij is afgerond. Corrigeer een ronde in de geschiedenis om verder te spelen.
            </Note>
            <div className="flex gap-2.5">
              <LinkButton to={`/games/${data.gameId}/history`} size="lg" block>
                Naar de geschiedenis
              </LinkButton>
              <LinkButton to="/new" variant="contrast" size="lg" block>
                Nieuwe partij
              </LinkButton>
            </div>
          </>
        )}

        {data.roundCount > 0 ? (
          <Block className="px-4.5 py-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <SectionLabel as="h2">Laatste ronde · {data.roundCount}</SectionLabel>
              <Link
                to={`/games/${data.gameId}/history`}
                className="-my-3 inline-flex min-h-touch items-center text-note font-semibold text-accent"
              >
                Corrigeren
              </Link>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-3">
              {data.teams.map((team, index) => (
                <div
                  key={team.teamId}
                  className={`flex items-baseline gap-2 ${index === 1 ? 'justify-end' : ''}`}
                >
                  {index === 1 ? null : <Suit index={index} className="text-sm" />}
                  <Score className="text-2xl">
                    {formatDelta(team.deltas[lastDeltaIndex] ?? 0)}
                  </Score>
                  {index === 1 ? <Suit index={index} className="text-sm" /> : null}
                </div>
              ))}
            </div>
          </Block>
        ) : null}

        {exportGame.state === 'failed' || (exportGame.result && !exportGame.result.ok) ? (
          <ErrorPanel title="Exporteren is niet gelukt.">
            {exportGame.error?.message ?? 'Deze partij kon niet worden gevonden.'}
          </ErrorPanel>
        ) : null}
      </div>

      <GameNav gameId={data.gameId} />

      <Sheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Deze partij"
        description="Exporteer de partij als één JSON-bestand, inclusief de regelset waarmee hij gespeeld is."
      >
        <div className="mt-4 flex flex-col gap-2">
          <Button
            variant="primary"
            size="lg"
            block
            disabled={exportGame.state === 'running'}
            onClick={() => {
              void exportGame.run(data.gameId);
              setMenuOpen(false);
            }}
          >
            Exporteren
          </Button>
          <Button variant="ghost" size="lg" block onClick={() => setMenuOpen(false)}>
            Annuleren
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
