import type { RuleSet, SourceMetadata } from '@/rules/schema/ruleSet';
import type { ConstraintDefinition, RoundRuleDefinition } from '@/rules/schema/constraint';
import type { FieldDefinition } from '@/rules/schema/field';
import type { ScoreRuleDefinition } from '@/rules/schema/scoreRule';
import type { SettingDefinition } from '@/rules/schema/setting';
import {
  capability,
  config,
  gt,
  gte,
  input,
  inputBool,
  lookup,
  lte,
  mul,
  neg,
  num,
  roundNumber,
  sumTeams,
} from '@/rules/expression/builders';
import { classic } from './classic';

/**
 * De bron: Paul zelf. Er is geen publicatie om dit tegen te houden, dus elke
 * waarde die hieronder staat komt óf uit de huisregel óf uit Classic Canasta,
 * en de provenance zegt per waarde welke van de twee.
 */
export const HOUSE_SOURCE: SourceMetadata = {
  name: 'Huisregel',
  title: "Paul's regels",
};

/** Zes spellen leggen twaalf rode en twaalf zwarte drieën op tafel. */
const THREES_IN_PLAY = 12;

/** Een tabel van 0 t/m 12 drieën, lineair: `each` per drie. */
function perThree(each: number): number[] {
  return Array.from({ length: THREES_IN_PLAY + 1 }, (_unused, count) => count * each);
}

const THREE_LABELS = Array.from({ length: THREES_IN_PLAY + 1 }, (_unused, count) =>
  count === 0 ? 'geen' : count === 1 ? '1 drie' : `${count} drieën`,
);

/** De scoreregels die Paul's regels ongewijzigd van Classic overneemt. */
const INHERITED_SCORING_RULES = new Set([
  'cardPoints',
  'naturalCanastaBonus',
  'mixedCanastaBonus',
  'handPenalty',
]);

/**
 * De instellingen die Classic levert en hier blijven staan.
 *
 * Wat ontbreekt is net zo veelzeggend als wat er staat: `endGame.targetScore`
 * (er is geen doelscore), `goOut.concealedEnabled` en
 * `scoring.goingOut.concealed` (verborgen uitgaan bestaat hier niet, dus het
 * mag ook niet aangezet kunnen worden), `threes.red.requiresMeld` (drieën zijn
 * hier altijd negatief, ongeacht de opening) en `initialMeld.thresholds` (de
 * opening volgt het rondenummer, niet de stand).
 */
const INHERITED_SETTING_KEYS = new Set([
  'dealing.cardsPerPlayer',
  'dealing.drawCount',
  'deck.standardDecks',
  'deck.jokers',
  'scoring.canastas.natural',
  'scoring.canastas.mixed',
  'scoring.goingOut.normal',
  'goOut.minimumCanastas',
  'goOut.permissionFromPartner',
  'threes.red.valueByCount',
  'threes.black.freezesPile',
  'initialMeld.countTopDiscardCard',
  'penalties.handCardsSubtracted',
  'endGame.winner.tie',
]);

/** De ronderegels van Classic die hier onveranderd gelden. */
const INHERITED_ROUND_RULE_IDS = new Set([
  'atMostOneGoOut',
  'redThreesTotal',
  'goOutNeedsCanasta',
  'goingOutTeamHasNoHandCards',
]);

/** De constraints van Classic, op de doelscore na — die bestaat hier niet. */
const INHERITED_CONSTRAINT_IDS = new Set([
  'cardsPerPlayerPositive',
  'naturalCanastaNotNegative',
  'mixedCanastaNotNegative',
  'naturalAtLeastMixed',
  'concealedNeedsBonus',
  'minimumCanastasSane',
  'thresholdsContiguous',
]);

/**
 * Een waarde die Paul niet beschreven heeft en die uit Classic komt.
 *
 * Elk van deze gevallen is een keuze die gemaakt moest worden om een geldige
 * regelset op te leveren, dus elk ervan staat ook in de provenance — het
 * regelscherm toont ze als "niet beschreven", nooit als huisregel.
 */
function inherited(note: string) {
  return { status: 'not-specified' as const, statusNote: note };
}

/**
 * Waarden die niet uit Classic komen maar uit de rekensom achter zes spellen.
 * Ze krijgen geen bronvermelding: er is geen bron, er is alleen vermenigvuldigd.
 */
const ARITHMETIC = new Set(['deck.jokers']);

const INHERITED_NOTES: Record<string, string> = {
  'deck.jokers': 'Volgt uit zes spellen: 6 × 2 jokers.',
  'scoring.canastas.natural': 'Niet door de huisregel beschreven; bonussen uit Classic.',
  'scoring.canastas.mixed': 'Niet door de huisregel beschreven; bonussen uit Classic.',
  'goOut.minimumCanastas': 'Niet door de huisregel beschreven; overgenomen uit Classic.',
  'goOut.permissionFromPartner': 'Niet door de huisregel beschreven; overgenomen uit Classic.',
  'dealing.drawCount': 'Niet door de huisregel beschreven; overgenomen uit Classic.',
  'threes.black.freezesPile': 'Niet door de huisregel beschreven; Pagat-lezing uit Classic.',
  'initialMeld.countTopDiscardCard': 'Niet door de huisregel beschreven; overgenomen uit Classic.',
  'penalties.handCardsSubtracted': 'Niet door de huisregel beschreven; overgenomen uit Classic.',
};

/**
 * Paul's regels.
 *
 * Een huisvariant, en daarmee de eerste regelset zonder publieke bron om tegen
 * aan te houden. Wat Paul beschrijft staat hieronder: ieder speelt voor zich,
 * 26 kaarten per speler uit zes spellen, een opening van dertig punten maal het
 * rondenummer, rode drieën −300 en zwarte −100 per stuk en altijd negatief,
 * honderd punten voor uitgaan, geen verborgen uitgaan, en een partij over een
 * afgesproken aantal rondes in plaats van naar een doelscore. Al het andere
 * komt uit Classic Canasta en staat als zodanig in de provenance — er is hier
 * niets bijverzonnen.
 *
 * Hoeveel spelers er meedoen staat er níét bij, en dat is zelf de regel: het
 * wordt per partij gekozen. De regelset zegt daarom alleen wat de vorm is —
 * ieder voor zich, twee tot acht — en laat het getal aan de setup.
 *
 * Twee dingen verdienen uitleg, omdat ze de architectuur raken:
 *
 * De opening is het eerste geval waarin de staffel over de *stand* het
 * antwoord niet kan geven. Dertig punten per ronde hangt van het rondenummer
 * af, en geen enkele reeks grenzen over een cumulatieve score drukt dat uit.
 * Daarom rekent `initialMeld.requirement` het uit, in rondecontext, zodat het
 * voor iedereen aan tafel hetzelfde getal is.
 *
 * En de drieën zijn hier altijd negatief. Dat is geen variant op de
 * Classic-regel maar een andere regel: Classic draait het teken om op basis van
 * de opening, Modern American op basis van het aantal Canasta's, en Paul doet
 * geen van beide. De scoreregels hieronder kennen die voorwaarde dus niet —
 * `requiresMeld` staat uit en komt in de telling niet voor.
 */
export const paulsRules: RuleSet = {
  ...structuredClone(classic),
  id: 'builtin.paulsRules',
  name: "Paul's regels",
  description:
    'Huisregels: zes spellen, 26 kaarten per speler, opening 30 punten per ronde, en een partij over een afgesproken aantal rondes.',
  family: 'pauls',
  source: HOUSE_SOURCE,
  additionalSources: [classic.source],

  provenance: {
    entries: [
      {
        path: 'endGame.winner.tie',
        status: 'app-policy',
        note: 'Geen bron beschrijft een exact gelijkspel. Deze app speelt dan een extra ronde.',
      },
      {
        // De huisregel zegt wél dat iedereen voor zich speelt, maar niet met
        // hoeveel. Dat is dus geen ontbrekende bronregel maar een keuze die
        // per partij gemaakt wordt, en zo staat het er ook.
        path: 'players.default',
        status: 'app-policy',
        note: 'De huisregel legt het aantal spelers niet vast. Je kiest het per partij; de app staat 2 tot 8 spelers toe.',
      },
      ...Object.entries(INHERITED_NOTES).map(([path, note]) => ({
        path,
        status: 'not-specified' as const,
        note,
        ...(ARITHMETIC.has(path) ? {} : { source: classic.source }),
      })),
    ],
    notes:
      "Paul's regels zijn huisregels; er is geen publicatie om ze tegen aan te houden. Beschreven zijn: ieder speelt voor zich zonder teams, 26 kaarten per speler, zes spellen, openingsmelding 30 punten maal het rondenummer, rode drie −300 en zwarte drie −100 per stuk en altijd negatief, uitgaan +100, geen verborgen uitgaan, en een vast aantal rondes zonder doelscore. Het aantal spelers ligt niet vast en wordt per partij gekozen. Elke andere waarde komt uit Classic Canasta en is hierboven als 'niet beschreven' gemarkeerd.",
  },

  configuration: {
    ...structuredClone(classic.configuration),

    // Vrij te kiezen bij het starten van een partij, binnen het bereik dat de
    // app aankan. `default` is alleen waar de wizard begint; zodra een partij
    // start legt de gekozen indeling alle drie de waarden vast.
    players: { min: 2, max: 8, default: 4 },
    // Ieder voor zich: elke speler is een eigen deelnemer met een eigen totaal.
    // Eén deelnemer per "team" houdt dezelfde telling aan het werk, zonder dat
    // er ergens een tweede code-pad voor individueel spel bestaat.
    teams: { mode: 'individual', count: 4, teamSize: 1 },

    deck: { standardDecks: 6, jokers: 12, totalCards: 324 },
    // Bewust 26, niet 2 × 13: het is één stapel van 26 kaarten per speler.
    dealing: { cardsPerPlayer: 26, drawCount: 1, discardCount: 1 },

    scoring: {
      ...structuredClone(classic.configuration.scoring),
      // `concealed` staat gelijk aan `normal` omdat verborgen uitgaan hier niet
      // bestaat; geen enkele scoreregel leest deze waarde nog.
      goingOut: { none: 0, normal: 100, concealed: 100 },
    },

    threes: {
      red: {
        enabled: true,
        valueByCount: perThree(300),
        // Geen voorwaarde: de scoreregel trekt ze altijd af.
        requiresMeld: false,
        maxPerTeam: THREES_IN_PLAY,
      },
      black: {
        enabled: true,
        meldValue: classic.configuration.threes.black.meldValue,
        freezesPile: classic.configuration.threes.black.freezesPile,
        valueByCount: perThree(100),
      },
      swingWithCanastas: false,
    },

    initialMeld: {
      ...structuredClone(classic.configuration.initialMeld),
      // De formule hieronder bepaalt de opening. Deze ene band is de waarde
      // waar de staffel op uit zou komen als er geen formule was, zodat de
      // data geldig blijft en niets een tweede, afwijkend antwoord geeft.
      thresholds: [{ minScore: null, maxScore: null, required: 30 }],
      requirement: mul(roundNumber(), config('extensions.openingPerRound')),
    },

    goOut: {
      ...structuredClone(classic.configuration.goOut),
      concealedEnabled: false,
    },

    endGame: {
      mode: 'plannedRounds',
      // Geen doelscore: er is geen stand waarbij de partij afgelopen is.
      targetScore: 0,
      plannedRounds: 10,
      evaluateAfterRound: true,
      winner: { strategy: 'highest-score', tie: 'play-extra-round' },
    },

    extensions: {
      /** Per ronde erbij: ronde 1 vraagt 30, ronde 10 vraagt 300. */
      openingPerRound: 30,
    },
  },

  capabilities: {
    ...classic.capabilities,
    // Niet "er zijn er nu geen", maar "deze variant kent ze niet". De
    // indelingskeuze in de wizard leest dit en biedt er dus geen aan.
    teams: false,
    blackThrees: true,
    concealedGoingOut: false,
  },

  /**
   * De velden van Classic, met twee aanpassingen: er passen twaalf rode drieën
   * in zes spellen in plaats van vier, en zwarte drieën worden geteld.
   *
   * `concealedGoingOut` blijft gewoon in de lijst staan. Het veld verdwijnt
   * vanzelf uit het invoerscherm omdat zijn `visibleWhen` de capability leest
   * die hier uit staat — precies het mechanisme dat ervoor is, zonder één
   * uitzondering in de UI.
   */
  fields: ((): FieldDefinition[] => {
    const fields = structuredClone(classic.fields);
    const redThrees = fields.find((field) => field.id === 'redThrees');
    if (redThrees) redThrees.max = THREES_IN_PLAY;

    const blackThrees: FieldDefinition = {
      id: 'blackThrees',
      type: 'count',
      label: 'Zwarte drieën in hand',
      hint: 'Elke zwarte drie die aan het eind van de ronde nog in de hand zit.',
      category: 'threes',
      order: 42,
      defaultValue: 0,
      min: 0,
      max: THREES_IN_PLAY,
      step: 1,
      visibleWhen: capability('blackThrees'),
    };

    return [...fields, blackThrees].sort((a, b) => a.order - b.order);
  })(),

  scoringRules: ((): ScoreRuleDefinition[] => {
    const inheritedRules = structuredClone(classic.scoringRules).filter((rule) =>
      INHERITED_SCORING_RULES.has(rule.id),
    );

    const threes: ScoreRuleDefinition[] = [
      {
        id: 'redThreePenalty',
        label: 'Rode drieën',
        kind: 'penalty',
        order: 40,
        appliesWhen: capability('redThrees'),
        // Onvoorwaardelijk negatief. Er is hier geen toestand waarin een drie
        // positief of neutraal wordt, dus er is ook geen conditie om te lezen.
        compute: neg(lookup('threes.red.valueByCount', input('redThrees'))),
        detail: { count: input('redThrees') },
        explainTemplate: '{count} rode drie(ën) in hand',
      },
      {
        id: 'blackThreePenalty',
        label: 'Zwarte drieën',
        kind: 'penalty',
        order: 45,
        appliesWhen: capability('blackThrees'),
        compute: neg(lookup('threes.black.valueByCount', input('blackThrees'))),
        detail: { count: input('blackThrees') },
        explainTemplate: '{count} zwarte drie(ën) in hand',
      },
    ];

    const goingOut: ScoreRuleDefinition = {
      id: 'goingOutBonus',
      label: 'Uitgaan',
      kind: 'bonus',
      order: 50,
      appliesWhen: inputBool('wentOut'),
      // Eén bedrag, geen keuze: verborgen uitgaan bestaat in deze variant niet.
      compute: config('scoring.goingOut.normal'),
      detail: { bonus: config('scoring.goingOut.normal') },
      explainTemplate: 'Uitgaan: +{bonus}',
    };

    return [...inheritedRules, ...threes, goingOut].sort((a, b) => a.order - b.order);
  })(),

  settings: ((): SettingDefinition[] => {
    const inheritedSettings = structuredClone(classic.settings)
      .filter((setting) => INHERITED_SETTING_KEYS.has(setting.key))
      .map((setting) => {
        const note = INHERITED_NOTES[setting.key];
        if (setting.key === 'threes.red.valueByCount') {
          return {
            ...setting,
            label: 'Rode drieën in hand',
            help: 'Aftrek aan het eind van de ronde, altijd negatief.',
            itemLabels: THREE_LABELS,
          };
        }
        return note ? { ...setting, ...inherited(note) } : setting;
      });

    const added: SettingDefinition[] = [
      {
        key: 'teams.mode',
        label: 'Indeling',
        help: 'Ieder speelt voor zich. Deze variant kent geen teams.',
        type: 'select',
        category: 'setup',
        editable: false,
        effect: 'advisory',
        status: 'verified',
        order: 12,
        options: [
          { value: 'partnership', label: 'In teams' },
          { value: 'individual', label: 'Ieder voor zich' },
        ],
      },
      {
        // Niet door de huisregel vastgelegd: het wordt per partij gekozen. Wat
        // hier staat is daarom het getal waarmee de wizard begint, en in een
        // gestarte partij het aantal waarmee die partij gespeeld wordt.
        key: 'players.default',
        label: 'Aantal spelers',
        help: 'Kies bij het starten van een partij hoeveel spelers meedoen, van 2 tot 8.',
        type: 'number',
        category: 'setup',
        editable: false,
        effect: 'advisory',
        status: 'app-policy',
        statusNote:
          'De huisregel legt het aantal spelers niet vast. Je kiest het per partij; de app staat 2 tot 8 spelers toe.',
        order: 15,
      },
      {
        key: 'endGame.mode',
        label: 'Einde van de partij',
        help: 'Deze variant speelt een afgesproken aantal rondes en telt daarna op. Er is geen doelscore.',
        type: 'select',
        category: 'game',
        editable: false,
        effect: 'computed',
        status: 'verified',
        order: 5,
        options: [
          { value: 'targetScore', label: 'Tot een doelscore' },
          { value: 'plannedRounds', label: 'Vast aantal rondes' },
        ],
      },
      {
        key: 'endGame.plannedRounds',
        label: 'Aantal rondes',
        help: 'Na deze ronde is de partij afgelopen. De hoogste totaalscore wint.',
        type: 'number',
        category: 'game',
        editable: true,
        effect: 'computed',
        status: 'verified',
        order: 10,
        min: 1,
        max: 50,
        step: 1,
      },
      {
        key: 'threes.black.valueByCount',
        label: 'Zwarte drieën in hand',
        help: 'Aftrek aan het eind van de ronde, altijd negatief.',
        type: 'numberTable',
        category: 'threes',
        editable: true,
        effect: 'computed',
        status: 'verified',
        order: 135,
        itemLabels: THREE_LABELS,
      },
      {
        key: 'extensions.openingPerRound',
        label: 'Openingsmelding per ronde',
        help: 'Het rondenummer maal dit bedrag: ronde 1 vraagt 30, ronde 10 vraagt 300.',
        type: 'number',
        category: 'initialMeld',
        editable: true,
        effect: 'validation',
        status: 'verified',
        order: 160,
        min: 0,
        max: 1000,
        step: 5,
      },
    ];

    return [...inheritedSettings, ...added].sort((a, b) => a.order - b.order);
  })(),

  constraints: ((): ConstraintDefinition[] => {
    const inheritedConstraints = structuredClone(classic.constraints).filter((constraint) =>
      INHERITED_CONSTRAINT_IDS.has(constraint.id),
    );

    const added: ConstraintDefinition[] = [
      {
        id: 'plannedRoundsPositive',
        kind: 'expr',
        severity: 'error',
        message: 'Een partij moet over minstens één ronde gaan.',
        paths: ['endGame.plannedRounds'],
        assert: gte(config('endGame.plannedRounds'), num(1)),
      },
      {
        id: 'openingPerRoundPositive',
        kind: 'expr',
        severity: 'error',
        message: 'De openingsmelding per ronde moet groter zijn dan 0.',
        paths: ['extensions.openingPerRound'],
        assert: gt(config('extensions.openingPerRound'), num(0)),
      },
    ];

    return [...inheritedConstraints, ...added];
  })(),

  roundRules: ((): RoundRuleDefinition[] => {
    const inheritedRules = structuredClone(classic.roundRules).filter((rule) =>
      INHERITED_ROUND_RULE_IDS.has(rule.id),
    );

    const blackThreesTotal: RoundRuleDefinition = {
      id: 'blackThreesTotal',
      kind: 'expr',
      scope: 'round',
      severity: 'warning',
      message: 'Er zijn meer zwarte drieën ingevoerd dan er in het spel zitten.',
      fieldId: 'blackThrees',
      assert: lte(sumTeams('blackThrees'), mul(num(2), config('deck.standardDecks'))),
    };

    return [...inheritedRules, blackThreesTotal];
  })(),
};
