// ScrollStarStory.jsx
// Paste into a React project (Vite/CRA/Next). If Next.js App Router, add "use client" at the top.

import React, { useEffect, useMemo, useRef, useState } from "react";
import BattleArena from "./components/BattleArena";
import coupleImage from "./assets/couple.png";
import "./voting.css";

export default function ScrollStarStory() {
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlistMessage, setWaitlistMessage] = useState("");
  const wrapRef = useRef(null);
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const glowRef = useRef(null);
  const heartGlowRef = useRef(null);

  const cardsLayerRef = useRef(null);
  const introRef = useRef(null);
  const copyRef = useRef(null);
  const cardARef = useRef(null);
  const cardBRef = useRef(null);
  const waitlistRef = useRef(null);
  const coupleRef = useRef(null);
  const voteCursorRef = useRef(null);
  const startTimeRef = useRef(0);
  const hasVotedThisSessionRef = useRef(false);

  // --- Config ---
  const config = useMemo(
    () => ({
      STAR_COUNT_DESKTOP: 420,
      STAR_COUNT_MOBILE: 260,
      TAIL_LEN: 48,
      DPR_CAP: 2,
    }),
    []
  );

  // --- Mutable refs (for perf) ---
  const rafRef = useRef(0);
  const starsRef = useRef([]);
  const dimsRef = useRef({ W: 1, H: 1, DPR: 1 });
  const scrollRef = useRef({ wrapTop: 0, scrollMax: 1 });

  const paramsRef = useRef({
    drift: 1,
    fall: 0,
    streak: 0,
    morphCards: 0,
    morphHeart: 0,
    progress: 0,
    prevProgress: 0,
    scrollDir: 0,
  });

  // --- Helpers ---
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth01 = (t) => t * t * (3 - 2 * t);
  const range01 = (p, a, b) => smooth01(clamp((p - a) / (b - a), 0, 1));
  const rand = (a, b) => a + Math.random() * (b - a);

  // Signed distance to a rounded rectangle (for proper card silhouette sampling)
  function sdRoundedRect(px, py, cx, cy, w, h, r) {
    const x = Math.abs(px - cx) - (w * 0.5 - r);
    const y = Math.abs(py - cy) - (h * 0.5 - r);
    const ax = Math.max(x, 0);
    const ay = Math.max(y, 0);
    return Math.hypot(ax, ay) + Math.min(Math.max(x, y), 0) - r;
  }

  function sampleRoundedRectPoints(cx, cy, w, h, r, n) {
    const pts = [];
    let guard = 0;
    while (pts.length < n && guard < n * 70) {
      guard++;
      const x = cx + rand(-w / 2, w / 2);
      const y = cy + rand(-h / 2, h / 2);
      if (sdRoundedRect(x, y, cx, cy, w, h, r) <= 0) pts.push({ x, y });
    }
    while (pts.length < n) pts.push({ x: cx + rand(-w / 2, w / 2), y: cy + rand(-h / 2, h / 2) });
    return pts;
  }

  function sampleRoundedRectOutlinePoints(cx, cy, w, h, r, n, thickness) {
    const pts = [];
    let guard = 0;
    const pad = thickness * 2;
    while (pts.length < n && guard < n * 120) {
      guard++;
      const x = cx + rand(-w / 2 - pad, w / 2 + pad);
      const y = cy + rand(-h / 2 - pad, h / 2 + pad);
      if (Math.abs(sdRoundedRect(x, y, cx, cy, w, h, r)) <= thickness) {
        pts.push({ x, y });
      }
    }
    while (pts.length < n) pts.push({ x: cx + rand(-w / 2, w / 2), y: cy + rand(-h / 2, h / 2) });
    return pts;
  }

  function sampleCircleOutlinePoints(cx, cy, r, n, thickness) {
    const pts = [];
    let guard = 0;
    const inner = Math.max(1, r - thickness);
    const outer = r + thickness;
    while (pts.length < n && guard < n * 80) {
      guard++;
      const a = rand(0, Math.PI * 2);
      const rr = rand(inner, outer);
      pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
    }
    while (pts.length < n) pts.push({ x: cx + rand(-r, r), y: cy + rand(-r, r) });
    return pts;
  }

  function heartPoint(t) {
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    return { x, y };
  }

  function sampleHeartPoints(cx, cy, scale, n) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2;
      const p = heartPoint(t);
      pts.push({ x: cx + p.x * scale, y: cy - p.y * scale });
    }
    return pts;
  }

  function initStars(count, isSmall) {
    const { W, H } = dimsRef.current;
    const stars = [];
    for (let i = 0; i < count; i++) {
      const isHero = !isSmall && i < 2;
      const x = isHero ? (i === 0 ? W * 0.22 : W * 0.78) : rand(0, W);
      const y = isHero ? (i === 0 ? H * 0.78 : H * 0.22) : rand(0, H);
      stars.push({
        hero: isHero,
        x,
        y,
        ix: x,
        iy: y,
        vx: rand(-0.09, 0.09),
        vy: rand(0.04, 0.28), // downward bias
        speed: isHero ? rand(1.55, 1.95) : rand(0.75, 1.35),
        r: isHero ? rand(3.2, 4.6) : rand(0.6, 1.8),
        a: isHero ? rand(0.85, 0.98) : rand(0.25, 0.95),
        tx: x,
        ty: y,
        hx: x,
        hy: y,
        tailLen: Math.floor(rand(config.TAIL_LEN * 0.45, config.TAIL_LEN)),
        tail: Array.from({ length: config.TAIL_LEN }, () => ({ x, y })),
        seed: Math.random() * 1000,
      });
    }
    starsRef.current = stars;
  }

  function rebuildTargets() {
    const { W, H } = dimsRef.current;
    const stars = starsRef.current;
    if (!stars.length) return;

    const cardW = Math.min(380, W * 0.40);
    const cardH = Math.min(500, H * 0.60);
    const radius = 24;

    const outlineThickness = Math.max(2, Math.min(cardW, cardH) * 0.02);
    const outlinePad = Math.max(16, Math.min(cardW, cardH) * 0.08);
    const outlineW = cardW + outlinePad * 2;
    const outlineH = cardH + (outlinePad+10) * 2;
    const vsCount = Math.max(8, Math.floor(stars.length * 0.18));
    const cardCount = Math.max(1, stars.length - vsCount);

    const cardOffset = Math.min(240, Math.max(160, cardW * 0.6));
    const leftCount = Math.floor(cardCount * 0.5);
    const rightCount = cardCount - leftCount;
    const leftTargets = sampleRoundedRectOutlinePoints(
      W * 0.5 - cardOffset,
      H * 0.5,
      outlineW,
      outlineH,
      radius,
      leftCount,
      outlineThickness
    );
    const rightTargets = sampleRoundedRectOutlinePoints(
      W * 0.5 + cardOffset,
      H * 0.5,
      outlineW,
      outlineH,
      radius,
      rightCount,
      outlineThickness
    );
    const vsRadius = Math.min(48, Math.min(W, H) * 0.06);
    const vsTargets = sampleCircleOutlinePoints(W * 0.5, H * 0.5, vsRadius, vsCount, 2.5);
    const s = Math.min(W, H) * 0.017;
    const heartTargets = sampleHeartPoints(W * 0.5, H * 0.56, s, stars.length);

    const heartCx = W * 0.5;
    const heartCy = H * 0.56;
    const heroOffset = Math.min(W, H) * 0.09;
    const rightStart = leftCount;
    const circleStart = leftCount + rightCount;
    for (let i = 0; i < stars.length; i++) {
      if (i >= circleStart) {
        const idx = i - circleStart;
        stars[i].tx = vsTargets[idx].x;
        stars[i].ty = vsTargets[idx].y;
      } else if (i >= rightStart) {
        const idx = i - rightStart;
        stars[i].tx = rightTargets[idx].x;
        stars[i].ty = rightTargets[idx].y;
      } else {
        stars[i].tx = leftTargets[i].x;
        stars[i].ty = leftTargets[i].y;
      }
      if (stars[i].hero) {
        const sign = i === 0 ? -1 : 1;
        stars[i].hx = heartCx + heroOffset * sign;
        stars[i].hy = heartCy - heroOffset * sign;
      } else {
        stars[i].hx = heartTargets[i].x;
        stars[i].hy = heartTargets[i].y;
      }
    }
  }

  function measure() {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!stage || !canvas || !wrap) return;

    const rect = stage.getBoundingClientRect();
    const prevDims = dimsRef.current;
    const W = Math.max(1, rect.width);
    const H = Math.max(1, rect.height);
    const DPR = Math.min(window.devicePixelRatio || 1, config.DPR_CAP);

    dimsRef.current = { W, H, DPR };

    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;

    const wrapRect = wrap.getBoundingClientRect();
    const wrapTop = wrapRect.top + window.scrollY;
    const wrapHeight = wrap.offsetHeight;
    const scrollMax = Math.max(1, wrapHeight - window.innerHeight);

    scrollRef.current = { wrapTop, scrollMax };

    // Stabilize stars on resize to avoid flashing tails/teleports
    if (prevDims.W !== W || prevDims.H !== H) {
      const stars = starsRef.current;
      const sx = prevDims.W ? W / prevDims.W : 1;
      const sy = prevDims.H ? H / prevDims.H : 1;
      for (const s of stars) {
        s.x = clamp(s.x * sx, -20, W + 20);
        s.y = clamp(s.y * sy, -20, H + 20);
        s.ix = clamp(s.ix * sx, -20, W + 20);
        s.iy = clamp(s.iy * sy, -20, H + 20);
        s.tx = clamp(s.tx * sx, -20, W + 20);
        s.ty = clamp(s.ty * sy, -20, H + 20);
        s.hx = clamp(s.hx * sx, -20, W + 20);
        s.hy = clamp(s.hy * sy, -20, H + 20);
        s.tail = s.tail.map((pt) => ({
          x: clamp(pt.x * sx, -20, W + 20),
          y: clamp(pt.y * sy, -20, H + 20),
        }));
      }
    }

    // Rebuild targets because W/H changed
    rebuildTargets();
  }

  function computeProgress() {
    const { wrapTop, scrollMax } = scrollRef.current;
    const y = window.scrollY;
    return clamp((y - wrapTop) / scrollMax, 0, 1);
  }

  function applyStory(p, timeMs) {
    // Segment boundaries
    const A1 = 0.02;
    const B0 = 0.02, B1 = 0.26;
    const C0 = 0.26, C1 = 0.60;
    const D0 = 0.60, D1 = 0.8;
    const F0 = 0.8, F1 = 1.0;

    let drift = 1, fall = 0, streak = 0, morphCards = 0, morphHeart = 0;

    if (p < A1) {
      drift = 1.0; fall = 0.0; streak = 0.0; morphCards = 0.0; morphHeart = 0.0;
    } else if (p < B1) {
      const t = range01(p, B0, B1);
      drift = lerp(1.0, 0.6, t);
      fall = lerp(0.0, 1.0, t);
      streak = lerp(0.0, 1.0, t);
    } else if (p < C1) {
      const t = range01(p, C0, C1);
      drift = lerp(0.6, 0.2, t);
      fall = lerp(1.0, 0.35, t);
      streak = lerp(1.0, 0.3, t);
      morphCards = lerp(0.0, 1.0, t);
    } else if (p < D1) {
      drift = 0.18; fall = 0.08; streak = 0.10; morphCards = 1.0; morphHeart = 0.0;
    } else {
      const t = range01(p, F0, F1);
      const tHeart = range01(p, 0.98, F1);
      drift = lerp(0.10, 0.0, t);
      fall = 0.0;
      streak = 0.10;
      morphCards = lerp(1.0, 0.0, t);
      morphHeart = lerp(0.0, 1.0, tHeart);
    }

    const params = paramsRef.current;
    const prevP = params.progress;
    params.progress = p;
    params.scrollDir = p - prevP;
    params.prevProgress = p;
    params.drift = drift;
    params.fall = fall;
    params.streak = streak;
    params.morphCards = morphCards;
    params.morphHeart = morphHeart;

    // DOM UI updates (no React state; direct style for smoothness)
    const cardsLayer = cardsLayerRef.current;
    const glow = glowRef.current;
    const heartGlow = heartGlowRef.current;
    const cardA = cardARef.current;
    const cardB = cardBRef.current;
    const intro = introRef.current;
    const copy = copyRef.current;
    const waitlist = waitlistRef.current;
    const couple = coupleRef.current;
    const voteCursor = voteCursorRef.current;
    if (!cardsLayer || !cardA || !cardB || !intro || !copy || !waitlist || !couple || !voteCursor) return;

    const cardsIn = range01(p, 0.50, 0.60);
    const cardsOut = range01(p, 0.94, 0.98);
    const cardsOpacity = clamp(cardsIn - cardsOut, 0, 1);
    cardsLayer.style.opacity = String(cardsOpacity);
    cardsLayer.style.transform = `translateY(${lerp(12, 0, cardsIn)}px)`;
    const cursorIn = range01(p, 0.44, 0.52);
    const cursorOut = range01(p, 0.94, 0.98);
    const cursorVis = clamp(cursorIn - cursorOut, 0, 1);
    const loopPhase = Math.min(cursorIn / 0.7, 1) * Math.PI * 2;
    const loopAmp = lerp(90, 0, cursorIn);
    const cursorX = lerp(620, -210, cursorIn) + Math.cos(loopPhase) * loopAmp;
    const cursorY = lerp(-350, 10, cursorIn) + Math.sin(loopPhase) * loopAmp;
    voteCursor.style.setProperty("--vote-cursor-x", `${cursorX}px`);
    voteCursor.style.setProperty("--vote-cursor-y", `${cursorY}px`);
    voteCursor.style.setProperty("--vote-cursor-scale", String(lerp(0.85, 1, cursorIn)));
    voteCursor.style.setProperty("--vote-cursor-t", String(cursorIn));
    const voteOpacity = hasVotedThisSessionRef.current ? 0 : cursorVis;
    voteCursor.style.opacity = String(voteOpacity);

    const introOut = range01(p, 0.04, 0.12);
    const introOpacity = 1 - introOut;
    intro.style.opacity = String(introOpacity);
    copy.style.opacity = String(introOpacity);

    const introStart = startTimeRef.current || timeMs || 0;
    const introElapsed = Math.max(0, (timeMs || 0) - introStart);
    const coupleIntroIn = smooth01(clamp((introElapsed - 2200) / 650, 0, 1));
    const coupleFade = range01(p, 0.02, 0.12);
    couple.style.opacity = String(coupleIntroIn * (1 - coupleFade));
    couple.style.transform = `translate(0, ${lerp(0, 16, coupleFade)}px)`;

    const waitlistIn = range01(p, 0.99, 1);
    waitlist.style.opacity = String(waitlistIn);
    waitlist.style.transform = `translateY(${lerp(-80, 0, waitlistIn)}px)`;
    waitlist.style.pointerEvents = waitlistIn > 0.2 ? "auto" : "none";

    if (glow) {
      const glowIn = range01(p, 0.10, 0.85);
      const glowOut = range01(p, 0.95, 1.0);
      const glowOpacity = clamp(glowIn - glowOut, 0, 1);
      glow.style.opacity = String(0.55 * glowOpacity);
      glow.style.transform = `translateY(${lerp(40, 0, glowIn)}px) scale(${lerp(0.9, 1.05, glowIn)})`;
    }

    if (heartGlow) {
      const heartIn = smooth01(range01(p, 0.98, 1.0));
      heartGlow.style.opacity = String(0.85 * heartIn);
      heartGlow.style.transform = `translateY(${lerp(30, 0, heartIn)}px) scale(${lerp(0.9, 1.15, heartIn)})`;
    }

    const cardReveal = range01(p, 0.50, 0.60);
    cardA.style.opacity = String(cardReveal);
    cardB.style.opacity = String(cardReveal);

    const voting = p >= 0.45 && p <= 0.95 && cardReveal > 0.4;
    cardsLayer.style.pointerEvents = voting ? "auto" : "none";

    // Keep cards overlapped until stars disperse
    let ax = 0, ar = 0;
    let bx = 0, br = 0;

    const sp = range01(p, 0.82, 0.90);
    if (sp > 0) {
      ax = lerp(ax, -220, sp); ar = lerp(ar, -4, sp);
      bx = lerp(bx, 220, sp); br = lerp(br, 4, sp);
    }

    // Recombine before fading out
    const combine = range01(p, 0.90, 0.94);
    if (combine > 0) {
      ax = lerp(ax, 0, combine); ar = lerp(ar, 0, combine);
      bx = lerp(bx, 0, combine); br = lerp(br, 0, combine);
    }

    cardA.style.transform = `translateX(${ax}px) rotate(${ar}deg)`;
    cardB.style.transform = `translateX(${bx}px) rotate(${br}deg)`;

  }

  function drawFrame(timeMs) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const { W, H, DPR } = dimsRef.current;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    // subtle vignette overlay (background gradients are CSS)
    ctx.clearRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W * 0.5, H * 0.35, 0, W * 0.5, H * 0.55, Math.max(W, H) * 0.9);
    vg.addColorStop(0, "rgba(130,170,255,0.06)");
    vg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    const now = timeMs * 0.001;
    const params = paramsRef.current;
    const stars = starsRef.current;

    const p = params.progress;
    const disperseT = smooth01(range01(p, 0.82, 0.98));
    const cardCx = W * 0.5;
    const cardCy = H * 0.5;
    const scrollUp = params.scrollDir < -0.0004;

    for (const s of stars) {
      // Curved falling motion
      const wind = Math.sin(now * 1.1 + s.seed) * (0.06 + 0.25 * params.streak);
      const gravity = 0.10 + 1.25 * params.fall + 1.8 * params.streak;

      if (s.hero && p < 0.22) {
        // Keep hero stars on-screen at the start
        s.vx *= 0.6;
        s.vy *= 0.6;
        s.x = lerp(s.x, s.ix, 0.2);
        s.y = lerp(s.y, s.iy, 0.2);
        s.x += Math.sin(now * 0.7 + s.seed) * 0.06;
        s.y += Math.cos(now * 0.7 + s.seed) * 0.04;
      } else {
        s.vx += wind * 0.02;
        s.vy += gravity * 0.008;

        s.vx *= 0.995;
        s.vy *= 0.999;

        const speed = (0.45 + params.drift * 0.9 + params.streak * 3.8 + params.fall * 2.0) * s.speed;
        s.x += s.vx * speed;
        s.y += s.vy * speed;
      }

      // wrap
      if (s.x < -40) s.x = W + 40;
      if (s.x > W + 40) s.x = -40;
      if (s.y < -40) s.y = H + 40;
      if (s.y > H + 40) {
        if (params.scrollDir > 0.0004) {
          // Fewer spawns from the top while scrolling down
          s.y = -40 - rand(0, H * 0.6);
          s.x = rand(0, W);
          s.vx *= 0.6;
          s.vy *= 0.6;
        } else {
          s.y = -40;
        }
      }

      // morph into rounded card silhouette
      if (params.morphCards > 0) {
        const k = 0.05 + params.morphCards * 0.26;
        s.x += (s.tx - s.x) * k;
        s.y += (s.ty - s.y) * k;
      }

      // disperse while cards split, then recombine
      if (disperseT > 0) {
        const dx = s.x - cardCx;
        const dy = s.y - cardCy;
        const dist = Math.hypot(dx, dy) || 1;
        const kick = 0.015 + 0.12 * disperseT;
        const jitter = Math.sin(now * 2.6 + s.seed) * (0.02 + 0.12 * disperseT);
        s.vx += (dx / dist) * kick + jitter;
        s.vy += (dy / dist) * kick - jitter * 0.6;
      }

      // disperse when scrolling up from the card shape
      if (scrollUp && params.morphCards < 0.7) {
        const t = smooth01(clamp((0.7 - params.morphCards) / 0.7, 0, 1));
        const dx = s.x - cardCx;
        const dy = s.y - cardCy;
        const dist = Math.hypot(dx, dy) || 1;
        const repulse = 0.02 + 0.085 * t;
        const jitter = Math.sin(now * 2.2 + s.seed) * (0.012 + 0.3 * t);
        s.vx += (dx / dist) * repulse + jitter;
        s.vy += (dy / dist) * repulse - jitter * 0.6;
      } else if (params.morphCards < 0.7) {
        // settle quickly back into the normal falling motion
        s.vx *= 0.94;
        s.vy = s.vy * 0.94 + 0.006;
      }

      // morph into heart
      if (params.morphHeart > 0) {
        const k = 0.04 + params.morphHeart * 0.30;
        s.x += (s.hx - s.x) * k;
        s.y += (s.hy - s.y) * k;
      }

      // update tail AFTER moving
      s.tail.shift();
      s.tail.push({ x: s.x, y: s.y });

      const twinkle = 0.75 + 0.35 * Math.sin(now * (1.2 + s.seed * 0.015) + s.seed * 12.3);
      const vis = twinkle;

      // star head
      if (vis > 0.001) {
        if (s.hero) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const glow = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 8);
          glow.addColorStop(0, `rgba(255,255,255,${0.6 * vis})`);
          glow.addColorStop(0.4, `rgba(255,255,255,${0.18 * vis})`);
          glow.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${s.a * vis})`;
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  useEffect(() => {
    // Measure + init
    const isSmall = Math.min(window.innerWidth, window.innerHeight) < 700;
    const starCount = isSmall ? config.STAR_COUNT_MOBILE : config.STAR_COUNT_DESKTOP;

    measure();
    initStars(starCount, isSmall);
    measure(); // rebuild targets with correct starCount
    startTimeRef.current = performance.now();

    const onVote = () => {
      hasVotedThisSessionRef.current = true;
    };
    window.addEventListener("moggily:vote", onVote);

    // ResizeObserver for stage (more robust than window resize alone)
    const ro = new ResizeObserver(() => {
      measure();
    });
    if (stageRef.current) ro.observe(stageRef.current);

    // Main RAF loop: compute scroll progress -> apply story -> draw
    const loop = (t) => {
      const p = computeProgress();
      applyStory(p, t);
      drawFrame(t);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    // Also recompute measurements on scroll (layout changes)
    const onScroll = () => {
      // lightweight; just update progress next frame
    };
    const onWheel = (event) => {
      if (!wrapRef.current) return;
      const { wrapTop, scrollMax } = scrollRef.current;
      const y = window.scrollY;
      const minY = wrapTop;
      const maxY = wrapTop + scrollMax;
      if (y < minY - 2 || y > maxY + 2) return;
      if ((y <= minY + 1 && event.deltaY < 0) || (y >= maxY - 1 && event.deltaY > 0)) {
        return;
      }

      event.preventDefault();
      const damp = 0.35;
      const next = clamp(y + event.deltaY * damp, minY, maxY);
      window.scrollTo({ top: next });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", measure, { passive: true });

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", measure);
      window.removeEventListener("moggily:vote", onVote);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inline “grain” svg noise background (breaks gradient banding/lines)
  const noiseDataUrl =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='.35'/%3E%3C/svg%3E";
  const introTitle = "Gamify Your Goals";
  const introLetters = useMemo(() => Array.from(introTitle), [introTitle]);
  const introLetterDelay = 0.05;
  const introLineDelay = introLetters.length * introLetterDelay + 0.15;
  const introAnimCss = `
    @import url('https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700&display=swap');

    @keyframes introLetterPop {
      0% { opacity: 0; transform: translateY(14px) scale(0.96); }
      60% { opacity: 1; transform: translateY(-4px) scale(1.02); }
      100% { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes introLineExpand {
      0% { transform: scaleX(0); opacity: 0; }
      100% { transform: scaleX(1); opacity: 1; }
    }
    @keyframes introFadeUp {
      0% { opacity: 0; transform: translateY(14px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes introNavDrop {
      0% { opacity: 0; transform: translateY(-120px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    .intro-title-letter {
      opacity: 0;
      display: inline-block;
      animation: introLetterPop 0.48s cubic-bezier(0.2, 0.7, 0.25, 1) forwards;
    }
    .intro-line {
      transform-origin: center;
      transform: scaleX(0);
      opacity: 0;
      animation: introLineExpand 0.55s ease forwards;
    }
    .intro-fade-up {
      opacity: 0;
      transform: translateY(14px);
      animation: introFadeUp 0.55s ease forwards;
    }
    .intro-nav-drop {
      opacity: 0;
      transform: translateY(-120px);
      animation: introNavDrop 0.6s ease forwards;
    }
  `;

  return (
    <>
      <style>{introAnimCss}</style>
      <div
        ref={wrapRef}
        style={{
          height: "2000vh",
          position: "relative",
          background: "#000",
          fontFamily:
            "\"Rubik\", ui-sans-serif, system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif",
        }}
      >
        <div
          ref={stageRef}
          style={{
            position: "sticky",
            top: 0,
            height: "100vh",
            width: "100vw",
            overflow: "hidden",
            transform: "translateZ(0)",
            background:
              "radial-gradient(1200px 800px at 50% 10%, rgba(130,170,255,.10), transparent 60%)," +
              "radial-gradient(900px 600px at 20% 20%, rgba(255,120,200,.08), transparent 55%)," +
              "linear-gradient(180deg, #05060a, #0a0f1d)",
          }}
        >
          {/* Glow bloom */}
          <div
            ref={glowRef}
            style={{
              position: "absolute",
              inset: "-20%",
              zIndex: 0,
              opacity: 0,
              transform: "translateY(40px) scale(0.9)",
              filter: "blur(40px)",
              background:
                "radial-gradient(900px 520px at 50% 18%, rgba(255, 65, 195, 0.85), rgba(0,0,0,0) 70%)," +
                "radial-gradient(700px 420px at 18% 22%, rgba(75, 84, 255, 0.85), rgba(0,0,0,0) 70%)",
              pointerEvents: "none",
            }}
          />
          {/* Heart glow */}
          <div
            ref={heartGlowRef}
            style={{
              position: "absolute",
              inset: "-20%",
              zIndex: 0,
              opacity: 0,
              transform: "translateY(30px) scale(0.9)",
              filter: "blur(55px)",
              background:
                "radial-gradient(620px 620px at 45% 40%, rgba(226, 37, 103, 0.65), rgba(0,0,0,0) 70%)," +
                "radial-gradient(400px 400px at 60% 60%, rgba(255, 239, 15, 0.55), rgba(0,0,0,0) 72%)",
              pointerEvents: "none",
              mixBlendMode: "screen",
            }}
          />
          {/* Clouds background */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 0,
              backgroundSize: "cover",
              backgroundPosition: "center top",
              backgroundRepeat: "no-repeat",
              opacity: 0.9,
              maskImage:
                "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)",
              WebkitMaskImage:
                "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 60%, rgba(0,0,0,0) 100%)",
            }}
          />
          {/* Canvas */}
          <canvas
            ref={canvasRef}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              display: "block",
              zIndex: 1,
            }}
          />

        {/* Vote cursor overlay (independent from cards opacity) */}
        <div
          ref={voteCursorRef}
          className="voteCursorOverlay"
          aria-hidden="true"
          style={{ zIndex: 12, opacity: 1 }}
        >
          <div className="voteCursorStar">★</div>
          <div className="voteCursor">
            <i className="fa-solid fa-arrow-pointer"></i>
            <div className="voteCursorText">Vote</div>
          </div>
        </div>

        {/* Couple image (bottom of the intro screen) */}
        <img
          ref={coupleRef}
          src={coupleImage}
          alt="Couple"
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            width: "min(640px, 60vw)",
            height: "auto",
            zIndex: 4,
            opacity: 1,
            transform: "translate(0, 0)",
            pointerEvents: "none",
            maskImage:
              "linear-gradient(to top, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 28%, rgba(0,0,0,1) 100%)",
            WebkitMaskImage:
              "linear-gradient(to top, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 28%, rgba(0,0,0,1) 100%)",
          }}
        />

        {/* Grain overlay (fixes banding “lines”) */}
        <div
          style={{
            position: "absolute",
            inset: "-20%",
            pointerEvents: "none",
            zIndex: 2,
            backgroundImage: `url("${noiseDataUrl}")`,
            backgroundSize: "260px 260px",
            opacity: 0.04,
            mixBlendMode: "soft-light",
          }}
        />

        {/* Intro */}
        <div
          ref={introRef}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            zIndex: 5,
            pointerEvents: "auto",
            color: "#fff",
            fontFamily:
              "\"Rubik\", ui-sans-serif, system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif",
          }}
        >
          <div style={{ maxWidth: 720, padding: "0 20px", transform: "translateY(-60px)" }}>
            <div style={{ fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 700, letterSpacing: "-0.01em" }}>
              {introLetters.map((letter, idx) => {
                if (letter === " ") {
                  return <span key={`space-${idx}`} style={{ display: "inline-block", width: "0.4em" }} />;
                }

                const isFirstI = letter === "i" && !introLetters.slice(0, idx).includes("i");
                return (
                  <span
                    key={`${letter}-${idx}`}
                    className="intro-title-letter"
                    style={{ animationDelay: `${idx * introLetterDelay}s` }}
                  >
                    <span style={{ position: "relative", display: "inline-block" }}>
                      {letter}
                      {isFirstI ? (
                        <span
                          style={{
                            position: "absolute",
                            left: "50%",
                            top: "0.17em",
                            transform: "translateX(-42%)",
                            width: "0.18em",
                            height: "0.18em",
                            borderRadius: "50%",
                            background: "#fff",
                            boxShadow:
                              "0 0 10px rgba(255,255,255,0.9), 0 0 22px rgba(160,200,255,0.7)",
                          }}
                        />
                      ) : null}
                    </span>
                  </span>
                );
              })}
            </div>
            <div
              style={{
                margin: "30px auto 40px",
                  width: "min(140px, 60%)",
                height: 1,
                  background:
                    "linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.65) 50%, rgba(255,255,255,0) 100%)",
                  boxShadow:
                    "0 0 10px rgba(255,255,255,0.9), 0 0 28px rgba(255,255,255,0.8)",
                borderRadius: 999,
                animationDelay: `${introLineDelay}s`,
              }}
              className="intro-line"
            />
            <div
              className="intro-fade-up"
              style={{
                fontSize: "clamp(14px, 1.6vw, 18px)",
                color: "rgba(255,255,255,0.8)",
                animationDelay: `${introLineDelay + 0.15}s`,
              }}
            >
              Moggily is the world’s first meritocratic dating app
            </div>
            <button
              type="button"
              onClick={() => {
                window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
              }}
              className="intro-fade-up"
              style={{
                marginTop: 60,
                padding: "16px 20px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.35)",
                background: "rgba(0, 0, 0, 0.12)",
                color: "#fff",
                fontSize: "clamp(14px, 1.6vw, 18px)",
                fontWeight: 400,
                cursor: "pointer",
                animationDelay: `${introLineDelay + 0.3}s`,
              }}
            >
              Join the Journey
            </button>
          </div>
        </div>

        {/* Copy */}
        <div
          ref={copyRef}
          style={{
            position: "absolute",
            left: "clamp(12px, 2vw, 52px)",
            top: "clamp(0px, 2vh, 60px)",
            maxWidth: 620,
            zIndex: 6,
            pointerEvents: "none",
            color: "rgba(255,255,255,.92)",
            fontFamily:
              "\"Rubik\", ui-sans-serif, system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif",
            animationDelay: `${introLineDelay + 0.55}s`,
          }}
          className="intro-nav-drop"
        >
          <div style={{ display: "flex", alignItems: "center", gap: 100 }}>
            <div style={{ fontSize: 22, color: "#fff" }}>Moggily</div>
            <div style={{ fontSize: 16, color: "#fff" }}>Join the Journey</div>
          </div>
        </div>

        {/* Cards layer */}
        <div
          ref={cardsLayerRef}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            pointerEvents: "none",
            opacity: 0,
            transform: "translateY(10px)",
          }}
        >
          <div
            style={{
              position: "relative",
              width: "min(860px, 92vw)",
            }}
          >
            <BattleArena isVisible leftRef={cardARef} rightRef={cardBRef} />
          </div>
        </div>

        {/* Waitlist */}
        <div
          ref={waitlistRef}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "min(calc(10vh + 0px), calc(100vh - 220px))",
            bottom: "auto",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            textAlign: "center",
            zIndex: 7,
            opacity: 0,
            transform: "translateY(12px)",
            pointerEvents: "none",
            color: "#fff",
            fontFamily:
              "\"Roboto\", ui-sans-serif, system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif",
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setWaitlistEmail("");
              setWaitlistMessage("You're in. We'll email when it's your turn.");
            }}
            style={{
              width: "min(680px, 92vw)",
              background: "rgba(10,12,18,0.55)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 18,
              padding: "12px 16px 12px",
              minHeight: 96,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
            }}
          >
            {waitlistMessage ? null : (
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, textAlign: "center" }}>
                Join the waitlist
              </div>
            )}
            {waitlistMessage ? null : (
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  type="email"
                  name="email"
                  placeholder="Your email…"
                  value={waitlistEmail}
                  onChange={(event) => setWaitlistEmail(event.target.value)}
                  style={{
                    flex: 1,
                    minWidth: 280,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.2)",
                    background: "rgba(255,255,255,0.08)",
                    color: "#fff",
                    outline: "none",
                  }}
                />
                <button
                  type="submit"
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.28)",
                    background: "rgba(255,255,255,0.14)",
                    color: "#fff",
                    fontWeight: 600,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  Join
                </button>
              </div>
            )}
            <div
              style={{
                marginTop: 10,
                fontSize: 12,
                color: "rgba(255,255,255,0.7)",
                lineHeight: 1.4,
                textAlign: "center",
              }}
            >
              {waitlistMessage ||
                "By joining the waitlist, you agree to receive early access updates. No spam. Unsubscribe anytime."}
            </div>
          </form>
        </div>

        </div>
      </div>
      <footer
        style={{
          padding: "10px 10px 0px",
          textAlign: "center",
          color: "rgba(255,255,255,0.7)",
          background: "#000",
          fontSize: 10,
          letterSpacing: "0.02em",
          fontFamily:
            "\"Rubik\", ui-sans-serif, system-ui, -apple-system, Segoe UI, Helvetica, Arial, sans-serif",
        }}
      >
        Moggily · Built for the Grinders, Romantics, and Aura Farmers.
      </footer>
    </>
  );
}

