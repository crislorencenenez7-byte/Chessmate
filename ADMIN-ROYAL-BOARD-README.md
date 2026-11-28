# Admin Royal Chess Board Upgrade

- `public/themes/admin-board.svg` is the scalable Admin Dashboard preview artwork.
- The in-game board uses a dedicated 8×8 CSS theme so the existing square DOM, coordinates, move targets and pieces remain aligned.
- The server selects `board_admin` whenever a room contains a server-authenticated Admin; otherwise Exclusive Deals boards outrank Christmas.
- Match player payloads expose only public presentation metadata (`isAdmin`, avatar key, username, rating and color).
- A verified Admin winner receives the profile-rise, fire-to-mated-King and CHECKMATE banner sequence. The actual server result remains authoritative.
- The Admin board is not part of the cosmetics catalog and cannot be equipped by regular users.
