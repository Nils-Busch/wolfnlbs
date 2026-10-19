// Rollen-Definitionen und Zuteilungslogik für "Was für Wölfe".
// Basis-Rollenset (v1): Werwolf, Dorfbewohner, Seherin, Hexe, Jäger.
// v2: zusätzlich der Urwolf (Sonderrolle im Wolfs-Team).

export const ROLES = {
  WOLF: "WOLF",
  URWOLF: "URWOLF",
  VILLAGER: "VILLAGER",
  SEER: "SEER",
  WITCH: "WITCH",
  HUNTER: "HUNTER",
};

export const TEAMS = {
  WOLVES: "WOLVES",
  VILLAGE: "VILLAGE",
};

export const ROLE_INFO = {
  [ROLES.WOLF]: {
    name: "Werwolf",
    team: TEAMS.WOLVES,
    emoji: "🐺",
    description:
      "Du tötest jede Nacht gemeinsam mit den anderen Werwölfen einen Mitspieler. Tagsüber musst du dich als Dorfbewohner tarnen.",
  },
  [ROLES.URWOLF]: {
    name: "Urwolf",
    team: TEAMS.WOLVES,
    emoji: "🐺🌑",
    description:
      "Du bist der uralte Urwolf. Du stimmst normalerweise mit den anderen Werwölfen über das nächtliche Opfer ab. Aber: Einmal im Spiel darfst du, sobald mindestens ein Werwolf gestorben ist, statt des gemeinsamen Opfers heimlich einen Mitspieler in einen Werwolf verwandeln – diese Nacht stirbt dann niemand durch die Wölfe.",
  },
  [ROLES.VILLAGER]: {
    name: "Dorfbewohner",
    team: TEAMS.VILLAGE,
    emoji: "👤",
    description:
      "Du hast keine besondere Fähigkeit. Finde durch Diskussion und Abstimmung heraus, wer die Werwölfe sind.",
  },
  [ROLES.SEER]: {
    name: "Seherin",
    team: TEAMS.VILLAGE,
    emoji: "🔮",
    description:
      "Jede Nacht darfst du einen Mitspieler auswählen und siehst heimlich seine wahre Rolle.",
  },
  [ROLES.WITCH]: {
    name: "Hexe",
    team: TEAMS.VILLAGE,
    emoji: "🧪",
    description:
      "Du besitzt zwei Tränke: einen Heiltrank, der das Opfer der Werwölfe einmal im Spiel retten kann, und einen Gifttrank, der einmal im Spiel einen Spieler tötet.",
  },
  [ROLES.HUNTER]: {
    name: "Jäger",
    team: TEAMS.VILLAGE,
    emoji: "🏹",
    description:
      "Wenn du stirbst (egal ob nachts oder durch Abstimmung), darfst du sofort noch einen weiteren Spieler mit dir in den Tod reißen.",
  },
};

// Prüft, ob eine Rolle zum Wolfsrudel gehört (Werwolf oder Urwolf).
export function isWolfTeam(role) {
  return !!role && ROLE_INFO[role]?.team === TEAMS.WOLVES;
}

// Schlägt eine sinnvolle Werwolf-Anzahl für eine gegebene Spielerzahl vor.
export function suggestWolfCount(playerCount) {
  if (playerCount < 5) return 1;
  return Math.max(1, Math.round(playerCount / 4));
}

// Prüft, ob eine Konfiguration für die gegebene Spielerzahl gültig ist.
// playerCount zählt nur die tatsächlich mitspielenden Personen (ohne Erzähler).
export function validateConfig(playerCount, config) {
  const errors = [];
  const { wolves, seer, witch, hunter, urwolf } = config;

  if (!Number.isInteger(wolves) || wolves < 1) {
    errors.push("Es muss mindestens 1 Werwolf geben.");
  }

  if (urwolf && wolves < 2) {
    errors.push("Der Urwolf braucht mindestens 2 Werwölfe insgesamt (Urwolf + mind. 1 normaler Werwolf).");
  }

  const specialRoles = (seer ? 1 : 0) + (witch ? 1 : 0) + (hunter ? 1 : 0);
  const totalAssigned = wolves + specialRoles;

  if (playerCount < 4) {
    errors.push("Ihr braucht mindestens 4 mitspielende Spieler.");
  }

  if (totalAssigned > playerCount) {
    errors.push(
      `Zu viele Rollen (${totalAssigned}) für ${playerCount} mitspielende Spieler konfiguriert.`
    );
  }

  if (wolves >= playerCount - specialRoles && playerCount > 0) {
    // Mindestens 1 Dorfbewohner/Rest-Rolle sollte theoretisch übrig bleiben,
    // ist aber kein hartes Muss – nur eine Warnung in Richtung Spielbarkeit.
    if (wolves > playerCount - specialRoles - 1) {
      errors.push(
        "Zu wenige Dorfbewohner übrig – das Spiel wäre sofort entschieden."
      );
    }
  }

  return errors;
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Weist allen (mitspielenden) Spielern (Array von Player-Objekten) eine Rolle zu.
// Gibt eine Map playerId -> role zurück. Mutiert die Spieler nicht selbst.
export function assignRoles(players, config) {
  const ids = shuffle(players.map((p) => p.id));
  const assignment = new Map();
  let cursor = 0;

  for (let i = 0; i < config.wolves; i++) {
    const role = config.urwolf && i === 0 ? ROLES.URWOLF : ROLES.WOLF;
    assignment.set(ids[cursor++], role);
  }
  if (config.seer) assignment.set(ids[cursor++], ROLES.SEER);
  if (config.witch) assignment.set(ids[cursor++], ROLES.WITCH);
  if (config.hunter) assignment.set(ids[cursor++], ROLES.HUNTER);

  for (; cursor < ids.length; cursor++) {
    assignment.set(ids[cursor], ROLES.VILLAGER);
  }

  return assignment;
}
