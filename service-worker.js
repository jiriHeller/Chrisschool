/* Školní parťák – offline cache. Při změně souborů zvyš číslo verze. */
const CACHE = "skolni-partak-v20";
const FILES = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png",
  "./fonts/IBMPlexSans-Regular.woff2","./fonts/IBMPlexSans-Medium.woff2","./fonts/IBMPlexSans-SemiBold.woff2","./fonts/IBMPlexSans-Bold.woff2",
  "./fonts/IBMPlexMono-Medium.woff2","./fonts/IBMPlexMono-SemiBold.woff2"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // Písma z Google Fonts: uložit při prvním načtení, offline použít z cache
  if (url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com")) {
    e.respondWith(caches.open(CACHE).then(c => c.match(e.request).then(hit => hit || fetch(e.request).then(r => { c.put(e.request, r.clone()); return r; }).catch(() => hit))));
    return;
  }
  if (url.origin !== location.origin) return;
  // Vlastní soubory: nejdřív síť (kvůli aktualizacím), offline z cache
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request).then(hit => hit || caches.match("./index.html"))));
});
