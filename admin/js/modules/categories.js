import { loadCatalog, data, edit, subscribe } from "../core/catalog.js";
import { publishBar, imageField } from "../core/forms.js";
import { h, mount, pageHeader, dataTable, badge, modal, toast, confirmBox, field, input, select as sel } from "../core/ui.js";
import { clone } from "../core/utils.js";

const TYPES = [["shop", "متجر عادي (سلة وشراء)"], ["boost", "خدمات زيادة (رابط الحساب)"], ["embed", "تضمين مواقع"], ["funded", "حسابات ممولة"], ["numbers", "أرقام"], ["hub", "قسم رئيسي (يجمع أقساماً)"]];
const ICONS = ["bank", "globe", "phone", "bot", "gift", "trend", "users", "box", "bolt", "shield", "spark", "cart", "heart", "hs"];

export default async function (view) {
  await loadCatalog();
  const box = h("div");
  const draw = () => mount(box, dataTable({ rows: data().categories, pageSize: 50, onRow: open, emptyText: "لا أقسام", columns: [
    { label: "القسم", render: (c) => [c.ar, h("small", { class: "sub mono" }, c.id)] }, { label: "النوع", render: (c) => badge((TYPES.find((t) => t[0] === c.ty) || [0, c.ty])[1], "info") },
    { label: "المنتجات", render: (c) => data().products.filter((p) => p.c === c.id).length }, { label: "فلاتر", render: (c) => (c.f || []).length },
    { label: "ترتيب", render: (c) => h("span", { class: "page-actions" }, h("button", { class: "btn ghost sm", onclick: () => move(c, -1) }, "▲"), h("button", { class: "btn ghost sm", onclick: () => move(c, 1) }, "▼")) }] }));
  const move = (c, dir) => edit((D) => { const i = D.categories.findIndex((x) => x.id === c.id), j = i + dir; if (j < 0 || j >= D.categories.length) return; [D.categories[i], D.categories[j]] = [D.categories[j], D.categories[i]]; });
  function open(existing) {
    const isNew = !existing, c = existing ? clone(existing) : { id: "", ty: "shop", i: "box", ar: "", en: "", da: "", de: "", f: [], embed_url: "", image_url: "" };
    const HUBS = [["", "غير مرتبط"], ["games", "الألعاب"], ["chat", "تطبيقات الدردشة"], ["apps", "التطبيقات والاشتراكات"], ["ai", "الذكاء الاصطناعي"], ["numbers", "أرقام التفعيل"], ["smm", "خدمات الرشق"]];
    const f = { id: input({ value: c.id, dir: "ltr", readOnly: !isNew }), ty: sel(TYPES, c.ty), hub: sel(HUBS, c.hub || ""), i: sel(ICONS.map((x) => [x, x]), c.i), ar: input({ value: c.ar }), en: input({ value: c.en, dir: "ltr" }), da: input({ value: c.da || "" }), de: input({ value: c.de || "", dir: "ltr" }), embed: input({ value: c.embed_url || "", dir: "ltr" }) };
    let image = c.image_url || ""; const filters = clone(c.f || []);
    const fbox = h("div"); const drawF = () => mount(fbox, filters.map((flt, i) => h("div", { class: "card", style: { marginBottom: "8px", padding: "12px" } },
      h("div", { class: "form-grid" }, field("اسم الفلتر (عربي)", input({ value: flt.ar, oninput: (e) => (flt.ar = e.target.value) })), field("Name (EN)", input({ value: flt.en, dir: "ltr", oninput: (e) => (flt.en = e.target.value) })), field("الخيارات (مفصولة بفاصلة)", input({ value: (flt.o || []).join("، "), oninput: (e) => (flt.o = e.target.value.split(/[,،]/).map((s) => s.trim()).filter(Boolean)) }))),
      h("button", { class: "btn danger sm", onclick: () => { filters.splice(i, 1); drawF(); } }, "حذف الفلتر"))));
    drawF();
    modal({ title: isNew ? "قسم جديد" : `قسم: ${c.ar}`, wide: true, actions: [
      !isNew && { label: "حذف", kind: "danger", onClick: async () => { const n = data().products.filter((p) => p.c === c.id).length; if (n) { toast(`لا يمكن الحذف: ${n} منتج في هذا القسم`, "err"); return false; } if (!(await confirmBox("حذف القسم؟", { danger: true }))) return false; edit((D) => { D.categories = D.categories.filter((x) => x.id !== c.id); }); } },
      { label: "إلغاء", kind: "ghost" },
      { label: "حفظ", kind: "primary", onClick: () => {
        const id = f.id.value.trim(); if (isNew && (!/^[a-z0-9_-]{2,30}$/.test(id) || data().categories.some((x) => x.id === id))) { toast("معرّف غير صالح أو مستخدم (a-z 0-9 _ -)", "err"); return false; }
        if (!f.ar.value.trim()) { toast("أدخل اسم القسم", "err"); return false; }
        const next = { ...c, id, ty: f.ty.value, hub: f.hub.value || undefined, i: f.i.value, ar: f.ar.value.trim(), en: f.en.value.trim(), da: f.da.value.trim(), de: f.de.value.trim(), embed_url: f.embed.value.trim(), image_url: image, f: filters.filter((x) => x.ar || x.en) };
        edit((D) => { const i = D.categories.findIndex((x) => x.id === c.id); i >= 0 && !isNew ? (D.categories[i] = next) : D.categories.push(next); }); toast("حُفظ مؤقتاً — انشر لتطبيقه"); } }].filter(Boolean),
      body: h("div", null, h("div", { class: "form-grid" }, field("المعرّف", f.id), field("النوع", f.ty), field("القسم الرئيسي (Hub)", f.hub, "اربط القسم الفرعي بالألعاب أو الدردشة أو التطبيقات أو الذكاء الاصطناعي أو الأرقام"), field("الأيقونة", f.i), field("الاسم (عربي)", f.ar), field("Name (EN)", f.en), field("وصف (عربي)", f.da), field("Description (EN)", f.de), field("رابط التضمين (لنوع embed)", f.embed)),
        imageField("صورة القسم", image, (v) => (image = v)), h("h3", { style: { margin: "6px 0 8px" } }, "الفلاتر"), fbox, h("button", { class: "btn sm", onclick: () => { filters.push({ ar: "", en: "", o: [] }); drawF(); } }, "+ فلتر")) });
  }
  mount(view, pageHeader("الأقسام", "ترتيب الأقسام وفلاترها", h("button", { class: "btn primary", onclick: () => open() }, "+ قسم")), box, publishBar());
  draw(); const off = subscribe(() => (view.isConnected ? draw() : off()));
}
