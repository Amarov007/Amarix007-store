/* المصادقة: Supabase Auth مع خيار تذكر تسجيل الدخول على هذا الجهاز. */
import { SB_URL, SB_KEY, SESSION_KEY } from "./config.js";

const REMEMBER_KEY = SESSION_KEY + "_remember";
let remember = false;
let session = null;
try {
  remember = localStorage.getItem(REMEMBER_KEY) === "1";
  session = JSON.parse((remember ? localStorage : sessionStorage).getItem(SESSION_KEY) || "null");
} catch {}
const listeners = new Set();
export const getSession = () => session;
export const onAuthChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));

function persist(s, keep = remember) {
  session = s;
  remember = !!s && !!keep;
  try {
    sessionStorage.removeItem(SESSION_KEY);
    if (s && remember) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(s));
      localStorage.setItem(REMEMBER_KEY, "1");
    } else {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(REMEMBER_KEY);
      if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    }
  } catch {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {}
  }
  listeners.forEach((f) => f(s));
}

async function tokenRequest(grant, body) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15000);
  let r;
  try {
    r = await fetch(`${SB_URL}/auth/v1/token?grant_type=${grant}`, {
      method: "POST", signal: ac.signal,
      headers: { apikey: SB_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  } catch (e) {
    if (e.name === "AbortError") throw new Error("انتهت مهلة الاتصال بخدمة تسجيل الدخول؛ تحقق من الاتصال ثم أعد المحاولة");
    throw new Error("تعذّر الاتصال بخدمة تسجيل الدخول؛ تحقق من الاتصال بالإنترنت");
  } finally { clearTimeout(timer); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error_description || j.msg || "فشل تسجيل الدخول");
  return {
    access_token: j.access_token, refresh_token: j.refresh_token,
    exp: Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
    email: j.user?.email, uid: j.user?.id || session?.uid,
  };
}

export async function signIn(email, password, captchaToken, keepSignedIn = false) {
  persist(await tokenRequest("password", { email, password, gotrue_meta_security: { captcha_token: captchaToken } }), keepSignedIn);
}
export const signOut = () => persist(null, false);

let refreshing = null;
export async function getToken() {
  if (!session) throw new Error("login");
  if (session.exp - 60 < Date.now() / 1000) {
    refreshing ||= tokenRequest("refresh_token", { refresh_token: session.refresh_token })
      .then((s) => persist(s, remember)).catch((e) => { persist(null, false); throw e; }).finally(() => (refreshing = null));
    await refreshing;
  }
  return session.access_token;
}
