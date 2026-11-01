import { select, patch, enc } from "../core/http.js";
import { h, mount, pageHeader, toolbar, searchBox, select as sel, dataTable, badge, modal, toast, fail, spinner, errorState, withBusy } from "../core/ui.js";
import { fmtDate } from "../core/utils.js";
import { TICKET_STATUSES } from "../core/config.js";

const label = Object.fromEntries(TICKET_STATUSES), tone = { open: "warn", answered: "ok", closed: "mute" };

export default async function (view) {
  let rows = [], q = "", fs = "open";
  const box = h("div");
  const draw = () => mount(box, dataTable({
    rows: rows.filter((t) => (!fs || t.status === fs) && (!q || [t.subject, t.email, t.message, t.id].some((x) => String(x || "").toLowerCase().includes(q)))),
    emptyText: "لا تذاكر", onRow: open,
    columns: [
      { label: "الموضوع", render: (t) => [t.subject || "(بدون عنوان)", h("small", { class: "sub" }, String(t.message || "").slice(0, 70))] },
      { label: "العميل", render: (t) => h("span", { class: "mono" }, t.email || "—") },
      { label: "الحالة", render: (t) => badge(label[t.status] || t.status, tone[t.status]) },
      { label: "التاريخ", render: (t) => h("span", { class: "muted" }, fmtDate(t.created_at)) },
    ],
  }));
  function open(t) {
    const reply = h("textarea", { class: "input", rows: 5, placeholder: "نص الرد على العميل…", value: t.admin_reply || "" });
    modal({ title: t.subject || "تذكرة", wide: true,
      actions: [{ label: "إغلاق التذكرة", kind: "ghost", onClick: async () => { try { Object.assign(t, await patch("support_tickets", `id=eq.${enc(t.id)}`, { status: "closed" })); toast("أُغلقت التذكرة"); draw(); } catch (e) { fail(e); return false; } } },
        { label: "إرسال الرد", kind: "primary", onClick: async () => {
          if (!reply.value.trim()) { toast("اكتب نص الرد أولاً", "err"); return false; }
          try { Object.assign(t, await patch("support_tickets", `id=eq.${enc(t.id)}`, { admin_reply: reply.value.trim(), status: "answered" }));
            toast(t.email_status === "queued" ? "أُرسل الرد وبريد للعميل" : "حُفظ الرد"); draw(); } catch (e) { fail(e, "فشل الإرسال"); return false; } } }],
      body: h("div", null, h("dl", { class: "kv" }, h("dt", null, "العميل"), h("dd", { class: "mono" }, t.email || "—"), h("dt", null, "التاريخ"), h("dd", null, fmtDate(t.created_at))),
        h("div", { class: "card", style: { margin: "14px 0", whiteSpace: "pre-wrap" } }, t.message || ""), reply) });
  }
  mount(view, pageHeader("تذاكر الدعم", "الرد على استفسارات العملاء"),
    toolbar(searchBox((v) => { q = v; draw(); }, "بحث في التذاكر"), sel([["", "كل الحالات"], ...TICKET_STATUSES], fs, { onchange: (e) => { fs = e.target.value; draw(); }, style: { width: "auto" } })), box);
  mount(box, spinner());
  try { rows = await select("support_tickets", "select=*&order=created_at.desc&limit=200"); draw(); } catch (e) { mount(box, errorState(e)); }
}
