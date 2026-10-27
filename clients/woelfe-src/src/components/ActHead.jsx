import React from "react";

export default function ActHead({ kind, em, title, hint }) {
  return (
    <div className={`act-head ${kind || ""}`}>
      <span className="badge" aria-hidden="true">{em}</span>
      <div>
        <h2>{title}</h2>
        {hint && <p className="hint">{hint}</p>}
      </div>
    </div>
  );
}
