import React from "react";
import VotingCard from "./VotingCard";

export default function Voting({
  left,
  right,
  showScores,
  selectedSide,
  bumpToken,
  onPickLeft,
  onPickRight,
  showVoteGuideRight,
  leftArrow,
  rightArrow,
  vsLoading,
  nextBattleDelay,
  leftRef,
  rightRef,
}) {
  return (
    <>
      <VotingCard
        refEl={leftRef}
        side="left"
        name={left.name}
        imageSrc={left.imageSrc}
        score={left.score}
        showScores={showScores}
        selectedSide={selectedSide}
        bumpToken={bumpToken}
        onPick={onPickLeft}
        showVoteGuide={false}
        arrowDirection={leftArrow}
      />
      <div
        className={["vs", vsLoading ? "loading" : ""].filter(Boolean).join(" ")}
        aria-label="Versus"
        style={{ "--load-duration": `${nextBattleDelay}ms` }}
      >
        VS
      </div>
      <VotingCard
        refEl={rightRef}
        side="right"
        name={right.name}
        imageSrc={right.imageSrc}
        score={right.score}
        showScores={showScores}
        selectedSide={selectedSide}
        bumpToken={bumpToken}
        onPick={onPickRight}
        showVoteGuide={showVoteGuideRight}
        arrowDirection={rightArrow}
      />
    </>
  );
}

