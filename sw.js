/* AMARIX007 service worker
   - app shell (index.html, app.js, style.css, store-data.js, music.js, splash.*): network-first, and every good response is kept,
     so the store still opens with no connection (it then shows the last published catalogue saved in localStorage)
   - icons and logos: cache-first
   - admin page, Supabase API, auth, storage, fonts: untouched, never cached
   - push notifications: shows the message sent by the send-push edge function; a tap opens the order page */
const ICONS_CACHE = "amx-icons-v4";
const SHELL_CACHE = "amx-shell-v24";
const ICONS = ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "favicon-64.png", "logo-mark.webp", "logo-word.webp"];
const SHELL = ["./", "index.html", "boot.js", "app.js", "style.css", "store-data.js", "music.js", "svc-parse.js", "hubs.js", "splash.js", "splash.css"];
const CODE = /\/(boot\.js|app\.js|style\.css|store-data\.js|music\.js|svc-parse\.js|hubs\.js|splash\.js|splash\.css)$/;
const ADMIN = /\/admin\.(html|js|css)$/;

self.addEventListener("install", (e) => {
  e.waitUntil(
    Promise.all([
      caches.open(ICONS_CACHE).then((c) => c.addAll(ICONS)).catch(() => {}),
      caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).catch(() => {}),
    ]).then(() => self.skipWaiting())
  );
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== ICONS_CACHE && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* network first; a good answer refreshes the copy, a failure falls back to the last copy (query strings like ?v=27 are ignored) */
function networkFirst(req, fallbackUrl) {
  return fetch(req, { cache: "no-cache" })
    .then((r) => {
      if (r && r.ok) {
        const copy = r.clone();
        caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
      }
      return r;
    })
    .catch(() =>
      caches.match(req, { ignoreSearch: true }).then((hit) => hit || (fallbackUrl ? caches.match(fallbackUrl, { ignoreSearch: true }) : undefined) || Response.error())
    );
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Supabase, fonts, Turnstile: not our business
  if (ADMIN.test(url.pathname)) return; // the admin panel is never cached
  if (req.mode === "navigate") {
    e.respondWith(networkFirst(req, "index.html"));
    return;
  }
  if (CODE.test(url.pathname)) {
    e.respondWith(networkFirst(req));
    return;
  }
  if (ICONS.some((i) => url.pathname.endsWith("/" + i))) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((r) => {
        if (r.ok) { const copy = r.clone(); caches.open(ICONS_CACHE).then((c) => c.put(req, copy)); }
        return r;
      }))
    );
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
