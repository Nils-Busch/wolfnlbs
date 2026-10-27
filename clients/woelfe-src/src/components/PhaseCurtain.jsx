import React, { useEffect, useRef, useState } from "react";
import { PHASES } from "../lib/fx.js";

// Kurze Einblendung bei jedem Phasenwechsel („Die Nacht bricht herein“).
// Beim ersten Laden (z. B. nach Neuladen der Seite) bleibt sie aus.
export default function PhaseCurtain({ phase, day }) {
  const prev = useRef(phase);
  const [shown, setShown] = useState(null);

  useEffect(() => {
    if (prev.current === phase) return;
    prev.current = phase;
    const info = PHASES[phase];
    if (!info) return;
    const key = `${phase}-${day}-${Date.now()}`;
    setShown({ ...info, key });
    const t = setTimeout(() => setShown((s) => (s && s.key === key ? null : s)), 2200);
    return () => clearTimeout(t);
  }, [phase, day]);

  if (!shown) return null;
  return (
    <div key={shown.key} className={`curtain ${shown.day ? "day" : ""}`} aria-hidden="true">
      <div>
        <span className="em">{shown.em}</span>
        <h2>{shown.title}</h2>
        {shown.sub && <p>{shown.sub}</p>}
      </div>
    </div>
  );
}
