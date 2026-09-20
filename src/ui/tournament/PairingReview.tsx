import { useState } from 'react';
import type {
  PairingProposalVM,
  PairingTableVM,
} from '@/application/viewmodels/tournamentView';
import { buildPairingView, toProposedMatches } from '@/application/viewmodels/tournamentView';
import { useCommand } from '@/hooks/useCommand';
import { useServices } from '@/app/servicesContext';
import { PageBody } from '@/ui/app/Page';
import { Check } from '@/ui/common/icons';
import {
  Block,
  Button,
  ErrorPanel,
  Note,
  Score,
  SectionLabel,
  StickyActions,
} from '@/ui/common/primitives';

/**
 * The proposed tables for the next round, before they are fixed.
 *
 * Nothing is stored until the organiser confirms. When the tournament allows
 * it, two participants can be swapped by hand first — and the result is
 * validated by the same rules the engine obeys, so an arrangement that seats
 * somebody twice can never be confirmed.
 */
export function PairingReview({
  tournamentId,
  proposal,
  onProposalChange,
  onCancel,
  onConfirmed,
  title,
  manualAllowed = true,
}: {
  tournamentId: string;
  proposal: PairingProposalVM;
  onProposalChange: (proposal: PairingProposalVM) => void;
  onCancel: () => void;
  onConfirmed: () => void;
  title: string;
  manualAllowed?: boolean;
}) {
  const services = useServices();
  const [picked, setPicked] = useState<{ table: number; index: number } | undefined>();
  /** Counts the presses on "opnieuw indelen", so each one asks something new. */
  const [attempt, setAttempt] = useState(0);

  const confirm = useCommand(async () =>
    services.tournaments.confirmRound(tournamentId, toProposedMatches(proposal.tables)),
  );
  const regenerate = useCommand(async () => {
    const next = attempt + 1;
    setAttempt(next);

    const tournament = await services.tournaments.get(tournamentId);
    const outcome = await services.tournaments.propose(tournamentId, undefined, next);
    if (!outcome.ok || !tournament) return outcome;
    onProposalChange(buildPairingView({ participants: tournament.participants, teamsPerMatch: tournament.gameSettings.teamsPerMatch }, outcome.proposal));
    return outcome;
  });

  const [issues, setIssues] = useState<string[]>([]);

  /** Swaps two seats and re-checks the whole arrangement. */
  async function swap(table: number, index: number) {
    if (!manualAllowed) return;

    if (!picked) {
      setPicked({ table, index });
      return;
    }
    if (picked.table === table && picked.index === index) {
      setPicked(undefined);
      return;
    }

    const tables: PairingTableVM[] = proposal.tables.map((entry) => ({
      ...entry,
      participantIds: [...entry.participantIds],
    }));

    const from = tables.find((entry) => entry.tableNumber === picked.table);
    const to = tables.find((entry) => entry.tableNumber === table);
    if (!from || !to) return;

    const one = from.participantIds[picked.index];
    const other = to.participantIds[index];
    if (one === undefined || other === undefined) return;

    from.participantIds[picked.index] = other;
    to.participantIds[index] = one;

    setPicked(undefined);

    const tournament = await services.tournaments.get(tournamentId);
    const found = await services.tournaments.validate(tournamentId, toProposedMatches(tables));
    setIssues(found.filter((issue) => issue.severity === 'error').map((issue) => issue.message));

    if (tournament) {
      // Rebuild the side lines from the swapped seats, so the names move too.
      onProposalChange({
        ...buildPairingView({ participants: tournament.participants, teamsPerMatch: tournament.gameSettings.teamsPerMatch }, {
          matches: toProposedMatches(tables),
          cost: 0,
          repeatedPartners: proposal.repeatedPartners,
          repeatedOpponents: proposal.repeatedOpponents,
          issues: [],
        }),
        notes: proposal.notes,
        qualityLine: proposal.qualityLine,
      });
    }
  }

  const blocked = issues.length > 0;

  return (
    <>
      <PageBody width="wide">
        <div className="flex flex-1 flex-col gap-3.5 pt-3">
          <div>
            <SectionLabel as="div">Indeling</SectionLabel>
            <h1 className="mt-0.5 font-display text-[1.75rem] font-semibold leading-tight tracking-title">
              {title}
            </h1>
            <p className="mt-1 text-caption text-muted">
              {proposal.summary} · {proposal.qualityLine}
            </p>
          </div>

          {proposal.notes.map((note) => (
            <Note key={note} lead="Let op" tone="warn">
              {note}
            </Note>
          ))}

          {blocked ? (
            <ErrorPanel title="Deze indeling kan zo niet.">
              <ul className="list-disc pl-5">
                {issues.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            </ErrorPanel>
          ) : null}

          {confirm.result && !confirm.result.ok && confirm.result.reason === 'validation' ? (
            <ErrorPanel title="De ronde kon niet worden vastgezet.">
              <ul className="list-disc pl-5">
                {confirm.result.issues.map((issue) => (
                  <li key={issue.code}>{issue.message}</li>
                ))}
              </ul>
            </ErrorPanel>
          ) : null}

          <div className="grid grid-cols-[repeat(auto-fit,minmax(17rem,1fr))] items-start gap-2.5">
            {proposal.tables.map((table) => (
              <Block key={table.tableNumber} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
                  <SectionLabel as="h2">{table.title}</SectionLabel>
                  {table.isBye ? (
                    <span className="text-caption text-muted">Deze ronde vrij</span>
                  ) : null}
                </div>

                {table.participantIds.map((participantId, index) => {
                  const chosen = picked?.table === table.tableNumber && picked.index === index;

                  return (
                    <button
                      key={participantId}
                      type="button"
                      disabled={!manualAllowed || table.isBye}
                      aria-pressed={chosen}
                      onClick={() => void swap(table.tableNumber, index)}
                      className={`flex min-h-11 w-full items-center gap-2.5 border-t border-border text-left text-sm first:border-t-0 disabled:cursor-default ${
                        chosen ? 'font-semibold text-accent' : ''
                      }`}
                    >
                      <Score tight={false} className="w-5 shrink-0 text-note text-muted">
                        {index + 1}
                      </Score>
                      <span className="min-w-0 flex-1 truncate">{table.seatNames[index]}</span>
                      {manualAllowed && !table.isBye ? (
                        <span className="shrink-0 text-meta text-muted">
                          {chosen ? 'Kies een tweede' : 'Ruilen'}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </Block>
            ))}
          </div>
        </div>
      </PageBody>

      <StickyActions>
        <Button variant="ghost" size="md" onClick={onCancel}>
          Annuleren
        </Button>
        <Button
          size="md"
          disabled={regenerate.state === 'running'}
          onClick={() => void regenerate.run(undefined)}
        >
          Opnieuw indelen
        </Button>
        <Button
          variant="primary"
          size="lg"
          block
          className="md:w-auto md:px-7"
          disabled={blocked || confirm.state === 'running'}
          onClick={async () => {
            const outcome = await confirm.run(undefined);
            if (outcome?.ok) onConfirmed();
          }}
        >
          <Check size={18} />
          Indeling vastzetten
        </Button>
      </StickyActions>
    </>
  );
}
