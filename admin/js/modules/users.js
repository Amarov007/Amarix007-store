import { select, rpc } from "../core/http.js";
import { h, mount, pageHeader, toolbar, searchBox, dataTable, badge, modal, fail, spinner, errorState } from "../core/ui.js";
import { money, fmtDate } from "../core/utils.js";

export default async function (view) {
  let users = [], by = {}, q = "";
  const box = h("div");
  const draw = () => mount(box, dataTable({
    rows: users.filter((u) => !q || [u.uid, u.email, u.full_name].some((x) => String(x || "").toLowerCase().includes(q))),
    emptyText: "لا مستخدمين", onRow: find,
    columns: [
      { label: "UID", render: (u) => h("span", { class: "mono" }, u.uid || "—") },
      { label: "الاسم", render: (u) => [u.full_name || "—", h("small", { class: "sub mono" }, u.email || "")] },
      { label: "الطلبات", render: (u) => (by[u.id]?.n || 0) },
      { label: "الإنفاق", render: (u) => h("b", { class: "mono" }, money(by[u.id]?.sum || 0)) },
      { label: "التسجيل", render: (u) => h("span", { class: "muted" }, fmtDate(u.created_at)) },
    ],
  }));
  async function find(u) {
    if (!u.uid) return;
    try {
      const d = await rpc("admin_find_user", { p_uid: String(u.uid).replace(/\D/g, "") });
      modal({ title: `المستخدم ${u.uid}`, wide: true, actions: [{ label: "إغلاق", kind: "ghost" }],
        body: h("pre", { class: "mono", style: { whiteSpace: "pre-wrap", margin: 0 } }, JSON.stringify(d, null, 2)) });
    } catch (e) { fail(e, /forbidden|42501/.test(e.message) ? "لا تملك صلاحية «المستخدمين»" : "فشل البحث"); }
  }
  mount(view, pageHeader("المستخدمون", "حسابات العملاء (عرض فقط)"), toolbar(searchBox((v) => { q = v; draw(); }, "UID أو بريد أو اسم")), box);
  mount(box, spinner());
  try {
    const [p, o] = await Promise.all([select("profiles", "select=*&order=created_at.desc&limit=2000"), select("orders", "select=user_id,total,status&limit=5000").catch(() => [])]);
    users = p; o.forEach((x) => { if (x.user_id && x.status !== "cancelled") { const b = (by[x.user_id] ||= { n: 0, sum: 0 }); b.n++; b.sum += Number(x.total) || 0; } });
    draw();
  } catch (e) { mount(box, errorState(e)); }
}
