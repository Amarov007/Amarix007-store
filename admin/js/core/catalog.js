/* حالة الكتالوج (store_config): نسخة عمل D + لقطة الخادم BASE. النشر = فرق (diff) على مرحلتين:
   stage_store_config_publish (دفعات ≤240KB) ثم commit_store_config_publish ذرّياً؛ عند أي خطأ → cancel_store_config_publish.
   لا يُكتب أبداً مفتاح api (أسرار). الموظف (products) ينشر المنتجات فقط. */
import { select, rpc, HttpError } from "./http.js";
import { isAdmin } from "./rbac.js";
import { clone } from "./utils.js";

const EMPTY = { ts: 0, site: { n1: "", n2: "", logo: "", sa: "", se: "", desc: "", col: { g: "#191A23", m: "#B9FF66", ac: "#B9FF66" }, rt: { ar: "", en: "" }, risk: { ar: "", en: "" }, ai_on: true },
  partner: { on: false, name: "", logo: "", url: "", ar: "", en: "", ba: "", be: "", banner_bg_url: "" }, social: {}, payments: [], categories: [], products: [], embeds: [], banners: [], coupons: {}, rates: { USD: [1, "USDT"] } };

let D = null, BASE = null, ts = 0, dirty = false, loading = null;
const subs = new Set();
export const data = () => D;
export const isDirty = () => dirty;
export const subscribe = (f) => (subs.add(f), () => subs.delete(f));
const emit = () => subs.forEach((f) => f());

function normalize(d) {
  const x = clone(d); delete x.api;
  for (const k in EMPTY) if (x[k] == null) x[k] = clone(EMPTY[k]);
  x.site = { ...EMPTY.site, ...x.site }; x.partner = { ...EMPTY.partner, ...x.partner };
  return x;
}
export function loadCatalog(force = false) {
  if (D && !force) return Promise.resolve(D);
  return (loading ||= (async () => {
    let raw;
    if (isAdmin()) { const r = await select("store_config", "id=eq.1&select=data"); raw = r[0]?.data; }
    else raw = await rpc("public_config"); /* الموظف: إعدادات عامة بلا كوبونات سرية */
    if (!raw || !Array.isArray(raw.products)) throw new HttpError("تعذّر تحميل المتجر من الخادم — لن يُسمح بالنشر حتى لا تُكتب بيانات قديمة", 0);
    D = normalize(raw); BASE = clone(D); ts = Number(D.ts) || 0; dirty = false; emit(); return D;
  })().finally(() => (loading = null)));
}
/* غيّر ثم علّم أن هناك تعديلات غير منشورة */
export function edit(mutator) { mutator(D); dirty = JSON.stringify(D) !== JSON.stringify(BASE); emit(); }
export function discard() { D = clone(BASE); dirty = false; emit(); }

export function buildDiff(productsOnly) {
  const before = new Map(BASE.products.filter((p) => p?.id != null).map((p) => [String(p.id), p]));
  const after = new Map(D.products.filter((p) => p?.id != null).map((p) => [String(p.id), p]));
  const upserts = [], deletes = [];
  for (const [id, p] of after) if (!before.has(id) || JSON.stringify(before.get(id)) !== JSON.stringify(p)) upserts.push(p);
  for (const id of before.keys()) if (!after.has(id)) deletes.push(id);
  const bo = BASE.products.map((p) => String(p?.id ?? "")), ao = D.products.map((p) => String(p?.id ?? ""));
  const orderChanged = bo.length !== ao.length || bo.some((id, i) => id !== ao[i]);
  const patch = {};
  if (!productsOnly) for (const k of Object.keys(D)) { if (["products", "ts", "api"].includes(k)) continue; if (JSON.stringify(BASE[k]) !== JSON.stringify(D[k])) patch[k] = D[k]; }
  return { patch, upserts, deletes, order: orderChanged ? ao : null, count: upserts.length + deletes.length, patchKeys: Object.keys(patch) };
}

export async function publish(onProgress = () => {}) {
  const productsOnly = !isAdmin(), diff = buildDiff(productsOnly);
  if (!diff.count && !diff.patchKeys.length && !diff.order) { dirty = false; emit(); return { empty: true, diff }; }
  const batchId = crypto.randomUUID(), chunks = []; let chunk = [], bytes = 2;
  for (const p of diff.upserts) {
    const size = new TextEncoder().encode(JSON.stringify(p)).length + 1;
    if (size > 240000) throw new Error(`المنتج «${p.ar || p.id}» أكبر من الحد الآمن للنشر — افحص صوره/بياناته`);
    if (chunk.length && bytes + size > 240000) { chunks.push(chunk); chunk = []; bytes = 2; }
    chunk.push(p); bytes += size;
  }
  if (chunk.length || !chunks.length) chunks.push(chunk);
  const call = async (name, payload) => { try { return await rpc(name, payload); } catch (e) { if (/stale|40001/.test(e.message + e.status)) throw new Error("تم تعديل المتجر من جلسة أخرى؛ حدّث الصفحة وادمج تعديلاتك قبل النشر"); throw e; } };
  try {
    for (let i = 0; i < chunks.length; i++) {
      await call("stage_store_config_publish", { p_batch_id: batchId, p_base_ts: ts, p_patch: i === 0 ? diff.patch : {}, p_product_upserts: chunks[i], p_product_delete_ids: i === 0 ? diff.deletes : [], p_product_order: i === 0 ? diff.order : null, p_chunk_no: i });
      onProgress(i + 1, chunks.length);
    }
    const newTs = await call("commit_store_config_publish", { p_batch_id: batchId });
    ts = Number(newTs); D.ts = ts; BASE = clone(D); dirty = false; emit();
    return { diff };
  } catch (e) { try { await rpc("cancel_store_config_publish", { p_batch_id: batchId }); } catch {} throw e; }
}
