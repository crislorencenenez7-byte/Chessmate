// ChessMate themed checkmate finales for the Exclusive Deals boards:
// Obsidian Royale (gold embers), Aurora (ice + northern lights), Forests (leaves + fireflies).
// Compositor-only animation (transform / opacity), ~26 particles, auto-cleans, tap to dismiss.

const SCENES = {
  obsidian: { img: "./themes/mate-obsidian.webp", glyphs: ["✦", "✧", "♛", "✦"], sound: "gong" },
  aurora:   { img: "./themes/mate-aurora.webp",   glyphs: ["❄", "❅", "✦", "❆"], sound: "glass" },
  forest:   { img: "./themes/mate-forest.webp",   glyphs: ["🍃", "🌿", "✦", "🍂"], sound: "wood" },
  christmas:{ img: "./themes/mate-christmas.webp", glyphs: ["❄", "❅", "★", "✦"], sound: "bells" },
  rosewood: { img: "./themes/mate-rose.webp",      glyphs: ["✦", "✧", "❖", "✦"], sound: "marimba" }
};
export const MATE_SPLASH_FX = Object.keys(SCENES);
export const MATE_SPLASH_MS = 2900;

const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
let ctx = null;

function muted() {
  return document.getElementById("home-sound-toggle")?.getAttribute("aria-pressed") === "false";
}

function tone(c, t, freq, dur, type, gain, slideTo) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.05);
}

function playSound(kind) {
  if (muted()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx ||= new AC();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const t = ctx.currentTime;
    if (kind === "gong") {                       // deep royal gong + gold shimmer
      tone(ctx, t, 110, 2.4, "sine", 0.35);
      tone(ctx, t, 165, 2.0, "triangle", 0.18);
      [1318, 1760, 2093].forEach((f, i) => tone(ctx, t + 0.15 + i * 0.12, f, 1.1, "sine", 0.07));
    } else if (kind === "glass") {               // crystalline ice tinkle
      [1568, 2093, 2637, 3136].forEach((f, i) => tone(ctx, t + i * 0.09, f, 1.3, "sine", 0.08));
      tone(ctx, t, 196, 1.8, "sine", 0.12);
    } else if (kind === "bells") {               // sleigh-bell chimes
      [1319, 1568, 1976, 2637, 1976, 2637].forEach((f, i) => tone(ctx, t + i * 0.13, f, 0.9, "sine", 0.08));
      tone(ctx, t, 262, 1.4, "triangle", 0.08);
    } else if (kind === "marimba") {             // warm rosewood marimba arpeggio
      [262, 330, 392, 523].forEach((f, i) => { tone(ctx, t + i * 0.11, f, 0.9, "triangle", 0.2); tone(ctx, t + i * 0.11, f * 2, 0.5, "sine", 0.06); });
    } else {                                     // warm wooden bell + breeze
      tone(ctx, t, 392, 1.6, "triangle", 0.16);
      tone(ctx, t + 0.12, 587, 1.4, "sine", 0.1);
      tone(ctx, t + 0.28, 784, 1.2, "sine", 0.07);
    }
  } catch { /* audio is optional */ }
}

/** Play the full-screen finale for the equipped Exclusive board. Returns true if it played. */
export function playThemeMate(fx) {
  const scene = SCENES[fx];
  if (!scene) return false;
  document.querySelector(".mate-splash")?.remove();

  const root = document.createElement("div");
  root.className = `mate-splash ms-${fx}`;
  root.setAttribute("role", "presentation");
  const calm = reduceMotion();
  if (calm) root.classList.add("ms-calm");

  root.innerHTML = `<div class="ms-dim"></div><div class="ms-rays"></div><div class="ms-stage"><img class="ms-card" alt="Checkmate" decoding="async"></div><div class="ms-parts"></div>`;
  root.querySelector(".ms-card").src = scene.img;

  if (!calm) {
    const parts = root.querySelector(".ms-parts");
    const N = 26;
    for (let i = 0; i < N; i++) {
      const s = document.createElement("span");
      s.textContent = scene.glyphs[i % scene.glyphs.length];
      s.style.setProperty("--x", (Math.random() * 100).toFixed(1) + "vw");
      s.style.setProperty("--d", (Math.random() * 0.9).toFixed(2) + "s");
      s.style.setProperty("--t", (2.2 + Math.random() * 1.4).toFixed(2) + "s");
      s.style.setProperty("--s", (0.7 + Math.random() * 1.1).toFixed(2));
      s.style.setProperty("--w", ((Math.random() - 0.5) * 80).toFixed(0) + "px");
      parts.append(s);
    }
  }

  const close = () => {
    root.classList.add("out");
    setTimeout(() => root.remove(), 450);
  };
  root.querySelector(".ms-card").addEventListener("pointerdown", close, { once: true });
  document.body.append(root);
  playSound(scene.sound);
  setTimeout(close, MATE_SPLASH_MS - 450);
  setTimeout(() => root.remove(), MATE_SPLASH_MS + 300);
  return true;
}
