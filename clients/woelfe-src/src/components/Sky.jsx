import React from "react";

// Hintergrund: Sternenhimmel mit Mond über dem Dorf; tagsüber Morgenrot und Sonne.
export default function Sky({ day }) {
  return (
    <div className={`sky ${day ? "is-day" : ""}`} aria-hidden="true">
      <div className="sky-layer sky-night" />
      <div className="sky-layer sky-day" />
      <div className="sky-stars" />
      <div className="sky-stars b" />
      <div className="sky-orb" />
      <div className="sky-fog" />
      <svg className="sky-hills" viewBox="0 0 400 120" preserveAspectRatio="none">
        <path className="h1" d="M0 70 Q60 40 120 62 T240 56 T400 50 V120 H0 Z" />
        <path
          className="h2"
          d="M0 92 L18 92 L18 80 L28 72 L38 80 L38 92 L70 92 Q110 78 150 90 L162 90 L162 74 L174 64 L186 74 L186 90 L230 90 L230 70 L236 70 L236 60 L242 54 L248 60 L248 70 L254 70 L254 90 L300 90 Q340 76 372 88 L380 88 L380 78 L390 70 L400 76 V120 H0 Z"
        />
        <rect className="win" x="25" y="82" width="5" height="5" rx="1" />
        <rect className="win" x="171" y="78" width="6" height="6" rx="1" />
        <rect className="win" x="239" y="76" width="5" height="6" rx="1" />
        <rect className="win" x="386" y="80" width="4" height="4" rx="1" />
      </svg>
    </div>
  );
}
