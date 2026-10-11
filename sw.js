// Service worker: la app funciona sin conexión. Sirve desde caché y actualiza en segundo
// plano (la versión nueva se ve en la siguiente apertura).
const CACHE = 'traste-v1';
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/audio.js', 'js/mic-worklet.js', 'js/music.js', 'js/curriculum.js', 'js/theory.js',
  'js/store.js', 'js/session.js', 'js/ui.js', 'js/capsules.js',
  'js/activities/index.js', 'js/activities/common.js', 'js/activities/lesson.js', 'js/activities/tuner.js',
  'js/activities/notes.js', 'js/activities/changes.js', 'js/activities/rhythm.js', 'js/activities/melody.js',
  'js/activities/ear.js', 'js/activities/quiz.js', 'js/activities/playalong.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const fresh = fetch(e.request).then((res) => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }).catch(() => cached);
    return cached || fresh;
  }));
});
