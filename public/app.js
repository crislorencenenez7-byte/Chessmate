import { Chess } from "./vendor/chess.js";
import { Engine, LEVELS } from "./js/engine.js";
import { CLASSES, classifyMove, whiteScore, whiteWinPct, scoreText } from "./js/classify.js";

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
let adminToken = store("cm_admin_token") || "";
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

/* ------------------------------------------------------------------ generic UI */
function show(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
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
      ...(adminToken ? { Authorization: "Bearer " + adminToken } : {}),
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
  name.textContent = String(data.username || "CrisLorence");
  el.appendChild(name);

  if (data.verified) {
    const check = document.createElement("span");
    check.className = "ga-check";
    check.textContent = " ☑";
    check.setAttribute("aria-label", "Verified");
    el.appendChild(check);
  }

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
  adminAuthenticated = false;
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
  $("user-rating").textContent = u ? `${u.rating} ELO` : "Guest";
  $("auth-open").textContent = u ? u.username : "Log in";
  $("rank-rating").textContent = u?.rating ?? "—";
  $("rank-tier").textContent = u ? tier(u.rating) : "—";
  if (token && socket.connected) socket.emit("authenticate", token);
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
  try { setUser((await api("/api/me")).user); }
  catch { token = ""; store("cm_token", null); setUser(null); }
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

function setPlayers() {
  const bottom = G.orient, top = bottom === "w" ? "b" : "w";
  const fill = (el, c) => {
    const n = G.names[c];
    el.querySelector(".disc").className = "disc " + c;
    el.querySelector(".pn").textContent = n.name;
    el.querySelector(".pr").textContent = n.sub || "";
    el.dataset.color = c;
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
  if (atLive) { G.view = G.plies.length; G.vc = null; G.anim = o.noAnim ? null : { from: made.from, to: made.to }; }

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
  if (!o.skipAnalysis) analyzePly(G.plies.length - 1);
  if (!o.suppressPremove && ["ai", "friends", "ranked"].includes(G.mode) && G.live.turn() === G.myColor && G.premove) {
    queueMicrotask(playQueuedPremove);
  }
  maybeAi();
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
  if (!aiSetup.voice || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 1;
    utterance.pitch = G.bot === "mittens" ? 1.15 : 1;
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
  coachSpeak(messages[ply.cls.key] || "Let's review this position together.");
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
      if (!ply.seen && g.mode === "ai" && ply.color === g.myColor) coachFeedback(ply);
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
  const pause = new Promise(r => setTimeout(r, 350));
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
      applyMove({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }, { remote: true });
    })
    .finally(() => { if (G === g) g.aiBusy = false; });
}

/* ------------------------------------------------------------------ rendering */
function coordsOf(sq) {
  const f = FILES.indexOf(sq[0]), r = Number(sq[1]) - 1;
  return G.orient === "w" ? [f, 7 - r] : [7 - f, r];
}
function pieceSrc(p) { return `./pieces/${p.color}${p.type.toUpperCase()}.svg`; }

function render() {
  if (!G) return;
  const boardEl = $("board");
  const vc = viewChess();
  const pos = vc.board();
  const ply = G.view > 0 ? G.plies[G.view - 1] : null;
  const targets = new Map();
  if (G.sel && canMoveNow()) for (const m of vc.moves({ square: G.sel, verbose: true })) targets.set(m.to, !!m.captured);
  let kingSq = null;
  if (vc.inCheck()) for (const row of pos) for (const p of row) if (p && p.type === "k" && p.color === vc.turn()) kingSq = p.square;

  const frag = document.createDocumentFragment();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const f = G.orient === "w" ? col : 7 - col;
      const r = G.orient === "w" ? 7 - row : row;
      const name = FILES[f] + (r + 1);
      const p = pos[7 - r][f];
      const sq = document.createElement("div");
      sq.className = "sq " + ((f + r) % 2 === 0 ? "dark" : "light");
      sq.dataset.sq = name;
      if (ply && (ply.from === name || ply.to === name)) sq.classList.add("last");
      if (G.sel === name) sq.classList.add("sel");
      if (kingSq === name) sq.classList.add("check");
      if (targets.has(name)) sq.classList.add(targets.get(name) ? "cap" : "dot");
      if (p) {
        const img = document.createElement("img");
        img.className = "piece";
        img.draggable = false;
        img.src = pieceSrc(p);
        img.alt = (p.color === "w" ? "White " : "Black ") + PIECE_NAME[p.type];
        sq.append(img);
      }
      if (col === 0) { const c = document.createElement("span"); c.className = "crd r"; c.textContent = r + 1; sq.append(c); }
      if (row === 7) { const c = document.createElement("span"); c.className = "crd f"; c.textContent = FILES[f]; sq.append(c); }
      frag.append(sq);
    }
  }
  boardEl.replaceChildren(frag);

  if (G.anim) {
    const { from, to } = G.anim;
    G.anim = null;
    const img = boardEl.querySelector(`[data-sq="${to}"] .piece`);
    if (img) {
      const [fc, fr] = coordsOf(from), [tc, tr] = coordsOf(to);
      const s = boardEl.clientWidth / 8;
      img.style.transform = `translate(${(fc - tc) * s}px,${(fr - tr) * s}px)`;
      img.style.zIndex = 6;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        img.style.transition = "transform .17s ease-out";
        img.style.transform = "";
      }));
    }
  }
  renderBadge();
  renderNotation();
  updateStatus();
  renderCoach();
  $("premove-cancel")?.classList.toggle("hidden", !G.premove);
}

// Classification badge: top-right corner of the piece that just moved, only once analysed.

function adminTokenIsUnexpired() {
  try {
    if (!adminToken) return false;
    const payload = JSON.parse(atob(
      adminToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
    ));
    return Number(payload.exp) * 1000 > Date.now();
  } catch {
    return false;
  }
}

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

  if (!adminAuthenticated || !adminTokenIsUnexpired() || !G || !engine || engine.state === "failed") {
    if (adminAuthenticated && !adminTokenIsUnexpired()) adminAuthenticated = false;
    clearAdminCoach();
    return;
  }

  const fen = fenAt(G.view);
  if (!fen) return;

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

  hint.textContent = "Admin Coach: Analyzing best move...";
  if (svg) svg.remove();

  try {
    const analysis = await engine.analyze(fen);
    if (requestId !== adminCoachRequest || !adminAuthenticated || !adminTokenIsUnexpired() || !G || fenAt(G.view) !== fen) return;

    const best = analysis?.lines?.[0]?.move;
    if (!best || best.length < 4) {
      hint.textContent = "Admin Coach: No move recommendation available.";
      return;
    }

    const from = best.slice(0, 2);
    const to = best.slice(2, 4);
    hint.textContent = `ADMIN COACH · BEST MOVE: ${from.toUpperCase()} → ${to.toUpperCase()}`;

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
      hint.textContent = "Admin Coach: Analysis unavailable.";
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
function showResultSoon() {
  const g = G;
  setTimeout(() => { if (G === g && G.over && G.mode !== "analysis") showResult(); }, 900);
}
function showResult() {
  const o = G.over;
  let title, detail = o.reason.charAt(0).toUpperCase() + o.reason.slice(1);
  if (G.myColor) {
    const mine = colorName(G.myColor);
    title = o.result === "draw" ? "Draw" : o.result === mine ? "You won!" : "You lost";
  } else {
    title = o.result === "draw" ? "Draw" : (o.result === "white" ? "White wins" : "Black wins");
  }
  $("result-title").textContent = title;
  $("result-detail").textContent = detail;
  $("result-rating").textContent = o.ratingLine || "";
  $("overlay").classList.remove("hidden");
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
      if (!(to && to !== d.from && tryMove(d.from, to, { noAnim: true }))) render();
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
  game.coachMessage = `${bot.name}: ${bot.voice}`;
  renderCoach();
  if (aiSetup.voice) coachSpeak(game.coachMessage);
}

function startOnline(kind, code, players, myName) {
  const me = players.find(p => p.username === myName);
  const color = me ? me.color[0] : "w";
  const names = {};
  for (const p of players) names[p.color[0]] = { name: p.username, sub: p.rating ? String(p.rating) : "" };
  names.w ??= { name: "White" }; names.b ??= { name: "Black" };
  return newGame(kind, { orient: color, myColor: color, roomCode: code, names });
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

function openGameReview() {
  if (!G) return;
  const list = $("review-list");
  list.innerHTML = G.plies.map((p, i) => {
    const label = p.cls ? CLASSES[p.cls.key]?.label || p.cls.key : "Not analyzed";
    const glyph = p.cls ? CLASSES[p.cls.key]?.glyph || "" : "";
    return `<div class="review-row"><span>${Math.floor(i / 2) + 1}${p.color === "w" ? "." : "..."}</span><b>${escapeHtml(p.san)}</b><strong>${escapeHtml(label)} ${escapeHtml(glyph)}</strong></div>`;
  }).join("") || "<p>No moves to review yet.</p>";
  $("review-panel").hidden = false;
  $("review-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeGameReview() {
  $("review-panel").hidden = true;
}

/* ------------------------------------------------------------------ wire up UI */
function setupUI() {
  // hero decoration (SVG pieces, no Unicode glyphs)
  const hero = ["", "bK", "", "bR", "bP", "bP", "", "", "", "wN", "wQ", "", "wP", "wK", "", "wR"];
  $("hero-board").innerHTML = hero.map((p, i) =>
    `<div style="background:${((i % 4) + Math.floor(i / 4)) % 2 ? "var(--dark)" : "var(--light)"}">${p ? `<img src="./pieces/${p}.svg" alt="">` : ""}</div>`).join("");

  document.querySelectorAll("[data-mode]").forEach(b => b.onclick = () => {
    const m = b.dataset.mode;
    if (m === "friends") { if (!ONLINE_ENABLED) return toast("Online play needs a hosted ChessMate backend. Local games still work."); $("friends-status").textContent = ""; show("friends"); }
    else if (m === "ranked") { if (!ONLINE_ENABLED) return toast("Ranked play needs a hosted ChessMate backend."); show("ranked"); }
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
    openGameReview();
  };
  $("result-menu").onclick = goHome;
  $("review-close").onclick = closeGameReview;
  $("review-open").onclick = openGameReview;
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
  $("coach-voice").checked = aiSetup.voice;
  $("coach-voice").onchange = () => {
    aiSetup.voice = $("coach-voice").checked;
    store("cm_coach_voice", aiSetup.voice ? "on" : "off");
    if (!aiSetup.voice && "speechSynthesis" in window) speechSynthesis.cancel();
  };
  $("ai-color").onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    aiSetup.color = b.dataset.v;
    [...$("ai-color").children].forEach(x => x.classList.toggle("on", x === b));
  };
  $("ai-start").onclick = startAi;

  // Admin dashboard
  $("admin-open").onclick = () => {
    $("admin-error").textContent = "";
    $("admin-login-panel").hidden = !!adminToken;
    $("admin-panel").hidden = true;
    $("admin-pass").value = "";
    show("admin");
    if (adminToken) {
      loadAdminSettings().then(() => {
        $("admin-login-panel").hidden = true;
        $("admin-panel").hidden = false;
        renderBadge();
      }).catch(e => {
        adminAuthenticated = false;
        adminToken = "";
        store("cm_admin_token", null);
        clearAdminCoach();
        $("admin-login-panel").hidden = false;
        $("admin-panel").hidden = true;
        $("admin-error").textContent = e.message;
      });
    } else {
      $("admin-login-panel").hidden = false;
    }
  };

  $("admin-login").onclick = async () => {
    try {
      const d = await adminApi("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({
          username: "Admin",
          password: $("admin-pass").value
        })
      });
      adminToken = d.token;
      store("cm_admin_token", adminToken);
      $("admin-pass").value = "";
      $("admin-error").textContent = "";
      $("admin-login-panel").hidden = true;
      $("admin-panel").hidden = false;
      await loadAdminSettings();
      renderBadge();
      toast("Admin login successful.");
    } catch (e) {
      adminAuthenticated = false;
      adminToken = "";
      store("cm_admin_token", null);
      clearAdminCoach();
      $("admin-panel").hidden = true;
      $("admin-login-panel").hidden = false;
      $("admin-error").textContent = e.message;
    }
  };

  $("admin-pass").addEventListener("keydown", e => {
    if (e.key === "Enter") $("admin-login").click();
  });

  $("admin-logout").onclick = () => {
    adminAuthenticated = false;
    adminToken = "";
    store("cm_admin_token", null);
    clearAdminCoach();
    $("admin-login-panel").hidden = false;
    $("admin-panel").hidden = true;
    $("admin-pass").value = "";
    toast("Admin logged out.");
  };

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
      show("home"); toast("Welcome, " + d.user.username);
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
  startOnline("friends", d.code, d.players, user?.username);
});
socket.on("ranked-matched", d => {
  $("find-match").classList.remove("hidden"); $("cancel-match").classList.add("hidden");
  $("rank-status").textContent = "";
  startOnline("ranked", d.code, d.players, user?.username);
  toast("Ranked opponent found!");
});
socket.on("room-resume", d => {
  if (!G || G.roomCode !== d.code) {
    startOnline(d.ranked ? "ranked" : "friends", d.code, d.players, user?.username);
    $("room-code-box").classList.add("hidden");
  }
  syncFromServer(d);
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
