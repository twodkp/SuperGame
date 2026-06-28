// service-worker.js
const CACHE_NAME = 'pwa-cache-v0';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './cat.html',
  './abcd.html',
  './aaee.html',
  './image.png',
  './image0.png',
  './dile.html',
  './hungry.mp4',
  './happy.mp4',
  './angry.mp4'
];

// Install event - cache all files
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Service Worker: Caching files');
        // Cache media files separately without range headers
        const mediaFiles = urlsToCache.filter(url => 
          url.endsWith('.mp3') || url.endsWith('.mp4')
        );
        const otherFiles = urlsToCache.filter(url => 
          !url.endsWith('.mp3') && !url.endsWith('.mp4')
        );
        
        // Cache non-media files normally
        const cacheOthers = cache.addAll(otherFiles);
        
        // Cache media files with full requests
        const cacheMedia = Promise.all(
          mediaFiles.map(url => {
            return fetch(url, { headers: { 'Range': 'bytes=0-' } })
              .then(response => {
                // If range not supported, try regular fetch
                if (response.status === 206 || response.status === 200) {
                  return fetch(url).then(fullResponse => {
                    return cache.put(url, fullResponse);
                  });
                }
                return cache.put(url, response);
              })
              .catch(error => {
                console.error('Failed to cache media:', url, error);
              });
          })
        );
        
        return Promise.all([cacheOthers, cacheMedia]);
      })
      .then(() => {
        console.log('Service Worker: All files cached');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Service Worker: Cache failed', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch event - handle range requests for media files
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const isMedia = url.pathname.endsWith('.mp3') || url.pathname.endsWith('.mp4');
  
  if (isMedia) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request.url).then(cachedResponse => {
          if (!cachedResponse) {
            console.log('Media not in cache, fetching:', url.pathname);
            return fetch(event.request);
          }

          // Handle range requests
          const rangeHeader = event.request.headers.get('range');
          
          if (!rangeHeader) {
            console.log('Serving full media from cache:', url.pathname);
            return cachedResponse;
          }

          // Parse range header
          return cachedResponse.arrayBuffer().then(buffer => {
            const bytes = /^bytes=(\d+)-(\d+)?$/g.exec(rangeHeader);
            
            if (bytes) {
              const start = parseInt(bytes[1], 10);
              const end = bytes[2] ? parseInt(bytes[2], 10) : buffer.byteLength - 1;
              const slicedBuffer = buffer.slice(start, end + 1);
              
              console.log(`Serving range ${start}-${end} from cache:`, url.pathname);
              
              return new Response(slicedBuffer, {
                status: 206,
                statusText: 'Partial Content',
                headers: {
                  'Content-Range': `bytes ${start}-${end}/${buffer.byteLength}`,
                  'Accept-Ranges': 'bytes',
                  'Content-Length': slicedBuffer.byteLength,
                  'Content-Type': cachedResponse.headers.get('Content-Type')
                }
              });
            }
            
            return cachedResponse;
          });
        });
      })
    );
  } else {
    // Handle non-media files normally
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          if (response) {
            console.log('Serving from cache:', event.request.url);
            return response;
          }
          
          console.log('Fetching from network:', event.request.url);
          return fetch(event.request);
        })
        .catch(() => {
          if (event.request.destination === 'document') {
            return caches.match('./offline-debug.html');
          }
        })
    );
  }
});




