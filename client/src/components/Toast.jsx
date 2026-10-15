import React from "react";
import { useGame } from "../store.jsx";

export default function Toast() {
  const { toast } = useGame();
  if (!toast) return null;
  return (
    <div className="toast" role="alert">
      {toast}
    </div>
  );
}
