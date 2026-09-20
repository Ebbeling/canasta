# De lokale toernooiserver

Een toernooi met meerdere tafels op één avond: de organisator draait een kleine server op een
laptop, elke tafel heeft een eigen telefoon of tablet, en iedereen kijkt naar dezelfde stand.

**Internet is niet nodig.** Alle apparaten moeten wél bij de laptop van de organisator kunnen via
hetzelfde lokale netwerk (dezelfde WiFi).

De server is een *extra* mogelijkheid. De app op <https://ebbeling.github.io/canasta/> blijft
precies werken zoals hij werkte: partijen en toernooien op één apparaat, in de browseropslag, zonder
server. Wie geen toernooiserver draait, merkt niets van dit alles.

---

## 1. Wat je nodig hebt

| Wat | Waarom |
|---|---|
| Een laptop met **Node.js 24** (of 23.4+) | De server gebruikt de SQLite die in Node zelf zit. Zonder vlag zit die er pas vanaf 23.4; Node 24 is de aanbevolen versie. |
| Eén WiFi-netwerk | De tafels moeten de laptop kunnen bereiken. Een gastnetwerk dat apparaten van elkaar afschermt werkt niet. |
| Een browser op elke tafel | Elke telefoon of tablet met een moderne browser volstaat. Er hoeft niets geïnstalleerd te worden. |

Geen account, geen internet, geen cloud.

---

## 2. De server starten

Vanuit de projectmap, in PowerShell:

```powershell
.\serve.ps1
```

Het script controleert Node.js en npm, bouwt de app en de server als dat nog niet gebeurd is, en
start de server. Daarna toont het twee adressen:

```text
+------------------------------------------+
|         CANASTA TOURNAMENT SERVER        |
+------------------------------------------+

Organisator (deze laptop):
  http://localhost:8787/canasta/

Netwerk (tafels, telefoons en tablets):
  http://192.168.1.42:8787/canasta/
  via Wi-Fi

Alle apparaten moeten op dezelfde WiFi zitten. Internet is niet nodig.

Stoppen met Ctrl+C.
```

Het IP-adres is niet vastgelegd: het wordt bij elke start opgezocht. Verhuis je naar een ander
netwerk, dan verandert het mee.

### Opties

| Optie | Betekenis |
|---|---|
| `-Port 9000` | Een andere poort. Is de gekozen poort bezet, dan zoekt het script zelf de eerstvolgende vrije. |
| `-LocalOnly` | Alleen op deze laptop; tafels kunnen er dan niet bij. Handig om iets te proberen. |
| `-Rebuild` | App en server opnieuw bouwen, ook als er al een build is. |
| `-NoBrowser` | Niet automatisch een browser openen. |
| `-Database pad` | Een ander databasebestand gebruiken. |
| `-Dev` | De oude ontwikkelserver (Vite, hot reload). Géén toernooiserver, géén tafels. |

### Zonder PowerShell

```bash
npm run build          # de app
npm run server:build   # de server
npm run server:start   # starten op poort 8787
```

---

## 3. Als organisator

1. Open het adres onder **Organisator** op de laptop.
2. Maak een toernooi aan zoals je gewend bent — **Toernooien → Nieuw toernooi**.
   Het toernooi komt nu op de server te staan, niet in de browser van de laptop.
3. Deel de eerste ronde in. Daarbij maakt de server automatisch net zoveel *fysieke tafels* aan als
   de ronde nodig heeft.
4. Ga naar **Tafels** in het menu van het toernooi.
5. Maak per tafel een code aan en toon de QR.

De pagina **Tafels** laat per tafel zien of er een apparaat aan hangt:

| Wat je ziet | Betekenis |
|---|---|
| **Verbonden** | Er staat op dit moment een apparaat open op die tafel. |
| **Niet verbonden** | Er is wel een code, maar geen apparaat online. Onder de tafel staat wanneer het er voor het laatst was. |
| **Nog geen code** | Voor deze tafel is nog geen QR-code gemaakt. |

De rest van het toernooi bedien je zoals altijd: ronde indelen, ronde afsluiten, speeldag
beëindigen, toernooi afronden. Het dashboard werkt zichzelf bij zodra een tafel iets doet — je hoeft
niet te verversen.

---

## 4. Aan tafel

1. Scan de QR-code van die tafel met de camera van het apparaat.
2. De browser opent het tafelscherm: welk toernooi, welke tafel, welke ronde, wie er zitten.
3. **Partij starten** maakt de partij aan.
4. **Score invoeren** opent hetzelfde invoerscherm als in de gewone app.
5. Na het opslaan ziet de organisator de uitslag meteen.

Bij een volgende ronde verschijnt de nieuwe partij vanzelf op hetzelfde apparaat. **Er hoeft niet
opnieuw gescand te worden**: de code hoort bij de tafel, niet bij de ronde. Een tafel mag je dus één
keer een code geven en daarna laten staan — desnoods op papier naast het kaartspel.

Sluit iemand de browser, dan is de tafel terug met dezelfde link.

---

## 5. Als de verbinding wegvalt

Twee heel verschillende gevallen.

### De laptop heeft geen internet

Dat maakt niet uit. Alles loopt over het lokale netwerk; er gaat geen enkel verzoek naar buiten.

### Een tafel verliest de WiFi

Het tafelscherm zegt dan **Geen verbinding** en toont het laatste dat het opgehaald heeft. Je kunt
gewoon doorgaan met invullen. Een ronde die je opslaat, komt onder **Nog niet bevestigd** te staan:

> Eén invoer staat op dit apparaat en is nog niet door de server bevestigd.

Zodra de verbinding terug is, wordt hij vanzelf verstuurd en verdwijnt die melding. De app doet
**nooit** alsof de server iets heeft aangenomen wat hij niet heeft aangenomen — dat onderscheid is
precies waar deze melding voor is.

Weigert de server iets definitief (bijvoorbeeld omdat de organisator de ronde inmiddels heeft
afgesloten), dan staat dat er met de reden bij en kun je de invoer weggooien.

> **Let op:** wordt het tafelscherm ververst terwijl er géén verbinding is, dan laadt de app uit de
> browsercache en toont hij de laatst bekende stand van die tafel. Werkt dat niet, dan is de
> pagina nog nooit op dat apparaat geopend geweest — scan de QR opnieuw zodra er verbinding is.

---

## 6. Waar de gegevens staan

```text
.data/canasta-tournament.sqlite
```

Eén SQLite-bestand, naast de projectmap. Daarin staan het toernooi, de deelnemers, de speeldagen,
de rondes, de tafels, de partijen, de rondes van die partijen en de tafelkoppelingen.

De server stoppen en opnieuw starten verandert daar niets aan: het toernooi staat er daarna gewoon
weer, inclusief de QR-koppelingen van de tafels.

### Back-up

Zet de server even stil en kopieer het bestand. Meer is het niet.

```powershell
Copy-Item .data\canasta-tournament.sqlite "$env:USERPROFILE\Desktop\canasta-backup.sqlite"
```

### Een andere plek

```powershell
.\serve.ps1 -Database D:\toernooien\clubavond.sqlite
```

---

## 7. Veiligheid

Dit is een systeem voor één zaal, geen dienst op het internet. Toch geldt:

- Elke tafel krijgt een eigen **willekeurig token** van 256 bits. Dat token staat in de QR-code en
  in de URL van het tafelscherm.
- Een tafelkoppeling mag **alleen** de eigen tafel lezen, de eigen partij starten en de eigen ronde
  inleveren. Niet de instellingen, niet de indeling, niet een andere tafel, niet het afronden van
  het toernooi. De server weigert dat, niet alleen de knoppen.
- **Nieuwe code** maakt een nieuw token en maakt het oude meteen ongeldig. Handig als een apparaat
  kwijt is of als de verkeerde tafel gescand heeft.
- **Ontkoppelen** trekt de koppeling in. Het apparaat is er onmiddellijk uit.

Zet de server niet open op het internet. Hij is bedoeld voor het netwerk van de zaal.

---

## 8. Als het niet werkt

| Wat je ziet | Wat er meestal aan de hand is |
|---|---|
| Het netwerkadres wordt niet getoond | De laptop zit niet op een netwerk, of alleen op een virtueel netwerk (VPN, Hyper-V). |
| De tafels krijgen de pagina niet te zien | Windows Defender Firewall vraagt bij de eerste start om toegang voor Node.js. Is die vraag weggeklikt, sta Node dan alsnog toe via **Windows-beveiliging → Firewall en netwerkbeveiliging → Een app door de firewall toestaan**. |
| Idem, en de firewall is in orde | Staat het WiFi-netwerk in Windows op **Privé**? Op **Openbaar** blokkeert Windows binnenkomend verkeer. |
| Idem, op een gastnetwerk | Veel gast- en hotelnetwerken schermen apparaten van elkaar af (*client isolation*). Gebruik een eigen netwerk of een telefoon-hotspot. |
| "Poort is al in gebruik" | Er draait al een server. Stop die, of `.\serve.ps1 -Port 9000`. |
| "Deze koppeling werkt niet" op een tafel | De code is ingetrokken of vervangen. Laat de organisator een nieuwe QR tonen. |
| "Versies komen niet overeen" | De laptop en het tafelapparaat draaien verschillende versies van de app. Ververs de pagina op de tafel. |

Het script verandert **niets** aan je firewall en vraagt geen beheerdersrechten. Dat is met opzet:
een script dat stilletjes je firewall aanpast, is een script dat je niet meer kunt vertrouwen.

---

## 9. Wat waar staat

```text
server/src/
  main.ts            opstarten, adressen tonen, netjes afsluiten
  config.ts          poort, adres, databasepad
  network.ts         het LAN-adres opzoeken
  app/               containers, de API-laag, de live-verbinding
  http/              router, SSE, statische bestanden
  storage/           SQLite, tafelkoppelingen, idempotentie
src/net/             de kant van de app: contract, client, tafelclient
```

De toernooiregels, de indeling en de puntentelling staan **niet** in deze mappen. Die staan waar ze
altijd al stonden (`src/domain`, `src/tournament`, `src/scoring`, `src/application`) en draaien
ongewijzigd in de server. Dat is ook de reden dat een partij aan tafel precies hetzelfde telt als
een partij op één telefoon: het is dezelfde code.
