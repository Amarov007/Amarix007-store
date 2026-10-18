/* =====================================================================
   AMARIX007 — Storefront logic (app.js)
   ---------------------------------------------------------------------
   Sections
    1. Config & security notes      8. Views (pages)
    2. Icons                        9. Actions (clicks)
    3. Translations                10. Orders (create / list)
    4. State & storage             11. Auth (login / signup / session)
    5. Helpers (toast, loading)    12. Search & router
    6. Supabase client             13. Boot
    7. Cart, coupon & totals

   SECURITY NOTES
   - This file uses ONLY the Supabase *anon* key. It is public by design;
     it is safe only because Row Level Security (RLS) is enabled.
     Never put a service_role key, payment secret or API secret in the
     front end.
   - RLS must be ON for these tables (see supabase-schema.sql):
       orders        -> a user can INSERT/SELECT only rows where
                        user_id = auth.uid(); only admins can UPDATE.
       store_config  -> SELECT for everyone, INSERT/UPDATE for admins only.
       profiles      -> a user can read/update only their own row.
       api_settings  -> admins only. NEVER readable by anon (it holds
                        secret keys, so the storefront does not fetch it).
   - Prices are computed in the browser for display. For a real payment
     flow, re-calculate the total on the server (trigger / Edge Function).
   ===================================================================== */
'use strict';

/* ---------- 1. Config ---------- */
const SB_URL = 'https://pvuobngrybygohendwaz.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dW9ibmdyeWJ5Z29oZW5kd2F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMTI0ODIsImV4cCI6MjEwNzg4ODQ4Mn0.enSKw1_Wt58iK8-Y0eaHMWtBGQ7HyYXP_JEwYLsSfpU'; // anon key only

const CFG0 = window.AMX || {};
const REMOTE_CFG = (() => { try { return JSON.parse(localStorage.getItem('amx_remote')); } catch { return null; } })();   // optional cached copy
const ORDER_STATUSES = ['new', 'processing', 'paid', 'done', 'cancelled'];

/* ---------- 2. Icons ---------- */
const I = {
  cart:'<path d="M3 4h2l2.4 11h10.2l2-8H6.2"/><circle cx="9" cy="19" r="1.2"/><circle cx="17" cy="19" r="1.2"/>',
  heart:'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  home:'<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-6h4v6"/>',
  box:'<path d="M4 8l8-4 8 4v8l-8 4-8-4z"/><path d="M4 8l8 4 8-4M12 12v8"/>',
  bank:'<path d="M3 10l9-6 9 6M5 10v8M9 10v8M15 10v8M19 10v8M3 20h18"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  phone:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  bot:'<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-6 8-6s8 2 8 6"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.5 0 4.5 1.5 4.5 4"/>',
  gift:'<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v8h14v-8M7.5 8C5 8 5 4 8 4c2 0 4 4 4 4s2-4 4-4c3 0 3 4.5.5 4"/>',
  trend:'<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  bolt:'<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',
  shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01"/>',
  search:'<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  x:'<path d="M6 6l12 12M18 6L6 18"/>',
  send:'<path d="M4 12l16-8-6 16-3-7z"/>',
  ext:'<path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/>',
  spark:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17v4M17 19h4"/>',
  hs:'<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
  wa:'<path d="M4 20l1.3-4A8 8 0 1 1 8.2 18.8z"/><path d="M9 9c0 3 3 6 6 6l1-1.5-2-1-1 .8c-1-.4-1.8-1.2-2.2-2.2l.8-1-1-2z"/>',
  tg:'<path d="M21 4L3 11l6 2 2 6 3-4 5 4z"/><path d="M9 13l8-6"/>',
  ig:'<rect x="4" y="4" width="16" height="16" rx="5"/><circle cx="12" cy="12" r="3.6"/><path d="M17 7h.01"/>',
  xx:'<path d="M5 5l14 14M19 5L5 19"/>',
  yt:'<rect x="3" y="6" width="18" height="12" rx="4"/><path d="M10.5 9.5v5l4.5-2.5z"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 7l8 6 8-6"/>',
  /* Brand-colored social (filled) used in footer */
  waF:'<path fill="#25D366" d="M12 2C6.5 2 2 6.3 2 11.6c0 1.9.5 3.7 1.5 5.3L2 22l5.3-1.4c1.5.8 3.2 1.2 4.7 1.2 5.5 0 10-4.3 10-9.6S17.5 2 12 2zm0 17.4c-1.4 0-2.7-.3-3.9-.9l-.3-.2-3.1.8.8-3-.2-.3A7.3 7.3 0 0 1 4.6 11.6c0-4.1 3.4-7.4 7.4-7.4s7.4 3.3 7.4 7.4-3.3 7.4-7.4 7.4zm4.1-5.5c-.2-.1-1.3-.6-1.5-.7-.2-.1-.4-.1-.5.1-.2.2-.6.7-.7.9-.1.2-.3.2-.5.1-.2-.1-1-.4-1.9-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5l.4-.5c.1-.1.2-.3.3-.4.1-.1.1-.3 0-.4-.1-.1-.5-1.2-.7-1.7-.2-.4-.4-.4-.5-.4h-.4c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 1.9s.8 2.2.9 2.3c.1.2 1.6 2.5 3.9 3.4.5.2 1 .4 1.3.5.6.2 1.1.2 1.5.1.5-.1 1.3-.5 1.5-1 .2-.5.2-.9.1-1z"/>',
  tgF:'<path fill="#26A5E4" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.2-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>',
  igF:'<defs><linearGradient id="igG" x1="0" y1="24" x2="24" y2="0"><stop stop-color="#feda75"/><stop offset=".3" stop-color="#fa7e1e"/><stop offset=".6" stop-color="#d62976"/><stop offset="1" stop-color="#4f5bd5"/></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="6" fill="url(#igG)"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="17.2" cy="6.8" r="1.2" fill="#fff"/>',
  xxF:'<path fill="currentColor" d="M4.5 3h4.1l3.7 5.2L16.8 3H20l-5.5 7.2L20.5 21h-4.1l-4-5.6L7.2 21H4l5.8-7.6L4.5 3zm2.3 1.5l9.8 13h1.5L8.3 4.5H6.8z"/>',
  ytF:'<path fill="#FF0000" d="M21.6 7.2c-.2-.9-.9-1.6-1.8-1.8C18.1 5 12 5 12 5s-6.1 0-7.8.4c-.9.2-1.6.9-1.8 1.8C2 9 2 12 2 12s0 3 .4 4.8c.2.9.9 1.6 1.8 1.8 1.7.4 7.8.4 7.8.4s6.1 0 7.8-.4c.9-.2 1.6-.9 1.8-1.8.4-1.8.4-4.8.4-4.8s0-3-.4-4.8z"/><path fill="#fff" d="M10 15.5v-7l6 3.5-6 3.5z"/>',
  mailF:'<rect x="2" y="4" width="20" height="16" rx="3" fill="#EA4335"/><path fill="#fff" d="M4 7l8 6 8-6v2l-8 6-8-6V7z"/>',
  check:'<path d="M5 12l5 5 9-10"/>',
  warn:'<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  moon:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  refresh:'<path d="M20 11a8 8 0 0 0-14-4M4 5v3h3M4 13a8 8 0 0 0 14 4M20 19v-3h-3"/>'
};
const BRAND_ICONS = new Set(['waF','tgF','igF','xxF','ytF','mailF']);
const ic = (name, size = 20) => {
  if (BRAND_ICONS.has(name))
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${I[name]}</svg>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] || I.box}</svg>`;
};

/* ---------- 3. Translations ---------- */
const T = {
  ar: {
    ph:'ابحث…', home:'الرئيسية', fav:'المفضلة', cart:'السلة', ord:'طلباتي', all:'الكل', add:'أضف', buy:'شراء',
    none:'لا يوجد', sub:'المجموع الفرعي', dis:'الخصم', tot:'الإجمالي', cc:'كود الخصم', ap:'تطبيق', co:'تأكيد الطلب',
    ce:'سلتك فارغة', acc:'حسابي', login:'دخول', out:'خروج', nl:'الاسم', em:'البريد', pw:'كلمة المرور',
    wel:'مرحباً', reg:'حساب جديد', has:'لديك حساب؟', no:'ليس لديك حساب؟', lreq:'سجل الدخول أولاً',
    d:['رابط','بيانات','ملف','تنفيذ'], sup:'دعم', rt:'© 2026 AMARIX007. جميع الحقوق محفوظة.',
    added:'أُضيف إلى السلة', acclink:'رابط الحساب', needlink:'أدخل رابط الحساب للخدمات المطلوبة',
    cpnok:'تم تطبيق الكوبون', cpnbad:'كود الخصم غير صحيح', cpnrm:'إزالة', cpnon:'كوبون مُفعّل',
    waorder:'اطلب عبر واتساب', waunset:'رقم واتساب غير مُعد بعد', wahint:'يُرسل تفاصيل طلبك إلى واتساب لإتمام الدفع',
    ordfail:'تعذّر إنشاء الطلب. حاول مرة أخرى.', sesexp:'انتهت الجلسة، سجّل الدخول من جديد',
    donet:'تم استلام طلبك', doned:'سنتواصل معك قريباً لإتمام الدفع والتسليم.', ordno:'رقم الطلب',
    vieword:'عرض طلباتي', keep:'متابعة التسوق', wacontact:'تواصل عبر واتساب',
    date:'التاريخ', status:'الحالة', items:'تفاصيل الطلب', qty:'الكمية', noord:'لا توجد طلبات بعد',
    noordd:'عندما تُنشئ طلباً سيظهر هنا.', loaderr:'تعذّر التحميل', retry:'إعادة المحاولة', loading:'جارٍ التحميل…',
    s_new:'جديد', s_processing:'قيد التنفيذ', s_paid:'تم الدفع', s_done:'مكتمل', s_cancelled:'ملغي',
    capt:'تحقق بشري', capbad:'إجابة التحقق غير صحيحة', welcome:'مرحباً', hello:'أهلاً بك', saved:'تم',
    regok:'تم إنشاء الحساب بنجاح. أرسلنا رسالة تأكيد إلى بريدك الإلكتروني — افتحها واضغط رابط التأكيد ثم سجّل الدخول.',
    loggedin:'تم تسجيل الدخول',
    weak:'ضعيفة', mid:'متوسطة', good:'جيدة', strong:'قوية', theme:'تبديل المظهر', ordcnt:'طلب',
    badlogin:'البريد أو كلمة المرور غير صحيحة', unconf:'يرجى تأكيد بريدك أولاً', exists:'هذا البريد مسجّل مسبقاً',
    shortpw:'كلمة المرور قصيرة (6 أحرف على الأقل)', net:'تعذّر الاتصال بالخادم', total:'الإجمالي', coupon:'الكوبون',
    link:'الرابط', unitp:'سعر الوحدة', unavail:'منتج غير متاح', openwa:'فتح واتساب', hi:'مرحباً AMARIX007،',
    forgot:'نسيت كلمة المرور؟', resetpw:'استعادة كلمة المرور', resetsent:'أُرسل رابط إعادة التعيين إلى بريدك إن كان مسجّلاً.',
    sendreset:'إرسال رابط الاستعادة', backlogin:'العودة لتسجيل الدخول', paymethods:'وسائل الدفع المتاحة',
    payhint:'بعد إنشاء الطلب سنتواصل معك لإتمام الدفع عبر إحدى الوسائل التالية'
  },
  en: {
    ph:'Search…', home:'Home', fav:'Wishlist', cart:'Cart', ord:'Orders', all:'All', add:'Add', buy:'Buy',
    none:'No results', sub:'Subtotal', dis:'Discount', tot:'Total', cc:'Coupon code', ap:'Apply', co:'Confirm order',
    ce:'Your cart is empty', acc:'Account', login:'Sign in', out:'Sign out', nl:'Name', em:'Email', pw:'Password',
    wel:'Welcome', reg:'Sign up', has:'Have an account?', no:'No account?', lreq:'Please sign in first',
    d:['Link','Creds','File','Custom'], sup:'Support', rt:'© 2026 AMARIX007. All rights reserved.',
    added:'Added to cart', acclink:'Account link', needlink:'Enter the account link for the services that need it',
    cpnok:'Coupon applied', cpnbad:'Invalid coupon code', cpnrm:'Remove', cpnon:'Coupon active',
    waorder:'Order via WhatsApp', waunset:'WhatsApp number is not configured yet', wahint:'Sends your order details to WhatsApp to complete payment',
    ordfail:'Could not create the order. Please try again.', sesexp:'Session expired, please sign in again',
    donet:'Your order was received', doned:'We will contact you shortly to complete payment and delivery.', ordno:'Order number',
    vieword:'View my orders', keep:'Keep shopping', wacontact:'Contact on WhatsApp',
    date:'Date', status:'Status', items:'Order details', qty:'Qty', noord:'No orders yet',
    noordd:'Your orders will appear here once you place one.', loaderr:'Could not load', retry:'Retry', loading:'Loading…',
    s_new:'New', s_processing:'In progress', s_paid:'Paid', s_done:'Completed', s_cancelled:'Cancelled',
    capt:'Human check', capbad:'Wrong answer to the human check', welcome:'Welcome', hello:'Hello', saved:'Done',
    regok:'Account created successfully. We sent a confirmation email — open it, click the confirm link, then sign in.',
    loggedin:'Signed in',
    weak:'Weak', mid:'Fair', good:'Good', strong:'Strong', theme:'Toggle theme', ordcnt:'order',
    badlogin:'Incorrect email or password', unconf:'Please confirm your email first', exists:'This email is already registered',
    shortpw:'Password too short (min 6 characters)', net:'Could not reach the server', total:'Total', coupon:'Coupon',
    link:'Link', unitp:'Unit price', unavail:'Unavailable product', openwa:'Open WhatsApp', hi:'Hello AMARIX007,',
    forgot:'Forgot password?', resetpw:'Reset password', resetsent:'If this email is registered, a reset link was sent.',
    sendreset:'Send reset link', backlogin:'Back to sign in', paymethods:'Available payment methods',
    payhint:'After placing your order we will contact you to complete payment via one of these methods'
  }
};

/* ---------- 4. State & storage ---------- */
const ls = {
  json(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  get(key, fallback = null) { try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch {} },
  del(key) { try { localStorage.removeItem(key); } catch {} }
};

let CFG, C, P, E, BN, CP, R, SOC, BASE;      // store config (categories, products, embeds, banners, coupons, rates)
let lang   = ls.get('lang', 'ar');
let cur    = ls.get('cur', 'SAR');
let th     = ls.get('th', 'dark');
let cart   = ls.json('cart', []);
let fav    = ls.json('fav', []);
let coupon = ls.get('amx_coupon', '');
let user   = null;                           // Supabase user object when signed in
let profileName = '';                        // name from profiles table (best effort)
let q = '';                                  // search query
let returnTo = '';                           // where to go after login
let lastOrder = null;                        // info for the success page
let routeSeq = 0;                            // guards async pages against stale renders
let loadingCfg = true;                       // true until the remote config answered

if (!T[lang]) lang = 'ar';

/* Config: embedded store-data.js, overridden by a newer remote copy */
function setCfg(cfg) {
  CFG = cfg; SOC = cfg.social || {};
  C = (CFG.categories || []).map(c => ({ ty:'shop', ...c,
    ar:ex(c.ar), en:ex(c.en), da:ex(c.da), de:ex(c.de),
    f:(c.f || []).map(f => ({ ...f, ar:ex(f.ar), en:ex(f.en), o:f.o || [] })) }));
  P = (CFG.products || []).map(p => ({ tg:'', sp:'', t:0, r:5, n:0, o:0, d:0, ...p,
    ar:ex(p.ar), en:ex(p.en), sp:ex(p.sp), images:p.images || [] })).filter(p => C.some(c => c.id == p.c));
  E  = CFG.embeds || [];
  BN = (CFG.banners || []).map(b => ({ ...b, ar:ex(b.ar), en:ex(b.en), sa:ex(b.sa), se:ex(b.se) }));
  CP = CFG.coupons || {};
  R  = CFG.rates && Object.keys(CFG.rates).length ? CFG.rates : { SAR:[1, 'ر.س'] };
  BASE = (Object.entries(R).find(([, v]) => +v[0] === 1) || ['SAR'])[0];
  if (!R[cur]) cur = BASE;
  cleanCart();
}

/* ---------- 5. Helpers ---------- */
const $  = s => document.querySelector(s);
const ex = x => String(x ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');   // HTML-escape
const safeUrl = u => { u = String(u || '').trim(); return /^(https?:|mailto:|tel:|#|\/|\.\/)/i.test(u) ? u : ''; };
const t = k => (T[lang] && T[lang][k]) || k;
const cat  = id => C.find(c => c.id == id);
const prod = id => P.find(p => p.id == id);
const pr   = p => p.p * (1 - (p.d || 0) / 100);                        // unit price after product discount (base currency)
const fmt  = v => { const x = (v * R[cur][0]).toFixed(2); return cur == 'USD' || cur == 'EUR' ? R[cur][1] + x : x + ' ' + R[cur][1]; };
const money = v => `<bdi dir="ltr">${fmt(v)}</bdi>`;
const nameOf = () => profileName || (user && user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || '';

function save() {
  ls.set('cart', cart); ls.set('fav', fav); ls.set('lang', lang); ls.set('cur', cur); ls.set('th', th); ls.set('amx_coupon', coupon);
}

/* Toast: type = 'ok' | 'er' | 'wn' */
let toastTimer;
function toast(msg, type = 'ok') {
  const el = $('#ts');
  el.innerHTML = ic(type == 'er' ? 'x' : type == 'wn' ? 'warn' : 'check', 16) + '<span></span>';
  el.lastChild.textContent = msg;
  el.className = 's ' + type;
  el.setAttribute('role', type == 'er' ? 'alert' : 'status');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, type == 'ok' ? 1800 : 3600);
}

/* Button loading state */
function setBusy(btn, on) {
  if (!btn) return;
  if (on) { btn.dataset.html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>' + btn.textContent; }
  else if (btn.dataset.html != null) { btn.innerHTML = btn.dataset.html; btn.disabled = false; delete btn.dataset.html; }
}
const loadingBox = () => `<div class="loading"><span class="spin"></span>${t('loading')}</div>`;
const skeletonGrid = () => `<div class="sk sm" style="margin-bottom:12px"></div><div class="grid">${'<div class="sk"></div>'.repeat(4)}</div>`;

/* Pretty placeholder for products without an image */
const hue = s => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return 110 + h % 60; };
function placeholder(p, c) {
  const letter = [...String(p.en || p.ar || '?').replace(/&#\d+;/g, '').trim()][0] || '?';
  return `<span class="ph" style="--h:${hue(p.id)}">${ic((c && c.i) || 'box', 36)}<em>${ex(letter.toUpperCase())}</em></span>`;
}
const art = (p, c) => p.img ? `<img class="pim" loading="lazy" src="${ex(p.img)}" alt="" data-ph="${ex(p.id)}">` : placeholder(p, c);
// If a product image fails to load, swap in the placeholder
document.addEventListener('error', e => {
  const el = e.target;
  if (el && el.tagName == 'IMG' && el.dataset.ph) { const p = prod(el.dataset.ph); if (p) el.outerHTML = placeholder(p, cat(p.c)); }
}, true);

/* ---------- 6. Supabase client (anon key + user JWT) ---------- */
const jwtExp = tk => { try { return JSON.parse(atob(tk.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp || 0; } catch { return 0; } };

function storeSession(j) {
  if (j.access_token) ls.set('amx_token', j.access_token);
  if (j.refresh_token) ls.set('amx_refresh', j.refresh_token);
  if (j.user) { ls.set('amx_user', j.user); user = j.user; }
}
function clearSession() {
  ['amx_token', 'amx_refresh', 'amx_user'].forEach(ls.del); user = null; profileName = '';
}
/* Returns a valid access token (refreshing if needed) or null when signed out */
async function getToken() {
  const tk = ls.get('amx_token');
  if (!tk) return null;
  if (jwtExp(tk) - 60 > Date.now() / 1000) return tk;
  const rt = ls.get('amx_refresh');
  if (!rt) { clearSession(); return null; }
  try {
    const r = await fetch(SB_URL + '/auth/v1/token?grant_type=refresh_token', {
      method:'POST', headers:{ apikey:SB_KEY, 'Content-Type':'application/json' }, body:JSON.stringify({ refresh_token:rt }) });
    const j = await r.json();
    if (!r.ok) throw new Error('refresh');
    storeSession(j); return j.access_token;
  } catch (err) {
    if (!navigator.onLine) return tk;          // offline: keep session, request will fail on its own
    clearSession(); return null;
  }
}
/* Generic REST helper. auth:false -> anon key only. */
async function sb(path, { method = 'GET', body, auth = true, prefer } = {}) {
  const tk = auth ? await getToken() : null;
  const headers = { apikey:SB_KEY, Authorization:'Bearer ' + (tk || SB_KEY), 'Content-Type':'application/json' };
  if (prefer) headers.Prefer = prefer;
  return fetch(SB_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

/* ---------- 7. Cart, coupon & totals ---------- */
function cleanCart() { cart = cart.filter(x => x && prod(x.id) && x.q > 0); }
const cartLines = () => cart.map(x => ({ x, p:prod(x.id) })).filter(l => l.p);
const cartCount = () => cart.reduce((s, x) => s + x.q, 0);

/* Coupon format in store-data.js:  CODE: [percent, fixedAmountInBaseCurrency]  e.g. "AMARIX10": [10, 0] */
function totals() {
  const sub = cartLines().reduce((s, l) => s + pr(l.p) * l.x.q, 0);
  const cp = coupon && CP[coupon];
  const disc = cp ? Math.min(sub, sub * (+cp[0] || 0) / 100 + (+cp[1] || 0)) : 0;
  return { sub, disc, total: Math.max(0, sub - disc) };
}
function addToCart(id) {
  const x = cart.find(c => c.id == id);
  x ? x.q++ : cart.push({ id, q:1 });
  save(); nav();
}

/* ---------- 8. Views ---------- */
function card(p) {
  const c = cat(p.c), old = p.o > pr(p) ? `<s>${money(p.o)}</s>` : '';
  const rating = p.n ? `<div class="rt">★ ${(+p.r).toFixed(1)} <small>(${p.n})</small></div>` : '';
  return `<div class="cd">
    <button class="hb ${fav.includes(p.id) ? 'on' : ''}" data-a="fav" data-id="${ex(p.id)}" aria-label="${t('fav')}">${ic('heart', 16)}</button>
    ${p.d > 0 ? `<i class="bd">-${Math.round(p.d)}%</i>` : ''}
    <a class="art" href="#/p/${ex(p.id)}">${art(p, c)}</a>
    <div class="bd2"><small>${c[lang]}</small><a href="#/p/${ex(p.id)}"><h3>${p[lang]}</h3></a>${rating}
      <div class="pr"><b class="n">${money(pr(p))}</b>${old}</div>
      <button class="b" data-a="add" data-id="${ex(p.id)}">${t('add')}</button></div></div>`;
}
const grid = a => a.length ? `<div class="grid">${a.map(card).join('')}</div>` : `<p class="emp">${t('none')}</p>`;
const ico = (o, z) => o.image_url ? `<img src="${ex(o.image_url)}" alt="">` : ic(o.i || 'box', z);

function head() {
  const root = document.documentElement, col = (CFG.site && CFG.site.col) || {};
  root.lang = lang; root.dir = lang == 'ar' ? 'rtl' : 'ltr'; root.dataset.theme = th;
  // Brand colours edited in the admin panel
  ['g', 'm', 'ac'].forEach(k => { if (/^#[0-9a-f]{3,8}$/i.test(col[k] || '')) root.style.setProperty('--' + k, col[k]); });
  const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = th == 'dark' ? '#121212' : '#F8FAF9';
  const logo = CFG.site.logo;
  if (logo) $('.logo .tile').innerHTML = `<img src="${ex(logo)}" alt="">`;
  $('#bn').innerHTML = `${ex(CFG.site.n1)}<b>${ex(CFG.site.n2)}</b>`;
  $('#sb').textContent = lang == 'ar' ? CFG.site.sa : CFG.site.se;
  $('#q').placeholder = t('ph');
  $('#ctl').innerHTML =
    `<select class="sel" data-a="cur" aria-label="currency">${Object.keys(R).map(k => `<option ${k == cur ? 'selected' : ''}>${k}</option>`).join('')}</select>` +
    `<button class="ib" data-a="theme" aria-label="${t('theme')}">${ic(th == 'dark' ? 'sun' : 'moon', 18)}</button>` +
    `<button class="ib" data-a="lang">${lang == 'ar' ? 'EN' : 'ع'}</button>` +
    `<a class="ib" href="#/account" aria-label="${t('acc')}">${ic('user', 18)}</a>`;
  $('#sub-nav').innerHTML = C.map(c => `<a href="#/c/${ex(c.id)}">${c[lang]}</a>`).join('');
  footer();
  nav();
}

/* Official-style brand icons for social footer */
const SOC_ICON = { wa:'waF', tg:'tgF', ig:'igF', xx:'xxF', yt:'ytF', mail:'mailF' };
function footer() {
  const soc = Object.entries(SOC).map(([k, v]) => {
    const [i, u] = Array.isArray(v) ? v : [k, v];
    const href = safeUrl(u); if (!href) return '';
    const brand = SOC_ICON[i] || i;
    return `<a class="soc-a soc-${ex(i)}" href="${ex(href)}" target="_blank" rel="noopener" aria-label="${ex(k)}">${ic(brand, 20)}</a>`;
  }).join('');
  const site = CFG.site || {}, risk = site.risk && site.risk[lang], rt = (site.rt && site.rt[lang]) || t('rt');
  const pays = paymentMethodsHTML();
  $('#ft').innerHTML = (pays ? `<div class="pay-strip"><div class="pay-label">${t('paymethods')}</div><div class="pay-logos">${pays}</div></div>` : '')
    + (soc ? `<div class="soc">${soc}</div>` : '')
    + (risk ? `<p class="risk">${ex(risk)}</p>` : '') + `<p>${ex(rt)}</p>`;
}

/* Payment methods (customizable from admin via store_config.payments) */
const DEFAULT_PAYMENTS = [
  { id:'syriatel', name:'Syriatel Cash', name_ar:'سيرياتيل كاش', on:true, note:'', note_ar:'' },
  { id:'dam', name:'Dam Cash', name_ar:'ضام كاش', on:true, note:'', note_ar:'' },
  { id:'usdt', name:'USDT BEP20', name_ar:'USDT BEP20', on:true, note:'', note_ar:'' },
  { id:'binance', name:'Binance Pay', name_ar:'بايننس Pay', on:true, note:'', note_ar:'' }
];
const PAY_SVG = {
  syriatel: `<svg viewBox="0 0 48 48" width="36" height="36" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#E30613"/><text x="24" y="30" text-anchor="middle" fill="#fff" font-size="14" font-weight="800" font-family="Urbanist,sans-serif">SY</text></svg>`,
  dam: `<svg viewBox="0 0 48 48" width="36" height="36" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#0B3D91"/><text x="24" y="30" text-anchor="middle" fill="#fff" font-size="13" font-weight="800" font-family="Urbanist,sans-serif">DAM</text></svg>`,
  usdt: `<svg viewBox="0 0 48 48" width="36" height="36" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#26A17B"/><path fill="#fff" d="M27.5 21.2v-3.4h6.2V13H14.3v4.8h6.2v3.4C14.8 21.6 12 23.5 12 26.2c0 3.3 4.7 5.4 12 5.4s12-2.1 12-5.4c0-2.7-2.8-4.6-8.5-5zm-3.5 7.5c-5.2 0-8.1-1.4-8.1-2.5s2.9-2.5 8.1-2.5 8.1 1.4 8.1 2.5-2.9 2.5-8.1 2.5z"/></svg>`,
  binance: `<svg viewBox="0 0 48 48" width="36" height="36" aria-hidden="true"><rect width="48" height="48" rx="12" fill="#F0B90B"/><path fill="#1E2026" d="M24 10l3.5 3.5-7.2 7.2-3.5-3.5L24 10zm9.3 9.3l3.5 3.5-3.5 3.5-3.5-3.5 3.5-3.5zM14.7 19.3l3.5 3.5-3.5 3.5-3.5-3.5 3.5-3.5zM24 24.8l3.5 3.5-3.5 3.5-3.5-3.5 3.5-3.5zm0 9.5l7.2-7.2 3.5 3.5L24 41l-10.7-10.7 3.5-3.5L24 34.3z"/></svg>`
};
function paymentList() {
  const raw = (CFG && CFG.payments) || DEFAULT_PAYMENTS;
  return (Array.isArray(raw) ? raw : DEFAULT_PAYMENTS).filter(p => p && p.on !== false);
}
function paymentMethodsHTML() {
  return paymentList().map(p => {
    const label = lang == 'ar' ? (p.name_ar || p.name) : (p.name || p.name_ar);
    const svg = PAY_SVG[p.id] || `<span class="pay-fallback">${ex((label || '?')[0])}</span>`;
    return `<div class="pay-item" title="${ex(label)}">${svg}<span>${ex(label)}</span></div>`;
  }).join('');
}

function nav() {
  const r = (location.hash || '#/').split('?')[0].split('/')[1] || '', active = r == 'c' || r == 'p' ? '' : r == 'done' ? 'orders' : r;
  const n = cartCount(), v = $('#nv');
  const items = [['', 'home', 'home'], ['fav', 'heart', 'fav'], ['cart', 'cart', 'cart'], ['orders', 'box', 'ord'], ['account', 'user', 'acc']];
  v.innerHTML = items.map(([l, i, k]) =>
    `<a href="#/${l}" data-r="${l}">${ic(i, 20)}<span>${t(k)}</span>${k == 'cart' && n ? '<span class="cnt">' + n + '</span>' : ''}</a>`).join('');
  v.querySelectorAll('a').forEach(e => e.classList.toggle('on', e.dataset.r == active));
}

/* Home */
function partner() {
  const p = CFG.partner || {}, A = lang == 'ar';
  if (p.on === false || !safeUrl(p.url)) return '';
  return `<a class="pt" href="${ex(safeUrl(p.url))}" target="_blank" rel="noopener">
    <div class="pt-bg" style="${p.banner_bg_url ? `background-image:url('${ex(p.banner_bg_url)}')` : ''}"></div>
    <div class="pt-overlay"></div>
    <div class="pt-content">
      <span class="pt-logo">${p.logo ? `<img src="${ex(p.logo)}" alt="">` : ic('bank', 28)}</span>
      <span class="pc"><span class="pt-badge">${A ? 'شريك رسمي' : 'Official Partner'}</span>
        <b class="n pnm">${ex(p.name)}</b><span class="pd">${ex(A ? p.ar : p.en)}</span></span>
      <span class="b pbtn">${ex(A ? p.ba : p.be)} →</span>
    </div></a>`;
}
function home() {
  if (loadingCfg && !P.length) return skeletonGrid();
  if (q) return `<h2>${t('all')}</h2>` + grid(P.filter(p => hit(p, q)));
  return partner() +
    `<div class="ban${BN.length < 2 ? ' one' : ''}">${BN.map(b => `<div${b.img ? ` style="background:linear-gradient(135deg,rgba(0,0,0,.6),rgba(0,0,0,.35)),url('${ex(b.img)}') center/cover"` : ''}><h3>${b[lang]}</h3><p>${lang == 'ar' ? b.sa : b.se}</p><a class="b" href="${ex(safeUrl(b.h) || '#/')}">${ic('bolt', 14)} ${t('all')}</a></div>`).join('')}</div>
    ${BN.length > 1 ? `<div class="dots">${BN.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>` : ''}
    <div class="tiles" style="margin-top:14px">${C.map(c => `<a class="ct" href="#/c/${ex(c.id)}"><span class="tile">${ico(c, 20)}</span><span><b>${c[lang]}</b></span></a>`).join('')}</div>
    <h2>${t('all')}</h2>${grid(P)}`;
}

/* Category (also renders the embeds that belong to it) */
function catPage(id) {
  const c = cat(id); if (!c) return home();
  const embeds = E.filter(e => e.c == id).map(e => `<div class="box"><h3>${ex(lang == 'ar' ? e.ar : e.en)}</h3><p class="pd">${ex(lang == 'ar' ? e.da : e.de)}</p>
    ${safeUrl(e.u) ? `<iframe src="${ex(safeUrl(e.u))}" loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" style="width:100%;height:${+e.h || 420}px;border:0;border-radius:12px;margin-top:8px"></iframe>` : ''}</div>`).join('');
  if (c.embed_url) return `<div class="box"><h1>${c[lang]}</h1><p class="pd">${lang == 'ar' ? c.da : c.de}</p><iframe src="${ex(safeUrl(c.embed_url))}" loading="lazy" style="width:100%;height:500px;border:0;border-radius:12px"></iframe></div>${embeds}`;
  return `<div class="box row"><span class="tile big">${ico(c, 30)}</span><div style="flex:1"><h1>${c[lang]}</h1><p class="pd">${lang == 'ar' ? c.da : c.de}</p></div></div>${embeds}${c.ty == 'embed' && embeds ? '' : grid(P.filter(p => p.c == id))}`;
}

/* Product */
function prodPage(id) {
  const p = prod(id); if (!p) return home();
  const c = cat(p.c), old = p.o > pr(p) ? `<s>${money(p.o)}</s>` : '', imgs = [p.img, ...(p.images || [])].filter(Boolean);
  const gallery = imgs.length
    ? `<div class="main-img"><img src="${ex(imgs[0])}" id="main-img" alt="" data-ph="${ex(p.id)}"></div>${imgs.length > 1 ? `<div class="thumbs">${imgs.map((u, i) => `<img src="${ex(u)}" alt="" class="${i ? '' : 'on'}" data-a="thumb">`).join('')}</div>` : ''}`
    : `<div class="main-img">${placeholder(p, c)}</div>`;
  return `<div class="box"><div class="gallery">${gallery}</div>
    <h1>${p[lang]}</h1>${p.sp ? `<div class="spec">${p.sp}</div>` : ''}
    ${p.n ? `<div class="rt">★ ${(+p.r).toFixed(1)} <small>(${p.n})</small></div>` : ''}
    <div class="pr" style="margin:8px 0 12px"><b class="n">${money(pr(p))}</b>${old}</div>
    <div class="row"><button class="b" style="flex:1" data-a="buy" data-id="${ex(p.id)}">${t('buy')}</button><button class="b b2" style="flex:1" data-a="add" data-id="${ex(p.id)}">${t('add')}</button></div></div>
    ${p.ds && p.ds[lang] ? `<div class="box"><p class="pd">${ex(p.ds[lang])}</p></div>` : ''}`;
}

/* Cart with order summary, coupon and the two ways to order */
function cartPage() {
  const lines = cartLines();
  if (!lines.length) return `<p class="emp">${ic('cart', 40)}<br>${t('ce')}</p>`;
  const T_ = totals(), cp = coupon && CP[coupon];
  const rows = lines.map(({ x, p }) => `<div class="box"><div class="line">
      <a class="thumb" href="#/p/${ex(p.id)}">${art(p, cat(p.c))}</a>
      <div class="info"><b>${p[lang]}</b><div class="n">${money(pr(p))}</div>
        ${cat(p.c).ty == 'boost' ? `<input class="inp" style="margin-top:6px;width:100%" data-a="lk" data-id="${ex(p.id)}" value="${ex(x.l || '')}" placeholder="${t('acclink')}" dir="ltr">` : ''}</div>
      <span class="q"><button data-a="q" data-id="${ex(p.id)}" data-d="-1" aria-label="-">−</button><b class="n">${x.q}</b><button data-a="q" data-id="${ex(p.id)}" data-d="1" aria-label="+">+</button></span>
      <button class="ib" data-a="rm" data-id="${ex(p.id)}" aria-label="remove">✕</button></div></div>`).join('');
  const couponBox = cp
    ? `<div class="cpn-on"><span>${ic('check', 14)} ${t('cpnon')}: <b dir="ltr">${ex(coupon)}</b></span><button data-a="cpnrm">${t('cpnrm')}</button></div>`
    : `<div class="cpn"><input class="inp" id="cpn" dir="ltr" placeholder="${t('cc')}" autocomplete="off"><button class="b b2" data-a="coupon">${t('ap')}</button></div>`;
  return rows + `<div class="box">
    ${couponBox}
    <div class="sum">
      <div class="row"><span>${t('sub')}</span><b class="n">${money(T_.sub)}</b></div>
      ${T_.disc > 0 ? `<div class="row disc"><span>${t('dis')}</span><b class="n">− ${money(T_.disc)}</b></div>` : ''}
      <div class="row tot"><span>${t('tot')}</span><b class="n">${money(T_.total)}</b></div>
    </div>
    <div class="pay">
      <button class="b" data-a="co">${ic('check', 16)} ${t('co')}</button>
      <button class="b wa" data-a="wa">${ic('wa', 16)} ${t('waorder')}</button>
    </div>
    <div class="pay-methods-box">
      <div class="pay-label">${t('paymethods')}</div>
      <div class="pay-logos">${paymentMethodsHTML()}</div>
      <p class="hint">${t('payhint')}</p>
    </div>
    <p class="hint">${t('wahint')}</p></div>`;
}

/* Success page after an order */
function donePage(id) {
  const o = lastOrder && lastOrder.id == id ? lastOrder : { id };
  return `<div class="box done"><div class="okc">${ic('check', 36)}</div><h1>${t('donet')}</h1>
    <p class="pd">${t('doned')}</p><div class="oid" dir="ltr">${ex(o.id)}</div>
    ${o.total != null ? `<p class="pd">${t('tot')}: <b class="n">${money(o.total)}</b></p>` : ''}
    <div class="acts"><a class="b" href="#/orders">${ic('box', 16)} ${t('vieword')}</a>
      ${waNumber() ? `<button class="b wa" data-a="wa-contact" data-id="${ex(o.id)}">${ic('wa', 16)} ${t('wacontact')}</button>` : ''}
      <a class="b b2" href="#/">${t('keep')}</a></div></div>`;
}

/* Auth — login / signup / forgot password */
function logoMark(size = 40) {
  const site = (CFG && CFG.site) || {};
  if (site.logo) return `<img src="${ex(site.logo)}" alt="" width="${size}" height="${size}" style="border-radius:12px;object-fit:cover">`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" fill="none"><path d="M6.5 25.5L14 7L16.5 12" stroke="#A7E8BD" stroke-width="2.75" stroke-linecap="round"/><path d="M10 18.5H19" stroke="#52B788" stroke-width="2.25"/><path d="M16.5 12L20.5 18L26 8" stroke="#A7E8BD" stroke-width="2.75" stroke-linecap="round"/><circle cx="26" cy="8" r="1.75" fill="#A7E8BD"/></svg>`;
}
function captchaBox() {
  window.capA = Math.floor(Math.random() * 8) + 2;
  window.capB = Math.floor(Math.random() * 8) + 2;
  return `<div class="cap-box">
    <div class="cap-head">${logoMark(28)}<span>${t('capt')}</span></div>
    <div class="cap-q"><span class="cap-num">${window.capA}</span><span class="cap-op">+</span><span class="cap-num">${window.capB}</span><span class="cap-op">=</span>
      <input class="inp cap-inp" name="cap" type="number" inputmode="numeric" required placeholder="؟" autocomplete="off" aria-label="${t('capt')}"></div>
  </div>`;
}
function authPage() {
  const mode = window.authMode || (window.regMode ? 'reg' : 'login'); // login | reg | forgot
  if (mode === 'forgot') {
    return `<form class="box au" id="af-forgot" novalidate>
      <div class="au-logo">${logoMark(48)}</div>
      <h2 style="justify-content:center;margin-top:0">${t('resetpw')}</h2>
      <p class="pd" style="text-align:center;margin-bottom:12px">${lang == 'ar' ? 'أدخل بريدك وسنرسل رابط إعادة تعيين كلمة المرور.' : 'Enter your email and we will send a password reset link.'}</p>
      <label class="fld"><span>${t('em')}</span><input class="inp" name="e" type="email" dir="ltr" autocomplete="email" required></label>
      ${captchaBox()}
      <p class="err" id="er" role="alert"></p>
      <button class="b block" type="submit">${t('sendreset')}</button>
      <a href="#" data-a="toggle-mode" data-mode="login" style="display:block;text-align:center;margin-top:12px;font-size:12px">${t('backlogin')}</a></form>`;
  }
  const up = mode === 'reg';
  return `<form class="box au" id="af" novalidate>
    <div class="au-logo">${logoMark(48)}</div>
    <h2 style="justify-content:center;margin-top:0">${up ? t('reg') : t('login')}</h2>
    ${up ? `<label class="fld"><span>${t('nl')}</span><input class="inp" name="n" autocomplete="name" required></label>` : ''}
    <label class="fld"><span>${t('em')}</span><input class="inp" name="e" type="email" dir="ltr" autocomplete="email" required></label>
    <label class="fld"><span>${t('pw')}</span><div class="pw"><input class="inp" name="p" type="password" id="pw-input" autocomplete="${up ? 'new-password' : 'current-password'}" required>
      <button type="button" data-a="pw" aria-label="show">${ic('eye', 18)}</button></div>
      ${up ? `<div class="strength-bar"><div id="pw-fill"></div></div><small id="pw-text" style="font-size:11px"></small>` : ''}</label>
    ${captchaBox()}
    <p class="err" id="er" role="alert"></p>
    <button class="b block" type="submit">${up ? t('reg') : t('login')}</button>
    ${!up ? `<a href="#" data-a="toggle-mode" data-mode="forgot" class="forgot-link">${t('forgot')}</a>` : ''}
    <a href="#" data-a="toggle-mode" data-mode="${up ? 'login' : 'reg'}" style="display:block;text-align:center;margin-top:10px;font-size:12px">${up ? t('has') : t('no')}</a></form>`;
}
function accPage() {
  const name = nameOf(), shown = name || user.email.split('@')[0];
  return `<div class="box row" style="justify-content:flex-start;gap:14px"><span class="tile big"><b class="n" style="font-size:26px">${ex([...shown][0] || 'U')}</b></span>
    <div style="min-width:0"><h1>${t('wel')}${name ? '، ' + ex(name) : ''}</h1><bdi dir="ltr" class="sb">${ex(user.email)}</bdi></div></div>
    <a class="box row" href="#/orders" style="display:flex"><span>${t('ord')}</span>${ic('box', 18)}</a>
    <button class="b b2 block" data-a="out">${t('out')}</button>`;
}
function favPage() {
  const a = P.filter(p => fav.includes(p.id));
  return a.length ? grid(a) : `<p class="emp">${ic('heart', 40)}<br>${t('none')}</p>`;
}

/* ---------- 10. Orders ---------- */
const orderId = () => 'AMX-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();
const fmtDate = d => { try { return new Date(d).toLocaleString(lang == 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { dateStyle:'medium', timeStyle:'short' }); } catch { return d || ''; } };

function waNumber() {
  const w = SOC.whatsapp; const m = w && String(w[1] || '').match(/(\d{7,15})/);
  return m ? m[1] : '';
}
function buildWhatsAppText(id, lines, tt) {
  const L = lines.map(({ x, p }) => `• ${(p[lang] || '').replace(/&#\d+;/g, '')} × ${x.q} — ${fmt(pr(p) * x.q)}${x.l ? '\n   ' + t('link') + ': ' + x.l : ''}`);
  return [t('hi'), id ? `${t('ordno')}: ${id}` : '', '', ...L, '',
    coupon && tt.disc > 0 ? `${t('coupon')}: ${coupon} (− ${fmt(tt.disc)})` : '',
    `${t('total')}: ${fmt(tt.total)}`].filter((v, i, a) => v !== '' || (a[i - 1] !== '' && i)).join('\n').trim();
}
function openWhatsApp(text, win) {
  const num = waNumber(), url = `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  if (win && !win.closed) win.location.href = url;
  else if (!window.open(url, '_blank', 'noopener')) location.href = url;
}

/* Create a real order in Supabase (requires a signed-in user) */
async function placeOrder(btn, viaWhatsApp = false) {
  const lines = cartLines();
  if (!lines.length) return toast(t('ce'), 'wn');
  if (viaWhatsApp && !waNumber()) return toast(t('waunset'), 'wn');
  if (lines.some(l => cat(l.p.c).ty == 'boost' && !(l.x.l || '').trim())) return toast(t('needlink'), 'wn');
  const tt = totals();

  if (!user) {                                              // guests: WhatsApp still works, otherwise go sign in
    if (viaWhatsApp) return openWhatsApp(buildWhatsAppText(null, lines, tt));
    returnTo = '#/cart'; toast(t('lreq'), 'wn'); location.hash = '#/login'; return;
  }

  const waWin = viaWhatsApp ? window.open('', '_blank') : null;   // opened synchronously so popup blockers allow it
  setBusy(btn, true);
  const id = orderId();
  try {
    const r = await sb('/rest/v1/orders', { method:'POST', prefer:'return=minimal', body:{
      id,                                                   // text order number (kept for backward compatibility)
      user_id: user.id,
      customer_name: nameOf() || user.email,
      customer_email: user.email,
      items: lines.map(({ x, p }) => ({ id:p.id, name:(p[lang] || '').replace(/&#\d+;/g, ''), ar:(p.ar || '').replace(/&#\d+;/g, ''), en:(p.en || '').replace(/&#\d+;/g, ''), q:x.q, link:x.l || '', price:+pr(p).toFixed(2) })),
      total: +tt.total.toFixed(2),
      currency: BASE,
      coupon: coupon && tt.disc > 0 ? coupon : null,
      status: 'new',
      lang
      // created_at: filled by the database default now() (client clocks are not trusted)
    } });
    if (r.status == 401) { clearSession(); throw Object.assign(new Error('session'), { session:true }); }
    if (!r.ok) throw new Error(await r.text());
    lastOrder = { id, total: tt.total };
    if (viaWhatsApp) openWhatsApp(buildWhatsAppText(id, lines, tt), waWin);
    cart = []; coupon = ''; save(); nav();
    location.hash = '#/done/' + id;
  } catch (err) {
    if (waWin) waWin.close();
    console.error('[AMARIX] order failed', err);
    if (err.session) { returnTo = '#/cart'; toast(t('sesexp'), 'er'); location.hash = '#/login'; }
    else toast(navigator.onLine ? t('ordfail') : t('net'), 'er');
  } finally { setBusy(btn, false); }
}

function ordersHTML(rows) {
  if (!rows.length) return `<p class="emp">${ic('box', 40)}<br><b>${t('noord')}</b><br><small>${t('noordd')}</small></p>`;
  return `<h2>${t('ord')} <button class="ib" data-a="reload" aria-label="${t('retry')}">${ic('refresh', 16)}</button></h2>` + rows.map(o => {
    let items = o.items; if (typeof items == 'string') { try { items = JSON.parse(items); } catch { items = []; } }
    items = Array.isArray(items) ? items : [];
    const st = ORDER_STATUSES.includes(o.status) ? o.status : 'new';
    const cur0 = o.currency && R[o.currency] ? o.currency : BASE;
    const total = `<bdi dir="ltr">${(o.total * R[cur][0] / R[cur0][0]).toFixed(2)} ${ex(R[cur][1])}</bdi>`;
    return `<div class="box ord"><div class="ord-h"><div><div class="ord-id" dir="ltr">${ex(o.id)}</div><div class="ord-meta">${fmtDate(o.created_at)}</div></div>
      <div style="text-align:end"><span class="stt ${st}">${t('s_' + st)}</span><div class="ord-t n">${total}</div></div></div>
      <details><summary>${t('items')} (${items.length})</summary><div class="ord-items">${items.map(i =>
        `<div class="row"><div style="min-width:0"><b>${ex(i[lang] || i.name)}</b><small>${t('unitp')}: ${ex(i.price)}${i.link ? ' · ' + ex(i.link) : ''}</small></div><span class="n">× ${ex(i.q)}</span></div>`).join('')}
        ${o.coupon ? `<div class="row"><span>${t('coupon')}</span><b dir="ltr">${ex(o.coupon)}</b></div>` : ''}</div></details></div>`;
  }).join('');
}
async function ordersPage(seq) {
  $('#m').innerHTML = loadingBox();
  try {
    const r = await sb(`/rest/v1/orders?select=*&user_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=100`);
    if (r.status == 401) { clearSession(); returnTo = '#/orders'; location.hash = '#/login'; return; }
    if (!r.ok) throw new Error(await r.text());
    const rows = await r.json();
    if (seq === routeSeq) $('#m').innerHTML = ordersHTML(rows);
  } catch (err) {
    console.error('[AMARIX] load orders', err);
    if (seq === routeSeq) $('#m').innerHTML = `<div class="emp">${t('loaderr')}<br><br><button class="b b2" data-a="reload">${t('retry')}</button></div>`;
  }
}

/* ---------- 9. Actions ---------- */
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a, id = b.dataset.id;
  if (a == 'add') { addToCart(id); toast(t('added')); }
  else if (a == 'buy') { addToCart(id); location.hash = '#/cart'; }
  else if (a == 'fav') { fav = fav.includes(id) ? fav.filter(x => x != id) : [...fav, id]; save(); render(); }
  else if (a == 'q') { const x = cart.find(c => c.id == id); if (!x) return; x.q += +b.dataset.d; if (x.q < 1) cart = cart.filter(c => c.id != id); save(); render(); }
  else if (a == 'rm') { cart = cart.filter(c => c.id != id); save(); render(); }
  else if (a == 'coupon') {
    const code = ($('#cpn').value || '').trim().toUpperCase();
    if (code && CP[code]) { coupon = code; save(); render(); toast(t('cpnok')); } else toast(t('cpnbad'), 'er');
  }
  else if (a == 'cpnrm') { coupon = ''; save(); render(); }
  else if (a == 'co') placeOrder(b, false);
  else if (a == 'wa') placeOrder(b, true);
  else if (a == 'wa-contact') openWhatsApp(`${t('hi')}\n${t('ordno')}: ${id}`);
  else if (a == 'reload') render();
  else if (a == 'thumb') {
    $('#main-img').src = b.src; document.querySelectorAll('.thumbs img').forEach(x => x.classList.remove('on')); b.classList.add('on');
  }
  else if (a == 'pw') { const i = $('#pw-input'); i.type = i.type == 'password' ? 'text' : 'password'; }
  else if (a == 'theme') { th = th == 'dark' ? 'light' : 'dark'; save(); head(); }
  else if (a == 'lang') { lang = lang == 'ar' ? 'en' : 'ar'; save(); head(); render(); }
  else if (a == 'toggle-mode') {
    e.preventDefault();
    const m = b.dataset.mode;
    if (m) { window.authMode = m; window.regMode = m === 'reg'; }
    else { window.regMode = !window.regMode; window.authMode = window.regMode ? 'reg' : 'login'; }
    render();
  }
  else if (a == 'out') {
    const tk = ls.get('amx_token');
    clearSession(); render();
    if (tk) fetch(SB_URL + '/auth/v1/logout', { method:'POST', headers:{ apikey:SB_KEY, Authorization:'Bearer ' + tk } }).catch(() => {});
    returnTo = ''; location.hash = '#/';
  }
  playClick();
});
document.addEventListener('change', e => {
  if (e.target.dataset.a == 'cur') { cur = e.target.value; save(); render(); }
});
document.addEventListener('keydown', e => {
  if (e.key == 'Enter' && e.target.id == 'cpn') { e.preventDefault(); document.querySelector('[data-a=coupon]').click(); }
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.a == 'lk') { const x = cart.find(c => c.id == el.dataset.id); if (x) { x.l = el.value; save(); } return; }   // account link was never saved before
  if (el.id == 'pw-input') {                                                       // password strength meter
    const v = el.value, fill = $('#pw-fill'), txt = $('#pw-text'); if (!fill) return;
    let s = 0; if (v.length >= 8) s++; if (/[A-Z]/.test(v)) s++; if (/[0-9]/.test(v)) s++; if (/[^A-Za-z0-9]/.test(v)) s++;
    const lv = [['25%', '#ef4444', 'weak'], ['25%', '#ef4444', 'weak'], ['50%', '#FBBF24', 'mid'], ['75%', '#3b82f6', 'good'], ['100%', '#22c55e', 'strong']][s];
    fill.style.width = lv[0]; fill.style.background = lv[1]; txt.textContent = t(lv[2]); txt.style.color = lv[1];
  }
});

/* ---------- Click sound (Web Audio, short professional tick) ---------- */
let _audioCtx;
function playClick() {
  try {
    _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.08);
    o.connect(g); g.connect(ctx.destination);
    o.start(ctx.currentTime); o.stop(ctx.currentTime + 0.09);
  } catch {}
}

/* ---------- 11. Auth ---------- */
const authMsg = m => {
  m = String(m || '').toLowerCase();
  if (m.includes('invalid login')) return t('badlogin');
  if (m.includes('not confirmed')) return t('unconf');
  if (m.includes('already')) return t('exists');
  if (m.includes('at least') || m.includes('weak')) return t('shortpw');
  return m || t('net');
};
/* Best effort: read (or create) the user's row in `profiles` so the account page can show their name */
async function syncProfile() {
  if (!user) return;
  try {
    const r = await sb(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=full_name`);
    if (!r.ok) return;
    const row = (await r.json())[0];
    if (row) { profileName = row.full_name || ''; }
    else {
      const full_name = nameOf();
      await sb('/rest/v1/profiles', { method:'POST', prefer:'resolution=ignore-duplicates,return=minimal', body:{ id:user.id, email:user.email, full_name } });
    }
    if (/^#\/account/.test(location.hash)) render();
  } catch {}
}
document.addEventListener('submit', async e => {
  /* Forgot-password form */
  if (e.target.id == 'af-forgot') {
    e.preventDefault();
    const f = new FormData(e.target), er = $('#er'), btn = e.target.querySelector('[type=submit]');
    er.textContent = '';
    if (+f.get('cap') !== window.capA + window.capB) { er.textContent = t('capbad'); return; }
    const email = String(f.get('e') || '').trim();
    if (!email) return;
    setBusy(btn, true);
    try {
      const r = await fetch(SB_URL + '/auth/v1/recover', {
        method: 'POST',
        headers: { apikey: SB_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.msg || j.error_description || j.message || '');
      toast(t('resetsent'));
      window.authMode = 'login'; window.regMode = false; render();
    } catch (err) { er.textContent = authMsg(err.message); }
    finally { setBusy(btn, false); }
    return;
  }
  if (e.target.id != 'af') return;
  e.preventDefault();
  const f = new FormData(e.target), er = $('#er'), btn = e.target.querySelector('[type=submit]');
  er.textContent = '';
  if (+f.get('cap') !== window.capA + window.capB) { er.textContent = t('capbad'); return; }
  const email = String(f.get('e') || '').trim(), pw = String(f.get('p') || ''), name = String(f.get('n') || '').trim();
  if (!email || !pw) return;
  setBusy(btn, true);
  try {
    const signup = !!window.regMode;
    const r = await fetch(SB_URL + (signup ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password'), {
      method:'POST', headers:{ apikey:SB_KEY, 'Content-Type':'application/json' },
      body: JSON.stringify(signup ? { email, password:pw, data:{ full_name:name, name } } : { email, password:pw }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.msg || j.error_description || j.message || '');
    if (j.access_token) {                                   // signed in (login, or signup with auto-confirm)
      storeSession(j); toast(t('loggedin')); syncProfile();
      const to = returnTo && !/login/.test(returnTo) ? returnTo : '#/'; returnTo = ''; location.hash = to;
      if (location.hash == to) render();
    } else {
      /* Email confirmation required */
      toast(t('regok'), 'ok');
      window.regMode = false; window.authMode = 'login'; render();
    }
  } catch (err) { er.textContent = authMsg(err.message); }
  finally { setBusy(btn, false); }
});

/* ---------- 12. Search & router ---------- */
const nz = x => String(x).toLowerCase().replace(/[ً-ٟ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
const hit = (p, k) => { const h = nz(p.ar + ' ' + p.en + ' ' + p.tg + ' ' + p.sp); return nz(k).split(/\s+/).filter(Boolean).every(w => h.includes(w)); };
$('#q').addEventListener('input', e => {
  q = e.target.value;
  if (q && (location.hash || '#/') != '#/') location.hash = '#/'; else render();
});

/* Banner carousel: auto-advances every 4s, pauses while the user touches/hovers it.
   Uses centre-to-centre scrolling so it works in both RTL and LTR. */
let banTimer;
function startBanners() {
  clearInterval(banTimer);
  const el = document.querySelector('.ban');
  if (!el || el.children.length < 2) return;
  const kids = [...el.children], dots = [...document.querySelectorAll('.dots i')];
  const mid = r => r.left + r.width / 2;
  const current = () => { const c = mid(el.getBoundingClientRect()); let bi = 0, bd = 1e9;
    kids.forEach((k, i) => { const d = Math.abs(mid(k.getBoundingClientRect()) - c); if (d < bd) { bd = d; bi = i; } }); return bi; };
  let paused = false, resume;
  const hold = () => { paused = true; clearTimeout(resume); };
  const release = () => { clearTimeout(resume); resume = setTimeout(() => { paused = false; }, 3000); };
  ['touchstart', 'pointerdown', 'mouseenter'].forEach(ev => el.addEventListener(ev, hold, { passive: true }));
  ['touchend', 'pointerup', 'mouseleave'].forEach(ev => el.addEventListener(ev, release, { passive: true }));
  el.addEventListener('scroll', () => { const i = current(); dots.forEach((d, j) => d.classList.toggle('on', j == i)); }, { passive: true });
  banTimer = setInterval(() => {
    if (!document.body.contains(el)) return clearInterval(banTimer);
    if (paused || document.hidden) return;
    const next = kids[(current() + 1) % kids.length];
    el.scrollBy({ left: mid(next.getBoundingClientRect()) - mid(el.getBoundingClientRect()), behavior: 'smooth' });
  }, 4000);
}

const AUTH_ROUTES = ['orders', 'account'];
function render() {
  const seq = ++routeSeq;
  const [h] = (location.hash || '#/').split('?'), [, r, id] = h.split('/');
  if (AUTH_ROUTES.includes(r) && !user) { returnTo = location.hash; location.hash = '#/login'; return; }
  if (r == 'login' && user) { location.hash = '#/account'; return; }
  const m = $('#m');
  if (r == 'orders') { m.innerHTML = loadingBox(); nav(); ordersPage(seq); return; }
  m.innerHTML = r == 'c' ? catPage(decodeURIComponent(id || '')) : r == 'p' ? prodPage(decodeURIComponent(id || ''))
    : r == 'cart' ? cartPage() : r == 'fav' ? favPage() : r == 'login' ? authPage()
    : r == 'account' ? accPage() : r == 'done' ? donePage(decodeURIComponent(id || '')) : home();
  nav(); startBanners();
}
addEventListener('hashchange', () => { scrollTo(0, 0); render(); });

/* ---------- 13. Boot ---------- */
async function boot() {
  user = ls.json('amx_user', null);
  if (user && !ls.get('amx_token')) user = null;
  setCfg(REMOTE_CFG && REMOTE_CFG.ts >= (CFG0.ts || 0) ? REMOTE_CFG : CFG0);
  head(); render();                                        // instant first paint from the embedded data
  // NOTE: api_settings (secret keys) is intentionally NOT fetched here.
  try {                                                    // newer config published from the admin panel
    const r = await sb('/rest/v1/store_config?id=eq.1&select=data', { auth:false });
    const d = ((await r.json())[0] || {}).data;
    if (d && Array.isArray(d.products) && d.ts !== CFG.ts) setCfg(d);
  } catch {}
  loadingCfg = false;
  head(); render();
  if (user) syncProfile();
}
boot();
