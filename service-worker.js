/* ==========================================================================
   service-worker.js — offline shell for Eaty
   Paths are relative so the app works from a GitHub Pages project subpath.
   ========================================================================== */
'use strict';

const VERSION = 'eaty-v1.5.0';
const SHELL = VERSION + '-shell';
const RUNTIME = VERSION + '-runtime';

const PRECACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './js/core.js',
  './js/store.js',
  './js/foods.js',
  './js/foods-de.js',
  './js/foods-extra.js',
  './js/nutrition.js',
  './js/quality.js',
  './js/charts.js',
  './js/ui.js',
  './js/barcode.js',
  './js/offapi.js',
  './js/fdcapi.js',
  './js/localpack.js',
  './data/de/index.json',
  './js/foodsheet.js',
  './js/scanner.js',
  './js/supplements.js',
  './js/onboarding.js',
  './vendor/zxing.min.js',
  './js/views/today.js',
  './js/views/diary.js',
  './js/views/recipes.js',
  './js/views/plan.js',
  './js/views/trends.js',
  './js/views/settings.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './icons/favicon-32.png',
  './icons/maskable-512.png'
];

/* ------------------------------------------------------------- install */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      // addAll is all-or-nothing; add individually so one 404 cannot break install.
      .then(cache => Promise.all(PRECACHE.map(url =>
        cache.add(new Request(url, { cache: 'reload' }))
          .catch(err => console.warn('[sw] precache miss', url, err))
      )))
      .then(() => self.skipWaiting())
  );
});

/* ------------------------------------------------------------ activate */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SHELL && k !== RUNTIME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* --------------------------------------------------------------- fetch */
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // never touch cross-origin

  // Navigations: try the network, fall back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(RUNTIME).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() =>
          caches.match(req)
            .then(hit => hit || caches.match('./index.html'))
            .then(hit => hit || new Response(
              '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
              '<body style="font:16px system-ui;background:#0A0E17;color:#EEF2F8;display:grid;' +
              'place-items:center;height:100vh;margin:0"><p>Eaty is offline and no cached copy was found.</p>',
              { headers: { 'Content-Type': 'text/html' } }
            ))
        )
    );
    return;
  }

  // Product-pack shards are immutable for a given build — serve them straight
  // from the cache with no revalidation, so a lookup costs nothing on mobile.
  if (url.pathname.includes('/data/de/') && url.pathname.endsWith('.json')) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(RUNTIME).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }))
    );
    return;
  }

  // Everything else: cache first, then refresh in the background.
  event.respondWith(
    caches.match(req).then(hit => {
      const network = fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(RUNTIME).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);

      return hit || network;
    })
  );
});
