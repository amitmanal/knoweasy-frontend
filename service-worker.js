/**
 * KnowEasy Service Worker v1.0
 * 
 * Features:
 * - Offline-first caching strategy
 * - Background sync for offline questions
 * - Push notifications support
 * - Smart cache management
 * - Automatic updates
 * 
 * Author: KnowEasy AI Team
 * Version: 1.0.0
 */

const CACHE_VERSION = 'ke-v1.0.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const API_CACHE = `${CACHE_VERSION}-api`;

// Files to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/study.html',
  '/chat.html',
  '/luma.html',
  '/welcome.html',
  '/me.html',
  '/core.js',
  '/chat-ai.js',
  '/luma.js',
  '/premium-renderer.js',
  '/analytics-engine.js',
  '/styles.css',
  '/premium-theme.css',
  '/manifest.json',
  '/offline.html'
];

// API endpoints to cache
const CACHEABLE_API_PATHS = [
  '/syllabus',
  '/chapters',
  '/lessons'
];

// API endpoints that should never be cached
const NO_CACHE_PATHS = [
  '/solve',
  '/ask',
  '/auth',
  '/billing',
  '/payments'
];

// ============================================================================
// INSTALL
// ============================================================================

self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS.map(url => {
          return new Request(url, { cache: 'reload' });
        })).catch(err => {
          console.warn('[SW] Some assets failed to cache:', err);
          // Don't fail install if some assets missing
          return Promise.resolve();
        });
      })
      .then(() => {
        console.log('[SW] Static assets cached');
        return self.skipWaiting();
      })
  );
});

// ============================================================================
// ACTIVATE
// ============================================================================

self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('ke-') && name !== STATIC_CACHE && name !== DYNAMIC_CACHE && name !== API_CACHE)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Activated');
        return self.clients.claim();
      })
  );
});

// ============================================================================
// FETCH
// ============================================================================

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip chrome-extension and other non-http(s)
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // API requests
  if (isApiRequest(url)) {
    event.respondWith(handleApiRequest(request, url));
    return;
  }
  
  // Static assets - cache first
  if (isStaticAsset(url)) {
    event.respondWith(handleStaticRequest(request));
    return;
  }
  
  // HTML pages - network first with cache fallback
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(handlePageRequest(request));
    return;
  }
  
  // Default - stale while revalidate
  event.respondWith(handleDefaultRequest(request));
});

// ============================================================================
// REQUEST HANDLERS
// ============================================================================

async function handleStaticRequest(request) {
  try {
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

async function handlePageRequest(request) {
  try {
    // Try network first
    const response = await fetch(request);
    
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    // Network failed, try cache
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    
    // Return offline page
    const offlinePage = await caches.match('/offline.html');
    if (offlinePage) {
      return offlinePage;
    }
    
    // Last resort
    return new Response(
      '<html><body><h1>Offline</h1><p>Please check your internet connection.</p></body></html>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}

async function handleApiRequest(request, url) {
  // Check if this endpoint should be cached
  const shouldCache = CACHEABLE_API_PATHS.some(path => url.pathname.includes(path));
  const neverCache = NO_CACHE_PATHS.some(path => url.pathname.includes(path));
  
  if (neverCache) {
    // Never cache - network only
    return fetch(request);
  }
  
  if (shouldCache) {
    // Cache with revalidation
    try {
      const cached = await caches.match(request);
      
      // Fetch in background
      const fetchPromise = fetch(request).then(async (response) => {
        if (response.ok) {
          const cache = await caches.open(API_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      });
      
      // Return cached immediately if available
      if (cached) {
        return cached;
      }
      
      return fetchPromise;
    } catch (error) {
      const cached = await caches.match(request);
      if (cached) return cached;
      throw error;
    }
  }
  
  // Default - network only for API
  return fetch(request);
}

async function handleDefaultRequest(request) {
  // Stale while revalidate
  const cached = await caches.match(request);
  
  const fetchPromise = fetch(request).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);
  
  return cached || fetchPromise || new Response('Offline', { status: 503 });
}

// ============================================================================
// HELPERS
// ============================================================================

function isApiRequest(url) {
  return url.pathname.startsWith('/api') || 
         url.hostname.includes('onrender.com') ||
         url.hostname.includes('supabase');
}

function isStaticAsset(url) {
  const ext = url.pathname.split('.').pop()?.toLowerCase();
  return ['js', 'css', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'woff', 'woff2', 'ttf'].includes(ext);
}

// ============================================================================
// BACKGROUND SYNC
// ============================================================================

self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag);
  
  if (event.tag === 'sync-offline-questions') {
    event.waitUntil(syncOfflineQuestions());
  }
});

async function syncOfflineQuestions() {
  try {
    // Get offline questions from IndexedDB
    // This would be implemented with actual IndexedDB access
    console.log('[SW] Syncing offline questions...');
  } catch (error) {
    console.error('[SW] Sync failed:', error);
  }
}

// ============================================================================
// PUSH NOTIFICATIONS
// ============================================================================

self.addEventListener('push', (event) => {
  console.log('[SW] Push received');
  
  let data = { title: 'KnowEasy', body: 'New update available!' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }
  
  const options = {
    body: data.body,
    icon: '/assets/icons/icon-192.png',
    badge: '/assets/icons/badge-72.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      timestamp: Date.now()
    },
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'dismiss') {
    return;
  }
  
  const url = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Focus existing window if found
        for (const client of clientList) {
          if (client.url === url && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data?.type === 'CACHE_URLS') {
    const urls = event.data.urls || [];
    caches.open(DYNAMIC_CACHE).then(cache => {
      cache.addAll(urls);
    });
  }
  
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
    });
  }
});

// ============================================================================
// PERIODIC SYNC (if supported)
// ============================================================================

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'update-content') {
    event.waitUntil(updateCachedContent());
  }
});

async function updateCachedContent() {
  console.log('[SW] Periodic content update');
  
  try {
    const cache = await caches.open(STATIC_CACHE);
    
    // Re-fetch critical assets
    const criticalAssets = ['/', '/index.html', '/core.js', '/styles.css'];
    
    for (const url of criticalAssets) {
      try {
        const response = await fetch(url, { cache: 'reload' });
        if (response.ok) {
          cache.put(url, response);
        }
      } catch (e) {
        // Ignore individual failures
      }
    }
  } catch (error) {
    console.error('[SW] Periodic update failed:', error);
  }
}

console.log('[SW] Service worker loaded');
