import { select, rpc, enc } from "../core/http.js";
import { h, mount, pageHeader, dataTable, badge, modal, toast, fail, promptBox, confirmBox, field, input, spinner, errorState, statCard, withBusy } from "../core/ui.js";
import { money, fmtDate, num } from "../core/utils.js";

const tone = { pending: "warn", review: "info", approved: "ok", rejected: "err" };
const who = (r) => [r.profiles?.full_name || "—", h("small", { class: "sub mono" }, r.profiles?.email || "")];

export default async function (view) {
  const body = h("div", { class: "view" });
  mount(view, pageHeader("المحافظ", "طلبات الشحن وأرصدة العملاء والحركات", h("button", { class: "btn", onclick: load }, "تحديث")), body);

  async function load() {
    mount(body, spinner());
    try {
      const [tops, bals, tx] = await Promise.all([
        select("wallet_topups", "select=*,profiles(email,full_name)&order=id.desc&limit=100"),
        select("wallets", "select=user_id,section,balance,updated_at,profiles(email,full_name)&order=updated_at.desc&limit=200"),
        select("wallet_transactions", "select=*,profiles(email,full_name)&order=id.desc&limit=40"),
      ]);
      const pend = tops.filter((t) => t.status === "pending" || t.status === "review");
      mount(body,
        h("div", { class: "grid g4" }, statCard({ label: "طلبات شحن معلّقة", value: pend.length, ic: "wallet", tone: pend.length ? "warn" : "" }),
          statCard({ label: "إجمالي الأرصدة", value: money(bals.reduce((s, b) => s + num(b.balance), 0)), ic: "card" })),
        h("h3", null, "طلبات الشحن"),
        dataTable({ rows: tops, emptyText: "لا طلبات شحن", columns: [
          { label: "#", render: (t) => t.id }, { label: "العميل", render: who },
          { label: "المبلغ", render: (t) => h("b", { class: "mono" }, money(t.amount)) },
          { label: "الوسيلة", render: (t) => [t.payment_method || "—", t.payment_proof && h("small", { class: "sub mono" }, String(t.payment_proof).slice(0, 24))] },
          { label: "الحالة", render: (t) => badge(t.status, tone[t.status]) }, { label: "التاريخ", render: (t) => h("span", { class: "muted" }, fmtDate(t.created_at)) },
          { label: "", render: (t) => (t.status === "pending" || t.status === "review") && h("div", { class: "page-actions" },
            h("button", { class: "btn primary sm", onclick: (e) => approve(t, e.target) }, "اعتماد"), h("button", { class: "btn danger sm", onclick: () => reject(t) }, "رفض")) }] }),
        h("div", { class: "card" }, h("h3", null, "تعديل رصيد يدوي"), adjustForm()),
        h("h3", null, "الأرصدة"), dataTable({ rows: bals, pageSize: 10, columns: [{ label: "العميل", render: who }, { label: "القسم", render: (b) => b.section }, { label: "الرصيد", render: (b) => h("b", { class: "mono" }, money(b.balance)) }, { label: "آخر تحديث", render: (b) => h("span", { class: "muted" }, fmtDate(b.updated_at)) }] }),
        h("h3", null, "آخر الحركات"), dataTable({ rows: tx, pageSize: 10, columns: [{ label: "العميل", render: who }, { label: "النوع", render: (x) => x.kind || x.type || "—" }, { label: "المبلغ", render: (x) => h("b", { class: "mono" }, money(x.amount)) }, { label: "ملاحظة", render: (x) => x.note || "—" }, { label: "التاريخ", render: (x) => h("span", { class: "muted" }, fmtDate(x.created_at)) }] }));
    } catch (e) { mount(body, errorState(/404/.test(e.status) ? new Error("جداول المحفظة غير موجودة — شغّل supabase-wallet.sql") : e, load)); }
  }
  async function approve(t, btn) {
    const v = await promptBox("المبلغ المراد إضافته (USD)", { title: "اعتماد الشحن", value: String(t.amount) });
    if (v == null) return; const amt = Number(v);
    if (!(amt > 0)) return toast("مبلغ غير صالح", "err");
    if (!(await confirmBox(`إضافة ${money(amt)} إلى ${t.profiles?.email}؟`, { okLabel: "اعتماد" }))) return;
    try { await rpc("wallet_topup_approve", { p_id: t.id, p_amount: amt }); toast("تمت إضافة الرصيد"); load(); } catch (e) { fail(e); }
  }
  async function reject(t) {
    const note = await promptBox("سبب الرفض", { title: "رفض الشحن", okLabel: "رفض" }); if (note == null) return;
    try { await rpc("wallet_topup_reject", { p_id: t.id, p_note: note }); toast("تم الرفض"); load(); } catch (e) { fail(e); }
  }
  function adjustForm() {
    const em = input({ type: "email", dir: "ltr", placeholder: "بريد العميل" }), am = input({ type: "number", step: "0.01", placeholder: "المبلغ (سالب للخصم)" }), nt = input({ placeholder: "ملاحظة" });
    const btn = h("button", { class: "btn primary", onclick: () => withBusy(btn, async () => {
      try {
        const u = await select("profiles", `select=id,email&email=ilike.${enc(em.value.trim())}&limit=1`);
        if (!u.length) return toast("لا يوجد مستخدم بهذا البريد", "err");
        const a = Number(am.value); if (!a) return toast("أدخل مبلغاً", "err");
        if (!(await confirmBox(`${a > 0 ? "إضافة" : "خصم"} ${money(Math.abs(a))} ${a > 0 ? "إلى" : "من"} ${u[0].email}؟`, { danger: a < 0 }))) return;
        await rpc("wallet_admin_adjust", { p_user: u[0].id, p_section: "smm", p_amount: a, p_note: nt.value || null });
        toast("تم التعديل"); load();
      } catch (e) { fail(e); }
    }) }, "تنفيذ");
    return h("div", { class: "form-grid" }, field("البريد", em), field("المبلغ", am), field("ملاحظة", nt), h("div", { style: { alignSelf: "end", marginBottom: "12px" } }, btn));
  }
  await load();
}
