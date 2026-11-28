// ChessMate Admin Royal finale: 3D royal profile frame, golden fire-breath toward the mated King,
// the premium CHECKMATE banner and the ADMIN WON / OPPONENT WON / DRAW reveal.
//
// Visual only. Nothing here reads or writes chess state: app.js decides *whether* to play it from the
// server's game-over event and passes plain values in. Every run is cancellable and self-cleaning.

export const ADMIN_BOARD_KEY = "board_admin_royal";

const reduceMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const muted = () => document.getElementById("home-sound-toggle")?.getAttribute("aria-pressed") === "false";

/* ------------------------------------------------------------------ shared art */
const CROWN_PATHS = `
  <path d="M-40 22L-48 -18L-22 2L0 -32L22 2L48 -18L40 22Z" fill="url(#arGoldV)" stroke="#4a3208" stroke-width="2" stroke-linejoin="round"/>
  <rect x="-42" y="20" width="84" height="15" rx="4" fill="url(#arGold)" stroke="#4a3208" stroke-width="2"/>
  <circle cx="-48" cy="-22" r="6" fill="url(#arGold)"/><circle cx="0" cy="-38" r="7.5" fill="url(#arGold)"/><circle cx="48" cy="-22" r="6" fill="url(#arGold)"/>
  <circle cx="-22" cy="27.5" r="4.2" fill="url(#arGem)"/><circle cx="0" cy="27.5" r="4.8" fill="url(#arGem)"/><circle cx="22" cy="27.5" r="4.2" fill="url(#arGem)"/>`;
const KING_PATHS = `
  <g fill="url(#arGoldV)" stroke="#3a2606" stroke-width="2" stroke-linejoin="round">
  <rect x="-3.5" y="-58" width="7" height="22" rx="1.5"/><rect x="-11" y="-51" width="22" height="7" rx="1.5"/>
  <path d="M-19 -32Q0 -44 19 -32L15 -8Q0 -2 -15 -8Z"/><path d="M-15 -8Q-25 20 -30 42L30 42Q25 20 15 -8Z"/>
  <rect x="-36" y="42" width="72" height="12" rx="5"/><rect x="-30" y="54" width="60" height="8" rx="4"/></g>`;
const svg = (cls, vb, body) => `<svg class="${cls}" viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;
const CROWN_SVG = cls => svg(cls, "-56 -50 112 96", CROWN_PATHS);
const KING_SVG = cls => svg(cls, "-42 -64 84 132", KING_PATHS);

// Gradients shared by every inline SVG above (referenced by id, so they must live in the document).
const DEFS_SVG = `<svg id="ar-defs" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute"><defs>
  <linearGradient id="arGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3bd"/><stop offset=".25" stop-color="#e0b04a"/><stop offset=".55" stop-color="#8f5d13"/><stop offset=".8" stop-color="#f6da86"/><stop offset="1" stop-color="#a8761c"/></linearGradient>
  <linearGradient id="arGoldV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff0b0"/><stop offset=".45" stop-color="#d6a23c"/><stop offset="1" stop-color="#7d5110"/></linearGradient>
  <radialGradient id="arGem" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#d8f0ff"/><stop offset=".32" stop-color="#4aa3ff"/><stop offset=".72" stop-color="#1348b8"/><stop offset="1" stop-color="#071a52"/></radialGradient>
</defs></svg>`;

function ensureDefs() {
  if (document.getElementById("ar-defs")) return;
  const holder = document.createElement("div");
  holder.setAttribute("aria-hidden", "true");
  holder.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  holder.innerHTML = DEFS_SVG;
  document.body.append(holder);
}

/** The royal 3D frame around an existing profile picture (glyph = the player's own avatar). */
export function buildRoyalAvatar(glyph) {
  ensureDefs();
  const el = document.createElement("div");
  el.className = "ra";
  el.innerHTML =
    `<div class="ra-glow"></div><div class="ra-tilt">` +
    `<i class="ra-layer l3"></i><i class="ra-layer l2"></i><i class="ra-layer l1"></i>` +
    `<span class="ra-face"></span><i class="ra-shine"></i>` +
    `<i class="ra-gem g1"></i><i class="ra-gem g2"></i><i class="ra-gem g3"></i><i class="ra-gem g4"></i>` +
    CROWN_SVG("ra-crown") + `</div>`;
  el.querySelector(".ra-face").textContent = glyph || "♞";
  return el;
}

/** Add/remove the royal frame on an avatar that already exists in the page (profile card, mini profile, seat). */
export function markAdminAvatar(el, on) {
  if (!el) return;
  el.classList.toggle("royal-admin-avatar", !!on);
  el.querySelector(":scope > .ra-mini")?.remove();           // the picture itself (its glyph) is never touched
  if (!on) return;
  ensureDefs();
  const deco = document.createElement("span");
  deco.className = "ra-mini";
  deco.setAttribute("aria-hidden", "true");
  deco.innerHTML = CROWN_SVG("ra-mini-crown") + `<i class="ra-gem l"></i><i class="ra-gem r"></i>`;
  el.append(deco);
}

/* ------------------------------------------------------------------ sound (optional, respects the Sound toggle) */
let audio = null;
function tone(c, t, freq, dur, type, gain, slideTo) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
}
function sfx(kind) {
  if (muted()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audio ||= new AC();
    if (audio.state === "suspended") audio.resume().catch(() => {});
    const c = audio, t = c.currentTime;
    if (kind === "gong") {
      tone(c, t, 98, 2.6, "sine", 0.32); tone(c, t, 196, 2.0, "triangle", 0.14);
      [1318, 1760, 2349].forEach((f, i) => tone(c, t + 0.12 + i * 0.12, f, 1.2, "sine", 0.06));
    } else if (kind === "breath") {
      const len = Math.floor(c.sampleRate * 1.3), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.min(1, i / (len * 0.2)) * (1 - i / len);
      const src = c.createBufferSource(); src.buffer = buf;
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 0.9;
      bp.frequency.setValueAtTime(260, t); bp.frequency.exponentialRampToValueAtTime(1900, t + 1.1);
      const g = c.createGain(); g.gain.value = 0.5;
      src.connect(bp).connect(g).connect(c.destination); src.start(t);
    } else if (kind === "impact") {
      tone(c, t, 150, 0.7, "sine", 0.4, 40);
      [1568, 2093, 2637].forEach((f, i) => tone(c, t + i * 0.07, f, 0.9, "sine", 0.06));
    } else if (kind === "verdict") {
      [523, 659, 784, 1047].forEach((f, i) => tone(c, t + i * 0.09, f, 0.9, "triangle", 0.09));
    }
  } catch { /* audio is optional */ }
}

/* ------------------------------------------------------------------ fire breath (canvas, additive glow) */
function sprite(r, g, b) {
  const s = document.createElement("canvas"); s.width = s.height = 64;
  const x = s.getContext("2d");
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.35, `rgba(${r},${g},${b},.55)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grad; x.fillRect(0, 0, 64, 64);
  return s;
}
let sprites = null;

function bezier(a, c, b, t) {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

// Returns { stop }. Calls onImpact() when the flame reaches the target.
function runBreath(run, from, to, onImpact) {
  sprites ||= [sprite(255, 246, 205), sprite(255, 200, 74), sprite(255, 122, 28)];
  const cv = document.createElement("canvas");
  cv.className = "ar-fire";
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = window.innerWidth, H = window.innerHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ctx = cv.getContext("2d");
  if (!ctx) { onImpact(); return; }
  ctx.scale(dpr, dpr);
  run.root.append(cv);

  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  const nx = -(to.y - from.y) / len, ny = (to.x - from.x) / len;
  const ctrl = { x: (from.x + to.x) / 2 + nx * len * 0.12, y: (from.y + to.y) / 2 + ny * len * 0.12 };
  const parts = [];
  const TRAVEL = 1050, TOTAL = TRAVEL + 1300;
  const t0 = performance.now();
  let last = t0, impacted = false;

  const spawn = (x, y, vx, vy, life, size, tint) => {
    if (parts.length < 420) parts.push({ x, y, vx, vy, born: performance.now(), life, size, tint });
  };

  const frame = now => {
    if (run.dead) return;
    const el = now - t0, dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (el < TRAVEL) {
      const k = el / TRAVEL, p = k * k * (3 - 2 * k) * 0.6 + k * 0.4;     // eased travel
      const head = bezier(from, ctrl, to, p);
      const spread = 3 + p * 24;
      for (let i = 0; i < 9 + Math.round(p * 8); i++) {
        spawn(head.x + (Math.random() - 0.5) * spread, head.y + (Math.random() - 0.5) * spread,
          (Math.random() - 0.5) * 60 + (to.x - from.x) * 0.1, (Math.random() - 0.5) * 60 + (to.y - from.y) * 0.1,
          380 + Math.random() * 380, 16 + Math.random() * 20 + p * 14, Math.random() < 0.35 ? 0 : Math.random() < 0.6 ? 1 : 2);
      }
      for (let i = 0; i < 7; i++) {                                         // body of the flame behind the head
        const pp = bezier(from, ctrl, to, Math.random() * p);
        spawn(pp.x + (Math.random() - 0.5) * 14, pp.y + (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, 260 + Math.random() * 260, 12 + Math.random() * 14, Math.random() < 0.5 ? 1 : 2);
      }
    } else if (!impacted) {
      impacted = true;
      onImpact();
      for (let i = 0; i < 70; i++) {
        const a = Math.random() * Math.PI * 2, sp = 90 + Math.random() * 330;
        spawn(to.x, to.y, Math.cos(a) * sp, Math.sin(a) * sp, 520 + Math.random() * 520, 14 + Math.random() * 22, i % 3);
      }
    }

    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i], age = now - q.born, k = age / q.life;
      if (k >= 1) { parts.splice(i, 1); continue; }
      q.x += q.vx * dt; q.y += q.vy * dt;
      const size = q.size * (0.55 + k * 1.1);
      ctx.globalAlpha = Math.pow(1 - k, 1.35) * 0.95;
      ctx.drawImage(sprites[k < 0.28 ? Math.max(0, q.tint - 1) : k < 0.62 ? q.tint : 2], q.x - size, q.y - size, size * 2, size * 2);
    }
    ctx.globalAlpha = 1;

    if (impacted) {                                                          // expanding shock ring
      const rk = Math.min(1, (el - TRAVEL) / 700);
      ctx.globalAlpha = (1 - rk) * 0.8;
      ctx.strokeStyle = "#ffd978"; ctx.lineWidth = 5 * (1 - rk) + 1;
      ctx.beginPath(); ctx.arc(to.x, to.y, 12 + rk * 90, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (el < TOTAL || parts.length) run.raf = requestAnimationFrame(frame);
    else cv.remove();
  };
  run.raf = requestAnimationFrame(frame);
}

/* ------------------------------------------------------------------ banner */
function buildBanner() {
  const el = document.createElement("div");
  el.className = "ar-banner";
  let parts = "";
  for (let i = 0; i < 30; i++) {
    parts += `<i style="--x:${Math.round(Math.random() * 100)}%;--d:${(Math.random() * 2.6).toFixed(2)}s;--t:${(2.4 + Math.random() * 2).toFixed(2)}s;--s:${(0.5 + Math.random() * 1).toFixed(2)}"></i>`;
  }
  el.innerHTML =
    `<div class="ar-b-glow"></div>` +
    `<div class="ar-b-card">` +
      `<div class="ar-b-parts">${parts}</div>` +
      CROWN_SVG("ar-b-crown") + KING_SVG("ar-b-king l") + KING_SVG("ar-b-king r") +
      `<i class="ar-gem g1"></i><i class="ar-gem g2"></i><i class="ar-gem g3"></i><i class="ar-gem g4"></i>` +
      `<div class="ar-b-title"><span class="ar-b-text" data-text=""></span></div>` +
      `<div class="ar-b-sub"></div>` +
    `</div>`;
  return el;
}

function setBannerText(banner, text, sub) {
  const t = banner.querySelector(".ar-b-text");
  t.textContent = text; t.dataset.text = text;
  banner.dataset.long = text.length > 11 ? "1" : "0";
  banner.querySelector(".ar-b-sub").textContent = sub || "";
}

/* ------------------------------------------------------------------ CHECKMATE BURST intro + profile card */
function buildBurst() {
  const el = document.createElement("div");
  el.className = "ar-burst";
  let sparks = "";
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + Math.random() * 0.25, d = 140 + Math.random() * 300;
    sparks += `<i style="--dx:${Math.round(Math.cos(a) * d)}px;--dy:${Math.round(Math.sin(a) * d)}px;--s:${(0.6 + Math.random() * 1.1).toFixed(2)};--d:${(Math.random() * 0.5).toFixed(2)}s"></i>`;
  }
  el.innerHTML = `<div class="ab-flash"></div><div class="ab-rays"></div><i class="ab-wave w1"></i><i class="ab-wave w2"></i><i class="ab-wave w3"></i>` +
    `<div class="ab-title"><span class="ab-t1" data-text="CHECKMATE">CHECKMATE</span><span class="ab-t2" data-text="BURST">BURST</span></div>` +
    `<div class="ab-sparks">${sparks}</div>`;
  return el;
}

/** The winning Admin's complete profile: picture (in the royal frame), username, rating and role badge. */
function buildProfileCard(p) {
  const card = document.createElement("div");
  card.className = "ar-hero";
  const avatar = buildRoyalAvatar(p.glyph);
  const info = document.createElement("div");
  info.className = "ar-hero-info";
  const name = document.createElement("b"); name.textContent = p.name || "Admin";
  const rating = document.createElement("small"); rating.textContent = p.rating ? `${p.rating} ELO` : "";
  const badge = document.createElement("span");
  badge.className = "ar-role" + (p.role === "OWNER" ? " owner" : "");
  badge.textContent = `♛ ${p.role === "OWNER" ? "OWNER" : "ADMIN"}`;
  info.append(name, rating, badge);
  card.append(avatar, info);
  return card;
}

/* ------------------------------------------------------------------ orchestrator */
let current = null, seq = 0;

/** Stop whatever is playing and remove every node it created. Safe to call at any time. */
export function cancelAdminFinale() {
  const r = current;
  if (!r) return;
  r.dead = true;
  r.timers.forEach(clearTimeout);
  cancelAnimationFrame(r.raf);
  r.root.remove();
  current = null;
  r.resolve("cancelled");
}

/**
 * opts: {
 *   glyph,                      // the winning Admin's existing profile picture (glyph)
 *   boardEl, kingEl,            // elements used only to position the hero and aim the flame
 *   checkmate: boolean,         // game really ended in checkmate -> CHECKMATE banner first
 *   showHero: boolean,          // Admin delivered the mate -> raise profile + fire-to-King
 *   verdict, detail,            // "ADMIN WON" | "OPPONENT WON" | "DRAW" (+ short reason line)
 *   isValid: () => boolean      // false -> the sequence cancels itself (player left the game)
 * }
 * Resolves "done" (play the normal result card now) or "cancelled".
 */
export function playAdminFinale(opts) {
  cancelAdminFinale();
  const calm = reduceMotion();
  const id = ++seq;

  return new Promise(resolve => {
    const root = document.createElement("div");
    root.className = "ar-root" + (calm ? " ar-calm" : "");
    root.setAttribute("role", "presentation");
    ensureDefs();
    root.innerHTML = `<div class="ar-dim"></div><div class="ar-skip">Admin Royal Finale</div>`;
    document.body.append(root);

    const run = { id, root, timers: [], raf: 0, dead: false, resolve };
    current = run;

    const alive = () => {
      if (current !== run || run.dead) return false;
      if (opts.isValid && !opts.isValid()) { cancelAdminFinale(); return false; }
      return true;
    };
    const later = (ms, fn) => run.timers.push(setTimeout(() => { if (alive()) fn(); }, ms));
    const finish = () => {
      if (current !== run) return;
      run.dead = true;
      run.timers.forEach(clearTimeout);
      cancelAnimationFrame(run.raf);
      current = null;
      root.classList.add("out");
      setTimeout(() => root.remove(), 380);
      resolve("done");
    };
    // No tap-to-skip: preserve the complete Admin Royal finale sequence.

    const banner = buildBanner();
    root.append(banner);
    requestAnimationFrame(() => root.classList.add("in"));

    const bannerIn = (text, sub) => {
      setBannerText(banner, text, sub);
      banner.classList.remove("out"); void banner.offsetWidth; banner.classList.add("in");
    };
    const bannerOut = () => { banner.classList.remove("in"); banner.classList.add("out"); };

    const showVerdict = () => {
      bannerIn(opts.verdict || "GAME OVER", opts.detail || "");
      sfx("verdict");
      later(calm ? 1300 : 2100, () => { bannerOut(); later(450, finish); });
    };

    const runBanner = () => {
      bannerIn("CHECKMATE", opts.showHero ? "Royal Victory" : "The King has fallen");
      sfx("gong");
      later(calm ? 1400 : 2500, () => { bannerOut(); later(calm ? 250 : 650, () => { if (hero) { hero.classList.add("down"); hero.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 450, fill: "forwards" }); } showVerdict(); }); });
    };

    // --- real mated King square highlight
    const boardRect = opts.boardEl?.getBoundingClientRect();
    const kingRect = opts.kingEl?.getBoundingClientRect();
    let hero = null;

    if (opts.checkmate && kingRect) {
      const mark = document.createElement("i");
      mark.className = "ar-king-mark";
      mark.style.cssText = `left:${kingRect.left}px;top:${kingRect.top}px;width:${kingRect.width}px;height:${kingRect.height}px`;
      root.append(mark);
      run.mark = mark;
    }

    // --- Admin victory: CHECKMATE BURST -> profile rises & throws fire -> King impact -> banner
    const launch = () => {
      const card = buildProfileCard(opts.profile || { glyph: opts.glyph });
      hero = card;
      card.style.setProperty("--ra", Math.max(52, Math.min(72, boardRect.width * 0.19)) + "px");
      root.append(card);
      const endX = boardRect.left + boardRect.width / 2;
      const cr = card.getBoundingClientRect();
      const endY = Math.max(cr.height / 2 + 8, boardRect.top - cr.height * 0.42);
      card.style.left = endX + "px"; card.style.top = endY + "px";
      const seat = opts.seatEl?.getBoundingClientRect();
      const dx = seat ? seat.left + seat.width / 2 - endX : 0;
      const dy = seat ? seat.top + seat.height / 2 - endY : boardRect.bottom - endY;
      if (card.animate && !calm) {
        card.animate([
          { transform: `translate(-50%,-50%) translate(${dx}px,${dy}px) scale(.7) rotateY(180deg)`, opacity: 0.2 },
          { transform: "translate(-50%,-50%) scale(1) rotateY(0deg)", opacity: 1 }
        ], { duration: 1000, easing: "cubic-bezier(.2,.9,.25,1.12)", fill: "forwards" });
      } else {
        card.classList.add("in");
      }
      sfx("gong");
      later(calm ? 400 : 1150, () => {
        const ar = (card.querySelector(".ra") || card).getBoundingClientRect();
        const from = { x: ar.left + ar.width / 2, y: ar.top + ar.height * 0.7 };
        const to = { x: kingRect.left + kingRect.width / 2, y: kingRect.top + kingRect.height / 2 };
        const impact = () => { run.mark?.classList.add("hit"); sfx("impact"); later(calm ? 500 : 900, runBanner); };
        if (calm) { impact(); return; }
        sfx("breath");
        runBreath(run, from, to, impact);
      });
    };

    if (opts.showHero && boardRect && kingRect) {
      if (opts.burst === false) launch();
      else {
        const burst = buildBurst();
        root.append(burst);
        sfx("gong");
        later(calm ? 1100 : 2000, () => { burst.classList.add("out"); setTimeout(() => burst.remove(), 400); launch(); });
      }
    } else if (opts.checkmate) {
      later(calm ? 100 : 450, () => { run.mark?.classList.add("hit"); later(calm ? 200 : 550, runBanner); });
    } else {
      later(120, showVerdict);                                                // resignation, draw, abandonment...
    }
  });
}
