const CACHE_NAME = 'chris-dean-davis-cache-v1';
const IMAGE_CACHE_NAME = 'chris-dean-davis-images-v1';
const CACHE_EXPIRATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// List of images to cache
const IMAGES_TO_CACHE = [
  '/images/home/home001.JPG',
  '/images/home/home002.JPG',
  '/images/home/home003.JPG'
];

// Install event - cache the images
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(IMAGE_CACHE_NAME).then((cache) => {
      return cache.addAll(IMAGES_TO_CACHE);
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== IMAGE_CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event - serve from cache if available and not expired
self.addEventListener('fetch', (event) => {
  if (event.request.url.match(/\.(jpg|jpeg|png|gif)$/)) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        if (response) {
          // Check if the cached response is expired
          const cacheTime = new Date(response.headers.get('date')).getTime();
          const now = new Date().getTime();
          
          if (now - cacheTime < CACHE_EXPIRATION) {
            return response;
          }
        }
        
        // If no cache or expired, fetch from network
        return fetch(event.request).then((networkResponse) => {
          // Clone the response as it can only be consumed once
          const responseToCache = networkResponse.clone();
          
          // Store the new response in cache
          caches.open(IMAGE_CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          
          return networkResponse;
        });
      })
    );
  }
}); 