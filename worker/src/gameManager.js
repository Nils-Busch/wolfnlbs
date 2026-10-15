import { ROLES, ROLE_INFO, TEAMS, assignRoles, suggestWolfCount, validateConfig, isWolfTeam } from "./roles.js";
import { makeId } from "./ids.js";

export const PHASES = {
  LOBBY: "LOBBY",
  NIGHT_WOLVES: "NIGHT_WOLVES",
  NIGHT_SEER: "NIGHT_SEER",
  NIGHT_WITCH: "NIGHT_WITCH",
  HUNTER_SHOT: "HUNTER_SHOT",
  DAY_REVEAL: "DAY_REVEAL",
  MAYOR_ELECTION: "MAYOR_ELECTION",
  DAY_DISCUSSION: "DAY_DISCUSSION",
  DAY_VOTE: "DAY_VOTE",
  VOTE_RESULT: "VOTE_RESULT",
  GAME_OVER: "GAME_OVER",
};

const NIGHT_DURATIONS = {
  [PHASES.NIGHT_WOLVES]: 45,
  [PHASES.NIGHT_SEER]: 25,
  [PHASES.NIGHT_WITCH]: 30,
  [PHASES.HUNTER_SHOT]: 20,
  [PHASES.DAY_REVEAL]: 10,
  [PHASES.MAYOR_ELECTION]: 45,
  [PHASES.VOTE_RESULT]: 10,
};

// "alive" schließt den Erzähler (Spielleiter ohne Rolle) grundsätzlich aus –
// er ist nie Teil der Rollenverteilung, Abstimmungen oder Siegbedingungen.
function alive(players) {
  return players.filter((p) => p.alive && !p.isNarrator);
}

function aliveWolves(players) {
  return alive(players).filter((p) => isWolfTeam(p.role));
}

function aliveVillageTeam(players) {
  return alive(players).filter((p) => ROLE_INFO[p.role]?.team === TEAMS.VILLAGE);
}

// Die Spiellogik kennt weder Socket.io noch WebSockets noch Timer direkt.
// Alles, was nach außen geht, läuft über ein "transport"-Objekt:
//   transport.send(playerId, event, payload)  – privat an einen Spieler
//   transport.broadcast(event, payload)       – an alle im Raum
//   transport.scheduleAt(timestampMs)         – Phasen-Timer setzen (null = löschen)
// Im Cloudflare-Durable-Object wird scheduleAt auf einen "Alarm" abgebildet;
// wenn der Alarm feuert, ruft das Durable Object room.onPhaseTimeout() auf.
export class Room {
  constructor(code, transport) {
    this.code = code;
    this.transport = transport;
    this.hostId = null;
    this.players = new Map(); // playerId -> player
    this.phase = PHASES.LOBBY;
    this.day = 0;
    this.config = {
      wolves: 1,
      urwolf: false,
      seer: true,
      witch: true,
      hunter: true,
      mayor: false,
      discussionSeconds: 180,
      voteSeconds: 60,
    };
    this.phaseEndsAt = null;

    this.night = this.emptyNightState();
    this.wolfChatLog = [];
    this.urwolfUsed = false;
    // Hexen-Tränke gelten für das ganze Spiel – deshalb hier und nicht im
    // Nacht-Zustand, der jede Nacht zurückgesetzt wird.
    this.witchSaveUsed = false;
    this.witchPoisonUsed = false;
    this.dayVotes = new Map(); // voterId -> targetId|null
    this.nightResult = null; // { deaths: [{id,name,role}] }
    this.voteResult = null; // { eliminated, tally, tie }
    this.pendingHunterQueue = [];
    this.pendingHunterContext = null; // 'NIGHT' | 'DAY'
    this.winner = null;

    this.mayorId = null;
    this.mayorVotes = new Map(); // voterId -> targetId|null

    this.emptyRoomSince = null;
  }

  emptyNightState() {
    return {
      wolfVotes: new Map(), // wolfId -> targetId
      seerDone: false,
      seerTarget: null,
      witchDone: false,
      savedId: null,
      poisonedId: null,
      victimId: null, // wolves' chosen victim this night
      convertedId: null, // vom Urwolf verwandeltes Ziel (falls benutzt)
    };
  }

  // ---------- Player management ----------

  addPlayer({ name, token, isHost }) {
    const id = makeId(8);
    const player = {
      id,
      token: token || makeId(16),
      name: name.trim().slice(0, 20),
      connected: true,
      alive: true,
      role: null,
      isHost: !!isHost,
      isNarrator: false,
    };
    this.players.set(id, player);
    if (isHost) this.hostId = id;
    return player;
  }

  findPlayerByToken(token) {
    for (const p of this.players.values()) {
      if (p.token === token) return p;
    }
    return null;
  }

  findPlayerByName(name) {
    const lower = name.trim().toLowerCase();
    for (const p of this.players.values()) {
      if (p.name.toLowerCase() === lower) return p;
    }
    return null;
  }

  reconnectPlayer(player) {
    player.connected = true;
    this.resyncPrivateInfo(player);
  }

  // Schickt einem (wieder verbundenen) Spieler die zu seiner Rolle/Phase
  // gehörenden privaten Infos erneut, damit er nach einem Reload nichts verpasst.
  resyncPrivateInfo(player) {
    if (!player.role || !player.alive) return;

    if (isWolfTeam(player.role) && this.phase === PHASES.NIGHT_WOLVES) {
      const wolves = aliveWolves(this.playersArray);
      const votesByName = [...this.night.wolfVotes.entries()].map(([voterId, targetId]) => ({
        voterId,
        voterName: this.players.get(voterId)?.name,
        targetId,
        targetName: this.players.get(targetId)?.name,
      }));
      this.emitTo(player, "wolfProgress", {
        votes: votesByName,
        total: wolves.length,
        urwolfAvailable: this.urwolfAvailable(),
      });
      this.emitTo(player, "wolfChatHistory", this.wolfChatLog);
    }

    if (player.role === ROLES.WITCH && this.phase === PHASES.NIGHT_WITCH) {
      this.sendWitchNightInfo();
    }
  }

  markDisconnected(playerId) {
    const p = this.players.get(playerId);
    if (p) p.connected = false;
    return p || null;
  }

  get playersArray() {
    return [...this.players.values()];
  }

  playableCount() {
    return this.playersArray.filter((p) => !p.isNarrator).length;
  }

  isEmpty() {
    return this.playersArray.every((p) => !p.connected);
  }

  // ---------- Config / lobby ----------

  updateConfig(partial) {
    if (this.phase !== PHASES.LOBBY) {
      throw new Error("Konfiguration kann nur in der Lobby geändert werden.");
    }
    const next = { ...this.config, ...partial };
    const errors = validateConfig(this.playableCount(), next);
    if (errors.length) throw new Error(errors.join(" "));
    this.config = next;
  }

  // Nur der Gastgeber darf sich selbst zum reinen Erzähler (Spielleiter ohne
  // eigene Rolle) erklären – nur solange das Spiel noch nicht läuft.
  setHostNarrator(isNarrator) {
    if (this.phase !== PHASES.LOBBY) {
      throw new Error("Das geht nur in der Lobby, bevor das Spiel startet.");
    }
    const host = this.players.get(this.hostId);
    if (!host) throw new Error("Gastgeber nicht gefunden.");
    host.isNarrator = !!isNarrator;
    this.broadcastState();
  }

  suggestedWolves() {
    return suggestWolfCount(this.playableCount());
  }

  startGame() {
    if (this.phase !== PHASES.LOBBY) throw new Error("Spiel läuft bereits.");
    const playable = this.playersArray.filter((p) => !p.isNarrator);
    const errors = validateConfig(playable.length, this.config);
    if (errors.length) throw new Error(errors.join(" "));

    const assignment = assignRoles(playable, this.config);
    for (const [id, role] of assignment) {
      this.players.get(id).role = role;
      this.players.get(id).alive = true;
    }

    this.day = 1;
    this.winner = null;
    this.urwolfUsed = false;
    this.witchSaveUsed = false;
    this.witchPoisonUsed = false;
    this.mayorId = null;
    this.sendRolesPrivately();
    this.enterPhase(PHASES.NIGHT_WOLVES);
  }

  restartToLobby() {
    for (const p of this.players.values()) {
      p.role = null;
      p.alive = true;
    }
    this.phase = PHASES.LOBBY;
    this.day = 0;
    this.winner = null;
    this.nightResult = null;
    this.voteResult = null;
    this.dayVotes = new Map();
    this.pendingHunterQueue = [];
    this.pendingHunterContext = null;
    this.night = this.emptyNightState();
    this.wolfChatLog = [];
    this.urwolfUsed = false;
    this.witchSaveUsed = false;
    this.witchPoisonUsed = false;
    this.mayorId = null;
    this.mayorVotes = new Map();
    this.clearTimer();
    this.broadcastState();
  }

  sendRolesPrivately() {
    const wolves = this.playersArray.filter((p) => isWolfTeam(p.role));
    for (const p of this.players.values()) {
      if (p.isNarrator) continue; // Erzähler bekommt keine Rolle zugewiesen.
      const payload = {
        role: p.role,
        roleInfo: ROLE_INFO[p.role],
        wolfTeammates: isWolfTeam(p.role)
          ? wolves.filter((w) => w.id !== p.id).map((w) => ({ id: w.id, name: w.name }))
          : [],
      };
      this.emitTo(p, "yourRole", payload);
    }
  }

  // ---------- Phase engine ----------

  clearTimer() {
    this.phaseEndsAt = null;
    this.transport.scheduleAt(null);
  }

  enterPhase(phase, { durationSeconds } = {}) {
    this.clearTimer();
    this.phase = phase;

    if (phase === PHASES.NIGHT_WOLVES) {
      this.night = this.emptyNightState();
      this.wolfChatLog = [];
    }

    if (phase === PHASES.MAYOR_ELECTION) {
      this.mayorVotes = new Map();
      this.mayorId = null; // Amt ist bis zur Neuwahl vakant
    }

    const duration = durationSeconds ?? this.durationFor(phase);
    if (duration) {
      this.phaseEndsAt = Date.now() + duration * 1000;
      this.transport.scheduleAt(this.phaseEndsAt);
    }

    if (phase === PHASES.NIGHT_WITCH) {
      this.sendWitchNightInfo();
    }

    this.broadcastState();

    // Wölfe sofort mit frischem Stand versorgen (u. a. ob der Urwolf verwandeln darf),
    // nicht erst, nachdem jemand abgestimmt hat.
    if (phase === PHASES.NIGHT_WOLVES) {
      this.broadcastWolfProgress();
    }
  }

  durationFor(phase) {
    if (phase === PHASES.DAY_DISCUSSION) return this.config.discussionSeconds;
    if (phase === PHASES.DAY_VOTE) return this.config.voteSeconds;
    return NIGHT_DURATIONS[phase] ?? null;
  }

  onPhaseTimeout() {
    switch (this.phase) {
      case PHASES.NIGHT_WOLVES:
        this.resolveWolfVote(true);
        break;
      case PHASES.NIGHT_SEER:
        this.proceedAfterSeer();
        break;
      case PHASES.NIGHT_WITCH:
        this.proceedAfterWitch();
        break;
      case PHASES.HUNTER_SHOT:
        this.resolveHunterShot(null, true);
        break;
      case PHASES.DAY_REVEAL:
        this.afterReveal();
        break;
      case PHASES.MAYOR_ELECTION:
        this.resolveMayorVote(true);
        break;
      case PHASES.DAY_DISCUSSION:
        this.enterPhase(PHASES.DAY_VOTE);
        break;
      case PHASES.DAY_VOTE:
        this.resolveDayVote(true);
        break;
      case PHASES.VOTE_RESULT:
        this.continueAfterResult();
        break;
      default:
        break;
    }
  }

  // Host kann die aktuelle Phase manuell vorzeitig beenden (z. B. falls jemand offline ist).
  hostSkipPhase() {
    this.onPhaseTimeout();
  }

  // ---------- Night: Werwölfe ----------

  // Ist die Urwolf-Verwandlung aktuell grundsätzlich einsetzbar (unabhängig davon, wer fragt)?
  urwolfAvailable() {
    if (!this.config.urwolf || this.urwolfUsed) return false;
    return this.playersArray.some((p) => !p.alive && isWolfTeam(p.role));
  }

  submitWolfVote(playerId, targetId) {
    const wolf = this.players.get(playerId);
    if (!wolf || !isWolfTeam(wolf.role) || !wolf.alive) {
      throw new Error("Nur lebende Werwölfe dürfen abstimmen.");
    }
    if (this.phase !== PHASES.NIGHT_WOLVES) throw new Error("Nicht die Phase der Werwölfe.");
    const target = this.players.get(targetId);
    if (!target || !target.alive || target.isNarrator) throw new Error("Ungültiges Ziel.");

    this.night.wolfVotes.set(playerId, targetId);
    this.broadcastWolfProgress();

    const wolves = aliveWolves(this.playersArray);
    if (this.night.wolfVotes.size >= wolves.length) {
      this.resolveWolfVote(false);
    }
  }

  // Der Urwolf verwandelt statt zu fressen: einmal pro Spiel, erst nachdem
  // mindestens ein Werwolf gestorben ist. Ersetzt die Opferwahl dieser Nacht komplett.
  submitUrwolfConvert(playerId, targetId) {
    const urwolf = this.players.get(playerId);
    if (!urwolf || urwolf.role !== ROLES.URWOLF || !urwolf.alive) {
      throw new Error("Nur der lebende Urwolf darf das.");
    }
    if (this.phase !== PHASES.NIGHT_WOLVES) throw new Error("Nicht mehr die Nacht der Werwölfe.");
    if (!this.urwolfAvailable()) {
      throw new Error("Die Verwandlung ist nicht (mehr) verfügbar.");
    }
    const target = this.players.get(targetId);
    if (!target || !target.alive || target.isNarrator) throw new Error("Ungültiges Ziel.");
    if (isWolfTeam(target.role)) throw new Error("Dieses Ziel ist schon ein Werwolf.");

    this.urwolfUsed = true;
    target.role = ROLES.WOLF;
    this.night.victimId = null; // diese Nacht stirbt niemand durch die Wölfe
    this.night.convertedId = target.id;
    this.night.wolfVotes = new Map();

    this.sendRolesPrivately();
    this.proceedNightAfterWolves();
  }

  // ---------- Night: Wolfs-Chat (privater Chat nur für das Wolfsrudel) ----------

  submitWolfChatMessage(playerId, text) {
    const sender = this.players.get(playerId);
    if (!sender || !isWolfTeam(sender.role) || !sender.alive) {
      throw new Error("Nur lebende Werwölfe dürfen hier schreiben.");
    }
    if (this.phase !== PHASES.NIGHT_WOLVES) {
      throw new Error("Der Wolfs-Chat ist nur während der Wolfs-Nachtphase offen.");
    }
    const clean = (text || "").toString().trim().slice(0, 300);
    if (!clean) return;

    const entry = {
      id: makeId(8),
      senderId: sender.id,
      senderName: sender.name,
      text: clean,
      at: Date.now(),
    };
    this.wolfChatLog.push(entry);
    if (this.wolfChatLog.length > 200) this.wolfChatLog.shift();

    const wolves = aliveWolves(this.playersArray);
    for (const w of wolves) this.emitTo(w, "wolfChatMessage", entry);
  }

  broadcastWolfProgress() {
    const wolves = aliveWolves(this.playersArray);
    const tally = {};
    for (const targetId of this.night.wolfVotes.values()) {
      tally[targetId] = (tally[targetId] || 0) + 1;
    }
    const votesByName = [...this.night.wolfVotes.entries()].map(([voterId, targetId]) => ({
      voterId,
      voterName: this.players.get(voterId)?.name,
      targetId,
      targetName: this.players.get(targetId)?.name,
    }));
    for (const w of wolves) {
      this.emitTo(w, "wolfProgress", {
        votes: votesByName,
        tally,
        total: wolves.length,
        urwolfAvailable: this.urwolfAvailable(),
      });
    }
  }

  resolveWolfVote(isTimeout) {
    const wolves = aliveWolves(this.playersArray);
    let victimId = null;

    if (this.night.wolfVotes.size > 0) {
      const tally = {};
      for (const t of this.night.wolfVotes.values()) tally[t] = (tally[t] || 0) + 1;
      const max = Math.max(...Object.values(tally));
      const top = Object.keys(tally).filter((id) => tally[id] === max);
      victimId = top[Math.floor(Math.random() * top.length)];
    } else if (isTimeout) {
      const candidates = alive(this.playersArray).filter((p) => !isWolfTeam(p.role));
      if (candidates.length) {
        victimId = candidates[Math.floor(Math.random() * candidates.length)].id;
      }
    }

    this.night.victimId = victimId;
    this.proceedNightAfterWolves();
  }

  proceedNightAfterWolves() {
    const seer = alive(this.playersArray).find((p) => p.role === ROLES.SEER);
    if (this.config.seer && seer) {
      this.enterPhase(PHASES.NIGHT_SEER);
    } else {
      this.proceedAfterSeer();
    }
  }

  // ---------- Night: Seherin ----------

  submitSeerInspect(playerId, targetId) {
    const seer = this.players.get(playerId);
    if (!seer || seer.role !== ROLES.SEER || !seer.alive) {
      throw new Error("Nur die lebende Seherin darf sehen.");
    }
    if (this.phase !== PHASES.NIGHT_SEER) throw new Error("Nicht die Phase der Seherin.");
    if (this.night.seerDone) throw new Error("Du hast diese Nacht schon gesehen.");
    const target = this.players.get(targetId);
    if (!target || target.isNarrator) throw new Error("Ungültiges Ziel.");

    this.night.seerDone = true;
    this.night.seerTarget = targetId;

    this.emitTo(seer, "seerResult", {
      targetId: target.id,
      targetName: target.name,
      role: target.role,
      roleInfo: ROLE_INFO[target.role],
    });

    this.proceedAfterSeer();
  }

  proceedAfterSeer() {
    const witch = alive(this.playersArray).find((p) => p.role === ROLES.WITCH);
    if (this.config.witch && witch) {
      this.enterPhase(PHASES.NIGHT_WITCH);
    } else {
      this.proceedAfterWitch();
    }
  }

  // ---------- Night: Hexe ----------

  sendWitchNightInfo() {
    const witch = alive(this.playersArray).find((p) => p.role === ROLES.WITCH);
    if (!witch) return;
    const victim = this.night.victimId ? this.players.get(this.night.victimId) : null;
    this.emitTo(witch, "witchNightInfo", {
      victimId: victim?.id ?? null,
      victimName: victim?.name ?? null,
      canSave: !this.witchSaveUsed && !!victim,
      canPoison: !this.witchPoisonUsed,
      saveUsed: this.witchSaveUsed,
      poisonUsed: this.witchPoisonUsed,
    });
  }

  submitWitchAction(playerId, { save, poisonTargetId }) {
    const witch = this.players.get(playerId);
    if (!witch || witch.role !== ROLES.WITCH || !witch.alive) {
      throw new Error("Nur die lebende Hexe darf das.");
    }
    if (this.phase !== PHASES.NIGHT_WITCH) throw new Error("Nicht die Phase der Hexe.");
    if (this.night.witchDone) throw new Error("Du hast deine Aktion schon gewählt.");

    if (save) {
      if (this.witchSaveUsed) throw new Error("Heiltrank schon benutzt.");
      if (!this.night.victimId) throw new Error("Niemand zu retten.");
      this.witchSaveUsed = true;
      this.night.savedId = this.night.victimId;
    }

    if (poisonTargetId) {
      if (this.witchPoisonUsed) throw new Error("Gifttrank schon benutzt.");
      const target = this.players.get(poisonTargetId);
      if (!target || !target.alive || target.isNarrator) throw new Error("Ungültiges Ziel.");
      this.witchPoisonUsed = true;
      this.night.poisonedId = poisonTargetId;
    }

    this.night.witchDone = true;
    this.proceedAfterWitch();
  }

  proceedAfterWitch() {
    this.resolveNight();
  }

  // ---------- Night resolution ----------

  resolveNight() {
    const deaths = [];
    const victim = this.night.victimId ? this.players.get(this.night.victimId) : null;
    const saved = !!this.night.victimId && this.night.savedId === this.night.victimId;

    if (victim && !saved) {
      deaths.push(victim);
    }
    if (this.night.poisonedId) {
      const poisoned = this.players.get(this.night.poisonedId);
      if (poisoned && !deaths.includes(poisoned)) deaths.push(poisoned);
    }

    for (const d of deaths) d.alive = false;

    this.nightResult = {
      deaths: deaths.map((d) => ({ id: d.id, name: d.name, role: d.role, roleInfo: ROLE_INFO[d.role] })),
      saved: saved && victim ? { id: victim.id, name: victim.name } : null,
    };

    this.startHunterQueueOrContinue(deaths, "NIGHT");
  }

  // ---------- Jäger ----------

  startHunterQueueOrContinue(deaths, context) {
    const hunterIds = deaths.filter((d) => d.role === ROLES.HUNTER).map((d) => d.id);
    if (hunterIds.length) {
      this.pendingHunterQueue = hunterIds;
      this.pendingHunterContext = context;
      this.enterPhase(PHASES.HUNTER_SHOT);
    } else {
      this.finishDeathBatch(context);
    }
  }

  submitHunterShot(playerId, targetId) {
    if (this.phase !== PHASES.HUNTER_SHOT) throw new Error("Gerade ist niemand am Schießen.");
    const currentShooterId = this.pendingHunterQueue[0];
    if (playerId !== currentShooterId) throw new Error("Nicht dein Zug.");
    const target = this.players.get(targetId);
    if (!target || !target.alive || target.isNarrator || target.id === playerId) {
      throw new Error("Ungültiges Ziel.");
    }
    this.resolveHunterShot(targetId, false);
  }

  resolveHunterShot(targetId, isTimeout) {
    const shooterId = this.pendingHunterQueue.shift();
    let target = targetId ? this.players.get(targetId) : null;

    if (!target && isTimeout) {
      const candidates = alive(this.playersArray).filter((p) => p.id !== shooterId);
      if (candidates.length) {
        target = candidates[Math.floor(Math.random() * candidates.length)];
      }
    }

    if (target) {
      target.alive = false;
      const record = { id: target.id, name: target.name, role: target.role, roleInfo: ROLE_INFO[target.role] };
      if (this.pendingHunterContext === "NIGHT" && this.nightResult) {
        this.nightResult.deaths.push(record);
      } else if (this.pendingHunterContext === "DAY" && this.voteResult) {
        this.voteResult.extraDeaths = this.voteResult.extraDeaths || [];
        this.voteResult.extraDeaths.push(record);
      }
      if (target.role === ROLES.HUNTER) {
        this.pendingHunterQueue.push(target.id);
      }
    }

    if (this.pendingHunterQueue.length) {
      this.enterPhase(PHASES.HUNTER_SHOT);
    } else {
      this.finishDeathBatch(this.pendingHunterContext);
    }
  }

  finishDeathBatch(context) {
    const winner = this.checkWin();
    this.winner = winner;

    if (context === "NIGHT") {
      this.enterPhase(PHASES.DAY_REVEAL);
    } else {
      this.enterPhase(PHASES.VOTE_RESULT);
    }
  }

  checkWin() {
    const wolves = aliveWolves(this.playersArray);
    const village = aliveVillageTeam(this.playersArray);
    if (wolves.length === 0) return TEAMS.VILLAGE;
    if (wolves.length >= village.length) return TEAMS.WOLVES;
    return null;
  }

  // ---------- Bürgermeister-Wahl ----------

  // Muss (neu) gewählt werden: entweder gab es noch nie einen, oder der
  // bisherige Bürgermeister ist in der gerade vergangenen Nacht gestorben.
  needsMayorElection() {
    if (!this.mayorId) return true;
    return (this.nightResult?.deaths || []).some((d) => d.id === this.mayorId);
  }

  submitMayorVote(playerId, targetId) {
    const voter = this.players.get(playerId);
    if (!voter || !voter.alive || voter.isNarrator) throw new Error("Nur lebende Spieler dürfen wählen.");
    if (this.phase !== PHASES.MAYOR_ELECTION) throw new Error("Gerade ist keine Bürgermeisterwahl.");
    if (targetId) {
      const target = this.players.get(targetId);
      if (!target || !target.alive || target.isNarrator) throw new Error("Ungültiges Ziel.");
    }
    this.mayorVotes.set(playerId, targetId || null);
    this.broadcastState();

    const aliveCount = alive(this.playersArray).length;
    if (this.mayorVotes.size >= aliveCount) {
      this.resolveMayorVote();
    }
  }

  resolveMayorVote() {
    const tally = {};
    for (const targetId of this.mayorVotes.values()) {
      if (!targetId) continue;
      tally[targetId] = (tally[targetId] || 0) + 1;
    }
    const entries = Object.entries(tally);
    let chosen = null;

    if (entries.length) {
      const max = Math.max(...entries.map(([, c]) => c));
      const top = entries.filter(([, c]) => c === max).map(([id]) => id);
      chosen = top[Math.floor(Math.random() * top.length)]; // Gleichstand: zufällig entschieden
    } else {
      const candidates = alive(this.playersArray);
      if (candidates.length) chosen = candidates[Math.floor(Math.random() * candidates.length)].id;
    }

    this.mayorId = chosen;
    this.mayorVotes = new Map();
    this.enterPhase(PHASES.DAY_DISCUSSION);
  }

  // ---------- Day ----------

  submitDayVote(playerId, targetId) {
    const voter = this.players.get(playerId);
    if (!voter || !voter.alive || voter.isNarrator) throw new Error("Nur lebende Spieler dürfen abstimmen.");
    if (this.phase !== PHASES.DAY_VOTE) throw new Error("Gerade ist keine Abstimmung.");
    if (targetId) {
      const target = this.players.get(targetId);
      if (!target || !target.alive || target.isNarrator) throw new Error("Ungültiges Ziel.");
    }
    this.dayVotes.set(playerId, targetId || null);
    this.broadcastState();

    const aliveCount = alive(this.playersArray).length;
    if (this.dayVotes.size >= aliveCount) {
      this.resolveDayVote(false);
    }
  }

  resolveDayVote() {
    const tally = {};
    for (const [voterId, targetId] of this.dayVotes.entries()) {
      if (!targetId) continue;
      const weight = this.mayorId && voterId === this.mayorId ? 2 : 1;
      tally[targetId] = (tally[targetId] || 0) + weight;
    }
    const entries = Object.entries(tally);
    let eliminated = null;
    let tie = false;

    if (entries.length) {
      const max = Math.max(...entries.map(([, c]) => c));
      const top = entries.filter(([, c]) => c === max).map(([id]) => id);
      if (top.length === 1) {
        eliminated = this.players.get(top[0]);
      } else {
        tie = true;
      }
    }

    const votesByName = [...this.dayVotes.entries()].map(([voterId, targetId]) => ({
      voterId,
      voterName: this.players.get(voterId)?.name,
      targetId,
      targetName: targetId ? this.players.get(targetId)?.name : null,
      isMayorVote: !!this.mayorId && voterId === this.mayorId,
    }));

    const deaths = [];
    if (eliminated) {
      eliminated.alive = false;
      deaths.push(eliminated);
    }

    this.voteResult = {
      eliminated: eliminated
        ? { id: eliminated.id, name: eliminated.name, role: eliminated.role, roleInfo: ROLE_INFO[eliminated.role] }
        : null,
      tie,
      tally,
      votes: votesByName,
      extraDeaths: [],
    };

    this.dayVotes = new Map();
    this.startHunterQueueOrContinue(deaths, "DAY");
  }

  // Falls der Sieg schon durch die Nachtereignisse feststeht, keine sinnlose
  // Diskussion/Abstimmung mehr anhängen, sondern direkt zum Spielende.
  afterReveal() {
    if (this.winner) {
      this.enterPhase(PHASES.GAME_OVER);
      return;
    }
    if (this.config.mayor && this.needsMayorElection()) {
      this.enterPhase(PHASES.MAYOR_ELECTION);
    } else {
      this.enterPhase(PHASES.DAY_DISCUSSION);
    }
  }

  continueAfterResult() {
    if (this.winner) {
      this.enterPhase(PHASES.GAME_OVER);
      return;
    }
    this.day += 1;
    this.enterPhase(PHASES.NIGHT_WOLVES);
  }

  // ---------- Broadcasting ----------

  emitTo(player, event, payload) {
    if (player) this.transport.send(player.id, event, payload);
  }

  publicPlayers() {
    const revealAll = this.phase === PHASES.GAME_OVER;
    return this.playersArray.map((p) => ({
      id: p.id,
      name: p.name,
      alive: p.alive,
      connected: p.connected,
      isHost: p.id === this.hostId,
      isNarrator: p.isNarrator,
      role: !p.alive || revealAll ? p.role : null,
      roleInfo: !p.alive || revealAll ? ROLE_INFO[p.role] : null,
    }));
  }

  toPublicState() {
    return {
      roomCode: this.code,
      phase: this.phase,
      hostId: this.hostId,
      day: this.day,
      players: this.publicPlayers(),
      config: this.config,
      suggestedWolves: this.suggestedWolves(),
      phaseEndsAt: this.phaseEndsAt,
      mayorId: this.mayorId,
      mayorVotes: [...this.mayorVotes.entries()].map(([voterId, targetId]) => ({
        voterId,
        voterName: this.players.get(voterId)?.name,
        targetId,
        targetName: targetId ? this.players.get(targetId)?.name : null,
      })),
      nightResult:
        this.phase === PHASES.DAY_REVEAL ||
        (this.phase === PHASES.HUNTER_SHOT && this.pendingHunterContext === "NIGHT")
          ? this.nightResult
          : null,
      voteResult:
        this.phase === PHASES.VOTE_RESULT ||
        (this.phase === PHASES.HUNTER_SHOT && this.pendingHunterContext === "DAY")
          ? this.voteResult
          : null,
      dayVotes: [...this.dayVotes.entries()].map(([voterId, targetId]) => ({
        voterId,
        voterName: this.players.get(voterId)?.name,
        targetId,
        targetName: targetId ? this.players.get(targetId)?.name : null,
      })),
      pendingHunter: this.pendingHunterQueue.length
        ? {
            shooterId: this.pendingHunterQueue[0],
            shooterName: this.players.get(this.pendingHunterQueue[0])?.name,
            context: this.pendingHunterContext,
          }
        : null,
      winner: this.winner,
    };
  }

  broadcastState() {
    this.transport.broadcast("state", this.toPublicState());
  }

  // ---------- Speichern / Laden (Durable Object Storage) ----------
  // Der komplette Raum wird als einfaches JSON-Objekt gespeichert, damit er
  // einen Neustart oder Ruhezustand des Durable Objects übersteht.

  toJSON() {
    const n = this.night;
    return {
      v: 1,
      code: this.code,
      hostId: this.hostId,
      players: this.playersArray,
      phase: this.phase,
      day: this.day,
      config: this.config,
      phaseEndsAt: this.phaseEndsAt,
      night: { ...n, wolfVotes: [...n.wolfVotes.entries()] },
      wolfChatLog: this.wolfChatLog,
      urwolfUsed: this.urwolfUsed,
      witchSaveUsed: this.witchSaveUsed,
      witchPoisonUsed: this.witchPoisonUsed,
      dayVotes: [...this.dayVotes.entries()],
      nightResult: this.nightResult,
      voteResult: this.voteResult,
      pendingHunterQueue: this.pendingHunterQueue,
      pendingHunterContext: this.pendingHunterContext,
      winner: this.winner,
      mayorId: this.mayorId,
      mayorVotes: [...this.mayorVotes.entries()],
      emptyRoomSince: this.emptyRoomSince,
    };
  }

  static fromJSON(data, transport) {
    const room = new Room(data.code, transport);
    room.hostId = data.hostId;
    room.players = new Map(data.players.map((p) => [p.id, p]));
    room.phase = data.phase;
    room.day = data.day;
    room.config = { ...room.config, ...data.config };
    room.phaseEndsAt = data.phaseEndsAt;
    room.night = { ...room.emptyNightState(), ...data.night, wolfVotes: new Map(data.night.wolfVotes) };
    room.wolfChatLog = data.wolfChatLog || [];
    room.urwolfUsed = !!data.urwolfUsed;
    room.witchSaveUsed = !!data.witchSaveUsed;
    room.witchPoisonUsed = !!data.witchPoisonUsed;
    room.dayVotes = new Map(data.dayVotes);
    room.nightResult = data.nightResult;
    room.voteResult = data.voteResult;
    room.pendingHunterQueue = data.pendingHunterQueue || [];
    room.pendingHunterContext = data.pendingHunterContext;
    room.winner = data.winner;
    room.mayorId = data.mayorId;
    room.mayorVotes = new Map(data.mayorVotes);
    room.emptyRoomSince = data.emptyRoomSince ?? null;
    return room;
  }
}
