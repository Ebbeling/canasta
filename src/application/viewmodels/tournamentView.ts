import type { GameId } from '@/domain/ids';
import type { Game } from '@/domain/game';
import {
  currentDay,
  currentRound,
  roundsOfDay,
  tieIsUndecided,
  type ParticipantId,
  type Tournament,
  type TournamentMatch,
  type TournamentRound,
  type TournamentStatus,
} from '@/domain/tournament';
import type { PairingProposal, ProposedMatch } from '@/tournament/pairing';
import { participantSides, type TournamentStandings } from '@/tournament/standings';
import { formatDate, formatPoints } from '@/application/labels/format';
import type { TournamentSummary } from '@/application/ports';
import type { LoadedTournament } from '@/application/services/tournamentService';
import { roundIsResolved, roundsRemaining } from '@/application/services/tournamentService';

/**
 * Everything a tournament screen renders, already in words.
 *
 * The interface is handed sentences, statuses and counts. It never reads a
 * setting, never compares a score and never works out whether a round is
 * finished — those are readings of the tournament, and they are taken here.
 */

/** The four states the design uses everywhere, always with a word beside them. */
export type TournamentProgress = 'waiting' | 'busy' | 'done' | 'attention';

export interface StatusVM {
  kind: TournamentProgress;
  label: string;
}

const STATUS: Record<TournamentProgress, string> = {
  waiting: 'Nog niet gestart',
  busy: 'Bezig',
  done: 'Klaar',
  attention: 'Aandacht',
};

function status(kind: TournamentProgress, label?: string): StatusVM {
  return { kind, label: label ?? STATUS[kind] };
}

/* --------------------------------------------------------------- the list */

export interface TournamentRowVM {
  id: string;
  name: string;
  status: StatusVM;
  /** "16 deelnemers · Classic Canasta · 6 rondes" */
  metaLine: string;
  dateLine: string;
}

const TOURNAMENT_STATUS: Record<TournamentStatus, StatusVM> = {
  upcoming: { kind: 'waiting', label: 'Aankomend' },
  active: { kind: 'busy', label: 'Bezig' },
  finished: { kind: 'done', label: 'Afgerond' },
};

export function buildTournamentRow(summary: TournamentSummary): TournamentRowVM {
  const parts = [
    `${summary.participantCount} ${summary.participantCount === 1 ? 'deelnemer' : 'deelnemers'}`,
    summary.ruleSetName,
  ];
  if (summary.roundCount > 0) {
    parts.push(`${summary.roundCount} ${summary.roundCount === 1 ? 'ronde' : 'rondes'}`);
  }

  return {
    id: summary.id,
    name: summary.name,
    status: TOURNAMENT_STATUS[summary.status],
    metaLine: parts.join(' · '),
    dateLine: formatDate(summary.finishedAt ?? summary.startedAt ?? summary.createdAt),
  };
}

/* -------------------------------------------------------------- one table */

export interface TournamentMatchVM {
  id: string;
  tableNumber: number;
  /** "Tafel 3" or "Vrije ronde". */
  title: string;
  isBye: boolean;
  status: StatusVM;
  /** Who sits there, already grouped into sides: ["Anna & Bram", "Cees & Dana"]. */
  sideLines: string[];
  /** One line naming everybody, for a narrow row. */
  participantLine: string;
  gameId?: GameId;
  /** "Open partij", "Verder spelen", "Uitslag" — what the button should say. */
  actionLabel: string;
  /** Present when the game is finished: "Anna & Bram · 2.450". */
  resultLines: string[];
  /** Set when the table points at a game that is no longer there. */
  missingGame: boolean;
  /**
   * Set when the game ended level and this tournament recognises no draw.
   *
   * The table is finished but has produced no tournament result; it has to be
   * played again before the round can be closed.
   */
  needsDecision: boolean;
}

export interface TournamentRoundVM {
  id: string;
  sequence: number;
  /** "Ronde 3" */
  title: string;
  /** "Dag 1 · 4 tafels" */
  subtitle: string;
  dayId: string;
  status: StatusVM;
  matches: TournamentMatchVM[];
  /** True when every table has a finished game and the round may be closed. */
  canComplete: boolean;
  /** "2 bezig · 1 klaar · 1 nog niet gestart" */
  tableSummary: string;
  counts: { waiting: number; busy: number; done: number; undecided: number };
}

function nameOf(tournament: Tournament, id: ParticipantId): string {
  return tournament.participants.find((participant) => participant.id === id)?.name ?? '—';
}

/** What a table is doing, or what it is waiting for. */
function matchStatus(
  tournament: Tournament,
  match: TournamentMatch,
  games: Map<GameId, Game>,
): { kind: TournamentProgress; missingGame: boolean; needsDecision: boolean } {
  const plain = (kind: TournamentProgress) => ({
    kind,
    missingGame: false,
    needsDecision: false,
  });

  if (match.kind === 'bye') return plain('done');
  if (!match.gameId) return plain('waiting');

  const game = games.get(match.gameId);
  if (!game) return { kind: 'attention', missingGame: true, needsDecision: false };
  if (game.status !== 'finished') return plain('busy');

  if (tieIsUndecided(tournament.settings, game.result?.tie ?? false)) {
    return { kind: 'attention', missingGame: false, needsDecision: true };
  }

  return plain('done');
}

export function buildMatch(
  tournament: Tournament,
  match: TournamentMatch,
  games: Map<GameId, Game>,
): TournamentMatchVM {
  const sides = participantSides(match.participantIds, tournament.gameSettings.teamsPerMatch);
  const sideLines = sides
    .filter((side) => side.length > 0)
    .map((side) => side.map((id) => nameOf(tournament, id)).join(' & '));

  const { kind, missingGame, needsDecision } = matchStatus(tournament, match, games);
  const game = match.gameId ? games.get(match.gameId) : undefined;

  const resultLines: string[] = [];
  if (game?.status === 'finished' && game.summary) {
    const ordered = [...game.teams].sort((a, b) => a.order - b.order);
    for (const team of ordered) {
      resultLines.push(`${team.name} · ${formatPoints(game.summary.totalsByTeam[team.id] ?? 0)}`);
    }
  }

  return {
    id: match.id,
    tableNumber: match.tableNumber,
    title: match.kind === 'bye' ? 'Vrije ronde' : `Tafel ${match.tableNumber}`,
    isBye: match.kind === 'bye',
    status:
      match.kind === 'bye'
        ? status('done', 'Vrij')
        : needsDecision
          ? status('attention', 'Gelijk · onbeslist')
          : missingGame
            ? status('attention', 'Partij ontbreekt')
            : status(kind),
    sideLines,
    participantLine: match.participantIds.map((id) => nameOf(tournament, id)).join(' · '),
    gameId: match.gameId,
    actionLabel:
      match.kind === 'bye'
        ? 'Deze ronde vrij'
        : needsDecision
          ? 'Tafel opnieuw spelen'
          : kind === 'waiting'
            ? 'Partij starten'
            : kind === 'busy'
              ? 'Open partij'
              : missingGame
                ? 'Opnieuw starten'
                : 'Uitslag',
    resultLines,
    missingGame,
    needsDecision,
  };
}

export function buildRound(
  tournament: Tournament,
  round: TournamentRound,
  games: Map<GameId, Game>,
): TournamentRoundVM {
  const matches = round.matches.map((match) => buildMatch(tournament, match, games));
  const playable = matches.filter((match) => !match.isBye);

  const counts = {
    waiting: playable.filter((match) => match.status.kind === 'waiting').length,
    busy: playable.filter((match) => match.status.kind === 'busy').length,
    done: playable.filter((match) => match.status.kind === 'done').length,
    undecided: playable.filter((match) => match.needsDecision).length,
  };

  const day = tournament.days.find((entry) => entry.id === round.dayId);
  const parts: string[] = [];
  if (counts.busy > 0) parts.push(`${counts.busy} bezig`);
  if (counts.done > 0) parts.push(`${counts.done} klaar`);
  if (counts.waiting > 0) parts.push(`${counts.waiting} nog niet gestart`);
  if (counts.undecided > 0) parts.push(`${counts.undecided} gelijk geëindigd`);

  return {
    id: round.id,
    sequence: round.sequence,
    title: `Ronde ${round.sequence}`,
    subtitle: [
      day ? `Dag ${day.sequence}` : undefined,
      `${playable.length} ${playable.length === 1 ? 'tafel' : 'tafels'}`,
    ]
      .filter(Boolean)
      .join(' · '),
    dayId: round.dayId,
    status:
      round.status === 'completed'
        ? status('done', 'Afgerond')
        : round.status === 'confirmed'
          ? status('busy')
          : status('waiting'),
    matches,
    canComplete:
      round.status === 'confirmed' && roundIsResolved(round, games, tournament.settings),
    tableSummary: parts.join(' · ') || 'Nog geen tafels',
    counts,
  };
}

/* ---------------------------------------------------------- the dashboard */

/** What the organiser is expected to do next. */
export type NextActionKind =
  | 'addParticipants'
  | 'planRound'
  | 'playRound'
  | 'completeRound'
  | 'decideAfterRound'
  | 'finished';

export interface TournamentDashboardVM {
  id: string;
  name: string;
  status: StatusVM;
  /** "Dag 1 · Ronde 3 van 6" — the line under the title. */
  subtitle: string;
  /** "Dag 1 van 2 · 16 deelnemers · 4 tafels" — the rail's context line. */
  contextLine: string;
  modeLabel: string;
  scoringLabel: string;
  /** How far along the planned rounds are; empty for an open tournament. */
  progress: { completed: number; total: number } | undefined;
  round: TournamentRoundVM | undefined;
  /** Anything the organiser should look at, already worded. */
  attention: string[];
  nextAction: { kind: NextActionKind; label: string; hint: string; enabled: boolean };
  /** False between two speeldagen: there is no day left to end. */
  canEndDay: boolean;
  /** The first three of the standings, for the dashboard card. */
  top: StandingRowVM[];
  participantCount: number;
  dayCount: number;
  roundCount: number;
  finishedGames: number;
}

export interface StandingRowVM {
  participantId: ParticipantId;
  rank: number;
  rankText: string;
  name: string;
  memberLine: string;
  /** The figure the standings are ordered by, formatted. */
  pointsText: string;
  canastaScoreText: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  byes: number;
  missed: number;
  /** "3 gespeeld · 2 gewonnen" */
  recordLine: string;
  withdrawn: boolean;
}

export interface TournamentStandingsVM {
  title: string;
  subtitle: string;
  /** Which figure the table is ordered by. */
  pointsHeader: string;
  /** Why it is ordered that way, in a sentence. */
  explanation: string;
  rows: StandingRowVM[];
  provisional: boolean;
  /** Set when a finished game ended level and the tournament has no draws. */
  unresolvedNote?: string;
}

function standingRows(
  tournament: Tournament,
  standings: TournamentStandings,
): StandingRowVM[] {
  const byId = new Map(tournament.participants.map((participant) => [participant.id, participant]));

  return standings.entries.map((entry) => {
    const participant = byId.get(entry.participantId);
    const record: string[] = [
      `${entry.matchesPlayed} ${entry.matchesPlayed === 1 ? 'partij' : 'partijen'}`,
    ];
    if (entry.wins > 0) record.push(`${entry.wins} gewonnen`);
    if (entry.draws > 0) record.push(`${entry.draws} gelijk`);
    if (entry.byes > 0) record.push(`${entry.byes} vrij`);
    if (entry.missed > 0) record.push(`${entry.missed} gemist`);

    return {
      participantId: entry.participantId,
      rank: entry.rank,
      rankText: String(entry.rank),
      name: participant?.name ?? '—',
      memberLine: participant?.kind === 'team' ? participant.memberNames.join(' & ') : '',
      pointsText: formatPoints(entry.points),
      canastaScoreText: formatPoints(entry.canastaScore),
      played: entry.matchesPlayed,
      wins: entry.wins,
      draws: entry.draws,
      losses: entry.losses,
      byes: entry.byes,
      missed: entry.missed,
      recordLine: record.join(' · '),
      withdrawn: participant?.status === 'withdrawn',
    };
  });
}

const MODE_LABEL = {
  fixed: 'Vast schema',
  open: 'Open toernooi',
} as const;

const SCORING_LABEL = {
  'canasta-score': 'Canasta-score',
  'tournament-points': 'Toernooipunten',
} as const;

export function buildStandingsView(loaded: LoadedTournament): TournamentStandingsVM {
  const { tournament, standings } = loaded;
  const points = tournament.settings.scoringMode === 'tournament-points';

  return {
    title: 'Stand',
    subtitle: [
      standings.rounds === 0
        ? 'Nog geen ronde gespeeld'
        : `Na ronde ${standings.rounds}`,
      `${tournament.participants.length} ${tournament.participants.length === 1 ? 'deelnemer' : 'deelnemers'}`,
    ].join(' · '),
    pointsHeader: points ? 'Punten' : 'Score',
    explanation: points
      ? 'Winst levert 2 punten op, gelijkspel 1 en verlies 0. Elke ronde telt even zwaar.'
      : 'De stand is de som van de Canasta-scores uit de afgeronde partijen.',
    rows: standingRows(tournament, standings),
    provisional: standings.provisional,
    unresolvedNote:
      standings.unresolvedTies.length > 0
        ? `${standings.unresolvedTies.length === 1 ? 'Eén tafel eindigde' : `${standings.unresolvedTies.length} tafels eindigden`} gelijk, terwijl dit toernooi geen gelijkspel kent. Zo'n partij levert hier niets op — geen winst, geen gelijkspel, geen verlies — tot de tafel opnieuw is gespeeld. De partij zelf blijft ongewijzigd onder Partijen staan.`
        : undefined,
  };
}

export function buildDashboard(loaded: LoadedTournament): TournamentDashboardVM {
  const { tournament, games, standings } = loaded;
  const round = currentRound(tournament);
  const day = currentDay(tournament);
  const roundVM = round ? buildRound(tournament, round, games) : undefined;

  const completed = tournament.rounds.filter((entry) => entry.status === 'completed').length;
  const remaining = roundsRemaining(tournament);
  const planned =
    tournament.settings.mode === 'fixed' &&
    tournament.settings.plannedDays &&
    tournament.settings.plannedRoundsPerDay
      ? tournament.settings.plannedDays * tournament.settings.plannedRoundsPerDay
      : undefined;

  const attention: string[] = [];
  if (roundVM) {
    for (const match of roundVM.matches) {
      if (match.missingGame) {
        attention.push(`De partij van tafel ${match.tableNumber} is niet meer te vinden.`);
      }
    }
    if (roundVM.status.kind === 'busy' && roundVM.counts.waiting > 0 && roundVM.counts.busy > 0) {
      attention.push(
        `${roundVM.counts.waiting === 1 ? 'Eén tafel is' : `${roundVM.counts.waiting} tafels zijn`} nog niet gestart terwijl ronde ${roundVM.sequence} loopt.`,
      );
    }
  }
  if (standings.unresolvedTies.length > 0) {
    const count = standings.unresolvedTies.length;
    attention.push(
      `${count === 1 ? 'Eén tafel eindigde' : `${count} tafels eindigden`} gelijk terwijl dit toernooi geen gelijkspel kent. Speel ${count === 1 ? 'die tafel' : 'die tafels'} opnieuw om de ronde te kunnen afsluiten.`,
    );
  }

  const active = tournament.participants.filter((entry) => entry.status === 'active').length;
  const nextAction = buildNextAction(tournament, roundVM, active, remaining);

  const subtitleParts: string[] = [];
  if (day) subtitleParts.push(`Dag ${day.sequence}${planned && tournament.settings.plannedDays ? ` van ${tournament.settings.plannedDays}` : ''}`);
  if (roundVM) {
    subtitleParts.push(`Ronde ${roundVM.sequence}${planned ? ` van ${planned}` : ''}`);
  }

  return {
    id: tournament.id,
    name: tournament.name,
    status: TOURNAMENT_STATUS[tournament.status],
    subtitle: subtitleParts.join(' · ') || 'Nog niet begonnen',
    contextLine: [
      day ? `Dag ${day.sequence}` : undefined,
      roundVM ? `Ronde ${roundVM.sequence}` : undefined,
      `${active} ${active === 1 ? 'deelnemer' : 'deelnemers'}`,
      roundVM ? `${roundVM.matches.filter((match) => !match.isBye).length} tafels` : undefined,
    ]
      .filter(Boolean)
      .join(' · '),
    modeLabel: MODE_LABEL[tournament.settings.mode],
    scoringLabel: SCORING_LABEL[tournament.settings.scoringMode],
    progress: planned ? { completed, total: planned } : undefined,
    round: roundVM,
    attention,
    canEndDay: tournament.days.some((entry) => entry.status === 'active'),
    nextAction,
    top: standingRows(tournament, standings).slice(0, 3),
    participantCount: tournament.participants.length,
    dayCount: tournament.days.length,
    roundCount: tournament.rounds.length,
    finishedGames: [...games.values()].filter((game) => game.status === 'finished').length,
  };
}

function buildNextAction(
  tournament: Tournament,
  round: TournamentRoundVM | undefined,
  activeCount: number,
  remaining: number | undefined,
): TournamentDashboardVM['nextAction'] {
  if (tournament.status === 'finished') {
    return {
      kind: 'finished',
      label: 'Toernooi afgerond',
      hint: 'De eindstand staat vast.',
      enabled: false,
    };
  }

  if (activeCount < tournament.gameSettings.participantsPerMatch) {
    return {
      kind: 'addParticipants',
      label: 'Deelnemers toevoegen',
      hint: `Er zijn minstens ${tournament.gameSettings.participantsPerMatch} deelnemers nodig voor één tafel.`,
      enabled: true,
    };
  }

  if (!round || round.status.kind === 'done') {
    if (remaining === 0) {
      return {
        kind: 'decideAfterRound',
        label: 'Toernooi afronden',
        hint: 'Alle geplande rondes zijn gespeeld.',
        enabled: true,
      };
    }
    return {
      kind: 'planRound',
      label: `Ronde ${tournament.rounds.length + 1} indelen`,
      hint:
        remaining === undefined
          ? 'Nog een ronde, de speeldag beëindigen of het toernooi afronden.'
          : `Nog ${remaining} ${remaining === 1 ? 'ronde' : 'rondes'} gepland.`,
      enabled: true,
    };
  }

  if (round.canComplete) {
    return {
      kind: 'completeRound',
      label: `Ronde ${round.sequence} afsluiten`,
      hint: 'Elke tafel is klaar.',
      enabled: true,
    };
  }

  const tables =
    round.counts.done + round.counts.busy + round.counts.waiting + round.counts.undecided;

  return {
    kind: 'playRound',
    label: `Ronde ${round.sequence} afsluiten`,
    // An undecided table is the more specific obstacle, so it is named instead
    // of being hidden inside a count that would say every table was finished.
    hint:
      round.counts.undecided > 0
        ? `${round.counts.undecided === 1 ? 'Eén tafel eindigde' : `${round.counts.undecided} tafels eindigden`} gelijk. Speel ${round.counts.undecided === 1 ? 'die tafel' : 'die tafels'} opnieuw.`
        : `Kan als alle tafels klaar zijn (${round.counts.done} van ${tables}).`,
    enabled: false,
  };
}

/* ------------------------------------------------------------ other views */

export interface TournamentDayVM {
  id: string;
  title: string;
  subtitle: string;
  status: StatusVM;
  rounds: TournamentRoundVM[];
}

export function buildDays(loaded: LoadedTournament): TournamentDayVM[] {
  const { tournament, games } = loaded;

  return tournament.days.map((day) => {
    const rounds = roundsOfDay(tournament, day.id).map((round) =>
      buildRound(tournament, round, games),
    );

    return {
      id: day.id,
      title: `Dag ${day.sequence}`,
      subtitle: [
        day.date ? formatDate(day.date) : 'Nog niet begonnen',
        `${rounds.length} ${rounds.length === 1 ? 'ronde' : 'rondes'}`,
      ].join(' · '),
      status:
        day.status === 'finished'
          ? status('done', 'Afgerond')
          : day.status === 'active'
            ? status('busy')
            : status('waiting'),
      rounds,
    };
  });
}

export interface TournamentParticipantVM {
  id: ParticipantId;
  name: string;
  kindLabel: string;
  memberLine: string;
  status: StatusVM;
  withdrawn: boolean;
  /** "3 partijen · 2 gewonnen" */
  recordLine: string;
  rankText: string;
  pointsText: string;
}

export interface TournamentParticipantsVM {
  title: string;
  subtitle: string;
  /** What being a participant means here — it differs per participant kind. */
  note: { lead: string; body: string };
  rows: TournamentParticipantVM[];
}

export function buildParticipants(loaded: LoadedTournament): TournamentParticipantsVM {
  const { tournament } = loaded;
  const rows = standingRows(tournament, loaded.standings);
  const byId = new Map(rows.map((row) => [row.participantId, row]));
  const teams = tournament.participants.some((participant) => participant.kind === 'team');

  return {
    title: 'Deelnemers',
    subtitle: [
      `${tournament.participants.length} ${teams ? 'teams' : 'spelers'}`,
      teams ? 'vaste teams' : 'individueel',
    ].join(' · '),
    note: teams
      ? {
          lead: 'Vaste teams',
          body: 'Een team blijft het hele toernooi bij elkaar. Wie stopt, blijft in de stand staan met de partijen die al gespeeld zijn.',
        }
      : {
          lead: 'Losse spelers',
          body: 'Elke ronde worden de spelers opnieuw over de tafels verdeeld. Wie stopt, blijft in de stand staan met de partijen die al gespeeld zijn.',
        },
    rows: tournament.participants.map((participant) => {
      const row = byId.get(participant.id);
      return {
        id: participant.id,
        name: participant.name,
        kindLabel: participant.kind === 'team' ? 'Team' : 'Speler',
        memberLine: participant.kind === 'team' ? participant.memberNames.join(' & ') : '',
        status:
          participant.status === 'withdrawn'
            ? status('attention', 'Gestopt')
            : status('busy', 'Doet mee'),
        withdrawn: participant.status === 'withdrawn',
        recordLine: row?.recordLine ?? 'Nog geen partijen',
        rankText: row ? `${row.rank}` : '—',
        pointsText: row?.pointsText ?? '0',
      };
    }),
  };
}

/* ------------------------------------------------------------- the pairing */

export interface PairingTableVM {
  tableNumber: number;
  title: string;
  isBye: boolean;
  /** Who sits there, grouped by side — for reading. */
  sideLines: string[];
  /** Who sits in each seat, in seat order — for rearranging. */
  seatNames: string[];
  participantIds: ParticipantId[];
}

export interface PairingProposalVM {
  tables: PairingTableVM[];
  /** "4 tafels · 16 deelnemers" */
  summary: string;
  /** Anything worth saying about the arrangement; never blocking. */
  notes: string[];
  repeatedPartners: number;
  repeatedOpponents: number;
  /** "Geen enkel koppel speelt opnieuw samen." */
  qualityLine: string;
}

/**
 * The proposed tables, in names.
 *
 * Takes the people and the table shape rather than a whole tournament, because
 * the setup wizard arranges a first round before any tournament exists.
 */
export function buildPairingView(
  people: { participants: readonly { id: ParticipantId; name: string }[]; teamsPerMatch: number },
  proposal: PairingProposal,
): PairingProposalVM {
  const sides = people.teamsPerMatch;
  const named = (id: ParticipantId) =>
    people.participants.find((participant) => participant.id === id)?.name ?? '—';

  const tables = proposal.matches.map((match) => ({
    tableNumber: match.tableNumber,
    title: match.kind === 'bye' ? 'Vrije ronde' : `Tafel ${match.tableNumber}`,
    isBye: match.kind === 'bye',
    sideLines: participantSides(match.participantIds, sides)
      .filter((side) => side.length > 0)
      .map((side) => side.map(named).join(' & ')),
    seatNames: match.participantIds.map(named),
    participantIds: [...match.participantIds],
  }));

  const playable = tables.filter((table) => !table.isBye);
  const seated = proposal.matches.flatMap((match) => match.participantIds).length;

  return {
    tables,
    summary: `${playable.length} ${playable.length === 1 ? 'tafel' : 'tafels'} · ${seated} deelnemers`,
    notes: proposal.issues.map((issue) => issue.message),
    repeatedPartners: proposal.repeatedPartners,
    repeatedOpponents: proposal.repeatedOpponents,
    qualityLine:
      proposal.repeatedPartners === 0
        ? 'Geen enkel koppel speelt opnieuw samen.'
        : `${proposal.repeatedPartners === 1 ? 'Eén koppel speelt' : `${proposal.repeatedPartners} koppels spelen`} opnieuw samen.`,
  };
}

/** Turns the tables back into the shape the service confirms. */
export function toProposedMatches(tables: readonly PairingTableVM[]): ProposedMatch[] {
  return tables.map((table) => ({
    tableNumber: table.tableNumber,
    kind: table.isBye ? ('bye' as const) : ('game' as const),
    participantIds: [...table.participantIds],
  }));
}
