/* المصادقة: Supabase Auth (كلمة مرور + Cloudflare Turnstile) مع تجديد تلقائي للرمز.
   الجلسة في sessionStorage (تنتهي بإغلاق التبويب) بدل localStorage. */
import { SB_URL, SB_KEY, SESSION_KEY } from "./config.js";

let session = null;
try { session = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null"); } catch {}
const listeners = new Set();
export const getSession = () => session;
export const onAuthChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));

function persist(s) {
  session = s;
  try { s ? sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)) : sessionStorage.removeItem(SESSION_KEY); } catch {}
  listeners.forEach((f) => f(s));
}

async function tokenRequest(grant, body) {
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=${grant}`, {
    method: "POST", headers: { apikey: SB_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.msg || "فشل تسجيل الدخول");
  return {
    access_token: j.access_token, refresh_token: j.refresh_token,
    exp: Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
    email: j.user?.email, uid: j.user?.id || session?.uid,
  };
}

export async function signIn(email, password, captchaToken) {
  persist(await tokenRequest("password", { email, password, gotrue_meta_security: { captcha_token: captchaToken } }));
}
export const signOut = () => persist(null);

let refreshing = null;
export async function getToken() {
  if (!session) throw new Error("login");
  if (session.exp - 60 < Date.now() / 1000) {
    refreshing ||= tokenRequest("refresh_token", { refresh_token: session.refresh_token })
      .then(persist).catch((e) => { persist(null); throw e; }).finally(() => (refreshing = null));
    await refreshing;
  }
  return session.access_token;
}
