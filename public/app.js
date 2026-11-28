import { Chess } from "./vendor/chess.js";
import { Engine, LEVELS } from "./js/engine.js";
import { CLASSES, classifyMove, whiteScore, whiteWinPct, scoreText } from "./js/classify.js";
import { resolveFx, FX_BY_BOARD, kingRing, lightningStrike, checkmateBurst } from "./js/themes.js";
import { playThemeMate, MATE_SPLASH_FX, MATE_SPLASH_MS } from "./js/mate-fx.js";

// Exclusive-deal finale of the *equipped* board. (The free Christmas event look on the default board has none.)
function mateFxKey() {
  const key = G?.sharedBoardTheme || economyState.board || "classic";
  const fx = FX_BY_BOARD[key];
  return MATE_SPLASH_FX.includes(fx) ? fx : "";
}

const $ = id => document.getElementById(id);
const FILES = "abcdefgh";
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const PIECE_NAME = { k: "king", q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
const MODE_TITLE = { local: "Two Players", ai: "Play vs Computer", analysis: "Analysis Board", friends: "Friend Match", ranked: "Ranked Match" };

const BACKEND_URL = (window.CHESSMATE_API_URL || "").replace(/\/$/, "");
const ONLINE_ENABLED = !!BACKEND_URL || !location.hostname.endsWith("github.io");
const socket = typeof window.io === "function"
  ? window.io(BACKEND_URL || undefined)
  : { connected: false, on() {}, once() {}, emit() {} };
const engine = new Engine();

let token = store("cm_token") || "";

let adminAuthenticated = false;
let alwaysShowBrilliantMove = false;
let announcementTimer = null;
let adminCoachRequest = 0;
let adminCoachPosition = "";

let user = null;
let authMode = "login";
let G = null;          // the current game (null when no game screen is active)
let gameSeq = 0;
const BOT_PROFILES = [
  { id: "stockfish", name: "Stockfish 19 Lite", rating: "3000+", elo: 3000, level: 4, style: "Engine • strongest local analysis", voice: "I will calculate the position carefully." },
  { id: "fischer", name: "Bobby Fischer", rating: "2800+", elo: 2800, level: 4, style: "Named Stockfish-powered challenge profile", voice: "A classical chess challenge. Look for active pieces." },
  { id: "mittens", name: "Mittens", rating: "2200+", elo: 2200, level: 3, style: "Mittens-inspired Stockfish challenge profile", voice: "Meow. I have a tricky move ready." },
  { id: "master", name: "Grandmaster", rating: "2400+", elo: 2400, level: 3, style: "Strong positional play", voice: "I will test your positional understanding." },
  { id: "club", name: "Club Player", rating: "1600", elo: 1600, level: 2, style: "Balanced club-level challenge", voice: "Let's play a balanced game." },
  { id: "beginner", name: "Beginner", rating: "800", elo: 800, level: 0, style: "Relaxed learning game", voice: "Take your time and develop your pieces." }
];
let aiSetup = { level: Number(store("cm_ailevel") ?? 2), color: "w", bot: store("cm_bot") || "club", voice: store("cm_coach_voice") !== "off" };
let pendingRoom = null;

function store(k, v) {
  try {
    if (v === undefined) return localStorage.getItem(k);
    if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
  } catch {}
  return null;
}


/* ------------------------------------------------------------------ Home UI sound */
let homeSoundEnabled = store("cm_home_sound") !== "off";
let homeAudioContext = null;

function updateHomeSoundButton() {
  const button = $("home-sound-toggle");
  if (!button) return;
  button.setAttribute("aria-pressed", String(homeSoundEnabled));
  button.querySelector(".sound-label").textContent =
    homeSoundEnabled ? "Sound On" : "Sound Off";
  button.querySelector(".sound-icon").textContent =
    homeSoundEnabled ? "♫" : "♪";
}

function playHomeUiSound() {
  if (!homeSoundEnabled) return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    homeAudioContext ||= new AudioContextClass();
    const ctx = homeAudioContext;

    const play = () => {
      const now = ctx.currentTime;
      // Original garden-inspired UI chime: soft, bright, and playful.
      const notes = [
        { frequency: 587.33, at: 0, duration: 0.15, volume: 0.032 },
        { frequency: 739.99, at: 0.075, duration: 0.18, volume: 0.026 },
        { frequency: 880.00, at: 0.15, duration: 0.22, volume: 0.022 }
      ];

      notes.forEach(note => {
        const osc = ctx.createOscillator();
        const shimmer = ctx.createOscillator();
        const gain = ctx.createGain();
        const shimmerGain = ctx.createGain();
        const begin = now + note.at;

        osc.type = "triangle";
        osc.frequency.setValueAtTime(note.frequency, begin);
        shimmer.type = "sine";
        shimmer.frequency.setValueAtTime(note.frequency * 2.01, begin);

        gain.gain.setValueAtTime(0.0001, begin);
        gain.gain.exponentialRampToValueAtTime(note.volume, begin + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, begin + note.duration);

        shimmerGain.gain.setValueAtTime(0.0001, begin);
        shimmerGain.gain.exponentialRampToValueAtTime(note.volume * 0.16, begin + 0.018);
        shimmerGain.gain.exponentialRampToValueAtTime(0.0001, begin + note.duration * 0.8);

        osc.connect(gain);
        shimmer.connect(shimmerGain);
        gain.connect(ctx.destination);
        shimmerGain.connect(ctx.destination);
        osc.start(begin);
        shimmer.start(begin);
        osc.stop(begin + note.duration + 0.02);
        shimmer.stop(begin + note.duration + 0.02);
      });
    };

    if (ctx.state === "suspended") {
      ctx.resume().then(play).catch(() => {});
    } else {
      play();
    }
  } catch {}
}

const homeSoundToggle = $("home-sound-toggle");
if (homeSoundToggle) {
  updateHomeSoundButton();

  homeSoundToggle.addEventListener("click", () => {
    homeSoundEnabled = !homeSoundEnabled;
    store("cm_home_sound", homeSoundEnabled ? "on" : "off");
    updateHomeSoundButton();

    if (homeSoundEnabled) playHomeUiSound();
  });
}

document.addEventListener("pointerdown", event => {
  if (!event.target.closest("#home button")) return;
  if (event.target.closest("#home-sound-toggle")) return;
  playHomeUiSound();
}, { capture: true, passive: true });


/* ------------------------------------------------------------------ Christmas background music */
let christmasMusicEnabled = store("cm_christmas_music") === "on";
const savedChristmasVolumeRaw = store("cm_christmas_music_volume");
const savedChristmasVolume = savedChristmasVolumeRaw === null || savedChristmasVolumeRaw === ""
  ? 82
  : Number(savedChristmasVolumeRaw);
let christmasMusicVolume = Number.isFinite(savedChristmasVolume)
  ? Math.max(0, Math.min(100, savedChristmasVolume))
  : 82;

let christmasAudioContext = null;
let christmasMusicGain = null;
let christmasMusicTimer = null;
let christmasMusicStep = 0;

const christmasMelody = [
  523.25, 659.25, 783.99, 698.46, 659.25, 587.33, 523.25, 587.33,
  659.25, 783.99, 880.00, 783.99, 698.46, 659.25, 587.33, 0,
  698.46, 783.99, 880.00, 987.77, 880.00, 783.99, 698.46, 659.25,
  587.33, 659.25, 698.46, 783.99, 659.25, 587.33, 523.25, 0
];

function updateChristmasMusicButton() {
  const button = $("christmas-music-toggle");
  const label = $("christmas-music-label");
  const volume = $("christmas-music-volume");
  const volumeLabel = $("christmas-volume-label");

  if (button) button.setAttribute("aria-pressed", String(christmasMusicEnabled));
  if (label) label.textContent = christmasMusicEnabled
    ? "Christmas Music On"
    : "Christmas Music Off";
  if (volume) volume.value = String(christmasMusicVolume);
  if (volumeLabel) volumeLabel.textContent = `${christmasMusicVolume}%`;
}

function applyChristmasMusicVolume() {
  if (!christmasMusicGain || !christmasAudioContext) return;
  const target = christmasMusicEnabled ? 0.55 * (christmasMusicVolume / 100) : 0;
  christmasMusicGain.gain.setTargetAtTime(
    target,
    christmasAudioContext.currentTime,
    0.08
  );
}

function playChristmasTone(frequency, startAt, duration, level, type = "sine") {
  const ctx = christmasAudioContext;
  if (!ctx || !christmasMusicGain || !frequency) return;

  const oscillator = ctx.createOscillator();
  const envelope = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);

  envelope.gain.setValueAtTime(0.0001, startAt);
  envelope.gain.exponentialRampToValueAtTime(level, startAt + 0.025);
  envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

  oscillator.connect(envelope);
  envelope.connect(christmasMusicGain);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.03);
}

function playChristmasMusicBeat() {
  const ctx = christmasAudioContext;
  if (!ctx || ctx.state !== "running") return;

  const step = christmasMusicStep % christmasMelody.length;
  const frequency = christmasMelody[step];
  const at = ctx.currentTime + 0.035;

  if (frequency) {
    playChristmasTone(frequency, at, 0.29, 0.34, "triangle");
    playChristmasTone(frequency * 2, at, 0.19, 0.075, "sine");
  }

  const bassNotes = [130.81, 146.83, 174.61, 196.00];
  if (step % 8 === 0) {
    const bass = bassNotes[Math.floor(step / 8) % bassNotes.length];
    playChristmasTone(bass, at, 0.48, 0.22, "sine");
  }

  christmasMusicStep++;
}

function startChristmasMusic() {
  if (!christmasMusicEnabled || document.visibilityState === "hidden") return;

  const activeScreen = document.querySelector(".screen.active")?.id;
  if (activeScreen === "game") return;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    christmasAudioContext ||= new AudioContextClass();

    if (!christmasMusicGain) {
      christmasMusicGain = christmasAudioContext.createGain();
      christmasMusicGain.gain.value = 0;
      christmasMusicGain.connect(christmasAudioContext.destination);
    }

    const begin = () => {
      if (!christmasMusicEnabled || document.visibilityState === "hidden") return;
      if (document.querySelector(".screen.active")?.id === "game") return;

      applyChristmasMusicVolume();

      if (christmasMusicTimer) return;

      playChristmasMusicBeat();
      christmasMusicTimer = setInterval(playChristmasMusicBeat, 360);
    };

    if (christmasAudioContext.state === "suspended") {
      christmasAudioContext.resume().then(begin).catch(() => {});
    } else {
      begin();
    }
  } catch {}
}

function stopChristmasMusic() {
  if (christmasMusicTimer) {
    clearInterval(christmasMusicTimer);
    christmasMusicTimer = null;
  }

  if (christmasMusicGain && christmasAudioContext) {
    christmasMusicGain.gain.setTargetAtTime(
      0,
      christmasAudioContext.currentTime,
      0.08
    );
  }
}

function syncChristmasMusic(screenId) {
  const activeScreen = screenId || document.querySelector(".screen.active")?.id;

  if (
    christmasMusicEnabled &&
    activeScreen !== "game" &&
    document.visibilityState !== "hidden"
  ) {
    startChristmasMusic();
  } else {
    stopChristmasMusic();
  }
}

const christmasMusicToggle = $("christmas-music-toggle");
if (christmasMusicToggle) {
  updateChristmasMusicButton();

  christmasMusicToggle.addEventListener("click", () => {
    christmasMusicEnabled = !christmasMusicEnabled;
    store("cm_christmas_music", christmasMusicEnabled ? "on" : "off");
    updateChristmasMusicButton();
    syncChristmasMusic();
  });
}

const christmasVolumeSlider = $("christmas-music-volume");
if (christmasVolumeSlider) {
  christmasVolumeSlider.addEventListener("input", () => {
    christmasMusicVolume = Math.max(0, Math.min(100, Number(christmasVolumeSlider.value)));
    store("cm_christmas_music_volume", String(christmasMusicVolume));
    updateChristmasMusicButton();
    applyChristmasMusicVolume();
  });
}

document.addEventListener("visibilitychange", () => syncChristmasMusic());

/* ------------------------------------------------------------------ Raining Tacos event */
function setTacoEventActive(active) {
  window.__cmTacoEventActive = active === true;
  syncTacoRainVisibility();
}

function ensureTacoRainLayer() {
  let layer = document.getElementById("taco-rain-layer");
  if (layer) return layer;

  layer = document.createElement("div");
  layer.id = "taco-rain-layer";
  layer.setAttribute("aria-hidden", "true");

  for (let i = 0; i < 24; i++) {
    const taco = document.createElement("span");
    taco.className = "taco-rain-item";
    taco.textContent = "🌮";
    taco.style.left = `${(i * 37 + 11) % 100}%`;
    taco.style.animationDelay = `${(i % 8) * -0.8}s`;
    taco.style.animationDuration = `${5 + (i % 5)}s`;
    taco.style.fontSize = `${22 + (i % 4) * 7}px`;
    layer.appendChild(taco);
  }

  document.body.appendChild(layer);
  return layer;
}

function playTacoDropSound() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass || !window.__cmTacoAudioReady) return;
  try {
    const ctx = window.__cmTacoAudioContext || (window.__cmTacoAudioContext = new AudioContextClass());
    if (ctx.state !== "running") return;
    // Original cheerful taco-event jingle; not a commercial-song recording or recreation.
    const notes = [659.25, 783.99, 987.77, 783.99];
    const now = ctx.currentTime;
    notes.forEach((frequency, index) => {
      const start = now + index * 0.13;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.075, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.19);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  } catch {}
}

function syncTacoRainVisibility() {
  const home = document.getElementById("home");
  const onMainPage = !!home?.classList.contains("active");
  const visible = window.__cmTacoEventActive === true &&
    onMainPage &&
    document.visibilityState !== "hidden";

  const layer = ensureTacoRainLayer();
  layer.hidden = !visible;

  if (visible) {
    if (!window.__cmTacoSoundTimer) {
      playTacoDropSound();
      window.__cmTacoSoundTimer = setInterval(playTacoDropSound, 1450);
    }
  } else if (window.__cmTacoSoundTimer) {
    clearInterval(window.__cmTacoSoundTimer);
    window.__cmTacoSoundTimer = null;
  }
}

document.addEventListener("pointerdown", () => {
  window.__cmTacoAudioReady = true;
  if (window.__cmTacoEventActive) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      try {
        const ctx = window.__cmTacoAudioContext || (window.__cmTacoAudioContext = new AudioContextClass());
        ctx.resume().then(syncTacoRainVisibility).catch(() => {});
      } catch {}
    }
  }
}, { passive: true });

document.addEventListener("visibilitychange", syncTacoRainVisibility);

async function loadTacoEvent() {
  try {
    const data = await api("/api/event");
    setTacoEventActive(data.active);
    const status = document.getElementById("event-status");
    if (status) status.textContent = data.active
      ? "Raining Tacos is ACTIVE."
      : "No event is currently active.";
  } catch {
    const status = document.getElementById("event-status");
    if (status) status.textContent = "Could not load event status.";
  }
}

/* ------------------------------------------------------------------ generic UI */
function show(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
  document.body.classList.toggle("game-screen-active", id === "game");
  syncTacoRainVisibility();
  syncChristmasMusic(id);
  window.scrollTo(0, 0);
}
function toast(t) {
  const el = $("toast");
  el.textContent = t;
  el.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove("show"), 2800);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function tier(r) {
  return r < 600 ? "Beginner" : r < 800 ? "Bronze" : r < 1000 ? "Silver" : r < 1200 ? "Gold" : r < 1400 ? "Platinum" : r < 1600 ? "Diamond" : r < 2000 ? "Master" : "Grandmaster";
}
async function api(url, opts = {}) {
  const r = await fetch(BACKEND_URL + url, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}), ...(opts.headers || {}) }
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(d.error || "Request failed");
  return d;
}

async function adminApi(url, opts = {}) {
  const r = await fetch(BACKEND_URL + url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...(opts.headers || {})
    }
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(d.error || "Admin request failed");
  return d;
}

function showGlobalAnnouncement(data) {
  let el = $("global-announcement");
  if (!el) {
    el = document.createElement("div");
    el.id = "global-announcement";
    el.className = "global-announcement";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }

  clearTimeout(announcementTimer);
  el.replaceChildren();

  const name = document.createElement("strong");
  name.className = "ga-name";
  name.textContent = String(data.username || "Admin");
  el.appendChild(name);

  if (data.verified) {
    const check = document.createElement("span");
    check.className = "ga-check";
    check.textContent = " ☑";
    check.setAttribute("aria-label", "Verified");
    el.appendChild(check);
  }

  const role = document.createElement("span");
  const isOwner = String(data.role || "").toUpperCase() === "OWNER";
  role.className = "ga-role " + (isOwner ? "ga-owner" : "ga-admin");
  role.textContent = isOwner ? " 👑 OWNER" : " 🛡️ ADMIN";
  el.appendChild(role);

  const message = document.createElement("span");
  message.className = "ga-message";
  message.textContent = ": " + String(data.message || "");
  el.appendChild(message);

  el.hidden = false;
  announcementTimer = setTimeout(() => {
    el.hidden = true;
    el.replaceChildren();
  }, 7000);
}

async function loadAdminSettings() {
  if (!user?.isAdmin || !token) {
    adminAuthenticated = false;
    clearAdminCoach();
    throw new Error("Admin access required.");
  }

  const d = await adminApi("/api/admin/settings");
  alwaysShowBrilliantMove = !!d.alwaysShowBrilliantMove;
  adminAuthenticated = true;
}

async function loadPublicSettings() {
  try {
    const d = await api("/api/settings");
    alwaysShowBrilliantMove = !!d.alwaysShowBrilliantMove;
  } catch {}
}

function setUser(u) {
  user = u;
  adminAuthenticated = u?.isAdmin === true;
  $("user-rating").textContent = u ? `${u.rating} ELO` : "Guest";
  $("auth-open").textContent = u ? u.username : "Log in";
  $("rank-rating").textContent = u?.rating ?? "—";
  $("rank-tier").textContent = u ? tier(u.rating) : "—";

  const adminButton = $("admin-open");
  if (adminButton) adminButton.hidden = !adminAuthenticated;

  if (!adminAuthenticated) clearAdminCoach();
  const homeName = $("home-username"); if (homeName) homeName.textContent = u?.username || "Guest Player";
  if (token && socket.connected) socket.emit("authenticate", token);
  if (token) loadEconomy().catch(() => {});
  else { $("home-diamonds").textContent = "Log in for Diamonds"; $("home-avatar").textContent = "♞"; }
}

async function ensureSocketAuth() {
  if (!token) return false;
  if (typeof socket.once !== "function") return false;

  if (!socket.connected) {
    const connected = await new Promise(resolve => {
      let settled = false;
      const onConnect = () => finish(true);
      const timer = setTimeout(() => finish(false), 25000);

      function finish(value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.off("connect", onConnect);
        resolve(value);
      }

      socket.once("connect", onConnect);
    });

    if (!connected || !socket.connected) return false;
  }

  return await new Promise(resolve => {
    let settled = false;
    const timer = setTimeout(() => finish(false), 15000);

    function finish(value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    }

    socket.emit("authenticate", token, response => {
      finish(response?.ok === true);
    });
  });
}

async function refreshMe() {
  if (!token) return;
  try {
    const data = await api("/api/me");
    const account = data.user;
    setUser(account);
    toast(`Account: ${account?.username || "Unknown"} | Admin: ${account?.isAdmin === true ? "YES" : "NO"}`);
  } catch (error) {
    console.warn("[ChessMate /api/me diagnostic]", error.message);
    token = "";
    store("cm_token", null);
    setUser(null);
  }
}

/* ------------------------------------------------------------------ chess helpers */
function resultOf(ch) {
  if (ch.isCheckmate()) return { result: ch.turn() === "w" ? "black" : "white", reason: "checkmate" };
  if (ch.isStalemate()) return { result: "draw", reason: "stalemate" };
  if (ch.isInsufficientMaterial()) return { result: "draw", reason: "insufficient material" };
  if (ch.isThreefoldRepetition()) return { result: "draw", reason: "threefold repetition" };
  if (ch.isDraw()) return { result: "draw", reason: "50-move rule" };
  return null;
}
function terminalOf(fen) {
  const c = new Chess(fen);
  if (c.isCheckmate()) return { kind: "mate", winner: c.turn() === "w" ? "black" : "white" };
  if (c.isDraw()) return { kind: "draw" };
  return null;
}
const colorName = c => (c === "w" ? "white" : "black");
const tag = r => (r === "white" ? "1–0" : r === "black" ? "0–1" : "½–½");

/* ------------------------------------------------------------------ game state */
function fenAt(i) { return i === 0 ? G.startFen : G.plies[i - 1].fen; }
function viewChess() {
  if (G.view === G.plies.length) return G.live;
  if (!G.vc || G.vcView !== G.view) { G.vc = new Chess(fenAt(G.view)); G.vcView = G.view; }
  return G.vc;
}
function rebuildLive() {
  G.live = new Chess(G.startFen);
  for (const p of G.plies) G.live.move({ from: p.from, to: p.to, promotion: p.promotion || undefined });
  G.vc = null;
}

function newGame(mode, o = {}) {
  engine.cancelQueued();
  G = {
    id: ++gameSeq, mode,
    startFen: START, plies: [], view: 0, live: new Chess(),
    orient: o.orient || "w", myColor: o.myColor || null,
    level: o.level ?? 2, bot: o.bot || null, roomCode: o.roomCode || null,
    names: o.names, over: null, sel: null, promoPending: null, drag: null,
    premove: null, coachMessage: "I will review your moves as we play.", reviewOpen: false,
    aiBusy: false, lastEval: null, anim: null
  };
  $("game-title").textContent = MODE_TITLE[mode] || "Chess";
  $("resign").classList.toggle("hidden", !["ai", "friends", "ranked"].includes(mode));
  $("overlay").classList.add("hidden");
  $("promo").classList.add("hidden");
  show("game");
  setPlayers();
  render();
  setBar(null);
  ensureEngine();
  maybeAi();
  return G;
}

function ensureEngine() {
  engine.init()
    .then(() => { if (G) refreshEval(); })
    .catch(() => toast("Stockfish could not start here — you can still play, but analysis is unavailable."));
}

function setOpponentReaction(message, emotion = "neutral") {
  if (!G || G.mode !== "ai") return;
  const opponentColor = G.myColor === "w" ? "b" : "w";
  const el = document.querySelector(`.pl[data-color="${opponentColor}"]`);
  if (!el) return;
  const bubble = el.querySelector(".ai-opponent-speech");
  const face = el.querySelector(".ai-opponent-face");
  if (bubble) bubble.textContent = message;
  if (face) {
    face.dataset.emotion = emotion;
    face.classList.remove("react");
    void face.offsetWidth;
    face.classList.add("react");
  }
}

function aiReactionForPlayerMove(ply) {
  if (!G || G.mode !== "ai") return;

  const key = ply.cls?.key || "good";
  const dialogue = {
    stockfish: {
      brilliant: "An unexpected tactical idea. I must recalculate.",
      great: "A strong move. The position is getting interesting.",
      best: "A precise move. I will respond carefully.",
      excellent: "Well played. I see your plan.",
      good: "A reasonable move. Let me calculate.",
      inaccuracy: "That changes the evaluation slightly.",
      mistake: "That move gives me a possible advantage.",
      blunder: "A serious tactical opportunity has appeared."
    },
    fischer: {
      brilliant: "Excellent! You found an ambitious move.",
      great: "Very interesting. You are playing actively.",
      best: "A sound move. Let's continue.",
      excellent: "Good development. I respect that.",
      good: "A sensible decision.",
      inaccuracy: "You could have played more actively.",
      mistake: "I think you overlooked something.",
      blunder: "That is a costly mistake."
    },
    mittens: {
      brilliant: "Whoa! That was a clever move. Meow!",
      great: "Ooh, nice move! This is getting fun.",
      best: "Purrfectly played!",
      excellent: "Not bad at all!",
      good: "Okay! My turn!",
      inaccuracy: "Hmm... I think you had a better move.",
      mistake: "Oops! I noticed something.",
      blunder: "Meow! That looks like trouble."
    },
    master: {
      brilliant: "Remarkable. A very strong tactical idea.",
      great: "Impressive. You understand the position.",
      best: "Excellent positional judgment.",
      excellent: "A disciplined move.",
      good: "A practical choice.",
      inaccuracy: "Your move slightly weakens the position.",
      mistake: "You should reconsider that plan.",
      blunder: "That creates a major weakness."
    },
    club: {
      brilliant: "Wow! I did not see that coming.",
      great: "Nice one! You are putting up a fight.",
      best: "Good choice. Let's see what happens.",
      excellent: "Well played!",
      good: "Looks like a solid move.",
      inaccuracy: "Hmm, maybe there was a better option.",
      mistake: "I think you missed a threat.",
      blunder: "Oh, that could cost you."
    },
    beginner: {
      brilliant: "Wow! That was amazing!",
      great: "Great move! You're improving.",
      best: "Nice choice!",
      excellent: "Well done!",
      good: "Good move. My turn now.",
      inaccuracy: "Maybe another move was a little stronger.",
      mistake: "Careful! There may be a threat.",
      blunder: "Oh! That move may cause problems."
    }
  };

  const lines = dialogue[G.bot] || dialogue.club;
  const message = lines[key] || lines.good;
  const emotion = ["brilliant", "great", "best"].includes(key) ? "surprised" :
    ["mistake", "blunder"].includes(key) ? "smug" : "thinking";

  setOpponentReaction(message, emotion);
}

function aiReactionAfterOpponentMove(ply) {
  if (!G || G.mode !== "ai") return;

  const board = G.live;
  const lines = {
    stockfish: "Position updated. Your turn.",
    fischer: "Your move. Think carefully.",
    mittens: "Meow! Your turn now!",
    master: "The position is set. Your move.",
    club: "All right, let's see your reply!",
    beginner: "Your turn! What will you play?"
  };

  let message = lines[G.bot] || lines.club;
  let emotion = "thinking";

  if (board.isCheckmate()) {
    message = "Checkmate! That was a decisive game.";
    emotion = "surprised";
  } else if (board.isCheck()) {
    message = "Check! Your king is under attack.";
    emotion = "smug";
  } else if (ply.captured) {
    message = "I captured a piece. Your move!";
    emotion = "smug";
  } else if (ply.piece === "q") {
    message = "The queen is entering the battle.";
    emotion = "surprised";
  }

  setOpponentReaction(message, emotion);
}

function setPlayers() {
  const bottom = G.orient, top = bottom === "w" ? "b" : "w";
  const fill = (el, c) => {
    const n = G.names[c];
    el.dataset.color = c;
    if (G.mode === "ai" && c !== G.myColor) {
      const bot = BOT_PROFILES.find(x => x.id === G.bot) || BOT_PROFILES[4];
      el.classList.add("ai-opponent-card");
      el.innerHTML = `<img class="ai-opponent-face" data-emotion="neutral" src="./avatars/${bot.id}.svg" alt="${bot.name} avatar"><span class="ai-opponent-info"><span class="ai-opponent-name">${escapeHtml(bot.name)} <small>AI OPPONENT</small></span><span class="ai-opponent-speech">${escapeHtml(bot.voice)}</span><span class="pr">${escapeHtml(n.sub || "")}</span></span>`;
    } else {
      el.classList.remove("ai-opponent-card");
      const glyphs = {
        avatar_knight:"♞",
        avatar_crown:"♛",
        avatar_dragon:"🐉",
        avatar_phoenix:"🔥",
        avatar_tournament_laurel:"🏅"
      };
      const isMe = !!user?.username && n.name === user.username;
      const avatarKey = isMe ? (economyState?.avatar || "avatar_knight") : "avatar_knight";
      const avatarGlyph = glyphs[avatarKey] || "♞";

      el.innerHTML = `<span class="match-avatar">${avatarGlyph}</span><span class="match-player-info"><span class="pn"></span><span class="pr"></span></span>`;
      el.querySelector(".pn").textContent = n.name || "Player";
      el.querySelector(".pr").textContent = n.sub || "";
    }
  };
  fill($("pl-top"), top);
  fill($("pl-bot"), bottom);
}

function canMoveNow() {
  if (!G || G.over) return false;
  const live = G.view === G.plies.length;
  if (!live && G.mode !== "analysis") return false;
  if (["ai", "friends", "ranked"].includes(G.mode)) return viewChess().turn() === G.myColor;
  return true;
}

function canQueuePremove() {
  return !!G && ["ai", "friends", "ranked"].includes(G.mode) && !G.over &&
    G.view === G.plies.length && G.live.turn() !== G.myColor;
}

function queuePremove(from, to) {
  if (!canQueuePremove()) return false;
  const piece = G.live.get(from);
  if (!piece || piece.color !== G.myColor) return false;
  G.premove = { from, to };
  G.sel = null;
  G.coachMessage = `Premove queued: ${from} → ${to}. It will play if legal on your turn.`;
  render();
  renderCoach();
  return true;
}

function playQueuedPremove() {
  if (!G || !G.premove || !["ai", "friends", "ranked"].includes(G.mode) ||
      G.live.turn() !== G.myColor || G.over) return;
  const move = G.premove;
  G.premove = null;
  const legal = G.live.moves({ square: move.from, verbose: true }).find(m => m.to === move.to);
  if (!legal) {
    G.coachMessage = "Your premove was no longer legal, so it was cancelled.";
    renderCoach();
    toast("Premove cancelled: the move is no longer legal.");
    return;
  }
  applyMove({ from: move.from, to: move.to, promotion: legal.promotion || "q" }, { user: true });
}

// Plays a move on the board. o.user: made by the local player. o.remote: from the server/engine.
function applyMove(m, o = {}) {
  let atLive = G.view === G.plies.length;
  if (!atLive && o.user && G.mode === "analysis") {
    G.plies.length = G.view;       // branch from the position being viewed
    G.over = null;
    $("overlay").classList.add("hidden");
    rebuildLive();
    atLive = true;
  }
  let made;
  try { made = G.live.move({ from: m.from, to: m.to, promotion: m.promotion || undefined }); }
  catch { return null; }
  const ply = {
    san: made.san, uci: made.from + made.to + (made.promotion || ""),
    from: made.from, to: made.to, color: made.color, piece: made.piece,
    captured: made.captured || null, promotion: made.promotion || null,
    fen: G.live.fen(), cls: null, seen: false
  };
  G.plies.push(ply);
  G.sel = null; G.promoPending = null;
  if (o.user) G.premove = null;
  $("promo").classList.add("hidden");
  if (atLive) {
    G.view = G.plies.length;
    G.vc = null;
    G.anim = o.noAnim ? null : [{ from: made.from, to: made.to }];

    if (G.anim && made.flags) {
      const rank = made.color === "w" ? "1" : "8";
      if (made.flags.includes("k")) {
        G.anim.push({ from: "h" + rank, to: "f" + rank });
      } else if (made.flags.includes("q")) {
        G.anim.push({ from: "a" + rank, to: "d" + rank });
      }
    }
  }

  const end = resultOf(G.live);
  if (end && !G.over) {
    const online = G.roomCode && ["friends", "ranked"].includes(G.mode);
    G.over = { ...end, pendingServer: online };
    if (!online) showResultSoon();
  }

  if (o.user && G.roomCode && ["friends", "ranked"].includes(G.mode)) {
    socket.emit("room-move", { code: G.roomCode, move: { from: made.from, to: made.to, promotion: made.promotion } });
  }
  render();
  maybeAi();
  if (!o.skipAnalysis) analyzePly(G.plies.length - 1);
  if (!o.suppressPremove && ["ai", "friends", "ranked"].includes(G.mode) && G.live.turn() === G.myColor && G.premove) {
    queueMicrotask(playQueuedPremove);
  }
  return ply;
}

/* ------------------------------------------------------------------ AI coach */
function renderCoach() {
  const panel = $("coach-message");
  if (panel && G) panel.textContent = G.coachMessage || "Keep developing your pieces.";
}

function coachSpeak(message) {
  if (!G || G.mode !== "ai") return;
  G.coachMessage = message;
  renderCoach();
  setOpponentReaction(message, "talking");

  if (!aiSetup.voice || !("speechSynthesis" in window)) return;

  const styles = {
    stockfish: { pitch: 0.78, rate: 0.92, voice: 0 },
    fischer:   { pitch: 0.92, rate: 0.96, voice: 1 },
    mittens:   { pitch: 1.35, rate: 1.08, voice: 2 },
    master:    { pitch: 0.85, rate: 0.90, voice: 3 },
    club:      { pitch: 1.02, rate: 1.00, voice: 4 },
    beginner:  { pitch: 1.18, rate: 0.94, voice: 5 }
  };

  try {
    const style = styles[G.bot] || styles.club;
    const utterance = new SpeechSynthesisUtterance(message);
    const voices = window.speechSynthesis.getVoices()
      .filter(v => /^en(-|_)/i.test(v.lang));

    if (voices.length) {
      utterance.voice = voices[style.voice % voices.length];
    }

    utterance.lang = "en-US";
    utterance.rate = style.rate;
    utterance.pitch = style.pitch;

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch {}
}

function coachFeedback(ply) {
  if (!G || G.mode !== "ai" || ply.color !== G.myColor || !ply.cls) return;
  const messages = {
    brilliant: "Brilliant move! You found a strong tactical idea. Keep checking forcing moves.",
    great: "Great move. You found a very important move in this position.",
    best: "Best move. This is the engine's top choice.",
    excellent: "Excellent move. You kept the position under control.",
    good: "Good move. Look for ways to improve your piece activity.",
    inaccuracy: "That move is an inaccuracy. Compare it with the engine's suggested move.",
    mistake: "That is a mistake. Before moving, check your opponent's threats and loose pieces.",
    blunder: "That is a blunder. Pause and look for checks, captures, and threats before your next move."
  };
  G.coachMessage = messages[ply.cls.key] || "Let's review this position together.";
  renderCoach();
}

/* ------------------------------------------------------------------ engine analysis */
async function analyzePly(i) {
  const g = G, ply = g.plies[i];
  if (!ply || engine.state === "failed") return;
  const fenBefore = i === 0 ? g.startFen : g.plies[i - 1].fen;
  const term = terminalOf(ply.fen);
  try {
    const bp = engine.analyze(fenBefore);
    const ap = term ? Promise.resolve({ lines: [] }) : engine.analyze(ply.fen);
    const [before, after] = await Promise.all([bp, ap]);
    if (G !== g || g.plies[i] !== ply) return;
    const r = classifyMove({
      before, after, move: ply, fenBefore,
      prev: i > 0 ? g.plies[i - 1] : null,
      terminal: term ? term.kind : null
    });
    if (r) {
      ply.cls = r;
      if (!ply.seen && g.mode === "ai" && ply.color === g.myColor) {
        aiReactionForPlayerMove(ply);
      }
      ply.seen = true;
    }
  } catch { return; }
  if (G !== g) return;
  renderBadge();
  renderNotation();
  refreshEval();
}

function refreshEval() {
  if (!G) return;
  const fen = fenAt(G.view);
  const term = terminalOf(fen);
  if (term) {
    setBar(term.kind === "mate"
      ? { terminal: true, win: term.winner === "white" ? 100 : 0, text: term.winner === "white" ? "1–0" : "0–1", adv: term.winner === "white" ? "w" : "b" }
      : { terminal: true, win: 50, text: "½–½", adv: "0" });
    return;
  }
  const an = engine.peek(fen);
  if (an && an.lines.length) {
    G.lastEval = whiteScore(an);
    setBar(G.lastEval);
    return;
  }
  setBar(G.lastEval, { stale: true });
  if (engine.state === "failed") return;
  const g = G, v = G.view;
  engine.analyze(fen).then(() => { if (G === g && G.view === v) refreshEval(); }).catch(() => {});
}

function setBar(sc, o = {}) {
  if (!G) return;
  let win, text, adv;
  if (sc && sc.terminal) { win = sc.win; text = sc.text; adv = sc.adv; }
  else if (!sc) { win = 50; text = engine.state === "failed" ? "–" : "0.0"; adv = "0"; }
  else {
    win = whiteWinPct(sc);
    text = scoreText(sc);
    adv = sc.mate !== null ? (sc.mate > 0 ? "w" : "b") : sc.cp >= 5 ? "w" : sc.cp <= -5 ? "b" : "0";
  }
  const flip = G.orient === "b";
  $("eval").classList.toggle("flip", flip);
  $("eval-bar").classList.toggle("stale", !!o.stale);
  $("eval-fill").style.height = (sc && sc.terminal ? win : Math.max(2, Math.min(98, win))) + "%";
  const atBottom = adv === "0" ? true : (adv === "w") === (G.orient === "w");
  $("eval-bottom").innerHTML = atBottom ? `<span class="adv-${adv}">${text}</span>` : "";
  $("eval-top").innerHTML = atBottom ? "" : `<span class="adv-${adv}">${text}</span>`;
  const who = adv === "w" ? "White is better" : adv === "b" ? "Black is better" : "Equal position";
  $("eval").title = `${who} (${text})`;
  $("eval-bar").setAttribute("aria-label", `${who}, evaluation ${text}`);
}

/* ------------------------------------------------------------------ computer opponent */
function maybeAi() {
  if (!G || G.mode !== "ai" || G.over || G.aiBusy) return;
  if (G.live.turn() === G.myColor) return;
  const g = G, fen = G.live.fen();
  g.aiBusy = true;
  if (g.bot === "mittens") {
    g.coachMessage = "Mittens is thinking… watch out for a tricky reply.";
    renderCoach();
  }
  const think = engine.state === "failed" ? Promise.reject(new Error("no engine")) : engine.playMove(fen, g.level);
  const pause = new Promise(r => setTimeout(r, 1500));
  Promise.all([think, pause])
    .then(([uci]) => uci)
    .catch(() => {
      // Engine unavailable: fall back to a random legal move so the game can continue.
      const moves = new Chess(fen).moves({ verbose: true });
      const m = moves[Math.floor(Math.random() * moves.length)];
      return m ? m.from + m.to + (m.promotion || "") : null;
    })
    .then(uci => {
      if (G !== g || g.over || g.live.fen() !== fen || !uci) return;
      const aiPly = applyMove({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }, { remote: true });
      if (aiPly) aiReactionAfterOpponentMove(aiPly);
    })
    .finally(() => { if (G === g) g.aiBusy = false; });
}

/* ------------------------------------------------------------------ rendering */
function coordsOf(sq) {
  const f = FILES.indexOf(sq[0]), r = Number(sq[1]) - 1;
  return G.orient === "w" ? [f, 7 - r] : [7 - f, r];
}
function pieceSrc(p) { return `./pieces/${p.color}${p.type.toUpperCase()}.svg`; }


// Persistent board DOM: reuse the same 64 square elements between renders.
let boardSquareCache = null;
let boardSquareOrientation = null;
let boardSquareFx = null;

function render() {
  if (!G) return;

  const boardEl = $("board");
  if (!boardEl) return;

  boardEl.classList.remove(
    "theme-christmas", "theme-obsidian", "theme-aurora",
    "theme-rose", "theme-forest", "theme-sapphire"
  );

  const boardTheme = G.sharedBoardTheme || economyState.board || "classic";
  const fx = resolveFx(boardTheme);

  document.body.dataset.fx = fx || "";
  boardEl.classList.toggle("theme-sapphire", boardTheme === "board_sapphire");

  if (boardTheme === "classic" || boardTheme === "board_christmas") boardEl.classList.add("theme-christmas");
  if (boardTheme === "board_obsidian") boardEl.classList.add("theme-obsidian");
  if (boardTheme === "board_aurora") boardEl.classList.add("theme-aurora");
  if (boardTheme === "board_rose") boardEl.classList.add("theme-rose");
  if (boardTheme === "board_forest") boardEl.classList.add("theme-forest");

  const vc = viewChess();
  const pos = vc.board();
  const isCheckmate = vc.isCheckmate();
  const ply = G.view > 0 ? G.plies[G.view - 1] : null;
  const targets = new Map();

  if (G.sel && canMoveNow()) {
    for (const m of vc.moves({ square: G.sel, verbose: true })) {
      targets.set(m.to, !!m.captured);
    }
  }

  let kingSq = null;
  if (vc.inCheck()) {
    for (const row of pos) {
      for (const p of row) {
        if (p && p.type === "k" && p.color === vc.turn()) {
          kingSq = p.square;
        }
      }
    }
  }

  if (!boardSquareCache) boardSquareCache = new Map();

  const orderChanged =
    boardSquareOrientation !== G.orient ||
    boardSquareCache.size !== 64;

  const fxChanged = boardSquareFx !== fx;
  const frag = document.createDocumentFragment();

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const f = G.orient === "w" ? col : 7 - col;
      const r = G.orient === "w" ? 7 - row : row;
      const name = FILES[f] + (r + 1);
      const p = pos[7 - r][f];

      let sq = boardSquareCache.get(name);

      if (!sq) {
        sq = document.createElement("div");
        sq.dataset.sq = name;
        sq._cmPiece = null;
        sq._cmRing = null;

        boardSquareCache.set(name, sq);
      }

      sq.className = "sq " + ((f + r) % 2 === 0 ? "dark" : "light");

      // Slice premium board artwork by the actual visible screen coordinates.
      if (boardTheme === "board_rose" || boardTheme === "board_christmas") {
        sq.style.setProperty(
          "--board-slice-position",
          `${(col / 7) * 100}% ${(row / 7) * 100}%`
        );
      } else {
        sq.style.removeProperty("--board-slice-position");
      }

      // Rosewood: align the artwork texture to each actual board square.
      if (fx === "rosewood") {
        sq.style.setProperty(
          "--rose-slice-position",
          `${(col / 7) * 100}% ${(row / 7) * 100}%`
        );
      } else {
        sq.style.removeProperty("--rose-slice-position");
      }

      // Coordinates follow the current screen orientation.
      for (const [type, visible, value] of [
        ["r", col === 0, String(r + 1)],
        ["f", row === 7, FILES[f]]
      ]) {
        let coordinate = sq.querySelector(".crd." + type);

        if (visible) {
          if (!coordinate) {
            coordinate = document.createElement("span");
            coordinate.className = "crd " + type;
            sq.append(coordinate);
          }
          coordinate.textContent = value;
        } else if (coordinate) {
          coordinate.remove();
        }
      }
      sq.classList.toggle("last", !!ply && (ply.from === name || ply.to === name));
      sq.classList.toggle("sel", G.sel === name);
      sq.classList.toggle("check", kingSq === name);

      const matedKing =
        isCheckmate && p?.type === "k" && p.color === vc.turn();

      sq.classList.toggle("checkmate-king", !!matedKing);
      sq.classList.toggle("cap", targets.get(name) === true);
      sq.classList.toggle("dot", targets.has(name) && !targets.get(name));

      const needsRing = !!matedKing && fx === "sapphire";

      if (needsRing && !sq._cmRing) {
        sq._cmRing = kingRing(p.color, true);
        sq.insertBefore(sq._cmRing, sq.firstChild);
      } else if (!needsRing && sq._cmRing) {
        sq._cmRing.remove();
        sq._cmRing = null;
      }

      if (p) {
        const src = pieceSrc(p);
        const alt = (p.color === "w" ? "White " : "Black ") + PIECE_NAME[p.type];

        if (!sq._cmPiece) {
          const img = document.createElement("img");
          img.className = "piece";
          img.draggable = false;
          img.src = src;
          img.alt = alt;
          const coordinate = sq.querySelector(".crd");
          if (coordinate) sq.insertBefore(img, coordinate);
          else sq.append(img);
          sq._cmPiece = img;
        } else {
          if (sq._cmPiece.getAttribute("src") !== src) {
            sq._cmPiece.src = src;
          }
          if (sq._cmPiece.alt !== alt) sq._cmPiece.alt = alt;
        }
      } else if (sq._cmPiece) {
        sq._cmPiece.remove();
        sq._cmPiece = null;
      }

      if (orderChanged) frag.append(sq);
    }
  }

  // Reorder only when first initialized or the board orientation changes.
  // Keep the Admin Coach SVG overlay in place.
  if (orderChanged) {
    const arrow = boardEl.querySelector("#admin-coach-arrow");
    boardEl.insertBefore(frag, arrow);
    boardSquareOrientation = G.orient;
  }

  boardSquareFx = fx;

  if (G.anim) {
    const moves = Array.isArray(G.anim) ? G.anim : [G.anim];
    G.anim = null;

    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (!reduceMotion) {
      const squareSize = boardEl.clientWidth / 8;

      for (const move of moves) {
        const { from, to } = move;
        const img = boardEl.querySelector(`[data-sq="${to}"] .piece`);
        if (!img) continue;

        const [fc, fr] = coordsOf(from);
        const [tc, tr] = coordsOf(to);
        const dx = (fc - tc) * squareSize;
        const dy = (fr - tr) * squareSize;

        img.style.zIndex = "6";
        img.style.willChange = "transform";

        const animation = img.animate(
          [
            { transform: `translate3d(${dx}px, ${dy}px, 0)` },
            { transform: "translate3d(0, 0, 0)" }
          ],
          {
            duration: fx === "sapphire" ? 600 : mateFxKey() ? 450 : 300,
            easing: (fx === "sapphire" || mateFxKey())
              ? "cubic-bezier(.22,1,.36,1)"
              : "cubic-bezier(.16,1,.3,1)",
            fill: "both"
          }
        );

        animation.onfinish = () => {
          img.style.zIndex = "";
          img.style.willChange = "";
          animation.cancel();
        };
      }
    }
  }

  renderBadge();
  renderNotation();
  updateStatus();
  renderCoach();
  $("premove-cancel")?.classList.toggle("hidden", !G.premove);
}

// Classification badge: top-right corner of the piece that just moved, only once analysed.

function clearAdminCoach() {
  adminCoachRequest++;
  adminCoachPosition = "";
  $("admin-coach-hint")?.remove();
  $("admin-coach-arrow")?.remove();
}

async function renderAdminCoach() {
  const board = $("board");
  if (!board) return;

  let hint = $("admin-coach-hint");
  let svg = $("admin-coach-arrow");

  if (!adminAuthenticated || !user?.isAdmin || !G || !engine || engine.state === "failed") {
    clearAdminCoach();
    return;
  }

  const fen = fenAt(G.view);
  if (!fen || !G.myColor) {
    clearAdminCoach();
    return;
  }

  // Never reveal a recommended move for the opponent.
  const coachPosition = new Chess(fen);
  if (coachPosition.turn() !== G.myColor) {
    clearAdminCoach();
    return;
  }

  if (!hint) {
    hint = document.createElement("div");
    hint.id = "admin-coach-hint";
    hint.className = "admin-coach-hint";
    board.parentElement.appendChild(hint);
  }

  const positionKey = fen + "|" + G.view;
  if (positionKey === adminCoachPosition) return;
  adminCoachPosition = positionKey;
  const requestId = ++adminCoachRequest;

  hint.textContent = "BRILLIANT MOVE COACH · Analyzing candidate moves...";
  if (svg) {
    svg.remove();
    svg = null;
  }

  try {
    const analysis = await engine.analyze(fen, {
      depth: 12,
      multipv: 3,
      movetime: 1400
    });

    if (
      requestId !== adminCoachRequest ||
      !adminAuthenticated ||
      !user?.isAdmin ||
      !G ||
      fenAt(G.view) !== fen
    ) return;

    let brilliant = null;
    let great = null;
    let fallback = null;

    for (const line of analysis?.lines || []) {
      if (!line.move || line.move.length < 4) continue;

      const from = line.move.slice(0, 2);
      const to = line.move.slice(2, 4);
      const promotion = line.move.length > 4 ? line.move[4] : undefined;

      try {
        const position = new Chess(fen);
        const move = position.move({ from, to, promotion });
        if (!move) continue;

        const result = classifyMove({
          before: analysis,
          after: null,
          move,
          fenBefore: fen,
          prev: null,
          terminal: null
        });

        const candidate = { from, to, result };

        if (!fallback) fallback = candidate;
        if (result?.key === "great" && !great) great = candidate;

        if (result?.key === "brilliant") {
          brilliant = candidate;
          break;
        }
      } catch {}
    }

    const recommendation = brilliant || great || fallback;

    if (!recommendation) {
      hint.textContent = "MOVE COACH · No legal move available.";
      return;
    }

    const { from, to, result } = recommendation;
    const moveLabel = brilliant
      ? "BRILLIANT MOVE"
      : great
        ? "GREAT MOVE"
        : "BEST MOVE";

    hint.textContent = brilliant
      ? `${moveLabel} · ${from.toUpperCase()} → ${to.toUpperCase()} · SACRIFICE ${result.sac.toFixed(1)} PAWNS`
      : `${moveLabel} · ${from.toUpperCase()} → ${to.toUpperCase()}`;

    const a = board.querySelector(`[data-sq="${from}"]`);
    const b = board.querySelector(`[data-sq="${to}"]`);
    if (!a || !b) return;

    const br = board.getBoundingClientRect();
    const ar = a.getBoundingClientRect();
    const tr = b.getBoundingClientRect();

    svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = "admin-coach-arrow";
    svg.setAttribute("viewBox", `0 0 ${br.width} ${br.height}`);
    svg.setAttribute("preserveAspectRatio", "none");
    svg.classList.add("admin-coach-arrow");

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", "admin-coach-head");
    marker.setAttribute("markerWidth", "8");
    marker.setAttribute("markerHeight", "8");
    marker.setAttribute("refX", "6");
    marker.setAttribute("refY", "3");
    marker.setAttribute("orient", "auto");

    const tip = document.createElementNS("http://www.w3.org/2000/svg", "path");
    tip.setAttribute("d", "M0,0 L0,6 L6,3 z");
    tip.setAttribute("fill", "#20d878");
    marker.appendChild(tip);
    defs.appendChild(marker);
    svg.appendChild(defs);

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", ar.left + ar.width / 2 - br.left);
    line.setAttribute("y1", ar.top + ar.height / 2 - br.top);
    line.setAttribute("x2", tr.left + tr.width / 2 - br.left);
    line.setAttribute("y2", tr.top + tr.height / 2 - br.top);
    line.setAttribute("stroke", "#20d878");
    line.setAttribute("stroke-width", "7");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("marker-end", "url(#admin-coach-head)");
    svg.appendChild(line);
    board.appendChild(svg);
  } catch (e) {
    if (requestId === adminCoachRequest && hint) {
      hint.textContent = "BRILLIANT MOVE COACH · Analysis unavailable.";
    }
  }
}

function renderBadge() {
  renderAdminCoach();
  document.querySelectorAll("#board .badge").forEach(b => b.remove());
  if (!G || G.view === 0) return;
  const ply = G.plies[G.view - 1];
  if (!ply || !ply.cls) return;
  const sq = $("board").querySelector(`[data-sq="${ply.to}"]`);
  if (!sq) return;
  const c = CLASSES[ply.cls.key];
  const el = document.createElement("span");
  el.className = `badge k-${ply.cls.key}` + (ply.seen ? "" : " fresh");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", c.label);
  el.title = c.label;
  el.innerHTML = `<b>${c.glyph}</b><em>${c.label}</em>`;
  sq.append(el);
  ply.seen = true;
}

function renderNotation() {
  const el = $("notation");
  if (!G.plies.length) { el.innerHTML = '<span class="empty">Make a move to begin…</span>'; return; }
  let html = "";
  G.plies.forEach((p, i) => {
    if (i % 2 === 0) html += `<span class="no">${i / 2 + 1}.</span>`;
    const classification = p.cls && CLASSES[p.cls.key];
    const marker = classification
      ? `<span class="move-class mc-${escapeHtml(p.cls.key)}" aria-label="${escapeHtml(classification.label)}">${escapeHtml(classification.glyph)}</span>`
      : "";
    const title = classification ? `${p.san} — ${classification.label}` : p.san;
    html += `<button class="mv${G.view === i + 1 ? " cur" : ""}" data-ply="${i + 1}" title="${escapeHtml(title)}">${escapeHtml(p.san)}${marker}</button>`;
  });
  if (G.over && !G.over.pendingServer) html += `<span class="res-tag">${tag(G.over.result)}</span>`;
  el.innerHTML = html;
  const cur = el.querySelector(".cur");
  if (cur) el.scrollLeft = cur.offsetLeft - el.clientWidth / 2 + cur.offsetWidth / 2;
  else el.scrollLeft = el.scrollWidth;
}

function updateStatus() {
  const vc = viewChess();
  let txt;
  if (G.view !== G.plies.length) {
    txt = `Viewing move ${G.view} of ${G.plies.length}`;
  } else if (G.over && !G.over.pendingServer) {
    txt = G.over.result === "draw" ? `Draw · ${G.over.reason}` : `${G.over.result === "white" ? "White" : "Black"} wins · ${G.over.reason}`;
  } else {
    const t = vc.turn();
    txt = G.myColor ? (t === G.myColor ? "Your move" : "Opponent's move") : (t === "w" ? "White to move" : "Black to move");
    if (vc.inCheck() && !vc.isCheckmate()) txt += " · Check";
  }
  if (G.premove) txt += ` · Premove ${G.premove.from}→${G.premove.to} queued`;
  $("game-subtitle").textContent = txt;
  $("resign").classList.toggle("hidden", !["ai", "friends", "ranked"].includes(G.mode) || !!G.over);
  const turn = G.over ? null : vc.turn();
  for (const id of ["pl-top", "pl-bot"]) $(id).classList.toggle("turn", $(id).dataset.color === turn);
}

function gotoPly(n) {
  if (!G) return;
  n = Math.max(0, Math.min(G.plies.length, n));
  if (n === G.view) return;
  G.view = n; G.vc = null; G.sel = null; G.promoPending = null; G.anim = null;
  $("promo").classList.add("hidden");
  render();
  refreshEval();
}

/* ------------------------------------------------------------------ result overlay */
function playMateFx() {
  const g = G;
  if (!g?.over || g.over.reason !== "checkmate") return;
  const fx = document.body.dataset.fx;
  if (!fx) return;
  setTimeout(() => {
    if (G !== g || !g.over) return;
    const board = $("board");
    const king = board?.querySelector(".sq.checkmate-king");
    if (!board || !king) return;
    const sfx = mateFxKey();
    if (sfx) { playThemeMate(sfx); return; }
    checkmateBurst(board.parentElement, fx, king);
    if (fx === "sapphire") lightningStrike(king);
  }, 160);
}

function showResultSoon() {
  playMateFx();
  const g = G;
  const splash = g?.over?.reason === "checkmate" && !!mateFxKey();
  setTimeout(() => { if (G === g && G.over && G.mode !== "analysis") showResult(); }, splash ? MATE_SPLASH_MS - 150 : 900);
}
function showResult() {
  const g=G;
  if (!g || !g.over || g._resultSequenceStarted) return;
  g._resultSequenceStarted=true;
  const o=g.over;
  const title=o.result==="draw" ? "Draw" : G.myColor
    ? (o.result===colorName(G.myColor) ? "You won!" : "You lost")
    : (o.result==="white" ? "White wins" : "Black wins");
  const detail=o.reason.charAt(0).toUpperCase()+o.reason.slice(1);
  const reveal=()=>{
    if(G!==g) return;
    $("result-title").textContent=title;
    $("result-detail").textContent=detail;
    $("result-rating").textContent=o.ratingLine||"";
    $("overlay").classList.remove("hidden");
  };
  if(o.reason!=="checkmate"){ reveal(); return; }
  if(mateFxKey()){ reveal(); return; }   // themed finale already played

  const board=$("board");
  const king=board?.querySelector(".checkmate-king");
  if(!board || !king){ reveal(); return; }

  king.classList.add("cm-circle-active");
  setTimeout(()=>{
    if(G!==g) return;
    const bolt=document.createElement("span");
    bolt.className="cm-lightning";
    bolt.textContent="ϟ";
    king.append(bolt);
    setTimeout(()=>{
      if(G!==g) return;
      bolt.remove();
      const announcement=document.createElement("div");
      announcement.className="checkmate-announcement cm-final-announcement";
      announcement.textContent="CHECKMATE";
      board.append(announcement);
      setTimeout(()=>{
        announcement.remove();
        reveal();
      },900);
    },650);
  },750);
}

/* ------------------------------------------------------------------ board input */
function sqFromPoint(x, y) {
  const r = $("board").getBoundingClientRect();
  const fx = (x - r.left) / r.width, fy = (y - r.top) / r.height;
  if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) return null;
  const col = Math.floor(fx * 8), row = Math.floor(fy * 8);
  const f = G.orient === "w" ? col : 7 - col;
  const rk = G.orient === "w" ? 7 - row : row;
  return FILES[f] + (rk + 1);
}

function tryMove(from, to, o = {}) {
  if (!canMoveNow()) return queuePremove(from, to);
  const legal = viewChess().moves({ square: from, verbose: true }).filter(m => m.to === to);
  if (!legal.length) return false;
  if (legal.some(m => m.promotion)) {
    G.promoPending = { from, to };
    G.sel = from;
    render();
    renderPromo();
    return true;
  }
  applyMove({ from, to }, { user: true, noAnim: o.noAnim });
  return true;
}

function renderPromo() {
  const { to } = G.promoPending;
  const color = viewChess().turn();
  const el = $("promo");
  el.innerHTML = ["q", "r", "b", "n"].map(t =>
    `<button data-p="${t}" aria-label="Promote to ${PIECE_NAME[t]}"><img src="./pieces/${color}${t.toUpperCase()}.svg" alt=""></button>`).join("");
  const s = $("board").clientWidth / 8;
  const [c, r] = coordsOf(to);
  el.style.left = c * s + "px";
  el.style.top = (r === 0 ? 0 : (r - 3) * s) + "px";
  el.classList.remove("hidden");
}

function setupBoardInput() {
  const board = $("board");

  board.addEventListener("pointerdown", e => {
    if (!G || e.button > 0) return;
    if (G.promoPending) { G.promoPending = null; G.sel = null; $("promo").classList.add("hidden"); render(); return; }
    const sq = sqFromPoint(e.clientX, e.clientY);
    if (!sq) return;
    const vc = viewChess();
    const movable = canMoveNow();
    const premoving = canQueuePremove();

    // tap a selected destination to move now or queue a premove
    if ((movable || premoving) && G.sel && G.sel !== sq &&
        (movable
          ? vc.moves({ square: G.sel, verbose: true }).some(m => m.to === sq)
          : vc.get(sq)?.color !== G.myColor)) {
      if (!tryMove(G.sel, sq)) { G.sel = null; render(); }
      return;
    }
    const p = vc.get(sq);
    if ((movable && p && p.color === vc.turn()) ||
        (premoving && p && p.color === G.myColor)) {
      const wasSelected = G.sel === sq;
      G.sel = sq;
      G.drag = { from: sq, x: e.clientX, y: e.clientY, moved: false, id: e.pointerId, src: pieceSrc(p), wasSelected };
      render();
      try { board.setPointerCapture(e.pointerId); } catch {}
    } else {
      G.sel = null;
      render();
    }
  });

  board.addEventListener("pointermove", e => {
    const d = G && G.drag;
    if (!d || d.id !== e.pointerId) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) {
      d.moved = true;
      const g = document.createElement("img");
      g.className = "ghost-piece";
      g.src = d.src;
      const s = board.clientWidth / 8;
      g.style.width = g.style.height = s * 1.08 + "px";
      document.body.append(g);
      d.ghost = g;
      board.querySelector(`[data-sq="${d.from}"]`)?.classList.add("drag-src");
    }
    if (d.ghost) { d.ghost.style.left = e.clientX + "px"; d.ghost.style.top = e.clientY + "px"; }
  });

  const finish = (e, cancel) => {
    const d = G && G.drag;
    if (!d || d.id !== e.pointerId) return;
    G.drag = null;
    d.ghost?.remove();
    if (d.moved) {
      const to = cancel ? null : sqFromPoint(e.clientX, e.clientY);
      G.sel = null;
      if (!(to && to !== d.from && tryMove(d.from, to))) render();
    } else if (d.wasSelected) {
      G.sel = null; render();    // tapping the selected piece again deselects it
    }
  };
  board.addEventListener("pointerup", e => finish(e, false));
  board.addEventListener("pointercancel", e => finish(e, true));
  board.addEventListener("contextmenu", e => e.preventDefault());

  $("promo").addEventListener("click", e => {
    const b = e.target.closest("button[data-p]");
    if (!b || !G.promoPending) return;
    const { from, to } = G.promoPending;
    applyMove({ from, to, promotion: b.dataset.p }, { user: true });
  });

  $("notation").addEventListener("click", e => {
    const b = e.target.closest(".mv");
    if (b) gotoPly(Number(b.dataset.ply));
  });

  document.addEventListener("keydown", e => {
    if (!G || !$("game").classList.contains("active")) return;
    if (e.key === "ArrowLeft") { gotoPly(G.view - 1); e.preventDefault(); }
    else if (e.key === "ArrowRight") { gotoPly(G.view + 1); e.preventDefault(); }
    else if (e.key === "Home") { gotoPly(0); e.preventDefault(); }
    else if (e.key === "End") { gotoPly(G.plies.length); e.preventDefault(); }
  });
}

/* ------------------------------------------------------------------ navigation / menus */
function leaveGame() {
  if (G && G.roomCode && ["friends", "ranked"].includes(G.mode)) socket.emit("leave-room", G.roomCode);
  if (G) G.drag?.ghost?.remove();
  G = null;
  engine.cancelQueued();
}
function goHome() { leaveGame(); show("home"); }

function startLocal(mode) {
  newGame(mode, {
    orient: "w",
    names: { w: { name: mode === "analysis" ? "White" : "Player 1" }, b: { name: mode === "analysis" ? "Black" : "Player 2" } }
  });
}

function startAi() {
  const color = aiSetup.color === "r" ? (Math.random() < 0.5 ? "w" : "b") : aiSetup.color;
  const bot = BOT_PROFILES.find(x => x.id === aiSetup.bot) || BOT_PROFILES[4];
  aiSetup.level = bot.level;
  const me = { name: user?.username || "You", sub: user ? `${user.rating} ELO` : "Player" };
  const cpu = { name: bot.name, sub: `${bot.rating} challenge rating` };
  const game = newGame("ai", { orient: color, myColor: color, level: bot.level, bot: bot.id, names: color === "w" ? { w: me, b: cpu } : { w: cpu, b: me } });
}

function startOnline(kind, code, players, myName, boardTheme = null) {
  const me = players.find(p => p.username === myName);
  const color = me ? me.color[0] : "w";
  const names = {};
  for (const p of players) names[p.color[0]] = { name: p.username, sub: p.rating ? String(p.rating) : "" };
  names.w ??= { name: "White" }; names.b ??= { name: "Black" };
  const game = newGame(kind, { orient: color, myColor: color, roomCode: code, names });
  game.sharedBoardTheme = boardTheme || null;
  render();
  return game;
}

function replayMoves(moves) {
  moves.forEach((m, i) => applyMove(m, { remote: true, noAnim: true, suppressPremove: true, skipAnalysis: i < moves.length - 3 }));
}

function syncFromServer(d) {
  if (!G || G.roomCode !== d.code) return;
  const old = G.plies;
  G.plies = []; G.live = new Chess(); G.view = 0; G.vc = null; G.over = null; G.sel = null;
  replayMoves(d.moves || []);
  G.plies.forEach((p, i) => { if (old[i] && old[i].uci === p.uci && old[i].cls) { p.cls = old[i].cls; p.seen = true; } });
  render();
  refreshEval();
}



// ------------------------------------------------------------------ Diamonds, profile cosmetics, clans and tournament UI
let economyState = { diamonds:0, avatar:"avatar_knight", board:"classic", owned:[] };
const AVATAR_GLYPHS = { avatar_knight:"♞", avatar_crown:"♛", avatar_dragon:"🐉", avatar_phoenix:"🔥", avatar_tournament_laurel:"🏅" };
async function loadEconomy() {
  if (!token) return;
  const [wallet,catalog,ledger] = await Promise.all([api("/api/economy/me"),api("/api/economy/catalog"),api("/api/economy/ledger")]);
  economyState = {...wallet};
  const put = (id, value) => { const el = $(id); if (el) el.textContent = value; };
  const history = $("diamond-history");
  if (history) history.innerHTML=(Array.isArray(ledger.transactions) ? ledger.transactions : []).map(t=>`<div class="row-item"><b>${escapeHtml(t.reason)}</b><strong class="${t.amount>0?"positive":"negative"}">${t.amount>0?"+":""}${t.amount} 💎</strong><small>${new Date(t.created_at).toLocaleString()}</small></div>`).join("") || "No Diamond transactions yet.";
  put("home-diamonds", `${wallet.diamonds} Diamonds`);
  put("shop-balance", wallet.diamonds);
  put("home-avatar", AVATAR_GLYPHS[wallet.avatar] || "♞");
  put("profile-avatar", AVATAR_GLYPHS[wallet.avatar] || "♞");
  put("profile-name", user?.username || "Player");
  applyProfileFx(wallet.board);
  put("profile-stats", `${user?.rating ?? 800} ELO · ${user?.wins ?? 0} wins · ${wallet.diamonds} Diamonds`);
  renderCosmetics(catalog.cosmetics, wallet);
}
/* Profile animation that comes with each Exclusive Deals board. */
const PROFILE_FX = ["obsidian", "aurora", "forest", "sapphire", "rosewood", "christmas"];
function applyProfileFx(boardKey) {
  const fx = PROFILE_FX.includes(FX_BY_BOARD[boardKey]) ? FX_BY_BOARD[boardKey] : "";
  for (const el of [document.querySelector(".profile-card"), document.querySelector(".mini-profile")]) {
    if (!el) continue;
    el.dataset.pfx = fx;
    el.querySelector(":scope > .pf-fx")?.remove();
    if (!fx) continue;
    const layer = document.createElement("div");
    layer.className = "pf-fx"; layer.setAttribute("aria-hidden", "true");
    const n = el.classList.contains("profile-card") ? 14 : 6;
    for (let i = 0; i < n; i++) {
      const sp = document.createElement("i");
      sp.style.setProperty("--x", (Math.random() * 100).toFixed(0) + "%");
      sp.style.setProperty("--d", (Math.random() * 3).toFixed(2) + "s");
      sp.style.setProperty("--t", (2.8 + Math.random() * 2.4).toFixed(2) + "s");
      sp.style.setProperty("--s", (0.5 + Math.random() * 0.9).toFixed(2));
      layer.append(sp);
    }
    el.prepend(layer);
  }
}
function renderCosmetics(items, wallet) {
  items = Array.isArray(items) ? items : [];
  wallet = {...wallet, owned: Array.isArray(wallet?.owned) ? wallet.owned : []};
  const renderCard = item => {
    const adminFree = wallet.isAdmin === true && item.reward !== true && item.price >= 0;
    const owned = wallet.owned.includes(item.key) || item.price === 0;
    const equipped = wallet.avatar === item.key || wallet.board === item.key;
    const rewardLocked = item.reward === true && !owned;
    const art = item.image
      ? `<div class="cosmetic-art has-img ${item.type}"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" decoding="async"></div>`
      : `<div class="cosmetic-art ${item.type}">${item.type === "board" ? "▦" : (AVATAR_GLYPHS[item.key] || "♟")}</div>`;
    const feats = Array.isArray(item.features) && item.features.length
      ? `<ul class="cosmetic-feats">${item.features.map(f => `<li>${escapeHtml(f)}</li>`).join("")}</ul>` : "";
    return `<article class="cosmetic-card ${item.premium ? "premium" : ""} ${item.exclusive ? "exclusive fx-" + escapeHtml(FX_BY_BOARD[item.key] || "") : ""}">
      ${art}
      <div><span class="cosmetic-type">${item.reward ? "TOURNAMENT REWARD" : item.type === "board" ? "CHESS BOARD" : "PROFILE AVATAR"}${item.exclusive ? " · EXCLUSIVE DEAL" : item.premium ? " · EXCLUSIVE" : ""}</span>
      <h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p>${feats}</div>
      <button class="${owned || adminFree ? "ghost" : "primary"}" data-cosmetic="${item.key}" ${equipped || rewardLocked ? "disabled" : ""}>${equipped ? "Equipped" : owned ? "Equip" : adminFree ? "FREE · OWNER/ADMIN" : rewardLocked ? "Earn in Tournament" : `💎 ${item.price}`}</button>
    </article>`;
  };
  $("exclusive-grid").innerHTML=items.filter(item=>item.exclusive===true).map(renderCard).join("") || "No Exclusive Deals available.";
  $("cosmetic-grid").innerHTML=items.filter(item=>item.exclusive!==true).map(renderCard).join("") || "No cosmetics available.";
}
async function openShop() {
  if (!token) { toast("Log in to use the Diamond Shop."); authMode="login"; updateAuth(); show("auth"); return; }
  show("shop");
  try { await loadEconomy(); } catch(e) { $("cosmetic-grid").textContent=e.message; }
}
async function loadClan() {
  const info=$("clan-info"), profile=$("profile-clan");
  if (!token) { if(info) info.textContent="Log in to create or join a clan."; return; }
  const d=await api("/api/clans/me");
  if (!d.clan) {
    if(info) info.textContent="You are not in a clan yet. Create one or join with an invite code.";
    if(profile) profile.textContent="No clan yet.";
    return;
  }
  const c=d.clan;
  const members=Array.isArray(c.members)?c.members:[];
  const roster=members.map((m,i)=>`<div class="row-item"><span>${i+1}</span><b>${escapeHtml(m.username)}</b><strong>${m.rating} ELO</strong></div>`).join("");
  if(info) info.innerHTML=`<h3>${escapeHtml(c.name)}</h3><p>Invite code: <b>${escapeHtml(c.inviteCode)}</b> · ${members.length}/5 players</p><div class="clan-record"><b>${c.wins} Wins</b><b>${c.losses} Losses</b><b>${c.winRate}% Win Rate</b></div>${roster}`;
  if(profile) profile.innerHTML=`<b>${escapeHtml(c.name)}</b><p>${c.wins}W · ${c.losses}L · ${c.winRate}% Win Rate</p><p>Invite code: ${escapeHtml(c.inviteCode)}</p>${roster}`;
}
async function loadClanLeaderboard() {
  const list=$("clan-leaderboard");
  if(!list) return;
  try {
    const d=await api("/api/clans/leaderboard");
    list.innerHTML=(Array.isArray(d.clans)?d.clans:[]).map((c,i)=>`<div class="row-item"><b>#${i+1} ${escapeHtml(c.name)}</b><span>${c.wins}W · ${c.losses}L</span><strong>${c.win_rate}% WR</strong><small>${c.members} members</small></div>`).join("") || "No registered Clans yet.";
  } catch(e) { list.textContent=e.message; }
}
async function loadTournamentEntries() {
  try {
    const d=await api("/api/tournament/entries");
    const entries=d.entries.map(e=>`<div class="row-item"><b>${escapeHtml(e.name)}</b><span>${e.roster.length} players</span><small>${e.roster.map((p,i)=>`#${i+1} ${escapeHtml(p.username)} (${p.rating})`).join(" · ")}</small></div>`).join("") || "No clans registered yet.";
    $("tournament-count").textContent=`${d.registeredCount}/6`;
    $("tournament-entries").innerHTML=entries;
    if (!d.matches.length) { $("tournament-bracket").textContent=`${d.registeredCount}/6 Clans registered. The championship bracket is created when six Clans have registered.`; return; }
    const roundNames={1:"Opening Round",2:"Semi-Finals",3:"Championship"};
    $("tournament-bracket").innerHTML=d.matches.map(m=>`<article class="pairing-card"><b>${roundNames[m.round]} · Match ${m.matchNumber}</b><p>${escapeHtml(m.clanA||"TBD")} vs ${escapeHtml(m.clanB||"TBD")}</p>${m.boards.map(x=>`<small>Board ${x.rank}: ${escapeHtml(x.playerA)} (${x.eloA}) vs ${escapeHtml(x.playerB)} (${x.eloB})</small>`).join("")}${m.winner?`<strong>Winner: ${escapeHtml(m.winner)}</strong>`:m.clanA&&m.clanB?`<small>Awaiting match result</small>`:`<small>Waiting for previous round</small>`}${user?.isAdmin && m.status==="pending" && m.clanA && m.clanB?`<div class="admin-match-actions"><button class="small ghost" data-tourney-winner="${m.id}" data-winner-clan="${d.entries.find(x=>x.name===m.clanA)?.id||""}">${escapeHtml(m.clanA)} wins</button><button class="small ghost" data-tourney-winner="${m.id}" data-winner-clan="${d.entries.find(x=>x.name===m.clanB)?.id||""}">${escapeHtml(m.clanB)} wins</button></div>`:""}</article>`).join("")+(d.champion?`<h3>🏆 Champion: ${escapeHtml(d.champion)}</h3>`:"");
  } catch(e) { $("tournament-entries").textContent=e.message; }
}

/* ------------------------------------------------------------------ wire up UI */
function setupUI() {
  // hero decoration (SVG pieces, no Unicode glyphs)
  const hero = ["", "bK", "", "bR", "bP", "bP", "", "", "", "wN", "wQ", "", "wP", "wK", "", "wR"];
  $("hero-board").innerHTML = hero.map((p, i) =>
    `<div style="background:${((i % 4) + Math.floor(i / 4)) % 2 ? "var(--dark)" : "var(--light)"}">${p ? `<img src="./pieces/${p}.svg" alt="">` : ""}</div>`).join("");

  $("open-shop").onclick = openShop;
  $("open-profile").onclick = async () => { if (!token) { toast("Log in to view your profile."); authMode="login"; updateAuth(); show("auth"); return; } show("profile"); try { await loadEconomy(); await loadClan(); } catch(e) { toast(e.message); } };
  $("topup-10").onclick = async () => {
    if (!token) return toast("Log in first.");
    try { const d=await api("/api/economy/topup",{method:"POST",body:"{}"}); $("topup-note").textContent=`Request ${d.reference} created: ₱${d.php} for ${d.diamonds} Diamonds. Pending payment verification; balance is unchanged.`; }
    catch(e) { $("topup-note").textContent=e.message; }
  };
  const handleCosmeticClick = async e => {
    const b=e.target.closest("[data-cosmetic]"); if (!b) return;
    const key=b.dataset.cosmetic, owned=economyState.owned.includes(key) || key==="avatar_knight";
    try {
      const d=await api(owned?"/api/economy/equip":"/api/economy/purchase",{method:"POST",body:JSON.stringify({key})});
      economyState={...economyState,...d};
      await loadEconomy();
      toast(owned?"Cosmetic equipped!":"Cosmetic purchased and equipped!");
    } catch(err) { toast(err.message); }
  };
  $("cosmetic-grid").onclick = handleCosmeticClick;
  $("exclusive-grid").onclick = handleCosmeticClick;
  const clanCreateButton = $("clan-create");
  if (clanCreateButton) clanCreateButton.onclick = async () => { try { await api("/api/clans",{method:"POST",body:JSON.stringify({name:$("clan-name").value})}); await loadClan(); await loadClanLeaderboard(); toast("Clan created!"); } catch(e) { toast(e.message); } };
  const clanJoinButton = $("clan-join");
  if (clanJoinButton) clanJoinButton.onclick = async () => { try { await api("/api/clans/join",{method:"POST",body:JSON.stringify({code:$("clan-code").value})}); await loadClan(); await loadClanLeaderboard(); toast("Joined clan!"); } catch(e) { toast(e.message); } };
  const openClanButton = $("open-clan");
  if (openClanButton) openClanButton.onclick = async () => {
    show("clan");
    try { await loadClan(); await loadClanLeaderboard(); }
    catch(e) { $("clan-info").textContent = e.message; }
  };
  $("tournament-register").onclick = async () => { try { const d=await api("/api/tournament/register",{method:"POST",body:"{}"}); $("tournament-status").textContent=`${d.clan.name} registered (${d.registeredClans}/6). ${d.format}`; await loadTournamentEntries(); } catch(e) { $("tournament-status").textContent=e.message; } };
  $("tournament-bracket").onclick = async e => { const b=e.target.closest("[data-tourney-winner]"); if(!b)return; try { await api("/api/admin/tournament/result",{method:"POST",body:JSON.stringify({matchId:Number(b.dataset.tourneyWinner),winnerClanId:Number(b.dataset.winnerClan)})}); await loadTournamentEntries(); await loadClanLeaderboard(); toast("Tournament result saved."); } catch(err) { toast(err.message); } };

  document.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => {
    const m = b.dataset.mode;
    if (m === "friends") { if (!ONLINE_ENABLED) return toast("Online play needs a hosted ChessMate backend. Local games still work."); $("friends-status").textContent = ""; show("friends"); }
    else if (m === "ranked") { if (!ONLINE_ENABLED) return toast("Ranked play needs a hosted ChessMate backend."); show("ranked"); }
    else if (m === "clan") { show("clan"); if (token) loadClan().catch(()=>{}); loadClanLeaderboard(); }
    else if (m === "tournament") { show("tournament"); loadTournamentEntries(); }
    else if (m === "ai") show("ai-setup");
    else if (m === "leaderboard") { if (!ONLINE_ENABLED) return toast("Leaderboard needs a hosted ChessMate backend."); loadLeaderboard(); show("leaderboard"); }
    else if (m === "history") {
      if (!ONLINE_ENABLED) return toast("Match history needs a hosted ChessMate backend.");
      if (!token) { toast("Log in to see your match history."); authMode = "login"; updateAuth(); show("auth"); return; }
      loadHistory(); show("history");
    }
    else startLocal(m);
  });
  document.querySelectorAll(".back").forEach(b => b.onclick = () => {
    if (pendingRoom) { socket.emit("leave-room", pendingRoom); pendingRoom = null; $("room-code-box").classList.add("hidden"); }
    goHome();
  });
  $("brand").onclick = e => { e.preventDefault(); goHome(); };

  $("back-home").onclick = () => {
    const live = G && G.roomCode && !G.over && ["friends", "ranked"].includes(G.mode);
    if (live && !confirm(G.mode === "ranked" ? "Leave this ranked game? It counts as a resignation." : "Leave this game?")) return;
    goHome();
  };
  $("resign").onclick = () => {
    if (!G || G.over) return;
    if (!confirm("Resign this game?")) return;
    if (G.roomCode) socket.emit("resign", G.roomCode);
    else if (G.mode === "ai") {
      G.over = { result: G.myColor === "w" ? "black" : "white", reason: "resignation" };
      render(); showResult();
    }
  };
  $("result-review").onclick = () => {
    $("overlay").classList.add("hidden");
  };
  $("result-menu").onclick = goHome;
  $("premove-cancel").onclick = () => {
    if (G) { G.premove = null; G.coachMessage = "Premove cancelled."; render(); toast("Premove cancelled."); }
  };

  // Computer roster: local Stockfish-powered challenge profiles.
  $("bot-roster").innerHTML = BOT_PROFILES.map(bot =>
    `<button type="button" class="bot-card ${bot.id === aiSetup.bot ? "on" : ""}" data-bot="${bot.id}">
      <span class="bot-name">${escapeHtml(bot.name)}</span>
      <b>Challenge Elo ${escapeHtml(bot.rating)}</b>
      <small>${escapeHtml(bot.style)}</small>
    </button>`).join("");
  $("bot-roster").onclick = e => {
    const b = e.target.closest("[data-bot]"); if (!b) return;
    aiSetup.bot = b.dataset.bot;
    const bot = BOT_PROFILES.find(x => x.id === aiSetup.bot);
    aiSetup.level = bot.level;
    store("cm_bot", aiSetup.bot);
    store("cm_ailevel", String(aiSetup.level));
    [...$("bot-roster").children].forEach(x => x.classList.toggle("on", x === b));
  };
  $("ai-color").onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    aiSetup.color = b.dataset.v;
    [...$("ai-color").children].forEach(x => x.classList.toggle("on", x === b));
  };
  $("ai-start").onclick = startAi;

  async function loadAdminReleaseStatus() {
    const version = $("admin-release-version");
    const status = $("admin-release-status");
    const date = $("admin-release-date");
    const note = $("admin-release-note");
    const button = $("admin-refresh-release");

    if (button) button.disabled = true;
    if (note) note.textContent = "Checking published update configuration…";

    try {
      const response = await fetch("./update.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not load update configuration.");
      const config = await response.json();

      if (version) version.textContent = config.version || "Version not set";
      if (status) {
        status.textContent = config.enabled && config.scheduledAt
          ? "Scheduled"
          : "No scheduled update";
      }
      if (date) {
        date.textContent = config.enabled && config.scheduledAt
          ? `Scheduled release: ${config.date || new Date(config.scheduledAt).toLocaleString()}`
          : "No countdown is active. The Update Timer Banner remains available for future scheduled releases.";
      }
      if (note) {
        note.textContent = "This panel is a release monitor. New site versions are published through the project deployment workflow.";
      }
    } catch (error) {
      if (status) status.textContent = "Unavailable";
      if (date) date.textContent = "Update configuration could not be checked.";
      if (note) note.textContent = error.message;
    } finally {
      if (button) button.disabled = false;
    }
  }

  // Admin dashboard: only the verified CrisLorence account can open it.
  $("admin-open").onclick = async () => {
    if (!user?.isAdmin || !token) {
      $("admin-open").hidden = true;
      return toast("Admin access required.");
    }

    $("admin-error").textContent = "";
    $("admin-panel").hidden = true;
    show("admin");

    try {
      await loadAdminSettings();
      await loadTacoEvent();
      await loadAdminReleaseStatus();
      $("admin-panel").hidden = false;
      renderBadge();
    } catch (e) {
      adminAuthenticated = false;
      clearAdminCoach();
      $("admin-panel").hidden = true;
      $("admin-error").textContent = e.message;
    }
  };

  $("admin-refresh-release").onclick = loadAdminReleaseStatus;

  $("admin-send-announcement").onclick = async () => {
    const button = $("admin-send-announcement");
    const message = $("admin-announcement").value.trim();
    if (!message) return toast("Write an announcement first.");
    button.disabled = true;
    try {
      await adminApi("/api/admin/announcement", {
        method: "POST",
        body: JSON.stringify({ message })
      });
      $("admin-announcement").value = "";
      $("admin-status").textContent = "Announcement published.";
    } catch (e) {
      $("admin-status").textContent = e.message;
    } finally {
      button.disabled = false;
    }
  };

  // Admin event controls
  async function updateTacoEvent(active) {
    const start = $("admin-start-event");
    const end = $("admin-end-event");
    start.disabled = true;
    end.disabled = true;

    try {
      const result = await adminApi("/api/admin/event", {
        method: "POST",
        body: JSON.stringify({ active })
      });
      setTacoEventActive(result.active);
      $("event-status").textContent = result.active
        ? "Raining Tacos is ACTIVE."
        : "Raining Tacos has ENDED.";
      toast(result.active ? "Raining Tacos event started!" : "Raining Tacos event ended.");
    } catch (error) {
      $("event-status").textContent = error.message;
    } finally {
      start.disabled = false;
      end.disabled = false;
    }
  }

  $("admin-start-event").onclick = () => updateTacoEvent(true);
  $("admin-end-event").onclick = () => updateTacoEvent(false);

  // auth
  $("auth-open").onclick = () => {
    if (user) { if (confirm(`Log out of ${user.username}?`)) { token = ""; store("cm_token", null); setUser(null); toast("Logged out."); } return; }
    authMode = "login"; updateAuth(); show("auth");
  };
  $("auth-switch").onclick = () => { authMode = authMode === "login" ? "register" : "login"; updateAuth(); };
  $("auth-submit").onclick = async () => {
    try {
      const d = await api("/api/" + authMode, { method: "POST", body: JSON.stringify({ username: $("auth-user").value, password: $("auth-pass").value }) });
      token = d.token; store("cm_token", token); setUser(d.user);
      $("auth-error").textContent = ""; $("auth-pass").value = "";
      show("home");
    } catch (e) { $("auth-error").textContent = e.message; }
  };
  $("auth-pass").addEventListener("keydown", e => { if (e.key === "Enter") $("auth-submit").click(); });

  // friends
  $("create-room").onclick = async () => {
    if (!token) return toast("Log in first.");
    const button = $("create-room");
    button.disabled = true;
    $("friends-status").textContent = "Connecting securely…";
    const ready = await ensureSocketAuth();
    button.disabled = false;
    if (!ready) {
      $("friends-status").textContent = "Connection failed. Check your internet and log in again.";
      return;
    }
    $("friends-status").textContent = "Creating private room…";
    socket.emit("create-room");
  };

  $("join-room").onclick = async () => {
    if (!token) return toast("Log in first.");
    const code = $("join-code").value.trim().toUpperCase();
    if (!code) {
      $("friends-status").textContent = "Enter a room code first.";
      return;
    }
    const button = $("join-room");
    button.disabled = true;
    $("friends-status").textContent = "Connecting securely…";
    const ready = await ensureSocketAuth();
    button.disabled = false;
    if (!ready) {
      $("friends-status").textContent = "Connection failed. Check your internet and log in again.";
      return;
    }
    $("friends-status").textContent = "Joining room…";
    socket.emit("join-room", code);
  };

  $("copy-code").onclick = () => navigator.clipboard?.writeText($("room-code").textContent).then(() => toast("Room code copied."));

  // ranked
  $("find-match").onclick = async () => {
    if (!token) return toast("Log in to play ranked.");
    const button = $("find-match");
    button.disabled = true;
    $("rank-status").textContent = "Connecting securely…";
    const ready = await ensureSocketAuth();
    button.disabled = false;

    if (!ready) {
      $("rank-status").textContent = "Connection failed. Check your internet and log in again.";
      return;
    }

    $("rank-status").textContent = "Searching for an opponent…";
    button.classList.add("hidden");
    $("cancel-match").classList.remove("hidden");
    socket.emit("ranked-queue");
  };
  $("cancel-match").onclick = () => {
    socket.emit("cancel-queue");
    $("rank-status").textContent = "Search cancelled.";
    $("find-match").classList.remove("hidden"); $("cancel-match").classList.add("hidden");
  };

  setupBoardInput();
}

function updateAuth() {
  $("auth-title").textContent = authMode === "login" ? "Welcome back" : "Create your ChessMate account";
  $("auth-submit").textContent = authMode === "login" ? "Log in" : "Create account";
  $("auth-switch").textContent = authMode === "login" ? "Create an account" : "I already have an account";
}

async function loadLeaderboard() {
  try {
    const d = await api("/api/leaderboard");
    $("leader-list").innerHTML = d.players.map((p, i) =>
      `<div class="row-item"><span class="num">${i + 1}</span><div><b>${escapeHtml(p.username)}</b><small>${p.wins}W · ${p.losses}L · ${p.draws}D</small></div><b>${p.rating} ELO</b></div>`).join("") || "No players yet.";
  } catch (e) { $("leader-list").textContent = e.message; }
}

async function loadHistory() {
  try {
    const d = await api("/api/history");
    $("history-list").innerHTML = d.matches.map(m => {
      const white = m.white_id === user?.id;
      const opp = white ? m.black_name : m.white_name;
      const res = m.result === "draw" ? "d" : (m.result === "white") === white ? "w" : "l";
      const delta = white ? m.white_rating_change : m.black_rating_change;
      const when = new Date(String(m.created_at).replace(" ", "T") + "Z").toLocaleDateString();
      const dTxt = m.mode === "ranked" ? `<b class="delta ${delta > 0 ? "pos" : delta < 0 ? "neg" : ""}">${delta > 0 ? "+" : ""}${delta}</b>` : `<small>unranked</small>`;
      return `<div class="row-item"><span class="res ${res}">${res.toUpperCase()}</span><div><b>vs ${escapeHtml(opp || "Unknown")}</b><small>${escapeHtml(m.mode)} · ${white ? "White" : "Black"} · ${when}</small></div>${dTxt}</div>`;
    }).join("") || "No finished games yet.";
  } catch (e) { $("history-list").textContent = e.message; }
}

/* ------------------------------------------------------------------ sockets */
socket.on("connect", () => {
  if (token) socket.emit("authenticate", token);
});

socket.on("connect_error", () => {
  const screen = document.querySelector(".screen.active")?.id;
  if (screen === "ranked") $("rank-status").textContent = "Server connection failed. Please try again.";
  if (screen === "friends") $("friends-status").textContent = "Server connection failed. Please try again.";
});

socket.on("disconnect", () => {
  const screen = document.querySelector(".screen.active")?.id;
  if (screen === "ranked") {
    $("rank-status").textContent = "Disconnected. Reconnect and search again.";
    $("find-match").classList.remove("hidden");
    $("cancel-match").classList.add("hidden");
  }
  if (screen === "friends") $("friends-status").textContent = "Disconnected from server.";
});

socket.on("room-created", d => {
  pendingRoom = d.code;
  $("room-code").textContent = d.code;
  $("room-code-box").classList.remove("hidden");
  $("friends-status").textContent = "Waiting for your friend to join…";
});
socket.on("room-ready", d => {
  pendingRoom = null;
  $("room-code-box").classList.add("hidden");
  toast("Friend connected!");
  startOnline("friends", d.code, d.players, user?.username, d.boardTheme);
});
socket.on("ranked-matched", d => {
  $("find-match").classList.remove("hidden"); $("cancel-match").classList.add("hidden");
  $("rank-status").textContent = "";
  startOnline("ranked", d.code, d.players, user?.username, d.boardTheme);
  toast("Ranked opponent found!");
});
socket.on("room-resume", d => {
  if (!G || G.roomCode !== d.code) {
    startOnline(d.ranked ? "ranked" : "friends", d.code, d.players, user?.username, d.boardTheme);
    $("room-code-box").classList.add("hidden");
  }
  G.sharedBoardTheme = d.boardTheme || null;
  syncFromServer(d);
  render();
  toast("Reconnected to your game.");
});
socket.on("move-rejected", d => { syncFromServer(d); });
socket.on("opponent-move", m => {
  if (!G || !G.roomCode) return;
  applyMove(m, { remote: true });
});
socket.on("game-over", d => {
  if (!G || G.roomCode !== d.code) return;
  G.over = { result: d.result, reason: d.reason };
  if (d.ranked) {
    const mineColor = G.myColor === "w" ? "white" : "black";
    const mine = d[mineColor];
    const delta = d.changes[mineColor];
    G.over.ratingLine = `Rating ${mine.rating} (${delta > 0 ? "+" : ""}${delta})`;
    if (mine.username === user?.username) setUser(mine);
  }
  G.sel = null;
  render();
  showResultSoon();
});
socket.on("opponent-left", () => { if (G && G.roomCode && !G.over) toast("Your opponent disconnected or left."); });
socket.on("opponent-back", () => toast("Your opponent reconnected."));
socket.on("queue-status", t => { $("rank-status").textContent = t; });
socket.on("global-announcement", showGlobalAnnouncement);
socket.on("event-state", data => {
  if (data?.event === "raining-tacos") {
    setTacoEventActive(data.active === true);
  }
});
socket.on("app-settings", data => {
  alwaysShowBrilliantMove = !!data.alwaysShowBrilliantMove;
});
socket.on("notice", t => {
  toast(t);
  const screen = document.querySelector(".screen.active")?.id;
  if (screen === "friends") $("friends-status").textContent = t;
  if (screen === "ranked") $("rank-status").textContent = t;
});

/* ------------------------------------------------------------------ boot */
setupUI();
refreshMe();
loadPublicSettings();
loadTacoEvent();
