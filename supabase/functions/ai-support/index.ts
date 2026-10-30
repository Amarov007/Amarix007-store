// =====================================================================
// Edge Function: ai-support  — AMARIX007 AI customer support
// The AI key is read from the function secret AI_API_KEY first (recommended),
// falling back to public.api_settings.ai_api_key (admin-only RLS) via the service role.
// It never reaches the browser.
// Supports Anthropic (sk-ant-), Gemini (AIza... or AQ...., free tier), Groq (gsk_, free tier), OpenRouter (sk-or-) and OpenAI keys.
// Optional secrets:  AI_API_KEY, AI_MODEL (override the default model)
// Rate limiting: persistent (public.rl_hit in Postgres) + per-instance fallback.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Per-instance guard (fallback): max 20 requests / 10 minutes per IP. Every call is billed on the AI key.
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now(), win = (hits.get(ip) || []).filter((t) => now - t < 600_000);
  win.push(now); hits.set(ip, win);
  if (hits.size > 5000) hits.clear();
  return win.length > 20;
}
// Persistent guard shared by all instances (table public.rate_limits). Fails open if the RPC is unavailable.
async function dbLimited(db: any, ip: string): Promise<boolean | null> {
  try {
    const { data, error } = await db.rpc("rl_hit", { p_key: `ai:${ip}`, p_max: 20, p_window_seconds: 600 });
    if (error) {
      console.error("[ai-support] persistent rate limit unavailable:", error.message);
      return null;
    }
    return data === false;
  } catch (e) {
    console.error("[ai-support] persistent rate limit exception:", e);
    return null;
  }
}
// Price without losing decimals (2.78 must not become "3")
const price = (v: number) => String(Number(v.toFixed(2)));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    // cf-connecting-ip is set by the platform edge; the first x-forwarded-for hop can be spoofed by the client
    const xff = (req.headers.get("x-forwarded-for") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const ip = req.headers.get("cf-connecting-ip") || xff[xff.length - 1] || "unknown";
    if (limited(ip)) return json({ error: "rate_limited" }, 429);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // Apply the shared limiter even when the edge runtime cannot identify a client IP.
    // If the database limiter is unavailable, fail closed rather than falling back to per-instance limits only.
    const persistentLimit = await dbLimited(db, ip);
    if (persistentLimit === null) return json({ error: "rate_limit_unavailable" }, 503);
    if (persistentLimit) return json({ error: "rate_limited" }, 429);

    const rawBody = await req.text();
    if (rawBody.length > 20000) return json({ error: "payload_too_large" }, 413);
    let payload: any;
    try { payload = JSON.parse(rawBody); } catch { return json({ error: "bad_request" }, 400); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return json({ error: "bad_request" }, 400);
    const { messages = [], lang = "ar" } = payload;

    // Give the assistant the live product list so it can answer pricing questions
    const { data: cfg } = await db.from("store_config").select("data").eq("id", 1).maybeSingle();
    if (cfg?.data?.site?.ai_on === false) return json({ error: "ai_disabled" }, 403);

    const { data: s } = await db.from("api_settings").select("ai_api_key, ai_system_prompt").eq("id", 1).maybeSingle();
    const key = String(Deno.env.get("AI_API_KEY") || s?.ai_api_key || "").trim();
    if (!key) return json({ error: "ai_not_configured" }, 503);

    const cats: Record<string, string> = Object.fromEntries((cfg?.data?.categories || []).map((c: any) => [c.id, c.ar]));
    // Product prices are stored in the store's base currency (USDT, rate 1). Show USDT plus the Syrian-pound equivalent at the store's own rate.
    const rates = cfg?.data?.rates || {};
    const usdRate = Number(rates?.USD?.[0]) || 1;
    const sypRate = Number(rates?.SYP?.[0]) || 0;
    const catalog = (cfg?.data?.products || []).slice(0, 40)
      .map((p: any) => {
        const base = p.p * (1 - (p.d || 0) / 100);
        const syp = sypRate > 0 ? ` (≈ ${Math.round(base * sypRate).toLocaleString("en-US")} ل.س)` : "";
        return `- ${p.ar} | ${cats[p.c] || ""} | ${price(base * usdRate)} USDT${syp}`;
      }).join("\n");

    const pays = (cfg?.data?.payments || []).filter((m: any) => m && m.on !== false)
      .map((m: any) => `- ${m.ar || m.en || m.id}: ${m.da || ""}`).join("\n");
    const system =
      `${s?.ai_system_prompt || "You are the customer support assistant of AMARIX007, a digital assets store."}\n` +
      `Payment methods (account numbers are shown to the customer only after the order is placed):\n${pays}\n` +
      `How ordering works: add to cart, sign in, choose a payment method, place the order, pay, upload the payment proof image (required), then tap "I have paid" so the team verifies it.\n` +
      `Reply in ${lang === "ar" ? "Arabic" : "English"}. Be brief and friendly. ` +
      `Never ask for passwords, card numbers or wallet seed phrases. ` +
      `If you do not know something, suggest contacting support on WhatsApp.\nProducts:\n${catalog}`;

    // Keep the last 10 messages, short, starting with a user turn, ending with a user turn
    const history = (Array.isArray(messages) ? messages : []).slice(-10)
      .map((m: any) => ({ role: m?.role === "assistant" ? "assistant" : "user", content: String(m?.content ?? "").slice(0, 800) }))
      .filter((m) => m.content);
    while (history.length && history[0].role !== "user") history.shift();
    if (!history.length || history[history.length - 1].role !== "user") return json({ error: "bad_request" }, 400);

    let reply = "";
    if (key.startsWith("sk-ant-")) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model: Deno.env.get("AI_MODEL") || "claude-haiku-5-5", max_tokens: 500, system, messages: history }),
        signal: AbortSignal.timeout(25000),
      });
      const j = await r.json();
      if (!r.ok) throw Object.assign(new Error(j?.error?.message || `anthropic ${r.status}`), { status: r.status });
      reply = j?.content?.[0]?.text || "";
    } else if (/^(AIza|AQ\.)/.test(key)) {
      // Google Gemini: native API. AQ.* keys (Vertex express) get the Vertex endpoint as a second attempt.
      const model = Deno.env.get("AI_MODEL") || "gemini-flash-latest";
      const body = JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: history.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
        generationConfig: { maxOutputTokens: 1024 },
      });
      const tries = [
        { n: "gemini", url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, h: { "x-goog-api-key": key } },
        ...(key.startsWith("AQ.") ? [{ n: "vertex", url: `https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent`, h: { "x-goog-api-key": key } }] : []),
      ];
      let last: any = null;
      for (const a of tries) {
        try {
          const r = await fetch(a.url, { method: "POST", headers: { "Content-Type": "application/json", ...a.h }, body, signal: AbortSignal.timeout(12000) });
          const txt = await r.text();
          if (r.ok) {
            const j = JSON.parse(txt);
            reply = (j?.candidates?.[0]?.content?.parts || []).map((p: any) => p?.text || "").join("").trim();
            if (reply) break;
            last = Object.assign(new Error(`${a.n}: empty reply ${txt.slice(0, 200)}`), { status: 0 });
          } else {
            last = Object.assign(new Error(`${a.n} ${r.status}: ${txt.replaceAll(key, "***").slice(0, 300)}`), { status: r.status });
          }
        } catch (e) {
          last = Object.assign(new Error(`${a.n}: ${(e as any)?.name || "error"} ${(e as any)?.message || ""}`), { name: (e as any)?.name, status: 0 });
        }
        console.error("[ai-support] attempt failed:", last.message);
      }
      if (!reply) throw last || new Error("no reply");
    } else {
      // OpenAI-compatible providers, picked from the key prefix. Free options: Gemini (AIza...) and Groq (gsk_...)
      // Groq retired llama-3.3-70b-versatile for this account; the gpt-oss models are current. Next model is tried only when one does not exist (404).
      const P = key.startsWith("gsk_")
        ? { url: "https://api.groq.com/openai/v1/chat/completions", models: ["openai/gpt-oss-20b", "openai/gpt-oss-120b"] }
        : key.startsWith("sk-or-")
        ? { url: "https://openrouter.ai/api/v1/chat/completions", models: ["meta-llama/llama-3.3-70b-instruct:free"] }
        : { url: "https://api.openai.com/v1/chat/completions", models: ["gpt-4o-mini"] };
      const forced = Deno.env.get("AI_MODEL");
      const models = forced ? [forced] : P.models;
      let lastErr: any = null;
      for (const model of models) {
        const r = await fetch(P.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model, max_tokens: 800,
            ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
            messages: [{ role: "system", content: system }, ...history],
          }),
          signal: AbortSignal.timeout(25000),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok) {
          reply = String(j?.choices?.[0]?.message?.content || "").trim();
          if (reply) break;
          lastErr = new Error("empty reply");
          continue;
        }
        lastErr = Object.assign(new Error((Array.isArray(j) ? j[0] : j)?.error?.message || `provider ${r.status}`), { status: r.status });
        if (r.status !== 404) break;
      }
      if (!reply) throw lastErr || new Error("no reply");
    }
    if (!reply) throw new Error("empty reply");
    return json({ reply });
  } catch (e) {
    console.error("[ai-support]", e instanceof Error ? e.message : e);   // full detail only in the Supabase function logs
    // Short, key-safe reason so the browser console (and you) can tell what to fix
    const st = (e as any)?.status, msg = String((e as any)?.message || "");
    const reason = (e as any)?.name === "TimeoutError" ? "timeout"
      : st === 401 || st === 403 ? "invalid_key"
      : st === 429 || /quota|credit|billing|balance/i.test(msg) ? "quota_or_rate_limit"
      : st === 404 || /model/i.test(msg) ? "model_not_found"
      : st ? `provider_${st}` : "internal";
    return json({ error: "ai_failed", reason }, 502);
  }
});
