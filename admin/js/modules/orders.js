import { select, patch, enc } from "../core/http.js";
import { can } from "../core/rbac.js";
import { h, mount, pageHeader, toolbar, searchBox, select as sel, dataTable, badge, modal, toast, fail, confirmBox, spinner, errorState } from "../core/ui.js";
import { money, fmtDate, parseJSON, toCSV, download } from "../core/utils.js";
import { ORDER_STATUSES } from "../core/config.js";

const label = Object.fromEntries(ORDER_STATUSES);
const tone = { new: "info", processing: "warn", done: "ok", cancelled: "err" };
const payTone = { paid: "ok", pending: "warn", failed: "err", refunded: "info" };
const hasSmm = (o) => parseJSON(o.items).some((i) => i && (i.smm_service != null || i.provider));

export default async function (view) {
  let rows = [], q = "", fs = "", fp = "";
  const load = async () => {
    mount(box, spinner());
    try { rows = await select("orders", "select=*&order=created_at.desc&limit=500"); draw(); } catch (e) { mount(box, errorState(e, load)); }
  };
  const filtered = () => rows.filter((o) => (!fs || o.status === fs) && (!fp || (o.payment_status || "") === fp) &&
    (!q || [o.id, o.customer_name, o.customer_email, o.coupon].some((x) => String(x || "").toLowerCase().includes(q))));
  const box = h("div");
  const table = () => dataTable({
    rows: filtered(), emptyText: "لا طلبات مطابقة", onRow: open,
    columns: [
      { label: "الطلب", render: (o) => h("span", { class: "mono" }, String(o.id).slice(0, 12)) },
      { label: "العميل", render: (o) => [o.customer_name || "—", h("small", { class: "sub mono" }, o.customer_email || "")] },
      { label: "الإجمالي", render: (o) => h("b", { class: "mono" }, money(o.total, o.currency || "USD")) },
      { label: "الدفع", render: (o) => badge(o.payment_status || "—", payTone[o.payment_status]) },
      { label: "الحالة", render: (o) => badge(label[o.status] || o.status, tone[o.status]) },
      { label: "التاريخ", render: (o) => h("span", { class: "muted" }, fmtDate(o.created_at)) },
    ],
  });
  const draw = () => mount(box, table());

  async function setStatus(o, status) {
    if (status === "done" && hasSmm(o) && !/^(sent|completed)$/.test(String(o.smm_status || "")) &&
      !(await confirmBox("الطلب يحوي خدمات مزوّد ولم يُرسل بالكامل. تعليمه «مكتمل» رغم ذلك؟", { danger: true }))) return false;
    try { const r = await patch("orders", `id=eq.${enc(o.id)}`, { status }); Object.assign(o, r); toast(`تم التحديث: ${label[status]}`); draw(); }
    catch (e) { fail(e, "فشل تحديث الحالة"); return false; }
  }
  function open(o) {
    const items = parseJSON(o.items);
    const st = sel(ORDER_STATUSES, o.status, { disabled: !can("orders") });
    st.onchange = async () => { if ((await setStatus(o, st.value)) === false) st.value = o.status; };
    modal({ title: `طلب ${String(o.id).slice(0, 12)}`, wide: true, actions: [{ label: "إغلاق", kind: "ghost" }], body: h("div", null,
      h("dl", { class: "kv" },
        h("dt", null, "العميل"), h("dd", null, o.customer_name || "—", " · ", h("span", { class: "mono" }, o.customer_email || "")),
        h("dt", null, "الإجمالي"), h("dd", null, h("b", null, money(o.total, o.currency || "USD"))),
        h("dt", null, "الدفع"), h("dd", null, badge(o.payment_status || "—", payTone[o.payment_status])),
        h("dt", null, "الكوبون"), h("dd", null, o.coupon || "—"), h("dt", null, "الإحالة"), h("dd", null, o.affiliate_ref || "—"),
        h("dt", null, "حالة المزوّد"), h("dd", null, o.smm_status || "—"), h("dt", null, "التاريخ"), h("dd", null, fmtDate(o.created_at)),
        h("dt", null, "الحالة"), h("dd", null, st)),
      h("h3", { style: { margin: "18px 0 8px" } }, `البنود (${items.length})`),
      h("div", { class: "list" }, items.map((i) => h("div", null, h("span", null, i.name || i.ar || i.id, i.fields && h("small", { class: "sub mono" }, JSON.stringify(i.fields))), h("span", { class: "mono" }, `× ${i.qty || 1}`))))) });
  }
  const exportCsv = () => download("orders.csv", toCSV(filtered(), [
    { label: "id", get: (o) => o.id }, { label: "العميل", get: (o) => o.customer_name }, { label: "البريد", get: (o) => o.customer_email },
    { label: "الإجمالي", get: (o) => o.total }, { label: "العملة", get: (o) => o.currency }, { label: "الحالة", get: (o) => o.status }, { label: "الدفع", get: (o) => o.payment_status }, { label: "التاريخ", get: (o) => o.created_at }]), "text/csv");

  mount(view, pageHeader("الطلبات", "متابعة الطلبات وتغيير حالتها", h("button", { class: "btn", onclick: exportCsv }, "تصدير CSV"), h("button", { class: "btn", onclick: load }, "تحديث")),
    toolbar(searchBox((v) => { q = v; draw(); }, "بحث بالرقم أو الاسم أو البريد"),
      sel([["", "كل الحالات"], ...ORDER_STATUSES], "", { onchange: (e) => { fs = e.target.value; draw(); }, style: { width: "auto" } }),
      sel([["", "كل المدفوعات"], ["paid", "مدفوع"], ["pending", "معلّق"], ["failed", "فاشل"]], "", { onchange: (e) => { fp = e.target.value; draw(); }, style: { width: "auto" } })), box);
  await load();
}
