/* AMARIX007 — boot.js (loaded in <head>, same-origin so it passes the CSP `script-src 'self'`)
   1) Static page paths (/policies, /faq) open inside the app on their hash route.
   2) Google Fonts: index.html ships the stylesheet link with media="print" (so it never blocks the first paint);
      inline onload handlers are blocked by the CSP, so it is switched to "all" here once the page has loaded. */
(function () {
  try {
    var m = location.pathname.match(/^\/(policies|faq)(?:\/(?:index\.html)?)?$/);
    if (m && !location.hash) {
      history.replaceState(null, "", "/" + location.search + "#/" + m[1]);
    }
  } catch (e) {}

  function fonts() {
    var l = document.getElementById("gf");
    if (l && l.media !== "all") l.media = "all";
  }
  if (document.readyState === "complete") fonts();
  else addEventListener("load", fonts);
})();
