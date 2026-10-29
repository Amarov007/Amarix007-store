/* ===================================================================== AMARIX007 — Storefront logic (app.js) --------------------------------------------------------------------- Sections 1. Config & security notes 9. Views (pages) 2. Icons & brand logos 10. Orders, payments & tracking 3. Translations 11. AI support chat 4. State & storage 12. Actions (clicks) & sounds 5. Helpers (toast, loading) 13. Auth (login, signup, recovery, human check) 6. Supabase client 14. Search & router 7. Cart, coupon & totals 15. Boot 8. Sound effects SECURITY NOTES - This file uses ONLY the Supabase *anon* key. It is public by design; it is safe only because Row Level Security (RLS) is enabled. Never put a service_role key, payment secret or API secret here. - RLS must be ON for these tables (see supabase-schema.sql): orders -> a user can INSERT/SELECT only rows where user_id = auth.uid(); only admins can UPDATE. store_config -> SELECT for admins only (the storefront reads public_config(), which hides secret coupons); INSERT/UPDATE for admins only. profiles -> a user can read/update only their own row. api_settings -> admins only. NEVER readable by anon (it holds secret keys, so the storefront does not fetch it). - SMM-panel and AI-provider keys are used only by Supabase Edge Functions (supabase/functions/*), never by this file. - The built-in "human check" is a client-side deterrent. For real bot protection set TURNSTILE_SITE_KEY (section 13) and enable CAPTCHA in Supabase > Auth. - Prices shown in the browser are for display only: the orders_enforce_pricing trigger recomputes every order total on the server. ===================================================================== */
"use strict";

/* ---------- 1. Config ---------- */
const SB_URL = "https://pvuobngrybygohendwaz.supabase.co";
const SB_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dW9ibmdyeWJ5Z29oZW5kd2F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMTI0ODIsImV4cCI6MjEwNzg4ODQ4Mn0.enSKw1_Wt58iK8-Y0eaHMWtBGQ7HyYXP_JEwYLsSfpU"; // anon key only

const CFG0 = window.AMX || {};
const REMOTE_CFG = (() => {
  try {
    return JSON.parse(localStorage.getItem("amx_remote"));
  } catch {
    return null;
  }
})(); // optional cached copy
const ORDER_STATUSES = ["new", "processing", "done", "cancelled"];
const PAY_STATUSES = ["pending", "review", "paid"];

/* ---------- 2. Icons & brand logos ---------- */
const I = {
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  out: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 8l-4 4 4 4M6 12h10"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  cart: '<path d="M3 4h2l2.4 11h10.2l2-8H6.2"/><circle cx="9" cy="19" r="1.2"/><circle cx="17" cy="19" r="1.2"/>',
  heart:
    '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  home: '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-6h4v6"/>',
  box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  gamepad: '<path d="M7 9h10a5 5 0 0 1 4.7 6.7l-1 2.7a2.8 2.8 0 0 1-4.5 1.1L13.8 17h-3.6l-2.4 2.5a2.8 2.8 0 0 1-4.5-1.1l-1-2.7A5 5 0 0 1 7 9z"/><path d="M7 12v4M5 14h4M16 13h.01M18 15h.01"/>',
  bank: '<path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  phone:
    '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  bot: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6"/>',
  users:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.5 0 4.5 1.5 4.5 4"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v8h14v-8M7.5 8C5 8 5 4 8 4c2 0 4 4 4 4s2-4 4-4c3 0 3 4.5.5 4"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  bolt: '<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  send: '<path d="M4 12l16-8-6 16-3-7z"/>',
  chev: '<path d="M15 5l-7 7 7 7"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/>',
  spark:
    '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17v4M17 19h4"/>',
  hs: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/><path d="M19 20c0 1.5-2 2-5 2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 7l8 6 8-6"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  warn: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  refresh:
    '<path d="M20 11a8 8 0 0 0-14-4M4 5v3h3M4 13a8 8 0 0 0 14 4M20 19v-3h-3"/>',
  vol: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  musicoff: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/><path d="M3 3l18 18"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  wallet: '<path d="M3 7a2 2 0 0 1 2-2h13v4"/><path d="M3 7v11a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2z"/><circle cx="16.5" cy="14.5" r="1.2"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z" fill="currentColor"/>',
  bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21h4"/>',
  belloff: '<path d="M6 17V11a6 6 0 0 1 9-5.2M18 11v6l1.5 2H8"/><path d="M10 21h4M3 3l18 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  shield2: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
};
const ic = (name, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ I[name] || I.box }</svg>`;

/* Social networks: vector redraws of the brand marks (24x24, painted with currentColor). Admin can upload the official file per link; it then replaces the drawing. */
const BR = {
  wa: {
    bg: "#25D366",
    g: '<path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" d="M12.05 3.2a8.8 8.8 0 0 0-7.55 13.3L3.3 20.8l4.4-1.15A8.8 8.8 0 1 0 12.05 3.2z"/><path d="M9.1 7.9c.25-.5.6-.5.85-.5h.5c.2 0 .4.1.5.4l.75 1.8c.1.25 0 .45-.15.65l-.55.65c-.1.15-.1.3 0 .5a6.6 6.6 0 0 0 2.65 2.4c.2.1.4.1.5-.05l.7-.85c.2-.2.4-.2.6-.1l1.75.85c.25.1.35.3.3.55-.1 1-.85 1.9-1.9 2.1-.85.15-2.05.05-3.7-.7-2.1-.95-3.85-2.9-4.4-4.2-.5-1.15-.45-2.3.35-3.9z"/>',
  },
  tg: {
    bg: "#229ED9",
    g: '<path d="M19.9 4.4 3.6 10.7c-1.1.45-1.1 1.05-.2 1.3l4.2 1.3 9.7-6.1c.45-.28.88-.13.53.18l-7.85 7.1-.3 4.3c.43 0 .62-.2.86-.43l2.07-2 4.3 3.17c.8.43 1.36.2 1.56-.74l2.82-13.3c.3-1.15-.44-1.67-1.4-1.3z"/>',
  },
  ig: {
    bg: "radial-gradient(circle at 30% 107%,#fdf497 0%,#fdf497 5%,#fd5949 45%,#d6249f 60%,#285AEB 90%)",
    g: '<rect x="3.7" y="3.7" width="16.6" height="16.6" rx="5" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="12" r="3.9" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="17.1" cy="6.9" r="1.2"/>',
  },
  xx: {
    bg: "#000",
    g: '<path d="M17.75 3.5h2.9l-6.34 7.24L21.8 20.5h-5.85l-4.58-5.99-5.24 5.99H3.2l6.78-7.75L2.9 3.5h6l4.14 5.47zm-1.02 15.26h1.6L7.9 5.15H6.18z"/>',
  },
  yt: {
    bg: "#FF0000",
    g: '<path d="M21.6 8.2a2.5 2.5 0 0 0-1.77-1.77C18.27 6 12 6 12 6s-6.27 0-7.83.43A2.5 2.5 0 0 0 2.4 8.2C2 9.76 2 12 2 12s0 2.24.4 3.8a2.5 2.5 0 0 0 1.77 1.77C5.73 18 12 18 12 18s6.27 0 7.83-.43a2.5 2.5 0 0 0 1.77-1.77C22 14.24 22 12 22 12s0-2.24-.4-3.8zM10 14.9V9.1l5 2.9z"/>',
  },
  fb: {
    bg: "#1877F2",
    g: '<path d="M13.6 21v-7.6h2.55l.4-3h-2.95V8.5c0-.87.25-1.45 1.5-1.45h1.6V4.4c-.28-.04-1.22-.12-2.32-.12-2.3 0-3.87 1.4-3.87 3.97v2.15H7.9v3h2.6V21z"/>',
  },
  tt: {
    bg: "#000",
    g: '<path d="M16.6 3.5c.3 2.3 1.6 3.7 3.9 3.85v2.85a6.6 6.6 0 0 1-3.85-1.2v5.7a5.35 5.35 0 1 1-5.35-5.35c.28 0 .55.02.8.07v2.95a2.5 2.5 0 1 0 1.75 2.4V3.5z"/>',
  },
  mail: {
    bg: "#3b5537",
    g: '<rect x="3.2" y="5.6" width="17.6" height="12.8" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="m4.2 7.6 7.8 5.8 7.8-5.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>',
  },
};
/* Payment marks that can be drawn by the store (Syriatel/Sham need an uploaded official logo) */
const PAYG = {
  binance: {
    bg: "#F0B90B",
    fg: "#1E2329",
    g: '<path d="m12 3.2 2.6 2.6-1.5 1.5L12 6.2l-1.1 1.1-1.5-1.5zM6.2 9l1.5 1.5L6.2 12l1.5 1.5L6.2 15 3.2 12zM17.8 9l3 3-3 3-1.5-1.5L17.8 12l-1.5-1.5zM12 9.9l2.1 2.1-2.1 2.1-2.1-2.1zM9.4 16.2l1.5 1.5L12 18.8l1.1-1.1 1.5-1.5 1.5 1.5-2.6 2.6L12 21l-.4-.7-2.2-2.6z"/>',
  },
  syriatel: {
    bg: "#D71920",
    fg: "#fff",
    g: '<path d="M12 18.4a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2z"/><path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" d="M7.9 12.6a5.8 5.8 0 0 1 8.2 0M4.9 9.6a10 10 0 0 1 14.2 0"/>',
  },
  sham: {
    bg: "#1E4FD8",
    fg: "#fff",
    g: '<circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M14.8 9.4c-.5-1-1.5-1.5-2.8-1.5-1.5 0-2.6.8-2.6 2 0 3 5.6 1.4 5.6 4.3 0 1.2-1.2 2-2.9 2-1.4 0-2.5-.6-3-1.7"/>',
  },
  usdt: {
    bg: "#26A17B",
    fg: "#fff",
    g: '<path d="M13.2 11.3V9.9h3.9V7H6.9v2.9h3.9v1.4C7.6 11.45 5.2 12.1 5.2 12.9c0 .8 2.4 1.45 5.6 1.6v5.3h2.4v-5.3c3.2-.15 5.6-.8 5.6-1.6 0-.8-2.4-1.45-5.6-1.6zm0 2.55c-.1 0-.75.05-1.2.05s-1.1-.05-1.2-.05c-2.4-.1-4.1-.55-4.1-.95s1.7-.85 4.1-.95v1.55c.1 0 .75.05 1.2.05s1.1-.05 1.2-.05V11.95c2.4.1 4.1.55 4.1.95s-1.7.85-4.1.95z"/>',
  },
};
/* The store's own mark (same drawing as the header logo) */
const LOGO_SVG =
  '<svg viewBox="0 0 32 32" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 25.5L14 7L16.5 12" stroke="#B9FF66" stroke-width="2.75"/><path d="M10 18.5H19" stroke="#F3F3F3" stroke-width="2.25"/><path d="M16.5 12L20.5 18L26 8" stroke="#B9FF66" stroke-width="2.75"/><circle cx="26" cy="8" r="1.75" fill="#B9FF66"/></svg>';

/* ---------- 3. Translations ---------- */
const T = {
  ar: {
    ph: "ابحث…",
    home: "الرئيسية",
    fav: "المفضلة",
    cart: "السلة",
    ord: "طلباتي",
    all: "الكل",
    add: "أضف",
    buy: "شراء",
    visit: "زيارة الرابط",
    visitext: "رابط خارجي · يفتح في نافذة جديدة",
    visitshort: "رابط خارجي",
    visitbad: "الرابط غير متاح حالياً",
    none: "لا يوجد",
    sub: "المجموع الفرعي",
    dis: "الخصم",
    tot: "الإجمالي",
    cc: "كود الخصم",
    ap: "تطبيق",
    co: "تأكيد الطلب",
    ce: "سلتك فارغة",
    acc: "حسابي",
    login: "دخول",
    out: "خروج",
    nl: "الاسم",
    em: "البريد",
    pw: "كلمة المرور",
    wel: "مرحباً",
    reg: "حساب جديد",
    has: "لديك حساب؟",
    no: "ليس لديك حساب؟",
    lreq: "سجل الدخول أولاً",
    sup: "دعم",
    rt: "© 2026 AMARIX007. جميع الحقوق محفوظة.",
    added: "أُضيف إلى السلة",
    acclink: "رابط الحساب",
    needlink: "أدخل رابط الحساب للخدمات المطلوبة",
    cpnok: "تم تطبيق الكوبون",
    cpnbad: "كود الخصم غير صحيح",
    cpnrm: "إزالة",
    cpnon: "كوبون مُفعّل",
    waorder: "اطلب عبر واتساب",
    waunset: "رقم واتساب غير مُعد بعد",
    wahint: "يُرسل تفاصيل طلبك إلى واتساب لإتمام الدفع",
    ordfail: "تعذّر إنشاء الطلب. حاول مرة أخرى.",
    sesexp: "انتهت الجلسة، سجّل الدخول من جديد",
    donet: "تم استلام طلبك",
    doned: "أكمل الدفع بإحدى الوسائل ثم اضغط «تم الدفع» ليتحقق الفريق منه.",
    ordno: "رقم الطلب",
    vieword: "عرض طلباتي",
    keep: "متابعة التسوق",
    wacontact: "تواصل عبر واتساب",
    date: "التاريخ",
    status: "الحالة",
    items: "تفاصيل الطلب",
    qty: "الكمية",
    noord: "لا توجد طلبات بعد",
    noordd: "عندما تُنشئ طلباً سيظهر هنا.",
    loaderr: "تعذّر التحميل",
    retry: "إعادة المحاولة",
    loading: "جارٍ التحميل…",
    s_new: "جديد",
    s_processing: "قيد التنفيذ",
    s_done: "مكتمل",
    s_cancelled: "ملغي",
    push_t: "إشعارات الطلبات",
    push_d: "احصل على إشعار فور قبول طلبك أو بدء تنفيذه أو اكتماله.",
    push_btn: "تفعيل",
    push_active: "الإشعارات مفعّلة على هذا الجهاز",
    push_blocked: "الإشعارات محظورة لهذا الموقع. فعّلها من إعدادات المتصفح أو التطبيق ثم أعد المحاولة.",
    push_on: "تم تفعيل الإشعارات",
    push_denied: "لم يتم السماح بالإشعارات",
    push_fail: "تعذّر تفعيل الإشعارات، حاول لاحقاً",
    capbad: "تعذّر التحقق الأمني، حاول مرة أخرى",
    loggedin: "تم تسجيل الدخول",
    regok: "تم التسجيل. تحقق من بريدك إن طُلب التأكيد ثم سجّل الدخول.",
    weak: "ضعيفة",
    mid: "متوسطة",
    good: "جيدة",
    strong: "قوية",
    theme: "تبديل المظهر",
    badlogin: "البريد أو كلمة المرور غير صحيحة",
    unconf: "يرجى تأكيد بريدك أولاً",
    exists: "هذا البريد مسجّل مسبقاً",
    shortpw: "كلمة المرور قصيرة (6 أحرف على الأقل)",
    net: "تعذّر الاتصال بالخادم",
    total: "الإجمالي",
    coupon: "الكوبون",
    link: "الرابط",
    unitp: "سعر الوحدة",
    hi: "مرحباً AMARIX007،",
    /* recovery & email confirmation */
    forgot: "نسيت كلمة السر؟",
    forgothint: "أدخل بريدك وسنرسل لك رابطاً لتعيين كلمة سر جديدة.",
    forgotsend: "إرسال رابط الاستعادة",
    backlogin: "العودة لتسجيل الدخول",
    newpw: "كلمة السر الجديدة",
    confpw: "تأكيد كلمة السر",
    resetbtn: "حفظ كلمة السر",
    pwmis: "كلمتا السر غير متطابقتين",
    resetok: "تم تغيير كلمة السر بنجاح",
    resetbad: "رابط الاستعادة غير صالح أو منتهي. اطلب رابطاً جديداً.",
    chkt: "تحقق من بريدك",
    chkd: "أرسلنا رابط تأكيد الحساب إلى",
    chkh: "افتح الرسالة واضغط رابط التأكيد لتفعيل حسابك (تحقق من البريد المزعج أيضاً).",
    rcvt: "تم إرسال رابط الاستعادة",
    rcvd: "إن كان هذا البريد مسجلاً فستصلك رسالة برابط تعيين كلمة سر جديدة على",
    rcvh: "الرابط صالح لفترة قصيرة. تحقق من البريد المزعج أيضاً.",
    resend: "إعادة الإرسال",
    resent: "تمت إعادة الإرسال",
    wait30: "انتظر قليلاً قبل إعادة الإرسال",
    confok: "تم تأكيد بريدك وتسجيل دخولك",
    gbtn: "المتابعة عبر Google",
    gor: "أو",
    gerr: "تعذّر تسجيل الدخول عبر Google. حاول مرة أخرى.",
    tbtn: "المتابعة عبر تيليغرام",
    terr: "تعذّر تسجيل الدخول عبر تيليغرام. حاول مرة أخرى.",
    tcfg: "تسجيل الدخول عبر تيليغرام غير مفعّل بعد.",
    tretry: "جارٍ تجهيز تيليغرام… اضغط الزر مرة أخرى.",
    mailfail: "تعذّر إرسال البريد. حاول لاحقاً.",
    fill: "أدخل البريد الإلكتروني وكلمة المرور",
    fillm: "أدخل بريدك الإلكتروني",
    /* human verification */
    hv_ing: "جارٍ التحقق من أنك لست روبوتاً…",
    hv_ok: "تم التحقق بنجاح",
    hv_human: "أنا لست روبوتاً",
    hv_sec: "حماية",
    hv_help: "مساعدة",
    hv_wait: "أكمل التحقق الأمني أولاً",
    /* payments */
    paymethods: "وسائل الدفع",
    paysub: "ادفع بالطريقة الأنسب لك",
    paychoose: "اختر طريقة الدفع",
    paypick: "اختر طريقة الدفع أولاً",
    pay_pending: "بانتظار الدفع",
    pay_review: "قيد التحقق من الدفع",
    pay_paid: "تم الدفع",
    paidbtn: "تم الدفع",
    claimed: "تم إبلاغ الفريق بالدفع، سيتم التحقق قريباً",
    claimfail: "تعذّر إرسال الإبلاغ، حاول مجدداً",
    payhow: "طريقة الدفع",
    payto: "حوّل المبلغ إلى",
    copy: "نسخ",
    copied2: "تم النسخ",
    zoom: "تكبير الصورة",
    lbx: "إغلاق",
    qcustom: "كمية مخصصة",
    qminl: "الحد الأدنى",
    qmaxl: "الحد الأقصى",
    qinval: "الكمية خارج الحدود المسموحة",
    qtotl: "إجمالي هذه الكمية",
    qeach: "كل وحدة =",
    tkh: "الدعم الفني",
    tk_help: "تحتاج مساعدة بخصوص هذا الطلب؟",
    tk_helpd: "افتح تذكرة دعم وسيصلك الرد هنا وعلى بريدك الإلكتروني فور مراجعتها.",
    tk_open: "فتح تذكرة دعم",
    tk_subject: "عنوان المشكلة",
    tk_msg: "اشرح مشكلتك بالتفصيل",
    tk_ordph: "رقم الطلب (اختياري) مثال AMX-1001",
    tk_img: "إرفاق صورة (اختياري)",
    tk_send: "إرسال التذكرة",
    tk_ok: "تم إرسال تذكرتك، سنرد عليك قريباً",
    tk_fail: "تعذّر إرسال التذكرة",
    tk_setup: "نظام التذاكر غير مفعّل بعد في قاعدة البيانات (شغّل supabase-support-tickets.sql)",
    tk_wait: "أرسلت عدة تذاكر مؤخراً، انتظر قليلاً ثم حاول مجدداً",
    tk_my: "تذاكري",
    tk_none: "لا توجد تذاكر بعد",
    tk_s_open: "قيد المراجعة",
    tk_s_answered: "تم الرد",
    tk_s_closed: "مغلقة",
    tk_reply: "ردّ الدعم",
    tk_att: "صورة مرفقة",
    tk_ord: "الطلب",
    tk_short: "اكتب عنواناً ورسالة أوضح (5 أحرف على الأقل)",
    tk_acc: "تذاكر الدعم",
    tk_rq: "هل تم حل مشكلتك؟",
    tk_ry: "نعم، تم الحل",
    tk_rn: "لا، لم تُحل",
    tk_dy: "قيّمت الرد: تم حل المشكلة",
    tk_dn: "قيّمت الرد: لم تُحل — سنتابع معك قريباً",
    tk_rok: "شكراً على تقييمك",
    tk_rnok: "تم إعادة فتح التذكرة وسنرد عليك قريباً",
    copied: "تم النسخ",
    sendproof: "إرسال إثبات الدفع عبر واتساب",
    trk_ordered: "تم الطلب",
    trk_pay: "الدفع",
    trk_process: "قيد التنفيذ",
    trk_done: "مكتمل",
    paidmsg: "قمت بدفع الطلب رقم",
    paidwait: "بانتظار تأكيد الفريق للدفع",
    /* AI support */
    ai_title: "الدعم الفني الذكي",
    ai_ph: "اكتب سؤالك…",
    ai_hello: "أهلاً بك! أنا مساعد AMARIX007. كيف أقدر أساعدك؟",
    ai_err: "تعذّر الرد الآن. تواصل معنا عبر واتساب.",
    ai_wa: "تواصل عبر واتساب",
    ai_open: "الدعم الفني بالذكاء الاصطناعي",
    ai_close: "إغلاق",
    snd_on: "الصوت: تشغيل",
    snd_off: "الصوت: إيقاف",
    music_on: "الموسيقى: تشغيل",
    music_off: "الموسيقى: إيقاف",
    /* storefront v17: guards, filters, pages, payment proof */
    ratenote: "تقييم يحدده المتجر",
    soldn: "تم بيعه {n} مرة",
    best: "الأكثر مبيعاً",
    rv_rate: "قيّم المنتج:",
    rv_done: "تقييمك:",
    rv_comment: "أضف تعليقاً (اختياري)",
    rv_ok: "شكراً على تقييمك",
    rv_fail: "تعذّر إرسال التقييم",
    nores: "لا نتائج لـ",
    noresh: "جرّب كلمات أخرى أو تصفّح الأقسام.",
    clrq: "مسح البحث",
    catempty: "لا توجد منتجات في هذا القسم حالياً.",
    nofilt: "لا توجد منتجات تطابق الفلاتر المختارة.",
    fclear: "مسح الفلاتر",
    n_paid: "أرقام مدفوعة",
    n_free: "أرقام مجانية",
    n_svc: "الخدمة",
    n_cty: "الدولة",
    n_buy: "الشراء",
    n_pickS: "اختر الخدمة",
    n_pickC: "اختر الدولة",
    n_num: "رقم",
    n_off: "عرض",
    n_from: "من",
    n_back: "← رجوع",
    n_msgs: "عرض الرسائل",
    n_nofree: "لا توجد أرقام مجانية متاحة حالياً.",
    n_warn: "أرقام عامة مشتركة: أي شخص يستطيع رؤية نفس الرسائل والأكواد. لا تستخدمها لحسابات مهمة — للحساب الخاص بك وحدك استخدم الأرقام المدفوعة.",
    sortl: "الترتيب",
    sort_def: "الافتراضي",
    sort_pa: "السعر: الأقل أولاً",
    sort_pd: "السعر: الأعلى أولاً",
    sort_bs: "الأكثر مبيعاً",
    badlink: "الرابط غير صالح: أدخل رابطاً يبدأ بـ http(s):// أو اسم مستخدم مثل @username",
    qtyl: "الكمية",
    unit1: "وحدة",
    units: "وحدات",
    deliv: "التسليم",
    dl0: "منصة / رابط",
    dl1: "بيانات حساب",
    dl2: "ملف",
    dl3: "تنفيذ على رابط العميل",
    related: "منتجات من نفس القسم",
    cpnline: "لديك كوبون خصم، أدخله في السلة",
    payin: "المبلغ بعملة الوسيلة",
    pmgen: "وسيلة دفع",
    faq: "الأسئلة الشائعة",
    faqh: "إجابات سريعة عن الدفع والتسليم والطلبات.",
    fq_pay: "كيف أدفع؟",
    fa_pay: "أضف المنتج إلى السلة، اختر وسيلة الدفع ثم أكمل الطلب. ستظهر لك بيانات التحويل مع زر نسخ؛ حوّل المبلغ ثم اضغط «تم الدفع». ويمكنك قبل ذلك إرفاق صورة إثبات الدفع.",
    fq_when: "متى يُسلَّم طلبي؟",
    fa_when: "بعد تحقق الفريق من الدفع.",
    fq_profit: "هل الربح مضمون؟",
    fa_profit: "لا. التداول ينطوي على مخاطر ولا نعد بأي أرباح أو نتائج. نبيع أدوات ومنتجات رقمية فقط.",
    fq_link: "أين أضع رابط حسابي؟",
    fa_link: "للخدمات التي تتطلب رابط الحساب (مثل زيادة المتابعين): في خانة «رابط الحساب» داخل السلة قبل تأكيد الطلب. يُقبل رابط يبدأ بـ http(s):// أو اسم مستخدم مثل @username.",
    fq_track: "أين أتابع طلبي؟",
    fa_track: "من صفحة «طلباتي» بعد تسجيل الدخول: يظهر شريط تتبع (تم الطلب ← الدفع ← قيد التنفيذ ← مكتمل).",
    pol: "السياسات",
    polh: "شروط الشراء والتسليم والاسترجاع.",
    po_dig_t: "منتجات رقمية",
    po_dig: "جميع المنتجات والخدمات رقمية وتُسلَّم إلكترونياً؛ لا يوجد شحن مادي.",
    po_ref_t: "الاسترجاع",
    po_ref: "لا استرجاع بعد التسليم الرقمي، إلا إذا لم يُنفَّذ الطلب.",
    po_man_t: "الدفع اليدوي",
    po_man: "الدفع يدوي: تحوّل المبلغ إلى الحساب الظاهر للوسيلة التي اخترتها ثم تضغط «تم الدفع»، ويتحقق الفريق منه يدوياً قبل التنفيذ.",
    po_risk_t: "تحذير مخاطر التداول",
    po_prv_t: "الخصوصية",
    po_prv: "نجمع الاسم والبريد وبيانات الطلبات وإثباتات الدفع لتنفيذ طلباتك والتواصل معك فقط، ولا نبيعها لأي طرف. تُخزَّن البيانات لدى مزوّد قواعد البيانات الذي نستخدمه، وتُرسَل الإشعارات عبر خدمة الإشعارات في متصفحك. يمكنك طلب حذف حسابك وبياناتك بالتواصل معنا.",
    po_trm_t: "الشروط والمسؤولية",
    po_trm: "أنت المسؤول عن استخدام ما تشتريه بما يوافق شروط المنصات وشركات التمويل والجهات المنظِّمة في بلدك، وقد تتغير سياسات هذه الأطراف خارج سيطرتنا. لا نضمن أي أرباح أو نتائج. باستخدامك المتجر فأنت توافق على هذه الشروط.",
    pg_t: "فعّل الإشعارات للمتابعة",
    pg_d: "نحتاج الإشعارات لنُعلمك فور تأكيد الدفع وتسليم طلبك وردود الدعم. اضغط «تفعيل الإشعارات» ثم اختر «السماح».",
    pg_btn: "تفعيل الإشعارات",
    pg_blk: "الإشعارات محظورة لهذا الموقع. افتح إعدادات المتصفح ← إعدادات الموقع ← الإشعارات ← اختر «السماح»، ثم اضغط «تحقّق مجدداً».",
    pg_re: "تحقّق مجدداً",
    proof: "إثبات الدفع",
    proofhint: "ارفع صورة إيصال التحويل (JPG أو PNG أو WebP). لا يمكن الضغط على «تم الدفع» قبل رفع الإثبات.",
    proofreq: "مطلوب",
    proofpick: "اضغط هنا لاختيار صورة الإيصال",
    prooflock: "ارفع صورة الإثبات أولاً لتفعيل زر «تم الدفع»",
    proofneed: "ارفع صورة إثبات الدفع أولاً",
    proofbtn: "رفع صورة الإثبات",
    proofing: "جارٍ الرفع…",
    proofok: "تم إرفاق الإثبات",
    proofbad: "الملف ليس صورة صالحة (JPG أو PNG أو WebP)",
    proofbig: "الصورة كبيرة جداً (الحد 5MB)",
    proofsetup: "ميزة إثبات الدفع غير مفعّلة بعد على الخادم",
    proofdeny: "تعذّر إرفاق الإثبات: الطلب ليس بانتظار الدفع أو ليس لحسابك",
    prooffail: "تعذّر رفع الإثبات، حاول مرة أخرى",
  },
  en: {
    ph: "Search…",
    home: "Home",
    fav: "Wishlist",
    cart: "Cart",
    ord: "Orders",
    all: "All",
    add: "Add",
    buy: "Buy",
    visit: "Visit link",
    visitext: "External link · opens in a new tab",
    visitshort: "External link",
    visitbad: "Link unavailable right now",
    none: "No results",
    sub: "Subtotal",
    dis: "Discount",
    tot: "Total",
    cc: "Coupon code",
    ap: "Apply",
    co: "Confirm order",
    ce: "Your cart is empty",
    acc: "Account",
    login: "Sign in",
    out: "Sign out",
    nl: "Name",
    em: "Email",
    pw: "Password",
    wel: "Welcome",
    reg: "Sign up",
    has: "Have an account?",
    no: "No account?",
    lreq: "Please sign in first",
    sup: "Support",
    rt: "© 2026 AMARIX007. All rights reserved.",
    added: "Added to cart",
    acclink: "Account link",
    needlink: "Enter the account link for the services that need it",
    cpnok: "Coupon applied",
    cpnbad: "Invalid coupon code",
    cpnrm: "Remove",
    cpnon: "Coupon active",
    waorder: "Order via WhatsApp",
    waunset: "WhatsApp number is not configured yet",
    wahint: "Sends your order details to WhatsApp to complete payment",
    ordfail: "Could not create the order. Please try again.",
    sesexp: "Session expired, please sign in again",
    donet: "Your order was received",
    doned:
      "Pay with one of the methods below, then tap “I have paid” so the team can verify it.",
    ordno: "Order number",
    vieword: "View my orders",
    keep: "Keep shopping",
    wacontact: "Contact on WhatsApp",
    date: "Date",
    status: "Status",
    items: "Order details",
    qty: "Qty",
    noord: "No orders yet",
    noordd: "Your orders will appear here once you place one.",
    loaderr: "Could not load",
    retry: "Retry",
    loading: "Loading…",
    s_new: "New",
    s_processing: "In progress",
    s_done: "Completed",
    s_cancelled: "Cancelled",
    push_t: "Order notifications",
    push_d: "Get notified as soon as your order is accepted, started or completed.",
    push_btn: "Enable",
    push_active: "Notifications are on for this device",
    push_blocked: "Notifications are blocked for this site. Allow them in your browser or app settings, then try again.",
    push_on: "Notifications enabled",
    push_denied: "Notifications were not allowed",
    push_fail: "Couldn't enable notifications, please try later",
    capbad: "Security check failed, please try again",
    loggedin: "Signed in",
    regok: "Signed up. Confirm your email if asked, then sign in.",
    weak: "Weak",
    mid: "Fair",
    good: "Good",
    strong: "Strong",
    theme: "Toggle theme",
    badlogin: "Incorrect email or password",
    unconf: "Please confirm your email first",
    exists: "This email is already registered",
    shortpw: "Password too short (min 6 characters)",
    net: "Could not reach the server",
    total: "Total",
    coupon: "Coupon",
    link: "Link",
    unitp: "Unit price",
    hi: "Hello AMARIX007,",
    forgot: "Forgot password?",
    forgothint:
      "Enter your email and we will send you a link to set a new password.",
    forgotsend: "Send reset link",
    backlogin: "Back to sign in",
    newpw: "New password",
    confpw: "Confirm password",
    resetbtn: "Save password",
    pwmis: "Passwords do not match",
    resetok: "Password changed successfully",
    resetbad: "The reset link is invalid or expired. Request a new one.",
    chkt: "Check your email",
    chkd: "We sent an account confirmation link to",
    chkh: "Open the email and tap the confirmation link to activate your account (check spam too).",
    rcvt: "Reset link sent",
    rcvd: "If this email is registered, you will receive a message with a link to set a new password at",
    rcvh: "The link is valid for a short time. Check spam too.",
    resend: "Resend",
    resent: "Email sent again",
    wait30: "Please wait a moment before resending",
    confok: "Email confirmed and you are signed in",
    gbtn: "Continue with Google",
    gor: "or",
    gerr: "Google sign-in failed. Please try again.",
    tbtn: "Continue with Telegram",
    terr: "Telegram sign-in failed. Please try again.",
    tcfg: "Telegram sign-in is not enabled yet.",
    tretry: "Getting Telegram ready… tap the button again.",
    mailfail: "Could not send the email. Try again later.",
    fill: "Enter your email and password",
    fillm: "Enter your email",
    hv_ing: "Verifying you are not a robot…",
    hv_ok: "Verification successful",
    hv_human: "I am not a robot",
    hv_sec: "Security",
    hv_help: "Help",
    hv_wait: "Complete the security check first",
    paymethods: "Payment methods",
    paysub: "Pay the way that suits you",
    paychoose: "Choose a payment method",
    paypick: "Choose a payment method first",
    pay_pending: "Awaiting payment",
    pay_review: "Payment under review",
    pay_paid: "Paid",
    paidbtn: "I have paid",
    claimed: "The team was notified and will verify your payment soon",
    claimfail: "Could not send the notice, try again",
    payhow: "Payment method",
    payto: "Transfer the amount to",
    copy: "Copy",
    copied2: "Copied",
    zoom: "Enlarge image",
    lbx: "Close",
    qcustom: "Custom quantity",
    qminl: "Minimum",
    qmaxl: "Maximum",
    qinval: "Quantity is outside the allowed range",
    qtotl: "Total for this quantity",
    qeach: "Each unit =",
    tkh: "Support",
    tk_help: "Need help with this order?",
    tk_helpd: "Open a support ticket and we will reply here and to your email once reviewed.",
    tk_open: "Open a support ticket",
    tk_subject: "Subject",
    tk_msg: "Describe your issue",
    tk_ordph: "Order number (optional), e.g. AMX-1001",
    tk_img: "Attach an image (optional)",
    tk_send: "Send ticket",
    tk_ok: "Your ticket was sent. We will reply soon.",
    tk_fail: "Could not send the ticket",
    tk_setup: "Ticket system is not set up in the database yet (run supabase-support-tickets.sql)",
    tk_wait: "You sent several tickets recently. Please wait a moment and try again.",
    tk_my: "My tickets",
    tk_none: "No tickets yet",
    tk_s_open: "Under review",
    tk_s_answered: "Answered",
    tk_s_closed: "Closed",
    tk_reply: "Support reply",
    tk_att: "Image attached",
    tk_ord: "Order",
    tk_short: "Write a clearer subject and message (5+ characters)",
    tk_acc: "Support tickets",
    tk_rq: "Was your issue solved?",
    tk_ry: "Yes, solved",
    tk_rn: "No, not solved",
    tk_dy: "You rated: issue solved",
    tk_dn: "You rated: not solved. We will follow up soon",
    tk_rok: "Thanks for your feedback",
    tk_rnok: "Ticket reopened. We will reply soon",
    copied: "Copied",
    sendproof: "Send payment proof on WhatsApp",
    trk_ordered: "Ordered",
    trk_pay: "Payment",
    trk_process: "In progress",
    trk_done: "Completed",
    paidmsg: "I paid for order",
    paidwait: "Waiting for the team to confirm payment",
    ai_title: "AI support",
    ai_ph: "Type your question…",
    ai_hello: "Hi! I am the AMARIX007 assistant. How can I help?",
    ai_err: "I cannot answer right now. Contact us on WhatsApp.",
    ai_wa: "Contact on WhatsApp",
    ai_open: "AI technical support",
    ai_close: "Close",
    snd_on: "Sound: on",
    snd_off: "Sound: off",
    music_on: "Music: on",
    music_off: "Music: off",
    /* storefront v17: guards, filters, pages, payment proof */
    ratenote: "Rating set by the store",
    soldn: "Sold {n} times",
    best: "Best seller",
    rv_rate: "Rate this product:",
    rv_done: "Your rating:",
    rv_comment: "Add a comment (optional)",
    rv_ok: "Thanks for your rating",
    rv_fail: "Couldn't send the rating",
    nores: "No results for",
    noresh: "Try other words or browse the categories.",
    clrq: "Clear search",
    catempty: "There are no products in this category yet.",
    nofilt: "No products match the selected filters.",
    fclear: "Clear filters",
    n_paid: "Paid numbers",
    n_free: "Free numbers",
    n_svc: "Service",
    n_cty: "Country",
    n_buy: "Buy",
    n_pickS: "Choose a service",
    n_pickC: "Choose a country",
    n_num: "numbers",
    n_off: "offers",
    n_from: "from",
    n_back: "← Back",
    n_msgs: "View messages",
    n_nofree: "No free numbers available right now.",
    n_warn: "Shared public numbers: anyone can see the same messages and codes. Do not use them for important accounts — use paid numbers for your own private account.",
    sortl: "Sort",
    sort_def: "Default",
    sort_pa: "Price: low to high",
    sort_pd: "Price: high to low",
    sort_bs: "Best sellers",
    badlink: "Invalid link: enter a link starting with http(s):// or a username like @username",
    qtyl: "Quantity",
    unit1: "unit",
    units: "units",
    deliv: "Delivery",
    dl0: "Platform / link",
    dl1: "Account details",
    dl2: "File",
    dl3: "Done on the customer's link",
    related: "More from this category",
    cpnline: "You have a discount coupon, enter it in the cart",
    payin: "Amount in method currency",
    pmgen: "Payment method",
    faq: "FAQ",
    faqh: "Quick answers about payment, delivery and orders.",
    fq_pay: "How do I pay?",
    fa_pay: "Add the product to the cart, choose a payment method and complete the order. The transfer details appear with a copy button; transfer the amount, then tap “I have paid”. Before that you can attach a photo of the payment proof.",
    fq_when: "When is my order delivered?",
    fa_when: "After the team verifies the payment.",
    fq_profit: "Is profit guaranteed?",
    fa_profit: "No. Trading involves risk and we do not promise any profit or results. We only sell digital tools and products.",
    fq_link: "Where do I put my account link?",
    fa_link: "For services that need an account link (such as followers): in the “Account link” field in the cart before confirming the order. A link starting with http(s):// or a username like @username is accepted.",
    fq_track: "Where can I follow my order?",
    fa_track: "From the “Orders” page after signing in: a tracker shows Ordered → Payment → In progress → Completed.",
    pol: "Policies",
    polh: "Purchase, delivery and refund terms.",
    po_dig_t: "Digital products",
    po_dig: "All products and services are digital and delivered electronically; nothing is shipped physically.",
    po_ref_t: "Refunds",
    po_ref: "No refunds after digital delivery, unless the order was not fulfilled.",
    po_man_t: "Manual payment",
    po_man: "Payment is manual: you transfer the amount to the account shown for the method you chose, then tap “I have paid”, and the team verifies it manually before fulfilling the order.",
    po_risk_t: "Trading risk warning",
    po_prv_t: "Privacy",
    po_prv: "We collect your name, email, order data and payment proofs only to fulfil your orders and contact you, and we never sell them. Data is stored with our database provider, and notifications are delivered through your browser's push service. You can ask us to delete your account and data by contacting us.",
    po_trm_t: "Terms and responsibility",
    po_trm: "You are responsible for using what you buy in line with the terms of the platforms, funding firms and regulators that apply to you; their policies may change outside our control. We do not guarantee any profit or result. By using the store you accept these terms.",
    pg_t: "Turn on notifications to continue",
    pg_d: "We need notifications to tell you the moment your payment is confirmed, your order is delivered, or support replies. Tap “Enable notifications”, then choose “Allow”.",
    pg_btn: "Enable notifications",
    pg_blk: "Notifications are blocked for this site. Open browser settings → Site settings → Notifications → choose “Allow”, then tap “Check again”.",
    pg_re: "Check again",
    proof: "Payment proof",
    proofhint: "Upload a photo of the transfer receipt (JPG, PNG or WebP). “I have paid” stays locked until the proof is uploaded.",
    proofreq: "Required",
    proofpick: "Tap here to choose the receipt image",
    prooflock: "Upload the proof image first to enable “I have paid”",
    proofneed: "Upload the payment proof first",
    proofbtn: "Upload proof image",
    proofing: "Uploading…",
    proofok: "Proof attached",
    proofbad: "The file is not a valid image (JPG, PNG or WebP)",
    proofbig: "The image is too large (5MB max)",
    proofsetup: "Payment proof is not enabled on the server yet",
    proofdeny: "Could not attach the proof: the order is not awaiting payment or is not yours",
    prooffail: "Could not upload the proof, try again",
  },
};

/* ---------- 4. State & storage ---------- */
const ls = {
  json(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : v;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(
        key,
        typeof value === "string" ? value : JSON.stringify(value)
      );
    } catch {}
  },
  del(key) {
    try {
      localStorage.removeItem(key);
    } catch {}
  },
};

/* Only two currencies exist: USDT (base, rate 1) and SYP. Older configs (SAR base + AED/EUR/...) are converted: SYP per 1 USDT = SYP rate / USD rate. Product prices are read as USDT. */
function normRates(r) {
  r = r && typeof r == "object" ? r : {};
  const num = (x) => (Array.isArray(x) && +x[0] > 0 ? +x[0] : 0);
  const u = num(r.USD),
    sy = num(r.SYP);
  let syp = sy ? (u ? (u === 1 ? sy : sy / u) : sy / 0.267) : 140;
  syp = Math.round(syp * 100) / 100;
  return { USD: [1, "USDT"], SYP: [syp, (r.SYP && r.SYP[1]) || "ل.س"] };
}
let CFG, C, P, E, BN, CP, R, SOC, BASE, PM, CV;
const CPV = {}; // coupons confirmed by the server (check_coupon RPC): code -> [percent, fixed]
const cpOf = (c) => (c && (CPV[c] || (CP && CP[c]))) || null; // store config: categories, products, embeds, banners, coupons, rates, payment methods
let lang = ls.get("lang", "ar");
let cur = ls.get("cur3", "SYP"); // Syrian pound by default (new key so older saved choices, e.g. SAR/AED/EUR, do not override it)
let th = ls.get("th2", "dark"); // dark by default
let cart = ls.json("cart", []);
let STATS = {}; // product_stats(): { id: { s: sold, rc: reviews, ra: avg } }
let MYREV = {}; // my submitted reviews: "orderId|productId" -> rating
let cartSyncT = 0,
  cartSyncLast = "";
const viewed = new Set();
let fav = ls.json("fav", []);
let coupon = ls.get("amx_coupon", "");
let payMethod = ls.get("amx_pay", ""); // chosen payment method id
let sndOn = ls.get("snd", "0") === "1"; // click sounds: opt-in
let user = null; // Supabase user object when signed in
let profileName = ""; // name from profiles table (best effort)
let profileSince = ""; // profiles.created_at (member since)
let accStats = { n: null, done: 0, at: 0, busy: false }; // order counts for the account page
let profileUid = ""; // short numeric UID from profiles.uid (supabase-user-uid.sql)
let q = ""; // search query
let returnTo = ""; // where to go after login
let lastOrder = null; // info for the success page
let routeSeq = 0; // guards async pages against stale renders
let loadingCfg = true; // true until the remote config answered
let googleOn = ls.get("amx_gg") === "1"; // Google provider enabled in Supabase (checked at boot, cached)
const PUBLIC_ROUTES = ["login", "policies", "faq"]; // reachable without an account
const GUEST_ROUTES = ["", "c", "p", "x", "g", "boost", "cart", "fav"]; // browsing + cart: open to visitors; checkout, orders, account, support and partner still need an account
let authMode = "login"; // login | signup | forgot | reset | check
let checkKind = "signup"; // what the "check your email" page is about: signup | recover
let pendingEmail = "";
let recovery = null; // { access_token, refresh_token } from a password-recovery link
let resendAt = 0;
const claimed = {}; // order ids the user just reported as paid
const proofDone = {}; // order ids whose payment proof was just attached
let bq = 1, bqId = ""; // quick quantity chosen on a boost product page

if (!T[lang]) lang = "ar";

/* Config: embedded store-data.js, overridden by a newer remote copy */
function setCfg(cfg) {
  CFG = cfg;
  SOC = cfg.social || {};
  C = (CFG.categories || []).map((c) => ({
    ty: "shop",
    ...c,
    ar: ex(c.ar),
    en: ex(c.en),
    da: ex(c.da),
    de: ex(c.de),
    f: (c.f || []).map((f) => ({
      ...f,
      ar: ex(f.ar),
      en: ex(f.en),
      o: Array.isArray(f.o) ? f.o.map((x) => String(x).trim()).filter(Boolean) : [],
    })),
  }));
  P = (CFG.products || [])
    .filter((p) => p && p.dup !== true && p.hid !== true) // dup:true = duplicate copy, hid:true = hidden by the admin (bulk action): both stay in the database / admin only
    .map((p) => ({
      tg: "",
      sp: "",
      r: 5,
      n: 0,
      o: 0,
      d: 0,
      ...p,
      ar: ex(p.ar),
      en: ex(p.en),
      sp: ex(p.sp),
      images: p.images || [],
    }))
    .filter((p) => C.some((c) => c.id == p.c));
  E = (CFG.embeds || []).filter((e) => e && !embedBad(e)); // placeholder embeds (example.com / draft text) never reach customers
  BN = (CFG.banners || []).map((b) => ({
    ...b,
    ar: ex(b.ar),
    en: ex(b.en),
    sa: ex(b.sa),
    se: ex(b.se),
  })).filter((b) => b.img || !(isGenericTitle(b.ar) && isGenericTitle(b.en))); // untouched placeholder banners without a picture are hidden
  CP = CFG.coupons && typeof CFG.coupons == "object" ? CFG.coupons : {}; // only the coupons the server chose to publish; the rest are checked through check_coupon()
  CV = C.filter((c) => P.some((p) => p.c == c.id) || (c.ty == "numbers" && freeOf(c).length) || E.some((e) => e.c == c.id && embedOk(e)) || catEmbedOk(c)); // sections with nothing to show are hidden from the strip and the home grid (data is untouched)
  if (window.AMXHub) CV = AMXHub.apply(CV, C); // hubs.js: games / apps are folded into two master sections (members keep their ids and routes)
  /* The strip, home grid and drawer must never show the same section twice: drop repeated ids, entries without any name, and standalone
     categories that carry the same name as a master section (games / apps). Data is untouched; only the lists are cleaned. */
  {
    const nk = (v) => String(v == null ? "" : v).normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f\u064b-\u065f\u0640]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
    const hubNames = new Set();
    CV.forEach((c) => { if (c.ty == "hub") [c.ar, c.en].forEach((v) => nk(v) && hubNames.add(nk(v))); });
    const seen = new Set();
    CV = CV.filter((c) => {
      if (!c || !String(c.ar || c.en || "").trim()) return false;
      if (seen.has(String(c.id))) return false;
      seen.add(String(c.id));
      if (c.ty != "hub" && [c.ar, c.en].some((v) => nk(v) && hubNames.has(nk(v)))) return false;
      return true;
    });
  }
  // Payment methods: blank name/icon/colour/instructions fall back to the embedded default of the same id (or same icon); a card with no name and no logo is not shown
  const PM0 = CFG0.payments || [];
  PM = (CFG.payments || [])
    .filter((m) => m && m.on !== false)
    .map((m) => {
      const d0 =
        PM0.find((x) => x.id == m.id) ||
        PM0.find((x) => m.icon && x.icon == m.icon) ||
        {};
      const f = (k) => (m[k] == null || m[k] === "" ? d0[k] ?? "" : m[k]);
      return {
        ...m,
        ar: ex(f("ar")),
        en: ex(f("en")),
        da: ex(f("da")),
        de: ex(f("de")),
        acc: ex(m.acc),
        icon: f("icon"),
        color: payColor(f("color")), // white / near-white falls back to the brand colour
        currency: String(m.currency || d0.currency || "").trim().toUpperCase(),
      };
    })
    .filter((m) => (m.ar || m.en || m.logo || pmReadable(m))); // account/address is private and returned only by payment_instructions()
  Object.keys(SBM).forEach((k) => delete SBM[k]); // boost panel: platform / type detection is recomputed for the new catalogue
  R = normRates(CFG.rates);
  BASE = "USD";
  if (!R[cur]) cur = "SYP";
  if (payMethod && payMethod != "wallet" && !PM.some((m) => m.id == payMethod)) payMethod = "";
  cleanCart();
}

/* ---------- 5. Helpers ---------- */
const $ = (s) => document.querySelector(s);
const ex = (x) =>
  String(x ?? "").replace(/[&<>"']/g, (c) => "&#" + c.charCodeAt(0) + ";"); // HTML-escape
const safeUrl = (u) => {
  u = String(u || "").trim();
  return /^(https?:|mailto:|tel:|#|\/|\.\/)/i.test(u) ? u : "";
};
/* Product kind: "buy" (default: cart + order) or "link" (visit-only item: no price, no cart, just a button that opens an external page) */
const isVisit = (p) => !!p && p.k === "link";
const visitUrl = (p) => {
  const u = String((p && p.lu) || "").trim();
  return /^https?:\/\/[^\s/?#]+\.[^\s/?#]+/i.test(u) ? u : "";
};
const visitLabel = (p) => ex((lang == "ar" ? p.lba : p.lbe) || (lang == "ar" ? p.lbe : p.lba) || t("visit"));
const visitBtn = (p, big) => {
  const u = visitUrl(p);
  return u
    ? `<a class="b vis${big ? " big" : ""}" data-a="visit" data-id="${ex(p.id)}" href="${ex(u)}" target="_blank" rel="noopener noreferrer nofollow" aria-label="${visitLabel(p)} — ${t("visitext")}"><span class="vis-t">${visitLabel(p)}</span><span class="vis-i">${ic("ext", big ? 18 : 16)}</span></a>`
    : `<span class="b vis off${big ? " big" : ""}" aria-disabled="true">${t("visitbad")}</span>`;
};
const frameSrc = (u) => {
  try {
    const x = new URL(safeUrl(u), location.href);
    return x.protocol === "https:" && x.origin !== location.origin ? x.href : ""; // never frame our own origin (the sandbox would not isolate it)
  } catch {
    return "";
  }
};
const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(String(c || "")) ? c : "");
const t = (k) => (T[lang] && T[lang][k]) || k;
const cat = (id) => C.find((c) => c.id == id);
const prod = (id) => P.find((p) => p.id == id);
const pmOf = (id) => PM.find((m) => m.id == id);
const pmName = (m) =>
  m[lang] || m.ar || m.en || ex(pmReadable(m)) || t("pmgen"); // never show an internal key such as pmm…
const pr = (p) => p.p * (1 - (p.d || 0) / 100); // unit price after product discount (base currency)
const fmt = (v, k = cur) => {
  if (!R[k]) k = BASE;
  const x =
    k == "SYP"
      ? Math.round(v * R[k][0]).toLocaleString("en-US")
      : (v * R[k][0]).toFixed(2);
  return x + " " + R[k][1];
};
const money = (v) => `<bdi dir="ltr">${fmt(v)}</bdi>`;
const nameOf = () =>
  profileName ||
  (user &&
    user.user_metadata &&
    (user.user_metadata.full_name || user.user_metadata.name)) ||
  "";
const plain = (s) =>
  String(s || "").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)); // undo ex(): only for plain-text targets (WhatsApp, DB, textContent), never for HTML
const dec = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}; // malformed %-sequences in the URL must not break routing


/* ---- display guards (storefront only; the stored data is never changed) ---- */
const PLACEHOLDER_RE = /example\.com|ضع هنا رابط الموقع/i;
const hostUrl = (u) => /^https?:\/\/[^\s/?#]+\.[^\s/?#]+/i.test(safeUrl(u));
const embedBad = (e) => PLACEHOLDER_RE.test([e.u, e.ar, e.en, e.da, e.de].join(" "));
const embedOk = (e) => hostUrl(e.u) && !embedBad(e);
const catEmbedOk = (c) =>
  hostUrl(c.embed_url) && !PLACEHOLDER_RE.test(String(c.embed_url));
const isGenericTitle = (x) => /^\s*(عنوان|title)\s*$/i.test(String(x || ""));
const bannerLabel = (b) =>
  b[lang] && !isGenericTitle(b[lang])
    ? b[lang]
    : ex(((CFG.site && CFG.site.n1) || "") + ((CFG.site && CFG.site.n2) || "")) ||
      "AMARIX007";
function nearWhite(c) {
  const h = String(c || "").trim().replace("#", "");
  let r, g, b;
  if (/^[0-9a-f]{3,4}$/i.test(h))
    [r, g, b] = [...h].slice(0, 3).map((x) => parseInt(x + x, 16));
  else if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h))
    [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  else return false;
  return Math.min(r, g, b) >= 238;
}
const payColor = (c) => (safeColor(c) && !nearWhite(c) ? safeColor(c) : "");
const PM_NAMES = {
  usdt: "USDT",
  binance: "Binance Pay",
  syriatel: "Syriatel Cash",
  sham: "Sham Cash",
};
/* Readable fallback name for a payment method with no name: known ids / icons, else a tidy id; internal keys (pm + random) give "" */
function pmReadable(m) {
  const id = String(m.id || ""),
    k = id.toLowerCase();
  if (PM_NAMES[k]) return PM_NAMES[k];
  if (PM_NAMES[m.icon]) return PM_NAMES[m.icon];
  if (/^pm[a-z0-9]{5,}$/i.test(id) || /^[a-z]*\d[a-z0-9]{6,}$/i.test(id)) return "";
  return id
    .replace(/[-_]+/g, " ")
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .trim();
}
/* Boost / SMM products need the customer's account link */
const hasSmm = (p) => {
  const v = String(p.smm_service ?? "").trim();
  return v !== "" && v !== "0";
};
/* Items fulfilled through a provider that are NOT boost services (activation numbers, game top-ups, subscriptions).
   The admin marks them with smm_input: "none" = nothing to type (number / ready code), "text" = the buyer types a player ID or an email. */
const apiMode = (p) => hasSmm(p) && !!String(p.smm_input ?? "").trim();
const apiInput = (p) => apiMode(p) && String(p.smm_input).trim() != "none";
const inputOk = (v) => {
  v = String(v || "").trim();
  return v.length >= 2 && v.length <= 120 && !/[\u0000-\u001f<>]/.test(v);
};
const isSmmType = (p) => !p.ptype || p.ptype === "smm"; // products typed by the importer as game_topup / app_subscription / gift_card are never boosting (no link + quantity form)
const needsLink = (p) => {
  const c = cat(p.c);
  return isSmmType(p) && !apiMode(p) && ((c && c.ty == "boost") || hasSmm(p));
};
/* what the buyer must type for an API product (set per product in the admin: req = player_id / server_id / email / phone) */
const REQ_L = { player_id: ["معرّف اللاعب (Player ID)", "Player ID"], server_id: ["رقم السيرفر (Server ID)", "Server ID"], email: ["البريد الإلكتروني", "Email"], phone: ["رقم الهاتف", "Phone"] };
const reqHint = (p) => {
  const r = Array.isArray(p.req) ? p.req.filter((k) => REQ_L[k]) : [];
  if (!r.length) return lang == "ar" ? "المعرّف أو الإيميل" : "ID or email";
  return r.map((k) => REQ_L[k][lang == "ar" ? 0 : 1]).join(r.length > 1 ? " | " : "");
};
const qLimited = (p) => needsLink(p) || apiMode(p); // products whose quantity follows the product's own min / max
function linkOk(v) {
  v = String(v || "").trim();
  if (!v || v.length > 500 || /\s/.test(v)) return false;
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      return /^https?:$/.test(u.protocol) && u.hostname.includes(".");
    } catch {
      return false;
    }
  }
  return /^@?[A-Za-z0-9._]{2,64}$/.test(v);
}
const smmEq = (p, n) => {
  const u = +p.smm_qty;
  return u > 1
    ? `<div class="smm-q"><bdi dir="ltr">${n} × ${u} = ${n * u}</bdi></div>`
    : "";
};
/* Buyer's currency: the currency of the chosen payment method (what they actually transfer), else the currency picked in the store. Saved on the order so the Telegram notification shows the same amount the buyer saw. */
function payCurrency() {
  const m = pmOf(payMethod),
    k = m && m.currency;
  return k && R[k] ? k : R[cur] ? cur : BASE;
}
function convRow(total) {
  const m = pmOf(payMethod),
    k = m && m.currency;
  if (!k || !R[k]) return "";
  return `<div class="row conv"><span>${t("payin")} (${ex(k == "USD" ? "USDT" : k)})</span><b class="n"><bdi dir="ltr">${fmt(total, k)}</bdi></b></div>`;
}
/* Per-method transfer limits (admin › وسائل الدفع: min / max, in the method's own currency, else USD). Shared by the cart, quick buy and wallet top-up. */
const pmCur = (m) => (m && m.currency && R[m.currency] ? m.currency : BASE);
const pmAmt = (v, k) => fmt(v / ((R[k] && R[k][0]) || 1), k); // v is already in currency k
function pmLimitErr(m, usd) {
  if (!m || !(usd > 0)) return "";
  const k = pmCur(m),
    v = usd * ((R[k] && R[k][0]) || 1),
    mn = +m.min || 0,
    mx = +m.max || 0,
    A = lang == "ar",
    nm = plain(pmName(m));
  if (mn > 0 && v + 1e-9 < mn) return `${A ? "أقل مبلغ للتحويل عبر" : "Minimum transfer with"} ${nm}: ${pmAmt(mn, k)}`;
  if (mx > 0 && v - 1e-9 > mx) return `${A ? "أعلى مبلغ للتحويل عبر" : "Maximum transfer with"} ${nm}: ${pmAmt(mx, k)}`;
  return "";
}
const pmLimitHint = (m, usd) => {
  const e = pmLimitErr(m, usd);
  return e ? `<p class="hint wl-low">${ic("warn", 14)} ${ex(e)}</p>` : "";
};
function emptyBox(icon, title, hint, extra) {
  return `<div class="emp">${ic(icon, 40)}<br><b>${ex(title)}</b>${hint ? `<br><small>${ex(hint)}</small>` : ""}${extra ? `<br><br>${extra}` : ""}</div>`;
}
const ratingHtml = (p) => {
  const st = STATS[p.id],
    real = st && +st.rc > 0,
    r = real ? +st.ra : +p.r || 0,
    n = real ? +st.rc : +p.n || 0;
  const stars =
    n > 0
      ? `<div class="rt">${ic("star", 14)} ${r.toFixed(1)} <small>(${ex(n)})</small></div>${real ? "" : `<div class="rt-n">${t("ratenote")}</div>`}`
      : "";
  const sold = st && +st.s > 0 ? `<div class="rt-n sold">${ex(t("soldn").replace("{n}", st.s))}</div>` : "";
  const best = +p.bs > 0 && +p.bs <= 3 && st && +st.s > 0 ? `<span class="best">${t("best")}</span>` : ""; // only with real paid sales
  return stars + sold + best;
};

/* ---- category filters & sorting ---- */
const FS = {};
const fstate = (id) => FS[id] || (FS[id] = { sel: {}, sort: "def", ty: "", pv: "", dl: "", av: "av" }); // av: "av" = available only (default), "" = all, "out" = unavailable
const fhay = (p) =>
  nz(plain([p.tg, p.sp, p.ar, p.en, p.ds && p.ds.ar, p.ds && p.ds.en].join(" ")));
function optHit(hay, opt) {
  const o = nz(plain(opt)).trim();
  if (!o) return false;
  if (/^[\x00-\x7f]+$/.test(o))
    return new RegExp(
      "(^|[^a-z0-9])" + o.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)"
    ).test(hay);
  return hay.includes(o);
}
function catList(c) {
  const st = fstate(c.id);
  let a = P.filter((p) => p.c == c.id);
  c.f.forEach((g, gi) => {
    const s = (st.sel[gi] || []).filter((j) => g.o[j] != null);
    if (!s.length) return;
    a = a.filter((p) => {
      const h = fhay(p);
      return s.some((j) => optHit(h, g.o[j]));
    });
  });
  /* strict filters from svc-parse.js: type / provider / delivery / availability */
  if (window.AMXSvc) a = AMXSvc.refine(a, { type: st.ty, provider: st.pv, delivery: st.dl, avail: st.av == "av" ? "available" : st.av == "out" ? "out" : "" }, {});
  else if (st.av == "av") a = a.filter((p) => p.oos !== true);
  /* bs is a rank set in the admin: 1 = first, 0 / empty = unranked (last). Every sort ends with the same tie-breakers, so equal values never shuffle */
  if (["pa", "pd", "bs"].includes(st.sort) && window.AMXSvc) return AMXSvc.sortList(a, st.sort, { price: pr });
  const rk = (p) => (+p.bs > 0 ? +p.bs : 1e9);
  const by = {
    pa: (x, y) => pr(x) - pr(y) || String(x.id).localeCompare(String(y.id)),
    pd: (x, y) => pr(y) - pr(x) || String(x.id).localeCompare(String(y.id)),
    bs: (x, y) => rk(x) - rk(y) || String(x.id).localeCompare(String(y.id)),
  }[st.sort];
  return by ? [...a].sort(by) : a;
}
/* extra filter selects of a category page (only the ones that make sense for the products inside) */
function catAdv(c) {
  const all = P.filter((p) => p.c == c.id), sv = window.AMXSvc;
  if (!sv || all.length < 2) return "";
  const st = fstate(c.id), ar = lang == "ar";
  const types = [...new Set(all.map((p) => sv.typeOf(p)))], provs = [...new Set(all.map((p) => sv.providerOf(p)))].sort();
  const sel = (k, label, opts, cur) => `<label class="fsort"><span>${ex(label)}</span><select class="sel" data-a="cfx" data-k="${ex(k)}" data-c="${ex(c.id)}">${opts.map(([v, l]) => `<option value="${ex(v)}"${cur == v ? " selected" : ""}>${ex(l)}</option>`).join("")}</select></label>`;
  const pvName = (k) => (k == "main" ? (ar ? "المزوّد الرئيسي (SMM)" : "Main provider (SMM)") : k == "manual" ? (ar ? "يدوي" : "Manual") : k == "fazer" ? "FazerCards" : k);
  return (
    (types.length > 1 ? sel("ty", ar ? "النوع" : "Type", [["", ar ? "الكل" : "All"], ...types.map((k) => [k, sv.typeLabel(k, ar)])], st.ty) : "") +
    (provs.length > 1 ? sel("pv", ar ? "المزوّد" : "Provider", [["", ar ? "الكل" : "All"], ...provs.map((k) => [k, pvName(k)])], st.pv) : "") +
    sel("dl", ar ? "التسليم" : "Delivery", [["", ar ? "الكل" : "All"], ["auto", ar ? "تلقائي" : "Automatic"], ["manual", ar ? "يدوي" : "Manual"]], st.dl) +
    (all.some((p) => p.oos === true) ? sel("av", ar ? "التوفر" : "Availability", [["av", ar ? "المتاح فقط" : "Available only"], ["", ar ? "الكل" : "All"], ["out", ar ? "غير متاح" : "Unavailable"]], st.av) : "")
  );
}
function catControls(c, total) {
  const st = fstate(c.id);
  const chips = c.f
    .map((g, gi) =>
      g.o.length
        ? `<div class="fgrp"><span class="fl">${g[lang] || g.ar || g.en}</span><div class="fchips">${g.o
            .map((o, oi) => {
              const on = (st.sel[gi] || []).includes(oi);
              return `<button type="button" class="fchip${on ? " on" : ""}" aria-pressed="${on}" data-a="ff" data-c="${ex(c.id)}" data-g="${gi}" data-o="${oi}">${ex(o)}</button>`;
            })
            .join("")}</div></div>`
        : ""
    )
    .join("");
  const n = Object.values(st.sel).reduce((s0, a) => s0 + a.length, 0);
  const sort =
    total > 1
      ? `<label class="fsort"><span>${t("sortl")}</span><select class="sel" data-a="sort" data-c="${ex(c.id)}">${[
          ["def", "sort_def"],
          ["pa", "sort_pa"],
          ["pd", "sort_pd"],
          ["bs", "sort_bs"],
        ]
          .map(([k, l]) => `<option value="${k}"${st.sort == k ? " selected" : ""}>${t(l)}</option>`)
          .join("")}</select></label>`
      : "";
  const nx = (st.ty ? 1 : 0) + (st.pv ? 1 : 0) + (st.dl ? 1 : 0);
  const clr = n || nx ? `<button type="button" class="b b2 sm" data-a="ffclr" data-c="${ex(c.id)}">${t("fclear")}</button>` : "";
  const adv = catAdv(c);
  return chips || sort || adv ? `<div class="box fbar">${chips}<div class="fact">${adv}${sort}${clr}</div></div>` : "";
}
function toggleFilter(b) {
  const st = fstate(b.dataset.c),
    gi = +b.dataset.g,
    oi = +b.dataset.o,
    s = st.sel[gi] || (st.sel[gi] = []),
    k = s.indexOf(oi);
  k < 0 ? s.push(oi) : s.splice(k, 1);
  render();
}
function clearFilters(id) {
  FS[id] = { sel: {}, sort: fstate(id).sort, ty: "", pv: "", dl: "", av: "av" };
  render();
}
function searchPage() {
  const a = P.filter((p) => hit(p, q) && !p.ext),
    st = a.filter((p) => !isBoost(p)),
    nb = a.length - st.length;
  const bl = nb
    ? `<a class="box sb-found" href="#/boost" data-a="sbgo">${ic("trend", 22)}<span style="flex:1">${nb} ${lang == "ar" ? "خدمة رشق مطابقة لبحثك — افتح منصة الرشق" : "matching boost services — open the Boost panel"}</span>${ic("chev", 16)}</a>`
    : "";
  return (
    `<h2>${t("all")}</h2>` +
    bl +
    (st.length
      ? grid(st)
      : nb
      ? ""
      : emptyBox("search", `${t("nores")} «${q}»`, t("noresh"), `<button class="b b2" data-a="clrq">${t("clrq")}</button>`))
  );
}
function flagLink(l) {
  const empty = !(l.x.l || "").trim();
  toast(t(empty ? "needlink" : "badlink"), "wn");
  const i = [...document.querySelectorAll("input[data-a=lk]")].find(
    (el) => el.dataset.id == l.p.id
  );
  if (i) {
    i.setAttribute("aria-invalid", "true");
    i.focus();
    try {
      i.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch {}
  }
}

function save() {
  cartSync();
  ls.set("cart", cart);
  ls.set("fav", fav);
  ls.set("lang", lang);
  ls.set("cur3", cur);
  ls.set("th2", th);
  ls.set("amx_coupon", coupon);
  ls.set("amx_pay", payMethod);
  ls.set("snd", sndOn ? "1" : "0");
}

/* Toast: type = 'ok' | 'er' | 'wn' */
let toastTimer;
function toast(msg, type = "ok") {
  const el = $("#ts");
  el.innerHTML =
    ic(type == "er" ? "x" : type == "wn" ? "warn" : "check", 16) +
    "<span></span>";
  el.lastChild.textContent = msg;
  el.className = "s " + type;
  el.setAttribute("role", type == "er" ? "alert" : "status");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => {
      el.className = "";
    },
    type == "ok" ? 1800 : 3600
  );
  if (type == "er") beep("er");
  else if (type == "wn") beep("wn");
}

/* Button loading state */
function setBusy(btn, on) {
  if (!btn) return;
  if (on) {
    btn.dataset.html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spin"></span>' + btn.textContent;
  } else if (btn.dataset.html != null) {
    btn.innerHTML = btn.dataset.html;
    btn.disabled = false;
    delete btn.dataset.html;
  }
}
const loadingBox = () =>
  `<div class="loading"><span class="spin"></span>${t("loading")}</div>`;
const skeletonGrid = () =>
  `<div class="sk sm" style="margin-bottom:12px"></div><div class="grid">${'<div class="sk"></div>'.repeat( 4 )}</div>`;

/* Pretty placeholder for products without an image */
const hue = (s) => {
  let h = 0;
  for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 110 + (h % 60);
};
function placeholder(p, c) {
  const icon = p.ptype === "game_topup" ? "gamepad" : ((c && c.i) || "box");
  return `<span class="ph" style="--h:${hue(p.id)}" aria-hidden="true">${ic(icon, 42)}</span>`;
}
const art = (p, c) => {
  const im = p.img || (c && /^https:\/\//.test(c.image_url || "") && c.ty != "boost" ? c.image_url : ""); // no own picture: use the game / app icon of its category
  return im ? `<img class="pim" loading="lazy" src="${ex(im)}" alt="" data-ph="${ex( p.id )}">` : placeholder(p, c);
};
// If a product image fails to load, swap in the placeholder
document.addEventListener(
  "error",
  (e) => {
    const el = e.target;
    if (el && el.tagName == "IMG" && el.dataset.ph) {
      const p = prod(el.dataset.ph);
      if (p) el.outerHTML = placeholder(p, cat(p.c));
    }
  },
  true
);

/* Brand marks */
const brandSvg = (g, size) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true">${g}</svg>`;
function socialLink([code, url, logo], label) {
  const href = safeUrl(url);
  if (!href) return "";
  const b = BR[code] || BR.mail;
  const inner = logo ? `<img src="${ex(logo)}" alt="" loading="lazy" decoding="async">` : brandSvg(b.g, 22);
  return `<a class="sl" style="background:${logo ? "#fff" : b.bg}" href="${ex( href )}" target="_blank" rel="noopener" aria-label="${ex( label || code )}">${inner}</a>`;
}
const payKey = (m) => {
  const k = [m.id, m.icon, m.en, m.ar, m.name].join(" ").toLowerCase();
  return /binance|بايننس/.test(k) ? "binance" : /usdt|tether|bep20/.test(k) ? "usdt" : /syriatel|سيريتل|سيرياتيل/.test(k) ? "syriatel" : /sham|شام/.test(k) ? "sham" : "";
};
function payLogo(m, size = 44) {
  const st = `width:${size}px;height:${size}px`;
  // Use the real uploaded logo first; payment v2 exposes config fields on each method.
  const logo = String(m.logo || m.logo_url || m.image_url || "").trim();
  if (/^(https:\/\/|data:image\/)/i.test(logo))
    return `<span class="pl pl-img" style="${st};background:#fff;overflow:hidden;display:inline-flex;align-items:center;justify-content:center"><img src="${ex(logo)}" alt="${ex(pmName(m))}" loading="lazy" decoding="async" style="display:block;width:100%;height:100%;object-fit:contain;padding:3px"></span>`;
  const nmRaw = plain(m.en || m.ar || pmReadable(m) || "");
  const nm = nmRaw.replace(/[^A-Za-z0-9؀-ۿ ]/g, "").trim();
  const key = (String(m.id || "") + " " + nmRaw).toLowerCase();
  const official = [
    [/\b(binance|bnb)\b/, "https://cdn.simpleicons.org/binance/F0B90B"],
    [/\b(usdt|tether)\b/, "https://cdn.simpleicons.org/tether/26A17B"],
    [/\bvisa\b/, "https://cdn.simpleicons.org/visa/1A1F71"],
    [/\bmastercard\b/, "https://cdn.simpleicons.org/mastercard/EB001B"],
    [/\bpaypal\b/, "https://cdn.simpleicons.org/paypal/003087"],
    [/\bapple pay\b/, "https://cdn.simpleicons.org/applepay/000000"],
    [/\bgoogle pay\b/, "https://cdn.simpleicons.org/googlepay/4285F4"],
  ].find(([re]) => re.test(key));
  if (official)
    return `<span class="pl pl-img" style="${st};background:#fff;overflow:hidden;display:inline-flex;align-items:center;justify-content:center"><img src="${official[1]}" alt="${ex(pmName(m))}" loading="lazy" decoding="async" style="display:block;width:100%;height:100%;object-fit:contain;padding:6px"></span>`;
  const g = PAYG[payKey(m)] || PAYG[m.icon];
  if (g)
    return `<span class="pl" style="${st};background:${g.bg};color:${g.fg}"><svg viewBox="1.5 1.5 21 21" width="${size * 0.66}" height="${size * 0.66}" fill="currentColor" aria-hidden="true">${g.g}</svg></span>`;
  if (!nm)
    return `<span class="pl" style="${st};background:${safeColor(m.color) || "#191A23"};color:#fff">${ic("card", size * 0.5)}</span>`;
  const ini = ex(nm.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?");
  return `<span class="pl" style="${st};background:${safeColor(m.color) || "#191A23"};color:#fff"><b>${ini}</b></span>`;
}

/* ---------- 6. Supabase client (anon key + user JWT) ---------- */
const jwtExp = (tk) => {
  try {
    return (
      JSON.parse(atob(tk.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
        .exp || 0
    );
  } catch {
    return 0;
  }
};

function storeSession(j) {
  if (j.access_token) ls.set("amx_token", j.access_token);
  if (j.refresh_token) ls.set("amx_refresh", j.refresh_token);
  if (j.user) {
    ls.set("amx_user", j.user);
    user = j.user;
    setTimeout(pushSync, 0);
    setTimeout(cartSync, 0);
  }
}
function clearSession() {
  ["amx_token", "amx_refresh", "amx_user"].forEach(ls.del);
  user = null;
  profileName = "";
  profileUid = "";
  profileSince = "";
  accStats = { n: null, done: 0, at: 0, busy: false };
  try {
    walletReset();
  } catch {}
}
/* Returns a valid access token (refreshing if needed) or null when signed out */
async function getToken() {
  const tk = ls.get("amx_token");
  if (!tk) return null;
  if (jwtExp(tk) - 60 > Date.now() / 1000) return tk;
  const rt = ls.get("amx_refresh");
  if (!rt) {
    clearSession();
    return null;
  }
  try {
    const r = await fetch(SB_URL + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { apikey: SB_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: rt }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error("refresh");
    storeSession(j);
    return j.access_token;
  } catch (err) {
    if (!navigator.onLine) return tk; // offline: keep session, request will fail on its own
    clearSession();
    return null;
  }
}
/* Generic REST helper. auth:false -> anon key only. */
async function sb(path, { method = "GET", body, auth = true, prefer } = {}) {
  const tk = auth ? await getToken() : null;
  const headers = {
    apikey: SB_KEY,
    Authorization: "Bearer " + (tk || SB_KEY),
    "Content-Type": "application/json",
  };
  if (prefer) headers.Prefer = prefer;
  return fetch(SB_URL + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
// Narrow bridge for the external CSP-compatible pay.js module; all sensitive state remains in this closure.
window.AMXPayTransport = {
  rpc: (name, args = {}, auth = true) => sb("/rest/v1/rpc/" + encodeURIComponent(name), { method: "POST", body: args, auth }),
  edge: (name, args = {}) => sb("/functions/v1/" + encodeURIComponent(name), { method: "POST", body: args, auth: true }),
  user: () => user,
  payLogo: (m, size) => payLogo(m, size),
  token: () => getToken(),
  proofBlob: (file) => proofBlob(file),
  putProof: (token, path, blob) => putProof(token, path, blob),
  refreshWallet: () => loadWallet(true),
  toast: (message, kind) => toast(message, kind),
  lang: () => lang,
  ex: (value) => ex(value),
};


/* ---------- Store stats, product views, cart sync, reviews (server functions already in the database) ---------- */
async function loadStats() {
  try {
    const r = await sb("/rest/v1/rpc/product_stats", { method: "POST", body: {}, auth: false });
    if (!r.ok) return false;
    const d = await r.json();
    if (d && typeof d == "object" && !Array.isArray(d)) {
      const same = JSON.stringify(d) === JSON.stringify(STATS);
      STATS = d;
      return !same;
    }
  } catch {}
  return false;
}
function trackView() {
  try {
    const m = location.hash.match(/^#\/p\/([^/?]+)/);
    if (!m) return;
    const id = decodeURIComponent(m[1]);
    if (viewed.has(id)) return;
    viewed.add(id);
    sb("/rest/v1/rpc/track_view", { method: "POST", body: { p_product: id }, auth: false }).catch(() => {});
  } catch {}
}
/* Saves the signed-in user's cart on the server (debounced) so the hourly job can send an abandoned-cart reminder */
function cartSync() {
  clearTimeout(cartSyncT);
  cartSyncT = setTimeout(async () => {
    try {
      if (!user || !ls.get("amx_token")) return;
      const items = cart.filter((x) => x && x.id && x.q > 0).map((x) => ({ id: x.id, q: x.q }));
      const key = JSON.stringify(items);
      if (key === cartSyncLast) return;
      const r = await sb("/rest/v1/rpc/save_cart", { method: "POST", body: { p_items: items, p_lang: lang } });
      if (r.ok) cartSyncLast = key;
    } catch {}
  }, 3000);
}
async function loadMyReviews() {
  try {
    const r = await sb("/rest/v1/rpc/my_reviews", { method: "POST", body: {} });
    if (!r.ok) return;
    const d = await r.json();
    MYREV = {};
    (Array.isArray(d) ? d : []).forEach((x) => (MYREV[x.o + "|" + x.p] = +x.r));
  } catch {}
}
function rateRow(o, i, st) {
  if (st != "done" || !i || !i.id) return "";
  const mine = MYREV[o.id + "|" + i.id];
  if (mine) return `<div class="rv-row"><small>${t("rv_done")} ${ic("star", 12).repeat(mine)}</small></div>`;
  return `<div class="rv-row"><small>${t("rv_rate")}</small> ${[1, 2, 3, 4, 5]
    .map((v) => `<button class="rv-s" data-a="rate" data-o="${ex(o.id)}" data-p="${ex(i.id)}" data-v="${v}" aria-label="${v}">${ic("star", 22)}</button>`)
    .join("")}</div>`;
}
async function rateItem(b) {
  const o = b.dataset.o,
    pid = b.dataset.p,
    v = +b.dataset.v;
  if (!(v >= 1 && v <= 5)) return;
  let c = "";
  try {
    c = prompt(t("rv_comment"), "");
  } catch {}
  if (c === null) return; // cancelled
  setBusy(b, true);
  try {
    const r = await sb("/rest/v1/rpc/submit_review", {
      method: "POST",
      body: { p_order: o, p_product: pid, p_rating: v, p_comment: (c || "").slice(0, 500) },
    });
    if (r.ok) {
      MYREV[o + "|" + pid] = v;
      toast(t("rv_ok"));
      await loadStats();
      render();
      return;
    }
    toast(t("rv_fail"), "er");
  } catch {
    toast(t("rv_fail"), "er");
  }
  setBusy(b, false);
}

/* ---------- 7. Cart, coupon & totals ---------- */
function cleanCart() {
  cart = cart.filter((x) => x && prod(x.id) && x.q > 0);
}
const cartLines = () =>
  cart.map((x) => ({ x, p: prod(x.id) })).filter((l) => l.p && !isVisit(l.p));
const cartCount = () => cartLines().length; // badge counts cart lines, never SMM units/views

/* Coupons are no longer published in full: the server confirms a code on request (public.check_coupon) and the order trigger recomputes the discount anyway */
async function checkCoupon(code) {
  code = String(code || "").trim().toUpperCase();
  if (!/^[A-Z0-9_-]{1,40}$/.test(code)) return false;
  if (cpOf(code)) return true;
  try {
    const r = await sb("/rest/v1/rpc/check_coupon", { method: "POST", body: { p_code: code }, auth: false });
    if (!r.ok) return false;
    const v = await r.json();
    if (Array.isArray(v)) {
      CPV[code] = v;
      return true;
    }
  } catch {}
  return false;
}
/* Coupon format in store-data.js: CODE: [percent, fixedAmountInBaseCurrency] e.g. "AMARIX10": [10, 0] */
function totals() {
  const sub = cartLines().reduce((s, l) => s + pr(l.p) * l.x.q, 0);
  const cp = cpOf(coupon);
  const disc = cp
    ? Math.min(sub, (sub * (+cp[0] || 0)) / 100 + (+cp[1] || 0))
    : 0;
  return { sub, disc, total: Math.max(0, sub - disc) };
}
function addToCart(id, n = 1) {
  if (isVisit(prod(id))) return; // visit-only items are never ordered
  const pp = prod(id);
  if (pp && pp.oos === true) { toast(lang == "ar" ? "هذا المنتج غير متاح حالياً" : "This product is currently unavailable", "er"); return; }
  n = Math.max(1, Math.min(QCAP, Math.floor(+n) || 1));
  if (pp && qLimited(pp)) n = qClamp(pp, n);
  const x = cart.find((c) => c.id == id);
  x ? (x.q = Math.min(QCAP, x.q + n)) : cart.push({ id, q: n });
  if (pp && qLimited(pp)) {
    const y = cart.find((c) => c.id == id);
    if (y && y.q > qMax(pp)) y.q = qMax(pp);
  }
  save();
  nav();
}

/* Clipboard with a fallback for browsers/contexts where navigator.clipboard is unavailable */
async function copyText(v) {
  v = String(v ?? "");
  try {
    await navigator.clipboard.writeText(v);
    return true;
  } catch {}
  try {
    const ta = document.createElement("textarea");
    ta.value = v;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, v.length);
    const ok = document.execCommand("copy");
    ta.remove();
    return !!ok;
  } catch {
    return false;
  }
}

/* ---------- Quantity limits for boost items (admin sets qmin / qmax per product, in units) ---------- */
const QCAP = 1e7; // highest quantity of one line (boost services are ordered in real units, providers allow up to millions)
const qMin = (p) => Math.max(1, Math.floor(+(p && p.qmin)) || 1);
const qMax = (p) => {
  const v = Math.floor(+(p && p.qmax)) || 0;
  return v > 0 ? Math.min(QCAP, Math.max(v, qMin(p))) : QCAP;
};
const qClamp = (p, n) => Math.min(qMax(p), Math.max(qMin(p), Math.floor(+n) || qMin(p)));
const fmtN = (n) => Number(n).toLocaleString("en-US");
const qUnit1 = (p) => !!(p && p.smm_service && !apiMode(p) && !(+p.smm_qty > 1)); // boost service sold per single unit (quantity = real units)
const qPresets = (p) => {
  const lo = qMin(p),
    hi = qMax(p),
    set = new Set();
  if (qUnit1(p)) {
    /* provider min, a few round numbers inside [min, max], and the provider max */
    set.add(lo);
    [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 500000, 1000000].forEach((v) => v > lo && v < hi && set.add(v));
    if (hi < QCAP && hi > lo) set.add(hi);
    const all = [...set].sort((x, y) => x - y);
    if (all.length <= 6) return all;
    return [0, 1, 2, 3, 4, 5].map((i) => all[Math.round((i * (all.length - 1)) / 5)]);
  }
  [1, 2, 5, 10, 25].forEach((m) => lo * m <= hi && set.add(lo * m));
  return [...set];
};
/* +/- button step: 1 for normal products, a tenth of the current magnitude for single-unit boost services (so 1,000,000 is reachable) */
const qStep = (p, n, d) => (qUnit1(p) ? d * Math.max(1, Math.pow(10, Math.floor(Math.log10(Math.max(n, 1))) - 1)) : d);
function qtyBox(p) {
  const lo = qMin(p),
    hi = qMax(p),
    u = +p.smm_qty > 0 ? +p.smm_qty : 0,
    n = bq;
  const chips = qPresets(p)
    .map(
      (k) =>
        `<button type="button" role="radio" aria-checked="${k == n}" class="qchip${k == n ? " on" : ""}" data-a="bq" data-n="${k}">${
          u ? fmtN(k * u) : fmtN(k) + " <small>" + t(k == 1 ? "unit1" : "units") + "</small>"
        }</button>`
    )
    .join("");
  return `<div class="qpick"><small>${t("qtyl")}</small><div class="qchips" role="radiogroup" aria-label="${t("qtyl")}">${chips}</div>
<div class="qcustom"><small>${t("qcustom")}${u > 1 ? ` <span class="qeach">(${t("qeach")} <bdi dir="ltr">${fmtN(u)}</bdi>)</span>` : ""}</small>
<div class="qstep"><button type="button" class="qs" data-a="bqs" data-d="-1" aria-label="-">−</button><input id="bq-in" class="inp qin" type="number" inputmode="numeric" min="${lo}" max="${hi}" step="1" value="${n}" dir="ltr" data-a="bqin" aria-label="${t("qcustom")}"><button type="button" class="qs" data-a="bqs" data-d="1" aria-label="+">+</button></div>
<small class="qhint">${t("qminl")}: <bdi dir="ltr">${fmtN(lo)}</bdi>${hi < QCAP ? ` · ${t("qmaxl")}: <bdi dir="ltr">${fmtN(hi)}</bdi>` : ""}</small></div>
<div class="qsum"><span id="bq-eq">${smmEq(p, n)}</span><span class="qtot">${t("qtotl")}: <b class="n" id="bq-tot">${money(pr(p) * n)}</b></span></div></div>`;
}
/* Live update while the buyer types a custom quantity (no re-render, so the keyboard stays open) */
function bqLive(raw) {
  const p = prod(bqId);
  if (!p) return;
  const v = Math.floor(+raw) || 0,
    ok = v >= qMin(p) && v <= qMax(p),
    n = qClamp(p, v);
  bq = n;
  const eq = $("#bq-eq"),
    tot = $("#bq-tot"),
    inp = $("#bq-in");
  if (eq) eq.innerHTML = smmEq(p, n);
  if (tot) tot.innerHTML = money(pr(p) * n);
  if (inp) inp.setAttribute("aria-invalid", ok ? "false" : "true");
  document.querySelectorAll('.qchip').forEach((c) => {
    const on = +c.dataset.n == n && ok;
    c.classList.toggle("on", on);
    c.setAttribute("aria-checked", String(on));
  });
  document.querySelectorAll('[data-a="buy"][data-id],[data-a="add"][data-id]').forEach((x) => {
    if (x.dataset.id != p.id) return;
    x.dataset.n = n;
    x.disabled = !ok;
  });
}

/* ---------- 8. Sound effects (synthesised: no audio files) ---------- */
let AC = null;
function tone(f0, f1, dur, vol, type = "sine", at = 0) {
  const t0 = AC.currentTime + at,
    o = AC.createOscillator(),
    g = AC.createGain(),
    flt = AC.createBiquadFilter();
  flt.type = "lowpass";
  flt.frequency.value = 3400;
  o.type = type;
  o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(flt);
  flt.connect(g);
  g.connect(AC.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}
const SFX = {
  tap: () => tone(1250, 720, 0.06, 0.06, "triangle"), // soft tick
  add: () => {
    tone(520, 900, 0.09, 0.08);
    tone(1320, 1320, 0.09, 0.035, "sine", 0.06);
  }, // add to cart: rising pop + sparkle
  pop: () => tone(320, 680, 0.08, 0.08), // wishlist
  toggle: () => {
    tone(700, 900, 0.05, 0.06, "triangle");
    tone(900, 1150, 0.06, 0.045, "triangle", 0.05);
  }, // theme / language / sound / currency
  ok: () =>
    [523, 659, 784].forEach((f, i) =>
      tone(f, f, 0.17, 0.065, "sine", i * 0.09)
    ), // success chime
  er: () => {
    tone(260, 200, 0.18, 0.075, "sawtooth");
    tone(200, 150, 0.22, 0.06, "sawtooth", 0.12);
  }, // error
  wn: () => tone(440, 440, 0.14, 0.06, "triangle"), // warning
};
function beep(kind = "tap") {
  if (!sndOn) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state == "suspended") AC.resume();
    (SFX[kind] || SFX.tap)();
  } catch {}
}
/* Every pressable element makes a sound (buttons, links, tabs, bottom bar, strip, labels, summaries, selects). File inputs are skipped: their label already played it. */
const PRESS = 'button,select,summary,a[href],label,[data-a],[role="button"],[role="radio"],[role="tab"],[role="menuitem"],.ib,.ct,.sn';
document.addEventListener(
  "click",
  (e) => {
    const el = e.target.closest(PRESS);
    if (!el || el.disabled || el.matches("input") || el.getAttribute("aria-disabled") == "true") return;
    if (el.tagName == "LABEL" && !el.querySelector("input,select,textarea,button")) return;
    if (el.tagName == "LABEL" && el.querySelector('input[type="text"],input[type="email"],input[type="search"],input[type="number"],input[type="password"],textarea,select')) return;
    const a = el.dataset.a;
    beep(
      a == "add" || a == "buy"
        ? "add"
        : a == "fav"
        ? "pop"
        : ["theme", "lang", "snd", "music", "cur", "pw"].includes(a)
        ? "toggle"
        : "tap"
    );
  },
  true
);
document.addEventListener(
  "change",
  (e) => {
    const el = e.target;
    if (el.tagName == "SELECT" || (el.type == "file" && el.files && el.files.length)) beep("toggle");
  },
  true
);

/* ---------- 9. Views ---------- */
function cardBig(p) {
  const c = cat(p.c),
    old = p.o > pr(p) ? `<s>${money(p.o)}</s>` : "";
  const rating = ratingHtml(p);
  const vis = isVisit(p);
  return `<div class="cd${vis ? " visit" : ""}"> <button class="hb ${ fav.includes(p.id) ? "on" : "" }" data-a="fav" data-id="${ex(p.id)}" aria-label="${t("fav")}">${ic( "heart", 16 )}</button> ${!vis && p.d > 0 ? `<i class="bd">-${Math.round(p.d)}%</i>` : ""}${vis ? `<i class="vchip">${ic("ext", 12)}</i>` : ""} <a class="art" href="#/p/${ex(p.id)}">${art(p, c)}</a> <div class="bd2"><small>${c[lang]}</small><a href="#/p/${ex(p.id)}"><h3>${ p[lang] }</h3></a>${rating} ${isVisit(p) ? `<div class="vnote">${ic("ext", 13)} ${t("visitshort")}</div>${visitBtn(p)}` : `<div class="pr"><b class="n">${(p.smm_service && !apiMode(p)) ? money(sbPrice(p).v) + ' <small>' + ex(sbPrice(p).l) + '</small>' : money(pr(p))}</b>${old}</div> <button class="b add" data-a="add" data-id="${ex(p.id)}">${ic( "cart", 15 )} ${t("add")}</button>`}</div></div>`;
}
/* Compact product row (default everywhere): thumbnail · name · category · price · quick add. Same look as the boost list. */
function card(p) {
  const c = cat(p.c),
    old = p.o > pr(p) ? `<s>${money(p.o)}</s>` : "",
    vis = isVisit(p),
    price = p.smm_service && !apiMode(p) ? money(sbPrice(p).v) + " <small>" + ex(sbPrice(p).l) + "</small>" : money(pr(p));
  const href = `#/p/${ex(p.id)}`;
  return `<div class="pr-r${vis ? " visit" : ""}"><a class="pr-t" href="${href}" tabindex="-1" aria-hidden="true">${art(p, c)}</a><a class="pr-b" href="${href}"><h3>${p[lang]}</h3><small>${c[lang]}</small><span class="pr-p">${vis ? `<i class="vchip">${ic("ext", 12)}</i> ${t("visitshort")}` : `<b class="n">${price}</b>${old}${p.d > 0 ? `<i class="bd">-${Math.round(p.d)}%</i>` : ""}`}</span></a><span class="pr-x"><button class="hb ${fav.includes(p.id) ? "on" : ""}" data-a="fav" data-id="${ex(p.id)}" aria-label="${t("fav")}">${ic("heart", 15)}</button>${vis ? visitBtn(p) : `<button class="pr-add" data-a="add" data-id="${ex(p.id)}" aria-label="${t("add")}">${ic("cart", 16)}</button>`}</span></div>`;
}
const grid = (a) =>
  a.length
    ? `<div class="pr-list">${a.map(card).join("")}</div>`
    : `<p class="emp">${t("none")}</p>`;
/* Big cards: only for the "featured" section of the home page (products pinned from the admin). */
const gridBig = (a) =>
  a.length
    ? `<div class="grid">${a.map(cardBig).join("")}</div>`
    : `<p class="emp">${t("none")}</p>`;
const ico = (o, z) =>
  o.image_url
    ? `<img src="${ex(o.image_url)}" alt="" loading="lazy" decoding="async">`
    : ic(o.i || "box", z);

/* ---------- Section charts (three per section) + interactive section strip ---------- */
/* The charts are decorative (aria-hidden): candles, a line and volume bars, seeded by the section id so every section keeps its own stable look. They are not market data. */
const rtl = () => document.documentElement.dir == "rtl";
let snKey; /* last active section of the strip (undefined = not positioned yet) */
function stripRender() {
  const sn = (id, icon, label, href) =>
    `<a class="sn" href="${href}" data-s="${ex(id)}">${icon}<span>${label}</span></a>`;
  snKey = undefined;
  $("#sub-nav").innerHTML = `<div class="sn-track"><i class="sn-ind"></i>${sn("", ic("home", 16), t("home"), "#/")}${CV.map((c) => sn(c.id, ico(c, 16), c[lang], catHref(c))).join("")}</div>`;
}
function stripFades(el) {
  const max = el.scrollWidth - el.clientWidth,
    sl = Math.abs(el.scrollLeft),
    a = sl > 2,
    b = sl < max - 2;
  el.classList.toggle("fl", rtl() ? b : a);
  el.classList.toggle("fr", rtl() ? a : b);
}
function snSync() {
  const box = $("#sub-nav"),
    tr = box && box.firstElementChild;
  if (!tr || !tr.classList.contains("sn-track")) return;
  const [, r, id] = (location.hash || "#/").split("?")[0].split("/"),
    cur = r == "g" ? "hub_" + dec(id || "") : r == "c" ? (window.AMXHub && AMXHub.hubKey(dec(id || ""))) || dec(id || "") : r == "boost" ? (boostCat() || {}).id ?? null : r ? null : "";
  let on = null;
  tr.querySelectorAll(".sn").forEach((a) => {
    const is = cur !== null && a.dataset.s == cur;
    a.classList.toggle("on", is);
    if (is) {
      on = a;
      a.setAttribute("aria-current", "page");
    } else a.removeAttribute("aria-current");
  });
  tr.classList.toggle("none", !on);
  if (on) {
    const tb = tr.getBoundingClientRect(),
      ab = on.getBoundingClientRect();
    tr.style.setProperty("--ix", ab.left - tb.left + "px");
    tr.style.setProperty("--iw", ab.width + "px");
    if (snKey !== cur) {
      const bb = box.getBoundingClientRect();
      box.scrollBy({ left: ab.left + ab.width / 2 - (bb.left + bb.width / 2), behavior: snKey === undefined ? "auto" : "smooth" });
    }
  }
  snKey = cur;
  stripFades(box);
  requestAnimationFrame(() => tr.classList.add("ready"));
}

/* Category cards animate once when they scroll into view */
let trioIO;
function decorate() {
  const m = $("#m");
  const els = m.querySelectorAll(".ct");
  if (!("IntersectionObserver" in window)) {
    els.forEach((e) => e.classList.add("in"));
    return;
  }
  trioIO =
    trioIO ||
    new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            trioIO.unobserve(e.target);
          }
        }),
      { threshold: 0.2 }
    );
  els.forEach((e) => {
    e.classList.add("rv");
    trioIO.observe(e);
  });
}

function head() {
  const root = document.documentElement,
    col = (CFG.site && CFG.site.col) || {};
  root.lang = lang;
  root.dir = lang == "ar" ? "rtl" : "ltr";
  root.dataset.theme = th;
  // Brand colours edited in the admin panel
  // Only a deliberately customised colour overrides the theme. The previous default greens (still saved in many live
  // configs) and the current defaults are ignored so the light/dark palette in style.css always applies.
  const DEFAULT_COL = { g: ["#08694a", "#191a23"], m: ["#a7e8bd", "#b9ff66"], ac: ["#52b788", "#b9ff66"] };
  ["g", "m", "ac"].forEach((k) => {
    const v = safeColor(col[k]);
    if (v && DEFAULT_COL[k].indexOf(String(v).toLowerCase()) < 0) root.style.setProperty("--" + k, v);
  });
  const meta = document.querySelector("meta[name=theme-color]");
  if (meta) meta.content = th == "dark" ? "#12131A" : "#FFFFFF";
  const logo = CFG.site.logo;
  if (logo) $(".logo .tile").innerHTML = `<img src="${ex(logo)}" alt="">`;
  $("#bn").innerHTML = `${ex(CFG.site.n1)}<b>${ex(CFG.site.n2)}</b>`;
  $("#sb").textContent = lang == "ar" ? CFG.site.sa : CFG.site.se;
  $("#q").placeholder = t("ph");
  $("#ctl").innerHTML =
    musicBtn() +
    `<button class="ib" data-a="theme" aria-label="${t("theme")}">${ic( th == "dark" ? "sun" : "moon", 18 )}</button>` +
    `<a class="ib" href="#/account" aria-label="${t("acc")}">${ic( "user", 18 )}</a>`;
  $("#mb").innerHTML = ic("menu", 22);
  $("#mb").setAttribute("aria-label", lang == "ar" ? "القائمة" : "Menu");
  stripRender();
  footer();
  nav();
  aiLabels();
}

/* Background music (music.js): header button + menu row. The state lives in window.AMXMusic. */
const musicOn = () => !!(window.AMXMusic && window.AMXMusic.on);
const musicBtn = () =>
  window.AMXMusic
    ? `<button type="button" class="ib mus${musicOn() ? " on" : ""}" data-a="music" aria-pressed="${musicOn()}" aria-label="${t(musicOn() ? "music_on" : "music_off")}">${ic(musicOn() ? "music" : "musicoff", 18)}</button>`
    : "";
function musicSync() {
  const on = musicOn();
  document.querySelectorAll('.ib.mus[data-a="music"]').forEach((b) => {
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", on);
    b.setAttribute("aria-label", t(on ? "music_on" : "music_off"));
    b.innerHTML = ic(on ? "music" : "musicoff", 18);
  });
  document.querySelectorAll('.dr-r[data-a="music"]').forEach((b) => {
    b.querySelector(".dr-ic").innerHTML = ic(on ? "music" : "musicoff", 18);
    b.querySelector(".dr-lb").textContent = t(on ? "music_on" : "music_off");
  });
}
addEventListener("amx:music", musicSync);

function footer() {
  const labels = {
    whatsapp: "WhatsApp",
    telegram: "Telegram",
    instagram: "Instagram",
    x: "X",
    youtube: "YouTube",
    facebook: "Facebook",
    tiktok: "TikTok",
    email: "Email",
  };
  const soc = Object.entries(SOC)
    .map(([k, v]) => socialLink(v, labels[k]))
    .join("");
  const ptc = partner(true);
  const site = CFG.site || {},
    risk = site.risk && site.risk[lang],
    rt = (site.rt && site.rt[lang]) || t("rt");
  const pays = PM.length
    ? `<div class="fpays-t">${t("paymethods")}</div><div class="fpays">${PM.map(
        (m) =>
          `<div class="fp" style="--pc:${safeColor(m.color) || "var(--ac)"}">${payLogo(m, 40)}<b>${pmName(m)}</b></div>`
      ).join("")}</div>`
    : "";
  $("#ft").innerHTML =
    (soc ? `<div class="soc">${soc}</div>` : "") +
    (ptc ? `<div class="ft-pt"><div class="ft-ptt">${lang == "ar" ? "شريكنا الرسمي" : "Our official partner"}</div>${ptc}</div>` : "") +
    pays +
    (risk ? `<p class="risk">${ex(risk)}</p>` : "") +
    `<div class="fcopy"><p>${ex(rt)}</p><nav class="flk"><a href="#/faq">${t("faq")}</a><a href="#/policies">${t("pol")}</a></nav></div>`;
}

function nav() {
  const r = (location.hash || "#/").split("?")[0].split("/")[1] || "",
    active = r == "c" || r == "p" ? "" : r == "done" ? "orders" : r == "partner" ? "account" : r;
  const n = cartCount(),
    v = $("#nv");
  const items = [
    ["", "home", "home"],
    ["fav", "heart", "fav"],
    ["orders", "box", "ord"],
    ["cart", "cart", "cart"],
    ["account", "user", "acc"],
  ];
  v.innerHTML = items
    .map(
      ([l, i, k]) =>
        `<a href="#/${l}" data-r="${l}"${k == "ord" ? ' class="hl"' : ""}>${ic(i, k == "ord" ? 22 : 20)}<span>${t(k)}</span>${ k == "cart" && n ? '<span class="cnt">' + fmtN(n) + "</span>" : "" }</a>`
    )
    .join("");
  v.querySelectorAll("a").forEach((e) =>
    e.classList.toggle("on", e.dataset.r == active)
  );
  snSync();
  drawerRender();
}


/* ---------- Side drawer (menu) ---------- */
function drawerRender() {
  const box = $("#dr");
  if (!box) return;
  const A = lang == "ar",
    n = cartCount(),
    hash = (location.hash || "#/").split("?")[0],
    meta = (user && user.user_metadata) || {},
    nm = user ? ex(meta.full_name || meta.name || String(user.email || "").split("@")[0]) : "",
    big = (href, icon, label, extra = "") =>
      `<a class="dr-p${hash == href ? " on" : ""}" href="${href}"><span class="dr-ico">${ic(icon, 18)}</span><span class="dr-lb">${label}</span>${extra}<i class="dr-ch">${ic("chev", 16)}</i></a>`,
    row = (href, icon, label, extra = "") =>
      `<a class="dr-r" href="${href}"><span class="dr-ic">${ic(icon, 18)}</span><span class="dr-lb">${label}</span>${extra}</a>`,
    soc = [
      ["whatsapp", "wa", A ? "واتساب" : "WhatsApp"],
      ["telegram", "tg", A ? "تيليغرام" : "Telegram"],
    ]
      .map(([k, code, label]) => {
        const u = SOC[k] && safeUrl(SOC[k][1]);
        return u
          ? `<a class="dr-r" href="${ex(u)}" target="_blank" rel="noopener"><span class="dr-ic" style="background:${BR[code].bg};color:#fff">${brandSvg(BR[code].g, 18)}</span><span class="dr-lb">${label}</span><i class="dr-ch">${ic("ext", 14)}</i></a>`
          : "";
      })
      .join(""),
    ptc = partner(true);
  box.innerHTML = `
  <div class="dr-top">
    <button type="button" class="dr-x" data-a="menu-x" aria-label="${A ? "إغلاق" : "Close"}">${ic("x", 18)}</button>
    <a class="dr-user" href="#/account"><span class="dr-av">${ic("user", 24)}</span><span class="dr-un"><b>${user ? nm : A ? "مرحباً بك" : "Welcome"}</b><small>${user ? (A ? "حسابي" : "My account") : A ? "سجّل الدخول لمتابعة طلباتك" : "Sign in to track your orders"}</small></span></a>
  </div>
  <div class="dr-body">
    <div class="dr-h">${A ? "القائمة" : "Menu"}</div>
    ${big("#/", "home", t("home"))}
    ${big("#/orders", "box", t("ord"))}
    ${big("#/cart", "cart", t("cart"), n ? `<span class="dr-n">${fmtN(n)}</span>` : "")}
    ${big("#/fav", "heart", t("fav"))}
    ${big("#/account", user ? "user" : "out", user ? t("acc") : t("login"))}
    ${user ? big("#/partner", "gift", A ? "برنامج الشركاء" : "Partner program") : ""}
    ${CV.length ? `<div class="dr-h">${A ? "الأقسام" : "Categories"}</div>${CV.map((c) => { const k = c.ty == "hub" ? AMXHub.count(c) : P.filter((p) => p.c == c.id).length; return `<a class="dr-r" href="${catHref(c)}"><span class="dr-ic">${ico(c, 18)}</span><span class="dr-lb">${c[lang]}</span>${k ? `<small>${k}</small>` : ""}</a>`; }).join("")}` : ""}
    <div class="dr-h">${A ? "الإعدادات" : "Settings"}</div>
    <button type="button" class="dr-r" data-a="lang"><span class="dr-ic">${ic("globe", 18)}</span><span class="dr-lb">${A ? "اللغة" : "Language"}</span><small>${A ? "English" : "العربية"}</small></button>
    <button type="button" class="dr-r" data-a="theme"><span class="dr-ic">${ic(th == "dark" ? "sun" : "moon", 18)}</span><span class="dr-lb">${t("theme")}</span></button>
    <button type="button" class="dr-r" data-a="snd"><span class="dr-ic">${ic(sndOn ? "vol" : "mute", 18)}</span><span class="dr-lb">${t(sndOn ? "snd_on" : "snd_off")}</span></button>
    ${window.AMXMusic ? `<button type="button" class="dr-r" data-a="music"><span class="dr-ic">${ic(musicOn() ? "music" : "musicoff", 18)}</span><span class="dr-lb">${t(musicOn() ? "music_on" : "music_off")}</span></button>` : ""}
    <label class="dr-r"><span class="dr-ic">${ic("card", 18)}</span><span class="dr-lb">${A ? "العملة" : "Currency"}</span><select class="sel dr-sel" data-a="cur" aria-label="currency">${Object.keys(R).map((k) => `<option value="${k}" ${k == cur ? "selected" : ""}>${k == "USD" ? "USDT" : k}</option>`).join("")}</select></label>
    <div class="dr-h">${A ? "المساعدة" : "Help"}</div>
    ${soc}
    ${row("#/faq", "help", t("faq"))}
    ${row("#/policies", "doc", t("pol"))}
    ${ptc ? `<div class="dr-h">${A ? "شريكنا الرسمي" : "Our official partner"}</div>${ptc}` : ""}
    ${user ? `<button type="button" class="dr-r dr-out" data-a="out"><span class="dr-ic">${ic("out", 18)}</span><span class="dr-lb">${t("out")}</span></button>` : ""}
  </div>`;
}
let drLast = null;
function drToggle(open) {
  const box = $("#dr");
  if (!box) return;
  if (open) {
    drawerRender();
    drLast = document.activeElement;
  }
  document.body.classList.toggle("dr-open", !!open);
  box.setAttribute("aria-hidden", open ? "false" : "true");
  $("#mb").setAttribute("aria-expanded", open ? "true" : "false");
  if (open) {
    const x = box.querySelector(".dr-x");
    x && x.focus({ preventScroll: true });
  } else if (drLast && drLast.focus) {
    drLast.focus({ preventScroll: true });
    drLast = null;
  }
}
addEventListener("hashchange", () => document.body.classList.contains("dr-open") && drToggle(false));
/* Clear stale top-up-limit notices when leaving the wallet flow; navigating back without uploading proof must not leave an old warning on screen. */
addEventListener("hashchange", () => {
  const el = $("#ts");
  if (!el) return;
  const msg = (el.textContent || "").trim();
  if (/لديك طلبات شحن معلّقة كثيرة|لديك طلبات شحن معلقة كثيرة|You have too many open top-ups/i.test(msg)) {
    el.className = "";
    clearTimeout(toastTimer);
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key == "Escape" && document.body.classList.contains("dr-open")) drToggle(false);
});

/* Home: partner card (now in the footer + side menu), banners, categories, payment methods, products */
function partner(sm) {
  const p = CFG.partner || {},
    A = lang == "ar";
  if (p.on === false || !safeUrl(p.url)) return "";
  const bg = p.banner_bg_url
    ? `<div class="pt-bg" style="background-image:url('${ex( p.banner_bg_url )}')"></div>`
    : "";
  return `<a class="pt${sm ? " sm" : ""}" href="${ex( safeUrl(p.url) )}" target="_blank" rel="noopener">${bg} <div class="pt-in"> <span class="pt-logo">${ p.logo ? `<img src="${ex(p.logo)}" alt="" loading="lazy" decoding="async">` : ic("bank", 26) }</span> <span class="pt-tx"><span class="pt-badge">${ic("shield", 12)} ${ A ? "شريك رسمي" : "Official partner" }</span> <b class="pt-nm">${ex(p.name)}</b><span class="pt-d">${ex( A ? p.ar : p.en )}</span></span> <span class="pt-cta">${ex(A ? p.ba : p.be)} ${ic("ext", 15)}</span> </div></a>`;
}
function paymentsSection() {
  if (!PM.length) return "";
  return `<h2>${t("paymethods")}</h2><div class="pays-h"><p class="pd">${t( "paysub" )}</p></div> <div class="pays">${PM.map( (m) => `<div class="pm" style="--pc:${ safeColor(m.color) || "var(--ac)" }">${payLogo(m, 60)}<b>${pmName(m)}</b></div>` ).join("")}</div>`;
}
function home() {
  if (loadingCfg && !P.length) return skeletonGrid();
  if (q) return searchPage();
  return (
    (BN.length ? `<div class="ban-w"><div class="ban${BN.length < 2 ? " one" : ""}">${BN.map( (b, i) => { const txt = !b.img || b.ot === true, sub = lang == "ar" ? b.sa : b.se; /* image banners: the picture already carries its own text, so no title/subtitle/gradient on top unless `ot` is switched on in the admin */ return `<div class="bs${i ? "" : " cur"}${txt ? "" : " pic"}"${ b.img ? ` style="background:${ txt ? "linear-gradient(135deg,rgba(0,0,0,.6),rgba(0,0,0,.3))," : "" }url('${ex(b.img)}') center/cover"` : "" }>${ txt ? '<span class="bs-o o1"></span><span class="bs-o o2"></span>' : "" }<div class="bs-c">${ txt ? `${isGenericTitle(b[lang]) ? "" : `<h3>${b[lang]}</h3>`}${ sub && sub != b[lang] ? `<p>${sub}</p>` : "" }` : "" }<a class="b bs-b" href="${ex(safeUrl(b.h) || "#/")}" aria-label="${ bannerLabel(b) }">${ic("bolt", 14)} ${t("all")}</a></div></div>`; } ).join("")}</div> ${ BN.length > 1 ? `<button type="button" class="ban-n prev" data-a="ban-prev" aria-label="prev">${ic( "chev", 18 )}</button><button type="button" class="ban-n next" data-a="ban-next" aria-label="next">${ic( "chev", 18 )}</button> <div class="dots">${BN.map( (_, i) => `<button type="button" class="${ i ? "" : "on" }" data-a="ban-go" data-i="${i}" aria-label="${i + 1}"><u></u></button>` ).join("")}</div>` : "" }</div>` : "") + `<div class="tiles" style="margin-top:14px">${CV.map((c, i) => { const n = c.ty == "hub" ? AMXHub.count(c) : P.filter((p) => p.c == c.id).length; return `<a class="ct" style="--d:${i}" href="${catHref(c)}"><span class="tile${ c.image_url ? " img" : "" }">${ico(c, 24)}</span><span class="ct-t"><b>${c[lang]}</b><small>${ n ? `${n} ${c.ty == "hub" ? (lang == "ar" ? "خيار" : "options") : lang == "ar" ? "منتج" : "items"}` : lang == "ar" ? "تصفّح القسم" : "Browse" }</small></span><i class="ct-go">${ic("chev", 16)}</i></a>`; }).join("")}</div> ${(() => { const pn = P.filter((p) => +p.pin > 0).sort((a, b) => a.pin - b.pin); return pn.length ? `<h2>${lang == "ar" ? "منتجات مميزة" : "Featured"}</h2>${gridBig(pn)}` : ""; })()}`
  );
}

/* Category (also renders the embeds that belong to it) */
/* ---- Numbers section (type "numbers"): paid numbers = products (service -> country -> buy), free numbers = public list kept in category.free ---- */
const NS = { tab: "paid", fc: -1 };
function freeOf(c) {
  return (Array.isArray(c.free) ? c.free : [])
    .map((x, i) => ({
      i,
      ar: ex(x.ar),
      en: ex(x.en),
      fl: ex(String(x.fl || "").slice(0, 8)),
      nums: String(x.txt || "")
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 300)
        .map((l) => {
          const [n, u] = l.split("|"),
            v = (n || "").trim(),
            url = (u || "").trim();
          return { n: ex(v), v, u: /^https?:\/\//i.test(url) ? url : "" };
        })
        .filter((x) => x.v),
    }))
    .filter((x) => x.nums.length);
}
/* ---- Paid numbers (one screen, same look as the boost panel): 1 service tiles + search -> 2 country list (flag, price, buy) ----
   A product of a synced numbers provider is named "<service> · <country>" (see admin numSync), so service and country are read from its name:
   nothing in the data has to change. A product without a country (custom provider) is listed under its service as one row. */
const NM = { sv: "", q: "", cq: "", sort: "pa", lim: 30, sm: false };
const NMM = {};
const nmKey = (x) =>
  String(x)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bst\.?\s/g, "saint ")
    .replace(/\s(?:&|and)\s/g, " ")
    .replace(/[^a-z0-9\u0600-\u06ff]/g, "");
const NM_POP = ["whatsapp", "telegram", "instagram", "facebook", "tiktok", "google", "twitter", "x", "discord", "snapchat", "viber", "chatgpt", "openai", "linkedin", "amazon", "microsoft", "apple", "paypal"];
let NM_ISO = null;
function nmIso(name) {
  if (!NM_ISO) {
    NM_ISO = {};
    try {
      const dn = new Intl.DisplayNames(["en"], { type: "region" });
      for (let i = 65; i < 91; i++)
        for (let j = 65; j < 91; j++) {
          const c = String.fromCharCode(i, j),
            n = dn.of(c);
          if (n && n !== c && n !== "Unknown Region") NM_ISO[nmKey(n)] = c;
        }
    } catch {}
    const al = { usa: "US", unitedstates: "US", america: "US", england: "GB", greatbritain: "GB", uk: "GB", scotland: "GB", wales: "GB", ivorycoast: "CI", swaziland: "SZ", czechrepublic: "CZ", hongkong: "HK", macau: "MO", macao: "MO", palestine: "PS", macedonia: "MK", myanmar: "MM", burma: "MM", turkey: "TR", bosnia: "BA", drcongo: "CD", dr: "CD", congo: "CG", capeverde: "CV", easttimor: "TL", timorleste: "TL", falklandislands: "FK", uae: "AE", southkorea: "KR", korea: "KR", russia: "RU", vietnam: "VN", laos: "LA", moldova: "MD", syria: "SY", iran: "IR", tanzania: "TZ", brunei: "BN", micronesia: "FM", curacao: "CW", reunion: "RE", guineabissau: "GW", saintkittsnevis: "KN", saintlucia: "LC", saintvincent: "VC", trinidadtobago: "TT", antiguabarbuda: "AG", saotomeprincipe: "ST", taiwan: "TW", kosovo: "XK" };
    Object.keys(al).forEach((k) => !NM_ISO[k] && (NM_ISO[k] = al[k]));
  }
  return NM_ISO[nmKey(name)] || "";
}
const nmFlag = (name) => {
  const c = nmIso(name);
  return c ? String.fromCodePoint(...[...c].map((x) => 127397 + x.charCodeAt(0))) : "";
};
function nmMeta(p) {
  const sig = p.en + "|" + p.ar;
  let m = NMM[p.id];
  if (m && m.sig == sig) return m;
  const sp = (s) => plain(s).split(/\s[·•]\s/).map((x) => x.trim());
  const e = sp(p.en),
    a = sp(p.ar),
    sv = e[0] || a[0] || "",
    cEn = e.length > 1 ? e.slice(1).join(" · ") : "",
    cAr = a.length > 1 ? a.slice(1).join(" · ") : "";
  return (NMM[p.id] = { sig, sv, key: nmKey(sv), cEn, cAr, c: cEn || cAr, flag: nmFlag(cEn || cAr), h: nz(plain([p.tg, p.en, p.ar].join(" "))) });
}
const nmCty = (m) => (lang == "ar" ? m.cAr || m.cEn : m.cEn || m.cAr);
function nmBadge(name, z) {
  const h = nz(plain(name)),
    pl = SBP.find((r) => r[3].test(h));
  if (pl) return sbBadge(pl[0], z);
  let s = 0;
  for (const ch of String(name)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  const L = (String(name).match(/[\p{L}\p{N}]/u) || ["#"])[0].toUpperCase();
  return `<span class="sb-pi" style="background:hsl(${s % 360} 55% 38%);color:#fff"><b class="sb-lt">${ex(L)}</b></span>`;
}
function nmCalc(c) {
  const all = P.filter((p) => p.c == c.id),
    sv = new Map();
  all.forEach((p) => {
    const m = nmMeta(p);
    let x = sv.get(m.key);
    if (!x) sv.set(m.key, (x = { key: m.key, name: m.sv, items: [] }));
    x.items.push(p);
  });
  const rank = (x) => {
    const i = NM_POP.indexOf(x.key);
    return i < 0 ? 99 : i;
  };
  const list = [...sv.values()].sort((a, b) => rank(a) - rank(b) || b.items.length - a.items.length || a.name.localeCompare(b.name));
  const w = nz(NM.q).split(/\s+/).filter(Boolean),
    shown = w.length ? list.filter((x) => w.every((k) => nz(x.name).includes(k))) : list;
  const cur = sv.get(NM.sv) || list[0] || null;
  let rows = cur ? cur.items : [];
  const cw = nz(NM.cq).split(/\s+/).filter(Boolean);
  if (cw.length) rows = rows.filter((p) => cw.every((k) => nmMeta(p).h.includes(k)));
  const cmp = {
    pa: (x, y) => pr(x) - pr(y),
    pd: (x, y) => pr(y) - pr(x),
    nm: (x, y) => String(nmCty(nmMeta(x))).localeCompare(String(nmCty(nmMeta(y))), lang),
  }[NM.sort];
  if (cmp) rows = [...rows].sort(cmp);
  return { all: list, shown, cur, rows, n: all.length };
}
const NM_SV_SHOWN = 8;
function nmSvcs(f) {
  const q = NM.q.trim(),
    show = q || NM.sm ? f.shown : f.shown.slice(0, NM_SV_SHOWN);
  if (!show.length) return `<p class="pd" style="margin:6px 2px">${sbT("لا توجد خدمة بهذا الاسم", "No service with this name")}</p>`;
  const tile = (x) => {
    const on = f.cur && f.cur.key == x.key;
    return `<button type="button" class="sb-p${on ? " on" : ""}" data-a="nmsv" data-k="${ex(x.key)}" aria-pressed="${on}">${nmBadge(x.name, 20)}<small>${ex(x.name)}</small><span class="sb-ct n">${fmtN(x.items.length)} ${sbT("عرض", "offers")}</span></button>`;
  };
  const more = !q && f.shown.length > NM_SV_SHOWN;
  return `<div class="sb-pls">${show.map(tile).join("")}${more ? `<button type="button" class="sb-p sb-mo" data-a="nmsm" aria-expanded="${NM.sm}"><span class="sb-pi sb-all">${ic(NM.sm ? "x" : "grid", 20)}</span><small>${NM.sm ? sbT("أقل", "Less") : sbT("المزيد", "More")} (${fmtN(f.shown.length - NM_SV_SHOWN)})</small></button>` : ""}</div>`;
}
function nmRow(p) {
  const m = nmMeta(p),
    cn = nmCty(m);
  return `<div class="nm-r"><span class="nm-fl">${m.flag ? m.flag : ic("globe", 18)}</span><span class="sb-nm"><b>${ex(cn || m.sv)}</b><small>${ex(m.sv)} · ${sbT("استلام الكود فوراً", "Instant code")}</small></span><span class="sb-pr"><b class="n">${money(pr(p))}</b><small>${sbT("للرقم", "per number")}</small></span><button type="button" class="b nm-b" data-a="buy" data-id="${ex(p.id)}">${sbT("اشترِ", "Buy")}</button><button type="button" class="nm-cb" data-a="add" data-id="${ex(p.id)}" aria-label="${t("add")}">${ic("cart", 16)}</button></div>`;
}
function nmRes(f) {
  if (!f.cur) return "";
  const a = f.rows,
    show = a.slice(0, NM.lim);
  const bar = `<div class="sb-meta"><span><b class="n">${fmtN(a.length)}</b> ${sbT("دولة متاحة", "countries")}</span><label class="fsort"><span>${t("sortl")}</span><select class="sel" data-a="nmsort" aria-label="${t("sortl")}">${[
    ["pa", sbT("الأرخص أولاً", "Cheapest first")],
    ["pd", sbT("الأغلى أولاً", "Priciest first")],
    ["nm", sbT("حسب الاسم", "By name")],
  ]
    .map(([k, l]) => `<option value="${k}"${NM.sort == k ? " selected" : ""}>${l}</option>`)
    .join("")}</select></label></div>`;
  if (!a.length) return bar + emptyBox("search", sbT("لا توجد دولة مطابقة", "No matching country"), "", `<button type="button" class="b b2" data-a="nmclr">${t("fclear")}</button>`);
  return `${bar}<div class="sb-list">${show.map(nmRow).join("")}</div>${a.length > show.length ? `<button type="button" class="b b2 block sb-more" data-a="nmmore">${sbT("عرض المزيد", "Show more")} (${fmtN(a.length - show.length)})</button>` : ""}`;
}
function numPaid(c) {
  if (!P.some((p) => p.c == c.id)) return emptyBox("box", t("catempty"));
  const f = nmCalc(c);
  return `<div class="box sb-panel"><div class="sb-lab"><i>1</i>${sbT("الخدمة التي تريد تفعيلها", "Service to verify")}</div>
<div class="sb-s"><span class="sb-si">${ic("search", 18)}</span><input id="nm-q" class="inp" type="search" data-a="nmq" value="${ex(NM.q)}" placeholder="${sbT("ابحث عن خدمة: واتساب، تيليجرام…", "Search a service: WhatsApp, Telegram…")}" autocomplete="off" enterkeyhint="search" aria-label="${sbT("بحث", "Search")}"></div>
<div id="nm-svcs">${nmSvcs(f)}</div>
<div class="sb-lab"><i>2</i>${sbT("الدولة", "Country")}${f.cur ? ` <small class="nm-cur">${ex(f.cur.name)}</small>` : ""}</div>
<div class="sb-s"><span class="sb-si">${ic("search", 18)}</span><input id="nm-cq" class="inp" type="search" data-a="nmcq" value="${ex(NM.cq)}" placeholder="${sbT("ابحث عن دولة…", "Search a country…")}" autocomplete="off" enterkeyhint="search" aria-label="${sbT("بحث", "Search")}"></div></div>
<div class="sb-lab out"><i>3</i>${sbT("اشترِ وستجد رقمك والكود في «طلباتي» فور تأكيد الدفع", "Buy it and find your number and code in “My orders” once payment is confirmed")}</div><div id="nm-res">${nmRes(f)}</div>`;
}
function nmDraw() {
  const g = (id) => document.getElementById(id),
    c = C.find((x) => x.ty == "numbers");
  if (!c || !g("nm-res")) return;
  const f = nmCalc(c);
  g("nm-svcs").innerHTML = nmSvcs(f);
  g("nm-res").innerHTML = nmRes(f);
  const cu = document.querySelector(".nm-cur");
  if (cu && f.cur) cu.textContent = f.cur.name;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-a^='nm']");
  if (!b) return;
  const a = b.dataset.a;
  if (a == "nmsv") {
    NM.sv = b.dataset.k;
    NM.cq = "";
    NM.lim = 30;
    const i = document.getElementById("nm-cq");
    if (i) i.value = "";
    nmDraw();
  } else if (a == "nmsm") {
    NM.sm = !NM.sm;
    nmDraw();
  } else if (a == "nmmore") {
    NM.lim += 30;
    nmDraw();
  } else if (a == "nmclr") {
    NM.cq = "";
    const i = document.getElementById("nm-cq");
    if (i) i.value = "";
    nmDraw();
  }
});
document.addEventListener("input", (e) => {
  const el = e.target,
    a = el.dataset && el.dataset.a;
  if (a == "nmq") {
    NM.q = el.value;
    nmDraw();
  } else if (a == "nmcq") {
    NM.cq = el.value;
    NM.lim = 30;
    nmDraw();
  }
});
document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.a == "nmsort") {
    NM.sort = el.value;
    NM.lim = 30;
    nmDraw();
  }
});
function numFree(c) {
  const free = freeOf(c),
    warn = `<div class="box nwarn">${ic("shield", 18)} <span>${t("n_warn")}</span></div>`;
  if (!free.length) return warn + emptyBox("gift", t("n_nofree"));
  const cu = free.find((x) => x.i == NS.fc);
  if (!cu)
    return `${warn}<h2 class="nh">${t("n_pickC")}</h2><div class="ngrid">${free
      .map((x) => `<button type="button" class="nopt" data-a="nfree" data-i="${x.i}"><b>${x.fl} ${x[lang] || x.ar || x.en}</b><small>${x.nums.length} ${t("n_num")}</small></button>`)
      .join("")}</div>`;
  return `${warn}<div class="box"><button type="button" class="b b2 sm" data-a="nfree" data-i="-1">${t("n_back")}</button><h3 style="margin:10px 0">${cu.fl} ${cu[lang] || cu.ar || cu.en}</h3><div class="nlist">${cu.nums
    .map(
      (n) =>
        `<div class="nrow"><bdi dir="ltr" class="nn">${ex(n.n)}</bdi><span class="nact"><button type="button" class="b b2 sm" data-a="copy" data-v="${ex(n.n)}">${ic("copy", 14)} ${t("copy")}</button>${n.u ? `<a class="b sm" href="${ex(n.u)}" target="_blank" rel="noopener">${ic("ext", 14)} ${t("n_msgs")}</a>` : ""}</span></div>`
    )
    .join("")}</div></div>`;
}
function numbersPage(c) {
  const tab = NS.tab == "free" ? "free" : "paid";
  return `<div class="box row"><span class="tile big">${ico(c, 30)}</span><div style="flex:1"><h1>${c[lang]}</h1><p class="pd">${lang == "ar" ? c.da : c.de}</p></div></div><div class="ntabs"><button type="button" class="ntab${tab == "paid" ? " on" : ""}" data-a="ntab" data-t="paid">${ic("card", 16)} ${t("n_paid")}</button><button type="button" class="ntab${tab == "free" ? " on" : ""}" data-a="ntab" data-t="free">${ic("gift", 16)} ${t("n_free")}</button></div>${tab == "free" ? numFree(c) : numPaid(c)}`;
}

function catPage(id) {
  const c = cat(id);
  if (!c) return home();
  if (c.ty == "numbers") return numbersPage(c);
  if (c.ty == "boost") return boostPage();
  const embeds = E.filter((e) => e.c == id)
    .map(
      (e) => `<div class="box"><h3>${ex(lang == "ar" ? e.ar : e.en)}</h3><p class="pd">${ex(lang == "ar" ? e.da : e.de)}</p> ${frameSrc(e.u) ? `<iframe src="${ex(frameSrc(e.u))}" loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" style="width:100%;height:${+e.h || 420}px;border:0;border-radius:12px;margin-top:8px"></iframe>` : ""}</div>`
    )
    .join("");
  if (c.embed_url && catEmbedOk(c)) {
    const eu = frameSrc(c.embed_url);
    return `<div class="box"><h1>${c[lang]}</h1><p class="pd">${lang == "ar" ? c.da : c.de}</p>${eu ? `<iframe src="${ex(eu)}" loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" style="width:100%;height:500px;border:0;border-radius:12px"></iframe>` : ""}</div>${embeds}`;
  }
  const all = P.filter((p) => p.c == id);
  let body = "";
  if (!(c.ty == "embed" && embeds)) {
    if (!all.length) body = embeds ? "" : emptyBox("box", t("catempty"));
    else {
      const a = catList(c);
      body =
        catControls(c, all.length) +
        (a.length
          ? grid(a)
          : emptyBox("search", t("nofilt"), "", `<button class="b b2" data-a="ffclr" data-c="${ex(c.id)}">${t("fclear")}</button>`));
    }
  }
  return `<div class="box row"><span class="tile big">${ico(c, 30)}</span><div style="flex:1"><h1>${c[lang]}</h1><p class="pd">${lang == "ar" ? c.da : c.de}</p></div></div>${embeds}${body}`;
}

/* Product */
function prodPage(id) {
  const p = prod(id);
  if (!p) return home();
  if (bqId != p.id) {
    bqId = p.id;
    bq = qMin(p);
  }
  if (needsLink(p)) bq = qClamp(p, bq);
  const c = cat(p.c),
    old = p.o > pr(p) ? `<s>${money(p.o)}</s>` : "",
    imgs = [p.img || (c && /^https:\/\//.test(c.image_url || "") && c.ty != "boost" ? c.image_url : ""), ...(p.images || [])].filter(Boolean); // no own picture: show the category icon automatically (same rule as art())
  const gallery = imgs.length
    ? `<div class="main-img zoomable" data-a="zoom" role="button" tabindex="0" aria-label="${t("zoom")}"><img src="${ex(imgs[0])}" id="main-img" alt="${ex(p[lang] || "")}" fetchpriority="high" decoding="async" data-ph="${ex(p.id)}"><span class="zm" aria-hidden="true">${ic("search", 18)}</span></div>${imgs.length > 1 ? `<div class="thumbs">${imgs.map((u, i) => `<img src="${ex(u)}" alt="" class="${i ? "" : "on"}" data-a="thumb" loading="lazy" decoding="async">`).join("")}</div>` : ""}`
    : `<div class="main-img">${placeholder(p, c)}</div>`;
  const vis = isVisit(p),
    boost = !vis && needsLink(p),
    n = boost ? bq : 1;
  const dk = p.t != null && p.t !== "" && [0, 1, 2, 3].includes(+p.t) ? +p.t : -1;
  const badge = dk >= 0 ? `<div class="dlv">${ic("bolt", 13)} ${t("deliv")}: ${t("dl" + dk)}</div>` : "";
  const qty = boost ? qtyBox(p) : "";
  /* boost description: only text that already exists in the data (the other language when this one is empty) */
  const ds = p.ds && (p.ds[lang] || (boost ? p.ds.ar || p.ds.en : ""));
  const rel = boost ? [] : P.filter((x) => x.c == p.c && x.id != p.id).slice(0, 4);
  const back = boost ? `<a class="b b2 sm sb-back" href="#/boost">${ic("chev", 14)} ${lang == "ar" ? "العودة إلى منصة الرشق" : "Back to the Boost panel"}</a>` : "";
  return `${back}<div class="box"><div class="gallery">${gallery}</div> <h1>${boost ? ex(sbTitle(p, sbMeta(p))) : p[lang]}</h1>${p.sp ? `<div class="spec">${p.sp}</div>` : ""}${boost ? sbChips(sbMeta(p)) : ""}${vis ? "" : badge} ${vis ? "" : ratingHtml(p)} ${vis ? `<div class="vnote lg">${ic("ext", 14)} ${t("visitext")}</div>${visitBtn(p, true)}` : `<div class="pr" style="margin:8px 0 12px"><b class="n">${(p.smm_service && !apiMode(p)) ? money(sbPrice(p).v) + ' <small>' + ex(sbPrice(p).l) + '</small>' : money(pr(p))}</b>${old}</div>${qty} <div class="row"><button class="b" style="flex:1" data-a="buy" data-id="${ex(p.id)}" data-n="${n}">${t("buy")}</button><button class="b b2" style="flex:1" data-a="add" data-id="${ex(p.id)}" data-n="${n}">${t("add")}</button></div>`}</div> ${boost && sbFull(p, sbMeta(p)) ? `<div class="box">${sbFull(p, sbMeta(p))}</div>` : ""}${ds ? `<div class="box"><p class="pd">${ex(ds)}</p></div>` : ""}${rel.length ? `<h2>${t("related")}</h2>${grid(rel)}` : ""}`;
}

/* Static pages: FAQ and policies */
function faqPage() {
  return (
    `<div class="box"><h1>${t("faq")}</h1><p class="pd">${t("faqh")}</p></div>` +
    ["pay", "when", "profit", "link", "track"]
      .map((k) => `<div class="box faq"><details><summary>${t("fq_" + k)}</summary><p class="pd">${t("fa_" + k)}</p></details></div>`)
      .join("") +
    `<div class="box"><a class="b b2" href="#/policies">${t("pol")}</a></div>`
  );
}
function policiesPage() {
  const risk = CFG.site && CFG.site.risk && CFG.site.risk[lang];
  const sec = (h, body) => `<div class="box pol"><h3>${h}</h3><p class="pd">${body}</p></div>`;
  return (
    `<div class="box"><h1>${t("pol")}</h1><p class="pd">${t("polh")}</p></div>` +
    sec(t("po_dig_t"), t("po_dig")) +
    sec(t("po_ref_t"), t("po_ref")) +
    sec(t("po_man_t"), t("po_man")) +
    sec(t("po_prv_t"), t("po_prv")) +
    sec(t("po_trm_t"), t("po_trm")) +
    (risk ? sec(t("po_risk_t"), ex(risk)) : "") +
    `<div class="box"><a class="b b2" href="#/faq">${t("faq")}</a></div>`
  );
}

/* Cart with order summary, coupon, payment method and the two ways to order */
function cartPage() {
  const lines = cartLines();
  if (!lines.length)
    return `<p class="emp">${ic("cart", 40)}<br>${t("ce")}</p>`;
  const T_ = totals(),
    cp = cpOf(coupon);
  const rows = lines
    .map(
      ({ x, p }) => `<div class="box"><div class="line"> <a class="thumb" href="#/p/${ex(p.id)}">${art(p, cat(p.c))}</a> <div class="info"><b>${p[lang]}</b><div class="n">${(p.smm_service && !apiMode(p)) ? money(sbPrice(p).v) + ' <small>' + ex(sbPrice(p).l) + '</small>' : money(pr(p))}</div>${smmEq(p, x.q)} ${ needsLink(p) || apiInput(p) ? `<input class="inp" style="margin-top:6px;width:100%" data-a="lk" data-id="${ex( p.id )}" value="${ex(x.l || "")}" placeholder="${apiInput(p) ? reqHint(p) : t( "acclink" )} *" required aria-required="true" dir="ltr">` : "" }</div> <span class="q"><button data-a="q" data-id="${ex( p.id )}" data-d="-1" aria-label="-">−</button>${ needsLink(p) ? `<input class="qin qin-c" type="number" inputmode="numeric" min="${qMin(p)}" max="${qMax(p)}" value="${x.q}" dir="ltr" data-a="cq" data-id="${ex(p.id)}" aria-label="${t("qtyl")}">` : `<b class="n" dir="ltr">${fmtN(x.q)}</b>` }<button data-a="q" data-id="${ex( p.id )}" data-d="1" aria-label="+">+</button></span> <button class="ib" data-a="rm" data-id="${ex( p.id )}" aria-label="remove">${ic("x", 16)}</button></div></div>`
    )
    .join("");
  const couponBox = cp
    ? `<div class="cpn-on"><span>${ic("check", 14)} ${t( "cpnon" )}: <b dir="ltr">${ex(coupon)}</b></span><button data-a="cpnrm">${t( "cpnrm" )}</button></div>`
    : `<div class="cpn"><input class="inp" id="cpn" dir="ltr" placeholder="${t( "cc" )}" autocomplete="off"><button class="b b2" data-a="coupon">${t( "ap" )}</button></div>`;
  /* The wallet is the only way to pay for orders; transfer methods (Syriatel, Sham Cash, Binance Pay, USDT) only top up the wallet. */
  payMethod = "wallet";
  const AW = lang == "ar", wBal = walletBal(), wLow = user && walletReady() && wBal + 0.005 < T_.total;
  const payBox = !walletOn() || wl.setup
    ? `<div class="box"><p class="pd">${AW ? "الدفع غير متاح حالياً: المحفظة قيد التجهيز." : "Checkout is unavailable right now: the wallet is being set up."}</p></div>`
    : !user
      ? `<div class="box wpay"><h3>${ic("wallet", 16)} ${AW ? "الدفع من المحفظة" : "Pay from wallet"}</h3><p class="pd">${AW ? "سجّل الدخول لاستخدام رصيد محفظتك وإتمام الطلب." : "Sign in to use your wallet balance and place the order."}</p><a class="b b2 block" href="#/login">${AW ? "تسجيل الدخول" : "Sign in"}</a></div>`
      : `<div class="box wpay"><h3>${ic("wallet", 16)} ${AW ? "الدفع من المحفظة" : "Pay from wallet"}</h3><div class="wpay-row"><span class="wpay-ic">${ic("wallet", 22)}</span><div><small>${AW ? "رصيدك الحالي" : "Your balance"}</small><b class="n">${walletReady() ? money(wBal) : "…"}</b></div><a class="b b2 sm" href="#/wallet">${ic("plus", 14)} ${AW ? "شحن المحفظة" : "Top up"}</a></div>${wLow ? `<p class="wpay-low">${ic("warn", 14)} ${AW ? "رصيدك لا يكفي لهذا الطلب. اشحن محفظتك ثم عُد لإتمامه." : "Your balance is not enough for this order. Top up, then come back."}</p>` : ""}</div>`;
  return (
    rows +
    payBox +
    `<div class="box"> ${couponBox} <div class="sum"> <div class="row"><span>${t("sub")}</span><b class="n">${money( T_.sub )}</b></div> ${ T_.disc > 0 ? `<div class="row disc"><span>${t( "dis" )}</span><b class="n">− ${money(T_.disc)}</b></div>` : "" } <div class="row tot"><span>${t("tot")}</span><b class="n">${money( T_.total )}</b></div>${convRow(T_.total)} </div> <div class="pay"> <button class="b" data-a="co">${ic("check", 16)} ${t("co")}</button> </div></div>`
  );
}

/* Payment instructions card (success page) */
function payInstructions(m) {
  if (!m) return "";
  const note = lang == "ar" ? m.da : m.de;
  const network = String(m.network || "").trim();
  const min = Number(m.min || 0), max = Number(m.max || 0);
  const lk = pmCur(m);
  const limits = (min > 0 || max > 0) ? `<p class="pd"><b>${lang == "ar" ? "حدود التحويل:" : "Transfer limits:"}</b> ${min > 0 ? (lang == "ar" ? "من " : "Min ") + `<bdi dir="ltr">${pmAmt(min, lk)}</bdi>` : ""}${min > 0 && max > 0 ? " — " : ""}${max > 0 ? (lang == "ar" ? "حتى " : "Max ") + `<bdi dir="ltr">${pmAmt(max, lk)}</bdi>` : (min > 0 ? (lang == "ar" ? " (لا حد أعلى)" : " (no upper limit)") : "")}</p>` : "";
  const memo = String(m.memo || "").trim();
  return `<div class="box payi"><div class="payi-h">${payLogo(m, 46)}<div><small>${t("payhow")}</small><b>${pmName(m)}</b><small>${lang == "ar" ? "دفع يدوي — تتم مراجعة التحويل قبل اعتماد الطلب" : "Manual payment — transfer is reviewed before order approval"}</small></div></div>${
    network ? `<div class="payi-acc"><small>${lang == "ar" ? "الشبكة / نوع التحويل" : "Network / transfer type"}</small><div><bdi dir="ltr">${ex(network)}</bdi></div></div>` : ""
  }${
    m.acc
      ? `<div class="payi-acc"><small>${t("payto")}</small><div class="acc"><bdi dir="ltr" class="acc-v">${ex(m.acc)}</bdi><button type="button" class="b b2 sm acc-b" data-a="copy" data-v="${ex(m.acc)}">${ic("copy", 14)}<span>${t("copy")}</span></button></div></div>`
      : ""
  }${memo ? `<div class="payi-acc"><small>${lang == "ar" ? "ملاحظة / مرجع مطلوب" : "Required note / reference"}</small><p class="pd">${ex(memo)}</p></div>` : ""}${limits}${note ? `<p class="pd">${ex(note)}</p>` : ""}<p class="pd">${lang == "ar" ? "لا ترفع صورة فقط وتفترض أن الدفع تم؛ سيُعتمد الطلب بعد التحقق الفعلي من وصول الأموال." : "Uploading a receipt does not complete payment; the order is approved only after the funds are independently verified."}</p></div>`;
}
/* Success page after an order */
function donePage(id) {
  const o = lastOrder && lastOrder.id == id ? lastOrder : { id };
  if (o.method == "wallet") return walletDonePage(o);
  if (walletPaid[id]) return walletDonePage({ ...o, wpaid: true });
  const m = o.method ? pmOf(o.method) : null,
    done = claimed[id];
  const v2Slot = !o.wpaid && o.method !== "wallet" ? `<div class="box" id="amx-payment-slot" data-order-id="${ex(o.id)}"><p class="pd">${lang == "ar" ? "جارٍ تحميل تعليمات الدفع الآمن…" : "Loading secure payment instructions…"}</p></div>` : "";
  return `<div class="box done"><div class="okc">${ic( "check", 36 )}</div><h1>${t("donet")}</h1> <p class="pd">${t("doned")}</p><div class="oid" dir="ltr">${ex(o.id)}</div> ${ o.total != null ? `<p class="pd">${t("tot")}: <b class="n">${money(o.total)}</b></p>` : "" }</div>${v2Slot}${o.wpaid ? walletDonePage(o) : ""}${!done && o.wok && walletOn() && !wl.setup ? `<div class="box">${walletAltBox(o.id)}</div>` : ""}${ticketBox(o.id)}<div class="box"><div class="acts"><a class="b b2" href="#/orders">${ic("box", 16)} ${t("vieword")}</a><a class="b b2" href="#/">${t("keep")}</a></div></div>`;
}

/* Account & favourites */
/* order counts for the account page (best effort, refreshed at most every 30 s) */
async function accStatsLoad() {
  if (!user || accStats.busy || Date.now() - accStats.at < 30000) return;
  accStats.busy = true;
  try {
    const r = await sb(`/rest/v1/orders?select=id,status&user_id=eq.${encodeURIComponent(user.id)}&limit=1000`);
    if (r.ok) {
      const rows = await r.json();
      accStats.n = rows.length;
      accStats.done = rows.filter((o) => o.status == "done").length;
      accStats.at = Date.now();
      if (/^#\/account/.test(location.hash)) {
        const f = document.activeElement;
        if (!(f && /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName))) render();
      }
    }
  } catch {}
  accStats.busy = false;
}
function accPage() {
  accStatsLoad();
  const A = lang == "ar",
    meta = (user && user.user_metadata) || {},
    name = nameOf(),
    shown = name || user.email.split("@")[0],
    pic = [meta.avatar_url, meta.picture].find((u) => typeof u == "string" && /^https:\/\//.test(u)),
    since = profileSince ? new Date(profileSince).toLocaleDateString(A ? "ar-EG-u-nu-latn" : "en-GB", { year: "numeric", month: "long" }) : "",
    row = (href, icon, title, sub = "", badge = "") =>
      `<a class="pf-r" href="${href}"><span class="pf-i">${ic(icon, 20)}</span><span class="pf-t"><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</span>${badge}<i class="pf-ch">${ic("chev", 16)}</i></a>`,
    st = refInfo && refInfo.loaded ? refInfo.status || "none" : "none",
    pchip = { approved: [A ? "معتمد" : "Approved", "ok"], pending: [A ? "قيد المراجعة" : "Under review", "wt"] }[st],
    earned = +(refInfo && refInfo.total_commission) || 0,
    wOn = walletOn() && !wl.setup,
    stat = (v, k) => `<div class="pf-s"><b class="n">${v}</b><small>${k}</small></div>`;
  return `<section class="pf-hd">
<div class="pf-av">${pic ? `<img src="${ex(pic)}" alt="" referrerpolicy="no-referrer">` : `<b>${ex([...shown][0].toUpperCase())}</b>`}</div>
<div class="pf-id"><h1>${t("wel")}${name ? "، " + ex(name) : ""}</h1><bdi dir="ltr" class="pf-em">${ex(user.email)}</bdi>${since ? `<small class="pf-since">${A ? "عضو منذ" : "Member since"} ${ex(since)}</small>` : ""}</div>
${profileUid ? `<div class="pf-uid"><span><small>${A ? "معرّف الحساب" : "Account ID"}</small><bdi dir="ltr" class="n">UID ${ex(profileUid)}</bdi></span><button type="button" class="b sm" data-a="copy" data-v="${ex(profileUid)}">${ic("copy", 14)} <span>${t("copy")}</span></button></div>` : ""}
</section>
<div class="pf-stats">${stat(accStats.n == null ? "…" : accStats.n, A ? "الطلبات" : "Orders")}${stat(accStats.n == null ? "…" : accStats.done, A ? "المكتملة" : "Completed")}${wOn ? stat(walletReady() ? money(walletBal()) : "—", A ? "الرصيد" : "Balance") : ""}</div>
<h2 class="pf-h">${A ? "نشاطي" : "My activity"}</h2>
<div class="pf-l">${row("#/orders", "box", A ? "طلباتي وفواتيري" : "My orders & invoices", A ? "تتبّع الطلبات وحمّل الفاتورة" : "Track orders and get invoices", accStats.n ? `<em class="pf-bd">${accStats.n}</em>` : "")}${wOn ? row("#/wallet", "wallet", A ? "محفظتي" : "My wallet", walletReady() ? `${A ? "الرصيد" : "Balance"}: ${money(walletBal())}` : A ? "شحن الرصيد والدفع به" : "Top up and pay with balance") : ""}${row("#/support", "hs", t("tk_acc"), A ? "تواصل مع الدعم الفني" : "Get help from support")}</div>
${refInfo ? `<h2 class="pf-h">${A ? "الربح والشراكة" : "Earn"}</h2><div class="pf-l">${row("#/partner", "gift", A ? "برنامج الشركاء" : "Partner program", st == "approved" && earned > 0 ? `${A ? "عمولتك" : "Earned"}: ${money(earned)}` : A ? "اربح عمولة من كل عملية بيع" : "Earn commission on every sale", pchip ? `<small class="pst ${pchip[1]}">${pchip[0]}</small>` : "")}</div>` : ""}
${pushBox()}
<button class="b b2 block pf-out" data-a="out">${t("out")}</button>`;
}
/* ---------- Wallet: one main balance; eligibility is authoritative on the server ----------
   The browser only caches the wallet_eligible(items) RPC result for the current cart. It never re-implements
   product eligibility or writes balances directly. */
const WALLET_SECTIONS = {
  main: { ar: "الرصيد الرئيسي", en: "Main balance", hint_ar: "يُستخدم للمنتجات والخدمات المؤهلة", hint_en: "Usable for eligible products and services" },
};
const wl = { loaded: false, busy: false, err: false, setup: false, at: 0, bal: {}, tx: [], tops: [], amt: 10, method: "", sec: "main", v2Topups: [] };
const walletPaid = {}; // order ids just paid from the wallet
const walletCfg = () => (CFG && CFG.wallet && typeof CFG.wallet == "object" ? CFG.wallet : {});
const walletOn = () => walletCfg().on !== false;
const walletSecs = () => ["main"];
const walletSecName = (k) => (WALLET_SECTIONS[k] ? WALLET_SECTIONS[k][lang] || WALLET_SECTIONS[k].ar : k);
const walletBal = (s = "main") => +wl.bal.main || 0;
const walletReady = () => wl.loaded && !wl.err && !wl.setup;
const walletEligibility = { key: "", value: null, promise: null };
const walletItems = (lines) => lines.map(({ x, p }) => ({ id: String(p.id), quantity: Math.max(1, Number(x.q) || 1) }));
const walletItemsKey = (lines) => JSON.stringify(walletItems(lines));
async function walletEligibleFor(lines, force = false) {
  if (!user || !walletOn() || !Array.isArray(lines) || !lines.length) return false;
  const key = walletItemsKey(lines);
  if (!force && walletEligibility.key === key && walletEligibility.value !== null) return walletEligibility.value;
  if (!force && walletEligibility.key === key && walletEligibility.promise) return walletEligibility.promise;
  const promise = (async () => {
    let eligible = false;
    try {
      const r = await window.AMXPayTransport.rpc("wallet_eligible", { p_items: walletItems(lines) }, true);
      if (r.ok) eligible = (await r.json()) === true;
    } catch {}
    if (walletEligibility.key === key) {
      walletEligibility.value = eligible;
      walletEligibility.promise = null;
    }
    return eligible;
  })();
  walletEligibility.key = key;
  walletEligibility.value = null;
  walletEligibility.promise = promise;
  return promise;
}
const walletEligibilityCached = (lines) => walletEligibility.key === walletItemsKey(lines) && walletEligibility.value === true;
function walletReset() {
  Object.assign(wl, { loaded: false, busy: false, err: false, setup: false, at: 0, bal: {}, tx: [], tops: [] });
}
function walletRerender() {
  if (!/^#\/(wallet|cart|account|orders|done)/.test(location.hash)) return;
  const f = document.activeElement;
  if (f && /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName)) return; // never wipe what the visitor is typing
  render();
}
async function loadWallet(force) {
  if (!user || wl.busy || !walletOn()) return;
  if (!force && Date.now() - wl.at < 20000) return;
  wl.at = Date.now();
  wl.busy = true;
  const q = encodeURIComponent(user.id);
  try {
    const rs = await Promise.all([
      sb(`/rest/v1/wallets?user_id=eq.${q}&select=section,balance`),
      sb(`/rest/v1/wallet_transactions?user_id=eq.${q}&select=id,created_at,section,kind,amount,balance_after,ref&order=id.desc&limit=30`),
    ]);
    if (rs.some((r) => r.status == 404)) {
      wl.setup = true; // tables not created yet (supabase-wallet.sql)
      throw new Error("setup");
    }
    if (rs.some((r) => !r.ok)) throw new Error("http");
    const [a, b] = await Promise.all(rs.map((r) => r.json()));
    wl.bal = {};
    a.forEach((x) => (wl.bal.main = (wl.bal.main || 0) + (+x.balance || 0)));
    wl.tx = Array.isArray(b) ? b : [];
    wl.tops = [];
    wl.err = false;
    wl.setup = false;
  } catch {
    wl.err = !wl.setup;
  }
  wl.loaded = true;
  wl.busy = false;
  walletRerender();
}
function walletErr(err) {
  const m = String((err && err.message) || err || ""),
    A = lang == "ar";
  const k = [
    [/PGRST202|PGRST205|Could not find the function|42883|42P01/i, A ? "المحفظة غير مفعّلة بعد في قاعدة البيانات" : "The wallet is not set up in the database yet"],
    [/insufficient_balance/, A ? "الرصيد غير كافٍ" : "Insufficient balance"],
    [/wallet_not_eligible/, A ? "المحفظة تعمل مع خدمات الرشق فقط" : "The wallet only works for boost services"],
    [/below_min/, A ? "المبلغ أقل من الحد الأدنى للشحن" : "Amount is below the minimum top-up"],
    [/above_max/, A ? "المبلغ أكبر من الحد الأعلى للشحن" : "Amount is above the maximum top-up"],
    [/invalid_method/, A ? "وسيلة الدفع غير متاحة" : "Payment method is not available"],
    [/too_many_pending/, A ? "لديك طلبات شحن معلّقة كثيرة، أكملها أولاً" : "You have too many open top-ups, finish them first"],
    [/rate_limited/, A ? "محاولات كثيرة، انتظر قليلاً" : "Too many attempts, wait a bit"],
    [/wallet_disabled/, A ? "المحفظة متوقفة حالياً" : "The wallet is currently disabled"],
    [/proof_required/, t("proofneed")],
    [/invalid_path|proof_missing/, t("proofdeny")],
    [/not_allowed/, A ? "العملية غير مسموحة (ربما تمّت مسبقاً)" : "Not allowed (maybe already done)"],
  ].find(([re]) => re.test(m));
  return k ? k[1] : !navigator.onLine ? t("net") : A ? "حدث خطأ، حاول لاحقاً" : "Something went wrong, try again";
}
function walletSession(r) {
  if (r.status != 401) return false;
  clearSession();
  returnTo = location.hash;
  toast(t("sesexp"), "er");
  location.hash = "#/login";
  return true;
}
const walletProofPick = (id) =>
  `<label class="proofcard"><input type="file" accept="image/jpeg,image/png,image/webp" hidden data-a="wproof" data-id="${ex(id)}"><span class="pc-ic">${ic("upload", 26)}</span><span class="pc-t">${t("proofbtn")}</span><span class="pc-s">${t("proofpick")}</span></label>`;
const walletClaimBtn = (id, hasProof) =>
  `<button class="b${hasProof ? "" : " locked"}" data-a="wl-claim" data-id="${ex(id)}"${hasProof ? "" : ' disabled aria-disabled="true"'}>${ic("check", 16)} ${t("paidbtn")}</button>`;
const walletConv = () => {
  const m = pmOf(wl.method),
    k = m && m.currency;
  if (!m || !(wl.amt > 0)) return "";
  const le = pmLimitErr(m, wl.amt);
  return (k && R[k] ? `${lang == "ar" ? "المبلغ المطلوب تحويله" : "Amount to transfer"}: <b dir="ltr">${fmt(wl.amt, k)}</b>` : "") + (le ? `<br><span class="wl-low">${ic("warn", 14)} ${ex(le)}</span>` : "");
};
/* "pay this pending order from the wallet" (done page + orders page) */
const walletPayBox = (id) => {
  const A = lang == "ar";
  return `<div class="wl-pay"><p class="pd">${ic("wallet", 14)} ${A ? "هذا الطلب بانتظار الدفع من المحفظة" : "This order is waiting to be paid from your wallet"}${walletReady() ? ` · ${A ? "رصيدك" : "Balance"}: ${money(walletBal())}` : ""}</p><div class="acts"><button class="b" data-a="wl-pay" data-id="${ex(id)}">${ic("check", 16)} ${A ? "ادفع من المحفظة" : "Pay from wallet"}</button><a class="b b2" href="#/wallet">${A ? "شحن المحفظة" : "Top up"}</a></div></div>`;
};
/* A pending manual-transfer order whose items the wallet can pay (all boost) can switch to the wallet instead; pay_order_with_wallet() re-checks everything and sets payment_method = 'wallet' */
const orderWalletOk = (items) => !!user && walletOn() && !wl.setup && items.length > 0 && items.every((i) => { const p = prod(i && i.id); return !!p && needsLink(p); });
const walletAltBox = (id) => {
  const A = lang == "ar";
  return `<div class="wl-pay"><p class="pd">${ic("wallet", 14)} ${A ? "أو ادفع هذا الطلب فوراً من رصيد محفظتك بدل التحويل" : "Or pay this order instantly from your wallet balance instead of transferring"}${walletReady() ? ` · ${A ? "رصيدك" : "Balance"}: ${money(walletBal())}` : ""}</p><div class="acts"><button class="b b2" data-a="wl-pay" data-id="${ex(id)}">${ic("wallet", 16)} ${A ? "ادفع من المحفظة" : "Pay from wallet"}</button><a class="b b2" href="#/wallet">${A ? "شحن المحفظة" : "Top up"}</a></div></div>`;
};
const walletChip = (sec, elig = true) =>
  sec
    ? `<button type="button" role="radio" aria-checked="${payMethod == "wallet"}"${elig === false ? " disabled" : ""} class="pchip${payMethod == "wallet" ? " on" : ""}" data-a="pay" data-id="wallet"><span class="wl-ic">${ic("wallet", 20)}</span><span>${lang == "ar" ? "المحفظة" : "Wallet"}${walletReady() ? `<small class="wl-cb">${money(walletBal(sec))}</small>` : ""}${elig === false ? `<small class="wl-sub">${lang == "ar" ? "غير متاحة لهذا الطلب" : "Not available for this order"}</small>` : ""}</span><i>${ic("check", 14)}</i></button>`
    : "";
const walletHint = (sec, total) =>
  sec && payMethod == "wallet" && walletReady() && walletBal(sec) + 0.005 < total
    ? `<p class="hint wl-low">${ic("warn", 14)} ${lang == "ar" ? "رصيدك غير كافٍ لهذا الطلب." : "Your balance is not enough for this order."} <a href="#/wallet">${lang == "ar" ? "اشحن المحفظة" : "Top up the wallet"}</a></p>`
    : "";
function walletRow() {
  if (!walletOn() || wl.setup) return "";
  const A = lang == "ar";
  return `<a class="box row" href="#/wallet" style="display:flex"><span>${A ? "محفظتي" : "My wallet"}${walletReady() ? `<small class="pt-rw">${A ? "الرصيد" : "Balance"}: ${money(walletBal())}</small>` : ""}</span>${ic("wallet", 18)}</a>`;
}
function walletDonePage(o) {
  const A = lang == "ar",
    paid = walletPaid[o.id] || o.wpaid;
  return `<div class="box done"><div class="okc">${ic("check", 36)}</div><h1>${paid ? (A ? "تم الدفع من المحفظة" : "Paid from your wallet") : t("donet")}</h1><p class="pd">${paid ? (A ? "استلمنا طلبك وسيبدأ تنفيذه قريباً." : "We received your order and it will start shortly.") : A ? "تم إنشاء الطلب لكن لم يكتمل الدفع من المحفظة." : "The order was created but the wallet payment did not go through."}</p><div class="oid" dir="ltr">${ex(o.id)}</div>${o.total != null ? `<p class="pd">${t("tot")}: <b class="n">${money(o.total)}</b></p>` : ""}</div>${paid ? "" : `<div class="box">${walletPayBox(o.id)}</div>`}${ticketBox(o.id)}<div class="box"><div class="acts"><a class="b b2" href="#/orders">${ic("box", 16)} ${t("vieword")}</a><a class="b b2" href="#/wallet">${ic("wallet", 16)} ${A ? "محفظتي" : "My wallet"}</a><a class="b b2" href="#/">${t("keep")}</a></div></div>`;
}
function walletTopupCard(x) {
  const A = lang == "ar",
    m = pmOf(x.payment_method),
    k = x.pay_currency && R[x.pay_currency] ? x.pay_currency : m && m.currency,
    hp = !!x.payment_proof;
  return `${payInstructions(m)}<div class="box wl-top"><div class="ord-h"><div><b dir="ltr">#${ex(x.id)}</b><div class="ord-meta">${ex(fmtDate(x.created_at))} · ${ex(walletSecName(x.section))}</div></div><div style="text-align:end"><span class="wst">${A ? "بانتظار الدفع" : "Awaiting payment"}</span><div class="ord-t n">${money(x.amount)}</div></div></div>${k && R[k] ? `<p class="pd">${A ? "حوّل بالضبط" : "Transfer exactly"}: <b dir="ltr">${fmt(x.amount, k)}</b></p>` : ""}<div class="ord-act">${hp ? proofOkCard() : walletProofPick(x.id) + `<p class="pd lockhint">${ic("upload", 14)} ${t("prooflock")}</p>`}${walletClaimBtn(x.id, hp)}</div></div>`;
}
function walletPage() {
  const A = lang == "ar",
    back = `<a class="b b2 block" href="#/account">${A ? "رجوع إلى حسابي" : "Back to my account"}</a>`,
    msg = (p) => `<div class="box"><h1>${ic("wallet", 22)} ${A ? "محفظتي" : "My wallet"}</h1>${p}</div>${back}`;
  if (!walletOn()) return msg(`<p class="pd">${A ? "المحفظة غير متاحة حالياً." : "The wallet is not available right now."}</p>`);
  if (wl.setup) return msg(`<p class="pd">${A ? "المحفظة قيد التجهيز، حاول لاحقاً." : "The wallet is being set up, please try later."}</p>`);
  if (!wl.loaded) return partnerSkeleton();
  if (wl.err)
    return msg(`<p class="pd">${A ? "تعذّر تحميل المحفظة. لم يتغيّر شيء في رصيدك." : "Couldn't load your wallet. Your balance is unchanged."}</p><button type="button" class="b block" data-a="wl-retry">${ic("refresh", 16)} ${A ? "إعادة المحاولة" : "Try again"}</button>`);
  const secs = walletSecs(),
    W = walletCfg(),
    min = Math.max(+W.min || 1, 0.5),
    max = +W.max || 1000;
  if (!secs.includes(wl.sec)) wl.sec = "main";
  if (!pmOf(wl.method)) wl.method = PM.length == 1 ? PM[0].id : "";
  const cards = secs
    .map((k) => `<div class="box wl-card"><small>${A ? "الرصيد" : "Balance"} · ${ex(walletSecName(k))}</small><b class="wl-bal n">${money(walletBal(k))}</b><small>${ex((WALLET_SECTIONS[k] || {})["hint_" + lang] || "")}</small></div>`)
    .join("");
  const secPick =
    secs.length > 1
      ? `<div class="wl-amts">${secs.map((k) => `<button type="button" class="pchip${k == wl.sec ? " on" : ""}" data-a="wl-sec" data-id="${ex(k)}"><span>${ex(walletSecName(k))}</span></button>`).join("")}</div>`
      : "";
  const amts = [5, 10, 25, 50, 100].filter((v) => v >= min && (max <= 0 || v <= max));
  const pms = PM.length
    ? `<div class="pchips" role="radiogroup">${PM.map((m) => `<button type="button" role="radio" aria-checked="${m.id == wl.method}" class="pchip${m.id == wl.method ? " on" : ""}" data-a="wl-pm" data-id="${ex(m.id)}">${payLogo(m, 34)}<span>${pmName(m)}</span><i>${ic("check", 14)}</i></button>`).join("")}</div>`
    : `<p class="pd">${A ? "لا توجد وسائل دفع مفعّلة حالياً." : "No payment methods are available right now."}</p>`;
  const form = `<div class="box"><h3 style="margin-bottom:10px">${ic("card", 16)} ${A ? "شحن الرصيد" : "Add funds"}</h3>${secPick}<label class="pd" for="wl-amt">${A ? "المبلغ (بالدولار)" : "Amount (USD)"} · <small>${A ? "الحد الأدنى" : "min"} ${fmt(min, BASE)}</small></label><div class="wl-amts">${amts.map((v) => `<button type="button" class="pchip${+wl.amt == v ? " on" : ""}" data-a="wl-amt" data-n="${v}"><span dir="ltr">${fmt(v, BASE)}</span></button>`).join("")}</div><input class="inp" id="wl-amt" type="number" inputmode="decimal" min="${min}" step="0.5" dir="ltr" style="width:100%;margin:8px 0 12px" value="${wl.amt || ""}" placeholder="${A ? "أو اكتب مبلغاً" : "or type an amount"}"><h3 style="margin-bottom:10px">${A ? "وسيلة الدفع" : "Payment method"}</h3>${pms}<p class="pd" id="wl-conv" style="margin-top:10px">${walletConv()}</p><button type="button" class="b block" data-a="wl-topup">${ic("check", 16)} ${A ? "طلب شحن" : "Request top-up"}</button><p class="hint">${A ? "بعد الطلب ستظهر تعليمات التحويل؛ حوّل المبلغ ثم أرفق صورة الإثبات وسيُضاف الرصيد بعد مراجعتها." : "After requesting you'll see transfer instructions; pay, attach the proof image and the balance is added after review."}</p></div>`;
  const pend = wl.tops.filter((x) => x.status == "pending").map(walletTopupCard).join("");
  const chip = { review: [A ? "قيد المراجعة" : "Under review", "wt"], approved: [A ? "تمت الإضافة" : "Added", "ok"], rejected: [A ? "مرفوض" : "Rejected", "er"] };
  const done = wl.tops.filter((x) => x.status != "pending");
  const hist = done.length
    ? `<h2>${A ? "طلبات الشحن" : "Top-up requests"}</h2><div class="box">${done.map((x) => { const c = chip[x.status] || ["", ""]; return `<div class="row wl-tx"><div style="min-width:0"><b dir="ltr">#${ex(x.id)}</b> <span class="wst ${c[1]}">${c[0]}</span><small>${fmtDate(x.created_at)}${x.status == "rejected" && x.admin_note ? " · " + ex(x.admin_note) : ""}</small></div><b class="n">${money(x.amount)}</b></div>`; }).join("")}</div>`
    : "";
  const kind = { topup: A ? "شحن رصيد" : "Top-up", spend: A ? "شراء" : "Purchase", refund: A ? "استرجاع" : "Refund", adjust: A ? "تعديل من الإدارة" : "Admin adjustment" };
  const tx = wl.tx.length
    ? `<h2>${A ? "سجل الحركات" : "Transactions"}</h2><div class="box">${wl.tx.map((x) => `<div class="row wl-tx"><div style="min-width:0"><b>${kind[x.kind] || ex(x.kind)}</b>${x.ref ? ` <small dir="ltr">${ex(x.ref)}</small>` : ""}<small>${fmtDate(x.created_at)}</small></div><b class="n ${+x.amount >= 0 ? "wl-up" : "wl-dn"}">${+x.amount >= 0 ? "+" : "−"}${money(Math.abs(+x.amount))}</b></div>`).join("")}</div>`
    : "";
  return `${cards}${pend}${form}${hist}${tx}${back}`;
}
async function walletTopup(btn) {
  const A = lang == "ar",
    W = walletCfg(),
    min = Math.max(+W.min || 1, 0.5),
    max = +W.max || 1000,
    amt = Math.round((+wl.amt || 0) * 100) / 100;
  if (!(amt >= min)) return toast(`${A ? "أقل مبلغ للشحن" : "Minimum top-up"}: ${fmt(min, BASE)}`, "wn");
  if (max > 0 && amt > max) return toast(`${A ? "أعلى مبلغ للشحن" : "Maximum top-up"}: ${fmt(max, BASE)}`, "wn");
  if (!wl.method || !pmOf(wl.method)) return toast(t("paypick"), "wn");
  const le = pmLimitErr(pmOf(wl.method), amt);
  if (le) return toast(le, "wn");
  setBusy(btn, true);
  try {
    if (!window.AMXPay) throw new Error("payments_v2_ui_unavailable");
    const pay = await window.AMXPay.createTopup(amt, wl.method, "main");
    await window.AMXPay.showPayment(String(pay.id));
    toast(A ? "تم إنشاء دفعة الشحن؛ اتبع التعليمات في النافذة" : "Top-up payment created; follow the instructions in the dialog");
  } catch (err) {
    console.error("[AMARIX] wallet topup", err);
    toast(walletErr(err), "er");
  } finally {
    setBusy(btn, false);
  }
}
async function uploadWalletProof(inp) {
  const f = inp.files && inp.files[0],
    id = +inp.dataset.id,
    lab = inp.closest("label");
  if (!f || !user || !id) {
    inp.value = "";
    return;
  }
  if (lab) lab.classList.add("busy");
  try {
    const blob = await proofBlob(f),
      tk = await getToken();
    if (!tk) throw Object.assign(new Error("session"), { session: true });
    const path = `${user.id}/wl${id}-${Date.now().toString(36)}.jpg`,
      r = await putProof(tk, path, blob);
    if (r.status == 401) throw Object.assign(new Error("session"), { session: true });
    if (!r.ok) throw new Error("up " + r.status);
    const r2 = await sb("/rest/v1/rpc/wallet_topup_set_proof", { method: "POST", body: { p_id: id, p_path: path } });
    if (r2.status == 401) throw Object.assign(new Error("session"), { session: true });
    if (!r2.ok) throw new Error(await r2.text());
    toast(t("proofok"));
    beep("ok");
    await loadWallet(true);
    render();
  } catch (err) {
    console.error("[AMARIX] wallet proof", err);
    const m = String((err && err.message) || "");
    if (err && err.session) {
      clearSession();
      returnTo = location.hash;
      toast(t("sesexp"), "er");
      location.hash = "#/login";
    } else toast(m == "type" ? t("proofbad") : m == "big" ? t("proofbig") : walletErr(err), "er");
  } finally {
    inp.value = "";
    if (lab) lab.classList.remove("busy");
  }
}
async function walletClaim(btn, id) {
  if (btn && btn.disabled) return toast(t("proofneed"), "wn");
  setBusy(btn, true);
  try {
    const r = await sb("/rest/v1/rpc/wallet_topup_claim", { method: "POST", body: { p_id: +id } });
    if (walletSession(r)) return;
    if (!r.ok) throw new Error(await r.text());
    toast(lang == "ar" ? "وصلنا طلبك، سنراجع الدفع ونضيف الرصيد" : "Got it — we'll verify the payment and add the balance");
    beep("ok");
    await loadWallet(true);
    render();
  } catch (err) {
    console.error("[AMARIX] wallet claim", err);
    toast(walletErr(err), "er");
  } finally {
    setBusy(btn, false);
  }
}
async function walletPayOrder(btn, id) {
  setBusy(btn, true);
  try {
    if (!window.AMXPay) throw new Error("payments_v2_ui_unavailable");
    await window.AMXPay.payWithWallet(id, window.AMXPay.idempotencyKey(`wallet-order:${id}`));
    walletPaid[id] = true;
    toast(lang == "ar" ? "تم الدفع من المحفظة" : "Paid from your wallet");
    beep("ok");
    await loadWallet(true);
    render();
  } catch (err) {
    console.error("[AMARIX] wallet pay", err);
    toast(walletErr(err), "er");
  } finally {
    setBusy(btn, false);
  }
}
function walletAction(b, a, id) {
  if (a == "wl-amt") {
    wl.amt = +b.dataset.n || 0;
    return render();
  }
  if (a == "wl-pm") {
    wl.method = id;
    return render();
  }
  if (a == "wl-sec") {
    wl.sec = id;
    return render();
  }
  if (a == "wl-retry") {
    wl.err = false;
    wl.setup = false;
    wl.loaded = false;
    render();
    return loadWallet(true);
  }
  if (a == "wl-topup") return walletTopup(b);
  if (a == "wl-claim") return walletClaim(b, id);
  if (a == "wl-pay") return walletPayOrder(b, id);
}
document.addEventListener("input", (e) => {
  if (e.target.id != "wl-amt") return;
  wl.amt = +e.target.value || 0;
  const c = $("#wl-conv");
  if (c) c.innerHTML = walletConv();
});

/* ---------- Partner (affiliate) program: a status row on the account page + its own page (#/partner) ---------- */
const partnerLink = () => (refInfo && refInfo.code ? (typeof SEO_SITE == "string" && SEO_SITE ? SEO_SITE : location.origin) + "/?ref=" + encodeURIComponent(refInfo.code) : "");
const partnerMsg = () => (lang == "ar" ? "جرّب AMARIX007 — متجر الأصول الرقمية. سجّل من رابطي:" : "Try AMARIX007 — the digital assets store. Sign up through my link:");
function partnerRow() {
  if (!refInfo) return "";
  const A = lang == "ar",
    st = refInfo.loaded ? refInfo.status || "none" : "none",
    chip = { approved: [A ? "معتمد" : "Approved", "ok"], pending: [A ? "قيد المراجعة" : "Under review", "wt"] }[st],
    earned = +refInfo.total_commission || 0,
    sub = st == "approved" && earned > 0 ? `<small class="pt-rw">${A ? "عمولتك" : "Earned"}: ${money(earned)}</small>` : "";
  return `<a class="box row" href="#/partner" style="display:flex"><span>${A ? "برنامج الشركاء" : "Partner program"}${chip ? ` <small class="pst ${chip[1]}">${chip[0]}</small>` : ""}${sub}</span>${ic("gift", 18)}</a>`;
}
/* the numbers move while the page is closed (new clicks, paid orders): refresh them when the page opens (at most every 20 s), on demand, and when the tab becomes visible again */
let partnerAt = 0,
  partnerBusy = false,
  partnerErr = false,
  partnerOk = 0,
  partnerSig = "";
function partnerRerender(force) {
  if (!/^#\/partner/.test(location.hash)) return;
  const i = $("#aff-pay"),
    sig = JSON.stringify([refInfo, partnerBusy, partnerErr, partnerOk]);
  if (i && i.value) return; // never wipe what the visitor is typing
  if (!force && sig === partnerSig) return;
  partnerSig = sig;
  render();
}
async function loadPartner(force) {
  if (!user || !refInfo || partnerBusy) return;
  if (!force && Date.now() - partnerAt < 20000) return;
  partnerAt = Date.now();
  partnerBusy = true;
  if (force) partnerRerender(true);
  try {
    const r = await sb(`/rest/v1/affiliates?user_id=eq.${encodeURIComponent(user.id)}&select=status,rate,clicks,signups,sales,total_commission,coupon`);
    if (!r.ok) throw new Error("http " + r.status);
    const row = (await r.json())[0];
    if (row) Object.assign(refInfo, row);
    refInfo.loaded = true;
    partnerErr = false;
    partnerOk = Date.now();
  } catch {
    partnerErr = true;
  }
  partnerBusy = false;
  partnerRerender(!!force);
}
const partnerSkeleton = () => `<div class="sk sm" style="margin-bottom:12px"></div><div class="sk" style="min-height:150px;margin-bottom:12px"></div><div class="sk" style="min-height:190px"></div>`;
function partnerPage() {
  const A = lang == "ar";
  if (!refInfo || !refInfo.loaded) {
    if (refErr || (refInfo && partnerErr))
      return `<div class="box ref pt-err"><h3>${ic("warn", 16)} ${A ? "تعذّر تحميل بيانات الشريك" : "Couldn't load your partner data"}</h3><p class="sb">${A ? "تحقق من اتصالك بالإنترنت ثم أعد المحاولة. لم يتغيّر شيء في حسابك." : "Check your connection and try again. Nothing changed in your account."}</p><button type="button" class="b block" data-a="aff-retry">${ic("refresh", 16)} ${A ? "إعادة المحاولة" : "Try again"}</button></div><a class="b b2 block" href="#/account">${A ? "رجوع إلى حسابي" : "Back to my account"}</a>`;
    return partnerSkeleton();
  }
  const st = refInfo.status || "none",
    back = `<a class="b b2 block" href="#/account">${A ? "رجوع إلى حسابي" : "Back to my account"}</a>`,
    how = [
      A ? "شارك رابطك الخاص مع أصدقائك أو جمهورك." : "Share your personal link with friends or your audience.",
      A ? "يُنشئ العميل حساباً جديداً عبر رابطك." : "The customer creates a new account through your link.",
      A ? "تُحتسب لك عمولة على كل طلب يتأكد دفعه." : "You earn a commission on every order whose payment is confirmed.",
    ],
    rules = [
      A ? "تُحتسب العمولة بعد تأكيد الدفع فقط، وتُخصم إن أُلغي تأكيد الدفع لاحقاً." : "Commission is counted once payment is confirmed, and removed if the confirmation is later reversed.",
      A ? "لا تُحتسب الإحالة على حسابك أنت." : "Your own account never counts as a referral.",
      A ? "تُسجَّل الإحالة عند إنشاء الحساب الجديد عبر رابطك." : "The referral is recorded when the new account is created through your link.",
    ],
    howBody = `<ol class="ref-how">${how.map((x) => `<li>${x}</li>`).join("")}</ol><ul class="ref-how ref-rules">${rules.map((x) => `<li>${x}</li>`).join("")}</ul>`,
    howBox = (open) => `<details class="box ref"${open ? " open" : ""}><summary>${A ? "كيف يعمل البرنامج؟" : "How the program works"}</summary>${howBody}</details>`,
    title = (chip) => `<h3>${A ? "برنامج الشركاء (Affiliate)" : "Partner (Affiliate) program"}${chip ? ` <small class="pst ${chip[1]}">${chip[0]}</small>` : ""}</h3>`,
    refreshBtn = `<button type="button" class="pt-rf${partnerBusy ? " busy" : ""}" data-a="aff-refresh" aria-label="${A ? "تحديث الأرقام" : "Refresh numbers"}"${partnerBusy ? " disabled" : ""}>${ic("refresh", 18)}</button>`;
  /* ----- approved: link, earnings, funnel, coupon, tips ----- */
  if (st == "approved") {
    const link = partnerLink(),
      rate = refInfo.rate != null && refInfo.rate !== "" && !isNaN(+refInfo.rate) ? +refInfo.rate : null,
      clicks = +refInfo.clicks || 0,
      signups = +refInfo.signups || 0,
      sales = +refInfo.sales || 0,
      earned = +refInfo.total_commission || 0,
      pct = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0),
      top = Math.max(clicks, signups, sales, 1),
      width = (v) => (v > 0 ? Math.max(3, Math.round((v / top) * 100)) : 0),
      time = partnerOk ? new Date(partnerOk).toLocaleTimeString(A ? "ar-EG-u-nu-latn" : "en-GB", { hour: "2-digit", minute: "2-digit" }) : "",
      steps = [
        [A ? "نقرات على رابطك" : "Link clicks", clicks, ""],
        [A ? "تسجيلات جديدة" : "New sign-ups", signups, clicks > 0 ? `${pct(signups, clicks)}% ${A ? "من النقرات" : "of clicks"}` : ""],
        [A ? "طلبات مدفوعة" : "Paid orders", sales, signups > 0 && sales > 0 ? (sales <= signups ? `${pct(sales, signups)}% ${A ? "من التسجيلات" : "of sign-ups"}` : `${(sales / signups).toFixed(1)} ${A ? "طلب لكل مسجَّل" : "orders per sign-up"}`) : ""],
      ],
      msg = partnerMsg(),
      wa = "https://wa.me/?text=" + encodeURIComponent(msg + "\n" + link),
      tg = "https://t.me/share/url?url=" + encodeURIComponent(link) + "&text=" + encodeURIComponent(msg),
      tips = [
        A ? "اشرح لمن تشاركه ماذا سيجد في المتجر بدل إرسال الرابط وحده؛ الرسائل الشخصية تحقق تسجيلات أكثر." : "Tell people what they'll find in the store instead of sending the bare link; personal messages convert better.",
        A ? "تظهر الطلبات في أرقامك بعد تأكيد الدفع من الفريق، فقد يتأخر ظهورها قليلاً." : "Orders show up in your numbers after the team confirms payment, so they can appear with a short delay.",
        A ? "لتغيير معرّف استلام الأرباح أو لأي استفسار، تواصل مع الدعم." : "To change your payout details or ask anything, contact support.",
      ];
    if (!link)
      return `<div class="box ref">${title([A ? "معتمد" : "Approved", "ok"])}<p class="sb">${A ? "أنت شريك معتمد، لكن رابطك لم يُنشأ بعد. تواصل مع الدعم." : "You are an approved partner, but your link has not been created yet. Please contact support."}</p><a class="b block" href="#/support">${A ? "تواصل مع الدعم" : "Contact support"}</a></div>${back}`;
    return (
      /* earnings */
      `<section class="box ref pt-hero"><div class="pt-top">${title([A ? "معتمد" : "Approved", "ok"])}${refreshBtn}</div>` +
      `<div class="pt-earn"><small>${A ? "إجمالي عمولتك" : "Your total commission"}</small><b class="n">${money(earned)}</b></div>` +
      `<div class="pt-meta"><span>${A ? "نسبة العمولة" : "Commission rate"}: <b>${rate != null ? ex(String(rate)) + "%" : A ? "النسبة الافتراضية للمتجر" : "the store's default rate"}</b></span>${sales > 0 ? `<span>${A ? "متوسط العمولة لكل طلب" : "Avg. per order"}: <b>${money(earned / sales)}</b></span>` : ""}${time ? `<span>${A ? "آخر تحديث" : "Updated"}: ${time}</span>` : ""}</div>` +
      (partnerErr ? `<div class="pt-warn" role="status">${ic("warn", 14)}<span>${A ? "تعذّر تحديث الأرقام الآن، والمعروض قد لا يكون الأحدث." : "Couldn't refresh the numbers; what you see may be out of date."}</span><button type="button" data-a="aff-refresh">${A ? "إعادة المحاولة" : "Retry"}</button></div>` : "") +
      `</section>` +
      /* link + share */
      `<section class="box ref"><h3>${A ? "رابطك الخاص" : "Your personal link"}</h3><div class="ref-l"><bdi dir="ltr">${ex(link)}</bdi><button class="b" data-a="copy" data-v="${ex(link)}">${A ? "نسخ" : "Copy"}</button></div>` +
      `<div class="ref-sh"><a class="b b2" href="${ex(wa)}" target="_blank" rel="noopener">${A ? "واتساب" : "WhatsApp"}</a><a class="b b2" href="${ex(tg)}" target="_blank" rel="noopener">${A ? "تيليغرام" : "Telegram"}</a>${navigator.share ? `<button type="button" class="b b2" data-a="aff-share">${A ? "مشاركة…" : "Share…"}</button>` : ""}<button type="button" class="b b2" data-a="copy" data-v="${ex(msg + "\n" + link)}">${A ? "نسخ رسالة جاهزة" : "Copy ready message"}</button></div></section>` +
      /* funnel */
      `<section class="box ref"><h3>${A ? "أداؤك" : "Your performance"}</h3>${
        clicks + signups + sales == 0
          ? `<p class="pt-empty">${A ? "لا نقرات بعد. انسخ رابطك وشاركه، وستظهر الأرقام هنا فور وصول أول زائر." : "No clicks yet. Copy your link and share it; the numbers appear here as soon as the first visitor arrives."}</p>`
          : `<div class="pt-fn">${steps.map(([k, v, n]) => `<div class="pt-st"><div class="pt-st-h"><span>${k}</span><b class="n">${v}</b></div><div class="pt-bar" aria-hidden="true"><i style="width:${width(v)}%"></i></div>${n ? `<small>${n}</small>` : ""}</div>`).join("")}</div>`
      }</section>` +
      (refInfo.coupon ? `<section class="box ref"><h3>${A ? "كوبونك الخاص" : "Your coupon"}</h3><div class="ref-l"><bdi dir="ltr">${ex(refInfo.coupon)}</bdi><button class="b" data-a="copy" data-v="${ex(refInfo.coupon)}">${A ? "نسخ" : "Copy"}</button></div></section>` : "") +
      `<details class="box ref"><summary>${A ? "نصائح" : "Tips"}</summary><ul class="ref-how">${tips.map((x) => `<li>${x}</li>`).join("")}</ul></details>` +
      howBox(false) +
      back
    );
  }
  /* ----- pending: a clear 3-step status ----- */
  if (st == "pending")
    return (
      `<section class="box ref"><div class="pt-top">${title([A ? "قيد المراجعة" : "Under review", "wt"])}${refreshBtn}</div><ol class="pt-steps">` +
      `<li class="ok"><i>${ic("check", 14)}</i><span>${A ? "استلمنا طلبك" : "We received your application"}</span></li>` +
      `<li class="now"><i>2</i><span>${A ? "الفريق يراجع الطلب" : "The team is reviewing it"}</span></li>` +
      `<li><i>3</i><span>${A ? "يظهر رابطك هنا فور الموافقة" : "Your link appears here once approved"}</span></li></ol>` +
      (partnerErr ? `<div class="pt-warn" role="status">${ic("warn", 14)}<span>${A ? "تعذّر التحقق من الحالة الآن." : "Couldn't check the status right now."}</span></div>` : "") +
      `</section>${howBox(true)}${back}`
    );
  /* ----- not applied / rejected: application form ----- */
  return (
    `${howBox(true)}<form class="box ref" id="aff-form" novalidate>${title()}<p class="sb">${A ? "انضم كشريك واكسب عمولة على كل طلب مدفوع عبر رابطك الخاص. أدخل معرّف Binance Pay أو عنوان محفظتك لاستلام الأرباح." : "Join as a partner and earn a commission on every paid order through your own link. Enter your Binance Pay ID or wallet address to receive payouts."}</p>` +
    (st == "rejected" ? `<p class="sb">${A ? "لم يتم قبول طلبك السابق، يمكنك التقديم مرة أخرى." : "Your previous application was not approved — you can apply again."}</p>` : "") +
    `<label class="fld"><span>${A ? "معرّف الدفع لاستلام الأرباح" : "Payout ID"}</span><input class="inp" id="aff-pay" name="pay" dir="ltr" maxlength="120" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send" aria-describedby="aff-er" placeholder="${A ? "معرّف Binance Pay أو عنوان المحفظة" : "Binance Pay ID or wallet address"}"><small class="pt-h">${A ? "تحقق منه جيداً؛ سنرسل الأرباح إليه." : "Double-check it; payouts are sent to it."}</small></label>` +
    `<label class="fld"><span>${A ? "نوع المنصة أو القناة" : "Platform or channel"}</span><select class="inp" id="aff-channel" name="channel"><option value="telegram">Telegram</option><option value="youtube">YouTube</option><option value="tiktok">TikTok</option><option value="instagram">Instagram</option><option value="x">X</option><option value="website">Website</option><option value="other">${A ? "أخرى" : "Other"}</option></select></label>` +
    `<label class="fld"><span>${A ? "رابط قناتك أو حسابك" : "Your channel or profile URL"}</span><input class="inp" id="aff-url" name="channel_url" type="url" dir="ltr" maxlength="200" required placeholder="https://..." aria-describedby="aff-er"></label>` +
    `<label class="fld"><span>${A ? "حجم الجمهور" : "Audience size"}</span><select class="inp" id="aff-audience" name="audience"><option value="lt1k">${A ? "أقل من 1,000" : "Under 1,000"}</option><option value="1k-10k">1,000–10,000</option><option value="10k-50k">10,000–50,000</option><option value="gt50k">${A ? "أكثر من 50,000" : "Over 50,000"}</option></select></label>` +
    `<label class="fld"><span>${A ? "خطة الترويج (اختياري)" : "Promotion plan (optional)"}</span><textarea class="inp" id="aff-pitch" name="pitch" maxlength="400" rows="3"></textarea></label>` +
    `<p class="err" id="aff-er" role="alert"></p><button class="b block" type="submit">${A ? "قدّم طلب الانضمام" : "Apply to join"}</button></form>${back}`
  );
}
async function applyAffiliate(b) {
  const A = lang == "ar",
    inp = $("#aff-pay"),
    urlInp = $("#aff-url"),
    channelInp = $("#aff-channel"),
    audienceInp = $("#aff-audience"),
    pitchInp = $("#aff-pitch"),
    er = $("#aff-er"),
    v = ((inp && inp.value) || "").trim().replace(/\s+/g, " "),
    channelUrl = ((urlInp && urlInp.value) || "").trim(),
    channelType = ((channelInp && channelInp.value) || "other").trim(),
    audience = ((audienceInp && audienceInp.value) || "lt1k").trim(),
    pitch = ((pitchInp && pitchInp.value) || "").trim().slice(0, 400),
    fail = (m) => {
      if (er) er.textContent = m;
      else toast(m, "er");
      if (inp) inp.focus();
    };
  if (er) er.textContent = "";
  if (v.length < 6) return fail(A ? "معرّف الدفع قصير جداً (6 أحرف على الأقل)." : "Payout ID is too short (at least 6 characters).");
  if (!/^https:\/\/[^\s]+\.[^\s]+$/i.test(channelUrl)) return fail(A ? "أدخل رابط القناة كاملاً ويبدأ بـ https://" : "Enter a complete channel URL starting with https://");
  if (!refInfo || !refInfo.loaded || (refInfo.status && refInfo.status != "none" && refInfo.status != "rejected")) return loadPartner(true);
  setBusy(b, true);
  try {
    const r = await sb("/rest/v1/rpc/apply_affiliate", { method: "POST", body: { p_payout: v, p_channel_type: channelType, p_channel_url: channelUrl, p_audience: audience, p_pitch: pitch } });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      /* an application already exists (double tap, another device): just show the real status */
      if (j.code == "23505" || /already|exist|pending|approved/i.test(String(j.message || ""))) {
        setBusy(b, false);
        toast(A ? "لديك طلب سابق، حدّثنا حالته" : "You already have an application; status refreshed", "wn");
        return loadPartner(true);
      }
      throw new Error("http " + r.status);
    }
    refInfo.status = "pending";
    partnerAt = 0;
    toast(A ? "تم إرسال طلبك" : "Application sent");
    render();
    scrollTo(0, 0);
  } catch {
    setBusy(b, false);
    fail(navigator.onLine === false ? (A ? "لا يوجد اتصال بالإنترنت." : "You're offline.") : A ? "تعذّر إرسال الطلب، حاول لاحقاً." : "Couldn't send the application, try again later.");
  }
}
document.addEventListener("submit", (e) => {
  if (e.target.id != "aff-form") return;
  e.preventDefault();
  applyAffiliate(e.target.querySelector("[type=submit]"));
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && /^#\/partner/.test(location.hash)) loadPartner();
});
function favPage() {
  const a = P.filter((p) => fav.includes(p.id));
  return a.length
    ? grid(a)
    : `<p class="emp">${ic("heart", 40)}<br>${t("none")}</p>`;
}

/* ---------- 10. Orders, payments & tracking ---------- */
const orderId = () =>
  "AMX-" +
  Date.now().toString(36).toUpperCase() +
  Math.random().toString(36).slice(2, 4).toUpperCase();
const fmtDate = (d) => {
  try {
    return new Date(d).toLocaleString(
      lang == "ar" ? "ar-EG-u-nu-latn" : "en-GB",
      { dateStyle: "medium", timeStyle: "short" }
    );
  } catch {
    return d || "";
  }
};

function waNumber() {
  const w = SOC.whatsapp;
  const m = w && String(w[1] || "").match(/(\d{7,15})/);
  return m ? m[1] : "";
}
function buildWhatsAppText(id, lines, tt) {
  const m = pmOf(payMethod);
  const L = lines.map(
    ({ x, p }) =>
      `• ${plain(p[lang])} × ${x.q} — ${fmt(pr(p) * x.q)}${ x.l ? "\n " + t("link") + ": " + x.l : "" }`
  );
  return [
    t("hi"),
    id ? `${t("ordno")}: ${id}` : "",
    "",
    ...L,
    "",
    coupon && tt.disc > 0
      ? `${t("coupon")}: ${coupon} (− ${fmt(tt.disc)})`
      : "",
    m ? `${t("payhow")}: ${plain(pmName(m))}` : "",
    `${t("total")}: ${fmt(tt.total)}`,
  ]
    .filter((v, i, a) => v !== "" || (a[i - 1] !== "" && i))
    .join("\n")
    .trim();
}
function openWhatsApp(text, win) {
  const num = waNumber(),
    url = `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  if (win && !win.closed) win.location.href = url;
  else if (!window.open(url, "_blank", "noopener")) location.href = url;
}

/* Create a real order in Supabase (requires a signed-in user) */
async function placeOrder(btn, viaWhatsApp = false) {
  const lines = cartLines();
  if (!lines.length) return toast(t("ce"), "wn");
  if (viaWhatsApp && !waNumber()) return toast(t("waunset"), "wn");
  const badL = lines.find((l) => needsLink(l.p) && !linkOk(l.x.l));
  if (badL) return flagLink(badL);
  const badI = lines.find((l) => apiInput(l.p) && !inputOk(l.x.l));
  if (badI) {
    toast(lang == "ar" ? "أدخل المعرّف أو الإيميل المطلوب لهذا المنتج" : "Enter the ID or email this product needs", "wn");
    const el = [...document.querySelectorAll("input[data-a=lk]")].find((e) => e.dataset.id == badI.p.id);
    if (el) {
      el.setAttribute("aria-invalid", "true");
      el.focus();
    }
    return;
  }
  const badQ = lines.find((l) => qLimited(l.p) && (l.x.q < qMin(l.p) || l.x.q > qMax(l.p)));
  if (badQ) {
    badQ.x.q = qClamp(badQ.p, badQ.x.q);
    save();
    render();
    return toast(`${t("qinval")} (${t("qminl")}: ${fmtN(qMin(badQ.p))})`, "wn");
  }
  payMethod = "wallet";
  if (!user) {
    returnTo = "#/cart";
    toast(t("lreq"), "wn");
    location.hash = "#/login";
    return;
  }
  if (!walletOn() || wl.setup) return toast(lang == "ar" ? "الدفع غير متاح حالياً: المحفظة غير مفعّلة." : "Checkout is unavailable: the wallet is not enabled.", "wn");
  const walletServerEligible = await walletEligibleFor(lines, true);
  const useWallet = !viaWhatsApp && !!user && payMethod == "wallet" && walletOn() && walletServerEligible;
  if (!useWallet && !viaWhatsApp) return toast(lang == "ar" ? "تعذّر الدفع من المحفظة لهذا الطلب. أعد المحاولة أو تواصل مع الدعم." : "Could not pay this order from the wallet. Try again or contact support.", "er");
  if (!viaWhatsApp && !useWallet && PM.length && !payMethod) return toast(t("paypick"), "wn");
  if (!viaWhatsApp) {
    if (!window.AMXPay) return toast(lang == "ar" ? "نظام الدفع الجديد غير محمّل؛ لم يُنشأ الطلب." : "Payment module unavailable; no order was created.", "er");
    try {
      const paymentCfg = await window.AMXPay.getConfig();
      if (!paymentCfg || paymentCfg.on !== true) return toast(lang == "ar" ? "الدفع الجديد غير مفعّل بعد. لم يُنشأ الطلب." : "Payments v2 is not enabled yet. No order was created.", "wn");
    } catch (payErr) {
      console.error("[AMARIX] payment readiness", payErr);
      return toast(lang == "ar" ? "تعذّر التحقق من وسائل الدفع. لم يُنشأ الطلب." : "Could not verify payment settings. No order was created.", "er");
    }
  }
  const tt = totals();
  if (!(+tt.total.toFixed(2) >= 0.01)) {
    /* the server rejects zero-value payments; stop before an unpayable order row is created */
    return toast(lang == "ar" ? "قيمة الطلب أقل من الحد الأدنى للدفع (0.01). زد الكمية ثم أعد المحاولة." : "The order total is below the minimum payable amount (0.01). Increase the quantity and try again.", "wn");
  }
  if (!viaWhatsApp && !useWallet) {
    const le = pmLimitErr(pmOf(payMethod), tt.total);
    if (le) return toast(le, "wn");
  }
  if (useWallet) {
    if (!wl.loaded) await loadWallet(true);
    if (walletReady() && walletBal("main") + 0.005 < tt.total) {
      toast(lang == "ar" ? "رصيدك غير كافٍ — اشحن المحفظة أولاً" : "Your balance is not enough — top up the wallet first", "wn");
      location.hash = "#/wallet";
      return;
    }
  }

  if (!user) {
    // guests: WhatsApp still works, otherwise go sign in
    if (viaWhatsApp) return openWhatsApp(buildWhatsAppText(null, lines, tt));
    returnTo = "#/cart";
    toast(t("lreq"), "wn");
    location.hash = "#/login";
    return;
  }

  const waWin = viaWhatsApp ? window.open("", "_blank") : null; // opened synchronously so popup blockers allow it
  setBusy(btn, true);
  let id = orderId(); // temporary: the database assigns the real sequential number (AMX-1001, AMX-1002, ...)
  let orderCreated = false, paymentFlowDone = false;
  try {
    const row = {
      id,
      user_id: user.id,
      customer_name: nameOf() || user.email,
      customer_email: user.email,
      items: lines.map(({ x, p }) => ({
        id: p.id,
        name: plain(p[lang]),
        ar: plain(p.ar),
        en: plain(p.en),
        q: x.q,
        link: x.l || "",
        price: +pr(p).toFixed(2),
      })),
      total: +tt.total.toFixed(2),
      currency: BASE,
      pay_currency: payCurrency(), // display only: the server computes the amount from the trusted total + stored rates
      coupon: coupon && tt.disc > 0 ? coupon : null,
      status: "new",
      payment_status: "pending",
      payment_method: useWallet ? "wallet" : payMethod == "wallet" ? null : payMethod || null,
      lang,
      // created_at: filled by the database default now() (client clocks are not trusted)
    };
    // If the database lacks a newer column (migration not run yet), drop it and retry so the order still goes through
    let r;
    for (let n = 0; n < 8; n++) {
      r = await sb("/rest/v1/orders", {
        method: "POST",
        prefer: "return=representation",
        body: row,
      });
      if (r.ok || r.status == 401) break;
      const txt = await r.clone().text(),
        col = (txt.match(/'([a-z_]+)' column/i) || [])[1];
      if (col && col in row && col != "id" && col != "items") delete row[col];
      else break;
    }
    if (r.status == 401) {
      clearSession();
      throw Object.assign(new Error("session"), { session: true });
    }
    if (!r.ok) throw new Error(await r.text());
    orderCreated = true;
    try {
      const j = await r.json(); // the real order number assigned by the server
      if (j && j[0] && j[0].id) id = j[0].id;
    } catch {}
    let wOk = false, paymentV2 = null;
    if (!viaWhatsApp) {
      const idem = window.AMXPay.idempotencyKey(`order:${id}`);
      if (useWallet) {
        await window.AMXPay.payWithWallet(id, window.AMXPay.idempotencyKey(`wallet-order:${id}`));
        wOk = true;
        walletPaid[id] = true;
        loadWallet(true);
      } else {
        const pay = await window.AMXPay.createOrder(id, payMethod, idem);
        paymentV2 = { id: String(pay.id), status: String(pay.status || "awaiting_payment") };
      }
    }
    paymentFlowDone = true;
    lastOrder = { id, total: tt.total, method: useWallet ? "wallet" : payMethod, wpaid: wOk, wok: walletEligibilityCached(lines), paymentV2 };
    if (viaWhatsApp) openWhatsApp(buildWhatsAppText(id, lines, tt), waWin);
    cart = [];
    coupon = "";
    save();
    nav();
    beep("ok");
    location.hash = "#/done/" + id;
  } catch (err) {
    // If order insertion succeeded but payment creation failed, recover an idempotently-created payment
    // before safely cancelling the otherwise orphaned unpaid order.
    if (orderCreated && !paymentFlowDone && !viaWhatsApp && window.AMXPay) {
      let recovered = null;
      try { recovered = await window.AMXPay.statusForOrder(id); } catch {}
      if (recovered && recovered.id) {
        lastOrder = {
          id, total: tt.total, method: useWallet ? "wallet" : payMethod,
          wpaid: useWallet && recovered.status === "captured",
          wok: walletEligibilityCached(lines),
          paymentV2: { id: String(recovered.id), status: String(recovered.status || "awaiting_payment") },
        };
        cart = [];
        coupon = "";
        save();
        nav();
        location.hash = "#/done/" + id;
        toast(lang == "ar" ? "تم استعادة حالة الدفع لهذا الطلب" : "Recovered payment status for this order", "wn");
        return;
      }
      try {
        await sb("/rest/v1/rpc/cancel_unpaid_order", {
          method: "POST",
          body: { p_order_id: String(id) },
        });
      } catch (cleanupErr) {
        console.warn("[AMARIX] safe unpaid-order cleanup failed", cleanupErr);
      }
    }
    if (waWin) waWin.close();
    console.error("[AMARIX] order failed", err);
    if (err.session) {
      returnTo = "#/cart";
      toast(t("sesexp"), "er");
      location.hash = "#/login";
    } else
      toast(
        navigator.onLine
          ? t("ordfail") +
              (err.message
                ? " — " + String(err.message).replace(/[{}"]/g, "").slice(0, 90)
                : "")
          : t("net"),
        "er"
      );
  } finally {
    setBusy(btn, false);
  }
}

/* Payment proof: image goes to the PRIVATE bucket payment-proofs under <user id>/, then set_payment_proof() records the path (SQL block in supabase-schema.sql) */
const proofPick = (id) =>
  `<label class="proofcard"><input type="file" accept="image/jpeg,image/png,image/webp" hidden data-a="proof" data-id="${ex(id)}"><span class="pc-ic">${ic("upload", 26)}</span><span class="pc-t">${t("proofbtn")}</span><span class="pc-s">${t("proofpick")}</span></label>`;
/* "I have paid" stays locked (disabled) until a proof image is attached */
const claimBtn = (id, hasProof) =>
  `<button class="b${hasProof ? "" : " locked"}" data-a="claim" data-id="${ex(id)}"${hasProof ? "" : " disabled aria-disabled=\"true\""}>${ic("check", 16)} ${t("paidbtn")}</button>`;
const proofOkCard = () =>
  `<div class="proofcard ok"><span class="pc-ic">${ic("check", 26)}</span><span class="pc-t">${t("proofok")}</span></div>`;
function proofBox(id, claimedFlag, has) {
  const ok = proofDone[id] || has;
  if (claimedFlag && !ok) return "";
  return `<div class="box proof${ok ? " ok" : ""}"><h3>${ic("card", 16)} ${t("proof")}${ok ? "" : ` <span class="req">${t("proofreq")}</span>`}</h3>${ok ? proofOkCard() : `<p class="pd">${t("proofhint")}</p>${proofPick(id)}`}</div>`;
}
async function proofBlob(file) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) throw new Error("type");
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => no(new Error("type"));
      i.src = url;
    });
    const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight, 1)),
      c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(im.naturalWidth * k));
    c.height = Math.max(1, Math.round(im.naturalHeight * k));
    const g = c.getContext("2d");
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(im, 0, 0, c.width, c.height);
    const blob = await new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.85));
    if (!blob) throw new Error("type");
    if (blob.size > 5 * 1024 * 1024) throw new Error("big");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
/* Upload like the official Supabase client (multipart); if the server refuses that, retry once with a raw body. Returns the Response to inspect. */
async function putObject(bucket, tk, path, blob, name = "file.jpg") {
  const url = SB_URL + "/storage/v1/object/" + bucket + "/" + path,
    hdr = { apikey: SB_KEY, Authorization: "Bearer " + tk };
  const fd = new FormData();
  fd.append("cacheControl", "3600");
  fd.append("", blob, name);
  const r = await fetch(url, { method: "POST", headers: hdr, body: fd });
  if (r.ok || r.status == 401) return r;
  try {
    const r2 = await fetch(url, { method: "POST", headers: { ...hdr, "Content-Type": "image/jpeg" }, body: blob });
    if (r2.ok) return r2;
  } catch {}
  return r;
}
const putProof = (tk, path, blob) => putObject("payment-proofs", tk, path, blob, "proof.jpg");
async function uploadProof(inp) {
  const f = inp.files && inp.files[0],
    id = inp.dataset.id,
    lab = inp.closest("label");
  if (!f || !user) {
    inp.value = "";
    return;
  }
  if (lab) lab.classList.add("busy");
  try {
    const blob = await proofBlob(f),
      tk = await getToken();
    if (!tk) throw Object.assign(new Error("session"), { session: true });
    const path = `${user.id}/${String(id).replace(/[^A-Za-z0-9_-]/g, "")}-${Date.now().toString(36)}.jpg`;
    const r = await putProof(tk, path, blob);
    if (r.status == 401) throw Object.assign(new Error("session"), { session: true });
    if (!r.ok) throw new Error("up " + r.status + " " + (await r.text()).slice(0, 120));
    const r2 = await sb("/rest/v1/rpc/set_payment_proof", {
      method: "POST",
      body: { p_order_id: id, p_path: path },
    });
    if (r2.status == 401) throw Object.assign(new Error("session"), { session: true });
    if (!r2.ok) throw new Error("rpc " + (await r2.text()).slice(0, 160));
    proofDone[id] = true;
    toast(t("proofok"));
    beep("ok");
    render();
  } catch (err) {
    console.error("[AMARIX] proof", err);
    const m = String((err && err.message) || "");
    if (err && err.session) {
      clearSession();
      returnTo = location.hash;
      toast(t("sesexp"), "er");
      location.hash = "#/login";
    } else
      toast(
        m == "type"
          ? t("proofbad")
          : m == "big"
          ? t("proofbig")
          : /Bucket not found|PGRST202|42883|up 404|set_payment_proof/i.test(m) && !/not_allowed|invalid_path|proof_missing/.test(m)
          ? t("proofsetup")
          : /not_allowed|invalid_path|proof_missing/.test(m)
          ? t("proofdeny")
          : navigator.onLine
          ? t("prooffail") + (m ? " — " + m.replace(/[{}"\\]/g, "").slice(0, 90) : "")
          : t("net"),
        "er"
      );
  } finally {
    inp.value = "";
    if (lab) lab.classList.remove("busy");
  }
}

/* "I have paid": moves the user's own order from pending to review (server function claim_payment) */
async function claimPayment(btn, id) {
  if (btn && btn.disabled) return toast(t("proofneed"), "wn");
  setBusy(btn, true);
  try {
    const r = await sb("/rest/v1/rpc/claim_payment", {
      method: "POST",
      body: { p_order_id: id },
    });
    if (r.status == 401) {
      clearSession();
      returnTo = "#/orders";
      location.hash = "#/login";
      return;
    }
    if (!r.ok) throw new Error(await r.text());
    claimed[id] = true;
    toast(t("claimed"));
    beep("ok");
    render();
  } catch (err) {
    console.error("[AMARIX] claim", err);
    const m = String((err && err.message) || ""),
      A = lang == "ar";
    const why = /proof_required/i.test(m)
      ? t("proofneed")
      : /PGRST202|Could not find the function|42883/i.test(m)
      ? A
        ? "الدالة غير مثبّتة في قاعدة البيانات (شغّل supabase-schema.sql)"
        : "claim_payment is not installed (run supabase-schema.sql)"
      : /not_allowed/i.test(m)
      ? A
        ? "الطلب غير مرتبط بحسابك أو تم إبلاغه مسبقاً"
        : "order is not yours or was already reported"
      : !navigator.onLine
      ? t("net")
      : "";
    toast(t("claimfail") + (why ? " — " + why : ""), "er");
  } finally {
    setBusy(btn, false);
  }
}

/* Order tracking: Ordered → Payment → In progress → Completed */
function tracker(o, st, pay) {
  if (st == "cancelled") return "";
  const steps = [
    ["trk_ordered", "on"],
    ["trk_pay", pay == "paid" ? "on" : pay == "review" ? "wait" : ""],
    ["trk_process", st == "processing" || st == "done" ? "on" : ""],
    ["trk_done", st == "done" ? "on" : ""],
  ];
  return `<div class="trk" aria-label="tracking">${steps .map( ([k, c]) => `<span class="${c}"><i>${c == "on" ? ic("check", 12) : ""}</i>${t( k )}</span>` ) .join("")}</div>`;
}
function ordersHTML(rows) {
  if (!rows.length)
    return `<p class="emp">${ic("box", 40)}<br><b>${t( "noord" )}</b><br><small>${t("noordd")}</small></p>`;
  return (
    pushBox(true) +
    `<h2>${t("ord")} <button class="ib" data-a="reload" aria-label="${t( "retry" )}">${ic("refresh", 16)}</button></h2>` +
    rows
      .map((o) => {
        let items = o.items;
        if (typeof items == "string") {
          try {
            items = JSON.parse(items);
          } catch {
            items = [];
          }
        }
        items = Array.isArray(items) ? items : [];
        const st = ORDER_STATUSES.includes(o.status) ? o.status : "new";
        const pay = PAY_STATUSES.includes(o.payment_status)
          ? o.payment_status
          : "pending";
        const cur0 = o.currency && R[o.currency] ? o.currency : BASE;
        const convertedTotal = Number(o.total) * Number(R[cur][0]) / Number(R[cur0][0]);
        const total = `<bdi dir="ltr">${convertedTotal.toFixed(2)} ${ex(R[cur][1])}</bdi>`;
        const m = o.payment_method ? pmOf(o.payment_method) : null;
        const canClaim = pay == "pending" && st != "cancelled";
        return `<div class="box ord"><div class="ord-h"><div><div class="ord-id" dir="ltr">${ex( o.id )}</div><div class="ord-meta">${fmtDate(o.created_at)}</div> ${ m ? `<div class="ord-meta ord-pm">${payLogo(m, 18)} ${pmName( m )}</div>` : o.payment_method == "wallet" ? `<div class="ord-meta ord-pm">${ic("wallet", 18)} ${lang == "ar" ? "المحفظة" : "Wallet"}</div>` : "" }</div> <div style="text-align:end"><span class="stt ${st}">${t("s_" + st)}</span> ${ st != "cancelled" ? `<div style="margin-top:4px"><span class="stt pay-${pay}">${t( "pay_" + pay )}</span></div>` : "" } <div class="ord-t n">${total}</div></div></div> ${tracker(o, st, pay)} ${ canClaim && o.payment_method == "wallet" ? walletPayBox(o.id) : canClaim ? (() => { const hp = !!(o.payment_proof || proofDone[o.id]); return `<div class="ord-act">${hp ? proofOkCard() : proofPick(o.id) + `<p class="pd lockhint">${ic("upload", 14)} ${t("prooflock")}</p>`}${claimBtn(o.id, hp)}</div>${orderWalletOk(items) ? walletAltBox(o.id) : ""}`; })() : "" } ${ pay == "review" && st != "cancelled" ? `<p class="ord-note">${ic("refresh", 14)} ${t("paidwait")}</p>` : "" } ${ !canClaim && (o.payment_proof || proofDone[o.id]) ? `<p class="ord-note ok">${ic("check", 14)} ${t("proofok")}</p>` : "" } ${apiBlock(o)}<a class="b b2 sm inv-lnk" href="#/invoice/${ex(o.id)}">${ic("card", 14)} ${lang == "ar" ? "الفاتورة" : "Invoice"}</a><details><summary>${t("items")} (${ items.length })</summary><div class="ord-items">${items .map( (i) => `<div class="row"><div style="min-width:0"><b>${ex( i[lang] || i.name )}</b><small>${t("unitp")}: ${ex(i.price)}${ i.link ? " · " + ex(i.link) : "" }</small></div><span class="n">× ${ex(i.q)}</span></div>${rateRow(o, i, st)}` ) .join("")} ${ o.coupon ? `<div class="row"><span>${t("coupon")}</span><b dir="ltr">${ex( o.coupon )}</b></div>` : "" }</div></details></div>`;
      })
      .join("")
  );
}
/* ---------- provider-fulfilled items: delivery (number / SMS code / voucher / note) + automatic send and polling ----------
   The smm-order function writes each line's result into orders.smm: { kind, order, error, provider:{status}, delivery:{number,code,text,...} }.
   Boost lines (kind "smm") are handled by the admin panel as before and are not shown here. */
const orderItemsOf = (o) => {
  let it = o.items;
  if (typeof it == "string") {
    try {
      it = JSON.parse(it);
    } catch {
      it = [];
    }
  }
  return Array.isArray(it) ? it : [];
};
const apiLinesOf = (o) => (Array.isArray(o.smm) ? o.smm.filter((r) => r && r.kind && r.kind != "smm") : []);
const apiPending = (r) => !!r.order && !(r.provider && (r.provider.status == "Completed" || r.provider.status == "Canceled"));
const DLV_LABELS = { number: ["الرقم", "Number"], code: ["الرمز", "Code"], email: ["الإيميل", "Email"], password: ["كلمة المرور", "Password"], pin: ["PIN", "PIN"], serial: ["الرقم التسلسلي", "Serial"], link: ["الرابط", "Link"] };
/* ---- Number delivery card (like 5sim / Grizzly): number + copy, live wait timer, big code + copy ---- */
const NM_STEPS = [["تم الدفع", "Paid"], ["تم تخصيص الرقم", "Number ready"], ["وصول الكود", "Code received"]];
const nmFmtT = (s) => String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
function nmT0(o, r) {
  if (+r.at > 0) return +r.at;
  const k = "amx_nt_" + o.id + "_" + r.order;
  try {
    let v = +localStorage.getItem(k);
    if (!v) localStorage.setItem(k, (v = Date.now()));
    return v;
  } catch {
    return Date.now();
  }
}
const isNumItem = (i) => {
  const p = prod(i.id),
    c = p && cat(p.c);
  return !!p && apiMode(p) && !!c && c.ty == "numbers";
};
function nmSteps(n) {
  return `<div class="nm-st">${NM_STEPS.map((x, i) => `<span class="${i < n ? "on" : i == n ? "cur" : ""}">${i < n ? ic("check", 12) + " " : ""}${sbT(x[0], x[1])}</span>`).join("")}</div>`;
}
function nmCard(o, r) {
  const d = r.delivery || {},
    stt = r.provider && r.provider.status,
    p = prod(r.item_id),
    m = p ? nmMeta(p) : null,
    svc = m ? m.sv : "",
    cty = m ? nmCty(m) : "",
    num = String(d.number || "").replace(/[^\d]/g, ""),
    raw = String(d.code || "").trim(),
    hit = raw.length > 10 ? raw.match(/\b\d{4,8}\b/) : null,
    code = hit ? hit[0] : raw;
  const st = r.error ? "fail" : stt == "Canceled" ? "cancel" : raw ? "got" : "wait";
  const pill = {
    fail: sbT("تعذّر التنفيذ", "Failed"),
    cancel: sbT("أُلغي", "Cancelled"),
    got: sbT("وصل الكود", "Code received"),
    wait: sbT("بانتظار الكود", "Waiting for code"),
  }[st];
  const top = `<div class="nm-top">${svc ? nmBadge(svc, 20) : ""}<div><b>${ex(svc || (p ? p[lang] || p.ar : ""))}</b><small>${m && m.flag ? m.flag + " " : ""}${ex(cty)}</small></div><span class="nm-pill">${pill}</span></div>`;
  if (st == "fail" || st == "cancel")
    return `<div class="nm-card ${st}">${top}<p class="nm-tip">${st == "fail" ? sbT("تعذّر تخصيص رقم لهذا الطلب. لا تقلق، تواصل مع الدعم من زر المساعدة وسنعوّضك أو نعيد المبلغ.", "We could not assign a number for this order. Contact support with the help button and we will fix it or refund you.") : sbT("أُلغي هذا الرقم. تواصل مع الدعم من زر المساعدة للتعويض.", "This number was cancelled. Contact support with the help button.")}</p></div>`;
  const numBox = num
    ? `<div class="nm-box"><div><small>${sbT("رقمك", "Your number")}</small><b class="nm-num" dir="ltr">+${ex(num)}</b></div><button type="button" class="b b2 sm" data-a="copy" data-v="+${ex(num)}">${ic("copy", 14)} ${t("copy")}</button></div>`
    : "";
  const codeBox = raw
    ? `<div class="nm-box got"><div><small>${sbT("كود التفعيل", "Verification code")}</small><b class="nm-code" dir="ltr">${ex(code)}</b></div><button type="button" class="b sm" data-a="copy" data-v="${ex(code)}">${ic("copy", 14)} ${t("copy")}</button></div>${hit ? `<p class="nm-tip" dir="auto">${ex(raw)}</p>` : ""}`
    : `<div class="nm-box wait"><span class="nm-spin" aria-hidden="true"></span><div><b>${sbT("بانتظار وصول الرسالة…", "Waiting for the SMS…")}</b><small>${sbT("منذ", "for")} <bdi dir="ltr" data-t0="${nmT0(o, r)}">00:00</bdi></small></div></div>`;
  const tip = raw
    ? sbT("استخدم الكود الآن. إن لم يعمل تواصل مع الدعم من زر المساعدة.", "Use the code now. If it does not work, contact support with the help button.")
    : sbT("اكتب الرقم في التطبيق أو الموقع واطلب إرسال الكود، وسيظهر هنا تلقائياً دون تحديث الصفحة.", "Enter the number in the app or site and request the code. It appears here automatically, no refresh needed.");
  return `<div class="nm-card ${st}">${top}${nmSteps(raw ? 3 : 2)}${numBox}${codeBox}<p class="nm-tip">${tip}</p></div>`;
}
function apiBlock(o) {
  const L = apiLinesOf(o);
  const A = lang == "ar";
  if (!L.length) {
    /* numbers not assigned yet: say so, instead of showing nothing */
    const its = orderItemsOf(o).filter(isNumItem);
    if (!its.length || o.status == "cancelled") return "";
    const paid = o.payment_status == "paid";
    return `<div class="dlv"><div class="nm-card ${paid ? "wait" : ""}"><div class="nm-box wait">${paid ? '<span class="nm-spin" aria-hidden="true"></span>' : ""}<div><b>${paid ? sbT("جارٍ تجهيز رقمك…", "Preparing your number…") : sbT("رقمك جاهز بعد تأكيد الدفع", "Your number is ready after payment")}</b><small>${paid ? sbT("يظهر هنا خلال ثوانٍ تلقائياً", "It appears here within seconds") : sbT("سيظهر هنا تلقائياً فور تأكيد الدفع، أبقِ هذه الصفحة مفتوحة أو عد إليها", "It appears here automatically as soon as payment is confirmed")}</small></div></div></div></div>`;
  }
  return (
    `<div class="dlv">` +
    L.map((r) => {
      if (r.kind == "smsactivate") return nmCard(o, r);
      const d = r.delivery || {},
        stt = r.provider && r.provider.status,
        p = prod(r.item_id),
        rows = Object.keys(DLV_LABELS)
          .filter((k) => d[k])
          .map((k) => `<div class="dlv-r"><span>${DLV_LABELS[k][A ? 0 : 1]}</span><b class="n" dir="ltr">${ex(d[k])}</b></div>`)
          .join("");
      const msg = r.error
        ? A ? "تعذّر تنفيذ هذا البند — تواصل مع الدعم" : "This item could not be fulfilled — contact support"
        : stt == "Canceled"
        ? A ? "أُلغي هذا البند — تواصل مع الدعم" : "This item was cancelled — contact support"
        : stt == "Completed"
        ? A ? "تم التسليم" : "Delivered"
        : A ? "⏳ قيد التنفيذ" : "⏳ In progress";
      return `<div class="dlv-i"><small>${ex(p ? plain(p[lang] || p.ar || p.en) : r.item_id)}</small>${rows}${d.text ? `<p class="dlv-t">${ex(d.text)}</p>` : ""}<div class="dlv-s">${msg}</div></div>`;
    }).join("") +
    `</div>`
  );
}
async function apiCall(o, action) {
  const r = await sb("/functions/v1/smm-order", { method: "POST", body: { action, order_id: o.id } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !Array.isArray(j.results)) return false;
  const before = JSON.stringify(o.smm);
  o.smm = j.results;
  o.smm_status = j.smm_status;
  return before !== JSON.stringify(o.smm);
}
/* Paid orders made only of provider items are sent by the customer's own session (the function allows it for self-service providers only),
   then polled every few seconds while the orders page is open until the code / delivery arrives. */
const hasCode = (o) => apiLinesOf(o).some((r) => r.delivery && r.delivery.code);
async function apiAuto(rows, seq, n = 0) {
  if (seq !== routeSeq || !/^#\/orders/.test(location.hash) || n > 240 || !user) return;
  let changed = false,
    again = false,
    got = false;
  for (const o of rows) {
    if (o.payment_status != "paid") continue;
    const its = orderItemsOf(o),
      api = its.filter((i) => {
        const p = prod(i.id);
        return p && apiMode(p);
      });
    if (!api.length) continue;
    const had = hasCode(o);
    try {
      if (!o.smm && api.length == its.length) {
        if (await apiCall(o, "send")) changed = true;
      } else if (apiLinesOf(o).some(apiPending)) {
        if (await apiCall(o, "poll")) changed = true;
      }
    } catch {}
    if (!had && hasCode(o)) got = true;
    if (apiLinesOf(o).some(apiPending)) again = true;
  }
  if (changed && seq === routeSeq) {
    $("#m").innerHTML = ordersHTML(rows);
    decorate();
    nmTick();
  }
  if (got) {
    toast(sbT("وصل كود التفعيل", "Your code has arrived"));
    try {
      beep("ok");
      navigator.vibrate && navigator.vibrate([120, 60, 120]);
    } catch {}
  }
  if (again) setTimeout(() => apiAuto(rows, seq, n + 1), 5000);
}
/* wait timers on the number cards tick every second without redrawing the page */
let NM_TK = 0;
function nmTick() {
  clearInterval(NM_TK);
  const go = () => {
    if (!/^#\/orders/.test(location.hash)) return clearInterval(NM_TK);
    document.querySelectorAll("[data-t0]").forEach((el) => {
      el.textContent = nmFmtT(Math.max(0, Math.floor((Date.now() - +el.dataset.t0) / 1000)));
    });
  };
  go();
  NM_TK = setInterval(go, 1000);
}
async function ordersPage(seq) {
  $("#m").innerHTML = loadingBox();
  try {
    const r = await sb(
      `/rest/v1/orders?select=*&user_id=eq.${encodeURIComponent( user.id )}&order=created_at.desc&limit=100`
    );
    if (r.status == 401) {
      clearSession();
      returnTo = "#/orders";
      location.hash = "#/login";
      return;
    }
    if (!r.ok) throw new Error(await r.text());
    const rows = await r.json();
    await loadMyReviews();
    if (seq === routeSeq) {
      $("#m").innerHTML = ordersHTML(rows);
      decorate();
      nmTick();
      apiAuto(rows, seq);
    }
  } catch (err) {
    console.error("[AMARIX] load orders", err);
    if (seq === routeSeq)
      $("#m").innerHTML = `<div class="emp">${t( "loaderr" )}<br><br><button class="b b2" data-a="reload">${t( "retry" )}</button></div>`;
  }
}

/* ---------- Invoices: one per order, created by the server (supabase-invoices.sql). Printable / save as PDF via the browser. ---------- */
async function invoicePage(seq, id) {
  const A = lang == "ar";
  try {
    const r = await sb("/rest/v1/rpc/get_invoice", { method: "POST", body: { p_order_id: String(id).toUpperCase().replace(/[^A-Z0-9-]/g, "") } });
    if (r.status == 401) {
      clearSession();
      returnTo = location.hash;
      location.hash = "#/login";
      return;
    }
    if (!r.ok) throw new Error(await r.text());
    const v = await r.json();
    if (seq !== routeSeq) return;
    const back = `<a class="b b2 block no-print" href="#/orders">${A ? "رجوع إلى طلباتي" : "Back to my orders"}</a>`;
    if (!v) {
      $("#m").innerHTML = `<div class="emp">${A ? "لا توجد فاتورة لهذا الطلب." : "No invoice for this order."}</div>${back}`;
      return;
    }
    const cu = v.currency && R[v.currency] ? R[v.currency][1] : v.currency || "",
      n2 = (x) => (+x || 0).toFixed(2),
      items = (Array.isArray(v.items) ? v.items : []).map((i) => ({ name: i[lang] || i.name || i.ar || i.en || "", q: +i.q || 0, price: +i.price || 0, link: i.link || "" })),
      site = CFG.site || {},
      store = ((site.n1 || "") + (site.n2 || "")) || "AMARIX007",
      st = v.status == "void" ? "void" : v.status == "paid" ? "paid" : "issued",
      stL = { paid: A ? "مدفوعة" : "PAID", issued: A ? "غير مدفوعة" : "UNPAID", void: A ? "ملغاة" : "VOID" }[st],
      m = v.payment_method ? pmOf(v.payment_method) : null,
      pm = m ? pmName(m) : v.payment_method == "wallet" ? (A ? "المحفظة" : "Wallet") : v.payment_method || "—",
      row = (k, val) => `<div class="inv-kv"><span>${k}</span><b dir="auto">${val == null || val === "" ? "—" : val}</b></div>`;
    $("#m").innerHTML = `<div class="inv" id="inv">
<div class="inv-top"><div><div class="inv-brand">${ex(store)}</div><small>${ex(typeof SEO_SITE == "string" ? SEO_SITE.replace(/^https?:\/\//, "") : "")}</small></div>
<div class="inv-ttl"><h1>${A ? "فاتورة" : "INVOICE"}</h1><span class="inv-st ${st}">${stL}</span></div></div>
<div class="inv-meta">${row(A ? "رقم الفاتورة" : "Invoice no.", `<bdi dir="ltr">${ex(v.invoice_no)}</bdi>`)}${row(A ? "رقم الطلب" : "Order no.", `<bdi dir="ltr">${ex(v.order_id)}</bdi>`)}${row(A ? "تاريخ الإصدار" : "Issued", fmtDate(v.issued_at))}${v.paid_at && st == "paid" ? row(A ? "تاريخ الدفع" : "Paid on", fmtDate(v.paid_at)) : ""}${row(A ? "وسيلة الدفع" : "Payment method", ex(pm))}</div>
<div class="inv-bill"><small>${A ? "الفاتورة إلى" : "Billed to"}</small><b>${ex(v.customer_name || "—")}</b><bdi dir="ltr">${ex(v.customer_email || "")}</bdi>${v.customer_uid ? `<bdi dir="ltr">UID: ${ex(v.customer_uid)}</bdi>` : ""}</div>
<div class="tw"><table class="inv-tb"><thead><tr><th>#</th><th>${A ? "البند" : "Item"}</th><th>${A ? "السعر" : "Price"}</th><th>${A ? "الكمية" : "Qty"}</th><th>${A ? "المجموع" : "Total"}</th></tr></thead><tbody>${items.map((i, k) => `<tr><td>${k + 1}</td><td>${ex(i.name)}${i.link ? `<small dir="ltr">${ex(i.link)}</small>` : ""}</td><td dir="ltr">${n2(i.price)}</td><td dir="ltr">${i.q}</td><td dir="ltr">${n2(i.price * i.q)}</td></tr>`).join("")}</tbody></table></div>
<div class="inv-sum">${row(A ? "المجموع الفرعي" : "Subtotal", `<bdi dir="ltr">${n2(v.subtotal)} ${ex(cu)}</bdi>`)}${+v.discount > 0 ? row((A ? "الخصم" : "Discount") + (v.coupon ? ` (${ex(v.coupon)})` : ""), `<bdi dir="ltr">-${n2(v.discount)} ${ex(cu)}</bdi>`) : ""}<div class="inv-kv inv-tot"><span>${A ? "الإجمالي" : "Total"}</span><b dir="ltr">${n2(v.total)} ${ex(cu)}</b></div></div>
<p class="inv-foot">${A ? "شكراً لتعاملكم مع " : "Thank you for shopping with "}${ex(store)}</p></div>
<div class="acts no-print"><button type="button" class="b" data-a="inv-print">${ic("upload", 16)} ${A ? "طباعة / حفظ PDF" : "Print / Save PDF"}</button></div>${back}`;
    document.title = v.invoice_no + " — " + store;
  } catch (err) {
    console.error("[AMARIX] invoice", err);
    if (seq === routeSeq) $("#m").innerHTML = `<div class="emp">${t("loaderr")}<br><br><button class="b b2" data-a="reload">${t("retry")}</button></div>`;
  }
}
/* ---------- 11. AI support chat (calls the `ai-support` Edge Function; the AI key stays on the server) ---------- */
const AI = {
  open: false,
  busy: false,
  msgs: (() => {
    try {
      return JSON.parse(sessionStorage.getItem("amx_ai")) || [];
    } catch {
      return [];
    }
  })(),
};
function aiMount() {
  if ($("#ai-fab")) return;
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div id="sup" class="sup"><div id="sup-menu" class="sup-menu" role="menu"></div> <button id="ai-fab" class="ai-fab" data-a="sup-toggle" aria-expanded="false" aria-haspopup="true" aria-controls="sup-menu"><span class="fi f1">${ic( "hs", 24 )}</span><span class="fi f2">${ic( "x", 22 )}</span><span class="ai-dot"></span></button></div> <section id="ai-panel" class="ai-panel" hidden aria-label="AI support"> <div class="ai-h"><span class="ai-av">${LOGO_SVG}</span><b id="ai-title"></b><button class="ib" data-a="ai-toggle" id="ai-x" type="button">${ic( "x", 16 )}</button></div> <div id="ai-msgs" class="ai-msgs" aria-live="polite"></div> <form id="ai-form" class="ai-f" autocomplete="off"><input id="ai-in" class="inp" maxlength="500"><button class="b" type="submit" aria-label="send">${ic( "send", 16 )}</button></form> </section>`
  );
  aiRender();
}
function aiLabels() {
  aiMount();
  const on = !(CFG.site && CFG.site.ai_on === false);
  if (!on) {
    AI.open = false;
    $("#ai-panel").hidden = true;
  }
  supRender(on);
  $("#ai-fab").setAttribute("aria-label", t("ai_open"));
  $("#ai-title").textContent = t("ai_title");
  $("#ai-in").placeholder = t("ai_ph");
  $("#ai-x").setAttribute("aria-label", t("ai_close"));
  aiRender();
}
/* Support speed-dial: AI assistant + WhatsApp + Telegram (links come from the store's social settings) */
function supItems(aiOn) {
  const A = lang == "ar",
    out = [];
  if (aiOn)
    out.push({
      k: "ai",
      label: A ? "المساعد الذكي" : "AI assistant",
      ico: ic("hs", 22),
    });
  out.push({
    k: "tk",
    label: A ? "تذكرة دعم" : "Support ticket",
    ico: ic("doc", 22),
    href: "#/support",
    int: true,
  });
  [
    ["whatsapp", "wa", A ? "واتساب" : "WhatsApp"],
    ["telegram", "tg", A ? "تيليغرام" : "Telegram"],
  ].forEach(([key, code, label]) => {
    const u = SOC[key] && safeUrl(SOC[key][1]);
    if (u) out.push({ k: code, label, href: u, ico: brandSvg(BR[code].g, 24) });
  });
  return out;
}
function supRender(aiOn) {
  const items = supItems(aiOn),
    box = $("#sup-menu");
  if (!box) return;
  $("#sup").hidden = !items.length;
  box.innerHTML = items
    .map((it, i) => {
      const inner = `<span class="si-l">${ex( it.label )}</span><span class="si-i si-${it.k}">${it.ico}</span>`;
      return it.href
        ? `<a class="si" style="--i:${i};--n:${ items.length }" role="menuitem" href="${ex( it.href )}"${it.int ? "" : ' target="_blank" rel="noopener"'}>${inner}</a>`
        : `<button type="button" class="si" style="--i:${i};--n:${items.length}" role="menuitem" data-a="ai-open">${inner}</button>`;
    })
    .join("");
  $("#sup").dataset.n = items.length;
  $("#sup").dataset.ai = aiOn ? "1" : "";
}
function supClose() {
  const s = $("#sup");
  if (!s || !s.classList.contains("open")) return;
  s.classList.remove("open");
  $("#ai-fab").setAttribute("aria-expanded", "false");
}
function supToggle() {
  const s = $("#sup");
  if (!s) return;
  if (s.dataset.n == "1" && s.dataset.ai) {
    aiToggle();
    return;
  } // only the AI assistant is available
  if (AI.open) {
    aiToggle(false);
    return;
  }
  const o = s.classList.toggle("open");
  $("#ai-fab").setAttribute("aria-expanded", String(o));
}
addEventListener("keydown", (e) => {
  if (e.key == "Escape") {
    supClose();
    if (AI.open) aiToggle(false);
  }
});
function aiRender() {
  const box = $("#ai-msgs");
  if (!box) return;
  box.textContent = "";
  const add = (cls, text, extra) => {
    const d = document.createElement("div");
    d.className = "ai-m " + cls;
    d.textContent = text;
    if (extra) d.appendChild(extra);
    box.appendChild(d);
  };
  add("bot", t("ai_hello"));
  AI.msgs.forEach((m) => {
    let extra = null;
    if (m.err && waNumber()) {
      extra = document.createElement("button");
      extra.className = "b wa sm";
      extra.dataset.a = "ai-wa";
      extra.type = "button";
      extra.textContent = t("ai_wa");
    }
    add(m.role == "user" ? "me" : "bot", m.content, extra);
  });
  if (AI.busy) {
    const d = document.createElement("div");
    d.className = "ai-m bot ai-typing";
    d.innerHTML = "<i></i><i></i><i></i>";
    box.appendChild(d);
  }
  box.scrollTop = box.scrollHeight;
}
function aiToggle(force) {
  AI.open = typeof force == "boolean" ? force : !AI.open;
  if (AI.open) supClose();
  $("#ai-panel").hidden = !AI.open;
  if (AI.open) setTimeout(() => $("#ai-in").focus(), 60);
}
async function aiSend(text) {
  AI.msgs.push({ role: "user", content: text });
  AI.busy = true;
  aiRender();
  try {
    const tk = await getToken();
    const r = await fetch(SB_URL + "/functions/v1/ai-support", {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: "Bearer " + (tk || SB_KEY),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: AI.msgs
          .filter((m) => !m.err)
          .slice(-10)
          .map(({ role, content }) => ({ role, content })),
        lang,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.reply)
      throw new Error(
        [r.status, j.error, j.reason, j.msg].filter(Boolean).join(" / ")
      );
    AI.msgs.push({ role: "assistant", content: String(j.reply) });
  } catch (err) {
    console.error("[AMARIX] ai-support", err);
    AI.msgs.push({ role: "assistant", content: t("ai_err"), err: true });
  }
  AI.busy = false;
  aiRender();
  try {
    sessionStorage.setItem("amx_ai", JSON.stringify(AI.msgs.slice(-30)));
  } catch {}
}
document.addEventListener("submit", (e) => {
  if (e.target.id != "ai-form") return;
  e.preventDefault();
  const inp = $("#ai-in"),
    v = inp.value.trim();
  if (!v || AI.busy) return;
  inp.value = "";
  aiSend(v);
});

/* ---------- 11b. Image preview (lightbox) ---------- */
const LB = { list: [], i: 0 };
function lbDraw() {
  const im = $("#lb-img"),
    c = $("#lb-c");
  if (!im) return;
  im.src = LB.list[LB.i] || "";
  if (c) c.textContent = LB.list.length > 1 ? `${LB.i + 1} / ${LB.list.length}` : "";
  const many = LB.list.length > 1;
  document.querySelectorAll("#lb .lb-n").forEach((x) => (x.hidden = !many));
  $("#lb").classList.remove("z");
}
function lbOpen(list, i = 0) {
  if (!list || !list.length) return;
  LB.list = list;
  LB.i = Math.min(Math.max(0, i), list.length - 1);
  if (!$("#lb"))
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div id="lb" class="lb" role="dialog" aria-modal="true" aria-label="${t("zoom")}"><button type="button" class="lb-x" data-a="lb-x" aria-label="${t("lbx")}">${ic("x", 22)}</button><button type="button" class="lb-n lb-l" data-a="lb-l" aria-label="prev">${ic("chev", 24)}</button><div class="lb-st" data-a="lb-bg"><img id="lb-img" alt="" data-a="lb-img" draggable="false"></div><button type="button" class="lb-n lb-r" data-a="lb-r" aria-label="next">${ic("chev", 24)}</button><div class="lb-c" id="lb-c"></div></div>`
    );
  lbDraw();
  $("#lb").classList.add("on");
  document.documentElement.classList.add("lb-open");
  let x0 = null;
  const st = $("#lb");
  st.ontouchstart = (e) => (x0 = e.touches.length == 1 ? e.touches[0].clientX : null);
  st.ontouchend = (e) => {
    if (x0 == null || st.classList.contains("z")) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 60) lbStep(dx < 0 ? (rtl() ? -1 : 1) : rtl() ? 1 : -1);
  };
}
function lbStep(d) {
  if (LB.list.length < 2) return;
  LB.i = (LB.i + d + LB.list.length) % LB.list.length;
  lbDraw();
}
function lbClose() {
  const el = $("#lb");
  if (el) el.classList.remove("on", "z");
  document.documentElement.classList.remove("lb-open");
}
document.addEventListener("keydown", (e) => {
  const el = $("#lb");
  if (el && el.classList.contains("on")) {
    if (e.key == "Escape") lbClose();
    else if (e.key == "ArrowLeft") lbStep(rtl() ? 1 : -1);
    else if (e.key == "ArrowRight") lbStep(rtl() ? -1 : 1);
    return;
  }
  if ((e.key == "Enter" || e.key == " ") && e.target.dataset && e.target.dataset.a == "zoom") {
    e.preventDefault();
    e.target.click();
  }
});
document.addEventListener("click", (e) => {
  const st = e.target.closest(".lb-st");
  if (st && e.target == st) lbClose(); // tap on the dark area closes
});

/* ---------- 11c. Support tickets (table support_tickets; admins see them in admin.html, Telegram is notified by a database trigger) ---------- */
const TK_STATUS = ["open", "answered", "closed"];
function ticketForm(oid) {
  return `<form class="tk-form" data-order="${ex(oid || "")}" autocomplete="off">${
    oid
      ? `<div class="tk-ord">${t("tk_ord")}: <b dir="ltr">${ex(oid)}</b></div>`
      : `<input class="inp" name="order" dir="ltr" maxlength="40" placeholder="${t("tk_ordph")}">`
  }<input class="inp" name="subject" maxlength="120" required placeholder="${t("tk_subject")}"><textarea class="inp" name="message" rows="4" maxlength="2000" required placeholder="${t("tk_msg")}"></textarea><label class="tk-file"><input type="file" name="file" accept="image/jpeg,image/png,image/webp" hidden data-a="tkfile"><span class="tk-fi">${ic("upload", 16)}</span><span class="tk-ft" data-def="${t("tk_img")}">${t("tk_img")}</span></label><button class="b" type="submit">${ic("send", 16)} ${t("tk_send")}</button></form>`;
}
/* Shown on the order success page, right above the payment-proof upload */
const ticketBox = (oid) =>
  `<details class="box tk"><summary><span class="tk-ic">${ic("hs", 18)}</span><span><b>${t("tk_help")}</b><small>${t("tk_helpd")}</small></span></summary>${ticketForm(oid)}</details>`;
/* Rating of the support reply: "solved" closes the ticket, "not solved" reopens it for the team (server function rate_ticket) */
function ticketRating(r) {
  if (!r.admin_reply) return "";
  if (r.resolved === true) return `<div class="tk-done y">${ic("check", 14)} ${t("tk_dy")}</div>`;
  if (r.resolved === false) return `<div class="tk-done n">${ic("warn", 14)} ${t("tk_dn")}</div>`;
  return `<div class="tk-rate"><small>${t("tk_rq")}</small><div class="tk-rb"><button type="button" data-a="tk-rate" data-id="${ex(r.id)}" data-v="1">${ic("check", 15)} ${t("tk_ry")}</button><button type="button" data-a="tk-rate" data-id="${ex(r.id)}" data-v="0">${ic("x", 15)} ${t("tk_rn")}</button></div></div>`;
}
async function rateTicket(btn) {
  const id = Number(btn.dataset.id),
    v = btn.dataset.v == "1",
    box = btn.closest(".tk-rb");
  if (!Number.isSafeInteger(id) || !user) return;
  box.querySelectorAll("button").forEach((x) => (x.disabled = true));
  try {
    const r = await sb("/rest/v1/rpc/rate_ticket", { method: "POST", body: { p_id: id, p_resolved: v } });
    if (r.status == 401) {
      clearSession();
      returnTo = "#/support";
      location.hash = "#/login";
      return;
    }
    if (!r.ok) throw new Error(await r.text());
    toast(t(v ? "tk_rok" : "tk_rnok"));
    beep("ok");
    if ((location.hash || "").startsWith("#/support")) render();
  } catch (err) {
    console.error("[AMARIX] rate", err);
    const m = String((err && err.message) || "");
    toast(/rate_limited/.test(m) ? t("tk_wait") : /PGRST202|42883|Could not find the function/i.test(m) ? t("tk_setup") : navigator.onLine ? t("tk_fail") : t("net"), "er");
    box.querySelectorAll("button").forEach((x) => (x.disabled = false));
  }
}
function ticketCards(rows) {
  if (!rows.length) return `<p class="emp">${ic("hs", 40)}<br>${t("tk_none")}</p>`;
  return rows
    .map((r) => {
      const st = TK_STATUS.includes(r.status) ? r.status : "open";
      return `<div class="box tkc"><div class="tkc-h"><b>#${ex(r.id)} · ${ex(r.subject)}</b><span class="stt tk-${st}">${t("tk_s_" + st)}</span></div><small class="tkc-m">${fmtDate(r.created_at)}${r.order_id ? ` · ${t("tk_ord")} <bdi dir="ltr">${ex(r.order_id)}</bdi>` : ""}${r.attachment ? ` · ${ic("upload", 12)} ${t("tk_att")}` : ""}</small><p class="tkc-b">${ex(r.message)}</p>${r.admin_reply ? `<div class="tk-r"><small>${ic("check", 12)} ${t("tk_reply")}</small><p>${ex(r.admin_reply)}</p></div>` : ""}${ticketRating(r)}</div>`;
    })
    .join("");
}
async function supportPage(seq, oid) {
  $("#m").innerHTML = `<h2>${t("tkh")}</h2><div class="box tk open">${ticketForm(oid)}</div><h3 class="tk-h3">${t("tk_my")} <button class="ib" data-a="reload" aria-label="${t("retry")}">${ic("refresh", 16)}</button></h3><div id="tk-list">${loadingBox()}</div>`;
  try {
    const r = await sb(`/rest/v1/support_tickets?select=*&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=50`);
    if (r.status == 401) {
      clearSession();
      returnTo = "#/support";
      location.hash = "#/login";
      return;
    }
    if (!r.ok) throw new Error(await r.text());
    const rows = await r.json();
    if (seq === routeSeq && $("#tk-list")) $("#tk-list").innerHTML = ticketCards(rows);
  } catch (err) {
    console.error("[AMARIX] tickets", err);
    const setup = /PGRST205|PGRST106|does not exist|support_tickets/i.test(String(err && err.message));
    if (seq === routeSeq && $("#tk-list")) $("#tk-list").innerHTML = `<div class="emp">${setup ? t("tk_setup") : t("loaderr")}</div>`;
  }
}
async function submitTicket(form) {
  if (!user) {
    returnTo = location.hash;
    toast(t("lreq"), "wn");
    location.hash = "#/login";
    return;
  }
  const f = new FormData(form),
    subject = String(f.get("subject") || "").trim(),
    message = String(f.get("message") || "").trim(),
    order = (form.dataset.order || String(f.get("order") || "")).trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40),
    file = form.elements.file && form.elements.file.files[0],
    btn = form.querySelector('button[type="submit"]');
  if (subject.length < 3 || message.length < 5) return toast(t("tk_short"), "wn");
  setBusy(btn, true);
  try {
    let path = null;
    if (file) {
      const blob = await proofBlob(file),
        tk = await getToken();
      if (!tk) throw Object.assign(new Error("session"), { session: true });
      path = `${user.id}/tk-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.jpg`;
      const up = await putObject("ticket-files", tk, path, blob, "ticket.jpg");
      if (up.status == 401) throw Object.assign(new Error("session"), { session: true });
      if (!up.ok) throw new Error("up " + up.status + " " + (await up.text()).slice(0, 120));
    }
    const r = await sb("/rest/v1/support_tickets", {
      method: "POST",
      prefer: "return=minimal",
      body: { user_id: user.id, customer_name: nameOf() || user.email, customer_email: user.email, order_id: order || null, subject, message, attachment: path, lang },
    });
    if (r.status == 401) throw Object.assign(new Error("session"), { session: true });
    if (!r.ok) throw new Error(await r.text());
    toast(t("tk_ok"));
    beep("ok");
    form.reset();
    const lab = form.querySelector(".tk-file"),
      tx = lab && lab.querySelector(".tk-ft");
    if (tx) tx.textContent = tx.dataset.def;
    if (lab) lab.classList.remove("has");
    const dt = form.closest("details");
    if (dt) dt.removeAttribute("open");
    if ((location.hash || "").startsWith("#/support")) render();
  } catch (err) {
    console.error("[AMARIX] ticket", err);
    const m = String((err && err.message) || "");
    if (err && err.session) {
      clearSession();
      returnTo = location.hash;
      toast(t("sesexp"), "er");
      location.hash = "#/login";
    } else
      toast(
        m == "type"
          ? t("proofbad")
          : m == "big"
          ? t("proofbig")
          : /rate_limited/.test(m)
          ? t("tk_wait")
          : /PGRST205|42P01|does not exist|Bucket not found|up 404/i.test(m)
          ? t("tk_setup")
          : navigator.onLine
          ? t("tk_fail") + (m ? " — " + m.replace(/[{}"\\]/g, "").slice(0, 90) : "")
          : t("net"),
        "er"
      );
  } finally {
    setBusy(btn, false);
  }
}
document.addEventListener("submit", (e) => {
  if (!e.target.classList || !e.target.classList.contains("tk-form")) return;
  e.preventDefault();
  submitTicket(e.target);
});

/* ---------- 12. Actions ---------- */
document.addEventListener("click", async (e) => {
  if (!e.target.closest("#sup") || e.target.closest('#sup a[href^="#"]')) supClose();
  if (e.target.closest("#dr a[href]")) drToggle(false);
  const b = e.target.closest("[data-a]");
  if (!b) return;
  const a = b.dataset.a,
    id = b.dataset.id;
  if (a == "add") {
    addToCart(id, +b.dataset.n || 1);
    toast(t("added"));
  } else if (a == "ntab") {
    NS.tab = b.dataset.t == "free" ? "free" : "paid";
    NS.fc = -1;
    render();
  } else if (a == "nfree") {
    NS.fc = +b.dataset.i;
    render();
    scrollTo(0, 0);
  } else if (a == "npick") {
    const fs = fstate(b.dataset.c);
    fs.sel[+b.dataset.g] = [+b.dataset.o];
    if (+b.dataset.g == 0) delete fs.sel[1];
    render();
    scrollTo(0, 0);
  } else if (a == "nstep") {
    const fs = fstate(b.dataset.c),
      s0 = fs.sel[0];
    fs.sel = +b.dataset.s == 0 ? {} : s0 ? { 0: s0 } : {};
    render();
    scrollTo(0, 0);
  } else if (a == "buy") {
    addToCart(id, +b.dataset.n || 1);
    qbOpen();
  } else if (a == "qb-x") {
    qbClose();
  } else if (a == "qb-cart") {
    qbClose();
    location.hash = "#/cart";
  } else if (a == "fav") {
    fav = fav.includes(id) ? fav.filter((x) => x != id) : [...fav, id];
    save();
    render();
  } else if (a == "q") {
    const x = cart.find((c) => c.id == id);
    if (!x) return;
    const pq = prod(id),
      nq = x.q + (+b.dataset.d || 0),
      lo = pq && qLimited(pq) ? qMin(pq) : 1,
      hi = pq && qLimited(pq) ? qMax(pq) : QCAP;
    if (nq < lo) cart = cart.filter((c) => c.id != id);
    else x.q = Math.min(hi, nq);
    save();
    render();
  } else if (a == "rm") {
    cart = cart.filter((c) => c.id != id);
    save();
    render();
  } else if (a == "coupon") {
    const code = ($("#cpn").value || "").trim().toUpperCase();
    checkCoupon(code).then((ok) => {
      if (ok) {
        coupon = code;
        save();
        render();
        toast(t("cpnok"));
      } else toast(t("cpnbad"), "er");
    });
  } else if (a == "cpnrm") {
    coupon = "";
    save();
    render();
  } else if (a == "pay") {
    payMethod = id;
    save();
    render();
  } else if (a.startsWith("wl-")) walletAction(b, a, id);
  else if (a == "co") placeOrder(b, false);
  else if (a == "wa") placeOrder(b, true);
  else if (a == "ff") toggleFilter(b);
  else if (a == "ffclr") clearFilters(b.dataset.c);
  else if (a == "bq") {
    bq = +b.dataset.n || 1;
    render();
  } else if (a == "bqs") {
    const pq = prod(bqId);
    if (pq) {
      bq = qClamp(pq, bq + qStep(pq, bq, +b.dataset.d || 0));
      render();
    }
  } else if (a == "zoom") {
    const list = [...document.querySelectorAll(".gallery .thumbs img")].map((x) => x.src),
      main = $("#main-img");
    if (main) lbOpen(list.length ? list : [main.src], Math.max(0, list.indexOf(main.src)));
  } else if (a == "lb-x") lbClose();
  else if (a == "lb-l") lbStep(rtl() ? 1 : -1);
  else if (a == "lb-r") lbStep(rtl() ? -1 : 1);
  else if (a == "tk-rate") rateTicket(b);
  else if (a == "lb-img") $("#lb").classList.toggle("z"); else if (a == "clrq") {
    q = "";
    $("#q").value = "";
    render();
  } else if (a == "claim") claimPayment(b, id);
  else if (a == "rate") rateItem(b);
  else if (a == "wa-contact") openWhatsApp(`${t("hi")}\n${t("ordno")}: ${id}`);
  else if (a == "aff-share") {
    const link = partnerLink();
    if (link && navigator.share) navigator.share({ title: "AMARIX007", text: partnerMsg(), url: link }).catch(() => {});
  } else if (a == "aff-refresh") loadPartner(true);
  else if (a == "aff-retry") {
    refErr = false;
    render();
    syncProfile();
  } else if (a == "skip") {
    const m = $("#m");
    if (m) {
      m.focus();
      m.scrollIntoView({ block: "start" });
    }
  } else if (a == "inv-print") {
    window.print();
  } else if (a == "copy") {
    const ok = await copyText(b.dataset.v);
    if (ok) {
      toast(t("copied"));
      beep("ok");
      if (!b.dataset.h) b.dataset.h = b.innerHTML;
      b.classList.add("done");
      b.innerHTML = `${ic("check", 14)}<span>${t("copied2")}</span>`;
      clearTimeout(b._ct);
      b._ct = setTimeout(() => {
        b.classList.remove("done");
        if (b.dataset.h) b.innerHTML = b.dataset.h;
      }, 1600);
    } else toast(b.dataset.v, "wn");
  } else if (a == "reload") render();
  else if (a == "thumb") {
    $("#main-img").src = b.src;
    document
      .querySelectorAll(".thumbs img")
      .forEach((x) => x.classList.remove("on"));
    b.classList.add("on");
  } else if (a == "pw") {
    const i = $("#pw-input");
    i.type = i.type == "password" ? "text" : "password";
  } else if (a == "menu") {
    drToggle(true);
  } else if (a == "menu-x") {
    drToggle(false);
  } else if (a == "theme") {
    th = th == "dark" ? "light" : "dark";
    save();
    head();
  } else if (a == "lang") {
    lang = lang == "ar" ? "en" : "ar";
    save();
    head();
    render();
  } else if (a == "snd") {
    sndOn = !sndOn;
    save();
    head();
  } else if (a == "music") {
    window.AMXMusic && window.AMXMusic.toggle();
  } else if (a == "ban-prev") bannerCtl && bannerCtl.step(-1);
  else if (a == "ban-next") bannerCtl && bannerCtl.step(1);
  else if (a == "ban-go") bannerCtl && bannerCtl.to(+b.dataset.i);
  else if (a == "sup-toggle") supToggle();
  else if (a == "ai-toggle") aiToggle();
  else if (a == "ai-open") {
    e.preventDefault();
    supClose();
    aiToggle(true);
  } else if (a == "ai-wa") openWhatsApp(t("hi"));
  else if (a == "google") {
    e.preventDefault();
    b.disabled = true;
    location.href =
      SB_URL + "/auth/v1/authorize?provider=google&redirect_to=" + siteBack();
  } else if (a == "tg-login") {
    e.preventDefault();
    tgLogin(b);
  } else if (a == "toggle-mode") {
    e.preventDefault();
    authMode = authMode == "login" ? "signup" : "login";
    render();
  } else if (a == "auth-forgot") {
    e.preventDefault();
    authMode = "forgot";
    render();
  } else if (a == "auth-login") {
    e.preventDefault();
    authMode = "login";
    render();
  } else if (a == "hv-click") {
    if (e.isTrusted) humanRun(900);
  } else if (a == "resend") resendMail(b);
  else if (a == "push-on") pushEnable(b);
  else if (a == "push-re") location.reload();
  else if (a == "out") {
    const tk = ls.get("amx_token");
    pushOff(tk);
    clearSession();
    render();
    if (tk)
      fetch(SB_URL + "/auth/v1/logout", {
        method: "POST",
        headers: { apikey: SB_KEY, Authorization: "Bearer " + tk },
      }).catch(() => {});
    returnTo = "";
    location.hash = "#/";
  }
});
document.addEventListener("change", (e) => {
  const da = e.target.dataset.a;
  if (da == "sort") {
    fstate(e.target.dataset.c).sort = e.target.value;
    render();
    return;
  }
  if (da == "cfx") {
    fstate(e.target.dataset.c)[e.target.dataset.k] = e.target.value;
    render();
    return;
  }
  if (da == "wproof") {
    uploadWalletProof(e.target);
    return;
  }
  if (da == "proof") {
    uploadProof(e.target);
    return;
  }
  if (da == "tkfile") {
    const f = e.target.files && e.target.files[0],
      lab = e.target.closest("label"),
      tx = lab && lab.querySelector(".tk-ft");
    if (tx) tx.textContent = f ? f.name : tx.dataset.def;
    if (lab) lab.classList.toggle("has", !!f);
    return;
  }
  if (da == "bqin") {
    const pq = prod(bqId);
    if (pq) {
      bq = qClamp(pq, e.target.value);
      render();
    }
    return;
  }
  if (da == "cq") {
    const pq = prod(e.target.dataset.id),
      x = cart.find((c) => c.id == e.target.dataset.id);
    if (pq && x) {
      x.q = qClamp(pq, e.target.value);
      save();
      render();
    }
    return;
  }
  if (e.target.dataset.a == "cur") {
    cur = e.target.value;
    save();
    render();
  }
});
/* Quantity fields: select the number on focus so typing replaces it; Enter confirms */
document.addEventListener("focusin", (e) => {
  const el = e.target;
  if (el && el.matches && el.matches("input.qin")) setTimeout(() => el.select && el.select(), 0);
});
document.addEventListener("keydown", (e) => {
  if (e.key == "Enter" && e.target.matches && e.target.matches("input.qin")) {
    e.preventDefault();
    e.target.blur();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key == "Enter" && e.target.id == "cpn") {
    e.preventDefault();
    document.querySelector("[data-a=coupon]").click();
  }
  if (e.key == "Escape" && AI.open) aiToggle(false);
});
document.addEventListener("input", (e) => {
  const el = e.target;
  if (el.dataset.a == "bqin") {
    bqLive(el.value);
    return;
  }
  if (el.dataset.a == "lk") {
    el.removeAttribute("aria-invalid");
    const x = cart.find((c) => c.id == el.dataset.id);
    if (x) {
      x.l = el.value;
      save();
    }
    return;
  }
  if (el.id == "pw-input") {
    // password strength meter
    const v = el.value,
      fill = $("#pw-fill"),
      txt = $("#pw-text");
    if (!fill) return;
    let s = 0;
    if (v.length >= 8) s++;
    if (/[A-Z]/.test(v)) s++;
    if (/[0-9]/.test(v)) s++;
    if (/[^A-Za-z0-9]/.test(v)) s++;
    const lv = [
      ["25%", "#ef4444", "weak"],
      ["25%", "#ef4444", "weak"],
      ["50%", "#FBBF24", "mid"],
      ["75%", "#3b82f6", "good"],
      ["100%", "#22c55e", "strong"],
    ][s];
    fill.style.width = lv[0];
    fill.style.background = lv[1];
    txt.textContent = t(lv[2]);
    txt.style.color = lv[1];
  }
});

/* ---------- 13. Auth: login, signup (+email confirmation), password recovery, human check ---------- */
/* Human check: a branded verification box (client-side deterrent; enable CAPTCHA in Supabase for real protection) */
let hvTimer;
/* Cloudflare Turnstile (real CAPTCHA). Put the SITE key here AND enable Captcha protection in Supabase > Auth > Attack Protection with the matching secret. Left empty, the built-in client-side check is used. */
const TURNSTILE_SITE_KEY = "0x4AAAAAAFkSn0TWqJH_GMRW";
let tsToken = "",
  tsId = null;
function tsReset() {
  try {
    if (window.turnstile && tsId != null) window.turnstile.reset(tsId);
  } catch {}
}
function tsInit() {
  const box = $("#hv");
  let w = $("#ts-w");
  if (!w) {
    w = document.createElement("div");
    w.id = "ts-w";
    w.style.cssText = "display:flex;justify-content:center;margin:12px 0";
    if (box) {
      box.style.display = "none";
      box.after(w);
    } else {
      const a = $(".au.done .acts");
      if (!a) return;
      a.before(w);
    }
  }
  tsToken = "";
  const go = () => {
    try {
      if (tsId != null) window.turnstile.remove(tsId);
    } catch {}
    tsId = window.turnstile.render(w, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: "auto",
      callback: (k) => (tsToken = k),
      "expired-callback": () => (tsToken = ""),
      "error-callback": () => (tsToken = ""),
    });
  };
  if (window.turnstile) go();
  else {
    const sc = document.createElement("script");
    sc.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    sc.async = true;
    sc.onload = go;
    document.head.appendChild(sc);
  }
}
const humanBox =
  () => `<div class="hv" id="hv" data-s="verifying" role="group" aria-live="polite"> <div class="hv-l"><span class="hv-ic" id="hv-ic"></span><span class="hv-t" id="hv-t"></span></div> <div class="hv-r"><span class="hv-logo">${LOGO_SVG}</span><span class="hv-b"><b>AMARIX007</b><small>${t( "hv_sec" )} · <a href="#" data-a="ai-open">${t("hv_help")}</a></small></span></div> <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"></div>`;
function setHv(s) {
  const box = $("#hv");
  if (!box) return;
  box.dataset.s = s;
  const i = $("#hv-ic"),
    x = $("#hv-t");
  if (s == "verifying") {
    i.innerHTML = '<span class="spin lg"></span>';
    x.textContent = t("hv_ing");
  } else if (s == "ok") {
    i.innerHTML = ic("check", 22);
    x.textContent = t("hv_ok");
  } else {
    i.innerHTML =
      '<button type="button" class="hv-cb" data-a="hv-click" aria-label="' +
      t("hv_human") +
      '"></button>';
    x.textContent = t("hv_human");
  }
}
function humanRun(ms) {
  clearTimeout(hvTimer);
  setHv("verifying");
  hvTimer = setTimeout(() => setHv("ok"), ms);
}
function humanStart() {
  if (TURNSTILE_SITE_KEY) {
    tsInit();
    return;
  }
  if (!$("#hv")) return;
  if (navigator.webdriver) {
    setHv("manual");
    return;
  } // automation: needs a real click
  humanRun(1300 + Math.random() * 700);
}
const humanOk = (form) => {
  const box = $("#hv");
  const clean = !(form.elements.website && form.elements.website.value);
  if (TURNSTILE_SITE_KEY) return !!box && !!tsToken && clean;
  return !!box && box.dataset.s == "ok" && clean;
};

function authPage() {
  let m = authMode;
  if (m == "reset" && !recovery) m = authMode = "forgot";
  const head2 = (txt) =>
    `<h2 style="justify-content:center;margin-top:0">${txt}</h2>`;
  const eye = `<button type="button" data-a="pw" aria-label="show">${ic( "eye", 18 )}</button>`;
  const link = (a, txt) =>
    `<a href="#" data-a="${a}" style="display:block;text-align:center;margin-top:10px;font-size:12px">${txt}</a>`;
  if (m == "check") {
    const rec = checkKind == "recover";
    return `<div class="box au done"><div class="okc">${ic( "mail", 34 )}</div><h1>${t(rec ? "rcvt" : "chkt")}</h1><p class="pd">${t( rec ? "rcvd" : "chkd" )}</p> <div class="oid" dir="ltr">${ex(pendingEmail)}</div><p class="pd">${t( rec ? "rcvh" : "chkh" )}</p> <div class="acts"><button class="b" data-a="resend">${t( "resend" )}</button><a href="#" class="b b2" data-a="auth-login">${t( "backlogin" )}</a></div></div>`;
  }
  if (m == "forgot")
    return `<form class="box au" id="af" novalidate>${head2( t("forgot") )}<p class="pd" style="margin-bottom:12px;text-align:center">${t( "forgothint" )}</p> <label class="fld"><span>${t( "em" )}</span><input class="inp" name="e" type="email" dir="ltr" autocomplete="email" required></label> ${humanBox()}<p class="err" id="er" role="alert"></p> <button class="b block" type="submit">${t("forgotsend")}</button>${link( "auth-login", t("backlogin") )}</form>`;
  if (m == "reset")
    return `<form class="box au" id="af" novalidate>${head2(t("newpw"))} <label class="fld"><span>${t( "newpw" )}</span><div class="pw"><input class="inp" name="p" type="password" id="pw-input" autocomplete="new-password" required>${eye}</div> <div class="strength-bar"><div id="pw-fill"></div></div><small id="pw-text" style="font-size:11px"></small></label> <label class="fld"><span>${t( "confpw" )}</span><input class="inp" name="p2" type="password" autocomplete="new-password" required></label> <p class="err" id="er" role="alert"></p><button class="b block" type="submit">${t( "resetbtn" )}</button></form>`;
  const up = m == "signup";
  return `<form class="box au" id="af" novalidate>${head2( up ? t("reg") : t("login") )} ${ up ? `<label class="fld"><span>${t( "nl" )}</span><input class="inp" name="n" autocomplete="name" required></label>` : "" } <label class="fld"><span>${t( "em" )}</span><input class="inp" name="e" type="email" dir="ltr" autocomplete="email" required></label> <label class="fld"><span>${t( "pw" )}</span><div class="pw"><input class="inp" name="p" type="password" id="pw-input" autocomplete="${ up ? "new-password" : "current-password" }" required>${eye}</div> ${ up ? `<div class="strength-bar"><div id="pw-fill"></div></div><small id="pw-text" style="font-size:11px"></small>` : `<a href="#" class="forgot" data-a="auth-forgot">${t("forgot")}</a>` }</label> ${humanBox()}<p class="err" id="er" role="alert"></p> <button class="b block" type="submit">${ up ? t("reg") : t("login") }</button>${socialBtns()}${link( "toggle-mode", up ? t("has") : t("no") )}</form>`;
}

/* Official multicolour Google "G" (Google branding guidelines) */
const GICON =
  '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
/* Telegram plane (white on the Telegram-blue button) */
const TGICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/></svg>';
/* Social sign-in buttons under the e-mail form: Google (only when the provider is enabled in Supabase) + Telegram (always shown) */
const socialBtns = () =>
  `<div class="or"><span>${t( "gor" )}</span></div>` +
  (googleOn
    ? `<button type="button" class="gbtn" data-a="google">${GICON}<span>${t( "gbtn" )}</span></button>`
    : "") +
  `<button type="button" class="gbtn tgbtn" data-a="tg-login">${TGICON}<span>${t( "tbtn" )}</span></button>`;

const authMsg = (m) => {
  const l = String(m || "").toLowerCase();
  if (l.includes("invalid login")) return t("badlogin");
  if (l.includes("not confirmed")) return t("unconf");
  if (l.includes("already")) return t("exists");
  if (l.includes("at least") || l.includes("weak")) return t("shortpw");
  if (
    l.includes("rate limit") ||
    l.includes("too many") ||
    l.includes("seconds")
  )
    return t("wait30");
  if (
    l.includes("not authorized") ||
    l.includes("sending") ||
    l.includes("smtp")
  )
    return t("mailfail");
  return m || t("net");
};
const siteBack = () => encodeURIComponent(location.origin + location.pathname); // must be listed in Supabase > Auth > URL Configuration > Redirect URLs
const authPost = (path, body) => {
  const b = TURNSTILE_SITE_KEY && tsToken ? { ...body, gotrue_meta_security: { captcha_token: tsToken } } : body;
  tsToken = ""; // a CAPTCHA token works once
  return fetch(SB_URL + path, {
    method: "POST",
    headers: { apikey: SB_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(b),
  }).finally(tsReset);
};
async function authFail(r) {
  const j = await r.json().catch(() => ({}));
  throw new Error(j.msg || j.error_description || j.message || "");
}

/* Partner (affiliate) links: remember ?ref=CODE (query string or hash) and count the click once per browser */
(function () {
  try {
    const m = (location.search + location.hash).match(
      /[?&]ref=([A-Za-z0-9]{6,12})/
    );
    if (!m) return;
    const c = m[1].toUpperCase();
    localStorage.setItem("ax_ref", c);
    if (!localStorage.getItem("ax_ref_clk_" + c)) {
      localStorage.setItem("ax_ref_clk_" + c, "1");
      fetch(SB_URL + "/rest/v1/rpc/track_ref_click", {
        method: "POST",
        headers: { apikey: SB_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p_code: c }),
      }).catch(() => {});
    }
  } catch {}
})();
let refInfo = null, // { code, status, clicks, signups, sales, total_commission, loaded } for the account + partner pages
  refErr = false; // the profile could not be read: the partner page offers a retry instead of loading forever

/* Best effort: read (or create) the user's row in `profiles` so the account page can show their name */
async function syncProfile(again) {
  if (!user) return;
  try {
    const r = await sb(
      `/rest/v1/profiles?id=eq.${encodeURIComponent( user.id )}&select=full_name,ref_code,uid,created_at`
    );
    if (!r.ok) throw new Error("profile " + r.status);
    const row = (await r.json())[0];
    if (row) {
      profileName = row.full_name || "";
      profileUid = row.uid || "";
      profileSince = row.created_at || "";
      refInfo = {
        code: row.ref_code || "",
        status: "none",
        rate: null,
        clicks: 0,
        signups: 0,
        sales: 0,
        total_commission: 0,
        coupon: null,
        loaded: false, // true only once the affiliates row was really read: never show "apply" to an approved partner because of a failed request
      };
      const ar = await sb(
        `/rest/v1/affiliates?user_id=eq.${encodeURIComponent( user.id )}&select=status,rate,clicks,signups,sales,total_commission,coupon`
      );
      if (!ar.ok) throw new Error("affiliates " + ar.status);
      Object.assign(refInfo, (await ar.json())[0] || {});
      refInfo.loaded = true;
      refErr = false;
    } else {
      const full_name = nameOf();
      await sb("/rest/v1/profiles", {
        method: "POST",
        prefer: "resolution=ignore-duplicates,return=minimal",
        body: { id: user.id, email: user.email, full_name },
      });
      /* read it back once, so the partner page doesn't wait forever for a row that now exists */
      if (!again) return syncProfile(true);
      throw new Error("no profile");
    }
  } catch {
    refErr = true;
  }
  if (/^#\/(account|partner)/.test(location.hash)) render();
}

document.addEventListener("submit", async (e) => {
  if (e.target.id != "af") return;
  e.preventDefault();
  const form = e.target,
    f = new FormData(form),
    er = $("#er"),
    btn = form.querySelector("[type=submit]");
  er.textContent = "";
  const email = String(f.get("e") || "").trim(),
    pw = String(f.get("p") || ""),
    name = String(f.get("n") || "").trim();
  try {
    /* --- set a new password (arrived from the recovery e-mail) --- */
    if (authMode == "reset") {
      if (pw.length < 6) {
        er.textContent = t("shortpw");
        return;
      }
      if (pw !== String(f.get("p2") || "")) {
        er.textContent = t("pwmis");
        return;
      }
      setBusy(btn, true);
      const r = await fetch(SB_URL + "/auth/v1/user", {
        method: "PUT",
        headers: {
          apikey: SB_KEY,
          Authorization: "Bearer " + recovery.access_token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: pw }),
      });
      if (!r.ok) await authFail(r);
      const u = await r.json();
      storeSession({
        access_token: recovery.access_token,
        refresh_token: recovery.refresh_token,
        user: u,
      });
      recovery = null;
      authMode = "login";
      toast(t("resetok"));
      beep("ok");
      syncProfile();
      location.hash = "#/account";
      if (location.hash == "#/account") render();
      return;
    }
    /* --- everything below needs the human check --- */
    if (!email || (authMode != "forgot" && !pw)) {
      er.textContent = t(authMode == "forgot" ? "fillm" : "fill");
      return;
    }
    if (!humanOk(form)) {
      er.textContent = t("hv_wait");
      return;
    }
    setBusy(btn, true);

    /* --- forgot password: real Supabase recovery e-mail --- */
    if (authMode == "forgot") {
      const r = await authPost("/auth/v1/recover?redirect_to=" + siteBack(), {
        email,
      });
      if (!r.ok) await authFail(r);
      pendingEmail = email;
      checkKind = "recover";
      authMode = "check";
      resendAt = Date.now();
      beep("ok");
      render();
      return;
    }
    /* --- login / signup --- */
    const signup = authMode == "signup";
    const r = signup
      ? await authPost("/auth/v1/signup?redirect_to=" + siteBack(), {
          email,
          password: pw,
          data: {
            full_name: name,
            name,
            ref: (() => {
              try {
                return localStorage.getItem("ax_ref") || "";
              } catch {
                return "";
              }
            })(),
          },
        })
      : await authPost("/auth/v1/token?grant_type=password", {
          email,
          password: pw,
        });
    if (!r.ok) await authFail(r);
    const j = await r.json();
    const ids = j.identities || (j.user && j.user.identities);
    if (signup && !j.access_token && Array.isArray(ids) && !ids.length)
      throw new Error("already registered"); // Supabase hides an existing e-mail behind an empty identities list
    if (j.access_token) {
      // signed in (login, or signup with auto-confirm)
      storeSession(j);
      toast(t("loggedin"));
      beep("ok");
      syncProfile();
      pushSync();
      const to = returnTo && !/login/.test(returnTo) ? returnTo : "#/";
      returnTo = "";
      location.hash = to;
      if (location.hash == to) render();
    } else {
      // signup needs e-mail confirmation: show the "check your inbox" page
      pendingEmail = email;
      checkKind = "signup";
      authMode = "check";
      resendAt = Date.now();
      beep("ok");
      render();
    }
  } catch (err) {
    er.textContent = authMsg(err.message);
    humanStart();
  } finally {
    setBusy(btn, false);
  }
});

async function resendMail(btn) {
  if (Date.now() - resendAt < 30000) return toast(t("wait30"), "wn");
  if (TURNSTILE_SITE_KEY && !tsToken) return toast(t("hv_wait"), "wn");
  setBusy(btn, true);
  try {
    const r =
      checkKind == "recover"
        ? await authPost("/auth/v1/recover?redirect_to=" + siteBack(), {
            email: pendingEmail,
          })
        : await authPost("/auth/v1/resend?redirect_to=" + siteBack(), {
            type: "signup",
            email: pendingEmail,
          });
    if (!r.ok) await authFail(r);
    resendAt = Date.now();
    toast(t("resent"));
    beep("ok");
  } catch (err) {
    toast(authMsg(err.message), "er");
  } finally {
    setBusy(btn, false);
  }
}

/* A Google sign-up can't carry the affiliate code in the request (the e-mail form does), so attach it right after the first sign-in */
function attachRef(tk, u) {
  try {
    const c = localStorage.getItem("ax_ref");
    if (
      !c ||
      (u.user_metadata || {}).ref ||
      Date.now() - new Date(u.created_at) > 120000
    )
      return;
    fetch(SB_URL + "/auth/v1/user", {
      method: "PUT",
      headers: {
        apikey: SB_KEY,
        Authorization: "Bearer " + tk,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: { ref: c } }),
    }).catch(() => {});
  } catch {}
}

/* ---------- Telegram sign-in ----------
   The official Telegram Login popup returns a signed payload; the Edge Function `telegram-auth` checks the signature with the bot token
   and answers with a one-time token that Supabase turns into a normal session (/auth/v1/verify).
   Needs: the function deployed (supabase functions deploy telegram-auth --no-verify-jwt), the secret TELEGRAM_BOT_TOKEN,
   and the domain registered in @BotFather (/setdomain -> amarix007.store). */
const TG_BOT_ID = ""; // optional: the digits before ":" in the bot token. When empty, it is read from the function (GET).
const TG_FN = SB_URL + "/functions/v1/telegram-auth";
let tgBotId = TG_BOT_ID,
  tgScript = null;
function tgPrep() {
  if (!tgScript)
    tgScript = new Promise((res) => {
      const sc = document.createElement("script");
      sc.src = "https://telegram.org/js/telegram-widget.js?22";
      sc.async = true;
      sc.onload = () => res(true);
      sc.onerror = () => {
        tgScript = null;
        res(false);
      };
      document.head.appendChild(sc);
    });
  if (!tgBotId)
    fetch(TG_FN, { headers: { apikey: SB_KEY } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && /^\d{5,16}$/.test(String(j.bot_id || ""))) tgBotId = String(j.bot_id);
      })
      .catch(() => {});
  return tgScript;
}
async function tgLogin(btn) {
  if (!btn || btn.disabled) return;
  if (!tgBotId || !(window.Telegram && Telegram.Login)) {
    /* not ready yet: prepare it, and ask for a second tap (a popup opened after a wait is blocked by browsers) */
    tgPrep();
    toast(t("tretry"), "wn");
    return;
  }
  setBusy(btn, true);
  try {
    const u = await new Promise((res) =>
      Telegram.Login.auth({ bot_id: tgBotId, lang: lang == "ar" ? "ar" : "en" }, res)
    );
    if (!u) return; // the person closed the popup
    const r = await fetch(TG_FN, {
      method: "POST",
      headers: { apikey: SB_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(u),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.token_hash) throw new Error(j.error || "tg_" + r.status);
    const v = await fetch(SB_URL + "/auth/v1/verify", {
      method: "POST",
      headers: { apikey: SB_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ type: j.type || "magiclink", token_hash: j.token_hash }),
    });
    if (!v.ok) await authFail(v);
    const sess = await v.json();
    if (!sess.access_token) throw new Error("tg_session");
    storeSession(sess);
    attachRef(sess.access_token, sess.user || {});
    toast(t("loggedin"));
    beep("ok");
    syncProfile();
    pushSync();
    const to = returnTo && !/login/.test(returnTo) ? returnTo : "#/";
    returnTo = "";
    location.hash = to;
    if (location.hash == to) render();
  } catch (err) {
    toast(t(/not_configured|tg_503/.test(err.message) ? "tcfg" : "terr"), "er");
  } finally {
    setBusy(btn, false);
  }
}

/* Show the Google button only when the provider is enabled in Supabase (otherwise the button would lead to an error page) */
async function checkGoogle() {
  try {
    const r = await fetch(SB_URL + "/auth/v1/settings", {
      headers: { apikey: SB_KEY },
    });
    const on = !!((await r.json()).external || {}).google;
    ls.set("amx_gg", on ? "1" : "0");
    if (on == googleOn) return;
    googleOn = on;
    const f = $("#af"); // repaint the login page only if the person has not typed anything yet
    if (
      f &&
      ![...f.querySelectorAll("input")].some(
        (i) => i.type != "hidden" && i.value
      )
    )
      render();
  } catch {}
}
addEventListener("pageshow", (e) => {
  if (e.persisted) render();
}); // back from Google: re-enable the button

/* Links in e-mails come back as #access_token=…&type=recovery|signup (or #error=…). Handle them, then clean the URL. */
async function handleAuthRedirect() {
  const h = location.hash || "";
  if (h.startsWith("#/") || !/(access_token|error)=/.test(h)) return;
  const p = new URLSearchParams(h.slice(1));
  history.replaceState(null, "", location.pathname + location.search + "#/");
  if (p.get("error")) {
    authMode = "login";
    history.replaceState(
      null,
      "",
      location.pathname + location.search + "#/login"
    );
    const ec = p.get("error_code") || "",
      oauth = p.get("error") == "access_denied" || (ec && !/otp/.test(ec));
    setTimeout(() => toast(t(oauth ? "gerr" : "resetbad"), "er"), 400);
    return;
  }
  const access_token = p.get("access_token"),
    refresh_token = p.get("refresh_token");
  if (p.get("type") == "recovery") {
    recovery = { access_token, refresh_token };
    authMode = "reset";
    history.replaceState(
      null,
      "",
      location.pathname + location.search + "#/login"
    );
    return;
  }
  try {
    // signup confirmation / magic link
    const r = await fetch(SB_URL + "/auth/v1/user", {
      headers: { apikey: SB_KEY, Authorization: "Bearer " + access_token },
    });
    if (!r.ok) throw new Error("user");
    const u = await r.json();
    storeSession({ access_token, refresh_token, user: u });
    attachRef(access_token, u);
    setTimeout(() => {
      toast(t("confok"));
      beep("ok");
    }, 500);
  } catch {}
}

/* ---------- 9b. Boost panel (#/boost) ----------
   A page of its own for the followers / likes / views services (the SMM catalogue), so hundreds of services never flood the store.
   Flow on one screen: 1 platform icons -> 2 service type (+ search) -> 3 pick a service, enter the link + quantity, buy.
   Platform and service type are detected from the product text (tag / spec / names), so no data has to be changed. */
const isBoost = (p) => !!p && !isVisit(p) && needsLink(p) && isSmmType(p); // strict: only products of type smm appear on the boosting page
const boostCat = () => C.find((c) => c.ty == "boost") || null;
const catHref = (c) => (c && c.ty == "hub" ? "#/g/" + ex(String(c.id).replace(/^hub_/, "")) : c && c.ty == "boost" ? "#/boost" : "#/c/" + ex(c && c.id));
const sbT = (ar, en) => (lang == "ar" ? ar : en);

/* [id, Arabic, English, detection regex (runs on normalised text), glyph (BR code or letters), background, text colour] */
const SBP = [
  ["instagram", "إنستغرام", "Instagram", /instagram|\binsta\b|\big\b|انستغرام|انستجرام/, "ig", "#d6249f"],
  ["tiktok", "تيك توك", "TikTok", /tik ?tok|تيك ?توك/, "tt", "#111"],
  ["youtube", "يوتيوب", "YouTube", /youtube|\byt\b|يوتيوب/, "yt", "#ff0000"],
  ["telegram", "تيليجرام", "Telegram", /telegram|\btg\b|تيليجرام|تيليغرام/, "tg", "#229ed9"],
  ["facebook", "فيسبوك", "Facebook", /facebook|\bfb\b|فيسبوك/, "fb", "#1877f2"],
  ["whatsapp", "واتساب", "WhatsApp", /whatsapp|واتساب/, "wa", "#25d366"],
  ["coinmarketcap", "كوين ماركت كاب", "CoinMarketCap", /coin ?market ?cap|\bcmc\b/, "C", "#3861fb"],
  ["snapchat", "سناب شات", "Snapchat", /snap ?chat|سناب/, "Sn", "#fffc00", "#111"],
  ["spotify", "سبوتيفاي", "Spotify", /spotify|سبوتيفاي/, "Sp", "#1db954"],
  ["threads", "ثريدز", "Threads", /threads|ثريدز/, "@", "#111"],
  ["linkedin", "لينكدإن", "LinkedIn", /linked ?in|لينكد/, "in", "#0a66c2"],
  ["discord", "ديسكورد", "Discord", /discord|ديسكورد/, "Dc", "#5865f2"],
  ["twitch", "تويتش", "Twitch", /twitch|تويتش/, "Tw", "#9146ff"],
  ["kick", "كيك", "Kick", /\bkick\b|كيك/, "K", "#53fc18", "#111"],
  ["reddit", "ريديت", "Reddit", /reddit|ريديت/, "R", "#ff4500"],
  ["soundcloud", "ساوند كلاود", "SoundCloud", /sound ?cloud|ساوند/, "SC", "#ff5500"],
  ["pinterest", "بينترست", "Pinterest", /pinterest|بينترست/, "P", "#e60023"],
  ["tumblr", "تمبلر", "Tumblr", /tumblr|تمبلر/, "t", "#36465d"],
  ["quora", "كورا", "Quora", /quora|كورا/, "Q", "#b92b27"],
  ["web", "زيارات مواقع", "Website traffic", /traffic|website|web visit|\bseo\b|زيارات/, "W", "#0ea5e9"],
  ["x", "إكس (تويتر)", "X (Twitter)", /twitter|\bx\b|tweet|تويتر|اكس/, "xx", "#000"],
];
const SBO = ["other", "منصات أخرى", "Other platforms", null, "", "#64748b"];
/* [id, Arabic, English, regex] */
const SBT = [
  ["followers", "متابعين", "Followers", /follower|subscriber|member|\bsubs\b|متابع|مشترك|اعضاء/],
  ["likes", "لايكات", "Likes", /\blikes?\b|reaction|heart|لايك|اعجاب/],
  ["views", "مشاهدات", "Views", /\bviews?\b|\bplays?\b|impression|\bwatch(es|ing)?\b|reach|stream|مشاهد/],
  ["comments", "تعليقات", "Comments", /comment|تعليق/],
  ["shares", "مشاركات وحفظ", "Shares & saves", /share|\bsaves?\b|repost|retweet|مشارك|حفظ/],
  ["other", "خدمات أخرى", "Other services", null],
];
const SBM = {}; // product id -> { pl, ty, h } (cleared whenever the store config reloads)
function sbMeta(p) {
  let m = SBM[p.id];
  if (m) return m;
  const h = nz(plain([p.tg, p.sp, p.en, p.ar].join(" "))),
    h0 = nz(plain(p.en)); // the provider's own service name is the most reliable text: it is tried first, the Arabic title / tags are the fallback
  const pl = SBP.find((r) => r[3].test(h0)) || SBP.find((r) => r[3].test(h)),
    ty = SBT.find((r) => r[3] && r[3].test(h0)) || SBT.find((r) => r[3] && r[3].test(h));
  /* the provider's long name split into a short title + feature tags (refill, speed, start time…), see svc-parse.js */
  let s = null;
  try {
    s = window.AMXSvc ? window.AMXSvc.parse(plain(p.en) || plain(p.ar)) : null;
  } catch {}
  /* badges set by hand in the admin (إدارة الرشق): p.rf = refill days (-1 = lifetime), p.dr = drip-feed */
  if (p.rf || p.dr) {
    s = s || { title: "", tags: [], full: "" };
    if (p.rf && !s.tags.some((x) => x.id == "refill")) s.tags.unshift({ id: "refill", ar: p.rf > 0 ? "تعويض " + p.rf + " يوم" : "تعويض مدى الحياة", en: p.rf > 0 ? "Refill " + p.rf + "d" : "Lifetime refill" });
    if (p.dr && !s.tags.some((x) => x.id == "drip")) s.tags.push({ id: "drip", ar: "تقطير (Drip-feed)", en: "Drip-feed" });
  }
  return (SBM[p.id] = { pl: pl ? pl[0] : "other", ty: ty ? ty[0] : "other", h, s, ft: s ? s.tags.map((x) => x.id) : [] });
}
/* Titles made by the importer ("<type> <platform> — <name>" or "<platform> · <name>") repeat the platform on every row: for those the clean title is shown.
   A title the admin typed by hand is kept as it is. */
const SBA = new RegExp("^(?:(?:متابعين|لايكات|مشاهدات|تعليقات|مشاركات وحفظ|خدمات أخرى)\\s.+?\\s[—–-]\\s|(?:" + SBP.map((r) => r[1]).concat("منصات أخرى").join("|") + ")\\s·\\s)");
function sbTitle(p, m) {
  const s = m && m.s && m.s.title;
  if (lang == "ar") return s && (!p.ar || SBA.test(p.ar)) ? s : p.ar || s || p.en || "";
  return s && p.en ? s : p.en || p.ar || "";
}
/* Feature chips (refill / speed / start time / new…). max = how many to show in a list row, the rest becomes "+N" */
function sbChips(m, max) {
  const a = (m && m.s && m.s.tags) || [];
  if (!a.length) return "";
  const show = max ? a.slice(0, max) : a,
    more = a.length - show.length;
  return `<span class="sb-tgs">${show.map((x) => `<i class="sb-tg ${ex(x.id)}">${ex(lang == "ar" ? x.ar : x.en)}</i>`).join("")}${more > 0 ? `<i class="sb-tg">+${more}</i>` : ""}</span>`;
}
/* The provider's full service name + every feature: shown inside the opened service and on the product page, so nothing is hidden behind a "…" */
function sbFull(p, m) {
  const s = m && m.s;
  if (!s || !s.full) return "";
  const same = !s.tags.length && s.full === sbTitle(p, m);
  if (same) return "";
  return `<div class="sb-full"><small>${sbT("الاسم الكامل للخدمة", "Full service name")}</small><p dir="auto">${ex(s.full)}</p>${sbChips(m)}</div>`;
}
const SB_FT = [
  ["refill", "تعويض", "Refill"],
  ["nodrop", "ثابت", "Non-drop"],
  ["fast", "سريع", "Fast"],
  ["new", "🆕 جديد", "🆕 New"],
];
const sbPl = (id) => SBP.find((r) => r[0] == id) || SBO;
const sbLabPl = (id) => sbPl(id)[lang == "ar" ? 1 : 2];
const sbLabTy = (id) => (SBT.find((r) => r[0] == id) || SBT[SBT.length - 1])[lang == "ar" ? 1 : 2];
function sbBadge(id, z) {
  const r = sbPl(id),
    br = BR[r[4]];
  const bg = br && r[4] == "ig" ? br.bg : r[5],
    inner = br ? brandSvg(br.g, z) : r[4] ? `<b class="sb-lt">${ex(r[4])}</b>` : ic("globe", z);
  return `<span class="sb-pi" style="background:${bg};color:${r[6] || "#fff"}">${inner}</span>`;
}

const SB = { pl: "", ty: "", ft: "", q: "", sort: "def", sel: "", n: 1, link: "", lim: 20, pm: false };
const sbU = (p) => (+p.smm_qty > 0 ? +p.smm_qty : 1); // real quantity of one package (1 package = sbU units)
const sbN = (p) => qClamp(p, SB.n);
const sbPrice = (p) => {
  const u = sbU(p);
  return u > 1 || (p.smm_service && !apiMode(p)) ? { v: (pr(p) * 1000) / u, l: "/ 1000" } : { v: pr(p), l: sbT("/ وحدة", "/ unit") };
};
const sbAll = () => P.filter(isBoost);

/* One pass over the catalogue: the filtered list plus the counts shown on the platform icons and the type chips */
function sbCalc() {
  const all = sbAll(),
    qq = SB.q.trim(),
    w = nz(qq).split(/\s+/).filter(Boolean),
    plAll = {},
    plc = {},
    tyc = {},
    ftc = {};
  let list = [];
  all.forEach((p) => {
    const m = sbMeta(p);
    plAll[m.pl] = (plAll[m.pl] || 0) + 1;
    if (qq && !(String(p.smm_service) === qq || w.every((x) => m.h.includes(x)))) return;
    const okPl = !SB.pl || m.pl == SB.pl,
      okTy = !SB.ty || m.ty == SB.ty;
    if (okTy) plc[m.pl] = (plc[m.pl] || 0) + 1;
    if (okPl) tyc[m.ty] = (tyc[m.ty] || 0) + 1;
    if (okPl && okTy) {
      SB_FT.forEach((r) => m.ft.includes(r[0]) && (ftc[r[0]] = (ftc[r[0]] || 0) + 1));
      if (!SB.ft || m.ft.includes(SB.ft)) list.push(p);
    }
  });
  if (SB.sort == "pa") list = [...list].sort((x, y) => sbPrice(x).v - sbPrice(y).v);
  else if (SB.sort == "pd") list = [...list].sort((x, y) => sbPrice(y).v - sbPrice(x).v);
  return { list, plAll, plc, tyc, ftc, n: all.length };
}

const SB_PL_SHOWN = 6; // platform icons visible before "More"
function sbPlats(f) {
  const ids = Object.keys(f.plAll).sort((a, b) => (a == "other") - (b == "other") || f.plAll[b] - f.plAll[a]);
  let show = SB.pm ? ids : ids.slice(0, SB_PL_SHOWN);
  if (!SB.pm && SB.pl && ids.includes(SB.pl) && !show.includes(SB.pl)) show = [...ids.slice(0, SB_PL_SHOWN - 1), SB.pl];
  const sum = Object.values(f.plc).reduce((s, x) => s + x, 0);
  const tile = (id, badge, label, n, on) =>
    `<button type="button" class="sb-p${on ? " on" : ""}${n ? "" : " z"}" data-a="sbpl" data-p="${ex(id)}" aria-pressed="${on}">${badge}<small>${ex(label)}</small><span class="sb-ct n">${fmtN(n)}</span></button>`;
  return `<div class="sb-pls">${tile("", `<span class="sb-pi sb-all">${ic("grid", 20)}</span>`, sbT("الكل", "All"), sum, !SB.pl)}${show
    .map((id) => tile(id, sbBadge(id, 20), sbLabPl(id), f.plc[id] || 0, SB.pl == id))
    .join("")}${
    ids.length > SB_PL_SHOWN
      ? `<button type="button" class="sb-p sb-mo" data-a="sbpm" aria-expanded="${SB.pm}"><span class="sb-pi sb-all">${ic(SB.pm ? "x" : "grid", 20)}</span><small>${SB.pm ? sbT("أقل", "Less") : sbT("المزيد", "More")}</small></button>`
      : ""
  }</div>`;
}
function sbTypes(f) {
  const sum = Object.values(f.tyc).reduce((s, x) => s + x, 0);
  const chip = (id, label, n, on) =>
    `<button type="button" class="fchip${on ? " on" : ""}" aria-pressed="${on}" data-a="sbty" data-t="${ex(id)}">${ex(label)} <small class="n">${fmtN(n)}</small></button>`;
  return `<div class="fchips">${chip("", sbT("الكل", "All"), sum, !SB.ty)}${SBT.filter((r) => f.tyc[r[0]] || SB.ty == r[0])
    .map((r) => chip(r[0], r[lang == "ar" ? 1 : 2], f.tyc[r[0]] || 0, SB.ty == r[0]))
    .join("")}</div>`;
}

function sbFeats(f) {
  const a = SB_FT.filter((r) => f.ftc[r[0]] || SB.ft == r[0]);
  if (!a.length) return "";
  return `<div class="fchips sb-fts">${a
    .map((r) => `<button type="button" class="fchip${SB.ft == r[0] ? " on" : ""}" aria-pressed="${SB.ft == r[0]}" data-a="sbft" data-f="${r[0]}">${ex(r[lang == "ar" ? 1 : 2])} <small class="n">${fmtN(f.ftc[r[0]] || 0)}</small></button>`)
    .join("")}</div>`;
}
function sbForm(p) {
  const u = sbU(p),
    lo = qMin(p),
    hi = qMax(p),
    n = sbN(p),
    ds = p.ds && (p.ds[lang] || p.ds.ar || p.ds.en);
  const chips = qPresets(p)
    .slice(0, 6)
    .map((k) => `<button type="button" role="radio" aria-checked="${k == n}" class="qchip${k == n ? " on" : ""}" data-a="sbn" data-n="${k}">${fmtN(k * u)}</button>`)
    .join("");
  const per = sbPrice(p);
  return `<div class="sb-f">${sbFull(p, sbMeta(p))}${ds ? `<p class="pd sb-ds">${ex(ds)}</p>` : ""}
<div class="sb-info"><span>${sbT("السعر", "Price")}: <b class="n">${money(per.v)}</b> ${ex(per.l)}</span><span>${sbT("الحد الأدنى", "Min")}: <bdi dir="ltr">${fmtN(lo * u)}</bdi></span>${+p.qmax > 0 ? `<span>${sbT("الحد الأقصى", "Max")}: <bdi dir="ltr">${fmtN(hi * u)}</bdi></span>` : ""}</div>
<label class="sb-l"><span>${sbT("رابط الحساب أو المنشور", "Account or post link")} *</span><input id="sb-lk" class="inp" type="text" dir="ltr" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" data-a="sblk" value="${ex(SB.link)}" placeholder="https://… / @username"></label>
<div class="sb-l"><span>${sbT("الكمية", "Quantity")}</span><div class="qchips" role="radiogroup" aria-label="${sbT("الكمية", "Quantity")}">${chips}</div>
<div class="qstep"><button type="button" class="qs" data-a="sbs" data-d="-1" aria-label="-">−</button><input id="sb-n" class="inp qin" type="number" inputmode="numeric" min="${lo * u}" max="${hi * u}" value="${n * u}" dir="ltr" data-a="sbqin" aria-label="${sbT("الكمية", "Quantity")}"><button type="button" class="qs" data-a="sbs" data-d="1" aria-label="+">+</button></div>
<small class="qhint">${u > 1 ? sbT("بمضاعفات", "In steps of") + " <bdi dir=\"ltr\">" + fmtN(u) + "</bdi>" : ""}</small></div>
<div class="sb-tot"><span>${sbT("الإجمالي", "Total")}</span><b class="n" id="sb-tot">${money(pr(p) * n)}</b></div>
<div class="sb-act"><button type="button" class="b" data-a="sbbuy">${ic("bolt", 15)} ${t("buy")}</button><button type="button" class="b b2" data-a="sbadd">${ic("cart", 15)} ${t("add")}</button></div>
<a class="sb-det" href="#/p/${ex(p.id)}">${sbT("تفاصيل الخدمة", "Service details")}</a></div>`;
}
function sbRow(p) {
  const m = sbMeta(p),
    on = SB.sel == p.id,
    u = sbU(p),
    pp = sbPrice(p),
    lo = qMin(p) * u;
  const rng = fmtN(lo) + (+p.qmax > 0 ? " – " + fmtN(qMax(p) * u) : "+");
  return `<div class="sb-r${on ? " on" : ""}" id="sbr-${ex(p.id)}"><button type="button" class="sb-h" data-a="sbsel" data-id="${ex(p.id)}" aria-expanded="${on}">${sbBadge(m.pl, 18)}<span class="sb-nm"><b>${ex(sbTitle(p, m))}</b><small>${ex(sbLabTy(m.ty))} · <bdi dir="ltr">${rng}</bdi>${p.smm_service ? ` · <bdi dir="ltr" class="sb-id">#${ex(p.smm_service)}</bdi>` : ""}</small>${sbChips(m, 3)}</span><span class="sb-pr"><b class="n">${money(pp.v)}</b><small>${ex(pp.l)}</small></span><i class="sb-ch">${ic("chev", 16)}</i></button>${on ? sbForm(p) : ""}</div>`;
}
function sbRes(f) {
  const a = f.list,
    show = a.slice(0, SB.lim);
  const bar = `<div class="sb-meta"><span><b class="n">${fmtN(a.length)}</b> ${sbT("خدمة", "services")}</span><label class="fsort"><span>${t("sortl")}</span><select class="sel" data-a="sbsort" aria-label="${t("sortl")}">${[
    ["def", sbT("الافتراضي", "Default")],
    ["pa", sbT("الأرخص أولاً", "Cheapest first")],
    ["pd", sbT("الأغلى أولاً", "Priciest first")],
  ]
    .map(([k, l]) => `<option value="${k}"${SB.sort == k ? " selected" : ""}>${l}</option>`)
    .join("")}</select></label></div>`;
  if (!a.length)
    return bar + emptyBox("search", sbT("لا توجد خدمات مطابقة", "No matching services"), sbT("جرّب منصة أو نوعاً آخر أو امسح البحث.", "Try another platform or type, or clear the search."), `<button type="button" class="b b2" data-a="sbclr">${t("fclear")}</button>`);
  return `${bar}<div class="sb-list">${show.map(sbRow).join("")}</div>${
    a.length > show.length ? `<button type="button" class="b b2 block sb-more" data-a="sbmore">${sbT("عرض المزيد", "Show more")} (${fmtN(a.length - show.length)})</button>` : ""
  }`;
}

function boostPage() {
  if (loadingCfg && !P.length) return skeletonGrid();
  const c = boostCat(),
    f = sbCalc();
  const head = `<div class="box row sb-hero"><span class="tile big">${c ? ico(c, 30) : ic("trend", 30)}</span><div style="flex:1"><h1>${c ? c[lang] : sbT("منصة الرشق", "Boost panel")}</h1><p class="pd">${sbT("اختر المنصة ثم نوع الخدمة، وأكمل طلبك من نفس الصفحة.", "Pick a platform, then a service type, and order right here.")}</p></div></div>`;
  if (!f.n) return head + emptyBox("box", t("catempty"));
  return `${head}<div class="box sb-panel"><div class="sb-lab"><i>1</i>${sbT("المنصة", "Platform")}</div><div id="sb-pls">${sbPlats(f)}</div>
<div class="sb-s"><span class="sb-si">${ic("search", 18)}</span><input id="sb-q" class="inp" type="search" data-a="sbq" value="${ex(SB.q)}" placeholder="${sbT("ابحث عن خدمة أو رقمها…", "Search a service or its ID…")}" autocomplete="off" enterkeyhint="search" aria-label="${sbT("بحث", "Search")}"></div>
<div class="sb-lab"><i>2</i>${sbT("نوع الخدمة", "Service type")}</div><div id="sb-tys">${sbTypes(f)}</div><div id="sb-fts">${sbFeats(f)}</div></div>
<div class="sb-lab out"><i>3</i>${sbT("اختر الخدمة وأكمل الطلب", "Choose a service and order")}</div><div id="sb-res">${sbRes(f)}</div>`;
}
/* Redraw only the panel parts (the search box keeps focus while typing) */
function sbDraw() {
  const g = (id) => document.getElementById(id);
  if (!g("sb-res")) return;
  const f = sbCalc();
  g("sb-pls").innerHTML = sbPlats(f);
  g("sb-tys").innerHTML = sbTypes(f);
  if (g("sb-fts")) g("sb-fts").innerHTML = sbFeats(f);
  g("sb-res").innerHTML = sbRes(f);
}
const sbReset = () => {
  SB.sel = "";
  SB.lim = 20;
  sbDraw();
};
/* Quantity edits update the total in place (no re-render, so the keyboard stays open). keep = leave what the buyer typed in the box */
function sbLive(raw, keep) {
  const p = prod(SB.sel);
  if (!p) return;
  const u = sbU(p),
    v = Math.round((+raw || 0) / u),
    ok = v >= qMin(p) && v <= qMax(p),
    n = qClamp(p, v);
  SB.n = n;
  const inp = $("#sb-n"),
    tot = $("#sb-tot");
  if (tot) tot.innerHTML = money(pr(p) * n);
  if (inp) {
    inp.setAttribute("aria-invalid", ok ? "false" : "true");
    if (!keep) {
      inp.value = n * u;
      inp.setAttribute("aria-invalid", "false");
    }
  }
  document.querySelectorAll("#sb-res .qchip").forEach((c) => {
    const on = +c.dataset.n == n && (ok || !keep);
    c.classList.toggle("on", on);
    c.setAttribute("aria-checked", String(on));
  });
}
function sbCommit(go) {
  const p = prod(SB.sel);
  if (!p) return;
  const inp = $("#sb-n");
  if (inp) sbLive(inp.value, false);
  const lk = SB.link.trim(),
    lki = $("#sb-lk");
  if (!linkOk(lk)) {
    if (lki) {
      lki.setAttribute("aria-invalid", "true");
      lki.focus();
    }
    return toast(sbT("أدخل رابط الحساب أو المنشور بشكل صحيح", "Enter a valid account or post link"), "wn");
  }
  const old = cart.find((c) => c.id == p.id);
  if (old && String(old.l || "").trim() && String(old.l).trim() != lk) {
    toast(sbT("هذه الخدمة في سلتك برابط آخر. أكمل طلبها أو احذفها أولاً.", "This service is already in your cart with another link. Finish or remove it first."), "wn");
    return qbOpen();
  }
  addToCart(p.id, SB.n);
  const x = cart.find((c) => c.id == p.id);
  if (x) {
    x.l = lk;
    save();
  }
  go ? qbOpen() : toast(t("added"));
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-a^='sb']");
  if (!b) return;
  const a = b.dataset.a;
  if (a == "sbgo") {
    // from the store search: carry the typed words into the boost panel
    SB.q = q;
    SB.pl = SB.ty = SB.ft = SB.sel = "";
    SB.lim = 20;
    q = "";
    const qi = $("#q");
    if (qi) qi.value = "";
  } else if (a == "sbpl") {
    const v = b.dataset.p || "";
    SB.pl = v && SB.pl == v ? "" : v;
    SB.ty = "";
    sbReset();
  } else if (a == "sbpm") {
    SB.pm = !SB.pm;
    sbDraw();
  } else if (a == "sbty") {
    const v = b.dataset.t || "";
    SB.ty = v && SB.ty == v ? "" : v;
    sbReset();
  } else if (a == "sbft") {
    const v = b.dataset.f || "";
    SB.ft = v && SB.ft == v ? "" : v;
    sbReset();
  } else if (a == "sbmore") {
    SB.lim += 20;
    sbDraw();
  } else if (a == "sbclr") {
    SB.pl = SB.ty = SB.ft = SB.q = "";
    const i = $("#sb-q");
    if (i) i.value = "";
    sbReset();
  } else if (a == "sbsel") {
    const id = b.dataset.id,
      p = prod(id);
    SB.sel = SB.sel == id ? "" : id;
    if (SB.sel && p) SB.n = qMin(p);
    sbDraw();
    const el = SB.sel && document.getElementById("sbr-" + id);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  } else if (a == "sbn") {
    const p = prod(SB.sel);
    if (p) sbLive((+b.dataset.n || 1) * sbU(p), false);
  } else if (a == "sbs") {
    const p = prod(SB.sel);
    if (p) sbLive(qClamp(p, SB.n + qStep(p, SB.n, +b.dataset.d || 0)) * sbU(p), false);
  } else if (a == "sbbuy") sbCommit(true);
  else if (a == "sbadd") sbCommit(false);
});
document.addEventListener("input", (e) => {
  const el = e.target,
    a = el.dataset && el.dataset.a;
  if (a == "sbq") {
    SB.q = el.value;
    SB.sel = "";
    SB.lim = 20;
    sbDraw();
  } else if (a == "sbqin") sbLive(el.value, true);
  else if (a == "sblk") {
    SB.link = el.value;
    el.removeAttribute("aria-invalid");
  }
});
document.addEventListener("change", (e) => {
  const el = e.target,
    a = el.dataset && el.dataset.a;
  if (a == "sbsort") {
    SB.sort = el.value;
    SB.sel = "";
    SB.lim = 20;
    sbDraw();
  } else if (a == "sbqin") sbLive(el.value, false);
});


/* ---------- 14. Search, banners & router ---------- */
const nz = (x) =>
  String(x)
    .toLowerCase()
    .replace(/[ً-ٟ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
const hit = (p, k) => {
  const h = nz(p.ar + " " + p.en + " " + p.tg + " " + p.sp);
  return nz(k)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => h.includes(w));
};
$("#q").addEventListener("input", (e) => {
  q = e.target.value;
  if (q && (location.hash || "#/") != "#/") location.hash = "#/";
  else render();
});

/* Banner carousel: auto-advance (3s) with a progress bar on the active dot, arrows, clickable dots, pause on touch/hover, active-slide highlight. Centre-to-centre scrolling works in both RTL and LTR. */
/* 3D banner: coverflow depth from the scroll position (--o / --a per slide), pointer tilt + glare + parallax on the active slide, and a gentle idle sway so touch devices see motion too. Everything is driven by CSS variables (see style.css, section 18). */
let banRaf = 0;
function banner3d(el) {
  cancelAnimationFrame(banRaf);
  const kids = [...el.children],
    wrap = el.parentElement,
    still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (still) return;
  const mid = (r) => r.left + r.width / 2,
    clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let hov = null,
    last = null,
    seen = true,
    ticking = 0;
  const depth = () => {
    ticking = 0;
    const c = mid(el.getBoundingClientRect());
    kids.forEach((k) => {
      const o = clamp((mid(k.getBoundingClientRect()) - c) / Math.max(1, k.offsetWidth), -1.15, 1.15);
      k.style.setProperty("--o", o.toFixed(3));
      k.style.setProperty("--a", Math.min(1, Math.abs(o)).toFixed(3));
    });
  };
  const queue = () => {
    if (!ticking) ticking = requestAnimationFrame(depth);
  };
  const setTilt = (k, x, y, gl) => {
    k.style.setProperty("--ry", (x * 16).toFixed(2) + "deg");
    k.style.setProperty("--rx", (-y * 12).toFixed(2) + "deg");
    k.style.setProperty("--px", x.toFixed(3));
    k.style.setProperty("--py", y.toFixed(3));
    k.style.setProperty("--gx", ((x + 0.5) * 100).toFixed(1) + "%");
    k.style.setProperty("--gy", ((y + 0.5) * 100).toFixed(1) + "%");
    k.style.setProperty("--gl", gl);
  };
  const flat = (k) => k && setTilt(k, 0, 0, 0);
  el.addEventListener("scroll", queue, { passive: true });
  addEventListener("resize", queue, { passive: true });
  wrap.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType == "touch") return;
      const k = e.target.closest && e.target.closest(".bs");
      if (hov && hov != k) flat(hov);
      hov = k && k.classList.contains("cur") ? k : null;
      if (!hov) return;
      const r = hov.getBoundingClientRect();
      setTilt(hov, clamp((e.clientX - r.left) / r.width - 0.5, -0.5, 0.5), clamp((e.clientY - r.top) / r.height - 0.5, -0.5, 0.5), 1);
    },
    { passive: true }
  );
  wrap.addEventListener(
    "pointerleave",
    () => {
      flat(hov);
      hov = null;
    },
    { passive: true }
  );
  if ("IntersectionObserver" in window)
    new IntersectionObserver((en) => (seen = en[0].isIntersecting)).observe(wrap);
  const loop = (now) => {
    if (!document.body.contains(el)) return;
    banRaf = requestAnimationFrame(loop);
    if (!seen || document.hidden || hov) return;
    const k = el.querySelector(".bs.cur") || kids[0];
    if (last && last != k) flat(last);
    last = k;
    if (k)
      setTilt(k, Math.sin(now / 1500) * 0.28, Math.cos(now / 1900) * 0.2, 0.55 + Math.sin(now / 1500) * 0.25);
  };
  depth();
  setTimeout(depth, 350);
  banRaf = requestAnimationFrame(loop);
}
let banTimer,
  bannerCtl = null;
function startBanners() {
  clearTimeout(banTimer);
  bannerCtl = null;
  const el = document.querySelector(".ban");
  if (el) banner3d(el);
  if (!el || el.children.length < 2) return;
  const wrap = el.parentElement,
    kids = [...el.children],
    dots = [...wrap.querySelectorAll(".dots button")],
    DUR = 3000;
  wrap.style.setProperty("--bt", DUR + "ms");
  const mid = (r) => r.left + r.width / 2;
  const current = () => {
    const c = mid(el.getBoundingClientRect());
    let bi = 0,
      bd = 1e9;
    kids.forEach((k, i) => {
      const d = Math.abs(mid(k.getBoundingClientRect()) - c);
      if (d < bd) {
        bd = d;
        bi = i;
      }
    });
    return bi;
  };
  let idx = 0,
    resume;
  const schedule = () => {
    clearTimeout(banTimer);
    banTimer = setTimeout(tick, DUR);
  };
  const mark = (i) => {
    idx = i;
    kids.forEach((k, j) => k.classList.toggle("cur", j == i));
    dots.forEach((d, j) => {
      d.classList.remove("on");
      if (j == i) {
        void d.offsetWidth;
        d.classList.add("on");
      }
    });
    schedule();
  };
  const to = (i) => {
    i = (i + kids.length) % kids.length;
    el.scrollBy({
      left:
        mid(kids[i].getBoundingClientRect()) - mid(el.getBoundingClientRect()),
      behavior: "smooth",
    });
  };
  function tick() {
    if (!document.body.contains(el)) return;
    if (wrap.classList.contains("hold") || document.hidden) return schedule();
    to(idx + 1);
  }
  const hold = () => {
    clearTimeout(banTimer);
    clearTimeout(resume);
    wrap.classList.add("hold");
  };
  const release = () => {
    clearTimeout(resume);
    resume = setTimeout(() => {
      wrap.classList.remove("hold");
      mark(idx);
    }, 1200);
  };
  ["touchstart", "pointerdown", "mouseenter"].forEach((ev) =>
    wrap.addEventListener(ev, hold, { passive: true })
  );
  ["touchend", "pointerup", "mouseleave"].forEach((ev) =>
    wrap.addEventListener(ev, release, { passive: true })
  );
  el.addEventListener(
    "scroll",
    () => {
      const i = current();
      if (i != idx) mark(i);
    },
    { passive: true }
  );
  bannerCtl = { to, step: (d) => to(idx + d) };
  mark(0);
}

/* ---------- SEO: <head> per route (title, description, canonical, robots, social tags) ----------
   Only the home page, /policies/ and /faq/ are public; every other route sits behind the login wall and is marked noindex. */
const metaVal = (n) => ((document.head.querySelector('meta[name="' + n + '"]') || {}).content || "");
/* defaults for every non-public route; the static pages carry them in amx-home-* meta tags because their own title/description differ */
const SEO0 = { title: metaVal("amx-home-title") || document.title, desc: metaVal("amx-home-desc") || metaVal("description") };
const SEO_SITE = "https://amarix007.store";
const SEO_PUBLIC = { policies: ["pol", "polh", "/policies/"], faq: ["faq", "faqh", "/faq/"] };
function seoSet(sel, attr, val) {
  const e = document.head.querySelector(sel);
  if (e && e.getAttribute(attr) !== val) e.setAttribute(attr, val);
}
function seoHead(r) {
  const pub = SEO_PUBLIC[r],
    pg = { partner: ["برنامج الشركاء", "Partner program"], boost: ["خدمات الرشق", "Boost services"], orders: [t("ord")], cart: [t("cart")], fav: [t("fav")], account: [t("acc")], support: [t("tk_acc")] }[r],
    title = pub ? t(pub[0]) + " | AMARIX007" : pg ? (pg[lang == "ar" ? 0 : pg.length - 1] || pg[0]) + " | AMARIX007" : SEO0.title,
    desc = pub ? t(pub[1]) : SEO0.desc,
    url = SEO_SITE + (pub ? pub[2] : "/"),
    robots = !r || r == "login" || pub ? "index,follow,max-image-preview:large" : "noindex,nofollow";
  if (document.title != title) document.title = title;
  seoSet('meta[name="description"]', "content", desc);
  seoSet('link[rel="canonical"]', "href", url);
  seoSet('meta[name="robots"]', "content", robots);
  seoSet('meta[property="og:title"]', "content", title);
  seoSet('meta[property="og:description"]', "content", desc);
  seoSet('meta[property="og:url"]', "content", url);
  seoSet('meta[name="twitter:title"]', "content", title);
  seoSet('meta[name="twitter:description"]', "content", desc);
}
/* the static pages (/policies/, /faq/) use <base href="/">, so a plain "#/x" link would leave the page: keep it a hash change */
document.addEventListener("click", (e) => {
  if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (document.baseURI.split("#")[0] === location.href.split("#")[0]) return;
  const a = e.target.closest && e.target.closest('a[href^="#/"]');
  if (!a || (a.target && a.target != "_self")) return;
  e.preventDefault();
  const h = a.getAttribute("href");
  if (location.hash != h) location.hash = h;
});

const AUTH_ROUTES = ["orders", "account", "support"];
function render() {
  render0();
  qbRefresh();
}
function render0() {
  if (waitCfg) {
    $("#m").innerHTML = skeletonGrid();
    return;
  }
  const seq = ++routeSeq;
  const [h] = (location.hash || "#/").split("?"),
    [, r, id, sub] = h.split("/");
  seoHead(r);
  const sk = $(".skip");
  if (sk) sk.textContent = lang == "ar" ? "تخطَّ إلى المحتوى" : "Skip to content";
  const needPush = pushNeeded();
  document.body.classList.toggle("gate", (!user && r == "login") || needPush);
  /* Login wall: visitors can browse the catalogue and fill a cart; orders, account, support and partner pages need an account */
  if (!user && !PUBLIC_ROUTES.includes(r) && !GUEST_ROUTES.includes(r || "")) {
    returnTo = location.hash;
    location.hash = "#/login";
    return;
  }
  if (r == "login" && user && authMode != "reset") {
    location.hash = "#/account";
    return;
  }
  /* Notification gate: a signed-in customer must allow notifications (only where the browser supports them) */
  if (needPush && !PUBLIC_ROUTES.includes(r)) {
    $("#m").innerHTML = pushGatePage();
    nav();
    return;
  }
  if (user && /^(wallet|cart|account|done|orders)$/.test(r || "")) loadWallet();
  const m = $("#m");
  if (r == "orders") {
    m.innerHTML = loadingBox();
    nav();
    ordersPage(seq);
    return;
  }
  if (r == "invoice") {
    m.innerHTML = loadingBox();
    nav();
    invoicePage(seq, dec(id || ""));
    return;
  }
  if (r == "support") {
    nav();
    const oq = (new URLSearchParams((location.hash.split("?")[1] || "")).get("order") || "").toUpperCase().replace(/[^A-Z0-9-]/g, "");
    supportPage(seq, oq);
    return;
  }
  m.innerHTML =
    r == "g" && window.AMXHub
    ? AMXHub.page(dec(id || ""), dec(sub || ""))
    : r == "c"
      ? catPage(dec(id || ""))
      : r == "p"
      ? prodPage(dec(id || ""))
      : r == "boost"
      ? boostPage()
      : r == "wallet"
      ? walletPage()
      : r == "partner"
      ? (loadPartner(), partnerPage())
      : r == "cart"
      ? cartPage()
      : r == "fav"
      ? favPage()
      : r == "login"
      ? authPage()
      : r == "account"
      ? accPage()
      : r == "done"
      ? donePage(dec(id || ""))
      : r == "faq"
      ? faqPage()
      : r == "policies"
      ? policiesPage()
      : home();
  nav();
  startBanners();
  decorate();
  if (r == "login") humanStart();
}
addEventListener("hashchange", () => {
  scrollTo(0, 0);
  render();
  trackView();
  /* keyboard / screen-reader users: land on the new page content, not on the link that was pressed */
  const ae = document.activeElement,
    m = $("#m");
  if (m && !(ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) && !document.body.classList.contains("gate")) m.focus({ preventScroll: true });
});
addEventListener("offline", () => toast(lang == "ar" ? "لا يوجد اتصال بالإنترنت" : "You're offline", "wn"));
addEventListener("online", () => toast(lang == "ar" ? "عاد الاتصال بالإنترنت" : "Back online"));

/* ---------- Quick buy: the cart as a bottom sheet (product -> payment -> confirm) ---------- */
function qbEl() {
  let e = document.getElementById("qb");
  if (e) return e;
  e = document.createElement("div");
  e.id = "qb";
  e.className = "qb";
  e.setAttribute("aria-hidden", "true");
  const A = lang == "ar";
  e.innerHTML = `<div class="qb-ov" data-a="qb-x"></div><div class="qb-s" role="dialog" aria-modal="true" aria-label="${A ? "إتمام الشراء" : "Checkout"}"><div class="qb-h"><b>${A ? "إتمام الشراء" : "Checkout"}</b><button type="button" class="ib" data-a="qb-x" aria-label="${A ? "إغلاق" : "Close"}">${ic("x", 16)}</button></div><ol class="qb-st"><li>${A ? "المنتج" : "Item"}</li><li>${A ? "الدفع" : "Payment"}</li><li>${A ? "التأكيد" : "Confirm"}</li></ol><div class="qb-b" id="qb-b"></div><button type="button" class="qb-more" data-a="qb-cart">${A ? "فتح السلة كاملة" : "Open full cart"}</button></div>`;
  document.body.appendChild(e);
  return e;
}
function qbOpen() {
  const e = qbEl();
  $("#qb-b").innerHTML = cartPage();
  e.classList.add("on");
  e.setAttribute("aria-hidden", "false");
  document.body.classList.add("qb-open");
}
function qbClose() {
  const e = document.getElementById("qb");
  if (!e || !e.classList.contains("on")) return;
  e.classList.remove("on");
  e.setAttribute("aria-hidden", "true");
  document.body.classList.remove("qb-open");
}
function qbRefresh() {
  const e = document.getElementById("qb");
  if (!e || !e.classList.contains("on")) return;
  if (!cartLines().length) return qbClose();
  const sc = e.querySelector(".qb-s").scrollTop;
  $("#qb-b").innerHTML = cartPage();
  e.querySelector(".qb-s").scrollTop = sc;
}
addEventListener("hashchange", qbClose);
document.addEventListener("keydown", (ev) => ev.key == "Escape" && qbClose());


/* Section strip: mouse drag, vertical wheel -> horizontal scroll, edge fades; press ripple and pointer spotlight on section cards */
(function sectionFx() {
  const el = $("#sub-nav");
  let down = null,
    moved = false;
  el.addEventListener("scroll", () => stripFades(el), { passive: true });
  el.addEventListener(
    "wheel",
    (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      const max = el.scrollWidth - el.clientWidth,
        nx = el.scrollLeft + (rtl() ? -e.deltaY : e.deltaY);
      if (rtl() ? nx <= 0 && nx >= -max : nx >= 0 && nx <= max) {
        e.preventDefault();
        el.scrollLeft = nx;
      }
    },
    { passive: false }
  );
  el.addEventListener("pointerdown", (e) => {
    moved = false;
    if (e.pointerType != "mouse" || e.button) return;
    down = { x: e.clientX, s: el.scrollLeft };
  });
  addEventListener("pointermove", (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    if (!moved && Math.abs(dx) > 5) {
      moved = true;
      el.classList.add("drag");
    }
    if (moved) el.scrollLeft = down.s - dx;
  });
  addEventListener("pointerup", () => {
    down = null;
    el.classList.remove("drag");
  });
  el.addEventListener(
    "click",
    (e) => {
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        moved = false;
      }
    },
    true
  );
  el.addEventListener("dragstart", (e) => e.preventDefault());
  addEventListener("resize", snSync);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(snSync);
  document.addEventListener(
    "pointerdown",
    (e) => {
      const c = e.target.closest(".ct,.sn");
      if (!c) return;
      const b = c.getBoundingClientRect(),
        i = document.createElement("i");
      i.className = "rip";
      i.style.cssText = `--rs:${Math.max(b.width, b.height) * 1.6}px;--rx:${e.clientX - b.left}px;--ry:${e.clientY - b.top}px`;
      c.appendChild(i);
      setTimeout(() => i.remove(), 650);
    },
    { passive: true }
  );
  $("#m").addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerType != "mouse") return;
      const c = e.target.closest(".ct");
      if (!c) return;
      const b = c.getBoundingClientRect();
      c.style.setProperty("--mx", e.clientX - b.left + "px");
      c.style.setProperty("--my", e.clientY - b.top + "px");
    },
    { passive: true }
  );
})();

/* ---------- 14b. Push notifications (Web Push) ----------
   The server side lives in supabase-push.sql + supabase/functions/send-push (see PUSH-SETUP.md).
   Paste the VAPID *public* key below (the private key never goes in this file). */
const VAPID_PUBLIC_KEY = "BHqFuE2ZTq_UBOyWdUQY33Bvq-kD8hqtyzyWeTz45roWliop4R2z_rT3DT76hUtsiRCz8LzXvZe3j1TdH97fvs4";
const pushReady = () =>
  !/^PASTE/.test(VAPID_PUBLIC_KEY) &&
  location.protocol === "https:" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;
const vapidKey = () => {
  const s = VAPID_PUBLIC_KEY,
    r = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(r, (c) => c.charCodeAt(0));
};
let pushSyncedFor = "";
async function pushSave(sub) {
  const j = sub.toJSON();
  if (!user || !j.keys) return false;
  const r = await sb("/rest/v1/rpc/push_register", {
    method: "POST",
    body: { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_lang: lang },
  });
  if (r.ok) ls.set("amx_push", "1");
  return r.ok;
}
async function pushSubscribe() {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKey() });
  return pushSave(sub);
}
/* Permission already granted on this device: (re)link the device to the signed-in account, silently */
async function pushSync() {
  try {
    if (!user || !pushReady() || Notification.permission !== "granted" || pushSyncedFor === user.id) return;
    pushSyncedFor = user.id;
    if (!(await pushSubscribe())) pushSyncedFor = "";
  } catch { pushSyncedFor = ""; }
}
async function pushEnable(btn) {
  setBusy(btn, true);
  try {
    if ((await Notification.requestPermission()) !== "granted") {
      toast(t("push_denied"), "er");
    } else if (await pushSubscribe()) {
      pushSyncedFor = user.id;
      toast(t("push_on"));
    } else throw 0;
  } catch {
    toast(t("push_fail"), "er");
  }
  setBusy(btn, false);
  render();
}
/* Sign-out: stop this device receiving the account's notifications */
async function pushOff(tk) {
  try {
    ls.del("amx_push");
    pushSyncedFor = "";
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration(),
      sub = reg && (await reg.pushManager.getSubscription());
    if (!sub) return;
    if (tk)
      await fetch(SB_URL + "/rest/v1/push_subscriptions?endpoint=eq." + encodeURIComponent(sub.endpoint), {
        method: "DELETE",
        headers: { apikey: SB_KEY, Authorization: "Bearer " + tk },
      });
    await sub.unsubscribe();
  } catch {}
}
/* Is the page running inside the installed app (Android TWA, installed PWA, iOS home-screen app) rather than a normal browser tab?
   - TWA: Chrome opens it with referrer "android-app://<package>" (kept in sessionStorage because a reload loses the referrer; sessionStorage is
     per window, so it does not leak into a normal Chrome tab the way localStorage would, TWA and Chrome share the same origin storage)
   - installed PWA / TWA window: display-mode is standalone / fullscreen / minimal-ui, iOS exposes navigator.standalone
   - optional hint: opening the site with ?source=twa or ?app=1 (e.g. set as the TWA launch URL) */
const isApp = () => {
  try {
    if (/^android-app:\/\//i.test(document.referrer || "") || /[?&](?:source=(?:twa|app|pwa)|app=1)(?:&|$|#)/.test(location.search)) sessionStorage.setItem("amx_inapp", "1");
    if (sessionStorage.getItem("amx_inapp") === "1") return true;
  } catch {}
  try {
    return (
      ["standalone", "fullscreen", "minimal-ui"].some((m) => matchMedia("(display-mode: " + m + ")").matches) || navigator.standalone === true
    );
  } catch {
    return false;
  }
};
/* Required step after sign-in, inside the APP only: browsers only show the permission prompt from a tap, and a "denied" choice can only be undone from the browser's / app's site settings.
   On the website (normal browser tab) notifications are optional: the account page shows an "Enable" box (pushBox) instead of blocking the store. */
function pushNeeded() {
  return !!user && pushReady() && Notification.permission !== "granted" && isApp();
}
function pushGatePage() {
  const denied = Notification.permission === "denied";
  return `<div class="box au done"><div class="okc">${ic("bolt", 34)}</div><h1>${t("pg_t")}</h1><p class="pd">${t("pg_d")}</p>${denied ? `<p class="ord-note">${ic("belloff", 14)} ${t("pg_blk")}</p>` : ""}<div class="acts">${denied ? `<button class="b" data-a="push-re">${t("pg_re")}</button>` : `<button class="b" data-a="push-on">${t("pg_btn")}</button>`}</div></div>`;
}
function pushBox(compact) {
  if (!user || !pushReady()) return "";
  const p = Notification.permission;
  if (p === "granted") return compact || ls.get("amx_push") !== "1" ? "" : `<p class="ord-note ok">${ic("bell", 14)} ${t("push_active")}</p>`;
  if (p === "denied") return compact ? "" : `<p class="ord-note">${ic("belloff", 14)} ${t("push_blocked")}</p>`;
  return `<div class="box row" style="display:flex;gap:12px;align-items:center;justify-content:space-between"><div style="min-width:0"><b>${ic("bell", 14)} ${t("push_t")}</b><small style="display:block">${t("push_d")}</small></div><button type="button" class="b sm" data-a="push-on">${t("push_btn")}</button></div>`;
}
/* A tap on a notification while the app is open: the service worker asks the page to go to that screen */
if ("serviceWorker" in navigator)
  navigator.serviceWorker.addEventListener("message", (e) => {
    const m = e.data;
    if (m && m.type === "amx-nav" && /^#\/[a-z]+$/.test(m.hash || "")) location.hash = m.hash;
  });

/* ---------- 15. Boot ---------- */
/* A config published by an older admin may lack newer sections (payments, partner, social…): fall back to the embedded ones */
function withDefaults(d) {
  const o = { ...d };
  [
    "partner",
    "social",
    "payments",
    "rates",
    "banners",
    "embeds",
  ].forEach((k) => {
    if (o[k] == null && CFG0[k] != null) o[k] = CFG0[k];
  });
  o.site = { ...(CFG0.site || {}), ...(d.site || {}) };
  return o;
}
let waitCfg = false; // true while we wait for the first published config (nothing cached yet)
async function boot() {
  user = ls.json("amx_user", null);
  if (user && !ls.get("amx_token")) user = null;
  checkGoogle();
  if (!user) tgPrep();
  await handleAuthRedirect();
  /* Stale-while-revalidate: the last published config is cached in localStorage ('amx_remote') and used for the first paint, so returning visitors never see the embedded placeholder store. With no cache yet (first visit) we show a skeleton instead of the placeholders, and fall back to the embedded copy only if the request fails or is too slow. */
  const cached =
    REMOTE_CFG && Array.isArray(REMOTE_CFG.products) ? REMOTE_CFG : null;
  let painted = false;
  if (cached) {
    setCfg(withDefaults(cached));
    head();
    render();
    painted = true;
  } else {
    setCfg(CFG0);
    waitCfg = true;
    $("#m").innerHTML = skeletonGrid();
  }
  // NOTE: api_settings (secret keys) is intentionally NOT fetched here.
  try {
    // newer config published from the admin panel
    const r = await Promise.race([
      sb("/rest/v1/rpc/public_config", { method: "POST", body: {}, auth: false }),
      new Promise((_, no) => setTimeout(no, 7000)),
    ]);
    let d;
    if (r.ok) d = await r.json();
    else d = ((await (await sb("/rest/v1/store_config?id=eq.1&select=data", { auth: false })).json())[0] || {}).data; // before the SQL fixes are applied
    let paymentMethodsRead = false;
    try {
      const pr = await sb("/rest/v1/rpc/payment_methods_public", { method: "POST", body: {}, auth: false });
      if (pr.ok) {
        const pp = await pr.json();
        if (pp && Array.isArray(pp.methods)) {
          paymentMethodsRead = true;
          d = { ...(d || {}), payments: pp.methods.filter((m) => m && m.kind !== "wallet").map((m) => ({
            ...m, ...(m.config && typeof m.config === "object" ? m.config : {}),
            on: true, acc: "", currency: String(m.currency || "USD"),
            min: m.min_amount ?? m.min_base ?? 0, max: m.max_amount ?? m.max_base ?? 0,
            requires_proof: m.requires_proof !== false,
          })),
        };
        if (pp.fx && d.rates && d.rates.SYP) d.rates = { ...d.rates, SYP: [Number(pp.fx), d.rates.SYP[1] || "ل.س"] };
      }
      }
    } catch (payCfgError) { console.warn("[AMARIX] payment_methods_public unavailable; public_config fallback used", payCfgError); }
    if (d && Array.isArray(d.products)) {
      ls.set("amx_remote", d); // remember it for the next visit; payment accounts were removed from public methods
      if (paymentMethodsRead || !cached || d.ts !== cached.ts) {
        setCfg(withDefaults(d));
        painted = false;
      } // v2 methods are authoritative even when other store data is unchanged
      else painted = true;
    }
  } catch {}
  waitCfg = false;
  loadingCfg = false;
  if (!painted) {
    head();
    render();
  } // first paint (no cache) or a newer published version
  loadStats().then((ch) => ch && render());
  trackView();
  if (user) {
    syncProfile();
    cartSync();
  }
  pushSync();
  if (coupon && !cpOf(coupon)) checkCoupon(coupon).then((ok) => ok && render());
}
boot();

/* Optional service worker (https only): network-first code, cached icons. A failure never affects the store. */
addEventListener("load", () => {
  try {
    if ("serviceWorker" in navigator && location.protocol === "https:")
      navigator.serviceWorker.register("sw.js").catch(() => {});
  } catch {}
});
