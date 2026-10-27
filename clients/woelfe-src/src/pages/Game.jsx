import React, { useState } from "react";
import { useGame } from "../store.jsx";
import Timer from "../components/Timer.jsx";
import PlayerList from "../components/PlayerList.jsx";
import RoleBadge from "../components/RoleBadge.jsx";
import { PHASES } from "../lib/fx.js";

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

export default function Game() {
  const { state, me, isHost, hostSkipPhase } = useGame();
  const [showPlayers, setShowPlayers] = useState(false);
  const { phase } = state;

  if (phase === "GAME_OVER") return <GameOver />;
  const info = PHASES[phase] || { em: "", label: phase };
  const alive = state.players.filter((p) => p.alive && !p.isNarrator).length;

  return (
    <div className="screen">
      <header className="game-header">
        <div>
          <p className="day-chip">
            {info.day ? "☀️" : "🌙"} <b>{info.day ? `Tag ${state.day}` : `Nacht ${state.day}`}</b> · Raum {state.roomCode}
          </p>
          <h1 className="phase-title" key={phase}>
            <span className="em">{info.em}</span>
            {info.label}
          </h1>
        </div>
        <Timer endsAt={state.phaseEndsAt} />
      </header>

      <main className="game-main" key={phase}>
        <PhaseContent phase={phase} />
      </main>

      <footer className="game-footer">
        <RoleBadge />
        <button className="chip-btn" onClick={() => setShowPlayers((v) => !v)} aria-expanded={showPlayers}>
          👥 {showPlayers ? "Ausblenden" : `${alive} leben`}
        </button>
        {isHost && (
          <button className="chip-btn" onClick={hostSkipPhase}>
            ⏭ Weiter
          </button>
        )}
      </footer>

      {showPlayers && (
        <div className="card player-sheet">
          <PlayerList players={state.players} mayorId={state.mayorId} meId={me?.id} />
        </div>
      )}
    </div>
  );
}

function PhaseContent({ phase }) {
  switch (phase) {
    case "NIGHT_WOLVES": return <NightWolves />;
    case "NIGHT_SEER": return <NightSeer />;
    case "NIGHT_WITCH": return <NightWitch />;
    case "HUNTER_SHOT": return <HunterShot />;
    case "DAY_REVEAL": return <DayReveal />;
    case "MAYOR_ELECTION": return <MayorElection />;
    case "DAY_DISCUSSION": return <Discussion />;
    case "DAY_VOTE": return <Vote />;
    case "VOTE_RESULT": return <VoteResult />;
    default: return null;
  }
}
