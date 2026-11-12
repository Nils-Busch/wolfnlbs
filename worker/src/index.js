// Einstiegspunkt des gemeinsamen Workers für alle Bereiche.
//
// Das Vereinsheim ist eine geschlossene Gesellschaft: Jede Anfrage läuft zuerst
// durch diesen Worker ("run_worker_first" in wrangler.jsonc) und wird nur mit
// gültigem Zugang (Code, Einladungslink oder Konto) beantwortet – siehe
// zugang/gate.js. Danach geht es an die Bereiche (/api/<bereich>/*) bzw. an
// die statischen Dateien aus client-assets/.

import { handleWoelfe, GameRoom } from "./woelfe/router.js";
import { handleSpiele, DuelRoom, Leaderboard, Wordle, PartyRoom } from "./spiele/router.js";
import { handleTischtennisApi } from "./tischtennis/router.js";
import { handleKontoApi } from "./konto/auth.js";
import { handleQuiz, QuizRoom } from "./quiz/router.js";
import { checkRateLimit } from "./ratelimit.js";
import { guard, handleZugangApi, redeemInvite, enterTournamentLink } from "./zugang/gate.js";

export { GameRoom, DuelRoom, Leaderboard, Wordle, QuizRoom, PartyRoom };

async function route(request, env, path, guest) {
  if (path.startsWith("/api/zugang")) {
    return handleZugangApi(request, env, path.slice("/api/zugang".length) || "/");
  }
  if (path.startsWith("/api/woelfe")) {
    return handleWoelfe(request, env, path.slice("/api/woelfe".length) || "/");
  }
  if (path.startsWith("/api/spiele")) {
    return handleSpiele(request, env, path.slice("/api/spiele".length) || "/");
  }
  if (path.startsWith("/api/konto")) {
    return handleKontoApi(request, env, path.slice("/api/konto".length) || "/");
  }
  if (path.startsWith("/api/quiz")) {
    return handleQuiz(request, env, path.slice("/api/quiz".length) || "/");
  }
  if (path.startsWith("/api/tischtennis")) {
    return handleTischtennisApi(request, env, path.slice("/api/tischtennis".length) || "/", { guestTid: guest?.tid ?? null });
  }
  const invite = path.match(/^\/zugang\/([a-f0-9]{16,64})$/);
  if (invite) return redeemInvite(request, env, invite[1]);
  const linkMatch = path.match(/^\/tischtennis\/t\/([a-z0-9]+)$/);
  if (linkMatch) return enterTournamentLink(request, env, linkMatch[1]);
  return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Nicht gefunden.", { status: 404 });
}

/**
 * Turnier-Gäste: Seiten ohne Menü zu den anderen Bereichen, das Logo führt
 * zurück zum Turnier, oben steht „Gastzugang“.
 */
function asGuestPage(res, guest) {
  if (!guest || !(res.headers.get("content-type") || "").includes("text/html")) return res;
  const home = `/tischtennis/#t=${guest.tid}`;
  return new HTMLRewriter()
    .on("body", { element(e) { e.setAttribute("class", `${e.getAttribute("class") || ""} vh-guest`.trim()); } })
    .on(".vh-header nav", { element(e) { e.remove(); } })
    .on(".top-links", { element(e) { e.remove(); } })
    .on("a.vh-brand", { element(e) { e.setAttribute("href", home); } })
    .on(".vh-header", { element(e) { e.append(`<span class="vh-guest-pill" title="Du siehst nur dieses Turnier">Gastzugang</span>`, { html: true }); } })
    .transform(res);
}

/** Suchmaschinen fernhalten und ggf. das verlängerte Zugangs-Cookie mitschicken. */
function finish(res, setCookie) {
  if (res.status === 101 || res.webSocket) return res; // WebSocket-Antworten nicht anfassen
  const out = new Response(res.body, res);
  out.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (setCookie) out.headers.append("set-cookie", setCookie);
  return out;
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;

    // Missbrauchsschutz für Raum-Erstellung, Tipps, Anmeldung, Zugangscode und Bestenlisten
    const limited = checkRateLimit(request, path);
    if (limited) return finish(limited);

    const gate = await guard(request, env, path);
    if (gate.response) return finish(gate.response);

    return finish(asGuestPage(await route(request, env, path, gate.guest), gate.guest), gate.setCookie);
  },
};
