/* ============================================================
   sw.js — Service worker mínimo: precarga el shell y sirve
   desde caché para que la app funcione sin conexión.
   Sube el número de CACHE al cambiar cualquier archivo.
   ============================================================ */
/* Este número tiene que coincidir con VERSION en js/utils.js. Si se
   desincronizan, la pantalla de Ajustes lo avisa en lugar de callarse. */
const CACHE = 'habitos-v1.5.3';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './css/styles.css',
  './js/utils.js',
  './js/store.js',
  './js/stats.js',
  './js/ui.js',
  './js/app.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys
          .filter(function (k) { return k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  const request = event.request;

  // Solo se cachean lecturas del propio origen.
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;

      return fetch(request)
        .then(function (response) {
          // Las respuestas opacas o con error no se guardan.
          if (!response || response.status !== 200 || response.type !== 'basic') return response;

          const copy = response.clone();
          caches.open(CACHE).then(function (cache) { cache.put(request, copy); });
          return response;
        })
        .catch(function () {
          // Sin red y sin caché: al menos se devuelve el shell para las navegaciones.
          if (request.mode === 'navigate') return caches.match('./index.html');
          throw new Error('Recurso no disponible sin conexión');
        });
    })
  );
});
