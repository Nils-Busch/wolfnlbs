import React from "react";

// Fortschritt einer Abstimmung: Balken + Liste „Name → Ziel“
export default function VoteProgress({ votes, total, label = "haben abgestimmt" }) {
  const pct = total ? Math.round((votes.length / total) * 100) : 0;
  return (
    <div className="progress-box">
      <p className="hint">
        <b>{votes.length}</b> von {total} {label}
      </p>
      <div className="progress-bar"><i style={{ width: `${pct}%` }} /></div>
      {votes.length > 0 && (
        <ul className="vote-feed">
          {votes.map((v, i) => (
            <li key={`${v.voterName}-${i}`}>
              <b>{v.voterName}</b> → {v.targetName || "Enthaltung"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Stimmen je Ziel zählen; die Stimme des Bürgermeisters zählt doppelt.
export function tally(votes, mayorId) {
  const out = {};
  for (const v of votes) if (v.targetId) out[v.targetId] = (out[v.targetId] || 0) + (mayorId && v.voterId === mayorId ? 2 : 1);
  return out;
}
