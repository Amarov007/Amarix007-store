// AMARIX007 — دخول تيليغرام. يتحقق من توقيع Telegram (HMAC) ثم يُصدر رمز دخول لمرة واحدة.
// النشر:  supabase functions deploy telegram-auth --no-verify-jwt
// الأسرار: supabase secrets set TELEGRAM_BOT_TOKEN=123456:ABC...
// (SUPABASE_URL و SUPABASE_SERVICE_ROLE_KEY تتوفر تلقائياً داخل الدوال)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const ORIGINS = ["https://amarix007.store", "https://www.amarix007.store"];
const MAX_AGE = 300; // ثوانٍ
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function hmac(key: ArrayBuffer | Uint8Array, msg: string) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(msg));
}
const cors = (o: string | null) => ({
  "Access-Control-Allow-Origin": o && ORIGINS.includes(o) ? o : ORIGINS[0],
  "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});
const json = (o: string | null, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(o), "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origin) });
  if (req.method !== "POST") return json(origin, { error: "method" }, 405);
  if (!origin || !ORIGINS.includes(origin)) return json(origin, { error: "origin" }, 403);

  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) return json(origin, { error: "not_configured" }, 503);

  let d: Record<string, string>;
  try { d = await req.json(); } catch { return json(origin, { error: "bad_request" }, 400); }
  const given = String(d.hash || "");
  if (!/^[a-f0-9]{64}$/.test(given) || !/^\d{1,16}$/.test(String(d.id || ""))) return json(origin, { error: "bad_request" }, 400);

  // 1) التحقق من التوقيع: secret = SHA256(bot_token)، والبيانات مرتبة أبجدياً
  const check = Object.keys(d).filter((k) => k !== "hash").sort().map((k) => `${k}=${d[k]}`).join("\n");
  const secret = await crypto.subtle.digest("SHA-256", enc.encode(token));
  const sig = hex(await hmac(secret, check));
  if (sig !== given) return json(origin, { error: "bad_signature" }, 401);

  // 2) حداثة النتيجة
  const age = Math.floor(Date.now() / 1000) - Number(d.auth_date || 0);
  if (!(age >= -30 && age <= MAX_AGE)) return json(origin, { error: "expired" }, 401);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 3) منع إعادة الاستخدام
  await sb.from("tg_auth_seen").delete().lt("seen_at", new Date(Date.now() - 86400_000).toISOString());
  const ins = await sb.from("tg_auth_seen").insert({ hash: given });
  if (ins.error) return json(origin, { error: "replayed" }, 401);

  // 4) المستخدم: بريد اصطناعي ثابت مشتق من رقم تيليغرام الموثَّق
  const email = `tg${d.id}@telegram.amarix007.store`;
  const name = [d.first_name, d.last_name].filter(Boolean).join(" ").slice(0, 80) || d.username || "Telegram";
  const created = await sb.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: name, name, telegram_id: String(d.id), telegram_username: d.username || "" },
  });
  if (created.error && !/already|registered|exists/i.test(created.error.message)) {
    return json(origin, { error: "create_failed" }, 500);
  }
  const link = await sb.auth.admin.generateLink({ type: "magiclink", email });
  const th = link.data?.properties?.hashed_token;
  if (link.error || !th) return json(origin, { error: "link_failed" }, 500);
  return json(origin, { token_hash: th, type: "magiclink" });
});
