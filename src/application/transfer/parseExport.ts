import type { ValidationIssue } from '@/domain/result';
import { validateRuleSet } from '@/rules/validation/validateRuleSet';
import type { RuleSet } from '@/rules/schema/ruleSet';
import {
  EXPORT_FORMAT,
  SUPPORTED_EXPORT_VERSIONS,
  envelopeSchema,
  exportV1Schema,
  type CanastaExportV1,
} from './format';

/**
 * Turns untrusted text into a validated export document.
 *
 * Nothing is written anywhere: parsing and validating happen entirely before a
 * transaction is opened, so a bad file can never leave the database in a
 * half-changed state.
 *
 * Every failure carries a Dutch, user-facing `message`. The technical detail
 * goes in `detail`, for a console or a bug report — never on screen as a stack
 * trace.
 */
export type ParseFailureReason =
  | 'invalidJson'
  | 'unknownFormat'
  | 'unsupportedVersion'
  | 'invalidStructure'
  | 'invalidRuleSet'
  | 'invalidReferences';

export interface ParseFailure {
  ok: false;
  reason: ParseFailureReason;
  message: string;
  detail?: string;
  issues?: ValidationIssue[];
}

export interface ParseSuccess {
  ok: true;
  document: CanastaExportV1;
  /** Non-blocking findings, e.g. a rule set that warns but still works. */
  warnings: ValidationIssue[];
}

export type ParseResult = ParseSuccess | ParseFailure;

function fail(
  reason: ParseFailureReason,
  message: string,
  extra: { detail?: string; issues?: ValidationIssue[] } = {},
): ParseFailure {
  return { ok: false, reason, message, ...extra };
}

export function parseExport(text: string): ParseResult {
  // 1. JSON
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return fail('invalidJson', 'Dit bestand is geen geldige JSON.', {
      detail: (error as Error).message,
    });
  }

  // 2. Envelope: which format, which version?
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) {
    return fail(
      'unknownFormat',
      'Dit lijkt geen Canasta-exportbestand. Er ontbreekt een formaat- of versieveld.',
      { detail: envelope.error.message },
    );
  }

  if (envelope.data.format !== EXPORT_FORMAT) {
    return fail(
      'unknownFormat',
      `Dit bestand heeft formaat '${envelope.data.format}' en is geen Canasta-export.`,
    );
  }

  if (!SUPPORTED_EXPORT_VERSIONS.includes(envelope.data.version)) {
    return fail(
      'unsupportedVersion',
      `Exportversie ${envelope.data.version} wordt door deze versie van de app niet ondersteund.`,
    );
  }

  // 3. Structure. A second version would branch here, into its own schema plus
  //    an adapter up to the current shape.
  const parsed = exportV1Schema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.join('.') ?? 'het bestand';
    return fail(
      'invalidStructure',
      `Het bestand mist of bevat ongeldige gegevens bij '${where}'.`,
      {
        detail: parsed.error.message,
      },
    );
  }

  // The schema checks the shape this app depends on; the nested rule-set
  // members stay `unknown` to zod, which is why this needs a cast. The rule set
  // is verified properly one step below, by the app's own validator.
  const document = parsed.data as unknown as CanastaExportV1;

  // 4. The rule set, checked by the validator the app already uses. A snapshot
  //    that cannot be validated could not have scored a round either.
  const ruleSetIssues = validateRuleSet(document.game.effectiveRuleSet as RuleSet);
  const ruleSetErrors = ruleSetIssues.filter((issue) => issue.severity === 'error');
  if (ruleSetErrors.length > 0) {
    return fail('invalidRuleSet', 'De regelset in dit bestand is niet geldig.', {
      issues: ruleSetErrors,
      detail: ruleSetErrors.map((issue) => `${issue.code}: ${issue.message}`).join('; '),
    });
  }

  // 5. References inside the document must line up.
  const referenceIssues = checkReferences(document);
  if (referenceIssues.length > 0) {
    return fail('invalidReferences', referenceIssues[0]!.message, {
      issues: referenceIssues,
    });
  }

  return {
    ok: true,
    document,
    warnings: ruleSetIssues.filter((issue) => issue.severity === 'warning'),
  };
}

/**
 * Internal consistency: no duplicate ids, and every reference resolves.
 *
 * Checked here rather than in the schema because zod validates shapes, not
 * relationships between them.
 */
function checkReferences(document: CanastaExportV1): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { players, teams, rounds } = document.game;

  const playerIds = new Set<string>();
  for (const player of players) {
    if (playerIds.has(player.id)) {
      issues.push({
        code: 'import.duplicatePlayerId',
        severity: 'error',
        message: `Het bestand bevat twee spelers met hetzelfde id ('${player.id}').`,
      });
    }
    playerIds.add(player.id);
  }

  const teamIds = new Set<string>();
  for (const team of teams) {
    if (teamIds.has(team.id)) {
      issues.push({
        code: 'import.duplicateTeamId',
        severity: 'error',
        message: `Het bestand bevat twee teams met hetzelfde id ('${team.id}').`,
      });
    }
    teamIds.add(team.id);

    for (const memberId of team.memberIds) {
      if (!playerIds.has(memberId)) {
        issues.push({
          code: 'import.unknownPlayerReference',
          severity: 'error',
          message: `Team '${team.name}' verwijst naar een speler die niet in het bestand staat.`,
        });
      }
    }
  }

  const roundIds = new Set<string>();
  const sequences = new Set<number>();
  for (const round of rounds) {
    if (roundIds.has(round.sourceId)) {
      issues.push({
        code: 'import.duplicateRoundId',
        severity: 'error',
        message: `Het bestand bevat twee rondes met hetzelfde id ('${round.sourceId}').`,
      });
    }
    roundIds.add(round.sourceId);

    if (sequences.has(round.sequence)) {
      issues.push({
        code: 'import.duplicateRoundSequence',
        severity: 'error',
        message: `Het bestand bevat twee rondes met volgnummer ${round.sequence}.`,
      });
    }
    sequences.add(round.sequence);

    for (const teamInput of round.input.teams) {
      if (!teamIds.has(teamInput.teamId)) {
        issues.push({
          code: 'import.unknownTeamReference',
          severity: 'error',
          message: `Ronde ${round.sequence} bevat een score voor een team dat niet in het bestand staat.`,
        });
      }
    }

    const seenTeams = new Set<string>();
    for (const teamInput of round.input.teams) {
      if (seenTeams.has(teamInput.teamId)) {
        issues.push({
          code: 'import.duplicateTeamInput',
          severity: 'error',
          message: `Ronde ${round.sequence} bevat twee keer een score voor hetzelfde team.`,
        });
      }
      seenTeams.add(teamInput.teamId);
    }
  }

  for (const winnerId of document.game.result?.winnerTeamIds ?? []) {
    if (!teamIds.has(winnerId)) {
      issues.push({
        code: 'import.unknownWinnerReference',
        severity: 'error',
        message: 'De uitslag verwijst naar een team dat niet in het bestand staat.',
      });
    }
  }

  return issues;
}

/** A short, human summary for the confirmation step before importing. */
export interface ImportPreview {
  gameName: string;
  ruleSetName: string;
  playerCount: number;
  teamCount: number;
  roundCount: number;
  status: CanastaExportV1['game']['status'];
  updatedAt: string;
  exportedAt: string;
}

export function previewOf(document: CanastaExportV1): ImportPreview {
  const { game } = document;
  return {
    gameName: game.name ?? game.teams.map((team) => team.name).join(' tegen '),
    ruleSetName: game.ruleSetRef.name,
    playerCount: game.players.length,
    teamCount: game.teams.length,
    roundCount: game.rounds.length,
    status: game.status,
    updatedAt: game.updatedAt,
    exportedAt: document.exportedAt,
  };
}
