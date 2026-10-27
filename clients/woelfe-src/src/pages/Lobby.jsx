import React, { useState } from "react";
import { useGame } from "../store.jsx";
import PlayerList from "../components/PlayerList.jsx";

const ROLES = [
  { key: "urwolf", em: "🐺🌑", name: "Urwolf", note: "verwandelt einmal statt zu fressen (ab 2 Wölfen)" },
  { key: "seer", em: "🔮", name: "Seherin", note: "sieht jede Nacht eine Rolle" },
  { key: "witch", em: "🧪", name: "Hexe", note: "ein Heil- und ein Gifttrank" },
  { key: "hunter", em: "🏹", name: "Jäger", note: "nimmt beim Tod jemanden mit" },
  { key: "mayor", em: "🎗️", name: "Bürgermeister", note: "Wahl, Stimme zählt doppelt" },
];

export default function Lobby() {
  const { state, isHost, me, updateConfig, setNarrator, startGame, leaveRoom } = useGame();
  const { config, players, roomCode, suggestedWolves } = state;
  const [copied, setCopied] = useState(false);

  function set(partial) {
    updateConfig({ ...config, ...partial });
  }

  const playableCount = players.filter((p) => !p.isNarrator).length;
  const canStart = playableCount >= 4;
  const link = `${location.origin}/woelfe/?room=${roomCode}`;

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: "Was für Wölfe", text: `Komm in meinen Werwolf-Raum: ${roomCode}`, url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* abgebrochen */
    }
  }

  return (
    <div className="screen enter">
      <header className="room-header">
        <div>
          <p className="code-label">Raum-Code – an alle weitergeben</p>
          <div className="code-tiles" aria-label={`Raum-Code ${roomCode}`}>
            {[...roomCode].map((ch, i) => (
              <span key={i}>{ch}</span>
            ))}
          </div>
          <div className="share-row">
            <button className="btn btn-secondary" onClick={share}>
              {copied ? "Link kopiert ✓" : "Einladungslink teilen"}
            </button>
          </div>
        </div>
        <button className="chip-btn" onClick={leaveRoom}>
          Verlassen
        </button>
      </header>

      <section className="card stack">
        <div className="section-head">
          <h2>Am Tisch</h2>
          <span className="count-pill">{playableCount} spielen mit</span>
        </div>
        <PlayerList players={players} meId={me?.id} />
        {playableCount < 4 && <p className="hint">Mindestens 4 Mitspielende, richtig gut wird es ab 6.</p>}
      </section>

      {isHost ? (
        <section className="card stack">
          <h2>Spielregeln</h2>

          <label className="toggle-row card-inset">
            <span>
              🎙️ Ich leite nur
              <small>Du spielst nicht mit, behältst aber die Spielleitung</small>
            </span>
            <input type="checkbox" checked={!!me?.isNarrator} onChange={(e) => setNarrator(e.target.checked)} />
          </label>

          <div className="config-row">
            <span>
              🐺 Werwölfe
              <small>Empfehlung für {playableCount} Personen: {suggestedWolves}</small>
            </span>
            <div className="stepper">
              <button className="btn btn-small" aria-label="Weniger Werwölfe" onClick={() => set({ wolves: Math.max(1, config.wolves - 1) })}>
                −
              </button>
              <strong>{config.wolves}</strong>
              <button className="btn btn-small" aria-label="Mehr Werwölfe" onClick={() => set({ wolves: config.wolves + 1 })}>
                +
              </button>
            </div>
          </div>

          <div className="role-toggles" role="group" aria-label="Sonderrollen">
            {ROLES.map((r) => (
              <button
                key={r.key}
                type="button"
                className={`role-toggle ${config[r.key] ? "on" : ""}`}
                aria-pressed={!!config[r.key]}
                onClick={() => set({ [r.key]: !config[r.key] })}
              >
                <span className="em">{r.em}</span>
                <b>{r.name}</b>
                <small>{r.note}</small>
              </button>
            ))}
          </div>

          <div className="config-row">
            <span>💬 Diskussionszeit</span>
            <SecondsStepper value={config.discussionSeconds} step={30} min={30} max={600} onChange={(v) => set({ discussionSeconds: v })} />
          </div>
          <div className="config-row">
            <span>🗳️ Abstimmzeit</span>
            <SecondsStepper value={config.voteSeconds} step={15} min={15} max={300} onChange={(v) => set({ voteSeconds: v })} />
          </div>

          <button className="btn btn-primary btn-large" disabled={!canStart} onClick={startGame}>
            🌙 Die Nacht beginnen
          </button>
        </section>
      ) : (
        <section className="card wait-note">
          <span className="wait-dots" aria-hidden="true"><i /><i /><i /></span>
          <p style={{ margin: 0 }}>Die Spielleitung stellt gerade die Regeln ein …</p>
        </section>
      )}
    </div>
  );
}

function SecondsStepper({ value, step, min, max, onChange }) {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  const label = minutes > 0 ? `${minutes}:${String(seconds).padStart(2, "0")} min` : `${seconds} s`;
  return (
    <div className="stepper">
      <button className="btn btn-small" aria-label="Weniger" onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <strong>{label}</strong>
      <button className="btn btn-small" aria-label="Mehr" onClick={() => onChange(Math.min(max, value + step))}>
        +
      </button>
    </div>
  );
}
