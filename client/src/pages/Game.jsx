import React, { useState } from "react";
import { useGame } from "../store.jsx";
import Timer from "../components/Timer.jsx";
import PlayerList from "../components/PlayerList.jsx";
import RoleBadge from "../components/RoleBadge.jsx";

import NightWolves from "../components/NightWolves.jsx";
import NightSeer from "../components/NightSeer.jsx";
import NightWitch from "../components/NightWitch.jsx";
import HunterShot from "../components/HunterShot.jsx";
import DayReveal from "../components/DayReveal.jsx";
import MayorElection from "../components/MayorElection.jsx";
import Discussion from "../components/Discussion.jsx";
import Vote from "../components/Vote.jsx";
import VoteResult from "../components/VoteResult.jsx";
import GameOver from "../components/GameOver.jsx";

const PHASE_LABELS = {
  NIGHT_WOLVES: "🌙 Nacht – Werwölfe",
  NIGHT_SEER: "🌙 Nacht – Seherin",
  NIGHT_WITCH: "🌙 Nacht – Hexe",
  HUNTER_SHOT: "🏹 Der Jäger schießt",
  DAY_REVEAL: "☀️ Der Morgen danach",
  MAYOR_ELECTION: "🎗️ Bürgermeisterwahl",
  DAY_DISCUSSION: "☀️ Diskussion",
  DAY_VOTE: "🗳️ Abstimmung",
  VOTE_RESULT: "📜 Ergebnis",
};

const NIGHT_PHASES = new Set(["NIGHT_WOLVES", "NIGHT_SEER", "NIGHT_WITCH"]);

export default function Game() {
  const { state, isHost, hostSkipPhase, leaveRoom } = useGame();
  const [showPlayers, setShowPlayers] = useState(false);
  const { phase } = state;

  if (phase === "GAME_OVER") return <GameOver />;

  return (
    <div className={`screen phase-${NIGHT_PHASES.has(phase) ? "night" : "day"}`}>
      <header className="game-header">
        <div>
          <p className="eyebrow">
            Tag {state.day} · Raum {state.roomCode}
          </p>
          <h1 className="phase-title">{PHASE_LABELS[phase] || phase}</h1>
        </div>
        <Timer endsAt={state.phaseEndsAt} />
      </header>

      <main className="game-main">
        <PhaseContent phase={phase} />
      </main>

      <footer className="game-footer">
        <RoleBadge />
        <button className="btn btn-link" onClick={() => setShowPlayers((v) => !v)}>
          {showPlayers
            ? "Spieler ausblenden"
            : `Spieler (${state.players.filter((p) => p.alive && !p.isNarrator).length} leben)`}
        </button>
        {isHost && (
          <button className="btn btn-link" onClick={hostSkipPhase}>
            ⏭ Phase überspringen
          </button>
        )}
      </footer>

      {showPlayers && (
        <div className="card player-sheet">
          <PlayerList players={state.players} mayorId={state.mayorId} />
        </div>
      )}
    </div>
  );
}

function PhaseContent({ phase }) {
  switch (phase) {
    case "NIGHT_WOLVES":
      return <NightWolves />;
    case "NIGHT_SEER":
      return <NightSeer />;
    case "NIGHT_WITCH":
      return <NightWitch />;
    case "HUNTER_SHOT":
      return <HunterShot />;
    case "DAY_REVEAL":
      return <DayReveal />;
    case "MAYOR_ELECTION":
      return <MayorElection />;
    case "DAY_DISCUSSION":
      return <Discussion />;
    case "DAY_VOTE":
      return <Vote />;
    case "VOTE_RESULT":
      return <VoteResult />;
    default:
      return null;
  }
}
