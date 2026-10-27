import React, { useEffect, useRef, useState } from "react";

const R = 26;
const C = 2 * Math.PI * R;

// Runder Countdown. Die Gesamtdauer kennt der Client nicht – sie wird beim ersten
// Sehen eines neuen Endzeitpunkts gemerkt.
export default function Timer({ endsAt }) {
  const [now, setNow] = useState(Date.now());
  const total = useRef({ endsAt: null, ms: 1 });

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!endsAt) return null;
  if (total.current.endsAt !== endsAt) total.current = { endsAt, ms: Math.max(1000, endsAt - Date.now()) };

  const remainingMs = Math.max(0, endsAt - now);
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const urgent = totalSeconds <= 10;
  const frac = Math.min(1, remainingMs / total.current.ms);

  return (
    <div className={`timer-ring ${urgent ? "urgent" : ""}`} role="timer" aria-label={`Noch ${totalSeconds} Sekunden`}>
      <svg viewBox="0 0 62 62">
        <circle className="track" cx="31" cy="31" r={R} />
        <circle className="bar" cx="31" cy="31" r={R} strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
      </svg>
      <b>{minutes > 0 ? `${minutes}:${String(seconds).padStart(2, "0")}` : seconds}</b>
    </div>
  );
}
