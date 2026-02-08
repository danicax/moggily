// ScrollStarStory.jsx
// Paste into a React project (Vite/CRA/Next). If Next.js App Router, add "use client" at the top.

import React, { useEffect, useMemo, useRef } from "react";
import BattleArena from "./components/BattleArena";
import "./voting.css";

export default function ScrollStarStory() {
  const wrapRef = useRef(null);
  const stageRef = useRef(null);
  const canvasRef = useRef(null);

  const cardsLayerRef = useRef(null);
  const cardARef = useRef(null);
  const cardBRef = useRef(null);

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

  function initStars(count) {
    const { W, H } = dimsRef.current;
    const stars = [];
    for (let i = 0; i < count; i++) {
      const isHero = i < 2;
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

    // Rebuild targets because W/H changed
    rebuildTargets();
  }

  function computeProgress() {
    const { wrapTop, scrollMax } = scrollRef.current;
    const y = window.scrollY;
    return clamp((y - wrapTop) / scrollMax, 0, 1);
  }

  function applyStory(p) {
    // Segment boundaries
    const A1 = 0.05;
    const B0 = 0.05, B1 = 0.70;
    const C0 = 0.70, C1 = 0.82;
    const F0 = 0.94, F1 = 1.0;

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
    } else if (p < F0) {
      drift = 0.18; fall = 0.08; streak = 0.10; morphCards = 1.0; morphHeart = 0.0;
    } else {
      const t = range01(p, F0, F1);
      drift = lerp(0.10, 0.0, t);
      fall = 0.0;
      streak = 0.10;
      morphCards = lerp(1.0, 0.0, t);
      morphHeart = lerp(0.0, 1.0, t);
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
    const cardA = cardARef.current;
    const cardB = cardBRef.current;
    if (!cardsLayer || !cardA || !cardB) return;

    const cardsIn = range01(p, 0.74, 0.82);
    const cardsOut = range01(p, 0.94, 0.97);
    const cardsOpacity = clamp(cardsIn - cardsOut, 0, 1);
    cardsLayer.style.opacity = String(cardsOpacity);
    cardsLayer.style.transform = `translateY(${lerp(12, 0, cardsIn)}px)`;

    const cardReveal = range01(p, 0.80, 0.86);
    cardA.style.opacity = String(cardReveal);
    cardB.style.opacity = String(cardReveal);

    const voting = p >= 0.80 && p <= 0.95 && cardReveal > 0.6;
    cardsLayer.style.pointerEvents = voting ? "auto" : "none";

    // Keep cards overlapped until stars finish blinking out
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

    // Draw trail as stacked circles along a stored curved path (thick near head)
    function drawTrail(s, vis) {
      const strength = Math.max(params.streak, params.fall);
      if (strength <= 0.001 || vis <= 0.001 || params.scrollDir < 0) return;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const tail = s.tail;
      const n = Math.max(2, s.tailLen || tail.length);

      for (let i = 0; i < n; i++) {
        const p = tail[tail.length - n + i];
        const t = i / (n - 1); // 0 old -> 1 head
        const k = t * t; // emphasize head
        const radius = (0.20 + strength) * (0.75 + s.r * 0.9) * (0.22 + 1.5 * k);
        const alpha = (0.02 + 0.18 * strength) * s.a * k * vis;

        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    const p = params.progress;
    const blinkOutT = range01(p, 0.74, 0.82);
    const blinkInT = range01(p, 0.94, 0.97);
    const blinkWindow = 0.10;
    const freezeRect = blinkInT > 0 && blinkInT < 1;
    const cardCx = W * 0.5;
    const cardCy = H * 0.5;
    const scrollUp = params.scrollDir < -0.0004;

    for (const s of stars) {
      if (!freezeRect) {
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
      } else {
        // Hold stars in the card outline until all have blinked in
        s.vx *= 0.85;
        s.vy *= 0.85;
        s.x += (s.tx - s.x) * 0.35;
        s.y += (s.ty - s.y) * 0.35;
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

      const order = s.seed - Math.floor(s.seed);
      const out = clamp((blinkOutT - order) / blinkWindow, 0, 1);
      const inn = clamp((blinkInT - order) / blinkWindow, 0, 1);
      let vis = clamp(1 - out + inn, 0, 1);
      const twinkle = 0.75 + 0.35 * Math.sin(now * (1.2 + s.seed * 0.015) + s.seed * 12.3);
      vis *= twinkle;

      drawTrail(s, vis);

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
    initStars(starCount);
    measure(); // rebuild targets with correct starCount

    // ResizeObserver for stage (more robust than window resize alone)
    const ro = new ResizeObserver(() => {
      measure();
    });
    if (stageRef.current) ro.observe(stageRef.current);

    // Main RAF loop: compute scroll progress -> apply story -> draw
    const loop = (t) => {
      const p = computeProgress();
      applyStory(p);
      drawFrame(t);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    // Also recompute measurements on scroll (layout changes)
    const onScroll = () => {
      // lightweight; just update progress next frame
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure, { passive: true });

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Inline “grain” svg noise background (breaks gradient banding/lines)
  const noiseDataUrl =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='.35'/%3E%3C/svg%3E";

  return (
    <div
      ref={wrapRef}
      style={{
        height: "800vh",
        position: "relative",
        background: "#000",
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

        {/* Copy */}
        <div
          style={{
            position: "absolute",
            left: "clamp(20px, 6vw, 72px)",
            top: "clamp(20px, 8vh, 90px)",
            maxWidth: 620,
            zIndex: 5,
            pointerEvents: "none",
            color: "rgba(255,255,255,.92)",
            fontFamily:
              "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
          }}
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

      </div>
    </div>
  );
}

