const CACHE_NAME = 'steuberwork-v5'
const VAPID_PUBLIC_KEY = 'BIVxcSSeFZEXfg82j5-GQR6x4nOZxgiFVaPbRxkBarjj8oP2y7auEww2-aWuj_PpOcBuXXzrBbqU_D8eNqTEZik'

// Install & cache
self.addEventListener('install', e => {
  self.skipWaiting()
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(['/', '/index.html'])
    )
  )
})

// Activate: delete all old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    ).then(() => clients.claim())
  )
})

// Fetch – network first, fallback to cache
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  )
})

// Push notification handler
self.addEventListener('push', e => {
  if (!e.data) return
  const data = e.data.json()
  e.waitUntil(
    self.registration.showNotification(data.title || 'SteuberWork', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'steuberwork',
      data: { url: data.url || '/' },
      vibrate: [200, 100, 200],
      requireInteraction: data.requireInteraction || false,
    })
  )
})

// Notification click → open app
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data?.url || '/'
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const existing = cs.find(c => c.url.includes(self.location.origin))
      if (existing) return existing.focus()
      return clients.openWindow(url)
    })
  )
})

// Update on demand: main.tsx sendet SKIP_WAITING wenn Nutzer "Jetzt laden" klickt
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
