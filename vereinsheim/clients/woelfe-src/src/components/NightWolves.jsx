import React, { useState } from "react";
import { useGame } from "../store.jsx";
import PlayerList from "./PlayerList.jsx";
import SleepOverlay from "./SleepOverlay.jsx";

export default function NightWolves() {
  const { state, me, myRole, wolfVote, wolfProgress, urwolfConvert, wolfChat, wolfChatSend } = useGame();
  const [selected, setSelected] = useState(null);
  const [chatText, setChatText] = useState("");
  const [convertBusy, setConvertBusy] = useState(false);

  const amWolf = (myRole?.role === "WOLF" || myRole?.role === "URWOLF") && me?.alive;
  if (!amWolf) {
    return (
      <SleepOverlay text="Die Werwölfe schleichen durchs Dorf und wählen ihr Opfer …" />
    );
  }

  const isUrwolf = myRole?.role === "URWOLF";

  // Werwölfe dürfen jeden anderen lebenden Spieler wählen, außer ihre Mitwölfe.
  const wolfIds = new Set([me.id, ...(myRole.wolfTeammates || []).map((w) => w.id)]);
  const selectable = state.players.filter((p) => p.alive && !p.isNarrator && !wolfIds.has(p.id));

  async function confirm() {
    if (!selected) return;
    await wolfVote(selected);
  }

  async function convert() {
    if (!selected) return;
    setConvertBusy(true);
    await urwolfConvert(selected);
    setConvertBusy(false);
  }

  async function sendChat(e) {
    e.preventDefault();
    const text = chatText.trim();
    if (!text) return;
    setChatText("");
    await wolfChatSend(text);
  }

  const myVote = wolfProgress?.votes?.find((v) => v.voterId === me.id);
  const urwolfAvailable = isUrwolf && wolfProgress?.urwolfAvailable;

  return (
    <div className="card stack">
      <h2>🐺 Wählt euer Opfer</h2>
      <p className="hint">Stimmt euch leise ab – das Ziel mit den meisten Stimmen wird angegriffen.</p>

      <PlayerList players={selectable} selectable onSelect={setSelected} highlightId={selected} />

      <button className="btn btn-primary" disabled={!selected || !!myVote} onClick={confirm}>
        {myVote ? `Du hast für ${myVote.targetName} gestimmt` : "Opfer bestätigen"}
      </button>

      {urwolfAvailable && (
        <div className="card-inset stack">
          <p>
            🌑 <strong>Urwolf-Fähigkeit verfügbar:</strong> Verwandle dein gewähltes Ziel in einen Werwolf,
            statt es zu fressen. Das ersetzt die Wahl der ganzen Gruppe für diese Nacht – niemand stirbt,
            dein Ziel wird heimlich zum Werwolf.
          </p>
          <button className="btn btn-secondary" disabled={!selected || convertBusy} onClick={convert}>
            🌑 Stattdessen verwandeln
          </button>
        </div>
      )}

      {wolfProgress && (
        <div className="progress-box">
          <p className="hint">
            {wolfProgress.votes.length}/{wolfProgress.total} Werwölfe haben abgestimmt
          </p>
          <ul className="vote-feed">
            {wolfProgress.votes.map((v, i) => (
              <li key={i}>
                {v.voterName} → {v.targetName}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="chat-box">
        <p className="hint">💬 Nur für euch Werwölfe sichtbar:</p>
        <div className="chat-messages">
          {wolfChat.length === 0 && <p className="hint">Noch keine Nachrichten …</p>}
          {wolfChat.map((m) => (
            <div key={m.id} className={["chat-message", m.senderId === me.id && "chat-message-mine"].filter(Boolean).join(" ")}>
              <span className="chat-sender">{m.senderName}</span>
              <span className="chat-text">{m.text}</span>
            </div>
          ))}
        </div>
        <form className="chat-input-row" onSubmit={sendChat}>
          <input
            type="text"
            maxLength={300}
            placeholder="Nachricht an dein Rudel …"
            value={chatText}
            onChange={(e) => setChatText(e.target.value)}
          />
          <button className="btn btn-small btn-primary" type="submit" disabled={!chatText.trim()}>
            ➤
          </button>
        </form>
      </div>
    </div>
  );
}
