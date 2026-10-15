import React, { useEffect, useState } from "react";

export default function Timer({ endsAt }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  if (!endsAt) return null;

  const remainingMs = Math.max(0, endsAt - now);
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const urgent = totalSeconds <= 10;

  return (
    <div className={`timer ${urgent ? "timer-urgent" : ""}`}>
      ⏱ {minutes > 0 ? `${minutes}:${String(seconds).padStart(2, "0")}` : `${seconds}s`}
    </div>
  );
}
