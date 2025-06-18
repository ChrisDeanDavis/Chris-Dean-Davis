const CACHE_NAME = 'chris-davis-cache-v1';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const IMAGE_CACHE = 'chris-davis-images-v1';
const MAX_IMAGE_CACHE_ITEMS = 100;
const TIMESTAMP_CACHE = 'chris-davis-timestamps-v1';
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
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(STATIC_ASSETS);
      })
  );
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
    })()
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.destination === 'image') {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          return cachedResponse;
        }
        const response = await fetch(request);
        cache.put(request, response.clone());
        // Limit cache size
        const keys = await cache.keys();
        if (keys.length > MAX_IMAGE_CACHE_ITEMS) {
          cache.delete(keys[0]);
        }
        // Update timestamp on every put
        cache.put('image-cache-timestamp', new Response(Date.now().toString()));
        return response;
      })
    );
    return;
  }
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
      // Fetch from network and update cache and timestamp
      try {
        const networkResponse = await fetch(request);
        cache.put(request, networkResponse.clone());
        timestampCache.put(request.url, new Response(now.toString()));
            return networkResponse;
      } catch (err) {
            // If network fails and we have a cached response, use it even if expired
        if (cachedResponse) {
          return cachedResponse;
          }
            return new Response('Offline content not available');
      }
    })()
  );
}); 