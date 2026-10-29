/* AMARIX007 Payments v2 — same-origin ES module, no inline handlers. */
const T = () => window.AMXPayTransport;
const A = () => T()?.lang?.() === "ar";
const tx = (ar, en) => A() ? ar : en;
const esc = (v) => T()?.ex ? T().ex(String(v ?? "")) : String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
const STATUS = {
  created: ["تم إنشاء الدفعة", "Created"], awaiting_payment: ["بانتظار التحويل", "Awaiting transfer"],
  proof_submitted: ["تم إرفاق الإثبات", "Proof attached"], under_review: ["قيد المراجعة", "Under review"],
  captured: ["تم تأكيد الدفع", "Payment confirmed"], rejected: ["مرفوضة", "Rejected"],
  cancelled: ["ملغاة", "Cancelled"], expired: ["انتهت صلاحيتها", "Expired"],
  refunded_partially: ["استرداد جزئي", "Partially refunded"], refunded: ["مستردة", "Refunded"],
};
const statusText = (s) => (STATUS[s] || [s || "غير معروف", s || "Unknown"])[A() ? 0 : 1];

/* Friendly messages for server error codes (never show raw codes to customers). */
const ERRORS = [
  ["reference_required", "رقم العملية (TXID) مطلوب لهذه الوسيلة. أدخله ثم أعد الإرسال.", "The transaction ID (TXID) is required for this method. Enter it and submit again."],
  ["invalid_reference", "رقم العملية غير صالح (6–100 حرفاً: أحرف إنجليزية وأرقام فقط).", "Invalid transaction ID (6–100 characters: letters and numbers only)."],
  ["duplicate_reference", "رقم العملية هذا مستخدم من قبل.", "This transaction ID was already used."],
  ["duplicate_proof", "هذه الصورة مستخدمة في دفعة أخرى. ارفع إيصالك الأصلي.", "This image was already used for another payment. Upload your own receipt."],
  ["proof_required", "أرفق صورة إثبات التحويل أولاً.", "Attach the transfer receipt first."],
  ["proof_image_only", "الملف يجب أن يكون صورة (JPG أو PNG أو WEBP).", "The file must be an image (JPG, PNG or WEBP)."],
  ["proof_file_too_large", "حجم الصورة كبير جداً. اختر صورة أصغر.", "The image is too large. Choose a smaller one."],
  ["payment_expired", "انتهت مهلة هذه الدفعة. أنشئ طلباً جديداً.", "This payment has expired. Please create a new order."],
  ["session_expired", "انتهت جلسة الدخول. سجّل الدخول مجدداً.", "Your session expired. Please sign in again."],
  ["auth_required", "سجّل الدخول للمتابعة.", "Please sign in to continue."],
  ["rate_limited", "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة.", "Too many attempts. Please wait and try again."],
  ["not_allowed", "لا يمكن تنفيذ هذا الإجراء على الدفعة الحالية.", "This action isn't allowed for the current payment."],
  ["proof_upload_failed", "تعذّر رفع الصورة. تحقق من الاتصال وأعد المحاولة.", "Image upload failed. Check your connection and retry."],
  ["proof_verify_failed", "تعذّر التحقق من الصورة. أعد رفعها.", "Could not verify the image. Please upload it again."],
];
const friendly = (error) => {
  const raw = String(error?.message || error || "");
  const hit = ERRORS.find(([code]) => raw.includes(code));
  return hit ? tx(hit[1], hit[2]) : tx("حدث خطأ غير متوقع. أعد المحاولة.", "Something went wrong. Please try again.");
};

let cfgCache = null;
async function rpc(name, args = {}, auth = true) {
  if (!T()) throw new Error("payments_transport_missing");
  const r = await T().rpc(name, args, auth);
  if (!r.ok) {
    const raw = await r.text().catch(() => "");
    let message = raw;
    try { message = JSON.parse(raw).message || JSON.parse(raw).details || raw; } catch {}
    throw new Error(String(message || `rpc_${name}_${r.status}`).replace(/\s+/g, " ").slice(0, 220));
  }
  if (r.status === 204) return null;
  const text = await r.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}
function user() { return T()?.user?.() || null; }
const IDEM_TTL = 10 * 60 * 1000;
function idem(scope) {
  const key = `amx.pay.v2.idem.${String(scope).slice(0,120)}`;
  try {
    let rec = null;
    try { rec = JSON.parse(localStorage.getItem(key) || "null"); } catch {}
    if (!rec || typeof rec.v !== "string" || Date.now() - Number(rec.t || 0) > IDEM_TTL) {
      rec = { v: uuid(), t: Date.now() };
      localStorage.setItem(key, JSON.stringify(rec));
    }
    return rec.v;
  } catch { return uuid(); }
}
function idemClear(scope) { try { localStorage.removeItem(`amx.pay.v2.idem.${String(scope).slice(0,120)}`); } catch {} }
async function getConfig(force = false) {
  if (cfgCache && !force) return cfgCache;
  cfgCache = await rpc("payment_methods_public", {}, false);
  return cfgCache;
}

/* ---------- modal shell ---------- */
let lastFocus = null;
function ensureModal() {
  let modal = document.getElementById("amx-pay-modal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "amx-pay-modal";
  modal.className = "amx-pay-overlay";
  modal.hidden = true;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "amx-pay-title");
  modal.innerHTML = `<section class="amx-pay-dialog"><header><h2 id="amx-pay-title">${tx("تعليمات الدفع", "Payment instructions")}</h2><button type="button" class="amx-pay-close" data-pay-action="close" aria-label="${tx("إغلاق", "Close")}">×</button></header><div id="amx-pay-content" aria-live="polite"><div class="pay-skel"><i></i><i></i><i></i></div></div></section>`;
  modal.addEventListener("mousedown", e => { if (e.target === modal) closeModal(); });
  document.body.append(modal);
  return modal;
}
function closeModal() {
  const m = document.getElementById("amx-pay-modal");
  if (m) m.hidden = true;
  stopTimer();
  if (lastFocus && document.contains(lastFocus)) { try { lastFocus.focus(); } catch {} }
  lastFocus = null;
}
function showModal() {
  const m = ensureModal();
  if (m.hidden) lastFocus = document.activeElement;
  m.hidden = false;
  m.querySelector("[data-pay-action=close]")?.focus({ preventScroll: true });
}
document.addEventListener("keydown", e => { if (e.key === "Escape" && !document.getElementById("amx-pay-modal")?.hidden) closeModal(); });
function content(html) { const slot = document.getElementById("amx-pay-content"); if (slot) slot.innerHTML = html; }

/* ---------- helpers ---------- */
function amount(v, currency) { const n = Number(v); return `${Number.isFinite(n) ? n.toLocaleString(A() ? "ar-EG-u-nu-latn" : "en", {maximumFractionDigits: 6}) : "—"} ${esc(currency || "")}`; }
/* Postgres returns "2026-10-30 01:20:56.558484+00"; normalise so every browser parses it (NaN:NaN:NaN fix). */
function ts(v) {
  if (!v) return NaN;
  let s = String(v).trim().replace(" ", "T").replace(/(\.\d{3})\d+/, "$1");
  s = s.replace(/([+-]\d{2})$/, "$1:00");
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(s)) s += "Z";
  return Date.parse(s);
}
function countdown(end) {
  if (!Number.isFinite(end)) return "—";
  const left = Math.max(0, Math.floor((end - Date.now()) / 1000));
  const d = Math.floor(left / 86400), h = Math.floor(left % 86400 / 3600), m = Math.floor(left % 3600 / 60), s = left % 60;
  const p = (n) => String(n).padStart(2, "0");
  return `${d > 0 ? d + (A() ? "ي " : "d ") : ""}${p(h)}:${p(m)}:${p(s)}`;
}
let timer = null;
function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
function startTimer(end) {
  stopTimer();
  const node = () => document.getElementById("amx-pay-countdown");
  if (!node() || !Number.isFinite(end)) return;
  const update = () => {
    const n = node();
    if (!n || document.getElementById("amx-pay-modal")?.hidden) { stopTimer(); return; }
    if (Date.now() >= end) { n.textContent = tx("منتهية", "Expired"); n.closest(".pay-timer")?.classList.add("off"); stopTimer(); return; }
    n.textContent = countdown(end);
  };
  update();
  timer = setInterval(update, 1000);
}

/* Instruction text written by the store owner (admin → payment methods → instructions).
   Supported: blank line = new paragraph, "- item" bullets, "1. item" numbered list, **bold**, https:// links. */
function fmtText(raw) {
  const src = String(raw ?? "").replace(/\r/g, "").trim();
  if (!src) return "";
  const inline = (line) => esc(line)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(https:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  const out = []; let list = null;
  const flush = () => { if (list) { out.push(`<${list.tag}>${list.items.join("")}</${list.tag}>`); list = null; } };
  for (const line of src.split("\n")) {
    const t = line.trim();
    const ul = /^[-•*]\s+(.+)$/.exec(t), ol = /^\d+[.)]\s+(.+)$/.exec(t);
    if (ul || ol) {
      const tag = ul ? "ul" : "ol";
      if (!list || list.tag !== tag) { flush(); list = { tag, items: [] }; }
      list.items.push(`<li>${inline((ul || ol)[1])}</li>`);
    } else { flush(); if (t) out.push(`<p>${inline(t)}</p>`); }
  }
  flush();
  return out.join("");
}

/* ---------- API ---------- */
async function createOrder(orderId, methodId, key = idem(`order:${orderId}`)) {
  if (!user()) throw new Error("auth_required");
  const c = await getConfig();
  if (c?.on !== true) throw new Error("payments_v2_disabled");
  if (!Array.isArray(c.methods) || !c.methods.some(m => m.id === methodId && m.kind === "manual")) throw new Error("payment_method_unavailable");
  const r = await rpc("payment_create", { p_order_id: String(orderId), p_method: String(methodId), p_key: key });
  idemClear(`order:${orderId}`);
  return r;
}
async function payWithWallet(orderId, key = idem(`wallet-order:${orderId}`)) {
  if (!user()) throw new Error("auth_required");
  const c = await getConfig();
  if (c?.on !== true) throw new Error("payments_v2_disabled");
  const r = await rpc("payment_create_wallet_pay", { p_order_id: String(orderId), p_key: key });
  idemClear(`wallet-order:${orderId}`);
  return r;
}
async function createTopup(amountBase, methodId, section = "main") {
  if (!user()) throw new Error("auth_required");
  const c = await getConfig();
  if (c?.on !== true) throw new Error("payments_v2_disabled");
  const n = Number(amountBase);
  if (!Number.isFinite(n) || n <= 0) throw new Error("invalid_amount");
  const m = (c.methods || []).find(x => x.id === methodId && x.kind === "manual");
  if (!m) throw new Error("payment_method_unavailable");
  const scope = `topup:${section}:${methodId}:${n}`;
  const r = await rpc("payment_create_topup", { p_amount: n, p_method: String(methodId), p_key: idem(scope) });
  idemClear(scope);
  return r;
}
async function instructions(paymentId) { return rpc("payment_instructions", { p_id: paymentId }); }
async function status(paymentId) { return rpc("payments_status", { p_id: paymentId }); }
async function statusForOrder(orderId) { return rpc("payments_status_for_order", { p_order_id: String(orderId) }); }
async function uploadProof(paymentId, file) {
  const u = user();
  if (!u?.id) throw new Error("auth_required");
  if (!file || !/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error("proof_image_only");
  if (file.size > 12 * 1024 * 1024) throw new Error("proof_file_too_large");
  const blob = await T().proofBlob(file);
  if (!blob || blob.size > 5 * 1024 * 1024) throw new Error("proof_file_too_large");
  const token = await T().token();
  if (!token) throw new Error("session_expired");
  const ext = file.type.toLowerCase() === "image/png" ? "png" : file.type.toLowerCase() === "image/webp" ? "webp" : "jpg";
  const path = `${u.id}/pay-${String(paymentId).replace(/[^a-zA-Z0-9-]/g, "")}-${uuid().replace(/-/g, "").slice(0,12)}.${ext}`;
  const up = await T().putProof(token, path, blob);
  if (!up.ok) throw new Error(`proof_upload_failed_${up.status}`);
  const hashed = await T().edge("payment-proof-hash", { p_id: String(paymentId), p_path: path });
  if (!hashed.ok) {
    const text = await hashed.text().catch(() => "");
    throw new Error(`proof_verify_failed_${hashed.status}: ${text.slice(0,120)}`);
  }
  return true;
}
async function submit(paymentId, txRef) {
  return rpc("payment_submit", { p_id: paymentId, p_tx_ref: txRef?.trim() || null });
}
async function askRefund(paymentId, reason) {
  return rpc("refund_request_customer", { p_payment_id: paymentId, p_reason: String(reason || "customer request").slice(0,300) });
}
async function cancel(paymentId) { return rpc("payment_cancel", { p_id: paymentId }); }

/* ---------- payment sheet ---------- */
const drafts = {};      // paymentId -> { txref, needRef, preview }
const draftOf = (id) => (drafts[id] ||= { txref: "", needRef: false, preview: "" });
const ICON = {
  upload: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4m0 0L7 9m5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  copy: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
  clock: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
};
function setError(message) {
  const el = document.getElementById("amx-pay-err");
  if (!el) return;
  el.textContent = message || "";
  el.hidden = !message;
  if (message) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
function steps(done, current) {
  const labels = [tx("حوّل المبلغ", "Transfer"), tx("ارفع الإثبات", "Upload receipt"), tx("مراجعة الإدارة", "Admin review")];
  return `<ol class="pay-steps" aria-label="${tx("خطوات الدفع", "Payment steps")}">${labels.map((l, i) => {
    const cls = i < done ? "done" : i === current ? "now" : "";
    return `<li class="${cls}"${i === current ? ' aria-current="step"' : ""}><b>${i < done ? ICON.check.replace('width="22" height="22"', 'width="14" height="14"') : i + 1}</b><span>${l}</span></li>`;
  }).join("")}</ol>`;
}
async function renderPayment(paymentId, { silent = false } = {}) {
  showModal();
  const d = draftOf(paymentId);
  const typed = document.getElementById("amx-pay-txref");
  if (typed) d.txref = typed.value;
  if (!silent) content(`<div class="pay-skel"><i></i><i></i><i></i></div>`);
  const p = await status(paymentId);
  const state = p.status;
  const live = ["awaiting_payment", "proof_submitted"].includes(state);
  let ins = null;
  if (["awaiting_payment", "proof_submitted", "under_review"].includes(state)) {
    try { ins = await instructions(paymentId); } catch (error) { if (state === "awaiting_payment") throw error; }
  }
  const meta = (await getConfig()).methods?.find(m => m.id === ins?.method) || {};
  const methodName = tx(meta.config?.ar || meta.ar || ins?.method || "طريقة الدفع", meta.config?.en || meta.en || ins?.method || "Payment method");
  const logo = meta.config?.logo || meta.config?.logo_url || "";
  const end = ts(ins?.expires_at || p.expires_at);
  const rate = Number(ins?.fx_rate ?? p.fx_rate ?? 1);
  const needsProof = ins?.requires_proof !== false;
  const hasProof = !!p.proof_path;
  const needRef = ins?.requires_tx_ref === true || meta.requires_tx_ref === true || d.needRef;
  if (ins?.tx_ref && !d.txref) d.txref = ins.tx_ref;

  const expired = Number.isFinite(end) && end <= Date.now() && live;
  const done = state === "captured" || state === "refunded" || state === "refunded_partially" ? 3 : state === "under_review" ? 2 : hasProof ? 2 : 0;
  const current = done === 3 ? -1 : state === "under_review" ? 2 : hasProof ? 2 : 0;

  const account = ins?.acc
    ? `<div class="pay-acc"><div><small>${tx("الحساب أو العنوان", "Account / address")}</small><bdi dir="ltr" id="amx-pay-acc">${esc(ins.acc)}</bdi></div><button type="button" class="pay-copy" data-pay-action="copy-account" data-value="${esc(ins.acc)}">${ICON.copy}<span>${tx("نسخ", "Copy")}</span></button></div>`
    : ins ? `<p class="pay-note warn">${tx("لم يُضبط عنوان لهذه الوسيلة بعد. راجع الإدارة قبل التحويل.", "No account is configured for this method yet. Contact support before transferring.")}</p>` : "";
  const body = ins ? fmtText(A() ? ins.da : (ins.de || ins.da)) : "";
  const text = body ? `<div class="pay-text">${body}</div>` : "";

  const proofBlock = live && needsProof ? `
    <div class="pay-block"><div class="pay-label">${tx("إثبات التحويل", "Transfer receipt")} <em>${tx("(صورة)", "(image)")}</em></div>
    <label class="pay-drop${hasProof ? " has" : ""}" id="amx-pay-drop">
      <input type="file" class="pay-sr" accept="image/jpeg,image/png,image/webp" data-pay-action="proof" data-id="${esc(paymentId)}">
      ${d.preview ? `<img src="${esc(d.preview)}" alt="" class="pay-thumb">` : `<span class="pay-dic">${hasProof ? ICON.check : ICON.upload}</span>`}
      <span class="pay-dtx"><b>${hasProof ? tx("تم إرفاق الإثبات بنجاح", "Receipt attached") : tx("اضغط لاختيار صورة الإيصال", "Tap to choose the receipt image")}</b><small>${hasProof ? tx("اضغط هنا لاستبدال الصورة قبل الإرسال", "Tap to replace it before submitting") : "JPG · PNG · WEBP"}</small></span>
    </label></div>` : "";
  const refBlock = live ? `
    <div class="pay-block"><label class="pay-label" for="amx-pay-txref">${tx("رقم العملية / TXID", "Transaction ID / TXID")} <em>${needRef ? tx("(مطلوب)", "(required)") : tx("(اختياري)", "(optional)")}</em></label>
    <input id="amx-pay-txref" class="pay-input" maxlength="100" autocomplete="off" autocapitalize="off" spellcheck="false" dir="ltr" value="${esc(d.txref)}" placeholder="${tx("الصق رقم العملية هنا", "Paste the transaction ID here")}"${needRef ? ' aria-required="true"' : ""}></div>` : "";
  const actions = live ? `
    <p class="pay-err" id="amx-pay-err" role="alert" hidden></p>
    <div class="pay-actions">
      <button type="button" class="pay-primary" data-pay-action="submit" data-id="${esc(paymentId)}" ${expired || (needsProof && !hasProof) ? "disabled" : ""}><span class="pay-spin" aria-hidden="true"></span><span class="lbl">${tx("تم التحويل — أرسل للمراجعة", "I've transferred — submit for review")}</span></button>
      ${needsProof && !hasProof ? `<p class="pay-hint">${tx("أرفق صورة الإثبات لتفعيل الزر.", "Attach the receipt to enable the button.")}</p>` : ""}
      <button class="pay-ghost" type="button" data-pay-action="cancel" data-id="${esc(paymentId)}">${tx("إلغاء الدفعة", "Cancel payment")}</button>
    </div>` : "";
  const review = state === "under_review" ? `<div class="pay-done"><span>${ICON.check}</span><div><b>${tx("تم استلام طلبك وهو قيد المراجعة", "Received — your payment is under review")}</b><p>${tx("سنؤكد الدفع فور التحقق من وصول المبلغ. يمكنك إغلاق هذه النافذة.", "We'll confirm as soon as the transfer is verified. You can close this window.")}</p></div></div>` : "";
  const refund = ["captured", "refunded_partially"].includes(state) ? `<button type="button" class="pay-ghost" data-pay-action="refund" data-id="${esc(paymentId)}">${tx("طلب استرداد إلى المحفظة", "Request wallet refund")}</button>` : "";
  const showFx = rate !== 1 || ins?.pay_currency === "SYP" || p.pay_currency === "SYP";
  const showBase = Number(ins?.amount_base ?? p.amount_base) !== Number(ins?.pay_amount ?? p.pay_amount) || (ins?.pay_currency || p.pay_currency) !== "USDT";

  content(`
    <div class="pay-top"><span class="pay-pill s-${esc(state)}">${esc(statusText(state))}</span>${live && Number.isFinite(end) ? `<span class="pay-timer${expired ? " off" : ""}">${ICON.clock}<span>${tx("ينتهي خلال", "Expires in")}</span> <bdi id="amx-pay-countdown" dir="ltr">${countdown(end)}</bdi></span>` : ""}</div>
    <div class="pay-hero"><small>${tx("المبلغ المطلوب", "Amount due")}</small><bdi class="pay-amt" dir="ltr">${amount(ins?.pay_amount ?? p.pay_amount, ins?.pay_currency || p.pay_currency)}</bdi>${showBase ? `<span class="pay-base">${tx("المبلغ الأساسي", "Base amount")}: <bdi dir="ltr">${amount(ins?.amount_base ?? p.amount_base, "USDT")}</bdi></span>` : ""}${showFx ? `<span class="pay-base">${tx("سعر الصرف المثبّت", "Locked FX rate")}: <bdi dir="ltr">1 USDT = ${esc(rate)}</bdi></span>` : ""}</div>
    ${steps(done, current)}
    ${ins ? `<section class="pay-card"><div class="pay-method">${logo ? `<img src="${esc(logo)}" alt="" loading="lazy">` : ""}<h3>${esc(methodName)}</h3></div>${account}${text}</section>` : ""}
    ${expired ? `<p class="pay-note warn">${tx("انتهت مهلة هذه الدفعة. أنشئ طلباً جديداً للمتابعة.", "This payment has expired. Create a new order to continue.")}</p>` : ""}
    ${proofBlock}${refBlock}${actions}${review}${refund}
    <p class="pay-note">${tx("لا يتم تأكيد الدفع لمجرد رفع صورة. تنتقل الدفعة للمراجعة ثم يُتحقق من وصول المبلغ.", "Uploading a receipt does not confirm payment. The transfer is reviewed and verified first.")}</p>`);
  if (live) startTimer(end); else stopTimer();
  return p;
}
async function showPayment(paymentId) { return renderPayment(paymentId); }
function renderOrderSlot(slot) {
  const orderId = slot.dataset.orderId;
  if (!orderId) return;
  statusForOrder(orderId).then(p => {
    if (!p) { slot.innerHTML = `<p>${tx("لم تُوجد دفعة لهذا الطلب. إذا لم تُكمل الدفع، ارجع إلى السلة وأعد المحاولة.", "No payment was found for this order. If checkout failed, retry from the cart.")}</p>`; return; }
    slot.innerHTML = `<section class="amx-pay-inline"><div><small>${tx("حالة الدفع", "Payment status")}</small><b>${esc(statusText(p.status))}</b></div><div><small>${tx("المبلغ", "Amount")}</small><bdi dir="ltr">${amount(p.pay_amount, p.pay_currency)}</bdi></div><button type="button" data-pay-action="open" data-id="${esc(p.id)}">${tx("التفاصيل / رفع الإثبات", "Details / upload proof")}</button>${["captured","refunded","refunded_partially"].includes(p.status) ? `<p>${tx("إجمالي المسترد", "Refunded total")}: ${amount(p.refunded_total, "USDT")}</p>` : ""}</section>`;
  }).catch(err => { slot.innerHTML = `<p>${tx("تعذّر تحميل الدفعة. أعد تحميل الصفحة بعد تسجيل الدخول.", "Could not load payment. Reload after signing in.")}</p>`; console.warn("AMXPay status", err); });
}
async function openFromOrder() {
  const slot = document.getElementById("amx-payment-slot");
  if (slot) renderOrderSlot(slot);
}

/* ---------- events ---------- */
document.addEventListener("click", async event => {
  const button = event.target.closest("[data-pay-action]");
  if (!button || button.matches("input")) return;
  const action = button.dataset.payAction;
  const id = button.dataset.id;
  try {
    if (action === "close") { closeModal(); return; }
    if (action === "open") { await renderPayment(button.dataset.id); return; }
    if (action === "copy-account") {
      await navigator.clipboard.writeText(button.dataset.value || "");
      const lbl = button.querySelector("span");
      if (lbl) { const old = lbl.textContent; lbl.textContent = tx("تم النسخ ✓", "Copied ✓"); button.classList.add("ok"); setTimeout(() => { lbl.textContent = old; button.classList.remove("ok"); }, 1600); }
      return;
    }
    if (action === "cancel") { if (!confirm(tx("هل تريد إلغاء هذه الدفعة؟", "Cancel this payment?"))) return; await cancel(id); await renderPayment(id); return; }
    if (action === "submit") {
      const d = draftOf(id);
      const ref = (document.getElementById("amx-pay-txref")?.value || "").trim();
      d.txref = ref;
      setError("");
      if (d.needRef || document.querySelector('#amx-pay-txref[aria-required="true"]')) {
        if (!ref) { setError(friendly("reference_required")); document.getElementById("amx-pay-txref")?.focus(); return; }
      }
      button.disabled = true; button.classList.add("busy");
      try {
        await submit(id, ref || null);
      } catch (error) {
        button.disabled = false; button.classList.remove("busy");
        if (String(error.message).includes("reference_required")) {
          d.needRef = true;
          await renderPayment(id, { silent: true });
          setError(friendly(error));
          document.getElementById("amx-pay-txref")?.focus();
          return;
        }
        throw error;
      }
      await renderPayment(id, { silent: true });
      T().toast(tx("أُرسلت الدفعة للمراجعة", "Payment submitted for review"));
      return;
    }
    if (action === "refund") {
      const reason = prompt(tx("سبب طلب الاسترداد (سيُراجع من الإدارة):", "Reason for refund request:"), tx("أرغب باسترداد المبلغ إلى المحفظة", "Please refund to wallet"));
      if (reason === null) return;
      await askRefund(id, reason); T().toast(tx("تم إنشاء طلب الاسترداد", "Refund request created")); await renderPayment(id, { silent: true }); return;
    }
  } catch (error) {
    console.error("AMXPay", error);
    if (document.getElementById("amx-pay-err")) setError(friendly(error)); else T()?.toast?.(friendly(error), "e");
  }
});
document.addEventListener("change", async event => {
  const input = event.target.closest('input[data-pay-action="proof"]');
  if (!input || !input.files?.[0]) return;
  const id = input.dataset.id;
  const file = input.files[0];
  const d = draftOf(id);
  const drop = document.getElementById("amx-pay-drop");
  setError("");
  drop?.classList.add("busy");
  const label = drop?.querySelector(".pay-dtx b"); if (label) label.textContent = tx("جارٍ رفع الصورة…", "Uploading…");
  input.disabled = true;
  try {
    await uploadProof(id, file);
    if (d.preview) { try { URL.revokeObjectURL(d.preview); } catch {} }
    try { d.preview = URL.createObjectURL(file); } catch { d.preview = ""; }
    T().toast(tx("تم رفع الإثبات بنجاح", "Receipt uploaded"));
    await renderPayment(id, { silent: true });
  } catch (error) {
    console.error("AMXPay", error);
    input.disabled = false; input.value = "";
    drop?.classList.remove("busy");
    if (label) label.textContent = tx("اضغط لاختيار صورة الإيصال", "Tap to choose the receipt image");
    setError(friendly(error));
  }
});
window.addEventListener("hashchange", () => { closeModal(); openFromOrder(); });
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", openFromOrder, { once: true }); else openFromOrder();
window.AMXPay = { getConfig, idempotencyKey: idem, createOrder, payWithWallet, createTopup, showPayment, status, statusForOrder, askRefund };
