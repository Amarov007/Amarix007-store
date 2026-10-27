/* AMARIX007 — hubs.js (v1)
   Two master sections ("hubs") that replace dozens of flat tabs, same idea as the Numbers and Boost panels:
     #/g/games   شحن الألعاب               PUBG + every game top-up category (regional variants are folded into one card)
     #/g/apps    تطبيقات واشتراكات          live / chat apps, AI subscriptions, CapCut …
     #/g/games/<family>                    the regions of one game (EAFC Mobile -> ID / KH / MY / SG)
   Nothing is moved or renamed: every category keeps its id, its products and its own route (#/c/<id>),
   so provider sync, carts and old links keep working. The hubs only change how the strip, the home grid and the drawer list them.

   Membership (first match wins, all optional overrides live on the category object in store_config):
     category.hub = "games" | "apps"     explicit
     id pubg                            -> games      ids live / ai -> apps
     type shop + products with smm_provider -> apps if the name looks like a live / chat / creative app, else games
   Brand logos: category.image_url, else  <storage>/store-media/brands/<file>  listed in brands/index.json
   (an array of file names such as "pubg_mobile.webp"), else a coloured letter tile. */
(function (g) {
  "use strict";

  const HUBS = [
    { id: "games", i: "bolt", ar: "شحن الألعاب", en: "Game Top-up", da: "اشحن ألعابك المفضلة مباشرة — اختر اللعبة وأكمل طلبك", de: "Top up your favourite games — pick a game and order", gold: "pubg_mobile" },
    { id: "apps", i: "users", ar: "تطبيقات واشتراكات", en: "Apps & Subscriptions", da: "عملات تطبيقات البث والدردشة واشتراكات الذكاء الاصطناعي وأدوات الإبداع", de: "Coins for live & chat apps, AI subscriptions and creative tools", gold: "" }
  ];
  const APP_RE = /\b(bigo|chamet|dazz|capcut|yalla|imo|tiktok|soul\s?chill|weplay|likee|tango|hago|poppo|uplive|live|chat|netflix|spotify|canva|discord)\b/i;
  const LIVE_RE = /\b(bigo|chamet|dazz|yalla|imo|tiktok|soul\s?chill|weplay|likee|tango|hago|poppo|uplive|live|chat)\b/i;
  const REGION_RE = /^(.*?)\s*\(([^()]+)\)\s*$/;
  const BRAND_DIR = "/storage/v1/object/public/store-media/brands/";

  let MEM = { games: [], apps: [] }; // hub id -> member categories (from the last apply)
  let OF = {}; // member category id -> hub id
  let BRANDS = null; // Map slug -> file name (from brands/index.json)
  let CUR = null; // { id, sub } of the page on screen, to repaint when logos arrive

  /* ---------- tiny helpers (app.js globals are read at call time: lang, P, pr, money, ic, SB_URL, ex) ---------- */
  const L = (ar, en) => (typeof lang !== "undefined" && lang === "en" ? en : ar);
  const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
  const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const nm = (o) => (typeof lang !== "undefined" && lang === "en" ? o.en || o.ar : o.ar || o.en) || "";
  const hue = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  const colorOf = (c, seed) => (/^#[0-9a-f]{3,8}$/i.test(String(c || "")) ? c : `hsl(${hue(seed)} 62% 48%)`);
  const prods = () => (typeof P !== "undefined" && Array.isArray(P) ? P : []);
  const minPrice = (list) => { let m = Infinity; list.forEach((p) => { const v = pr(p); if (v < m) m = v; }); return m === Infinity ? 0 : m; };

  /* ---------- membership ---------- */
  function hubKey(c) {
    if (!c) return null;
    if (c.hub === "none") return null; // admin: keep this category standalone
    if (c.hub === "games" || c.hub === "apps") return c.hub;
    if (c.id === "pubg") return "games";
    if (c.id === "live" || c.id === "ai") return "apps";
    if (c.ty === "boost") return null;
    if (c.ty === "shop") {
      const members = prods().filter((p) => String(p.c) === String(c.id));
      const types = new Set(members.map((p) => String(p.ptype || "")).filter(Boolean));
      // Explicit product types outrank provider fields and category-name heuristics.
      if (types.size && [...types].every((t) => t === "game_topup")) return "games";
      if (types.size && [...types].every((t) => t === "app_subscription" || t === "gift_card")) return "apps";
      if (types.size && [...types].every((t) => t === "smm")) return null;
      if (c.hub === "games" || c.hub === "apps") return c.hub;
      if (members.some((p) => p.smm_provider || p.smm_service)) return APP_RE.test(String(c.en || "") + " " + String(c.ar || "")) ? "apps" : "games";
    }
    return null;
  }
  /* the two hubs are real records in store_config.categories (type "hub", ids hub_games / hub_apps) so the admin can rename,
     re-icon, re-order or describe them; the built-in text is only the fallback when the record is missing */
  const pseudo = (h, r) => ({ id: "hub_" + h.id, ty: "hub", hub: true, i: (r && r.i) || h.i, ar: (r && r.ar) || h.ar, en: (r && r.en) || h.en, da: (r && r.da) || h.da, de: (r && r.de) || h.de, f: [], embed_url: "", image_url: (r && r.image_url) || "" });
  let INFO = {};

  /* app.js calls this on the visible-category list: members are replaced by one entry per hub (at the position of its first member) */
  function apply(list, all) {
    MEM = { games: [], apps: [] };
    OF = {};
    INFO = {};
    const rest = [], pos = {};
    (list || []).forEach((c) => {
      const h = hubKey(c);
      if (!h) return void rest.push(c);
      MEM[h].push(c);
      OF[c.id] = "hub_" + h;
      if (!(h in pos)) pos[h] = rest.length;
    });
    const out = rest.slice();
    const ix = (id) => { const n = (all || []).findIndex((c) => c.id === id); return n < 0 ? 1e9 : n; };
    HUBS.filter((h) => MEM[h.id].length)
      .map((h) => {
        const r = (all || []).find((c) => c.id === "hub_" + h.id && c.ty === "hub");
        INFO[h.id] = pseudo(h, r);
        return { e: INFO[h.id], k: r ? ix(r.id) : Math.min(...MEM[h.id].map((c) => ix(c.id))) };
      })
      .sort((a, b) => a.k - b.k)
      .forEach((m) => { let at = out.findIndex((c) => ix(c.id) > m.k); if (at < 0) at = out.length; out.splice(at, 0, m.e); });
    loadBrands();
    return out;
  }

  /* ---------- items of a hub (one card each) ---------- */
  function items(hubId) {
    const out = [];
    MEM[hubId].forEach((c) => {
      const ps = prods().filter((p) => p.c == c.id);
      const first = ps.find((p) => p.smm_country) || {};
      out.push({ kind: "cat", id: c.id, href: "#/c/" + encodeURIComponent(c.id), ar: c.ar, en: c.en, logo: c.image_url, keys: [first.smm_country, slug(c.en)], grp: hubId === "apps" ? (LIVE_RE.test(c.en) ? "live" : "tools") : "game", from: minPrice(ps), n: ps.length, sub: L(ps.length + " باقة", ps.length + " packs") });
    });
    /* fold regional variants "Game (ID)" "Game (KH)" … into one family card (needs two or more regions) */
    const fam = {};
    out.forEach((it) => {
      if (it.kind !== "cat") return;
      const m = REGION_RE.exec(it.en || "");
      if (m && m[1].length > 1) (fam[m[1].trim().toLowerCase()] = fam[m[1].trim().toLowerCase()] || []).push({ it, base: m[1].trim(), region: m[2].trim() });
    });
    const gone = new Set(), folded = [];
    Object.keys(fam).forEach((k) => {
      const f = fam[k];
      if (f.length < 2) return;
      f.forEach((x) => gone.add(x.it));
      const key = slug(f[0].base);
      folded.push({ kind: "fam", key, href: "#/g/" + hubId + "/" + encodeURIComponent(key), ar: f[0].base, en: f[0].base, keys: [key, ...f[0].it.keys], grp: f[0].it.grp, regions: f.map((x) => ({ ...x.it, region: x.region })), from: Math.min(...f.map((x) => x.it.from).filter((v) => v > 0).concat([Infinity])), n: f.reduce((a, x) => a + x.it.n, 0), sub: L(f.length + " مناطق", f.length + " regions") });
      if (!isFinite(folded[folded.length - 1].from)) folded[folded.length - 1].from = 0;
    });
    const all = out.filter((it) => !gone.has(it)).concat(folded);
    all.sort((a, b) => (b.top || 0) - (a.top || 0) || String(a.en).localeCompare(String(b.en), "en", { sensitivity: "base" }));
    return all;
  }

  /* ---------- cards ---------- */
  function logoFile(keys) {
    if (!BRANDS) return "";
    for (const k of keys || []) if (k && BRANDS.has(slug(k))) return BRANDS.get(slug(k));
    return "";
  }
  function logoHtml(it) {
    const url = it.logo || (logoFile(it.keys) && SB_URL + BRAND_DIR + logoFile(it.keys));
    const letter = esc((String(it.en || it.ar || "?").match(/[A-Za-z0-9]/) || [String(it.ar || "?").charAt(0)])[0].toUpperCase());
    return `<span class="hx-l${url ? " img" : ""}">${url ? `<img src="${esc(url)}" alt="" loading="lazy" decoding="async">` : letter}</span>`;
  }
  function card(it) {
    const name = nm(it);
    const price = it.from ? `<span class="hx-p"><small>${L("من", "From")}</small><b class="n">${money(it.from)}</b></span>` : "";
    const badge = it.badge ? `<i class="hx-bd gold">${esc(it.badge)}</i>` : it.kind === "fam" ? `<i class="hx-bd">${esc(it.sub)}</i>` : "";
    return `<a class="hx-c${badge ? " has-bd" : ""}" href="${esc(it.href)}" data-n="${esc((it.en + " " + it.ar).toLowerCase())}" data-g="${esc(it.grp || "")}" style="--bc:${colorOf(it.color, it.en)}">${badge}${logoHtml(it)}<span class="hx-t"><b><bdi>${esc(name)}</bdi></b><small>${esc(it.kind === "fam" ? L("اختر المنطقة", "Choose region") : it.sub || "")}</small></span>${price}</a>`;
  }
  const RG = { ID: ["إندونيسيا", "Indonesia"], KH: ["كمبوديا", "Cambodia"], MY: ["ماليزيا", "Malaysia"], SG: ["سنغافورة", "Singapore"], TH: ["تايلاند", "Thailand"], VN: ["فيتنام", "Vietnam"], PH: ["الفلبين", "Philippines"], IN: ["الهند", "India"], EU: ["أوروبا", "Europe"], EUROPE: ["أوروبا", "Europe"], SEA: ["جنوب شرق آسيا", "Southeast Asia"], ASIA: ["آسيا", "Asia"], AMERICAS: ["الأمريكتان", "Americas"], TW: ["تايوان", "Taiwan"], "TW/HK/MO": ["تايوان / هونغ كونغ / ماكاو", "Taiwan / HK / Macau"], GLOBAL: ["عالمي", "Global"] };
  function regionCard(r) {
    const rn = RG[String(r.region).toUpperCase()], label = rn ? rn[typeof lang !== "undefined" && lang === "en" ? 1 : 0] : r.region, fs = r.region.length <= 2 ? 22 : r.region.length <= 3 ? 18 : 12;
    return `<a class="hx-c" href="${esc(r.href)}" data-n="${esc((r.region + " " + r.en).toLowerCase())}" style="--bc:${colorOf(null, r.region)}"><span class="hx-l rg" style="font-size:${fs}px">${esc(r.region)}</span><span class="hx-t"><b><bdi>${esc(label)}</bdi></b><small>${esc(r.sub)}</small></span>${r.from ? `<span class="hx-p"><small>${L("من", "From")}</small><b class="n">${money(r.from)}</b></span>` : ""}</a>`;
  }

  /* ---------- page ---------- */
  const GROUPS = { live: ["بث ودردشة", "Live & chat"], ai: ["ذكاء اصطناعي", "AI"], tools: ["أدوات", "Tools"] };
  function body(hubId, sub) {
    const list = items(hubId);
    if (sub) {
      const f = list.find((x) => x.kind === "fam" && x.key === sub);
      if (f) return `<div class="hx-g" id="hx-g">${f.regions.sort((a, b) => a.region.localeCompare(b.region)).map(regionCard).join("")}</div>`;
    }
    return `<div class="hx-g" id="hx-g">${list.map(card).join("")}</div>`;
  }
  function page(id, sub) {
    const h = INFO[id] || HUBS.find((x) => x.id === id);
    if (!h || !MEM[id] || !MEM[id].length) return `<div class="box hx-none">${L("هذا القسم غير متاح حالياً.", "This section is not available right now.")} <a class="b sm" href="#/">${L("الرئيسية", "Home")}</a></div>`;
    CUR = { id, sub: sub || "" };
    const list = items(id), fam = sub && list.find((x) => x.kind === "fam" && x.key === sub);
    const head = `<div class="box row sb-hero hx-hero"><span class="tile big${h.image_url ? " img" : ""}">${typeof ico === "function" ? ico(h, 30) : ic(h.i, 30)}</span><div style="flex:1"><h1>${esc(fam ? nm(fam) : h[typeof lang !== "undefined" ? lang : "ar"])}</h1><p class="pd">${esc(fam ? L("اختر منطقة حسابك", "Choose your account region") : lang === "en" ? h.de : h.da)}</p></div></div>`;
    const back = fam ? `<a class="b b2 sm sb-back" href="#/g/${esc(id)}">${ic("chev", 14)} ${esc(nm(h))}</a>` : "";
    const grps = [...new Set(list.map((x) => x.grp).filter((k) => GROUPS[k]))];
    const chips = !fam && grps.length > 1 ? `<div class="hx-f" role="group"><button type="button" class="hx-chip on" data-hx="f" data-f="">${L("الكل", "All")}</button>${grps.map((k) => `<button type="button" class="hx-chip" data-hx="f" data-f="${k}">${GROUPS[k][lang === "en" ? 1 : 0]}</button>`).join("")}</div>` : "";
    const search = `<div class="hx-s"><span class="sb-si">${ic("search", 18)}</span><input id="hx-q" class="inp" type="search" placeholder="${esc(L("ابحث عن لعبة أو تطبيق…", "Search a game or app…"))}" autocomplete="off" enterkeyhint="search" aria-label="${esc(L("بحث", "Search"))}"></div>`;
    return `<div class="hx" data-hub="${esc(id)}">${back}${head}${fam ? "" : `<div class="box hx-bar">${search}${chips}</div>`}${body(id, sub)}<p class="hx-empty" id="hx-e" hidden>${L("لا توجد نتائج مطابقة.", "No matches.")}</p></div>`;
  }

  /* ---------- live filtering (no re-render, the keyboard stays open) ---------- */
  let fq = "", ff = "";
  function filter() {
    const cs = document.querySelectorAll("#hx-g .hx-c");
    let shown = 0;
    cs.forEach((c) => {
      const ok = (!fq || (c.dataset.n || "").includes(fq)) && (!ff || c.dataset.g === ff);
      c.hidden = !ok;
      if (ok) shown++;
    });
    const e = document.getElementById("hx-e");
    if (e) e.hidden = shown > 0;
  }
  if (typeof document !== "undefined") {
    document.addEventListener("input", (e) => {
      if (e.target && e.target.id === "hx-q") { fq = e.target.value.trim().toLowerCase(); filter(); }
    });
    document.addEventListener("click", (e) => {
      const b = e.target.closest && e.target.closest('[data-hx="f"]');
      if (!b) return;
      ff = b.dataset.f || "";
      document.querySelectorAll(".hx-chip").forEach((c) => c.classList.toggle("on", c === b));
      filter();
    });
    addEventListener("hashchange", () => { fq = ""; ff = ""; });
  }

  /* ---------- brand logos manifest (one tiny request; absent = letter tiles) ---------- */
  function loadBrands() {
    if (BRANDS !== null || typeof fetch !== "function" || typeof SB_URL === "undefined") return;
    BRANDS = new Map();
    fetch(SB_URL + BRAND_DIR + "index.json", { cache: "no-cache" })
      .then((r) => (r.ok ? r.json() : []))
      .then((a) => {
        (Array.isArray(a) ? a : []).forEach((f) => { if (typeof f === "string") BRANDS.set(slug(f.replace(/\.[a-z0-9]+$/i, "")), f); });
        const el = document.getElementById("hx-g");
        if (el && CUR) el.outerHTML = body(CUR.id, CUR.sub);
        filter();
      })
      .catch(() => {});
  }

  g.AMXHub = {
    v: 1,
    hubs: HUBS,
    apply,
    page,
    hubKey: (id) => OF[id] || null,
    count: (c) => (MEM[String(c && c.id).replace(/^hub_/, "")] ? items(String(c.id).replace(/^hub_/, "")).length : 0),
  };
})(window);
