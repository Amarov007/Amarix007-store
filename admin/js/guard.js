/* يُحمَّل أولاً (ملف خارجي بسبب CSP). 1) منع clickjacking: الصفحة مخفية حتى نتأكد أنها ليست داخل إطار.
   2) مراقب إقلاع: إن لم يستدعِ التطبيق __amxAdminReady خلال 8 ثوانٍ يظهر خطأ واضح بدل شاشة فارغة. */
(function () {
  "use strict";
  var framed = false;
  try {
    framed = window.top !== window.self;
    var host = window.location.hostname || "";
    if (host.includes(".run.app") || host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
      framed = false;
    }
  } catch (e) { framed = true; }
  if (framed) {
    try {
      if (window.top && window.top.location) {
        window.top.location = window.self.location.href;
      }
    } catch (e) {
      // In sandboxed cross-origin iframes, top redirection is blocked
      framed = false;
    }
    if (framed) return;
  }
  var af = document.getElementById("antiframe");
  if (af && af.parentNode) af.parentNode.removeChild(af);
  var ready = false, box = null;
  function show(detail) {
    if (ready || box || !document.body) return;
    box = document.createElement("div");
    box.className = "boot-error"; box.setAttribute("role", "alert");
    var c = document.createElement("div");
    var t = document.createElement("h2"); t.textContent = "تعذّر تحميل لوحة التحكم";
    var p = document.createElement("p"); p.textContent = "تحقّق من الاتصال ثم أعد التحميل. إن استمرت المشكلة امسح ذاكرة المتصفح المؤقتة.";
    var d = document.createElement("small"); d.dir = "ltr"; d.textContent = detail || "";
    var b = document.createElement("button"); b.textContent = "إعادة التحميل"; b.onclick = function () { location.reload(); };
    c.append(t, p, d, b); box.append(c); document.body.append(box);
  }
  window.__amxAdminReady = function () { ready = true; clearTimeout(timer); if (box) box.remove(); };
  var timer = setTimeout(function () { show("timeout: app did not signal ready"); }, 8000);
  window.addEventListener("error", function (e) { if (!ready && /\/admin\/js\//.test((e.target && e.target.src) || e.filename || "")) show((e.message || "module load failed").slice(0, 160)); }, true);
})();
