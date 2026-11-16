// Service worker : l'appli reste utilisable hors connexion sur le terrain.
// Stratégie « réseau d'abord, cache en secours » pour la page, « cache d'abord »
// pour le reste (scripts, données du ciel, icônes), mis à jour en arrière-plan.
const CACHE = 'ciel-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['./', 'data/stars.json', 'data/starnames.json', 'data/constellations.json', 'manifest.webmanifest'])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((r) => { caches.open(CACHE).then((c) => c.put('./', r.clone())); return r; })
        .catch(() => caches.match('./')),
    );
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((r) => {
        if (r.ok) caches.open(CACHE).then((c) => c.put(req, r.clone()));
        return r;
      }).catch(() => hit);
      return hit || net;
    }),
  );
});
