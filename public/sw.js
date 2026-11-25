const CACHE = 'chessmate-shell-v3';

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
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE).map(key => caches.delete(key))
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

  if (
    request.method !== 'GET' ||
    new URL(request.url).origin !== self.location.origin
  ) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(
            caches.open(CACHE).then(cache => cache.put(request, copy))
          );
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }

        return Response.error();
      })
  );
});
