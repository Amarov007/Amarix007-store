/**
 * AMARIX007 — Visual Effects & Motion Engine (Vanilla JS)
 * High-performance, accessible, zero external dependencies.
 * Respects prefers-reduced-motion, low-power mode, and strict CSP.
 */
(function () {
  "use strict";

  const prefersReducedMotion = () =>
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const isLowEndDevice = () => {
    try {
      const conn = navigator.connection;
      if (conn && (conn.saveData || /2g/i.test(conn.effectiveType || ""))) return true;
      if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) return true;
    } catch (_) {}
    return false;
  };

  /* =========================================================================
     1. Scroll Reveal (Immediate, stable rendering to eliminate tremors)
     ========================================================================= */
  function initRevealObserver() {
    document.querySelectorAll(".cd, .pr-r, .ct, .ban-w, .sec-t, .sec-h, .amx-rv").forEach((el) => {
      el.classList.add("amx-revealed");
    });
  }

  /* =========================================================================
     2. SplitText / BlurText on Headings (Disabled to prevent DOM thrashing)
     ========================================================================= */
  function initBlurText() {
    // Keep typography stable and prevent layout shifts
    return;
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /* =========================================================================
     3. SpotlightCard & TiltedCard (3D perspective <= 5deg on pointer:fine)
     ========================================================================= */
  function initSpotlights() {
    const cards = document.querySelectorAll(".cd:not([data-spot-init]), .ct:not([data-spot-init])");
    const hasFinePointer = window.matchMedia && window.matchMedia("(pointer: fine)").matches;

    cards.forEach((card) => {
      card.setAttribute("data-spot-init", "1");

      card.addEventListener(
        "pointermove",
        (e) => {
          if (prefersReducedMotion()) return;
          const rect = card.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          card.style.setProperty("--spot-x", x + "px");
          card.style.setProperty("--spot-y", y + "px");
          card.style.setProperty("--spot-op", "1");

          if (hasFinePointer && card.classList.contains("cd")) {
            const w = rect.width;
            const h = rect.height;
            const rx = (((y - h / 2) / (h / 2)) * -4.5).toFixed(2);
            const ry = (((x - w / 2) / (w / 2)) * 4.5).toFixed(2);
            card.style.transform = `perspective(600px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(2px)`;
          }
        },
        { passive: true }
      );

      card.addEventListener(
        "pointerleave",
        () => {
          card.style.setProperty("--spot-op", "0");
          if (hasFinePointer && card.classList.contains("cd")) {
            card.style.transform = "";
          }
        },
        { passive: true }
      );
    });
  }

  /* =========================================================================
     4. Magnetic Buttons & ClickSpark
     ========================================================================= */
  function initMagneticButtons() {
    if (prefersReducedMotion()) return;
    const hasFinePointer = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
    if (!hasFinePointer) return;

    const btns = document.querySelectorAll(
      ".btn-p:not([data-mag-init]), #buy-now:not([data-mag-init]), .b.cta:not([data-mag-init])"
    );
    btns.forEach((btn) => {
      btn.setAttribute("data-mag-init", "1");
      btn.addEventListener(
        "mousemove",
        (e) => {
          const rect = btn.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dx = Math.max(-4, Math.min(4, (e.clientX - cx) * 0.1));
          const dy = Math.max(-4, Math.min(4, (e.clientY - cy) * 0.1));
          btn.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
        },
        { passive: true }
      );
      btn.addEventListener(
        "mouseleave",
        () => {
          btn.style.transform = "";
        },
        { passive: true }
      );
    });
  }

  function setupClickSpark() {
    if (prefersReducedMotion()) return;
    document.addEventListener(
      "pointerdown",
      (e) => {
        const target = e.target;
        if (!target) return;
        const btn = target.closest("button, a, .cd, [data-a], input[type='submit']");
        if (!btn) return;

        const count = 5;
        const x = e.clientX;
        const y = e.clientY;
        for (let i = 0; i < count; i++) {
          const spark = document.createElement("span");
          spark.className = "amx-spark";
          const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
          const dist = 14 + Math.random() * 14;
          const tx = Math.cos(angle) * dist;
          const ty = Math.sin(angle) * dist;
          spark.style.left = x + "px";
          spark.style.top = y + "px";
          spark.style.setProperty("--tx", tx.toFixed(1) + "px");
          spark.style.setProperty("--ty", ty.toFixed(1) + "px");
          document.body.appendChild(spark);
          setTimeout(() => spark.remove(), 400);
        }
      },
      { passive: true }
    );
  }

  /* =========================================================================
     5. CountUp Animation for Numbers (balances, order totals)
     ========================================================================= */
  function initCountUp() {
    if (prefersReducedMotion()) return;
    const counters = document.querySelectorAll(
      "[data-countup]:not([data-counted]), .num-cnt:not([data-counted])"
    );
    counters.forEach((el) => {
      el.setAttribute("data-counted", "1");
      const raw = el.textContent || "";
      const num = parseFloat(raw.replace(/[^\d.]/g, ""));
      if (isNaN(num) || num <= 0) return;
      const isDecimal = raw.includes(".");
      const duration = 700;
      const startTime = performance.now();

      function update(t) {
        const elapsed = t - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        const current = (num * ease);
        el.textContent = isDecimal ? current.toFixed(2) : Math.round(current).toString();
        if (progress < 1) {
          requestAnimationFrame(update);
        } else {
          el.textContent = raw;
        }
      }
      requestAnimationFrame(update);
    });
  }

  /* =========================================================================
     6. Sliding Nav Indicator for #nv
     ========================================================================= */
  function updateNav() {
    const nv = document.getElementById("nv");
    if (!nv) return;
    let slide = document.getElementById("nv-slide");
    if (!slide) {
      slide = document.createElement("span");
      slide.id = "nv-slide";
      slide.className = "nv-slide";
      slide.setAttribute("aria-hidden", "true");
      nv.insertBefore(slide, nv.firstChild);
    }
    const active = nv.querySelector("a.on");
    // If active is the highlighted centre orders button (.hl) or no active, hide sliding background
    if (!active || active.classList.contains("hl")) {
      slide.style.opacity = "0";
      return;
    }
    const nvRect = nv.getBoundingClientRect();
    const actRect = active.getBoundingClientRect();
    const left = actRect.left - nvRect.left;
    slide.style.width = actRect.width + "px";
    slide.style.transform = `translateX(${left}px)`;
    slide.style.opacity = "1";
  }

  /* =========================================================================
     7. Hero Aurora / Dot Grid Canvas (Low power, throttled to 30fps)
     ========================================================================= */
  let canvasRAF = null;
  let canvasActive = false;

  function setupCanvas() {
    const canvas = document.getElementById("amx-hero-canvas");
    if (!canvas) return;
    if (prefersReducedMotion() || isLowEndDevice() || window.innerWidth <= 768) {
      canvas.style.display = "none";
      return;
    }

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);

    function resize() {
      const header = canvas.parentElement;
      if (!header) return;
      width = header.clientWidth;
      height = header.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx.scale(dpr, dpr);
    }

    resize();
    window.addEventListener("resize", resize, { passive: true });

    // Grid dots configuration
    const spacing = 28;
    let time = 0;
    let lastFrame = 0;

    function render(now) {
      if (!canvasActive) return;
      canvasRAF = requestAnimationFrame(render);
      // Throttle to <= 30fps (~33ms)
      if (now - lastFrame < 33) return;
      lastFrame = now;
      time += 0.02;

      ctx.clearRect(0, 0, width, height);
      const cols = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;

      // Subtle ambient waves of lime dots (opacity <= 0.08)
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const x = i * spacing;
          const y = j * spacing;
          const wave = Math.sin(time + (x * 0.015) + (y * 0.02));
          if (wave > 0.4) {
            const alpha = ((wave - 0.4) * 0.12).toFixed(3);
            ctx.fillStyle = `rgba(185, 255, 102, ${alpha})`;
            ctx.beginPath();
            ctx.arc(x, y, 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    // Observer to pause canvas when header is scrolled out of view
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting && !document.hidden) {
              if (!canvasActive) {
                canvasActive = true;
                lastFrame = performance.now();
                canvasRAF = requestAnimationFrame(render);
              }
            } else {
              canvasActive = false;
              if (canvasRAF) cancelAnimationFrame(canvasRAF);
            }
          });
        },
        { threshold: 0.05 }
      );
      io.observe(canvas.parentElement || canvas);
    } else {
      canvasActive = true;
      canvasRAF = requestAnimationFrame(render);
    }

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        canvasActive = false;
        if (canvasRAF) cancelAnimationFrame(canvasRAF);
      } else {
        canvasActive = true;
        lastFrame = performance.now();
        canvasRAF = requestAnimationFrame(render);
      }
    });
  }

  /* =========================================================================
     8. Full Lifecycle Integration & MutationObserver
     ========================================================================= */
  let scanScheduled = false;

  function scan() {
    initRevealObserver();
    initBlurText();
    initSpotlights();
    initMagneticButtons();
    initCountUp();
    updateNav();
  }

  function scheduleScan() {
    if (scanScheduled) return;
    scanScheduled = true;
    requestAnimationFrame(() => {
      scanScheduled = false;
      scan();
    });
  }

  function init() {
    scan();
    setupCanvas();
    setupClickSpark();

    const main = document.getElementById("m");
    if (main && "MutationObserver" in window) {
      const mo = new MutationObserver(() => {
        scheduleScan();
      });
      mo.observe(main, { childList: true, subtree: true });
    }

    window.addEventListener("resize", () => {
      updateNav();
    }, { passive: true });
  }

  // Export public API
  window.AMXEffects = {
    init,
    scan: scheduleScan,
    updateNav,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
