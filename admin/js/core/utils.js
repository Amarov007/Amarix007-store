/* أدوات مساعدة عامة بلا اعتماد على DOM */
export const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
export const money = (v, cur = "USD") => `${num(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${cur}`;
export const fmtDate = (iso) => iso ? new Date(iso).toLocaleString("ar-EG-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }) : "—";
export const fmtDay = (iso) => iso ? new Date(iso).toLocaleDateString("ar-EG-u-nu-latn", { day: "numeric", month: "short" }) : "—";
export const ago = (iso) => {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "الآن";
  if (s < 3600) return `منذ ${Math.floor(s / 60)} د`;
  if (s < 86400) return `منذ ${Math.floor(s / 3600)} س`;
  return `منذ ${Math.floor(s / 86400)} يوم`;
};
export const parseJSON = (v, fb = []) => { if (typeof v !== "string") return v ?? fb; try { return JSON.parse(v); } catch { return fb; } };
export const uniq = (a) => [...new Set(a)];
export const groupBy = (arr, fn) => arr.reduce((m, x) => ((m[fn(x)] ||= []).push(x), m), {});
export function download(name, text, type = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
export function toCSV(rows, cols) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return "\uFEFF" + [cols.map((c) => q(c.label)).join(","), ...rows.map((r) => cols.map((c) => q(c.get(r))).join(","))].join("\n");
}
