// Supabase Edge Function: send-push
// Called from the database (pg_net): one customer's order/ticket updates, or an admin broadcast to every device.
// VAPID keys and the shared secret are read from public.notify_settings (server-only table, no RLS policies).
// verify_jwt is OFF on purpose: callers are database triggers; authentication is the x-push-secret header below.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

type Sub = { id: number; endpoint: string; p256dh: string; auth: string };
type Msg = { user_id?: string; title?: string; body?: string; url?: string; tag?: string; broadcast?: boolean; broadcast_id?: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HASH_URL = /^#\/[A-Za-z0-9_\-\/?=&.%]{0,200}$/; // in-app hash routes only
const MAX_BODY = 8 * 1024;

// constant-time string comparison (no early exit on the first differing byte)
function safeEq(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

async function deliver(subs: Sub[], payload: string) {
  let sent = 0, failed = 0;
  const dead: number[] = [];
  for (let i = 0; i < subs.length; i += 40) {
    await Promise.all(subs.slice(i, i + 40).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: "high" });
        sent++;
      } catch (e) {
        failed++;
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.id); // device unsubscribed
      }
    }));
  }
  if (dead.length) await db.from("push_subscriptions").delete().in("id", dead);
  return { sent, failed, removed: dead.length };
}

async function run(p: Msg) {
  let subs: Sub[] = [];
  if (p.broadcast) {
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from("push_subscriptions").select("id,endpoint,p256dh,auth").order("id").range(from, from + 999);
      if (!data || !data.length) break;
      subs = subs.concat(data as Sub[]);
      if (data.length < 1000) break;
    }
  } else {
    const { data } = await db.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", p.user_id!);
    subs = (data || []) as Sub[];
  }
  const url = typeof p.url === "string" && HASH_URL.test(p.url) ? p.url : "#/orders";
  const payload = JSON.stringify({
    title: String(p.title).slice(0, 120),
    body: String(p.body || "").slice(0, 300),
    url,
    tag: String(p.tag || "amx").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "amx",
  });
  const r = await deliver(subs, payload);
  const bid = Number(p.broadcast_id);
  if (Number.isInteger(bid) && bid > 0) await db.from("push_broadcasts").update({ recipients: subs.length, sent: r.sent, failed: r.failed }).eq("id", bid);
  return r;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method", { status: 405 });

  // reject anonymous traffic before touching the database
  const given = req.headers.get("x-push-secret") || "";
  if (!given || given.length > 256) return new Response("forbidden", { status: 403 });
  const len = Number(req.headers.get("content-length") || "0");
  if (len > MAX_BODY) return new Response("too large", { status: 413 });

  const { data: cfg } = await db.from("notify_settings").select("push_secret,vapid_public,vapid_private").eq("id", 1).maybeSingle();
  if (!cfg || !cfg.push_secret || !safeEq(given, String(cfg.push_secret))) return new Response("forbidden", { status: 403 });
  if (!cfg.vapid_public || !cfg.vapid_private) return new Response("vapid not configured", { status: 500 });
  webpush.setVapidDetails("https://amarix007.store", cfg.vapid_public, cfg.vapid_private);

  let p: Msg;
  try { p = await req.json(); } catch { return new Response("bad json", { status: 400 }); }
  if (!p || typeof p !== "object" || !p.title || (!p.broadcast && !(typeof p.user_id === "string" && UUID.test(p.user_id)))) return new Response("missing", { status: 400 });

  const json = { headers: { "Content-Type": "application/json" } };
  if (p.broadcast) {
    // big audience: answer at once, keep sending in the background
    // @ts-ignore EdgeRuntime is provided by the Supabase runtime
    EdgeRuntime.waitUntil(run(p).catch(() => {}));
    return new Response(JSON.stringify({ queued: true }), { status: 202, ...json });
  }
  return new Response(JSON.stringify(await run(p)), json);
});
