import { rpc, fn } from "../core/http.js";
import { loadCatalog, data, edit } from "../core/catalog.js";
import { publishBar } from "../core/forms.js";
import { h, mount, pageHeader, badge, field, input, select as sel, toast, fail, spinner, errorState } from "../core/ui.js";

const cleanId = (v) => String(v || "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24) || "service";
const text = (v) => String(v ?? "").trim();
const number = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;

function classify(name, category, kind) {
  if (kind === "smm") return "smm";
  if (kind === "smsactivate") return "numbers";
  const s = (name + " " + category).toLowerCase();
  if (/pubg|free fire|freefire|mobile legends|mlbb|fortnite|roblox|clash|game|لعبة|العاب|ألعاب/.test(s)) return "games";
  if (/chatgpt|openai|midjourney|claude|gemini|ai |artificial|ذكاء|صناعي/.test(s)) return "ai";
  if (/whatsapp|telegram|discord|snapchat|tiktok|instagram|messenger|واتساب|تلغرام|دردشة/.test(s)) return "chat";
  return "apps";
}
const HUB_LABEL = { games: "الألعاب", chat: "تطبيقات الدردشة", apps: "التطبيقات والاشتراكات", ai: "الذكاء الاصطناعي", numbers: "أرقام التفعيل", smm: "الرشق" };
const PTYPE = { games: "game_topup", chat: "app_subscription", apps: "app_subscription", ai: "app_subscription", numbers: "app_subscription", smm: "smm" };

export default async function (view) {
  await loadCatalog();
  const root = h("div");
  let providers = [], selected = "", rows = [], loading = false, markup = 30, filter = "";
  const status = h("div");
  const preview = h("div");

  async function loadProviders() {
    try {
      const extra = await rpc("smm_providers_admin_list");
      providers = [{ id: "main", name: "المزوّد الرئيسي", kind: "smm", enabled: true }, ...(Array.isArray(extra) ? extra : []).filter((p) => p.enabled !== false)];
      selected = providers.some((p) => p.id === selected) ? selected : providers[0]?.id || "";
      draw();
    } catch (e) {
      mount(status, errorState(new Error("تعذّر تحميل المزوّدين: " + e.message), loadProviders));
    }
  }

  function normalize(raw, provider) {
    const kind = provider.kind || "smm";
    if (kind === "smsactivate") {
      const services = new Map((raw.services || []).map((x) => [String(x.code), String(x.name || x.code)]));
      const countries = new Map((raw.countries || []).map((x) => [String(x.id), String(x.name || x.id)]));
      return (raw.offers || []).map((o) => {
        const service = String(o.s), country = String(o.c);
        return { id: service + "_" + country, service, country, name: (services.get(service) || service) + " — " + (countries.get(country) || country), category: services.get(service) || "أرقام التفعيل", rate: number(o.p), amount: o.n, available: o.n == null || number(o.n) > 0 };
      });
    }
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.services) ? raw.services : Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.results) ? raw.results : [];
    return list.map((x) => ({
      id: text(x.id ?? x.service ?? x.service_id ?? x.offer_id ?? x.product_id),
      service: text(x.service ?? x.service_id ?? x.id),
      name: text(x.name ?? x.title ?? x.product_name ?? x.offer_name ?? x.service_name),
      category: text(x.category ?? x.category_name ?? x.group ?? x.type),
      rate: number(x.rate ?? x.price ?? x.cost),
      min: number(x.min ?? x.min_qty ?? x.minimum, 1),
      max: number(x.max ?? x.max_qty ?? x.maximum, 0),
      image: text(x.image ?? x.icon ?? x.image_url),
      available: x.available !== false && x.enabled !== false
    })).filter((x) => x.id && x.name);
  }

  async function fetchCatalog() {
    if (loading || !selected) return;
    loading = true; rows = []; draw(); mount(status, spinner("جارٍ جلب كتالوج المزوّد…"));
    try {
      const provider = providers.find((p) => p.id === selected);
      if (!provider) throw new Error("المزوّد المحدد غير موجود");
      const action = provider.kind === "smsactivate" ? "numbers_catalog" : "services";
      const raw = await fn("smm-order", { action, provider: provider.id });
      if (raw?.error) throw new Error(raw.error);
      rows = normalize(raw, provider).map((x) => ({ ...x, hub: classify(x.name, x.category, provider.kind), selected: false }));
      const current = data().products;
      const exists = new Set(current.map((p) => [String(p.smm_provider || "main"), String(p.smm_service || ""), String(p.smm_country || "")].join("|")));
      rows.forEach((x) => { x.exists = exists.has([provider.id, x.service || x.id, x.country || ""].join("|")); x.selected = !x.exists && x.available && x.rate > 0; });
      mount(status, h("p", { class: "hint" }, `اكتمل الجلب: ${rows.length} خدمة. الموجود مسبقاً مستبعد تلقائياً من التحديد.`));
    } catch (e) { mount(status, errorState(e, fetchCatalog)); }
    finally { loading = false; draw(); }
  }

  function categoryFor(D, row, provider) {
    if (row.hub === "smm") {
      let c = D.categories.find((x) => x.ty === "boost" || x.hub === "smm");
      if (!c) { c = { id: "hub_smm", ty: "boost", i: "trend", ar: "خدمات الرشق", en: "Social services", hub: "smm", f: [] }; D.categories.push(c); }
      return c.id;
    }
    const brand = cleanId(row.category || row.name.split(/[—–-]/)[0]);
    const id = "imp_" + row.hub + "_" + brand;
    let c = D.categories.find((x) => x.id === id);
    if (!c) {
      c = { id, ty: "shop", i: row.hub === "numbers" ? "phone" : row.hub === "games" ? "bolt" : row.hub === "ai" ? "bot" : "users", ar: text(row.category || row.name), en: text(row.category || row.name), hub: row.hub, bk: brand, f: [] };
      D.categories.push(c);
    }
    return c.id;
  }

  function saveSelected() {
    const chosen = rows.filter((x) => x.selected && !x.exists && x.available && x.rate > 0);
    if (!chosen.length) return toast("حدد خدمات صالحة أولاً", "err");
    const provider = providers.find((p) => p.id === selected);
    if (!provider) return toast("المزوّد غير محدد", "err");
    edit((D) => {
      const keys = new Set(D.products.map((p) => [String(p.smm_provider || "main"), String(p.smm_service || ""), String(p.smm_country || "")].join("|")));
      for (const row of chosen) {
        const service = row.service || row.id;
        const key = [provider.id, service, row.country || ""].join("|");
        if (keys.has(key)) continue;
        const hub = row.hub;
        const category = categoryFor(D, row, provider);
        const price = hub === "smm" ? row.rate * (1 + markup / 100) / 1000 : row.rate * (1 + markup / 100);
        const productId = ("imp_" + cleanId(provider.id) + "_" + cleanId(service) + (row.country ? "_" + cleanId(row.country) : "")).slice(0, 60);
        const required = hub === "games" ? ["player_id"] : ["email"];
        const auto = provider.kind === "smsactivate" || provider.config?.self_service === true;
        D.products.unshift({
          id: productId, c: category, ar: row.name, en: row.name, p: Math.max(0.000001, Math.round(price * 1000000) / 1000000),
          o: 0, d: 0, r: 5, t: 3, img: row.image || "", images: [], ptype: PTYPE[hub],
          smm_provider: provider.id, smm_service: service, smm_qty: 1,
          smm_input: provider.kind === "smsactivate" ? "none" : hub === "smm" ? "text" : "email",
          req: provider.kind === "smsactivate" ? [] : hub === "smm" ? ["url"] : required,
          ...(row.country ? { smm_country: row.country } : {}),
          ...(hub === "smm" ? { qmin: Math.max(1, row.min || 1), qmax: Math.max(0, row.max || 0) } : { qmin: 1, qmax: 1 }),
          auto
        });
        keys.add(key);
      }
    });
    toast(`أُضيفت ${chosen.length} خدمة إلى مسودة الكتالوج. لم تُنشر بعد.`);
    rows = rows.map((x) => x.selected ? { ...x, exists: true, selected: false } : x);
    draw();
  }

  function drawPreview() {
    const provider = providers.find((p) => p.id === selected);
    if (!rows.length) return mount(preview, h("div", { class: "empty" }, "اختر مزوّداً ثم اضغط جلب الخدمات للمعاينة."));
    const filtered = rows.filter((x) => !filter || (x.name + " " + x.category + " " + x.id).toLowerCase().includes(filter));
    const table = h("div", { class: "table-wrap" });
    const body = h("tbody");
    filtered.slice(0, 250).forEach((x) => {
      const check = h("input", { type: "checkbox", checked: x.selected, disabled: x.exists || !x.available || !(x.rate > 0), onchange: (e) => { x.selected = e.target.checked; drawPreview(); } });
      body.append(h("tr", null,
        h("td", null, check),
        h("td", null, h("b", null, x.name), h("small", { class: "sub mono" }, `#${x.id}`)),
        h("td", null, badge(HUB_LABEL[x.hub] || x.hub, "info")),
        h("td", { class: "mono" }, x.rate),
        h("td", null, x.exists ? badge("موجود", "mute") : !x.available ? badge("غير متاح", "warn") : !(x.rate > 0) ? badge("سعر غير صالح", "warn") : badge("جديد", "ok"))
      ));
    });
    mount(preview, h("div", null,
      h("div", { class: "toolbar" }, input({ type: "search", placeholder: "بحث في النتائج", value: filter, oninput: (e) => { filter = e.target.value.toLowerCase(); drawPreview(); } }),
        h("button", { class: "btn ghost sm", onclick: () => { filtered.forEach((x) => { if (!x.exists && x.available && x.rate > 0) x.selected = true; }); drawPreview(); } }, "تحديد الصالح في النتائج"),
        h("button", { class: "btn ghost sm", onclick: () => { rows.forEach((x) => x.selected = false); drawPreview(); } }, "إلغاء التحديد")),
      h("p", { class: "hint" }, `المزوّد: ${provider?.name || selected} · المعروض حتى 250 صفاً من ${filtered.length} · المحدد: ${rows.filter((x) => x.selected).length}`),
      h("div", { class: "scroll-x" }, h("table", { class: "table" }, h("thead", null, h("tr", null, ["", "الخدمة", "القسم", "سعر المزوّد", "الحالة"].map((x) => h("th", null, x)))), body))
    ));
  }

  function draw() {
    const opts = providers.map((p) => [p.id, `${p.name || p.id} · ${p.kind || "smm"}`]);
    mount(root,
      pageHeader("مركز استيراد الخدمات", "جلب الخدمات من كل مزوّد، معاينة تصنيفها وأسعارها، ثم إضافتها كمسودة قبل النشر.",
        h("button", { class: "btn primary", disabled: loading || !selected, onclick: fetchCatalog }, "جلب الخدمات")),
      h("div", { class: "card" },
        h("div", { class: "form-grid" }, field("المزوّد", sel(opts, selected, { onchange: (e) => { selected = e.target.value; rows = []; mount(status); drawPreview(); } })),
          field("هامش الربح %", input({ type: "number", min: 0, max: 500, value: markup, onchange: (e) => { markup = Math.max(0, Math.min(500, number(e.target.value, 30))); } }))),
        h("p", { class: "hint" }, "الجلب لا يغيّر قاعدة البيانات أو المتجر المنشور. الخدمات تُضاف إلى مسودة الكتالوج، وتحتاج مراجعة الأسعار والحقول ثم الضغط على «نشر»."),
        status),
      preview,
      h("div", { class: "page-actions" }, h("button", { class: "btn primary", disabled: !rows.some((x) => x.selected), onclick: saveSelected }, "إضافة المحدد إلى المسودة")),
      publishBar()
    );
    drawPreview();
  }

  draw();
  await loadProviders();
}
