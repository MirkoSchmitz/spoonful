// Spoonful – Offline-Grundgerüst. App-Dateien kommen aus dem Cache, wenn kein Netz da ist.
const CACHE = 'spoonful-v4';
const SHELL = ['./', './index.html', './config.js', './shim.js', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Eigene Dateien: Netz zuerst, sonst Cache. Fremde Hosts (Supabase, Schriften, Fotos): durchreichen, Fotos/Schriften zusätzlich cachen.
  if (u.origin === location.origin && u.pathname.endsWith('/version.json')) return;
  if (u.origin === location.origin) {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
  } else if (e.request.mode !== 'cors' && /\/storage\/v1\/object\/public\/|images\.unsplash\.com|fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/.test(e.request.url)) {
    // Nur Bild-/Schriftanfragen der Seite cachen. CORS-Anfragen (z. B. Foto zum Zuschneiden laden) gehen immer direkt ans Netz.
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })));
  }
});
