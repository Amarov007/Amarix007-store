import { loadCatalog, data, edit, subscribe } from "../core/catalog.js";
import { publishBar } from "../core/forms.js";
import { h, mount, pageHeader, dataTable, badge, modal, toast, confirmBox, field, input, switchEl } from "../core/ui.js";
import { num } from "../core/utils.js";

export default async function (view) {
  await loadCatalog(); const box = h("div");
  const draw = () => mount(box, dataTable({ rows: Object.entries(data().coupons), onRow: ([c, v]) => open(c, v), emptyText: "لا كوبونات", columns: [
    { label: "الكود", render: ([c]) => h("b", { class: "mono" }, c) }, { label: "نسبة %", render: ([, v]) => `${num(v[0])}%` }, { label: "مبلغ ثابت", render: ([, v]) => num(v[1]) },
    { label: "الظهور", render: ([, v]) => badge(num(v[2]) ? "عرض عام" : "سرّي", num(v[2]) ? "ok" : "mute") }] }));
  function open(code, v = [0, 0, 0]) {
    const isNew = !code, cd = input({ value: code || "", dir: "ltr", style: { textTransform: "uppercase" } }), pct = input({ type: "number", step: "any", min: 0, max: 100, value: num(v[0]) }), fx = input({ type: "number", step: "any", min: 0, value: num(v[1]) }); let pub = !!num(v[2]);
    modal({ title: isNew ? "كوبون جديد" : `كوبون ${code}`, actions: [
      !isNew && { label: "حذف", kind: "danger", onClick: async () => { if (!(await confirmBox(`حذف ${code}؟`, { danger: true }))) return false; edit((D) => { delete D.coupons[code]; }); } }, { label: "إلغاء", kind: "ghost" },
      { label: "حفظ", kind: "primary", onClick: () => {
        const nc = cd.value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, ""); if (!nc) { toast("كود غير صالح (A-Z 0-9 _ -)", "err"); return false; }
        if (nc !== code && data().coupons[nc]) { toast("الكود موجود مسبقاً", "err"); return false; }
        edit((D) => { if (code && nc !== code) { const r = {}; for (const [k, x] of Object.entries(D.coupons)) r[k === code ? nc : k] = x; D.coupons = r; } D.coupons[nc] = [Math.min(100, Math.max(0, num(pct.value))), Math.max(0, num(fx.value)), pub ? 1 : 0]; }); toast("حُفظ مؤقتاً — انشر لتطبيقه"); } }].filter(Boolean),
      body: h("div", null, field("الكود", cd), field("نسبة الخصم %", pct), field("مبلغ ثابت (USDT)", fx), switchEl(pub, (x) => (pub = x), "يظهر للجميع كعرض (غير ذلك يبقى سرياً ويُتحقق منه من الخادم)")) });
  }
  mount(view, pageHeader("الكوبونات", "الخصم الكلي لا يتجاوز مجموع السلة.", h("button", { class: "btn primary", onclick: () => open() }, "+ كوبون")), box, publishBar());
  draw(); const off = subscribe(() => (view.isConnected ? draw() : off()));
}
