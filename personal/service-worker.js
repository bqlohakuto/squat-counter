const CACHE = "squat-bar-personal-v19";
const ASSETS = ["./", "./index.html", "./style.css", "./app.js?v=19", "./penalty-sync.js?v=19", "./manifest.webmanifest", "../app-icon.jpg", "../a_clean_cutout_transparent_background_illustration.png", "../staff-2.png", "../staff-manager.png", "../staff-butler.png", "../bar-background-v1.png", "../bar-plant-v1.png", "../bar-amber-lamp-v2.png", "../bar-bottle-display-v2.png", "../bar-velvet-runner-v2.png", "../bar-record-player.png", "../bar-stained-glass-lamp.png", "../bar-dry-flower-vase.png"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(url => new Request(url, { cache: "reload" })))).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE && key.startsWith("squat-bar-personal-")).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const response = await cache.match(event.request, { ignoreSearch: event.request.mode === "navigate" });
    return response || fetch(event.request);
  }));
});
