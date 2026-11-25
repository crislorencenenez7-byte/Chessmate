// Move classification from real Stockfish evaluations.
//
// Every move is judged by how much "expected score" (win probability) the mover gave up
// compared with the engine's best move in the same position:
//
//   Best        the engine's top move
//   Excellent   loses <= 2 win-% points
//   Good        loses <= 5
//   Inaccuracy  loses <= 10
//   Mistake     loses <= 20
//   Blunder     loses  > 20
//
// Two special labels sit on top of "Best/Excellent":
//   Great       the only move that holds or wins the position (the next-best move is >= 15
//               win-% points worse), excluding simple recaptures and already-decided positions
//   Brilliant   a sound move (<= 2 pts lost, not already crushing, not losing afterwards) that
//               gives up at least 2 points of material (e.g. a piece for a pawn) once the capture
//               sequence on the board has settled

import { Chess } from "../vendor/chess.js";

export const CLASSES = {
  brilliant:  { label: "Brilliant",  glyph: "!!" },
  great:      { label: "Great",      glyph: "!"  },
  best:       { label: "Best",       glyph: "★"  },
  excellent:  { label: "Excellent",  glyph: "✓"  },
  good:       { label: "Good",       glyph: "•"  },
  inaccuracy: { label: "Inaccuracy", glyph: "?!" },
  mistake:    { label: "Mistake",    glyph: "?"  },
  blunder:    { label: "Blunder",    glyph: "??" }
};

// Win probability (0-100) for the side to move, from a UCI score (Lichess logistic model).
export function winPct(line) {
  if (!line) return 50;
  if (line.mate !== null && line.mate !== undefined) return line.mate > 0 ? 100 : 0;
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * line.cp)) - 1);
}

// Score of an analysis from White's point of view: { cp, mate } (mate>0 => White mates).
export function whiteScore(an) {
  const l = an && an.lines && an.lines[0];
  if (!l) return null;
  const s = an.turn === "w" ? 1 : -1;
  return { cp: l.cp === null ? null : l.cp * s, mate: l.mate === null ? null : l.mate * s };
}

export function whiteWinPct(sc) {
  if (!sc) return 50;
  if (sc.mate !== null) return sc.mate > 0 ? 100 : 0;
  return winPct({ cp: sc.cp, mate: null });
}

export function scoreText(sc) {
  if (!sc) return "–";
  if (sc.mate !== null) return (sc.mate > 0 ? "+" : "−") + "M" + Math.abs(sc.mate);
  const v = sc.cp / 100;
  if (Math.abs(v) < 0.05) return "0.0";
  return (v > 0 ? "+" : "−") + Math.min(99.9, Math.abs(v)).toFixed(1);
}

// ---------- material / sacrifice detection ----------

const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function balance(ch, color) {
  let s = 0;
  for (const row of ch.board()) for (const p of row) {
    if (p) s += p.color === color ? VAL[p.type] : -VAL[p.type];
  }
  return s;
}

// Capture-only search on material; returns the balance for the side to move.
function qsearch(ch, alpha, beta, depth) {
  const stm = ch.turn();
  const inCheck = ch.inCheck();
  let best;
  if (!inCheck) {
    best = balance(ch, stm);
    if (best >= beta) return best;
    if (best > alpha) alpha = best;
  } else {
    best = -1000;
  }
  if (depth === 0) return inCheck ? balance(ch, stm) : best;
  let moves = ch.moves({ verbose: true });
  if (!inCheck) moves = moves.filter(m => m.captured || m.promotion);
  if (inCheck && !moves.length) return -1000; // checkmated
  moves.sort((a, b) => (VAL[b.captured] || 0) * 10 - VAL[b.piece] - ((VAL[a.captured] || 0) * 10 - VAL[a.piece]));
  for (const m of moves) {
    ch.move({ from: m.from, to: m.to, promotion: m.promotion });
    const score = -qsearch(ch, -beta, -alpha, depth - 1);
    ch.undo();
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

// Net material (in pawns) the mover gives up by playing `move`, after captures settle.
export function sacrificedMaterial(fenBefore, move) {
  const ch = new Chess(fenBefore);
  const mover = ch.turn();
  const before = balance(ch, mover);
  ch.move({ from: move.from, to: move.to, promotion: move.promotion });
  const after = -qsearch(ch, -1000, 1000, 6);
  return before - after;
}

// ---------- classification ----------

// ctx: { before, after, move:{from,to,promotion,captured}, fenBefore, prev, terminal }
//   before / after : engine analyses of the position before and after the move
//   prev           : the opponent's previous move ({to, captured}) or null
//   terminal       : "mate" | "draw" | null — the move ended the game
export function classifyMove(ctx) {
  const { before, after, move, fenBefore, prev, terminal } = ctx;
  const lines = before.lines;
  if (!lines.length) return null;
  const uci = move.from + move.to + (move.promotion || "");
  const best = lines[0];
  const w0 = winPct(best);

  let wm;
  let playedBest = best.move === uci;
  const inLines = lines.find(l => l.move === uci);
  if (terminal === "mate") wm = 100;
  else if (terminal === "draw") wm = 50;
  else if (inLines) wm = winPct(inLines);
  else if (after && after.lines.length) wm = 100 - winPct(after.lines[0]);
  else return null;

  let loss = Math.max(0, w0 - wm);
  if (loss <= 0.25) { loss = 0; playedBest = true; }

  const info = { loss, before: w0, after: wm };

  if (playedBest || loss <= 2) {
    // Brilliant: sound sacrifice
    if (loss <= 2 && w0 <= 92 && wm >= 45) {
      let sac = 0;
      try { sac = sacrificedMaterial(fenBefore, move); } catch {}
      if (sac >= 2) return { key: "brilliant", ...info, sac };
    }
    // Great: the only move
    if (playedBest && lines.length >= 2 && w0 < 97) {
      const gap = w0 - winPct(lines[1]);
      const recapture = prev && prev.captured && prev.to === move.to;
      if (gap >= 15 && !recapture) return { key: "great", ...info, gap };
    }
    return { key: playedBest ? "best" : "excellent", ...info };
  }
  if (loss <= 5)  return { key: "good", ...info };
  if (loss <= 10) return { key: "inaccuracy", ...info };
  if (loss <= 20) return { key: "mistake", ...info };
  return { key: "blunder", ...info };
}
