import { select, rpc } from "../core/http.js";
import { h, mount, pageHeader, dataTable, badge, modal, toast, fail, promptBox, confirmBox, field, input, select as sel, switchEl, spinner, errorState, withBusy } from "../core/ui.js";
import { money, fmtDate, clone } from "../core/utils.js";

const tone = { under_review: "warn", approved: "ok", rejected: "err", pending: "info", expired: "mute" };
const KINDS = [["manual", "manual"], ["wallet", "wallet"], ["crypto_auto", "crypto_auto"]];

const PRESETS = {
  syriatel: {
    id: "syriatel",
    kind: "manual",
    currency: "SYP",
    enabled: true,
    sort: 10,
    requires_proof: true,
    expiry_minutes: 60,
    config: {
      ar: "سيرياتيل كاش",
      en: "Syriatel Cash",
      network: "سيرياتيل كاش (Syriatel Cash)",
      acc: "",
      da: "حوّل المبلغ المطلوب إلى رقم سيرياتيل كاش أعلاه، ثم اضغط «تم الدفع» وأرفق إشعار التحويل.",
      de: "Transfer the amount to the Syriatel Cash wallet number, then tap 'Paid' and attach proof."
    }
  },
  sham: {
    id: "sham",
    kind: "manual",
    currency: "SYP",
    enabled: true,
    sort: 20,
    requires_proof: true,
    expiry_minutes: 60,
    config: {
      ar: "شام كاش",
      en: "Sham Cash",
      network: "شام كاش (Sham Cash)",
      acc: "",
      da: "حوّل المبلغ المطلوب إلى رقم حساب شام كاش أعلاه، ثم اضغط «تم الدفع» وأرفق إشعار التحويل.",
      de: "Transfer the amount to the Sham Cash account, then tap 'Paid' and attach proof."
    }
  },
  usdt: {
    id: "usdt",
    kind: "manual",
    currency: "USD",
    enabled: true,
    sort: 30,
    requires_proof: true,
    expiry_minutes: 60,
    config: {
      ar: "USDT (BEP20)",
      en: "USDT (BEP20)",
      network: "BEP20 (Binance Smart Chain)",
      acc: "",
      da: "أرسل USDT عبر شبكة BEP20 حصراً إلى العنوان أعلاه، ثم الصق TxID وأرفق صورة التحويل.",
      de: "Send USDT on BEP20 (BSC) network only to the address above, then paste TxID and attach screenshot."
    }
  },
  binance: {
    id: "binance",
    kind: "manual",
    currency: "USD",
    enabled: true,
    sort: 40,
    requires_proof: true,
    expiry_minutes: 60,
    config: {
      ar: "Binance Pay",
      en: "Binance Pay",
      network: "Binance Pay (Pay ID / Email)",
      acc: "",
      da: "ادفع عبر تطبيق بايننس باستخدام معرّف Binance Pay أعلاه، ثم اضغط «تم الدفع» وأرفق صورة العملية.",
      de: "Pay via Binance app using the Pay ID above, then tap 'Paid' and attach payment screenshot."
    }
  }
};

export default async function (view) {
  const body = h("div", { class: "view" });
  let status = "under_review";
  mount(view, pageHeader("المدفوعات", "مراجعة الدفعات واعتمادها، الاستردادات، وسائل الدفع، سعر الصرف"), body);

  async function load() {
    mount(body, spinner());
    try {
      const [cfg, methods, queue, refunds] = await Promise.all([
        rpc("payment_methods_public"), select("payment_methods", "select=id,kind,currency,enabled,sort,min_base,max_base,min_amount,max_amount,fee_pct,fee_fixed,requires_proof,expiry_minutes,confirm_mode,config&order=sort,id"),
        rpc("payment_review_queue", { p_status: status, p_method: null, p_search: null, p_limit: 100, p_offset: 0 }),
        select("refunds", "select=id,payment_id,amount,target,reason,status,requested_by,created_at&status=eq.requested&order=created_at.asc&limit=100").catch(() => []),
      ]);
      mount(body,
        h("div", { class: "card" }, h("h3", null, "حالة النظام"),
          h("div", { class: "page-actions", style: { alignItems: "center" } },
            switchEl(!!cfg?.on, async (on) => { try { await rpc("payments_v2_flag_set", { p_on: on }); toast(on ? "فُعّل payments_v2" : "أُوقف payments_v2"); } catch (e) { fail(e); load(); } }, "تفعيل نظام الدفع v2"),
            badge(`FX: ${cfg?.fx ?? "—"}`, "info"), fxForm(cfg?.fx), h("button", { class: "btn sm", onclick: reconcile }, "مطابقة الحسابات"))),
        h("div", { class: "toolbar" }, h("h3", { style: { margin: 0 } }, "طابور المراجعة"), sel([["under_review", "قيد المراجعة"], ["approved", "معتمدة"], ["rejected", "مرفوضة"]], status, { style: { width: "auto" }, onchange: (e) => { status = e.target.value; load(); } })),
        dataTable({ rows: queue || [], emptyText: "لا دفعات", columns: [
          { label: "الدفعة", render: (x) => [h("span", { class: "mono" }, String(x.id).slice(0, 8)), h("small", { class: "sub" }, x.purpose || "")] },
          { label: "العميل", render: (x) => [x.name || "—", h("small", { class: "sub mono" }, `${x.email || ""} · UID ${x.uid || "—"}`)] },
          { label: "المبلغ", render: (x) => [h("b", { class: "mono" }, `${x.pay_amount} ${x.pay_currency}`), h("small", { class: "sub" }, `Base ${money(x.amount_base)} · FX ${x.fx_rate}`)] },
          { label: "المرجع", render: (x) => h("span", { class: "mono" }, x.tx_ref || "—") },
          { label: "الحالة", render: (x) => [badge(x.status, tone[x.status]), x.first_reviewed_by && h("small", { class: "sub" }, "موافقة أولى مسجّلة")] },
          { label: "", render: (x) => x.status === "under_review" && h("div", { class: "page-actions" }, h("button", { class: "btn primary sm", onclick: () => approve(x) }, "اعتماد"), h("button", { class: "btn danger sm", onclick: () => rejectPay(x) }, "رفض")) }] }),
        h("h3", null, `طلبات الاسترداد (${refunds.length})`),
        dataTable({ rows: refunds, emptyText: "لا طلبات استرداد", columns: [
          { label: "#", render: (r) => r.id }, { label: "الدفعة", render: (r) => h("span", { class: "mono" }, String(r.payment_id).slice(0, 8)) },
          { label: "المبلغ", render: (r) => money(r.amount) }, { label: "السبب", render: (r) => r.reason || "—" },
          { label: "", render: (r) => h("div", { class: "page-actions" },
            h("button", { class: "btn primary sm", onclick: async () => { if (!(await confirmBox(`اعتماد استرداد ${money(r.amount)} إلى المحفظة؟`))) return; try { await rpc("refund_approve", { p_id: Number(r.id) }); toast("تم الاعتماد"); load(); } catch (e) { fail(e); } } }, "اعتماد"),
            h("button", { class: "btn danger sm", onclick: async () => { const n = await promptBox("سبب الرفض", { okLabel: "رفض" }); if (n == null) return; try { await rpc("refund_reject", { p_id: Number(r.id), p_note: n }); toast("تم الرفض"); load(); } catch (e) { fail(e); } } }, "رفض")) }] }),
        h("div", { class: "card", style: { background: "var(--card)", border: "1px solid rgba(185,255,102,.25)" } },
          h("div", { class: "toolbar", style: { flexWrap: "wrap", gap: "8px", justifyContent: "space-between" } },
            h("h3", { style: { margin: 0 } }, `إضافة وسائل الدفع الرسمية (${methods.length})`),
            h("button", { class: "btn sm", onclick: () => editMethod(null, methods) }, "+ وسيلة مخصصة")),
          h("p", { class: "muted", style: { margin: "4px 0 12px" } }, "أضف وسائل الدفع الرسمية بنقرة واحدة مع إعداداتها المعتمدة:"),
          h("div", { class: "page-actions", style: { flexWrap: "wrap", gap: "8px" } },
            h("button", { class: "btn sm", style: { background: "#E30613", color: "#fff", borderColor: "#E30613" }, onclick: () => editMethod(PRESETS.syriatel, methods) }, "+ سيرياتيل كاش"),
            h("button", { class: "btn sm", style: { background: "#0B7A4B", color: "#fff", borderColor: "#0B7A4B" }, onclick: () => editMethod(PRESETS.sham, methods) }, "+ شام كاش"),
            h("button", { class: "btn sm", style: { background: "#26A17B", color: "#fff", borderColor: "#26A17B" }, onclick: () => editMethod(PRESETS.usdt, methods) }, "+ USDT (BEP20)"),
            h("button", { class: "btn sm", style: { background: "#181A20", color: "#F0B90B", borderColor: "#F0B90B" }, onclick: () => editMethod(PRESETS.binance, methods) }, "+ Binance Pay"))),
        dataTable({ rows: methods, pageSize: 20, onRow: (m) => editMethod(m, methods), columns: [
          { label: "المعرّف", render: (m) => h("span", { class: "mono" }, m.id) }, { label: "الاسم", render: (m) => [h("b", null, m.config?.ar || m.id), h("small", { class: "sub" }, m.config?.network || "")] }, { label: "النوع", render: (m) => m.kind }, { label: "العملة", render: (m) => m.currency },
          { label: "الحدود", render: (m) => `${m.min_base ?? "—"} → ${m.max_base ?? "—"}` }, { label: "الحالة", render: (m) => badge(m.enabled ? "مفعّلة" : "موقوفة", m.enabled ? "ok" : "mute") }] }));
    } catch (e) { mount(body, errorState(e, load)); }
  }
  function fxForm(cur) {
    const i = input({ type: "number", step: "0.0001", value: cur ?? "", style: { width: "120px" }, placeholder: "SYP/USDT" });
    return h("span", { class: "toolbar" }, i, h("button", { class: "btn sm", onclick: async () => { const v = Number(i.value); if (!(v > 0)) return toast("أدخل سعراً موجباً", "err"); try { await rpc("fx_rate_set", { p_pair: "SYP/USDT", p_rate: v }); toast("حُفظ السعر؛ الدفعات القديمة لا تتغير"); } catch (e) { fail(e); } } }, "حفظ سعر الصرف"));
  }
  async function reconcile() {
    try { const [a, b] = await Promise.all([rpc("payments_reconcile"), rpc("wallet_reconcile")]);
      modal({ title: "نتيجة المطابقة", wide: true, actions: [{ label: "إغلاق", kind: "ghost" }], body: h("pre", { class: "mono", style: { whiteSpace: "pre-wrap", margin: 0 } }, JSON.stringify({ payments: a, wallets: b }, null, 2)) }); } catch (e) { fail(e); }
  }
  async function approve(x) {
    if (!(await confirmBox(`هل تحققت من وصول ${x.pay_amount} ${x.pay_currency} فعلياً؟`, { okLabel: "نعم، تابع" }))) return;
    try {
      const code = await rpc("payment_confirmation_issue", { p_id: x.id });
      const amt = input({ type: "number", step: "0.01", value: x.pay_amount }), cur = input({ value: x.pay_currency }), note = input({ placeholder: "إلزامية عند وجود فرق" }), cd = input({ value: code, dir: "ltr", class: "input mono" });
      modal({ title: "اعتماد الدفعة", actions: [{ label: "إلغاء", kind: "ghost" }, { label: "اعتماد", kind: "primary", onClick: async () => {
        try { const r = await rpc("payment_approve_received", { p_id: x.id, p_confirmation: cd.value.trim(), p_received_amount: Number(amt.value), p_received_currency: cur.value.trim(), p_note: note.value });
          toast(r === "first_approved" ? "سُجّلت الموافقة الأولى؛ يلزم مراجع آخر" : "تم اعتماد الدفعة"); load(); } catch (e) { fail(e, "تعذّر الاعتماد"); return false; } } }],
        body: h("div", null, h("p", { class: "muted", style: { marginBottom: "12px" } }, "رمز التأكيد صادر من الخادم وصالح لعشر دقائق."), field("المبلغ الذي وصل فعلياً", amt), field("العملة المستلمة", cur), field("ملاحظة", note), field("رمز التأكيد", cd)) });
    } catch (e) { fail(e); }
  }
  async function rejectPay(x) {
    const r = await promptBox("سبب الرفض (إلزامي)", { title: "رفض الدفعة", okLabel: "رفض" }); if (!r) return;
    try { await rpc("payment_reject", { p_id: x.id, p_reason: r }); toast("تم رفض الدفعة"); load(); } catch (e) { fail(e); }
  }
  function editMethod(m, all) {
    const v = m ? clone(m) : { id: "", kind: "manual", currency: "USD", enabled: true, sort: 100, requires_proof: true, expiry_minutes: 60, config: {} };
    v.config ||= {};
    const f = { id: input({ value: v.id, dir: "ltr", readOnly: !!m }), kind: sel(KINDS, v.kind), currency: input({ value: v.currency }), sort: input({ type: "number", value: v.sort ?? "" }),
      min_base: input({ type: "number", step: "any", value: v.min_base ?? "" }), max_base: input({ type: "number", step: "any", value: v.max_base ?? "" }), fee_pct: input({ type: "number", step: "any", value: v.fee_pct ?? "" }), fee_fixed: input({ type: "number", step: "any", value: v.fee_fixed ?? "" }),
      expiry_minutes: input({ type: "number", value: v.expiry_minutes ?? "" }), ar: input({ value: v.config.ar || "" }), en: input({ value: v.config.en || "" }), acc: input({ value: v.config.acc || "", dir: "ltr" }), network: input({ value: v.config.network || "", dir: "ltr" }),
      da: input({ value: v.config.da || "" }), de: input({ value: v.config.de || "" }) };
    let enabled = v.enabled, proof = v.requires_proof;
    modal({ title: m ? `وسيلة: ${m.id}` : "وسيلة دفع جديدة", wide: true, actions: [
      m && m.id !== "wallet" && { label: "حذف/إيقاف", kind: "danger", onClick: async () => { if (!(await confirmBox("حذف الوسيلة؟ إن كانت مرتبطة بدفعات ستُوقف فقط.", { danger: true }))) return false; try { await rpc("payment_methods_admin_delete", { p_id: m.id }); toast("تم التحديث"); load(); } catch (e) { fail(e); return false; } } },
      { label: "إلغاء", kind: "ghost" },
      { label: "حفظ", kind: "primary", onClick: async () => {
        const n = (k) => (f[k].value === "" ? null : Number(f[k].value));
        const next = { id: f.id.value.trim(), kind: f.kind.value, currency: f.currency.value.trim(), enabled, requires_proof: proof, sort: n("sort"), min_base: n("min_base"), max_base: n("max_base"), min_amount: m?.min_amount ?? null, max_amount: m?.max_amount ?? null, fee_pct: n("fee_pct"), fee_fixed: n("fee_fixed"), expiry_minutes: n("expiry_minutes"), confirm_mode: "manual",
          config: { ...v.config, ar: f.ar.value, en: f.en.value, acc: f.acc.value, network: f.network.value, da: f.da.value, de: f.de.value } };
        if (!/^[a-z0-9_]{2,24}$/.test(next.id)) { toast("المعرّف: حروف إنجليزية صغيرة/أرقام/_ (2–24)", "err"); return false; }
        const list = all.filter((x) => x.id !== next.id).concat(next).map((x) => ({ ...x }));
        try { await rpc("payment_methods_admin_save", { p_methods: list }); toast("حُفظت وسائل الدفع"); load(); } catch (e) { fail(e); return false; } } }].filter(Boolean),
      body: h("div", null, h("div", { class: "form-grid" }, field("المعرّف", f.id), field("النوع", f.kind), field("العملة", f.currency), field("الترتيب", f.sort), field("الحد الأدنى (Base)", f.min_base), field("الحد الأعلى (Base)", f.max_base), field("عمولة %", f.fee_pct), field("عمولة ثابتة", f.fee_fixed), field("مدة الصلاحية (دقيقة)", f.expiry_minutes),
        field("الاسم (عربي)", f.ar), field("الاسم (EN)", f.en), field("رقم/عنوان الحساب", f.acc), field("الشبكة", f.network), field("تعليمات (عربي)", f.da), field("Instructions (EN)", f.de)),
        h("div", { class: "page-actions" }, switchEl(enabled, (x) => (enabled = x), "مفعّلة"), switchEl(proof, (x) => (proof = x), "يتطلب إثبات دفع"))) });
  }
  await load();
}
