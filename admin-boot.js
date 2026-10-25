/* AMARIX007 — admin-boot.js
   Loaded FIRST in admin.html (an external file, because the CSP `script-src 'self'` blocks inline scripts).

   1) Anti-clickjacking. admin.html hides the whole page with <style id="antiframe">html{display:none!important}</style>.
      - top-level window  -> the style is removed here (the page is revealed even if admin.js later fails to load)
      - inside a frame    -> the page stays hidden and we try to break out by navigating the top window
   2) Load watchdog. admin.js calls window.__amxAdminReady() once its first screen (login or dashboard) is on screen.
      If that has not happened after ~8 s — or admin.js fails to load / has a syntax error — a visible Arabic error with a
      "reload" button is shown instead of an endless spinner. If the signal arrives later, the error disappears. */
(function () {
  "use strict";

  /* ---- 1) anti-framing + reveal ---- */
  var framed = true;
  try { framed = window.top !== window.self; } catch (e) { framed = true; } // cross-origin top access throwing means we are framed
  if (framed) {
    try { window.top.location = window.self.location.href; } catch (e) {}
    return; // stay hidden, no watchdog: nothing may be shown to a framing page
  }
  var af = document.getElementById("antiframe");
  if (af && af.parentNode) af.parentNode.removeChild(af);

  /* ---- 2) watchdog ---- */
  var ready = false, box = null, WAIT_MS = 8000;

  function hide() { if (box && box.parentNode) box.parentNode.removeChild(box); box = null; }

  function show(detail) {
    if (ready || box) return;
    var host = document.body || document.documentElement;
    if (!host) return;
    box = document.createElement("div");
    box.setAttribute("role", "alert");
    box.id = "amx-boot-err";
    box.style.cssText = "position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(18,19,26,.92);font-family:Alexandria,system-ui,sans-serif;direction:rtl";
    var card = document.createElement("div");
    card.style.cssText = "max-width:420px;width:100%;box-sizing:border-box;padding:24px 20px;border-radius:18px;background:#1b1c26;color:#f3f3f3;border:1px solid #b9ff66;text-align:center;line-height:1.7";
    var h = document.createElement("h2");
    h.textContent = "تعذّر تحميل لوحة التحكم";
    h.style.cssText = "margin:0 0 8px;font-size:18px";
    var p = document.createElement("p");
    p.textContent = "تحقّق من اتصالك بالإنترنت ثم أعد تحميل الصفحة. إذا استمرت المشكلة فامسح ذاكرة المتصفح المؤقتة (الكاش) وحاول مجدداً.";
    p.style.cssText = "margin:0 0 16px;font-size:13.5px;color:#a4a7b5";
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = "إعادة التحميل";
    b.style.cssText = "cursor:pointer;border:0;border-radius:12px;padding:10px 22px;font:700 14px Alexandria,system-ui,sans-serif;background:#b9ff66;color:#191a23";
    b.addEventListener("click", function () { location.reload(); });
    card.appendChild(h); card.appendChild(p);
    if (detail) {
      var d = document.createElement("p");
      d.textContent = detail;
      d.dir = "ltr";
      d.style.cssText = "margin:0 0 14px;font-size:11px;color:#7d8092;word-break:break-all";
      card.appendChild(d);
    }
    card.appendChild(b);
    box.appendChild(card);
    host.appendChild(box);
    try { b.focus(); } catch (e) {}
  }

  window.__amxAdminReady = function () { ready = true; clearTimeout(timer); hide(); };
  var timer = setTimeout(function () { show("timeout: admin.js did not signal ready within " + WAIT_MS / 1000 + "s"); }, WAIT_MS);

  // admin.js missing / blocked (script element error events do not bubble -> capture phase) or broken (syntax error)
  window.addEventListener("error", function (e) {
    if (ready) return;
    var t = e.target, src = (t && t.src) || e.filename || "";
    if (/\/admin\.js(\?|$)/.test(src)) show((e.message || "failed to load admin.js").slice(0, 160));
  }, true);
})();
