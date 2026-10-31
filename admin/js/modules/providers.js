import { rpc, rest, insert, patch, remove, fn, enc } from "../core/http.js";
import { h, mount, pageHeader, dataTable, badge, modal, toast, fail, confirmBox, field, input, select as sel, switchEl, spinner, errorState } from "../core/ui.js";
import { fmtDate } from "../core/utils.js";

const ID_RE = /^[a-z0-9_-]{2,30}$/, SECRET_RE = /^[A-Z][A-Z0-9_]{2,63}$/;
const KINDS = [["smm", "SMM (رشق)"], ["smsactivate", "SMS-Activate (أرقام)"], ["custom", "مخصّص (JSON)"]];

export default async function (view) {
  const box = h("div");
  mount(view, pageHeader("مزوّدو الخدمات", "مفاتيح API تُحفظ كأسرار Edge Functions؛ هنا تُدخل اسم السر فقط — لا تُخزَّن قيمة المفتاح في قاعدة البيانات.", h("button", { class: "btn", onclick: () => test("main") }, "اختبار المزوّد الرئيسي"), h("button", { class: "btn primary", onclick: () => edit() }, "+ مزوّد")), box);
  let rows = [];
  async function load() {
    mount(box, spinner());
    try {
      rows = await rpc("smm_providers_admin_list");
      mount(box, dataTable({ rows, onRow: edit, emptyText: "لا مزوّدون إضافيون (المزوّد الرئيسي يُدار من api_settings)", columns: [
        { label: "المعرّف", render: (p) => h("span", { class: "mono" }, p.id) }, { label: "الاسم", render: (p) => [p.name, h("small", { class: "sub mono" }, p.api_url)] },
        { label: "النوع", render: (p) => badge(p.kind || "smm", "info") }, { label: "Secret", render: (p) => h("span", { class: "mono" }, p.api_key_secret_name || "—") },
        { label: "آخر رصيد", render: (p) => p.last_balance != null ? [h("b", { class: "mono" }, `${p.last_balance} ${p.last_currency || ""}`), h("small", { class: "sub" }, fmtDate(p.last_checked_at))] : "—" },
        { label: "الحالة", render: (p) => badge(p.enabled ? "مفعّل" : "موقوف", p.enabled ? "ok" : "mute") },
        { label: "", render: (p) => h("button", { class: "btn sm", onclick: () => test(p.id) }, "اختبار") }] }));
    } catch (e) { mount(box, errorState(new Error(`${e.message} — انشر migration إخفاء أسرار المزوّدين أولاً`), load)); }
  }
  async function test(id) {
    try {
      const j = await fn("smm-order", { action: "balance", provider: id });
      const b = Number(j?.balance);
      if (Number.isFinite(b) && b >= 0) rpc("notify_provider_balance_if_low", { p_provider: id, p_balance: b, p_currency: String(j.currency || "").slice(0, 8) }).catch(() => {});
      toast(`✓ ${id}: الرصيد ${j.balance} ${j.currency || ""}`);
      load();
    } catch (e) { fail(e, `فشل اختبار ${id}`); }
  }
  function edit(p) {
    const isNew = !p, v = p || { kind: "smm", enabled: true, config: {} };
    const f = { id: input({ value: v.id || "", dir: "ltr", readOnly: !isNew, placeholder: "مثال: s2" }), name: input({ value: v.name || "" }), kind: sel(KINDS, v.kind), url: input({ value: v.api_url || "", dir: "ltr", placeholder: "https://…" }),
      secret: input({ value: v.api_key_secret_name || "", dir: "ltr", placeholder: "SMM_PROVIDER_S2_API_KEY" }), cfg: h("textarea", { class: "input mono", rows: 6, value: v.config && Object.keys(v.config).length ? JSON.stringify(v.config, null, 2) : "" }) };
    let enabled = !!v.enabled;
    modal({ title: isNew ? "مزوّد جديد" : `مزوّد: ${v.id}`, wide: true, actions: [
      !isNew && { label: "حذف", kind: "danger", onClick: async () => { if (!(await confirmBox(`حذف «${v.name}» نهائياً؟ تأكد أنه لا توجد منتجات مرتبطة به.`, { danger: true }))) return false; try { const r = await rest(`smm_providers?id=eq.${enc(v.id)}`, { method: "DELETE", prefer: "return=representation" }); if (!r.length) throw new Error("لم يُحذف شيء (RLS)"); toast("حُذف"); load(); } catch (e) { fail(e); return false; } } },
      { label: "إلغاء", kind: "ghost" },
      { label: "حفظ", kind: "primary", onClick: async () => {
        const id = f.id.value.trim().toLowerCase(), kind = f.kind.value, url = f.url.value.trim(), secret = f.secret.value.trim() || `SMM_PROVIDER_${id.toUpperCase().replace(/-/g, "_")}_API_KEY`;
        let config = {};
        if (kind !== "smm" && f.cfg.value.trim()) { try { config = JSON.parse(f.cfg.value); } catch (e) { toast(`JSON غير صالح: ${e.message}`, "err"); return false; } if (!config || Array.isArray(config) || typeof config !== "object") { toast("الإعدادات يجب أن تكون كائناً", "err"); return false; } }
        if (kind === "custom" && !config.order?.path) { toast("النوع المخصّص يحتاج order.path على الأقل", "err"); return false; }
        if (!ID_RE.test(id) || id === "main") { toast("المعرّف: حروف إنجليزية صغيرة/أرقام/-/_ ولا يصح main", "err"); return false; }
        if (!/^https:\/\/\S+$/i.test(url)) { toast("الرابط يجب أن يبدأ بـ https://", "err"); return false; }
        if (!SECRET_RE.test(secret)) { toast("أدخل اسم Edge Secret فقط (لا قيمة المفتاح)", "err"); return false; }
        if (isNew && rows.some((x) => x.id === id)) { toast("المعرّف مستخدم", "err"); return false; }
        config.api_key_secret_name = secret;
        const row = { name: f.name.value.trim() || id, kind, config, api_url: url, api_key_secret_name: secret, enabled };
        try { isNew ? await insert("smm_providers", { id, ...row }) : await patch("smm_providers", `id=eq.${enc(id)}`, row); toast("تم الحفظ"); load(); } catch (e) { fail(e); return false; } } }].filter(Boolean),
      body: h("div", null, h("div", { class: "form-grid" }, field("المعرّف", f.id), field("الاسم", f.name), field("النوع", f.kind), field("رابط API", f.url), field("اسم Edge Secret", f.secret, "قيمة المفتاح تُضاف من Supabase → Edge Functions → Secrets")),
        field("إعدادات JSON (لغير SMM)", f.cfg), switchEl(enabled, (x) => (enabled = x), "مفعّل")) });
  }
  await load();
}
