if (window.top === window.self) { const af = document.getElementById("antiframe"); if (af) af.remove(); } else { try { window.top.location = window.self.location.href; } catch (e) {} }
/* ===================================================================== AMARIX007 — Admin panel logic (admin.js) --------------------------------------------------------------------- Sections 1. Config & security notes 7. Views (one per tab) 2. State & helpers 8. Events (input / change / click) 3. Icons & constants 9. Uploads, backup & import 4. Form builders 10. Supabase session & REST helper 5. Toast & draft saving 11. Publish, API settings, users, orders 6. Misc builders 12. Boot SECURITY NOTES - Only the Supabase *anon* key is used here. Admin power comes from the signed-in user's JWT + Row Level Security, NOT from this file. - RLS must be enabled (see supabase-schema.sql): store_config -> public SELECT, admin-only INSERT/UPDATE orders -> admin can SELECT all and UPDATE status profiles -> admin can SELECT all (policies exist in your schema) api_settings -> admin only (it contains secret keys) - Secret keys edited in the "APIs" tab are saved ONLY to api_settings. They are stripped from everything published to store_config (which the public storefront can read). ===================================================================== */
"use strict";

/* ---------- 1. Config ---------- */
const SB_URL = "https://pvuobngrybygohendwaz.supabase.co";
const SB_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dW9ibmdyeWJ5Z29oZW5kd2F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMTI0ODIsImV4cCI6MjEwNzg4ODQ4Mn0.enSKw1_Wt58iK8-Y0eaHMWtBGQ7HyYXP_JEwYLsSfpU"; // anon key only

/* ---------- 2. State & helpers ---------- */
const $ = (s) => document.querySelector(s);
const esc = (x) =>
  String(x ?? "").replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";");
const clone = (o) => JSON.parse(JSON.stringify(o));
const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const EMPTY = {
  ts: 0,
  site: {
    n1: "MY",
    n2: "STORE",
    logo: "",
    sa: "",
    se: "",
    desc: "",
    col: { g: "#2F442C", m: "#A7E8BD", ac: "#52B788" },
    rt: { ar: "", en: "" },
    risk: { ar: "", en: "" },
    ai_on: true,
  },
  partner: {
    on: false,
    name: "",
    logo: "",
    url: "",
    ar: "",
    en: "",
    ba: "",
    be: "",
    banner_bg_url: "",
  },
  social: {},
  payments: [],
  categories: [],
  products: [],
  embeds: [],
  banners: [],
  coupons: {},
  rates: { USD: [1, "USDT"], SYP: [140, "ل.س"] },
  api: {},
};
const PUB = window.AMX || EMPTY;
let D = clone(PUB),
  dirty = false,
  tab = "home",
  ed = null,
  pq = "",
  pcat = "",
  SES = null,
  IS_ADMIN = null,
  STAFF = null; // STAFF: مصفوفة صلاحيات الموظف المفعّل (null = ليس موظفاً)
let BASE_TS = 0,
  CFG_OK = false,
  API_LOADED = false; // BASE_TS: version of store_config when this page loaded; CFG_OK: config really came from the server; API_LOADED: api_settings really loaded
/* Only USDT (base, rate 1) and SYP exist. Older configs (SAR base + AED/EUR/...) are converted: SYP per 1 USDT = SYP rate / USD rate. Product prices are read as USDT. */
function normRates(r) {
  r = r && typeof r == "object" ? r : {};
  const num = (x) => (Array.isArray(x) && +x[0] > 0 ? +x[0] : 0);
  const u = num(r.USD),
    sy = num(r.SYP);
  let syp = sy ? (u ? (u === 1 ? sy : sy / u) : sy / 0.267) : 140;
  syp = Math.round(syp * 100) / 100;
  return { USD: [1, "USDT"], SYP: [syp, (r.SYP && r.SYP[1]) || "ل.س"] };
}
const curName = (k) => (k == "USD" ? "USDT" : k);
const fix = () => {
  for (const k in EMPTY) if (D[k] == null) D[k] = clone(EMPTY[k]);
  D.rates = normRates(D.rates);
  D.site = { ...EMPTY.site, ...D.site };
  D.partner = { ...EMPTY.partner, ...D.partner };
};
fix();
const g = (o, p) => p.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
const st = (o, p, v) => {
  const k = p.split("."),
    l = k.pop();
  k.reduce((a, x) => a[x] ?? (a[x] = {}), o)[l] = v;
};

/* What is allowed to leave this browser for the PUBLIC store_config row / drafts / backups. `api` holds secret keys (SMM, payment, AI) and must never be published. */
function pubData() {
  const { api, ...rest } = D;
  return clone(rest);
}

/* ---------- 3. Icons & constants ---------- */
const I = {
  bank: '<path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  phone:
    '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  bot: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v8h14v-8M7.5 8C5 8 5 4 8 4c2 0 4 4 4 4s2-4 4-4c3 0 3 4.5.5 4"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  users:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.5 0 4.5 1.5 4.5 4"/>',
  box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  bolt: '<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  spark:
    '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  cart: '<path d="M3 4h2l2.4 11h10.2l2-8H6.2"/><circle cx="9" cy="19" r="1.2"/><circle cx="17" cy="19" r="1.2"/>',
  heart:
    '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  hs: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
};
const ICONS = Object.keys(I);
const ic = (n, z = 22) =>
  `<svg width="${z}" height="${z}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ I[n] || I.box }</svg>`;
const TYPES = [
  ["shop", "متجر عادي (سلة وشراء)"],
  ["boost", "خدمات زيادة (يُطلب رابط الحساب)"],
  ["embed", "تضمين مواقع"],
  ["funded", "حسابات ممولة"],
  ["numbers", "أرقام (مجانية ومدفوعة)"],
];
const KINDS = [
  ["buy", "🛒 للشراء (سلة + طلب)"],
  ["link", "🔗 رابط للزيارة (زر فقط، بلا سعر وبلا سلة)"],
];
const DELIV = [
  [0, "رابط مستودع / منصة"],
  [1, "بيانات حساب / اعتماد"],
  [2, "ملف تنفيذي / سورس كود"],
  [3, "تنفيذ على رابط حساب العميل"],
];
const TABS = [
  ["home", "الرئيسية"],
  ["site", "الموقع والهوية"],
  ["partner", "الشريك"],
  ["banners", "البانرات"],
  ["categories", "الأقسام"],
  ["products", "المنتجات"],
  ["embeds", "التضمين"],
  ["coupons", "كوبونات"],
  ["social", "التواصل"],
  ["payments", "وسائل الدفع"],
  ["users", "المستخدمين"],
  ["staff", "الموظفون"],
  ["activity", "سجل النشاط"],
  ["apis", "إعدادات APIs"],
  ["affiliates", "المسوقين"],
  ["orders", "الطلبات"],
  ["stats", "الإحصاءات"],
  ["tickets", "تذاكر الدعم"],
  ["push", "إشعار للجميع"],
];

const TI = {
  home:'<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  site:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  partner:'<path d="M8 12l3 3 5-6"/><rect x="3" y="4" width="18" height="16" rx="3"/>',
  banners:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 15l5-4 4 3 3-2 6 4"/>',
  categories:'<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>',
  products:'<path d="M21 8l-9-5-9 5 9 5z"/><path d="M3 8v8l9 5 9-5V8M12 13v8"/>',
  embeds:'<path d="M8 8l-5 4 5 4M16 8l5 4-5 4M14 5l-4 14"/>',
  coupons:'<path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 0 0-6V6H3z"/><path d="M9 6v12" stroke-dasharray="2 2"/>',
  social:'<circle cx="6" cy="12" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M8.7 10.7l6.6-3.4M8.7 13.3l6.6 3.4"/>',
  payments:'<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/>',
  activity:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  staff:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
  users:'<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 4a4 4 0 0 1 0 8M22 21a7 7 0 0 0-4-6"/>',
  apis:'<path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/><circle cx="12" cy="12" r="3"/>',
  affiliates:'<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  orders:'<path d="M6 2l-2 4v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6l-2-4z"/><path d="M4 6h16M9 11a3 3 0 0 0 6 0"/>',
  stats:'<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  tickets:'<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  push:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'
};
const TG = [
  ["المبيعات", ["orders","payments","coupons","affiliates","users"]],
  ["المتجر", ["home","products","categories","banners","embeds","partner","site"]],
  ["التواصل والدعم", ["tickets","push","social"]],
  ["النظام", ["apis","stats","staff","activity"]]
];
const tabIc = (k) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TI[k] || ""}</svg>`;
/* ---------- الموظفون: ما يراه كل حساب ---------- */
const TAB_PERM = { orders: "orders", tickets: "tickets", users: "users", products: "products" };
const isStaffOnly = () => IS_ADMIN === false && Array.isArray(STAFF);
const canTab = (k) => !isStaffOnly() || (!!TAB_PERM[k] && STAFF.includes(TAB_PERM[k]));
const sideNav = () => {
  const nm = Object.fromEntries(TABS);
  return TG.map(([g, ks]) => `<div class="sg"><span class="sgl">${g}</span>${ks.filter((k) => nm[k] && canTab(k)).map((k) => `<button class="${tab == k ? "on" : ""}" data-tab="${k}">${tabIc(k)}<span>${nm[k]}</span></button>`).join("")}</div>`).join("");
};
const SOCIAL = [
  ["whatsapp", "wa", "واتساب", "https://wa.me/9665XXXXXXXX"],
  ["telegram", "tg", "تلغرام", "https://t.me/username"],
  ["instagram", "ig", "إنستغرام", "https://instagram.com/username"],
  ["x", "xx", "X (تويتر)", "https://x.com/username"],
  ["youtube", "yt", "يوتيوب", "https://youtube.com/@channel"],
  ["facebook", "fb", "فيسبوك", "https://facebook.com/page"],
  ["tiktok", "tt", "تيك توك", "https://tiktok.com/@username"],
  ["email", "mail", "البريد", "mailto:support@example.com"],
];
const PAY_STATUSES = [
  ["pending", "بانتظار الدفع"],
  ["review", "قيد التحقق"],
  ["paid", "تم الدفع"],
];
const PAY_ICONS = [
  ["", "بدون (حروف أو شعار مرفوع)"],
  ["usdt", "USDT"],
  ["binance", "Binance"],
];
const ORDER_STATUSES = [
  ["new", "جديد"],
  ["processing", "قيد التنفيذ"],
  ["done", "مكتمل"],
  ["cancelled", "ملغي"],
];
const baseCur = () => {
  const e = Object.entries(D.rates).find(([, v]) => +v[0] == 1);
  return e ? e[0] : "USD";
};
const catName = (id) => (D.categories.find((c) => c.id == id) || {}).ar || "—";

/* Pre-publish checklist: warnings only, nothing is changed or published */
const PH_RE = /example\.com|ضع هنا رابط الموقع/i;
const urlOk = (u) => /^https?:\/\/[^\s/?#]+\.[^\s/?#]+/i.test(String(u || "").trim());
const embOk = (e) => urlOk(e.u) && !PH_RE.test([e.u, e.ar, e.en, e.da, e.de].join(" "));
const genTitle = (x) => /^\s*(عنوان|title)\s*$/i.test(String(x || ""));
function nearWhite(c) {
  const h = String(c || "").trim().replace("#", "");
  let r, g, b;
  if (/^[0-9a-f]{3,4}$/i.test(h)) [r, g, b] = [...h].slice(0, 3).map((x) => parseInt(x + x, 16));
  else if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  else return false;
  return Math.min(r, g, b) >= 238;
}
function checklist() {
  const L = (a) => a.map((x) => esc(x)).join("، ");
  const emptyCats = D.categories.filter(
    (c) =>
      !D.products.some((p) => p.c == c.id) &&
      !D.embeds.some((e) => e.c == c.id && embOk(e)) &&
      !(urlOk(c.embed_url) && !PH_RE.test(String(c.embed_url)))
  );
  const badLink = D.products.filter((p) => p.k == "link" && !/^https?:\/\/[^\s/?#]+\.[^\s/?#]+/i.test(String(p.lu || "").trim()));
  const phEmb = D.embeds.filter((e) => PH_RE.test([e.u, e.ar, e.en, e.da, e.de].join(" ")));
  const gb = D.banners.map((b, i) => [b, i]).filter(([b]) => genTitle(b.ar) || genTitle(b.en));
  const noAr = D.payments.filter((m) => !String(m.ar || "").trim());
  const white = D.payments.filter((m) => nearWhite(m.color));
  const longD = D.categories.filter((c) => String(c.da || "").length > 280 || String(c.de || "").length > 280);
  const nm = (m) => m.en || m.id || "—";
  return [
    [emptyCats.length, "قسم بلا منتجات وبلا embed صالح", L(emptyCats.map((c) => c.ar || c.id)) + " — يُخفى من المتجر تلقائياً", "categories"],
    [badLink.length, "عنصر «رابط للزيارة» بلا رابط صالح (يظهر الزر معطّلاً)", L(badLink.map((p) => p.ar || p.id)), "products"],
    [phEmb.length, "embed يحوي example.com أو نص «ضع هنا رابط الموقع»", L(phEmb.map((e) => e.ar || e.id)) + " — يُخفى من المتجر تلقائياً", "embeds"],
    [gb.length, "بانر عنوانه «عنوان» أو «Title»", L(gb.map(([, i]) => "بانر " + (i + 1))), "banners"],
    [noAr.length, "وسيلة دفع بلا اسم عربي", L(noAr.map(nm)), "payments"],
    [white.length, "وسيلة دفع لونها أبيض (يُتجاهل في المتجر)", L(white.map((m) => m.ar || nm(m))), "payments"],
    [longD.length, "راجع وصف الأقسام الطويلة قبل النشر (أطول من 280 حرفاً)", L(longD.map((c) => c.ar || c.id)), "categories"],
  ];
}
const checklistHTML = () =>
  `<div class="card"><h2>قائمة فحص قبل النشر</h2><p class="hint">تحذيرات فقط: لا تغيّر شيئاً ولا تنشر.</p><ul class="ckl">${checklist()
    .map(([n, t0, det, tb]) =>
      n
        ? `<li class="w"><span>⚠</span><div><b>${t0} (${n})</b><small>${det}</small></div><button class="b b2 sm" data-tab="${tb}">فتح</button></li>`
        : `<li class="k"><span>✓</span><div><b>${t0}</b></div></li>`
    )
    .join("")}</ul></div>`;

/* ---------- 5. Toast & draft ---------- */
function toast(m, k = "") {
  const e = $("#ts");
  e.textContent = m;
  e.className = "s " + k;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (e.className = ""), k ? 3200 : 2200);
}
function badge() {
  const b = $("#bdg");
  if (!b) return;
  b.className = "bdg " + (dirty ? "d" : "k");
  b.textContent = dirty ? "تعديلات غير منشورة" : "منشور";
}
function save() {
  dirty = true;
  try {
    localStorage.setItem("amx_draft", JSON.stringify(pubData()));
    badge();
  } catch (e) {
    toast("تعذّر حفظ المسودة", "e");
  }
}
let tm;
const later = () => {
  clearTimeout(tm);
  tm = setTimeout(save, 300);
};
const busy = (btn, on) => {
  if (!btn) return;
  if (on) {
    btn.dataset.h = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span> ' + btn.textContent;
  } else if (btn.dataset.h != null) {
    btn.innerHTML = btn.dataset.h;
    btn.disabled = false;
    delete btn.dataset.h;
  }
};

/* ---------- 4. Form builders ---------- */
function imgf(p, v) {
  const d = String(v || "").startsWith("data:"),
    logo = /logo/.test(p);
  return `<div class="imgf"><span class="thm">${ v ? `<img src="${esc(v)}" alt="">` : ic("box", 20) }</span><input class="inp" dir="ltr" data-p="${p}" data-re="1" value="${ d ? "" : esc(v) }" placeholder="${ d ? "صورة مرفوعة ✓" : "https://… رابط الصورة" }"><label class="b b2 sm">رفع<input type="file" accept="image/*" hidden data-up="${p}" data-mx="${ logo ? 512 : 900 }" data-png="${logo ? 1 : 0}"></label>${ v ? `<button class="b bd2 sm" data-a="clr" data-p="${p}" title="حذف">✕</button>` : "" }</div>`;
}
function imgsf(p, v) {
  v = v || [];
  return `<div class="grid-imgs">${v .map( (u, i) => `<span class="thm"><img src="${esc( u )}" alt=""><button data-a="clr-img" data-p="${p}" data-i="${i}">✕</button></span>` ) .join( "" )}</div><label class="dropzone" ondragover="event.preventDefault()" ondrop="event.preventDefault();handleDrop(event,'${p}')"><input type="file" accept="image/*" multiple hidden data-up="${p}" data-mx="1200"><span>اسحب وأفلت الصور هنا أو اضغط للرفع (متعدد)</span></label>`;
}
function F(l, p, o = {}) {
  const v = g(D, p),
    t = o.t || "text",
    a = `data-p="${p}"${o.n ? ' data-n="1"' : ""}${o.re ? ' data-re="1"' : ""}`;
  let h;
  if (t == "chk")
    return `<label class="chk"><input type="checkbox" ${a} ${ v !== false && v ? "checked" : "" }> ${l}</label>`;
  if (t == "area")
    h = `<textarea class="inp" rows="${o.r || 3}" ${a}>${esc(v)}</textarea>`;
  else if (t == "sel")
    h = `<select class="inp" ${a}>${o.o .map( ([k, n]) => `<option value="${esc(k)}" ${k == v ? "selected" : ""}>${esc( n )}</option>` ) .join("")}</select>`;
  else if (t == "img") h = imgf(p, v);
  else if (t == "imgs") h = imgsf(p, v);
  else if (t == "col")
    h = `<input type="color" class="inp col" value="${esc( v || "#000000" )}" ${a}>`;
  else
    h = `<input class="inp" type="${t == "num" ? "number" : "text"}" ${ t == "num" ? 'step="any"' : "" } value="${esc(v)}" ${o.d ? 'dir="ltr"' : ""} ${ o.ph ? `placeholder="${esc(o.ph)}"` : "" } ${a}>`;
  return `<div class="fld ${o.w ? "w2" : ""}"><span>${l}</span>${h}</div>`;
}
function mv(k, i) {
  return `<div class="acts"><button class="b b2 sm" data-a="mv" data-k="${k}" data-i="${i}" data-d="-1">↑</button><button class="b b2 sm" data-a="mv" data-k="${k}" data-i="${i}" data-d="1">↓</button><button class="b bd2 sm" data-a="del" data-k="${k}" data-i="${i}">حذف</button></div>`;
}
const loadingHTML =
  '<div class="ld"><span class="spin"></span> جارٍ التحميل…</div>';

/* Payment currency + exchange rates */
const curOpts = (cur) => {
  const ks = Object.keys(D.rates || {});
  return [["", "بدون (لا يُعرض سطر تحويل)"], ...ks.map((k) => [k, curName(k)])];
};
function ratesCard() {
  const base = baseCur();
  return `<div class="card"><h2>أسعار الصرف (rates)</h2><p class="hint warn">⚠ العملات المعتمدة: USDT (الأساسية) والليرة السورية فقط. أسعار المنتجات ومبلغ الكوبون الثابت تُدخَل بـ USDT. حدّث سعر الليرة قبل البيع بالليرة.</p><p class="hint">سعر الليرة = كم ليرة سورية مقابل 1 USDT (العملة الأساسية ثابتة = 1). يُستخدم لعرض الأسعار ولتحويل الإجمالي بعملة وسيلة الدفع.</p>${Object.entries(D.rates || {})
    .map(
      ([k, v]) =>
        `<div class="it" style="flex-wrap:wrap"><b dir="ltr" style="width:56px">${esc(curName(k))}</b><label class="fld" style="margin:0;width:150px"><span>السعر</span><input class="inp" type="number" step="any" min="0" dir="ltr" data-rt="${esc(k)}" data-ri="0" value="${+v[0] || 0}" ${k == base ? "readonly" : ""}></label><label class="fld" style="margin:0;width:100px"><span>الرمز</span><input class="inp" dir="ltr" data-rt="${esc(k)}" data-ri="1" value="${esc(v[1] || "")}"></label></div>`
    )
    .join("")}</div>`;
}

/* Payment proof: private bucket, short-lived signed link */
const proofBlock = (o) =>
  o.payment_proof
    ? `<div class="od-m">إثبات الدفع: <button class="b b2 sm" data-a="proof-link" data-path="${esc(o.payment_proof)}">عرض الإثبات</button></div>`
    : "";
async function proofLink(btn) {
  const path = btn.dataset.path;
  busy(btn, true);
  try {
    const r = await api("/storage/v1/object/sign/" + (btn.dataset.bkt || "payment-proofs") + "/" + path.split("/").map(encodeURIComponent).join("/"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 300 }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.signedURL) throw new Error(j.message || j.error || "HTTP " + r.status);
    const u = /^https?:/i.test(j.signedURL) ? j.signedURL : SB_URL + "/storage/v1" + (j.signedURL[0] == "/" ? "" : "/") + j.signedURL;
    const a = document.createElement("a");
    a.href = u;
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "b sm";
    a.textContent = "فتح الصورة (الرابط صالح 5 دقائق)";
    btn.replaceWith(a);
  } catch (e) {
    busy(btn, false);
    toast("تعذّر إنشاء رابط الإثبات — " + String(e.message || "").slice(0, 80), "e");
  }
}

/* Category filters (category.f): groups with options; the storefront matches an option's text inside the product's tags / specs / names / description */
function filtersEditor(c, ci) {
  const fs = Array.isArray(c.f) ? c.f : [];
  return `<div class="card fed" style="background:var(--bg)"><h3>فلاتر القسم</h3><p class="hint">يطابق المتجر نص الخيار داخل وسوم/مواصفات/اسم/وصف المنتج.</p>${fs
    .map((gr, gi) => {
      const k = `categories.${ci}.f.${gi}.`;
      return `<div class="fg"><div class="g2">${F("اسم المجموعة (عربي)", k + "ar")}${F("اسم المجموعة (إنجليزي)", k + "en", { d: 1 })}</div><div class="fo">${(Array.isArray(gr.o) ? gr.o : [])
        .map((o, oi) => `<span class="fo-i">${esc(o)}<button type="button" data-a="f-del-opt" data-ci="${ci}" data-gi="${gi}" data-oi="${oi}" title="حذف الخيار">✕</button></span>`)
        .join("")}</div><div class="sw"><input class="inp" data-fo="1" placeholder="خيار جديد…" maxlength="60"><button type="button" class="b b2 sm" data-a="f-add-opt" data-ci="${ci}" data-gi="${gi}">+ خيار</button><button type="button" class="b bd2 sm" data-a="f-del-grp" data-ci="${ci}" data-gi="${gi}">حذف المجموعة</button></div></div>`;
    })
    .join("")}<button type="button" class="b b2 sm" data-a="f-add-grp" data-ci="${ci}">+ مجموعة فلتر</button></div>`;
}
function addFilterOpt(b) {
  const inp = b.parentElement.querySelector("input"),
    v = inp.value.trim().slice(0, 60),
    gr = D.categories[+b.dataset.ci].f[+b.dataset.gi];
  if (!v) return;
  gr.o = Array.isArray(gr.o) ? gr.o : [];
  if (gr.o.some((x) => String(x).toLowerCase() == v.toLowerCase())) return toast("الخيار موجود مسبقاً", "e");
  gr.o.push(v);
  save();
  render();
}

/* Numbers section: free public numbers kept inside the category (category.free). One country per card; numbers one per line: number | optional link to its public messages page. Paid numbers are ordinary products of this category. */
function freeEditor(c, ci) {
  const fr = Array.isArray(c.free) ? c.free : [];
  return `<div class="card fed" style="background:var(--bg)"><h3>الأرقام المجانية (${fr.length} دولة)</h3><p class="hint">كل دولة لها قائمة أرقام، كل رقم في سطر. يمكنك إضافة رابط صفحة رسائل الرقم بعد الرمز | مثال: <span dir="ltr">+15551234567 | https://example.com/messages</span></p>${fr
    .map((x, fi) => {
      const k = `categories.${ci}.free.${fi}.`;
      return `<div class="fg"><div class="g2">${F("اسم الدولة (عربي)", k + "ar")}${F("اسم الدولة (إنجليزي)", k + "en", { d: 1 })}${F("العلم (إيموجي)", k + "fl", { d: 1 })}</div>${F("الأرقام (رقم في كل سطر)", k + "txt", { t: "area", w: 1, d: 1, r: 5 })}<button type="button" class="b bd2 sm" data-a="free-del" data-ci="${ci}" data-fi="${fi}">حذف الدولة</button></div>`;
    })
    .join("")}<button type="button" class="b b2 sm" data-a="free-add" data-ci="${ci}">+ دولة بأرقام مجانية</button><p class="hint">الأرقام المدفوعة: أضف منتجات في تبويب «المنتجات» ضمن هذا القسم، وضع في حقل «وسوم» اسم الخدمة والدولة مطابقَين لخيارات الفلاتر أعلاه (مثال: <span dir="ltr">WhatsApp أمريكا</span>).</p></div>`;
}
/* ---------- 7. Views (one function per sidebar tab) ---------- */
const VIEW = {
  home() {
    const n = D.products.length;
    return `<div class="stats"><div class="stat"><b>${ D.categories.length }</b><span>الأقسام</span></div><div class="stat"><b>${n}</b><span>المنتجات</span></div><div class="stat"><b>${ D.embeds.length }</b><span>التضمين</span></div><div class="stat"><b>${ D.banners.length }</b><span>البانرات</span></div><div class="stat"><b>${ Object.keys(D.coupons).length }</b><span>الكوبونات</span></div></div> <div class="card qa"><h2>إجراءات سريعة</h2><div class="qa-g"><button class="qa-b" data-tab="orders">${tabIc("orders")}<span>مراجعة الطلبات</span></button><button class="qa-b" data-tab="products">${tabIc("products")}<span>إدارة المنتجات</span></button><button class="qa-b" data-tab="apis">${tabIc("apis")}<span>ربط المزوّد واستيراد الخدمات</span></button><button class="qa-b" data-tab="tickets">${tabIc("tickets")}<span>تذاكر الدعم</span></button></div></div> <div id="hs"></div> ${checklistHTML()}<div class="card"><h2>نشر التعديلات</h2><p class="hint">النشر يحفظ إعدادات المتجر في جدول store_config. مفاتيح الـ APIs لا تُنشر أبداً.</p><div class="acts"><button class="b" data-a="pub">نشر الآن</button><button class="b b2" data-a="exp">نسخة احتياطية</button><label class="b b2">استيراد<input type="file" accept=".js,.json" hidden data-imp="1"></label></div></div>`;
  },
  site() {
    const s = "site.";
    return `<div class="card"><h2>الهوية</h2><div class="g2">${F( "الاسم 1", s + "n1", { d: 1 } )}${F("الاسم 2", s + "n2", { d: 1 })}${F("الشعار", s + "logo", { t: "img", w: 1, })}${F("العنوان (عربي)", s + "sa")}${F("العنوان (إنجليزي)", s + "se", { d: 1, })}${F("الوصف", s + "desc", { t: "area", w: 1 })}${F( "حقوق النشر (عربي)", s + "rt.ar", { w: 1 } )}${F("حقوق النشر (إنجليزي)", s + "rt.en", { w: 1, d: 1 })}${F( "تنبيه المخاطر (عربي)", s + "risk.ar", { t: "area", w: 1 } )}${F("تنبيه المخاطر (إنجليزي)", s + "risk.en", { t: "area", w: 1, d: 1, })}</div></div> <div class="card"><h2>الألوان</h2><div class="g3">${F("الأساسي", s + "col.g", { t: "col", })}${F("التمييز", s + "col.m", { t: "col" })}${F("الإطارات", s + "col.ac", { t: "col", })}</div></div> <div class="card"><h2>الدعم الفني الذكي</h2>${F( "إظهار زر الدعم الذكي (AI) في المتجر", s + "ai_on", { t: "chk" } )}<p class="hint">يحتاج نشر دالة ai-support وحفظ مفتاح AI في تبويب إعدادات APIs.</p></div>`;
  },
  partner() {
    const s = "partner.";
    return `<div class="card"><h2>الشريك</h2>${F("إظهار", s + "on", { t: "chk", })}<div class="g2">${F("الاسم", s + "name", { d: 1 })}${F( "الرابط", s + "url", { d: 1 } )}${F("الشعار", s + "logo", { t: "img", w: 1 })}${F( "خلفية البانر (Banner BG)", s + "banner_bg_url", { t: "img", w: 1 } )}${F("الوصف (عربي)", s + "ar", { t: "area", w: 1 })}${F( "الوصف (إنجليزي)", s + "en", { t: "area", w: 1, d: 1 } )}${F("نص الزر (عربي)", s + "ba")}${F("نص الزر (إنجليزي)", s + "be", { d: 1, })}</div></div>`;
  },
  banners() {
    const hs = [
      ["#/", "الرئيسية"],
      ...D.categories.map((c) => ["#/c/" + c.id, "قسم: " + c.ar]),
    ];
    return (
      `<div class="card"><h2>البانرات</h2><button class="b" data-a="add" data-k="banners">+ بانر جديد</button></div>` +
      D.banners
        .map((b, i) => {
          const k = "banners." + i + ".";
          return `<div class="card"><div class="g2">${F( "العنوان (عربي)", k + "ar" )}${F("العنوان (إنجليزي)", k + "en", { d: 1 })}${F( "الوصف (عربي)", k + "sa" )}${F("الوصف (إنجليزي)", k + "se", { d: 1 })}${F("الرابط", k + "h", { t: "sel", o: hs.some((x) => x[0] == b.h) ? hs : [...hs, [b.h, b.h]], })}${F("صورة الخلفية", k + "img", { t: "img" })}</div>${mv( "banners", i )}</div>`;
        })
        .join("")
    );
  },
  categories() {
    return (
      `<div class="card"><h2>الأقسام</h2><div class="acts"><button class="b" data-a="add" data-k="categories">+ قسم جديد</button><button class="b b2" data-a="add-numbers-cat">+ قسم الأرقام (مجانية ومدفوعة)</button></div></div>` +
      D.categories
        .map((c, i) => {
          const k = "categories." + i + ".";
          return `<div class="card"><div class="g2">${F( "الاسم (عربي)", k + "ar" )}${F("الاسم (إنجليزي)", k + "en", { d: 1 })}${F( "الوصف (عربي)", k + "da" )}${F("الوصف (إنجليزي)", k + "de", { d: 1 })}${F("النوع", k + "ty", { t: "sel", o: TYPES, re: 1, })}${F("الأيقونة", k + "i", { t: "sel", o: ICONS.map((x) => [x, x]), re: 1, })}${F("صورة القسم", k + "image_url", { t: "img", w: 1 })}${F( "رابط تضمين (iframe) للقسم", k + "embed_url", { d: 1, w: 1 } )}</div>${filtersEditor(c, i)}${c.ty == "numbers" ? freeEditor(c, i) : ""}${mv("categories", i)}</div>`;
        })
        .join("")
    );
  },
  products() {
    if (ed != null && D.products[ed]) {
      const k = "products." + ed + ".",
        p = D.products[ed],
        opts = D.categories.map((x) => [x.id, x.ar]);
      return `<div class="card"><button class="b b2" data-a="back">← رجوع</button><h2>${esc( p.ar )}</h2> <div class="g2">${F("نوع العنصر", k + "k", { t: "sel", o: KINDS, re: 1, w: 1 })}${F("القسم", k + "c", { t: "sel", o: opts, re: 1 })}${p.k == "link" ? "" : F( "التسليم", k + "t", { t: "sel", o: DELIV, n: 1 } )}${F("الاسم (عربي)", k + "ar", { w: 1 })}${F( "الاسم (إنجليزي)", k + "en", { w: 1, d: 1 } )}</div>${p.k == "link" ? `<div class="card" style="background:var(--bg)"><h3>🔗 إعدادات زر الزيارة</h3><div class="g2">${F("رابط الزيارة (يبدأ بـ https://)", k + "lu", { d: 1, w: 1, ph: "https://example.com/..." })}${F("نص الزر (عربي)", k + "lba", { ph: "زيارة الموقع" })}${F("نص الزر (إنجليزي)", k + "lbe", { d: 1, ph: "Visit website" })}</div><p class="hint">لن يظهر سعر ولا زر «أضف للسلة» لهذا العنصر؛ يظهر زر زيارة متحرك يفتح الرابط في نافذة جديدة. اترك نص الزر فارغاً لاستخدام «زيارة الرابط».</p></div>` : ""}${p.k == "link" ? "" : `<div class="g3">${F("السعر", k + "p", { t: "num" })}${F("سعر قديم", k + "o", { t: "num", })}${F("الخصم %", k + "d", { t: "num" })}${F("التقييم", k + "r", { t: "num", })}${F("عدد التقييمات", k + "n", { t: "num" })}${F( "ترتيب الأكثر مبيعاً (1 = الأول، 0 = بلا ترتيب)", k + "bs", { t: "num" } )}</div><p class="hint warn">⚠ التقييم (r) وعدد التقييمات (n): هذا تقييم يدوي وليس مراجعات عملاء.</p>`} <div class="g2">${p.k == "link" ? "" : `${F( "رقم خدمة الرشق في الموقع (SMM service id)", k + "smm_service", { d: 1 } )}${F("كمية الرشق لكل وحدة", k + "smm_qty", { t: "num" })}${F("أقل كمية يمكن للزبون طلبها (بالوحدات)", k + "qmin", { t: "num" })}${F("أعلى كمية (بالوحدات، 0 = بلا حد)", k + "qmax", { t: "num" })}`}${p.k == "link" ? "" : `<p class="hint" style="grid-column:1/-1">💡 الزبون يختار الكمية بحرية (أزرار سريعة + خانة رقم). «الوحدة» هي كمية الرشق لكل وحدة والسعر أعلاه هو سعر الوحدة. مثال: السعر 3.5 وكمية الرشق لكل وحدة 100 وأقل كمية 10 = أقل طلب 1000 متابع، ويمكنه كتابة 15 وحدة = 1500 متابع. اترك أقل كمية 0 أو 1 للسماح بوحدة واحدة. يُطبَّق الحد في المتجر وفي قاعدة البيانات أيضاً (شغّل supabase-support-tickets.sql).</p>`}${F( "وسوم", k + "tg", { w: 1 } )}${F("مواصفات", k + "sp", { w: 1 })}${F("الوصف (عربي)", k + "ds.ar", { t: "area", w: 1, })}${F("الوصف (إنجليزي)", k + "ds.en", { t: "area", w: 1, d: 1 })}</div> <div class="card" style="background:var(--bg)"><h3>صور المنتج</h3>${F( "الصورة الرئيسية", k + "img", { t: "img", w: 1 } )}${F("معرض الصور المتعددة", k + "images", { t: "imgs", w: 1 })}</div> </div>`;
    }
    const q = pq.trim().toLowerCase(),
      L = D.products
        .map((p, i) => [p, i])
        .filter(
          ([p]) =>
            (!pcat || p.c == pcat) &&
            (!q || (p.ar + " " + p.en).toLowerCase().includes(q))
        );
    return `<div class="card"><h2>المنتجات (${ D.products.length })</h2><div class="sw"><input class="inp" id="pq" placeholder="بحث…" value="${esc( pq )}"><button class="b" data-a="add" data-k="products">+ منتج</button></div> ${L.map( ([p, i]) => `<div class="it"><span class="thm">${ p.img ? `<img src="${esc(p.img)}" alt="">` : ic("box") }</span><div class="im"><b>${esc(p.ar)}</b><small>${esc(catName(p.c))} · ${ p.k == "link" ? "🔗 رابط للزيارة" : p.p }</small></div><button class="b b2 sm" data-a="edit" data-i="${i}">تعديل</button><button class="b bd2 sm" data-a="del" data-k="products" data-i="${i}">حذف</button></div>` ).join("")}</div>`;
  },
  embeds() {
    const opts = D.categories.map((x) => [x.id, x.ar]);
    if (ed != null && D.embeds[ed]) {
      const k = "embeds." + ed + ".",
        e = D.embeds[ed];
      return `<div class="card"><button class="b b2" data-a="back">← رجوع</button><h2>${esc( e.ar )}</h2><div class="g2">${F("القسم", k + "c", { t: "sel", o: opts })}${F( "الارتفاع", k + "h", { t: "num" } )}${F("العنوان (عربي)", k + "ar")}${F("العنوان (إنجليزي)", k + "en", { d: 1, })}${F("الرابط", k + "u", { w: 1, d: 1 })}${F("الوصف (عربي)", k + "da", { t: "area", w: 1, })}${F("الوصف (إنجليزي)", k + "de", { t: "area", w: 1, d: 1, })}</div></div>`;
    }
    return `<div class="card"><h2>عناصر التضمين (${ D.embeds.length })</h2><button class="b" data-a="add" data-k="embeds">+ رابط</button> ${D.embeds .map( (e, i) => `<div class="it"><div class="im"><b>${esc( e.ar )}</b><small dir="ltr">${esc( e.u )}</small></div><button class="b b2 sm" data-a="edit" data-i="${i}">تعديل</button><button class="b bd2 sm" data-a="del" data-k="embeds" data-i="${i}">حذف</button></div>` ) .join("")}</div>`;
  },
  /* Coupons tab (was listed in TABS but had no view -> it crashed) */
  coupons() {
    const rows = Object.entries(D.coupons);
    return `<div class="card"><h2>الكوبونات (${rows.length})</h2> <p class="hint">لكل كود: نسبة خصم % + مبلغ ثابت بالعملة الأساسية (${esc( curName(baseCur()) )}). الخصم الكلي لا يتجاوز مجموع السلة. مثال: 10 و 0 = خصم 10%. «يظهر للجميع» = 1 ينشر الكود في المتجر كعرض؛ الأكواد الأخرى تبقى سرية ويتحقق منها الخادم عند الإدخال فقط.</p> <button class="b" data-a="add-cpn">+ كوبون</button> ${rows .map( ([ code, v, ]) => `<div class="it" style="flex-wrap:wrap"><label class="fld" style="margin:0;flex:1;min-width:140px"><span>الكود</span><input class="inp" dir="ltr" data-cc="${esc( code )}" value="${esc(code)}"></label> <label class="fld" style="margin:0;width:110px"><span>نسبة %</span><input class="inp" type="number" step="any" min="0" max="100" data-cv="${esc( code )}" data-ci="0" value="${+v[0] || 0}"></label> <label class="fld" style="margin:0;width:130px"><span>مبلغ ثابت</span><input class="inp" type="number" step="any" min="0" data-cv="${esc( code )}" data-ci="1" value="${+v[1] || 0}"></label> <label class="fld" style="margin:0;width:150px"><span>يظهر للجميع (1/0)</span><input class="inp" type="number" step="1" min="0" max="1" data-cv="${esc( code )}" data-ci="2" value="${+v[2] ? 1 : 0}"></label> <button class="b bd2 sm" data-a="del-cpn" data-code="${esc( code )}">حذف</button></div>` ) .join("")}</div>`;
  },
  /* Social links tab (was listed in TABS but had no view -> it crashed) */
  social() {
    SOCIAL.forEach(([k, icon]) => {
      if (!Array.isArray(D.social[k])) D.social[k] = [icon, ""];
    });
    return `<div class="card"><h2>روابط التواصل</h2><p class="hint">تظهر في أسفل المتجر بشعاراتها. رابط واتساب يُستخدم أيضاً في زر «اطلب عبر واتساب» (الرقم الدولي بدون +). اترك الرابط فارغاً لإخفاء الأيقونة. يمكنك رفع الشعار الرسمي ليحل محل الرسم المدمج.</p> ${SOCIAL.map( ([k, icon, label, ph]) => `<div class="card" style="background:var(--bg)"><label class="fld"><span>${label}</span><input class="inp" dir="ltr" data-sc="${k}" data-si="${icon}" value="${esc( (D.social[k] || [])[1] || "" )}" placeholder="${esc(ph)}"></label>${F( "شعار مخصص (اختياري)", "social." + k + ".2", { t: "img", w: 1 } )}</div>` ).join("")}</div>`;
  },
  payments() {
    return (
      ratesCard() +
      `<div class="card"><h2>وسائل الدفع (${D.payments.length})</h2><p class="hint">تظهر في الصفحة الرئيسية وفي السلة. رقم المحفظة/العنوان يظهر للعميل بعد الطلب مع زر نسخ. ارفع الشعار الرسمي لكل وسيلة (سيرياتيل كاش / شام كاش) وإلا تظهر بالحروف واللون.</p><button class="b" data-a="add" data-k="payments">+ وسيلة دفع</button></div>` +
      D.payments
        .map((m, i) => {
          const k = "payments." + i + ".";
          return `<div class="card">${F("مفعّلة", k + "on", { t: "chk", })}<div class="g2">${F("الاسم (عربي)", k + "ar")}${F( "الاسم (إنجليزي)", k + "en", { d: 1 } )}${F("أيقونة مدمجة", k + "icon", { t: "sel", o: PAY_ICONS, re: 1, })}${F("اللون", k + "color", { t: "col" })}${F("عملة الوسيلة (اختياري)", k + "currency", { t: "sel", o: curOpts(m.currency) })}${F( "الشعار (رفع)", k + "logo", { t: "img", w: 1 } )}${F("رقم المحفظة / العنوان / المعرّف", k + "acc", { d: 1, w: 1, })}${F("التعليمات (عربي)", k + "da", { t: "area", w: 1 })}${F( "التعليمات (إنجليزي)", k + "de", { t: "area", w: 1, d: 1 } )}</div>${mv("payments", i)}</div>`;
        })
        .join("")
    );
  },
  users() {
    setTimeout(loadUsers, 50);
    return `<div class="card"><h2>المستخدمين المسجلين</h2><div id="users-list">${loadingHTML}</div></div>`;
  },
  apis() {
    return `<div class="card"><h2>إعدادات الربط البرمجي (APIs)</h2> <p class="hint">⚠ تُحفظ في جدول api_settings فقط (يجب أن يكون RLS للمدراء فقط) ولا تُنشر مع إعدادات المتجر. الأفضل نقل المفاتيح السرية إلى Supabase Edge Function secrets.</p> <form id="api-form" autocomplete="off"> <div class="g2">${F("SMM API URL", "api.smm_url", { d: 1 })}${F( "SMM API Key", "api.smm_key", { d: 1 } )}${F("Payment Gateway (اسم البوابة)", "api.payment_gateway", { d: 1 })}${F( "Payment Public Key", "api.payment_public_key", { d: 1 } )}${F("Payment Secret Key", "api.payment_secret_key", { d: 1 })}${F( "AI Support API Key (مثال: OpenAI)", "api.ai_api_key", { d: 1 } )}</div> ${F("AI System Prompt (رسالة توجيه المساعد)", "api.ai_system_prompt", { t: "area", w: 1, })} <button class="b" data-a="save-api" type="button">حفظ الإعدادات</button></form></div> <div class="card"><h2>اختبار موقع الرشق (SMM)</h2><p class="hint">يعمل عبر دالة smm-order في Supabase (المتصفح لا يستطيع الاتصال بموقع الرشق مباشرة، والمفتاح يبقى في الخادم). احفظ الإعدادات أولاً.</p> <div class="acts"><button class="b" data-a="smm-test" type="button">فحص الاتصال والرصيد</button><button class="b b2" data-a="smm-services" type="button">عرض الخدمات</button></div> <input class="inp" id="smm-q" placeholder="فلترة الخدمات بالاسم أو الرقم" style="margin-top:8px"><div id="smm-out" class="hint" style="margin-top:8px;max-height:320px;overflow:auto"></div></div>`;
  },
  affiliates() {
    setTimeout(loadAffiliates, 50);
    return `<div class="card"><h2>المسوقين (Affiliates)</h2><div id="aff-list">${loadingHTML}</div></div>`;
  },
  orders() {
    setTimeout(loadOrders, 50);
    return `<div class="card"><h2>الطلبات <small class="od-m" id="oc"></small></h2> <div class="fl"><select class="inp" id="of"><option value="">كل الحالات</option>${ORDER_STATUSES.map( ([k, n]) => `<option value="${k}" ${ordFilter == k ? "selected" : ""}>${n}</option>` ).join("")}</select> <input class="inp" id="oq" placeholder="بحث: رقم الطلب / الاسم / البريد" value="${esc( ordQ )}"><button class="b b2 sm" data-a="reload-orders">تحديث</button></div> <div id="ob">${loadingHTML}</div></div>`;
  },
  push() {
    setTimeout(loadPush, 50);
    return `<div class="card"><h2>🔔 إشعار لكل المستخدمين</h2><p class="hint">يصل الإشعار فوراً إلى كل جهاز فعّل الإشعارات من المتجر (<b id="bcs">…</b>). استخدمه لخدمة جديدة أو بونص أو كود خصم حصري. الحد: 80 حرفاً للعنوان و200 للنص، وفاصل 20 ثانية بين كل إرسالين.</p>
<div class="fl" style="flex-wrap:wrap">${PUSH_TPL.map(([n], i) => `<button type="button" class="b b2 sm" data-a="bc-tpl" data-i="${i}">${n}</button>`).join("")}</div>
<label class="hint" for="bct">العنوان</label><input class="inp" id="bct" maxlength="80" placeholder="مثال: بونص جديد لك 🎁">
<label class="hint" for="bcb">النص</label><textarea class="inp" id="bcb" rows="3" maxlength="200" placeholder="مثال: استخدم الكود VIP20 واحصل على خصم 20% لمدة 48 ساعة"></textarea>
<label class="hint" for="bcu">عند الضغط على الإشعار يفتح</label><select class="inp" id="bcu">${PUSH_URLS.map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select>
<div class="fl" style="margin-top:10px"><button type="button" class="b b2" data-a="push-test">إرسال تجريبي لي فقط</button><button type="button" class="b" data-a="push-send">إرسال للجميع</button></div></div>
<div class="card"><h2>آخر الإشعارات المرسلة <button type="button" class="b b2 sm" data-a="reload-push">تحديث</button></h2><div id="bch">${loadingHTML}</div></div>`;
  },
  stats() {
    setTimeout(loadAdminStats, 50);
    return `<div class="card"><h2>الإحصاءات <small class="od-m" id="stc"></small></h2><div class="fl">${[7, 30, 90]
      .map((d) => `<button type="button" class="b ${d == STATS_DAYS ? "" : "b2"} sm" data-a="stats-${d}">${d} يوم</button>`)
      .join("")}<button type="button" class="b b2 sm" data-a="reload-stats">تحديث</button></div></div><div id="stb">${loadingHTML}</div>`;
  },
  tickets() {
    setTimeout(loadTickets, 50);
    return `<div class="card"><h2>تذاكر الدعم <small class="od-m" id="tkc"></small></h2><p class="hint">تصل التذكرة هنا فور إرسالها من المتجر، ويصلك إشعار على تلغرام (من إعدادات notify_settings). ردّك يظهر للزبون في صفحة «تذاكر الدعم» ويصله أيضاً على بريده الإلكتروني (يتطلب ضبط البريد في notify_settings). يقيّم الزبون ردّك بـ«تم الحل» أو «لم تُحل»؛ «لم تُحل» تعيد التذكرة إلى «مفتوحة».</p> <div class="fl"><select class="inp" id="tkf"><option value="">كل الحالات</option>${TK_ST.map(([k, n]) => `<option value="${k}" ${tkFilter == k ? "selected" : ""}>${n}</option>`).join("")}<option value="unres" ${tkFilter == "unres" ? "selected" : ""}>تقييم سلبي (لم تُحل)</option></select> <input class="inp" id="tkq" placeholder="بحث: رقم / اسم / بريد / طلب / نص" value="${esc(tkQ)}"><button class="b b2 sm" data-a="reload-tickets">تحديث</button></div> <div id="tkb">${loadingHTML}</div></div>`;
  },
};

/* ---------- الموظفون (إدارة الحسابات — للأدمن فقط) ---------- */
const STF_ROLES = [
  ["support", "مشرف دعم", ["tickets", "users"]],
  ["orders", "مسؤول طلبات", ["orders", "users"]],
  ["content", "مدير محتوى", ["products"]],
  ["ops", "مدير عمليات", ["orders", "tickets", "users"]],
];
const roleOpts = (cur) =>
  '<option value="">مخصص (حدّد الصلاحيات يدوياً)</option>' +
  STF_ROLES.map(([k, l]) => `<option value="${k}"${cur == l ? " selected" : ""}>${l}</option>`).join("");
const roleFor = (v, perms) => {
  const r = STF_ROLES.find((x) => x[0] == v);
  return r && r[2].length == perms.length && r[2].every((k) => perms.includes(k)) ? r[1] : null;
};
const STF_PERMS = [
  ["orders", "الطلبات (عرض وتغيير الحالة)"],
  ["tickets", "تذاكر الدعم (عرض والرد)"],
  ["users", "المستخدمين (عرض فقط)"],
  ["products", "المنتجات (تعديل ونشر)"],
];
VIEW.none = () =>
  '<div class="card"><h2>لا توجد صلاحيات</h2><p class="hint">حسابك مسجّل كموظف لكن لا توجد صلاحيات مفعّلة له. اطلب من المدير تفعيلها.</p></div>';
VIEW.staff = () => {
  setTimeout(loadStaff, 50);
  return `<div class="card"><h2>إضافة موظف</h2><p class="hint">الموظف يسجّل حساباً عادياً في المتجر أولاً، ثم تكتب بريده هنا وتحدد ما يستطيع فعله. الموظف لا يرى الإعدادات ولا المفاتيح ولا الكوبونات ولا يستطيع النشر. يمكنك إيقافه أو حذفه في أي وقت.</p><div class="fl"><input class="inp" id="stf-e" type="email" dir="ltr" placeholder="بريد الموظف المسجّل في المتجر" autocomplete="off"></div><div class="fl"><select class="inp" id="stf-role" data-stf-role>${roleOpts("")}</select></div>${STF_PERMS.map(([k, l]) => `<label class="chk"><input type="checkbox" data-stf-new="${k}"> ${l}</label>`).join("")}<div class="acts"><button class="b" data-a="stf-add">إضافة موظف</button></div></div><div class="card"><h2>الموظفون الحاليون <small class="od-m" id="stf-c"></small></h2><div id="stf-list">${loadingHTML}</div></div>`;
};
async function loadStaff() {
  const b = $("#stf-list");
  if (!b) return;
  try {
    const r = await api("/rest/v1/staff_members?select=*&order=created_at.desc");
    if (!r.ok) throw new Error(r.status);
    const rows = await r.json();
    const c = $("#stf-c");
    if (c) c.textContent = rows.length ? "(" + rows.length + ")" : "";
    b.innerHTML = rows.length
      ? rows
          .map(
            (x) =>
              `<div class="od" data-stf-row="${esc(x.user_id)}"><div class="od-h"><b>${esc(x.full_name || "—")}</b><small class="od-m" dir="ltr">${esc(x.email)}</small>${x.role ? `<small class="od-m">· ${esc(x.role)}</small>` : ""}</div><div class="fl"><select class="inp" data-stf-role>${roleOpts(x.role)}</select></div>${STF_PERMS.map(([k, l]) => `<label class="chk"><input type="checkbox" data-stf-p="${k}"${(x.perms || []).includes(k) ? " checked" : ""}> ${l}</label>`).join("")}<label class="chk"><input type="checkbox" data-stf-active${x.active ? " checked" : ""}> الحساب مفعّل</label><div class="acts"><button class="b sm" data-a="stf-save" data-id="${esc(x.user_id)}">حفظ</button><button class="b b2 sm" data-a="stf-del" data-id="${esc(x.user_id)}">حذف</button></div></div>`
          )
          .join("")
      : '<p class="hint">لا يوجد موظفون بعد.</p>';
  } catch (e) {
    b.innerHTML =
      '<p class="hint">فشل التحميل — تأكد من تنفيذ supabase-staff.sql في قاعدة البيانات، وأن حسابك مضاف في جدول admins.</p>';
  }
}
document.addEventListener("click", async (e) => {
  const btn = e.target.closest('button[data-a^="stf-"]');
  if (!btn) return;
  const a = btn.dataset.a;
  const jh = { "Content-Type": "application/json", Prefer: "return=minimal" };
  try {
    if (a == "stf-add") {
      const em = ($("#stf-e").value || "").trim().toLowerCase();
      if (!/^[^\s@%*]+@[^\s@%*]+\.[^\s@%*]+$/.test(em)) return toast("اكتب بريداً صحيحاً", "e");
      const perms = [...document.querySelectorAll("[data-stf-new]")].filter((i) => i.checked).map((i) => i.dataset.stfNew);
      const role = roleFor(($("#stf-role") || {}).value, perms);
      if (!perms.length && !confirm("لم تحدد أي صلاحية — سيُضاف الموظف دون القدرة على فعل شيء. متابعة؟")) return;
      busy(btn, true);
      const pr = await api("/rest/v1/profiles?select=id,email,full_name&limit=1&email=ilike." + encodeURIComponent(em.replace(/_/g, "\\_")));
      const rows = pr.ok ? await pr.json() : [];
      if (!rows.length) {
        busy(btn, false);
        return toast("هذا البريد غير مسجّل في المتجر — اطلب منه إنشاء حساب أولاً", "e");
      }
      const u = rows[0];
      const r = await api("/rest/v1/staff_members", {
        method: "POST",
        headers: jh,
        body: JSON.stringify({ user_id: u.id, email: u.email || em, full_name: u.full_name || null, perms, role, active: true }),
      });
      busy(btn, false);
      if (r.status == 409) return toast("هذا الموظف مضاف مسبقاً", "e");
      if (!r.ok) return toast("فشلت الإضافة (" + r.status + ")", "e");
      $("#stf-e").value = "";
      document.querySelectorAll("[data-stf-new]").forEach((i) => (i.checked = false));
      if ($("#stf-role")) $("#stf-role").value = "";
      toast("تمت إضافة الموظف", "k");
      loadStaff();
    } else if (a == "stf-save") {
      const row = btn.closest("[data-stf-row]");
      const perms = [...row.querySelectorAll("[data-stf-p]")].filter((i) => i.checked).map((i) => i.dataset.stfP);
      const active = row.querySelector("[data-stf-active]").checked;
      const role = roleFor(row.querySelector("[data-stf-role]").value, perms);
      busy(btn, true);
      const r = await api("/rest/v1/staff_members?user_id=eq." + encodeURIComponent(btn.dataset.id), {
        method: "PATCH",
        headers: jh,
        body: JSON.stringify({ perms, active, role }),
      });
      busy(btn, false);
      toast(r.ok ? "تم الحفظ" : "فشل الحفظ (" + r.status + ")", r.ok ? "k" : "e");
    } else if (a == "stf-del") {
      if (!confirm("حذف هذا الموظف؟ سيفقد وصوله للوحة فوراً، وحسابه كعميل يبقى كما هو.")) return;
      busy(btn, true);
      const r = await api("/rest/v1/staff_members?user_id=eq." + encodeURIComponent(btn.dataset.id), { method: "DELETE" });
      busy(btn, false);
      toast(r.ok ? "تم الحذف" : "فشل الحذف (" + r.status + ")", r.ok ? "k" : "e");
      if (r.ok) loadStaff();
    }
  } catch (err) {
    busy(btn, false);
    toast("حدث خطأ — حاول مجدداً", "e");
  }
});

/* ---------- سجل النشاط (للأدمن فقط) ---------- */
const ACT_L = {
  order_status: "تغيير حالة طلب", order_paid: "تأكيد دفع طلب", order_payment: "تغيير حالة دفع",
  order_delivery: "تحديث تسليم طلب", ticket_reply: "رد على تذكرة", ticket_status: "تغيير حالة تذكرة",
  product_add: "إضافة منتج", product_edit: "تعديل منتج", product_price: "تغيير سعر/خصم",
  product_remove: "حذف منتج", smm_send: "إرسال للرشق", staff_added: "إضافة موظف",
  staff_updated: "تعديل موظف", staff_removed: "حذف موظف",
};
let ACT = [];
VIEW.activity = () => {
  setTimeout(loadActivity, 50);
  return `<div class="card"><h2>سجل النشاط <small class="od-m" id="act-c"></small></h2><p class="hint">يسجَّل تلقائياً من قاعدة البيانات نفسها (لا يمكن للموظف تعطيله): تغيير حالات الطلبات والدفع، الرد على التذاكر، تعديل المنتجات والأسعار، الإرسال للرشق، وإدارة الموظفين. لا تُسجَّل نصوص الردود ولا بيانات التسليم. يُحذف ما هو أقدم من 180 يوماً تلقائياً. تصلك رسالة تلغرام عند أفعال الموظف الحساسة (تأكيد دفع، إرسال للرشق، تغيير سعر، إضافة/حذف منتج).</p><div class="fl"><select class="inp" id="act-who"><option value="">كل المنفّذين</option></select><select class="inp" id="act-act"><option value="">كل الإجراءات</option>${Object.entries(ACT_L).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select><button class="b b2 sm" data-a="act-reload">تحديث</button></div><div id="act-list">${loadingHTML}</div></div>`;
};
const actDetail = (x) => {
  const d = x.details || {};
  switch (x.action) {
    case "order_status": case "ticket_status": case "order_payment": return (d.from || "—") + " ← " + (d.to || "—");
    case "order_paid": return (d.total != null ? d.total : "—") + " " + (d.currency || "");
    case "order_delivery": return d.set ? "تم تعيين نص التسليم" : "تم مسح التسليم";
    case "product_price": return (d.name || "") + " | السعر " + (d.p_from ?? "—") + " ← " + (d.p_to ?? "—") + " | الخصم " + (d.d_from ?? "—") + " ← " + (d.d_to ?? "—");
    case "product_add": case "product_edit": case "product_remove": return d.name || "";
    case "smm_send": return (d.status || "") + (d.items ? " · " + d.items + " عنصر" : "");
    case "staff_added": case "staff_updated": return (d.role ? d.role + " · " : "") + (d.perms || []).map((k) => (STF_PERMS.find((p) => p[0] == k) || [k, k])[1].split(" (")[0]).join("، ") + (d.active === false ? " · موقوف" : "");
    default: return "";
  }
};
function renderActivity() {
  const b = $("#act-list");
  if (!b) return;
  const who = ($("#act-who") || {}).value || "", act = ($("#act-act") || {}).value || "";
  const rows = ACT.filter((x) => (!who || x.actor_email == who) && (!act || x.action == act));
  const c = $("#act-c");
  if (c) c.textContent = "(" + rows.length + ")";
  b.innerHTML = rows.length
    ? `<div class="tw"><table class="tb"><tr><th>الوقت</th><th>المنفّذ</th><th>الإجراء</th><th>الهدف</th><th>التفاصيل</th></tr>${rows
        .map((x) => `<tr><td style="white-space:nowrap">${esc(new Date(x.at).toLocaleString("ar-EG-u-nu-latn", { dateStyle: "short", timeStyle: "short" }))}</td><td dir="ltr">${esc(x.actor_email || "—")}${x.actor_kind == "admin" ? " <small class=\"od-m\">(مدير)</small>" : ""}</td><td>${esc(ACT_L[x.action] || x.action)}</td><td dir="ltr">${esc(x.target || "")}</td><td>${esc(actDetail(x))}</td></tr>`)
        .join("")}</table></div>`
    : '<p class="hint">لا توجد سجلات مطابقة.</p>';
}
async function loadActivity() {
  const b = $("#act-list");
  if (!b) return;
  try {
    const r = await api("/rest/v1/staff_activity?select=*&order=at.desc&limit=300");
    if (!r.ok) throw new Error(r.status);
    ACT = await r.json();
    const sel = $("#act-who");
    if (sel) {
      const cur = sel.value;
      const emails = [...new Set(ACT.map((x) => x.actor_email).filter(Boolean))];
      sel.innerHTML = '<option value="">كل المنفّذين</option>' + emails.map((e) => `<option value="${esc(e)}"${e == cur ? " selected" : ""}>${esc(e)}</option>`).join("");
    }
    renderActivity();
  } catch (e) {
    b.innerHTML = '<p class="hint">فشل التحميل — هذا السجل للمدير فقط.</p>';
  }
}
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id == "act-who" || t.id == "act-act") return renderActivity();
  if (t.matches && t.matches("select[data-stf-role]")) {
    const r = STF_ROLES.find((x) => x[0] == t.value);
    if (!r) return;
    const scope = t.closest("[data-stf-row]") || document;
    scope.querySelectorAll("[data-stf-new],[data-stf-p]").forEach((i) => (i.checked = r[2].includes(i.dataset.stfNew || i.dataset.stfP)));
  }
});
document.addEventListener("click", (e) => {
  const b = e.target.closest('button[data-a="act-reload"]');
  if (b) loadActivity();
});

function render() {
  if (!canTab(tab)) {
    const f = TABS.find(([k]) => canTab(k));
    tab = f ? f[0] : "none";
  }
  const staffOnly = isStaffOnly();
  const warn = staffOnly
    ? '<div class="card"><small>حساب موظف — الصلاحيات المفعّلة: ' +
      (STAFF.length ? esc(STAFF.map((k) => (STF_PERMS.find((x) => x[0] == k) || [k, k])[1].split(" (")[0]).join("، ")) : "لا شيء") +
      "</small></div>"
    : IS_ADMIN === false
      ? '<div class="card" style="border-color:var(--wn)"><small>⚠ حسابك الحالي (' +
        esc(SES && SES.email) +
        ") غير مضاف في جدول admins؛ قد تفشل عمليات النشر وتغيير الحالات بسبب سياسات RLS.</small></div>"
      : "";
  $(
    "#app"
  ).innerHTML = `<header class="top"><div class="w tr"><b class="ttl"><span class="brand-dot"></span>لوحة التحكم <small>${esc( D.site.n1 + D.site.n2 )}</small></b><span class="bdg" id="bdg"></span><span class="sp"></span><a class="b b2 sm" href="index.html" target="_blank" rel="noopener">معاينة ↗</a>${staffOnly && !STAFF.includes("products") ? "" : '<button class="b sm" data-a="pub">نشر الآن</button>'}<button class="b b2 sm" data-a="logout">خروج</button></div></header><div class="w lay"><nav class="sd">${sideNav()}</nav><main>${warn}${(VIEW[tab] || VIEW.home)()}</main></div>`;
  badge();
  if (tab == "home") setTimeout(homeStats, 0);
}

/* ---------- 8. Events ---------- */
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.dataset.p) {
    let v = t.type == "checkbox" ? t.checked : t.value;
    if (t.dataset.n || t.type == "number") v = v === "" ? 0 : +v;
    st(D, t.dataset.p, v);
    later();
  } else if (t.id == "pq") {
    pq = t.value;
    const p = t.selectionStart;
    render();
    const n = $("#pq");
    n.focus();
    n.setSelectionRange(p, p);
  } else if (t.id == "smm-q") smmList();
  else if (t.id == "tkq") {
    tkQ = t.value;
    renderTicketList();
  }
  else if (t.id == "oq") {
    ordQ = t.value;
    renderOrderList();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key == "Enter" && e.target.dataset && e.target.dataset.fo) {
    e.preventDefault();
    const b = e.target.nextElementSibling;
    if (b) b.click();
  }
});
document.addEventListener("change", async (e) => {
  const t = e.target,
    d = t.dataset;
  if (d.up) return upl(t);
  if (d.imp) return imp(t);
  if (d.pst) return setPayment(t);
  if (d.ost) return setOrderStatus(t); // order status -> database
  if (d.tks) return setTicketStatus(t);
  if (t.id == "tkf") {
    tkFilter = t.value;
    return renderTicketList();
  }
  if (t.id == "of") {
    ordFilter = t.value;
    return renderOrderList();
  }
  if (d.cc != null) return renameCoupon(d.cc, t.value); // coupon code
  if (d.cv != null) {
    D.coupons[d.cv][+d.ci] = +d.ci == 2 ? (+t.value ? 1 : 0) : Math.max(0, +t.value || 0);
    return save();
  }
  if (d.sc) {
    const old = D.social[d.sc] || [];
    D.social[d.sc] = [d.si, t.value.trim(), old[2] || ""];
    return save();
  } // social link
  if (d.rt != null) {
    const rate = D.rates[d.rt];
    if (!rate) return;
    if (+d.ri === 0) {
      const v = +t.value;
      if (!(v > 0) || (v === 1 && d.rt != baseCur())) {
        toast("قيمة غير صالحة (يجب أن تكون أكبر من 0، والرقم 1 للعملة الأساسية فقط)", "e");
        return render();
      }
      rate[0] = v;
    } else rate[1] = t.value.trim();
    return save();
  }
  if (d.p) {
    let v = t.type == "checkbox" ? t.checked : t.value;
    st(D, d.p, v);
    save();
    if (d.re) render();
  }
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("button,[data-tab]");
  if (!b) return;
  const d = b.dataset;
  if (d.tab) {
    tab = d.tab;
    ed = null;
    render();
    if (tab == "apis") loadApis();
    return;
  }
  const a = d.a;
  if (!a) return;
  if (a == "logout") {
    try {
      localStorage.removeItem("amx_sb");
    } catch {}
    SES = null;
    return loginView();
  }
  if (a == "back") {
    ed = null;
    return render();
  }
  if (a == "edit") {
    ed = +d.i;
    return render();
  }
  if (a == "clr") {
    st(D, d.p, "");
    save();
    return render();
  }
  if (a == "clr-img") {
    D.products[ed].images.splice(+d.i, 1);
    save();
    return render();
  }
  if (a == "add") {
    const it = NEW[d.k]();
    if (d.k == "products" || d.k == "embeds") {
      D[d.k].unshift(it);
      ed = 0;
    } else D[d.k].push(it);
    save();
    return render();
  }
  if (a == "mv") {
    const k = d.k,
      i = +d.i,
      j = i + +d.d;
    if (j < 0 || j >= D[k].length) return;
    [D[k][i], D[k][j]] = [D[k][j], D[k][i]];
    save();
    return render();
  }
  if (a == "del") {
    if (!confirm("تأكيد الحذف؟")) return;
    D[d.k].splice(+d.i, 1);
    save();
    return render();
  }
  if (a == "aff-coupon") {
    const inp = b.closest("tr").querySelector("input[data-aff-c]"),
      v = (inp.value || "").trim().toUpperCase();
    if (v && !/^[A-Z0-9_-]{3,40}$/.test(v))
      return toast("الكوبون: 3–40 حرفاً إنجليزياً أو أرقاماً فقط", "e");
    const miss = v && !(D.coupons && D.coupons[v]);
    b.disabled = true;
    api("/rest/v1/affiliates?id=eq." + encodeURIComponent(d.id), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ coupon: v || null }),
    })
      .then(async (r) => {
        if (r.ok) {
          inp.value = v;
          toast(miss ? "تم الحفظ — لكن أنشئ الكوبون في تبويب الكوبونات ليعمل الخصم" : "تم الحفظ ✓", miss ? "e" : "");
        } else {
          const t = await r.text();
          toast(/duplicate|unique/i.test(t) ? "هذا الكوبون مرتبط بمسوّق آخر" : "فشل الحفظ", "e");
        }
      })
      .catch(() => toast("فشل الحفظ", "e"))
      .finally(() => (b.disabled = false));
    return;
  }
  if (a == "add-cpn") {
    let n = Object.keys(D.coupons).length + 1,
      c;
    do {
      c = "CODE" + n++;
    } while (D.coupons[c]);
    D.coupons[c] = [10, 0, 0];
    save();
    return render();
  }
  if (a == "del-cpn") {
    if (!confirm("حذف الكوبون؟")) return;
    delete D.coupons[d.code];
    save();
    return render();
  }
  if (a == "add-numbers-cat") {
    if (D.categories.some((c) => c.ty == "numbers")) return toast("قسم الأرقام موجود مسبقاً", "e");
    D.categories.push({
      id: "numbers",
      ty: "numbers",
      i: "phone",
      ar: "أرقام للتفعيل",
      en: "Virtual Numbers",
      da: "أرقام مجانية ومدفوعة لاستقبال كود التفعيل",
      de: "Free and paid numbers to receive verification codes",
      embed_url: "",
      image_url: "",
      f: [
        { ar: "الخدمة", en: "Service", o: ["WhatsApp", "Telegram", "Facebook", "Instagram", "TikTok", "Snapchat", "X", "Google", "Discord", "Viber", "LinkedIn", "ChatGPT"] },
        { ar: "الدولة", en: "Country", o: ["أمريكا", "بريطانيا", "إندونيسيا", "غانا", "ميانمار", "سريلانكا", "فنزويلا", "مالي"] },
      ],
      free: [],
    });
    save();
    return render();
  }
  if (a == "free-add") {
    const c = D.categories[+d.ci];
    c.free = Array.isArray(c.free) ? c.free : [];
    c.free.push({ ar: "دولة جديدة", en: "New country", fl: "", txt: "" });
    save();
    return render();
  }
  if (a == "free-del") {
    if (!confirm("حذف هذه الدولة وأرقامها؟")) return;
    D.categories[+d.ci].free.splice(+d.fi, 1);
    save();
    return render();
  }
  if (a == "f-add-grp") {
    const c = D.categories[+d.ci];
    c.f = Array.isArray(c.f) ? c.f : [];
    c.f.push({ ar: "فلتر جديد", en: "New filter", o: [] });
    save();
    return render();
  }
  if (a == "f-del-grp") {
    if (!confirm("حذف مجموعة الفلتر؟")) return;
    D.categories[+d.ci].f.splice(+d.gi, 1);
    save();
    return render();
  }
  if (a == "f-del-opt") {
    D.categories[+d.ci].f[+d.gi].o.splice(+d.oi, 1);
    save();
    return render();
  }
  if (a == "f-add-opt") return addFilterOpt(b);
  if (a == "proof-link") return proofLink(b);
  if (a == "save-api") return saveApis(b);
  if (a == "smm-test" || a == "smm-services") return smmAction(b, a);
  if (a == "smm-imp") return smmImport(b);
  if (a == "smm-reprice") return smmReprice();
  if (a == "smm-recheck") { busy(b, true); return smmFetchRates(true).then(() => homeStats()).catch((e) => toast("فشل: " + String(e.message).slice(0, 70), "e")).finally(() => busy(b, false)); }
  if (a == "autosend-t") { localStorage.setItem("amx_autosend", autoOn() ? "0" : "1"); toast(autoOn() ? "الإرسال التلقائي مفعّل" : "الإرسال التلقائي متوقف"); return homeStats(); }
  if (a == "smm-send" || a == "smm-status") return smmOrder(b);
  if (a == "pub") return publish(b);
  if (a == "exp") return exportBackup();
  if (a == "reload-orders") return loadOrders();
  if (a == "reload-tickets") return loadTickets();
  if (a == "reload-stats") return loadAdminStats();
  if (/^stats-\d+$/.test(a)) {
    STATS_DAYS = +a.slice(6);
    return render();
  }
  if (a == "reload-push") return loadPush();
  if (a == "bc-tpl") return fillPushTpl(+d.i);
  if (a == "push-test" || a == "push-send") return sendBroadcast(b, a);
  if (a == "tk-reply") return replyTicket(b);
});
const NEW = {
  categories: () => ({
    id: "c" + uid(),
    ty: "shop",
    i: "box",
    ar: "قسم جديد",
    en: "New category",
    da: "",
    de: "",
    f: [],
    embed_url: "",
    image_url: "",
  }),
  products: () => ({
    id: "p" + uid(),
    c: (D.categories[0] || {}).id || "",
    k: "buy",
    lu: "",
    lba: "",
    lbe: "",
    ar: "منتج جديد",
    en: "New product",
    p: 100,
    o: 0,
    d: 0,
    r: 5,
    n: 0,
    bs: 0,
    t: 0,
    tg: "",
    sp: "",
    ds: { ar: "", en: "" },
    img: "",
    images: [],
  }),
  embeds: () => ({
    id: "e" + uid(),
    c: (D.categories[0] || {}).id || "",
    ar: "عنوان",
    en: "Title",
    da: "",
    de: "",
    u: "https://",
    h: 480,
  }),
  payments: () => ({
    id: "pm" + uid(),
    on: true,
    ar: "وسيلة جديدة",
    en: "New method",
    icon: "",
    logo: "",
    color: "#2F442C",
    acc: "",
    da: "",
    de: "",
  }),
  banners: () => ({
    ar: "عنوان",
    en: "Title",
    sa: "",
    se: "",
    h: "#/",
    img: "",
  }),
};
function renameCoupon(oldCode, raw) {
  const code = String(raw)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "");
  if (!code) {
    toast("كود غير صالح (أحرف إنجليزية وأرقام فقط)", "e");
    return render();
  }
  if (code != oldCode && D.coupons[code]) {
    toast("هذا الكود موجود مسبقاً", "e");
    return render();
  }
  if (code != oldCode) {
    const rebuilt = {};
    for (const [k, v] of Object.entries(D.coupons))
      rebuilt[k == oldCode ? code : k] = v;
    D.coupons = rebuilt;
  }
  save();
  render();
}

/* ---------- 9. Uploads, backup & import ---------- */
const rd = (f, cb) => {
  const r = new FileReader();
  r.onload = () => cb(r.result);
  r.readAsDataURL(f);
};
function setimg(p, u) {
  st(D, p, u);
  save();
  render();
}
async function up(blob, ext, type) {
  const name = "img/" + uid() + "." + ext;
  const r = await api("/storage/v1/object/store-media/" + name, {
    method: "POST",
    headers: { "Content-Type": type, "x-upsert": "true" },
    body: blob,
  });
  if (!r.ok) throw new Error((await r.text()).slice(0, 150));
  return SB_URL + "/storage/v1/object/public/store-media/" + name;
}
function upl(t) {
  const files = t.files;
  if (!files.length) return;
  const p = t.dataset.up,
    mx = +t.dataset.mx || 900;
  Array.from(files).forEach((f) => {
    const fail = (e) => toast("فشل الرفع: " + e.message, "e");
    rd(f, (u) => {
      const im = new Image();
      im.onload = () => {
        const rr = Math.min(1, mx / Math.max(im.width, im.height)),
          c = document.createElement("canvas");
        c.width = Math.round(im.width * rr);
        c.height = Math.round(im.height * rr);
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        c.toBlob(
          (b) =>
            up(b, "jpg", "image/jpeg")
              .then((url) => {
                if (p.includes("images")) {
                  if (!D.products[ed].images) D.products[ed].images = [];
                  D.products[ed].images.push(url);
                  save();
                  render();
                } else setimg(p, url);
              })
              .catch(fail),
          "image/jpeg",
          0.82
        );
      };
      im.onerror = () => toast("الملف ليس صورة صالحة", "e");
      im.src = u;
    });
  });
}
window.handleDrop = (e, p) => {
  const f = e.dataTransfer.files[0];
  if (!f) return;
  const dt = new DataTransfer();
  dt.items.add(f);
  const inp = document.querySelector(`input[data-up="${p}"]`);
  inp.files = dt.files;
  upl(inp);
};
function exportBackup() {
  const blob = new Blob([JSON.stringify(pubData(), null, 1)], {
    type: "application/json",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download =
    "amarix-backup-" + new Date().toISOString().slice(0, 10) + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("تم تنزيل النسخة الاحتياطية");
}
function imp(input) {
  const f = input.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      // Accepts a .json backup or a store-data.js file ("window.AMX = {...};")
      const txt = String(r.result)
        .replace(/^\s*(?:window\.AMX|var\s+AMX|const\s+AMX)\s*=\s*/, "")
        .replace(/;\s*$/, "");
      const j = JSON.parse(txt);
      if (!j || !Array.isArray(j.products) || !Array.isArray(j.categories))
        throw new Error("بنية غير صالحة");
      if (!confirm("سيتم استبدال البيانات الحالية بالملف المستورد. متابعة؟"))
        return;
      const keepApi = D.api;
      D = clone(j);
      delete D.api;
      D.api = keepApi || {};
      fix();
      save();
      ed = null;
      render();
      toast("تم الاستيراد — اضغط «نشر الآن» لتطبيقه");
    } catch (err) {
      toast("فشل الاستيراد: " + err.message, "e");
    }
    input.value = "";
  };
  r.readAsText(f);
}

/* ---------- 10. Supabase session & REST helper ---------- */
const sget = () => {
  try {
    return JSON.parse(localStorage.getItem("amx_sb"));
  } catch {
    return null;
  }
};
async function auth(body, grant) {
  const r = await fetch(SB_URL + "/auth/v1/token?grant_type=" + grant, {
    method: "POST",
    mode: "cors",
    headers: { apikey: SB_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error_description || j.msg || "فشل");
  SES = {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    exp: Math.floor(Date.now() / 1e3) + (j.expires_in || 3600),
    email: (j.user || {}).email,
    uid: (j.user || {}).id || (SES && SES.uid),
  };
  try {
    localStorage.setItem("amx_sb", JSON.stringify(SES));
  } catch {}
  return SES;
}
async function tok() {
  if (!SES) throw new Error("login");
  if (SES.exp - 60 < Date.now() / 1e3)
    await auth({ refresh_token: SES.refresh_token }, "refresh_token");
  return SES.access_token;
}
async function api(path, o = {}) {
  const t = await tok();
  return fetch(SB_URL + path, {
    ...o,
    mode: "cors",
    headers: {
      apikey: SB_KEY,
      Authorization: "Bearer " + t,
      ...(o.headers || {}),
    },
  });
}
function loginView(msg = "") {
  $(
    "#app"
  ).innerHTML = `<div class="w" style="max-width:380px;margin-top:12vh"><form class="card" id="lf"><h2 style="text-align:center">⚙ لوحة التحكم</h2><div class="fld"><span>البريد</span><input class="inp" name="e" type="email" dir="ltr" autocomplete="username" required></div><div class="fld"><span>كلمة المرور</span><input class="inp" name="p" type="password" dir="ltr" autocomplete="current-password" required></div><p id="le" style="color:var(--er);font-size:12px">${esc( msg )}</p><button class="b" style="width:100%">دخول</button></form></div>`;
}
document.addEventListener("submit", async (e) => {
  if (e.target.id != "lf") return;
  e.preventDefault();
  const f = new FormData(e.target),
    b = e.target.querySelector(".b");
  busy(b, true);
  try {
    await auth({ email: f.get("e").trim(), password: f.get("p") }, "password");
    await boot();
  } catch (x) {
    busy(b, false);
    $("#le").textContent = x.message;
  }
});
/* Soft check only: real protection is RLS. Calls the existing public.is_admin() function (based on the `admins` table) and shows a warning banner if the account is not an admin. */
async function checkRole() {
  IS_ADMIN = null;
  STAFF = null;
  if (!SES) return;
  try {
    const r = await api("/rest/v1/rpc/is_admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (r.ok) {
      const v = await r.json();
      if (typeof v == "boolean") IS_ADMIN = v;
    }
    if (IS_ADMIN === false) {
      const r2 = await api("/rest/v1/rpc/my_staff_perms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (r2.ok) {
        const v2 = await r2.json();
        if (Array.isArray(v2)) STAFF = v2;
      }
    }
  } catch {}
}

/* ---------- 11. Publish, API settings, users, orders ---------- */
async function loadCfg() {
  try {
    const r = await api("/rest/v1/store_config?id=eq.1&select=data");
    if (!r.ok) throw new Error();
    const row = (await r.json())[0];
    D = clone(
      row && row.data && Array.isArray(row.data.products) ? row.data : PUB
    );
    dirty = !row;
    CFG_OK = true;
  } catch (e) {
    D = clone(PUB);
    dirty = true;
    CFG_OK = false;
  }
  delete D.api; // never trust/keep secrets coming from the public config row
  fix();
  BASE_TS = +D.ts || 0;
}
/* الموظف: يقرأ الإعدادات العامة (بلا كوبونات سرية) ويحفظ المنتجات فقط عبر دالة مخصصة */
async function loadCfgStaff() {
  try {
    const r = await api("/rest/v1/rpc/public_config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    if (!r.ok) throw new Error();
    const d = await r.json();
    if (!d || !Array.isArray(d.products)) throw new Error();
    D = clone(d);
    dirty = false;
    CFG_OK = true;
  } catch {
    return;
  }
  delete D.api;
  fix();
  BASE_TS = +D.ts || 0;
}
async function publishStaff(btn) {
  if (!CFG_OK || !STAFF.includes("products")) {
    toast("تعذّر تحميل المتجر من الخادم — حدّث الصفحة قبل النشر", "e");
    return;
  }
  if (!confirm("نشر تعديلات المنتجات الآن؟")) return;
  busy(btn, true);
  try {
    const r = await api("/rest/v1/rpc/staff_save_products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_products: D.products, p_base_ts: BASE_TS }),
    });
    if (!r.ok) {
      const t = await r.text();
      if (/stale/.test(t)) return toast("تم تعديل المتجر من مكان آخر — حدّث الصفحة ثم أعد التعديل", "e");
      throw new Error(t.slice(0, 120));
    }
    const ts = await r.json();
    D.ts = ts;
    BASE_TS = ts;
    dirty = false;
    badge();
    toast("تم النشر");
  } catch (e) {
    toast("فشل النشر: " + (e.message || "").slice(0, 80), "e");
  } finally {
    busy(btn, false);
  }
}
async function publish(btn) {
  if (isStaffOnly()) return publishStaff(btn);
  // Never publish a copy that did not come from the server (it would overwrite the live store with stale embedded data)
  if (!CFG_OK) {
    toast(
      "تعذّر تحميل المتجر من الخادم — حدّث الصفحة قبل النشر حتى لا تُكتب بيانات قديمة",
      "e"
    );
    return;
  }
  if (!confirm("نشر التعديلات الآن؟")) return;
  busy(btn, true);
  try {
    // If the store changed elsewhere (another tab, import, SQL) after this page loaded, do not overwrite it silently
    const c = await api("/rest/v1/store_config?id=eq.1&select=ts:data->>ts");
    if (c.ok) {
      const row = (await c.json())[0],
        srv = +(row && row.ts) || 0;
      if (
        srv > BASE_TS &&
        !confirm(
          "⚠ تم تعديل المتجر من مكان آخر بعد فتح هذه الصفحة. النشر الآن سيكتب فوق التعديلات الأحدث (منتجات / أسعار). الأفضل إلغاء ثم تحديث الصفحة. هل تريد الكتابة فوقها رغم ذلك؟"
        )
      )
        return;
    }
    D.ts = Date.now();
    const r = await api("/rest/v1/store_config", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        id: 1,
        data: pubData(),
        updated_at: new Date().toISOString(),
      }),
    });
    if (!r.ok) throw new Error((await r.text()).slice(0, 200));
    BASE_TS = D.ts;
    dirty = false;
    badge();
    toast("تم النشر");
  } catch (e) {
    toast("فشل النشر: " + (e.message || "").slice(0, 80), "e");
  } finally {
    busy(btn, false);
  }
}
async function loadApis() {
  try {
    const r = await api("/rest/v1/api_settings?id=eq.1&select=*");
    if (!r.ok) throw new Error();
    const d = (await r.json())[0] || {};
    D.api = {
      smm_url: d.smm_api_url || "",
      smm_key: d.smm_api_key || "",
      payment_gateway: d.payment_gateway || "",
      payment_public_key: d.payment_public_key || "",
      payment_secret_key: d.payment_secret_key || "",
      ai_api_key: d.ai_api_key || "",
      ai_system_prompt: d.ai_system_prompt || "",
    };
    API_LOADED = true;
    if (tab == "apis") render(); // render() no longer calls loadApis(), so there is no loop any more
  } catch {
    API_LOADED = false;
    toast("تعذّر تحميل إعدادات الـ APIs", "e");
  }
}
async function saveApis(btn) {
  // Saving before the current values were loaded would blank the stored keys
  if (!API_LOADED) {
    toast("جارٍ تحميل الإعدادات الحالية… أعد المحاولة بعد لحظة", "wn");
    return loadApis();
  }
  const d = D.api || {};
  busy(btn, true);
  const row = {
    smm_api_url: (d.smm_url || "").trim(),
    smm_api_key: (d.smm_key || "").trim(),
    payment_gateway: d.payment_gateway || "",
    payment_public_key: d.payment_public_key || "",
    payment_secret_key: d.payment_secret_key || "",
    ai_api_key: d.ai_api_key || "",
    ai_system_prompt: d.ai_system_prompt || "",
  };
  const H = {
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  try {
    // PATCH + return=representation: a silent RLS block shows up as 0 rows instead of a fake "saved"
    let r = await api("/rest/v1/api_settings?id=eq.1", {
      method: "PATCH",
      headers: H,
      body: JSON.stringify(row),
    });
    if (!r.ok) throw new Error((await r.text()).slice(0, 160));
    let rows = await r.json();
    if (!rows.length) {
      // no row yet: create it
      r = await api("/rest/v1/api_settings", {
        method: "POST",
        headers: H,
        body: JSON.stringify({ id: 1, ...row }),
      });
      if (!r.ok) throw new Error((await r.text()).slice(0, 160));
      rows = await r.json();
    }
    if (!rows.length)
      throw new Error("لم يُحفظ شيء — غالباً حسابك ليس أدمن (RLS)");
    if ((rows[0].smm_api_url || "") !== row.smm_api_url)
      throw new Error("القيمة المحفوظة تختلف عن المُدخلة");
    toast("تم حفظ الإعدادات ✓");
  } catch (e) {
    toast("فشل الحفظ — " + (e.message || "").slice(0, 90), "e");
  } finally {
    busy(btn, false);
  }
}
async function loadUsers() {
  const b = $("#users-list");
  if (!b) return;
  try {
    const [pr, or] = await Promise.all([
      api("/rest/v1/profiles?select=*&order=created_at.desc"),
      api("/rest/v1/orders?select=user_id,total,status"),
    ]);
    if (!pr.ok) throw new Error();
    const users = await pr.json(),
      orders = or.ok ? await or.json() : [];
    const by = {};
    orders.forEach((o) => {
      if (o.user_id) (by[o.user_id] = by[o.user_id] || []).push(o);
    });
    b.innerHTML = `<div class="tw"><table class="tb"><tr><th>الاسم</th><th>البريد</th><th>الطلبات</th><th>الإجمالي</th><th>الحالة</th></tr>${users .map((x) => { const os = (by[x.id] || []).filter((o) => o.status != "cancelled"); return `<tr><td>${esc(x.full_name || "—")}</td><td dir="ltr">${esc( x.email )}</td><td>${os.length}</td><td>${os .reduce((s, o) => s + +o.total, 0) .toFixed(2)}</td><td>${ os.length ? '<span style="color:var(--lk)">أتم طلبات</span>' : '<span style="color:#FBBF24">لا يوجد طلب</span>' }</td></tr>`; }) .join("")}</table></div>`;
  } catch {
    b.textContent = "فشل التحميل";
  }
}
async function loadAffiliates() {
  const b = $("#aff-list");
  if (!b) return;
  try {
    const r = await api("/rest/v1/affiliates?select=*,profiles(email)");
    if (!r.ok) throw new Error();
    const a = await r.json();
    b.innerHTML = `<div class="tw"><table class="tb"><tr><th>المسوق</th><th>كوبونه</th><th>النقرات</th><th>المبيعات</th><th>العمولة</th></tr>${a .map( (x) => `<tr><td dir="ltr">${esc( (x.profiles || {}).email || x.user_id )}</td><td style="white-space:nowrap"><input class="inp" data-aff-c dir="ltr" maxlength="40" style="width:110px;display:inline-block" value="${esc(x.coupon || "")}" placeholder="CODE"> <button class="b sm" data-a="aff-coupon" data-id="${esc(x.id)}">حفظ</button></td><td>${x.clicks}</td><td>${ x.sales }</td><td>${(+x.total_commission).toFixed(2)}</td></tr>` ) .join("")}</table></div>`;
  } catch {
    b.textContent = "فشل التحميل";
  }
}

/* Orders: list, filter, and a status change that really updates the database */
let ORDERS = null,
  ordFilter = "",
  ordQ = "";
const statusLabel = (k) =>
  (ORDER_STATUSES.find((s) => s[0] == k) || [k, k || "—"])[1];
async function loadOrders() {
  const b = $("#ob");
  if (!b) return;
  b.innerHTML = loadingHTML;
  try {
    const r = await api(
      "/rest/v1/orders?select=*&order=created_at.desc&limit=200"
    );
    if (!r.ok) throw new Error();
    ORDERS = await r.json();
    renderOrderList();
    autoSweep();
  } catch {
    b.textContent = "فشل التحميل";
  }
}
function smmBlock(o, items) {
  const has = items.some((i) => {
    const p = D.products.find((x) => x.id == i.id);
    return p && p.smm_service;
  });
  if (!has && !o.smm) return "";
  const res = Array.isArray(o.smm)
    ? o.smm
        .map(
          (r) =>
            `<div class="od-m" dir="ltr">#${esc(r.order || "—")} · ${esc( r.status || r.error || "" )}${r.remains != null ? " · remains " + esc(r.remains) : ""}</div>`
        )
        .join("")
    : "";
  return `<div class="od-m" style="margin:6px 0">رشق: <b>${esc( o.smm_status || "لم يُرسل" )}</b></div>${res}<div class="acts">${ has ? `<button class="b sm" data-a="smm-send" data-id="${esc( o.id )}">إرسال لموقع الرشق</button>` : "" }${ o.smm ? `<button class="b b2 sm" data-a="smm-status" data-id="${esc( o.id )}">تحديث الحالة</button>` : "" }</div>`;
}
function orderRow(o) {
  let items = o.items;
  if (typeof items == "string") {
    try {
      items = JSON.parse(items);
    } catch {
      items = [];
    }
  }
  items = Array.isArray(items) ? items : [];
  const known = ORDER_STATUSES.some((s) => s[0] == o.status),
    st0 = known ? o.status : "new";
  const date = o.created_at
    ? new Date(o.created_at).toLocaleString("ar-EG-u-nu-latn", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";
  return `<div class="od"><div class="od-h"><div><span class="od-id">${esc( o.id )}</span><div class="od-m">${esc( o.customer_name || "—" )} · <span dir="ltr">${esc( o.customer_email || "" )}</span></div><div class="od-m">${esc(date)} · <b>${(+o.total).toFixed( 2 )} ${esc(curName(o.currency || baseCur()))}</b>${ o.coupon ? ' · كوبون: <span dir="ltr">' + esc(o.coupon) + "</span>" : "" }${o.affiliate_ref ? " · Ref: " + esc(o.affiliate_ref) : ""}</div></div> <div class="od-s"><select class="inp s-${st0}" data-ost="${esc( o.id )}" data-prev="${esc(st0)}">${ORDER_STATUSES.map( ([k, n]) => `<option value="${k}" ${st0 == k ? "selected" : ""}>${n}</option>` ).join("")}</select>${(() => { const ps = PAY_STATUSES.some((x) => x[0] == o.payment_status) ? o.payment_status : "pending"; return `<select class="inp" style="margin-top:6px" data-pst="${esc( o.id )}" data-prev="${esc(ps)}" title="حالة الدفع">${PAY_STATUSES.map( ([k, n]) => `<option value="${k}" ${ps == k ? "selected" : ""}>💳 ${n}</option>` ).join("")}</select>`; })()}</div></div> ${ o.payment_method ? `<div class="od-m">وسيلة الدفع: <b>${esc( (D.payments.find((m) => m.id == o.payment_method) || {}).ar || o.payment_method )}</b></div>` : "" } ${proofBlock(o)}${smmBlock(o, items)} <details><summary>المنتجات (${ items.length })</summary><div class="od-items">${items .map( (i) => `<div><span>${esc(i.ar || i.name || i.id)} × ${esc(i.q)}${ i.link ? '<br><small dir="ltr">' + esc(i.link) + "</small>" : "" }</span><b>${esc(i.price)}</b></div>` ) .join("")}</div></details></div>`;
}
function renderOrderList() {
  const b = $("#ob");
  if (!b || !ORDERS) return;
  const q = ordQ.trim().toLowerCase();
  const list = ORDERS.filter(
    (o) =>
      (!ordFilter || (o.status || "new") == ordFilter) &&
      (!q ||
        (
          (o.id || "") +
          " " +
          (o.customer_name || "") +
          " " +
          (o.customer_email || "")
        )
          .toLowerCase()
          .includes(q))
  );
  b.innerHTML = list.length
    ? list.map(orderRow).join("")
    : '<p class="hint">لا توجد طلبات مطابقة</p>';
  const c = $("#oc");
  if (c)
    c.textContent = `(${list.length} من ${ORDERS.length} · جديد: ${ ORDERS.filter((o) => (o.status || "new") == "new").length })`;
}
async function setOrderStatus(sel) {
  const id = sel.dataset.ost,
    prev = sel.dataset.prev,
    status = sel.value;
  sel.disabled = true;
  try {
    // return=representation lets us detect a silent RLS block (0 rows updated)
    const r = await api("/rest/v1/orders?id=eq." + encodeURIComponent(id), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ status }),
    });
    if (!r.ok) throw new Error((await r.text()).slice(0, 120));
    const rows = await r.json();
    if (!rows.length) throw new Error("RLS: لا صلاحية للتعديل");
    const o = (ORDERS || []).find((x) => x.id == id);
    if (o) o.status = status;
    sel.dataset.prev = status;
    sel.className = "inp s-" + status;
    toast("تم تحديث الحالة: " + statusLabel(status));
  } catch (e) {
    sel.value = prev;
    toast("فشل تحديث الحالة — " + (e.message || ""), "e");
  } finally {
    sel.disabled = false;
  }
}

/* Broadcast push notification to every subscribed device (RPC admin_send_broadcast; the edge function does the sending) */
const PUSH_URLS = [
  ["#/", "الصفحة الرئيسية"],
  ["#/orders", "طلباتي"],
  ["#/account", "حسابي"],
  ["#/cart", "السلة"],
];
const PUSH_TPL = [
  ["🚀 خدمة جديدة", "خدمة جديدة في المتجر 🚀", "أضفنا خدمة جديدة! اكتشفها الآن في AMARIX007."],
  ["🎁 بونص جديد", "بونص جديد لك 🎁", "بونص جديد متاح الآن لفترة محدودة، لا تفوّت الفرصة!"],
  ["🏷️ كود خصم حصري", "كود خصم حصري 🏷️", "استخدم الكود XXXX في سلتك واحصل على خصم حصري. العرض لفترة محدودة."],
];
let PUSH_STATS = null;
function fillPushTpl(i) {
  const t = PUSH_TPL[i];
  if (!t) return;
  $("#bct").value = t[1];
  $("#bcb").value = t[2];
  $("#bcb").focus();
}
async function loadPush() {
  const h = $("#bch"), st = $("#bcs");
  if (!h) return;
  try {
    const [r1, r2] = await Promise.all([
      api("/rest/v1/rpc/admin_push_stats", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }),
      api("/rest/v1/push_broadcasts?select=*&order=created_at.desc&limit=30"),
    ]);
    if (r1.ok) {
      PUSH_STATS = await r1.json();
      if (st) st.textContent = PUSH_STATS.devices + " جهاز · " + PUSH_STATS.users + " مستخدم";
    } else if (st) st.textContent = "تعذّر قراءة العدد";
    if (!r2.ok) throw new Error(await r2.text());
    const rows = await r2.json();
    h.innerHTML = rows.length
      ? rows.map((x) => `<div class="od"><div class="od-h"><div><b>${esc(x.title)}</b>${x.test ? ' <span class="bdg">تجريبي</span>' : ""}<div class="od-m">${esc(x.body)}</div><div class="od-m">${esc(new Date(x.created_at).toLocaleString("ar"))}</div></div><div class="od-s"><span class="bdg ${x.sent == null ? "" : "k"}">${x.sent == null ? "⏳ جارٍ الإرسال" : "✅ وصل إلى " + x.sent + (x.failed ? " · فشل " + x.failed : "")}</span></div></div></div>`).join("")
      : '<p class="hint">لا توجد إشعارات مرسلة بعد.</p>';
  } catch (e) {
    h.innerHTML = '<p class="hint warn">تعذّر التحميل — ' + esc((e.message || "").slice(0, 120)) + "</p>";
  }
}
async function sendBroadcast(btn, a) {
  const test = a == "push-test",
    title = $("#bct").value.trim(),
    body = $("#bcb").value.trim(),
    url = $("#bcu").value;
  if (!title || !body) return toast("اكتب العنوان والنص", "e");
  if (/XXXX/i.test(title + body)) return toast("استبدل XXXX بالكود الحقيقي قبل الإرسال", "e");
  if (!test && !confirm("سيصل هذا الإشعار إلى كل المستخدمين" + (PUSH_STATS ? " (" + PUSH_STATS.devices + " جهاز)" : "") + ":\n\n" + title + "\n" + body + "\n\nهل تريد الإرسال؟")) return;
  busy(btn, true);
  try {
    const r = await api("/rest/v1/rpc/admin_send_broadcast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ p_title: title, p_body: body, p_url: url, p_test: test }),
    });
    if (!r.ok) {
      const tx = await r.text();
      throw new Error(/too_fast/.test(tx) ? "انتظر 20 ثانية بين كل إرسالين" : /push_not_configured/.test(tx) ? "الإشعارات غير مضبوطة في الخادم" : /forbidden/.test(tx) ? "هذا الحساب ليس أدمن" : tx.slice(0, 100));
    }
    toast(test ? "أُرسل إشعار تجريبي إلى أجهزتك" : "بدأ إرسال الإشعار للجميع ✅");
    if (!test) {
      $("#bct").value = "";
      $("#bcb").value = "";
    }
    setTimeout(loadPush, 4000);
  } catch (e) {
    toast(e.message || "فشل الإرسال", "e");
  } finally {
    busy(btn, false);
  }
}

/* Support tickets: list, reply, status. Telegram is notified by the database trigger when a customer sends one. */
const TK_ST = [
  ["open", "مفتوحة"],
  ["answered", "تم الرد"],
  ["closed", "مغلقة"],
];
let TICKETS = null,
  tkFilter = "open",
  tkQ = "";
/* ---------- Store statistics (server functions admin_stats / admin_product_stats) ---------- */
let STATS_DAYS = 30;
const fnum = (v, d = 0) => Number(v || 0).toLocaleString("en", { maximumFractionDigits: d, minimumFractionDigits: d });
async function loadAdminStats() {
  const h = $("#stb");
  if (!h) return;
  h.innerHTML = loadingHTML;
  try {
    const body = JSON.stringify({ p_days: STATS_DAYS }),
      hd = { "Content-Type": "application/json" };
    const [r1, r2] = await Promise.all([
      api("/rest/v1/rpc/admin_stats", { method: "POST", headers: hd, body }),
      api("/rest/v1/rpc/admin_product_stats", { method: "POST", headers: hd, body }),
    ]);
    if (!r1.ok) throw new Error(await r1.text());
    const a = await r1.json(),
      b = r2.ok ? await r2.json() : null;
    const days = a.by_day || [],
      mx = Math.max(1, ...days.map((x) => +x.rev || 0));
    const conv = b && b.views > 0 ? ((b.paid_orders * 100) / b.views).toFixed(1) + "%" : "—";
    const tile = (n, l) => `<div class="card" style="flex:1;min-width:130px;text-align:center"><b style="font-size:22px">${n}</b><div class="od-m">${l}</div></div>`;
    const f = a.funnel || {},
      rv = a.reviews || {};
    h.innerHTML =
      `<div class="fl" style="flex-wrap:wrap">${tile(fnum(a.revenue, 2), "الإيرادات المدفوعة")}${tile(fnum(a.paid_orders) + " / " + fnum(a.orders), "طلبات مدفوعة / كل الطلبات")}${tile(b ? fnum(b.views) : "—", "مشاهدات المنتجات")}${tile(conv, "معدل التحويل (مدفوع ÷ مشاهدات)")}</div>` +
      `<div class="card"><h3>المبيعات اليومية</h3>${
        days.length
          ? days
              .map((x) => `<div class="fl" style="align-items:center;gap:8px"><small dir="ltr" style="width:78px">${esc(String(x.d).slice(5))}</small><div style="flex:1;background:var(--bg);border-radius:6px;overflow:hidden"><div style="height:12px;width:${Math.max(2, ((+x.rev || 0) / mx) * 100)}%;background:var(--ac,#52B788)"></div></div><small dir="ltr" style="width:90px;text-align:end">${fnum(x.rev, 2)} · ${fnum(x.n)}</small></div>`)
              .join("")
          : '<p class="hint">لا توجد طلبات في هذه الفترة.</p>'
      }</div>` +
      `<div class="card"><h3>الأكثر ربحاً</h3>${
        (a.top || []).length
          ? a.top.map((x) => `<div class="od-m">• ${esc(x.name || x.id)} — ${fnum(x.qty)} وحدة · ${fnum(x.rev, 2)}</div>`).join("")
          : '<p class="hint">لا توجد مبيعات مدفوعة بعد.</p>'
      }</div>` +
      (b
        ? `<div class="card"><h3>المشاهدات مقابل الشراء</h3>${
            (b.rows || []).length
              ? b.rows.slice(0, 15).map((x) => `<div class="od-m">• ${esc(x.name)} — ${fnum(x.views)} مشاهدة · ${fnum(x.orders)} طلب · تحويل ${x.conv == null ? "—" : x.conv + "%"}</div>`).join("")
              : '<p class="hint">لا توجد مشاهدات مسجلة بعد (تُسجَّل عند فتح صفحة منتج).</p>'
          }</div><div class="card"><h3>السلات المتروكة</h3><div class="od-m">بانتظار التذكير: ${fnum(b.carts_waiting)} · تم تذكيرها: ${fnum(b.carts_reminded)}</div></div>`
        : "") +
      `<div class="card"><h3>القمع والتقييمات</h3><div class="od-m">نقرات الإحالة: ${fnum(f.ref_clicks)} · مسجّلون: ${fnum(f.signups)} · مشترون: ${fnum(f.buyers)} · دفعوا: ${fnum(f.paid_buyers)}</div><div class="od-m">التقييمات: ${fnum(rv.count)}${rv.avg ? " · المتوسط " + rv.avg : ""} · طلبات سحب بانتظار المعالجة: ${fnum(a.pending_payouts)}</div></div>`;
    const c = $("#stc");
    if (c) c.textContent = "آخر " + a.days + " يوماً";
  } catch (e) {
    h.innerHTML = '<p class="hint warn">تعذّر تحميل الإحصاءات — ' + esc((e.message || "").slice(0, 120)) + "</p>";
  }
}

async function loadTickets() {
  const b = $("#tkb");
  if (!b) return;
  b.innerHTML = loadingHTML;
  try {
    const r = await api("/rest/v1/support_tickets?select=*&order=created_at.desc&limit=200");
    if (!r.ok) {
      const tx = await r.text();
      throw new Error(/PGRST205|does not exist/i.test(tx) ? "setup" : tx.slice(0, 120));
    }
    TICKETS = await r.json();
    renderTicketList();
  } catch (e) {
    b.innerHTML = e.message == "setup" ? '<p class="hint warn">⚠ جدول support_tickets غير موجود. شغّل ملف supabase-support-tickets.sql في Supabase > SQL Editor ثم حدّث.</p>' : "فشل التحميل";
  }
}
function tkBadges(t) {
  const b = [];
  if (t.resolved === true) b.push('<span class="bdg k">✅ الزبون: تم الحل</span>');
  else if (t.resolved === false) b.push('<span class="bdg d">❌ الزبون: لم تُحل</span>');
  else if (t.admin_reply) b.push('<span class="bdg">⏳ بانتظار تقييم الزبون</span>');
  if (t.admin_reply) {
    const m = { queued: "📧 أُرسل الرد إلى بريد الزبون", not_configured: "⚠ لم يُرسل بريد (خدمة البريد غير مضبوطة)", invalid_email: "⚠ بريد الزبون غير صالح", error: "⚠ تعذّر إرسال البريد" };
    if (t.email_status) b.push(`<span class="bdg${t.email_status == "queued" ? " k" : " d"}">${m[t.email_status] || esc(t.email_status)}</span>`);
  }
  return b.length ? `<div class="od-m" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">${b.join("")}</div>` : "";
}
function ticketRow(t) {
  const st0 = TK_ST.some((x) => x[0] == t.status) ? t.status : "open",
    date = t.created_at ? new Date(t.created_at).toLocaleString("ar-EG-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }) : "";
  return `<div class="od"><div class="od-h"><div><span class="od-id">#${esc(t.id)} · ${esc(t.subject)}</span><div class="od-m">${esc(t.customer_name || "—")} · <span dir="ltr">${esc(t.customer_email || "")}</span></div><div class="od-m">${esc(date)}${t.order_id ? " · الطلب: <b dir=\"ltr\">" + esc(t.order_id) + "</b>" : ""}</div>${tkBadges(t)}</div><div class="od-s"><select class="inp" data-tks="${esc(t.id)}" data-prev="${esc(st0)}">${TK_ST.map(([k, n]) => `<option value="${k}" ${st0 == k ? "selected" : ""}>${n}</option>`).join("")}</select></div></div><p style="white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0">${esc(t.message)}</p>${t.attachment ? `<div class="od-m">صورة مرفقة: <button class="b b2 sm" data-a="proof-link" data-bkt="ticket-files" data-path="${esc(t.attachment)}">عرض الصورة</button></div>` : ""}${t.admin_reply ? `<div class="od-m" style="margin-top:8px">ردّك السابق: <span style="white-space:pre-wrap">${esc(t.admin_reply)}</span></div>` : ""}<div class="fld" style="margin-top:8px"><span>${t.admin_reply ? "تعديل الرد" : "الرد على الزبون"}</span><textarea class="inp" rows="3" id="tkr-${esc(t.id)}" maxlength="2000" placeholder="اكتب ردّك هنا…">${esc(t.admin_reply || "")}</textarea></div><div class="acts"><button class="b sm" data-a="tk-reply" data-id="${esc(t.id)}">${t.admin_reply ? "تحديث الرد" : "إرسال الرد"}</button></div></div>`;
}
function renderTicketList() {
  const b = $("#tkb");
  if (!b || !TICKETS) return;
  const q = tkQ.trim().toLowerCase();
  const list = TICKETS.filter(
    (t) =>
      (!tkFilter || (tkFilter == "unres" ? t.resolved === false : (t.status || "open") == tkFilter)) &&
      (!q || [t.id, t.customer_name, t.customer_email, t.order_id, t.subject, t.message].join(" ").toLowerCase().includes(q))
  );
  b.innerHTML = list.length ? list.map(ticketRow).join("") : '<p class="hint">لا توجد تذاكر مطابقة</p>';
  const c = $("#tkc");
  if (c) c.textContent = `(${list.length} من ${TICKETS.length} · مفتوحة: ${TICKETS.filter((t) => (t.status || "open") == "open").length})`;
}
async function patchTicket(id, body) {
  const r = await api("/rest/v1/support_tickets?id=eq." + encodeURIComponent(id), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error((await r.text()).slice(0, 120));
  const rows = await r.json();
  if (!rows.length) throw new Error("RLS: لا صلاحية للتعديل");
  const t = (TICKETS || []).find((x) => String(x.id) == String(id));
  if (t) Object.assign(t, rows[0]);
}
async function replyTicket(btn) {
  const id = btn.dataset.id,
    ta = $("#tkr-" + id),
    txt = ((ta && ta.value) || "").trim();
  if (!txt) return toast("اكتب نص الرد أولاً", "e");
  busy(btn, true);
  try {
    await patchTicket(id, { admin_reply: txt, status: "answered" });
    const tk = (TICKETS || []).find((x) => String(x.id) == String(id)),
      es = tk && tk.email_status;
    toast(es == "queued" ? "تم إرسال الرد وبريد للزبون" : es == "not_configured" ? "تم حفظ الرد (لم يُرسل بريد: خدمة البريد غير مضبوطة بعد)" : es == "invalid_email" ? "تم حفظ الرد (بريد الزبون غير صالح)" : "تم إرسال الرد");
    renderTicketList();
  } catch (e) {
    busy(btn, false);
    toast("فشل إرسال الرد — " + (e.message || ""), "e");
  }
}
async function setTicketStatus(sel) {
  const id = sel.dataset.tks,
    prev = sel.dataset.prev;
  sel.disabled = true;
  try {
    await patchTicket(id, { status: sel.value });
    sel.dataset.prev = sel.value;
    toast("تم تحديث حالة التذكرة");
    renderTicketList();
  } catch (e) {
    sel.value = prev;
    sel.disabled = false;
    toast("فشل التحديث — " + (e.message || ""), "e");
  }
}

/* ---------- SMM & payment helpers (Edge Function `smm`) ---------- */
async function fn(name, body) {
  const r = await api("/functions/v1/" + name, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  if (r.status == 404)
    throw new Error(
      "الدالة " + name + " غير منشورة في Supabase (Edge Functions)"
    );
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "خطأ " + r.status);
  return j;
}
let SMM_SVC = [];
function smmOut(html) {
  const o = $("#smm-out");
  if (o) o.innerHTML = html;
}
let SMM_MK = "30", SMM_CAT = "";
const smmFiltered = () => {
  const q = (($("#smm-q") || {}).value || "").trim().toLowerCase();
  return SMM_SVC.filter(
    (x) => !q || (x.id + " " + x.name + " " + (x.category || "")).toLowerCase().includes(q)
  );
};
function smmList() {
  const mk = $("#smm-mk"), ct = $("#smm-cat");
  if (mk) SMM_MK = mk.value;
  if (ct) SMM_CAT = ct.value;
  if (!SMM_CAT) SMM_CAT = ((D.categories.find((c) => c.ty == "boost") || D.categories[0] || {}).id) || "";
  const all = smmFiltered(), L = all.slice(0, 80);
  const bar =
    '<div class="g2" style="margin:8px 0;align-items:end">' +
    '<label class="fld"><span>\u0627\u0644\u0642\u0633\u0645 \u0627\u0644\u0645\u0633\u062a\u0647\u062f\u0641</span><select class="inp" id="smm-cat">' +
    D.categories.map((c) => `<option value="${esc(c.id)}"${c.id == SMM_CAT ? " selected" : ""}>${esc(c.ar || c.en || c.id)}</option>`).join("") +
    '</select></label>' +
    `<label class="fld"><span>\u0647\u0627\u0645\u0634 \u0627\u0644\u0631\u0628\u062d %</span><input class="inp" id="smm-mk" type="number" min="0" step="1" value="${esc(SMM_MK)}" dir="ltr"></label></div>` +
    `<button class="b" data-a="smm-imp" data-id="*">\u0627\u0633\u062a\u064a\u0631\u0627\u062f \u0643\u0644 \u0627\u0644\u0646\u062a\u0627\u0626\u062c (${Math.min(all.length, 300)})</button>`;
  smmOut(
    L.length
      ? bar +
          '<table class="tb"><tr><th>ID</th><th></th><th>/1000</th><th>min-max</th><th></th></tr>' +
          L.map(
            (x) =>
              `<tr><td dir="ltr">${esc(x.id)}</td><td>${esc(x.name)}</td><td dir="ltr">${esc(x.rate)}</td><td dir="ltr">${esc(x.min)}-${esc(x.max)}</td><td><button class="b sm" data-a="smm-imp" data-id="${esc(x.id)}">+</button></td></tr>`
          ).join("") +
          "</table>"
      : "\u0644\u0627 \u0646\u062a\u0627\u0626\u062c"
  );
}
/* ---- service -> Arabic title / platform / type (so the store filters work) ---- */
const SMM_PLAT = [
  [/insta|\big\b/i, "Instagram", "إنستغرام"], [/tik ?tok/i, "TikTok", "تيك توك"], [/youtube|\byt\b/i, "YouTube", "يوتيوب"],
  [/telegram|\btg\b/i, "Telegram", "تيليجرام"], [/twitter|\bx\b|tweet/i, "X", "إكس (تويتر)"], [/facebook|\bfb\b/i, "Facebook", "فيسبوك"],
  [/snap ?chat/i, "Snapchat", "سناب شات"], [/spotify/i, "Spotify", "سبوتيفاي"], [/threads/i, "Threads", "ثريدز"],
  [/linked ?in/i, "LinkedIn", "لينكدإن"], [/discord/i, "Discord", "ديسكورد"], [/twitch/i, "Twitch", "تويتش"], [/kick/i, "Kick", "كيك"],
];
const SMM_TYPE = [
  [/follower|subscriber|member|subs\b/i, "متابعين"], [/like|reaction|heart/i, "لايكات"], [/view|play|impression|watch|reach/i, "مشاهدات"],
  [/comment/i, "تعليقات"], [/share|save|repost/i, "مشاركات وحفظ"],
];
function smmMeta(x) {
  const hay = String(x.category || "") + " " + String(x.name || "");
  const pl = SMM_PLAT.find((r) => r[0].test(hay)) || [0, "Other", "منصات أخرى"];
  const ty = (SMM_TYPE.find((r) => r[0].test(String(x.name || "") + " " + String(x.category || ""))) || [0, "خدمات أخرى"])[1];
  let tail = String(x.name || "").replace(/\s+/g, " ").trim();
  if (tail.length > 70) tail = tail.slice(0, 67) + "…";
  return { plEn: pl[1], plAr: pl[2], ty, ar: `${ty} ${pl[2]} — ${tail}`, tg: `${pl[1]} ${pl[2]} ${ty}` };
}
function smmEnsureFilter(cat, plEn, ty) {
  const c = D.categories.find((k) => k.id == cat);
  if (!c || !Array.isArray(c.f) || c.f.length < 2) return;
  const add = (g, v) => { if (g && Array.isArray(g.o) && v && !g.o.some((o) => String(o).toLowerCase() == String(v).toLowerCase())) g.o.push(v); };
  if (c.ty == "boost") { add(c.f[0], plEn == "Other" ? "" : plEn); add(c.f[1], ty); }
}
/* Turn panel services into store products: 1 package = 1000 units, price = rate x (1 + markup). qmin/qmax are in packages. */
function smmImport(btn) {
  const mk = Math.max(0, parseFloat(($("#smm-mk") || {}).value) || 0);
  const cat = ($("#smm-cat") || {}).value || SMM_CAT;
  if (!cat) return toast("اختر قسماً", "e");
  try { localStorage.setItem("amx_smm_mk", String(mk)); } catch (e) {}
  const src = btn.dataset.id == "*" ? smmFiltered().slice(0, 300) : SMM_SVC.filter((x) => String(x.id) == btn.dataset.id);
  let add = 0, skip = 0;
  src.forEach((x) => {
    const sid = String(x.id), rate = parseFloat(x.rate);
    if (!(rate > 0) || D.products.some((p) => String(p.smm_service) == sid && p.c == cat)) { skip++; return; }
    const it = NEW.products(), mt = smmMeta(x), name = String(x.name || ("Service " + sid)).trim();
    Object.assign(it, {
      id: "smm" + sid, c: cat, k: "buy", ar: mt.ar, en: name,
      p: Math.max(0.01, Math.round(rate * (1 + mk / 100) * 100) / 100),
      o: 0, d: 0, r: 5, n: 0, bs: 0, tg: mt.tg, sp: mt.plAr + " · " + mt.ty,
      smm_service: sid, smm_qty: 1000, smm_mk: mk,
      qmin: Math.max(1, Math.ceil((parseFloat(x.min) || 1) / 1000)),
      qmax: Math.max(1, Math.floor((parseFloat(x.max) || 1000) / 1000)),
    });
    D.products.push(it);
    smmEnsureFilter(cat, mt.plEn, mt.ty);
    add++;
  });
  save();
  toast(`تمت إضافة ${add} · تخطّي ${skip}. اضغط نشر للحفظ`, add ? "" : "e");
}

/* ---- price sync with the provider (cache is kept 24h; only ids + rates of imported products) ---- */
const smmCfg = () => D.products.some((p) => p.smm_service);
const smmCache = () => { try { return JSON.parse(localStorage.getItem("amx_smm_rates") || "null"); } catch (e) { return null; } };
async function smmFetchRates(force) {
  const c = smmCache();
  if (!force && c && Date.now() - c.ts < 864e5) return c;
  const j = await fn("smm-order", { action: "services" });
  if (!Array.isArray(j) && !Array.isArray(j.services)) throw new Error(j.error || "رد غير متوقع من موقع الرشق");
  const L = Array.isArray(j) ? j : j.services || [];
  const want = new Set(D.products.filter((p) => p.smm_service).map((p) => String(p.smm_service)));
  const map = {}, ids = [];
  L.forEach((x) => { const id = String(x.service != null ? x.service : x.id); ids.push(id); if (want.has(id)) map[id] = [parseFloat(x.rate), parseFloat(x.min), parseFloat(x.max)]; });
  const out = { ts: Date.now(), map, ids };
  try { localStorage.setItem("amx_smm_rates", JSON.stringify(out)); } catch (e) {}
  return out;
}
const smmMk = (p) => { const v = parseFloat(p.smm_mk); return v >= 0 ? v : parseFloat(localStorage.getItem("amx_smm_mk")) || 30; };
function smmDrift(c) {
  const up = [], gone = [];
  if (!c) return { up, gone };
  const have = new Set(c.ids || []);
  D.products.filter((p) => p.smm_service).forEach((p) => {
    const sid = String(p.smm_service), r = c.map[sid];
    if (!r) { if (have.size && !have.has(sid)) gone.push(p); return; }
    const np = Math.max(0.01, Math.round(r[0] * (1 + smmMk(p) / 100) * 100) / 100);
    if (Math.abs(np - p.p) > 0.009 && Math.abs(np - p.p) / Math.max(p.p, 0.01) > 0.005) up.push({ p, np, rate: r[0] });
  });
  return { up, gone };
}
function smmReprice() {
  const c = smmCache(), d = smmDrift(c);
  d.up.forEach(({ p, np }) => { p.p = np; if (p.smm_mk == null) p.smm_mk = smmMk(p); });
  if (c) D.products.filter((p) => p.smm_service && c.map[String(p.smm_service)]).forEach((p) => { const r = c.map[String(p.smm_service)]; p.qmin = Math.max(1, Math.ceil((r[1] || 1) / 1000)); p.qmax = Math.max(1, Math.floor((r[2] || 1000) / 1000)); });
  save();
  toast(`تم تحديث ${d.up.length} سعراً. اضغط نشر للحفظ`);
  render();
}

/* ---- automatic send to the provider + status refresh (runs while the panel is open) ---- */
const autoOn = () => localStorage.getItem("amx_autosend") !== "0";
const orderItems = (o) => { let it = o.items; if (typeof it == "string") { try { it = JSON.parse(it); } catch (e) { it = []; } } return Array.isArray(it) ? it : []; };
const hasSmmItems = (o) => orderItems(o).some((i) => { const p = D.products.find((x) => x.id == i.id); return p && p.smm_service; });
const smmDone = (o) => /complete|cancel|refund|fail|partial/i.test(String(o.smm_status || ""));
async function autoSend(o, quiet) {
  if (!autoOn() || !o || o.smm || o.payment_status != "paid" || !hasSmmItems(o)) return;
  try {
    const j = await fn("smm-order", { action: "send", order_id: o.id });
    o.smm = j.results; o.smm_status = j.smm_status;
    if (!quiet) toast("أُرسل الطلب تلقائياً إلى المزوّد");
    if ($("#ob")) renderOrderList();
  } catch (e) { toast("فشل الإرسال التلقائي: " + String(e.message).slice(0, 70), "e"); }
}
async function autoSweep() {
  if (!autoOn() || !ORDERS) return;
  for (const o of ORDERS.filter((x) => x.payment_status == "paid" && !x.smm && hasSmmItems(x)).slice(0, 5)) await autoSend(o, true);
  for (const o of ORDERS.filter((x) => x.smm && !smmDone(x)).slice(0, 8)) {
    try { const j = await fn("smm-order", { action: "refresh", order_id: o.id }); o.smm = j.results; o.smm_status = j.smm_status; } catch (e) {}
  }
  if ($("#ob")) renderOrderList();
}

/* ---- home dashboard: real numbers ---- */
const usd = (o) => { const r = D.rates && D.rates[o.currency || baseCur()]; const k = r ? +r[0] : 1; return (+o.total || 0) / (k > 0 ? k : 1); };
async function homeStats() {
  const box = $("#hs");
  if (!box) return;
  box.innerHTML = '<div class="card"><div class="ld"><span class="spin"></span> جارٍ تحميل الأرقام…</div></div>';
  let rows = [], bal = null, cache = smmCache(), err = "";
  try {
    const r = await api("/rest/v1/orders?select=total,currency,payment_status,status,created_at,items&order=created_at.desc&limit=500");
    if (r.ok) rows = await r.json();
  } catch (e) {}
  if (smmCfg()) {
    try { const j = await fn("smm-order", { action: "balance" }); bal = { v: parseFloat(j.balance), c: j.currency || "USD" }; } catch (e) { err = String(e.message || "").slice(0, 80); }
    try { cache = await smmFetchRates(false); } catch (e) {}
  }
  const now = new Date(), d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(), w0 = d0 - 6 * 864e5;
  const paid = rows.filter((o) => o.payment_status == "paid");
  const sum = (a) => a.reduce((t, o) => t + usd(o), 0);
  const tdy = paid.filter((o) => new Date(o.created_at).getTime() >= d0), wk = paid.filter((o) => new Date(o.created_at).getTime() >= w0);
  const rev = (v) => `${v.toFixed(2)} <small>${esc(baseCur())}</small>`;
  const pend = rows.filter((o) => o.payment_status == "review").length, open = rows.filter((o) => o.status == "new" || o.status == "processing").length;
  const cnt = {};
  paid.forEach((o) => orderItems(o).forEach((i) => { const k = i.id; cnt[k] = cnt[k] || { n: 0, t: i.ar || i.name || i.id }; cnt[k].n += +i.q || 1; }));
  const top = Object.values(cnt).sort((a, b) => b.n - a.n).slice(0, 5);
  const dr = smmDrift(cache), low = bal && bal.v < (parseFloat(localStorage.getItem("amx_smm_low")) || 5);
  const kp = (n, l, cl) => `<div class="stat${cl ? " " + cl : ""}"><b>${n}</b><span>${l}</span></div>`;
  box.innerHTML =
    `<div class="stats">${kp(rev(sum(tdy)), "مبيعات اليوم")}${kp(rev(sum(wk)), "مبيعات 7 أيام")}${kp(pend, "بانتظار مراجعة الدفع", pend ? "hot" : "")}${kp(open, "طلبات مفتوحة")}${bal ? kp(bal.v.toFixed(2) + " <small>" + esc(bal.c) + "</small>", "رصيدك لدى المزوّد", low ? "hot" : "") : ""}</div>` +
    (low ? `<div class="card" style="border-color:#f87171"><b>⚠ رصيد المزوّد منخفض.</b> الطلبات ستفشل عند نفاد الرصيد، اشحنه قبل استقبال طلبات جديدة.</div>` : "") +
    (err && smmCfg() ? `<div class="card hint warn">تعذّر قراءة رصيد المزوّد: ${esc(err)}</div>` : "") +
    (dr.up.length || dr.gone.length
      ? `<div class="card" style="border-color:var(--wn)"><h2>تغيّر أسعار المزوّد</h2>` +
        (dr.up.length ? `<p class="hint">${dr.up.length} منتجاً سعره في متجرك لا يطابق سعر المزوّد الحالي مع هامشك:</p><div class="tw"><table class="tb"><tr><th>المنتج</th><th>سعرك</th><th>الجديد</th></tr>${dr.up.slice(0, 8).map(({ p, np }) => `<tr><td>${esc(p.ar)}</td><td dir="ltr">${p.p}</td><td dir="ltr"><b>${np}</b> ${np > p.p ? "▲" : "▼"}</td></tr>`).join("")}</table></div><div class="acts"><button class="b" data-a="smm-reprice">تطبيق كل الأسعار الجديدة (${dr.up.length})</button></div>` : "") +
        (dr.gone.length ? `<p class="hint warn" style="margin-top:10px">⚠ ${dr.gone.length} خدمة لم تعد موجودة عند المزوّد: ${dr.gone.slice(0, 4).map((p) => esc(p.ar.slice(0, 30))).join("، ")}. أخفِها أو احذفها.</p>` : "") + `</div>`
      : smmCfg() ? `<div class="card"><small>✓ أسعار المنتجات المستوردة مطابقة للمزوّد${cache ? " (آخر فحص: " + new Date(cache.ts).toLocaleString("ar") + ")" : ""}.</small> <button class="b b2 sm" data-a="smm-recheck">فحص الآن</button></div>` : "") +
    `<div class="card"><h2>الأكثر مبيعاً</h2>${top.length ? top.map((t0, i) => `<div class="it"><span class="thm">${i + 1}</span><div class="im"><b>${esc(t0.t)}</b></div><b>${t0.n}</b></div>`).join("") : '<p class="hint">لا توجد طلبات مدفوعة بعد.</p>'}</div>` +
    `<div class="card"><h2>الأتمتة</h2><p class="hint">عند تأكيد الدفع يُرسَل الطلب للمزوّد تلقائياً وتتحدّث حالته كل مرة تفتح فيها اللوحة. (يعمل أثناء فتح لوحة الإدارة.)</p><div class="acts"><button class="b ${autoOn() ? "" : "b2"}" data-a="autosend-t">الإرسال التلقائي: ${autoOn() ? "مفعّل" : "متوقف"}</button></div></div>`;
}
async function smmAction(btn, kind) {
  busy(btn, true);
  try {
    if (kind == "smm-test") {
      const j = await fn("smm-order", { action: "balance" });
      smmOut(
        '✓ الاتصال ناجح — الرصيد: <b dir="ltr">' +
          esc(j.balance) +
          " " +
          esc(j.currency || "") +
          "</b>"
      );
      toast("الاتصال بموقع الرشق ناجح");
    } else {
      const j = await fn("smm-order", { action: "services" });
      if (!Array.isArray(j) && !Array.isArray(j.services)) throw new Error(j.error || "رد غير متوقع من موقع الرشق — تحقق من الرابط والمفتاح في إعدادات APIs");
      SMM_SVC = Array.isArray(j)
        ? j.map((x) => ({
            id: x.service,
            name: x.name,
            category: x.category,
            rate: x.rate,
            min: x.min,
            max: x.max,
          }))
        : j.services || [];
      smmList();
    }
  } catch (e) {
    smmOut("✗ " + esc(e.message));
    toast("فشل: " + e.message.slice(0, 80), "e");
  } finally {
    busy(btn, false);
  }
}
async function setPayment(sel) {
  const id = sel.dataset.pst,
    prev = sel.dataset.prev,
    payment_status = sel.value;
  sel.disabled = true;
  try {
    const r = await api("/rest/v1/orders?id=eq." + encodeURIComponent(id), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ payment_status }),
    });
    if (!r.ok) throw new Error((await r.text()).slice(0, 120));
    const rows = await r.json();
    if (!rows.length) throw new Error("RLS: لا صلاحية للتعديل");
    const o = (ORDERS || []).find((x) => x.id == id);
    if (o) o.payment_status = payment_status;
    sel.dataset.prev = payment_status;
    toast("تم تحديث حالة الدفع");
    if (o && payment_status == "paid") autoSend(o);
  } catch (e) {
    sel.value = prev;
    toast("فشل تحديث الدفع — " + (e.message || ""), "e");
  } finally {
    sel.disabled = false;
  }
}
async function smmOrder(btn) {
  const id = btn.dataset.id,
    act = btn.dataset.a == "smm-send" ? "send" : "refresh";
  if (
    act == "send" &&
    !confirm("إرسال هذا الطلب إلى موقع الرشق الآن؟ سيُخصم الرصيد.")
  )
    return;
  busy(btn, true);
  try {
    const j = await fn("smm-order", { action: act, order_id: id });
    const o = (ORDERS || []).find((x) => x.id == id);
    if (o) {
      o.smm = j.results;
      o.smm_status = j.smm_status;
    }
    toast(act == "send" ? "تم الإرسال إلى موقع الرشق" : "تم تحديث حالة الرشق");
    renderOrderList();
  } catch (e) {
    toast(
      /not paid/.test(e.message)
        ? "الطلب غير مدفوع — غيّر حالة الدفع إلى «تم الدفع» أولاً"
        : "فشل: " + e.message.slice(0, 90),
      "e"
    );
  } finally {
    busy(btn, false);
  }
}

/* ---------- 12. Boot ---------- */
async function boot() {
  SES = sget();
  if (SES) {
    try {
      await tok();
    } catch {
      SES = null;
    }
  }
  if (!SES) return loginView();
  await Promise.all([loadCfg(), checkRole()]);
  if (isStaffOnly()) await loadCfgStaff();
  render();
}
boot();
