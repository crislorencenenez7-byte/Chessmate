// ChessMate board themes: Christmas Event (green) and Exclusive Deals "Royal Sapphire" (blue).
// Visual effects only. Ownership/pricing is enforced server-side (see COSMETICS in the server).

export const FX_BY_BOARD = {
  board_christmas: "christmas",
  board_sapphire: "sapphire"
};

const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Resolve which fx pack ("christmas" | "sapphire" | "") applies to the equipped board. */
export function resolveFx(boardKey) {
  const key = boardKey || "classic";
  if (FX_BY_BOARD[key]) return FX_BY_BOARD[key];
  // Christmas Event: players still on the default board get the festive board.
  // Disable by setting window.CHESSMATE_CHRISTMAS_EVENT = false in config.js.
  if (key === "classic" && window.CHESSMATE_CHRISTMAS_EVENT !== false) return "christmas";
  return "";
}

/** Marble boards need each square to show its own slice of one big texture. */
export function marbleSlice(sq, col, row) {
  sq.style.backgroundSize = "800% 800%";
  sq.style.backgroundPosition = `${(col / 7) * 100}% ${(row / 7) * 100}%`;
}

/** King Circle: animated ring under each king (sapphire only). */
export function kingRing(color, mated) {
  const ring = document.createElement("i");
  ring.className = `king-ring ${color === "w" ? "kc-w" : "kc-b"}${mated ? " kc-mated" : ""}`;
  ring.setAttribute("aria-hidden", "true");
  return ring;
}

// ---------------------------------------------------------------- audio
let audioCtx = null;
function soundMuted() {
  return document.getElementById("home-sound-toggle")?.getAttribute("aria-pressed") === "false";
}
function thunder() {
  if (soundMuted()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx ||= new AC();
    const ctx = audioCtx;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const now = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 3.2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {            // brown-ish noise
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
    const src = ctx.createBufferSource(); src.buffer = buf;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass";
    lp.frequency.setValueAtTime(1800, now); lp.frequency.exponentialRampToValueAtTime(140, now + 2.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.9, now + 0.02);   // crack
    g.gain.exponentialRampToValueAtTime(0.35, now + 0.35);  // rumble body
    g.gain.exponentialRampToValueAtTime(0.0001, now + 3.1);
    src.connect(lp).connect(g).connect(ctx.destination);
    src.start(now);
  } catch { /* audio is optional */ }
}

// ---------------------------------------------------------------- lightning
function bolt(x1, y1, x2, y2, disp, out) {
  if (disp < 3) { out.push([x2, y2]); return; }
  const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * disp;
  const my = (y1 + y2) / 2 + (Math.random() - 0.5) * disp * 0.35;
  bolt(x1, y1, mx, my, disp / 2, out);
  bolt(mx, my, x2, y2, disp / 2, out);
}
function makePath(x1, y1, x2, y2, spread) {
  const pts = [[x1, y1]];
  bolt(x1, y1, x2, y2, spread, pts);
  return pts;
}
function buildBolt(tx, ty, vw) {
  const sx = tx + (Math.random() - 0.5) * vw * 0.35;
  const main = makePath(sx, -20, tx, ty, Math.max(120, vw * 0.22));
  const branches = [];
  for (let i = 8; i < main.length - 6; i += 1) {
    if (Math.random() < 0.07) {
      const [bx, by] = main[i];
      const dir = Math.random() < 0.5 ? -1 : 1;
      const len = 90 + Math.random() * 190;
      branches.push(makePath(bx, by, bx + dir * (40 + Math.random() * 140), by + len, 70));
    }
  }
  return { main, branches };
}
function strokePath(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}
function drawBolt(ctx, b, power) {
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  const pass = (path, w, color, alpha, blur) => {
    ctx.globalAlpha = alpha * power; ctx.strokeStyle = color; ctx.lineWidth = w;
    ctx.shadowColor = "#6fb6ff"; ctx.shadowBlur = blur;
    strokePath(ctx, path);
  };
  for (const br of b.branches) {
    pass(br, 7, "#3d86e0", 0.25, 18);
    pass(br, 2.2, "#dff0ff", 0.95, 8);
  }
  pass(b.main, 26, "#2f6fd0", 0.16, 40);
  pass(b.main, 13, "#6fb6ff", 0.38, 26);
  pass(b.main, 6, "#cfe8ff", 0.9, 14);
  pass(b.main, 2.6, "#ffffff", 1, 4);
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

/** Original Canvas lightning renderer — retained as fallback. */
function lightningStrikeCanvas(cvData) {
  const { tx, ty, r, main, frames } = cvData;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cv = document.createElement("canvas");
  cv.className = "lightning-canvas";
  cv.width = Math.round(innerWidth * dpr);
  cv.height = Math.round(innerHeight * dpr);
  document.body.append(cv);

  const ctx = cv.getContext("2d");
  if (!ctx) {
    cv.remove();
    return;
  }
  ctx.scale(dpr, dpr);

  const start = performance.now();
  let i = -1;

  const tick = now => {
    const elapsed = now - start;
    let idx = -1;
    frames.forEach((f, n) => {
      if (elapsed >= f.t) idx = n;
    });

    if (idx !== i && idx >= 0) {
      i = idx;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      drawBolt(ctx, main, frames[idx].p);

      const glow = ctx.createRadialGradient(tx, ty, 0, tx, ty, r.width * 1.6);
      glow.addColorStop(0, `rgba(190,225,255,${0.75 * frames[idx].p})`);
      glow.addColorStop(1, "rgba(60,120,255,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(tx - r.width * 2, ty - r.width * 2, r.width * 4, r.width * 4);
    }

    if (elapsed < 900) {
      requestAnimationFrame(tick);
    } else {
      cv.classList.add("out");
      setTimeout(() => cv.remove(), 700);
    }
  };

  requestAnimationFrame(tick);
}

/** Sapphire lightning: PixiJS renderer with the original Canvas fallback. */
export function lightningStrike(squareEl) {
  if (!squareEl) return;

  const r = squareEl.getBoundingClientRect();
  const tx = r.left + r.width / 2;
  const ty = r.top + r.height / 2;

  squareEl.classList.add("struck");
  setTimeout(() => squareEl.classList.remove("struck"), 4200);
  if (reduceMotion()) return;

  const main = buildBolt(tx, ty, innerWidth);
  const frames = [
    { t: 0, p: 1 }, { t: 70, p: 0.12 }, { t: 130, p: 1 },
    { t: 210, p: 0.2 }, { t: 270, p: 0.85 },
    { t: 360, p: 0.35 }, { t: 470, p: 0.15 }
  ];

  // Preserve the existing audio, flash and board-shake effects.
  thunder();
  document.getElementById("board")?.classList.add("shake");
  setTimeout(() => document.getElementById("board")?.classList.remove("shake"), 700);

  const flash = document.createElement("div");
  flash.className = "lightning-flash";
  document.body.append(flash);
  flash.classList.add("go");

  const data = { tx, ty, r, main, frames };

  import("./pixi-fx.js")
    .then(({ renderLightningPixi }) => renderLightningPixi({
      bolt: main,
      tx,
      ty,
      radius: r.width,
      frames
    }))
    .then(success => {
      if (!success) lightningStrikeCanvas(data);
      setTimeout(() => flash.remove(), 1000);
    })
    .catch(() => {
      lightningStrikeCanvas(data);
      setTimeout(() => flash.remove(), 1000);
    });
}

/** Checkmate burst. Sapphire: shockwave rings; Christmas: snowflake/gold sparkle. */
export function checkmateBurst(frameEl, fx, squareEl) {
  if (!frameEl || reduceMotion()) return;
  const fr = frameEl.getBoundingClientRect();
  let cx = fr.width / 2, cy = fr.height / 2;
  if (squareEl) {
    const s = squareEl.getBoundingClientRect();
    cx = s.left - fr.left + s.width / 2; cy = s.top - fr.top + s.height / 2;
  }
  const wrap = document.createElement("div");
  wrap.className = `mate-burst mate-${fx}`;
  wrap.style.left = cx + "px"; wrap.style.top = cy + "px";
  if (fx === "sapphire") {
    for (let n = 0; n < 3; n++) {
      const ring = document.createElement("i");
      ring.className = "wave"; ring.style.animationDelay = `${n * 0.18}s`;
      wrap.append(ring);
    }
  }
  const glyphs = fx === "christmas" ? ["❄", "✦", "❅", "✧", "★"] : ["✦", "✧", "⚡"];
  for (let n = 0; n < 18; n++) {
    const p = document.createElement("span");
    const a = (n / 18) * Math.PI * 2 + Math.random() * 0.3, d = 70 + Math.random() * 130;
    p.textContent = glyphs[n % glyphs.length];
    p.style.setProperty("--dx", Math.cos(a) * d + "px");
    p.style.setProperty("--dy", Math.sin(a) * d + "px");
    p.style.setProperty("--s", (0.7 + Math.random() * 0.9).toFixed(2));
    p.style.animationDelay = (Math.random() * 0.12).toFixed(2) + "s";
    wrap.append(p);
  }
  frameEl.append(wrap);
  setTimeout(() => wrap.remove(), 2200);
}
