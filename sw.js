/* AMARIX007 service worker (optional, intentionally small)
   - app.js / style.css / store-data.js: network-first (always revalidated, so a new deploy shows at once)
   - icons: cached
   - everything else (HTML, Supabase API, auth, storage): untouched, never cached */
const ICONS_CACHE = "amx-icons-v1";
const ICONS = ["icon.svg", "icon-192.png", "icon-512.png"];
const CODE = /\/(app\.js|style\.css|store-data\.js)$/;

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(ICONS_CACHE)
      .then((c) => c.addAll(ICONS))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== ICONS_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Supabase and fonts: not our business
  if (CODE.test(url.pathname)) {
    e.respondWith(fetch(req, { cache: "no-cache" }).catch(() => fetch(req)));
    return;
  }
  if (ICONS.some((i) => url.pathname.endsWith("/" + i))) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(ICONS_CACHE).then((c) => c.put(req, copy)); }
      return r;
    })));
  }
});
