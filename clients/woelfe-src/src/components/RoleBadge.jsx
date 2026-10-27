import React, { useState } from "react";
import { useGame } from "../store.jsx";
import RoleCard from "./RoleCard.jsx";

// Knopf im Spielfuß: zeigt die eigene Rolle als verdeckte Karte.
export default function RoleBadge() {
  const { myRole } = useGame();
  const [open, setOpen] = useState(false);
  if (!myRole) return null;
  return (
    <>
      <button className="chip-btn role" onClick={() => setOpen(true)}>
        🂠 Meine Rolle
      </button>
      {open && <RoleCard myRole={myRole} onClose={() => setOpen(false)} />}
    </>
  );
}
