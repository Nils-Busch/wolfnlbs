import React, { useEffect, useRef, useState } from "react";
import { useGame } from "./store.jsx";
import Home from "./pages/Home.jsx";
import Lobby from "./pages/Lobby.jsx";
import Game from "./pages/Game.jsx";
import Toast from "./components/Toast.jsx";
import Sky from "./components/Sky.jsx";
import PhaseCurtain from "./components/PhaseCurtain.jsx";
import RoleCard from "./components/RoleCard.jsx";
import { PHASES, buzz } from "./lib/fx.js";

const ACK_KEY = "wfw-role-seen";
const readAck = () => {
  try { return sessionStorage.getItem(ACK_KEY) || ""; } catch { return ""; }
};
const writeAck = (v) => {
  try { v ? sessionStorage.setItem(ACK_KEY, v) : sessionStorage.removeItem(ACK_KEY); } catch { /* egal */ }
};

// Bin ich in dieser Phase an der Reihe? Dann vibriert das Handy.
function myTurn(state, me, myRole) {
  if (!state || !me || !me.alive || me.isNarrator) return false;
  switch (state.phase) {
    case "NIGHT_WOLVES": return myRole?.role === "WOLF" || myRole?.role === "URWOLF";
    case "NIGHT_SEER": return myRole?.role === "SEER";
    case "NIGHT_WITCH": return myRole?.role === "WITCH";
    case "HUNTER_SHOT": return state.pendingHunter?.shooterId === me.id;
    case "DAY_VOTE":
    case "MAYOR_ELECTION": return true;
    default: return false;
  }
}

export default function App() {
  const { session, state, connected, myRole, me } = useGame();
  const [ack, setAck] = useState(readAck);
  const prevRole = useRef(null);
  const phase = state?.phase;

  // Neue Runde in der Lobby: Rollenkarte beim nächsten Start wieder zeigen
  useEffect(() => {
    if (phase === "LOBBY" && ack) { writeAck(""); setAck(""); }
  }, [phase, ack]);

  // Vibration, wenn man selbst handeln muss
  const lastBuzz = useRef("");
  useEffect(() => {
    if (!state) return;
    const key = `${state.phase}-${state.day}`;
    if (lastBuzz.current === "") { lastBuzz.current = key; return; } // nicht beim Laden
    if (lastBuzz.current === key) return;
    lastBuzz.current = key;
    if (myTurn(state, me, myRole)) buzz();
  }, [state, me, myRole]);

  const roleKey = myRole && state ? `${state.roomCode}:${myRole.role}` : "";
  // Urwolf hat mich verwandelt: Rolle wechselt mitten im Spiel zu „Werwolf“
  const [convertedKey, setConvertedKey] = useState("");
  useEffect(() => {
    if (phase === "LOBBY") { prevRole.current = null; return; }
    if (!myRole) return;
    if (prevRole.current && prevRole.current !== myRole.role && myRole.role === "WOLF") setConvertedKey(roleKey);
    prevRole.current = myRole.role;
  }, [myRole, roleKey, phase]);
  const converted = convertedKey === roleKey && !!roleKey;
  const showRole = !!(state && phase !== "LOBBY" && phase !== "GAME_OVER" && myRole && roleKey !== ack);

  const isDay = state ? (phase === "GAME_OVER" ? state.winner !== "WOLVES" : !!PHASES[phase]?.day) : false;

  let content;
  if (!session) {
    content = <Home />;
  } else if (!state) {
    content = (
      <div className="centered-screen">
        <div className="spinner" />
        <p>Verbinde mit dem Raum …</p>
      </div>
    );
  } else if (phase === "LOBBY") {
    content = <Lobby />;
  } else {
    content = <Game />;
  }

  return (
    <>
      <Sky day={isDay} />
      <div className="app-shell">
        {session && !connected && <div className="offline-banner">Keine Verbindung – verbinde neu …</div>}
        {content}
        {state && phase !== "LOBBY" && <PhaseCurtain phase={phase} day={state.day} />}
        {showRole && (
          <RoleCard
            myRole={myRole}
            requireOpen
            title={converted ? "Du wurdest verwandelt!" : "Deine Rolle für diese Runde"}
            note="Schau heimlich nach. Du findest die Karte später unten unter „Meine Rolle“."
            onClose={() => { writeAck(roleKey); setAck(roleKey); }}
          />
        )}
        <Toast />
      </div>
    </>
  );
}
