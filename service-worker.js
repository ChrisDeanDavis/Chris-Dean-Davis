const CACHE_NAME = 'chris-davis-cache-v6';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const IMAGE_CACHE = 'chris-davis-images-v3';
const MAX_IMAGE_CACHE_ITEMS = 100;
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/about.html',
  '/contact.html',
  '/events.html',
  '/fineart.html',
  '/portraits.html',
  '/commercial.html',
  '/shop.html',
  '/pricing.html',
  '/styles.css',
  '/manifest.json'
];

// Install: pre-cache the offline fallback set, then activate immediately.
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Use no-store so the install never picks up an HTTP-cached stale copy.
      await Promise.all(
        STATIC_ASSETS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'no-store' });
            if (response && response.ok) {
              await cache.put(url, response);
            }
          } catch (_) {
            // Ignore failures for individual assets during install.
          }
        })
      );
    })()
  );
  self.skipWaiting();
});

// Activate: wipe every cache that isn't the current one, then take control.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== IMAGE_CACHE) {
            return caches.delete(cacheName);
          }
          return undefined;
        })
      );
      // Refresh image cache once every 24h
      const imageCache = await caches.open(IMAGE_CACHE);
      const cacheTime = await imageCache.match('image-cache-timestamp');
      const now = Date.now();
      if (!cacheTime || now - parseInt(await cacheTime.text()) > CACHE_EXPIRY) {
        const keys = await imageCache.keys();
        await Promise.all(keys.map((key) => imageCache.delete(key)));
        await imageCache.put('image-cache-timestamp', new Response(now.toString()));
      }
      await self.clients.claim();
    })()
  );
});

// Allow pages to ask the SW to skip waiting (used by the auto-reload handshake).
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch: network-first for HTML/CSS/JS, network-first for images,
// stale-while-revalidate for everything else.
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only handle GET requests (POST form submits etc. should bypass the SW)
  if (request.method !== 'GET') return;

  const destination = request.destination;

  // Images: network-first, fall back to cache when offline.
  if (destination === 'image') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(IMAGE_CACHE);
        try {
          const networkResponse = await fetch(request, { cache: 'no-store' });
          if (networkResponse && networkResponse.ok) {
            await cache.put(request, networkResponse.clone());
            const keys = await cache.keys();
            if (keys.length > MAX_IMAGE_CACHE_ITEMS) {
              await cache.delete(keys[0]);
            }
            await cache.put('image-cache-timestamp', new Response(Date.now().toString()));
          }
          return networkResponse;
        } catch (err) {
          const cachedResponse = await cache.match(request);
          if (cachedResponse) return cachedResponse;
          return fetch(request);
        }
      })()
    );
    return;
  }

  // HTML, CSS, JS: network-first so live updates appear on every refresh.
  if (
    destination === 'document' ||
    destination === 'style' ||
    destination === 'script' ||
    request.mode === 'navigate'
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        try {
          const networkResponse = await fetch(request, { cache: 'no-store' });
          if (networkResponse && networkResponse.ok) {
            // Cache a clone for offline fallback only.
            cache.put(request, networkResponse.clone()).catch(() => {});
          }
          return networkResponse;
        } catch (err) {
          const cachedResponse = await cache.match(request);
          if (cachedResponse) return cachedResponse;
          return new Response('Offline content not available', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
          });
        }
      })()
    );
    return;
  }

  // Everything else (fonts, manifest, etc.): stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(request);
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            cache.put(request, response.clone()).catch(() => {});
          }
          return response;
        })
        .catch(() => undefined);
      return cachedResponse || (await networkFetch) || new Response('Offline content not available', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' }
      });
    })()
  );
});
