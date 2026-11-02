import React, { useState } from "react";
import { useGame } from "../store.jsx";
import { colorFor, initials } from "../lib/fx.js";

// Was die Spielleitung in der jeweiligen Phase vorliest.
const SCRIPT = {
  NIGHT_AMOR: ["Es wird Nacht im Dorf. Alle schließen die Augen.", "Amor erwacht und schießt seine Pfeile auf zwei Menschen, die sich verlieben."],
  NIGHT_WOLFDOG: ["Amor schläft wieder ein.", "Der Wolfshund erwacht. Bleibt er dem Dorf treu – oder läuft er zum Rudel über?"],
  NIGHT_WOLVES: ["Es wird Nacht im Dorf. Alle schließen die Augen.", "Die Werwölfe erwachen, erkennen einander und suchen sich still ein Opfer."],
  NIGHT_SEER: ["Die Werwölfe sind satt und schlafen ein.", "Die Seherin erwacht und blickt in die Seele eines Menschen."],
  NIGHT_WITCH: ["Die Seherin schläft wieder ein.", "Die Hexe erwacht. Sie sieht das Opfer der Nacht und greift zu ihren Tränken."],
  HUNTER_SHOT: ["Ein Jäger ist gefallen.", "Mit letzter Kraft legt er an und nimmt jemanden mit."],
  DAY_REVEAL: ["Es wird Tag. Alle öffnen die Augen.", "Das Dorf versammelt sich auf dem Marktplatz …"],
  MAYOR_ELECTION: ["Das Dorf braucht eine Führung.", "Wählt eine Bürgermeisterin oder einen Bürgermeister – ihre Stimme zählt doppelt."],
  DAY_DISCUSSION: ["Diskutiert!", "Wer hat sich heute Nacht verdächtig benommen? Wer lügt?"],
  DAY_VOTE: ["Die Zeit ist um.", "Stimmt ab: Wer soll das Dorf verlassen?"],
  VOTE_RESULT: ["Das Dorf hat entschieden.", "Dreht die Karte um – wer war es wirklich?"],
};

const isWolf = (r) => r === "WOLF" || r === "URWOLF";

export default function NarratorPanel() {
  const { narratorInfo: n, state } = useGame();
  const [hide, setHide] = useState(false);
  if (!n) return <div className="card centered-note"><div className="spinner" /><p>Lade Spielleitung …</p></div>;
  const script = SCRIPT[state.phase] || [];
  const nr = state.nightResult;
  const vr = state.voteResult;

  return (
    <div className="stack narrator">
      <div className="card script">
        <span className="script-tag">🎙️ Vorlesen</span>
        {script.map((line, i) => (
          <p key={`${state.phase}-${i}`} style={{ animationDelay: `${0.1 + i * 0.25}s` }}>{line}</p>
        ))}
        {state.phase === "DAY_REVEAL" && (
          <p className="script-extra" style={{ animationDelay: "0.6s" }}>
            {nr?.deaths?.length ? `Gestorben: ${nr.deaths.map((d) => `${d.name} (${d.roleInfo.name})`).join(", ")}.` : "Niemand ist gestorben."}
            {nr?.saved ? ` Die Hexe hat ${nr.saved.name} gerettet.` : ""}
          </p>
        )}
        {state.phase === "VOTE_RESULT" && vr && (
          <p className="script-extra" style={{ animationDelay: "0.6s" }}>
            {vr.eliminated ? `${vr.eliminated.name} muss gehen – war ${vr.eliminated.roleInfo.name}.` : vr.tie ? "Gleichstand – niemand muss gehen." : "Niemand wurde verbannt."}
          </p>
        )}
      </div>

      <div className="card">
        <div className="section-head">
          <h2>Diese Runde</h2>
        </div>
        <ul className="nlog">
          {n.lovers && <li>💘 Verliebt: <b>{n.lovers.join(" & ")}</b></li>}
          {state.phase === "NIGHT_WOLVES" && (
            <li>🐺 Wolfsstimmen: {n.wolfVotes.length ? n.wolfVotes.map((v, i) => <span key={i}><b>{v.voter}</b> → {v.target}{i < n.wolfVotes.length - 1 ? ", " : ""}</span>) : <span className="muted">noch keine</span>}</li>
          )}
          {n.victim && <li>🎯 Opfer der Wölfe: <b>{n.victim}</b></li>}
          {n.converted && <li>🌑 Vom Urwolf verwandelt: <b>{n.converted}</b></li>}
          {n.seer && <li>🔮 Seherin sah: <b>{n.seer.target}</b> ({n.seer.role})</li>}
          {(n.witch.saved || n.witch.poisoned) && (
            <li>🧪 Hexe: {n.witch.saved && <>rettet <b>{n.witch.saved}</b> </>}{n.witch.poisoned && <>vergiftet <b>{n.witch.poisoned}</b></>}</li>
          )}
          <li className="muted small">Tränke: Heilen {n.witch.saveUsed ? "verbraucht" : "übrig"}, Gift {n.witch.poisonUsed ? "verbraucht" : "übrig"}{n.urwolfUsed ? ", Urwolf hat verwandelt" : ""}</li>
          {n.hunter && <li>🏹 Jäger am Zug: <b>{n.hunter}</b></li>}
          {(state.phase === "DAY_VOTE" || state.phase === "VOTE_RESULT") && n.dayVotes.length > 0 && (
            <li>🗳️ {n.dayVotes.map((v, i) => <span key={i}><b>{v.voter}</b> → {v.target || "Enthaltung"}{i < n.dayVotes.length - 1 ? ", " : ""}</span>)}</li>
          )}
        </ul>
      </div>

      <div className="card">
        <div className="section-head">
          <h2>Alle Rollen</h2>
          <button className="chip-btn" onClick={() => setHide((v) => !v)}>{hide ? "👁 Zeigen" : "🙈 Verdecken"}</button>
        </div>
        <ul className={`nroles ${hide ? "hidden" : ""}`}>
          {n.players.map((p, i) => (
            <li key={p.id} className={[!p.alive && "dead", isWolf(p.role) && "wolf"].filter(Boolean).join(" ")} style={{ animationDelay: `${i * 0.04}s` }}>
              <span className="av" style={{ "--c": colorFor(p.name) }}>{initials(p.name)}</span>
              <span className="who">
                <b>{p.name}{p.mayor ? " 🎗️" : ""}{p.lover ? " 💘" : ""}</b>
                <small>{p.roleInfo?.emoji} {p.roleInfo?.name}{!p.alive ? ", tot" : ""}{!p.connected ? ", offline" : ""}</small>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
