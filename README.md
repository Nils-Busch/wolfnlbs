# Vereinsheim

Eine gemeinsame Seite für die Party- und Vereins-Apps:

- **🐺 Was für Wölfe** – Werwolf-Rollenspiel, jeder mit eigenem Handy
- **❓ Party-Quiz** – Fragen auf dem Fernseher, Antworten am Handy; Quizze pflegt man mit Konto
- **🎮 Spielegalerie** – kleine Spiele für zwischendurch (Solo-Highscores, Duelle zu zweit, **Wordle** mit Tagesrätsel)
- **🏆 Turniere** – **Tischtennis oder Fußball**: Gruppen-/KO-Modus, Besucheransicht mit **QR-Code**, **Liveansicht für den Bildschirm**
- **👤 Konten** – ein gemeinsames Login für alles; neue Konten muss der Admin freischalten

Technisch ist alles **ein einziges Cloudflare-Projekt** (ein Worker + eine
Konfigurationsdatei) und läuft im kostenlosen Cloudflare-Plan.

## Projektstruktur

```
client-assets/          Alles, was der Browser direkt lädt (HTML/CSS/JS)
  shared/                  Gemeinsames Design, Konto-Link oben rechts, QR-Code-Bibliothek
  index.html, hub.css/js   Die Startseite
  konto/                   Anmelden, Registrieren, Freischalten & Rechte
  quiz/                    Quiz-Übersicht + Editor, Bildschirm (screen), Handy (play)
  spiele/                  Spielegalerie (inkl. games/wordle.html)
  tischtennis/             Turniere (Tischtennis + Fußball): Besucheransicht, Turnierleitung, Liveansicht
  woelfe/                  Gebaute Werwolf-Oberfläche (entsteht automatisch beim Deploy)
clients/woelfe-src/     Quellcode der Werwolf-Oberfläche (React), wird vorm Deploy gebaut
worker/src/             Der Cloudflare Worker
  konto/                   Gemeinsame Konten (Registrierung, Login, Rechte)
  quiz/                    Quiz-Speicher (D1) + Live-Quiz-Raum (Durable Object)
  spiele/                  Bestenlisten, Duelle, Wordle (+ Wortliste)
  tischtennis/, woelfe/    Turnier- und Werwolf-Logik
  index.js                 Verteilt Anfragen an die Bereiche
wrangler.jsonc          Die komplette Cloudflare-Konfiguration
```

## Konten & Rechte

- **Registrieren:** Oben rechts auf „👤 Anmelden“ → „Registrieren“. Das neue Konto
  wartet danach auf Freischaltung und kann sich erst dann anmelden.
- **Freischalten:** Wer das Recht „Konten freischalten & Rechte vergeben“ hat, sieht
  oben rechts eine Zahl mit wartenden Anfragen. Unter **Konto → Konten & Rechte**
  lassen sich Anfragen freischalten (mit Rechten) oder ablehnen.
- **Rechte** werden pro Person vergeben:

  | Bereich | Recht | Bedeutung |
  |---|---|---|
  | Konten | Konten freischalten & Rechte vergeben | Admin |
  | Quiz | Eigene Quizze erstellen & bearbeiten | Standard für neue Leute |
  | Quiz | Alle Quizze bearbeiten & löschen | Moderation |
  | Turniere | Turniere anlegen / Teilnehmer verwalten / Ergebnisse eintragen | wie bisher |

- Ohne besondere Rechte kann man sich anmelden und **freigegebene Quizze starten**.
- **Mitspielen** bei Quiz, Werwolf und Spielen geht immer **ohne Konto**.
- Bestehende Konten aus dem Tischtennis-Turnier funktionieren unverändert weiter;
  wer dort Benutzer verwalten durfte, bekommt automatisch auch die Quiz-Rechte.

### Erster Admin-Zugang (nur bei einer ganz neuen Datenbank)

Gibt es noch gar kein Konto, legt der Server beim ersten Aufruf `admin` mit einem
Zufallspasswort an und schreibt es **einmalig** in die Cloudflare-Logs (Dashboard →
Worker → Logs, Zeile „Erster Admin angelegt …“). Alternativ vorher im Dashboard unter
**Worker → Einstellungen → Variablen und Geheimnisse** ein **Secret** namens
`ADMIN_PASSWORD` anlegen. **Passwörter nie in `wrangler.jsonc` schreiben** – die
Datei ist auf GitHub öffentlich lesbar.

## Party-Quiz

1. Mit Konto auf **Quiz** → „Neues Quiz erstellen“: Fragen mit 2–4 Antworten, die
   richtige markieren, Zeit pro Frage wählen. Optional „Für alle freigeben“.
2. Auf dem Fernseher/Beamer anmelden, beim Quiz **▶ Starten** klicken. Der Bildschirm
   zeigt einen 4-stelligen Code und einen **QR-Code**.
3. Alle anderen scannen den QR-Code oder gehen auf `…/quiz` und geben den Code ein.
4. Weiter geht's mit dem Knopf unten rechts (oder Leertaste/Pfeil rechts). Eine Frage
   löst sich automatisch auf, wenn alle geantwortet haben oder die Zeit um ist.
   Richtige Antworten geben 500–1000 Punkte, je schneller desto mehr.

Die richtige Antwort wird erst bei der Auflösung an die Handys geschickt. Der
Bildschirm lässt sich nur in dem Browser steuern, in dem das Quiz gestartet wurde.
Wer sein Handy neu lädt, landet wieder auf seinem Platz.

## Wordle

In der Spielegalerie: jeden Tag (deutsche Zeit) ein neues Wort mit 5 Buchstaben,
dazu „Freies Spiel“ zum Üben. Das Lösungswort bleibt auf dem Server; in die
Tagesbestenliste kommt nur, wer das Rätsel dort wirklich gelöst hat (sortiert nach
Versuchen, dann Zeit). Wörter mit Ä, Ö, Ü und ß kommen nicht vor.

Die Liste der erlaubten Rateversuche stammt aus dem
[german-pos-dict](https://github.com/languagetool-org/german-pos-dict) von
LanguageTool (Lizenz **CC BY-SA 4.0**) und steht in
`worker/src/spiele/wordleWords.js` ebenfalls unter dieser Lizenz. Die Lösungswörter
sind von Hand ausgewählt; neue Wörter bitte nur hinten anhängen.

## Turniere: Tischtennis oder Fußball

Beim Anlegen eines Turniers wählt man die **Sportart**. Die Adresse bleibt
`/tischtennis` (alte Links funktionieren weiter), im Menü heißt der Bereich „Turniere“.

| | 🏓 Tischtennis | ⚽ Fußball |
|---|---|---|
| Ergebnis | Sätze bis 11, Best of 1/3/5/7 | Tore, z. B. 3:1 |
| Unentschieden | gibt es nicht | in Gruppe/Liga erlaubt; im K.-o. mit Elfmeterschießen |
| Tabelle | Sieg 2, Niederlage 1; Satz- und Balldifferenz | Sieg 3, Remis 1, Niederlage 0; Tordifferenz, Tore |
| Teilnehmer | Einzelspieler (oder zufällige Doppel) | **Teams mit Kader** |
| Extras | – | **Torschützen** pro Spiel, **Torschützenliste** |
| Liveansicht | „An den Tischen“ | „Auf den Plätzen“ + Torschützen |

- Den **Kader** eines Teams kann man auch nach dem Turnierstart noch ändern.
- Beim Ergebnis erscheint für jedes Tor ein Feld für den Torschützen (optional),
  mit Vorschlägen aus dem Kader. „Max“ zweimal eintragen = zwei Tore von Max.
- Bestehende Turniere sind automatisch Tischtennis-Turniere.

### Besucher-Link mit QR-Code

In der Turnierleitung beim Turnier auf **„🔗 Besucher-Link & QR-Code“** klicken:
Es erscheint ein QR-Code mit dem festen Link zum Turnier, dazu „Link kopieren“ und
„Drucken“ (druckt nur QR-Code, Turniername und Link – gut als Aushang).

## Turniere: Liveansicht

Für einen Fernseher in der Halle: **`/tischtennis/live`** (auch verlinkt in
Besucheransicht und Turnierleitung). Zeigt groß, was an welchem Tisch läuft, die
nächsten Spiele, Tabellen bzw. die aktuelle K.-o.-Runde und die letzten Ergebnisse.
Aktualisiert sich alle 10 Sekunden, die rechte Spalte blättert automatisch weiter,
am Ende erscheint der Turniersieg. Knopf „Vollbild“ unten rechts.

Tipp: Tisch- bzw. Platznummern in der Turnierleitung eintragen – dann erscheinen
die Spiele unter „An den Tischen“ bzw. „Auf den Plätzen“.

## Auf Cloudflare veröffentlichen / aktualisieren

Ist das Projekt schon mit GitHub verbunden, reicht es, die geänderten Dateien ins
Repo hochzuladen – Cloudflare baut und veröffentlicht automatisch. Neue Tabellen in
der Datenbank und die neuen Durable Objects legt das Projekt beim Deploy bzw. beim
ersten Aufruf selbst an. Bestehende Konten, Turniere und Bestenlisten bleiben erhalten.

Wichtig beim Hochladen über die GitHub-Webseite: Die Datei **`.gitignore`** beginnt
mit einem Punkt und ist auf dem Mac/PC oft unsichtbar. Falls sie nach dem Hochladen
im Repo fehlt: auf GitHub „Add file → Create new file“, Name `.gitignore`, Inhalt aus
der Zip-Datei hineinkopieren.

Ganz neu einrichten:
1. Auf [dash.cloudflare.com](https://dash.cloudflare.com) registrieren (kostenloser Plan reicht).
2. **Speicher & Datenbanken → D1 → Datenbank erstellen**, die **Database ID** in
   `wrangler.jsonc` bei `database_id` eintragen.
3. Inhalt dieses Ordners in ein GitHub-Repo hochladen (`wrangler.jsonc` auf oberster Ebene).
4. **Workers & Pages → Erstellen → Repository importieren**, Worker-Name `vereinsheim`.

## Lokal ausprobieren (optional)

Voraussetzung: Node.js 20 oder neuer.

```
npm install
npm run dev
```

Danach ist alles unter `http://localhost:8787` erreichbar – mit lokaler
Test-Datenbank. Für ein festes lokales Admin-Passwort eine Datei `.dev.vars` mit
`ADMIN_PASSWORD=…` anlegen (wird nicht hochgeladen, steht in `.gitignore`).

## Bekannte Grenzen

- Login-Sperre nach Fehlversuchen und die Begrenzung von Registrierungen gelten pro
  Worker-Instanz, nicht global synchronisiert – für einen Verein ausreichend.
- Die Wordle-Statistik (Serie usw.) wird nur auf dem jeweiligen Gerät gespeichert.
- Bestenlisten der Solo-Spiele (außer Wordle) lassen sich mit etwas Technikwissen fälschen.
- Das Werwolf-Design (dunkles Nacht-Theme) weicht bewusst vom Vereinsheim-Stil ab.
