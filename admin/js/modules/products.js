import { loadCatalog, data, edit, subscribe } from "../core/catalog.js";
import { publishBar, imageField } from "../core/forms.js";
import { h, mount, pageHeader, toolbar, searchBox, select as sel, dataTable, badge, modal, toast, confirmBox, field, input, spinner, switchEl } from "../core/ui.js";
import { money, num } from "../core/utils.js";
import { getGameArtwork } from "../core/game-art.js";

const DELIV = [[0, "رابط مستودع / منصة"], [1, "بيانات حساب / اعتماد"], [2, "ملف تنفيذي / سورس"], [3, "تنفيذ على رابط حساب العميل"]];
const PTYPES = [["", "غير محدد"], ["smm", "رشق وخدمات زيادة"], ["game_topup", "شحن ألعاب"], ["app_subscription", "تطبيق واشتراك"], ["gift_card", "بطاقة / كود"]];
const INPUTS = [["", "تلقائي حسب نوع الخدمة"], ["text", "نص"], ["none", "بدون إدخال"], ["url", "رابط"], ["quantity", "كمية"], ["player_id", "Player ID"], ["email", "البريد الإلكتروني"], ["phone", "رقم الهاتف"]];
const slug = () => "p_" + Math.random().toString(36).slice(2, 9);

export default async function (view) {
  await loadCatalog();
  let q = "", cat = "", provider = "";
  const box = h("div");
  const toolbarContainer = h("div");

  const drawToolbar = () => {
    const D = data();
    const providersList = [...new Set(D.products.map((p) => String(p.smm_provider || "").trim()).filter(Boolean))].sort();
    const provCount = provider ? D.products.filter((p) => String(p.smm_provider || "").toLowerCase() === provider.toLowerCase()).length : 0;

    mount(toolbarContainer,
      toolbar(
        searchBox((v) => { q = v; draw(); }, "اسم أو معرّف أو مزوّد أو رقم خدمة"),
        sel([["", "كل الأقسام"], ...D.categories.map((c) => [c.id, c.ar])], cat, { style: { width: "auto" }, onchange: (e) => { cat = e.target.value; draw(); } }),
        sel([["", "كل المزوّدين"], ...providersList.map((pv) => [pv, `المزوّد: ${pv}`])], provider, { style: { width: "auto" }, onchange: (e) => { provider = e.target.value; draw(); drawToolbar(); } }),
        provider ? h("button", {
          class: "btn danger sm",
          onclick: async () => {
            const count = D.products.filter((p) => String(p.smm_provider || "").toLowerCase() === provider.toLowerCase()).length;
            if (!count) return toast("لا توجد منتجات لهذا المزوّد", "err");
            if (!(await confirmBox(`هل تريد حذف جميع منتجات المزوّد «${provider}» البالغ عددها ${count} منتجاً؟\n(لن يُطبّق الحذف نهائياً قبل الضغط على زر «نشر» بالأعلى)`, { danger: true, okLabel: `حذف ${count} منتج` }))) return;
            edit((draft) => {
              draft.products = draft.products.filter((p) => String(p.smm_provider || "").toLowerCase() !== provider.toLowerCase());
            });
            toast(`تم حذف ${count} منتج للمزوّد «${provider}». اضغط «نشر» لتطبيق التغيير.`);
            provider = "";
            draw();
            drawToolbar();
          }
        }, `حذف كل منتجات «${provider}» (${provCount})`) : null
      )
    );
  };

  const draw = () => {
    const D = data(), cats = Object.fromEntries(D.categories.map((c) => [c.id, c.ar]));
    const rows = D.products.filter((p) => (!cat || p.c === cat) && (!provider || String(p.smm_provider || "").toLowerCase() === provider.toLowerCase()) && (!q || [p.ar, p.en, p.id, p.tg, p.smm_provider, p.smm_service, p.ptype, p.smm_country].some((x) => String(x || "").toLowerCase().includes(q))));
    mount(box, dataTable({ rows, pageSize: 30, onRow: open, emptyText: "لا منتجات", columns: [
      { label: "المنتج", render: (p) => {
        const fb = getGameArtwork(p.ar || p.en, p.c);
        const src = (p.img && !p.img.startsWith("/assets/")) ? p.img : fb;
        const imgEl = src ? h("img", {
          src,
          alt: "",
          width: 38,
          height: 38,
          loading: "lazy",
          referrerPolicy: "no-referrer",
          crossOrigin: "anonymous",
          style: { objectFit: "contain", borderRadius: "8px", background: "rgba(255,255,255,0.06)", flex: "none", border: "1px solid rgba(255,255,255,0.1)" },
          onerror: (e) => { if (fb && e.target.src !== fb) e.target.src = fb; }
        }) : null;
        return [h("div", { style: { display: "flex", gap: "10px", alignItems: "center" } }, imgEl, h("div", null, p.ar || p.en, h("small", { class: "sub mono" }, p.id)))];
      } },
      { label: "القسم", render: (p) => badge(cats[p.c] || p.c || "—", "info") },
      { label: "المسار", render: (p) => badge(p.ptype || (p.smm_service ? "مزود" : "يدوي"), "info") },
      { label: "المزوّد / الخدمة", render: (p) => [h("span", { class: "mono" }, p.smm_provider || "—"), h("small", { class: "sub mono" }, p.smm_service || "—")] },
      { label: "السعر", render: (p) => [h("b", { class: "mono" }, money(p.p)), num(p.o) > 0 && h("small", { class: "sub" }, `قبل: ${money(p.o)}`)] },
      { label: "خصم", render: (p) => (num(p.d) ? `${p.d}%` : "—") }, { label: "تقييم", render: (p) => (p.r ? `★ ${p.r}` : "—") }] }));
  };
  function open(existing) {
    const D = data(), isNew = !existing, p = existing ? { ...existing } : { id: slug(), c: D.categories[0]?.id || "", ar: "", en: "", p: 0, o: 0, d: 0, r: 5, n: 0, bs: 0, t: 0, tg: "", sp: "", img: "", images: [] };
    const f = { ar: input({ value: p.ar }), en: input({ value: p.en, dir: "ltr" }), c: sel(D.categories.map((c) => [c.id, c.ar]), p.c), p: input({ type: "number", step: "any", min: 0, value: p.p }), o: input({ type: "number", step: "any", min: 0, value: p.o || 0 }), d: input({ type: "number", min: 0, max: 100, value: p.d || 0 }), t: sel(DELIV, p.t ?? 0),
      tg: input({ value: p.tg || "" }), sp: input({ value: p.sp || "" }), id: input({ value: p.id, dir: "ltr", readOnly: !isNew }), imgs: h("textarea", { class: "input mono", rows: 3, placeholder: "رابط صورة في كل سطر", value: (p.images || []).join("\n") }),
      ptype: sel(PTYPES.some(([v]) => v === (p.ptype || "")) ? PTYPES : [...PTYPES, [p.ptype, `نوع محفوظ: ${p.ptype}`]], p.ptype || ""),
      provider: input({ value: p.smm_provider || "", dir: "ltr", placeholder: "main أو معرّف المزوّد" }),
      service: input({ value: p.smm_service || "", dir: "ltr" }),
      smmInput: sel(INPUTS, p.smm_input || ""),
      req: input({ value: Array.isArray(p.req) ? p.req.join(", ") : "", placeholder: "player_id, email, phone" }),
      country: input({ value: p.smm_country || "", dir: "ltr" }),
      qmin: input({ type: "number", min: 0, value: p.qmin ?? 0 }),
      qmax: input({ type: "number", min: 0, value: p.qmax ?? 0 }),
      qty: input({ type: "number", min: 0, value: p.smm_qty ?? 0 }) };
    let auto = p.auto !== false;
    let img = p.img || "";
    modal({ title: isNew ? "منتج جديد" : "تعديل منتج", wide: true, actions: [
      !isNew && { label: "حذف", kind: "danger", onClick: async () => { if (!(await confirmBox(`حذف «${p.ar || p.id}»؟ (لن يُنشر قبل الضغط على «نشر»)`, { danger: true }))) return false; edit((D) => { D.products = D.products.filter((x) => String(x.id) !== String(p.id)); }); toast("حُذف مؤقتاً — انشر لتأكيد الحذف"); } },
      { label: "إلغاء", kind: "ghost" },
      { label: "حفظ", kind: "primary", onClick: () => {
        if (!f.ar.value.trim() && !f.en.value.trim()) { toast("أدخل اسم المنتج", "err"); return false; }
        const id = f.id.value.trim(); if (isNew && (!/^[A-Za-z0-9_-]{2,60}$/.test(id) || D.products.some((x) => String(x.id) === id))) { toast("معرّف غير صالح أو مستخدم", "err"); return false; }
        const next = { ...p, id, c: f.c.value, ar: f.ar.value.trim(), en: f.en.value.trim(), p: num(f.p.value), o: num(f.o.value), d: num(f.d.value), t: Number(f.t.value), tg: f.tg.value.trim(), sp: f.sp.value.trim(), img, images: f.imgs.value.split("\n").map((s) => s.trim()).filter(Boolean),
          ptype: f.ptype.value, smm_provider: f.provider.value.trim(), smm_service: f.service.value.trim(), smm_input: f.smmInput.value,
          req: f.req.value.split(/[,،]/).map((s) => s.trim()).filter(Boolean), smm_country: f.country.value.trim(),
          qmin: num(f.qmin.value), qmax: num(f.qmax.value), smm_qty: num(f.qty.value), auto };
        edit((D) => { const i = D.products.findIndex((x) => String(x.id) === String(p.id)); if (i >= 0 && !isNew) D.products[i] = next; else D.products.unshift(next); });
        toast("حُفظ مؤقتاً — اضغط «نشر» ليظهر للزوار"); } }].filter(Boolean),
      body: h("div", null, h("div", { class: "form-grid" }, field("الاسم (عربي)", f.ar), field("الاسم (EN)", f.en), field("القسم", f.c), field("المعرّف", f.id), field("السعر (USDT)", f.p), field("السعر القديم", f.o), field("خصم %", f.d), field("نوع التسليم", f.t), field("وسوم البحث", f.tg), field("وصف مختصر", f.sp)),
        h("h3", { style: { margin: "18px 0 8px" } }, "بيانات المزوّد وطريقة الطلب"),
        h("div", { class: "form-grid" }, field("نوع المنتج", f.ptype), field("معرّف المزوّد", f.provider), field("رقم الخدمة لدى المزوّد", f.service), field("نوع إدخال العميل", f.smmInput), field("الحقول المطلوبة (مفصولة بفاصلة)", f.req, "مثال: player_id أو email أو phone"), field("الدولة / رمز الدولة", f.country), field("الحد الأدنى للكمية", f.qmin), field("الحد الأعلى للكمية", f.qmax), field("وحدة كمية المزوّد", f.qty)),
        switchEl(auto, (v) => (auto = v), "تفعيل التنفيذ الآلي لهذا المنتج"),
        imageField("الصورة الرئيسية", img, (v) => (img = v)), field("صور إضافية", f.imgs)) });
  }
  const D0 = data();
  mount(view, pageHeader("المنتجات", `${D0.products.length} منتج — التعديلات تُنشر عند الضغط على «نشر»`, h("button", { class: "btn primary", onclick: () => open() }, "+ منتج")),
    toolbarContainer, box, publishBar());
  drawToolbar();
  draw();
  const off = subscribe(() => {
    if (view.isConnected) {
      drawToolbar();
      draw();
    } else {
      off();
    }
  });
}
