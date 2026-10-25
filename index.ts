// telegram-auth — تسجيل الدخول/الربط عبر تيليغرام (Edge Function)
//
// الأسرار المطلوبة (Supabase > Edge Functions > Secrets):
//   TELEGRAM_BOT_TOKEN   توكن بوت تسجيل الدخول (من @BotFather). لا تضعه في الواجهة أبداً.
// المتغيرات التالية يوفّرها Supabase تلقائياً: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
//
// النشر:  supabase functions deploy telegram-auth --no-verify-jwt
//   (--no-verify-jwt لأن الزائر غير مسجَّل أصلاً؛ الأمان من توقيع تيليغرام HMAC لا من JWT)
//
// الطلب (POST JSON):
//   { action: "login", data: <tgAuthResult>, ref?: "CODE" }   تسجيل دخول/إنشاء حساب
//   { action: "link",  data: <tgAuthResult> }                  ربط تيليغرام بحساب مسجّل (يتطلب Authorization: Bearer <access_token>)
// الرد: { ok: true, session: {...}, isNew: boolean }  أو { ok: false, error: "code" }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ORIGINS = ["https://amarix007.store", "https://www.amarix007.store"];
const MAX_AGE_SEC = 300; // صلاحية توقيع تيليغرام: 5 دقائق
const EMAIL_DOMAIN = "telegram.amarix007.store"; // بريد تقني للحسابات التي لا بريد حقيقي لها

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function hmacHex(key: ArrayBuffer, msg: string) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}
function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/** التحقق من توقيع تيليغرام: HMAC-SHA256(data_check_string) بمفتاح SHA256(bot_token) */
async function verifyTelegram(d: Record<string, unknown>): Promise<{ ok: boolean; err?: string }> {
  if (!BOT_TOKEN) return { ok: false, err: "not_configured" };
  const hash = String(d.hash ?? "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) return { ok: false, err: "bad_hash" };
  const keys = Object.keys(d).filter((k) => k !== "hash");
  // يُدخل كل الحقول المستلمة (عدا hash) في السلسلة كما تنص وثائق تيليغرام، حتى لو أضاف تيليغرام حقولاً جديدة مستقبلاً
  const dcs = keys.filter((k) => d[k] !== undefined && d[k] !== null).sort().map((k) => `${k}=${d[k]}`).join("\n");
  const secret = await crypto.subtle.digest("SHA-256", enc.encode(BOT_TOKEN));
  const expected = await hmacHex(secret, dcs);
  if (!safeEq(expected, hash)) return { ok: false, err: "bad_signature" };
  const age = Math.floor(Date.now() / 1000) - Number(d.auth_date);
  if (!Number.isFinite(age) || age > MAX_AGE_SEC || age < -60) return { ok: false, err: "expired" };
  if (!/^\d{1,15}$/.test(String(d.id))) return { ok: false, err: "bad_id" };
  return { ok: true };
}

function cors(origin: string | null) {
  const o = origin && ORIGINS.includes(origin) ? origin : ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": o,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const json = (body: unknown, status: number, h: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...h, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const h = cors(origin);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405, h);
  if (origin && !ORIGINS.includes(origin)) return json({ ok: false, error: "origin" }, 403, h);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 400, h); }
  const action = body?.action === "link" ? "link" : "login";
  const data = body?.data;
  if (!data || typeof data !== "object") return json({ ok: false, error: "bad_data" }, 400, h);

  const v = await verifyTelegram(data);
  if (!v.ok) return json({ ok: false, error: v.err }, 401, h);

  const admin = createClient(SB_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  // ضد إعادة الاستعمال: كل توقيع يُقبل مرة واحدة فقط
  const seen = await admin.from("telegram_auth_seen").insert({ hash: String(data.hash).toLowerCase() });
  if (seen.error) return json({ ok: false, error: seen.error.code === "23505" ? "replay" : "server" }, seen.error.code === "23505" ? 401 : 500, h);
  if (Math.random() < 0.05) admin.rpc("telegram_auth_cleanup").then(() => {}, () => {});

  const tgId = Number(data.id);
  const first = String(data.first_name ?? "").slice(0, 60);
  const last = String(data.last_name ?? "").slice(0, 60);
  const fullName = (first + " " + last).trim() || (data.username ? "@" + data.username : "Telegram " + tgId);
  const username = data.username ? String(data.username).slice(0, 64) : null;

  // ---- ربط حساب موجود ----
  if (action === "link") {
    const tk = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(tk);
    if (!u?.user) return json({ ok: false, error: "no_session" }, 401, h);
    const owner = await admin.from("telegram_identities").select("user_id").eq("telegram_id", tgId).maybeSingle();
    if (owner.data && owner.data.user_id !== u.user.id) return json({ ok: false, error: "tg_taken" }, 409, h);
    const mine = await admin.from("telegram_identities").select("telegram_id").eq("user_id", u.user.id).maybeSingle();
    if (mine.data && Number(mine.data.telegram_id) !== tgId) return json({ ok: false, error: "already_linked" }, 409, h);
    const ins = await admin.from("telegram_identities").upsert(
      { telegram_id: tgId, user_id: u.user.id, username, first_name: first, last_login_at: new Date().toISOString() },
      { onConflict: "telegram_id" },
    );
    if (ins.error) return json({ ok: false, error: "server" }, 500, h);
    return json({ ok: true, linked: true }, 200, h);
  }

  // ---- تسجيل دخول / إنشاء حساب ----
  let userId: string | null = null;
  let isNew = false;
  const idn = await admin.from("telegram_identities").select("user_id").eq("telegram_id", tgId).maybeSingle();
  if (idn.error) return json({ ok: false, error: "server" }, 500, h);
  if (idn.data) {
    userId = idn.data.user_id;
  } else {
    const ref = typeof body?.ref === "string" && /^[A-Za-z0-9]{4,16}$/.test(body.ref) ? body.ref : "";
    const created = await admin.auth.admin.createUser({
      email: `tg${tgId}@${EMAIL_DOMAIN}`,
      email_confirm: true,
      user_metadata: { full_name: fullName, name: fullName, ref, provider_tg: true, telegram_id: tgId, telegram_username: username },
    });
    if (created.error || !created.data?.user) return json({ ok: false, error: "create_failed" }, 500, h);
    userId = created.data.user.id;
    isNew = true;
    const ins = await admin.from("telegram_identities").insert({ telegram_id: tgId, user_id: userId, username, first_name: first });
    if (ins.error) {
      // سباق نادر: أُنشئ الربط من طلب آخر — احذف الحساب اليتيم وأعد المحاولة
      await admin.auth.admin.deleteUser(userId);
      return json({ ok: false, error: "retry" }, 409, h);
    }
  }
  await admin.from("telegram_identities").update({ username, first_name: first, last_login_at: new Date().toISOString() }).eq("telegram_id", tgId);

  // جلسة حقيقية: رابط سحري يُستهلك فوراً على الخادم (لا يصل المتصفح أي رابط)
  const got = await admin.auth.admin.getUserById(userId!);
  const email = got.data?.user?.email;
  if (!email) return json({ ok: false, error: "no_email" }, 500, h);
  if ((got.data.user as any).banned_until && new Date((got.data.user as any).banned_until) > new Date())
    return json({ ok: false, error: "banned" }, 403, h);
  const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const th = link.data?.properties?.hashed_token;
  if (link.error || !th) return json({ ok: false, error: "link_failed" }, 500, h);
  const anon = createClient(SB_URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const ver = await anon.auth.verifyOtp({ type: "magiclink", token_hash: th });
  if (ver.error || !ver.data?.session) return json({ ok: false, error: "verify_failed" }, 500, h);

  return json({ ok: true, isNew, session: ver.data.session }, 200, h);
});
