// Ein einzelnes, global adressiertes Durable Object für alle Bestenlisten der
// Spielegalerie (ersetzt die frühere lokale scores.json-Datei). Klein genug,
// um komplett im Storage des Objekts zu leben – kein D1 nötig dafür.

import { DurableObject } from "cloudflare:workers";

const MAX_SCORES = 10;

export class Leaderboard extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.scores = null;
    ctx.blockConcurrencyWhile(async () => {
      this.scores = (await ctx.storage.get("scores")) || {};
    });
  }

  // Tages-Bestenlisten (z. B. "staedte20261026") nur 14 Tage aufheben,
  // damit der gespeicherte Wert klein bleibt.
  pruneDaily() {
    const cutoff = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10).replaceAll("-", "");
    for (const key of Object.keys(this.scores)) {
      const m = key.match(/^[a-z]+(\d{8})$/);
      if (m && m[1] < cutoff) delete this.scores[key];
    }
  }

  // Alle Listen auf einmal (für die einmalige Übernahme in die ewige Bestenliste)
  async all() {
    return this.scores;
  }

  async list(game) {
    return this.scores[game] || [];
  }

  async add(game, name, score, order) {
    const list = (this.scores[game] = this.scores[game] || []);
    // Tageslisten: pro Name nur der beste Eintrag
    if (/^[a-z]+\d{8}$/.test(game)) {
      const i = list.findIndex((e) => e.name.toLowerCase() === name.toLowerCase());
      if (i >= 0) {
        const better = order === "asc" ? score < list[i].score : score > list[i].score;
        if (!better) return list;
        list.splice(i, 1);
      }
    }
    list.push({ name, score, date: new Date().toISOString() });
    const dir = order === "asc" ? 1 : -1;
    list.sort((a, b) => dir * (a.score - b.score) || a.date.localeCompare(b.date));
    this.scores[game] = list.slice(0, MAX_SCORES);
    this.pruneDaily();
    await this.ctx.storage.put("scores", this.scores);
    return this.scores[game];
  }
}
