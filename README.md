# Vereinsheim

Eine gemeinsame Seite für die Party- und Vereins-Apps:

- **🐺 WoWölfe** – Werwolf-Rollenspiel, jeder mit eigenem Handy. Mit Rollen-Vorlagen
  (Einsteiger, Klassisch, Liebesdrama, Chaos) und einer **Erzähleransicht**: Wer „Ich leite nur“
  ankreuzt, sieht Vorlesetexte für jede Phase, alle Rollen (verdeckbar) und was nachts passiert.
- **❓ Party-Quiz** – Fragen auf dem Fernseher, Antworten am Handy; Quizze pflegt man mit Konto
- **🎮 Spielegalerie** – kleine Spiele für zwischendurch: Solo-Highscores, **Mäxchen** am Tisch, Duelle zu zweit (auch **gegen den Computer**, inkl. **Gomoku**)
- **🧩 Tagesrätsel** – jeden Tag neu: **Wordle**, **Städteraten**, **Connections** und **Nonogramm**, dazu eine **ewige Bestenliste**
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
  spiele/                  Spielegalerie (inkl. games/wordle.html), js/ai.js = Computergegner
  raetsel/                 Tagesrätsel: Übersicht, Städteraten, Connections, Nonogramm, ewige Bestenliste
  spiele/gruppe/           Gruppenspiele mit Handys (Wer würde eher, Stadt-Land-Fluss, Kniffel, Mäxchen online, Montagsmaler)
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

## Spielegalerie: Computergegner, Mäxchen, Gomoku

- **Gegen den Computer** (Tic-Tac-Toe, Vier gewinnt, Reversi, Käsekästchen, Gomoku) in
  drei Stufen: Leicht, Mittel, Schwer. Läuft komplett im Browser (`client-assets/spiele/js/ai.js`).
- **Mäxchen**: 2–6 Plätze an einem Handy, Menschen und Computer gemischt. Würfel heimlich
  unter dem Becher anschauen, ansagen, bluffen; wer auffliegt, verliert einen Deckel.
- **Gomoku**: fünf in einer Reihe auf 15 × 15, auch online per Raumcode.
- **Gruppenspiele** (`/spiele/gruppe/`): Ein Gerät ist der Bildschirm (Fernseher/Laptop, Raum
  eröffnen), alle anderen treten am Handy per Code oder QR-Code bei – ohne Konto.
  - **Wer würde eher …?** – 60 eingebaute Fragen, Abstimmung am Handy, Auflösung mit Balken,
    am Ende die „Titel des Abends“.
  - **Stadt-Land-Fluss** – Buchstabe wird gewürfelt, Kategorien frei wählbar (18 zur Auswahl).
    „Stopp!“ verkürzt auf 10 Sekunden. Antworten mit falschem Anfangsbuchstaben zählen
    automatisch nicht, Unsinn wird am Handy angezweifelt (ab der Hälfte der Stimmen ungültig).
    Punkte: 20 als Einzige, 10 eigene Idee, 5 doppelt.
  - **Kniffel** – reihum würfelt die Person, die dran ist, am eigenen Handy (bis zu drei Würfe,
    Würfel antippen = festhalten) und trägt in eines der 13 Felder ein. Der Bildschirm zeigt die
    Würfel groß und den Block aller. Bonus 35 ab 63 Punkten oben. „Zug überspringen“ trägt für
    abwesende Personen den besten freien Wert ein.
  - **Mäxchen online** – jede Person am eigenen Handy, auch über die Ferne. Wer den Raum eröffnet,
    spielt selbst mit und leitet das Spiel (Start, Deckelzahl, Entfernen, Zug überspringen).
    Würfel verdeckt, Becher antippen zum heimlichen Schauen, ansagen, glauben oder aufdecken.
    Auf der lokalen Mäxchen-Seite gibt es dafür den Knopf „Online spielen“.
  - **Montagsmaler** – eine Person zeichnet am Handy (Farben, Stiftgrößen, Radierer, Rückgängig),
    alle anderen sehen die Zeichnung live und raten. Schnelles Raten bringt mehr Punkte, die
    zeichnende Person bekommt Punkte für jede richtige Antwort, nach der Hälfte der Zeit
    erscheinen Buchstaben als Tipp. Ein Fernseher ist optional („Zusätzlich auf einem Fernseher zeigen“).
  - Bildschirm und Handys aktualisieren sich per DOM-Abgleich: nur Geändertes wird neu gezeichnet,
    nichts ploppt bei jedem Spielzug neu auf.
  - **Computer bei Mäxchen online:** Im Warteraum „🤖 Computer dazuholen“ (bis zu 6, Stärke
    Leicht/Mittel/Schwer). So geht auch eine Runde allein gegen Computer.
  - **Eigene Montagsmaler-Wörter:** Im Warteraum unter „Eigene Wörter“ (eins pro Zeile), wahlweise
    gemischt, nur eigene oder nur eingebaute. Die anderen sehen die Liste nicht.
  - **Bilder des Abends:** Alle Zeichnungen landen in einer Galerie (Spielende und Siegerehrung),
    jedes Bild lässt sich als PNG speichern.
  - **Spieleabend:** Nach einem Spiel wählt die Spielleitung im selben Raum das nächste – niemand
    muss neu beitreten. Jede Partie bringt Abendpunkte (Platz 1: 10, dann 7, 5, 3, 2, 1).
    „🏆 Siegerehrung“ zeigt Gesamtsieg, Titel (Würfelkönig, Bluff-Profi, Picasso des Abends,
    Wortakrobat, Gesprächsthema des Abends) und die Bilder des Abends.
  - **Geräusche am Fernseher:** synthetisch erzeugt (keine Dateien), Knopf 🔊 unten links schaltet sie ab.
  - **Bildschirm bleibt an:** Während der Spiele geht das Handy nicht in den Standby (wo der Browser es kann).
  - Läuft im Durable Object `PartyRoom` (Migration `v3` in wrangler.jsonc).

## Tagesrätsel

Unter `/raetsel/`: Wordle, Städteraten, Connections und Nonogramm, für alle am selben Tag
gleich (deutsche Zeit, neue Rätsel um Mitternacht).

- **Städteraten**: fünf Städte auf der Deutschlandkarte antippen, bis zu 1000 Punkte je
  Stadt nach Entfernung. Dazu „Freies Spiel“ und „Gegen den Computer“.
  Karte: [Natural Earth](https://www.naturalearthdata.com/) (gemeinfrei);
  Städte: [GeoNames](https://www.geonames.org/) (CC BY 4.0). Die Daten in
  `client-assets/raetsel/js/staedte-data.js` sind daraus vereinfacht erzeugt.
- **Nonogramm**: täglich ein 10 × 10-Bild, Bestenliste nach Zeit; im freien Spiel auch
  5 × 5 und 15 × 15.
- **Connections**: 16 Begriffe, vier Gruppen (gelb leicht bis lila knifflig), vier Fehler erlaubt.
  Jeden Tag wird pro Stufe eine Gruppe aus `client-assets/raetsel/js/connections-data.js`
  gezogen (96 Gruppen) – neue Gruppen dort einfach anhängen.
- Die Tagesbestenlisten werden 14 Tage aufgehoben, pro Name zählt der beste Eintrag.
- **Ewige Bestenliste** (`/raetsel/bestenliste.html`): Punkte, Serien, Tagessiege und Rekorde
  über alle Tage (D1-Tabelle `daily_results`). Wordle bis 600, Städteraten bis 500,
  Nonogramm bis 600, Connections bis 600 Punkte – Details stehen auf der Seite.
- **Mit Konto**: Wer angemeldet ist, trägt sich in allen Bestenlisten automatisch unter dem
  Kontonamen ein. Namen, die zu einem Konto gehören, können ohne Anmeldung nicht mehr benutzt
  werden. Angemeldete sehen auf der ewigen Bestenliste ihre eigene Statistik.

## Wordle

In den Tagesrätseln: jeden Tag (deutsche Zeit) ein neues Wort mit 5 Buchstaben,
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

### Liveticker, Tippspiel, Spielerprofile

- **Liveticker**: In der Turnierleitung bei einem offenen Spiel auf „▶ Live schalten“ – dann
  zählt man mit großen +/−-Knöpfen mit (Tischtennis mit „Satz abschließen“). Besucher- und
  Liveansicht zeigen den Stand fast in Echtzeit. „In Ergebnis übernehmen“ füllt das
  Ergebnisformular, das Speichern beendet den Liveticker.
- **Tippspiel**: Besucher tippen ohne Konto auf den Sieger offener Spiele (Fußball-Gruppenspiele
  auch Remis). Läuft ein Spiel live, ist der Tipp gesperrt. Reiter „Tippspiel“ mit Tipp-Tabelle.
- **Spielerprofil**: Ein Klick auf einen Namen zeigt Bilanz, Form der letzten Spiele, nächsten
  Gegner und alle Partien.
- **Turnierbaum** mit Verbindungslinien; Maus über einen Namen zeigt dessen Weg durch den Baum.
- Schriften (Roboto Condensed, Open Sans) liegen jetzt selbst unter `/shared/fonts` – keine
  Anfragen mehr an Google.

### Vereinsrangliste

**`/tischtennis/rangliste`** (oben „Vereinsrangliste“): Elo-Wertung über alle Turniere, getrennt
für Tischtennis und Fußball. Alle starten bei 1000, Siege gegen Stärkere bringen mehr. Personen
werden am Namen erkannt – in jedem Turnier gleich schreiben. Tischtennis-Doppel zählen nicht mit.
Dazu Bilanz, Verlauf der letzten Spiele und Turniersiege.

### Besucher-Link mit QR-Code

In der Turnierleitung beim Turnier auf **„🔗 Besucher-Link & QR-Code“** klicken:
Es erscheint ein QR-Code mit dem festen Link zum Turnier, dazu „Link kopieren“ und
„Drucken“ (druckt nur QR-Code, Turniername und Link – gut als Aushang).

## Turniere: Liveansicht

Für einen Fernseher in der Halle: **`/tischtennis/live`** (auch verlinkt in
Besucheransicht und Turnierleitung). Zeigt groß, was an welchem Tisch läuft, die
nächsten Spiele, Tabellen bzw. die aktuelle K.-o.-Runde und die letzten Ergebnisse.
Aktualisiert sich alle 5 Sekunden, die rechte Spalte blättert automatisch weiter,
am Ende erscheint der Turniersieg mit Konfetti. Knopf „Vollbild“ unten rechts.

- Bekommt ein Spiel eine Tischnummer, blendet der Bildschirm einen **Aufruf** ein:
  „Bitte an Tisch 4 – Clara Wolf gegen Hugo Feld“.
- Live geschaltete Spiele zeigen den **Spielstand** direkt auf der Tischkarte.
- Unten läuft eine **Laufschrift** mit den letzten Ergebnissen.

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

## Als App, Impressum, Datenschutz

- **App installieren:** Die Seite hat ein Manifest und einen Service Worker. Auf dem Handy über
  „Zum Startbildschirm hinzufügen“, am Rechner über den Knopf „📲 Als App installieren“ unten auf
  der Startseite. Besuchte Seiten der Spielegalerie funktionieren dann auch offline.
- **Impressum und Datenschutz** liegen unter `/impressum` und `/datenschutz` und sind unten auf
  jeder Seite verlinkt. Es sind **Vorlagen**: alle gelb markierten Stellen in
  `client-assets/impressum.html` und `client-assets/datenschutz.html` ausfüllen und vom Verein
  prüfen lassen (keine Rechtsberatung).
- **Missbrauchsschutz:** Pro IP-Adresse höchstens 30 neue Spielräume in 10 Minuten, 60 Tipps pro
  Minute, 10 Anmeldeversuche in 5 Minuten (`worker/src/ratelimit.js`).

## Tests

```
npm test            # Spielregeln: Kniffel, Mäxchen, Montagsmaler, Spieleabend, Turniere, Elo, WoWölfe
npm run test:smoke  # startet die Seite lokal und prüft Seiten, API und eine Mäxchen-Runde
```

Automatisch bei jedem Push: Datei `tests.yml` aus Update 10 im GitHub-Webinterface unter
`.github/workflows/tests.yml` anlegen (Add file → Create new file, Inhalt einfügen). Danach zeigt
GitHub bei jedem Push einen grünen Haken oder ein rotes Kreuz. Veröffentlicht wird dabei nichts.

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
- Die kleinen Statistiken auf den Rätselseiten werden nur auf dem Gerät gespeichert; die ewige Bestenliste liegt auf dem Server.
- Bestenlisten der Solo-Spiele, von Städteraten, Connections und Nonogramm (außer Wordle) lassen sich mit etwas Technikwissen fälschen.
- Das Werwolf-Design (dunkles Nacht-Theme) weicht bewusst vom Vereinsheim-Stil ab.
