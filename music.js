/* AMARIX007 — background music (music.m4a).
   • Starts when the site opens: right after the splash screen, with a soft fade-in.
   • Browsers block sound before the first touch/click. If that happens, the music starts on the very first tap
     anywhere on the page (taps made while the splash is showing "unlock" audio, so it starts the moment the
     splash leaves, also on iPhone/Safari).
   • One <audio> element lives for the whole visit, so the music keeps playing (loop) while the visitor moves
     between pages — the store is a single page with #/ routes, nothing restarts.
   • Pauses when the tab/app goes to the background and resumes when it comes back.
   • The visitor's choice (header button / menu) is remembered in localStorage 'amx_music' ('0' = off).
   • Data Saver on and no saved choice → starts off (button still works).
   API: window.AMXMusic = { on, playing, toggle() }   event: 'amx:music' on window when the state changes. */
(function () {
  'use strict';
  var d = document, w = window, root = d.documentElement;
  var SRC = 'music.m4a?v=1', KEY = 'amx_music', VOL = 0.55, FADE_IN = 2500;
  var a = null, pref = true, resume = false, quiet = 0, starting = false, unlocking = false, fadeT = 0;
  var splashUp = !!d.getElementById('amx-splash') && !root.classList.contains('amx-skip');

  try {
    var saved = localStorage.getItem(KEY);
    if (saved === '0') pref = false;
    else if (saved === null && navigator.connection && navigator.connection.saveData) pref = false;
  } catch (e) {}
  function save() { try { localStorage.setItem(KEY, pref ? '1' : '0'); } catch (e) {} }
  function emit() { try { w.dispatchEvent(new Event('amx:music')); } catch (e) {} }

  function el() {
    if (a) return a;
    a = new Audio();
    a.loop = true;
    a.preload = 'auto';
    a.volume = 0;
    a.setAttribute('playsinline', '');
    a.src = SRC;
    a.addEventListener('play', emit);
    a.addEventListener('pause', function () { if (quiet > 0) quiet--; else resume = false; emit(); });  // phone call, headset unplugged...
    a.addEventListener('error', emit);                                                    // missing file: stay silent, never break the store
    return a;
  }

  /* our own pause() fires its 'pause' event later, so count them instead of using a flag */
  function quietPause() { if (a && !a.paused) { quiet++; try { a.pause(); } catch (e) { quiet--; } } }

  function fade(to, ms, done) {
    clearInterval(fadeT);
    var m = el(), from = m.volume, t0 = Date.now();
    fadeT = setInterval(function () {
      var k = Math.min(1, (Date.now() - t0) / ms);
      try { m.volume = Math.max(0, Math.min(1, from + (to - from) * k)); } catch (e) {}
      if (k >= 1) { clearInterval(fadeT); if (done) done(); }
    }, 40);
  }

  function tryPlay() {
    if (!pref || d.hidden || splashUp || starting || unlocking) return;
    var m = el();
    if (!m.paused) { fade(VOL, 800); return; }   // still fading out from a quick off/on
    starting = true;
    m.volume = 0;
    var p;
    try { p = m.play(); } catch (e) { starting = false; return; }
    if (p && p.then) p.then(function () { starting = false; disarm(); fade(VOL, FADE_IN); },
                            function () { starting = false; });          // blocked: wait for the first tap
    else { starting = false; fade(VOL, FADE_IN); }
  }

  /* iOS/Safari only lets a media element play later if it was started once inside a tap, so a tap during the
     splash starts it silently and pauses it again; the real start happens when the splash is gone. */
  function unlock() {
    if (unlocking || starting) return;
    var m = el();
    if (!m.paused) return;
    unlocking = true;
    m.muted = true;
    var done = function () {
      quietPause(); try { m.currentTime = 0; } catch (e) {}
      m.muted = false; unlocking = false;
      if (!splashUp) tryPlay();
    };
    var p;
    try { p = m.play(); } catch (e) { m.muted = false; unlocking = false; return; }
    if (p && p.then) p.then(done, function () { m.muted = false; unlocking = false; });
    else done();
  }

  var evs = ['pointerup', 'touchend', 'mousedown', 'keydown', 'click'];
  function onGesture(e) {
    var t = e && e.target;
    if (t && t.closest && t.closest('[data-a="music"]')) return;   // that button decides by itself
    if (!pref) return;
    if (splashUp) { unlock(); return; }
    if (a && !a.paused) { disarm(); return; }
    tryPlay();
  }
  function arm() { evs.forEach(function (n) { d.addEventListener(n, onGesture, true); }); }
  function disarm() { evs.forEach(function (n) { d.removeEventListener(n, onGesture, true); }); }

  function toggle() {
    if (pref && a && !a.paused) {            // playing -> off
      pref = false; save(); resume = false;
      fade(0, 350, function () { quietPause(); emit(); });
    } else if (pref) {                       // on, but blocked/interrupted -> start now (this tap is the gesture)
      tryPlay();
    } else {                                 // off -> on
      pref = true; save(); arm(); tryPlay();
    }
    emit();
  }

  d.addEventListener('visibilitychange', function () {
    if (d.hidden) {
      if (a && !a.paused) { resume = true; clearInterval(fadeT); quietPause(); }
    } else if (resume && pref) { resume = false; tryPlay(); }
  });

  function splashGone() { if (!splashUp) return; splashUp = false; tryPlay(); }
  w.addEventListener('amx:splash-done', splashGone);

  w.AMXMusic = {
    get on() { return pref; },
    get playing() { return !!a && !a.paused; },
    toggle: toggle
  };

  function init() {
    arm();
    if (pref) el();                                        // starts downloading (≈1.3 MB) so it is ready at splash end
    if (splashUp) setTimeout(splashGone, 8000);            // failsafe if the splash never reports back
    else tryPlay();
  }
  if (d.readyState === 'complete') setTimeout(init, 0); else w.addEventListener('load', function () { setTimeout(init, 0); });
})();
