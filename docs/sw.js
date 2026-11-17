// Offline support for the GitHub Pages build. Serves the cached app straight away and
// refreshes the cache in the background, so a new version shows up on the next launch.
// The full app lives at the site root and Lite at lite/, on the same origin. Each keeps its
// own cache, and the root worker leaves everything under lite/ to Lite's own worker.
const LITE = false;
const CACHE = (LITE ? 'bullpup-lite-' : 'bullpup-') + '1.9';
const mine = k => LITE ? k.startsWith('bullpup-lite-') : k.startsWith('bullpup-') && !k.startsWith('bullpup-lite-');
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'pwa/icon-192.png', 'pwa/icon-512.png', 'pwa/icon-maskable-512.png', 'pwa/apple-touch-icon.png'];

self.addEventListener('install', e => {
  // cache: 'reload' skips the browser's HTTP cache, so an update never re-caches the old page
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => mine(k) && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (!LITE && url.href.startsWith(self.registration.scope + 'lite/')) return;
  // Only the app itself is served from the cache. Downloads (APKs, the HTML builds), version.json
  // and the other pages always go to the network, so a link to an APK downloads the APK.
  const rel = url.href.slice(self.registration.scope.length).split(/[?#]/)[0];
  if (!(rel === '' || FILES.includes(rel))) return;
  const key = req.mode === 'navigate' ? 'index.html' : req;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(key, { ignoreSearch: true });
    const fresh = fetch(req).then(r => { if (r.ok) c.put(key, r.clone()); return r; }).catch(() => hit);
    return hit || fresh;
  }));
});
