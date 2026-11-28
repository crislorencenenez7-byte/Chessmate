const CACHE = 'chessmate-shell-v55';

const CORE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './pwa.js',
  './manifest.webmanifest',
  './config.js',
  './avatars/stockfish.svg', './avatars/fischer.svg', './avatars/mittens.svg',
  './avatars/master.svg', './avatars/club.svg', './avatars/beginner.svg',
  './vendor/chess.js',
  './js/engine.js',
  './js/classify.js',
  './themes/marble-sapphire.svg',
  './themes/marble-emerald.svg',
  './themes/marble-cream.svg',
  './js/mate-fx.js',
  './themes/board-christmas.webp',
  './themes/board-sapphire.webp',
  './themes/board-obsidian.webp',
  './themes/board-aurora.webp',
  './themes/board-forest.webp',
  './themes/mate-obsidian.webp',
  './themes/mate-christmas.webp',
  './themes/mate-rose.webp',
  './themes/board-rose.webp',
  './themes/art-christmas.webp',
  './themes/art-rose.webp',
  './themes/mate-aurora.webp',
  './themes/mate-forest.webp',
  './themes/art-obsidian.webp',
  './themes/art-aurora.webp',
  './themes/art-forest.webp',
  './themes/art-sapphire.webp',
  './js/themes.js',
  './js/pixi-fx.js',
  './vendor/pixi.min.mjs',
  './engine/stockfish-19-lite-single.js',
  './engine/stockfish-19-lite-single.wasm',
  './pieces/wK.svg', './pieces/wQ.svg',
  './pieces/wR.svg', './pieces/wB.svg',
  './pieces/wN.svg', './pieces/wP.svg',
  './pieces/bK.svg', './pieces/bQ.svg',
  './pieces/bR.svg', './pieces/bB.svg',
  './pieces/bN.svg', './pieces/bP.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE))
      // Existing installations keep the old worker until the scheduled release.
      .then(() => true)
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('chessmate-shell-') && key !== CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin
  ) return;

  // Always fetch the shared schedule from GitHub Pages.
  if (url.pathname.endsWith('/update.json')) return;

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;

      return fetch(request).catch(() => {
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }

        return Response.error();
      });
    })
  );
});
