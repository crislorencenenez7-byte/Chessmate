# ChessMate v2.4.0 — Release Notes

## Exclusive board themes

- Obsidian Royale, Aurora, and Forests each include board artwork and a dedicated checkmate finale image/effect.
- Theme checkmate scenes are implemented in `public/js/mate-fx.js` and use assets from `public/themes/`.
- Royal Sapphire and Christmas assets remain included.

## Package cleanup

- Synchronized `package.json` and `package-lock.json` to version 2.4.0.
- Removed obsolete `*.before*` snapshots and the legacy SQLite database from this distribution.
- The active backend is PostgreSQL (`server-postgres.js` / `db.js`).

## Deployment

Deploy the backend and static frontend separately when their files change. Configure `DATABASE_URL`, `JWT_SECRET`, and `FRONTEND_ORIGIN` in the backend environment. Never include real `.env` files or credentials in a source archive.
