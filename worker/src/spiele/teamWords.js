// Wortmaterial für die Teamspiele (eigene Listen, frei erweiterbar).
//  - AG_WORDS: Agentenrunde – kurze Hauptwörter, viele mit Doppelbedeutung,
//    damit Ein-Wort-Hinweise mehrere Karten verbinden können.
//  - EX_CARDS: Erklärbär – Begriff | fünf Wörter, die beim Erklären verboten sind.

export const AG_WORDS = `
Bank Schloss Birne Strauß Leiter Kiefer Ton Pflaster Mutter Hahn Bauer Zug Ball Absatz Blatt Feder Golf
Schimmel Erde Krone Stern Netz Maus Schnecke Brücke Kater Flügel Note Gericht Steuer Tor Zelle Linse Raupe
Pony Stamm Schlange Fliege Läufer Hut Riegel Bund Decke Strom Stift Spinne Tau Kamm Wurf Satz Lauf Schuss
Zylinder Löwe Waage Skorpion Wasser Feuer Luft Mond Sonne Wolke Blitz Donner Regen Schnee Eis Nebel Sturm
Welle Strand Insel Berg Tal Höhle Wald Wiese Wüste Vulkan Gletscher Fluss Quelle See Meer Hafen Leuchtturm
Anker Segel Kapitän Pirat Schatz Karte Kompass Fernrohr Rakete Planet Komet Astronaut Alien Roboter Laser
Satellit Akku Kabel Stecker Bildschirm Tastatur Drucker Wolkenkratzer Turm Mauer Fenster Tür Dach Keller
Treppe Aufzug Garten Zaun Brunnen Teich Burg Palast Kirche Rathaus Bahnhof Flughafen Tunnel Ampel Kreuzung
Autobahn Fahrrad Roller Bus Taxi Lastwagen Traktor Bagger Kran Hubschrauber Ballon Fallschirm Boot Kanu
U-Boot Kutsche Schlitten Ski Helm Handschuh Mantel Stiefel Socke Krawatte Gürtel Tasche Koffer Rucksack
Schirm Brille Uhr Ring Kette Perle Diamant Gold Silber Münze Schein Tresor Dieb Polizei Detektiv Spion
Agent Code Passwort Schlüssel Geheimnis Maske Mantel Schatten Spur Lupe Falle Alarm Sirene Feuerwehr
Arzt Pflege Spritze Pille Herz Knochen Zahn Auge Ohr Nase Hand Fuß Daumen Rücken Bauch Kopf Gehirn Blut
Koch Bäcker Metzger Gärtner Fischer Jäger Förster Lehrer Richter Anwalt König Königin Prinz Ritter Drache
Hexe Zauberer Riese Zwerg Elfe Einhorn Geist Vampir Mumie Monster Engel Teufel Held Clown Zirkus Akrobat
Jongleur Magier Theater Bühne Vorhang Kino Film Kamera Mikrofon Radio Fernseher Zeitung Buch Brief Post
Paket Stempel Marke Kalender Termin Uhrzeit Wecker Kerze Lampe Laterne Glühbirne Batterie Magnet Motor
Rad Reifen Kette Bremse Hupe Benzin Öl Seife Schaum Bad Dusche Handtuch Kissen Bett Sofa Stuhl Tisch
Schrank Spiegel Teppich Vase Blume Rose Tulpe Kaktus Palme Eiche Tanne Pilz Apfel Banane Zitrone Orange
Kirsche Erdbeere Nuss Kartoffel Karotte Zwiebel Knoblauch Gurke Tomate Paprika Mais Reis Nudel Pizza
Burger Wurst Käse Brot Brezel Kuchen Torte Keks Schokolade Bonbon Eis Honig Zucker Salz Pfeffer Senf
Ketchup Suppe Topf Pfanne Löffel Gabel Messer Teller Tasse Glas Flasche Korken Fass Bier Wein Saft Milch
Kaffee Tee Kakao Hund Katze Pferd Kuh Schwein Schaf Ziege Huhn Ente Gans Taube Adler Eule Rabe Papagei
Pinguin Hai Wal Delfin Krake Krebs Muschel Frosch Kröte Igel Fuchs Wolf Bär Hase Eichhörnchen Biber
Elefant Giraffe Zebra Affe Tiger Krokodil Kamel Känguru Koala Panda Biene Wespe Ameise Käfer Schmetterling
Wurm Fußball Tennis Boxen Turnier Pokal Medaille Rekord Trainer Schiedsrichter Elfmeter Abseits Netz
Schläger Würfel Karte Joker Dame Bauer Turm Puzzle Rätsel Quiz Party Konfetti Ballon Geschenk Torte
Feuerwerk Musik Gitarre Klavier Trommel Geige Flöte Trompete Orgel Chor Konzert Disco Tanz Walzer Oper
Farbe Pinsel Leinwand Kreide Tafel Schule Klasse Prüfung Zeugnis Ferien Urlaub Reise Pass Grenze Zoll
Hotel Zelt Camping Lagerfeuer Picknick Grill Wanderung Gipfel Seil Haken Kletterer Taucher Surfbrett
Schwimmbad Sauna Sprung Rutsche Schaukel Wippe Sandkasten Drachen Murmel Kreisel Teddy Puppe Lego
Hammer Nagel Schraube Säge Bohrer Zange Leim Klebeband Schere Nadel Faden Knopf Reißverschluss Wolle
Stoff Seide Leder Papier Pappe Plastik Glas Holz Stein Sand Lehm Ziegel Beton Eisen Stahl Kupfer Blei
Rost Staub Rauch Asche Funke Flamme Glut Kohle Diamant Kristall Spiegelei Omelett Pommes Salat Soße
Zeit Glück Pech Traum Wunsch Idee Plan Fehler Witz Lied Gedicht Märchen Legende Mythos Rekord Zufall
`
  .split(/\s+/)
  .filter(Boolean)
  .filter((w, i, a) => a.indexOf(w) === i);

// Begriff|verboten1,verboten2,verboten3,verboten4,verboten5
export const EX_CARDS = `
Leuchtturm|Licht,Meer,Schiff,Turm,Küste
Fahrrad|Rad,Pedal,fahren,Lenker,Kette
Geburtstag|Kuchen,Kerzen,Feier,Geschenk,älter
Zahnarzt|Zähne,Bohrer,Praxis,Karies,Termin
Kühlschrank|kalt,Küche,Essen,Tür,Strom
Regenschirm|Regen,nass,aufspannen,Wetter,Schutz
Weihnachtsmann|Bart,rot,Geschenke,Rentier,Dezember
Achterbahn|Kirmes,Freizeitpark,Looping,schnell,fahren
Bibliothek|Bücher,leihen,lesen,leise,Regal
Zirkus|Zelt,Clown,Manege,Artist,Tiere
Feuerwehr|Brand,löschen,rot,Leiter,Sirene
Schneemann|Schnee,Karotte,Winter,Kugel,bauen
Flughafen|Flugzeug,fliegen,Koffer,Gate,Urlaub
Bäckerei|Brot,Brötchen,backen,kaufen,Laden
Zahnbürste|Zähne,putzen,Zahnpasta,morgens,Borsten
Wecker|Uhr,klingeln,aufstehen,morgens,Schlaf
Kopfkissen|Bett,schlafen,weich,Kopf,Bezug
Pizza|Italien,Käse,Teig,Ofen,Salami
Pinguin|Vogel,Eis,schwarz,weiß,Antarktis
Vampir|Blut,Zähne,Dracula,Nacht,Knoblauch
Hochzeit|heiraten,Braut,Ring,Kirche,Feier
Fernbedienung|Fernseher,Knopf,Programm,umschalten,Sofa
Staubsauger|Staub,saugen,putzen,Boden,laut
Schatzkarte|Pirat,Kreuz,Gold,suchen,Insel
Gewitter|Blitz,Donner,Regen,Wolke,Sturm
Eichhörnchen|Nuss,Baum,Schwanz,klettern,rot
Lagerfeuer|Holz,Flamme,Stockbrot,Abend,Camping
Elfmeter|Fußball,Tor,schießen,Torwart,Strafraum
Schlüssel|Tür,Schloss,aufschließen,Bund,verloren
Spiegel|sehen,Bild,Glas,Bad,Gesicht
Zahnfee|Zahn,Kissen,Münze,Kind,Wackelzahn
Marathon|laufen,Kilometer,Läufer,lang,Ziel
Kaugummi|kauen,Blase,kleben,Minze,Mund
Zauberer|Zauberstab,Hut,Trick,Hase,Magie
Ferien|Schule,frei,Sommer,Urlaub,Wochen
Wäscheleine|Wäsche,trocknen,Klammer,Garten,aufhängen
Autobahn|Auto,schnell,Stau,Spur,Raststätte
Hängematte|schaukeln,Netz,Baum,liegen,Urlaub
Popcorn|Kino,Mais,Tüte,salzig,süß
Zelt|Camping,schlafen,Hering,Stange,draußen
Krankenhaus|Arzt,krank,Bett,Operation,Notaufnahme
Karussell|drehen,Kirmes,Pferd,Kinder,Runde
Kompass|Norden,Nadel,Richtung,Wandern,Karte
Brille|Augen,sehen,Gläser,Optiker,Nase
Muschel|Meer,Strand,Schale,Perle,Schnecke
Tannenbaum|Weihnachten,Nadeln,Kugeln,grün,schmücken
Briefkasten|Post,Brief,gelb,einwerfen,Schlitz
Wasserfall|Wasser,fallen,Fluss,Klippe,rauschen
Rollschuhe|Rollen,fahren,Füße,Inliner,Schuhe
Gummibärchen|bunt,süß,Gelatine,Tüte,Bär
Tageszeitung|lesen,Nachrichten,Papier,morgens,Artikel
Feuerwerk|Silvester,Rakete,knallen,Himmel,bunt
Gitarre|Saiten,spielen,Musik,Instrument,zupfen
Badewanne|Wasser,baden,Schaum,Bad,liegen
Ritter|Rüstung,Pferd,Schwert,Burg,Mittelalter
Drache|Feuer,fliegen,Flügel,Märchen,spucken
Kofferraum|Auto,hinten,Gepäck,laden,Klappe
Ampel|rot,grün,gelb,Straße,warten
Schornstein|Dach,Rauch,Kamin,Feger,Haus
Eisdiele|Eis,Kugel,Waffel,Sommer,Italien
Würfel|sechs,Augen,werfen,Spiel,Zahl
Sandburg|Sand,Strand,bauen,Eimer,Schaufel
Briefmarke|Brief,Post,kleben,sammeln,Porto
Igel|Stacheln,Laub,Herbst,klein,rollen
Hamster|Käfig,Rad,Backen,Haustier,klein
Kochlöffel|kochen,Holz,rühren,Topf,Küche
Kartenhaus|Karten,bauen,einstürzen,vorsichtig,Stapel
Schlitten|Schnee,Berg,rodeln,Winter,ziehen
Sonnenbrand|Sonne,rot,Haut,Creme,Strand
Wolkenkratzer|hoch,Stockwerk,Stadt,Gebäude,New York
Gartenzwerg|Garten,Mütze,klein,Bart,Figur
Mikrowelle|warm,Küche,Essen,Minuten,Gerät
Rucksack|Rücken,tragen,Wandern,Schule,Tasche
Lotto|Zahlen,gewinnen,Glück,Schein,Millionen
Nachbar|nebenan,Haus,Wohnung,Tür,Straße
Seifenblase|Seife,Kinder,pusten,platzen,bunt
Toaster|Brot,warm,Frühstück,knusprig,springen
Waschmaschine|Wäsche,waschen,Trommel,schleudern,Keller
Fallschirm|springen,Flugzeug,Luft,landen,öffnen
Hufeisen|Pferd,Glück,Eisen,Huf,Schmied
Schaukel|Spielplatz,hin,her,Kinder,sitzen
Kreuzworträtsel|Kästchen,Wörter,Zeitung,senkrecht,waagerecht
Tankstelle|Benzin,Auto,tanken,Zapfsäule,bezahlen
Kuckucksuhr|Vogel,Uhr,Schwarzwald,Stunde,Holz
Lebkuchen|Weihnachten,Herz,braun,Gewürz,Markt
Sternschnuppe|Himmel,Wunsch,Nacht,fallen,leuchten
Klingel|Tür,läuten,Knopf,Besuch,drücken
Schildkröte|Panzer,langsam,Reptil,alt,Haustier
Tintenfisch|Arme,Meer,Tinte,acht,Krake
Hochhaus|hoch,Stockwerk,Aufzug,Stadt,wohnen
Trampolin|springen,hüpfen,Garten,Netz,Kinder
Fingerabdruck|Finger,Polizei,Spur,Linien,Detektiv
Hausaufgaben|Schule,Lehrer,machen,Heft,Nachmittag
Weltall|Sterne,Planeten,Rakete,Astronaut,schwarz
Zebrastreifen|Straße,weiß,schwarz,Fußgänger,überqueren
Gespenst|Geist,Laken,Schloss,spuken,Buh
Kamel|Höcker,Wüste,reiten,Tier,durstig
Schnorchel|tauchen,Wasser,Rohr,Luft,Maske
Kissenschlacht|Kissen,werfen,Kinder,Bett,Federn
Bratwurst|Grill,Senf,Wurst,Brötchen,braten
Taschenlampe|Licht,dunkel,Batterie,leuchten,Strahl
Schneeballschlacht|Schnee,werfen,Winter,Kugel,Kinder
Heißluftballon|Luft,fliegen,Korb,Feuer,Himmel
Fußgängerzone|Stadt,Läden,gehen,Autos,einkaufen
Bilderrahmen|Foto,Wand,Bild,hängen,Glas
Sparschwein|Geld,sparen,Münzen,Schwein,Schlitz
Kinderwagen|Baby,schieben,Räder,Spaziergang,Eltern
Strandkorb|Strand,sitzen,Nordsee,Korb,Sonne
Wetterbericht|Wetter,Regen,Sonne,Fernsehen,Vorhersage
Zuckerwatte|Zucker,rosa,Kirmes,Stab,süß
Teddybär|Plüsch,Kuscheltier,Kinder,braun,weich
Rasenmäher|Gras,mähen,Garten,laut,schneiden
Schachbrett|Schach,Felder,schwarz,weiß,König
Kartoffelsalat|Kartoffel,Mayonnaise,Grill,Schüssel,Beilage
Hausschuhe|Füße,warm,Wohnung,Puschen,tragen
Laubbläser|Laub,Herbst,blasen,laut,Garten
Bauchredner|Puppe,sprechen,Mund,Bühne,Stimme
Gänsehaut|Haut,frieren,kalt,Angst,Haare
Kopfhörer|Musik,Ohren,hören,Kabel,laut
Pfannkuchen|Pfanne,Teig,Eier,Mehl,süß
Glühwein|Weihnachtsmarkt,warm,Wein,Winter,Tasse
Wohnwagen|Camping,Auto,wohnen,Urlaub,ziehen
Schwimmflügel|Arme,schwimmen,Kinder,aufblasen,Wasser
Lesezeichen|Buch,Seite,lesen,merken,Papier
Postbote|Briefe,Post,bringen,Fahrrad,Paket
Hagel|Eis,Körner,Gewitter,Himmel,Wetter
Polarlicht|Himmel,grün,Norden,leuchten,Nacht
Zahnpasta|Tube,Zähne,putzen,Minze,Zahnbürste
Schaufensterpuppe|Laden,Kleidung,Figur,Fenster,stehen
Klopapier|Toilette,Rolle,weich,Papier,Bad
Stadion|Fußball,Fans,Spiel,Tribüne,Rasen
Bumerang|werfen,zurück,Australien,Holz,fliegen
Pflaster|Wunde,kleben,Haut,Verletzung,Kinder
Löwenzahn|Blume,gelb,pusten,Wiese,Samen
Vogelscheuche|Feld,Vögel,Stroh,Hut,erschrecken
Spinnennetz|Spinne,Faden,fangen,Fliege,Ecke
Glückskeks|Spruch,Zettel,chinesisch,Zukunft,knacken
Zeitreise|Vergangenheit,Zukunft,Maschine,Zeit,reisen
Taucherbrille|Augen,Wasser,tauchen,Glas,Maske
Fliegenklatsche|Fliege,schlagen,Insekt,Sommer,töten
Butterbrot|Butter,Brot,Schule,Pause,schmieren
Wackelpudding|grün,Nachtisch,wackeln,Götterspeise,Gelatine
Leberkäse|Bayern,Semmel,Fleisch,Scheibe,warm
Kirmes|Karussell,Jahrmarkt,Zuckerwatte,Losbude,fahren
Thermometer|Grad,Temperatur,Fieber,messen,warm
Gummistiefel|Regen,Pfütze,Gummi,Füße,matschig
Seilbahn|Berg,Gondel,Seil,fahren,Ski
Elefant|Rüssel,grau,groß,Afrika,Ohren
Giraffe|Hals,lang,Flecken,Afrika,Zoo
Kaktus|Stacheln,Wüste,Pflanze,grün,gießen
Mülleimer|Müll,Deckel,wegwerfen,Tonne,stinken
Hochstuhl|Baby,essen,sitzen,hoch,Tisch
Nudelholz|Teig,rollen,Küche,backen,flach
Duschgel|duschen,Seife,waschen,Flasche,Duft
`
  .trim()
  .split("\n")
  .map((line) => {
    const [t, f] = line.split("|");
    return { t: t.trim(), f: f.split(",").map((x) => x.trim()).filter(Boolean) };
  });
