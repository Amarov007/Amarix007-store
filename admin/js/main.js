/* نقطة الدخول: إقلاع → جلسة → دور → هيكل اللوحة → موجّه. */
import { getSession, onAuthChange, signIn, signOut } from "./core/auth.js";
import { loadRole, hasAccess, isAdmin, state as role } from "./core/rbac.js";
import { startRouter, visible, current, go, register } from "./core/router.js";
import { h, $, mount, icon, toast, spinner, errorState, empty, withBusy } from "./core/ui.js";
import { TURNSTILE_KEY } from "./core/config.js";
import { routes } from "./routes.js";

routes.forEach(register);
const app = $("#app");
const THEME_KEY = "amx_admin_theme";
const applyTheme = (t) => { document.documentElement.dataset.theme = t; try { localStorage.setItem(THEME_KEY, t); } catch {} };
applyTheme((() => { try { return localStorage.getItem(THEME_KEY); } catch { return null; } })() || "dark");

/* ---------- تسجيل الدخول ---------- */
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = h("script", { src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit", async: true, onload: res, onerror: () => rej(new Error("تعذّر تحميل التحقق الأمني")) });
    document.head.append(s);
  });
}
function loginView(message = "") {
  let captcha = "", wid = null;
  const err = h("div", { class: "form-error", role: "alert" }, message);
  const email = h("input", { class: "input", type: "email", name: "email", required: true, autocomplete: "username", dir: "ltr" });
  const pass = h("input", { class: "input", type: "password", name: "password", required: true, autocomplete: "current-password", dir: "ltr" });
  const remember = h("input", { type: "checkbox", name: "remember", style: { width: "18px", height: "18px", accentColor: "var(--primary)" } });
  const rememberLabel = h("label", { class: "remember-login", style: { display: "flex", alignItems: "center", gap: "9px", margin: "2px 0 12px", cursor: "pointer" } }, remember, h("span", null, "تذكرني على هذا الجهاز"));
  const ts = h("div", { class: "turnstile" });
  const btn = h("button", { class: "btn primary block", type: "submit" }, "تسجيل الدخول");
  const form = h("form", { class: "login-card", onsubmit: async (e) => {
    e.preventDefault(); err.textContent = "";
    if (!captcha) { err.textContent = "أكمل التحقق الأمني أولاً"; return; }
    try { await withBusy(btn, () => signIn(email.value.trim(), pass.value, captcha, remember.checked)); await boot(); }
    catch (x) { err.textContent = x.message; captcha = ""; try { window.turnstile.reset(wid); } catch {} }
  } },
    h("div", { class: "brand-mark lg" }, h("img", { src: "logo-mark.webp", alt: "AMARIX007", style: { width: "100%", height: "100%", objectFit: "contain" } })),
    h("h1", null, "لوحة التحكم"), h("p", null, "AMARIX007 · إدارة المتجر"),
    h("label", { class: "field" }, h("span", null, "البريد الإلكتروني"), email),
    h("label", { class: "field" }, h("span", null, "كلمة المرور"), pass),
    rememberLabel, ts, err, btn);
  mount(app, h("div", { class: "login-wrap" }, form));
  loadTurnstile().then(() => { wid = window.turnstile.render(ts, { sitekey: TURNSTILE_KEY, theme: "auto", callback: (k) => (captcha = k), "expired-callback": () => (captcha = ""), "error-callback": () => (captcha = "") }); })
    .catch((x) => (err.textContent = x.message));
  window.__amxAdminReady?.();
}

/* ---------- الهيكل ---------- */
const GROUPS = { overview: "نظرة عامة", sales: "المبيعات والعملاء", catalog: "الكتالوج والمحتوى", finance: "المالية", integrations: "التكاملات", system: "النظام" };
function shell() {
  const nav = h("nav", { class: "nav", "aria-label": "التنقل الرئيسي" });
  const main = h("main", { class: "main", id: "main", tabindex: "-1" });
  const crumb = h("span", { class: "crumb" });
  const side = h("aside", { class: "sidebar" },
    h("div", { class: "brand" }, h("span", { class: "brand-mark" }, h("img", { src: "logo-mark.webp", alt: "AMARIX007", style: { width: "100%", height: "100%", objectFit: "contain" } })), h("div", null, h("b", null, "AMARIX007"), h("small", null, "STORE CONSOLE"))), nav,
    h("div", { class: "side-foot" }, h("div", { class: "me" }, h("span", { class: "avatar" }, (getSession()?.email || "?")[0].toUpperCase()), h("div", null, h("b", null, getSession()?.email || ""), h("small", null, isAdmin() ? "مدير" : "موظف"))),
      h("button", { class: "icon-btn", title: "تسجيل الخروج", onclick: () => signOut() }, icon("logout"))));
  const scrim = h("div", { class: "scrim", onclick: () => document.body.classList.remove("nav-open") });
  const top = h("header", { class: "topbar" },
    h("button", { class: "icon-btn menu", "aria-label": "القائمة", onclick: () => document.body.classList.toggle("nav-open") }, icon("menu")), crumb,
    h("div", { class: "spacer" }),
    h("button", { class: "icon-btn", title: "الوضع الليلي/النهاري", onclick: () => applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark") }, icon("sun")),
    h("a", { class: "btn ghost sm", href: "./", target: "_blank", rel: "noopener" }, icon("link", 15), "المتجر"));
  mount(app, h("div", { class: "layout" }, side, h("div", { class: "content" }, top, main), scrim));
  return { nav, main, crumb };
}
let ui = null, token = 0;
async function show(route) {
  document.body.classList.remove("nav-open");
  if (!ui) return;
  ui.nav.replaceChildren();
  const vis = visible();
  Object.entries(GROUPS).forEach(([g, label]) => {
    const items = vis.filter((r) => r.group === g); if (!items.length) return;
    ui.nav.append(h("div", { class: "nav-group" }, label), ...items.map((r) => h("a", { href: "#/" + r.id, class: r.id === route?.id ? "active" : "" }, icon(r.icon), h("span", null, r.title))));
  });
  if (!route) return mount(ui.main, empty("لا تملك صلاحية عرض أي قسم.", "shield"));
  ui.crumb.textContent = route.title;
  const my = ++token;
  mount(ui.main, spinner());
  try {
    const mod = await route.load();
    if (my !== token) return;
    const view = h("div", { class: "view" }, spinner());
    mount(ui.main, view);
    await mod.default(view, { route, go });
  } catch (e) { if (my === token) mount(ui.main, errorState(e, () => show(route))); }
  window.scrollTo(0, 0);
}

/* ---------- الإقلاع ---------- */
let started = false;
async function boot() {
  if (!getSession()) return loginView();
  mount(app, spinner("جارٍ التحقق من الصلاحيات…"));
  await loadRole();
  if (!hasAccess()) {
    mount(app, h("div", { class: "login-wrap" }, h("div", { class: "login-card" }, icon("shield", 40), h("h1", null, "لا تملك صلاحية الدخول"), h("p", null, "هذا الحساب ليس مديراً ولا موظفاً مفعّلاً."), h("button", { class: "btn", onclick: () => signOut() }, "تسجيل الخروج"))));
    return window.__amxAdminReady?.();
  }
  ui = shell(); window.__amxAdminReady?.();
  if (!started) { started = true; startRouter(show); } else show(visible().find((r) => r.id === current()) || visible()[0]);
}
onAuthChange((s) => { if (!s) { ui = null; loginView("تم تسجيل الخروج"); } });
boot().catch((e) => mount(app, errorState(e, () => location.reload())));
