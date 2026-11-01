import { select, patch, insert, remove, enc } from "../core/http.js";
import { h, mount, pageHeader, dataTable, badge, modal, toast, fail, confirmBox, field, input, select as sel, spinner, errorState } from "../core/ui.js";
import { money, fmtDate, num } from "../core/utils.js";

const ST = [["pending", "قيد المراجعة"], ["approved", "معتمد"], ["rejected", "مرفوض"], ["none", "—"]], tone = { pending: "warn", approved: "ok", rejected: "err", none: "mute" };
const rank = { pending: 0, approved: 1, rejected: 2, none: 3 };

export default async function (view) {
  const body = h("div", { class: "view" });
  mount(view, pageHeader("الشركاء (Affiliate)", "طلبات الانضمام والعمولات وشرائح الأرباح"), body);
  async function load() {
    mount(body, spinner());
    try {
      const [aff, tiers] = await Promise.all([select("affiliates", "select=*,profiles(email)"), select("affiliate_tiers", "select=*&order=min_sales.asc").catch(() => [])]);
      const rows = aff.filter((x) => (x.status && x.status !== "none") || num(x.sales) > 0 || x.coupon).sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9));
      mount(body,
        dataTable({ rows, emptyText: "لا طلبات انضمام بعد", onRow: edit, columns: [
          { label: "الشريك", render: (a) => h("span", { class: "mono" }, a.profiles?.email || String(a.id).slice(0, 8)) },
          { label: "الحالة", render: (a) => badge(Object.fromEntries(ST)[a.status] || a.status, tone[a.status]) },
          { label: "النسبة", render: (a) => (a.rate != null ? `${a.rate}%` : "حسب الشرائح") }, { label: "الكوبون", render: (a) => h("span", { class: "mono" }, a.coupon || "—") },
          { label: "النقرات", render: (a) => num(a.clicks) }, { label: "المبيعات", render: (a) => num(a.sales) }, { label: "الانضمام", render: (a) => h("span", { class: "muted" }, fmtDate(a.applied_at)) }] }),
        h("div", { class: "toolbar" }, h("h3", { style: { margin: 0 } }, "شرائح العمولة"), h("button", { class: "btn sm", onclick: () => editTier() }, "+ شريحة")),
        dataTable({ rows: tiers, onRow: editTier, emptyText: "لا شرائح", columns: [{ label: "الاسم", render: (t) => t.label }, { label: "من الطلب رقم", render: (t) => t.min_sales }, { label: "العمولة %", render: (t) => `${t.rate}%` }] }),
        h("p", { class: "muted" }, "نسبة الشريك الخاصة تتغلب على الشرائح."));
    } catch (e) { mount(body, errorState(e, load)); }
  }
  function edit(a) {
    const st = sel(ST, a.status), rate = input({ type: "number", step: "0.1", min: 0, max: 100, value: a.rate ?? "" }), cp = input({ value: a.coupon || "", dir: "ltr" }), pay = input({ value: a.payout_id || "", dir: "ltr" });
    modal({ title: a.profiles?.email || "شريك", actions: [{ label: "إلغاء", kind: "ghost" }, { label: "حفظ", kind: "primary", onClick: async () => {
      const body = { status: st.value, rate: rate.value === "" ? null : Number(rate.value), coupon: cp.value.trim() || null, payout_id: pay.value.trim() || null };
      if (body.status === "approved" && !a.approved_at) body.approved_at = new Date().toISOString();
      try { await patch("affiliates", `id=eq.${enc(a.id)}`, body); toast("تم الحفظ"); load(); } catch (e) { fail(e); return false; } } }],
      body: h("div", null, field("الحالة", st), field("نسبة خاصة % (اتركها فارغة لاستعمال الشرائح)", rate), field("كوبون الشريك", cp), field("محفظة الدفع", pay)) });
  }
  function editTier(t) {
    const lb = input({ value: t?.label || "", maxLength: 30 }), mn = input({ type: "number", value: t?.min_sales ?? 0 }), rt = input({ type: "number", step: "0.1", value: t?.rate ?? 5 });
    modal({ title: t ? "تعديل شريحة" : "شريحة جديدة", actions: [t && { label: "حذف", kind: "danger", onClick: async () => { if (!(await confirmBox("حذف الشريحة؟", { danger: true }))) return false; try { await remove("affiliate_tiers", `id=eq.${enc(t.id)}`); toast("حُذفت"); load(); } catch (e) { fail(e); return false; } } }, { label: "إلغاء", kind: "ghost" }, { label: "حفظ", kind: "primary", onClick: async () => {
      const b = { label: lb.value.trim(), min_sales: Number(mn.value), rate: Number(rt.value) };
      if (!b.label) { toast("أدخل اسماً", "err"); return false; }
      try { t ? await patch("affiliate_tiers", `id=eq.${enc(t.id)}`, b) : await insert("affiliate_tiers", b); toast("تم الحفظ"); load(); } catch (e) { fail(e); return false; } } }].filter(Boolean),
      body: h("div", null, field("الاسم", lb), field("من الطلب رقم", mn), field("العمولة %", rt)) });
  }
  await load();
}
