import React from "react";
import { useGame } from "../store.jsx";
import PlayerList from "../components/PlayerList.jsx";

export default function Lobby() {
  const { state, isHost, me, updateConfig, setNarrator, startGame, leaveRoom, session } = useGame();
  const { config, players, roomCode, suggestedWolves } = state;

  function set(partial) {
    updateConfig({ ...config, ...partial });
  }

  const playableCount = players.filter((p) => !p.isNarrator).length;
  const canStart = playableCount >= 4;

  return (
    <div className="screen">
      <header className="room-header">
        <div>
          <p className="eyebrow">Raum-Code – an alle weitergeben</p>
          <h1 className="room-code">{roomCode}</h1>
        </div>
        <button className="btn btn-link" onClick={leaveRoom}>
          Verlassen
        </button>
      </header>

      <section className="card">
        <h2>Spieler ({players.length})</h2>
        <PlayerList players={players} />
        {playableCount < 4 && <p className="hint">Mindestens 4 mitspielende Spieler nötig, besser 6+.</p>}
      </section>

      {isHost ? (
        <section className="card stack">
          <h2>Einstellungen</h2>

          <label className="toggle-row card-inset">
            <span>
              🎙️ Ich bin nur Erzähler
              <small>Spiele selbst nicht mit, behalte aber die Spielleitung</small>
            </span>
            <input
              type="checkbox"
              checked={!!me?.isNarrator}
              onChange={(e) => setNarrator(e.target.checked)}
            />
          </label>

          <div className="config-row">
            <span>
              🐺 Werwölfe
              <small>Empfehlung: {suggestedWolves}</small>
            </span>
            <div className="stepper">
              <button
                className="btn btn-small"
                onClick={() => set({ wolves: Math.max(1, config.wolves - 1) })}
              >
                −
              </button>
              <strong>{config.wolves}</strong>
              <button className="btn btn-small" onClick={() => set({ wolves: config.wolves + 1 })}>
                +
              </button>
            </div>
          </div>

          <ToggleRow
            emoji="🐺🌑"
            label="Urwolf (einer der Werwölfe, braucht ≥2 Werwölfe)"
            checked={config.urwolf}
            onChange={(v) => set({ urwolf: v })}
          />
          <ToggleRow
            emoji="🔮"
            label="Seherin"
            checked={config.seer}
            onChange={(v) => set({ seer: v })}
          />
          <ToggleRow emoji="🧪" label="Hexe" checked={config.witch} onChange={(v) => set({ witch: v })} />
          <ToggleRow emoji="🏹" label="Jäger" checked={config.hunter} onChange={(v) => set({ hunter: v })} />
          <ToggleRow
            emoji="🎗️"
            label="Bürgermeister-Wahl"
            checked={config.mayor}
            onChange={(v) => set({ mayor: v })}
          />

          <div className="config-row">
            <span>💬 Diskussionszeit</span>
            <SecondsStepper
              value={config.discussionSeconds}
              step={30}
              min={30}
              max={600}
              onChange={(v) => set({ discussionSeconds: v })}
            />
          </div>

          <div className="config-row">
            <span>🗳️ Abstimmzeit</span>
            <SecondsStepper
              value={config.voteSeconds}
              step={15}
              min={15}
              max={300}
              onChange={(v) => set({ voteSeconds: v })}
            />
          </div>

          <button className="btn btn-primary btn-large" disabled={!canStart} onClick={startGame}>
            🌙 Spiel starten
          </button>
        </section>
      ) : (
        <section className="card centered-note">
          <p>Warte, bis der Gastgeber das Spiel startet …</p>
        </section>
      )}
    </div>
  );
}

function ToggleRow({ emoji, label, checked, onChange }) {
  return (
    <label className="config-row toggle-row">
      <span>
        {emoji} {label}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function SecondsStepper({ value, step, min, max, onChange }) {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  const label = minutes > 0 ? `${minutes}:${String(seconds).padStart(2, "0")} min` : `${seconds}s`;
  return (
    <div className="stepper">
      <button className="btn btn-small" onClick={() => onChange(Math.max(min, value - step))}>
        −
      </button>
      <strong>{label}</strong>
      <button className="btn btn-small" onClick={() => onChange(Math.min(max, value + step))}>
        +
      </button>
    </div>
  );
}
