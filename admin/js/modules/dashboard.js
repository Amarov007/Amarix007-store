import { select, rpc } from "../core/http.js";
import { h, mount, statCard, pageHeader, badge, icon, empty } from "../core/ui.js";
import { money, ago, fmtDay, num } from "../core/utils.js";
import { ORDER_STATUSES } from "../core/config.js";

const label = Object.fromEntries(ORDER_STATUSES);
const tone = { new: "info", processing: "warn", done: "ok", cancelled: "err" };

export default async function (view, { go }) {
  const [orders, tickets, topups, payq] = await Promise.allSettled([
    select("orders", "select=id,total,currency,status,payment_status,created_at,customer_name&order=created_at.desc&limit=500"),
    select("support_tickets", "select=id,status&status=eq.open&limit=200"),
    select("wallet_topups", "select=id,status&status=eq.pending&limit=200"),
    rpc("payment_review_queue", { p_status: "under_review", p_method: null, p_search: null, p_limit: 100, p_offset: 0 }),
  ]);
  const O = orders.value || [], today = new Date().setHours(0, 0, 0, 0), week = today - 6 * 864e5;
  const paid = O.filter((o) => o.payment_status === "paid" && o.status !== "cancelled");
  const sum = (a) => a.reduce((s, o) => s + num(o.total), 0);
  const todayPaid = paid.filter((o) => new Date(o.created_at) >= today);
  const days = Array.from({ length: 7 }, (_, i) => { const d = week + i * 864e5; return { d, v: sum(paid.filter((o) => { const t = +new Date(o.created_at); return t >= d && t < d + 864e5; })) }; });
  const max = Math.max(1, ...days.map((x) => x.v));
  const pending = (key, v) => (v.status === "fulfilled" && Array.isArray(v.value) ? v.value.length : null);

  mount(view,
    pageHeader("نظرة عامة", "ملخص نشاط المتجر الآن"),
    h("div", { class: "grid g4" },
      statCard({ label: "مبيعات اليوم", value: money(sum(todayPaid)), sub: `${todayPaid.length} طلب مدفوع`, ic: "chart" }),
      statCard({ label: "طلبات جديدة", value: O.filter((o) => o.status === "new").length, sub: "بانتظار المعالجة", ic: "orders", tone: "warn" }),
      statCard({ label: "قيد التنفيذ", value: O.filter((o) => o.status === "processing").length, ic: "activity" }),
      statCard({ label: "مبيعات 7 أيام", value: money(sum(paid.filter((o) => new Date(o.created_at) >= week))), ic: "wallet" })),
    h("div", { class: "grid g4" },
      queueCard("دفعات للمراجعة", pending("p", payq), "payments", "card", go),
      queueCard("شحن محافظ معلّق", pending("t", topups), "wallets", "wallet", go),
      queueCard("تذاكر مفتوحة", pending("k", tickets), "tickets", "ticket", go)),
    h("div", { class: "grid g2" },
      h("div", { class: "card" }, h("h3", null, "المبيعات — آخر 7 أيام"),
        h("div", { class: "bars" }, days.map((x) => h("div", { style: { height: `${Math.max(2, (x.v / max) * 100)}%` }, "data-tip": `${fmtDay(x.d)} · ${money(x.v)}` })))),
      h("div", { class: "card" }, h("h3", null, "آخر الطلبات"),
        O.length ? h("div", { class: "list" }, O.slice(0, 7).map((o) => h("div", null,
          h("span", null, o.customer_name || "—", h("small", { class: "sub" }, ago(o.created_at))),
          h("span", null, badge(label[o.status] || o.status, tone[o.status]), " ", h("b", { class: "mono" }, money(o.total, o.currency || "USD")))))) : empty("لا طلبات بعد", "orders"))));
}
function queueCard(title, n, to, ic, go) {
  return h("button", { class: "stat", style: { textAlign: "start", cursor: "pointer", font: "inherit", color: "inherit" }, onclick: () => go(to) },
    h("div", { class: "stat-ic" }, icon(ic, 20)), h("div", null, h("small", null, title), h("b", null, n == null ? "—" : n)));
}
