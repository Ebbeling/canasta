import type { ValidationIssue } from '@/domain/result';
import {
  assignSeat,
  teamLayoutsFor,
  teamSizeFor,
  type PartyShape,
} from '@/application/viewmodels/setup';
import { Minus, Plus } from '@/ui/common/icons';
import { Suit } from '@/ui/common/Suit';
import { Block, Note, SectionLabel } from '@/ui/common/primitives';
import { resizeTeamNames, seatsForLayout, type PartyDraft } from './party';

export type { PartyDraft };

/**
 * Who plays, and who plays together.
 *
 * Everything here is expressed in terms the rule set already has: a number of
 * players, a number of teams and a team size. Nothing knows that four players
 * in two teams is "Classic" — that shape is just one the built-in happens to
 * declare.
 *
 * Team sizes are equal by construction. `teams.teamSize` is a single number in
 * the configuration, so only exact divisions are offered; a count that does not
 * divide simply has fewer layouts, and a prime number of players offers only
 * individual play. That is the honest reading of the data model rather than a
 * limitation worked around in the interface.
 */

const TEXT_INPUT =
  'min-h-12 w-full rounded-tile border-[1.5px] border-border bg-surface px-3.5 text-base ' +
  'transition-colors outline-none focus:border-accent focus:bg-panel';

function layoutLabel(shape: PartyShape): string {
  const size = teamSizeFor(shape);
  return shape.mode === 'individual'
    ? 'Ieder voor zich'
    : `${shape.teamCount} teams van ${size}`;
}

export function PartyEditor({
  draft,
  onChange,
  minPlayers,
  maxPlayers,
  issues = [],
}: {
  draft: PartyDraft;
  onChange: (next: PartyDraft) => void;
  minPlayers: number;
  maxPlayers: number;
  issues?: ValidationIssue[];
}) {
  const playerCount = draft.playerNames.length;
  const layouts = teamLayoutsFor(playerCount);
  const currentLayout = layouts.find((layout) => layout.teamCount === draft.teamSeats.length);

  function resize(next: number) {
    if (next < minPlayers || next > maxPlayers) return;

    const playerNames =
      next > playerCount
        ? [...draft.playerNames, ...Array.from({ length: next - playerCount }, () => '')]
        : draft.playerNames.slice(0, next);

    // The old grouping may not divide the new count, so fall back to the
    // largest layout that does — never to something invalid.
    const options = teamLayoutsFor(next);
    const keep = options.find((layout) => layout.teamCount === draft.teamSeats.length);
    const layout = keep ?? options[0];
    if (!layout) return;

    onChange({
      playerNames,
      teamNames: resizeTeamNames(draft.teamNames, layout.teamCount),
      teamSeats: seatsForLayout(next, layout.teamCount),
      mode: layout.mode,
    });
  }

  function chooseLayout(shape: PartyShape) {
    onChange({
      ...draft,
      teamNames: resizeTeamNames(draft.teamNames, shape.teamCount),
      teamSeats: seatsForLayout(playerCount, shape.teamCount),
      mode: shape.mode,
    });
  }

  const stepper =
    'inline-flex size-11 shrink-0 items-center justify-center rounded-tile transition-colors ' +
    'enabled:bg-panel enabled:shadow-soft disabled:text-border';

  /**
   * One player's name field. The same row whether or not it sits in a team.
   *
   * The seat label is measured against the card it lands in rather than the
   * window: in a narrow team column it would crowd out the name field, and the
   * placeholder already says the same thing. It stays in the accessibility tree
   * either way, so the field is always "Speler 3" to a screen reader.
   */
  const seatRow = (seat: number, teamIndex: number) => (
    <div key={seat} className="flex items-center gap-2 border-t border-border py-2.5">
      <label
        htmlFor={`speler-${seat}`}
        className="sr-only shrink-0 text-note text-muted @[17rem]:not-sr-only @[17rem]:w-16"
      >
        Speler {seat + 1}
      </label>
      <input
        id={`speler-${seat}`}
        type="text"
        className={TEXT_INPUT}
        placeholder={`Speler ${seat + 1}`}
        value={draft.playerNames[seat] ?? ''}
        onChange={(event) => {
          const playerNames = [...draft.playerNames];
          playerNames[seat] = event.target.value;
          onChange({ ...draft, playerNames });
        }}
      />
      {draft.teamSeats.length > 1 && draft.mode === 'partnership' ? (
        <select
          aria-label={`Team van speler ${seat + 1}`}
          className="min-h-12 shrink-0 rounded-control border border-border bg-panel2 px-2 text-note font-medium"
          value={teamIndex}
          onChange={(event) =>
            onChange({
              ...draft,
              teamSeats: assignSeat(draft.teamSeats, seat, Number(event.target.value)),
            })
          }
        >
          {draft.teamSeats.map((_seats, index) => (
            <option key={index} value={index}>
              {draft.teamNames[index]?.trim() || `Team ${index + 1}`}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );

  return (
    // Marks the screen as one that benefits from a wider reading column; the
    // shell picks this up so four teams can stand side by side.
    <div data-wide className="flex flex-col gap-3">
      {/*
        Split by the width of this block, not the window. On a phone it is one
        column; in the desktop reading column the count and the grouping sit
        side by side. A viewport breakpoint would get this wrong the moment the
        block is narrower than the window it lives in.
      */}
      <Block className="@container px-4 py-1.5 @[34rem]:grid @[34rem]:grid-cols-2 @[34rem]:gap-x-6 @[34rem]:px-5">
        <SectionLabel className="block pb-1 pt-2.5 @[34rem]:col-span-2">Spelers</SectionLabel>

        <div className="flex min-h-touch items-center justify-between gap-3 border-t border-border py-3">
          <label htmlFor="aantal-spelers" className="text-body font-medium">
            Aantal spelers
          </label>
          <div className="flex shrink-0 items-center gap-0.5 rounded-control bg-panel2 p-0.75">
            <button
              type="button"
              className={stepper}
              disabled={playerCount <= minPlayers}
              aria-label="Eén speler minder"
              onClick={() => resize(playerCount - 1)}
            >
              <Minus size={18} />
            </button>
            <output
              id="aantal-spelers"
              className="w-9 text-center font-display text-[1.375rem] font-semibold tabular"
            >
              {playerCount}
            </output>
            <button
              type="button"
              className={stepper}
              disabled={playerCount >= maxPlayers}
              aria-label="Eén speler meer"
              onClick={() => resize(playerCount + 1)}
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        <div className="border-t border-border py-3">
          <p className="text-body font-medium">Indeling</p>
          <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Teamindeling">
            {layouts.map((layout) => {
              const selected = layout.teamCount === draft.teamSeats.length;
              return (
                <button
                  key={layout.teamCount}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => chooseLayout(layout)}
                  className={`flex min-h-touch items-center rounded-full border px-3.5 text-note transition-colors ${
                    selected
                      ? 'border-accent bg-accent-soft font-semibold text-accent'
                      : 'border-border bg-panel font-medium text-ink'
                  }`}
                >
                  {layoutLabel(layout)}
                </button>
              );
            })}
          </div>
          {layouts.length === 1 ? (
            <p className="mt-2 text-caption text-muted text-pretty">
              {playerCount} spelers is alleen eerlijk te verdelen als ieder voor zich speelt.
            </p>
          ) : null}
        </div>
      </Block>

      {draft.mode === 'individual' ? (
        /*
         * Nobody has a team to belong to, so there is nothing to group. One
         * block with a row per player, in as many columns as the width allows —
         * eight players used to mean eight separate cards, each repeating the
         * same name three times over.
         */
        <Block className="@container px-4 py-1.5 @[34rem]:px-5">
          <SectionLabel className="block pb-1 pt-2.5">Wie spelen er mee?</SectionLabel>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] @[34rem]:gap-x-6">
            {draft.teamSeats.map((seats, teamIndex) => (
              <div key={teamIndex} className="@container flex items-center gap-2">
                <Suit index={teamIndex} className="w-3.5 shrink-0 text-center text-sm" />
                <div className="min-w-0 flex-1">{seats.map((seat) => seatRow(seat, teamIndex))}</div>
              </div>
            ))}
          </div>
        </Block>
      ) : (
        /*
         * Teams side by side as soon as there is room for them. `auto-fit`
         * counts the space rather than the teams, so three teams and four
         * behave the same without either being written down anywhere.
         */
        <div className="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-3">
          {draft.teamSeats.map((seats, teamIndex) => (
            <Block key={teamIndex} className="@container px-4 py-1.5">
              <div className="flex items-center gap-2 border-b border-border py-2.5">
                <Suit index={teamIndex} className="text-sm" />
                <input
                  type="text"
                  aria-label={`Naam van team ${teamIndex + 1}`}
                  className={`${TEXT_INPUT} min-h-11`}
                  placeholder={`Team ${teamIndex + 1}`}
                  value={draft.teamNames[teamIndex] ?? ''}
                  onChange={(event) => {
                    const teamNames = [...draft.teamNames];
                    teamNames[teamIndex] = event.target.value;
                    onChange({ ...draft, teamNames });
                  }}
                />
              </div>
              {seats.map((seat) => seatRow(seat, teamIndex))}
            </Block>
          ))}
        </div>
      )}

      {currentLayout?.mode === 'partnership' ? (
        <p className="px-2 text-center text-caption leading-snug text-muted text-pretty">
          Kies bij een speler een ander team om te ruilen. Lege namen worden &quot;Speler n&quot;.
        </p>
      ) : null}

      {issues.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {issues.map((issue) => (
            <Note
              key={`${issue.code}-${issue.message}`}
              lead={issue.severity === 'error' ? 'Fout' : 'Let op'}
              tone={issue.severity === 'error' ? 'danger' : 'warn'}
            >
              {issue.message}
            </Note>
          ))}
        </div>
      ) : null}
    </div>
  );
}


