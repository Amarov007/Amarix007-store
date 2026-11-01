import { rpc } from "../core/http.js";
import { h, mount, pageHeader, toolbar, searchBox, dataTable, badge, modal, fail, spinner, errorState } from "../core/ui.js";
import { money, fmtDate, debounce } from "../core/utils.js";

const tone = { paid: "ok", issued: "info", void: "err", refunded: "warn" };
export default async function (view) {
  const box = h("div");
  const load = async (q = "") => {
    mount(box, spinner());
    try {
      const rows = await rpc("admin_invoices", { p_q: q, p_limit: 100 });
      mount(box, dataTable({ rows: rows || [], emptyText: "لا فواتير", onRow: show, columns: [
        { label: "الفاتورة", render: (x) => h("span", { class: "mono" }, x.invoice_no) },
        { label: "الطلب", render: (x) => h("span", { class: "mono" }, String(x.order_id || "").slice(0, 12)) },
        { label: "العميل", render: (x) => x.customer_name || "—" },
        { label: "الإجمالي", render: (x) => h("b", { class: "mono" }, money(x.total, x.currency || "USD")) },
        { label: "الحالة", render: (x) => badge(x.status || "—", tone[x.status]) },
        { label: "التاريخ", render: (x) => h("span", { class: "muted" }, fmtDate(x.created_at || x.issued_at)) }] }));
    } catch (e) { mount(box, errorState(e, () => load(q))); }
  };
  async function show(x) {
    try {
      const inv = await rpc("get_invoice", { p_order_id: x.order_id });
      modal({ title: `فاتورة ${x.invoice_no}`, wide: true, actions: [{ label: "طباعة", kind: "primary", stay: true, onClick: () => { window.print(); return false; } }, { label: "إغلاق", kind: "ghost" }],
        body: h("pre", { class: "mono", style: { whiteSpace: "pre-wrap", margin: 0 } }, JSON.stringify(inv, null, 2)) });
    } catch (e) { fail(e, "تعذّر فتح الفاتورة"); }
  }
  mount(view, pageHeader("الفواتير", "الفواتير الصادرة للطلبات"), toolbar(searchBox(debounce((v) => load(v), 350), "رقم الفاتورة أو الطلب")), box);
  await load();
}
