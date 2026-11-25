# ChessMate 2.0

ChessMate is a responsive chess platform with a Stockfish-powered analysis board, local games, a computer opponent, and an Express + Socket.IO + SQLite backend for accounts and online play.

## Run on Android (Termux)

Use Node.js 22.13 or newer.

```sh
pkg update && pkg upgrade
pkg install nodejs unzip
cd ~
unzip ChessMate-2.0-FINAL.zip
cd ChessMate
npm install
cp .env.example .env
```

Edit `.env` and set `JWT_SECRET` to a long random value, then start the server:

```sh
nano .env
npm start
```

Open **http://127.0.0.1:3000** in Chrome on the same phone. Keep Termux running while playing online games. Do not share `.env` or `data/chessmate.db`.

## What works

- Local two-player chess, computer opponent, and analysis board.
- Stockfish 19 lite WebAssembly engine runs in the browser.
- SVG chess pieces, legal move validation, promotion, move notation, evaluation bar, and move classifications.
- Registration, login, ELO, ranked matchmaking, private rooms, leaderboard, and match history when the Node.js backend is running.
- PWA install prompt and service-worker update notification on supported HTTPS hosting.

## GitHub Pages

The GitHub Actions workflow in `.github/workflows/deploy.yml` publishes the `public/` directory, so the ChessMate interface—not this README—is the website landing page.

GitHub Pages is static hosting. It can serve the board, local games, computer opponent, and Stockfish analysis, but it cannot run `server.js`, Socket.IO, or SQLite. Accounts, ranked matchmaking, private rooms, leaderboard, and match history require the Node.js backend to be deployed separately. To connect a hosted backend, set `window.CHESSMATE_API_URL` in `public/config.js` to its HTTPS base URL, and set `FRONTEND_ORIGIN` in the backend environment to `https://crislorencenenez7-byte.github.io` (or your actual Pages origin).

For Pages, open repository **Settings → Pages → Build and deployment → Source → GitHub Actions**. Push to `main`; the workflow deploys the contents of `public/` automatically.

## Project layout

- `server.js` — Express API, Socket.IO, and SQLite backend
- `data/` — SQLite database directory (database file is created at runtime; never upload it)
- `public/index.html` — ChessMate website
- `public/app.js` — interface, board, game logic, and socket client
- `public/style.css` — responsive dark UI
- `public/js/engine.js` — Stockfish worker wrapper
- `public/js/classify.js` — move classification
- `public/engine/` — Stockfish 19 lite JavaScript and WASM files
- `public/vendor/chess.js` — chess.js browser build
- `public/pieces/` — SVG chess pieces

## Requirements and licences

- Node.js >= 22.13 (uses built-in `node:sqlite`)
- Stockfish.js is GPL-3.0; see `public/engine/COPYING-Stockfish-GPLv3.txt`.
- Chess piece artwork licence: see `public/pieces/LICENSE.txt`.
- chess.js is BSD-2-Clause.
