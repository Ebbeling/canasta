# Canasta Puntentelling PWA --- Functionele & Technische Specificatie

**Versie:** 2.1\
**Datum:** 19 september 2026\
**Doel:** een offline-first PWA voor het bijhouden van Canasta-spellen,
waarbij de gebruiker vóór het spel een volledige **regelset en
spelinstellingen** kan kiezen.

> **Status van dit document.** Versie 2.1 is bijgewerkt met de
> daadwerkelijk geverifieerde regels uit Fase 0 van het regelonderzoek.
> Vanaf deze versie is dit document de **contractuele waarheid** voor de
> implementatie: geen regel mag alleen in TypeScript bestaan zonder dat
> hij hier én in de rule set-configuratie beschreven staat.
>
> Het volledige onderzoek, met per waarde de bron, de bron-URL, de
> verificatiestatus en de gevonden conflicten, staat in
> [`docs/RULESET_RESEARCH.md`](docs/RULESET_RESEARCH.md).
> Waarden die niet uit een bron zijn vast te stellen, staan daar als
> open beslissing en zijn hier **niet** ingevuld.

------------------------------------------------------------------------

# 1. Belangrijk ontwerpbesluit

Canasta is geen spel met één universele regelset. Er bestaan onder
andere:

-   Classic Canasta
-   Modern American Canasta
-   Two-Handed Canasta
-   Samba
-   Bolivia
-   Hand & Foot / Pennies
-   verschillende regionale en huisregels

Pagat maakt expliciet onderscheid tussen Classic Canasta en Modern
American Canasta, en stelt over die laatste vast dat er geen algemeen
aanvaarde regelset bestaat: *"So far as I know there is no single set of
rules that is generally accepted as 'correct'."* Ook binnen één variant
verschillen tafelregels dus per speelgroep.

Bron: Pagat, *Canasta: rules and variations*,
<https://www.pagat.com/rummy/canasta.html> (opgehaald 2026-09-19).

Daarom mag de app **niet één set Canasta-regels hardcoderen**.

De architectuur moet bestaan uit:

``` text
Game
 ├── Rule Set
 │    ├── base rules
 │    ├── scoring rules
 │    ├── dealing rules
 │    ├── canasta rules
 │    └── optional rules
 │
 ├── Game Settings
 │    ├── players
 │    ├── teams
 │    ├── target score
 │    └── house rules
 │
 └── Rounds
      └── Round Scores
```

De regelset bepaalt **hoe het spel werkt**.

De spelinstellingen bepalen **hoe deze specifieke partij gespeeld
wordt**.

------------------------------------------------------------------------

# 2. Doel van de app

De app is een digitale Canasta-scorekaart.

De gebruiker moet:

1.  een regelset kunnen kiezen;
2.  relevante spelinstellingen kunnen aanpassen;
3.  spelers en teams kunnen instellen;
4.  per ronde scores kunnen invoeren;
5.  de score automatisch laten berekenen;
6.  eerdere rondes kunnen bekijken en corrigeren;
7.  meerdere spellen lokaal kunnen bewaren;
8.  zonder internet kunnen spelen.

De app moet vooral worden gebruikt **aan de kaarttafel**. De invoer moet
daarom snel en eenvoudig zijn.

------------------------------------------------------------------------

# 3. Regelsets

De app moet regelsets als afzonderlijke configuraties behandelen.

## 3.1 Beschikbare regelsets versie 1

Versie 1 moet **drie volledig werkende** ingebouwde regelsets bevatten,
plus Custom/Huisregels door kopiëren en overschrijven van een bestaande
regelset. Geen van de drie mag een oppervlakkige preset zijn.

Alle waarden hieronder zijn geverifieerd; zie
[`docs/RULESET_RESEARCH.md`](docs/RULESET_RESEARCH.md) voor bron, URL en
verificatiestatus per waarde.

### Classic Canasta

Bron: Pagat (primair), Bicycle (secundair).

-   4 spelers, 2 teams van 2;
-   2 standaard kaartspellen + 4 jokers = 108 kaarten;
-   11 kaarten per speler;
-   1 kaart trekken, 1 kaart afleggen;
-   doel: 5.000 punten;
-   natuurlijke Canasta 500, gemengde Canasta 300;
-   geen wildcard-Canasta's (alleen als variant beschreven, niet als
    standaardregel);
-   rode drieën 100 per stuk, alle vier samen 800; **negatief wanneer het
    team niet heeft gemeld**;
-   zwarte drieën zijn stopkaarten, waarde 5, alleen te melden bij
    uitgaan;
-   uitgaan +100, verborgen uitgaan **200 in totaal** (dus vervangend,
    niet 100 + 200);
-   minimaal 1 Canasta om uit te gaan;
-   openingsmeldingsgrenzen: negatief → 15, 0–1.495 → 50,
    1.500–2.995 → 90, 3.000+ → 120;
-   elke meld minstens 2 natuurlijke kaarten, hoogstens 3 wildcards;
-   geen talon, geen speciale handen, geen straffen voor onvolledige
    Canasta's.

Classic Canasta is de oorspronkelijke, wereldwijd verspreide regelset.

### Modern American Canasta

Bron: Canasta League of America (**leidend**), Pagat (secundair en
aanvullend waar de CLA zwijgt).

-   4 spelers in 2 teams (CLA noemt dit niet expliciet; aangevuld uit
    Pagat);
-   2 standaard kaartspellen + 4 jokers = 108 kaarten (idem);
-   13 kaarten per speler;
-   doel: 8.500 punten;
-   openingsmeldingsgrenzen: 0–2.995 → 125, 3.000–4.995 → 155,
    5.000+ → 180; negatieve score valt eveneens onder 125;
-   de openingsmeld moet een **Clean Triple** bevatten: drie of meer
    natuurlijke kaarten van dezelfde rang, zonder wildcards en niet van
    een dode rang;
-   Canasta-categorieën: gemengd 300, natuurlijk 500, natuurlijke azen
    2.500, natuurlijke 7'en 2.500, wild met 1–3 jokers 2.000,
    joker-Canasta (vier jokers + drie 2'en) 2.500, uitsluitend 2'en
    3.000;
-   uitgaan +100; **geen** verborgen uitgaan;
-   minimaal 2 Canasta's om uit te gaan, en de laatste kaart moet worden
    afgelegd;
-   drieën: rood én zwart worden gemeld en scoren per kleurgroep
    ±100 / ±300 / ±500 / ±1.000 voor 1 / 2 / 3 / 4 stuks. Het **teken
    hangt af van het aantal Canasta's**: geen Canasta = aftrekken, één
    Canasta = neutraal, twee of meer = optellen;
-   straffen: onvolledige natuurlijke azenmeld −2.500, onvolledige
    7'en-meld −2.500, onvolledige wildcard-meld −2.000, drie of meer
    azen in de hand −1.500 plus kaartwaarde, idem voor 7'en;
-   talon: wie de openingsmeld legt met minstens 9 kaarten in de
    trekstapel krijgt bonuskaarten — 4 voor het eerste team, 3 voor het
    tweede;
-   elf speciale handen van 14 kaarten, die de rondescore van dat team
    volledig **vervangen** (zie §3.2).

### Two-Handed Canasta

Bron: Pagat, sectie *Canasta for two players*. De bron stelt expliciet
dat alle overige regels gelijk zijn aan vierhands Classic Canasta.

-   2 spelers, geen partnerships (in het datamodel twee "teams" van één
    speler, zodat de score-engine ongewijzigd blijft);
-   **15 kaarten** per speler;
-   **2 kaarten trekken** per beurt, 1 kaart afleggen;
-   **2 Canasta's** nodig om uit te gaan;
-   doel: 5.000 punten;
-   one-card draw: wie de laatste kaart trekt, speelt de beurt af alsof
    er twee zijn getrokken;
-   alle overige regels — kaartwaarden, Canasta-bonussen, drieën,
    openingsmeldingsgrenzen, uitgaanbonus, verborgen uitgaan, straffen,
    frozen pile — **identiek aan Classic**.

## 3.2 Speciale handen Modern American

Een speciale hand telt 14 kaarten, wordt in één keer opengelegd zonder
afleggen, is de enige meld van dat team in die ronde en beëindigt de
ronde onmiddellijk. Alleen toegestaan als het team nog niet gemeld heeft.
Geen enkele hand mag een 3 bevatten, met de Straight als uitzondering.
Het tegenstandersteam scoort normaal door.

  Hand                  Samenstelling                                                       Waarde
  --------------------- ------------------------------------------------------------------ -------
  Pairs (no wilds)      Zeven verschillende paren, geen wildcards                            2.500
  Wild Pairs            Zeven paren incl. azen, 7'en en één passend wildpaar                 2.000
  Miami Pairs           Zeven paren incl. azen, 7'en en beide wildparen                      2.500
  Zip Code              Twee paren + twee drietallen + één viertal, passende wilds mogen     2.500
  Straight              Eén kaart van elke rang, incl. een 3 en beide wilds                  3.000
  Garbage               Twee viertallen + twee drietallen, geen wilds                        3.000
  Blast Off             Vijftal + viertal + drietal + paar, passende wilds mogen             3.000
  Triples               Vier drietallen + een passend wildpaar                               3.500
  Quads                 Drie viertallen + een passend wildpaar                               3.500
  Dream Hand Plus 4     Twee vijftallen + vier passende wilds                                8.500
  Dream Hand Plus 5     Vijftal + viertal + vijf wilds                                       8.500

De twee Dream Hands winnen het spel direct.

Pagat kent voor Modern American slechts drie speciale handen en geeft
Garbage 2.000 in plaats van 3.000. Conform afspraak is de CLA leidend;
het verschil is vastgelegd als gedocumenteerd conflict en via huisregels
aanpasbaar.

## 3.3 Rondescore Modern American is toestandsafhankelijk

Anders dan bij Classic is de rondescore geen simpele optelsom. Het aantal
voltooide Canasta's van een team bepaalt hoe elk onderdeel meetelt:

  Onderdeel                     Geen Canasta   Eén Canasta   Twee of meer   Speciale hand
  ----------------------------- -------------- ------------- -------------- ---------------
  Canasta- en uitgaanbonussen   --             optellen      optellen       --
  Straffen onvolledige Canasta  aftrekken      aftrekken     aftrekken      --
  Drieën                        aftrekken      --            optellen       --
  Waarde gemelde kaarten        **aftrekken**  optellen      optellen       --
  Kaarten in hand               aftrekken      aftrekken     aftrekken      --
  Speciale hand                 --             --            --             optellen

Het aantal voltooide Canasta's is daarmee een **invoerveld** van de
ronde, en de score-engine moet deze drie takken uit de regelset kunnen
afleiden — als expressie, niet als variantcode.

### Custom / Huisregels

De gebruiker moet een bestaande regelset kunnen kopiëren en aanpassen.

Voorbeeld:

``` text
Classic Canasta
   ↓ kopiëren
Mijn Canasta
   ├── doel = 5000
   ├── uitgaan = Canasta vereist
   ├── rode 3 = 100
   └── joker in eerste meld toegestaan
```

------------------------------------------------------------------------

# 4. Regelset versus spelinstellingen

Dit onderscheid is essentieel.

## Regelset

Een regelset beschrijft de spelregels.

Bijvoorbeeld:

``` json
{
  "id": "classic",
  "name": "Classic Canasta",
  "players": 4,
  "teams": 2,
  "cardsPerPlayer": 11,
  "targetScore": 5000
}
```

## Spelinstellingen

Een specifieke partij kan daarvan afwijken:

``` json
{
  "ruleSetId": "classic",
  "targetScore": 5000,
  "players": [],
  "teams": [],
  "options": {}
}
```

De app moet altijd de **effectieve spelconfiguratie** opslaan.

Wanneer later de regelset wordt aangepast, mag een bestaand spel niet
veranderen.

------------------------------------------------------------------------

# 5. Instellingen bij nieuw spel

Het scherm **Nieuw spel** bestaat uit meerdere stappen.

## Stap 1 --- Regelset

``` text
Kies spelvariant

○ Classic Canasta
○ Modern American Canasta
○ Two-Handed Canasta
○ Mijn Canasta
```

Bij iedere regelset toont de app een korte samenvatting:

``` text
Classic Canasta

4 spelers
2 teams
11 kaarten
Doel: 5.000 punten
```

------------------------------------------------------------------------

# 6. Stap 2 --- Spelers

De app toont alleen het aantal spelers dat door de gekozen regelset
wordt ondersteund.

Voor Classic:

``` text
Speler 1 [ Michel ]
Speler 2 [ Paul ]
Speler 3 [ Anne ]
Speler 4 [ Karin ]
```

------------------------------------------------------------------------

# 7. Stap 3 --- Teams

Bij een partnership-regelset:

``` text
Team A
Michel
Anne

Team B
Paul
Karin
```

De gebruiker kan:

-   teamnaam wijzigen;
-   spelers wisselen;
-   teamvolgorde aanpassen.

------------------------------------------------------------------------

# 8. Stap 4 --- Spelregels

De app toont alleen instellingen die relevant zijn voor de gekozen
regelset.

Voor Classic:

### Basis

``` text
Doelscore              [ 5000 ]
Kaarten per speler     [ 11 ]
Aantal teams           [ 2 ]
```

### Canasta

``` text
Natuurlijke Canasta    [ 500 ]
Gemengde Canasta       [ 300 ]
```

### Uitgaan

``` text
Canasta vereist        [ Aan ]
Uitgaan bonus          [ 100 ]
Verborgen uitgaan      [ Aan ]
```

### Rode drieën

``` text
1 rode 3               [ 100 ]
2 rode 3               [ 200 ]
3 rode 3               [ 300 ]
4 rode 3               [ 800 ]
```

De standaardwaarde moet uit de regelset komen. De gebruiker kan deze
alleen aanpassen als de regelset dit toestaat.

------------------------------------------------------------------------

# 9. Instellingencategorieën

De configuratie-engine moet verschillende categorieën ondersteunen.

## 9.1 Setup

``` text
playerCount
teamCount
cardsPerPlayer
deckCount
jokerCount
```

## 9.2 Score

``` text
targetScore
cardValues
goingOutBonus
```

## 9.3 Canasta

``` text
naturalCanastaBonus
mixedCanastaBonus
wildCanastaBonus
specialCanastas
```

## 9.4 Threes

``` text
redThreeRules
blackThreeRules
threePenalty
threeBonus
```

## 9.5 Initial meld

``` text
initialMeldEnabled
initialMeldThresholds
countCanastaBonusForInitialMeld
countTopDiscardCardForInitialMeld
```

## 9.6 Uitgaan

``` text
canastaRequired
minimumCanastas
goingOutBonus
concealedGoingOutEnabled
```

## 9.7 Hand penalties

``` text
cardsInHandPenalty
incompleteCanastaPenalty
specialCardPenalties
```

## 9.8 Special hands

``` text
specialHandsEnabled
specialHands[]
```

------------------------------------------------------------------------

# 10. Instellingen moeten dynamisch zijn

De UI mag niet bestaan uit één gigantische instellingenpagina.

Een instelling heeft metadata:

``` json
{
  "key": "targetScore",
  "label": "Doelscore",
  "type": "number",
  "default": 5000,
  "min": 1000,
  "max": 50000,
  "category": "score"
}
```

Een andere:

``` json
{
  "key": "canastaRequiredToGoOut",
  "label": "Canasta vereist om uit te gaan",
  "type": "boolean",
  "default": true,
  "category": "goingOut"
}
```

De UI wordt hiermee gegenereerd vanuit de regelset.

Dit voorkomt hardcoded spelregels in de frontend.

------------------------------------------------------------------------

# 11. Huisregels

De gebruiker moet niet alleen een volledige regelset kunnen kiezen.

Hij moet ook kunnen zeggen:

> Wij spelen Classic Canasta, maar met onze eigen tafelregels.

Daarom:

``` text
Regelset
[ Classic Canasta ]

Aanpassingen
────────────────────
Doelscore              5000
Kaarten per speler     11
Canasta vereist        Ja
Uitgaan bonus          100
Rode 3                 100
```

Een gewijzigde instelling krijgt intern de status:

``` text
overridden = true
```

De app kan dan tonen:

``` text
Classic Canasta · 2 huisregels
```

------------------------------------------------------------------------

# 12. Presets

De app moet presets ondersteunen.

Voorbeelden:

``` text
Classic Canasta
Modern American
Mijn Classic
Mijn Familie Canasta
```

Een preset is een opgeslagen regelconfiguratie.

De gebruiker kan:

-   preset gebruiken;
-   preset kopiëren;
-   preset aanpassen;
-   preset verwijderen;
-   preset terugzetten naar standaard.

De ingebouwde standaardregelsets mogen niet overschreven worden.

------------------------------------------------------------------------

# 13. Spelstatus

Een game bewaart altijd de exacte regelconfiguratie waarmee het spel
gestart is.

Conceptueel:

``` json
{
  "gameId": "...",
  "ruleSet": {
    "id": "classic",
    "version": 1,
    "configuration": {}
  },
  "players": [],
  "teams": [],
  "rounds": []
}
```

Dit is belangrijk.

Een later gewijzigde Classic-regelset mag een bestaand spel **niet**
beïnvloeden.

------------------------------------------------------------------------

# 14. Score Engine

De score-engine gebruikt de gekozen regels, niet een ingebakken variant.

Voorbeeld:

``` text
Classic
    naturalCanasta = +500

Modern American
    naturalCanasta = +500
    maar Aces/7s hebben afwijkende waarden (2.500)

Custom
    naturalCanasta = configuratiewaarde
```

## 14.1 Vier gescheiden verantwoordelijkheden

De engine bestaat uit vier functies. Er komt **geen** enkele functie die
deze verantwoordelijkheden combineert.

``` ts
calculateRoundScore(ruleSet, roundInput)
    // uitsluitend punten, plus de audit trail van §22

validateRound(ruleSet, gameState, roundInput)
    // uitsluitend regelcontrole; levert violations en warnings

evaluateRound(ruleSet, gameState, roundInput)
    // combineert scoring, validatie en uitgaan/eindspel-logica

recomputeGame(game)
    // berekent alle cumulatieve standen opnieuw
```

`recomputeGame` is een pure, sequentiële fold: de openingsmeldingsgrens
van ronde *n* hangt af van de stand vóór ronde *n*, dus een correctie in
ronde 2 kan niet ter plekke gecorrigeerd worden. Daarom is `RoundInput`
de enige waarheid en is al het andere afgeleid.

## 14.2 Rule effects

Een scorekaart kan niet waarnemen hoeveel kaarten iemand trok. Elke regel
krijgt daarom een effect-categorie:

``` ts
type RuleEffect = "computed" | "validation" | "advisory";
```

  Effect        Betekenis                                          Voorbeelden
  ------------- -------------------------------------------------- --------------------------------------------------------
  computed      beïnvloedt de berekende score                       `cardPoints`, `naturalCanastaBonus`, `mixedCanastaBonus`, `redThreeBonus`, `goingOutBonus`
  validation    bepaalt of invoer technisch/reglementair geldig is   `minimumCanastasToGoOut`, `minimumCardsForMeld`, `maximumWildCards`
  advisory      wordt getoond, maar is niet te berekenen             `drawCount`, `discardRules`, `partnerPermission`, `talonRules`

Alleen `computed`-regels komen in de score-engine terecht.
`validation`-regels leven in `validateRound`. `advisory`-regels worden
uitsluitend in **Regels bekijken** (§18) getoond.

## 14.3 RoundInput is regelset-onafhankelijk

`RoundInput` gebruikt een gedeelde veldcatalogus van concepten die alle
Canasta-varianten kennen. De regelset bepaalt welke velden relevant,
zichtbaar, verplicht of optioneel zijn --- de velden zelf zijn niet
variant-specifiek.

``` ts
interface RoundInput {
  teams: {
    teamId: string;
    cardPoints: number;
    cardsInHand: number;
    naturalCanastas: number;
    mixedCanastas: number;
    redThrees: number;
    opened: boolean;
    wentOut: boolean;
    concealedGoingOut: boolean;
    extra?: Record<string, ScoreInputValue>;
  }[];
}
```

`extra` draagt wat werkelijk variant-eigen is, zoals de wildcard-,
azen- en 7'en-Canasta's, de speciale handen en de onvolledige melds van
Modern American. Ook die velden worden door de regelset gedeclareerd met
label, type en zichtbaarheidsvoorwaarde, en door de UI uit een registry
gerenderd. **Geen enkel Classic- of Modern-specifiek veld staat in
React-code.**

## 14.4 Historische reproduceerbaarheid

Bij iedere scoreberekening wordt `engineVersion` meegeschreven. Levert
een herberekening een ander resultaat dan de opgeslagen score, dan geldt:

1.  de originele score blijft behouden;
2.  het verschil wordt zichtbaar gemeld;
3.  de gebruiker kiest of er opnieuw berekend wordt.

Een nieuwe versie van de engine mag oude scores nooit stilzwijgend
wijzigen.

------------------------------------------------------------------------

# 15. Geen if/else spaghetti

Dit moet worden voorkomen:

``` javascript
if (variant === "classic") ...
else if (variant === "modern") ...
else if (variant === "samba") ...
```

Regels moeten zoveel mogelijk declaratief zijn.

Bijvoorbeeld:

``` json
{
  "scoring": {
    "cardValues": {
      "joker": 50,
      "ace": 20,
      "two": 20
    },
    "canastas": {
      "natural": 500,
      "mixed": 300
    },
    "goingOut": {
      "normal": 100
    }
  }
}
```

Complexe regels mogen een specifieke rule-module hebben, maar de
algemene architectuur blijft hetzelfde.

------------------------------------------------------------------------

# 16. Classic Canasta --- standaardconfiguratie

De standaard Classic-configuratie:

``` json
{
  "id": "classic",
  "players": {
    "count": 4,
    "cardsPerPlayer": 11
  },
  "teams": {
    "count": 2
  },
  "deck": {
    "standardDecks": 2,
    "jokers": 4
  },
  "game": {
    "targetScore": 5000
  },
  "initialMeld": {
    "thresholds": [
      { "minScore": null, "maxScore": -1, "required": 15 },
      { "minScore": 0, "maxScore": 1495, "required": 50 },
      { "minScore": 1500, "maxScore": 2995, "required": 90 },
      { "minScore": 3000, "maxScore": null, "required": 120 }
    ]
  }
}
```

De grenzen `1495` en `2995` zijn de letterlijke waarden uit Pagat én
Bicycle; eerdere versies van deze specificatie schreven `1499` en `2999`.
Rekenkundig maakt dat geen verschil omdat alle Canasta-scores veelvouden
van 5 zijn, maar de bronwaarde is leidend.

De drempels worden als configureerbare data opgeslagen, nooit als
hardcoded logica. `validateRuleSet()` controleert dat de staffel
aaneensluitend is: geen gaten, geen overlap, en dekking van −∞ tot +∞.

------------------------------------------------------------------------

# 17. Belangrijk: verschillende bronnen kunnen verschillende regels geven

De app moet geen schijnzekerheid creëren.

Iedere ingebouwde regelset bevat daarom bronmetadata:

``` json
{
  "source": {
    "name": "Canasta League of America",
    "title": "Modern American Canasta: How to Play, Meld, and Score",
    "url": "https://canastaleague.org/rules/",
    "retrievedAt": "2026-09-19"
  }
}
```

Daarnaast bevat iedere regelset een `provenance`-blok dat vastlegt welke
configuratiepaden **niet** uit de primaire bron konden worden bevestigd:

``` json
{
  "provenance": {
    "unverified": ["players.count", "deck.standardDecks"],
    "notes": "De CLA noemt spelers- en deckaantal niet; aangevuld uit Pagat."
  }
}
```

Is `provenance` niet leeg, dan toont **Regels bekijken** dat expliciet.
Een waarde die in geen enkele bron staat, wordt niet ingevuld en niet
geraden.

## 17.1 Statusterminologie

Iedere regelwaarde draagt één van vijf statussen. Ze bestaan om te
voorkomen dat een app-keuze ooit als officiële Canasta-regel wordt
gepresenteerd.

  Status               Betekenis
  -------------------- ----------------------------------------------------------------------
  `verified`           Letterlijk bevestigd door de primaire bron van die regelset.
  `secondary-source`   Niet vermeld door de primaire bron; aangevuld uit een secundaire bron, die erbij staat.
  `app-policy`         Een keuze van de app, door geen enkele bron voorgeschreven.
  `configurable`       Instelbaar via huisregels; de waarde is slechts de standaard.
  `not-specified`      Geen enkele bron beschrijft dit. Niet ingevuld.

**Bronvoorrang.** "De CLA is leidend voor Modern American" betekent dat
de CLA voorrang heeft bij *conflicterende* regels --- niet dat Pagat
onbruikbaar is. Noemt de CLA een setup-detail niet, dan vult Pagat aan en
krijgt die waarde de status `secondary-source`.

## 17.2 Afgehandelde open punten

  Punt                                       Beslissing                      Status
  ------------------------------------------ ------------------------------- -----------------------------------------
  Exact gelijkspel                           `play-extra-round`              `app-policy` + `configurable`
  Modern American spelers/decks              4 spelers, 2 teams, 2 decks     `secondary-source` (Pagat)
  The Splash (Modern American)               standaard uit                   `not-specified` + `configurable`
  Zwarte drie bevriest de stapel (Classic)   standaard nee (Pagat)           `verified` + `configurable`
  Garbage (Modern American)                  3.000                           `verified` (CLA)
  Verborgen uitgaan (Modern American)        standaard uit                   `not-specified` + `configurable`

Twee formuleringen moeten in de UI letterlijk zo worden aangehouden:

-   **Gelijkspel** is een app-keuze, geen regel: *"Bij exact gelijkspel
    speelt deze app een extra ronde. Geen van de geraadpleegde bronnen
    beschrijft deze situatie."*
-   **Verborgen uitgaan bij Modern American** is ontbrekende informatie,
    geen verbod: *"De Canasta League of America beschrijft verborgen
    uitgaan niet voor Modern American. Deze regelset heeft het daarom uit
    staan; via huisregels is het in te schakelen."*

De app kan in **Regels bekijken** tonen:

``` text
Modern American Canasta

Bron:
Canasta League of America

Deze regelset gebruikt 8.500 punten
als einddoel.
```

------------------------------------------------------------------------

# 18. Spelregels bekijken

Tijdens een spel moet de gebruiker de actieve regels kunnen bekijken.

Bijvoorbeeld:

``` text
Classic Canasta

Doel
5.000 punten

Kaarten
11 per speler

Canasta
Natural +500
Mixed +300

Uitgaan
+100
Canasta vereist

Rode 3
+100 per stuk
4 rode 3's = +800
```

Dit scherm is alleen-lezen.

------------------------------------------------------------------------

# 19. Wijzigen van regels tijdens een spel

Standaard:

**Niet toegestaan.**

Als de gebruiker toch een regel wil wijzigen:

``` text
Deze regels zijn gekoppeld aan het spel.

Wijzigen?

[Annuleren]
[Nieuwe configuratie maken]
```

Beter is om een spel te kunnen dupliceren:

``` text
Spel kopiëren
→ nieuwe regelset kiezen
→ verder spelen
```

------------------------------------------------------------------------

# 20. Score-invoer

De score-invoer blijft afhankelijk van de actieve regelset.

Classic:

``` text
Kaartpunten op tafel
[420]

Kaarten in hand
[35]

Natural Canasta
[ 1 ]

Mixed Canasta
[ 1 ]

Rode drieën
[ 2 ]

Uitgegaan
[Normaal]

----------------
+1.485
```

Modern American kan een andere invoer tonen, bijvoorbeeld speciale
Canasta's of Special Hands.

De UI mag dus niet aannemen dat iedere variant dezelfde scorevelden
heeft.

------------------------------------------------------------------------

# 21. Dynamische scorevelden

Een rule set definieert zijn scorecomponenten.

Bijvoorbeeld:

``` json
{
  "scoreComponents": [
    {
      "id": "meldCardPoints",
      "type": "points",
      "label": "Kaartpunten op tafel"
    },
    {
      "id": "naturalCanastas",
      "type": "count",
      "label": "Natuurlijke Canasta's"
    },
    {
      "id": "mixedCanastas",
      "type": "count",
      "label": "Gemengde Canasta's"
    },
    {
      "id": "redThrees",
      "type": "count",
      "label": "Rode drieën"
    },
    {
      "id": "goingOut",
      "type": "choice",
      "label": "Uitgaan"
    }
  ]
}
```

De scorepagina wordt hierdoor gegenereerd.

------------------------------------------------------------------------

# 22. Scoreberekening

Algemeen:

``` text
roundScore =
    Σ positiveScoreComponents
    - Σ penalties
```

Iedere rule set bepaalt welke componenten bestaan.

De engine levert daarnaast een **audit trail**:

``` json
{
  "components": [
    {
      "id": "meldCardPoints",
      "label": "Kaartpunten",
      "value": 420
    },
    {
      "id": "naturalCanastaBonus",
      "label": "Natural Canasta",
      "value": 500
    },
    {
      "id": "mixedCanastaBonus",
      "label": "Mixed Canasta",
      "value": 300
    },
    {
      "id": "redThreeBonus",
      "label": "Rode drieën",
      "value": 200
    },
    {
      "id": "goingOutBonus",
      "label": "Uitgaan",
      "value": 100
    },
    {
      "id": "handPenalty",
      "label": "Kaarten in hand",
      "value": -35
    }
  ],
  "total": 1485
}
```

Hierdoor kan de UI precies uitleggen waar de score vandaan komt.

------------------------------------------------------------------------

# 23. Scorecorrecties

Een gebruiker moet een ronde kunnen openen en wijzigen.

Na wijziging:

``` text
roundScore opnieuw berekenen
↓
alle totalen opnieuw berekenen
↓
einde-spel opnieuw bepalen
↓
openingsmeldingsgrens volgende ronde opnieuw bepalen
```

De scoregeschiedenis wordt dus altijd opnieuw afgeleid uit de
rondegegevens.

------------------------------------------------------------------------

# 24. Spelgeschiedenis

Per spel:

``` text
Naam
Regelset
Datum
Spelers
Teams
Doelscore
Resultaat
Rondes
```

Voorbeeld:

``` text
19 september 2026
Michel / Anne
tegen
Paul / Karin

Classic Canasta
5.000 punten

5.420 — 4.870
Team Michel / Anne
```

------------------------------------------------------------------------

# 25. PWA / offline-first

De app moet volledig offline werken.

Architectuur:

``` text
PWA
│
├── UI
│
├── Application
│   ├── StartGame
│   ├── AddRound
│   ├── EditRound
│   └── FinishGame
│
├── Domain
│   ├── Game
│   ├── Player
│   ├── Team
│   ├── Round
│   ├── RuleSet
│   └── Score
│
├── Rules
│   ├── Classic
│   ├── ModernAmerican
│   ├── TwoHanded
│   └── Custom
│
├── Score Engine
│
└── Storage
    └── IndexedDB / Dexie
```

------------------------------------------------------------------------

# 26. Datamodel

## RuleSet

``` text
RuleSet
├── id
├── name
├── description
├── version
├── category
├── source
├── configuration
├── scoreComponents
└── capabilities
```

## Game

``` text
Game
├── id
├── ruleSetId
├── ruleSetVersion
├── effectiveConfiguration
├── createdAt
├── updatedAt
├── status
└── targetScore
```

## Player

``` text
Player
├── id
├── gameId
└── name
```

## Team

``` text
Team
├── id
├── gameId
└── name
```

## TeamMember

``` text
TeamMember
├── teamId
└── playerId
```

## Round

``` text
Round
├── id
├── gameId
├── number
├── createdAt
└── status
```

## RoundScore

``` text
RoundScore
├── id
├── roundId
├── teamId
├── input
├── calculatedComponents
└── total
```

------------------------------------------------------------------------

# 27. RuleSet JSON

Voorbeeld:

``` json
{
  "id": "classic",
  "name": "Classic Canasta",
  "version": 1,

  "players": {
    "min": 4,
    "max": 4,
    "default": 4
  },

  "teams": {
    "min": 2,
    "max": 2,
    "default": 2
  },

  "dealing": {
    "cardsPerPlayer": 11
  },

  "deck": {
    "standardDecks": 2,
    "jokers": 4
  },

  "game": {
    "targetScore": 5000
  },

  "scoring": {
    "cardValues": {
      "joker": 50,
      "ace": 20,
      "two": 20,
      "king": 10,
      "queen": 10,
      "jack": 10,
      "ten": 10,
      "nine": 10,
      "eight": 10,
      "seven": 5,
      "six": 5,
      "five": 5,
      "four": 5
    },

    "canastas": {
      "natural": 500,
      "mixed": 300
    },

    "goingOut": {
      "none": 0,
      "normal": 100,
      "concealed": 200
    }
  },

  "threes": {
    "red": {
      "enabled": true,
      "valueByCount": [0, 100, 200, 300, 800],
      "requiresMeld": true,
      "maxPerTeam": 4
    },
    "black": {
      "enabled": false,
      "meldValue": 5,
      "stopCard": true
    }
  },

  "initialMeld": {
    "enabled": true,
    "thresholds": [
      { "minScore": null, "maxScore": -1,   "required": 15  },
      { "minScore": 0,    "maxScore": 1495, "required": 50  },
      { "minScore": 1500, "maxScore": 2995, "required": 90  },
      { "minScore": 3000, "maxScore": null, "required": 120 }
    ]
  },

  "goOut": {
    "minimumCanastas": 1,
    "concealedEnabled": true
  },

  "endGame": {
    "targetScore": 5000,
    "evaluateAfterRound": true,
    "winner": {
      "strategy": "highest-score",
      "tie": "play-extra-round"
    }
  }
}
```

Twee notaties uit eerdere versies zijn vervangen:

-   de drempels gebruiken één vorm, `{ minScore, maxScore, required }`
    met `null` voor onbegrensd, in plaats van de twee verschillende
    vormen die §16 en §27 eerder door elkaar gebruikten;
-   `goingOut` is een **map op de gekozen waarde**, niet een set losse
    getallen. Verborgen uitgaan levert 200 in totaal en **vervangt** de
    normale 100 — het stapelt niet tot 300.

`endGame.winner.tie` is een app-keuze, geen bronregel; zie §17.

------------------------------------------------------------------------

# 28. Capabilities

Een rule set moet aangeven welke mogelijkheden hij ondersteunt.

``` json
{
  "capabilities": {
    "initialMeld": true,
    "redThrees": true,
    "blackThrees": false,
    "specialHands": false,
    "wildCanastas": false,
    "concealedGoingOut": true,
    "multipleCanastaTypes": true
  }
}
```

De UI gebruikt deze capabilities om te bepalen welke functies zichtbaar
zijn.

------------------------------------------------------------------------

# 29. Instellingenmodel

Een instelling:

``` json
{
  "key": "targetScore",
  "label": "Doelscore",
  "type": "number",
  "default": 5000,
  "editable": true,
  "category": "game"
}
```

Een keuze:

``` json
{
  "key": "goingOutRule",
  "label": "Uitgaan",
  "type": "select",
  "options": [
    {
      "value": "canastaRequired",
      "label": "Canasta vereist"
    },
    {
      "value": "canastaNotRequired",
      "label": "Canasta niet vereist"
    }
  ]
}
```

Een toggle:

``` json
{
  "key": "concealedGoingOut",
  "label": "Verborgen uitgaan",
  "type": "boolean",
  "default": true
}
```

------------------------------------------------------------------------

# 30. Configuratievalidatie

Wanneer de gebruiker instellingen verandert, moet de app controleren of
de combinatie logisch is.

Voorbeelden:

``` text
targetScore > 0
cardsPerPlayer > 0
naturalCanastaBonus >= 0
mixedCanastaBonus >= 0
redThrees <= 4
```

Maar ook domeinregels:

``` text
concealedGoingOut = true
→ goingOut moet een waarde voor concealed hebben
```

Een regelset kan dus niet alleen waarden bevatten, maar ook
**constraints op de configuratie**.

> Eerdere versies noemden hier de constraint
> `minimumCanastasToGoOut <= maximumCanastas`. `maximumCanastas` bestaat
> niet in het datamodel en heeft ook geen principiële bovengrens --- die
> hangt af van dekgrootte en geluk. De constraint is vervangen door een
> redelijkheidsgrens op `goOut.minimumCanastas`.

## 30.1 validateRuleSet()

Naast configuratievalidatie tijdens het bewerken, moet `validateRuleSet()`
vóór runtime kunnen aantonen dat een ingebouwde regelset compleet en
consistent is. Minimaal wordt gecontroleerd:

-   alle gerefereerde veld-id's bestaan;
-   alle expressie-id's bestaan;
-   configuratietypen kloppen;
-   verplichte instellingen zijn aanwezig;
-   score-componenten zijn geldig;
-   er zijn geen onbekende regelreferenties;
-   er zijn geen onmogelijke configuraties (gaten of overlap in de
    openingsmeldingsstaffel, een ingeschakelde functie zonder
    bijbehorende waarde).

Acceptatiecriterium: alle drie ingebouwde regelsets leveren
`validateRuleSet() => nul fouten`. Een fout in handgeschreven
regelset-data faalt daarmee bij de build, niet aan de kaarttafel.

------------------------------------------------------------------------

# 31. Regelset-editor

Voor geavanceerde gebruikers:

``` text
Regelsets

[ Classic Canasta ]
[ Modern American ]
[ Mijn Canasta ]

                   + Nieuwe regelset
```

Bij openen:

``` text
Basis
Scoring
Canasta's
3'en
Initial meld
Uitgaan
Speciale handen
Straffen
Geavanceerd
```

De editor mag in versie 1 eenvoudig zijn. Belangrijker is dat de
onderliggende architectuur het ondersteunt.

------------------------------------------------------------------------

# 32. Geen cloud-afhankelijkheid

Versie 1:

-   geen login;
-   geen account;
-   geen server;
-   geen cloud;
-   geen tracking;
-   geen analytics;
-   gegevens lokaal.

Later kan synchronisatie worden toegevoegd zonder de domeinlaag aan te
passen.

------------------------------------------------------------------------

# 33. Export / import

Een volledig spel moet geëxporteerd kunnen worden.

``` json
{
  "format": "canasta-score",
  "version": 2,

  "ruleSet": {
    "id": "classic",
    "version": 1,
    "configuration": {}
  },

  "game": {},
  "players": [],
  "teams": [],
  "rounds": []
}
```

Hiermee kan een spel naar een ander apparaat worden overgezet.

------------------------------------------------------------------------

# 34. Regels en bronnen

Elke ingebouwde regelset heeft een bronverwijzing. Dit zijn de bronnen
die in Fase 0 daadwerkelijk zijn gebruikt, alle opgehaald op 2026-09-19:

  Regelset            Bron                            URL                                          Rol
  ------------------- ------------------------------- -------------------------------------------- -----------
  Classic             Pagat --- *Canasta: rules and variations*   https://www.pagat.com/rummy/canasta.html        primair
  Classic             Bicycle --- *Canasta Rules*                 https://bicyclecards.com/how-to-play/canasta    secundair
  Modern American     Canasta League of America --- *Modern American Canasta*   https://canastaleague.org/rules/  **leidend**
  Modern American     Pagat --- *Modern American Canasta*         https://www.pagat.com/rummy/canasta.html        aanvullend
  Two-Handed          Pagat --- *Canasta for two players*         https://www.pagat.com/rummy/canasta.html        primair

``` json
{
  "source": {
    "name": "Pagat",
    "title": "Canasta: rules and variations",
    "url": "https://www.pagat.com/rummy/canasta.html",
    "retrievedAt": "2026-09-19"
  }
}
```

De bronverwijzing is belangrijk omdat Canasta-regels tussen varianten en
zelfs tussen tafelregels verschillen. Pagat stelt over Modern American
expliciet dat er geen algemeen aanvaarde regelset bestaat.

Waar bronnen elkaar tegenspreken, is dat vastgelegd in
[`docs/RULESET_RESEARCH.md`](docs/RULESET_RESEARCH.md) en niet stil
opgelost. De belangrijkste gedocumenteerde conflicten:

-   **Garbage** (Modern American): CLA 3.000, Pagat 2.000 --- CLA is
    leidend;
-   **Onvolledige wildcard-meld met vier jokers**: CLA −2.000, Pagat
    −2.500 --- CLA is leidend;
-   **Zwarte drie bevriest de aflegstapel** (Classic): Pagat nee,
    Bicycle ja --- Pagat is leidend, instelbaar;
-   **Speciale handen** (Modern American): CLA kent er elf, Pagat drie
    --- CLA is leidend.

------------------------------------------------------------------------

# 35. Uitbreidbaarheid

De architectuur moet later minimaal ruimte bieden voor:

-   Classic;
-   Modern American;
-   Two-Handed;
-   Three-Handed;
-   Samba;
-   Bolivia;
-   Hand & Foot;
-   Pennies;
-   eigen huisregels.

Er bestaan Canasta-varianten met onder andere meer decks, andere
doelscores en sequenties, zoals Samba en Bolivia. Deze zijn in Fase 0
**niet** onderzocht; hun waarden zijn dus niet vastgelegd en mogen niet
worden geraden wanneer ze later worden toegevoegd.

Deze varianten mogen niet worden geforceerd in een Classic-model.

De rule engine moet daarom onderscheid maken tussen:

``` text
shared concepts
```

en:

``` text
variant-specific concepts
```

------------------------------------------------------------------------

# 36. Technisch kernprincipe

De applicatie bestaat uit drie gescheiden lagen:

``` text
┌─────────────────────────────┐
│             UI              │
│      PWA / Components       │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│      Application Layer      │
│ StartGame / AddRound / etc. │
└──────────────┬──────────────┘
               │
       ┌───────┴────────┐
       ▼                ▼
┌──────────────┐  ┌───────────────┐
│ Rule Engine  │  │ Game Storage  │
│ Score Engine │  │ IndexedDB      │
└──────────────┘  └───────────────┘
```

De UI kent geen spelregels.

De score-engine kent geen UI.

De opslaglaag kent geen scorelogica.

------------------------------------------------------------------------

# 37. Eerste implementatiefase

De aanbevolen bouwvolgorde:

### Fase 1 --- Domain

-   Game
-   Player
-   Team
-   Round
-   RuleSet
-   Score

### Fase 2 --- Rule engine

-   Classic Canasta
-   configuratiemodel
-   score engine
-   openingsmeldingsberekening

### Fase 3 --- Storage

-   IndexedDB
-   Dexie
-   autosave
-   game recovery

### Fase 4 --- PWA

-   manifest
-   service worker
-   offline cache
-   installable app

### Fase 5 --- UI

-   nieuw spel
-   regelset kiezen
-   spelers
-   teams
-   instellingen
-   score invoeren
-   score-overzicht

### Fase 6 --- History

-   spelgeschiedenis
-   ronde-detail
-   correcties
-   export/import

### Fase 7 --- Additional rule sets

-   Modern American
-   Two-Handed
-   custom rules

------------------------------------------------------------------------

# 38. UX-doel

Een speler moet tijdens een ronde vooral denken:

> "Wat hebben wij deze ronde gehaald?"

Niet:

> "Hoe werkt deze puntentelling ook alweer?"

De app moet daarom automatisch rekenen en uitleggen.

Bijvoorbeeld:

``` text
Deze ronde

Kaarten       +420
Canasta's     +800
Rode 3's      +200
Uitgaan       +100
Hand          -35
────────────────
Totaal       +1485
```

De gebruiker kan op een component tikken voor uitleg:

``` text
Natural Canasta

7 natuurlijke kaarten
Bonus: +500
```

------------------------------------------------------------------------

# 39. Einddoel

De Canasta-app moet uiteindelijk voelen als:

> **Een digitale scorekaart + regelboek + scorecalculator in één.**

De gebruiker kiest één keer hoe hij speelt.

Daarna zorgt de app ervoor dat:

-   de juiste invoervelden verschijnen;
-   de juiste puntentelling wordt gebruikt;
-   de juiste openingsmeldingsgrens wordt getoond;
-   de juiste uitgaansvoorwaarden worden gebruikt;
-   de juiste eindscore wordt bepaald;
-   alle berekeningen uitlegbaar blijven.

Daarmee is de app niet alleen een Classic-Canasta-scorekaart, maar een
**configureerbare Canasta Score Engine** waarop verschillende
Canasta-varianten en huisregels kunnen worden gebouwd.
