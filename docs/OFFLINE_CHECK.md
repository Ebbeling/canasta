# Lokaal draaien en offline-controle

## Local development on Windows

Run:

```powershell
.\serve.ps1
```

The script installs dependencies when necessary, starts the Vite development server and opens
the application in the browser.

Weigert Windows het script vanwege de Execution Policy, start het dan eenmalig zo — dit wijzigt
je instellingen niet:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

De app draait onder `/canasta/`, dus de URL is `http://127.0.0.1:5173/canasta/`. Is die poort
bezet, dan kiest het script de eerstvolgende vrije en toont die. Een andere poort forceren kan
met `.\serve.ps1 -Port 5200`; de browser overslaan met `.\serve.ps1 -NoBrowser`.

## Handmatige controle export/import

Zie [`EXPORT_IMPORT.md`](EXPORT_IMPORT.md) voor het formaat zelf.

1. Start de app (`.\serve.ps1`).
2. Maak een nieuwe Classic-partij aan en geef hem een naam.
3. Voeg minimaal twee rondes toe.
4. Klik op het scorebord op **Exporteren**. Er wordt een bestand
   `canasta-<naam>-<datum>.json` gedownload.
5. Open het bestand: `format` is `canasta-game-export`, `version` is 1, en `game.rounds` bevat
   beide rondes met hun `input`.
6. Ga naar **Instellingen → Partij importeren** en kies het bestand.
7. Controleer de preview: naam, regelset, aantal spelers, teams en rondes.
8. Klik op **Importeren**. De app opent de geïmporteerde partij.
9. Controleer de stand — die moet gelijk zijn aan het origineel.
10. Controleer **Geschiedenis**: dezelfde rondes, dezelfde totalen.
11. Controleer **Spelregels**: dezelfde regelset en dezelfde bron.
12. Importeer hetzelfde bestand nóg een keer.
13. Controleer in **Partijen** dat er nu drie partijen staan: het origineel en twee
    onafhankelijke imports.

Probeer ook een willekeurig `.json`-bestand te kiezen: dat hoort geweigerd te worden met een
Nederlandse melding, zonder dat er iets in de lijst verschijnt.

## Offline-controle

De service worker bestaat **niet** in `npm run dev` (`devOptions.enabled: false`), dus elke
controle hieronder draait tegen een build.

```bash
npm run build
npm run preview          # http://localhost:4173/canasta/
```

1. **Service worker en manifest.** DevTools → Application → Service Workers: geregistreerd en
   geactiveerd. Manifest: naam "Canasta Puntentelling", `start_url` en `scope` beide
   `/canasta/`, en alle drie de icons laden.
2. **Data.** Start een partij en voer een ronde in.
3. **Offline.** Network → Offline. Doe daarna een **harde navigatie** (adresbalk, niet een link
   in de app) naar `/canasta/games/<id>/history`. Dat is wat `navigateFallback` daadwerkelijk
   test; een klik binnen de app zou het omzeilen. Het scorebord moet uit IndexedDB laden.
4. **Installeren.** Zet op het beginscherm en start opnieuw op, nog steeds offline.
5. **Bijwerken.** Bouw opnieuw met een zichtbare wijziging, herlaad de geïnstalleerde app en
   controleer dat de melding "Er is een nieuwe versie beschikbaar" verschijnt — en dat de app
   **niet** herlaadt tot je op *Nu bijwerken* tikt.

## Waarom er geen runtime-cache is

De app doet per ontwerp nul netwerkverzoeken: geen fonts van een CDN, geen analytics, geen
server. Alles wat hij nodig heeft is een build-output en zit dus in de precache-manifest van
Workbox (15 bestanden). Zodra iemand een externe bron toevoegt, is die garantie weg en is er
wél een `runtimeCaching`-regel nodig.

## GitHub Pages (stap 18)

De app is hierop voorbereid maar nog niet gedeployed:

- `base: '/canasta/'` in `vite.config.ts` stuurt zowel de asset-URL's, de service-worker-scope
  als `basename` van de router — die drie moeten gelijk blijven.
- GitHub Pages geeft een echte 404 bij de **eerste** load van een diepe link, vóórdat er een
  service worker bestaat. De deploy-stap moet daarom `dist/index.html` kopiëren naar
  `dist/404.html`. Pages serveert dat bestand met status 404, de browser voert de bundle
  gewoon uit en `location.pathname` blijft intact.
