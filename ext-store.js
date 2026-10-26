/* AMARIX007 — ext-store.js  (v1)
   Three isolated storefront sections rendered from window.AMX_EXT (store-data.js):
     #/x/pubg  شحن شدات ببجي                 Midasbuy flow  : Player ID → تحقق → UC grid → sticky checkout
     #/x/live  تطبيقات الدردشة والبث          Codashop flow  : brand card → modal (account ID + coin grid)
     #/x/ai    اشتراكات الذكاء الاصطناعي      SaaS flow      : card → modal (type × duration, email only for "own_email")
   Load order in index.html:  store-data.js → ext-store.js → app.js.
   Functions here call app.js helpers (prod, pr, money, ic, addToCart, qbOpen, toast, cart, save) at CLICK time, so the order is safe.

   Orders go through your existing cart → placeOrder() → orders_enforce_pricing() path:
   each package is a flat product "<service.id>__<package.id>", the player ID / email travels as the cart line's `link`.
   Replace AMXExt.hooks.onOrder to send the payload to your own function instead. */
(function (g) {
  "use strict";
  const X = g.AMX_EXT;
  if (!X || !Array.isArray(X.services)) return;
  const SEC = X.sections || [],
    SV = X.services;

  /* ---------- helpers ---------- */
  const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
  const nf = (n) => Number(n).toLocaleString("en-US");
  const color = (c) => (/^#[0-9a-f]{3,8}$/i.test(String(c || "")) ? c : "#b9ff66");
  const sec = (id) => SEC.find((s) => s.id === id);
  const svc = (id) => SV.find((s) => s.id === id);
  const pk = (s, id) => (s && s.packages.find((p) => p.id === id)) || null;
  const $id = (id) => document.getElementById(id);

  /* ---------- normalise: derive AI packages, product ids, provider fallbacks ---------- */
  SV.forEach((s) => {
    if (s.category === "ai") {
      s.packages = [];
      s.types.forEach((t) =>
        s.durations.forEach((d, i) =>
          s.packages.push({ id: t.id + "__" + d.id, type: t.id, dur: d.id, months: d.months, price: s.prices[t.id][i], input_type: t.input_type, provider_service_id: t.provider_service_id || "" })
        )
      );
    }
    s.packages.forEach((p) => {
      p.product_id = s.id + "__" + p.id;
      p.provider_service_id = p.provider_service_id || s.provider_service_id || "";
      p.input_type = p.input_type || s.input_type;
    });
  });

  const typeOf = (s, id) => (s.types || []).find((t) => t.id === id);
  const durOf = (s, id) => (s.durations || []).find((d) => d.id === id);
  const pkgTitle = (s, p) =>
    s.category === "pubg" ? `${nf(p.base)}${p.bonus ? " + " + nf(p.bonus) : ""} UC`
    : s.category === "live" ? `${nf(p.amount)} ${s.unit}`
    : `${typeOf(s, p.type).ar} · ${durOf(s, p.dur).ar}`;
  const pkgName = (s, p, en) =>
    s.category === "pubg" ? `${en ? s.en : s.ar} — ${pkgTitle(s, p)}`
    : s.category === "live" ? `${en ? s.en : s.ar} — ${nf(p.amount)}${en ? "" : " " + s.unit}`
    : en ? `${s.en} — ${typeOf(s, p.type).en} — ${durOf(s, p.dur).months} mo`
    : `${s.ar} — ${typeOf(s, p.type).ar} — ${durOf(s, p.dur).ar}`;

  /* flat sellable product (the shape app.js / the server expect in store_config.products) */
  function toProduct(s, p) {
    const o = { id: p.product_id, c: s.category, ar: pkgName(s, p, false), en: pkgName(s, p, true), p: p.price, o: 0, r: 5, n: 0, d: 0, tg: s.en, sp: "", img: "", images: [], ext: { svc: s.id, pkg: p.id } };
    if (p.provider_service_id) Object.assign(o, { smm_provider: s.provider_id || "", smm_service: p.provider_service_id, smm_qty: 1, smm_input: p.input_type === "none" ? "none" : "text" });
    return o;
  }
  const products = () => SV.flatMap((s) => s.packages.map((p) => toProduct(s, p)));
  const categories = () => SEC.map((s) => ({ id: s.id, ty: s.ty, i: s.i, ar: s.ar, en: s.en, da: s.da, de: s.de, f: [], embed_url: "", image_url: "" }));

  /* Called by app.js setCfg(): adds the 3 sections + packages to ANY config (embedded or remote).
     A product already present on the server keeps its server row (price = server truth) and only gets the `ext` tag. */
  function merge(cfg) {
    const cats = (cfg.categories || []).map((c) => (sec(c.id) ? { ...c, ty: sec(c.id).ty } : c));
    categories().forEach((c) => cats.some((x) => x.id === c.id) || cats.push(c));
    const mine = new Map(products().map((p) => [p.id, p])),
      prods = (cfg.products || []).map((p) => (mine.has(p.id) ? { ...p, ext: mine.get(p.id).ext } : p)),
      have = new Set(prods.map((p) => p.id));
    mine.forEach((p, id) => have.has(id) || prods.push(p));
    return { ...cfg, categories: cats, products: prods };
  }

  /* ---------- price / validation ---------- */
  const unit = (p) => { const q = prod(p.product_id); return q ? pr(q) : p.price; }; // server row wins when it exists
  const $m = (p) => money(unit(p));
  const idOk = (s, v) => {
    v = String(v || "").trim();
    try { return new RegExp(s.id_pattern).test(v); } catch { return v.length >= 3; }
  };
  const mailOk = (v) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(String(v || "")) && String(v).length <= 120;

  /* ---------- state (in memory only) ---------- */
  const S = { pubg: { pid: "", st: "idle", nick: "", msg: "", pkg: "" } }; // st: idle | busy | ok | err
  const M = { id: "", uid: "", pkg: "", type: "", dur: "", email: "", opener: null }; // modal state (live + ai)
  let vTok = 0;

  const curPkg = () => {
    const s = svc(M.id);
    return !s ? null : s.category === "ai" ? pk(s, M.type + "__" + M.dur) : pk(s, M.pkg);
  };
  const ready = () => {
    const s = svc(M.id), p = curPkg();
    if (!s || !p) return false;
    if (s.category === "ai") return typeOf(s, M.type).input_type !== "email" || mailOk(M.email);
    return idOk(s, M.uid);
  };

  /* ---------- hooks (replace these to wire real APIs) ---------- */
  const hooks = {
    /* MOCK: replace with a call to your verification endpoint → resolve { ok, nickname?, message? } */
    verifyPlayer: (id) =>
      new Promise((r) => setTimeout(() => r(/^\d{8,12}$/.test(id) ? { ok: true, nickname: "Player_" + id.slice(-4) } : { ok: false, message: "لم نجد لاعباً بهذا المعرّف" }), 700)),
    /* default: put the package in the cart with the ID/email as its `link`, then open the quick-checkout sheet */
    onOrder: (pl) => toCart(pl),
  };

  function toCart(pl) {
    if (!prod(pl.product_id)) { toast("هذه الباقة غير متاحة حالياً، تواصل مع الدعم", "er"); return false; }
    const link = String(pl.player_id || pl.customer_email || "").trim(),
      old = cart.find((x) => x.id == pl.product_id);
    if (old && (old.l || "") !== link) cart = cart.filter((x) => x !== old); // same package for another account = a new line
    addToCart(pl.product_id, 1);
    const line = cart.find((x) => x.id == pl.product_id);
    if (line) line.l = link;
    save();
    qbOpen();
    return true;
  }

  /* the object handed to hooks.onOrder — { service_id, player_id, package_id } are the core keys */
  const payload = (s, p, extra) =>
    Object.assign({ section: s.category, service_id: s.id, package_id: p.id, player_id: "", customer_email: "", product_id: p.product_id, provider_id: s.provider_id || "", provider_service_id: p.provider_service_id || "", qty: 1 }, extra);

  /* ---------- views ---------- */
  const logo = (s) =>
    `<span class="xlogo" style="--bc:${color(s.color)}">${s.logo ? `<img src="${esc(s.logo)}" alt="" loading="lazy" decoding="async">` : esc((s.en || s.ar || "?").charAt(0).toUpperCase())}</span>`;

  const tabs = (cur) =>
    `<nav class="xh-tabs" aria-label="الأقسام">${SEC.map((s) => `<a class="xh-tab${s.id === cur ? " on" : ""}" href="#/x/${esc(s.id)}"${s.id === cur ? ' aria-current="page"' : ""}>${ic(s.i, 18)}<span>${esc(s.ar)}</span></a>`).join("")}</nav>`;

  function pkBtn(s, p, on) {
    const pubg = s.category === "pubg",
      main = pubg
        ? `<b class="n">${nf(p.base)}</b>${p.bonus ? `<em>+ ${nf(p.bonus)}</em>` : ""}<u>UC</u>`
        : `<b class="n">${nf(p.amount)}</b><u>${esc(s.unit)}</u>`;
    return `<button type="button" role="radio" aria-checked="${on}" class="xpk${on ? " on" : ""}" data-x="pkg" data-id="${esc(p.id)}">${p.best ? '<i class="xpk-best">الأكثر مبيعاً</i>' : ""}<span class="xpk-v">${main}</span>${pubg && p.bonus ? `<span class="xpk-bn">بونص ${Math.round((p.bonus / p.base) * 100)}%</span>` : ""}<span class="xpk-p">${$m(p)}</span><i class="xpk-ck">${ic("check", 12)}</i></button>`;
  }

  /* --- PUBG: three steps on one page --- */
  function sumView() {
    const s = svc("pubg_mobile"), st = S.pubg, p = pk(s, st.pkg), ok = st.st === "ok" && !!p;
    return `<div class="xsum-r"><i class="xs-n">3</i><div class="xsum-i"><small>${st.st === "ok" ? `<bdi dir="ltr">${esc(st.nick || "—")} · ${esc(st.pid)}</bdi>` : "لم يتم التحقق من اللاعب بعد"}</small><b>${p ? `<bdi dir="ltr">${esc(pkgTitle(s, p))}</bdi>` : "اختر باقة UC"}</b></div><div class="xsum-t">${p ? `<small>الإجمالي</small><b class="n">${$m(p)}</b>` : ""}</div></div><button type="button" class="b block" data-x="order"${ok ? "" : " disabled"}>${ic("bolt", 16)} اشحن الآن</button>`;
  }
  function pubgView() {
    const s = svc("pubg_mobile"), st = S.pubg, ok = st.st === "ok", busy = st.st === "busy";
    const msg = busy ? "جارٍ التحقق من المعرّف…" : ok ? `${ic("check", 14)} اللاعب: <b><bdi dir="ltr">${esc(st.nick || "—")}</bdi></b>` : st.st === "err" ? esc(st.msg || "تعذّر التحقق من المعرّف") : esc(s.id_hint);
    return `<section class="xs${ok ? " ok" : ""}"><div class="xs-h"><i class="xs-n">1</i><b>أدخل معرّف اللاعب</b></div><div class="xid"><input id="x-pid" class="inp" data-x="pid" dir="ltr" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="Player ID" aria-label="Player ID" value="${esc(st.pid)}"${busy ? " readonly" : ""}><button type="button" class="b" data-x="verify"${idOk(s, st.pid) && !busy && !ok ? "" : " disabled"}>${busy ? "…" : ok ? "تم" : "تحقق"}</button></div><p class="xmsg ${st.st}" role="status" aria-live="polite">${msg}</p></section>` +
      `<section class="xs"><div class="xs-h"><i class="xs-n">2</i><b>اختر باقة UC</b></div><div class="xpks" role="radiogroup" aria-label="باقات UC">${s.packages.map((p) => pkBtn(s, p, st.pkg === p.id)).join("")}</div></section>` +
      `<div class="xsum" id="x-sum">${sumView()}</div>`;
  }

  /* --- Live apps / AI: brand cards that open the modal --- */
  function cardsView(cat) {
    return `<div class="xcards">${SV.filter((s) => s.category === cat)
      .map((s) => {
        const from = Math.min(...s.packages.map(unit));
        return `<button type="button" class="xcard" style="--bc:${color(s.color)}" data-x="open" data-id="${esc(s.id)}">${logo(s)}<span class="xcard-t"><b>${esc(s.ar)}</b><small>${esc(cat === "ai" ? s.tagline || "" : s.packages.length + " باقات")}</small></span><span class="xcard-p"><small>${cat === "ai" ? "يبدأ من" : "من"}</small><b class="n">${money(from)}</b></span></button>`;
      })
      .join("")}</div>`;
  }

  /* hash route entry: app.js render0() calls AMXExt.page(id) */
  function page(id) {
    const s = sec(id);
    if (!s) return "";
    closeModal(true);
    return `<div class="xh" data-sec="${esc(id)}">${tabs(id)}<div class="xh-hd"><h1>${esc(s.ar)}</h1><p>${esc(s.da)}</p></div><div id="xh-body">${id === "pubg" ? pubgView() : cardsView(id)}</div></div>`;
  }

  /* ---------- modal (live + ai) ---------- */
  function modalHtml() {
    const s = svc(M.id), ai = s.category === "ai", p = curPkg();
    let body;
    if (ai) {
      const t = typeOf(s, M.type),
        m0 = unit(pk(s, M.type + "__" + s.durations[0].id)) / s.durations[0].months;
      body = `<div class="xlab" id="xl-t">نوع الاشتراك</div><div class="xopts" role="radiogroup" aria-labelledby="xl-t">${s.types.map((x) => `<button type="button" role="radio" aria-checked="${x.id === M.type}" class="xopt${x.id === M.type ? " on" : ""}" data-x="type" data-id="${esc(x.id)}"><b>${esc(x.ar)}</b></button>`).join("")}</div>` +
        `<div class="xlab" id="xl-d">المدة</div><div class="xopts d" role="radiogroup" aria-labelledby="xl-d">${s.durations.map((d) => {
          const q = pk(s, M.type + "__" + d.id), save = Math.round((1 - unit(q) / d.months / m0) * 100);
          return `<button type="button" role="radio" aria-checked="${d.id === M.dur}" class="xopt${d.id === M.dur ? " on" : ""}" data-x="dur" data-id="${esc(d.id)}"><b>${esc(d.ar)}</b><span class="n">${$m(q)}</span>${save > 0 ? `<i class="xopt-sv">وفّر ${save}%</i>` : ""}</button>`;
        }).join("")}</div>` +
        (t.input_type === "email"
          ? `<label class="xfld"><span>إيميلك الشخصي</span><input id="x-em" class="inp" data-x="email" type="email" dir="ltr" inputmode="email" autocomplete="email" maxlength="120" placeholder="name@example.com" value="${esc(M.email)}"><small>سيتم تفعيل الاشتراك على هذا الإيميل</small></label>`
          : `<p class="xnote">${ic("shield", 14)} تُسلَّم بيانات الحساب إلكترونياً بعد تأكيد الدفع.</p>`);
    } else {
      body = `<label class="xfld"><span>${esc(s.id_label)}</span><input id="x-uid" class="inp" data-x="uid" dir="ltr" autocomplete="off" maxlength="40" placeholder="${esc(s.id_label)}" value="${esc(M.uid)}"><small>${esc(s.id_hint)}</small></label><div class="xlab">اختر الباقة</div><div class="xpks" role="radiogroup" aria-label="الباقات">${s.packages.map((q) => pkBtn(s, q, M.pkg === q.id)).join("")}</div>`;
    }
    return `<div class="xm-h">${logo(s)}<div><b id="xm-t">${esc(s.ar)}</b><small>${esc(ai ? "اشتراك رقمي" : "شحن مباشر")}</small></div><button type="button" class="ib" data-x="close" aria-label="إغلاق">✕</button></div><div class="xm-b">${body}</div><div class="xm-f" id="xm-f">${footHtml(s, p)}</div>`;
  }
  const footHtml = (s, p) =>
    `<div class="xf-t"><small>${p ? esc(pkgTitle(s, p)) : "الإجمالي"}</small><b class="n">${p ? $m(p) : "—"}</b></div><button type="button" class="b" data-x="order"${ready() ? "" : " disabled"}>${ic("bolt", 16)} ${s.category === "ai" ? "اشترك الآن" : "اشحن الآن"}</button>`;

  function openModal(id, opener) {
    const s = svc(id);
    if (!s || s.category === "pubg") return;
    Object.assign(M, { id, uid: "", pkg: "", email: "", type: s.types ? s.types[0].id : "", dur: s.durations ? s.durations[0].id : "", opener: opener || null });
    closeModal(true);
    const el = document.createElement("div");
    el.id = "xm";
    el.className = "xm";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-labelledby", "xm-t");
    el.innerHTML = `<div class="xm-ov" data-x="close"></div><div class="xm-s">${modalHtml()}</div>`;
    document.body.appendChild(el);
    document.body.classList.add("xm-open");
    requestAnimationFrame(() => el.classList.add("on"));
    const f = el.querySelector(".inp") || el.querySelector("button");
    f && f.focus({ preventScroll: true });
  }
  function closeModal(instant) {
    const el = $id("xm");
    if (!el) return;
    document.body.classList.remove("xm-open");
    const o = M.opener;
    M.opener = null;
    if (instant) el.remove();
    else { el.classList.remove("on"); setTimeout(() => el.remove(), 260); }
    o && o.isConnected && o.focus({ preventScroll: true });
  }

  /* ---------- repaint helpers (keep focus + caret so typing never breaks) ---------- */
  function keep(fn) {
    const a = document.activeElement, d = a && a.dataset && a.dataset.x;
    const sel = a && "selectionStart" in a ? [a.selectionStart, a.selectionEnd] : null;
    fn();
    if (!d) return;
    const n = document.querySelector(`[data-x="${d}"]${a.dataset.id ? `[data-id="${CSS.escape(a.dataset.id)}"]` : ""}`);
    if (n && !n.readOnly && !n.disabled) { n.focus({ preventScroll: true }); if (sel) try { n.setSelectionRange(sel[0], sel[1]); } catch {} }
  }
  const paintPubg = () => { const b = $id("xh-body"); if (b) b.innerHTML = pubgView(); };
  const paintSum = () => { const b = $id("x-sum"); if (b) b.innerHTML = sumView(); };
  const paintModal = () => { const s = document.querySelector("#xm .xm-s"); if (s) s.innerHTML = modalHtml(); };
  const paintFoot = () => { const f = $id("xm-f"), s = svc(M.id); if (f && s) f.innerHTML = footHtml(s, curPkg()); };

  /* ---------- actions ---------- */
  async function verify() {
    const s = svc("pubg_mobile"), st = S.pubg;
    if (!idOk(s, st.pid)) { st.st = "err"; st.msg = "معرّف اللاعب يتكوّن من 5 إلى 12 رقماً"; return keep(paintPubg); }
    st.st = "busy";
    const tok = ++vTok;
    keep(paintPubg);
    let r;
    try { r = await hooks.verifyPlayer(st.pid, s); } catch { r = { ok: false }; }
    if (tok !== vTok) return; // the ID was edited meanwhile
    st.st = r && r.ok ? "ok" : "err";
    st.nick = (r && r.nickname) || "";
    st.msg = (r && r.message) || "تعذّر التحقق من المعرّف";
    keep(paintPubg);
  }

  async function submit() {
    let s, p, pl;
    if ($id("xm")) {
      if (!ready()) return;
      s = svc(M.id);
      p = curPkg();
      pl = s.category === "ai"
        ? payload(s, p, { customer_email: typeOf(s, M.type).input_type === "email" ? M.email.trim() : "", options: { type: M.type, duration: M.dur } })
        : payload(s, p, { player_id: M.uid.trim() });
    } else {
      s = svc("pubg_mobile");
      p = pk(s, S.pubg.pkg);
      if (S.pubg.st !== "ok" || !p) return;
      pl = payload(s, p, { player_id: S.pubg.pid, verified: true, nickname: S.pubg.nick });
    }
    const r = await hooks.onOrder(pl);
    if (r !== false) closeModal(true);
  }

  if (typeof document !== "undefined") {
    document.addEventListener("click", (e) => {
      const b = e.target.closest && e.target.closest("[data-x]");
      if (!b) return;
      const a = b.dataset.x, id = b.dataset.id;
      if (a === "open") openModal(id, b);
      else if (a === "close") closeModal();
      else if (a === "verify") verify();
      else if (a === "order") submit();
      else if (a === "pkg") {
        if ($id("xm")) { M.pkg = id; keep(paintModal); } else { S.pubg.pkg = id; keep(paintPubg); }
      } else if (a === "type") { M.type = id; keep(paintModal); }
      else if (a === "dur") { M.dur = id; keep(paintModal); }
    });
    document.addEventListener("input", (e) => {
      const a = e.target.dataset && e.target.dataset.x;
      if (a === "pid") {
        const v = e.target.value.replace(/\D/g, ""), st = S.pubg, was = st.st;
        if (v !== e.target.value) e.target.value = v;
        st.pid = v;
        vTok++;
        if (was !== "idle") { st.st = "idle"; st.nick = ""; st.msg = ""; keep(paintPubg); }
        else { const vb = document.querySelector('[data-x="verify"]'); if (vb) vb.disabled = !idOk(svc("pubg_mobile"), v); }
      } else if (a === "uid") { M.uid = e.target.value.trim(); paintFoot(); }
      else if (a === "email") { M.email = e.target.value.trim(); paintFoot(); }
    });
    document.addEventListener("keydown", (e) => {
      const el = $id("xm");
      if (!el) return;
      if (e.key === "Escape") return closeModal();
      if (e.key !== "Tab") return;
      const f = [...el.querySelectorAll("button:not(:disabled),input")].filter((n) => n.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    addEventListener("hashchange", () => closeModal(true));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.target && e.target.id === "x-pid") { e.preventDefault(); verify(); }
    });
  }

  g.AMXExt = { v: 1, data: X, hooks, merge, page, has: (id) => !!sec(id), products, categories, open: openModal, state: S };
})(typeof window !== "undefined" ? window : globalThis);
