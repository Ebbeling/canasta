import type { RuleSet } from '@/rules/schema/ruleSet';
import { classic, PAGAT_SOURCE } from './classic';

/**
 * Two-Handed Canasta.
 *
 * Pagat is explicit that this is Classic Canasta with four differences, so the
 * rule set is built as a delta rather than retyped — anything not listed here is
 * verified to be identical, including the initial-meld staircase.
 *
 * Architecturally this variant needs **zero** engine code: `teams.mode:
 * 'individual'` with `teamSize: 1` makes the same scoring loop run over two
 * one-player "teams". Only the setup UI reads `teams.mode`, to say "speler"
 * instead of "team".
 */
export const twoHanded: RuleSet = {
  ...structuredClone(classic),
  id: 'builtin.twoHanded',
  name: 'Two-Handed Canasta',
  description: 'Classic Canasta voor twee spelers: 15 kaarten, twee kaarten trekken.',
  family: 'twoHanded',
  source: {
    ...PAGAT_SOURCE,
    title: 'Canasta for two players',
  },
  provenance: {
    entries: [
      {
        path: 'endGame.winner.tie',
        status: 'app-policy',
        note: 'Geen enkele bron beschrijft een exact gelijkspel. Deze app speelt dan een extra ronde.',
      },
    ],
    notes:
      'Pagat stelt expliciet: "All other rules are the same as in four-player Classic Canasta." Alles wat hier niet afwijkt, is daarmee geverifieerd gelijk aan Classic.',
  },

  configuration: {
    ...structuredClone(classic.configuration),
    players: { min: 2, max: 2, default: 2 },
    // Two "teams" of one player, so the score engine needs no second code path.
    teams: { mode: 'individual', count: 2, teamSize: 1 },
    dealing: { cardsPerPlayer: 15, drawCount: 2, discardCount: 1 },
    goOut: {
      ...structuredClone(classic.configuration.goOut),
      minimumCanastas: 2,
      permissionFromPartner: false,
    },
  },

  capabilities: {
    ...classic.capabilities,
    teams: false,
  },

  // Everything else — fields, scoring rules, constraints, round rules — is
  // inherited verbatim from Classic by the clone above.
  settings: classic.settings.map((setting) =>
    setting.key === 'goOut.permissionFromPartner'
      ? { ...setting, editable: false, help: 'Niet van toepassing bij twee spelers.' }
      : { ...setting },
  ),
};
