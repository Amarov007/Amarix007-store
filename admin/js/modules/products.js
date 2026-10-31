import { loadCatalog, data, edit, subscribe } from "../core/catalog.js";
import { publishBar, imageField } from "../core/forms.js";
import { h, mount, pageHeader, toolbar, searchBox, select as sel, dataTable, badge, modal, toast, confirmBox, field, input, spinner } from "../core/ui.js";
import { money, num } from "../core/utils.js";

const DELIV = [[0, "رابط مستودع / منصة"], [1, "بيانات حساب / اعتماد"], [2, "ملف تنفيذي / سورس"], [3, "تنفيذ على رابط حساب العميل"]];
const slug = () => "p_" + Math.random().toString(36).slice(2, 9);

export default async function (view) {
  await loadCatalog();
  let q = "", cat = "";
  const box = h("div");
  const draw = () => {
    const D = data(), cats = Object.fromEntries(D.categories.map((c) => [c.id, c.ar]));
    const rows = D.products.filter((p) => (!cat || p.c === cat) && (!q || [p.ar, p.en, p.id, p.tg].some((x) => String(x || "").toLowerCase().includes(q))));
    mount(box, dataTable({ rows, pageSize: 30, onRow: open, emptyText: "لا منتجات", columns: [
      { label: "المنتج", render: (p) => [h("div", { style: { display: "flex", gap: "10px", alignItems: "center" } }, p.img ? h("img", { src: p.img, alt: "", width: 38, height: 38, loading: "lazy", style: { objectFit: "cover", borderRadius: "8px" } }) : null, h("div", null, p.ar || p.en, h("small", { class: "sub mono" }, p.id)))] },
      { label: "القسم", render: (p) => badge(cats[p.c] || p.c || "—", "info") },
      { label: "السعر", render: (p) => [h("b", { class: "mono" }, money(p.p)), num(p.o) > 0 && h("small", { class: "sub" }, `قبل: ${money(p.o)}`)] },
      { label: "خصم", render: (p) => (num(p.d) ? `${p.d}%` : "—") }, { label: "تقييم", render: (p) => (p.r ? `★ ${p.r}` : "—") }] }));
  };
  function open(existing) {
    const D = data(), isNew = !existing, p = existing ? { ...existing } : { id: slug(), c: D.categories[0]?.id || "", ar: "", en: "", p: 0, o: 0, d: 0, r: 5, n: 0, bs: 0, t: 0, tg: "", sp: "", img: "", images: [] };
    const f = { ar: input({ value: p.ar }), en: input({ value: p.en, dir: "ltr" }), c: sel(D.categories.map((c) => [c.id, c.ar]), p.c), p: input({ type: "number", step: "any", min: 0, value: p.p }), o: input({ type: "number", step: "any", min: 0, value: p.o || 0 }), d: input({ type: "number", min: 0, max: 100, value: p.d || 0 }), t: sel(DELIV, p.t ?? 0),
      tg: input({ value: p.tg || "" }), sp: input({ value: p.sp || "" }), id: input({ value: p.id, dir: "ltr", readOnly: !isNew }), imgs: h("textarea", { class: "input mono", rows: 3, placeholder: "رابط صورة في كل سطر", value: (p.images || []).join("\n") }) };
    let img = p.img || "";
    modal({ title: isNew ? "منتج جديد" : "تعديل منتج", wide: true, actions: [
      !isNew && { label: "حذف", kind: "danger", onClick: async () => { if (!(await confirmBox(`حذف «${p.ar || p.id}»؟ (لن يُنشر قبل الضغط على «نشر»)`, { danger: true }))) return false; edit((D) => { D.products = D.products.filter((x) => String(x.id) !== String(p.id)); }); toast("حُذف مؤقتاً — انشر لتأكيد الحذف"); } },
      { label: "إلغاء", kind: "ghost" },
      { label: "حفظ", kind: "primary", onClick: () => {
        if (!f.ar.value.trim() && !f.en.value.trim()) { toast("أدخل اسم المنتج", "err"); return false; }
        const id = f.id.value.trim(); if (isNew && (!/^[A-Za-z0-9_-]{2,60}$/.test(id) || D.products.some((x) => String(x.id) === id))) { toast("معرّف غير صالح أو مستخدم", "err"); return false; }
        const next = { ...p, id, c: f.c.value, ar: f.ar.value.trim(), en: f.en.value.trim(), p: num(f.p.value), o: num(f.o.value), d: num(f.d.value), t: Number(f.t.value), tg: f.tg.value.trim(), sp: f.sp.value.trim(), img, images: f.imgs.value.split("\n").map((s) => s.trim()).filter(Boolean) };
        edit((D) => { const i = D.products.findIndex((x) => String(x.id) === String(p.id)); if (i >= 0 && !isNew) D.products[i] = next; else D.products.unshift(next); });
        toast("حُفظ مؤقتاً — اضغط «نشر» ليظهر للزوار"); } }].filter(Boolean),
      body: h("div", null, h("div", { class: "form-grid" }, field("الاسم (عربي)", f.ar), field("الاسم (EN)", f.en), field("القسم", f.c), field("المعرّف", f.id), field("السعر (USDT)", f.p), field("السعر القديم", f.o), field("خصم %", f.d), field("نوع التسليم", f.t), field("وسوم البحث", f.tg), field("وصف مختصر", f.sp)),
        imageField("الصورة الرئيسية", img, (v) => (img = v)), field("صور إضافية", f.imgs)) });
  }
  const D0 = data();
  mount(view, pageHeader("المنتجات", `${D0.products.length} منتج — التعديلات تُنشر عند الضغط على «نشر»`, h("button", { class: "btn primary", onclick: () => open() }, "+ منتج")),
    toolbar(searchBox((v) => { q = v; draw(); }, "اسم أو معرّف أو وسم"), sel([["", "كل الأقسام"], ...D0.categories.map((c) => [c.id, c.ar])], "", { style: { width: "auto" }, onchange: (e) => { cat = e.target.value; draw(); } })), box, publishBar());
  draw();
  const off = subscribe(() => (view.isConnected ? draw() : off()));
}
