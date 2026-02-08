import React, { useCallback, useEffect, useRef, useState } from "react";
import Voting from "./Voting";

const BATTLES = {
  0: ["kaizhe", "kyle", "xavier"],
  1: ["alisha", "celia", "luna"],
  2: ["xavier", "alisha", "luna"],
  3: ["D", "ami", "stacy"],
  4: ["ayan", "kevin", "matt"],
};

const NEXT_BATTLE_DELAY = 2000;
const imageUrl = (fileName) => `/images/${fileName}`;

function preloadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomScore() {
  return Math.floor(70 + Math.random() * 26);
}

export default function BattleArena({ isVisible, leftRef, rightRef }) {
  const [battle, setBattle] = useState({ battleId: 0, left: "kaizhe", right: "kyle" });
  const [scores, setScores] = useState({ left: 85, right: 86 });
  const [showScores, setShowScores] = useState(false);
  const [selectedSide, setSelectedSide] = useState(null);
  const [isSwapping, setIsSwapping] = useState(false);
  const [vsLoading, setVsLoading] = useState(false);
  const [bumpToken, setBumpToken] = useState(0);
  const [hasVotedBefore, setHasVotedBefore] = useState(() => {
    try {
      return localStorage.getItem("moggily_has_voted") === "true";
    } catch (_) {
      return false;
    }
  });

  const lastPairKeyRef = useRef("");
  const queuedBattleRef = useRef(null);
  const swapTimeoutRef = useRef(null);
  const nextTimeoutRef = useRef(null);
  const scoreAnimRef = useRef({ left: null, right: null });

  useEffect(() => {
    return () => {
      if (swapTimeoutRef.current) clearTimeout(swapTimeoutRef.current);
      if (nextTimeoutRef.current) clearTimeout(nextTimeoutRef.current);
      if (scoreAnimRef.current.left) cancelAnimationFrame(scoreAnimRef.current.left);
      if (scoreAnimRef.current.right) cancelAnimationFrame(scoreAnimRef.current.right);
    };
  }, []);

  const chooseBattle = useCallback(() => {
    const battleIds = Object.keys(BATTLES);
    let tries = 0;
    let battleId;
    let fighters;
    let pairKey;

    do {
      battleId = battleIds[Math.floor(Math.random() * battleIds.length)];
      fighters = shuffle(BATTLES[battleId].slice()).slice(0, 2);
      pairKey = `battle${battleId}-${fighters.join("-")}`;
      tries += 1;
    } while (pairKey === lastPairKeyRef.current && tries < 6);

    const [left, right] = fighters;
    return { battleId, left, right, pairKey };
  }, []);

  const warmNextBattle = useCallback(() => {
    if (queuedBattleRef.current) return;
    queuedBattleRef.current = chooseBattle();
    preloadImage(imageUrl(`battle${queuedBattleRef.current.battleId}-${queuedBattleRef.current.left}.png`));
    preloadImage(imageUrl(`battle${queuedBattleRef.current.battleId}-${queuedBattleRef.current.right}.png`));
  }, [chooseBattle]);

  const animateScore = useCallback((side, from, to, durationMs = 900) => {
    if (scoreAnimRef.current[side]) cancelAnimationFrame(scoreAnimRef.current[side]);
    const start = performance.now();

    const step = (now) => {
      const elapsed = Math.min(now - start, durationMs);
      const progress = elapsed / durationMs;
      const value = Math.round(from + (to - from) * progress);
      setScores((prev) => ({ ...prev, [side]: value }));
      if (elapsed < durationMs) {
        scoreAnimRef.current[side] = requestAnimationFrame(step);
      } else {
        setScores((prev) => ({ ...prev, [side]: to }));
      }
    };

    scoreAnimRef.current[side] = requestAnimationFrame(step);
  }, []);

  const setBattleState = useCallback(() => {
    setIsSwapping(true);
    const choice = queuedBattleRef.current || chooseBattle();
    queuedBattleRef.current = null;
    lastPairKeyRef.current = choice.pairKey;

    const leftUrl = imageUrl(`battle${choice.battleId}-${choice.left}.png`);
    const rightUrl = imageUrl(`battle${choice.battleId}-${choice.right}.png`);

    if (swapTimeoutRef.current) clearTimeout(swapTimeoutRef.current);
    swapTimeoutRef.current = setTimeout(() => {
      Promise.all([preloadImage(leftUrl), preloadImage(rightUrl)]).finally(() => {
        setBattle({ battleId: choice.battleId, left: choice.left, right: choice.right });
        setScores({ left: randomScore(), right: randomScore() });
        setShowScores(false);
        setSelectedSide(null);
        setVsLoading(false);
        setBumpToken(0);
        setIsSwapping(false);
        warmNextBattle();
      });
    }, 200);
  }, [chooseBattle, warmNextBattle]);

  useEffect(() => {
    setBattleState();
  }, [setBattleState]);

  const pickWinner = useCallback(
    (side) => {
      if (selectedSide) return;
      const leftStart = scores.left;
      const rightStart = scores.right;
      setSelectedSide(side);
      setShowScores(true);
      setVsLoading(true);
      setBumpToken((prev) => prev + 1);

      animateScore("left", leftStart, side === "left" ? leftStart + 5 : leftStart - 5);
      animateScore("right", rightStart, side === "right" ? rightStart + 5 : rightStart - 5);

      if (!hasVotedBefore) {
        setHasVotedBefore(true);
        try {
          localStorage.setItem("moggily_has_voted", "true");
        } catch (_) {}
      }

      if (nextTimeoutRef.current) clearTimeout(nextTimeoutRef.current);
      nextTimeoutRef.current = setTimeout(() => {
        setBattleState();
      }, NEXT_BATTLE_DELAY);
    },
    [animateScore, hasVotedBefore, scores.left, scores.right, selectedSide, setBattleState]
  );

  const leftImage = imageUrl(`battle${battle.battleId}-${battle.left}.png`);
  const rightImage = imageUrl(`battle${battle.battleId}-${battle.right}.png`);

  const leftArrow = selectedSide ? (selectedSide === "left" ? "up" : "down") : "up";
  const rightArrow = selectedSide ? (selectedSide === "right" ? "up" : "down") : "up";

  return (
    <section
      className={["arena", isSwapping ? "is-swapping" : "", isVisible ? "is-visible" : ""].filter(Boolean).join(" ")}
      id="battleArena"
      aria-label="Head-to-head preview"
    >
      <Voting
        left={{ name: battle.left, imageSrc: leftImage, score: scores.left }}
        right={{ name: battle.right, imageSrc: rightImage, score: scores.right }}
        showScores={showScores}
        selectedSide={selectedSide}
        bumpToken={bumpToken}
        onPickLeft={() => pickWinner("left")}
        onPickRight={() => pickWinner("right")}
        showVoteGuideRight={!hasVotedBefore && !selectedSide}
        leftArrow={leftArrow}
        rightArrow={rightArrow}
        vsLoading={vsLoading}
        nextBattleDelay={NEXT_BATTLE_DELAY}
        leftRef={leftRef}
        rightRef={rightRef}
      />
    </section>
  );
}

