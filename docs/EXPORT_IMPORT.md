# Export en import

Eén partij gaat als één JSON-bestand naar buiten en komt zo weer terug. Volledig lokaal: geen
server, geen account, geen synchronisatie.

## Formaat

```
format:  "canasta-game-export"
version: 1
```

De versie hoort bij het **exportformaat**. Die staat los van `engineVersion` (welke
score-engine de punten berekende) en van `ruleSetRef.version` (welke versie van de regelset).
Alle drie reizen apart mee, zodat een nieuw bestandsformaat niet doet alsof er onder andere
regels gespeeld is.

```
CanastaExport
├── format, version
├── exportedAt
├── application
│   ├── engineVersion
│   └── appVersion?
└── game
    ├── sourceId, name?, status, createdAt, updatedAt, finishedAt?
    ├── players[]            id, name, seat
    ├── teams[]              id, name, memberIds[], order
    ├── ruleSetRef           id, version, name, origin, sourcePresetId?
    ├── effectiveRuleSet     de volledige bevroren regelset
    ├── gameOverrides[]      huisregels van deze partij
    ├── engineVersion
    ├── result?              winnerTeamIds, finalScores, decidedAfterRound, tie
    ├── summary?             totalsByTeam, roundCount
    └── rounds[]
        ├── sourceId, sequence, status, createdAt, updatedAt
        ├── input            ← de bron van waarheid
        ├── note?
        └── computed?        ← audit trail, nooit leidend
```

## Historische regelset-snapshot

`effectiveRuleSet` bevat de **volledige** regelset waarmee de partij gespeeld is: configuratie,
velddefinities, instellingen, scoringsregels, capabilities, bron en provenance. Niet een
verwijzing, en niet alleen de configuratie.

Dat is wat het bestand zelfstandig maakt. Bij import wordt **nooit** een preset of ingebouwde
regelset op id opgezocht. Een regelset die sinds de export is gewijzigd kan een geïmporteerde
partij dus niet veranderen.

## `engineVersion`

Blijft staan zoals hij was. Een nieuwere engine adopteert de oude scores niet stilzwijgend.

Bij import worden de rondes wel opnieuw berekend uit `input` met de meegeleverde snapshot — dat
is dezelfde `recomputeGame` die de app overal gebruikt, er is geen tweede score-engine voor
import. Wijkt het resultaat af van de `summary` in het bestand, dan wordt dat gemeld als
`scoreMismatch`; de herberekening uit de inputs wint.

## Wat er wel en niet in gaat

| Wel | Niet |
|---|---|
| Spel, spelers, teams, rondes | Drafts (onopgeslagen invoer) |
| Volledige regelset-snapshot | Presets uit de database |
| `engineVersion`, huisregels | App-instellingen (thema, opslag) |
| Uitslag en status | Het oorspronkelijke id als nieuw id |
| De opgeslagen audit trail per ronde | |

Een draft is tijdelijke UI-state. Een export hoort een partij weer te geven zoals hij echt
gespeeld is, niet een half ingetypte ronde.

## ID-hermapping

Bij import krijgt **alles** een nieuw id:

```
oldGameId   → newGameId
oldPlayerId → newPlayerId
oldTeamId   → newTeamId
oldRoundId  → newRoundId
```

Alle verwijzingen gaan mee: `team.memberIds`, `round.gameId`, `input.teams[].teamId`,
`result.winnerTeamIds` en de team-gesleutelde records. Er blijft geen bron-id achter in de
opgeslagen records; een test controleert dat letterlijk.

Het oorspronkelijke spel-id wordt wel bewaard, maar alleen als herkomst:
`game.importedFrom = { gameId, at }`.

## Hetzelfde bestand twee keer importeren

Levert twee onafhankelijke partijen op. Import overschrijft nooit iets: er wordt altijd
aangemaakt, nooit bijgewerkt. Het origineel blijft ongemoeid.

## Validatie

Onbetrouwbare invoer, in deze volgorde — en er wordt pas iets geschreven als alles klopt:

1. JSON parsen
2. envelope: `format` en `version`
3. structuur (zod-schema)
4. regelset (`validateRuleSet`, dezelfde validator als de rest van de app)
5. verwijzingen: dubbele id's, teams zonder speler, rondes zonder team, winnaar zonder team
6. pas dan: één transactie

Geweigerd worden onder meer: geen JSON, een ander `format`, een niet-ondersteunde versie, een
ontbrekend spel, ontbrekende spelers of teams, een ronde zonder `input`, een ongeldige regelset
en kapotte verwijzingen. Elke fout heeft een Nederlandse melding; de technische details gaan
naar de console, niet naar het scherm.

De import draait in één Dexie-transactie over `games` en `rounds`. Faalt er iets halverwege,
dan blijft er geen half spel achter.

## Toekomstige versies

`parseExport` controleert eerst de envelope en kiest daarna het schema. Een versie 2 krijgt een
eigen schema plus een adapter naar de huidige vorm; `SUPPORTED_EXPORT_VERSIONS` bepaalt wat
deze build kan lezen. Er is geen legacy-ondersteuning nodig — dit is versie 1.

## Bestandsnaam

`canasta-<naam>-<datum>.json`, bijvoorbeeld `canasta-donderdagavond-2026-09-19.json`. De naam
wordt geschoond: alles buiten letters en cijfers wordt een streepje, zodat een partij die
"Michel / Anne" heet geen padscheiding kan opleveren.

## Waar het in de code zit

```
UI            ScoreboardRoute (Exporteren) · ui/settings/ImportGameSection
              ui/common/files.ts   ← Blob, download, FileReader
  ↓
Application   services/transferService.ts
              transfer/{format,exportGame,parseExport,importGame}.ts
  ↓
Persistence   repositories (games, rounds) in één transactie
```

Browser-API's blijven aan de UI-kant. De application-laag werkt met tekst; de domein- en
score-lagen weten niets van export of import.
