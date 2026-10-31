/* الأدوار والصلاحيات. الحماية الحقيقية في RLS؛ هذه الطبقة لإخفاء ما لا يحق للمستخدم رؤيته فقط. */
import { rpc } from "./http.js";

export const state = { isAdmin: null, perms: [], loaded: false };

export async function loadRole() {
  state.isAdmin = null; state.perms = []; state.loaded = false;
  try {
    const v = await rpc("is_admin");
    state.isAdmin = v === true;
    if (!state.isAdmin) { const p = await rpc("my_staff_perms"); state.perms = Array.isArray(p) ? p : []; }
  } catch { /* يبقى بلا صلاحيات */ }
  state.loaded = true;
  return state;
}
export const isAdmin = () => state.isAdmin === true;
export const isStaff = () => state.isAdmin === false && state.perms.length > 0;
/* perm: null = للمدير فقط، "orders" = مدير أو موظف يملك المفتاح */
export const can = (perm) => isAdmin() || (!!perm && state.perms.includes(perm));
export const hasAccess = () => isAdmin() || isStaff();
