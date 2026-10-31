import { select, insert, patch, remove, enc } from "../core/http.js";
import { h, mount, pageHeader, dataTable, badge, modal, toast, fail, confirmBox, field, input, switchEl, spinner, errorState } from "../core/ui.js";
import { STAFF_PERMS } from "../core/config.js";

const KNOWN = STAFF_PERMS.map(([k]) => k);
export default async function (view) {
  const box = h("div");
  mount(view, pageHeader("الموظفون", "الموظف يسجّل حساباً في المتجر أولاً ثم تضيف بريده هنا وتحدد صلاحياته. لا يرى الإعدادات ولا المفاتيح ولا الكوبونات ولا يستطيع نشر الإعدادات.", h("button", { class: "btn primary", onclick: () => edit() }, "+ إضافة موظف")), box);
  async function load() {
    mount(box, spinner());
    try {
      const rows = await select("staff_members", "select=*&order=created_at.desc");
      mount(box, dataTable({ rows, emptyText: "لا موظفين بعد", onRow: edit, columns: [
        { label: "الموظف", render: (s) => [s.full_name || "—", h("small", { class: "sub mono" }, s.email)] },
        { label: "الصلاحيات", render: (s) => (s.perms || []).length ? (s.perms || []).map((p) => badge((STAFF_PERMS.find((x) => x[0] === p) || [p, p])[1].split(" (")[0], "info")) : h("span", { class: "muted" }, "بلا صلاحيات") },
        { label: "الحالة", render: (s) => badge(s.active ? "مفعّل" : "موقوف", s.active ? "ok" : "mute") }] }));
    } catch (e) { mount(box, errorState(new Error("فشل التحميل — تأكد من supabase-staff.sql وأن حسابك مدير"), load)); }
  }
  function edit(s) {
    const em = input({ type: "email", dir: "ltr", value: s?.email || "", readOnly: !!s, placeholder: "بريد الموظف المسجّل في المتجر" });
    const perms = new Set(s?.perms || []); let active = s ? !!s.active : true;
    modal({ title: s ? "تعديل موظف" : "إضافة موظف", actions: [
      s && { label: "حذف", kind: "danger", onClick: async () => { if (!(await confirmBox(`حذف ${s.email}؟`, { danger: true }))) return false; try { await remove("staff_members", `user_id=eq.${enc(s.user_id)}`); toast("تم الحذف"); load(); } catch (e) { fail(e); return false; } } },
      { label: "إلغاء", kind: "ghost" },
      { label: "حفظ", kind: "primary", onClick: async () => {
        /* نحافظ على صلاحيات قاعدة البيانات غير المعروضة هنا (مثل payments.review) كي لا تُمحى عند الحفظ */
        const keep = (s?.perms || []).filter((p) => !KNOWN.includes(p)), next = [...keep, ...KNOWN.filter((k) => perms.has(k))];
        try {
          if (s) await patch("staff_members", `user_id=eq.${enc(s.user_id)}`, { perms: next, active });
          else {
            const e = em.value.trim().toLowerCase(); if (!/^[^\s@%*]+@[^\s@%*]+\.[^\s@%*]+$/.test(e)) { toast("بريد غير صالح", "err"); return false; }
            const u = await select("profiles", `select=id,email,full_name&limit=1&email=ilike.${enc(e.replace(/_/g, "\\_"))}`);
            if (!u.length) { toast("هذا البريد غير مسجّل في المتجر — اطلب منه إنشاء حساب أولاً", "err"); return false; }
            if (!next.length && !(await confirmBox("لم تحدد أي صلاحية — سيُضاف الموظف دون قدرة على فعل شيء. متابعة؟"))) return false;
            await insert("staff_members", { user_id: u[0].id, email: u[0].email || e, full_name: u[0].full_name || null, perms: next, active: true });
          }
          toast("تم الحفظ"); load();
        } catch (e) { fail(/409|duplicate/.test(e.message) ? new Error("هذا الموظف مضاف مسبقاً") : e); return false; } } }].filter(Boolean),
      body: h("div", null, field("البريد", em), h("div", { class: "list" }, STAFF_PERMS.map(([k, l]) => h("div", null, h("span", null, l), switchEl(perms.has(k), (v) => (v ? perms.add(k) : perms.delete(k)))))), s && h("div", { style: { marginTop: "12px" } }, switchEl(active, (v) => (active = v), "الحساب مفعّل"))) });
  }
  await load();
}
