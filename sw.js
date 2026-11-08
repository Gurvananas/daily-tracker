// Offline support: the app shell is precached, then served stale-while-revalidate
// so the app opens instantly (even offline) and picks up updates on the next launch.
const CACHE = 'daily-tracker-v2';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/apple-touch-icon.png',
  './src/app.js',
  './src/app-shell.js',
  './src/router.js',
  './src/store.js',
  './src/data.js',
  './src/dates.js',
  './src/metrics.js',
  './src/stats.js',
  './src/charts.js',
  './src/ui.js',
  './src/views/today.js',
  './src/views/stats.js',
  './src/views/year.js',
  './src/views/settings.js',
  './src/views/editor.js',
  './src/views/library.js',
  './src/views/health-settings.js',
  './src/native.js',
  './src/health.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const key = req.mode === 'navigate' ? './index.html' : req;
      const cached = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
