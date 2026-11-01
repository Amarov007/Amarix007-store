/* AMARIX007 — boot.js (loaded in <head>, same-origin so it passes the CSP `script-src 'self'`)
   0) Applies the saved theme before the first paint (no white flash in night mode).
   1) Static page paths (/policies, /faq) open inside the app on their hash route.
   2) Google Fonts: index.html ships the stylesheet link with media="print" (so it never blocks the first paint);
      inline onload handlers are blocked by the CSP, so it is switched to "all" here once the page has loaded. */
(function () {
  // 0) Theme before first paint: the app is dark by default (localStorage "th2"), but index.html ships data-theme="light",
  //    which flashed a white page before app.js ran. Set the stored/default theme right here (same rule as `let th` in app.js).
  try {
    var dark = localStorage.getItem("th2") !== "light";
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    var tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute("content", dark ? "#12131a" : "#ffffff");
  } catch (e) {}

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
