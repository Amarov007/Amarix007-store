import { loadCatalog, data, edit, subscribe } from "../core/catalog.js";
import { publishBar, imageField } from "../core/forms.js";
import { h, mount, pageHeader, dataTable, modal, toast, confirmBox, field, input } from "../core/ui.js";

export default async function (view) {
  await loadCatalog(); const box = h("div");
  const draw = () => mount(box, dataTable({ rows: data().banners, onRow: open, emptyText: "لا بانرات", columns: [
    { label: "الصورة", render: (b) => (b.img ? h("img", { src: b.img, alt: "", height: 40, loading: "lazy", style: { borderRadius: "6px", maxWidth: "110px", objectFit: "cover" } }) : "—") },
    { label: "العنوان", render: (b) => [b.ar, h("small", { class: "sub" }, b.sa)] }, { label: "الرابط", render: (b) => h("span", { class: "mono" }, b.h || "—") },
    { label: "ترتيب", render: (b) => h("span", { class: "page-actions" }, h("button", { class: "btn ghost sm", onclick: () => move(b, -1) }, "▲"), h("button", { class: "btn ghost sm", onclick: () => move(b, 1) }, "▼")) }] }));
  const move = (b, d) => edit((D) => { const i = D.banners.indexOf(b), j = i + d; if (j < 0 || j >= D.banners.length) return; [D.banners[i], D.banners[j]] = [D.banners[j], D.banners[i]]; });
  function open(b) {
    const isNew = !b, v = b ? { ...b } : { ar: "", en: "", sa: "", se: "", h: "#/", img: "" };
    const f = Object.fromEntries(["ar", "en", "sa", "se", "h"].map((k) => [k, input({ value: v[k] || "", dir: k === "en" || k === "se" || k === "h" ? "ltr" : undefined })])); let img = v.img || "";
    modal({ title: isNew ? "بانر جديد" : "تعديل بانر", wide: true, actions: [
      !isNew && { label: "حذف", kind: "danger", onClick: async () => { if (!(await confirmBox("حذف البانر؟", { danger: true }))) return false; edit((D) => { D.banners = D.banners.filter((x) => x !== b); }); } }, { label: "إلغاء", kind: "ghost" },
      { label: "حفظ", kind: "primary", onClick: () => { const next = { ...v, ...Object.fromEntries(Object.entries(f).map(([k, i]) => [k, i.value.trim()])), img }; edit((D) => { const i = D.banners.indexOf(b); i >= 0 ? (D.banners[i] = next) : D.banners.push(next); }); toast("حُفظ مؤقتاً — انشر لتطبيقه"); } }].filter(Boolean),
      body: h("div", null, h("div", { class: "form-grid" }, field("العنوان (عربي)", f.ar), field("Title (EN)", f.en), field("عنوان فرعي (عربي)", f.sa), field("Subtitle (EN)", f.se), field("الرابط (#/…)", f.h)), imageField("صورة البانر", img, (x) => (img = x), 1600)) });
  }
  mount(view, pageHeader("البانرات", "صور واجهة المتجر والحملات", h("button", { class: "btn primary", onclick: () => open() }, "+ بانر")), box, publishBar());
  draw(); const off = subscribe(() => (view.isConnected ? draw() : off()));
}
