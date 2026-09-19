# Canasta Puntentelling

Offline-first PWA voor het bijhouden van Canasta-scores. Een digitale scorekaart, regelboek en
scorecalculator in één — bedoeld voor gebruik aan de kaarttafel, op een telefoon.

**Productie:** <https://ebbeling.github.io/canasta/>

## Features

- **Classic Canasta**, **Modern American Canasta** en **Two-Handed Canasta**
- Huisregels per partij, zonder de regelset zelf aan te passen
- Automatische puntentelling met een uitlegbare opbouw per ronde
- Correcties die alle latere rondes opnieuw doorrekenen
- Lokale opslag in IndexedDB — geen account, geen server, geen tracking
- Volledig offline te gebruiken en te installeren als app
- Export en import van een partij als één JSON-bestand

Een gestarte partij bewaart de volledige regelset waarmee hij gespeeld is. Wijzigt een regelset
later, dan verandert een oude partij daar niet door mee.

## Regels en bronnen

De regels zijn opgezocht bij gezaghebbende bronnen en niet verzonnen. Waar een bron zwijgt, zegt
de app dat erbij in plaats van iets aan te nemen. Zie [`docs/RULESET_RESEARCH.md`](docs/RULESET_RESEARCH.md)
voor de verantwoording per waarde, met bron en ophaaldatum.

## Development

Op Windows, zonder zelf npm-commando's te typen:

```powershell
.\serve.ps1
```

Het script controleert Node.js en npm, installeert de dependencies als dat nodig is, start de
Vite-devserver en opent de app. De app draait onder `/canasta/`.

Rechtstreeks met npm kan ook:

```bash
npm install
npm run dev      # devserver
npm run check    # typecheck + lint + tests
npm run build    # productiebuild in dist/
npm run preview  # productiebuild lokaal bekijken
```

## Documentatie

| Document | Inhoud |
|---|---|
| [`CANASTA_PWA_SPECIFICATION.md`](CANASTA_PWA_SPECIFICATION.md) | De functionele en technische specificatie |
| [`docs/RULESET_RESEARCH.md`](docs/RULESET_RESEARCH.md) | Het regelonderzoek, met bron per waarde |
| [`docs/EXPORT_IMPORT.md`](docs/EXPORT_IMPORT.md) | Het exportformaat |
| [`docs/OFFLINE_CHECK.md`](docs/OFFLINE_CHECK.md) | Handmatige controles voor offline, export en import |

## Deployment

Een push naar `main` draait `npm run check` en `npm run build`, en publiceert daarna naar GitHub
Pages. Faalt de controle of de build, dan wordt er niet gedeployed.
