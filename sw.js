
const CACHE = "nextplan-public-index-BZCs0w_e.css-index-BtJtMhut.js";
const CORE = ["./","./index.html","./manifest.webmanifest","./favicon.svg","./apple-touch-icon.png","./icon-192.png","./icon-512.png","./assets/index-BZCs0w_e.css","./assets/index-BtJtMhut.js"];
const root = self.registration.scope;
self.addEventListener("install", event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE.map(x => new URL(x, root).href))).then(() => self.skipWaiting())));
self.addEventListener("activate", event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("nextplan-public-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", event => {
  if(event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if(response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy))); }
    return response;
  }).catch(async () => (await caches.match(event.request)) || (event.request.mode === "navigate" ? await caches.match(new URL("index.html", root).href) : Response.error())));
});
