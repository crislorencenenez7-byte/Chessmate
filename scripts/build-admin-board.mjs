// Generates the Admin Royal Chess Board artwork into public/themes/.
//   node scripts/build-admin-board.mjs
//
// Outputs (all share the same geometry helpers so the 8x8 squares line up exactly):
//   board-admin.svg         800x800 marble squares only (used as the #board background in play)
//   admin-frame.svg         ornate gold frame ring with a transparent centre (play frame)
//   admin-panel-left.svg    ornate left side panel  (shown beside the board on wide screens)
//   admin-panel-right.svg   ornate right side panel
//   admin-royal-board.svg   the complete design: frame, coordinates A-H / 1-8, panels, branding
//                           (shown in the Admin Dashboard preview)
// No dependencies. Marble veins use a seeded PRNG, so output is deterministic.

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "themes");
mkdirSync(OUT, { recursive: true });

const n = v => Math.round(v * 100) / 100;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------------------------------------------------------- shared defs */
function defs() {
  return `<defs>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#fff3bd"/><stop offset=".22" stop-color="#e0b04a"/>
    <stop offset=".5" stop-color="#8f5d13"/><stop offset=".72" stop-color="#f6da86"/>
    <stop offset="1" stop-color="#a8761c"/>
  </linearGradient>
  <linearGradient id="goldRev" x1="1" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffe9a0"/><stop offset=".35" stop-color="#c8922e"/>
    <stop offset=".62" stop-color="#7a4d0e"/><stop offset="1" stop-color="#f3d47c"/>
  </linearGradient>
  <linearGradient id="goldV" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff0b0"/><stop offset=".45" stop-color="#d6a23c"/>
    <stop offset="1" stop-color="#7d5110"/>
  </linearGradient>
  <radialGradient id="gem" cx=".35" cy=".3" r=".85">
    <stop offset="0" stop-color="#d8f0ff"/><stop offset=".32" stop-color="#4aa3ff"/>
    <stop offset=".72" stop-color="#1348b8"/><stop offset="1" stop-color="#071a52"/>
  </radialGradient>
  <radialGradient id="lightSq" cx=".4" cy=".35" r=".95">
    <stop offset="0" stop-color="#f6e6b0"/><stop offset=".6" stop-color="#e0c27a"/>
    <stop offset="1" stop-color="#c9a257"/>
  </radialGradient>
  <radialGradient id="darkSq" cx=".4" cy=".35" r=".95">
    <stop offset="0" stop-color="#26252a"/><stop offset=".6" stop-color="#121115"/>
    <stop offset="1" stop-color="#060507"/>
  </radialGradient>
  <radialGradient id="panelBg" cx=".5" cy=".3" r=".9">
    <stop offset="0" stop-color="#25221d"/><stop offset="1" stop-color="#070605"/>
  </radialGradient>
  <radialGradient id="stage" cx=".5" cy=".45" r=".75">
    <stop offset="0" stop-color="#1c1710"/><stop offset="1" stop-color="#040302"/>
  </radialGradient>
  <linearGradient id="lacquer" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#14110c"/><stop offset="1" stop-color="#050403"/>
  </linearGradient>
</defs>`;
}

/* ---------------------------------------------------------------- squares */
function squares() {
  const R = rng(20261128);
  let out = "";
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const light = (f + r) % 2 === 0;               // a8 (top-left) is light, a1 is dark
      const x = f * 100, y = r * 100;
      let veins = "";
      const count = 2 + Math.floor(R() * 2);
      for (let v = 0; v < count; v++) {
        const sx = R() * 100, sy = R() < 0.5 ? -5 : 105;
        const ex = R() * 100, ey = sy < 50 ? 105 : -5;
        const c1x = R() * 100, c1y = 20 + R() * 25, c2x = R() * 100, c2y = 55 + R() * 25;
        const w = n(0.5 + R() * 1.6);
        const col = light ? (R() < 0.5 ? "#8a5d16" : "#5a3d0a") : (R() < 0.7 ? "#e8c15a" : "#b88a2e");
        const op = light ? n(0.22 + R() * 0.3) : n(0.35 + R() * 0.45);
        veins += `<path d="M${n(sx)} ${sy}C${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(ex)} ${ey}" fill="none" stroke="${col}" stroke-width="${w}" stroke-opacity="${op}" stroke-linecap="round"/>`;
      }
      out += `<svg x="${x}" y="${y}" width="100" height="100" viewBox="0 0 100 100" overflow="hidden">` +
        `<rect width="100" height="100" fill="url(#${light ? "lightSq" : "darkSq"})"/>${veins}` +
        `<rect x=".5" y=".5" width="99" height="99" fill="none" stroke="${light ? "#fff6d0" : "#e8c15a"}" stroke-opacity="${light ? ".25" : ".12"}"/></svg>`;
    }
  }
  return `<g id="squares">${out}</g>`;
}

/* ---------------------------------------------------------------- ornaments */
const gemAt = (cx, cy, r, twinkle = true) =>
  `<g><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r + 1.6)}" fill="url(#goldRev)" stroke="#4a3208" stroke-width=".8"/>` +
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" fill="url(#gem)"/>` +
  `<ellipse cx="${n(cx - r * 0.3)}" cy="${n(cy - r * 0.38)}" rx="${n(r * 0.34)}" ry="${n(r * 0.2)}" fill="#fff" opacity=".8">` +
  (twinkle ? `<animate attributeName="opacity" values=".45;.95;.45" dur="${n(2.4 + (cx % 7) * 0.2)}s" repeatCount="indefinite"/>` : "") +
  `</ellipse></g>`;

function diamond(cx, cy, s, fill = "url(#gold)") {
  return `<path d="M${n(cx)} ${n(cy - s)}L${n(cx + s * 0.7)} ${n(cy)}L${n(cx)} ${n(cy + s)}L${n(cx - s * 0.7)} ${n(cy)}Z" fill="${fill}" stroke="#4a3208" stroke-width=".7"/>`;
}

function star(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
    pts.push(`${n(cx + Math.cos(a) * rr)},${n(cy + Math.sin(a) * rr)}`);
  }
  return `<polygon points="${pts.join(" ")}" fill="url(#gold)" stroke="#4a3208" stroke-width=".8"/>`;
}

function crown(cx, cy, s) {
  return `<g transform="translate(${n(cx)} ${n(cy)}) scale(${s})" stroke="#4a3208" stroke-width="1.2" stroke-linejoin="round">` +
    `<path d="M-40 22L-48 -18L-22 2L0 -32L22 2L48 -18L40 22Z" fill="url(#goldV)"/>` +
    `<rect x="-42" y="20" width="84" height="15" rx="4" fill="url(#gold)"/>` +
    `<circle cx="-48" cy="-22" r="6" fill="url(#gold)"/><circle cx="0" cy="-38" r="7.5" fill="url(#gold)"/><circle cx="48" cy="-22" r="6" fill="url(#gold)"/>` +
    `<circle cx="-22" cy="27.5" r="4.2" fill="url(#gem)"/><circle cx="0" cy="27.5" r="4.8" fill="url(#gem)"/><circle cx="22" cy="27.5" r="4.2" fill="url(#gem)"/>` +
    `<path d="M-16 8L0 -10L16 8" fill="none" stroke="#fff2b0" stroke-opacity=".55" stroke-width="1.4"/></g>`;
}

function kingPiece(cx, cy, s) {
  return `<g transform="translate(${n(cx)} ${n(cy)}) scale(${s})" stroke="#3a2606" stroke-width="1.6" stroke-linejoin="round" fill="url(#goldV)">` +
    `<rect x="-3.5" y="-58" width="7" height="22" rx="1.5"/><rect x="-11" y="-51" width="22" height="7" rx="1.5"/>` +
    `<path d="M-19 -32Q0 -44 19 -32L15 -8Q0 -2 -15 -8Z"/>` +
    `<path d="M-15 -8Q-25 20 -30 42L30 42Q25 20 15 -8Z"/>` +
    `<rect x="-36" y="42" width="72" height="12" rx="5"/><rect x="-30" y="54" width="60" height="8" rx="4"/></g>`;
}

function queenPiece(cx, cy, s) {
  let balls = "";
  for (let i = 0; i < 5; i++) balls += `<circle cx="${-24 + i * 12}" cy="${i % 2 ? -44 : -50}" r="5"/>`;
  return `<g transform="translate(${n(cx)} ${n(cy)}) scale(${s})" stroke="#3a2606" stroke-width="1.6" stroke-linejoin="round" fill="url(#goldV)">` +
    balls + `<path d="M-26 -42L-18 -24L-10 -40L0 -22L10 -40L18 -24L26 -42L22 -6Q0 2 -22 -6Z"/>` +
    `<path d="M-22 -6Q-30 22 -32 42L32 42Q30 22 22 -6Z"/>` +
    `<rect x="-38" y="42" width="76" height="12" rx="5"/><rect x="-32" y="54" width="64" height="8" rx="4"/></g>`;
}

function rookPiece(cx, cy, s) {
  return `<g transform="translate(${n(cx)} ${n(cy)}) scale(${s})" stroke="#3a2606" stroke-width="1.6" stroke-linejoin="round" fill="url(#goldV)">` +
    `<path d="M-26 -46h12v10h8v-10h12v10h8v-10h12v26l-8 8v38h-36v-38l-8 -8z"/>` +
    `<rect x="-36" y="40" width="72" height="12" rx="5"/><rect x="-30" y="52" width="60" height="8" rx="4"/></g>`;
}

const EMBLEMS = { king: kingPiece, queen: queenPiece, rook: rookPiece };

function laurel(cx, cy, r) {
  let out = "";
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const a = 0.45 + i * 0.3;                       // sweep around the lower half of the ring
      const x = cx + side * Math.sin(a) * r, y = cy + Math.cos(a) * r;
      out += `<ellipse cx="${n(x)}" cy="${n(y)}" rx="7" ry="3.2" transform="rotate(${n(side * (a * 57.3 - 90) * -1)} ${n(x)} ${n(y)})" fill="url(#gold)" stroke="#4a3208" stroke-width=".5" opacity=".95"/>`;
    }
  }
  return out;
}

/* A rounded rectangle with a square hole cut out (so the frame never covers the board). */
function ring(ox, oy, ow, oh, rad, ix, iy, iw, ih, attrs) {
  const o = `M${n(ox + rad)} ${n(oy)}H${n(ox + ow - rad)}A${n(rad)} ${n(rad)} 0 0 1 ${n(ox + ow)} ${n(oy + rad)}V${n(oy + oh - rad)}` +
    `A${n(rad)} ${n(rad)} 0 0 1 ${n(ox + ow - rad)} ${n(oy + oh)}H${n(ox + rad)}A${n(rad)} ${n(rad)} 0 0 1 ${n(ox)} ${n(oy + oh - rad)}` +
    `V${n(oy + rad)}A${n(rad)} ${n(rad)} 0 0 1 ${n(ox + rad)} ${n(oy)}Z`;
  const i = `M${n(ix)} ${n(iy)}h${n(iw)}v${n(ih)}h${n(-iw)}Z`;
  return `<path d="${o}${i}" fill-rule="evenodd" ${attrs}/>`;
}

/* ---------------------------------------------------------------- frame */
// hole = board size, T = frame thickness. Returns SVG for a ring centred on the board hole at (hx, hy).
function frame(hx, hy, hole, T, { coords = false, crownTop = true, idSuffix = "" } = {}) {
  const x0 = hx - T, y0 = hy - T, S = hole + 2 * T;
  const rim = Math.max(4, T * 0.1);
  let g = "";
  // outer body
  g += ring(x0, y0, S, S, T * 0.22, hx, hy, hole, hole, `fill="url(#gold)" stroke="#3b2705" stroke-width="${n(rim * 0.4)}"`);
  g += ring(x0 + rim, y0 + rim, S - 2 * rim, S - 2 * rim, T * 0.17, hx, hy, hole, hole, `fill="url(#goldRev)" stroke="#fff0b0" stroke-opacity=".5" stroke-width=".8"`);
  // engraved dotted track
  const tr = rim * 2.2;
  g += `<rect x="${n(x0 + tr)}" y="${n(y0 + tr)}" width="${n(S - 2 * tr)}" height="${n(S - 2 * tr)}" rx="${n(T * 0.12)}" fill="none" stroke="#fff3c0" stroke-opacity=".75" stroke-width="${n(Math.max(1, T * 0.025))}" stroke-dasharray="${n(T * 0.03)} ${n(T * 0.1)}" stroke-linecap="round"/>`;
  if (coords) {
    const strip = T * 0.56;                      // black lacquer coordinate strip next to the board
    const lip = T * 0.07;
    g += ring(hx - strip - lip, hy - strip - lip, hole + 2 * (strip + lip), hole + 2 * (strip + lip), T * 0.1, hx, hy, hole, hole, `fill="url(#gold)" stroke="#3b2705" stroke-width=".8"`);
    g += ring(hx - strip, hy - strip, hole + 2 * strip, hole + 2 * strip, T * 0.07, hx, hy, hole, hole, `fill="url(#lacquer)"`);
    const sq = hole / 8, fs = T * 0.36;
    const letters = "ABCDEFGH";
    for (let i = 0; i < 8; i++) {
      const cx = hx + sq * (i + 0.5);
      g += `<text x="${n(cx)}" y="${n(hy - strip / 2 + fs * 0.35)}" text-anchor="middle" font-size="${n(fs)}" fill="url(#goldV)">${letters[i]}</text>`;
      g += `<text x="${n(cx)}" y="${n(hy + hole + strip / 2 + fs * 0.35)}" text-anchor="middle" font-size="${n(fs)}" fill="url(#goldV)">${letters[i]}</text>`;
      const cy = hy + sq * (i + 0.5);
      g += `<text x="${n(hx - strip / 2)}" y="${n(cy + fs * 0.35)}" text-anchor="middle" font-size="${n(fs)}" fill="url(#goldV)">${8 - i}</text>`;
      g += `<text x="${n(hx + hole + strip / 2)}" y="${n(cy + fs * 0.35)}" text-anchor="middle" font-size="${n(fs)}" fill="url(#goldV)">${8 - i}</text>`;
    }
  } else {
    g += `<rect x="${n(hx - T * 0.1)}" y="${n(hy - T * 0.1)}" width="${n(hole + T * 0.2)}" height="${n(hole + T * 0.2)}" rx="${n(T * 0.06)}" fill="none" stroke="#2b1c04" stroke-width="${n(T * 0.1)}" opacity=".9"/>`;
    g += `<rect x="${n(hx - T * 0.03)}" y="${n(hy - T * 0.03)}" width="${n(hole + T * 0.06)}" height="${n(hole + T * 0.06)}" fill="none" stroke="#f6da86" stroke-width="${n(T * 0.04)}"/>`;
  }
  // vertices: ornate corner bosses + mid-edge diamonds
  const cr = T * (coords ? 0.46 : 0.42);
  const corners = [[x0 + T / 2, y0 + T / 2], [x0 + S - T / 2, y0 + T / 2], [x0 + T / 2, y0 + S - T / 2], [x0 + S - T / 2, y0 + S - T / 2]];
  for (const [cx, cy] of corners) {
    g += star(cx, cy, cr * 1.28) + gemAt(cx, cy, cr * 0.5);
  }
  const mid = hx + hole / 2, off = T / 2;
  for (const [cx, cy] of [[mid, y0 + off], [mid, y0 + S - off], [x0 + off, hy + hole / 2], [x0 + S - off, hy + hole / 2]]) {
    g += diamond(cx, cy, T * 0.28) + `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(T * 0.09)}" fill="url(#gem)"/>`;
  }
  if (crownTop) g += crown(mid, y0 + T * 0.34, T * 0.0085 * (coords ? 1.5 : 1.55) * (T < 50 ? 0.9 : 1));
  return `<g id="frame${idSuffix}">${g}</g>`;
}

/* ---------------------------------------------------------------- side panels */
function panel(side) {
  const W = 230, H = 768, R = rng(side === "left" ? 77 : 99);
  const emb1 = side === "left" ? "king" : "queen", emb2 = side === "left" ? "rook" : "king";
  let veins = "";
  for (let i = 0; i < 22; i++) {
    const x1 = R() * W, x2 = R() * W;
    veins += `<path d="M${n(x1)} -5C${n(R() * W)} ${n(R() * H * 0.4)} ${n(R() * W)} ${n(H * 0.5 + R() * H * 0.4)} ${n(x2)} ${H + 5}" fill="none" stroke="#e8c15a" stroke-opacity="${n(0.08 + R() * 0.2)}" stroke-width="${n(0.5 + R() * 1.4)}"/>`;
  }
  const medallion = (cy, emblem, r) =>
    `<circle cx="115" cy="${cy}" r="${r + 10}" fill="url(#gold)" stroke="#3b2705" stroke-width="1.5"/>` +
    `<circle cx="115" cy="${cy}" r="${r + 3}" fill="url(#lacquer)" stroke="#f3d47c" stroke-width="1.2"/>` +
    `<circle cx="115" cy="${cy}" r="${r - 6}" fill="none" stroke="#f3d47c" stroke-opacity=".5" stroke-width="1" stroke-dasharray="2 5"/>` +
    laurel(115, cy, r - 2) + EMBLEMS[emblem](115, cy + 2, r / 62) +
    [0, 90, 180, 270].map(a => gemAt(115 + Math.cos((a * Math.PI) / 180) * (r + 10), cy + Math.sin((a * Math.PI) / 180) * (r + 10), 6)).join("");
  const chain = y => {
    let c = `<path d="M24 ${y}H206" stroke="url(#gold)" stroke-width="3"/>`;
    for (let i = 0; i < 5; i++) c += diamond(40 + i * 37.5, y, 9);
    return c + gemAt(115, y, 8);
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">${defs()}
  <g font-family="Georgia,'Times New Roman',serif" font-weight="700">
  <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="22" fill="url(#gold)" stroke="#3b2705" stroke-width="2"/>
  <rect x="12" y="12" width="${W - 24}" height="${H - 24}" rx="16" fill="url(#goldRev)"/>
  <svg x="20" y="20" width="${W - 40}" height="${H - 40}" viewBox="20 20 ${W - 40} ${H - 40}" overflow="hidden">
    <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="12" fill="url(#panelBg)"/>${veins}</svg>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="12" fill="none" stroke="#f6da86" stroke-width="1.5"/>
  <rect x="26" y="26" width="${W - 52}" height="${H - 52}" rx="9" fill="none" stroke="#fff3c0" stroke-opacity=".6" stroke-dasharray="2 6" stroke-linecap="round"/>
  ${crown(115, 92, 1.25)}
  ${chain(158)}
  ${medallion(262, emb1, 62)}
  <text x="115" y="378" text-anchor="middle" font-size="22" letter-spacing="5" fill="url(#goldV)">ROYAL</text>
  ${chain(398)}
  ${[0, 1, 2].map(i => diamond(115, 438 + i * 44, 14) + gemAt(115, 438 + i * 44, 6)).join("")}
  ${chain(574)}
  ${medallion(662, emb2, 52)}
  ${star(36, 736, 12)}${star(194, 736, 12)}${gemAt(115, 736, 9)}
  </g></svg>`;
}

/* ---------------------------------------------------------------- files */
const standalone = (vb, inner, extra = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}"${extra}>${defs()}${inner}</svg>\n`;

// 1. squares only
writeFileSync(join(OUT, "board-admin.svg"),
  standalone("0 0 800 800", squares(), ` shape-rendering="geometricPrecision"`));

// 2. play frame (hole 640, thickness 40) -> viewBox 720x720, hole starts at 40
writeFileSync(join(OUT, "admin-frame.svg"),
  standalone("0 0 720 720", frame(40, 40, 640, 40, { coords: false, crownTop: false, idSuffix: "-play" })));

// 3. side panels
writeFileSync(join(OUT, "admin-panel-left.svg"), panel("left") + "\n");
writeFileSync(join(OUT, "admin-panel-right.svg"), panel("right") + "\n");

// 4. full showcase
{
  const W = 1300, H = 920, T = 64, hole = 640, hx = (W - hole) / 2, hy = 140;
  const lp = panel("left").replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<defs>[\s\S]*?<\/defs>/, "");
  const rp = panel("right").replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/<defs>[\s\S]*?<\/defs>/, "");
  let dust = "";
  const R = rng(5150);
  for (let i = 0; i < 90; i++) dust += `<circle cx="${n(R() * W)}" cy="${n(R() * H)}" r="${n(0.5 + R() * 1.4)}" fill="#f3d47c" opacity="${n(0.1 + R() * 0.4)}"/>`;
  const inner = `
  <rect width="${W}" height="${H}" fill="url(#stage)"/>${dust}
  <g font-family="Georgia,'Times New Roman',serif" font-weight="700">
  <svg x="14" y="${hy - T}" width="230" height="768" viewBox="0 0 230 768">${lp}</svg>
  <svg x="${W - 14 - 230}" y="${hy - T}" width="230" height="768" viewBox="0 0 230 768">${rp}</svg>
  <svg x="${hx}" y="${hy}" width="${hole}" height="${hole}" viewBox="0 0 800 800">${squares()}</svg>
  ${frame(hx, hy, hole, T, { coords: true, crownTop: false, idSuffix: "-full" })}
  ${crown(W / 2, 52, 1.0)}
  <g><rect x="${W / 2 - 150}" y="${hy + hole + T + 18}" width="300" height="52" rx="12" fill="url(#gold)" stroke="#3b2705" stroke-width="1.5"/>
  <rect x="${W / 2 - 144}" y="${hy + hole + T + 24}" width="288" height="40" rx="8" fill="url(#lacquer)"/>
  <text x="${W / 2}" y="${hy + hole + T + 53}" text-anchor="middle" font-size="26" letter-spacing="8" fill="url(#goldV)">CHESSMATE</text></g>
  </g>`;
  // ADMIN wordmark sits beside the crown on the top plaque
  const plaque = `<g font-family="Georgia,'Times New Roman',serif" font-weight="700">
  <rect x="${W / 2 - 330}" y="22" width="190" height="44" rx="10" fill="url(#gold)" stroke="#3b2705" stroke-width="1.5"/>
  <rect x="${W / 2 - 324}" y="28" width="178" height="32" rx="7" fill="url(#lacquer)"/>
  <text x="${W / 2 - 235}" y="52" text-anchor="middle" font-size="22" letter-spacing="7" fill="url(#goldV)">ADMIN</text>
  <rect x="${W / 2 + 140}" y="22" width="190" height="44" rx="10" fill="url(#gold)" stroke="#3b2705" stroke-width="1.5"/>
  <rect x="${W / 2 + 146}" y="28" width="178" height="32" rx="7" fill="url(#lacquer)"/>
  <text x="${W / 2 + 235}" y="52" text-anchor="middle" font-size="15" letter-spacing="3" fill="url(#goldV)">ROYAL BOARD</text>
  </g>`;
  writeFileSync(join(OUT, "admin-royal-board.svg"),
    standalone(`0 0 ${W} ${H}`, inner + plaque, ` role="img" aria-label="Admin Royal Chess Board"`));
}

console.log("Admin Royal Board artwork written to", OUT);
