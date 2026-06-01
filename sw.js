// 75 Hard — Service Worker
// Versioned cache for the static app shell. Bump CACHE_VERSION to invalidate.
// v2: precache the v4 tracking modules (measurements, wellbeing, failure)
// plus the previously-omitted bus/settings/report modules so offline
// reloads after the v4 ship don't miss any code.
const CACHE_VERSION = 'v2';
const CACHE_NAME = `75hard-${CACHE_VERSION}`;
const CACHE_PREFIX = '75hard-';

const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/main.js',
  './js/constants.js',
  './js/state.js',
  './js/theme.js',
  './js/countdown.js',
  './js/quotes.js',
  './js/tasks.js',
  './js/water.js',
  './js/metrics.js',
  './js/notes.js',
  './js/grid.js',
  './js/stats.js',
  './js/photos.js',
  './js/books.js',
  './js/drinks.js',
  './js/modal.js',
  './js/export.js',
  './js/confetti.js',
  './js/toast.js',
  './js/bus.js',
  './js/settings.js',
  './js/report.js',
  './js/measurements.js',
  './js/wellbeing.js',
  './js/failure.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Only handle same-origin requests; let externals (e.g. Google Fonts) hit the network unchanged.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        // Only cache valid, basic responses.
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => cached);
    })
  );
});
