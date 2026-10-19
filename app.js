/* =====================================================================
   AMARIX007 — Storefront logic (app.js)
   ---------------------------------------------------------------------
   Sections
    1. Config & security notes      9. Views (pages)
    2. Icons & brand logos         10. Orders, payments & tracking
    3. Translations                11. AI support chat
    4. State & storage             12. Actions (clicks) & sounds
    5. Helpers (toast, loading)    13. Auth (login, signup, recovery, human check)
    6. Supabase client             14. Search & router
    7. Cart, coupon & totals       15. Boot
    8. Sound effects

   SECURITY NOTES
   - This file uses ONLY the Supabase *anon* key. It is public by design;
     it is safe only because Row Level Security (RLS) is enabled.
     Never put a service_role key, payment secret or API secret here.
   - RLS must be ON for these tables (see supabase-schema.sql):
       orders        -> a user can INSERT/SELECT only rows where
                        user_id = auth.uid(); only admins can UPDATE.
       store_config  -> SELECT for everyone, INSERT/UPDATE for admins only.
       profiles      -> a user can read/update only their own row.
       api_settings  -> admins only. NEVER readable by anon (it holds
                        secret keys, so the storefront does not fetch it).
   - SMM-panel and AI-provider keys are used only by Supabase Edge Functions
     (supabase/functions/*), never by this file.
   - The "human check" is a client-side deterrent. For real bot protection
     enable CAPTCHA (e.g. Cloudflare Turnstile) in Supabase > Auth.
   - Prices are computed in the browser for display. For a real payment
     flow, re-calculate the total on the server (trigger / Edge Function).
   ===================================================================== */
'use strict';

/* ---------- 1. Config ---------- */
const SB_URL = 'https://pvuobngrybygohendwaz.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dW9ibmdyeWJ5Z29oZW5kd2F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMTI0ODIsImV4cCI6MjEwNzg4ODQ4Mn0.enSKw1_Wt58iK8-Y0eaHMWtBGQ7HyYXP_JEwYLsSfpU'; // anon key only

const CFG0 = window.AMX || {};
const REMOTE_CFG = (() => { try { return JSON.parse(localStorage.getItem('amx_remote')); } catch { return null; } })();   // optional cached copy
const ORDER_STATUSES = ['new', 'processing', 'done', 'cancelled'];
const PAY_STATUSES = ['pending', 'review', 'paid'];

/* ---------- 2. Icons & brand logos ---------- */
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
  chev:'<path d="M15 5l-7 7 7 7"/>',
  ext:'<path d="M14 4h6v6M20 4l-9 9M18 14v5H5V6h5"/>',
  spark:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17v4M17 19h4"/>',
  hs:'<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/><path d="M19 20c0 1.5-2 2-5 2"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 7l8 6 8-6"/>',
  check:'<path d="M5 12l5 5 9-10"/>',
  warn:'<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  moon:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  refresh:'<path d="M20 11a8 8 0 0 0-14-4M4 5v3h3M4 13a8 8 0 0 0 14 4M20 19v-3h-3"/>',
  vol:'<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>',
  mute:'<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  card:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h3"/>'
};
const ic = (name, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] || I.box}</svg>`;

/* Social networks: vector redraws of the brand marks (24x24, painted with currentColor).
   Admin can upload the official file per link; it then replaces the drawing. */
const BR = {
  wa:{ bg:'#25D366', g:'<path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" d="M12.05 3.2a8.8 8.8 0 0 0-7.55 13.3L3.3 20.8l4.4-1.15A8.8 8.8 0 1 0 12.05 3.2z"/><path d="M9.1 7.9c.25-.5.6-.5.85-.5h.5c.2 0 .4.1.5.4l.75 1.8c.1.25 0 .45-.15.65l-.55.65c-.1.15-.1.3 0 .5a6.6 6.6 0 0 0 2.65 2.4c.2.1.4.1.5-.05l.7-.85c.2-.2.4-.2.6-.1l1.75.85c.25.1.35.3.3.55-.1 1-.85 1.9-1.9 2.1-.85.15-2.05.05-3.7-.7-2.1-.95-3.85-2.9-4.4-4.2-.5-1.15-.45-2.3.35-3.9z"/>' },
  tg:{ bg:'#229ED9', g:'<path d="M19.9 4.4 3.6 10.7c-1.1.45-1.1 1.05-.2 1.3l4.2 1.3 9.7-6.1c.45-.28.88-.13.53.18l-7.85 7.1-.3 4.3c.43 0 .62-.2.86-.43l2.07-2 4.3 3.17c.8.43 1.36.2 1.56-.74l2.82-13.3c.3-1.15-.44-1.67-1.4-1.3z"/>' },
  ig:{ bg:'radial-gradient(circle at 30% 107%,#fdf497 0%,#fdf497 5%,#fd5949 45%,#d6249f 60%,#285AEB 90%)', g:'<rect x="3.7" y="3.7" width="16.6" height="16.6" rx="5" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="12" r="3.9" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="17.1" cy="6.9" r="1.2"/>' },
  xx:{ bg:'#000', g:'<path d="M17.75 3.5h2.9l-6.34 7.24L21.8 20.5h-5.85l-4.58-5.99-5.24 5.99H3.2l6.78-7.75L2.9 3.5h6l4.14 5.47zm-1.02 15.26h1.6L7.9 5.15H6.18z"/>' },
  yt:{ bg:'#FF0000', g:'<path d="M21.6 8.2a2.5 2.5 0 0 0-1.77-1.77C18.27 6 12 6 12 6s-6.27 0-7.83.43A2.5 2.5 0 0 0 2.4 8.2C2 9.76 2 12 2 12s0 2.24.4 3.8a2.5 2.5 0 0 0 1.77 1.77C5.73 18 12 18 12 18s6.27 0 7.83-.43a2.5 2.5 0 0 0 1.77-1.77C22 14.24 22 12 22 12s0-2.24-.4-3.8zM10 14.9V9.1l5 2.9z"/>' },
  fb:{ bg:'#1877F2', g:'<path d="M13.6 21v-7.6h2.55l.4-3h-2.95V8.5c0-.87.25-1.45 1.5-1.45h1.6V4.4c-.28-.04-1.22-.12-2.32-.12-2.3 0-3.87 1.4-3.87 3.97v2.15H7.9v3h2.6V21z"/>' },
  tt:{ bg:'#000', g:'<path d="M16.6 3.5c.3 2.3 1.6 3.7 3.9 3.85v2.85a6.6 6.6 0 0 1-3.85-1.2v5.7a5.35 5.35 0 1 1-5.35-5.35c.28 0 .55.02.8.07v2.95a2.5 2.5 0 1 0 1.75 2.4V3.5z"/>' },
  mail:{ bg:'#3b5537', g:'<rect x="3.2" y="5.6" width="17.6" height="12.8" rx="2.4" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="m4.2 7.6 7.8 5.8 7.8-5.8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>' }
};
/* Payment marks that can be drawn by the store (Syriatel/Sham need an uploaded official logo) */
const PAYG = {
  binance:{ bg:'#F0B90B', fg:'#1E2329', g:'<path d="m12 3.2 2.6 2.6-1.5 1.5L12 6.2l-1.1 1.1-1.5-1.5zM6.2 9l1.5 1.5L6.2 12l1.5 1.5L6.2 15 3.2 12zM17.8 9l3 3-3 3-1.5-1.5L17.8 12l-1.5-1.5zM12 9.9l2.1 2.1-2.1 2.1-2.1-2.1zM9.4 16.2l1.5 1.5L12 18.8l1.1-1.1 1.5-1.5 1.5 1.5-2.6 2.6L12 21l-.4-.7-2.2-2.6z"/>' },
  usdt:{ bg:'#26A17B', fg:'#fff', g:'<path d="M13.2 11.3V9.9h3.9V7H6.9v2.9h3.9v1.4C7.6 11.45 5.2 12.1 5.2 12.9c0 .8 2.4 1.45 5.6 1.6v5.3h2.4v-5.3c3.2-.15 5.6-.8 5.6-1.6 0-.8-2.4-1.45-5.6-1.6zm0 2.55c-.1 0-.75.05-1.2.05s-1.1-.05-1.2-.05c-2.4-.1-4.1-.55-4.1-.95s1.7-.85 4.1-.95v1.55c.1 0 .75.05 1.2.05s1.1-.05 1.2-.05V11.95c2.4.1 4.1.55 4.1.95s-1.7.85-4.1.95z"/>' }
};
/* The store's own mark (same drawing as the header logo) */
const LOGO_SVG = '<svg viewBox="0 0 32 32" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 25.5L14 7L16.5 12" stroke="#A7E8BD" stroke-width="2.75"/><path d="M10 18.5H19" stroke="#52B788" stroke-width="2.25"/><path d="M16.5 12L20.5 18L26 8" stroke="#A7E8BD" stroke-width="2.75"/><circle cx="26" cy="8" r="1.75" fill="#A7E8BD"/></svg>';

/* ---------- 3. Translations ---------- */
const T = {
  ar: {
    ph:'ابحث…', home:'الرئيسية', fav:'المفضلة', cart:'السلة', ord:'طلباتي', all:'الكل', add:'أضف', buy:'شراء',
    none:'لا يوجد', sub:'المجموع الفرعي', dis:'الخصم', tot:'الإجمالي', cc:'كود الخصم', ap:'تطبيق', co:'تأكيد الطلب',
    ce:'سلتك فارغة', acc:'حسابي', login:'دخول', out:'خروج', nl:'الاسم', em:'البريد', pw:'كلمة المرور',
    wel:'مرحباً', reg:'حساب جديد', has:'لديك حساب؟', no:'ليس لديك حساب؟', lreq:'سجل الدخول أولاً',
    sup:'دعم', rt:'© 2026 AMARIX007. جميع الحقوق محفوظة.',
    added:'أُضيف إلى السلة', acclink:'رابط الحساب', needlink:'أدخل رابط الحساب للخدمات المطلوبة',
    cpnok:'تم تطبيق الكوبون', cpnbad:'كود الخصم غير صحيح', cpnrm:'إزالة', cpnon:'كوبون مُفعّل',
    waorder:'اطلب عبر واتساب', waunset:'رقم واتساب غير مُعد بعد', wahint:'يُرسل تفاصيل طلبك إلى واتساب لإتمام الدفع',
    ordfail:'تعذّر إنشاء الطلب. حاول مرة أخرى.', sesexp:'انتهت الجلسة، سجّل الدخول من جديد',
    donet:'تم استلام طلبك', doned:'أكمل الدفع بإحدى الوسائل ثم اضغط «تم الدفع» ليتحقق الفريق منه.', ordno:'رقم الطلب',
    vieword:'عرض طلباتي', keep:'متابعة التسوق', wacontact:'تواصل عبر واتساب',
    date:'التاريخ', status:'الحالة', items:'تفاصيل الطلب', qty:'الكمية', noord:'لا توجد طلبات بعد',
    noordd:'عندما تُنشئ طلباً سيظهر هنا.', loaderr:'تعذّر التحميل', retry:'إعادة المحاولة', loading:'جارٍ التحميل…',
    s_new:'جديد', s_processing:'قيد التنفيذ', s_done:'مكتمل', s_cancelled:'ملغي',
    capbad:'تعذّر التحقق الأمني، حاول مرة أخرى', loggedin:'تم تسجيل الدخول',
    regok:'تم التسجيل. تحقق من بريدك إن طُلب التأكيد ثم سجّل الدخول.',
    weak:'ضعيفة', mid:'متوسطة', good:'جيدة', strong:'قوية', theme:'تبديل المظهر',
    badlogin:'البريد أو كلمة المرور غير صحيحة', unconf:'يرجى تأكيد بريدك أولاً', exists:'هذا البريد مسجّل مسبقاً',
    shortpw:'كلمة المرور قصيرة (6 أحرف على الأقل)', net:'تعذّر الاتصال بالخادم', total:'الإجمالي', coupon:'الكوبون',
    link:'الرابط', unitp:'سعر الوحدة', hi:'مرحباً AMARIX007،',
    /* recovery & email confirmation */
    forgot:'نسيت كلمة السر؟', forgothint:'أدخل بريدك وسنرسل لك رابطاً لتعيين كلمة سر جديدة.', forgotsend:'إرسال رابط الاستعادة',
    backlogin:'العودة لتسجيل الدخول', newpw:'كلمة السر الجديدة', confpw:'تأكيد كلمة السر', resetbtn:'حفظ كلمة السر',
    pwmis:'كلمتا السر غير متطابقتين', resetok:'تم تغيير كلمة السر بنجاح', resetbad:'رابط الاستعادة غير صالح أو منتهي. اطلب رابطاً جديداً.',
    chkt:'تحقق من بريدك', chkd:'أرسلنا رابط تأكيد الحساب إلى', chkh:'افتح الرسالة واضغط رابط التأكيد لتفعيل حسابك (تحقق من البريد المزعج أيضاً).',
    rcvt:'تم إرسال رابط الاستعادة', rcvd:'إن كان هذا البريد مسجلاً فستصلك رسالة برابط تعيين كلمة سر جديدة على', rcvh:'الرابط صالح لفترة قصيرة. تحقق من البريد المزعج أيضاً.',
    resend:'إعادة الإرسال', resent:'تمت إعادة الإرسال', wait30:'انتظر قليلاً قبل إعادة الإرسال', confok:'تم تأكيد بريدك وتسجيل دخولك', gbtn:'المتابعة عبر Google', gor:'أو', gerr:'تعذّر تسجيل الدخول عبر Google. حاول مرة أخرى.',
    mailfail:'تعذّر إرسال البريد. حاول لاحقاً.', fill:'أدخل البريد الإلكتروني وكلمة المرور', fillm:'أدخل بريدك الإلكتروني',
    /* human verification */
    hv_ing:'جارٍ التحقق من أنك لست روبوتاً…', hv_ok:'تم التحقق بنجاح', hv_human:'أنا لست روبوتاً', hv_sec:'حماية', hv_help:'مساعدة', hv_wait:'أكمل التحقق الأمني أولاً',
    /* payments */
    paymethods:'وسائل الدفع', paysub:'ادفع بالطريقة الأنسب لك', paychoose:'اختر طريقة الدفع', paypick:'اختر طريقة الدفع أولاً',
    pay_pending:'بانتظار الدفع', pay_review:'قيد التحقق من الدفع', pay_paid:'تم الدفع', paidbtn:'تم الدفع',
    claimed:'تم إبلاغ الفريق بالدفع، سيتم التحقق قريباً', claimfail:'تعذّر إرسال الإبلاغ، حاول مجدداً',
    payhow:'طريقة الدفع', payto:'حوّل المبلغ إلى', copy:'نسخ', copied:'تم النسخ', sendproof:'إرسال إثبات الدفع عبر واتساب',
    trk_ordered:'تم الطلب', trk_pay:'الدفع', trk_process:'قيد التنفيذ', trk_done:'مكتمل',
    paidmsg:'قمت بدفع الطلب رقم', paidwait:'بانتظار تأكيد الفريق للدفع',
    /* AI support */
    ai_title:'الدعم الفني الذكي', ai_ph:'اكتب سؤالك…', ai_hello:'أهلاً بك! أنا مساعد AMARIX007. كيف أقدر أساعدك؟',
    ai_err:'تعذّر الرد الآن. تواصل معنا عبر واتساب.', ai_wa:'تواصل عبر واتساب', ai_open:'الدعم الفني بالذكاء الاصطناعي', ai_close:'إغلاق',
    snd_on:'الصوت: تشغيل', snd_off:'الصوت: إيقاف'
  },
  en: {
    ph:'Search…', home:'Home', fav:'Wishlist', cart:'Cart', ord:'Orders', all:'All', add:'Add', buy:'Buy',
    none:'No results', sub:'Subtotal', dis:'Discount', tot:'Total', cc:'Coupon code', ap:'Apply', co:'Confirm order',
    ce:'Your cart is empty', acc:'Account', login:'Sign in', out:'Sign out', nl:'Name', em:'Email', pw:'Password',
    wel:'Welcome', reg:'Sign up', has:'Have an account?', no:'No account?', lreq:'Please sign in first',
    sup:'Support', rt:'© 2026 AMARIX007. All rights reserved.',
    added:'Added to cart', acclink:'Account link', needlink:'Enter the account link for the services that need it',
    cpnok:'Coupon applied', cpnbad:'Invalid coupon code', cpnrm:'Remove', cpnon:'Coupon active',
    waorder:'Order via WhatsApp', waunset:'WhatsApp number is not configured yet', wahint:'Sends your order details to WhatsApp to complete payment',
    ordfail:'Could not create the order. Please try again.', sesexp:'Session expired, please sign in again',
    donet:'Your order was received', doned:'Pay with one of the methods below, then tap “I have paid” so the team can verify it.', ordno:'Order number',
    vieword:'View my orders', keep:'Keep shopping', wacontact:'Contact on WhatsApp',
    date:'Date', status:'Status', items:'Order details', qty:'Qty', noord:'No orders yet',
    noordd:'Your orders will appear here once you place one.', loaderr:'Could not load', retry:'Retry', loading:'Loading…',
    s_new:'New', s_processing:'In progress', s_done:'Completed', s_cancelled:'Cancelled',
    capbad:'Security check failed, please try again', loggedin:'Signed in',
    regok:'Signed up. Confirm your email if asked, then sign in.',
    weak:'Weak', mid:'Fair', good:'Good', strong:'Strong', theme:'Toggle theme',
    badlogin:'Incorrect email or password', unconf:'Please confirm your email first', exists:'This email is already registered',
    shortpw:'Password too short (min 6 characters)', net:'Could not reach the server', total:'Total', coupon:'Coupon',
    link:'Link', unitp:'Unit price', hi:'Hello AMARIX007,',
    forgot:'Forgot password?', forgothint:'Enter your email and we will send you a link to set a new password.', forgotsend:'Send reset link',
    backlogin:'Back to sign in', newpw:'New password', confpw:'Confirm password', resetbtn:'Save password',
    pwmis:'Passwords do not match', resetok:'Password changed successfully', resetbad:'The reset link is invalid or expired. Request a new one.',
    chkt:'Check your email', chkd:'We sent an account confirmation link to', chkh:'Open the email and tap the confirmation link to activate your account (check spam too).',
    rcvt:'Reset link sent', rcvd:'If this email is registered, you will receive a message with a link to set a new password at', rcvh:'The link is valid for a short time. Check spam too.',
    resend:'Resend', resent:'Email sent again', wait30:'Please wait a moment before resending', confok:'Email confirmed and you are signed in', gbtn:'Continue with Google', gor:'or', gerr:'Google sign-in failed. Please try again.',
    mailfail:'Could not send the email. Try again later.', fill:'Enter your email and password', fillm:'Enter your email',
    hv_ing:'Verifying you are not a robot…', hv_ok:'Verification successful', hv_human:'I am not a robot', hv_sec:'Security', hv_help:'Help', hv_wait:'Complete the security check first',
    paymethods:'Payment methods', paysub:'Pay the way that suits you', paychoose:'Choose a payment method', paypick:'Choose a payment method first',
    pay_pending:'Awaiting payment', pay_review:'Payment under review', pay_paid:'Paid', paidbtn:'I have paid',
    claimed:'The team was notified and will verify your payment soon', claimfail:'Could not send the notice, try again',
    payhow:'Payment method', payto:'Transfer the amount to', copy:'Copy', copied:'Copied', sendproof:'Send payment proof on WhatsApp',
    trk_ordered:'Ordered', trk_pay:'Payment', trk_process:'In progress', trk_done:'Completed',
    paidmsg:'I paid for order', paidwait:'Waiting for the team to confirm payment',
    ai_title:'AI support', ai_ph:'Type your question…', ai_hello:'Hi! I am the AMARIX007 assistant. How can I help?',
    ai_err:'I cannot answer right now. Contact us on WhatsApp.', ai_wa:'Contact on WhatsApp', ai_open:'AI technical support', ai_close:'Close',
    snd_on:'Sound: on', snd_off:'Sound: off'
  }
};

/* ---------- 4. State & storage ---------- */
const ls = {
  json(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
  get(key, fallback = null) { try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch {} },
  del(key) { try { localStorage.removeItem(key); } catch {} }
};

let CFG, C, P, E, BN, CP, R, SOC, BASE, PM;   // store config: categories, products, embeds, banners, coupons, rates, payment methods
let lang   = ls.get('lang', 'ar');
let cur    = ls.get('cur', 'SAR');
let th     = ls.get('th2', 'light');          // light by default
let cart   = ls.json('cart', []);
let fav    = ls.json('fav', []);
let coupon = ls.get('amx_coupon', '');
let payMethod = ls.get('amx_pay', '');       // chosen payment method id
let sndOn  = ls.get('snd', '1') !== '0';     // click sounds
let user   = null;                           // Supabase user object when signed in
let profileName = '';                        // name from profiles table (best effort)
let q = '';                                  // search query
let returnTo = '';                           // where to go after login
let lastOrder = null;                        // info for the success page
let routeSeq = 0;                            // guards async pages against stale renders
let loadingCfg = true;                       // true until the remote config answered
let googleOn = ls.get('amx_gg') === '1';       // Google provider enabled in Supabase (checked at boot, cached)
let authMode = 'login';                      // login | signup | forgot | reset | check
let checkKind = 'signup';                    // what the "check your email" page is about: signup | recover
let pendingEmail = '';
let recovery = null;                         // { access_token, refresh_token } from a password-recovery link
let resendAt = 0;
const claimed = {};                          // order ids the user just reported as paid

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
  // Payment methods: blank name/icon/colour/instructions fall back to the embedded default of the same id (or same icon); a card with no name and no logo is not shown
  const PM0 = CFG0.payments || [];
  PM = (CFG.payments || []).filter(m => m && m.on !== false).map(m => {
    const d0 = PM0.find(x => x.id == m.id) || PM0.find(x => m.icon && x.icon == m.icon) || {};
    const f = k => (m[k] == null || m[k] === '') ? (d0[k] ?? '') : m[k];
    return { ...m, ar:ex(f('ar')), en:ex(f('en')), da:ex(f('da')), de:ex(f('de')), acc:ex(m.acc), icon:f('icon'), color:f('color') };
  }).filter(m => m.ar || m.en || m.logo);
  R  = CFG.rates && Object.keys(CFG.rates).length ? CFG.rates : { SAR:[1, 'ر.س'] };
  BASE = (Object.entries(R).find(([, v]) => +v[0] === 1) || [Object.keys(R)[0]])[0];
  if (!R[cur]) cur = BASE;
  if (payMethod && !PM.some(m => m.id == payMethod)) payMethod = '';
  cleanCart();
}

/* ---------- 5. Helpers ---------- */
const $  = s => document.querySelector(s);
const ex = x => String(x ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');   // HTML-escape
const safeUrl = u => { u = String(u || '').trim(); return /^(https?:|mailto:|tel:|#|\/|\.\/)/i.test(u) ? u : ''; };
const safeColor = c => /^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : '';
const t = k => (T[lang] && T[lang][k]) || k;
const cat  = id => C.find(c => c.id == id);
const prod = id => P.find(p => p.id == id);
const pmOf = id => PM.find(m => m.id == id);
const pmName = m => m[lang] || m.ar || m.en || m.id || '';
const pr   = p => p.p * (1 - (p.d || 0) / 100);                        // unit price after product discount (base currency)
const fmt  = v => { const x = cur == 'SYP' ? Math.round(v * R[cur][0]).toLocaleString('en-US') : (v * R[cur][0]).toFixed(2); return cur == 'USD' || cur == 'EUR' ? R[cur][1] + x : x + ' ' + R[cur][1]; };
const money = v => `<bdi dir="ltr">${fmt(v)}</bdi>`;
const nameOf = () => profileName || (user && user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name)) || '';
const plain = s => String(s || '').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));   // undo ex(): only for plain-text targets (WhatsApp, DB, textContent), never for HTML
const dec = s => { try { return decodeURIComponent(s); } catch { return s; } };                 // malformed %-sequences in the URL must not break routing

function save() {
  ls.set('cart', cart); ls.set('fav', fav); ls.set('lang', lang); ls.set('cur', cur); ls.set('th2', th);
  ls.set('amx_coupon', coupon); ls.set('amx_pay', payMethod); ls.set('snd', sndOn ? '1' : '0');
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
  if (type == 'er') beep('er'); else if (type == 'wn') beep('wn');
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
  const letter = [...plain(p.en || p.ar || '?').trim()][0] || '?';
  return `<span class="ph" style="--h:${hue(p.id)}">${ic((c && c.i) || 'box', 36)}<em>${ex(letter.toUpperCase())}</em></span>`;
}
const art = (p, c) => p.img ? `<img class="pim" loading="lazy" src="${ex(p.img)}" alt="" data-ph="${ex(p.id)}">` : placeholder(p, c);
// If a product image fails to load, swap in the placeholder
document.addEventListener('error', e => {
  const el = e.target;
  if (el && el.tagName == 'IMG' && el.dataset.ph) { const p = prod(el.dataset.ph); if (p) el.outerHTML = placeholder(p, cat(p.c)); }
}, true);

/* Brand marks */
const brandSvg = (g, size) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true">${g}</svg>`;
function socialLink([code, url, logo], label) {
  const href = safeUrl(url); if (!href) return '';
  const b = BR[code] || BR.mail;
  const inner = logo ? `<img src="${ex(logo)}" alt="">` : brandSvg(b.g, 22);
  return `<a class="sl" style="background:${logo ? '#fff' : b.bg}" href="${ex(href)}" target="_blank" rel="noopener" aria-label="${ex(label || code)}">${inner}</a>`;
}
function payLogo(m, size = 44) {
  const st = `width:${size}px;height:${size}px`;
  if (m.logo) return `<span class="pl" style="${st};background:#fff"><img src="${ex(m.logo)}" alt=""></span>`;
  const g = PAYG[m.icon];
  if (g) return `<span class="pl" style="${st};background:${g.bg};color:${g.fg}"><svg viewBox="1.5 1.5 21 21" width="${size * .66}" height="${size * .66}" fill="currentColor" aria-hidden="true">${g.g}</svg></span>`;
  const nm = plain(m.en || m.ar || m.id || '').replace(/[^A-Za-z0-9؀-ۿ ]/g, '').trim();
  if (!nm) return `<span class="pl" style="${st};background:${safeColor(m.color) || '#2F442C'};color:#fff">${ic('card', size * .5)}</span>`;
  const ini = ex([...plain(m.en || m.ar || m.id || '?').replace(/[^A-Za-z0-9؀-ۿ ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('')].join('').toUpperCase() || '?');
  return `<span class="pl" style="${st};background:${safeColor(m.color) || '#2F442C'};color:#fff"><b>${ini}</b></span>`;
}

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

/* ---------- 8. Sound effects (synthesised: no audio files) ---------- */
let AC = null;
function tone(f0, f1, dur, vol, type = 'sine', at = 0) {
  const t0 = AC.currentTime + at, o = AC.createOscillator(), g = AC.createGain(), flt = AC.createBiquadFilter();
  flt.type = 'lowpass'; flt.frequency.value = 3400;
  o.type = type; o.frequency.setValueAtTime(f0, t0);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(flt); flt.connect(g); g.connect(AC.destination);
  o.start(t0); o.stop(t0 + dur + 0.03);
}
const SFX = {
  tap:    () => tone(1250, 720, .06, .06, 'triangle'),                                                    // soft tick
  add:    () => { tone(520, 900, .09, .08); tone(1320, 1320, .09, .035, 'sine', .06); },                  // add to cart: rising pop + sparkle
  pop:    () => tone(320, 680, .08, .08),                                                                 // wishlist
  toggle: () => { tone(700, 900, .05, .06, 'triangle'); tone(900, 1150, .06, .045, 'triangle', .05); },   // theme / language / sound / currency
  ok:     () => [523, 659, 784].forEach((f, i) => tone(f, f, .17, .065, 'sine', i * .09)),                // success chime
  er:     () => { tone(260, 200, .18, .075, 'sawtooth'); tone(200, 150, .22, .06, 'sawtooth', .12); },    // error
  wn:     () => tone(440, 440, .14, .06, 'triangle')                                                      // warning
};
function beep(kind = 'tap') {
  if (!sndOn) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state == 'suspended') AC.resume();
    (SFX[kind] || SFX.tap)();
  } catch {}
}
/* Sounds for actions only — navigation links, the bottom bar and category strip stay silent */
document.addEventListener('click', e => {
  const el = e.target.closest('button,select,summary,[data-a],label.b');
  if (!el || el.closest('#nv,.sub-nav,.logo')) return;
  const a = el.dataset.a;
  beep(a == 'add' || a == 'buy' ? 'add' : a == 'fav' ? 'pop' : ['theme', 'lang', 'snd', 'cur', 'pw'].includes(a) ? 'toggle' : 'tap');
}, true);

/* ---------- 9. Views ---------- */
function card(p) {
  const c = cat(p.c), old = p.o > pr(p) ? `<s>${money(p.o)}</s>` : '';
  const rating = p.n ? `<div class="rt">★ ${(+p.r).toFixed(1)} <small>(${p.n})</small></div>` : '';
  return `<div class="cd">
    <button class="hb ${fav.includes(p.id) ? 'on' : ''}" data-a="fav" data-id="${ex(p.id)}" aria-label="${t('fav')}">${ic('heart', 16)}</button>
    ${p.d > 0 ? `<i class="bd">-${Math.round(p.d)}%</i>` : ''}
    <a class="art" href="#/p/${ex(p.id)}">${art(p, c)}</a>
    <div class="bd2"><small>${c[lang]}</small><a href="#/p/${ex(p.id)}"><h3>${p[lang]}</h3></a>${rating}
      <div class="pr"><b class="n">${money(pr(p))}</b>${old}</div>
      <button class="b add" data-a="add" data-id="${ex(p.id)}">${ic('cart', 15)} ${t('add')}</button></div></div>`;
}
const grid = a => a.length ? `<div class="grid">${a.map(card).join('')}</div>` : `<p class="emp">${t('none')}</p>`;
const ico = (o, z) => o.image_url ? `<img src="${ex(o.image_url)}" alt="">` : ic(o.i || 'box', z);

function head() {
  const root = document.documentElement, col = (CFG.site && CFG.site.col) || {};
  root.lang = lang; root.dir = lang == 'ar' ? 'rtl' : 'ltr'; root.dataset.theme = th;
  // Brand colours edited in the admin panel
  ['g', 'm', 'ac'].forEach(k => { if (safeColor(col[k])) root.style.setProperty('--' + k, col[k]); });
  const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = th == 'dark' ? '#121212' : '#F8FAF9';
  const logo = CFG.site.logo;
  if (logo) $('.logo .tile').innerHTML = `<img src="${ex(logo)}" alt="">`;
  $('#bn').innerHTML = `${ex(CFG.site.n1)}<b>${ex(CFG.site.n2)}</b>`;
  $('#sb').textContent = lang == 'ar' ? CFG.site.sa : CFG.site.se;
  $('#q').placeholder = t('ph');
  $('#ctl').innerHTML =
    `<select class="sel" data-a="cur" aria-label="currency">${Object.keys(R).map(k => `<option ${k == cur ? 'selected' : ''}>${k}</option>`).join('')}</select>` +
    `<button class="ib" data-a="snd" aria-label="${t(sndOn ? 'snd_on' : 'snd_off')}" title="${t(sndOn ? 'snd_on' : 'snd_off')}">${ic(sndOn ? 'vol' : 'mute', 18)}</button>` +
    `<button class="ib" data-a="theme" aria-label="${t('theme')}">${ic(th == 'dark' ? 'sun' : 'moon', 18)}</button>` +
    `<button class="ib" data-a="lang">${lang == 'ar' ? 'EN' : 'ع'}</button>` +
    `<a class="ib" href="#/account" aria-label="${t('acc')}">${ic('user', 18)}</a>`;
  $('#sub-nav').innerHTML = C.map(c => `<a href="#/c/${ex(c.id)}">${c[lang]}</a>`).join('');
  footer(); nav(); aiLabels();
}

function footer() {
  const labels = { whatsapp:'WhatsApp', telegram:'Telegram', instagram:'Instagram', x:'X', youtube:'YouTube', facebook:'Facebook', tiktok:'TikTok', email:'Email' };
  const soc = Object.entries(SOC).map(([k, v]) => socialLink(v, labels[k])).join('');
  const site = CFG.site || {}, risk = site.risk && site.risk[lang], rt = (site.rt && site.rt[lang]) || t('rt');
  $('#ft').innerHTML = (soc ? `<div class="soc">${soc}</div>` : '') + (risk ? `<p class="risk">${ex(risk)}</p>` : '') + `<p>${ex(rt)}</p>`;
}

function nav() {
  const r = (location.hash || '#/').split('?')[0].split('/')[1] || '', active = r == 'c' || r == 'p' ? '' : r == 'done' ? 'orders' : r;
  const n = cartCount(), v = $('#nv');
  const items = [['', 'home', 'home'], ['fav', 'heart', 'fav'], ['cart', 'cart', 'cart'], ['orders', 'box', 'ord'], ['account', 'user', 'acc']];
  v.innerHTML = items.map(([l, i, k]) =>
    `<a href="#/${l}" data-r="${l}">${ic(i, 20)}<span>${t(k)}</span>${k == 'cart' && n ? '<span class="cnt">' + n + '</span>' : ''}</a>`).join('');
  v.querySelectorAll('a').forEach(e => e.classList.toggle('on', e.dataset.r == active));
}

/* Home: partner card, banners, categories, payment methods, products */
function partner() {
  const p = CFG.partner || {}, A = lang == 'ar';
  if (p.on === false || !safeUrl(p.url)) return '';
  const bg = p.banner_bg_url ? `<div class="pt-bg" style="background-image:url('${ex(p.banner_bg_url)}')"></div>` : '';
  return `<a class="pt" href="${ex(safeUrl(p.url))}" target="_blank" rel="noopener">${bg}
    <div class="pt-in">
      <span class="pt-logo">${p.logo ? `<img src="${ex(p.logo)}" alt="">` : ic('bank', 26)}</span>
      <span class="pt-tx"><span class="pt-badge">${ic('shield', 12)} ${A ? 'شريك رسمي' : 'Official partner'}</span>
        <b class="pt-nm">${ex(p.name)}</b><span class="pt-d">${ex(A ? p.ar : p.en)}</span></span>
      <span class="pt-cta">${ex(A ? p.ba : p.be)} ${ic('ext', 15)}</span>
    </div></a>`;
}
function paymentsSection() {
  if (!PM.length) return '';
  return `<h2>${t('paymethods')}</h2><div class="pays-h"><p class="pd">${t('paysub')}</p></div>
    <div class="pays">${PM.map(m => `<div class="pm" style="--pc:${safeColor(m.color) || 'var(--ac)'}">${payLogo(m, 60)}<b>${pmName(m)}</b></div>`).join('')}</div>`;
}
function home() {
  if (loadingCfg && !P.length) return skeletonGrid();
  if (q) return `<h2>${t('all')}</h2>` + grid(P.filter(p => hit(p, q)));
  return partner() +
    `<div class="ban-w"><div class="ban${BN.length < 2 ? ' one' : ''}">${BN.map((b, i) => { const txt = !b.img || b.ot === true, sub = lang == 'ar' ? b.sa : b.se;
      /* image banners: the picture already carries its own text, so no title/subtitle/gradient on top unless `ot` is switched on in the admin */
      return `<div class="bs${i ? '' : ' cur'}${txt ? '' : ' pic'}"${b.img ? ` style="background:${txt ? 'linear-gradient(135deg,rgba(0,0,0,.6),rgba(0,0,0,.3)),' : ''}url('${ex(b.img)}') center/cover"` : ''}>${txt ? '<span class="bs-o o1"></span><span class="bs-o o2"></span>' : ''}<div class="bs-c">${txt ? `<h3>${b[lang]}</h3>${sub && sub != b[lang] ? `<p>${sub}</p>` : ''}` : ''}<a class="b bs-b" href="${ex(safeUrl(b.h) || '#/')}" aria-label="${b[lang]}">${ic('bolt', 14)} ${t('all')}</a></div></div>`; }).join('')}</div>
    ${BN.length > 1 ? `<button type="button" class="ban-n prev" data-a="ban-prev" aria-label="prev">${ic('chev', 18)}</button><button type="button" class="ban-n next" data-a="ban-next" aria-label="next">${ic('chev', 18)}</button>
    <div class="dots">${BN.map((_, i) => `<button type="button" class="${i ? '' : 'on'}" data-a="ban-go" data-i="${i}" aria-label="${i + 1}"><u></u></button>`).join('')}</div>` : ''}</div>
    <div class="tiles" style="margin-top:14px">${C.map(c => { const n = P.filter(p => p.c == c.id).length; return `<a class="ct" href="#/c/${ex(c.id)}"><span class="tile${c.image_url ? ' img' : ''}">${ico(c, 24)}</span><span class="ct-t"><b>${c[lang]}</b>${n ? `<small>${n} ${lang == 'ar' ? 'منتج' : 'items'}</small>` : ''}</span><i class="ct-go">${ic('chev', 16)}</i></a>`; }).join('')}</div>
    ${paymentsSection()}
    <h2>${t('all')}</h2>${grid(P)}`;
}

/* Category (also renders the embeds that belong to it) */
function catPage(id) {
  const c = cat(id); if (!c) return home();
  const embeds = E.filter(e => e.c == id).map(e => `<div class="box"><h3>${ex(lang == 'ar' ? e.ar : e.en)}</h3><p class="pd">${ex(lang == 'ar' ? e.da : e.de)}</p>
    ${safeUrl(e.u) ? `<iframe src="${ex(safeUrl(e.u))}" loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" style="width:100%;height:${+e.h || 420}px;border:0;border-radius:12px;margin-top:8px"></iframe>` : ''}</div>`).join('');
  if (c.embed_url) { const eu = safeUrl(c.embed_url); return `<div class="box"><h1>${c[lang]}</h1><p class="pd">${lang == 'ar' ? c.da : c.de}</p>${eu ? `<iframe src="${ex(eu)}" loading="lazy" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" style="width:100%;height:500px;border:0;border-radius:12px"></iframe>` : ''}</div>${embeds}`; }
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

/* Cart with order summary, coupon, payment method and the two ways to order */
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
  const payBox = PM.length ? `<div class="box"><h3 style="margin-bottom:10px">${ic('card', 16)} ${t('paychoose')}</h3>
      <div class="pchips" role="radiogroup">${PM.map(m => `<button type="button" role="radio" aria-checked="${m.id == payMethod}" class="pchip${m.id == payMethod ? ' on' : ''}" data-a="pay" data-id="${ex(m.id)}">${payLogo(m, 34)}<span>${pmName(m)}</span><i>${ic('check', 14)}</i></button>`).join('')}</div></div>` : '';
  return rows + payBox + `<div class="box">
    ${couponBox}
    <div class="sum">
      <div class="row"><span>${t('sub')}</span><b class="n">${money(T_.sub)}</b></div>
      ${T_.disc > 0 ? `<div class="row disc"><span>${t('dis')}</span><b class="n">− ${money(T_.disc)}</b></div>` : ''}
      <div class="row tot"><span>${t('tot')}</span><b class="n">${money(T_.total)}</b></div>
    </div>
    <div class="pay">
      <button class="b" data-a="co">${ic('check', 16)} ${t('co')}</button>
      <button class="b wa" data-a="wa">${brandSvg(BR.wa.g, 16)} ${t('waorder')}</button>
    </div><p class="hint">${t('wahint')}</p></div>`;
}

/* Payment instructions card (success page) */
function payInstructions(m) {
  if (!m) return '';
  return `<div class="box payi"><div class="payi-h">${payLogo(m, 46)}<div><small>${t('payhow')}</small><b>${pmName(m)}</b></div></div>
    ${m.acc ? `<div class="payi-acc"><small>${t('payto')}</small><div class="acc"><bdi dir="ltr">${m.acc}</bdi><button class="b b2 sm" data-a="copy" data-v="${m.acc}">${ic('copy', 14)} ${t('copy')}</button></div></div>` : ''}
    ${(lang == 'ar' ? m.da : m.de) ? `<p class="pd">${lang == 'ar' ? m.da : m.de}</p>` : ''}</div>`;
}
/* Success page after an order */
function donePage(id) {
  const o = lastOrder && lastOrder.id == id ? lastOrder : { id };
  const m = o.method ? pmOf(o.method) : null, done = claimed[id];
  return `<div class="box done"><div class="okc">${ic('check', 36)}</div><h1>${t('donet')}</h1>
    <p class="pd">${t('doned')}</p><div class="oid" dir="ltr">${ex(o.id)}</div>
    ${o.total != null ? `<p class="pd">${t('tot')}: <b class="n">${money(o.total)}</b></p>` : ''}</div>
    ${payInstructions(m)}
    <div class="box"><div class="acts">
      ${done ? `<p class="pd okmsg">${ic('check', 16)} ${t('pay_review')}</p>` : `<button class="b" data-a="claim" data-id="${ex(o.id)}">${ic('check', 16)} ${t('paidbtn')}</button>`}
      ${waNumber() ? `<button class="b wa" data-a="paid-msg" data-id="${ex(o.id)}">${brandSvg(BR.wa.g, 16)} ${t('sendproof')}</button>` : ''}
      <a class="b b2" href="#/orders">${ic('box', 16)} ${t('vieword')}</a>
      <a class="b b2" href="#/">${t('keep')}</a></div></div>`;
}

/* Account & favourites */
function accPage() {
  const name = nameOf(), shown = name || user.email.split('@')[0];
  return `<div class="box row" style="justify-content:flex-start;gap:14px"><span class="tile big"><b class="n" style="font-size:26px">${ex([...shown][0] || 'U')}</b></span>
    <div style="min-width:0"><h1>${t('wel')}${name ? '، ' + ex(name) : ''}</h1><bdi dir="ltr" class="sb">${ex(user.email)}</bdi></div></div>
    <a class="box row" href="#/orders" style="display:flex"><span>${t('ord')}</span>${ic('box', 18)}</a>
    ${refBox()}
    <button class="b b2 block" data-a="out">${t('out')}</button>`;
}
function refBox() {
  if (!refInfo) return '';
  const A = lang == 'ar', link = location.origin + location.pathname + '?ref=' + refInfo.code;
  const st = [[A ? 'نقرات' : 'Clicks', refInfo.clicks || 0], [A ? 'تسجيلات' : 'Sign-ups', refInfo.signups || 0], [A ? 'مبيعات' : 'Sales', refInfo.sales || 0], [A ? 'عمولتك' : 'Earned', fmt(+refInfo.total_commission || 0)]];
  return `<div class="box ref"><h3>${A ? 'برنامج الإحالة' : 'Referral program'}</h3>
    <p class="sb">${A ? 'شارك رابطك واكسب عمولة على كل طلب يُدفع من أصدقائك.' : 'Share your link and earn a commission on every paid order from your friends.'}</p>
    <div class="ref-l"><bdi dir="ltr">${ex(link)}</bdi><button class="b" data-a="copy" data-v="${ex(link)}">${A ? 'نسخ' : 'Copy'}</button></div>
    <div class="ref-s">${st.map(([k, v]) => `<div><b class="n">${ex(String(v))}</b><small>${k}</small></div>`).join('')}</div></div>`;
}
function favPage() {
  const a = P.filter(p => fav.includes(p.id));
  return a.length ? grid(a) : `<p class="emp">${ic('heart', 40)}<br>${t('none')}</p>`;
}

/* ---------- 10. Orders, payments & tracking ---------- */
const orderId = () => 'AMX-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 4).toUpperCase();
const fmtDate = d => { try { return new Date(d).toLocaleString(lang == 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', { dateStyle:'medium', timeStyle:'short' }); } catch { return d || ''; } };

function waNumber() {
  const w = SOC.whatsapp; const m = w && String(w[1] || '').match(/(\d{7,15})/);
  return m ? m[1] : '';
}
function buildWhatsAppText(id, lines, tt) {
  const m = pmOf(payMethod);
  const L = lines.map(({ x, p }) => `• ${plain(p[lang])} × ${x.q} — ${fmt(pr(p) * x.q)}${x.l ? '\n   ' + t('link') + ': ' + x.l : ''}`);
  return [t('hi'), id ? `${t('ordno')}: ${id}` : '', '', ...L, '',
    coupon && tt.disc > 0 ? `${t('coupon')}: ${coupon} (− ${fmt(tt.disc)})` : '',
    m ? `${t('payhow')}: ${plain(pmName(m))}` : '',
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
  if (!viaWhatsApp && PM.length && !payMethod) return toast(t('paypick'), 'wn');
  const tt = totals();

  if (!user) {                                              // guests: WhatsApp still works, otherwise go sign in
    if (viaWhatsApp) return openWhatsApp(buildWhatsAppText(null, lines, tt));
    returnTo = '#/cart'; toast(t('lreq'), 'wn'); location.hash = '#/login'; return;
  }

  const waWin = viaWhatsApp ? window.open('', '_blank') : null;   // opened synchronously so popup blockers allow it
  setBusy(btn, true);
  const id = orderId();
  try {
    const row = {
      id,                                                   // text order number (kept for backward compatibility)
      user_id: user.id,
      customer_name: nameOf() || user.email,
      customer_email: user.email,
      items: lines.map(({ x, p }) => ({ id:p.id, name:plain(p[lang]), ar:plain(p.ar), en:plain(p.en), q:x.q, link:x.l || '', price:+pr(p).toFixed(2) })),
      total: +tt.total.toFixed(2),
      currency: BASE,
      coupon: coupon && tt.disc > 0 ? coupon : null,
      status: 'new',
      payment_status: 'pending',
      payment_method: payMethod || null,
      lang
      // created_at: filled by the database default now() (client clocks are not trusted)
    };
    // If the database lacks a newer column (migration not run yet), drop it and retry so the order still goes through
    let r;
    for (let n = 0; n < 8; n++) {
      r = await sb('/rest/v1/orders', { method:'POST', prefer:'return=minimal', body:row });
      if (r.ok || r.status == 401) break;
      const txt = await r.clone().text(), col = (txt.match(/'([a-z_]+)' column/i) || [])[1];
      if (col && col in row && col != 'id' && col != 'items') delete row[col]; else break;
    }
    if (r.status == 401) { clearSession(); throw Object.assign(new Error('session'), { session:true }); }
    if (!r.ok) throw new Error(await r.text());
    lastOrder = { id, total: tt.total, method: payMethod };
    if (viaWhatsApp) openWhatsApp(buildWhatsAppText(id, lines, tt), waWin);
    cart = []; coupon = ''; save(); nav(); beep('ok');
    location.hash = '#/done/' + id;
  } catch (err) {
    if (waWin) waWin.close();
    console.error('[AMARIX] order failed', err);
    if (err.session) { returnTo = '#/cart'; toast(t('sesexp'), 'er'); location.hash = '#/login'; }
    else toast(navigator.onLine ? t('ordfail') + (err.message ? ' — ' + String(err.message).replace(/[{}"]/g, '').slice(0, 90) : '') : t('net'), 'er');
  } finally { setBusy(btn, false); }
}

/* "I have paid": moves the user's own order from pending to review (server function claim_payment) */
async function claimPayment(btn, id) {
  setBusy(btn, true);
  try {
    const r = await sb('/rest/v1/rpc/claim_payment', { method:'POST', body:{ p_order_id: id } });
    if (r.status == 401) { clearSession(); returnTo = '#/orders'; location.hash = '#/login'; return; }
    if (!r.ok) throw new Error(await r.text());
    claimed[id] = true; toast(t('claimed')); beep('ok'); render();
  } catch (err) {
    console.error('[AMARIX] claim', err);
    const m = String(err && err.message || ''), A = lang == 'ar';
    const why = /PGRST202|Could not find the function|42883/i.test(m) ? (A ? 'الدالة غير مثبّتة في قاعدة البيانات (شغّل supabase-schema.sql)' : 'claim_payment is not installed (run supabase-schema.sql)')
      : /not_allowed/i.test(m) ? (A ? 'الطلب غير مرتبط بحسابك أو تم إبلاغه مسبقاً' : 'order is not yours or was already reported')
      : !navigator.onLine ? t('net') : '';
    toast(t('claimfail') + (why ? ' — ' + why : ''), 'er');
  }
  finally { setBusy(btn, false); }
}

/* Order tracking: Ordered → Payment → In progress → Completed */
function tracker(o, st, pay) {
  if (st == 'cancelled') return '';
  const steps = [
    ['trk_ordered', 'on'],
    ['trk_pay', pay == 'paid' ? 'on' : pay == 'review' ? 'wait' : ''],
    ['trk_process', st == 'processing' || st == 'done' ? 'on' : ''],
    ['trk_done', st == 'done' ? 'on' : '']
  ];
  return `<div class="trk" aria-label="tracking">${steps.map(([k, c]) => `<span class="${c}"><i>${c == 'on' ? ic('check', 12) : ''}</i>${t(k)}</span>`).join('')}</div>`;
}
function ordersHTML(rows) {
  if (!rows.length) return `<p class="emp">${ic('box', 40)}<br><b>${t('noord')}</b><br><small>${t('noordd')}</small></p>`;
  return `<h2>${t('ord')} <button class="ib" data-a="reload" aria-label="${t('retry')}">${ic('refresh', 16)}</button></h2>` + rows.map(o => {
    let items = o.items; if (typeof items == 'string') { try { items = JSON.parse(items); } catch { items = []; } }
    items = Array.isArray(items) ? items : [];
    const st = ORDER_STATUSES.includes(o.status) ? o.status : 'new';
    const pay = PAY_STATUSES.includes(o.payment_status) ? o.payment_status : 'pending';
    const cur0 = o.currency && R[o.currency] ? o.currency : BASE;
    const total = `<bdi dir="ltr">${(o.total * R[cur][0] / R[cur0][0]).toFixed(2)} ${ex(R[cur][1])}</bdi>`;
    const m = o.payment_method ? pmOf(o.payment_method) : null;
    const canClaim = pay == 'pending' && st != 'cancelled';
    return `<div class="box ord"><div class="ord-h"><div><div class="ord-id" dir="ltr">${ex(o.id)}</div><div class="ord-meta">${fmtDate(o.created_at)}</div>
        ${m ? `<div class="ord-meta ord-pm">${payLogo(m, 18)} ${pmName(m)}</div>` : ''}</div>
      <div style="text-align:end"><span class="stt ${st}">${t('s_' + st)}</span>
        ${st != 'cancelled' ? `<div style="margin-top:4px"><span class="stt pay-${pay}">${t('pay_' + pay)}</span></div>` : ''}
        <div class="ord-t n">${total}</div></div></div>
      ${tracker(o, st, pay)}
      ${canClaim ? `<div class="ord-act"><button class="b" data-a="claim" data-id="${ex(o.id)}">${ic('check', 16)} ${t('paidbtn')}</button>${waNumber() ? `<button class="b wa" data-a="paid-msg" data-id="${ex(o.id)}">${brandSvg(BR.wa.g, 16)} ${t('sendproof')}</button>` : ''}</div>` : ''}
      ${pay == 'review' && st != 'cancelled' ? `<p class="ord-note">${ic('refresh', 14)} ${t('paidwait')}</p>` : ''}
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

/* ---------- 11. AI support chat (calls the `ai-support` Edge Function; the AI key stays on the server) ---------- */
const AI = { open:false, busy:false, msgs: (() => { try { return JSON.parse(sessionStorage.getItem('amx_ai')) || []; } catch { return []; } })() };
function aiMount() {
  if ($('#ai-fab')) return;
  document.body.insertAdjacentHTML('beforeend',
    `<div id="sup" class="sup"><div id="sup-menu" class="sup-menu" role="menu"></div>
       <button id="ai-fab" class="ai-fab" data-a="sup-toggle" aria-expanded="false" aria-haspopup="true" aria-controls="sup-menu"><span class="fi f1">${ic('hs', 24)}</span><span class="fi f2">${ic('x', 22)}</span><span class="ai-dot"></span></button></div>
     <section id="ai-panel" class="ai-panel" hidden aria-label="AI support">
       <div class="ai-h"><span class="ai-av">${LOGO_SVG}</span><b id="ai-title"></b><button class="ib" data-a="ai-toggle" id="ai-x" type="button">${ic('x', 16)}</button></div>
       <div id="ai-msgs" class="ai-msgs" aria-live="polite"></div>
       <form id="ai-form" class="ai-f" autocomplete="off"><input id="ai-in" class="inp" maxlength="500"><button class="b" type="submit" aria-label="send">${ic('send', 16)}</button></form>
     </section>`);
  aiRender();
}
function aiLabels() {
  aiMount();
  const on = !(CFG.site && CFG.site.ai_on === false);
  if (!on) { AI.open = false; $('#ai-panel').hidden = true; }
  supRender(on);
  $('#ai-fab').setAttribute('aria-label', t('ai_open'));
  $('#ai-title').textContent = t('ai_title'); $('#ai-in').placeholder = t('ai_ph'); $('#ai-x').setAttribute('aria-label', t('ai_close'));
  aiRender();
}
/* Support speed-dial: AI assistant + WhatsApp + Telegram (links come from the store's social settings) */
function supItems(aiOn) {
  const A = lang == 'ar', out = [];
  if (aiOn) out.push({ k:'ai', label:A ? 'المساعد الذكي' : 'AI assistant', ico:ic('hs', 22) });
  [['whatsapp', 'wa', A ? 'واتساب' : 'WhatsApp'], ['telegram', 'tg', A ? 'تيليغرام' : 'Telegram']].forEach(([key, code, label]) => {
    const u = SOC[key] && safeUrl(SOC[key][1]); if (u) out.push({ k:code, label, href:u, ico:brandSvg(BR[code].g, 24) });
  });
  return out;
}
function supRender(aiOn) {
  const items = supItems(aiOn), box = $('#sup-menu'); if (!box) return;
  $('#sup').hidden = !items.length;
  box.innerHTML = items.map((it, i) => {
    const inner = `<span class="si-l">${ex(it.label)}</span><span class="si-i si-${it.k}">${it.ico}</span>`;
    return it.href ? `<a class="si" style="--i:${i};--n:${items.length}" role="menuitem" href="${ex(it.href)}" target="_blank" rel="noopener">${inner}</a>`
                   : `<button type="button" class="si" style="--i:${i};--n:${items.length}" role="menuitem" data-a="ai-open">${inner}</button>`;
  }).join('');
  $('#sup').dataset.n = items.length; $('#sup').dataset.ai = aiOn ? '1' : '';
}
function supClose() { const s = $('#sup'); if (!s || !s.classList.contains('open')) return; s.classList.remove('open'); $('#ai-fab').setAttribute('aria-expanded', 'false'); }
function supToggle() {
  const s = $('#sup'); if (!s) return;
  if (s.dataset.n == '1' && s.dataset.ai) { aiToggle(); return; }         // only the AI assistant is available
  if (AI.open) { aiToggle(false); return; }
  const o = s.classList.toggle('open'); $('#ai-fab').setAttribute('aria-expanded', String(o));
}
addEventListener('keydown', e => { if (e.key == 'Escape') { supClose(); if (AI.open) aiToggle(false); } });
function aiRender() {
  const box = $('#ai-msgs'); if (!box) return;
  box.textContent = '';
  const add = (cls, text, extra) => { const d = document.createElement('div'); d.className = 'ai-m ' + cls; d.textContent = text; if (extra) d.appendChild(extra); box.appendChild(d); };
  add('bot', t('ai_hello'));
  AI.msgs.forEach(m => {
    let extra = null;
    if (m.err && waNumber()) { extra = document.createElement('button'); extra.className = 'b wa sm'; extra.dataset.a = 'ai-wa'; extra.type = 'button'; extra.textContent = t('ai_wa'); }
    add(m.role == 'user' ? 'me' : 'bot', m.content, extra);
  });
  if (AI.busy) { const d = document.createElement('div'); d.className = 'ai-m bot ai-typing'; d.innerHTML = '<i></i><i></i><i></i>'; box.appendChild(d); }
  box.scrollTop = box.scrollHeight;
}
function aiToggle(force) {
  AI.open = typeof force == 'boolean' ? force : !AI.open;
  if (AI.open) supClose();
  $('#ai-panel').hidden = !AI.open;
  if (AI.open) setTimeout(() => $('#ai-in').focus(), 60);
}
async function aiSend(text) {
  AI.msgs.push({ role:'user', content:text }); AI.busy = true; aiRender();
  try {
    const tk = await getToken();
    const r = await fetch(SB_URL + '/functions/v1/ai-support', { method:'POST',
      headers:{ apikey:SB_KEY, Authorization:'Bearer ' + (tk || SB_KEY), 'Content-Type':'application/json' },
      body: JSON.stringify({ messages: AI.msgs.filter(m => !m.err).slice(-10).map(({ role, content }) => ({ role, content })), lang }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.reply) throw new Error([r.status, j.error, j.reason, j.msg].filter(Boolean).join(' / '));
    AI.msgs.push({ role:'assistant', content:String(j.reply) });
  } catch (err) {
    console.error('[AMARIX] ai-support', err);
    AI.msgs.push({ role:'assistant', content:t('ai_err'), err:true });
  }
  AI.busy = false; aiRender();
  try { sessionStorage.setItem('amx_ai', JSON.stringify(AI.msgs.slice(-30))); } catch {}
}
document.addEventListener('submit', e => {
  if (e.target.id != 'ai-form') return;
  e.preventDefault();
  const inp = $('#ai-in'), v = inp.value.trim();
  if (!v || AI.busy) return;
  inp.value = ''; aiSend(v);
});

/* ---------- 12. Actions ---------- */
document.addEventListener('click', async e => {
  if (!e.target.closest('#sup')) supClose();
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
  else if (a == 'pay') { payMethod = id; save(); render(); }
  else if (a == 'co') placeOrder(b, false);
  else if (a == 'wa') placeOrder(b, true);
  else if (a == 'claim') claimPayment(b, id);
  else if (a == 'paid-msg') openWhatsApp(`${t('hi')}\n${t('paidmsg')}: ${id}`);
  else if (a == 'wa-contact') openWhatsApp(`${t('hi')}\n${t('ordno')}: ${id}`);
  else if (a == 'copy') { try { await navigator.clipboard.writeText(b.dataset.v); toast(t('copied')); } catch { toast(b.dataset.v, 'wn'); } }
  else if (a == 'reload') render();
  else if (a == 'thumb') {
    $('#main-img').src = b.src; document.querySelectorAll('.thumbs img').forEach(x => x.classList.remove('on')); b.classList.add('on');
  }
  else if (a == 'pw') { const i = $('#pw-input'); i.type = i.type == 'password' ? 'text' : 'password'; }
  else if (a == 'theme') { th = th == 'dark' ? 'light' : 'dark'; save(); head(); }
  else if (a == 'lang') { lang = lang == 'ar' ? 'en' : 'ar'; save(); head(); render(); }
  else if (a == 'snd') { sndOn = !sndOn; save(); head(); }
  else if (a == 'ban-prev') bannerCtl && bannerCtl.step(-1);
  else if (a == 'ban-next') bannerCtl && bannerCtl.step(1);
  else if (a == 'ban-go') bannerCtl && bannerCtl.to(+b.dataset.i);
  else if (a == 'sup-toggle') supToggle();
  else if (a == 'ai-toggle') aiToggle();
  else if (a == 'ai-open') { e.preventDefault(); supClose(); aiToggle(true); }
  else if (a == 'ai-wa') openWhatsApp(t('hi'));
  else if (a == 'google') { e.preventDefault(); b.disabled = true; location.href = SB_URL + '/auth/v1/authorize?provider=google&redirect_to=' + siteBack(); }
  else if (a == 'toggle-mode') { e.preventDefault(); authMode = authMode == 'login' ? 'signup' : 'login'; render(); }
  else if (a == 'auth-forgot') { e.preventDefault(); authMode = 'forgot'; render(); }
  else if (a == 'auth-login') { e.preventDefault(); authMode = 'login'; render(); }
  else if (a == 'hv-click') { if (e.isTrusted) humanRun(900); }
  else if (a == 'resend') resendMail(b);
  else if (a == 'out') {
    const tk = ls.get('amx_token');
    clearSession(); render();
    if (tk) fetch(SB_URL + '/auth/v1/logout', { method:'POST', headers:{ apikey:SB_KEY, Authorization:'Bearer ' + tk } }).catch(() => {});
    returnTo = ''; location.hash = '#/';
  }
});
document.addEventListener('change', e => {
  if (e.target.dataset.a == 'cur') { cur = e.target.value; save(); render(); }
});
document.addEventListener('keydown', e => {
  if (e.key == 'Enter' && e.target.id == 'cpn') { e.preventDefault(); document.querySelector('[data-a=coupon]').click(); }
  if (e.key == 'Escape' && AI.open) aiToggle(false);
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.a == 'lk') { const x = cart.find(c => c.id == el.dataset.id); if (x) { x.l = el.value; save(); } return; }
  if (el.id == 'pw-input') {                                                       // password strength meter
    const v = el.value, fill = $('#pw-fill'), txt = $('#pw-text'); if (!fill) return;
    let s = 0; if (v.length >= 8) s++; if (/[A-Z]/.test(v)) s++; if (/[0-9]/.test(v)) s++; if (/[^A-Za-z0-9]/.test(v)) s++;
    const lv = [['25%', '#ef4444', 'weak'], ['25%', '#ef4444', 'weak'], ['50%', '#FBBF24', 'mid'], ['75%', '#3b82f6', 'good'], ['100%', '#22c55e', 'strong']][s];
    fill.style.width = lv[0]; fill.style.background = lv[1]; txt.textContent = t(lv[2]); txt.style.color = lv[1];
  }
});

/* ---------- 13. Auth: login, signup (+email confirmation), password recovery, human check ---------- */
/* Human check: a branded verification box (client-side deterrent; enable CAPTCHA in Supabase for real protection) */
let hvTimer;
const humanBox = () => `<div class="hv" id="hv" data-s="verifying" role="group" aria-live="polite">
  <div class="hv-l"><span class="hv-ic" id="hv-ic"></span><span class="hv-t" id="hv-t"></span></div>
  <div class="hv-r"><span class="hv-logo">${LOGO_SVG}</span><span class="hv-b"><b>AMARIX007</b><small>${t('hv_sec')} · <a href="#" data-a="ai-open">${t('hv_help')}</a></small></span></div>
  <input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"></div>`;
function setHv(s) {
  const box = $('#hv'); if (!box) return; box.dataset.s = s;
  const i = $('#hv-ic'), x = $('#hv-t');
  if (s == 'verifying') { i.innerHTML = '<span class="spin lg"></span>'; x.textContent = t('hv_ing'); }
  else if (s == 'ok') { i.innerHTML = ic('check', 22); x.textContent = t('hv_ok'); }
  else { i.innerHTML = '<button type="button" class="hv-cb" data-a="hv-click" aria-label="' + t('hv_human') + '"></button>'; x.textContent = t('hv_human'); }
}
function humanRun(ms) { clearTimeout(hvTimer); setHv('verifying'); hvTimer = setTimeout(() => setHv('ok'), ms); }
function humanStart() {
  if (!$('#hv')) return;
  if (navigator.webdriver) { setHv('manual'); return; }        // automation: needs a real click
  humanRun(1300 + Math.random() * 700);
}
const humanOk = form => { const box = $('#hv'); return !!box && box.dataset.s == 'ok' && !(form.elements.website && form.elements.website.value); };

function authPage() {
  let m = authMode;
  if (m == 'reset' && !recovery) m = authMode = 'forgot';
  const head2 = txt => `<h2 style="justify-content:center;margin-top:0">${txt}</h2>`;
  const eye = `<button type="button" data-a="pw" aria-label="show">${ic('eye', 18)}</button>`;
  const link = (a, txt) => `<a href="#" data-a="${a}" style="display:block;text-align:center;margin-top:10px;font-size:12px">${txt}</a>`;
  if (m == 'check') {
    const rec = checkKind == 'recover';
    return `<div class="box au done"><div class="okc">${ic('mail', 34)}</div><h1>${t(rec ? 'rcvt' : 'chkt')}</h1><p class="pd">${t(rec ? 'rcvd' : 'chkd')}</p>
      <div class="oid" dir="ltr">${ex(pendingEmail)}</div><p class="pd">${t(rec ? 'rcvh' : 'chkh')}</p>
      <div class="acts"><button class="b" data-a="resend">${t('resend')}</button><a href="#" class="b b2" data-a="auth-login">${t('backlogin')}</a></div></div>`;
  }
  if (m == 'forgot') return `<form class="box au" id="af" novalidate>${head2(t('forgot'))}<p class="pd" style="margin-bottom:12px;text-align:center">${t('forgothint')}</p>
    <label class="fld"><span>${t('em')}</span><input class="inp" name="e" type="email" dir="ltr" autocomplete="email" required></label>
    ${humanBox()}<p class="err" id="er" role="alert"></p>
    <button class="b block" type="submit">${t('forgotsend')}</button>${link('auth-login', t('backlogin'))}</form>`;
  if (m == 'reset') return `<form class="box au" id="af" novalidate>${head2(t('newpw'))}
    <label class="fld"><span>${t('newpw')}</span><div class="pw"><input class="inp" name="p" type="password" id="pw-input" autocomplete="new-password" required>${eye}</div>
      <div class="strength-bar"><div id="pw-fill"></div></div><small id="pw-text" style="font-size:11px"></small></label>
    <label class="fld"><span>${t('confpw')}</span><input class="inp" name="p2" type="password" autocomplete="new-password" required></label>
    <p class="err" id="er" role="alert"></p><button class="b block" type="submit">${t('resetbtn')}</button></form>`;
  const up = m == 'signup';
  return `<form class="box au" id="af" novalidate>${head2(up ? t('reg') : t('login'))}
    ${up ? `<label class="fld"><span>${t('nl')}</span><input class="inp" name="n" autocomplete="name" required></label>` : ''}
    <label class="fld"><span>${t('em')}</span><input class="inp" name="e" type="email" dir="ltr" autocomplete="email" required></label>
    <label class="fld"><span>${t('pw')}</span><div class="pw"><input class="inp" name="p" type="password" id="pw-input" autocomplete="${up ? 'new-password' : 'current-password'}" required>${eye}</div>
      ${up ? `<div class="strength-bar"><div id="pw-fill"></div></div><small id="pw-text" style="font-size:11px"></small>` : `<a href="#" class="forgot" data-a="auth-forgot">${t('forgot')}</a>`}</label>
    ${humanBox()}<p class="err" id="er" role="alert"></p>
    <button class="b block" type="submit">${up ? t('reg') : t('login')}</button>${googleBtn()}${link('toggle-mode', up ? t('has') : t('no'))}</form>`;
}

/* Official multicolour Google "G" (Google branding guidelines) */
const GICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
const googleBtn = () => googleOn ? `<div class="or"><span>${t('gor')}</span></div><button type="button" class="gbtn" data-a="google">${GICON}<span>${t('gbtn')}</span></button>` : '';

const authMsg = m => {
  const l = String(m || '').toLowerCase();
  if (l.includes('invalid login')) return t('badlogin');
  if (l.includes('not confirmed')) return t('unconf');
  if (l.includes('already')) return t('exists');
  if (l.includes('at least') || l.includes('weak')) return t('shortpw');
  if (l.includes('rate limit') || l.includes('too many') || l.includes('seconds')) return t('wait30');
  if (l.includes('not authorized') || l.includes('sending') || l.includes('smtp')) return t('mailfail');
  return m || t('net');
};
const siteBack = () => encodeURIComponent(location.origin + location.pathname);   // must be listed in Supabase > Auth > URL Configuration > Redirect URLs
const authPost = (path, body) => fetch(SB_URL + path, { method:'POST', headers:{ apikey:SB_KEY, 'Content-Type':'application/json' }, body:JSON.stringify(body) });
async function authFail(r) { const j = await r.json().catch(() => ({})); throw new Error(j.msg || j.error_description || j.message || ''); }

/* Referrals: remember ?ref=CODE (query string or hash) and count the click once per browser */
(function () { try {
  const m = (location.search + location.hash).match(/[?&]ref=([A-Za-z0-9]{6,12})/); if (!m) return;
  const c = m[1].toUpperCase(); localStorage.setItem('ax_ref', c);
  if (!localStorage.getItem('ax_ref_clk_' + c)) {
    localStorage.setItem('ax_ref_clk_' + c, '1');
    fetch(SB_URL + '/rest/v1/rpc/track_ref_click', { method:'POST', headers:{ apikey:SB_KEY, 'Content-Type':'application/json' }, body:JSON.stringify({ p_code:c }) }).catch(() => {});
  }
} catch {} })();
let refInfo = null;                           // { code, clicks, signups, sales, total_commission } for the account page

/* Best effort: read (or create) the user's row in `profiles` so the account page can show their name */
async function syncProfile() {
  if (!user) return;
  try {
    const r = await sb(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=full_name,ref_code`);
    if (!r.ok) return;
    const row = (await r.json())[0];
    if (row) {
      profileName = row.full_name || '';
      if (row.ref_code) {
        refInfo = { code: row.ref_code, clicks: 0, signups: 0, sales: 0, total_commission: 0 };
        const ar = await sb(`/rest/v1/affiliates?user_id=eq.${encodeURIComponent(user.id)}&select=clicks,signups,sales,total_commission`);
        if (ar.ok) Object.assign(refInfo, (await ar.json())[0] || {});
      }
    }
    else {
      const full_name = nameOf();
      await sb('/rest/v1/profiles', { method:'POST', prefer:'resolution=ignore-duplicates,return=minimal', body:{ id:user.id, email:user.email, full_name } });
    }
    if (/^#\/account/.test(location.hash)) render();
  } catch {}
}

document.addEventListener('submit', async e => {
  if (e.target.id != 'af') return;
  e.preventDefault();
  const form = e.target, f = new FormData(form), er = $('#er'), btn = form.querySelector('[type=submit]');
  er.textContent = '';
  const email = String(f.get('e') || '').trim(), pw = String(f.get('p') || ''), name = String(f.get('n') || '').trim();
  try {
    /* --- set a new password (arrived from the recovery e-mail) --- */
    if (authMode == 'reset') {
      if (pw.length < 6) { er.textContent = t('shortpw'); return; }
      if (pw !== String(f.get('p2') || '')) { er.textContent = t('pwmis'); return; }
      setBusy(btn, true);
      const r = await fetch(SB_URL + '/auth/v1/user', { method:'PUT',
        headers:{ apikey:SB_KEY, Authorization:'Bearer ' + recovery.access_token, 'Content-Type':'application/json' }, body:JSON.stringify({ password:pw }) });
      if (!r.ok) await authFail(r);
      const u = await r.json();
      storeSession({ access_token:recovery.access_token, refresh_token:recovery.refresh_token, user:u });
      recovery = null; authMode = 'login'; toast(t('resetok')); beep('ok'); syncProfile(); location.hash = '#/account'; if (location.hash == '#/account') render();
      return;
    }
    /* --- everything below needs the human check --- */
    if (!email || (authMode != 'forgot' && !pw)) { er.textContent = t(authMode == 'forgot' ? 'fillm' : 'fill'); return; }
    if (!humanOk(form)) { er.textContent = t('hv_wait'); return; }
    setBusy(btn, true);

    /* --- forgot password: real Supabase recovery e-mail --- */
    if (authMode == 'forgot') {
      const r = await authPost('/auth/v1/recover?redirect_to=' + siteBack(), { email });
      if (!r.ok) await authFail(r);
      pendingEmail = email; checkKind = 'recover'; authMode = 'check'; resendAt = Date.now(); beep('ok'); render();
      return;
    }
    /* --- login / signup --- */
    const signup = authMode == 'signup';
    const r = signup
      ? await authPost('/auth/v1/signup?redirect_to=' + siteBack(), { email, password:pw, data:{ full_name:name, name, ref:(() => { try { return localStorage.getItem('ax_ref') || ''; } catch { return ''; } })() } })
      : await authPost('/auth/v1/token?grant_type=password', { email, password:pw });
    if (!r.ok) await authFail(r);
    const j = await r.json();
    const ids = j.identities || (j.user && j.user.identities);
    if (signup && !j.access_token && Array.isArray(ids) && !ids.length) throw new Error('already registered');   // Supabase hides an existing e-mail behind an empty identities list
    if (j.access_token) {                                   // signed in (login, or signup with auto-confirm)
      storeSession(j); toast(t('loggedin')); beep('ok'); syncProfile();
      const to = returnTo && !/login/.test(returnTo) ? returnTo : '#/'; returnTo = ''; location.hash = to;
      if (location.hash == to) render();
    } else {                                                // signup needs e-mail confirmation: show the "check your inbox" page
      pendingEmail = email; checkKind = 'signup'; authMode = 'check'; resendAt = Date.now(); beep('ok'); render();
    }
  } catch (err) { er.textContent = authMsg(err.message); humanStart(); }
  finally { setBusy(btn, false); }
});

async function resendMail(btn) {
  if (Date.now() - resendAt < 30000) return toast(t('wait30'), 'wn');
  setBusy(btn, true);
  try {
    const r = checkKind == 'recover'
      ? await authPost('/auth/v1/recover?redirect_to=' + siteBack(), { email:pendingEmail })
      : await authPost('/auth/v1/resend?redirect_to=' + siteBack(), { type:'signup', email:pendingEmail });
    if (!r.ok) await authFail(r);
    resendAt = Date.now(); toast(t('resent')); beep('ok');
  } catch (err) { toast(authMsg(err.message), 'er'); }
  finally { setBusy(btn, false); }
}

/* A Google sign-up can't carry the affiliate code in the request (the e-mail form does), so attach it right after the first sign-in */
function attachRef(tk, u) {
  try {
    const c = localStorage.getItem('ax_ref');
    if (!c || (u.user_metadata || {}).ref || Date.now() - new Date(u.created_at) > 120000) return;
    fetch(SB_URL + '/auth/v1/user', { method:'PUT', headers:{ apikey:SB_KEY, Authorization:'Bearer ' + tk, 'Content-Type':'application/json' }, body:JSON.stringify({ data:{ ref:c } }) }).catch(() => {});
  } catch {}
}

/* Show the Google button only when the provider is enabled in Supabase (otherwise the button would lead to an error page) */
async function checkGoogle() {
  try {
    const r = await fetch(SB_URL + '/auth/v1/settings', { headers:{ apikey:SB_KEY } });
    const on = !!((await r.json()).external || {}).google;
    ls.set('amx_gg', on ? '1' : '0');
    if (on == googleOn) return;
    googleOn = on;
    const f = $('#af');                                                          // repaint the login page only if the person has not typed anything yet
    if (f && ![...f.querySelectorAll('input')].some(i => i.type != 'hidden' && i.value)) render();
  } catch {}
}
addEventListener('pageshow', e => { if (e.persisted) render(); });                // back from Google: re-enable the button

/* Links in e-mails come back as  #access_token=…&type=recovery|signup  (or #error=…). Handle them, then clean the URL. */
async function handleAuthRedirect() {
  const h = location.hash || '';
  if (h.startsWith('#/') || !/(access_token|error)=/.test(h)) return;
  const p = new URLSearchParams(h.slice(1));
  history.replaceState(null, '', location.pathname + location.search + '#/');
  if (p.get('error')) { authMode = 'login'; history.replaceState(null, '', location.pathname + location.search + '#/login'); const ec = p.get('error_code') || '', oauth = p.get('error') == 'access_denied' || (ec && !/otp/.test(ec)); setTimeout(() => toast(t(oauth ? 'gerr' : 'resetbad'), 'er'), 400); return; }
  const access_token = p.get('access_token'), refresh_token = p.get('refresh_token');
  if (p.get('type') == 'recovery') {
    recovery = { access_token, refresh_token }; authMode = 'reset';
    history.replaceState(null, '', location.pathname + location.search + '#/login'); return;
  }
  try {                                                     // signup confirmation / magic link
    const r = await fetch(SB_URL + '/auth/v1/user', { headers:{ apikey:SB_KEY, Authorization:'Bearer ' + access_token } });
    if (!r.ok) throw new Error('user');
    const u = await r.json();
    storeSession({ access_token, refresh_token, user: u });
    attachRef(access_token, u);
    setTimeout(() => { toast(t('confok')); beep('ok'); }, 500);
  } catch {}
}

/* ---------- 14. Search, banners & router ---------- */
const nz = x => String(x).toLowerCase().replace(/[ً-ٟ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
const hit = (p, k) => { const h = nz(p.ar + ' ' + p.en + ' ' + p.tg + ' ' + p.sp); return nz(k).split(/\s+/).filter(Boolean).every(w => h.includes(w)); };
$('#q').addEventListener('input', e => {
  q = e.target.value;
  if (q && (location.hash || '#/') != '#/') location.hash = '#/'; else render();
});

/* Banner carousel: auto-advance (5s) with a progress bar on the active dot, arrows, clickable dots,
   pause on touch/hover, active-slide highlight. Centre-to-centre scrolling works in both RTL and LTR. */
let banTimer, bannerCtl = null;
function startBanners() {
  clearTimeout(banTimer); bannerCtl = null;
  const el = document.querySelector('.ban');
  if (!el || el.children.length < 2) return;
  const wrap = el.parentElement, kids = [...el.children], dots = [...wrap.querySelectorAll('.dots button')], DUR = 5000;
  wrap.style.setProperty('--bt', DUR + 'ms');
  const mid = r => r.left + r.width / 2;
  const current = () => { const c = mid(el.getBoundingClientRect()); let bi = 0, bd = 1e9;
    kids.forEach((k, i) => { const d = Math.abs(mid(k.getBoundingClientRect()) - c); if (d < bd) { bd = d; bi = i; } }); return bi; };
  let idx = 0, resume;
  const schedule = () => { clearTimeout(banTimer); banTimer = setTimeout(tick, DUR); };
  const mark = i => { idx = i; kids.forEach((k, j) => k.classList.toggle('cur', j == i)); dots.forEach((d, j) => { d.classList.remove('on'); if (j == i) { void d.offsetWidth; d.classList.add('on'); } }); schedule(); };
  const to = i => { i = (i + kids.length) % kids.length; el.scrollBy({ left: mid(kids[i].getBoundingClientRect()) - mid(el.getBoundingClientRect()), behavior: 'smooth' }); };
  function tick() {
    if (!document.body.contains(el)) return;
    if (wrap.classList.contains('hold') || document.hidden) return schedule();
    to(idx + 1);
  }
  const hold = () => { clearTimeout(banTimer); clearTimeout(resume); wrap.classList.add('hold'); };
  const release = () => { clearTimeout(resume); resume = setTimeout(() => { wrap.classList.remove('hold'); mark(idx); }, 2500); };
  ['touchstart', 'pointerdown', 'mouseenter'].forEach(ev => wrap.addEventListener(ev, hold, { passive: true }));
  ['touchend', 'pointerup', 'mouseleave'].forEach(ev => wrap.addEventListener(ev, release, { passive: true }));
  el.addEventListener('scroll', () => { const i = current(); if (i != idx) mark(i); }, { passive: true });
  bannerCtl = { to, step: d => to(idx + d) };
  mark(0);
}

const AUTH_ROUTES = ['orders', 'account'];
function render() {
  if (waitCfg) { $('#m').innerHTML = skeletonGrid(); return; }
  const seq = ++routeSeq;
  const [h] = (location.hash || '#/').split('?'), [, r, id] = h.split('/');
  if (AUTH_ROUTES.includes(r) && !user) { returnTo = location.hash; location.hash = '#/login'; return; }
  if (r == 'login' && user && authMode != 'reset') { location.hash = '#/account'; return; }
  const m = $('#m');
  if (r == 'orders') { m.innerHTML = loadingBox(); nav(); ordersPage(seq); return; }
  m.innerHTML = r == 'c' ? catPage(dec(id || '')) : r == 'p' ? prodPage(dec(id || ''))
    : r == 'cart' ? cartPage() : r == 'fav' ? favPage() : r == 'login' ? authPage()
    : r == 'account' ? accPage() : r == 'done' ? donePage(dec(id || '')) : home();
  nav(); startBanners();
  if (r == 'login') humanStart();
}
addEventListener('hashchange', () => { scrollTo(0, 0); render(); });

/* ---------- 15. Boot ---------- */
/* A config published by an older admin may lack newer sections (payments, partner, social…): fall back to the embedded ones */
function withDefaults(d) {
  const o = { ...d };
  ['partner', 'social', 'payments', 'rates', 'banners', 'coupons', 'embeds'].forEach(k => { if (o[k] == null && CFG0[k] != null) o[k] = CFG0[k]; });
  o.site = { ...(CFG0.site || {}), ...(d.site || {}) };
  return o;
}
let waitCfg = false;                                        // true while we wait for the first published config (nothing cached yet)
async function boot() {
  user = ls.json('amx_user', null);
  if (user && !ls.get('amx_token')) user = null;
  checkGoogle();
  await handleAuthRedirect();
  /* Stale-while-revalidate: the last published config is cached in localStorage ('amx_remote') and used for the first paint,
     so returning visitors never see the embedded placeholder store. With no cache yet (first visit) we show a skeleton
     instead of the placeholders, and fall back to the embedded copy only if the request fails or is too slow. */
  const cached = REMOTE_CFG && Array.isArray(REMOTE_CFG.products) ? REMOTE_CFG : null;
  let painted = false;
  if (cached) { setCfg(withDefaults(cached)); head(); render(); painted = true; }
  else { setCfg(CFG0); waitCfg = true; $('#m').innerHTML = skeletonGrid(); }
  // NOTE: api_settings (secret keys) is intentionally NOT fetched here.
  try {                                                    // newer config published from the admin panel
    const r = await Promise.race([sb('/rest/v1/store_config?id=eq.1&select=data', { auth:false }), new Promise((_, no) => setTimeout(no, 7000))]);
    const d = ((await r.json())[0] || {}).data;
    if (d && Array.isArray(d.products)) {
      ls.set('amx_remote', d);                             // remember it for the next visit
      if (!cached || d.ts !== cached.ts) { setCfg(withDefaults(d)); painted = false; }   // only repaint when something really changed
      else painted = true;
    }
  } catch {}
  waitCfg = false; loadingCfg = false;
  if (!painted) { head(); render(); }                      // first paint (no cache) or a newer published version
  if (user) syncProfile();
}
boot();
