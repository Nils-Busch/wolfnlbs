# Vereinsheim

Eine gemeinsame Seite für drei Party-/Vereins-Apps:

- **🐺 Was für Wölfe** – Werwolf-Rollenspiel, jeder mit eigenem Handy
- **🎮 Spielegalerie** – kleine Spiele für zwischendurch (Solo-Highscores + Duelle zu zweit)
- **🏓 Tischtennis-Turnier** – Turnierverwaltung mit Gruppen-/KO-Modus und Besucheransicht

Alle drei laufen unter einer einzigen Adresse, zusammengehalten von einer Startseite
(dem „Hub"), über die man sich für einen Bereich entscheidet. Technisch ist alles
**ein einziges Cloudflare-Projekt** (ein Worker + eine Konfigurationsdatei), es muss
nirgends mehr etwas separat gehostet werden – und es läuft dauerhaft in Cloudflares
Rechenzentrum, nicht auf einem Laptop.

## Projektstruktur

```
client-assets/          Alles, was der Browser direkt lädt (HTML/CSS/JS)
  shared/vereinsheim.css   Gemeinsames Design ("Vereinsheim"-Stil)
  index.html, hub.css/js   Die Startseite mit dem Hover-Effekt
  woelfe/                  Gebaute Werwolf-Oberfläche (entsteht automatisch beim Deploy)
  spiele/                  Spielegalerie (Spiele, CSS, JS)
  tischtennis/             Tischtennis-Turnier (Oberfläche + Turnierleitung)
clients/woelfe-src/     Quellcode der Werwolf-Oberfläche (React), wird vorm Deploy gebaut
worker/src/             Der eine Cloudflare Worker, aufgeteilt in drei Bereiche
  woelfe/, spiele/, tischtennis/   Je Bereich die Server-Logik + Durable Objects
  index.js                 Verteilt Anfragen an die drei Bereiche
wrangler.jsonc          Die komplette Cloudflare-Konfiguration
```

Die drei Bereiche sind technisch unabhängig (eigene Datenbank/eigener Speicher,
kein gemeinsamer Login) – sie teilen sich nur die Adresse und das Design.

## Lokal ausprobieren (optional)

Nur nötig, falls du selbst am Code weiterbauen willst. Voraussetzung: Node.js
(Version 20 oder neuer).

```
npm install
npm run dev
```

Danach ist alles unter `http://localhost:8787` erreichbar – inklusive echter
Durable Objects und einer lokalen Test-Datenbank (beides simuliert, nichts davon
landet auf Cloudflare).

## Auf Cloudflare veröffentlichen

Genau wie beim letzten Mal: kein Terminal nötig, alles über den Browser.

**1. Bei Cloudflare anmelden**
Falls noch nicht geschehen: auf [dash.cloudflare.com](https://dash.cloudflare.com) registrieren.
Der kostenlose Plan reicht für dieses Projekt vollständig aus.

**2. Datenbank für das Tischtennis-Turnier anlegen**
Im Cloudflare-Dashboard zu **Speicher & Datenbanken → D1** gehen → **Datenbank
erstellen** → Name z. B. `vereinsheim-tischtennis`. Nach dem Erstellen zeigt
Cloudflare eine **Database ID** an (eine lange Zeichenfolge mit Bindestrichen) –
die brauchst du im nächsten Schritt.

**3. `wrangler.jsonc` anpassen**
In der Datei `wrangler.jsonc` die Zeile mit
`"database_id": "HIER-DIE-DATABASE-ID-AUS-WRANGLER-D1-CREATE-EINTRAGEN"`
suchen und durch die eben kopierte Database ID ersetzen.

Optional, aber empfehlenswert: direkt darunter die beiden auskommentierten
Zeilen für `ADMIN_USERNAME`/`ADMIN_PASSWORD` aktivieren und selbst einen
Admin-Zugang fürs Tischtennis-Turnier festlegen (siehe Abschnitt weiter unten,
falls du das überspringen willst).

**4. Projekt zu GitHub hochladen**
Neues (leeres) GitHub-Repository anlegen, dann den kompletten Inhalt dieses
Projekt-Ordners per Web-Upload hochladen. Wichtig: `wrangler.jsonc` muss direkt
auf der obersten Ebene des Repos liegen, nicht in einem Unterordner.

**5. Worker in Cloudflare einrichten**
Im Dashboard: **Workers & Pages → Erstellen → Worker verbinden (Workers Builds)**
→ das GitHub-Repo auswählen. Der Worker-Name **muss** `vereinsheim` sein (das ist
der Name aus `wrangler.jsonc`). Build- und Deploy-Befehl übernimmt Cloudflare
automatisch aus `wrangler.jsonc` (Build: `npm run build:woelfe`, Deploy:
`npx wrangler deploy`).

**6. Fertig**
Nach dem ersten erfolgreichen Deploy ist alles unter
`https://vereinsheim.<dein-account>.workers.dev` erreichbar – das ist jetzt die
gemeinsame Startseite für alle drei Bereiche. Dieser Link bleibt bei jedem
weiteren Deploy gleich.

## Tischtennis-Turnier: erster Admin-Zugang

Wurden `ADMIN_USERNAME`/`ADMIN_PASSWORD` in `wrangler.jsonc` gesetzt (Schritt 3
oben), gilt dieser Zugang sofort ab dem ersten Deploy.

Wurden sie **nicht** gesetzt, erzeugt der Server beim allerersten Aufruf
automatisch ein Zufallspasswort und schreibt es **einmalig** in die
Cloudflare-Logs: Dashboard → dein Worker → **Logs** (Live-Protokoll), dort nach
der Zeile „Erster Admin angelegt: admin / …" suchen. Direkt danach im
Tischtennis-Bereich unter `/tischtennis/admin` einloggen und das Passwort unter
„Mein Konto" sofort ändern.

## Neu: Besucher-Link für ein Turnier

In der Turnierleitung (`/tischtennis/admin`) gibt es bei jedem Turnier jetzt
einen Knopf **„Besucher-Link kopieren"**. Das kopiert einen kurzen Link (z. B.
`https://vereinsheim.<dein-account>.workers.dev/tischtennis/t/ab12cd34`) in die
Zwischenablage. Wer diesen Link öffnet, landet **direkt in der Besucheransicht
genau dieses Turniers** – ohne vorher die Liste aller Turniere zu sehen. Der
Link bleibt für ein Turnier immer derselbe; man kann ihn also z. B. auf ein
Plakat drucken oder per Nachricht verschicken.

## Design: „Vereinsheim"-Stil

Statt glatter Farbverläufe und generischer Karten: warmes Packpapier,
dezente Papier-Struktur, handschriftliche Akzente und „angepinnte" Karten mit
Tape-Ecke – jeder Bereich hat zusätzlich seine eigene Akzentfarbe (Wölfe:
dunkelrot, Spielegalerie: petrol, Tischtennis: orange). Auf der Startseite
färbt sich beim Überfahren einer Karte mit der Maus kurz der ganze
Bildschirm leicht in Richtung der jeweiligen Akzentfarbe ein – sobald man mit
der Maus woanders hinfährt, ist der Effekt sofort wieder weg.

## Was noch offen ist / bekannte Grenzen

- Die Login-Sperre nach zu vielen Fehlversuchen und das automatische Anlegen
  des allerersten Admin-Kontos gelten jeweils pro Worker-Instanz, nicht
  global über alle Cloudflare-Standorte hinweg synchronisiert – für ein
  kleines, selbst organisiertes Turnier unproblematisch.
- Das kostenlose Werwolf-Design (dunkles Nacht-Theme) wurde bewusst nicht an
  den Vereinsheim-Stil angeglichen, damit die Lesbarkeit beim Spielen nachts
  nicht leidet; nur ein kleiner „← Vereinsheim"-Link auf dem Start-Bildschirm
  führt zurück zum Hub.
