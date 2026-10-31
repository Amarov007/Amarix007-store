import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const BASE = "https://smmnine.com";
const UA = "AMARIX007/1.0";
const clean = (v: unknown) => String(v ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 180);

async function providerRequest(path: string, params: Record<string, string>, method: "GET" | "POST") {
  const key = Deno.env.get("SMMNINE_API_KEY");
  if (!key) throw new Error("SMMNINE_API_KEY is not configured in Edge Function Secrets");
  const url = new URL(path, BASE);
  const headers = { Accept: "application/json", "User-Agent": UA };
  let body: URLSearchParams | undefined;
  if (method === "GET") {
    url.searchParams.set("key", key);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  } else {
    body = new URLSearchParams({ key, ...params });
    Object.assign(headers, { "Content-Type": "application/x-www-form-urlencoded" });
  }
  const response = await fetch(url, {
    method,
    headers,
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(15000),
  });
  const raw = await response.text();
  let data: unknown;
  try { data = JSON.parse(raw); }
  catch { throw new Error(`Provider returned non-JSON (HTTP ${response.status}): ${clean(raw)}`); }
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}: ${clean((data as any)?.error ?? raw)}`);
  if (data && !Array.isArray(data) && typeof data === "object" && "error" in data && (data as any).error) {
    throw new Error(clean((data as any).error));
  }
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  try {
    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return json({ error: "Unauthorized" }, 401);
    const { data: admin, error: adminError } = await supabase.rpc("is_admin");
    if (adminError || admin !== true) return json({ error: "Admin access required" }, 403);

    const input = await req.json();
    const action = String(input.action ?? "");
    let data: unknown;

    // Read-only discovery and account checks only. Purchase/cancel/refund are deliberately
    // withheld until they are wrapped in an atomic Amarix order + wallet workflow.
    switch (action) {
      case "smm_services":
        data = await providerRequest("/api/v2", { action: "services" }, "POST");
        break;
      case "smm_balance":
        data = await providerRequest("/api/v2", { action: "balance" }, "POST");
        break;
      case "numbers_services":
        data = await providerRequest("/api/numbers.php", { action: "services" }, "GET");
        break;
      case "numbers_countries": {
        const service = String(input.service ?? "");
        if (!/^[a-zA-Z0-9_-]{1,20}$/.test(service)) return json({ error: "Valid service code required" }, 400);
        data = await providerRequest("/api/numbers.php", { action: "countries", service }, "GET");
        break;
      }
      case "numbers_active":
        data = await providerRequest("/api/numbers.php", { action: "active" }, "GET");
        break;
      case "email_tiers":
        data = await providerRequest("/api/email.php", { action: "tiers" }, "GET");
        break;
      case "email_inbox": {
        const id = String(input.id ?? "");
        if (!/^\d{1,16}$/.test(id)) return json({ error: "Valid inbox id required" }, 400);
        data = await providerRequest("/api/email.php", { action: "inbox", id }, "GET");
        break;
      }
      case "email_message": {
        const id = String(input.id ?? "");
        if (!/^\d{1,16}$/.test(id)) return json({ error: "Valid message id required" }, 400);
        data = await providerRequest("/api/email.php", { action: "message", id }, "GET");
        break;
      }
      case "email_list":
        data = await providerRequest("/api/email.php", { action: "list" }, "GET");
        break;
      default:
        return json({ error: "Unsupported action. Purchase and state-changing actions are not enabled yet." }, 400);
    }
    return json({ ok: true, action, data });
  } catch (error) {
    return json({ ok: false, error: clean((error as Error).message) }, 502);
  }
});
