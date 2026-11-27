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


## Latest package update: AI opponent characters and Raining Tacos event

- Added character avatar portraits for the six local AI opponent profiles.
- The opponent card appears in the AI player's seat and reacts to the human player's move classification.
- The opponent also comments after its own move, with different reactions for checks, captures, and ordinary moves.
- The Raining Tacos event now plays an original four-note synthesized jingle while the event is active on the Home screen. It stops outside the Home screen and requires a user tap first so mobile browsers can unlock audio.
- The uploaded `ChessMate.zip` did not contain an MP3/OGG/WAV audio file. Therefore this package does not include or claim to use the separately mentioned supplied recording.


## ChessMate 2.2.0 — Diamonds, Cosmetics, Clans & Tournament

### Added
- Diamond wallet stored in PostgreSQL. The displayed starter rate is **₱10 = 2 Diamonds**.
- Server-authoritative cosmetic purchases and permanent ownership inventory.
- Board themes: Obsidian Royale (15 Diamonds, premium checkmate king-burst), Aurora, Rosewood and Forest.
- Profile avatar cosmetics: Royal Crown, Dragon and Phoenix, plus the default Knight.
- Player profile panel and equipped cosmetic persistence.
- Clan creation and invite-code joining, with a maximum of five members.
- Tournament registration requires a 3–5 player clan.
- Tournament seeding sorts each clan by ELO and pairs equal roster-size divisions rank-for-rank (highest vs highest, then second vs second).
- Tournament-only Laurel profile emblem and Slate Arena board reward cosmetics; staff can grant these through the admin API.

### Important payment integration note
The top-up button creates a **pending payment request** and does not credit Diamonds. No payment provider or webhook credentials were present in the supplied project, so this upgrade deliberately does not pretend to process GCash/cards or mark an unverified payment as paid. After checking a real payment through your chosen provider, an authenticated admin can verify the request with:

`POST /api/admin/economy/verify-topup` with JSON `{ "reference": "CM-..." }`

The verification endpoint credits exactly 2 Diamonds once per pending ₱10 request. Connect a real payment provider webhook before accepting live payments.

Tournament reward grant endpoint (admin only):

`POST /api/admin/tournament/reward` with JSON `{ "username": "player", "key": "avatar_tournament_laurel" }`

or use `board_tournament_slate`.

### Deployment
- The app uses `server-postgres.js` and `db.js` as configured in `package.json`.
- On startup, `initDb()` creates the new tables and adds the wallet/profile columns to existing users. No manual destructive migration is required.
- Set `DATABASE_URL` and `JWT_SECRET` as usual, then deploy/restart the backend.
- Restart the frontend deployment too so the updated `public/` files are served.


## ChessMate v2.3.0 update

- Clan is a standalone area with create/join, member roster, independent wins/losses/win rate, and Clan leaderboard.
- Tournament is separate from Clan management. Six registered clans are selected for a randomized single-elimination championship (two opening matches, two semifinal byes, and a final).
- Clan tournament rosters support 3–5 players and are paired by descending ELO (highest vs highest, then down the roster). Tournament results are recorded by an authorized Admin; those results update Clan W/L records.
- Diamonds include a transaction ledger. The ₱10 / 2-Diamond request remains pending until verified; no client-side credit is allowed. A real payment provider integration is not configured in this source package.
- Obsidian Royale is a non-Christmas Exclusive Deal priced at 15 Diamonds. Owner/Admin accounts receive it free.
- Checkmate now shows a king circle, lightning strike, and CHECKMATE announcement.
- The scheduled update banner is enabled by `scripts/schedule-update.mjs` and counts down from 15 minutes.

### Deployment note
The Termux `ship.sh` release script schedules the website update banner for 15 minutes when it pushes the release. To schedule it separately, run `npm run schedule-update -- "Clan and Tournament update | Diamonds and cosmetics | Checkmate effects"`; this writes a 15-minute release schedule to `public/update.json`.
