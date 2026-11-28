# ChessMate Complete Upgrade

This package contains the complete ChessMate project with the premium admin and home-page updates.

## Included
- Premium black-and-gold glassmorphism Admin Dashboard.
- Refined Announcement Panel and top-of-page global announcement styling.
- Raining Tacos event controls (Start Event / End Event), existing taco-rain animation, and existing original event sound.
- Original garden-inspired home-page interaction chime with the existing Sound On / Sound Off control.
- Admin Update & Release Panel showing the current release version and scheduled-banner status.
- Existing Update Timer Banner markup and scheduling logic retained for future scheduled releases.
- Service Worker shell cache version incremented for this package.

## Release behavior
No scheduled countdown is active in this package. The Update Timer Banner and `public/pwa.js` scheduling mechanism remain in the project for future use.

The Admin Update & Release Panel is a status monitor. Publishing a new GitHub Pages build still happens through the repository deployment workflow; the static website cannot directly push source changes to GitHub.

## Audio note
The home-page chime is an original garden-inspired sound effect, not a recording or recreation of audio from another game. The existing Raining Tacos sound effect is preserved.

## v2.4 — Exclusive Deals boards: Obsidian Royale · Aurora · Forests (+ Royal Sapphire)
- Each board now has: baked marble bitmap (`public/themes/board-*.webp`), themed frame/backdrop, its own full-screen **checkmate animation** (`public/js/mate-fx.js`, scene art `themes/mate-*.webp`, per-theme sound + particles), and an **animated profile** (profile card + home mini-profile, `applyProfileFx` in app.js).
- All four are in **Exclusive Deals** with artwork (`themes/art-*.webp`) and feature chips. Catalog is defined in `COSMETICS` in `server-postgres.js` (`exclusive`, `image`, `features`). Forest renamed "Forests". Prices and existing ownership unchanged.
- Aurora/Forests are shared with the opponent like Sapphire (see `sharedBoardTheme`).
- Sapphire/Christmas marble also baked to a bitmap (smoother moves). Service worker cache v52.
- Redeploy the backend (server-postgres.js) AND the static site for the shop images/features to appear.

## v2.5 — Rosewood + Christmas Emerald in Exclusive Deals; compact checkmate splash
- `board_rose` (Rosewood, 8💎) and `board_christmas` (Christmas Emerald, now 10💎 — was a free event item; change `price` in `COSMETICS` if you want another price) are Exclusive Deals with artwork, own checkmate finale (+ sound) and animated profile.
- The free Christmas *event* look on the default board still works; it just doesn't get the exclusive finale/profile.
- Checkmate splash now fits any screen (card ≤ 52% of screen height), uses a light dim, and ignores taps outside the card so the page behind stays usable.
- Service worker cache v53.
