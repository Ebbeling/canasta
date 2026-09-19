# Canasta regelonderzoek — Fase 0

**Opgehaald:** 2026-09-19
**Doel:** iedere regel die gedrag of scoring beïnvloedt vastleggen met bron, zodat de
implementatie geen enkele waarde hoeft te raden.

## Werkwijze

De drie bronpagina's zijn volledig opgehaald en als platte tekst uitgelezen (niet via een
samenvatting), zodat details zoals de exacte samenstelling van elke Special Hand meekomen.

| Code | Bron | URL | Rol |
|---|---|---|---|
| **P** | Pagat — *Canasta: rules and variations* | https://www.pagat.com/rummy/canasta.html | Primair voor Classic en Two-Handed; secundair voor Modern American |
| **B** | Bicycle — *Canasta Rules* | https://bicyclecards.com/how-to-play/canasta | Secundair voor Classic |
| **CLA** | Canasta League of America — *Modern American Canasta: How to Play, Meld, and Score* | https://canastaleague.org/rules/ | **Leidend** voor Modern American |

### Statusterminologie

Elke waarde in de implementatie draagt één van deze statussen. Ze bestaan om te voorkomen dat
een app-keuze ooit als officiële Canasta-regel wordt gepresenteerd.

| Status | Betekenis |
|---|---|
| `verified` | Letterlijk bevestigd door de primaire bron van die regelset. |
| `secondary-source` | Niet vermeld door de primaire bron, aangevuld uit een secundaire bron. De bron staat erbij. |
| `app-policy` | Een keuze van de app, door geen enkele bron voorgeschreven. Moet als zodanig getoond worden. |
| `configurable` | Instelbaar via huisregels; de genoteerde waarde is enkel de standaard. |
| `not-specified` | Geen enkele bron beschrijft dit. Niet ingevuld, niet geraden. |

Statussen kunnen stapelen: de standaardwaarde van "The Splash" is bijvoorbeeld
`not-specified` bij de CLA, `secondary-source` bij Pagat en in de app `configurable` met
standaard uit.

### Regels voor dit document

- Een waarde die de bron niet noemt, staat als `(niet vermeld)` met `Verified: nee`. Er wordt
  niets ingevuld, afgeleid of aangenomen zonder dat in `Notes` te zeggen.
- Waar twee bronnen elkaar tegenspreken staan **beide** waarden in `Conflicts`. Er is dan geen
  stille keuze; de keuze en de reden staan erbij, of de beslissing wordt doorgeschoven naar de
  sectie *Open beslissingen*.
- `Effect` verwijst naar de drie categorieën uit het plan:
  `computed` (beïnvloedt de berekende score) · `validation` (bepaalt of invoer reglementair
  geldig is) · `advisory` (wordt getoond, maar is door een scorekaart niet te berekenen).

---

# 1. Classic Canasta

Primaire bron **P**, gecontroleerd tegen **B**. De twee bronnen zijn het over vrijwel alle
scorewaarden eens; de verschillen staan in §1.13.

## 1.1 Opzet

| Rule | Value | Source | Source URL | Verified | Effect | Notes | Conflicts |
|---|---|---|---|---|---|---|---|
| players | 4 | P, B | pagat.com/rummy/canasta.html | ja | advisory | "four players in fixed partnerships, partners sitting opposite each other" | — |
| teams | 2 (partnerships) | P, B | pagat.com/rummy/canasta.html | ja | advisory | — | — |
| teamSize | 2 | P, B | pagat.com/rummy/canasta.html | ja | advisory | — | — |
| cardsPerPlayer | 11 | P, B | pagat.com/rummy/canasta.html | ja | advisory | "Each player is dealt 11 cards" | — |
| standardDecks | 2 | P, B | pagat.com/rummy/canasta.html | ja | advisory | "Two 52 card standard packs" | — |
| jokers | 4 | P, B | pagat.com/rummy/canasta.html | ja | advisory | "plus 4 jokers", twee uit elk pak | — |
| totalCards | 108 | P, B | pagat.com/rummy/canasta.html | ja | advisory | — | — |
| dealRotation | met de klok mee, na elke hand door | P, B | pagat.com/rummy/canasta.html | ja | advisory | B: eerste deler is de speler rechts van wie de hoogste kaart trok | — |
| upcard | bovenste kaart van de stok wordt omgedraaid als start van de aflegstapel | P, B | pagat.com/rummy/canasta.html | ja | advisory | Is die kaart wild of een rode drie, dan wordt er doorgedraaid; de stapel is dan bevroren | **Ja** — zie §1.13 nr. 2 |

## 1.2 Kaartwaarden

| Rule | Value | Source | Source URL | Verified | Effect | Notes | Conflicts |
|---|---|---|---|---|---|---|---|
| joker | 50 | P, B | pagat.com/rummy/canasta.html | ja | computed | — | — |
| ace | 20 | P, B | pagat.com/rummy/canasta.html | ja | computed | — | — |
| two (wild) | 20 | P, B | pagat.com/rummy/canasta.html | ja | computed | — | — |
| king, queen, jack, ten, nine, eight | 10 | P, B | pagat.com/rummy/canasta.html | ja | computed | — | — |
| seven, six, five, four | 5 | P, B | pagat.com/rummy/canasta.html | ja | computed | — | — |
| black three | 5 | P, B | pagat.com/rummy/canasta.html | ja | computed | P: "Black threes are worth 5 points each" bij het tellen van gemelde kaarten | — |
| red three | geen kaartwaarde; aparte bonus | P, B | pagat.com/rummy/canasta.html | ja | computed | Rode drieën tellen niet als gemelde kaartwaarde, zie §1.7 | — |

## 1.3 Trekken, afleggen, aflegstapel

| Rule | Value | Source | Source URL | Verified | Effect | Notes | Conflicts |
|---|---|---|---|---|---|---|---|
| drawCount | 1 | P, B | pagat.com/rummy/canasta.html | ja | advisory | "drawing the top card of the stock" | — |
| discardCount | 1 | P, B | pagat.com/rummy/canasta.html | ja | advisory | Elke beurt eindigt met één afgelegde kaart | — |
| takePile (niet bevroren), natuurlijke bovenkaart | twee kaarten uit de hand die met de bovenkaart een geldige meld vormen (twee natuurlijke, óf één natuurlijke + één wild), óf toevoegen aan een bestaande meld van die rang | P, B | pagat.com/rummy/canasta.html | ja | advisory | — | — |
| takePile verboden bij | bovenkaart is wild of een zwarte drie | P, B | pagat.com/rummy/canasta.html | ja | advisory | B voegt toe: ook niet bij een rode drie als bovenkaart | — |
| frozen: wild in de stapel | bevroren tegen alle spelers | P, B | pagat.com/rummy/canasta.html | ja | advisory | Wildcard dwars gelegd | — |
| frozen: rode drie als startkaart | bevroren tegen alle spelers | P, B | pagat.com/rummy/canasta.html | ja | advisory | — | — |
| frozen: team heeft nog niet gemeld | bevroren tegen dat team | P, B | pagat.com/rummy/canasta.html | ja | advisory | — | — |
| frozen: zwarte drie als opgedraaide/afgelegde kaart | **P: nee, bevriest niet** · **B: ja, bevriest** | P, B | zie §1.13 | nee | advisory | Bronnen spreken elkaar tegen | **Ja** — §1.13 nr. 2 |
| takePile bij bevroren stapel | alleen met twee natuurlijke kaarten van dezelfde rang als de bovenkaart | P, B | pagat.com/rummy/canasta.html | ja | advisory | — | — |
| talon / bonuskaarten | bestaat niet in Classic | P, B | pagat.com/rummy/canasta.html | ja | advisory | Alleen Modern American kent een talon | — |

## 1.4 Melden en wildcards

| Rule | Value | Source | Source URL | Verified | Effect | Notes | Conflicts |
|---|---|---|---|---|---|---|---|
| minMeldSize | 3 | P, B | pagat.com/rummy/canasta.html | ja | validation | — | — |
| minNaturalPerMeld | 2 | P, B | pagat.com/rummy/canasta.html | ja | validation | "Every meld must contain at least two natural cards" | — |
| maxWildsPerMeld | 3 | P, B | pagat.com/rummy/canasta.html | ja | validation | Een canasta bevat dus minstens 4 natuurlijke kaarten | — |
| maxMeldSize | onbeperkt | P | pagat.com/rummy/canasta.html | ja | validation | "Melds can grow as large as you wish" | — |
| wildOnlyMelds | niet toegestaan | P | pagat.com/rummy/canasta.html | ja | validation | "melds consisting entirely of wild cards are not allowed" | — |
| duplicateMeldSameRank | niet toegestaan binnen één team; gelijke rang bij beide teams mag | P, B | pagat.com/rummy/canasta.html | ja | validation | Gelijke rangen worden automatisch samengevoegd | — |
| meldOnOpponents | nooit | P, B | pagat.com/rummy/canasta.html | ja | validation | — | — |
| sequences | geen geldige meld | B | bicyclecards.com/how-to-play/canasta | ja | validation | "Sequences are not valid melds" | — |

## 1.5 Canasta-definities en bonussen

| Rule | Value | Source | Source URL | Verified | Effect | Notes | Conflicts |
|---|---|---|---|---|---|---|---|
| canastaSize | 7 of meer | P, B | pagat.com/rummy/canasta.html | ja | validation | — | — |
| natural canasta | 500 | P, B | pagat.com/rummy/canasta.html | ja | computed | Uitsluitend natuurlijke kaarten | — |
| mixed canasta | 300 | P, B | pagat.com/rummy/canasta.html | ja | computed | 1 t/m 3 wildcards | — |
| wild canasta | bestaat niet in Classic | P | pagat.com/rummy/canasta.html | ja | computed | P noemt het alleen als *variant*, met een typische bonus van 2000 — niet als standaardregel | — |
| kaartwaarden tellen bovenop de canastabonus | ja | P | pagat.com/rummy/canasta.html | ja | computed | "a natural canasta of seven kings is really worth 570 points altogether" | — |
| wild toevoegen aan pure canasta | maakt hem gemengd | P, B | pagat.com/rummy/canasta.html | ja | validation | — | — |

## 1.6 Initial meld

| Rule | Value | Source | Source URL | Verified | Effect | Notes | Conflicts |
|---|---|---|---|---|---|---|---|
| threshold: negatieve score | 15 | P, B | pagat.com/rummy/canasta.html | ja | validation | "i.e. no minimum" | — |
| threshold: 0 t/m 1.495 | 50 | P, B | pagat.com/rummy/canasta.html | ja | validation | — | **Ja** — spec schreef 1499, zie §1.13 nr. 1 |
| threshold: 1.500 t/m 2.995 | 90 | P, B | pagat.com/rummy/canasta.html | ja | validation | — | **Ja** — spec schreef 2999 |
| threshold: 3.000 of meer | 120 | P, B | pagat.com/rummy/canasta.html | ja | validation | — | — |
| drempel geldt per team | ja | P | pagat.com/rummy/canasta.html | ja | validation | Niet per speler | — |
| meerdere melds samen tellen | ja | P, B | pagat.com/rummy/canasta.html | ja | validation | — | — |
| bovenste aflegkaart telt mee | ja, alleen díe kaart | P, B | pagat.com/rummy/canasta.html | ja | validation | Overige kaarten uit de stapel niet | — |
| bonussen tellen mee voor de drempel | nee | P, B | pagat.com/rummy/canasta.html | ja | validation | Rode drieën en canastabonussen niet | — |
| uitzondering | wie in één beurt de hele hand inclusief canasta kan melden en uitgaan, hoeft geen drempel te halen | P | pagat.com/rummy/canasta.html | ja | validation | Levert de bonus voor verborgen uitgaan op | — |

## 1.7 Drieën

| Rule | Value | Source | Source URL | Verified | Effect | Notes | Conflicts |
|---|---|---|---|---|---|---|---|
| red three: 1 stuk | 100 | P, B | pagat.com/rummy/canasta.html | ja | computed | Per rode drie | — |
| red three: alle vier | 800 totaal | P, B | pagat.com/rummy/canasta.html | ja | computed | P: "an extra 400 points, making 800". B: "if one side has all four red threes, they count 200 each, or 800 in all" — zelfde uitkomst | — |
| red three: 2 of 3 stuks | 200 resp. 300 | P, B | pagat.com/rummy/canasta.html | ja | computed | Afgeleid uit "100 points each"; alleen bij vier stuks geldt de verhoging | — |
| red three zonder meld | **negatief** (−100 per stuk, −800 bij vier) | P, B | pagat.com/rummy/canasta.html | ja | computed | P: "If a partnership did not manage to meld at all, then each of their red threes counts minus 100". Voorwaarde is **gemeld hebben**, niet een canasta hebben | **Ja** — Weense variant eist een canasta; zie §1.13 nr. 4 |
| red three telt mee voor initial meld | nee | P | pagat.com/rummy/canasta.html | ja | validation | "they do not count as meld" | — |
| red three blokkeert verborgen uitgaan | nee | P | pagat.com/rummy/canasta.html | ja | validation | — | — |
| black three: functie | stopkaart — verhindert dat de volgende speler de stapel pakt | P, B | pagat.com/rummy/canasta.html | ja | advisory | — | — |
| black three: melden | alleen bij uitgaan, groep van 3 of 4, zonder wildcards | P, B | pagat.com/rummy/canasta.html | ja | validation | — | — |
| black three: waarde | 5 per kaart | P, B | pagat.com/rummy/canasta.html | ja | computed | Als gewone gemelde kaartwaarde | — |

## 1.8 Uitgaan

| Rule | Value | Source | Source URL | Verified | Effect | Notes | Conflicts |
|---|---|---|---|---|---|---|---|
| minimumCanastas | 1 | P, B | pagat.com/rummy/canasta.html | ja | validation | "You can only go out if your partnership has melded at least one canasta" | — |
| canasta mag in dezelfde beurt voltooid worden | ja | P, B | pagat.com/rummy/canasta.html | ja | validation | — | — |
| uitgaan zonder afleggen | toegestaan | P, B | pagat.com/rummy/canasta.html | ja | validation | "by melding all of your cards, or by melding all but one and discarding" | — |
| goingOut bonus | 100 | P, B | pagat.com/rummy/canasta.html | ja | computed | — | — |
| concealed going out | **200 totaal** (100 + 100 extra) | P, B | pagat.com/rummy/canasta.html | ja | computed | P: "an extra 100 points, making 200 for going out" — de bonus **vervangt** dus niet, maar het totaal is 200, niet 300 | **Ja** — spec §27 suggereerde 100 + 200; zie §1.13 nr. 3 |
| voorwaarden concealed | hele hand in één beurt gemeld, inclusief minstens één canasta, niet eerder gemeld en niets aan partners melds toegevoegd | P, B | pagat.com/rummy/canasta.html | ja | validation | Mag wél de aflegstapel pakken in die laatste beurt | — |
| toestemming partner vragen | mag, antwoord is bindend | P, B | pagat.com/rummy/canasta.html | ja | advisory | Niet verplicht | — |

## 1.9 Straffen

| Rule | Value | Source | Source URL | Verified | Effect | Notes | Conflicts |
|---|---|---|---|---|---|---|---|
| kaarten in hand | volledige kaartwaarde wordt afgetrokken | P, B | pagat.com/rummy/canasta.html | ja | computed | Ook als ze een geldige meld vormen | — |
| incomplete canasta penalty | bestaat niet in Classic | P, B | pagat.com/rummy/canasta.html | ja | computed | Alleen Modern American kent deze | — |

## 1.10 Einde ronde

| Rule | Value | Source | Source URL | Verified | Effect | Notes | Conflicts |
|---|---|---|---|---|---|---|---|
| ronde eindigt bij uitgaan | ja | P, B | pagat.com/rummy/canasta.html | ja | advisory | — | — |
| ronde eindigt bij lege stok | ja, zodra iemand wil trekken en niet kan | P, B | pagat.com/rummy/canasta.html | ja | advisory | Spel kan doorgaan zolang elke speler de afgelegde kaart pakt en meldt | — |
| rode drie als laatste stokkaart | ronde eindigt direct; speler mag niet melden of afleggen | P, B | pagat.com/rummy/canasta.html | ja | advisory | — | — |

## 1.11 Einde spel

| Rule | Value | Source | Source URL | Verified | Effect | Notes | Conflicts |
|---|---|---|---|---|---|---|---|
| targetScore | 5.000 | P, B | pagat.com/rummy/canasta.html | ja | computed | — | — |
| evaluatiemoment | aan het einde van een hand | P, B | pagat.com/rummy/canasta.html | ja | computed | B: "The final deal is played out even though it is obvious that one or both sides have surely reached 5,000" | — |
| winnaar | hoogste totaalscore | P, B | pagat.com/rummy/canasta.html | ja | computed | "the side with the higher total score wins" | — |
| negatieve totaalscore mogelijk | ja | P | pagat.com/rummy/canasta.html | ja | computed | — | — |
| exact gelijkspel | `(niet vermeld)` | P, B | — | **nee** | computed | Geen van beide bronnen beschrijft een exacte gelijkstand | Zie *Open beslissingen* nr. 1 |

## 1.12 Rondescore — formule

Bron P, letterlijk: het rondetotaal van een team bestaat uit **bonussen** (canasta's, uitgaan,
rode drieën) **plus** de waarde van alle gemelde kaarten **min** de waarde van alle kaarten in
de handen. `Verified: ja`.

## 1.13 Conflicten bij Classic

1. **Drempelgrenzen 1495/2995 versus 1499/2999.** P en B schrijven beide `0–1.495` en
   `1.500–2.995`; `CANASTA_PWA_SPECIFICATION.md` §16 schreef `1499` en `2999`.
   *Beslissing:* de bronwaarden aanhouden. Rekenkundig maakt het geen verschil — alle
   Canasta-scores zijn veelvouden van 5 — maar de bron is leidend en de spec wordt bijgewerkt.
2. **Zwarte drie bevriest de aflegstapel?** B: een zwarte drie als opgedraaide of afgelegde
   kaart bevriest de stapel. P: "black threes do not freeze the pile", ze blokkeren alleen de
   volgende speler. *Geen beslissing genomen* — dit is `advisory` en raakt de puntentelling
   niet. Beide lezingen worden in de regelweergave vermeld; de configuratie krijgt een
   schakelaar met P als standaard (primaire bron voor Classic).
3. **Verborgen uitgaan: 200 of 300?** Beide bronnen zeggen expliciet dat de extra bonus 100
   is en dat het **totaal 200** wordt. De spec suggereerde in §27 een aparte waarde 200 náást
   100. *Beslissing:* `goingOut = { normal: 100, concealed: 200 }` als **vervangende** waarde,
   niet stapelend.
4. **Rode drieën negatief: bij "niet gemeld" of bij "geen canasta"?** P en B: bij *niet gemeld*.
   De Weense variant (door P apart beschreven, geen standaard-Classic) eist een canasta.
   *Beslissing:* standaard is "niet gemeld", met de Weense lezing als configureerbare optie.
5. **Aantal wildcards dat een canasta mag bevatten.** P: maximaal 3 wild, dus minstens 4
   natuurlijke. B: "including at least four natural cards (called a base)". Geen echt conflict,
   dezelfde regel anders geformuleerd.

---

# 2. Modern American Canasta

Primaire bron **CLA** (leidend bij conflict), gecontroleerd tegen **P**. De verschillen tussen
beide zijn substantieel en staan in §2.14 — met name bij de Special Hands.

## 2.1 Opzet

| Rule | Value | Source | Source URL | Verified | Effect | Notes | Conflicts |
|---|---|---|---|---|---|---|---|
| players | 4 | P | pagat.com/rummy/canasta.html | ja | advisory | **CLA noemt het aantal spelers niet expliciet**; de pagina spreekt wel doorlopend over "your partnership" en "each team". P vult dit aan: "four players in fixed partnerships" | — |
| teams | 2 | P | pagat.com/rummy/canasta.html | ja | advisory | Idem — CLA impliceert het, P bevestigt het | — |
| cardsPerPlayer | 13 | CLA, P | canastaleague.org/rules/ | ja | advisory | "deals 13 cards to each player" | — |
| standardDecks | 2 | P | pagat.com/rummy/canasta.html | ja | advisory | **CLA noemt het deckaantal niet.** P: "Two 52 card standard packs plus 4 jokers ... 108 card pack". Indirect bevestigd door CLA's "all four Jokers" bij de joker-canasta | — |
| jokers | 4 | CLA, P | canastaleague.org/rules/ | ja | advisory | CLA indirect ("all four Jokers"), P expliciet | — |
| totalCards | 108 | P | pagat.com/rummy/canasta.html | ja | advisory | — | — |
| turn card | de negende kaart van onderen ligt dwars; wie hem trekt kondigt aan dat er nog 8 kaarten over zijn | CLA, P | canastaleague.org/rules/ | ja | advisory | Bepaalt of er nog talon getrokken wordt | — |
| upcard | **geen**; het spel begint met een lege aflegstapel | P | pagat.com/rummy/canasta.html | ja | advisory | CLA beschrijft dit niet expliciet maar is er wel mee in lijn (SWAD-regel gaat uit van een lege tray bij de eerste speler) | — |

## 2.2 Kaartwaarden

| Rule | Value | Source | Source URL | Verified | Effect | Notes | Conflicts |
|---|---|---|---|---|---|---|---|
| joker | 50 | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |
| ace | 20 | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |
| two (wild) | 20 | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |
| K, Q, J, 10, 9, 8 | 10 | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |
| 7, 6, 5, 4 | 5 | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |
| drie in hand aan het eind | 5 strafpunten | CLA, P | canastaleague.org/rules/ | ja | computed | Alleen in het zeldzame geval dat er een 3 in de hand blijft | — |
| gemelde drieën | geen kaartwaarde; aparte staffel | CLA, P | canastaleague.org/rules/ | ja | computed | Zie §2.8 | — |

## 2.3 Trekken, afleggen, aflegstapel

| Rule | Value | Source | Source URL | Verified | Effect | Notes | Conflicts |
|---|---|---|---|---|---|---|---|
| drawCount | 1 | CLA, P | canastaleague.org/rules/ | ja | advisory | — | — |
| discardCount | 1 | CLA, P | canastaleague.org/rules/ | ja | advisory | — | — |
| takePile voorwaarde | een **paar** natuurlijke kaarten in de hand van dezelfde rang als de bovenkaart; het paar moet getoond en gemeld worden vóór de rest van de stapel opgepakt wordt | CLA, P | canastaleague.org/rules/ | ja | advisory | CLA formuleert het als "start a new meld with at least two matching natural cards from your hand, or add it to an existing meld" | — |
| takePile bij bestaande meld | mag als die meld 3 of 4 kaarten telt | P | pagat.com/rummy/canasta.html | ja | advisory | CLA formuleert de keerzijde: niet als het team al een meld van 5+ in die rang heeft | — |
| takePile verboden | als het team al een meld van 5 of meer kaarten van die rang heeft | CLA, P | canastaleague.org/rules/ | ja | advisory | Zou een meld van meer dan 7 opleveren | — |
| takePile vóór initial meld | niet toegestaan tenzij de initial meld in dezelfde beurt volledig uit de hand wordt gelegd | P | pagat.com/rummy/canasta.html | ja | advisory | — | — |
| aflegverbod: drieën | 3'en worden nooit afgelegd | CLA, P | canastaleague.org/rules/ | ja | validation | — | — |
| aflegverbod: wildcards | alleen als laatste kaart bij uitgaan, of als de hand uitsluitend wilds bevat | CLA, P | canastaleague.org/rules/ | ja | validation | — | — |
| SWAD | Sevens, Wilds, Aces en Dead cards mogen niet op een **lege** tray worden afgelegd | CLA | canastaleague.org/rules/ | ja | validation | CLA: bij uitsluitend SWAD-kaarten moet je gemelde kaarten terugnemen, desnoods een canasta breken | — |
| dead cards | zodra een canasta van een rang compleet is, mag geen van beide teams die rang nog beginnen of aanvullen | CLA, P | canastaleague.org/rules/ | ja | validation | — | — |
| maxMeldSize | 7 | P | pagat.com/rummy/canasta.html | ja | validation | "A meld can never contain more than seven cards" — CLA zegt dit indirect via de dead-card-regel | — |

## 2.4 Talon (bonuskaarten)

| Rule | Value | Source | Source URL | Verified | Effect | Notes | Conflicts |
|---|---|---|---|---|---|---|---|
| talon bestaat | ja | CLA, P | canastaleague.org/rules/ | ja | advisory | Uniek voor Modern American | — |
| voorwaarde | initial meld gelegd én minstens 9 kaarten in de trekstapel (turn card nog niet getrokken) | CLA, P | canastaleague.org/rules/ | ja | advisory | — | — |
| eerste team dat opent | 4 bonuskaarten | CLA, P | canastaleague.org/rules/ | ja | advisory | — | — |
| tweede team | 3 bonuskaarten | CLA, P | canastaleague.org/rules/ | ja | advisory | — | — |
| moment van gebruik | pas bij de volgende beurt van die speler | CLA, P | canastaleague.org/rules/ | ja | advisory | — | — |
| geen talon | als de initial meld samenvalt met het pakken van de stapel | CLA | canastaleague.org/rules/ | ja | advisory | — | — |

## 2.5 Melden en wildcards

| Rule | Value | Source | Source URL | Verified | Effect | Notes | Conflicts |
|---|---|---|---|---|---|---|---|
| minMeldSize | 3 | CLA, P | canastaleague.org/rules/ | ja | validation | — | — |
| mixed meld: minimaal natuurlijk | 2 | CLA | canastaleague.org/rules/ | ja | validation | "must always keep at least two natural cards" | — |
| mixed meld: maximaal wild | 2 | CLA | canastaleague.org/rules/ | ja | validation | "may never hold more than two wilds" | — |
| rule of five | wild toevoegen mag pas als de meld 5 natuurlijke kaarten bevat | CLA, P | canastaleague.org/rules/ | ja | validation | P noemt dit "the rule of five" en meldt dat oudere groepen het niet spelen | — |
| sevens | nooit wildcards | CLA, P | canastaleague.org/rules/ | ja | validation | — | — |
| aces | moeten puur blijven, tenzij de wildcard bij de initial meld is toegevoegd | CLA, P | canastaleague.org/rules/ | ja | validation | Een gemengde azenmeld telt als gewone gemengde meld, niet als speciale | — |
| wild melds | toegestaan; zolang die niet compleet is mag het team geen wilds in andere melds gebruiken | CLA, P | canastaleague.org/rules/ | ja | validation | — | — |
| uitgaan met onvolledige speciale meld | verboden bij een onvolledige natuurlijke meld van azen, 7'en of wilds | CLA | canastaleague.org/rules/ | ja | validation | — | — |

## 2.6 Initial meld

| Rule | Value | Source | Source URL | Verified | Effect | Notes | Conflicts |
|---|---|---|---|---|---|---|---|
| threshold: 0 t/m 2.995 | 125 | CLA | canastaleague.org/rules/ | ja | validation | — | — |
| threshold: negatieve score | 125 | P | pagat.com/rummy/canasta.html | ja | validation | **CLA laat negatieve scores ongedekt** ("0 to 2,995"). P dekt het expliciet: "less than 3000 → 125", met de noot "a team that has a negative score is still subject to the 125 point minimum count" | Aanvulling, geen conflict |
| threshold: 3.000 t/m 4.995 | 155 | CLA, P | canastaleague.org/rules/ | ja | validation | — | — |
| threshold: 5.000 of meer | 180 | CLA, P | canastaleague.org/rules/ | ja | validation | — | — |
| Clean Triple verplicht | ja — drie of meer natuurlijke kaarten van dezelfde rang, zonder wilds, niet van een dode rang | CLA | canastaleague.org/rules/ | ja | validation | P noemt als tweede mogelijkheid ook een wildcard-meld van minstens drie | **Ja** — §2.14 nr. 4 |
| gemengde melds mogen meetellen | ja, naast de Clean Triple | CLA | canastaleague.org/rules/ | ja | validation | — | — |
| onnatuurlijke canasta als opening | nooit toegestaan | CLA | canastaleague.org/rules/ | ja | validation | — | — |
| bovenste aflegkaart | telt **niet** mee voor het minimum en mag geen deel zijn van de Clean Triple | CLA | canastaleague.org/rules/ | ja | validation | Tegengesteld aan Classic | — |
| "The Splash" | een complete natuurlijke of wild-canasta uit de hand mag als initial meld zonder minimum | P | pagat.com/rummy/canasta.html | ja | validation | **CLA noemt de Splash niet** | Zie *Open beslissingen* nr. 3 |

## 2.7 Canasta-categorieën en bonussen

| Rule | Value | Source | Source URL | Verified | Effect | Notes | Conflicts |
|---|---|---|---|---|---|---|---|
| mixed canasta (elke rang behalve 7'en) | 300 | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |
| natural canasta (behalve 7'en en azen) | 500 | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |
| natural aces canasta | 2.500 | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |
| natural sevens canasta | 2.500 | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |
| wild canasta met 1 t/m 3 jokers | 2.000 | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |
| joker canasta (alle vier jokers + drie 2'en) | 2.500 | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |
| wild canasta van uitsluitend 2'en | 3.000 | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |
| going out bonus | 100 | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |
| concealed going out | **bestaat niet** | CLA, P | canastaleague.org/rules/ | ja | computed | Geen van beide bronnen kent een bonus voor verborgen uitgaan in Modern American | — |

## 2.8 Drieën

| Rule | Value | Source | Source URL | Verified | Effect | Notes | Conflicts |
|---|---|---|---|---|---|---|---|
| behandeling | alle 3'en, rood én zwart, worden direct op tafel gelegd met een vervangende kaart uit de stok | CLA, P | canastaleague.org/rules/ | ja | advisory | 3'en worden nooit afgelegd | — |
| uitzondering | één 3 mag in de hand blijven voor een Straight, zolang het team niet gemeld heeft | CLA, P | canastaleague.org/rules/ | ja | validation | Nooit meer dan één | — |
| score per kleurgroep: 1 | ±100 | CLA, P | canastaleague.org/rules/ | ja | computed | CLA: "3s of the same colour". P geeft aparte, identieke tabellen voor rood en zwart | — |
| score per kleurgroep: 2 | ±300 | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |
| score per kleurgroep: 3 | ±500 | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |
| score per kleurgroep: 4 | ±1.000 | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |
| geen canasta | totaal wordt **afgetrokken** | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |
| één canasta | telt **niet mee** (neutraal) | CLA, P | canastaleague.org/rules/ | ja | computed | Dit is de kenmerkende "swing"-regel | — |
| twee of meer canasta's | totaal wordt **opgeteld** | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |

## 2.9 Uitgaan

| Rule | Value | Source | Source URL | Verified | Effect | Notes | Conflicts |
|---|---|---|---|---|---|---|---|
| minimumCanastas | 2 | CLA, P | canastaleague.org/rules/ | ja | validation | — | — |
| laatste kaart afleggen verplicht | ja — uitgaan zonder afleggen mag niet (behalve bij een Special Hand) | CLA, P | canastaleague.org/rules/ | ja | validation | P: de laatste aflegkaart gaat **gedekt** en mag een wildcard zijn | — |
| laatste aflegkaart mag geen 3 zijn | ja | CLA | canastaleague.org/rules/ | ja | validation | — | — |
| toestemming partner | mag één keer per hand gevraagd worden; antwoord bindend | CLA, P | pagat.com/rummy/canasta.html | ja | advisory | P noemt de beperking "only once in each hand" | — |

## 2.10 Straffen

| Rule | Value | Source | Source URL | Verified | Effect | Notes | Conflicts |
|---|---|---|---|---|---|---|---|
| onvolledige natuurlijke azenmeld | −2.500 | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |
| onvolledige 7'en-meld | −2.500 | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |
| onvolledige wildcard-meld | −2.000 | CLA, P | canastaleague.org/rules/ | ja | computed | P: **−2.500** als die meld alle vier jokers bevat | **Ja** — §2.14 nr. 3 |
| drie of meer azen in hand | −1.500 plus hun kaartwaarde | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |
| drie of meer 7'en in hand | −1.500 plus hun kaartwaarde | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |
| straffen stapelen | ja — een onvolledige 7'en-meld én 3 7'en in hand levert beide straffen op (samen 4.000) | P | pagat.com/rummy/canasta.html | ja | computed | CLA vermeldt dit niet expliciet | Aanvulling |
| straf per speler | ja — hebben beide spelers van een team drie azen, dan tweemaal straf (3.000) | P | pagat.com/rummy/canasta.html | ja | computed | CLA vermeldt dit niet expliciet | Aanvulling |
| kaarten in hand | volledige kaartwaarde wordt afgetrokken | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |

## 2.11 Rondescore — de swing-tabel

CLA en P geven dezelfde matrix. Dit is geen optelsom van losse bonussen maar een
**toestandsafhankelijke** telling, bepaald door het aantal voltooide canasta's van het team:

| Scoreonderdeel | Geen canasta | Eén canasta | Twee of meer | Special Hand |
|---|---|---|---|---|
| Canasta- en uitgaanbonussen | — | opgeteld | opgeteld | — |
| Straffen onvolledige canasta's | afgetrokken | afgetrokken | afgetrokken | — |
| Drieën | afgetrokken | — | opgeteld | — |
| Waarde van gemelde kaarten | **afgetrokken** | opgeteld | opgeteld | — |
| Kaarten in hand | afgetrokken | afgetrokken | afgetrokken | — |
| Special Hand-score | — | — | — | opgeteld |

`Verified: ja` (CLA en P identiek). Eén detail waarin de twee bronnen verschillen staat in
§2.14 nr. 1.

Belangrijk voor de implementatie: dit betekent dat het aantal voltooide canasta's van een team
een **invoerveld** moet zijn, en dat de score-engine er drie takken uit moet kunnen afleiden.
Dat is als `if`-expressie in de regelset uit te drukken, niet als variantcode.

## 2.12 Special Hands

Een Special Hand telt **14 kaarten**, wordt in één keer opengelegd zonder afleggen, is de enige
meld van dat team die ronde en beëindigt de ronde onmiddellijk. Alleen toegestaan als het team
nog niet gemeld heeft. Geen enkele hand mag een 3 bevatten, met de Straight als enige
uitzondering. Bron: CLA, `Verified: ja`. Het tegenstandersteam scoort gewoon door.

| Hand | Samenstelling (CLA, letterlijk) | Waarde | Verified | Conflicts |
|---|---|---|---|---|
| Pairs (no wilds) | Zeven verschillende paren, geen wildcards. Voorbeeld: 66 77 88 99 JJ QQ KK | 2.500 | ja | — |
| Wild Pairs | Zeven paren inclusief azen, 7'en en één passend wildpaar (2'en of jokers). Voorbeeld: 66 99 JJ QQ 77 AA 22 | 2.000 | ja | — |
| Miami Pairs | Zeven paren inclusief azen, 7'en en **beide** wildparen (JoJo en 22). Voorbeeld: 66 99 QQ 77 AA 22 JoJo | 2.500 | ja | — |
| Zip Code | Twee paren + twee drietallen + één viertal (2-2-3-3-4). Passende wilds toegestaan. Voorbeeld: 88 JoJo QQQ KKK 4444 | 2.500 | ja | — |
| Straight | Eén kaart van elke rang, inclusief een 3 en beide wilds (A 2 3 4 5 6 7 8 9 10 J Q K Jo) | 3.000 | ja | — |
| Garbage | Twee viertallen + twee drietallen, geen wilds (4-4-3-3). Voorbeeld: 8888 QQQQ 555 KKK | 3.000 | ja | **Ja** — P zegt 2.000 |
| Blast Off | Eén vijftal + één viertal + één drietal + één paar (5-4-3-2), passende wilds toegestaan. Voorbeeld: KKKKK QQQQ 888 22 | 3.000 | ja | — |
| Triples | Vier drietallen + een passend wildpaar (3-3-3-3 + 2). Voorbeeld: 888 QQQ KKK 444 JoJo | 3.500 | ja | — |
| Quads | Drie viertallen + een passend wildpaar (4-4-4 + 2). Voorbeeld: 8888 QQQQ KKKK 22 | 3.500 | ja | — |
| Dream Hand Plus 4 | Twee vijftallen + vier passende wilds (5-5 + 4). Voorbeeld: 44444 KKKKK JoJoJoJo | 8.500 | ja | — |
| Dream Hand Plus 5 | Eén vijftal + één viertal + vijf wilds (5-4 + 5). Voorbeeld: 44444 KKKK 222JoJo | 8.500 | ja | — |

De twee Dream Hands zijn 8.500 waard en **winnen het spel direct** (CLA, `Verified: ja`).

## 2.13 Einde ronde en einde spel

| Rule | Value | Source | Source URL | Verified | Effect | Notes | Conflicts |
|---|---|---|---|---|---|---|---|
| ronde eindigt bij uitgaan | ja | CLA, P | canastaleague.org/rules/ | ja | advisory | — | — |
| ronde eindigt bij Special Hand | ja, onmiddellijk | CLA | canastaleague.org/rules/ | ja | advisory | — | — |
| ronde eindigt bij lege stok | ja | CLA, P | canastaleague.org/rules/ | ja | advisory | — | — |
| laatste getrokken kaart is een 3 | ronde stopt direct; de 3 blijft in de hand en kost 5 strafpunten | CLA, P | canastaleague.org/rules/ | ja | computed | Geen vervangende kaart mogelijk | — |
| targetScore | 8.500 | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |
| evaluatiemoment | zodra één of beide teams de grens passeren is het spel afgelopen | CLA, P | canastaleague.org/rules/ | ja | computed | P: "or the team that has more points if both teams achieve this on the same deal" | — |
| winnaar | hoogste totaalscore | CLA, P | canastaleague.org/rules/ | ja | computed | — | — |
| negatieve totaalscore mogelijk | ja | P | pagat.com/rummy/canasta.html | ja | computed | — | — |
| exact gelijkspel | `(niet vermeld)` | CLA, P | — | **nee** | computed | — | Zie *Open beslissingen* nr. 1 |

## 2.14 Conflicten bij Modern American

1. **Waarde van gemelde kaarten bij één canasta.** CLA's tabel zet in de kolom "One canasta"
   bij *Wilds, 7s and Aces* "Added" en bij *Threes* een streepje; P's tabel zegt bij één
   canasta expliciet dat de waarde van gemelde kaarten wordt **opgeteld**. De twee tabellen
   zijn verschillend ingedeeld maar geven dezelfde uitkomst. *Geen echte tegenspraak.*
2. **Special Hands: welke bestaan er en wat zijn ze waard?** Dit is het grootste verschil.
   CLA beschrijft **elf** hands met de waarden hierboven. P herkent er **drie**
   ("three types of special hand are widely recognised"): straight 3.000, pairs zonder wilds
   2.500, pairs met 2'en/7'en/azen 2.000, garbage **2.000**. P noemt bovendien als tafelregel
   dat sommige groepen 3.500 geven voor pairs en garbage.
   *Beslissing:* **CLA is leidend** (afspraak vooraf). De elf CLA-hands worden geïmplementeerd
   met CLA-waarden. De afwijkende P-waarde voor Garbage (2.000) wordt vastgelegd als
   gedocumenteerd conflict en is via een huisregel aanpasbaar.
3. **Onvolledige wildcard-meld met alle vier jokers.** CLA: −2.000, zonder uitzondering.
   P: normaal −2.000, maar −2.500 als de meld alle vier jokers bevat.
   *Beslissing:* CLA volgen (−2.000). De P-uitzondering wordt als optionele huisregel
   vastgelegd, niet als standaard.
4. **Wat een initial meld moet bevatten.** CLA eist een Clean Triple. P noemt als geldig
   alternatief ook een wildcard-meld van minstens drie kaarten, en beschrijft daarnaast
   strengere en soepelere tafelregels.
   *Beslissing:* CLA volgen (Clean Triple verplicht). `validation`, geen `computed` — het
   beïnvloedt de puntentelling niet.
5. **Drempel bij negatieve score.** CLA's tabel begint bij 0 en dekt negatieve scores niet.
   P vult aan: ook dan 125. *Beslissing:* P's aanvulling overnemen; geen tegenspraak.
6. **De Splash.** P beschrijft het melden van een complete canasta uit de hand als
   initial meld zonder minimumeis. CLA noemt dit niet. Zie *Open beslissingen* nr. 3.

---

# 3. Two-Handed Canasta

Primaire bron **P**, sectie "Canasta for two players". De bron is kort en expliciet: het is
Classic Canasta met vier afwijkingen. Alles wat hieronder niet genoemd staat, is per bron
**identiek aan Classic** — P zegt letterlijk "All other rules are the same as in four-player
Classic Canasta". `Verified: ja`.

| Rule | Value | Source | Source URL | Verified | Effect | Notes | Conflicts |
|---|---|---|---|---|---|---|---|
| players | 2 | P | pagat.com/rummy/canasta.html | ja | advisory | — | — |
| teams | geen partnerships; twee individuele spelers | P | pagat.com/rummy/canasta.html | ja | advisory | Wordt gemodelleerd als twee "teams" van één speler, zodat de score-engine ongewijzigd blijft | — |
| cardsPerPlayer | **15** | P | pagat.com/rummy/canasta.html | ja | advisory | "15 cards are dealt to each player (rather than 11 each)" | — |
| standardDecks | 2 | P | pagat.com/rummy/canasta.html | ja | advisory | Ongewijzigd t.o.v. Classic | — |
| jokers | 4 | P | pagat.com/rummy/canasta.html | ja | advisory | Ongewijzigd | — |
| drawCount | **2** | P | pagat.com/rummy/canasta.html | ja | advisory | "you draw the top two cards" | — |
| discardCount | 1 | P | pagat.com/rummy/canasta.html | ja | advisory | "At the end of a player's turn only one card is discarded as usual" | — |
| minimumCanastas om uit te gaan | **2** | P | pagat.com/rummy/canasta.html | ja | validation | "A player needs two canastas to go out" | — |
| targetScore | 5.000 | P | pagat.com/rummy/canasta.html | ja | computed | — | — |
| winnaar | hoogste score bij bereiken van 5.000 | P | pagat.com/rummy/canasta.html | ja | computed | "when one or both players reach or exceed this, the player with the higher score wins" | — |
| one-card draw | wie de laatste kaart trekt, geldt als volledige trek en speelt de beurt af alsof er twee zijn getrokken | P | pagat.com/rummy/canasta.html | ja | advisory | — | — |
| rode drie bij de laatste twee kaarten | geen vervangende kaart; behandeld als one-card draw | P | pagat.com/rummy/canasta.html | ja | advisory | — | — |
| rode drie als enige laatste kaart | speler mag niet melden of afleggen; hand eindigt direct | P | pagat.com/rummy/canasta.html | ja | advisory | Geldt ook bij twee rode drieën als laatste twee kaarten | — |
| kaartwaarden, canastabonussen, drieën, initial meld, uitgaanbonus, verborgen uitgaan, straffen, frozen pile | **identiek aan Classic** (§1) | P | pagat.com/rummy/canasta.html | ja | computed / validation | Expliciet gesteld in de bron | — |
| exact gelijkspel | `(niet vermeld)` | P | — | **nee** | computed | — | Zie *Open beslissingen* nr. 1 |
| talon | bestaat niet | P | pagat.com/rummy/canasta.html | ja | advisory | Erft van Classic | — |
| special hands | bestaan niet | P | pagat.com/rummy/canasta.html | ja | computed | Erft van Classic | — |

**Let op bij de initial meld-drempels:** Two-Handed erft de Classic-staffel
(negatief → 15, 0–1.495 → 50, 1.500–2.995 → 90, 3.000+ → 120). De bron noemt geen eigen
drempels en zegt expliciet dat alle overige regels gelijk zijn. `Verified: ja`.

---

# 4. Open beslissingen — afgehandeld

Alle zes punten zijn op 2026-09-19 door de opdrachtgever beslist. De beslissingen staan
hieronder met de status die ze in de implementatie krijgen.

**Uitgangspunt bij bronkeuze:** "CLA is leidend" betekent dat de CLA voorrang heeft bij
*conflicterende* regels. Waar de CLA een setup-detail niet noemt, mag Pagat als secundaire
bron aanvullen. Zulke waarden krijgen status `secondary-source` en staan in `provenance`.

| # | Punt | Beslissing | Status |
|---|---|---|---|
| 1 | Exact gelijkspel | `endGame.winner.tie = "play-extra-round"` | `app-policy` + `configurable` — uitdrukkelijk **geen** geclaimde bronregel |
| 2 | Modern American spelers/decks | 4 spelers · 2 teams van 2 · 13 kaarten p.p. · 2 decks · 4 jokers · 108 kaarten | 13 kaarten `verified` (CLA); spelers, teams, decks en totaal `secondary-source` (Pagat); jokers `verified` (CLA indirect via "all four Jokers", bevestigd door Pagat) |
| 3 | The Splash (Modern American) | standaard **uit** | `not-specified` bij CLA · `secondary-source` bij Pagat · `configurable` voor huisregels |
| 4 | Zwarte drie bevriest de stapel (Classic) | standaard **nee** (Pagat) | `verified` (Pagat) · Bicycle-lezing `configurable` |
| 5 | Garbage (Modern American) | **3.000** | `verified` (CLA, leidend) · Pagat's 2.000 blijft gedocumenteerd conflict |
| 6 | Verborgen uitgaan (Modern American) | standaard **uit** | `not-specified` — de primaire bron beschrijft het niet. **Niet** presenteren als door de CLA verboden. `configurable` voor huisregels |

Twee formuleringen die in de app letterlijk zo moeten worden aangehouden:

- Punt 1 wordt getoond als *app-keuze*, niet als regel: "Bij exact gelijkspel speelt deze app
  een extra ronde. Geen van de geraadpleegde bronnen beschrijft deze situatie."
- Punt 6 wordt getoond als ontbrekende informatie, niet als verbod: "De Canasta League of
  America beschrijft verborgen uitgaan niet voor Modern American. Deze regelset heeft het
  daarom uit staan; via huisregels is het in te schakelen."

---

# 5. Wat dit betekent voor de architectuur

Drie bevindingen uit het onderzoek die het datamodel raken:

1. **Modern American scoort toestandsafhankelijk, niet additief.** De swing-tabel (§2.11) maakt
   het aantal voltooide canasta's van een team tot een schakelaar die bepaalt of drieën,
   kaartwaarden en bonussen worden opgeteld, genegeerd of afgetrokken. Dat is als `if`-expressie
   in de regelset uit te drukken en vereist geen variantcode — maar het bevestigt dat het
   invoermodel een veld "aantal voltooide canasta's" nodig heeft dat Classic niet gebruikt.

2. **Drieën verschillen fundamenteel tussen de varianten.** Classic: rode drieën zijn bonus,
   zwarte zijn stopkaarten met kaartwaarde 5. Modern American: rood én zwart worden gemeld en
   scoren per kleurgroep volgens dezelfde staffel, met een teken dat van het canasta-aantal
   afhangt. Eén gedeeld `threes`-configuratieblok kan beide aan, maar alleen als de staffel een
   tabel is en het teken een expressie.

3. **Special Hands vervangen de rondescore volledig.** Zowel CLA als Pagat zijn expliciet: het
   team dat een Special Hand legt, scoort **alleen** die waarde; de punten 1 t/m 5 vervallen
   voor dat team, terwijl de tegenstander normaal doorscoort. Dat bevestigt
   `specialHands.mode: "replace"` als de door de bron voorgeschreven standaard — eerder een open
   vraag, nu geverifieerd.
