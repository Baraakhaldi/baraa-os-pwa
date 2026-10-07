const CACHE = 'baraa-os-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

// Push from the server: { title, body, url, tag }
self.addEventListener('push', (e) => {
  const data = e.data ? e.data.json() : { title: 'Baraa OS', body: 'New notification' };
  e.waitUntil(self.registration.showNotification(data.title, {
    body: data.body,
    icon: 'icons/icon-192.png',
    tag: data.tag,
    data: { url: data.url || './' }
  }));
});

// Tapping a notification opens its task sheet
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if ('navigate' in c) { try { await c.navigate(url); return c.focus(); } catch (err) {} }
    }
    return self.clients.openWindow(url);
  })());
});
