import React, { useState } from "react";
import { useGame } from "../store.jsx";

export default function RoleBadge() {
  const { myRole } = useGame();
  const [open, setOpen] = useState(false);
  if (!myRole) return null;

  return (
    <div className="role-badge-wrap">
      <button className="btn btn-link role-badge-trigger" onClick={() => setOpen((v) => !v)}>
        {myRole.roleInfo.emoji} Meine Rolle: {myRole.roleInfo.name}
      </button>
      {open && (
        <div className="role-popover">
          <p>
            {myRole.roleInfo.emoji} <strong>{myRole.roleInfo.name}</strong>
          </p>
          <p className="hint">{myRole.roleInfo.description}</p>
          {myRole.wolfTeammates?.length > 0 && (
            <p className="hint">
              Deine Mitwölfe: {myRole.wolfTeammates.map((w) => w.name).join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
