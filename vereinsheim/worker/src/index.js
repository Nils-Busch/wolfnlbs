// Einstiegspunkt des gemeinsamen Workers für alle drei Bereiche.
//
// Cloudflare liefert alles, was NICHT unter "run_worker_first" in wrangler.jsonc
// fällt, direkt als statische Datei aus client-assets/ aus – dieser Worker sieht
// also nur die dynamischen Pfade: /api/<bereich>/* und den kurzen Besucher-Link
// für Tischtennis-Turniere.

import { handleWoelfe, GameRoom } from "./woelfe/router.js";
import { handleSpiele, DuelRoom, Leaderboard } from "./spiele/router.js";
import { handleTischtennisApi, resolveVisitorLink } from "./tischtennis/router.js";

export { GameRoom, DuelRoom, Leaderboard };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/api/woelfe")) {
      return handleWoelfe(request, env, path.slice("/api/woelfe".length) || "/");
    }
    if (path.startsWith("/api/spiele")) {
      return handleSpiele(request, env, path.slice("/api/spiele".length) || "/");
    }
    if (path.startsWith("/api/tischtennis")) {
      return handleTischtennisApi(request, env, path.slice("/api/tischtennis".length) || "/");
    }
    const linkMatch = path.match(/^\/tischtennis\/t\/([a-z0-9]+)$/);
    if (linkMatch) {
      return resolveVisitorLink(env, linkMatch[1]);
    }

    // Sollte wegen "run_worker_first" in wrangler.jsonc eigentlich nie erreicht
    // werden (alles andere liefert Cloudflare direkt als Datei aus) – nur als
    // Sicherheitsnetz, falls doch mal ein unerwarteter Pfad hier landet.
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Nicht gefunden.", { status: 404 });
  },
};
