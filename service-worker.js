const CACHE_NAME = 'chris-davis-cache-v2';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const IMAGE_CACHE = 'chris-davis-images-v2';
const MAX_IMAGE_CACHE_ITEMS = 100;
const TIMESTAMP_CACHE = 'chris-davis-timestamps-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/about.html',
  '/contact.html',
  '/events.html',
  '/exhibitions.html',
  '/fineart.html',
  '/people.html',
  '/styles.css',
  '/manifest.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(STATIC_ASSETS);
    })()
  );
  // Activate updated service worker immediately
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clean up old static caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== IMAGE_CACHE && cacheName !== TIMESTAMP_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
      // Clean up image cache if older than 24 hours
      const imageCache = await caches.open(IMAGE_CACHE);
      const cacheTime = await imageCache.match('image-cache-timestamp');
      const now = Date.now();
      if (!cacheTime || now - parseInt(await cacheTime.text()) > CACHE_EXPIRY) {
        // Delete all image cache entries
        const keys = await imageCache.keys();
        await Promise.all(keys.map(key => imageCache.delete(key)));
        // Set new timestamp
        await imageCache.put('image-cache-timestamp', new Response(now.toString()));
      }
      // Control uncontrolled clients immediately
      await self.clients.claim();
    })()
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Network-first strategy for images so updates are seen immediately
  if (request.destination === 'image') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(IMAGE_CACHE);
        try {
          // Bypass HTTP cache to always revalidate with the server
          const networkResponse = await fetch(request, { cache: 'no-store' });
          await cache.put(request, networkResponse.clone());
          // Limit cache size
          const keys = await cache.keys();
          if (keys.length > MAX_IMAGE_CACHE_ITEMS) {
            await cache.delete(keys[0]);
          }
          // Update timestamp on every put
          await cache.put('image-cache-timestamp', new Response(Date.now().toString()));
          return networkResponse;
        } catch (err) {
          const cachedResponse = await cache.match(request);
          if (cachedResponse) return cachedResponse;
          // Last resort, try default fetch (may still hit HTTP cache)
          return fetch(request);
        }
      })()
    );
    return;
  }

  // For non-image requests, keep existing cache with time-based expiry
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const timestampCache = await caches.open(TIMESTAMP_CACHE);
      const cachedResponse = await cache.match(request);
      const timestampResponse = await timestampCache.match(request.url);
      const now = Date.now();
      let isExpired = true;
      if (timestampResponse) {
        const cachedTime = parseInt(await timestampResponse.text());
        if (!isNaN(cachedTime) && now - cachedTime < CACHE_EXPIRY) {
          isExpired = false;
        }
      }
      if (cachedResponse && !isExpired) {
        return cachedResponse;
      }
      try {
        const networkResponse = await fetch(request);
        await cache.put(request, networkResponse.clone());
        await timestampCache.put(request.url, new Response(now.toString()));
        return networkResponse;
      } catch (err) {
        if (cachedResponse) return cachedResponse;
        return new Response('Offline content not available');
      }
    })()
  );
});