const CACHE_NAME = 'chris-davis-cache-v1';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
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
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Check if we have a cached response
        if (response) {
          // Check if the cache is expired
          const cacheTime = new Date(response.headers.get('sw-cache-timestamp'));
          const now = new Date();
          
          if (now - cacheTime < CACHE_EXPIRY) {
            // Cache is still valid, return cached response
            return response;
          }
        }
        
        // Cache is expired or no cache exists, fetch from network
        return fetch(event.request)
          .then((networkResponse) => {
            // Clone the response
            const responseToCache = networkResponse.clone();
            
            // Add timestamp to response headers
            const headers = new Headers(responseToCache.headers);
            headers.append('sw-cache-timestamp', new Date().toISOString());
            
            // Cache the new response
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, new Response(responseToCache.body, {
                  status: responseToCache.status,
                  statusText: responseToCache.statusText,
                  headers: headers
                }));
              });
            
            return networkResponse;
          })
          .catch(() => {
            // If network fails and we have a cached response, use it even if expired
            if (response) {
              return response;
            }
            // If no cache exists, return a fallback
            return new Response('Offline content not available');
          });
      })
  );
}); 