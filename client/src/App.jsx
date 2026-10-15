import React from "react";
import { useGame } from "./store.jsx";
import Home from "./pages/Home.jsx";
import Lobby from "./pages/Lobby.jsx";
import Game from "./pages/Game.jsx";
import Toast from "./components/Toast.jsx";

export default function App() {
  const { session, state, connected } = useGame();

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
  } else if (state.phase === "LOBBY") {
    content = <Lobby />;
  } else {
    content = <Game />;
  }

  return (
    <div className="app-shell">
      {session && !connected && <div className="offline-banner">⚠️ Keine Verbindung zum Server – verbinde neu …</div>}
      {content}
      <Toast />
    </div>
  );
}
