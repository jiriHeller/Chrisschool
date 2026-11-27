/* Parťák – rodič: notifikace o testech + jednoduchá offline cache panelu. */
const CACHE = "partak-rodic-v2";
const FILES = ["./", "./index.html", "./manifest.json", "./qrcode.js", "../icon-192.png", "../apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x.startsWith("partak-rodic-") && x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api/")) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(h => h || caches.match("./index.html"))));
});
self.addEventListener("push", e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "Školní parťák", {
    body: d.body || "", tag: d.tag || undefined, icon: "../icon-192.png", badge: "../icon-192.png",
    data: { url: new URL(d.url || "./", self.registration.scope).href },
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const c of list) if (c.url.startsWith(self.registration.scope) && "focus" in c) { c.postMessage({ open: url }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
