// Wordle auf Deutsch – Tagesrätsel mit Bestenliste und freie Übungsrunden.
//
// Das Lösungswort verlässt den Server erst, wenn die Runde vorbei ist: Der
// Browser schickt jeden Rateversuch hierher und bekommt nur die Farben zurück.
// Versuche und Zeit zählt der Server selbst – in die Bestenliste kommt nur, wer
// das Tagesrätsel hier wirklich gelöst hat.
//
// Ein einzelnes, global adressiertes Durable Object hält die laufenden Runden
// (werden nach 3 Tagen aufgeräumt) und die Tagesbestenlisten.

import { DurableObject } from "cloudflare:workers";
import { SOLUTIONS, ALLOWED } from "./wordleWords.js";

const MAX_GUESSES = 6;
const BOARD_SIZE = 30;
const SESSION_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const FIRST_DAY = Date.UTC(2026, 9, 24); // Tag #1 = 24.10.2026

const ALLOWED_SET = new Set();
for (let i = 0; i < ALLOWED.length; i += 5) ALLOWED_SET.add(ALLOWED.slice(i, i + 5));
for (const w of SOLUTIONS) ALLOWED_SET.add(w);

/** Heutiges Datum in deutscher Zeit als "JJJJ-MM-TT". */
export function berlinDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function puzzleNumber(date) {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - FIRST_DAY) / 86400000) + 1;
}

function dailyWord(date) {
  const n = puzzleNumber(date);
  const i = (((n - 1) % SOLUTIONS.length) + SOLUTIONS.length) % SOLUTIONS.length;
  return SOLUTIONS[i];
}

/** Farbmuster wie im Original: g = richtig, y = kommt vor, b = kommt nicht vor. */
export function score(guess, solution) {
  const res = Array(5).fill("b");
  const left = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === solution[i]) res[i] = "g";
    else left[solution[i]] = (left[solution[i]] || 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (res[i] === "g") continue;
    if (left[guess[i]] > 0) {
      res[i] = "y";
      left[guess[i]]--;
    }
  }
  return res.join("");
}

// Eingaben normalisieren: Großbuchstaben; Umlaute werden zu "AE/OE/UE" erweitert
// (dann hat das Wort aber meist nicht mehr 5 Buchstaben und wird abgelehnt).
export function normalizeGuess(w) {
  return String(w || "")
    .trim()
    .toUpperCase()
    .replace(/Ä/g, "AE")
    .replace(/Ö/g, "OE")
    .replace(/Ü/g, "UE")
    .replace(/ß/g, "SS");
}

function randomId() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export class Wordle extends DurableObject {
  // Öffentliche Sicht auf eine Runde (Lösung nur, wenn vorbei).
  view(id, s) {
    const over = s.status !== "playing";
    return {
      sessionId: id,
      mode: s.mode,
      date: s.date,
      number: s.mode === "daily" ? puzzleNumber(s.date) : null,
      guesses: s.guesses,
      status: s.status,
      solution: over ? s.solution : null,
      seconds: over ? Math.round((s.finishedAt - s.startedAt) / 1000) : null,
      submitted: !!s.submitted,
      maxGuesses: MAX_GUESSES,
    };
  }

  async start(mode) {
    const date = berlinDate();
    const solution = mode === "daily" ? dailyWord(date) : SOLUTIONS[Math.floor(Math.random() * SOLUTIONS.length)];
    const id = randomId();
    const s = { mode, date, solution, guesses: [], status: "playing", startedAt: Date.now(), finishedAt: null, submitted: false };
    await this.ctx.storage.put("s:" + id, s);
    await this.scheduleCleanup();
    return this.view(id, s);
  }

  async get(id) {
    const s = await this.ctx.storage.get("s:" + id);
    if (!s) return null;
    return this.view(id, s);
  }

  async guess(id, word) {
    const s = await this.ctx.storage.get("s:" + id);
    if (!s) return { error: "Diese Runde gibt es nicht mehr. Bitte neu starten." };
    if (s.status !== "playing") return { error: "Diese Runde ist schon vorbei." };
    if (s.mode === "daily" && s.date !== berlinDate()) {
      return { error: "Das war das Rätsel von gestern – lade die Seite neu für das heutige." };
    }
    const g = normalizeGuess(word);
    if (!/^[A-Z]{5}$/.test(g)) return { error: "Bitte genau 5 Buchstaben (ohne Ä, Ö, Ü, ß)." };
    if (!ALLOWED_SET.has(g)) return { error: "Dieses Wort kenne ich nicht." };
    const pattern = score(g, s.solution);
    s.guesses.push({ word: g, pattern });
    if (pattern === "ggggg") s.status = "won";
    else if (s.guesses.length >= MAX_GUESSES) s.status = "lost";
    if (s.status !== "playing") s.finishedAt = Date.now();
    await this.ctx.storage.put("s:" + id, s);
    return this.view(id, s);
  }

  async submit(id, name) {
    const s = await this.ctx.storage.get("s:" + id);
    if (!s) return { error: "Diese Runde gibt es nicht mehr." };
    if (s.mode !== "daily") return { error: "Nur das Tagesrätsel kommt in die Bestenliste." };
    if (s.status !== "won") return { error: "Nur gelöste Rätsel kommen in die Bestenliste." };
    if (s.submitted) return { error: "Schon eingetragen." };
    const clean = String(name || "").trim().slice(0, 16);
    if (!clean) return { error: "Name fehlt." };
    const key = "b:" + s.date;
    const board = (await this.ctx.storage.get(key)) || [];
    if (board.some((e) => e.name.toLowerCase() === clean.toLowerCase())) {
      return { error: "Dieser Name steht heute schon in der Liste." };
    }
    const entry = { name: clean, attempts: s.guesses.length, seconds: Math.round((s.finishedAt - s.startedAt) / 1000) };
    board.push(entry);
    board.sort((a, b) => a.attempts - b.attempts || a.seconds - b.seconds);
    const trimmed = board.slice(0, BOARD_SIZE);
    s.submitted = true;
    await this.ctx.storage.put({ [key]: trimmed, ["s:" + id]: s });
    return { board: trimmed, date: s.date, entry };
  }

  async board(date) {
    const d = /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : berlinDate();
    return { date: d, number: puzzleNumber(d), board: (await this.ctx.storage.get("b:" + d)) || [] };
  }

  async scheduleCleanup() {
    if ((await this.ctx.storage.getAlarm()) == null) {
      await this.ctx.storage.setAlarm(Date.now() + 6 * 60 * 60 * 1000);
    }
  }

  async alarm() {
    const cutoff = Date.now() - SESSION_TTL_MS;
    const sessions = await this.ctx.storage.list({ prefix: "s:" });
    const old = [];
    for (const [k, v] of sessions) if (v.startedAt < cutoff) old.push(k);
    for (let i = 0; i < old.length; i += 128) await this.ctx.storage.delete(old.slice(i, i + 128));
    // Bestenlisten älter als 60 Tage löschen.
    const boards = await this.ctx.storage.list({ prefix: "b:" });
    const oldBoards = [];
    const limit = berlinDate(new Date(Date.now() - 60 * 86400000));
    for (const k of boards.keys()) if (k.slice(2) < limit) oldBoards.push(k);
    for (let i = 0; i < oldBoards.length; i += 128) await this.ctx.storage.delete(oldBoards.slice(i, i + 128));
    if (sessions.size - old.length > 0) await this.ctx.storage.setAlarm(Date.now() + 6 * 60 * 60 * 1000);
  }
}
