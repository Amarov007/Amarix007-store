import { select } from "../core/http.js";
import { h, mount, pageHeader, toolbar, select as sel, dataTable, badge, spinner, errorState } from "../core/ui.js";
import { fmtDate } from "../core/utils.js";

const L = { order_status: "تغيير حالة طلب", order_paid: "تأكيد دفع طلب", order_payment: "تغيير حالة دفع", order_delivery: "تحديث تسليم طلب", ticket_reply: "رد على تذكرة", ticket_status: "تغيير حالة تذكرة", product_add: "إضافة منتج", product_edit: "تعديل منتج", product_price: "تغيير سعر/خصم", product_remove: "حذف منتج", smm_send: "إرسال للرشق", staff_added: "إضافة موظف", staff_updated: "تعديل موظف", staff_removed: "حذف موظف" };
const detail = (x) => { const d = x.details ?? x.detail ?? x.meta; return d == null ? "" : typeof d === "string" ? d : JSON.stringify(d); };

export default async function (view) {
  let rows = [], who = "", act = ""; const box = h("div"), bar = h("div");
  const draw = () => mount(box, dataTable({ rows: rows.filter((x) => (!who || x.actor_email === who) && (!act || x.action === act)), emptyText: "لا سجلات", columns: [
    { label: "الوقت", render: (x) => h("span", { class: "muted" }, fmtDate(x.at)) }, { label: "المنفّذ", render: (x) => [h("span", { class: "mono" }, x.actor_email || "—"), x.actor_kind === "admin" && badge("مدير", "info")] },
    { label: "الإجراء", render: (x) => L[x.action] || x.action }, { label: "الهدف", render: (x) => h("span", { class: "mono" }, x.target || "") }, { label: "التفاصيل", render: (x) => h("small", { class: "muted" }, detail(x).slice(0, 120)) }] }));
  mount(view, pageHeader("سجل النشاط", "يُسجَّل تلقائياً من قاعدة البيانات ولا يمكن للموظف تعطيله (يُحذف ما يزيد عن 180 يوماً)."), bar, box);
  mount(box, spinner());
  try {
    rows = await select("staff_activity", "select=*&order=at.desc&limit=300");
    const emails = [...new Set(rows.map((x) => x.actor_email).filter(Boolean))], acts = [...new Set(rows.map((x) => x.action))];
    mount(bar, toolbar(sel([["", "كل المنفّذين"], ...emails.map((e) => [e, e])], "", { style: { width: "auto" }, onchange: (e) => { who = e.target.value; draw(); } }), sel([["", "كل الإجراءات"], ...acts.map((a) => [a, L[a] || a])], "", { style: { width: "auto" }, onchange: (e) => { act = e.target.value; draw(); } })));
    draw();
  } catch (e) { mount(box, errorState(new Error("فشل التحميل — هذا السجل للمدير فقط"))); }
}
