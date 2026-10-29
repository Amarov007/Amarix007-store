// Telegram admin webhook. Every mutating action is confirmed in-chat and revalidated by a service-role-only SQL RPC.
import { createClient } from "npm:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

function safeEq(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}
const clean = (s: unknown, n = 500) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
async function telegram(token: string, chatId: string, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 3800), disable_web_page_preview: true }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("telegram_send_failed");
}
async function action(secret: string, chatId: string, p: Record<string, unknown>) {
  const { data, error } = await db.rpc("telegram_admin_action", {
    p_secret: secret,
    p_chat_id: chatId,
    p_action: p.action,
    p_target_id: p.target_id,
    p_value: p.value ?? null,
    p_note: p.note ?? null,
    p_amount: p.amount ?? null,
    p_currency: p.currency ?? null,
  });
  if (error) throw new Error(clean(error.message, 180) || "action_failed");
  return data as Record<string, unknown>;
}
async function pendingSummary() {
  const [orders, payments, topups, tickets] = await Promise.all([
    db.from("orders").select("id,status,payment_status,total,currency").eq("payment_status", "review").order("created_at", { ascending: false }).limit(5),
    db.from("payments").select("id,status,purpose,pay_amount,pay_currency").in("status", ["proof_submitted", "under_review"]).order("created_at", { ascending: false }).limit(5),
    db.from("wallet_topups").select("id,status,amount,pay_currency").in("status", ["pending", "review", "under_review"]).order("created_at", { ascending: false }).limit(5),
    db.from("support_tickets").select("id,status,subject").eq("status", "open").order("created_at", { ascending: false }).limit(5),
  ]);
  const errs = [orders.error, payments.error, topups.error, tickets.error].filter(Boolean);
  if (errs.length) throw new Error("تعذّر جلب بعض قوائم المراجعة من قاعدة البيانات.");
  const lines = ["📋 ملخص المراجعة الحالية"];
  lines.push("", `🛒 أحدث طلبات بانتظار مراجعة الدفع (حتى 5)`);
  for (const x of orders.data ?? []) lines.push(`• #${x.id} — ${x.status} / ${x.payment_status} — ${x.total} ${x.currency}`);
  lines.push("", `💳 أحدث دفعات v2 بانتظار المراجعة (حتى 5)`);
  for (const x of payments.data ?? []) lines.push(`• ${x.id} — ${x.status} — ${x.pay_amount} ${x.pay_currency} (${x.purpose})`);
  lines.push("", `👛 أحدث طلبات شحن محافظ (حتى 5)`);
  for (const x of topups.data ?? []) lines.push(`• #${x.id} — ${x.status} — ${x.amount} ${x.pay_currency}`);
  lines.push("", `🎫 أحدث تذاكر مفتوحة (حتى 5)`);
  for (const x of tickets.data ?? []) lines.push(`• #${x.id} — ${x.subject}`);
  return lines.join("\n");
}
async function handleCommand(text: string, secret: string, chatId: string) {
  const first = text.trim().split(/\s+/, 1)[0].split("@")[0].toLowerCase();
  const rest = text.trim().slice(text.trim().split(/\s+/, 1)[0].length).trim();
  const a = rest ? rest.split(/\s+/) : [];
  if (["/start", "/help"].includes(first)) {
    return "AMARIX007 — بوت إدارة آمن\n\n/pending — قوائم المراجعة\n/orders — الطلبات المفتوحة\n/order ID STATUS CONFIRM — تغيير حالة طلب (new/processing/done/cancelled)\n/ticket ID CONFIRM نص الرد — الرد على تذكرة\n/ticket_status ID STATUS CONFIRM — حالة تذكرة (open/answered/closed)\n/topup_approve ID CONFIRM [AMOUNT] — اعتماد شحن محفظة بعد التحقق من الإيصال\n/topup_reject ID CONFIRM [REASON] — رفض شحن\n/payment_prepare UUID — إصدار رمز اعتماد دفعة\n/payment_approve UUID TOKEN AMOUNT CURRENCY CONFIRM [NOTE] — اعتماد دفعة بعد التحقق الفعلي من التحويل\n\nكل إجراء يتحقق من هوية الدردشة وصلاحية الأدمن في قاعدة البيانات.";
  }
  if (first === "/pending") return await pendingSummary();
  if (first === "/orders") {
    const { data, error } = await db.from("orders").select("id,status,payment_status,total,currency,created_at")
      .in("status", ["new", "processing"]).order("created_at", { ascending: false }).limit(10);
    if (error) throw new Error("تعذّر جلب الطلبات.");
    return data?.length ? "🛒 الطلبات المفتوحة\n" + data.map(x => `• #${x.id} — ${x.status} / ${x.payment_status} — ${x.total} ${x.currency}`).join("\n") : "لا توجد طلبات مفتوحة.";
  }
  if (first === "/order") {
    if (a.length !== 3 || a[2] !== "CONFIRM") throw new Error("الاستخدام: /order ID STATUS CONFIRM");
    const r = await action(secret, chatId, { action: "order_status", target_id: a[0], value: a[1] });
    return `تم تحديث الطلب #${r.id} إلى ${r.status}.`;
  }
  if (first === "/ticket") {
    if (a.length < 3 || a[1] !== "CONFIRM") throw new Error("الاستخدام: /ticket ID CONFIRM نص الرد");
    const reply = rest.slice(a[0].length).trim().slice("CONFIRM".length).trim();
    if (!reply) throw new Error("أضف نص الرد بعد CONFIRM.");
    const r = await action(secret, chatId, { action: "ticket_reply", target_id: a[0], value: reply });
    return `تم حفظ الرد على التذكرة #${r.id}.`;
  }
  if (first === "/ticket_status") {
    if (a.length !== 3 || a[2] !== "CONFIRM") throw new Error("الاستخدام: /ticket_status ID open|answered|closed CONFIRM");
    const r = await action(secret, chatId, { action: "ticket_status", target_id: a[0], value: a[1] });
    return `تم تحديث التذكرة #${r.id} إلى ${r.status}.`;
  }
  if (first === "/topup_approve") {
    if (a.length < 2 || a[1] !== "CONFIRM" || a.length > 3) throw new Error("الاستخدام: /topup_approve ID CONFIRM [AMOUNT]");
    const amount = a.length === 3 ? Number(a[2]) : null;
    if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) throw new Error("المبلغ غير صالح.");
    const r = await action(secret, chatId, { action: "topup_approve", target_id: a[0], amount });
    return r.message === "first_approved_second_admin_required"
      ? "سُجلت الموافقة الأولى؛ يلزم أدمن ثانٍ حسب سياسة المبلغ."
      : "تم اعتماد الشحن وإضافة الرصيد إلى المحفظة.";
  }
  if (first === "/topup_reject") {
    if (a.length < 2 || a[1] !== "CONFIRM") throw new Error("الاستخدام: /topup_reject ID CONFIRM [REASON]");
    const note = rest.slice(a[0].length).trim().slice("CONFIRM".length).trim();
    await action(secret, chatId, { action: "topup_reject", target_id: a[0], note: note || "رفض عبر بوت الإدارة" });
    return `تم رفض طلب الشحن #${a[0]}.`;
  }
  if (first === "/payment_prepare") {
    if (a.length !== 1) throw new Error("الاستخدام: /payment_prepare UUID");
    const r = await action(secret, chatId, { action: "payment_prepare", target_id: a[0] });
    return `رمز اعتماد الدفعة ${a[0]} (صالح 10 دقائق بحسب إعداد الخادم):\n${r.token}\n\nتحقق من التحويل الفعلي قبل استخدامه.`;
  }
  if (first === "/payment_approve") {
    if (a.length < 5 || a[4] !== "CONFIRM") throw new Error("الاستخدام: /payment_approve UUID TOKEN AMOUNT CURRENCY CONFIRM [NOTE]");
    const amount = Number(a[2]);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("المبلغ غير صالح.");
    const note = a.slice(5).join(" ").slice(0, 500);
    const r = await action(secret, chatId, { action: "payment_approve", target_id: a[0], value: a[1], amount, currency: a[3], note });
    return r.message === "first_approved" ? "سُجلت الموافقة الأولى؛ يلزم مراجع آخر." : "تم اعتماد الدفعة وتسجيلها.";
  }
  return "أمر غير معروف. أرسل /help لعرض الأوامر.";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });
  const contentLength = Number(req.headers.get("content-length") || "0");
  if (contentLength > 16 * 1024) return new Response("too_large", { status: 413 });
  let update: Record<string, any>;
  try { update = await req.json(); } catch { return new Response("bad_json", { status: 400 }); }
  const { data: cfg, error } = await db.from("notify_settings")
    .select("enabled,telegram_bot_token,telegram_chat_id,telegram_webhook_secret").eq("id", 1).maybeSingle();
  if (error || !cfg?.enabled || !cfg.telegram_bot_token || !cfg.telegram_chat_id || !cfg.telegram_webhook_secret) {
    return new Response("not_configured", { status: 503 });
  }
  const given = req.headers.get("x-telegram-bot-api-secret-token") || "";
  if (!safeEq(given, String(cfg.telegram_webhook_secret))) return new Response("forbidden", { status: 403 });

  const msg = update.message;
  if (!msg || typeof msg.text !== "string") return new Response("ok", { status: 200 });
  const chatId = String(msg.chat?.id ?? "");
  const fromId = String(msg.from?.id ?? "");
  // This bot is intentionally bound to the configured private owner chat; group chats are not allowed to mutate state.
  if (msg.chat?.type !== "private" || !/^[1-9][0-9]{4,20}$/.test(chatId)
      || chatId !== String(cfg.telegram_chat_id) || fromId !== chatId) {
    return new Response("forbidden", { status: 403 });
  }
  try {
    const reply = await handleCommand(clean(msg.text, 3000), String(cfg.telegram_webhook_secret), chatId);
    await telegram(String(cfg.telegram_bot_token), chatId, reply);
  } catch (e) {
    await telegram(String(cfg.telegram_bot_token), chatId, "تعذّر تنفيذ الأمر: " + clean((e as Error).message || "خطأ غير معروف", 300));
  }
  return new Response("ok", { status: 200 });
});
