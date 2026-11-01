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
      icon_url: "/assets/payments/syriatel.svg",
      logo_url: "/assets/payments/syriatel.svg",
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
      icon_url: "/assets/payments/sham.svg",
      logo_url: "/assets/payments/sham.svg",
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
      icon_url: "/assets/payments/usdt.svg",
      logo_url: "/assets/payments/usdt.svg",
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
      icon_url: "/assets/payments/binance.svg",
      logo_url: "/assets/payments/binance.svg",
      network: "Binance Pay (Pay ID / Email)",
      acc: "",
      da: "ادفع عبر تطبيق بايننس باستخدام معرّف Binance Pay أعلاه، ثم اضغط «تم الدفع» وأرفق صورة العملية.",
      de: "Pay via Binance app using the Pay ID above, then tap 'Paid' and attach payment screenshot."
    }
  }
};

function methodThumb(m, size = 36) {
  const url = m.config?.icon_url || m.config?.logo_url || m.config?.image || m.logo_url || m.logo;
  if (url) {
    return h("img", {
      src: url,
      alt: m.config?.ar || m.id,
      style: { width: `${size}px`, height: `${size}px`, objectFit: "contain", borderRadius: "8px", background: "rgba(255,255,255,0.06)", padding: "2px", flexShrink: "0" }
    });
  }
  return h("div", {
    style: { width: `${size}px`, height: `${size}px`, borderRadius: "8px", background: "rgba(185,255,102,0.15)", color: "var(--ac)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "900", fontSize: `${Math.round(size * 0.42)}px`, flexShrink: "0" }
  }, (m.config?.en || m.config?.ar || m.id || "P")[0].toUpperCase());
}

export default async function (view) {
  const body = h("div", { class: "view" });
  let status = "under_review";
  mount(view, pageHeader("المدفوعات", "إدارة وسائل الدفع الرسمية، الحسابات، مراجعة الدفعات، والاستردادات"), body);

  async function load() {
    mount(body, spinner());
    try {
      const [cfg, methods, queue, refunds] = await Promise.all([
        rpc("payment_methods_public"), select("payment_methods", "select=id,kind,currency,enabled,sort,min_base,max_base,min_amount,max_amount,fee_pct,fee_fixed,requires_proof,expiry_minutes,confirm_mode,config&order=sort,id"),
        rpc("payment_review_queue", { p_status: status, p_method: null, p_search: null, p_limit: 100, p_offset: 0 }),
        select("refunds", "select=id,payment_id,amount,target,reason,status,requested_by,created_at&status=eq.requested&order=created_at.asc&limit=100").catch(() => []),
      ]);
      mount(body,
        h("div", { class: "card", style: { background: "var(--card)", border: "1px solid rgba(185,255,102,.25)" } },
          h("div", { class: "toolbar", style: { flexWrap: "wrap", gap: "8px", justifyContent: "space-between" } },
            h("div", null,
              h("h3", { style: { margin: 0 } }, `إدارة وسائل الدفع الرسمية (${methods.length})`),
              h("p", { class: "muted", style: { margin: "4px 0 0", fontSize: "13px" } }, "إضافة اسم وسيلة الدفع، رابط الصورة الرسمية، وتفاصيل الحساب والتعليمات:")),
            h("button", { class: "btn primary sm", onclick: () => editMethod(null, methods) }, "+ إضافة وسيلة جديدة")),
          h("div", { class: "page-actions", style: { flexWrap: "wrap", gap: "8px", marginTop: "12px" } },
            h("button", { class: "btn sm", style: { background: "#E30613", color: "#fff", borderColor: "#E30613" }, onclick: () => editMethod(PRESETS.syriatel, methods) }, "+ سيرياتيل كاش"),
            h("button", { class: "btn sm", style: { background: "#0B7A4B", color: "#fff", borderColor: "#0B7A4B" }, onclick: () => editMethod(PRESETS.sham, methods) }, "+ شام كاش"),
            h("button", { class: "btn sm", style: { background: "#26A17B", color: "#fff", borderColor: "#26A17B" }, onclick: () => editMethod(PRESETS.usdt, methods) }, "+ USDT (BEP20)"),
            h("button", { class: "btn sm", style: { background: "#181A20", color: "#F0B90B", borderColor: "#F0B90B" }, onclick: () => editMethod(PRESETS.binance, methods) }, "+ Binance Pay"))),
        dataTable({
          rows: methods,
          pageSize: 20,
          onRow: (m) => editMethod(m, methods),
          columns: [
            { label: "الأيقونة", render: (m) => methodThumb(m, 36) },
            { label: "اسم الوسيلة والمعرّف", render: (m) => [
              h("b", { style: { display: "block" } }, m.config?.ar || m.id),
              h("small", { class: "sub mono" }, `${m.id}${m.config?.en ? ` · ${m.config.en}` : ""}`)
            ] },
            { label: "تفاصيل الحساب / العنوان", render: (m) => [
              m.config?.acc
                ? h("span", { class: "mono", style: { fontWeight: "bold", wordBreak: "break-all" } }, m.config.acc)
                : h("span", { style: { color: "#eab308", fontSize: "12px" } }, "⚠️ لم يُسجّل رقم الحساب"),
              m.config?.network ? h("small", { class: "sub", style: { display: "block" } }, m.config.network) : null
            ] },
            { label: "العملة والحدود", render: (m) => [
              h("b", null, m.currency),
              h("small", { class: "sub" }, (m.min_base || m.max_base) ? `${m.min_base ?? "0"} → ${m.max_base ?? "∞"}` : "بلا حدود")
            ] },
            { label: "إثبات الدفع", render: (m) => badge(m.requires_proof ? "يتطلب إشعار" : "تلقائي", m.requires_proof ? "info" : "mute") },
            { label: "الحالة", render: (m) => badge(m.enabled ? "مفعّلة" : "موقوفة", m.enabled ? "ok" : "mute") },
            { label: "إجراءات", render: (m) => h("button", { class: "btn sm ghost", onclick: (e) => { e.stopPropagation(); editMethod(m, methods); } }, "تعديل") }
          ]
        }),
        h("div", { class: "card", style: { marginTop: "24px" } }, h("h3", null, "حالة النظام وسعر الصرف"),
          h("div", { class: "page-actions", style: { alignItems: "center" } },
            switchEl(!!cfg?.on, async (on) => { try { await rpc("payments_v2_flag_set", { p_on: on }); toast(on ? "فُعّل payments_v2" : "أُوقف payments_v2"); } catch (e) { fail(e); load(); } }, "تفعيل نظام الدفع v2"),
            badge(`FX: ${cfg?.fx ?? "—"}`, "info"), fxForm(cfg?.fx), h("button", { class: "btn sm", onclick: reconcile }, "مطابقة الحسابات"))),
        h("div", { class: "toolbar", style: { marginTop: "20px" } }, h("h3", { style: { margin: 0 } }, "طابور مراجعة الدفعات"), sel([["under_review", "قيد المراجعة"], ["approved", "معتمدة"], ["rejected", "مرفوضة"]], status, { style: { width: "auto" }, onchange: (e) => { status = e.target.value; load(); } })),
        dataTable({ rows: queue || [], emptyText: "لا دفعات", columns: [
          { label: "الدفعة", render: (x) => [h("span", { class: "mono" }, String(x.id).slice(0, 8)), h("small", { class: "sub" }, x.purpose || "")] },
          { label: "العميل", render: (x) => [x.name || "—", h("small", { class: "sub mono" }, `${x.email || ""} · UID ${x.uid || "—"}`)] },
          { label: "المبلغ", render: (x) => [h("b", { class: "mono" }, `${x.pay_amount} ${x.pay_currency}`), h("small", { class: "sub" }, `Base ${money(x.amount_base)} · FX ${x.fx_rate}`)] },
          { label: "المرجع", render: (x) => h("span", { class: "mono" }, x.tx_ref || "—") },
          { label: "الحالة", render: (x) => [badge(x.status, tone[x.status]), x.first_reviewed_by && h("small", { class: "sub" }, "موافقة أولى مسجّلة")] },
          { label: "", render: (x) => x.status === "under_review" && h("div", { class: "page-actions" }, h("button", { class: "btn primary sm", onclick: () => approve(x) }, "اعتماد"), h("button", { class: "btn danger sm", onclick: () => rejectPay(x) }, "رفض")) }] }),
        h("h3", { style: { marginTop: "20px" } }, `طلبات الاسترداد (${refunds.length})`),
        dataTable({ rows: refunds, emptyText: "لا طلبات استرداد", columns: [
          { label: "#", render: (r) => r.id }, { label: "الدفعة", render: (r) => h("span", { class: "mono" }, String(r.payment_id).slice(0, 8)) },
          { label: "المبلغ", render: (r) => money(r.amount) }, { label: "السبب", render: (r) => r.reason || "—" },
          { label: "", render: (r) => h("div", { class: "page-actions" },
            h("button", { class: "btn primary sm", onclick: async () => { if (!(await confirmBox(`اعتماد استرداد ${money(r.amount)} إلى المحفظة؟`))) return; try { await rpc("refund_approve", { p_id: Number(r.id) }); toast("تم الاعتماد"); load(); } catch (e) { fail(e); } } }, "اعتماد"),
            h("button", { class: "btn danger sm", onclick: async () => { const n = await promptBox("سبب الرفض", { okLabel: "رفض" }); if (n == null) return; try { await rpc("refund_reject", { p_id: Number(r.id), p_note: n }); toast("تم الرفض"); load(); } catch (e) { fail(e); } } }, "رفض")) }] }));
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
    const initialIconUrl = v.config.icon_url || v.config.logo_url || v.config.image || "";
    const imgPreview = h("div", {
      style: {
        marginTop: "8px",
        padding: "8px 12px",
        background: "rgba(0,0,0,0.25)",
        borderRadius: "8px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        border: "1px dashed rgba(255,255,255,0.15)"
      }
    });

    const updatePreview = (url) => {
      url = String(url || "").trim();
      if (/^(https:\/\/|\/assets\/|data:image\/)/i.test(url)) {
        imgPreview.replaceChildren(
          h("img", {
            src: url,
            alt: "معاينة",
            style: { width: "42px", height: "42px", objectFit: "contain", borderRadius: "8px", background: "rgba(255,255,255,0.06)", padding: "2px" },
            onerror: () => imgPreview.replaceChildren(h("span", { class: "muted", style: { fontSize: "12px" } }, "تعذّر تحميل معاينة الصورة"))
          }),
          h("div", null,
            h("b", { style: { fontSize: "12px", color: "var(--ac)", display: "block" } }, "✓ تم العثور على الأيقونة الرسمية"),
            h("small", { class: "sub mono" }, url))
        );
      } else {
        imgPreview.replaceChildren(h("span", { class: "muted", style: { fontSize: "12px" } }, "أدخل رابط صورة (HTTPS أو /assets/payments/...) لمعاينة الأيقونة الرسمية"));
      }
    };

    const f = {
      id: input({ value: v.id, dir: "ltr", readOnly: !!m, placeholder: "syriatel, sham, usdt, binance..." }),
      kind: sel(KINDS, v.kind),
      currency: input({ value: v.currency, dir: "ltr", placeholder: "USD أو SYP" }),
      sort: input({ type: "number", value: v.sort ?? "10" }),
      min_base: input({ type: "number", step: "any", value: v.min_base ?? "" }),
      max_base: input({ type: "number", step: "any", value: v.max_base ?? "" }),
      fee_pct: input({ type: "number", step: "any", value: v.fee_pct ?? "" }),
      fee_fixed: input({ type: "number", step: "any", value: v.fee_fixed ?? "" }),
      expiry_minutes: input({ type: "number", value: v.expiry_minutes ?? "60" }),
      ar: input({ value: v.config.ar || "", placeholder: "اسم الوسيلة بالعربية (مثال: سيرياتيل كاش)" }),
      en: input({ value: v.config.en || "", placeholder: "Method name in English (e.g. Syriatel Cash)" }),
      icon_url: input({ value: initialIconUrl, dir: "ltr", placeholder: "https://... أو /assets/payments/syriatel.svg", oninput: (e) => updatePreview(e.target.value) }),
      acc: input({ value: v.config.acc || "", dir: "ltr", placeholder: "رقم المحفظة / العنوان / Pay ID / الحساب البنكي" }),
      network: input({ value: v.config.network || "", placeholder: "الشبكة / نوع التحويل (مثال: سيرياتيل كاش، BEP20، بايننس Pay)" }),
      da: input({ value: v.config.da || "", placeholder: "تعليمات التحويل للعميل بالعربية" }),
      de: input({ value: v.config.de || "", placeholder: "Transfer instructions for customer in English" })
    };

    updatePreview(initialIconUrl);
    let enabled = v.enabled, proof = v.requires_proof;

    modal({
      title: m ? `تعديل وسيلة الدفع: ${m.config?.ar || m.id}` : "إضافة وسيلة دفع جديدة",
      wide: true,
      actions: [
        m && m.id !== "wallet" && {
          label: "حذف/إيقاف",
          kind: "danger",
          onClick: async () => {
            if (!(await confirmBox("حذف الوسيلة؟ إن كانت مرتبطة بدفعات ستُوقف فقط للحفاظ على السجلات.", { danger: true }))) return false;
            try { await rpc("payment_methods_admin_delete", { p_id: m.id }); toast("تم حذف/إيقاف الوسيلة"); load(); } catch (e) { fail(e); return false; }
          }
        },
        { label: "إلغاء", kind: "ghost" },
        {
          label: "حفظ وسيلة الدفع",
          kind: "primary",
          onClick: async () => {
            const n = (k) => (f[k].value === "" ? null : Number(f[k].value));
            const iconUrlVal = f.icon_url.value.trim();
            const next = {
              id: f.id.value.trim(),
              kind: f.kind.value,
              currency: f.currency.value.trim().toUpperCase(),
              enabled,
              requires_proof: proof,
              sort: n("sort"),
              min_base: n("min_base"),
              max_base: n("max_base"),
              min_amount: m?.min_amount ?? null,
              max_amount: m?.max_amount ?? null,
              fee_pct: n("fee_pct"),
              fee_fixed: n("fee_fixed"),
              expiry_minutes: n("expiry_minutes"),
              confirm_mode: "manual",
              config: {
                ...v.config,
                ar: f.ar.value.trim(),
                en: f.en.value.trim(),
                icon_url: iconUrlVal,
                logo_url: iconUrlVal,
                acc: f.acc.value.trim(),
                network: f.network.value.trim(),
                da: f.da.value.trim(),
                de: f.de.value.trim(),
              }
            };
            if (!/^[a-z0-9_]{2,24}$/.test(next.id)) {
              toast("المعرّف (ID): أحرف إنجليزية صغيرة أو أرقام أو _ (2–24 حرفاً)", "err");
              return false;
            }
            if (!next.config.ar && !next.config.en) {
              toast("يرجى إدخال اسم الوسيلة", "err");
              return false;
            }
            const list = all.filter((x) => x.id !== next.id).concat(next).map((x) => ({ ...x }));
            try {
              await rpc("payment_methods_admin_save", { p_methods: list });
              toast("تم حفظ وسيلة الدفع وتفاصيل الحساب بنجاح");
              load();
            } catch (e) {
              fail(e);
              return false;
            }
          }
        }
      ].filter(Boolean),
      body: h("div", null,
        h("div", { class: "form-grid" },
          field("المعرّف (ID)", f.id),
          field("اسم الوسيلة (عربي)", f.ar),
          field("اسم الوسيلة (English)", f.en),
          field("العملة", f.currency),
          h("div", { style: { gridColumn: "1 / -1" } },
            field("رابط الصورة الرسمية (الأيقونة)", f.icon_url),
            imgPreview
          ),
          h("div", { style: { gridColumn: "1 / -1" } },
            field("تفاصيل الحساب / رقم المحفظة / العنوان", f.acc)
          ),
          field("الشبكة / نوع التحويل", f.network),
          field("الترتيب", f.sort),
          field("الحد الأدنى (Base)", f.min_base),
          field("الحد الأعلى (Base)", f.max_base),
          field("عمولة %", f.fee_pct),
          field("عمولة ثابتة", f.fee_fixed),
          field("مدة الصلاحية (دقيقة)", f.expiry_minutes),
          field("النوع (Kind)", f.kind),
          h("div", { style: { gridColumn: "1 / -1" } },
            field("تعليمات التحويل (عربي)", f.da)
          ),
          h("div", { style: { gridColumn: "1 / -1" } },
            field("Instructions (English)", f.de)
          )
        ),
        h("div", { class: "page-actions", style: { marginTop: "14px" } },
          switchEl(enabled, (x) => (enabled = x), "مفعّلة في المتجر"),
          switchEl(proof, (x) => (proof = x), "يتطلب إرفاق إشعار/إثبات الدفع")
        )
      )
    });
  }
  await load();
}

