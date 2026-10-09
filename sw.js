// Baraa OS service worker · build 4
const CACHE = 'baraa-os-v4';
const SHELL = ['./', './index.html', './app.css', './app.js', './manifest.webmanifest', './icons/icon-192.png', './icons/apple-touch-icon.png',
  './fonts/lexend-latin-400-normal.woff2', './fonts/lexend-latin-500-normal.woff2', './fonts/lexend-latin-600-normal.woff2',
  './fonts/noto-sans-arabic-arabic-400-normal.woff2', './fonts/noto-sans-arabic-arabic-500-normal.woff2'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// Same-origin files: network first, cache as fallback (fonts: cache first)
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.includes('/fonts/')) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {}); return res; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});

// Push from the server: { title, body, url, tag, badge }
self.addEventListener('push', (e) => {
  const data = e.data ? e.data.json() : { title: 'Baraa OS', body: 'New notification' };
  const jobs = [self.registration.showNotification(data.title, { body: data.body, icon: 'icons/icon-192.png', tag: data.tag, data: { url: data.url || './' } })];
  if (typeof data.badge === 'number' && self.navigator && 'setAppBadge' in self.navigator) {
    jobs.push((data.badge ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge()).catch(() => {}));
  }
  e.waitUntil(Promise.all(jobs));
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
