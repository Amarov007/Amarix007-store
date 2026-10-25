// deno-lint-ignore-file no-explicit-any
// smm-order v4 — بوابة موحّدة لمزوّدي الخدمات: رشق (SMM) + أرقام تفعيل + أي خدمة أخرى (شحن ألعاب، اشتراكات، ذكاء اصطناعي).
//
// المزوّد الرئيسي  (id = "main")  : جدول api_settings (smm_api_url / smm_api_key) — دائماً من نوع smm كما كان.
// مزوّدون إضافيون (id = أي معرّف) : جدول smm_providers (id, name, kind, api_url, api_key, config, enabled).
//
// أنواع المزوّدين (kind):
//   smm          واجهة SMM القياسية v2 (add / status / services / balance) — رشق متابعين ولايكات.
//   smsactivate  واجهة SMS-Activate النصية (getNumber / getStatus / getPrices / getBalance) — أرقام واتساب وتليجرام وغيرها،
//                والرمز يصل تلقائياً عند التحديث. يعمل مع كل مواقع الأرقام المتوافقة مع هذه الواجهة.
//   custom       أي API آخر (شحن PUBG، اشتراكات Canva / Midjourney / ChatGPT ...) يُوصَف كله في عمود config (JSON) بلا تعديل كود.
//
// الأفعال:
//   info                     → { multi_site, version, kinds }
//   balance | services       → body.provider (اختياري، الافتراضي "main")، وللأرقام body.country اختياري
//   send | refresh | poll    → المزوّد يُقرأ من حقل smm_provider في منتج المتجر (غيابه = main).
//                              الطلب الواحد قد يحوي منتجات من عدة مواقع/أنواع؛ كل بند يُرسَل لموقعه.
//   الزبون (صاحب الطلب المدفوع) يستطيع send / poll لبنود المزوّدين المسموح لهم بـ self_service فقط
//   (smsactivate مسموح افتراضياً، custom يلزم config.self_service = true، smm مرفوض دائماً): هكذا يصله الرقم والرمز فوراً.
//
// حقول المنتج: smm_provider, smm_service (رقم أو رمز نصي مثل wa / tg / uc_60), smm_qty, smm_country (دولة الرقم أو خيار إضافي),
//              smm_input ("none" = لا يحتاج مدخلاً من الزبون).
// نتيجة كل بند في orders.smm: { item_id, site, kind, service, quantity, order, error, provider:{status}, delivery:{number,code,text,...} }
//
// التوافق: واجهة قديمة لا ترسل provider ولا smm_provider تعمل تماماً كالسابق.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const clean = (t: string) => t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
const PID = /^[a-z0-9_-]{1,30}$/;
const MAIN = "main";
const VERSION = 4;
const KINDS = ["smm", "smsactivate", "custom"];
const UA = "Mozilla/5.0 (compatible; AMARIX007/1.0)";
const lower = (v: unknown) => String(v ?? "").trim().toLowerCase();

// حماية SSRF للمواقع الإضافية: https فقط، ولا مضيفات داخلية/خاصة
function safeUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(String(raw ?? "").trim()); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.includes(":") || /(^|\.)(local|internal|localdomain|lan)$/.test(h)) return null;
  if (/^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return null;
  return u;
}

const normBase = (raw: string) => {
  let base = String(raw).trim().replace(/\/+$/, "");
  if (!/\/api\/v\d+$/.test(base)) base += "/api/v2";
  return base;
};

type Kind = "smm" | "smsactivate" | "custom";
type Site = { id: string; name: string; kind: Kind; base: string; key: string; enabled: boolean; cfg: any };
type SiteErr = { error: string; status: number };

// ---------- قوالب ومسارات JSON (لنوع custom) ----------
const getPath = (o: any, p?: unknown): any => {
  if (p === undefined || p === null || p === "") return undefined;
  let c = o;
  for (const k of String(p).split(".")) {
    if (c === null || c === undefined) return undefined;
    c = c[k];
  }
  return c;
};
const tpl = (s: string, v: Record<string, string>, enc = false) =>
  s.replace(/\{(\w+)\}/g, (_m, k) => (enc ? encodeURIComponent(v[k] ?? "") : (v[k] ?? "")));
const tplDeep = (x: any, v: Record<string, string>): any => {
  if (typeof x === "string") {
    const m = x.match(/^\{(\w+)\}$/);
    if (m && m[1] === "quantity" && /^\d+$/.test(v.quantity ?? "")) return Number(v.quantity); // الكمية رقم لا نص
    return tpl(x, v);
  }
  if (Array.isArray(x)) return x.map((i) => tplDeep(i, v));
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, val]) => [k, tplDeep(val, v)]));
  return x;
};
const HDR = /^[A-Za-z0-9-]{1,40}$/;
// مفاتيح التسليم المسموحة فقط (ما يصل للزبون)
const DELIVERY_KEYS = ["number", "code", "text", "email", "password", "link", "pin", "serial"];
function pickDelivery(data: any, map: any): Record<string, string> | undefined {
  if (!map || typeof map !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const k of DELIVERY_KEYS) {
    const v = getPath(data, map[k]);
    if (v !== undefined && v !== null && typeof v !== "object" && String(v).trim() !== "") out[k] = String(v).slice(0, 500);
  }
  return Object.keys(out).length ? out : undefined;
}

// ---------- ما يحتاجه كل نوع من مدخلات الزبون ----------
function needInput(site: Site, p: any): boolean {
  const o = lower(p?.smm_input);
  if (o === "none") return false;
  if (o) return true;
  if (site.kind === "smsactivate") return false;
  if (site.kind === "custom") return lower(site.cfg?.input ?? "required") !== "none";
  return true;
}
// هل يسمح لصاحب الطلب (الزبون) بتشغيل الإرسال/التحديث لهذا المزوّد بنفسه؟
function selfOk(site: Site): boolean {
  if (site.kind === "smsactivate") return site.cfg?.self_service !== false;
  if (site.kind === "custom") return site.cfg?.self_service === true;
  return false;
}

type Add = { order: string | null; error: string | null; status?: string; delivery?: Record<string, string> };
type St = { status: string; delivery?: Record<string, string>; extra?: any; error?: string };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    const body = await req.json().catch(() => ({}));
    let action = String(body.action ?? "");

    // capability probe (no secrets): the admin panel checks which version is deployed.
    // An older version answers "unknown action" (v1) or multi_site without `kinds` (v2).
    if (action === "info") return json({ multi_site: true, version: VERSION, kinds: KINDS, numbers: true });

    // Admin: everything. Staff: only what their permission allows (send/refresh/poll -> 'orders', services -> 'products').
    // Owner (the customer who placed the order): send / poll on their OWN paid order, and only for self-service sites.
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: isAdmin } = await userClient.rpc("is_admin");
    const orderAct = action === "send" || action === "refresh" || action === "poll";
    let role: "admin" | "staff" | "owner" = "admin";
    if (!isAdmin) {
      const need = orderAct ? "orders" : (action === "services" || action === "numbers_catalog" || action === "numbers_diag") ? "products" : null;
      let ok = false;
      if (need) {
        const { data } = await userClient.rpc("has_perm", { p: need });
        ok = !!data;
      }
      if (ok) role = "staff";
      else if (orderAct && body.order_id) role = "owner";
      else return json({ error: "forbidden" }, 403);
    }
    if (action === "poll") action = "refresh";
    const staff = role === "staff";
    // staff can never override the "must be paid" rule
    const force = role === "admin" && !!body.force;

    let uid: string | null = null;
    if (role === "owner") {
      const { data: ud } = await userClient.auth.getUser();
      uid = ud?.user?.id ?? null;
      if (!uid) return json({ error: "forbidden" }, 403);
    }

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ---------- resolve a site (main = api_settings, others = smm_providers) ----------
    const siteCache = new Map<string, { site?: Site; err?: SiteErr }>();
    const getSite = async (rawId: unknown): Promise<{ site?: Site; err?: SiteErr }> => {
      const id = String(rawId ?? "").trim().toLowerCase() || MAIN;
      const hit = siteCache.get(id);
      if (hit) return hit;
      let out: { site?: Site; err?: SiteErr };
      if (id === MAIN) {
        const { data: cfg } = await admin
          .from("api_settings")
          .select("smm_api_url,smm_api_key")
          .eq("id", 1)
          .single();
        if (!cfg?.smm_api_url || !cfg?.smm_api_key) {
          out = { err: { error: "SMM API url/key not configured in api_settings", status: 400 } };
        } else {
          out = {
            site: {
              id, name: MAIN, kind: "smm", base: normBase(cfg.smm_api_url),
              key: String(cfg.smm_api_key).trim(), enabled: true, cfg: {},
            },
          };
        }
      } else if (!PID.test(id)) {
        out = { err: { error: `invalid provider id: ${id.slice(0, 40)}`, status: 400 } };
      } else {
        let { data: row, error: rErr } = await admin
          .from("smm_providers")
          .select("id,name,kind,api_url,api_key,config,enabled")
          .eq("id", id)
          .maybeSingle();
        if (rErr) {
          // قاعدة بيانات قديمة بلا kind/config: تُعامَل كل المواقع كـ smm
          const old = await admin.from("smm_providers").select("id,name,api_url,api_key,enabled").eq("id", id).maybeSingle();
          row = old.data as any;
        }
        if (!row) {
          out = { err: { error: `provider not found: ${id}`, status: 404 } };
        } else {
          const kind = (KINDS.includes(String(row.kind)) ? String(row.kind) : "smm") as Kind;
          const u = safeUrl(row.api_url);
          if (!u) out = { err: { error: `provider "${id}": URL must be https and a public host`, status: 400 } };
          else if (!String(row.api_key ?? "").trim()) out = { err: { error: `provider "${id}": API key not set`, status: 400 } };
          else {
            let base: string;
            if (kind === "smm") base = normBase(u.toString());
            else if (kind === "smsactivate") base = u.pathname === "/" || u.pathname === "" ? u.origin + String(row.config?.base_path || "/stubs/handler_api.php") : u.toString().replace(/\/+$/, "");
            else base = u.toString().replace(/\/+$/, "");
            out = {
              site: {
                id, name: String(row.name || id), kind, base,
                key: String(row.api_key).trim(), enabled: row.enabled !== false,
                cfg: row.config && typeof row.config === "object" ? row.config : {},
              },
            };
          }
        }
      }
      siteCache.set(id, out);
      return out;
    };

    // ---------- HTTP مشترك (extra sites: never follow redirects — a redirect could point to an internal host) ----------
    const sameSite = (a: string, b: string) => a.replace(/^www\./, "") === b.replace(/^www\./, "");
    const http = async (s: Site, target: string | URL, init: RequestInit): Promise<{ status: number; text: string } | { error: string }> => {
      try {
        let cur = new URL(target.toString());
        let method = String(init.method ?? "GET").toUpperCase();
        let bodyInit: any = init.body;
        for (let hop = 0; hop <= 4; hop++) {
          const r = await fetch(cur, {
            ...init, method, body: bodyInit,
            redirect: s.id === MAIN ? "follow" : "manual",
            signal: AbortSignal.timeout(30000),
          });
          const loc = r.headers.get("location");
          if (s.id !== MAIN && r.status >= 300 && r.status < 400 && loc) {
            // extra sites: a redirect is followed ONLY to https, a public host and the same site (www / non-www, http -> https, trailing slash)
            const nu = safeUrl(new URL(loc, cur).toString());
            if (!nu || !sameSite(nu.hostname.toLowerCase(), cur.hostname.toLowerCase())) {
              return { error: `Provider ${s.id} redirected (HTTP ${r.status}) to an address that is not allowed` };
            }
            if (!nu.search && cur.search) nu.search = cur.search; // some servers drop the query string (the API key) when they redirect
            if (r.status === 303 || ((r.status === 301 || r.status === 302) && method === "POST")) { method = "GET"; bodyInit = undefined; }
            cur = nu;
            continue;
          }
          return { status: r.status, text: (await r.text()).slice(0, 200000) };
        }
        return { error: `Provider ${s.id}: too many redirects` };
      } catch (e) {
        return { error: `Network error contacting provider ${s.id}: ${String((e as Error).message ?? e).slice(0, 120)}` };
      }
    };
    const parse = (s: Site, r: { status: number; text: string }): any => {
      try { return JSON.parse(r.text); } catch {
        const snippet = clean(r.text);
        return { error: `Bad response from provider ${s.id} (HTTP ${r.status})${snippet ? ": " + snippet : ""}` };
      }
    };

    // ===================== نوع smm =====================
    const smmCall = async (s: Site, params: Record<string, string>): Promise<any> => {
      const r = await http(s, s.base, {
        method: "POST",
        body: new URLSearchParams({ key: s.key, ...params }),
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json", "User-Agent": UA },
      });
      if ("error" in r) return { error: r.error };
      return parse(s, r);
    };

    // ===================== نوع smsactivate =====================
    const SA_ERR: Record<string, string> = {
      BAD_KEY: "invalid API key", NO_NUMBERS: "no numbers available now for this service/country", NO_BALANCE: "provider balance is empty",
      BAD_SERVICE: "unknown service code", WRONG_SERVICE: "unknown service code", BAD_ACTION: "unsupported action",
      WRONG_MAX_PRICE: "price above the allowed maximum", NO_ACTIVATION: "activation not found", BANNED: "account banned by the provider",
    };
    const saFail = (t: string) => {
      const head = t.split(":")[0];
      return SA_ERR[head] ? `${head} (${SA_ERR[head]})` : clean(t) || "empty response from provider";
    };
    const saCall = async (s: Site, params: Record<string, string>): Promise<{ text: string } | { error: string }> => {
      const u = new URL(s.base);
      u.searchParams.set("api_key", s.key);
      for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
      const r = await http(s, u, { method: "GET", headers: { "Accept": "text/plain, application/json", "User-Agent": UA } });
      if ("error" in r) return { error: r.error };
      return { text: r.text.trim() };
    };
    const saStatus = (t: string): St => {
      const [h, ...rest] = t.split(":");
      const arg = rest.join(":").trim();
      if (h === "STATUS_OK") return { status: "Completed", delivery: arg ? { code: arg.slice(0, 200) } : undefined };
      if (h === "STATUS_WAIT_CODE" || h === "STATUS_WAIT_RESEND") return { status: "In progress" };
      if (h === "STATUS_WAIT_RETRY") return { status: "In progress", delivery: arg ? { code: arg.slice(0, 200) } : undefined };
      if (h === "STATUS_CANCEL") return { status: "Canceled" };
      return { status: "", error: saFail(t) };
    };


    // ---------- جدول الأسعار: يقبل {دولة:{خدمة:{cost,count}}} و{خدمة:{دولة:{...}}} وقائمة مسطّحة ----------
    type Offer = { service: string; country: string; cost: number; count: number | null };
    const parseOffers = (prices: any, svcSet: Set<string>, ctySet: Set<string>): Offer[] => {
      const out: Offer[] = [];
      const put = (service: unknown, country: unknown, v: any) => {
        const cost = parseFloat(typeof v === "object" && v !== null ? (v.cost ?? v.price ?? v.rate) : v);
        if (!(cost > 0) || service === undefined || country === undefined) return;
        const c = Number(typeof v === "object" && v !== null ? (v.count ?? v.physicalCount ?? v.qty ?? v.available ?? v.stock) : NaN);
        out.push({ service: String(service), country: String(country), cost, count: Number.isFinite(c) ? c : null });
      };
      if (Array.isArray(prices)) {
        for (const x of prices) put(x?.service ?? x?.code ?? x?.app, x?.country ?? x?.country_id ?? x?.cc, x);
        return out;
      }
      if (!prices || typeof prices !== "object") return out;
      const top = Object.keys(prices);
      let score = top.filter((k) => ctySet.has(k)).length - top.filter((k) => svcSet.has(k)).length;
      if (score === 0) score = top.filter((k) => /^\d+$/.test(k)).length > top.length / 2 ? 1 : -1;
      for (const [k1, v1] of Object.entries(prices as Record<string, any>)) {
        if (!v1 || typeof v1 !== "object") continue;
        for (const [k2, v2] of Object.entries(v1 as Record<string, any>)) {
          if (score > 0) put(k2, k1, v2); else put(k1, k2, v2);
        }
      }
      return out;
    };
    const jsonOrNull = (t: string): any => { try { return JSON.parse(t); } catch { return null; } };

    // ===================== نوع custom =====================
    const customCall = async (s: Site, spec: any, vars: Record<string, string>): Promise<{ data: any; status: number } | { error: string }> => {
      if (!spec || typeof spec !== "object") return { error: `provider "${s.id}": this operation is not configured (config)` };
      const method = String(spec.method ?? "GET").toUpperCase();
      if (!["GET", "POST", "PUT"].includes(method)) return { error: `provider "${s.id}": unsupported method ${method}` };
      const path = String(spec.path ?? "");
      if (!path.startsWith("/") || path.startsWith("//")) return { error: `provider "${s.id}": path must start with a single "/"` };
      const v = { ...vars, key: s.key };
      const baseU = new URL(s.base);
      const u = safeUrl(s.base.replace(/\/+$/, "") + tpl(path, v, true));
      if (!u || u.host !== baseU.host) return { error: `provider "${s.id}": invalid request URL` };
      if (spec.query && typeof spec.query === "object") {
        for (const [k, val] of Object.entries(spec.query)) u.searchParams.set(k, tpl(String(val), v));
      }
      const headers: Record<string, string> = { "Accept": "application/json", "User-Agent": UA };
      const hdrs = spec.headers && typeof spec.headers === "object" ? spec.headers : { Authorization: "Bearer {key}" };
      for (const [k, val] of Object.entries(hdrs)) {
        if (!HDR.test(k)) return { error: `provider "${s.id}": invalid header name` };
        headers[k] = tpl(String(val), v);
      }
      let payload: string | URLSearchParams | undefined;
      if (method !== "GET" && spec.body !== undefined) {
        if (lower(spec.format) === "form") {
          const o = tplDeep(spec.body, v);
          payload = new URLSearchParams(Object.fromEntries(Object.entries(o).map(([k, x]) => [k, String(x)])));
          headers["Content-Type"] = "application/x-www-form-urlencoded";
        } else {
          payload = JSON.stringify(tplDeep(spec.body, v));
          headers["Content-Type"] = "application/json";
        }
      }
      const r = await http(s, u, { method, headers, body: payload });
      if ("error" in r) return { error: r.error };
      const data = parse(s, r);
      if (data && typeof data === "object" && !Array.isArray(data) && typeof data.error === "string" && data.error.startsWith("Bad response from provider")) return { error: data.error };
      return { data, status: r.status };
    };
    const customErr = (spec: any, data: any, status: number): string | null => {
      const e = getPath(data, spec?.error);
      if (e !== undefined && e !== null && e !== "" && e !== false) return clean(typeof e === "object" ? JSON.stringify(e) : String(e)) || "provider error";
      if (status >= 400) return `HTTP ${status}`;
      return null;
    };
    const customState = (spec: any, data: any): string => {
      const st = lower(getPath(data, spec?.state));
      const done = (Array.isArray(spec?.done) ? spec.done : ["completed", "complete", "success", "delivered", "done"]).map(lower);
      const bad = (Array.isArray(spec?.failed) ? spec.failed : ["failed", "canceled", "cancelled", "refunded", "rejected", "error"]).map(lower);
      return done.includes(st) ? "Completed" : bad.includes(st) ? "Canceled" : "In progress";
    };

    // ===================== واجهة موحّدة =====================
    const opBalance = async (s: Site): Promise<{ balance: string; currency: string } | { error: string }> => {
      if (s.kind === "smm") {
        const res = await smmCall(s, { action: "balance" });
        if (res && !Array.isArray(res) && res.error) return { error: String(res.error) };
        return res;
      }
      if (s.kind === "smsactivate") {
        const r = await saCall(s, { action: "getBalance" });
        if ("error" in r) return r;
        const m = r.text.match(/^ACCESS_BALANCE:(.+)$/);
        if (!m) return { error: saFail(r.text) };
        return { balance: m[1].trim(), currency: String(s.cfg?.currency ?? "") };
      }
      const spec = s.cfg?.balance;
      if (!spec) return { balance: "n/a", currency: "" };
      const r = await customCall(s, spec, {});
      if ("error" in r) return r;
      const e = customErr(spec, r.data, r.status);
      if (e) return { error: e };
      const v = getPath(r.data, spec.value);
      if (v === undefined || v === null) return { error: `provider "${s.id}": balance.value path not found in the response` };
      return { balance: String(v), currency: String(getPath(r.data, spec.currency) ?? spec.currency_label ?? s.cfg?.currency ?? "") };
    };

    const opServices = async (s: Site): Promise<any[] | { error: string }> => {
      if (s.kind === "smm") {
        const res = await smmCall(s, { action: "services" });
        if (res && !Array.isArray(res) && res.error) return { error: String(res.error) };
        return res;
      }
      if (s.kind === "smsactivate") {
        const country = String(body.country ?? s.cfg?.country ?? "0");
        const [pr, nm] = await Promise.all([saCall(s, { action: "getPrices", country }), saCall(s, { action: "getServicesList" })]);
        if ("error" in pr) return pr;
        let prices: any;
        try { prices = JSON.parse(pr.text); } catch { return { error: saFail(pr.text) }; }
        const names = new Map<string, string>();
        if (!("error" in nm)) {
          try {
            const j = JSON.parse(nm.text);
            if (Array.isArray(j?.services)) for (const x of j.services) if (x?.code) names.set(String(x.code), String(x.name ?? x.code));
          } catch { /* الأسماء اختيارية */ }
        }
        const fx = Number(s.cfg?.rate_factor) > 0 ? Number(s.cfg.rate_factor) : 1; // provider currency -> store base currency
        const offers = parseOffers(prices, new Set(names.keys()), new Set([country]));
        const wanted = offers.filter((o) => o.country === country);
        const out: any[] = [];
        // rate = سعر الألف كما في واجهة الرشق: سعر الرقم الواحد = rate / 1000
        for (const o of (wanted.length ? wanted : offers)) {
          out.push({ service: o.service, name: names.get(o.service) || o.service, category: "Numbers", rate: String(o.cost * 1000 * fx), min: 1, max: 1, type: "Number", country: o.country, count: o.count });
        }
        return out;
      }
      const spec = s.cfg?.services;
      if (!spec) return { error: `provider "${s.id}": config.services is not set — add the products by hand (service code + price)` };
      const r = await customCall(s, spec, {});
      if ("error" in r) return r;
      const e = customErr(spec, r.data, r.status);
      if (e) return { error: e };
      const list = spec.list ? getPath(r.data, spec.list) : r.data;
      if (!Array.isArray(list)) return { error: `provider "${s.id}": services.list path did not return an array` };
      const m = spec.map && typeof spec.map === "object" ? spec.map : {};
      const fx = Number(s.cfg?.rate_factor) > 0 ? Number(s.cfg.rate_factor) : 1;
      return list.map((x: any) => ({
        service: String(getPath(x, m.service ?? "id") ?? ""),
        name: String(getPath(x, m.name ?? "name") ?? ""),
        category: String(getPath(x, m.category ?? "category") ?? ""),
        rate: String((parseFloat(getPath(x, m.rate ?? "price")) || 0) * (spec.rate_is_unit === false ? 1 : 1000) * fx), // السعر الافتراضي = سعر الوحدة الواحدة؛ rate_is_unit:false إن كان سعر الألف
        min: getPath(x, m.min ?? "min") ?? 1,
        max: getPath(x, m.max ?? "max") ?? 1,
      })).filter((x: any) => x.service);
    };

    const opAdd = async (s: Site, l: { service: string; input: string; quantity: number; country: string; ref: string }): Promise<Add> => {
      if (s.kind === "smm") {
        const res = await smmCall(s, { action: "add", service: l.service, link: l.input, quantity: String(l.quantity) });
        return { order: res?.order ?? null, error: res?.error ?? null };
      }
      if (s.kind === "smsactivate") {
        const country = l.country || String(s.cfg?.country ?? "0");
        const params: Record<string, string> = { action: "getNumber", service: l.service, country };
        if (s.cfg?.max_price) params.maxPrice = String(s.cfg.max_price);
        if (s.cfg?.operator) params.operator = String(s.cfg.operator);
        const r = await saCall(s, params);
        if ("error" in r) return { order: null, error: r.error };
        const parts = r.text.split(":");
        if (parts[0] !== "ACCESS_NUMBER" || !parts[1] || !parts[2]) return { order: null, error: saFail(r.text) };
        return { order: parts[1], error: null, status: "In progress", delivery: { number: parts.slice(2).join(":").slice(0, 40) } };
      }
      const spec = s.cfg?.order;
      const vars = { service: l.service, input: l.input, email: l.input, quantity: String(l.quantity), country: l.country, ref: l.ref };
      const r = await customCall(s, spec, vars);
      if ("error" in r) return { order: null, error: r.error };
      const e = customErr(spec, r.data, r.status);
      if (e) return { order: null, error: e };
      const idv = getPath(r.data, spec.id);
      const hasStatus = !!s.cfg?.status;
      const order = idv !== undefined && idv !== null && idv !== "" ? String(idv).slice(0, 120) : spec.id ? null : l.ref;
      if (!order) return { order: null, error: `provider "${s.id}": order.id path not found in the response` };
      const delivery = pickDelivery(r.data, spec.delivery);
      // بلا status في config: التسليم فوري (الرد نفسه هو التسليم) فيُعتبر البند مكتملاً؛ ومعه status: يُتابَع بالتحديث
      const st = spec.state ? customState(spec, r.data) : hasStatus ? "In progress" : "Completed";
      return { order, error: null, status: st, delivery };
    };

    // حالة مجموعة طلبات عند مزوّد واحد → خريطة order -> St
    const opStatus = async (s: Site, orders: string[]): Promise<Map<string, St> | { error: string }> => {
      const out = new Map<string, St>();
      if (s.kind === "smm") {
        const res = orders.length === 1
          ? { [orders[0]]: await smmCall(s, { action: "status", order: orders[0] }) }
          : await smmCall(s, { action: "status", orders: orders.join(",") });
        if (res && typeof res.error === "string") return { error: res.error };
        for (const o of orders) {
          const st = res?.[o];
          if (!st || (st.error && !st.status)) continue; // فشل الاستعلام: يبقى القديم
          out.set(o, { status: String(st.status ?? ""), extra: st });
        }
        return out;
      }
      for (const o of orders) {
        if (s.kind === "smsactivate") {
          const r = await saCall(s, { action: "getStatus", id: o });
          if ("error" in r) return r;
          const st = saStatus(r.text);
          if (!st.error) out.set(o, st);
        } else {
          const spec = s.cfg?.status;
          if (!spec) { continue; }
          const r = await customCall(s, spec, { order: o, ref: o });
          if ("error" in r) return r;
          if (customErr(spec, r.data, r.status)) continue;
          out.set(o, { status: customState(spec, r.data), delivery: pickDelivery(r.data, spec.delivery) });
        }
      }
      return out;
    };

    // ---------- balance / services ----------
    if (action === "balance" || action === "services") {
      const g = await getSite(body.provider);
      if (!g.site) return json({ error: g.err!.error }, g.err!.status);
      const res = action === "balance" ? await opBalance(g.site) : await opServices(g.site);
      // surface provider-side errors (wrong key, blocked IP, ...) instead of returning them as a normal 200
      if (res && !Array.isArray(res) && (res as any).error) return json({ error: String((res as any).error) }, 502);
      return json(res);
    }

    // ---------- numbers_catalog: كل الخدمات × الدول × الأسعار × المتوفر بطلب واحد (للأدمن) ----------
    if (action === "numbers_catalog") {
      const g = await getSite(body.provider);
      if (!g.site) return json({ error: g.err!.error }, g.err!.status);
      const s = g.site;
      if (s.kind !== "smsactivate") return json({ error: "this provider is not a numbers provider (kind must be smsactivate)" }, 400);
      const params: Record<string, string> = { action: "getPrices" };
      if (body.country !== undefined && String(body.country) !== "") params.country = String(body.country);
      const [pr, sv, ct] = await Promise.all([
        saCall(s, params), saCall(s, { action: "getServicesList" }), saCall(s, { action: "getCountries" }),
      ]);
      if ("error" in pr) return json({ error: pr.error }, 502);
      const prices = jsonOrNull(pr.text);
      if (prices === null) return json({ error: saFail(pr.text), hint: "the provider did not return a JSON price table — run the connection diagnosis" }, 502);
      const svcName = new Map<string, string>();
      if (!("error" in sv)) {
        const j = jsonOrNull(sv.text);
        const arr = Array.isArray(j?.services) ? j.services : Array.isArray(j) ? j : [];
        for (const x of arr) { const c = x?.code ?? x?.id; if (c !== undefined) svcName.set(String(c), String(x?.name ?? x?.title ?? c)); }
      }
      const ctyName = new Map<string, { name: string; ru: string }>();
      if (!("error" in ct)) {
        const j = jsonOrNull(ct.text);
        const arr = Array.isArray(j) ? j : j && typeof j === "object" ? Object.values(j) : [];
        for (const x of arr as any[]) {
          if (x?.id === undefined) continue;
          ctyName.set(String(x.id), { name: String(x.eng ?? x.name ?? x.title ?? x.id), ru: String(x.rus ?? "") });
        }
      }
      let offers = parseOffers(prices, new Set(svcName.keys()), new Set(ctyName.keys()));
      const wantS = Array.isArray(body.services) && body.services.length ? new Set(body.services.map(String)) : null;
      const wantC = Array.isArray(body.countries) && body.countries.length ? new Set(body.countries.map(String)) : null;
      const minCount = Math.max(0, Number(body.min_count) || 0);
      offers = offers.filter((o) => (!wantS || wantS.has(o.service)) && (!wantC || wantC.has(o.country)) && (o.count === null || o.count >= minCount));
      const fx = Number(s.cfg?.rate_factor) > 0 ? Number(s.cfg.rate_factor) : 1;
      const total = offers.length;
      offers = offers.slice(0, 20000);
      const used = new Set(offers.map((o) => o.service)), usedC = new Set(offers.map((o) => o.country));
      return json({
        total, fx, currency: String(s.cfg?.currency ?? ""),
        services: [...used].map((c) => ({ code: c, name: svcName.get(c) || c })),
        countries: [...usedC].map((c) => ({ id: c, name: ctyName.get(c)?.name || c, ru: ctyName.get(c)?.ru || "" })),
        offers: offers.map((o) => ({ s: o.service, c: o.country, p: o.cost * fx, n: o.count })),
      });
    }

    // ---------- numbers_diag: يجرّب عناوين الواجهة المحتملة ويقول بالضبط ماذا يرد المزوّد (بلا كشف المفتاح) ----------
    if (action === "numbers_diag") {
      const g = await getSite(body.provider);
      if (!g.site) return json({ error: g.err!.error }, g.err!.status);
      const s = g.site;
      const origin = new URL(s.base).origin;
      const cands = [...new Set([s.base, origin + "/stubs/handler_api.php", origin + "/api/stubs/handler_api.php", origin + "/handler_api.php", origin + "/api/handler_api.php"])];
      const tests: any[] = [];
      for (const c of cands) {
        const u = safeUrl(c);
        if (!u) { tests.push({ url: c, ok: false, note: "not https / not a public host" }); continue; }
        const t0 = Date.now();
        const call = new URL(u.toString());
        call.searchParams.set("api_key", s.key);
        call.searchParams.set("action", "getBalance");
        try {
          const r = await fetch(call, { redirect: "manual", headers: { "Accept": "text/plain, application/json", "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
          const txt = (await r.text()).slice(0, 4000);
          const snip = clean(txt).slice(0, 110);
          let note = "";
          if (/ACCESS_BALANCE/.test(txt)) note = "OK: هذا هو العنوان الصحيح (واجهة SMS-Activate)";
          else if (/BAD_KEY/.test(txt)) note = "العنوان صحيح لكن مفتاح API مرفوض";
          else if (r.status >= 300 && r.status < 400) note = "تحويل (redirect) إلى " + String(r.headers.get("location") ?? "?").slice(0, 80);
          else if (/just a moment|cf-chl|cloudflare|attention required/i.test(txt)) note = "المزوّد محمي بجدار Cloudflare ويحجب خوادم Supabase — اطلب منه فتح الوصول للـAPI";
          else if (r.status === 404) note = "العنوان غير موجود (404)";
          else if (r.status === 403) note = "محظور (403): قد يكون حظر IP أو مفتاح خاطئ";
          else if (/<html|<!doctype/i.test(txt)) note = "ردّ صفحة HTML وليس API — العنوان خاطئ";
          else note = "ردّ غير معروف";
          tests.push({ url: u.origin + u.pathname, ok: /ACCESS_BALANCE/.test(txt), http: r.status, ms: Date.now() - t0, reply: snip, note });
        } catch (e) {
          tests.push({ url: u.origin + u.pathname, ok: false, ms: Date.now() - t0, note: "فشل الاتصال: " + String((e as Error).message ?? e).slice(0, 100) });
        }
      }
      return json({ provider: s.id, kind: s.kind, tests });
    }

    // ---------- send / refresh ----------
    if (action === "send" || action === "refresh") {
      const { data: order, error: oErr } = await admin
        .from("orders")
        .select("id,user_id,items,smm,smm_status,payment_status")
        .eq("id", body.order_id)
        .single();
      if (oErr || !order) return json({ error: "order not found" }, 404);
      if (role === "owner" && order.user_id !== uid) return json({ error: "forbidden" }, 403);

      const items: any[] = Array.isArray(order.items) ? order.items : [];
      const existing: any[] = Array.isArray(order.smm) ? order.smm : [];

      if (action === "send") {
        if (order.smm_status === "sent" || order.smm_status === "completed" || order.smm_status === "sending") {
          return json({ error: "order already sent to provider" }, 409);
        }
        if (order.payment_status !== "paid" && (!force || role === "owner")) {
          return json({ error: "order is not paid (pass force:true to override)" }, 400);
        }

        const ids = items.map((i) => i.id);
        const { data: maps } = await admin
          .from("smm_service_map")
          .select("item_id,service_id,qty_per_unit")
          .in("item_id", ids);
        const mapById = new Map<string, { item_id: string; service_id: string | number; qty_per_unit: number; site: string }>(
          (maps ?? []).map((m: any) => [m.item_id, { ...m, site: MAIN }]),
        );

        // The admin panel's product fields (smm_service / smm_qty / smm_provider / smm_country / smm_input) take priority over the table,
        // so editing a product in the panel and publishing is enough.
        const { data: cfgRow } = await admin.from("store_config").select("data").eq("id", 1).single();
        const prods: any[] = Array.isArray(cfgRow?.data?.products) ? cfgRow.data.products : [];
        const prodById = new Map<string, any>();
        for (const p of prods) {
          const sv = String(p.smm_service ?? "").trim();
          if (ids.includes(p.id) && sv !== "" && sv !== "0") {
            prodById.set(p.id, p);
            mapById.set(p.id, {
              item_id: p.id,
              service_id: /^\d+$/.test(sv) ? Number(sv) : sv, // رقم (رشق) أو رمز نصي (wa / tg / uc_60)
              qty_per_unit: Math.max(1, Number(p.smm_qty) || 1),
              site: String(p.smm_provider ?? "").trim().toLowerCase() || MAIN,
            });
          }
        }

        const missing = ids.filter((id) => !mapById.has(id));
        if (missing.length) {
          return json({ error: "missing service mapping", missing }, 400);
        }

        // Validate every site BEFORE sending anything, so a disabled / misconfigured site
        // can never leave an order half-sent because of a config problem.
        const pending = items.filter((_, i) => !existing[i]?.order);
        const used = [...new Set(pending.map((i) => mapById.get(i.id)!.site))];
        for (const sid of used) {
          const g = await getSite(sid);
          if (!g.site) return json({ error: g.err!.error, provider: sid }, g.err!.status);
          if (!g.site.enabled) return json({ error: `provider "${sid}" is disabled`, provider: sid }, 400);
          if (role === "owner" && !selfOk(g.site)) return json({ error: "forbidden" }, 403);
        }

        const noLink: string[] = [], multi: string[] = [];
        for (const it of pending) {
          const site = (await getSite(mapById.get(it.id)!.site)).site!;
          const input = String(it.link ?? "").trim();
          if (needInput(site, prodById.get(it.id)) && !input) noLink.push(it.id);
          if (site.kind === "smsactivate" && Math.round(Number(it.q ?? 1)) !== 1) multi.push(it.id);
        }
        if (noLink.length) return json({ error: "missing link on items", items: noLink }, 400);
        if (multi.length) return json({ error: "number services allow quantity 1 per line", items: multi }, 400);

        // قفل: يمنع تكرار الإرسال إن ضغط الأدمن والزبون (أو تبويبان) معاً — الأول فقط يمرّ
        const prevStatus = order.smm_status ?? null;
        const { data: claimed } = await admin
          .from("orders")
          .update({ smm_status: "sending" })
          .eq("id", order.id)
          .or("smm_status.is.null,smm_status.not.in.(sent,completed,sending)")
          .select("id");
        if (!claimed || !claimed.length) return json({ error: "order is being sent right now" }, 409);

        const results: any[] = [];
        try {
          for (let i = 0; i < items.length; i++) {
            if (existing[i]?.order) {
              results.push(existing[i]); // already sent earlier, never resend
              continue;
            }
            const it = items[i];
            const m = mapById.get(it.id)!;
            const site = (await getSite(m.site)).site!;
            // q can be a fraction of a package (the buyer picks exact units): round to a whole number of units.
            // The order stores the exact unit count in `units` when it was placed that way.
            const exactUnits = Number(it.units);
            const quantity = site.kind === "smsactivate"
              ? 1
              : exactUnits > 0 ? Math.round(exactUnits) : Math.round(m.qty_per_unit * Number(it.q ?? 1));
            let r: Add;
            try {
              r = await opAdd(site, {
                service: String(m.service_id),
                input: site.kind === "smm" ? String(it.link) : String(it.link ?? "").trim().slice(0, 200),
                quantity,
                country: String(prodById.get(it.id)?.smm_country ?? "").trim().slice(0, 30),
                ref: `${order.id}-${i + 1}`,
              });
            } catch (e) {
              r = { order: null, error: String((e as Error).message ?? e).slice(0, 140) };
            }
            // `site` = which provider took this line. (The key `provider` is reserved: it holds the provider's status object.)
            results.push({
              item_id: it.id,
              site: m.site,
              kind: site.kind,
              service: m.service_id,
              quantity,
              order: r.order ?? null,
              error: r.error ?? null,
              ...(r.status ? { provider: { status: r.status } } : {}),
              ...(r.delivery ? { delivery: r.delivery } : {}),
            });
          }
        } catch (e) {
          await admin.from("orders").update({ smm_status: prevStatus }).eq("id", order.id);
          throw e;
        }
        const okLines = results.filter((r) => r.order);
        const smm_status =
          okLines.length === results.length
            ? okLines.every((r) => r.provider?.status === "Completed") ? "completed" : "sent"
            : okLines.length > 0 ? "partial" : "failed";
        await admin.from("orders").update({ smm: results, smm_status }).eq("id", order.id);

        // activity log (a Telegram alert for staff is raised by a DB trigger on this insert) — not for customer self-service
        if (role !== "owner") {
          try {
            const { data: ud } = await userClient.auth.getUser();
            await admin.from("staff_activity").insert({
              actor_id: ud?.user?.id ?? null,
              actor_email: ud?.user?.email ?? null,
              actor_kind: staff ? "staff" : "admin",
              action: "smm_send",
              target: String(order.id),
              details: { status: smm_status, items: items.length, sites: used },
            });
          } catch { /* never block the order because of logging */ }
        }

        return json({ smm_status, results });
      }

      // refresh / poll — group the sent lines by site; results without `site` (older orders) belong to main
      const sent = existing.filter((r) => r?.order);
      if (!sent.length) return json({ error: "nothing sent yet" }, 400);

      // الزبون: تحديث بنوده هو فقط، وبحدّ أدنى بين استعلامين (يمنع إغراق المزوّد)
      if (role === "owner") {
        const last = Math.max(0, ...existing.map((r) => Number(r?.polled_at) || 0));
        if (Date.now() - last < 4000) return json({ smm_status: order.smm_status, results: existing, throttled: true });
      }

      const groups = new Map<string, string[]>();
      for (const r of sent) {
        if (r?.provider?.status === "Completed" && r.kind && r.kind !== "smm" && r.finalized) continue; // لا حاجة لسؤال المزوّد ثانية
        const sid = String(r.site ?? MAIN);
        groups.set(sid, [...(groups.get(sid) ?? []), String(r.order)]);
      }
      const statusBySite = new Map<string, Map<string, St>>();
      const warnings: string[] = [];
      for (const [sid, oids] of groups) {
        const g = await getSite(sid);
        if (!g.site) { warnings.push(g.err!.error); continue; }
        if (role === "owner" && !selfOk(g.site)) continue;
        const res = await opStatus(g.site, oids);
        if (!(res instanceof Map)) { warnings.push(res.error); continue; }
        statusBySite.set(sid, res);
      }
      if (!statusBySite.size && warnings.length) return json({ error: warnings.join(" | ") || "status check failed" }, 502);

      const now = Date.now();
      const updated: any[] = [];
      for (const r of existing) {
        if (!r?.order) { updated.push(r); continue; }
        const sid = String(r.site ?? MAIN);
        const st = statusBySite.get(sid)?.get(String(r.order));
        if (!st) { updated.push(role === "owner" && statusBySite.has(sid) ? { ...r, polled_at: now } : r); continue; }
        const line: any = { ...r, provider: st.extra ?? { ...(r.provider ?? {}), status: st.status } };
        if (st.delivery) line.delivery = { ...(r.delivery ?? {}), ...st.delivery };
        if (role === "owner") line.polled_at = now;
        // smsactivate: بعد وصول الرمز نُبلغ المزوّد بإنهاء التفعيل مرة واحدة (status 6)
        if (st.status === "Completed" && String(r.kind) === "smsactivate" && !r.finalized) {
          const g = await getSite(sid);
          if (g.site) { try { await saCall(g.site, { action: "setStatus", id: String(r.order), status: "6" }); } catch { /* غير حرج */ } }
          line.finalized = true;
        }
        updated.push(line);
      }
      const statuses = updated.filter((r) => r?.order).map((r: any) => r.provider?.status);
      let smm_status = order.smm_status;
      if (statuses.length && statuses.every((s) => s === "Completed")) smm_status = "completed";
      else if (statuses.some((s) => s === "Canceled")) smm_status = "canceled";
      await admin.from("orders").update({ smm: updated, smm_status }).eq("id", order.id);
      return json({ smm_status, results: updated, ...(warnings.length ? { warnings } : {}) });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message ?? e).slice(0, 300) }, 500);
  }
});
