/* ============================================================================
   MovieBox Studio — PWA Service Worker (v2.0 Liquid Glass & Claymorphism)
   Provides instant app launching on phones, tablets, and desktops
   ============================================================================ */

const CACHE_NAME = 'moviebox-pwa-v2.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/manifest.json',
  '/logo.svg',
  '/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install: Cache core app shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Cache addAll warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: Clean up older cache versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Stale-While-Revalidate for app assets; Network-First for APIs & streams
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignore non-GET or cross-origin requests
  if (req.method !== 'GET') return;

  // Pass through all APIs, live streams, and Range requests directly to native browser engine
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.includes('/mb-dash/') ||
    url.pathname.includes('/mb-proxy') ||
    url.pathname.includes('/local-stream') ||
    url.pathname.endsWith('.mpd') ||
    url.pathname.endsWith('.m3u8') ||
    url.pathname.endsWith('.mp4') ||
    url.pathname.endsWith('.m4s') ||
    req.headers.has('range')
  ) {
    return;
  }

  // Stale-While-Revalidate for static app assets
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      const fetchPromise = fetch(req).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(req, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
