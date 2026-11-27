# ChessMate v2.4.0

ChessMate is an online chess platform with Stockfish-powered analysis, computer opponents, ranked and private matches, player profiles, Diamond cosmetics, clans, tournaments, and themed chessboards.

## Requirements

- Node.js >= 22.13
- PostgreSQL database
- `DATABASE_URL` and `JWT_SECRET` environment variables

## Run the backend

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env`.
3. Set `DATABASE_URL` to your PostgreSQL connection string and set a long random `JWT_SECRET`.
4. Start with `npm start`.

Do not publish `.env`, database credentials, or private deployment secrets.

## Hosting

- `public/` is the static frontend and is published through the GitHub Pages workflow.
- `server-postgres.js` is the Express + Socket.IO backend and requires PostgreSQL.
- Configure `FRONTEND_ORIGIN` on the backend to the exact HTTPS origin serving the frontend.
- Deploy the backend and frontend when their respective files change.

## v2.4.0 highlights

- Exclusive board themes: Obsidian Royale, Aurora, and Forests.
- Dedicated themed checkmate finales and scene artwork for those boards.
- Royal Sapphire and Christmas board artwork retained.
- Theme artwork, board textures, and checkmate assets are stored in `public/themes/`.
- Theme and checkmate frontend modules are in `public/js/`.

## Project structure

- `server-postgres.js` — API and Socket.IO backend
- `db.js` — PostgreSQL initialization and schema
- `public/` — frontend, engine, pieces, avatars, themes, and PWA assets
- `scripts/` — release and scheduled-update scripts

## Notes

Diamond top-ups create pending requests. This source package does not include a live payment-provider integration; payments must not be treated as verified until checked through a properly configured provider and authorized verification flow.
