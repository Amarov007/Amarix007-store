/* طبقة الاتصال الموحّدة بـ Supabase: REST + RPC + Edge Functions + Storage.
   كل الأخطاء تُرمى ككائن HttpError برسالة مقروءة. */
import { SB_URL, SB_KEY } from "./config.js";
import { getToken, signOut } from "./auth.js";

export class HttpError extends Error {
  constructor(message, status, raw) { super(message); this.status = status; this.raw = raw; }
}

async function request(path, { method = "GET", body, headers = {}, prefer, timeout = 50000, raw = false } = {}) {
  const token = await getToken();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  let res;
  try {
    res = await fetch(SB_URL + path, {
      method, signal: ac.signal, mode: "cors",
      headers: {
        apikey: SB_KEY, Authorization: `Bearer ${token}`,
        ...(body !== undefined && !(body instanceof Blob) ? { "Content-Type": "application/json" } : {}),
        ...(prefer ? { Prefer: prefer } : {}), ...headers,
      },
      body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
    });
  } catch (e) {
    throw new HttpError(e.name === "AbortError" ? "انتهت المهلة — الخادم لا يستجيب" : "تعذّر الاتصال بالخادم", 0);
  } finally { clearTimeout(timer); }
  if (res.status === 401) { signOut(); throw new HttpError("انتهت الجلسة، سجّل الدخول من جديد", 401); }
  if (raw) return res;
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && (data.message || data.error || data.msg)) || (typeof data === "string" ? data : "") || `HTTP ${res.status}`;
    throw new HttpError(String(msg).slice(0, 240), res.status, data);
  }
  return data;
}

export const rest = (path, opts) => request("/rest/v1/" + path, opts);
export const select = (table, query = "select=*") => rest(`${table}?${query}`);
export const rpc = (name, body = {}, opts) => request(`/rest/v1/rpc/${encodeURIComponent(name)}`, { method: "POST", body, ...opts });
export const fn = (name, body = {}) => request(`/functions/v1/${name}`, { method: "POST", body, timeout: name === "smm-order" ? 120000 : 50000 });
export const enc = encodeURIComponent;

/* تعديل مع كشف حجب RLS الصامت (0 صف مُحدَّث) */
export async function patch(table, filter, body) {
  const rows = await rest(`${table}?${filter}`, { method: "PATCH", body, prefer: "return=representation" });
  if (!Array.isArray(rows) || !rows.length) throw new HttpError("لا صلاحية للتعديل (RLS)", 403);
  return rows[0];
}
export const insert = (table, body) => rest(table, { method: "POST", body, prefer: "return=representation" });
export const remove = (table, filter) => rest(`${table}?${filter}`, { method: "DELETE", prefer: "return=minimal" });

export async function uploadMedia(file, folder = "admin") {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  await request(`/storage/v1/object/store-media/${path}`, { method: "POST", body: file, headers: { "Content-Type": file.type || "application/octet-stream", "x-upsert": "true" } });
  return `${SB_URL}/storage/v1/object/public/store-media/${path}`;
}
