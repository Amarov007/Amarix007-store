import { rpc } from "../core/http.js";
import { h, mount, pageHeader, statCard, select as sel, spinner, errorState, empty } from "../core/ui.js";
import { money, num } from "../core/utils.js";

export default async function (view) {
  let days = 30; const body = h("div", { class: "view" });
  mount(view, pageHeader("التحليلات", "الإيرادات والتحويل", sel([[7, "7 أيام"], [30, "30 يوماً"], [90, "90 يوماً"]], days, { style: { width: "auto" }, onchange: (e) => { days = +e.target.value; load(); } })), body);
  async function load() {
    mount(body, spinner());
    try {
      const [a, b] = await Promise.all([rpc("admin_stats", { p_days: days }), rpc("admin_product_stats", { p_days: days }).catch(() => null)]);
      const by = a.by_day || [], mx = Math.max(1, ...by.map((x) => num(x.rev))), conv = b && b.views > 0 ? ((b.paid_orders * 100) / b.views).toFixed(1) + "%" : "—";
      mount(body,
        h("div", { class: "grid g4" }, statCard({ label: "الإيرادات المدفوعة", value: money(a.revenue), ic: "chart" }), statCard({ label: "طلبات مدفوعة / الكل", value: `${num(a.paid_orders)} / ${num(a.orders)}`, ic: "orders" }),
          statCard({ label: "مشاهدات المنتجات", value: b ? num(b.views).toLocaleString() : "—", ic: "search" }), statCard({ label: "معدل التحويل", value: conv, ic: "star" })),
        h("div", { class: "card" }, h("h3", null, "المبيعات اليومية"), by.length ? h("div", { class: "bars" }, by.map((x) => h("div", { style: { height: `${Math.max(2, (num(x.rev) / mx) * 100)}%` }, "data-tip": `${String(x.d).slice(5)} · ${money(x.rev)} · ${num(x.n)} طلب` }))) : empty("لا بيانات", "chart")),
        a.funnel && h("div", { class: "card" }, h("h3", null, "قمع التحويل"), h("div", { class: "list" }, Object.entries(a.funnel).map(([k, v]) => h("div", null, h("span", null, k), h("b", { class: "mono" }, String(v)))))));
    } catch (e) { mount(body, errorState(e, load)); }
  }
  await load();
}
