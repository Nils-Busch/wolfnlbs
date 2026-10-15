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
