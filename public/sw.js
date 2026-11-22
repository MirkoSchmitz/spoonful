// Spoonful – Offline-Grundgerüst. App-Dateien kommen aus dem Cache, wenn kein Netz da ist.
const CACHE = 'spoonful-v7';
const SHARE = 'spoonful-share'; // vom Teilen-Menü übergebene Fotos/Texte, bis die App sie abholt
const SHELL = ['./', './index.html', './config.js', './shim.js', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== SHARE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  // Teilen-Menü (Android): Foto/Text annehmen, zwischenspeichern und die App mit ?shared=1 öffnen
  if (e.request.method === 'POST' && u.origin === location.origin && u.pathname === '/share-target') {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData();
        const file = fd.getAll('image').find(f => f && typeof f === 'object' && f.size);
        const text = ['title', 'text', 'url'].map(k => fd.get(k)).filter(v => typeof v === 'string' && v.trim()).join('\n');
        const c = await caches.open(SHARE);
        await c.delete('/shared-image');
        if (file) await c.put('/shared-image', new Response(file, { headers: { 'Content-Type': file.type || 'image/jpeg', 'X-Name': encodeURIComponent(file.name || 'foto.jpg') } }));
        await c.put('/shared-meta', new Response(JSON.stringify({ text, file: !!file, ts: Date.now() }), { headers: { 'Content-Type': 'application/json' } }));
      } catch {}
      return Response.redirect('/?shared=1', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET') return;
  // Eigene Dateien: Netz zuerst, sonst Cache. Fremde Hosts (Supabase, Schriften, Fotos): durchreichen, Fotos/Schriften zusätzlich cachen.
  if (u.origin === location.origin && u.pathname.endsWith('/version.json')) return;
  if (u.origin === location.origin) {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
  } else if (e.request.mode !== 'cors' && /\/storage\/v1\/object\/public\/|images\.unsplash\.com|upload\.wikimedia\.org|fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/.test(e.request.url)) {
    // Nur Bild-/Schriftanfragen der Seite cachen. CORS-Anfragen (z. B. Foto zum Zuschneiden laden) gehen immer direkt ans Netz.
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })));
  }
});
