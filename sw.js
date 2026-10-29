// ============ Protocolo · service worker: la app abre aunque no haya señal ============
const VERSION = 'protocolo-1.0.0';
const SHELL = ['./', './index.html', './app.js', './logica.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
// Librerías y fuentes de otros orígenes que también se guardan para usar sin red.
const EXTERNOS = ['https://cdn.jsdelivr.net', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('protocolo-') && k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', ev => {
  if (ev.request.method !== 'GET') return;
  const url = new URL(ev.request.url);

  // CDN y fuentes: lo guardado primero (son versiones fijas), y se actualiza por detrás.
  if (EXTERNOS.includes(url.origin)) {
    ev.respondWith(caches.open(VERSION).then(async c => {
      const guardado = await c.match(ev.request);
      const red = fetch(ev.request).then(res => { if (res.ok) c.put(ev.request, res.clone()); return res; }).catch(() => guardado);
      return guardado || red;
    }));
    return;
  }

  // Supabase, GitHub y todo lo demás de afuera: nunca se cachea.
  if (url.origin !== location.origin) return;

  // La app: primero la red (una versión nueva se ve al toque), sin señal lo último guardado.
  ev.respondWith(fetch(ev.request)
    .then(res => { if (res.ok) { const copia = res.clone(); caches.open(VERSION).then(c => c.put(ev.request, copia)); } return res; })
    .catch(() => caches.match(ev.request).then(r => r || caches.match('./index.html'))));
});
