/* =====================================================================================================================
   AMARIX007 — admin-import.js (v1)         Loaded AFTER admin.js (see admin.html). Uses its globals: D, $, esc, save, toast, busy, fn, render …
   ---------------------------------------------------------------------------------------------------------------------
   Adds dedicated admin screens, all Arabic / RTL:
     import   استيراد ومزامنة الخدمات   provider-specific preview, type/category mapping and price sync
     products المنتجات                 searchable catalog with bulk actions
     topups   إدارة الألعاب والتطبيقات  game/app package management
     smmmgr   إدارة خدمات الرشق         SMM-only quantities, per-1000 pricing and provider service IDs

   THE BUG THIS FILE FIXES — "everything lands in رشق المتابعين":
     the old importer (admin.js smmList / smmWipe) silently fell back to the first category of type "boost" when no target was chosen, and
     it saved game / app offers with no product type, so the storefront treated them as boosting. Now:
       • there is NO default category: the target (hub) is chosen in the screen BEFORE fetching, and every row shows where it will go;
       • every product gets an explicit `ptype` (smm | game_topup | app_subscription | gift_card) decided by AMXSvc (svc-parse.js);
       • games / apps are grouped per brand into their own "shop" categories (PUBG under PUBG, Free Fire under Free Fire …);
       • image, denomination, availability and the provider's category id are kept on the product (nothing is dropped).
   Nothing here talks to the database directly: products / categories are edited in D and saved with the normal «نشر» button. */
(function (g) {
  "use strict";

  /* ------------------------------------------------------------------ constants ------------------------------------------------------------------ */
  const HUB_OPTS = [
    ["games", "شحن ألعاب"],
    ["apps", "تطبيقات واشتراكات"],
    ["smm", "رشق متابعين"],
  ];
  const TYPE_OPTS = [
    ["game_topup", "شحن لعبة (Player ID + باقة)"],
    ["app_subscription", "تطبيق / اشتراك (إيميل أو هاتف)"],
    ["gift_card", "بطاقة / كود فوري (PIN)"],
    ["smm", "رشق (رابط + كمية)"],
  ];
  const HUB_OF_TYPE = { smm: "smm", game_topup: "games", app_subscription: "apps", gift_card: "apps" };
  const DEFAULT_TYPE = { smm: "smm", games: "game_topup", apps: "app_subscription" };
  const MODES = [
    ["smm", "رشق متابعين (SMM)"],
    ["games", "شحن ألعاب"],
    ["apps", "تطبيقات واشتراكات"],
    ["sync", "مزامنة الأسعار"],
  ];
  const REQ_OPTS = [
    ["player_id", "Player ID"],
    ["server_id", "Server ID"],
    ["email", "الإيميل"],
    ["phone", "الهاتف"],
  ];
  const PAGE = 50;

  /* ------------------------------------------------------------------ small helpers ------------------------------------------------------------------ */
  const SV = () => g.AMXSvc;
  const norm = (s) => (SV() && typeof SV().norm === "function" ? SV().norm(s) : String(s == null ? "" : s).normalize("NFKD").toLowerCase());
  const r2 = (v) => Math.round(v * 100) / 100;
  const r6 = (v) => Math.round(v * 1e6) / 1e6;
  const num = (v, d) => (isFinite(parseFloat(v)) ? parseFloat(v) : d);
  const opt = (v, l, sel) => `<option value="${esc(v)}"${String(sel) === String(v) ? " selected" : ""}>${esc(l)}</option>`;
  const typeLab = (t) => (TYPE_OPTS.find((x) => x[0] === t) || [0, t])[1].replace(/\s*\(.*$/, "");
  const hubLab = (h) => (HUB_OPTS.find((x) => x[0] === h) || [0, "—"])[1];
  const money = (v) => (v >= 1 ? v.toFixed(2) : v >= 0.01 ? v.toFixed(3) : String(r6(v)));
  const cats = () => D.categories.filter((c) => c.ty !== "hub");
  const isOnProvider = (p, pv) => String((p.smm_provider || "main")).toLowerCase() === pv;

  /* which hub a store category belongs to — explicit field first, then boost type, then the products inside it */
  function hubOfCat(c) {
    if (!c) return "";
    if (c.ty === "hub") return "hub";
    if (c.ty === "boost") return "smm";
    if (c.hub === "games" || c.hub === "apps") return c.hub;
    if (c.hub === "none") return "none";
    const ps = D.products.filter((p) => p.c === c.id && (p.ptype || p.smm_provider));
    if (!ps.length || !SV()) return "";
    const n = { games: 0, apps: 0, smm: 0 };
    ps.forEach((p) => { const h = SV().hubOf(p); if (h && n[h] != null) n[h]++; });
    return n.smm > n.games && n.smm > n.apps ? "smm" : n.apps > n.games ? "apps" : n.games ? "games" : "";
  }
  const catHubLabel = (c) => ({ smm: "رشق", games: "ألعاب", apps: "تطبيقات", none: "مستقل", hub: "رئيسي", "": "غير مصنّف" }[hubOfCat(c)] || "غير مصنّف");

  /* ------------------------------------------------------------------ product builder (the single place that creates imported products) ------------------------------------------------------------------
     x    = a provider service row { id, name, category, rate (price of 1000 units, or 1000 x package price), min, max, country, image, amount, available }
     o    = { cat, mk, prov, kind, type? }                                                                                                         */
  function priceOf(x, type, mk) {
    const rate = parseFloat(x.rate);
    if (!(rate > 0)) return 0;
    // SMM provider rates are normally per 1,000 units; game/app offers are package prices.
    const unitCost = type === "smm" ? rate / 1000 : rate;
    const v = unitCost * (1 + (mk || 0) / 100);
    return type === "smm" ? Math.max(0.000001, r6(v)) : Math.max(0.01, r2(v));
  }
  function classifyService(x, kind) {
    return SV().typeOf({ name: x.name, category: x.category, provider_kind: kind || "smm", smm_input: x.type === "Number" ? "none" : undefined });
  }
  function build(x, o) {
    const sv = SV(), kind = o.kind || "smm", pv = String(o.prov || "main").toLowerCase();
    const sid = String(x.id), cty = x.country && kind === "custom" ? String(x.country) : "";
    const type = o.type || classifyService(x, kind);
    const brand = sv.brandOf({ name: x.name, category: x.category, ptype: type });
    const it = NEW.products();
    const name = String(x.name || "Service " + sid).trim();
    const smm = type === "smm";
    let ar, en, tg, sp;
    if (smm) {
      const mt = typeof smmMeta == "function" ? smmMeta(x) : null; // short clean title + feature tags (svc-parse.js parse)
      ar = mt ? mt.ar : name; en = name; tg = mt ? mt.tg : name; sp = mt ? mt.plAr + " · " + mt.ty : brand.ar;
    } else {
      const label = String(x.category || "").trim() || brand.en;
      const has = norm(name).includes(norm(label)) || norm(name).includes(norm(brand.en));
      ar = has ? name : label + " · " + name; en = has ? name : label + " — " + name;
      tg = [label, brand.en, brand.ar, sv.typeLabel(type, true)].join(" "); sp = label;
    }
    Object.assign(it, {
      id: pv === "main" ? "smm" + sid : "smm_" + pv + "_" + sid + (cty ? "_" + cty.replace(/[^A-Za-z0-9_-]/g, "_") : ""),
      c: o.cat, k: "buy", ar, en, p: priceOf(x, type, o.mk), o: 0, d: 0, r: 5, n: 0, bs: 0, tg, sp,
      img: x.image ? String(x.image) : "", images: [],
      ptype: type, bk: brand.key,
      smm_service: sid, smm_qty: 1, smm_mk: o.mk || 0,
      smm_input: smm ? "" : type === "gift_card" ? "none" : "text",
      ...(pv === "main" ? {} : { smm_provider: pv }),
      ...(x.country ? { smm_country: String(x.country) } : {}),
      ...(x.category ? { smm_cat: String(x.category) } : {}),
    });
    if (smm) Object.assign(it, typeof smmLimits == "function" ? smmLimits(x.min, x.max, 1) : { qmin: 1, qmax: 0 });
    else { it.qmin = 1; it.qmax = 1; }
    if (!smm) {
      const req = sv.requiredOf(it);
      if (req.length) it.req = req;
      const dn = sv.denomination(name) || (x.amount ? { amount: parseFloat(x.amount) || 0, unit: "" } : null);
      if (dn && dn.amount) { it.amount = dn.amount; if (dn.unit) it.unit = dn.unit; }
    }
    if (x.available === false) it.oos = true; // the provider says: out of stock — imported but not sellable
    return it;
  }

  /* target category of one row: "smm" -> the boosting category; games / apps -> one "shop" category per BRAND (created when missing) */
  function ensureCat(hub, brand, x, cache) {
    if (hub === "smm") {
      let c = D.categories.find((k) => k.ty === "boost");
      if (!c) { c = NEW.categories(); Object.assign(c, { ar: "رشق متابعين", en: "Boosting", ty: "boost", i: "trend", hub: "none" }); D.categories.push(c); cache.made++; }
      return c.id;
    }
    const key = hub + ":" + brand.key;
    if (cache.map.has(key)) return cache.map.get(key);
    const label = String(x.category || "").trim();
    let c = D.categories.find((k) => k.ty === "shop" && k.bk === brand.key && (!k.hub || k.hub === hub));
    if (!c) c = D.categories.find((k) => k.ty === "shop" && [k.ar, k.en].some((v) => v && [brand.ar, brand.en, label].some((n) => n && norm(v) === norm(n))));
    if (!c) {
      c = NEW.categories();
      const known = brand.kind !== "other";
      Object.assign(c, { ar: known ? brand.ar : label || brand.ar, en: known ? brand.en : label || brand.en, ty: "shop", i: hub === "games" ? "bolt" : "users", hub, bk: brand.key, image_url: x.catImage || "" });
      D.categories.push(c);
      cache.made++;
    }
    if (!c.bk) c.bk = brand.key;
    if (!c.hub) c.hub = hub;
    cache.map.set(key, c.id);
    return c.id;
  }

  /* ------------------------------------------------------------------ state ------------------------------------------------------------------ */
  const IC = {
    mode: "games", prov: "", target: "", catList: [], cat: "", rows: [], fetched: false, busy: false, msg: "",
    mk: 30, fq: "", ft: "", fs: "", page: 0,
    sync: [], syncProv: "", syncMsg: "",
  };
  try { IC.mk = num(localStorage.getItem("amx_ic_mk"), 30); } catch (e) {}
  const kindOf = (id) => (id === "main" ? "smm" : (typeof PROV_KIND != "undefined" && PROV_KIND[id]) || "smm");
  const provList = () => {
    const want = IC.mode === "smm" ? "smm" : "custom";
    const out = [];
    if (want === "smm") out.push(["main", provName("main")]);
    Object.keys(PROV_NAME).forEach((id) => { if (kindOf(id) === want) out.push([id, PROV_NAME[id] + " (" + id + ")"]); });
    return out;
  };
  const defTarget = () => (IC.mode === "sync" ? "" : IC.mode); // mode = the default target hub, changeable below

  /* ------------------------------------------------------------------ IMPORT CENTER (view) ------------------------------------------------------------------ */
  function modeBar() {
    return `<div class="ic-modes" role="tablist">${MODES.map(([k, l]) => `<button type="button" class="b ${IC.mode === k ? "" : "b2"} sm" data-ic="mode" data-v="${k}">${esc(l)}</button>`).join("")}</div>`;
  }
  function importView() {
    if (typeof PROV_LOADED != "undefined" && !PROV_LOADED && !Object.keys(PROV_NAME).length) loadProviders(true).then(() => tab === "import" && render()).catch(() => {});
    const body = IC.mode === "sync" ? syncView() : fetchView() + imgCard();
    return `<div class="card"><h2>مركز الاستيراد والمزامنة</h2><p class="hint">اختر نوع الاستيراد، حدّد القسم المستهدف <b>قبل الجلب</b>، ثم راجع جدول المعاينة وعدّل النوع والقسم ونسبة الربح لكل صف (أو لعدة صفوف دفعة واحدة) قبل الحفظ في المتجر. لا يُحفظ شيء إلا بعد ضغط «حفظ المحدد»، ثم «نشر نهائي».</p>${modeBar()}</div>${body}`;
  }
  function fetchView() {
    const provs = provList();
    if (IC.prov && !provs.some((p) => p[0] === IC.prov)) IC.prov = "";
    if (!IC.prov && provs.length === 1) IC.prov = provs[0][0];
    if (!IC.target) IC.target = defTarget();
    const custom = kindOf(IC.prov) === "custom";
    const noProv = !provs.length
      ? `<p class="hint warn">لا يوجد مزوّد من هذا النوع. ${IC.mode === "smm" ? "" : "أضف مزوّداً من نوع «مخصّص» (مثل FazerCards) من تبويب إعدادات APIs ثم فعّله وضع مفتاحه."}</p>` : "";
    const catSel = custom && IC.catList.length
      ? `<label class="fld"><span>الفئة / اللعبة عند المزوّد (${IC.catList.length})</span><select class="inp" data-ic="cat">${opt("", "— كل الفئات (حتى 60) —", IC.cat)}${IC.catList.map((c) => opt(c.id, c.name, IC.cat)).join("")}</select></label>` : "";
    return `<div class="card"><h3>1) المصدر والقسم المستهدف</h3>${noProv}<div class="g2" style="align-items:end">
      <label class="fld"><span>المزوّد</span><select class="inp" data-ic="prov">${opt("", "— اختر المزوّد —", IC.prov)}${provs.map(([k, n]) => opt(k, n, IC.prov)).join("")}</select></label>
      <label class="fld"><span>القسم المستهدف (إلزامي قبل الجلب)</span><select class="inp" data-ic="target">${opt("auto", "تلقائي — تصنيف ذكي لكل منتج", IC.target)}${HUB_OPTS.map(([k, l]) => opt(k, l, IC.target)).join("")}</select></label>
      ${catSel}
      <label class="fld"><span>نسبة الربح الافتراضية %</span><input class="inp" type="number" min="0" step="1" dir="ltr" data-ic="mk" value="${esc(IC.mk)}"></label></div>
      <p class="hint">«تلقائي» يوزّع كل منتج على الألعاب أو التطبيقات أو الرشق حسب اسمه ومزوّده. اختيار قسم محدد يوجّه كل ما يُجلب إليه (مع إمكانية تغيير أي صف في المعاينة).</p>
      <div class="acts"><button class="b" type="button" data-ic="fetch"${IC.busy ? " disabled" : ""}>${IC.busy ? "جارٍ الجلب…" : "جلب الخدمات للمعاينة"}</button>${custom ? '<button class="b b2" type="button" data-ic="loadcats">تحميل فئات المزوّد</button>' : ""}</div>
      ${IC.msg ? `<p class="hint ${/^✗/.test(IC.msg) ? "warn" : ""}">${esc(IC.msg)}</p>` : ""}</div>${IC.fetched ? `<div id="ic-prev">${previewHtml()}</div>` : ""}`;
  }

  /* rows ----------------------------------------------------------------------------------------------- */
  function mkRows(list, prov, kind) {
    const have = new Set(D.products.map((p) => provKey(p)));
    const seen = new Set();
    return list.map((x) => {
      const sid = String(x.id), cty = x.country && kind === "custom" ? String(x.country) : "";
      const key = prov + "|" + sid + "|" + cty;
      const rate = parseFloat(x.rate);
      const auto = classifyService(x, kind);
      const type = auto; // Keep semantic classification independent from the destination hub.
      const target = IC.target && IC.target !== "auto" ? IC.target : HUB_OF_TYPE[type];
      const status = !(rate > 0) ? "invalid" : have.has(key) || seen.has(key) ? "exists" : "new";
      seen.add(key);
      return { x, key, type, auto, target, cat: "auto", mk: IC.mk, status, sel: status === "new" };
    });
  }
  const provKey = (p) => String(p.smm_provider || "main").toLowerCase() + "|" + String(p.smm_service || "") + "|" + String(p.smm_country || "");
  const rowHub = (r) => r.target || HUB_OF_TYPE[r.type];
  const rowPrice = (r) => priceOf(r.x, r.type, r.mk);
  function rowPriceTxt(r) {
    const p = rowPrice(r);
    if (!p) return "—";
    return r.type === "smm" ? `$${money(p)}<small>/وحدة</small><br><small>≈ $${money(p * 1000)}/1000</small>` : `$${money(p)}`;
  }
  function filteredRows() {
    const q = norm(IC.fq);
    return IC.rows.map((r, i) => [r, i]).filter(([r]) => (!IC.ft || r.type === IC.ft) && (!IC.fs || r.status === IC.fs) && (!q || norm(r.x.name + " " + (r.x.category || "") + " " + r.x.id).includes(q)));
  }
  function catOptions(r) {
    const hub = rowHub(r);
    const same = cats().filter((c) => hubOfCat(c) === hub || (hub === "smm" && c.ty === "boost"));
    const rest = cats().filter((c) => !same.includes(c));
    return opt("auto", hub === "smm" ? "قسم الرشق" : "تلقائي حسب اللعبة / العلامة", r.cat) +
      (same.length ? `<optgroup label="${esc(hubLab(hub))}">${same.map((c) => opt(c.id, c.ar || c.en || c.id, r.cat)).join("")}</optgroup>` : "") +
      (rest.length ? `<optgroup label="أقسام أخرى">${rest.map((c) => opt(c.id, (c.ar || c.en || c.id) + " · " + catHubLabel(c), r.cat)).join("")}</optgroup>` : "");
  }
  function rowHtml(r, i) {
    const x = r.x;
    const st = { new: '<i class="ic-bd nw">جديد</i>', exists: '<i class="ic-bd ok">موجود</i>', invalid: '<i class="ic-bd er">سعر غير صالح</i>' }[r.status];
    const dn = SV().denomination(x.name);
    return `<tr class="${r.sel ? "on" : ""}" data-ri="${i}"><td><input type="checkbox" data-ic="rsel" data-i="${i}"${r.sel ? " checked" : ""}${r.status !== "new" ? " disabled" : ""} aria-label="تحديد"></td>
      <td class="ic-nm">${x.image && /^https:/.test(x.image) ? `<img class="ic-th" src="${esc(x.image)}" alt="" loading="lazy">` : ""}<b>${esc(x.name)}</b><br><small class="od-m">${esc(x.category || "")} · #${esc(x.id)}${dn ? " · " + esc(dn.amount + " " + dn.unit) : ""}${x.min != null && r.type === "smm" ? " · " + esc(x.min) + "-" + esc(x.max) : ""}</small></td>
      <td><select class="inp sm" data-ic="rtype" data-i="${i}">${TYPE_OPTS.map(([k, l]) => opt(k, l.replace(/\s*\(.*$/, ""), r.type)).join("")}</select></td>
      <td><select class="inp sm" data-ic="rcat" data-i="${i}">${catOptions(r)}</select></td>
      <td><input class="inp sm" type="number" min="0" step="1" dir="ltr" data-ic="rmk" data-i="${i}" value="${esc(r.mk)}"></td>
      <td dir="ltr" class="ic-pr">${rowPriceTxt(r)}</td><td>${st}</td></tr>`;
  }
  function previewHtml() {
    const all = IC.rows, fr = filteredRows(), pages = Math.max(1, Math.ceil(fr.length / PAGE));
    IC.page = Math.min(IC.page, pages - 1);
    const slice = fr.slice(IC.page * PAGE, IC.page * PAGE + PAGE);
    const selN = all.filter((r) => r.sel && r.status === "new").length;
    const cnt = {};
    all.forEach((r) => { if (r.status === "new") cnt[r.type] = (cnt[r.type] || 0) + 1; });
    const sums = TYPE_OPTS.map(([k, l]) => `<span class="ic-chip">${esc(l.replace(/\s*\(.*$/, ""))}: <b>${cnt[k] || 0}</b></span>`).join("");
    const newN = all.filter((r) => r.status === "new").length;
    return `<div class="card"><h3>2) معاينة (${all.length} خدمة · ${newN} جديدة · ${selN} محددة)</h3><div class="ic-sums">${sums}</div>
      <div class="ic-bar"><input class="inp" type="search" placeholder="بحث بالاسم / الفئة / الرقم" data-ic="fq" value="${esc(IC.fq)}">
        <select class="inp" data-ic="ft">${opt("", "كل الأنواع", IC.ft)}${TYPE_OPTS.map(([k, l]) => opt(k, l.replace(/\s*\(.*$/, ""), IC.ft)).join("")}</select>
        <select class="inp" data-ic="fs">${opt("", "كل الحالات", IC.fs)}${opt("new", "جديد فقط", IC.fs)}${opt("exists", "موجود مسبقاً", IC.fs)}${opt("invalid", "غير صالح", IC.fs)}</select></div>
      <div class="ic-bulk"><b>تطبيق على المحدد (${selN}):</b>
        <button class="b b2 sm" type="button" data-ic="selall">تحديد كل الجديد في الفلتر (${fr.filter(([r]) => r.status === "new").length})</button>
        <button class="b b2 sm" type="button" data-ic="selnone">إلغاء التحديد</button>
        <select class="inp sm" id="ic-bt">${TYPE_OPTS.map(([k, l]) => opt(k, l.replace(/\s*\(.*$/, ""), "")).join("")}</select><button class="b sm" type="button" data-ic="bulk-type">نوع</button>
        <select class="inp sm" id="ic-bc">${opt("auto", "تلقائي حسب العلامة", "")}${cats().map((c) => opt(c.id, (c.ar || c.en || c.id) + " · " + catHubLabel(c), "")).join("")}</select><button class="b sm" type="button" data-ic="bulk-cat">قسم</button>
        <input class="inp sm" id="ic-bm" type="number" min="0" step="1" dir="ltr" value="${esc(IC.mk)}" style="width:76px"><button class="b sm" type="button" data-ic="bulk-mk">ربح %</button></div>
      <div class="tbw"><table class="tb ic-tb"><thead><tr><th></th><th>الخدمة</th><th>النوع</th><th>القسم</th><th>ربح %</th><th>السعر</th><th>الحالة</th></tr></thead><tbody>${slice.map(([r, i]) => rowHtml(r, i)).join("") || '<tr><td colspan="7">لا نتائج</td></tr>'}</tbody></table></div>
      <div class="ic-pg"><button class="b b2 sm" type="button" data-ic="pg" data-d="-1"${IC.page <= 0 ? " disabled" : ""}>→ السابق</button><span>صفحة ${IC.page + 1} / ${pages}</span><button class="b b2 sm" type="button" data-ic="pg" data-d="1"${IC.page >= pages - 1 ? " disabled" : ""}>التالي ←</button></div>
      <div class="acts"><button class="b" type="button" data-ic="save"${selN ? "" : " disabled"}>حفظ المحدد في المتجر (${selN})</button></div>
      <p class="hint">بعد الحفظ ستظهر المنتجات في «المنتجات» ويجب الضغط على «نشر الآن» في الأعلى لتطبيقها على المتجر.</p></div>`;
  }
  const refreshPrev = () => { const el = $("#ic-prev"); if (el) el.innerHTML = previewHtml(); };

  async function doFetch() {
    if (!IC.prov) return toast("اختر المزوّد أولاً", "e");
    if (!IC.target) return toast("حدّد القسم المستهدف قبل الجلب", "e");
    const pv = IC.prov, kind = kindOf(pv);
    IC.busy = true; IC.msg = ""; render();
    try {
      if (pv !== "main" && !(await siteSupport())) throw new Error(SITES_OLD);
      const j = await fn("smm-order", { action: "services", provider: pv, ...(IC.cat && IC.cat !== "*" ? { category: IC.cat } : {}) });
      const source = Array.isArray(j) ? j : (Array.isArray(j && j.services) ? j.services : Array.isArray(j && j.data) ? j.data : Array.isArray(j && j.results) ? j.results : []);
      const list = source.map((x) => {
        const id = x.id ?? x.service ?? x.service_id ?? x.offer_id ?? x.product_id;
        const name = x.name ?? x.title ?? x.product_name ?? x.offer_name ?? x.service_name;
        const category = x.category ?? x.category_name ?? x.group ?? x.game ?? x.brand ?? x.category_id ?? "";
        const rate = x.rate ?? x.price_per_1000 ?? x.pricePer1000 ?? x.cost ?? x.price ?? x.amount_price;
        const image = x.image ?? x.image_url ?? x.icon ?? x.logo ?? x.thumbnail ?? x.product_image ?? "";
        const amount = x.amount ?? x.denomination ?? x.value ?? x.package_amount ?? x.quantity_value;
        const available = x.available ?? x.is_available ?? x.active ?? x.enabled;
        return { ...x, id: String(id ?? ""), name: String(name ?? ""), category: String(category ?? ""), rate: Number(rate), min: x.min ?? x.min_quantity ?? x.minimum, max: x.max ?? x.max_quantity ?? x.maximum, country: x.country ?? x.country_code ?? x.region ?? "", image: String(image || ""), catImage: String(x.category_image ?? x.categoryImage ?? x.category_icon ?? x.game_image ?? x.game_icon ?? x.brand_image ?? x.brand_logo ?? ""), amount, available: available === false || available === 0 || available === "false" ? false : true, type: x.type ?? x.delivery_type ?? "" };
      }).filter((x) => x.id && x.name);
      if (!list.length) throw new Error("لم يُرجع المزوّد خدمات قابلة للاستيراد؛ تحقّق من صيغة الاستجابة وإعدادات API.");
      IC.rows = mkRows(list, pv, kind); IC.fetched = true; IC.page = 0; IC.fq = ""; IC.ft = ""; IC.fs = "";
      IC.msg = `✓ تم جلب ${list.length} خدمة من «${provName(pv)}». راجع الجدول ثم احفظ.`;
    } catch (e) {
      IC.msg = "✗ " + String(e.message || e); IC.fetched = false; IC.rows = [];
    } finally {
      IC.busy = false; render();
    }
  }
  async function loadCats() {
    if (!IC.prov) return toast("اختر المزوّد أولاً", "e");
    try {
      if (IC.prov !== "main" && !(await siteSupport())) throw new Error(SITES_OLD);
      const j = await fn("smm-order", { action: "categories", provider: IC.prov });
      IC.catList = Array.isArray(j.categories) ? j.categories : [];
      IC.msg = IC.catList.length ? `✓ ${IC.catList.length} فئة` : "المزوّد لا يُرجع فئات";
    } catch (e) { IC.catList = []; IC.msg = "✗ " + String(e.message || e); }
    render();
  }
  function saveRows() {
    const sel = IC.rows.filter((r) => r.sel && r.status === "new");
    if (!sel.length) return toast("لا توجد صفوف محددة", "e");
    if (sel.length > 500 && !confirm(`ستضيف ${sel.length} منتجاً. كل منتج يكبّر إعدادات المتجر التي يحمّلها كل زائر. متابعة؟`)) return;
    const kind = kindOf(IC.prov), cache = { map: new Map(), made: 0 };
    let add = 0;
    sel.forEach((r) => {
      const sv = SV(), hub = rowHub(r);
      const brand = sv.brandOf({ name: r.x.name, category: r.x.category, ptype: r.type });
      const cid = r.cat && r.cat !== "auto" && D.categories.some((c) => c.id === r.cat) ? r.cat : ensureCat(hub, brand, r.x, cache);
      const it = build(r.x, { cat: cid, mk: r.mk, prov: IC.prov, kind, type: r.type });
      D.products.push(it);
      r.status = "exists"; r.sel = false; add++;
    });
    try { localStorage.setItem("amx_ic_mk", String(IC.mk)); } catch (e) {}
    save();
    IC.msg = `✓ أُضيف ${add} منتج${cache.made ? " وأُنشئ " + cache.made + " قسم" : ""}. اضغط «نشر الآن» لتطبيق التغيير على المتجر.`;
    toast(`تمت إضافة ${add} منتج. اضغط نشر للحفظ`);
    render();
    if (cache.made || imgTargets().length) setTimeout(() => autoImages(), 400);
  }

  /* ------------------------------------------------------------------ automatic images ------------------------------------------------------------------
     For every game / app category without a picture: search the public App Store catalogue (iTunes Search API, no key) by the game's name,
     accept only a confident name match, and store the 512px icon as the category image (the hub cards, the home strip and the product rows use it).
     Provider pictures (image / category_image) are always kept first. Apple allows about 20 searches a minute, so it runs one by one in the
     background; hits AND misses are remembered in this browser so nothing is searched twice. */
  const IMG = { busy: false, stop: false, done: 0, total: 0, found: 0, miss: 0, msg: "" };
  const IMG_KEY = "amx_img_cache_v1";
  const imgCache = (() => { try { return JSON.parse(localStorage.getItem(IMG_KEY)) || {}; } catch (e) { return {}; } })();
  const imgSave = () => { try { localStorage.setItem(IMG_KEY, JSON.stringify(imgCache)); } catch (e) {} };
  const imgTerm = (c) => {
    const raw = String(c.en || c.ar || "").replace(/\s*\([^()]*\)\s*$/, "").replace(/\b(top[\s-]?up|recharge|global|mena|gift\s?cards?|subscriptions?)\b/gi, " ");
    return raw.replace(/\s+/g, " ").trim();
  };
  const imgWords = (s) => norm(String(s).split(/\s[-–—:|]\s|:/)[0]).split(" ").filter(Boolean);
  function imgPick(term, list) {
    const a = imgWords(term);
    if (!a.length) return "";
    let best = null, bs = 0;
    (list || []).forEach((r) => {
      const b = imgWords(r.trackName || "");
      if (!b.length) return;
      const inter = a.filter((w) => b.includes(w)).length;
      let sc = inter / Math.max(a.length, b.length);
      if (a.join(" ") === b.join(" ")) sc = 1;
      else if (b.join(" ").startsWith(a.join(" ")) && a.join(" ").length >= 4) sc = Math.max(sc, 0.75);
      if (sc > bs) { bs = sc; best = r; }
    });
    if (!best || bs < 0.7) return "";
    const u = best.artworkUrl512 || String(best.artworkUrl100 || "").replace(/\d+x\d+(bb|sr)/, "512x512bb");
    return /^https:\/\//.test(u || "") ? u : "";
  }
  async function imgSearch(term) {
    const ac = new AbortController(), tm = setTimeout(() => ac.abort(), 12000);
    try {
      const r = await fetch("https://itunes.apple.com/search?entity=software&limit=6&term=" + encodeURIComponent(term), { signal: ac.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return imgPick(term, (await r.json()).results);
    } finally { clearTimeout(tm); }
  }
  const imgTargets = () => D.categories.filter((c) => c.ty === "shop" && !c.image_url && ["games", "apps"].includes(hubOfCat(c)) && imgTerm(c).length > 1);
  const imgStatus = (t) => { IMG.msg = t; const el = $("#ic-imgst"); if (el) el.textContent = t; };
  async function autoImages() {
    if (IMG.busy) return;
    const list = imgTargets();
    if (!list.length) { imgStatus("✓ كل الأقسام لديها صور."); return render(); }
    IMG.busy = true; IMG.stop = false; IMG.done = 0; IMG.found = 0; IMG.miss = 0; IMG.total = list.length;
    render();
    let fails = 0;
    for (const c of list) {
      if (IMG.stop) break;
      const term = imgTerm(c), key = norm(term);
      try {
        let url = imgCache[key];
        if (url === undefined) {
          url = await imgSearch(term);
          imgCache[key] = url; imgSave();
          await new Promise((ok) => setTimeout(ok, 3200)); // Apple: ~20 searches / minute
        }
        if (url) { c.image_url = url; IMG.found++; } else IMG.miss++;
        fails = 0;
      } catch (e) {
        fails++;
        if (fails >= 3) { imgStatus("✗ تعذّر الاتصال بمتجر التطبيقات (" + String(e.message || e).slice(0, 60) + ") — تحقق من الإنترنت أو أعد المحاولة لاحقاً."); break; }
        await new Promise((ok) => setTimeout(ok, 5000));
      }
      IMG.done++;
      imgStatus(`جارٍ جلب الصور… ${IMG.done}/${IMG.total} · وُجدت ${IMG.found} · بلا تطابق ${IMG.miss}`);
      if (IMG.found && IMG.found % 5 === 0) save();
    }
    IMG.busy = false;
    if (IMG.found) save();
    if (!/^✗/.test(IMG.msg)) IMG.msg = `✓ ${IMG.stop ? "أُوقف" : "اكتمل"}: وُجدت ${IMG.found} صورة من ${IMG.done}${IMG.miss ? " (" + IMG.miss + " بلا تطابق واضح — يمكنك رفع صورتها يدوياً من «الأقسام»)" : ""}. اضغط «نشر الآن» لتظهر في المتجر.`;
    render();
  }
  function imgCard() {
    const n = imgTargets().length;
    return `<div class="card"><h3>الصور التلقائية للألعاب والتطبيقات</h3>
      <p class="hint">تُجلب أيقونة كل لعبة وتطبيق تلقائياً بالاسم (وتُحفظ على القسم فتظهر في بطاقات الألعاب وفي صفوف المنتجات). صور المزوّد تُستعمل أولاً إن وُجدت، ويُشغَّل الجلب تلقائياً بعد كل استيراد. بلا تطابق واضح = لا تُوضع صورة خاطئة.</p>
      <div class="acts"><button class="b" type="button" data-ic="img-go"${IMG.busy || !n ? " disabled" : ""}>${IMG.busy ? "جارٍ الجلب…" : `جلب صور الأقسام الناقصة (${n})`}</button>${IMG.busy ? '<button class="b b2" type="button" data-ic="img-stop">إيقاف</button>' : ""}</div>
      <p class="hint ${/^✗/.test(IMG.msg) ? "warn" : ""}" id="ic-imgst">${esc(IMG.msg)}</p></div>`;
  }

  /* ------------------------------------------------------------------ price sync ------------------------------------------------------------------ */
  function syncView() {
    const used = [...new Set(D.products.filter((p) => p.smm_service).map((p) => String(p.smm_provider || "main").toLowerCase()))];
    const rows = IC.sync;
    const chg = rows.filter((r) => r.state === "changed").length;
    return `<div class="card"><h3>مزامنة الأسعار مع المزوّد</h3><p class="hint">يقارن سعر كل منتج مستورد بالسعر الحالي عند المزوّد (حسب نسبة ربحه المحفوظة) ويعرض الفروقات قبل التطبيق. يمكنك أيضاً وسم المنتجات التي اختفت من المزوّد بأنها «غير متاحة».</p>
      <div class="g2" style="align-items:end"><label class="fld"><span>المزوّد</span><select class="inp" data-ic="sprov">${opt("", "— اختر المزوّد —", IC.syncProv)}${used.map((k) => opt(k, provName(k) + " (" + D.products.filter((p) => isOnProvider(p, k) && p.smm_service).length + " منتج)", IC.syncProv)).join("")}</select></label>
      <div class="acts"><button class="b" type="button" data-ic="sync-go"${IC.busy ? " disabled" : ""}>${IC.busy ? "جارٍ المقارنة…" : "مقارنة الأسعار الآن"}</button></div></div>
      ${IC.syncMsg ? `<p class="hint ${/^✗/.test(IC.syncMsg) ? "warn" : ""}">${esc(IC.syncMsg)}</p>` : ""}
      ${rows.length ? `<div class="tbw"><table class="tb ic-tb"><thead><tr><th></th><th>المنتج</th><th>السعر الحالي</th><th>الجديد</th><th>الفرق</th><th>الحالة</th></tr></thead><tbody>${rows.slice(0, 300).map((r, i) => `<tr class="${r.sel ? "on" : ""}"><td><input type="checkbox" data-ic="ssel" data-i="${i}"${r.sel ? " checked" : ""}${r.state === "same" ? " disabled" : ""}></td><td><b>${esc(r.p.ar)}</b><br><small class="od-m">#${esc(r.p.smm_service)}</small></td><td dir="ltr">${money(r.old)}</td><td dir="ltr">${r.state === "missing" ? "—" : money(r.nw)}</td><td dir="ltr">${r.state === "changed" ? (r.nw > r.old ? "▲ " : "▼ ") + Math.abs(((r.nw - r.old) / r.old) * 100).toFixed(1) + "%" : ""}</td><td>${{ changed: '<i class="ic-bd nw">تغيّر</i>', same: '<i class="ic-bd ok">ثابت</i>', missing: '<i class="ic-bd er">غير موجود عند المزوّد</i>' }[r.state]}</td></tr>`).join("")}</tbody></table></div>
      <div class="acts"><button class="b" type="button" data-ic="sync-apply">تطبيق الأسعار المحددة (${rows.filter((r) => r.sel && r.state === "changed").length})</button><button class="b bd2" type="button" data-ic="sync-missing">وسم المفقودة «غير متاحة» (${rows.filter((r) => r.state === "missing").length})</button></div>${rows.length > 300 ? '<p class="hint">يُعرض أول 300 صف.</p>' : ""}` : ""}</div>`;
  }
  async function syncGo() {
    const pv = IC.syncProv;
    if (!pv) return toast("اختر المزوّد", "e");
    IC.busy = true; IC.syncMsg = ""; render();
    try {
      if (pv !== "main" && !(await siteSupport())) throw new Error(SITES_OLD);
      const j = await fn("smm-order", { action: "services", provider: pv });
      const list = Array.isArray(j) ? j : j.services || [];
      if (!list.length) throw new Error("المزوّد لم يُرجع أي خدمة");
      const by = new Map();
      list.forEach((x) => by.set(String(x.service != null ? x.service : x.id) + "|" + String(x.country || ""), x));
      IC.sync = D.products.filter((p) => p.smm_service && isOnProvider(p, pv)).map((p) => {
        const x = by.get(String(p.smm_service) + "|" + String(p.smm_country || ""));
        if (!x) return { p, old: +p.p, nw: 0, state: "missing", sel: false };
        const type = p.ptype || (SV() ? SV().typeOf(p) : "smm");
        const nw = priceOf({ rate: x.rate }, type, num(p.smm_mk, 0));
        const same = Math.abs(nw - p.p) <= Math.max(1e-9, p.p * 0.0005);
        return { p, old: +p.p, nw, state: same ? "same" : "changed", sel: !same };
      });
      IC.syncMsg = `✓ ${IC.sync.length} منتج: ${IC.sync.filter((r) => r.state === "changed").length} تغيّر سعره، ${IC.sync.filter((r) => r.state === "missing").length} غير موجود عند المزوّد.`;
    } catch (e) { IC.syncMsg = "✗ " + String(e.message || e); IC.sync = []; }
    finally { IC.busy = false; render(); }
  }

  /* ------------------------------------------------------------------ PRODUCTS: strict filters + bulk actions ------------------------------------------------------------------ */
  const PF = { q: "", cat: "", type: "", prov: "", dl: "", av: "", sort: "def", n: 100 };
  const SEL = new Set();
  const origProducts = VIEW.products;
  function plist() {
    const sv = SV();
    let a = D.products.map((p, i) => ({ p, i }));
    const q = norm(PF.q);
    a = a.filter(({ p }) => (!PF.cat || p.c === PF.cat) && (!q || norm((p.ar || "") + " " + (p.en || "") + " " + (p.id || "") + " " + (p.smm_service || "")).includes(q)));
    const list = sv.refine(a.map((x) => x.p), { type: PF.type, provider: PF.prov, delivery: PF.dl, avail: PF.av }, {});
    const keep = new Set(list);
    a = a.filter((x) => keep.has(x.p));
    if (PF.sort !== "def") {
      const order = sv.sortList(a.map((x) => x.p), PF.sort, { price: (p) => +p.p });
      const pos = new Map(order.map((p, k) => [p, k]));
      a.sort((x, y) => pos.get(x.p) - pos.get(y.p));
    }
    return a;
  }
  function pitem({ p, i }) {
    const sv = SV(), t = p.ptype || sv.typeOf(p), pvd = sv.providerOf(p), dl = sv.deliveryOf(p), av = sv.availOf(p);
    const badges = `<i class="ic-bd t-${esc(t)}">${esc(typeLab(t))}</i>${pvd !== "manual" ? `<i class="ic-bd">${esc(pvd === "main" ? "SMM" : pvd)}</i>` : ""}<i class="ic-bd ${dl === "auto" ? "ok" : "er"}">${dl === "auto" ? "تلقائي" : "يدوي"}</i>${av === "hidden" ? '<i class="ic-bd er">مخفي</i>' : av === "out" ? '<i class="ic-bd er">غير متاح</i>' : ""}`;
    return `<div class="it ic-it${SEL.has(p.id) ? " on" : ""}"><input type="checkbox" data-ic="psel" data-id="${esc(p.id)}"${SEL.has(p.id) ? " checked" : ""} aria-label="تحديد"><span class="thm">${p.img ? `<img src="${esc(p.img)}" alt="">` : ic("box")}</span><div class="im"><b>${esc(p.ar)}</b><small>${esc(catName(p.c))} · ${p.k == "link" ? "🔗 رابط" : esc(money(+p.p || 0))}${+p.pin > 0 ? " · 📌 " + p.pin : ""}</small><div class="ic-bds">${badges}</div></div><button class="b b2 sm" data-a="pin" data-i="${i}" title="تثبيت في الرئيسية">${+p.pin > 0 ? "📌" : "📍"}</button><button class="b b2 sm" data-a="edit" data-i="${i}">تعديل</button><button class="b bd2 sm" data-a="del" data-k="products" data-i="${i}">حذف</button></div>`;
  }
  function plistHtml() {
    const a = plist(), shown = a.slice(0, PF.n);
    return `<div class="ic-cnt">${a.length} نتيجة · محدد ${SEL.size}</div>${shown.map(pitem).join("") || '<p class="hint">لا نتائج مطابقة.</p>'}${a.length > shown.length ? `<div class="acts"><button class="b b2" type="button" data-ic="pmore">عرض المزيد (${a.length - shown.length})</button></div>` : ""}`;
  }
  const refreshList = () => { const el = $("#ic-plist"); if (el) el.innerHTML = plistHtml(); const b = $("#ic-bn"); if (b) b.textContent = SEL.size; };
  function bulkBar() {
    const sv = SV(), provs = [...new Set(D.products.map((p) => sv.providerOf(p)))].sort();
    return `<div class="card ic-bulk2"><h3>إجراءات جماعية (<span id="ic-bn">${SEL.size}</span> منتج محدد)</h3>
      <div class="acts"><button class="b b2 sm" type="button" data-ic="psel-all">تحديد كل نتائج الفلتر</button><button class="b b2 sm" type="button" data-ic="psel-none">إلغاء التحديد</button></div>
      <div class="ic-brow"><select class="inp sm" id="ic-mvc">${cats().map((c) => opt(c.id, (c.ar || c.en || c.id) + " · " + catHubLabel(c), "")).join("")}</select><label class="ic-chk"><input type="checkbox" id="ic-mvt" checked> مواءمة نوع المنتج مع القسم</label><button class="b sm" type="button" data-ic="b-move">نقل إلى قسم</button></div>
      <div class="ic-brow"><select class="inp sm" id="ic-bty">${TYPE_OPTS.map(([k, l]) => opt(k, l.replace(/\s*\(.*$/, ""), "")).join("")}</select><button class="b sm" type="button" data-ic="b-type">تغيير نوع المنتج</button></div>
      <div class="ic-brow"><input class="inp sm" id="ic-bpc" type="number" step="1" dir="ltr" placeholder="± %" style="width:84px"><button class="b sm" type="button" data-ic="b-pct">زيادة / خفض السعر %</button><input class="inp sm" id="ic-bmk" type="number" min="0" step="1" dir="ltr" placeholder="ربح %" style="width:84px"><button class="b sm" type="button" data-ic="b-mk">إعادة احتساب بهامش ربح</button></div>
      <div class="ic-brow"><button class="b b2 sm" type="button" data-ic="b-hide">إخفاء</button><button class="b b2 sm" type="button" data-ic="b-show">إظهار</button><button class="b b2 sm" type="button" data-ic="b-out">غير متاح</button><button class="b b2 sm" type="button" data-ic="b-in">متاح</button><button class="b b2 sm" type="button" data-ic="b-auto">تسليم تلقائي</button><button class="b b2 sm" type="button" data-ic="b-man">تسليم يدوي</button><button class="b bd2 sm" type="button" data-ic="b-del">حذف المحدد</button></div>
      <p class="hint">بعد أي إجراء اضغط «نشر الآن» لتطبيقه على المتجر. الحذف نهائي (بعد النشر).</p></div>`;
  }
  function productsView() {
    if (ed != null && D.products[ed]) return origProducts() + editExtras(D.products[ed], ed);
    const sv = SV();
    const provs = [...new Set(D.products.map((p) => sv.providerOf(p)))].sort();
    return `<div class="card"><h2>المنتجات (${D.products.length})</h2>
      <div class="ic-bar"><input class="inp" id="ic-pq" type="search" placeholder="بحث بالاسم / المعرّف / رقم الخدمة" value="${esc(PF.q)}" data-ic="pf" data-f="q">
        <select class="inp" data-ic="pf" data-f="cat">${opt("", "كل الأقسام", PF.cat)}${cats().map((c) => opt(c.id, (c.ar || c.en || c.id) + " · " + catHubLabel(c), PF.cat)).join("")}</select>
        <select class="inp" data-ic="pf" data-f="type">${opt("", "كل الأنواع", PF.type)}${TYPE_OPTS.map(([k, l]) => opt(k, l.replace(/\s*\(.*$/, ""), PF.type)).join("")}</select>
        <select class="inp" data-ic="pf" data-f="prov">${opt("", "كل المزوّدين", PF.prov)}${provs.map((k) => opt(k, k === "main" ? "المزوّد الرئيسي (SMM)" : k === "manual" ? "يدوي (بلا مزوّد)" : provName(k), PF.prov)).join("")}</select>
        <select class="inp" data-ic="pf" data-f="dl">${opt("", "كل أنواع التسليم", PF.dl)}${opt("auto", "تلقائي", PF.dl)}${opt("manual", "يدوي", PF.dl)}</select>
        <select class="inp" data-ic="pf" data-f="av">${opt("", "كل الحالات", PF.av)}${opt("available", "متاح", PF.av)}${opt("out", "غير متاح", PF.av)}${opt("hidden", "مخفي", PF.av)}</select>
        <select class="inp" data-ic="pf" data-f="sort">${opt("def", "الترتيب: افتراضي (نوع ← علامة ← اسم)", PF.sort)}${opt("pa", "السعر: من الأقل", PF.sort)}${opt("pd", "السعر: من الأعلى", PF.sort)}${opt("name", "الاسم", PF.sort)}</select></div>
      <div class="acts"><button class="b" data-a="add" data-k="products">+ منتج</button><button class="b b2" type="button" data-tab="import">مركز الاستيراد ←</button></div></div>${bulkBar()}<div class="card"><div id="ic-plist">${plistHtml()}</div></div>`;
  }
  const selIds = () => D.products.filter((p) => SEL.has(p.id));
  function bulk(act) {
    const L = selIds();
    if (!L.length) return toast("حدّد منتجاً واحداً على الأقل", "e");
    const sv = SV();
    const done = (m) => { save(); toast(`${m} (${L.length}). اضغط نشر للتطبيق`); render(); };
    if (act === "b-del") {
      if (!confirm(`حذف ${L.length} منتج؟ لا يمكن التراجع بعد النشر.`)) return;
      const ids = new Set(L.map((p) => p.id));
      D.products = D.products.filter((p) => !ids.has(p.id)); SEL.clear();
      return done("تم الحذف");
    }
    if (act === "b-move") {
      const cid = ($("#ic-mvc") || {}).value, c = D.categories.find((k) => k.id === cid);
      if (!c) return toast("اختر القسم", "e");
      const align = !!($("#ic-mvt") || {}).checked, hub = hubOfCat(c);
      L.forEach((p) => {
        p.c = cid;
        if (align && DEFAULT_TYPE[hub]) {
          const t = hub === "apps" && p.ptype === "gift_card" ? "gift_card" : DEFAULT_TYPE[hub];
          retype(p, t);
        }
      });
      return done("تم النقل إلى «" + (c.ar || c.en) + "»");
    }
    if (act === "b-type") { const t = ($("#ic-bty") || {}).value; L.forEach((p) => retype(p, t)); return done("تم تغيير النوع"); }
    if (act === "b-pct") {
      const v = parseFloat(($("#ic-bpc") || {}).value);
      if (!isFinite(v) || v <= -100) return toast("أدخل نسبة صحيحة", "e");
      L.forEach((p) => { const n = (+p.p || 0) * (1 + v / 100); p.p = n >= 0.1 ? Math.max(0.01, r2(n)) : Math.max(0.000001, r6(n)); });
      return done("تم تعديل الأسعار");
    }
    if (act === "b-mk") {
      const v = parseFloat(($("#ic-bmk") || {}).value);
      if (!isFinite(v) || v < 0) return toast("أدخل نسبة ربح صحيحة", "e");
      L.forEach((p) => { const cost = (+p.p || 0) / (1 + num(p.smm_mk, 0) / 100); const n = cost * (1 + v / 100); p.p = n >= 0.1 ? Math.max(0.01, r2(n)) : Math.max(0.000001, r6(n)); p.smm_mk = v; });
      return done("تمت إعادة احتساب الأسعار");
    }
    const flag = { "b-hide": ["hid", true], "b-show": ["hid", false], "b-out": ["oos", true], "b-in": ["oos", false], "b-auto": ["auto", true], "b-man": ["auto", false] }[act];
    if (flag) {
      L.forEach((p) => { if (flag[0] === "auto") { if (flag[1]) delete p.auto; else p.auto = false; } else if (flag[1]) p[flag[0]] = true; else delete p[flag[0]]; });
      return done("تم التحديث");
    }
    void sv;
  }
  /* change a product's type consistently (how it is ordered, what the buyer must type, quantity limits) */
  function retype(p, t) {
    p.ptype = t;
    p.smm_input = t === "smm" ? "" : t === "gift_card" ? "none" : "text";
    if (t === "smm") { delete p.req; } else { p.qmin = 1; p.qmax = 1; const r = SV().requiredOf({ ...p, req: undefined }); if (r.length) p.req = r; else delete p.req; }
    const b = SV().brandOf(p); if (b && b.key !== "other") p.bk = b.key;
  }

  /* extra controls shown under the original product editor */
  function editExtras(p, i) {
    const k = "products." + i + ".";
    const req = Array.isArray(p.req) ? p.req : SV().requiredOf(p);
    return `<div class="card"><h3>نوع المنتج والتسليم (مركز الاستيراد)</h3><div class="g2">
      ${F("نوع المنتج (يحدد طريقة الطلب والقسم الرئيسي)", k + "ptype", { t: "sel", o: [["", "تلقائي (حسب الاسم والمزوّد)"], ...TYPE_OPTS.map(([a, b]) => [a, b])], re: 1 })}
      <label class="fld"><span>تسليم يدوي (لا يُرسل للمزوّد تلقائياً)</span><input type="checkbox" data-ic="manual" data-i="${i}"${p.auto === false ? " checked" : ""}></label>
      ${F("غير متاح (يُخفى من الشراء)", k + "oos", { t: "chk", re: 1 })}
      ${F("مخفي من المتجر", k + "hid", { t: "chk", re: 1 })}
      ${F("الكمية / الفئة (مثال: 60 UC)", k + "amount", { t: "num" })}${F("الوحدة (UC / Diamonds …)", k + "unit", { d: 1 })}
      ${F("نسبة الربح المحفوظة %", k + "smm_mk", { t: "num" })}
      </div><div class="ic-req"><b>الحقول المطلوبة من الزبون:</b>${REQ_OPTS.map(([v, l]) => `<label class="ic-chk"><input type="checkbox" data-ic="req" data-i="${i}" data-v="${v}"${req.includes(v) ? " checked" : ""}> ${esc(l)}</label>`).join("")}</div>
      <p class="hint">الحقول المطلوبة تظهر كتلميح في خانة الإدخال عند الزبون (تُدمج القيم في سطر واحد مفصول بـ | عند الطلب). «التسليم اليدوي» يُبقي ربط الخدمة ولا يرسل الطلب للمزوّد.</p></div>`;
  }

  /* ------------------------------------------------------------------ TOP-UP MANAGER (games & apps) ------------------------------------------------------------------ */
  function topupsView() {
    // Build category/product indexes once. The previous hubOfCat fallback scanned all products
    // for each category, which made the games screen slow on a 9k-item catalog.
    const byCat = new Map();
    D.products.forEach((p, i) => {
      if (!byCat.has(p.c)) byCat.set(p.c, []);
      byCat.get(p.c).push({ p, i });
    });
    const list = cats().filter((c) => {
      if (c.ty !== "shop") return false;
      if (c.hub === "games" || c.hub === "apps") return true;
      if (c.hub === "none" || c.ty === "boost" || c.ty === "hub") return false;
      const ps = byCat.get(c.id) || [];
      if (!ps.length) return false;
      const n = { games: 0, apps: 0, smm: 0 };
      ps.forEach(({ p }) => { const h = SV().hubOf(p); if (h && n[h] != null) n[h]++; });
      return n.apps > n.games ? true : n.games > 0;
    });
    const mk = (c) => {
      const ci = D.categories.indexOf(c), k = "categories." + ci + ".";
      const pkgs = byCat.get(c.id) || [];
      return `<div class="card"><div class="g2">${F("الاسم (عربي)", k + "ar")}${F("الاسم (إنجليزي)", k + "en", { d: 1 })}
        ${F("القسم الرئيسي", k + "hub", { t: "sel", o: [["games", "شحن ألعاب"], ["apps", "تطبيقات واشتراكات"], ["none", "مستقل"]], re: 1 })}${F("صورة اللعبة / التطبيق", k + "image_url", { t: "img", w: 1 })}</div>
        <h4>الباقات (${pkgs.length})</h4>${pkgs.map(({ p, i }) => pkgRow(p, i)).join("") || '<p class="hint">لا توجد باقات بعد.</p>'}
        <div class="acts"><button class="b sm" type="button" data-ic="pkg-add" data-c="${esc(c.id)}">+ باقة جديدة</button><button class="b bd2 sm" type="button" data-ic="cat-del" data-c="${esc(c.id)}">حذف القسم وباقاته</button></div></div>`;
    };
    return `<div class="card"><h2>إدارة الألعاب والتطبيقات</h2><p class="hint">كل لعبة أو تطبيق قسم مستقل داخل القسم الرئيسي (ألعاب / تطبيقات) وتحته عدة باقات. لكل باقة سعرها وكميتها وحالتها وطريقة تسليمها (تلقائي عبر المزوّد أو يدوي) ورقم الخدمة عند المزوّد.</p>
      <div class="acts"><button class="b" type="button" data-ic="hub-add" data-h="games">+ لعبة جديدة</button><button class="b" type="button" data-ic="hub-add" data-h="apps">+ تطبيق / اشتراك جديد</button></div></div>${list.map(mk).join("") || '<div class="card"><p class="hint">لا توجد ألعاب أو تطبيقات بعد. أنشئ واحدة أو استوردها من «مركز الاستيراد».</p></div>'}`;
  }
  function pkgRow(p, i) {
    const dl = SV().deliveryOf(p), av = SV().availOf(p);
    const f = (label, field, val, type, w) => `<label class="fld"${w ? ` style="grid-column:span ${w}"` : ""}><span>${label}</span><input class="inp sm" ${type === "number" ? 'type="number" step="any" dir="ltr"' : ""} data-ic="pset" data-i="${i}" data-f="${field}" data-t="${type}" value="${esc(val == null ? "" : val)}"></label>`;
    const sel = (label, field, cur, opts) => `<label class="fld"><span>${label}</span><select class="inp sm" data-ic="pset" data-i="${i}" data-f="${field}" data-t="${field}">${opts.map(([v, l]) => opt(v, l, cur)).join("")}</select></label>`;
    return `<div class="ic-pkg">${f("اسم الباقة", "ar", p.ar, "text", 2)}${f("السعر", "p", p.p, "number")}${f("الكمية", "amount", p.amount, "number")}
      ${sel("الحالة", "avail", av, [["available", "متاح"], ["out", "غير متاح"], ["hidden", "مخفي"]])}${sel("التسليم", "delivery", dl, [["auto", "تلقائي (API)"], ["manual", "يدوي"]])}
      ${f("رقم الخدمة عند المزوّد", "smm_service", p.smm_service, "text")}${f("معرّف الفئة عند المزوّد", "smm_country", p.smm_country, "text")}
      <div class="ic-req">${REQ_OPTS.map(([v, l]) => `<label class="ic-chk"><input type="checkbox" data-ic="req" data-i="${i}" data-v="${v}"${(Array.isArray(p.req) ? p.req : SV().requiredOf(p)).includes(v) ? " checked" : ""}> ${esc(l)}</label>`).join("")}
        <button class="b b2 sm" type="button" data-ic="open-edit" data-i="${i}">تعديل كامل</button><button class="b bd2 sm" type="button" data-ic="pkg-del" data-i="${i}">حذف</button></div></div>`;
  }

  /* ------------------------------------------------------------------ SMM MANAGER ------------------------------------------------------------------ */
  const MF = { q: "", prov: "", cat: "", n: 60 };
  function smmmgrView() {
    const sv = SV();
    let a = D.products.map((p, i) => ({ p, i })).filter(({ p }) => (p.ptype ? p.ptype === "smm" : sv.typeOf(p) === "smm" && (p.smm_service || (D.categories.find((c) => c.id === p.c) || {}).ty === "boost")));
    const provs = [...new Set(a.map((x) => sv.providerOf(x.p)))].sort();
    const q = norm(MF.q);
    a = a.filter(({ p }) => (!MF.prov || sv.providerOf(p) === MF.prov) && (!MF.cat || p.c === MF.cat) && (!q || norm((p.ar || "") + " " + (p.en || "") + " " + (p.smm_service || "") + " " + (p.smm_cat || "")).includes(q)));
    const shown = a.slice(0, MF.n);
    const row = ({ p, i }) => {
      const u = +p.smm_qty > 0 ? +p.smm_qty : 1, per1000 = ((+p.p || 0) * 1000) / u;
      const inp = (field, val, type, w) => `<input class="inp sm" ${type === "number" ? 'type="number" step="any" dir="ltr"' : 'dir="ltr"'} style="width:${w}px" data-ic="sset" data-i="${i}" data-f="${field}" value="${esc(val == null ? "" : val)}">`;
      return `<tr><td class="ic-nm"><b>${esc(p.ar)}</b><br><small class="od-m">${esc(sv.providerOf(p) === "main" ? "المزوّد الرئيسي" : provName(sv.providerOf(p)))}</small></td>
        <td>${inp("smm_service", p.smm_service, "text", 90)}</td><td>${inp("per1000", r6(per1000), "number", 90)}</td>
        <td>${inp("qmin", p.qmin || 0, "number", 70)}</td><td>${inp("qmax", p.qmax || 0, "number", 80)}</td>
        <td><select class="inp sm" data-ic="sset" data-i="${i}" data-f="rf">${[[0, "—"], [30, "30 يوم"], [60, "60 يوم"], [90, "90 يوم"], [365, "365 يوم"], [-1, "مدى الحياة"]].map(([v, l]) => opt(v, l, p.rf || 0)).join("")}</select></td>
        <td><input type="checkbox" data-ic="sset" data-i="${i}" data-f="dr"${p.dr ? " checked" : ""} aria-label="drip-feed"></td>
        <td><input type="checkbox" data-ic="sset" data-i="${i}" data-f="active"${p.hid || p.oos ? "" : " checked"} aria-label="نشط"></td>
        <td><div class="acts" style="gap:4px"><button class="b b2 sm" type="button" data-ic="open-edit" data-i="${i}">تعديل</button><button class="b bd2 sm" type="button" data-ic="sdel" data-i="${i}" title="حذف الخدمة المستوردة">حذف</button></div></td></tr>`;
    };
    return `<div class="card"><h2>إدارة خدمات الرشق (SMM)</h2><p class="hint">هذه الصفحة للرشق فقط: كل صف هو خدمة مرتبطة بمزوّد ورقم خدمة محددين. استخدم فلاتر المزوّد والقسم والبحث للوصول السريع. تعديل «سعر الألف» يحدّث سعر الوحدة تلقائياً؛ لا تستورد خدمات جديدة من هنا.</p>
      <div class="ic-bar"><input class="inp" type="search" placeholder="بحث باسم الخدمة أو رقمها" data-ic="mf" data-f="q" value="${esc(MF.q)}"><select class="inp" data-ic="mf" data-f="prov">${opt("", "كل مزوّدي الرشق", MF.prov)}${provs.map((k) => opt(k, k === "main" ? "المزوّد الرئيسي" : provName(k), MF.prov)).join("")}</select><select class="inp" data-ic="mf" data-f="cat">${opt("", "كل الأقسام", MF.cat)}${cats().filter((c) => c.ty === "boost" || D.products.some((p) => p.c === c.id && p.ptype === "smm")).map((c) => opt(c.id, c.ar || c.en || c.id, MF.cat)).join("")}</select></div>
      <div class="ic-cnt">${a.length} خدمة رشق</div><div class="tbw"><table class="tb ic-tb"><thead><tr><th>الخدمة</th><th>رقم الخدمة</th><th>سعر الألف $</th><th>أقل كمية</th><th>أعلى كمية</th><th>تعويض</th><th>Drip</th><th>نشط</th><th></th></tr></thead><tbody>${shown.map(row).join("") || '<tr><td colspan="9">لا خدمات رشق</td></tr>'}</tbody></table></div>
      ${a.length > shown.length ? `<div class="acts"><button class="b b2" type="button" data-ic="smore">عرض المزيد (${a.length - shown.length})</button></div>` : ""}</div>`;
  }

  /* ------------------------------------------------------------------ events ------------------------------------------------------------------ */
  function onChange(e) {
    const t = e.target, a = t.dataset && t.dataset.ic;
    if (!a) return;
    const i = +t.dataset.i;
    switch (a) {
      case "prov": IC.prov = t.value; IC.catList = []; IC.cat = ""; IC.fetched = false; IC.rows = []; IC.msg = ""; return render();
      case "target": IC.target = t.value; if (IC.fetched) IC.rows = IC.rows.map((r) => ({ ...r, target: t.value && t.value !== "auto" ? t.value : HUB_OF_TYPE[r.type], cat: "auto" })); return render();
      case "cat": IC.cat = t.value; return;
      case "mk": IC.mk = Math.max(0, num(t.value, 30)); return;
      case "ft": IC.ft = t.value; IC.page = 0; return refreshPrev();
      case "fs": IC.fs = t.value; IC.page = 0; return refreshPrev();
      case "rsel": IC.rows[i].sel = t.checked; return refreshPrev();
      case "rtype": IC.rows[i].type = t.value; IC.rows[i].cat = "auto"; return refreshPrev();
      case "rcat": IC.rows[i].cat = t.value; return refreshPrev();
      case "rmk": IC.rows[i].mk = Math.max(0, num(t.value, 0)); return refreshPrev();
      case "ssel": IC.sync[i].sel = t.checked; return render();
      case "sprov": IC.syncProv = t.value; IC.sync = []; IC.syncMsg = ""; return render();
      case "pf": PF[t.dataset.f] = t.value; PF.n = 100; return t.dataset.f === "q" ? refreshList() : (refreshList());
      case "mf": MF[t.dataset.f] = t.value; MF.n = 60; return render();
      case "psel": t.checked ? SEL.add(t.dataset.id) : SEL.delete(t.dataset.id); return refreshList();
      case "req": return setReq(D.products[i], t.dataset.v, t.checked);
      case "manual": { const p = D.products[i]; if (t.checked) p.auto = false; else delete p.auto; return save(); }
      case "pset": return pset(i, t);
      case "sset": return sset(i, t);
    }
  }
  function onInput(e) {
    const t = e.target, a = t.dataset && t.dataset.ic;
    if (a === "fq") { IC.fq = t.value; IC.page = 0; return refreshPrev(); }
    if (a === "pf" && t.dataset.f === "q") { PF.q = t.value; return refreshList(); }
    if (a === "mk") { IC.mk = Math.max(0, num(t.value, 30)); }
  }
  function setReq(p, v, on) {
    if (!p) return;
    const cur = Array.isArray(p.req) ? p.req.slice() : SV().requiredOf(p);
    const n = on ? [...new Set([...cur, v])] : cur.filter((x) => x !== v);
    p.req = n;
    save();
  }
  function pset(i, t) {
    const p = D.products[i], f = t.dataset.f, v = t.value;
    if (!p) return;
    if (f === "p" || f === "amount") { const n = parseFloat(v); if (f === "amount" && !(n > 0)) delete p.amount; else p[f] = isFinite(n) ? n : 0; }
    else if (f === "avail") { delete p.hid; delete p.oos; if (v === "hidden") p.hid = true; else if (v === "out") p.oos = true; }
    else if (f === "delivery") { if (v === "manual") p.auto = false; else delete p.auto; }
    else p[f] = String(v).trim();
    save();
  }
  function sset(i, t) {
    const p = D.products[i], f = t.dataset.f;
    if (!p) return;
    if (f === "per1000") { const u = +p.smm_qty > 0 ? +p.smm_qty : 1; const n = (parseFloat(t.value) || 0) * u / 1000; p.p = n >= 0.1 ? Math.max(0.01, r2(n)) : Math.max(0.000001, r6(n)); }
    else if (f === "qmin" || f === "qmax") p[f] = Math.max(0, Math.floor(parseFloat(t.value) || 0));
    else if (f === "rf") { const n = parseInt(t.value, 10) || 0; if (n) p.rf = n; else delete p.rf; }
    else if (f === "dr") { if (t.checked) p.dr = true; else delete p.dr; }
    else if (f === "active") { if (t.checked) { delete p.hid; delete p.oos; } else p.hid = true; }
    else if (f === "smm_service") p.smm_service = String(t.value).trim();
    if (f === "qmax" && p.qmax && p.qmin && p.qmax < p.qmin) p.qmax = p.qmin;
    save();
  }
  function onClick(e) {
    const b = e.target.closest && e.target.closest("[data-ic]");
    if (!b || !/^(BUTTON|A)$/.test(b.tagName)) return;
    const a = b.dataset.ic, i = +b.dataset.i;
    switch (a) {
      case "mode": IC.mode = b.dataset.v; IC.prov = ""; IC.target = defTarget(); IC.catList = []; IC.cat = ""; IC.rows = []; IC.fetched = false; IC.msg = ""; IC.sync = []; return render();
      case "fetch": return doFetch();
      case "loadcats": return loadCats();
      case "selall": filteredRows().forEach(([r]) => { if (r.status === "new") r.sel = true; }); return refreshPrev();
      case "selnone": IC.rows.forEach((r) => (r.sel = false)); return refreshPrev();
      case "bulk-type": { const v = ($("#ic-bt") || {}).value; IC.rows.forEach((r) => { if (r.sel) { r.type = v; r.cat = "auto"; } }); return refreshPrev(); }
      case "bulk-cat": { const v = ($("#ic-bc") || {}).value; IC.rows.forEach((r) => { if (r.sel) r.cat = v; }); return refreshPrev(); }
      case "bulk-mk": { const v = Math.max(0, num(($("#ic-bm") || {}).value, 0)); IC.rows.forEach((r) => { if (r.sel) r.mk = v; }); return refreshPrev(); }
      case "pg": IC.page = Math.max(0, IC.page + +b.dataset.d); return refreshPrev();
      case "save": return saveRows();
      case "img-go": return autoImages();
      case "img-stop": IMG.stop = true; return;
      case "sync-go": return syncGo();
      case "sync-apply": {
        const L = IC.sync.filter((r) => r.sel && r.state === "changed");
        if (!L.length) return toast("لا توجد أسعار محددة للتطبيق", "e");
        L.forEach((r) => { r.p.p = r.nw; r.old = r.nw; r.state = "same"; r.sel = false; delete r.p.oos; });
        save(); toast(`تم تحديث ${L.length} سعر. اضغط نشر`); return render();
      }
      case "sync-missing": {
        const L = IC.sync.filter((r) => r.state === "missing");
        if (!L.length) return;
        if (!confirm(`وسم ${L.length} منتج بأنه «غير متاح»؟`)) return;
        L.forEach((r) => (r.p.oos = true));
        save(); toast(`تم وسم ${L.length} منتج غير متاح. اضغط نشر`); return render();
      }
      case "psel-all": plist().forEach(({ p }) => SEL.add(p.id)); return refreshList();
      case "psel-none": SEL.clear(); return refreshList();
      case "pmore": PF.n += 100; return refreshList();
      case "smore": MF.n += 60; return render();
      case "sdel": {
        const p = D.products[i];
        if (!p || (p.ptype ? p.ptype !== "smm" : SV().typeOf(p) !== "smm")) return toast("هذا المنتج ليس خدمة رشق", "e");
        const provider = SV().providerOf(p);
        if (!confirm(`حذف خدمة الرشق «${p.ar || p.en || p.id}» من المتجر؟\\nالمزوّد: ${provider === "main" ? "المزوّد الرئيسي" : provName(provider)}\\nرقم الخدمة: ${p.smm_service || "—"}\\nسيُحذف المنتج من الكتالوج بعد النشر، ولن يُحذف من موقع المزوّد.`)) return;
        D.products.splice(i, 1);
        SEL.delete(p.id);
        save();
        toast("حُذفت الخدمة من قائمة المتجر. اضغط «نشر» لتطبيق الحذف.");
        return render();
      }
      case "open-edit": tab = "products"; ed = i; return render();
      case "pkg-add": {
        const c = D.categories.find((k) => k.id === b.dataset.c);
        if (!c) return;
        const p = NEW.products();
        const hub = hubOfCat(c);
        Object.assign(p, { c: c.id, ar: (c.ar || "") + " — باقة جديدة", en: (c.en || "") + " — new package", p: 1, ptype: DEFAULT_TYPE[hub] || "game_topup", smm_input: "text", auto: false, qmin: 1, qmax: 1, req: ["player_id"], ...(c.bk ? { bk: c.bk } : {}) });
        D.products.push(p); save(); return render();
      }
      case "pkg-del": if (!confirm("حذف هذه الباقة؟")) return; D.products.splice(i, 1); save(); return render();
      case "cat-del": {
        const c = D.categories.find((k) => k.id === b.dataset.c);
        if (!c) return;
        const n = D.products.filter((p) => p.c === c.id).length;
        if (!confirm(`حذف «${c.ar || c.en}» مع ${n} باقة؟`)) return;
        D.products = D.products.filter((p) => p.c !== c.id); D.categories = D.categories.filter((k) => k !== c); save(); return render();
      }
      case "hub-add": {
        const h = b.dataset.h, c = NEW.categories();
        Object.assign(c, { ar: h === "games" ? "لعبة جديدة" : "تطبيق جديد", en: h === "games" ? "New game" : "New app", ty: "shop", i: h === "games" ? "bolt" : "users", hub: h });
        D.categories.push(c); save(); return render();
      }
    }
    if (/^b-/.test(a)) return bulk(a);
  }
  document.addEventListener("change", onChange);
  document.addEventListener("input", onInput);
  document.addEventListener("click", onClick);

  /* ------------------------------------------------------------------ registration ------------------------------------------------------------------ */
  VIEW.import = importView;
  VIEW.products = productsView;
  VIEW.topups = topupsView;
  VIEW.smmmgr = smmmgrView;
  [["import", "استيراد ومزامنة الخدمات"], ["topups", "إدارة الألعاب والتطبيقات"], ["smmmgr", "إدارة خدمات الرشق"]].forEach((t) => { if (!TABS.some((x) => x[0] === t[0])) TABS.push(t); });
  TI.import = '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>';
  TI.topups = '<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>';
  TI.smmmgr = '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>';
  const storeGrp = TG.find((x) => x[0] === "المتجر");
  if (storeGrp) storeGrp[1] = storeGrp[1].filter((k) => !["import", "topups", "smmmgr"].includes(k));
  const advancedGrp = TG.find((x) => x[0] === "أدوات متقدمة");
  if (advancedGrp) advancedGrp[1] = advancedGrp[1].filter((k) => k !== "apis");
  const providerGrp = ["إدارة الخدمات والربط", ["apis", "import", "smmmgr", "topups"]];
  if (!TG.some((x) => x[0] === providerGrp[0])) TG.splice(Math.max(0, TG.findIndex((x) => x[0] === "أدوات متقدمة")), 0, providerGrp);

  g.AMXImport = { build, priceOf, hubOfCat, catHubLabel, ensureCat, retype, v: 2 };
  // admin.js may have rendered its first screen before this extension was loaded.
  if (typeof render === "function") render();
})(window);
