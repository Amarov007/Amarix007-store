import { createClient } from "npm:@supabase/supabase-js@2";

const U = Deno.env.get("SUPABASE_URL")!;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Content-Type": "application/json" };
const out = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: cors });
class AppErr extends Error {}

const priv = (ip: string) => /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip) || ip === "::1" || /^(fc|fd|fe80|::ffff)/i.test(ip);
async function guard(u: string) {
  const url = new URL(u);
  const h = url.hostname;
  if (url.protocol !== "https:") throw new AppErr("الرابط يجب أن يكون https فقط");
  if (/^[\d.]+$/.test(h) || h.includes(":") || h === "localhost" || /\.(local|internal|localhost)$/.test(h)) throw new AppErr("مضيف غير مسموح");
  const ips = [...await Deno.resolveDns(h, "A").catch(() => []), ...await Deno.resolveDns(h, "AAAA").catch(() => [])];
  if (!ips.length || ips.some(priv)) throw new AppErr("المضيف غير عام أو لا يمكن تحليله");
}

const fill = (v: any, vars: Record<string, string>): any =>
  typeof v === "string" ? v.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "")
  : Array.isArray(v) ? v.map((x) => fill(x, vars))
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fill(x, vars)])) : v;
const pick = (o: any, p?: string) => (p ? p.split(".").reduce((a, k) => a?.[k], o) : o);

const SMM = {
  auth: {}, enc: "form",
  balance: { method: "POST", path: "", body: { key: "{{secret}}", action: "balance" }, result_path: "balance" },
  services: { method: "POST", path: "", body: { key: "{{secret}}", action: "services" }, list_path: "", map: { external_id: "service", name: "name", rate: "rate", min_qty: "min", max_qty: "max", category: "category" } },
  order: { method: "POST", path: "", body: { key: "{{secret}}", action: "add", service: "{{service_id}}", link: "{{target}}", quantity: "{{qty}}" }, result_path: "order" },
  status: { method: "POST", path: "", body: { key: "{{secret}}", action: "status", order: "{{external_order_id}}" }, result_path: "status",
    status_map: { "Pending": "pending", "Processing": "processing", "In progress": "processing", "Completed": "completed", "Partial": "partial", "Canceled": "failed", "Cancelled": "failed" } },
};
const specOf = (p: any) => (p.config?.spec ?? (p.type === "smm" ? SMM : p.config?.balance ? p.config : null));

async function call(sc: any, p: any, name: string, vars: Record<string, string> = {}) {
  const spec = specOf(p);
  if (!spec?.[name]) throw new AppErr("إعدادات هذا المزود غير مكتملة (JSON)");
  const secret = Deno.env.get(p.secret_name);
  if (!secret) throw new AppErr(`السر ${p.secret_name} غير مضاف في Supabase Edge Secrets`);
  const s = fill(spec[name], { ...vars, secret });
  const url = p.base_url.replace(/\/$/, "") + (s.path ?? "");
  await guard(url);
  const headers: Record<string, string> = {};
  const a = fill(spec.auth ?? {}, { secret });
  if (a?.name) headers[a.name] = a.value;
  const method = s.method ?? "GET";
  let body: BodyInit | undefined;
  if (method !== "GET" && s.body) {
    if (spec.enc === "form") { body = new URLSearchParams(s.body).toString(); headers["Content-Type"] = "application/x-www-form-urlencoded"; }
    else { body = JSON.stringify(s.body); headers["Content-Type"] = "application/json"; }
  }
  const t0 = Date.now(); let code = 0, ok = false, err: string | null = null, data: any = null;
  try {
    const r = await fetch(url, { method, headers, body, redirect: "manual", signal: AbortSignal.timeout(15000) });
    code = r.status;
    if (r.status >= 300 && r.status < 400) throw new AppErr("المزود حاول تحويلاً (redirect) وهو غير مسموح");
    const txt = (await r.text()).slice(0, 2_000_000);
    try { data = JSON.parse(txt); } catch { throw new AppErr("رد المزود ليس JSON"); }
    if (!r.ok || data?.error) throw new AppErr("المزود رفض الطلب: " + String(data?.error ?? r.status).slice(0, 120));
    ok = true;
  } catch (e) { err = (e as Error).message; throw e instanceof AppErr ? e : new AppErr("تعذر الاتصال بالمزود"); }
  finally { await sc.from("api_call_logs").insert({ provider_id: p.id, action: name, status_code: code, ok, duration_ms: Date.now() - t0, error: err }); }
  return { data, spec: s, full: spec };
}

const STAT: Record<string, string> = { pending: "pending", processing: "processing", completed: "completed", partial: "partial", failed: "failed" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const hdr = req.headers.get("Authorization") ?? "";
    const uc = createClient(U, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: hdr } } });
    const sc = createClient(U, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await uc.auth.getUser();
    if (!user) return out({ error: "يجب تسجيل الدخول" }, 401);
    const { action, ...a } = await req.json();
    const perm = async (p: string) => (await uc.rpc("has_perm", { p })).data === true;
    await sc.rpc("check_rate_limit", { p_key: `api:${user.id}`, p_max: 60, p_window_sec: 60 }).then((r: any) => { if (r.error) throw new AppErr(r.error.message); });
    const prov = async (id: string) => (await sc.from("providers").select("*").eq("id", id).single()).data;

    if (action === "test" || action === "sync") {
      if (!(await perm("providers"))) return out({ error: "غير مصرح" }, 403);
      const p = await prov(a.provider_id); if (!p) return out({ error: "المزود غير موجود" }, 404);
      if (action === "test") {
        const r = await call(sc, p, "balance");
        const bal = Number(pick(r.data, r.spec.result_path));
        await sc.from("providers").update({ last_balance: bal, last_checked: new Date().toISOString() }).eq("id", p.id);
        return out({ ok: true, balance: bal, low: bal < Number(p.low_balance_threshold) });
      }
      const r = await call(sc, p, "services");
      const list = pick(r.data, r.spec.list_path) ?? [];
      const m = r.spec.map;
      const rows = (Array.isArray(list) ? list : []).slice(0, 5000).map((x: any) => ({
        provider_id: p.id, external_id: String(pick(x, m.external_id)), name: String(pick(x, m.name) ?? ""),
        category: pick(x, m.category) ?? null, rate: Number(pick(x, m.rate) ?? 0),
        min_qty: Number(pick(x, m.min_qty)) || null, max_qty: Number(pick(x, m.max_qty)) || null, synced_at: new Date().toISOString(),
      }));
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await sc.from("provider_services").upsert(rows.slice(i, i + 500), { onConflict: "provider_id,external_id" });
        if (error) throw new AppErr("فشل حفظ الخدمات");
      }
      return out({ ok: true, count: rows.length });
    }

    if (action === "submit" || action === "status") {
      const { data: o } = await sc.from("orders").select("*, products(*)").eq("id", a.order_id).single();
      if (!o) return out({ error: "الطلب غير موجود" }, 404);
      const staff = await perm("orders");
      if (!staff && !(action === "submit" && o.user_id === user.id && o.status === "pending")) return out({ error: "غير مصرح" }, 403);

      if (action === "status") {
        if (!o.provider_id || !o.external_order_id) return out({ status: o.status });
        const p = await prov(o.provider_id);
        const r = await call(sc, p, "status", { external_order_id: o.external_order_id });
        const raw = String(pick(r.data, r.spec.result_path));
        const st = STAT[r.spec.status_map?.[raw] ?? r.full.status_map?.[raw] ?? ""] ?? o.status;
        await sc.from("orders").update({ status: st, updated_at: new Date().toISOString() }).eq("id", o.id);
        if (st === "failed") await sc.rpc("refund_order", { p_order: o.id, p_reason: "فشل الطلب لدى المزود" });
        return out({ status: st });
      }

      const { data: locked } = await sc.rpc("claim_order_lock", { p_order: o.id });
      if (!locked) return out({ error: "الطلب قيد المعالجة أو مكتمل" }, 409);
      const finish = async (patch: any) => { await sc.from("orders").update({ locked_at: null, updated_at: new Date().toISOString(), ...patch }).eq("id", o.id); };
      try {
        if (o.products.delivery === "manual") { await finish({ status: "pending" }); return out({ status: "pending", manual: true }); }
        if (o.products.delivery === "stock") {
          const { data: code } = await sc.rpc("take_stock_code", { p_product: o.product_id, p_order: o.id });
          if (!code) { await finish({ status: "pending", error: "نفد المخزون - بانتظار التسليم اليدوي" }); return out({ status: "pending", manual: true }); }
          await finish({ status: "completed", delivery_data: code }); return out({ status: "completed" });
        }
        const { data: routes } = await sc.from("product_provider_routes").select("priority, provider_services(*, providers(*))").eq("product_id", o.product_id).eq("active", true).order("priority");
        let lastErr = "لا يوجد مزود مرتبط بهذا المنتج";
        for (const rt of routes ?? []) {
          const ps: any = rt.provider_services; const p = ps?.providers;
          if (!p || p.status !== "active") continue;
          try {
            const r = await call(sc, p, "order", { service_id: ps.external_id, qty: String(o.qty), target: o.target ?? "", ...Object.fromEntries(Object.entries(o.fields ?? {}).map(([k, v]) => [k, String(v)])) });
            const ext = pick(r.data, r.spec.result_path);
            if (ext == null) throw new AppErr("المزود لم يرجع رقم الطلب");
            await finish({ status: "processing", provider_id: p.id, external_order_id: String(ext), error: null });
            return out({ status: "processing" });
          } catch (e) { lastErr = (e as Error).message; }
        }
        await finish({ status: "failed", error: lastErr });
        await sc.rpc("refund_order", { p_order: o.id, p_reason: "تعذر التنفيذ - استرجاع تلقائي" });
        return out({ status: "failed", error: lastErr });
      } catch (e) { await finish({}); throw e; }
    }
    return out({ error: "إجراء غير معروف" }, 400);
  } catch (e) {
    return out({ error: e instanceof AppErr ? e.message : "حدث خطأ غير متوقع" }, e instanceof AppErr ? 400 : 500);
  }
});
