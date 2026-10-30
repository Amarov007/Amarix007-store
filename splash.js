/* AMARIX007 — splash controller + synthesized sound (Web Audio, no audio files).
   v2 — smooth start & glitch-free sound:
   • the sound is rendered ONCE, offline (OfflineAudioContext), normalised and faded, then played as a single
     plain buffer — no live reverb/delay/compressor running while the page loads, so no crackle or stutter;
   • the animation only starts after the logo images are decoded and the sound is ready, and both start in the
     same instant (no static logo "popping in", no audio/visual drift).
   Runs once per browsing session. Sound autoplays inside the installed app; in a plain
   browser tab (autoplay blocked) it plays on the first tap while the splash is still visible.
   Disable sound:  localStorage.setItem('amx_splash_snd','0')   */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  // once per session (a cold start of the installed app is a new session)
  try {
    if (sessionStorage.getItem('amx_splash') === '1') { root.classList.add('amx-skip'); return; }
    sessionStorage.setItem('amx_splash', '1');
  } catch (e) {}

  var T0 = Date.now(), T1 = 0, MIN = reduce ? 500 : 1100, MAX = 2600;
  var el = null, loaded = false, begun = false, done = false, ctx = null, played = false;
  var bufIntro = null, bufExit = null;
  var soundOn = true;
  try { soundOn = localStorage.getItem('amx_splash_snd') !== '0'; } catch (e) {}
  if (reduce) soundOn = false;

  /* ------------------------------ sound ------------------------------ */
  function noiseBuf(c, sec) {
    var n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (var ch = 0; ch < 2; ch++) { var a = b.getChannelData(ch); for (var i = 0; i < n; i++) a[i] = Math.random() * 2 - 1; }
    return b;
  }
  function impulse(c, sec, decay) {
    var n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (var ch = 0; ch < 2; ch++) { var a = b.getChannelData(ch); for (var i = 0; i < n; i++) a[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }
  function pan(c, from, to, t, dur) {
    if (!c.createStereoPanner) return null;
    var p = c.createStereoPanner(); p.pan.setValueAtTime(from, t); p.pan.linearRampToValueAtTime(to, t + dur); return p;
  }
  function bell(c, out, f, t, peak, dec) {
    // soft glassy bell: fundamental + two inharmonic partials
    [[1, 1], [2.01, .32], [3.98, .1]].forEach(function (p) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f * p[0];
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak * p[1], t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec / (p[0] > 1 ? 1.6 : 1));
      o.connect(g); g.connect(out); o.start(t); o.stop(t + dec + 0.05);
    });
  }
  function bus(c) {
    var master = c.createGain(); master.gain.value = 0.55;
    var comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.22;
    master.connect(comp); comp.connect(c.destination);
    var rev = c.createConvolver(); rev.buffer = impulse(c, 2.4, 2.8);
    var revG = c.createGain(); revG.gain.value = 0.34; rev.connect(revG); revG.connect(master);
    var dly = c.createDelay(1); dly.delayTime.value = 0.21; var fb = c.createGain(); fb.gain.value = 0.28;
    dly.connect(fb); fb.connect(dly); var dlyG = c.createGain(); dlyG.gain.value = 0.22; dly.connect(dlyG); dlyG.connect(master); dlyG.connect(rev);
    var inp = c.createGain(); inp.connect(master); inp.connect(rev);
    var chime = c.createGain(); chime.connect(inp); chime.connect(dly);
    return { inp: inp, chime: chime };
  }
  function playIntro(c) {
    var b = bus(c), t = c.currentTime + 0.06, nb = noiseBuf(c, 3);

    // 1) rising wave swell (filtered noise sweeping up, stereo drift)
    var s = c.createBufferSource(); s.buffer = nb;
    var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(220, t); bp.frequency.exponentialRampToValueAtTime(2600, t + 1.0); bp.frequency.exponentialRampToValueAtTime(1100, t + 2.0);
    var g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.95); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
    var p = pan(c, -0.7, 0.7, t, 1.6);
    s.connect(bp); bp.connect(g); if (p) { g.connect(p); p.connect(b.inp); } else g.connect(b.inp);
    s.start(t); s.stop(t + 2.2);

    // 2) low water bed
    var s2 = c.createBufferSource(); s2.buffer = nb;
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(380, t); lp.frequency.linearRampToValueAtTime(1200, t + 1.2); lp.frequency.linearRampToValueAtTime(300, t + 2.6);
    var g2 = c.createGain(); g2.gain.setValueAtTime(0.0001, t); g2.gain.linearRampToValueAtTime(0.12, t + 1.0); g2.gain.linearRampToValueAtTime(0.0001, t + 2.7);
    s2.connect(lp); lp.connect(g2); g2.connect(b.inp); s2.start(t); s2.stop(t + 2.8);

    // 3) soft impact as the logo lands
    var ti = t + 0.55;
    var o = c.createOscillator(), og = c.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(150, ti); o.frequency.exponentialRampToValueAtTime(52, ti + 0.45);
    og.gain.setValueAtTime(0.0001, ti); og.gain.exponentialRampToValueAtTime(0.7, ti + 0.012); og.gain.exponentialRampToValueAtTime(0.0001, ti + 0.85);
    o.connect(og); og.connect(b.inp); o.start(ti); o.stop(ti + 0.9);
    var o2 = c.createOscillator(), og2 = c.createGain(); o2.type = 'triangle'; o2.frequency.value = 196; // audible on phone speakers
    og2.gain.setValueAtTime(0.0001, ti); og2.gain.exponentialRampToValueAtTime(0.18, ti + 0.01); og2.gain.exponentialRampToValueAtTime(0.0001, ti + 0.6);
    o2.connect(og2); og2.connect(b.inp); o2.start(ti); o2.stop(ti + 0.65);

    // 4) ascending arpeggio + resolving chord (C major, lifted)
    var N = [[523.25, 0.80, 0.16], [659.25, 0.98, 0.16], [783.99, 1.16, 0.16], [1046.5, 1.34, 0.19]];
    N.forEach(function (n) { bell(c, b.chime, n[0], t + n[1], n[2], 1.5); });
    [[523.25, .15], [783.99, .12], [1318.5, .10]].forEach(function (n) { bell(c, b.chime, n[0], t + 1.62, n[1], 2.4); });

    // 5) sparkle tail
    var s3 = c.createBufferSource(); s3.buffer = nb;
    var hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6500;
    var g3 = c.createGain(); g3.gain.setValueAtTime(0.0001, t + 1.6); g3.gain.exponentialRampToValueAtTime(0.03, t + 1.64); g3.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    s3.connect(hp); hp.connect(g3); g3.connect(b.inp); s3.start(t + 1.6); s3.stop(t + 2.5);
  }
  function playExit(c) {
    var b = bus(c), t = c.currentTime + 0.02, s = c.createBufferSource(); s.buffer = noiseBuf(c, 1.2);
    var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(3200, t + 0.75);
    var g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
    var p = pan(c, -0.4, 0.4, t, 0.8);
    s.connect(bp); bp.connect(g); if (p) { g.connect(p); p.connect(b.inp); } else g.connect(b.inp);
    s.start(t); s.stop(t + 1);
  }

  /* Offline render -> one finished AudioBuffer (normalised, click-free). Resolves null on any failure. */
  function finish(buf) {
    try {
      var n = buf.length, sr = buf.sampleRate, ch, i, peak = 0, a;
      for (ch = 0; ch < buf.numberOfChannels; ch++) { a = buf.getChannelData(ch); for (i = 0; i < n; i++) { var v = a[i] < 0 ? -a[i] : a[i]; if (v > peak) peak = v; } }
      if (peak < 0.0001) return null;
      var k = 0.6 / peak, fi = Math.floor(sr * 0.008), fo = Math.floor(sr * 0.06);
      for (ch = 0; ch < buf.numberOfChannels; ch++) {
        a = buf.getChannelData(ch);
        for (i = 0; i < n; i++) a[i] *= k;
        for (i = 0; i < fi; i++) a[i] *= i / fi;
        for (i = 0; i < fo; i++) a[n - 1 - i] *= i / fo;
      }
      return buf;
    } catch (e) { return null; }
  }
  function render(sr, sec, fn) {
    return new Promise(function (res) {
      var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext, oc;
      if (!OAC) return res(null);
      try { oc = new OAC(2, Math.ceil(sr * sec), sr); fn(oc); } catch (e) { return res(null); }
      var ok = function (b) { res(b ? finish(b) : null); };
      try {
        var p = oc.startRendering();
        if (p && p.then) p.then(ok, function () { res(null); });
        else oc.oncomplete = function (ev) { ok(ev.renderedBuffer); };
      } catch (e) { res(null); }
    });
  }
  function makeCtx() {
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { return new AC({ latencyHint: 'playback' }); } catch (e) {}   // bigger audio buffer = no under-runs on weak phones
    try { return new AC(); } catch (e) { return null; }
  }
  function prepareSound() {
    if (!soundOn) return Promise.resolve();
    ctx = makeCtx(); if (!ctx) { soundOn = false; return Promise.resolve(); }
    return render(ctx.sampleRate, 5.2, playIntro).then(function (b) { bufIntro = b; if (!b) soundOn = false; });
  }
  function prepareExit() {
    if (!soundOn || !ctx || !bufIntro) return;
    render(ctx.sampleRate, 1.4, playExit).then(function (b) { bufExit = b; });
  }
  function playBuf(buf) {
    var s = ctx.createBufferSource(); s.buffer = buf; s.connect(ctx.destination); s.start(0);
  }
  function startSound() {
    if (!soundOn || !bufIntro || !ctx || played || done) return;
    var go = function () { if (played || done || ctx.state !== 'running') return; played = true; try { playBuf(bufIntro); } catch (e) {} };
    if (ctx.state === 'running') go();
    else { try { var r = ctx.resume(); if (r && r.then) r.then(go, function () {}); } catch (e) {} }
  }
  function armGesture() {
    var h = function () { startSound(); if (played) off(); };
    var evs = ['pointerdown', 'touchstart', 'keydown', 'click'];
    var off = function () { evs.forEach(function (e) { d.removeEventListener(e, h, true); }); };
    evs.forEach(function (e) { d.addEventListener(e, h, true); });
  }

  /* ------------------------------ lifecycle ------------------------------ */
  function exit() {
    if (done || !el) return; done = true;
    if (soundOn && played && ctx && ctx.state === 'running' && bufExit) { try { playBuf(bufExit); } catch (e) {} }
    el.classList.add('amx-out');
    var gone = false, rm = function () {
      if (gone) return; gone = true;
      if (el && el.parentNode) el.parentNode.removeChild(el);
      if (ctx) setTimeout(function () { try { ctx.close(); } catch (e) {} }, 6000);
      try { window.dispatchEvent(new Event('amx:splash-done')); } catch (e) {}
    };
    el.addEventListener('transitionend', function (ev) { if (ev.target === el) rm(); });
    setTimeout(rm, 1300);
  }
  function check() {
    if (done) return;
    var now = Date.now();
    if ((begun && loaded && now - T1 >= MIN) || now - T0 >= MAX) exit();
    else setTimeout(check, 120);
  }
  /* animation + sound start together, only once everything they need is ready */
  function begin() {
    if (begun || done || !el) return; begun = true; T1 = Date.now();
    el.classList.add('amx-go');
    startSound();
    setTimeout(prepareExit, 250);
    check();
  }
  function decodeImg(i) {
    return new Promise(function (res) {
      try {
        if (i.decode) { i.decode().then(res, res); return; }
        if (i.complete) return res();
        i.addEventListener('load', res); i.addEventListener('error', res);
      } catch (e) { res(); }
    });
  }
  function init() {
    el = d.getElementById('amx-splash'); if (!el) return;
    armGesture();
    if (d.readyState === 'complete') loaded = true; else window.addEventListener('load', function () { loaded = true; check(); });
    if (!window.Promise) { begin(); return; }
    var imgs = Array.prototype.slice.call(el.querySelectorAll('img')).map(decodeImg);
    var ready = Promise.all(imgs.concat([prepareSound()]));
    var cap = new Promise(function (r) { setTimeout(r, 1200); });
    Promise.race([ready, cap]).then(begin, begin);
    check();
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
})();
