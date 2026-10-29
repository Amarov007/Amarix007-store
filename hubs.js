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
    { id: "games", i: "bolt", ar: "شحن الألعاب", en: "Game Top-up", da: "اختر اللعبة والمنطقة والباقة، ثم أدخل معرّف اللاعب قبل الدفع", de: "Choose the game, region and package, then enter your player ID before payment", gold: "pubg_mobile" },
    { id: "chat", i: "users", ar: "تطبيقات الدردشة والبث", en: "Chat & Live Apps", da: "اشحن عملات تطبيقات البث والدردشة مع إدخال معرّف الحساب المطلوب", de: "Top up live and chat app coins using the required account ID", gold: "" },
    { id: "ai", i: "spark", ar: "اشتراكات الذكاء الاصطناعي", en: "AI Subscriptions", da: "اشتراكات أدوات الذكاء الاصطناعي وخططها — ستظهر الباقات المتاحة فقط", de: "AI tools and subscription plans — only verified available packages are listed", gold: "" },
    { id: "apps", i: "phone", ar: "التطبيقات والبطاقات الرقمية", en: "Apps & Digital Cards", da: "اشتراكات التطبيقات والبطاقات الرقمية وأدوات الإبداع", de: "App subscriptions, digital cards and creative tools", gold: "" }
  ];
  const AI_RE = /\b(chatgpt|openai|claude|gemini|midjourney|perplexity|copilot|cursor|suno|runway|elevenlabs|artificial intelligence|\bai\b|ذكاء اصطناعي|شات جي بي تي|كلود|جيميناي)\b/i;
  const CHAT_RE = /\b(bigo|chamet|dazz|poppo|likee|tango|weplay|hago|uplive|imo|yalla|soul\s?chill|live|chat|discord|telegram premium|whatsapp)\b/i;
  const APP_RE = /\b(capcut|netflix|spotify|canva|notion|adobe|microsoft 365|office 365|icloud|google one|premium|subscription|اشتراك|بطاقة رقمية)\b/i;
  const LIVE_RE = CHAT_RE;
  const REGION_RE = /^(.*?)\s*\(([^()]+)\)\s*$/;
  const BRAND_DIR = "/storage/v1/object/public/store-media/brands/";

  let MEM = Object.fromEntries(HUBS.map((h) => [h.id, []])); // hub id -> member categories
  let OF = {}; // member category id -> hub id
  let BRANDS = null;
  let CUR = null;

  /* ---------- tiny helpers ---------- */
  const L = (ar, en) => (typeof lang !== "undefined" && lang === "en" ? en : ar);
  const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
  const slug = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const nm = (o) => (typeof lang !== "undefined" && lang === "en" ? o.en || o.ar : o.ar || o.en) || "";
  const hue = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; };
  const colorOf = (c, seed) => (/^#[0-9a-f]{3,8}$/i.test(String(c || "")) ? c : `hsl(${hue(seed)} 62% 48%)`);
  const prods = () => (typeof P !== "undefined" && Array.isArray(P) ? P : []);
  const minPrice = (list) => { let m = Infinity; list.forEach((p) => { const v = pr(p); if (v < m) m = v; }); return m === Infinity ? 0 : m; };

  /* Category assignment prioritizes recognizable product families before legacy imported hub values. */
  function hubKey(c) {
    if (!c || c.ty === "hub") return null;
    if (c.hub === "none") return null;
    const label = String(c.id || "") + " " + String(c.ar || "") + " " + String(c.en || "");
    const members = prods().filter((p) => String(p.c) === String(c.id));
    const pnames = members.slice(0, 80).map((p) => String(p.ar || "") + " " + String(p.en || "")).join(" ");
    if (AI_RE.test(label) || AI_RE.test(pnames)) return "ai";
    if (CHAT_RE.test(label) || CHAT_RE.test(pnames)) return "chat";
    if (APP_RE.test(label)) return "apps";
    if (c.id === "pubg") return "games";
    if (c.id === "live") return "chat";
    if (c.id === "ai") return "ai";
    if (["games", "chat", "ai", "apps"].includes(c.hub)) return c.hub;
    if (c.ty === "boost" || c.ty === "numbers" || c.ty === "funded" || c.ty === "embed") return null;
    if (c.ty === "shop" && members.length) {
      const types = new Set(members.map((p) => String(p.ptype || "")).filter(Boolean));
      if (types.size && [...types].every((t) => t === "smm")) return null;
      if (types.size && [...types].every((t) => t === "game_topup")) return "games";
      if (types.size && [...types].every((t) => t === "app_subscription")) return "apps";
      if (types.size && [...types].every((t) => t === "gift_card")) return "games";
    }
    return null;
  }
  /* the two hubs are real records in store_config.categories (type "hub", ids hub_games / hub_apps) so the admin can rename,
     re-icon, re-order or describe them; the built-in text is only the fallback when the record is missing */
  const pseudo = (h, r) => ({ id: "hub_" + h.id, ty: "hub", hub: true, i: (r && r.i) || h.i, ar: (r && r.ar) || h.ar, en: (r && r.en) || h.en, da: (r && r.da) || h.da, de: (r && r.de) || h.de, f: [], embed_url: "", image_url: (r && r.image_url) || "" });
  let INFO = {};

  /* app.js calls this on the visible-category list: members are replaced by one entry per hub (at the position of its first member) */
  function apply(list, all) {
    MEM = Object.fromEntries(HUBS.map((h) => [h.id, []]));
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
        return { e: INFO[h.id], k: r ? Math.min(ix(r.id), Math.min(...MEM[h.id].map((c) => ix(c.id)))) : Math.min(...MEM[h.id].map((c) => ix(c.id))) };
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
      if (!ps.length && !(hubId === "games" && c.id === "pubg-mobile-uc")) return;
      const first = ps.find((p) => p.smm_country) || {};
      out.push({ kind: "cat", id: c.id, href: "#/c/" + encodeURIComponent(c.id), ar: c.ar, en: c.en, logo: c.image_url, keys: [first.smm_country, slug(c.en)], grp: hubId === "chat" ? "live" : hubId === "ai" ? "ai" : hubId === "apps" ? "tools" : "game", from: minPrice(ps), n: ps.length, badge: ps.length ? "" : L("قريباً","Coming soon"), sub: ps.length ? L(ps.length + " باقة", ps.length + " packs") : L("يلزم ربط مزوّد الشدات أولاً","Provider connection required") });
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
  const fallbackLogo = () => `<svg viewBox="0 0 48 48" width="34" height="34" fill="none" aria-hidden="true"><path d="M14 17h20a8 8 0 0 1 7.6 10.5l-2 6a4.5 4.5 0 0 1-7.4 1.8l-4.2-3.6h-4l-4.2 3.6a4.5 4.5 0 0 1-7.4-1.8l-2-6A8 8 0 0 1 14 17Z" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><path d="M17 22v8m-4-4h8m10-2h.1m4 5h.1" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`;
  function logoHtml(it) {
    const url = it.logo || (logoFile(it.keys) && SB_URL + BRAND_DIR + logoFile(it.keys));
    return `<span class="hx-l${url ? " img" : " hx-fallback"}">${url ? `<img data-hx-logo="1" src="${esc(url)}" alt="" loading="lazy" decoding="async">` : fallbackLogo()}</span>`;
  }
  // Broken or stale brand URLs must never leave an empty logo tile.
  document.addEventListener("error", (event) => {
    const img = event.target;
    if (img && img.tagName === "IMG" && img.hasAttribute("data-hx-logo")) {
      img.removeAttribute("data-hx-logo");
      const tile = img.closest(".hx-l");
      if (tile) { tile.classList.remove("img"); tile.classList.add("hx-fallback"); tile.innerHTML = fallbackLogo(); }
    }
  }, true);
  function card(it) {
    const name = nm(it);
    if (it.n === 0) return `<div class="hx-c hx-coming" aria-disabled="true" data-n="${esc((it.en + " " + it.ar).toLowerCase())}" style="--bc:${colorOf(it.color, it.en)}"><i class="hx-bd gold">${esc(it.badge || L("قريباً","Coming soon"))}</i>${logoHtml(it)}<span class="hx-t"><b><bdi>${esc(name)}</bdi></b><small>${esc(it.sub || "")}</small></span></div>`;
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
  const GROUPS = { live: ["بث ودردشة", "Live & chat"], ai: ["ذكاء اصطناعي", "AI"], tools: ["أدوات وبطاقات", "Tools & cards"], game: ["الألعاب", "Games"] };
  function body(hubId, sub) {
    const list = items(hubId);
    if (sub) {
      const f = list.find((x) => x.kind === "fam" && x.key === sub);
      if (f) return `<div class="hx-g" id="hx-g">${f.regions.sort((a, b) => a.region.localeCompare(b.region)).map(regionCard).join("")}</div>`;
    }
    if (!list.length) return `<div class="box hx-none"><h2>${L("نعمل على إضافة الباقات", "Packages are being added")}</h2><p>${L("لا توجد باقات مفعّلة في هذا القسم حالياً. لن نعرض أسعاراً أو منتجات غير مؤكدة. تواصل مع الدعم لطلب اشتراك محدد.", "There are no verified active packages in this section yet. We do not show unverified prices or products. Contact support to request a specific subscription.")}</p><a class="b sm" href="#/support">${L("تواصل مع الدعم", "Contact support")}</a></div>`;
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
