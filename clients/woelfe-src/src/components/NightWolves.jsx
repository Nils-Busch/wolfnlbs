import React, { useEffect, useRef, useState } from "react";
import { useGame } from "../store.jsx";
import PlayerList from "./PlayerList.jsx";
import SleepOverlay from "./SleepOverlay.jsx";
import ActHead from "./ActHead.jsx";
import VoteProgress, { tally } from "./VoteProgress.jsx";

export default function NightWolves() {
  const { state, me, myRole, wolfVote, wolfProgress, urwolfConvert, wolfChat, wolfChatSend } = useGame();
  const [selected, setSelected] = useState(null);
  const [chatText, setChatText] = useState("");
  const [convertBusy, setConvertBusy] = useState(false);
  const chatEnd = useRef(null);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [wolfChat.length]);

  const amWolf = (myRole?.role === "WOLF" || myRole?.role === "URWOLF") && me?.alive;
  if (!amWolf) return <SleepOverlay text="Die Werwölfe schleichen durchs Dorf und suchen ihr Opfer …" />;

  const isUrwolf = myRole?.role === "URWOLF";
  const wolfIds = new Set([me.id, ...(myRole.wolfTeammates || []).map((w) => w.id)]);
  const selectable = state.players.filter((p) => p.alive && !p.isNarrator && !wolfIds.has(p.id));
  const votes = wolfProgress?.votes || [];
  const myVote = votes.find((v) => v.voterId === me.id);
  const urwolfAvailable = isUrwolf && wolfProgress?.urwolfAvailable;

  async function sendChat(e) {
    e.preventDefault();
    const text = chatText.trim();
    if (!text) return;
    setChatText("");
    await wolfChatSend(text);
  }

  return (
    <div className="card stack">
      <ActHead kind="wolf" em="🐺" title="Wählt euer Opfer" hint="Stimmt euch leise ab. Das Ziel mit den meisten Stimmen wird angegriffen." />

      <PlayerList
        players={selectable}
        selectable={!myVote}
        onSelect={setSelected}
        highlightId={myVote ? myVote.targetId : selected}
        counts={tally(votes)}
        tone="wolf"
        voteTone="wolf"
      />

      <button className="btn btn-primary" disabled={!selected || !!myVote} onClick={() => selected && wolfVote(selected)}>
        {myVote ? `Deine Stimme: ${myVote.targetName}` : "Opfer bestätigen"}
      </button>

      {urwolfAvailable && (
        <div className="card-inset stack urwolf-box">
          <p style={{ margin: 0 }}>
            🌑 <strong>Urwolf:</strong> Verwandle dein gewähltes Ziel heimlich in einen Werwolf, statt es zu fressen. Das gilt
            für das ganze Rudel – heute Nacht stirbt niemand.
          </p>
          <button
            className="btn btn-secondary"
            disabled={!selected || convertBusy}
            onClick={async () => {
              setConvertBusy(true);
              await urwolfConvert(selected);
              setConvertBusy(false);
            }}
          >
            🌑 Stattdessen verwandeln
          </button>
        </div>
      )}

      {wolfProgress && <VoteProgress votes={votes} total={wolfProgress.total} label="Wölfen haben gewählt" />}

      <div className="chat-box">
        <p className="hint" style={{ margin: 0 }}>💬 Rudel-Funk – nur ihr Wölfe lest mit</p>
        <div className="chat-messages">
          {wolfChat.length === 0 && <p className="hint">Noch still im Rudel …</p>}
          {wolfChat.map((m) => (
            <div key={m.id} className={["chat-message", m.senderId === me.id && "chat-message-mine"].filter(Boolean).join(" ")}>
              <span className="chat-sender">{m.senderName}</span>
              <span className="chat-text">{m.text}</span>
            </div>
          ))}
          <span ref={chatEnd} />
        </div>
        <form className="chat-input-row" onSubmit={sendChat}>
          <input type="text" maxLength={300} placeholder="Nachricht ans Rudel …" value={chatText} onChange={(e) => setChatText(e.target.value)} />
          <button className="btn btn-small btn-primary" type="submit" disabled={!chatText.trim()} aria-label="Senden">
            ➤
          </button>
        </form>
      </div>
    </div>
  );
}
