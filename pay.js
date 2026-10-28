/* AMARIX007 Payments v2 — same-origin ES module, no inline handlers. */
const T = () => window.AMXPayTransport;
const A = () => T()?.lang?.() === "ar";
const tx = (ar, en) => A() ? ar : en;
const esc = (v) => T()?.ex ? T().ex(String(v ?? "")) : String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
const STATUS = {
  created: ["تم إنشاء الدفعة", "Created"], awaiting_payment: ["بانتظار التحويل", "Awaiting transfer"],
  proof_submitted: ["تم إرفاق الإثبات", "Proof submitted"], under_review: ["قيد المراجعة", "Under review"],
  captured: ["تم تأكيد الدفع", "Payment captured"], rejected: ["مرفوضة", "Rejected"],
  cancelled: ["ملغاة", "Cancelled"], expired: ["انتهت صلاحيتها", "Expired"],
  refunded_partially: ["استرداد جزئي", "Partially refunded"], refunded: ["مستردة", "Refunded"],
};
const statusText = (s) => (STATUS[s] || [s || "غير معروف", s || "Unknown"])[A() ? 0 : 1];
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
  modal.innerHTML = `<section class="amx-pay-dialog"><header><h2 id="amx-pay-title">${tx("تعليمات الدفع", "Payment instructions")}</h2><button type="button" class="amx-pay-close" data-pay-action="close" aria-label="${tx("إغلاق", "Close")}">×</button></header><div id="amx-pay-content"><p>${tx("جارٍ التحميل…", "Loading…")}</p></div></section>`;
  document.body.append(modal);
  return modal;
}
function closeModal() { const m = document.getElementById("amx-pay-modal"); if (m) m.hidden = true; }
function showModal() { const m = ensureModal(); m.hidden = false; m.querySelector("[data-pay-action=close]")?.focus(); }
function content(html) { const slot = document.getElementById("amx-pay-content"); if (slot) slot.innerHTML = html; }
function amount(v, currency) { const n = Number(v); return `${Number.isFinite(n) ? n.toLocaleString(A() ? "ar" : "en", {maximumFractionDigits: 6}) : "—"} ${esc(currency || "")}`; }
function countdown(expires) {
  if (!expires) return "—";
  const left = Math.max(0, Math.floor((Date.parse(expires) - Date.now()) / 1000));
  return `${String(Math.floor(left / 3600)).padStart(2,"0")}:${String(Math.floor(left % 3600 / 60)).padStart(2,"0")}:${String(left % 60).padStart(2,"0")}`;
}
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
async function renderPayment(paymentId) {
  showModal();
  content(`<p>${tx("جارٍ تحميل حالة الدفعة…", "Loading payment status…")}</p>`);
  const p = await status(paymentId);
  const state = p.status;
  let ins = null;
  if (["awaiting_payment", "proof_submitted", "under_review"].includes(state)) {
    try { ins = await instructions(paymentId); } catch (error) { if (state === "awaiting_payment") throw error; }
  }
  const meta = (await getConfig()).methods?.find(m => m.id === ins?.method) || {};
  const methodName = tx(meta.config?.ar || meta.ar || ins?.method || "طريقة الدفع", meta.config?.en || meta.en || ins?.method || "Payment method");
  const expiry = ins?.expires_at || p.expires_at;
  const rate = Number(ins?.fx_rate ?? p.fx_rate ?? 1);
  const account = ins?.acc ? `<div class="amx-pay-account"><small>${tx("الحساب أو العنوان", "Account / address")}</small><bdi dir="ltr">${esc(ins.acc)}</bdi><button type="button" data-pay-action="copy-account" data-value="${esc(ins.acc)}">${tx("نسخ", "Copy")}</button></div>` : `<p class="amx-pay-note">${tx("لم يُضبط عنوان لهذه الوسيلة بعد. راجع الإدارة قبل التحويل.", "No account is configured for this method yet. Contact support before transferring.")}</p>`;
  const proof = ins?.requires_proof !== false && ["awaiting_payment", "proof_submitted"].includes(state)
    ? `<label class="amx-pay-file">${tx("إرفاق إثبات التحويل (صورة)", "Attach transfer receipt (image)")}<input type="file" accept="image/jpeg,image/png,image/webp" data-pay-action="proof" data-id="${esc(paymentId)}"></label>` : "";
  const txRef = ["awaiting_payment", "proof_submitted"].includes(state) ? `<label class="amx-pay-field"><span>${tx("رقم العملية / TXID (اختياري)", "Transaction reference / TXID (optional)")}</span><input id="amx-pay-txref" maxlength="100" autocomplete="off"></label>` : "";
  const actions = ["awaiting_payment", "proof_submitted"].includes(state)
    ? `<div class="amx-pay-actions">${ins?.requires_proof !== false ? "" : ""}<button type="button" data-pay-action="submit" data-id="${esc(paymentId)}" ${ins?.requires_proof !== false && !p.proof_path ? "disabled" : ""}>${tx("تم التحويل — أرسل للمراجعة", "I transferred — submit for review")}</button><button class="secondary" type="button" data-pay-action="cancel" data-id="${esc(paymentId)}">${tx("إلغاء الدفعة", "Cancel payment")}</button></div>` : "";
  const refund = ["captured", "refunded_partially"].includes(state) ? `<button type="button" class="secondary" data-pay-action="refund" data-id="${esc(paymentId)}">${tx("طلب استرداد إلى المحفظة", "Request wallet refund")}</button>` : "";
  const showFx = rate !== 1 || ins?.pay_currency === "SYP" || p.pay_currency === "SYP";
  content(`<div class="amx-pay-state"><span>${tx("الحالة", "Status")}</span><b>${esc(statusText(state))}</b></div><div class="amx-pay-grid"><div><small>${tx("المبلغ المطلوب", "Amount due")}</small><bdi dir="ltr">${amount(ins?.pay_amount ?? p.pay_amount, ins?.pay_currency || p.pay_currency)}</bdi></div><div><small>${tx("المبلغ الأساسي", "Base amount")}</small><bdi dir="ltr">${amount(ins?.amount_base ?? p.amount_base, "USDT")}</bdi></div></div>${showFx ? `<p class="amx-pay-note">${tx("سعر الصرف المثبّت عند إنشاء الدفعة", "FX rate frozen when payment was created")}: <bdi dir="ltr">1 USDT = ${esc(rate)}</bdi></p>` : ""}${expiry && ["awaiting_payment", "proof_submitted"].includes(state) ? `<p class="amx-pay-expiry">${tx("ينتهي خلال", "Expires in")}: <bdi id="amx-pay-countdown" dir="ltr">${countdown(expiry)}</bdi></p>` : ""}<h3>${esc(methodName)}</h3>${ins ? account + (A() ? esc(ins.da || "") : esc(ins.de || "")) : ""}${proof}${txRef}${actions}${refund}<p class="amx-pay-note">${tx("لا يتم تأكيد الدفع لمجرد رفع صورة. تنتقل الدفعة للمراجعة ثم يُتحقق من وصول المبلغ.", "Uploading a receipt does not confirm payment. The transfer must be reviewed and verified.")}</p>`);
  if (expiry && ["awaiting_payment", "proof_submitted"].includes(state)) {
    const el = document.getElementById("amx-pay-countdown");
    if (el) {
      const end = Date.parse(expiry);
      const update = () => { const node = document.getElementById("amx-pay-countdown"); if (!node) return; node.textContent = countdown(end); if (Date.now() >= end) node.textContent = tx("منتهية", "Expired"); };
      update();
      const timer = setInterval(() => { if (!document.getElementById("amx-pay-modal")?.hidden && document.getElementById("amx-pay-countdown")) update(); else clearInterval(timer); }, 1000);
    }
  }
  const file = document.querySelector('#amx-pay-content input[data-pay-action="proof"]');
  if (file && p.proof_path) file.disabled = true;
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
document.addEventListener("click", async event => {
  const button = event.target.closest("[data-pay-action]");
  if (!button) return;
  const action = button.dataset.payAction;
  try {
    if (action === "close") { closeModal(); return; }
    if (action === "open") { await renderPayment(button.dataset.id); return; }
    if (action === "copy-account") { await navigator.clipboard.writeText(button.dataset.value || ""); T().toast(tx("تم نسخ العنوان", "Address copied")); return; }
    const id = button.dataset.id;
    if (action === "cancel") { if (!confirm(tx("هل تريد إلغاء هذه الدفعة؟", "Cancel this payment?"))) return; await cancel(id); await renderPayment(id); return; }
    if (action === "submit") {
      button.disabled = true;
      await submit(id, document.getElementById("amx-pay-txref")?.value || null);
      await renderPayment(id);
      T().toast(tx("أُرسلت الدفعة للمراجعة", "Payment submitted for review")); return;
    }
    if (action === "refund") {
      const reason = prompt(tx("سبب طلب الاسترداد (سيُراجع من الإدارة):", "Reason for refund request:"), tx("أرغب باسترداد المبلغ إلى المحفظة", "Please refund to wallet"));
      if (reason === null) return;
      await askRefund(id, reason); T().toast(tx("تم إنشاء طلب الاسترداد", "Refund request created")); await renderPayment(id); return;
    }
  } catch (error) { T()?.toast?.(String(error.message || error).slice(0,180), "e"); console.error("AMXPay", error); }
});
document.addEventListener("change", async event => {
  const input = event.target.closest('input[data-pay-action="proof"]');
  if (!input || !input.files?.[0]) return;
  const id = input.dataset.id;
  input.disabled = true;
  try {
    await uploadProof(id, input.files[0]);
    T().toast(tx("رُفع الإثبات وحُسبت بصمته على الخادم", "Proof uploaded and hashed on the server"));
    await renderPayment(id);
  } catch (error) { input.disabled = false; T()?.toast?.(String(error.message || error).slice(0,180), "e"); }
});
window.addEventListener("hashchange", () => { closeModal(); openFromOrder(); });
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", openFromOrder, { once: true }); else openFromOrder();
window.AMXPay = { getConfig, idempotencyKey: idem, createOrder, payWithWallet, createTopup, showPayment, status, statusForOrder, askRefund };
