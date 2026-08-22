const CACHE = "squat-bar-v4";
const ASSETS = ["./", "./index.html", "./style.css", "./app.js", "./manifest.webmanifest", "./icon.svg"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => event.respondWith(caches.match(event.request).then(response => response || fetch(event.request))));
self.addEventListener("push", event => {
  const payload = event.data?.json() || { title: "SQUAT BAR", body: "今日の一杯、まだ残ってるよ。" };
  event.waitUntil(self.registration.showNotification(payload.title, { body: payload.body, icon: "icon.svg", tag: "daily-squat-reminder" }));
});
self.addEventListener("notificationclick", event => { event.notification.close(); event.waitUntil(clients.openWindow("./")); });
