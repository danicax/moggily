import React, { useEffect, useState } from "react";

function formatName(name) {
  if (name.length === 1) return name;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function Score({ value, show, bumpToken }) {
  const [bump, setBump] = useState(false);

  useEffect(() => {
    if (!show) return;
    setBump(false);
    const id = requestAnimationFrame(() => setBump(true));
    return () => cancelAnimationFrame(id);
  }, [bumpToken, show]);

  const className = ["score", show ? "" : "score--hidden", bump ? "score--bump" : ""]
    .filter(Boolean)
    .join(" ");

  return <div className={className}>{value}</div>;
}

function ScoreArrow({ show, direction }) {
  const className = [
    "scoreArrow",
    show ? "" : "scoreArrow--hidden",
    direction === "up" ? "scoreArrow--up" : "",
    direction === "down" ? "scoreArrow--down" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const text = direction === "down" ? "▼" : "▲";

  return <div className={className}>{text}</div>;
}

export default function VotingCard({
  side,
  name,
  imageSrc,
  score,
  showScores,
  selectedSide,
  bumpToken,
  onPick,
  showVoteGuide,
  arrowDirection,
  refEl,
}) {
  const isWinner = selectedSide === side;
  const isLoser = selectedSide && selectedSide !== side;

  const className = ["card", "card--clickable", isWinner ? "selected card--winner" : "", isLoser ? "card--loser" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <button ref={refEl} className={className} type="button" aria-label={`Pick ${side} contender`} onClick={onPick}>
      <div className="crown" aria-hidden="true">
        <i className="fa-solid fa-crown"></i>
      </div>
      <div className="avatar">
        <img src={imageSrc} alt={formatName(name)} />
      </div>
      <div className="nameRow">
        <div className="name">{formatName(name)}</div>
        <div className="scoreWrap">
          <Score value={score} show={showScores} bumpToken={bumpToken} />
          <ScoreArrow show={showScores} direction={arrowDirection} />
        </div>
      </div>
      {showVoteGuide ? (
        <div className="voteGuide">
          <i className="fa-solid fa-arrow-pointer cursorIcon"></i>
          <div>Click to vote</div>
        </div>
      ) : null}
    </button>
  );
}

