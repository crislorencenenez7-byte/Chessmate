const CACHE = 'chessmate-shell-v9';

const CORE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './pwa.js',
  './manifest.webmanifest',
  './config.js',
  './vendor/chess.js',
  './js/engine.js',
  './js/classify.js',
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
