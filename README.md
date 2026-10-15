# 🐺 Was für Wölfe

Eine Web-App, mit der ihr **Werwolf** auf eurer Party spielen könnt – jede*r mit dem
eigenen Handy. Ein Gastgeber erstellt einen Raum, alle anderen treten per Code bei,
und die App übernimmt komplett die Rolle des Spielleiters: Rollen verteilen, Nacht-
und Tagphasen steuern, abstimmen lassen, Sieger ermitteln.

## Features

- **Jeder mit eigenem Handy** – kein Zettel, keine Karten nötig. Rollen werden privat
  an jedes Gerät verteilt.
- **Rollen:** Werwolf 🐺, Urwolf 🐺🌑, Dorfbewohner 👤, Seherin 🔮, Hexe 🧪, Jäger 🏹
  (Urwolf/Seherin/Hexe/Jäger können pro Runde an- oder abgeschaltet werden).
- **Automatischer Ablauf:** Nacht (Werwölfe → Seherin → Hexe) → Morgen-Reveal →
  ggf. Bürgermeisterwahl → Diskussion mit Timer → Abstimmung mit Timer → Ergebnis →
  nächste Nacht.
- **Jäger-Mechanik:** Wer als Jäger stirbt, schießt sofort noch auf einen Mitspieler.
- **Hexe:** Ein Heiltrank (rettet das nächtliche Opfer) und ein Gifttrank (tötet einen
  beliebigen Spieler), jeweils einmal pro Spiel.
- **Urwolf:** Einer der Werwölfe. Sobald mindestens ein Werwolf gestorben ist, darf er
  einmal im Spiel statt des gemeinsamen Opfers heimlich einen Mitspieler in einen
  Werwolf verwandeln – diese Nacht stirbt dann niemand.
- **Wolfs-Chat:** Die Werwölfe haben während ihrer Nachtphase einen privaten Text-Chat,
  nur für sie sichtbar, um sich lautlos abzusprechen.
- **Bürgermeister:** Optional wählt das Dorf am ersten Tag (und jedes Mal neu, wenn
  der/die amtierende Bürgermeister*in nachts stirbt) eine*n Bürgermeister*in. Ihre/seine
  Stimme bei der Tagesabstimmung zählt doppelt.
- **Erzähler-Modus:** Der Gastgeber kann sich in der Lobby zum reinen Erzähler erklären
  – er spielt dann selbst nicht mit (keine Rolle, keine Stimme), bleibt aber
  Spielleiter mit allen Host-Rechten (Phasen überspringen, neue Runde starten).
- **Anpassbares Setup:** Anzahl Werwölfe, welche Sonderrollen aktiv sind,
  Diskussions- und Abstimmzeit – alles vom Gastgeber vor dem Start einstellbar.
- **Reconnect:** Wer die Verbindung verliert (z. B. schlechtes WLAN) kann über den
  gleichen Browser wieder in seinen Platz zurückkehren, inklusive Rolle.
- **Rundenende & neue Runde:** Am Ende sehen alle, wer welche Rolle hatte. Der
  Gastgeber kann sofort eine neue Runde mit der gleichen Gruppe starten.

## Wie wird gespielt?

1. Alle Spieler*innen öffnen den Link eurer Seite (z. B.
   `https://was-fuer-woelfe.<dein-name>.workers.dev`) auf ihrem Handy – egal ob WLAN
   oder mobile Daten.
2. Ein*e Spieler*in erstellt einen Raum ("Raum erstellen") → bekommt einen 4-stelligen
   Code. In der Lobby kann der Gastgeber sich optional selbst zum reinen Erzähler
   erklären, falls er/sie nicht mitspielen, sondern nur leiten möchte.
3. Alle anderen geben diesen Code bei "Raum beitreten" ein.
4. Der Gastgeber stellt Werwolf-Anzahl (inkl. Urwolf), Sonderrollen, Bürgermeister-Wahl
   und Timer ein und startet das Spiel.
5. Die App führt Nacht und Tag automatisch durch. Diskutiert **laut, im selben Raum** –
   die App ist nur Spielleiter; einzige Ausnahme ist der private Wolfs-Chat während der
   Nacht der Werwölfe.

Empfehlung: mindestens 5-6 Spieler für ein spannendes Spiel, technisch funktioniert es
ab 4 mitspielenden Personen (der Erzähler zählt dabei nicht mit).

---

## Online stellen mit Cloudflare (kostenlos, nur im Browser)

Die App läuft komplett bei Cloudflare: Die Seite selbst wird als statische Website
ausgeliefert, die Spielräume laufen in **Cloudflare Workers + Durable Objects**. Du
musst **nichts installieren** – weder du noch deine Mitspieler. Der kostenlose
Cloudflare-Plan reicht für Partyrunden locker aus.

### 1. Code in ein GitHub-Repository hochladen

1. Zip-Datei auf deinem Rechner **entpacken**.
2. Auf [github.com](https://github.com) oben rechts **„+“ → „New repository“**.
   Name z. B. `was-fuer-woelfe`, „Private“ ist okay. **„Create repository“**.
3. Auf der leeren Repo-Seite auf **„uploading an existing file“** klicken.
4. Den **Inhalt** des entpackten Ordners hineinziehen – also die Dateien und Ordner
   `client`, `worker`, `package.json`, `package-lock.json`, `wrangler.jsonc`, `README.md`
   usw. Wichtig: `wrangler.jsonc` muss danach **direkt auf der obersten Ebene** des
   Repos liegen (nicht in einem Unterordner und nicht als Zip).
5. Unten **„Commit changes“**.

> Falls du schon ein Repo mit der alten Version hast: Am einfachsten ein **neues** Repo
> anlegen, damit keine alten Dateien (Dockerfile, `server/`) dazwischenfunken.

### 2. Cloudflare mit GitHub verbinden

1. Auf [dash.cloudflare.com](https://dash.cloudflare.com) kostenlos registrieren
   (oder einloggen).
2. Links **„Workers & Pages“** (bzw. „Compute“ → „Workers & Pages“) öffnen →
   **„Create“** / **„Create application“**.
3. **„Import a repository“** bzw. **„Connect to Git“** wählen und GitHub verbinden.
   GitHub fragt, auf welche Repos Cloudflare zugreifen darf – dein
   `was-fuer-woelfe`-Repo auswählen.
4. Repo auswählen und die Einstellungen prüfen:
   - **Project name / Worker name:** `was-fuer-woelfe`
     (muss genau so heißen wie `"name"` in `wrangler.jsonc` – sonst schlägt der Build fehl).
   - **Build command:** leer lassen (der Build läuft automatisch über `wrangler.jsonc`).
     Falls ein Feld ausgefüllt sein muss: `npm run build`.
   - **Deploy command:** `npx wrangler deploy` (Standard).
   - **Root directory:** leer bzw. `/`.
5. **„Deploy“** klicken. Der erste Build dauert ca. 1–2 Minuten.

Danach zeigt dir Cloudflare die Adresse, z. B.
`https://was-fuer-woelfe.<dein-name>.workers.dev`. Diesen Link schickst du deinen
Mitspielern – fertig.

**Updates:** Jedes Mal, wenn du im GitHub-Repo eine Datei änderst oder neu hochlädst,
baut und veröffentlicht Cloudflare die Seite automatisch neu.

### Was passiert dabei technisch?

- Beim Deploy wird die React-App gebaut (`client/dist`) und als statische Seite
  hochgeladen. Nur Anfragen an `/api/...` gehen an den Worker.
- **Jeder Raum ist ein eigenes Durable Object.** Alle Handys eines Raums sind per
  WebSocket mit genau diesem Objekt verbunden.
- Der Spielstand wird nach jeder Aktion im Speicher des Durable Objects gesichert. Wenn
  Cloudflare das Objekt in einer ruhigen Phase schlafen legt oder neu startet, geht
  also nichts verloren – die Handys verbinden sich einfach neu.
- Die Phasen-Timer laufen über **Alarms** des Durable Objects (statt über `setTimeout`),
  dadurch laufen sie auch dann weiter, wenn gerade niemand etwas tut.
- Räume werden automatisch gelöscht, wenn eine Stunde lang niemand mehr verbunden war.
- Es gibt **keinen langen Kaltstart** wie beim kostenlosen Render-Hosting – die Seite ist
  sofort da.

### Falls etwas hakt

- **Build schlägt fehl mit „name mismatch“ o. ä.:** Der Worker-Name im Dashboard muss
  `was-fuer-woelfe` sein – oder du änderst `"name"` in `wrangler.jsonc` auf den Namen,
  den du im Dashboard gewählt hast.
- **„Missing entry-point“ / „Could not find wrangler config“:** `wrangler.jsonc` liegt
  nicht auf der obersten Ebene des Repos (siehe Schritt 1.4).
- **Logs ansehen:** Im Cloudflare-Dashboard beim Worker unter „Logs“ /
  „Observability“ (ist in `wrangler.jsonc` bereits eingeschaltet).

---

## Projektstruktur

```
was-fuer-woelfe/
├── wrangler.jsonc        # Cloudflare-Konfiguration (Worker, Durable Object, statische Seite)
├── worker/src/
│   ├── index.js          # Worker: Raum erstellen, WebSocket an den richtigen Raum weiterleiten
│   ├── gameRoom.js       # Durable Object: ein Spielraum (WebSockets, Speichern, Alarm-Timer)
│   ├── gameManager.js    # Die komplette Spiellogik (Phasen, Rollen, Abstimmungen, Sieg)
│   ├── roles.js          # Rollen-Definitionen und Rollenverteilung
│   ├── roomCode.js       # 4-stellige Raum-Codes
│   └── ids.js            # Zufalls-IDs für Spieler
└── client/               # React (Vite) – die Oberfläche fürs Handy
```

## Lokal starten (nur zum Entwickeln – fürs Spielen nicht nötig)

Voraussetzung: [Node.js](https://nodejs.org) Version 20 oder neuer.

```bash
npm install
npm run dev          # baut die App und startet Worker + Durable Objects lokal
```

Dann `http://localhost:8787` öffnen. Für mehrere „Spieler“ einfach mehrere
Browserfenster (oder ein privates Fenster pro Spieler) verwenden.

Wer an der Oberfläche mit Hot-Reload arbeiten will: zusätzlich in einem zweiten
Terminal `npm run dev:client` starten und `http://localhost:5173` öffnen.

Direkt aus dem Terminal deployen geht auch: `npx wrangler login`, dann `npm run deploy`.

## Spielregeln im Detail (für alle, die Werwolf noch nicht kennen)

- **Nachts:** Die Werwölfe wählen heimlich gemeinsam ein Opfer (dabei können sie sich
  über den privaten Wolfs-Chat absprechen). Danach darf (falls aktiv) die Seherin die
  wahre Rolle einer Person sehen, danach die Hexe entscheiden, ob sie das Opfer der
  Wölfe rettet und/oder jemand anderen vergiftet.
- **Morgens:** Alle erfahren, wer in der Nacht gestorben ist (und welche Rolle diese
  Person hatte). War noch kein Bürgermeister gewählt, oder ist der/die amtierende
  Bürgermeister*in gerade gestorben, wählt das Dorf jetzt (falls die Option aktiv ist)
  eine*n neue*n Bürgermeister*in.
- **Tags:** Alle diskutieren laut, wer verdächtig ist, und stimmen dann ab, wer aus dem
  Dorf verbannt wird. Die Stimme des Bürgermeisters/der Bürgermeisterin zählt dabei
  doppelt. Bei Stimmengleichheit passiert nichts.
- **Jäger:** Stirbt der Jäger (egal wodurch), darf er sofort noch jemanden mit sich
  "mitnehmen".
- **Urwolf:** Einer der Werwölfe. Sobald mindestens ein Werwolf (egal welcher) gestorben
  ist, darf er einmal im gesamten Spiel – statt des normalen nächtlichen Opfers – heimlich
  einen Mitspieler in einen Werwolf verwandeln. In dieser Nacht stirbt dann niemand, aber
  das Wolfsrudel wächst um ein Mitglied.
- **Bürgermeister:** Wird am ersten Tag gewählt (und jedes Mal neu, wenn der/die
  amtierende Bürgermeister*in in der Nacht stirbt – stirbt er/sie tagsüber durch
  Abstimmung, bleibt das Amt bis zur nächsten nächtlichen Neuwahl-Situation unbesetzt).
  Einziger Vorteil: doppeltes Stimmgewicht bei der Tagesabstimmung.
- **Erzähler:** Der Gastgeber kann sich vor Spielstart in der Lobby zum reinen Erzähler
  erklären. Er bekommt dann keine Rolle, zählt nicht mit bei Abstimmungen oder der
  Siegbedingung und kann nicht sterben – bleibt aber Spielleiter mit allen Host-Rechten.
- **Sieg:** Das Dorf gewinnt, wenn alle Werwölfe tot sind. Die Werwölfe gewinnen, wenn
  sie mindestens so viele sind wie der Rest der lebenden Spieler.

Viel Spaß! 🐺🏡
