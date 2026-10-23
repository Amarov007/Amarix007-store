/* AMARIX007 service worker (optional, intentionally small)
   - app.js / style.css / store-data.js: network-first (always revalidated, so a new deploy shows at once)
   - icons: cached
   - push notifications: shows the message sent by the send-push edge function; a tap opens the order page
   - everything else (HTML, Supabase API, auth, storage): untouched, never cached */
const ICONS_CACHE = "amx-icons-v3";
const ICONS = ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "favicon-64.png", "logo-mark.png", "logo-word.png"];
const CODE = /\/(app\.js|style\.css|store-data\.js|splash\.js|splash\.css)$/;

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

/* ---------- Web Push ---------- */
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { try { d = { body: e.data.text() }; } catch {} }
  e.waitUntil(
    self.registration.showNotification(d.title || "AMARIX007", {
      body: d.body || "",
      icon: "icon-192.png",
      badge: "favicon-64.png",
      tag: d.tag || "amx",
      renotify: true,
      dir: "rtl",
      lang: "ar",
      vibrate: [120, 60, 120],
      data: { url: d.url || "#/orders" },
    })
  );
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const hash = (e.notification.data && e.notification.data.url) || "#/orders";
  const home = new URL("./index.html", self.registration.scope).href;
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const c = list.find((w) => w.url.startsWith(new URL("./", self.registration.scope).href));
      if (c) {
        c.postMessage({ type: "amx-nav", hash });
        return c.focus();
      }
      return clients.openWindow(home + hash);
    })
  );
});
