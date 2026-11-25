# ChessMate 2.0

Node.js + Express + Socket.IO + SQLite chess platform with a Stockfish-powered analysis interface.

## Termux (Android) setup

```bash
pkg update && pkg upgrade
pkg install nodejs unzip          # Node.js 22.13+ is required (built-in node:sqlite)
cd ~
unzip ChessMate.zip && cd ChessMate   # run from Termux home, not /sdcard
npm install
cp .env.example .env
nano .env                          # set JWT_SECRET to a long random string
npm start
```

Open **http://127.0.0.1:3000** in Chrome on the same phone. Friends on the same Wi-Fi can use `http://<phone-ip>:3000`
(`ifconfig` shows the IP). Keep Termux awake with `termux-wake-lock`. Check Node with `node -v` (must be ≥ 22.13).

Everything the browser needs is included — **no internet is required after `npm install`**.

## What's in the interface

- **Board**: SVG pieces (white pieces are white, black pieces are black), responsive 8×8 board, tap-to-move and drag-and-drop,
  highlights for the selected square, legal moves, captures, check and the last move, promotion picker (incl. underpromotion).
- **Evaluation bar** (left of the board) driven by real Stockfish 19 evaluations after every move, with the number beside it
  (`+1.3` White better, `−1.3` Black better, `M3` mate). Flips with the board for Black.
- **Move notation** above the board. Tap a move (or use ← → Home End) to review; in Analysis Board you can play on from any
  earlier position.
- **Move classification**: Brilliant, Great, Best, Excellent, Good, Inaccuracy, Mistake, Blunder — shown as a small badge
  on the top-right corner of the piece that just moved, only after Stockfish has analysed the move (the name flashes next to
  the badge, then it collapses to its symbol; long-press/hover shows the name).
- Nothing below the board; no side panels; no Hint/Undo/Flip/New Game buttons.

### How moves are classified
Each move is compared with Stockfish's best move in the same position (MultiPV 2, depth 13) using win probability:
Best = engine's top move; Excellent ≤ 2% lost; Good ≤ 5%; Inaccuracy ≤ 10%; Mistake ≤ 20%; Blunder > 20%.
**Great** = the only move that keeps/wins the position (next best is ≥ 15% worse; recaptures excluded).
**Brilliant** = a sound move (≤ 2% lost, not already crushing, not worse afterwards) that gives up ≥ 2 points of material
once the capture sequence settles. Classification code: `public/js/classify.js`.

## Features kept
Registration/login, ranked matchmaking with ELO, private rooms and friend matches, leaderboard, match history (now with a screen),
two-player local mode, computer opponent (now 5 strength levels and colour choice), analysis board. All REST routes and socket
event names are unchanged.

## Backend changes (additive)
- Online moves are **validated on the server** (chess.js): wrong-turn and illegal moves are rejected, and the server decides
  checkmate/draws. Clients can no longer report a win; a client can only resign.
- Leaving a ranked game = resignation. A dropped connection has a 45 s grace period and the game resumes on reconnect.
- Friend games are also saved to match history (unranked). New events: `game-over`, `resign`, `room-resume`, `move-rejected`, `opponent-back`.

## Project layout
```
server.js            API + Socket.IO + SQLite (data/chessmate.db)
public/index.html    UI shell          public/style.css  dark theme
public/app.js        UI, board, sockets
public/js/engine.js  Stockfish worker wrapper (queue + cache)
public/js/classify.js move classification
public/engine/       Stockfish 19 lite WASM (single-thread, works on any Android browser)
public/vendor/       chess.js 1.4.0 (browser build)
public/pieces/       12 SVG pieces
```

## Notes
- Don't share `.env` or `data/chessmate.db`. Localhost only works on the same device; play across networks needs public HTTPS hosting.
- Engine analysis runs on-device; older/slow phones may take a few seconds per move for badges to appear.

## Licences
Stockfish.js (GPL-3.0, `public/engine/COPYING-Stockfish-GPLv3.txt`, https://github.com/nmrugg/stockfish.js);
pieces by Colin M.L. Burnett, CC BY-SA 3.0 (`public/pieces/LICENSE.txt`); chess.js (BSD-2).
