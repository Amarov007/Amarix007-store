import { loadCatalog, data, edit } from "../core/catalog.js";
import { publishBar, imageField } from "../core/forms.js";
import { h, mount, pageHeader, field, input, switchEl, toast } from "../core/ui.js";
import { num } from "../core/utils.js";

const SOCIAL = [["whatsapp", "wa", "واتساب"], ["telegram", "tg", "تلغرام"], ["instagram", "ig", "إنستغرام"], ["x", "xx", "X"], ["youtube", "yt", "يوتيوب"], ["facebook", "fb", "فيسبوك"], ["tiktok", "tt", "تيك توك"], ["email", "mail", "البريد"]];

export default async function (view) {
  await loadCatalog(); const D = data();
  const bind = (get, set, props = {}) => input({ value: get() ?? "", oninput: (e) => edit(() => set(e.target.value)), ...props });
  const card = (title, ...kids) => h("div", { class: "card" }, h("h3", null, title), ...kids);
  const rates = Object.entries(D.rates || {});
  mount(view, pageHeader("إعدادات المتجر", "الهوية، الشريك، التواصل، العملات — تُنشر معاً عند الضغط على «نشر»"),
    card("الهوية", h("div", { class: "form-grid" }, field("الاسم — الجزء الأول", bind(() => D.site.n1, (v) => (D.site.n1 = v))), field("الاسم — الجزء الثاني", bind(() => D.site.n2, (v) => (D.site.n2 = v))),
      field("الشعار النصي (عربي)", bind(() => D.site.sa, (v) => (D.site.sa = v))), field("Tagline (EN)", bind(() => D.site.se, (v) => (D.site.se = v), { dir: "ltr" }))),
      field("وصف الموقع (SEO)", h("textarea", { class: "input", rows: 2, value: D.site.desc || "", oninput: (e) => edit(() => (D.site.desc = e.target.value)) })),
      imageField("الشعار", D.site.logo, (v) => edit(() => (D.site.logo = v)), 400),
      h("div", { class: "form-grid" }, [["g", "اللون الداكن"], ["m", "اللون الرئيسي"], ["ac", "لون التمييز"]].map(([k, l]) => field(l, input({ type: "color", value: D.site.col?.[k] || "#000000", oninput: (e) => edit(() => ((D.site.col ||= {})[k] = e.target.value.toUpperCase())) })))),
      switchEl(D.site.ai_on !== false, (v) => edit(() => (D.site.ai_on = v)), "تفعيل مساعد الذكاء الاصطناعي")),
    card("الشريك (بانر الإعلان)", switchEl(!!D.partner.on, (v) => edit(() => (D.partner.on = v)), "إظهار بانر الشريك"),
      h("div", { class: "form-grid", style: { marginTop: "12px" } }, [["name", "الاسم"], ["url", "الرابط"], ["ar", "النص (عربي)"], ["en", "Text (EN)"], ["ba", "زر (عربي)"], ["be", "Button (EN)"]].map(([k, l]) => field(l, bind(() => D.partner[k], (v) => (D.partner[k] = v), { dir: ["url", "en", "be", "name"].includes(k) ? "ltr" : undefined })))),
      imageField("شعار الشريك", D.partner.logo, (v) => edit(() => (D.partner.logo = v)), 400)),
    card("روابط التواصل", h("p", { class: "muted", style: { marginBottom: "10px" } }, "اترك الرابط فارغاً لإخفاء الأيقونة. رابط واتساب: الرقم الدولي بدون +."),
      h("div", { class: "form-grid" }, SOCIAL.map(([k, ic, l]) => field(l, bind(() => D.social?.[k]?.[1], (v) => ((D.social ||= {})[k] = [ic, v.trim(), D.social?.[k]?.[2] || ""]), { dir: "ltr" }))))),
    card("العملات وأسعار الصرف", h("p", { class: "notice", style: { marginBottom: "12px" } }, "العملة الأساسية USDT ثابتة = 1. سعر الليرة = كم ليرة مقابل 1 USDT. أسعار المنتجات تُدخل بـ USDT."),
      h("div", { class: "form-grid" }, rates.filter(([k]) => k !== "USD").map(([k, v]) => field(`${v[1]} (${k})`, input({ type: "number", step: "any", min: 0, value: v[0], dir: "ltr", oninput: (e) => { const n = num(e.target.value); if (n > 0) edit(() => (D.rates[k] = [n, v[1]])); } }))))),
    card("نصوص التذييل", h("div", { class: "form-grid" }, field("حقوق النشر (عربي)", bind(() => D.site.rt?.ar, (v) => ((D.site.rt ||= {}).ar = v))), field("Copyright (EN)", bind(() => D.site.rt?.en, (v) => ((D.site.rt ||= {}).en = v), { dir: "ltr" })),
      field("تنبيه المخاطر (عربي)", bind(() => D.site.risk?.ar, (v) => ((D.site.risk ||= {}).ar = v))), field("Risk notice (EN)", bind(() => D.site.risk?.en, (v) => ((D.site.risk ||= {}).en = v), { dir: "ltr" })))),
    publishBar());
}
