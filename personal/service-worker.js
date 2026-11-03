const CACHE = "squat-bar-personal-v16";
const ASSETS = ["./", "./index.html", "./style.css", "./app.js", "./penalty-sync.js", "./manifest.webmanifest", "../app-icon.jpg", "../a_clean_cutout_transparent_background_illustration.png", "../staff-2.png", "../staff-manager.png", "../staff-butler.png", "../bar-background-v1.png", "../bar-plant-v1.png", "../bar-record-player.png", "../bar-stained-glass-lamp.png", "../bar-dry-flower-vase.png"];
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE && key.startsWith("squat-bar-personal-")).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => event.respondWith(caches.match(event.request).then(response => response || fetch(event.request))));
