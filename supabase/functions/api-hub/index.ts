// api-hub — اختبار التكاملات المسجّلة في api_integrations (أدمن فقط).
// المتصفح لا يرى المفاتيح أبداً: هذه الدالة تقرأها بمفتاح service_role وتتصل بالموقع الخارجي.
// الأفعال: test | balance | services   (balance و services لتكاملات من نوع smm فقط)
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const clean = (t: string) => t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);

// حماية SSRF: https فقط، ولا مضيفات داخلية/خاصة
function safeUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.includes(":") || /(^|\.)(local|internal|localdomain|lan)$/.test(h)) return null;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return null;
  return u;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: isAdmin } = await userClient.rpc("is_admin");
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const id = String(body.id ?? "").toLowerCase();
    if (!["test", "balance", "services"].includes(action)) return json({ error: "unknown action" }, 400);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: it } = await admin.from("api_integrations").select("*").eq("id", id).maybeSingle();
    if (!it) return json({ error: "integration not found" }, 404);

    const target = safeUrl(String(it.api_url ?? ""));
    if (!target) return json({ error: "رابط غير صالح: يجب أن يبدأ بـ https وألا يكون عنواناً داخلياً" }, 400);

    const remember = async (ok: boolean, msg: string) => {
      await admin.from("api_integrations")
        .update({ last_test_at: new Date().toISOString(), last_test_ok: ok, last_test_msg: msg.slice(0, 200) })
        .eq("id", id);
    };

    // ---------- SMM (واجهة api/v2 القياسية) ----------
    if (it.category === "smm") {
      if (!it.api_key) { await remember(false, "المفتاح غير مضبوط"); return json({ ok: false, error: "المفتاح غير مضبوط" }, 400); }
      let base = target.toString().trim().replace(/\/+$/, "");
      if (!/\/api\/v\d+$/.test(base)) base += "/api/v2";
      const call = async (params: Record<string, string>) => {
        let r: Response;
        try {
          r = await fetch(base, {
            method: "POST",
            redirect: "manual",
            signal: AbortSignal.timeout(15000),
            body: new URLSearchParams({ key: String(it.api_key).trim(), ...params }),
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Accept": "application/json",
              "User-Agent": "Mozilla/5.0 (compatible; AMARIX007/1.0)",
            },
          });
        } catch (e) {
          return { error: `تعذّر الاتصال بالموقع: ${clean(String((e as Error).message ?? e))}` };
        }
        const t = await r.text();
        try { return JSON.parse(t); } catch {
          return { error: `رد غير صالح من الموقع (HTTP ${r.status})${clean(t) ? ": " + clean(t) : ""}` };
        }
      };
      const act = action === "test" ? "balance" : action;
      const res = await call({ action: act });
      if (res && !Array.isArray(res) && res.error) {
        await remember(false, String(res.error));
        return json({ ok: false, error: String(res.error) }, 502);
      }
      if (action === "services") return json(res);
      const msg = `الرصيد: ${res?.balance ?? "?"} ${res?.currency ?? ""}`.trim();
      await remember(true, msg);
      return json({ ok: true, message: msg, balance: res?.balance ?? null, currency: res?.currency ?? null });
    }

    // ---------- بقية الأنواع: فحص وصول عام ----------
    if (action !== "test") return json({ error: "هذا الفعل متاح لنوع smm فقط" }, 400);
    const headers: Record<string, string> = { "Accept": "application/json", "User-Agent": "Mozilla/5.0 (compatible; AMARIX007/1.0)" };
    if (it.api_key) headers["Authorization"] = "Bearer " + String(it.api_key).trim();
    const eh = it.extra?.headers;
    if (eh && typeof eh === "object") {
      for (const [k, v] of Object.entries(eh).slice(0, 10)) {
        if (/^[A-Za-z0-9-]{1,40}$/.test(k) && !/^(host|content-length|connection)$/i.test(k) && typeof v === "string") headers[k] = v.slice(0, 300);
      }
    }
    let status = 0;
    try {
      const r = await fetch(target.toString(), { method: "GET", headers, redirect: "manual", signal: AbortSignal.timeout(15000) });
      status = r.status;
      await r.body?.cancel();
    } catch (e) {
      const m = `تعذّر الاتصال: ${clean(String((e as Error).message ?? e))}`;
      await remember(false, m);
      return json({ ok: false, error: m }, 502);
    }
    const ok = status >= 200 && status < 400;
    const msg = ok ? `الموقع يستجيب (HTTP ${status})` : `الموقع ردّ HTTP ${status}` + (status === 401 || status === 403 ? " — تحقق من المفتاح" : "");
    await remember(ok, msg);
    return json({ ok, message: msg, status });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
