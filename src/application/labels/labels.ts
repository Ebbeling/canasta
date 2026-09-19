import type { FieldCategory, FieldType } from '@/rules/schema/field';
import type { RuleEffect, RuleStatus, SettingCategory } from '@/rules/schema/setting';
import type { ScoreLineKind } from '@/rules/schema/scoreRule';

/**
 * Dutch labels for the closed unions in the rule-set schema.
 *
 * These live in the application layer, not in React, so a component never has to
 * know what a `SettingCategory` means. Every map is an exhaustive `Record`, so
 * adding a member to a union breaks the build here rather than rendering a raw
 * English identifier on a Dutch screen.
 */

export const FIELD_CATEGORY_LABELS: Record<FieldCategory, string> = {
  cards: 'Kaarten',
  canastas: "Canasta's",
  threes: 'Drieën',
  goingOut: 'Uitgaan',
  penalties: 'Straffen',
  special: 'Speciale handen',
};

/** Display order of the round-entry groups. */
export const FIELD_CATEGORY_ORDER: readonly FieldCategory[] = [
  'cards',
  'special',
  'canastas',
  'threes',
  'goingOut',
  'penalties',
];

export const SETTING_CATEGORY_LABELS: Record<SettingCategory, string> = {
  setup: 'Opzet',
  game: 'Spel',
  scoring: 'Puntentelling',
  canastas: "Canasta's",
  threes: 'Drieën',
  initialMeld: 'Openingsmelding',
  goingOut: 'Uitgaan',
  penalties: 'Straffen',
  specialHands: 'Speciale handen',
  advanced: 'Geavanceerd',
};

export const SETTING_CATEGORY_ORDER: readonly SettingCategory[] = [
  'game',
  'setup',
  'scoring',
  'canastas',
  'threes',
  'initialMeld',
  'goingOut',
  'penalties',
  'specialHands',
  'advanced',
];

export const RULE_EFFECT_LABELS: Record<RuleEffect, string> = {
  computed: 'Telt mee in de score',
  validation: 'Controleert de invoer',
  advisory: 'Alleen ter informatie',
};

export const RULE_STATUS_LABELS: Record<RuleStatus, string> = {
  verified: 'Geverifieerd',
  'secondary-source': 'Secundaire bron',
  'app-policy': 'Keuze van de app',
  'not-specified': 'Niet beschreven',
};

/** The §17.1 table, so the rules screen can explain what a badge means. */
export const RULE_STATUS_MEANINGS: Record<RuleStatus, string> = {
  verified: 'Letterlijk bevestigd door de primaire bron van deze regelset.',
  'secondary-source':
    'Niet vermeld door de primaire bron; aangevuld uit een secundaire bron, die erbij staat.',
  'app-policy': 'Een keuze van deze app, door geen enkele bron voorgeschreven.',
  'not-specified': 'Geen enkele geraadpleegde bron beschrijft dit.',
};

export const SCORE_LINE_KIND_LABELS: Record<ScoreLineKind, string> = {
  cards: 'Kaarten',
  bonus: 'Bonus',
  penalty: 'Straf',
};

export const FIELD_TYPE_INPUT_MODE: Record<FieldType, 'numeric' | 'none'> = {
  points: 'numeric',
  count: 'numeric',
  boolean: 'none',
  choice: 'none',
  multiselect: 'none',
};

/**
 * `Capabilities` has an index signature — it is open for future variants — so
 * this map cannot be exhaustive. `capabilityLabel` falls back to the raw key
 * rather than pretending a translation exists.
 */
const CAPABILITY_LABELS: Record<string, string> = {
  teams: 'Speelt in teams',
  initialMeld: 'Openingsmelding',
  redThrees: 'Rode drieën',
  blackThrees: 'Zwarte drieën',
  specialHands: 'Speciale handen',
  wildCanastas: "Wild-Canasta's",
  specialCanastas: "Azen- en zevens-Canasta's",
  concealedGoingOut: 'Verborgen uitgaan',
  multipleCanastaTypes: "Meerdere soorten Canasta's",
  handPenalty: 'Straf voor kaarten in hand',
  incompleteCanastaPenalty: 'Straf voor onvolledige melds',
  talon: 'Talon (bonuskaarten)',
};

export function capabilityLabel(key: string): string {
  return CAPABILITY_LABELS[key] ?? key;
}
