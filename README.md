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
- Toernooien met meerdere speeldagen, rondes en tafels
- **Meerdere apparaten**: een lokale toernooiserver op een laptop, een telefoon per tafel en een
  QR-code om ze te koppelen — zonder internet. Zie [`docs/TOURNAMENT_SERVER.md`](docs/TOURNAMENT_SERVER.md).

Een gestarte partij bewaart de volledige regelset waarmee hij gespeeld is. Wijzigt een regelset
later, dan verandert een oude partij daar niet door mee.

## Regels en bronnen

De regels zijn opgezocht bij gezaghebbende bronnen en niet verzonnen. Waar een bron zwijgt, zegt
de app dat erbij in plaats van iets aan te nemen. Zie [`docs/RULESET_RESEARCH.md`](docs/RULESET_RESEARCH.md)
voor de verantwoording per waarde, met bron en ophaaldatum.

## Een toernooi met meerdere tafels

Op Windows, vanuit de projectmap:

```powershell
.\serve.ps1
```

Dit start de **lokale toernooiserver**: die bedient de app, houdt het toernooi bij en toont het
netwerkadres dat de tafels moeten openen. Internet is niet nodig; alle apparaten moeten wel op
dezelfde WiFi zitten. Node.js 24 is vereist, omdat de server de SQLite van Node zelf gebruikt.

De volledige uitleg — QR-codes, tafels, offline, back-up, firewall — staat in
[`docs/TOURNAMENT_SERVER.md`](docs/TOURNAMENT_SERVER.md).

## Development

```powershell
.\serve.ps1 -Dev    # de Vite-devserver, zonder toernooiserver
```

Rechtstreeks met npm kan ook:

```bash
npm install
npm run dev            # devserver
npm run check          # typecheck + lint + alle tests
npm run build          # productiebuild in dist/
npm run preview        # productiebuild lokaal bekijken

npm run server:build   # de toernooiserver bouwen
npm run server:start   # de toernooiserver draaien
npm run server:test    # alleen de servertests
npm run server:check   # typecheck + lint + servertests
```

## Documentatie

| Document | Inhoud |
|---|---|
| [`CANASTA_PWA_SPECIFICATION.md`](CANASTA_PWA_SPECIFICATION.md) | De functionele en technische specificatie |
| [`docs/RULESET_RESEARCH.md`](docs/RULESET_RESEARCH.md) | Het regelonderzoek, met bron per waarde |
| [`docs/EXPORT_IMPORT.md`](docs/EXPORT_IMPORT.md) | Het exportformaat |
| [`docs/OFFLINE_CHECK.md`](docs/OFFLINE_CHECK.md) | Handmatige controles voor offline, export en import |
| [`docs/TOURNAMENT_SERVER.md`](docs/TOURNAMENT_SERVER.md) | De lokale toernooiserver: opzetten, tafels koppelen, offline, back-up |
| [`TOURNAMENT_TECHNICAL_SPECIFICATION.md`](TOURNAMENT_TECHNICAL_SPECIFICATION.md) | De toernooispecificatie |

## Deployment

Een push naar `main` draait `npm run check` en `npm run build`, en publiceert daarna naar GitHub
Pages. Faalt de controle of de build, dan wordt er niet gedeployed.
