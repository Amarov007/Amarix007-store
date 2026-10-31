/* موجّه بسيط على الـ hash: #/orders — كل صفحة تُحمَّل كسولاً (import ديناميكي) فيُقلَّل زمن الإقلاع. */
import { can } from "./rbac.js";

export const routes = []; // {id, title, group, icon, perm, load, desc}
export const register = (r) => routes.push(r);
export const visible = () => routes.filter((r) => can(r.perm));
export const current = () => (location.hash.replace(/^#\/?/, "") || "dashboard").split("?")[0];
export const go = (id) => { location.hash = "#/" + id; };

let onChange = () => {};
export function startRouter(cb) {
  onChange = cb;
  window.addEventListener("hashchange", resolve);
  resolve();
}
export async function resolve() {
  const vis = visible();
  let r = vis.find((x) => x.id === current());
  if (!r) { r = vis[0]; if (r && current() !== r.id) history.replaceState(null, "", "#/" + r.id); }
  onChange(r || null);
}
