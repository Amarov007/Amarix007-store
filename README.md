# AMARIX007 — متجر الأصول الرقمية

واجهة ثابتة (HTML/CSS/JS بلا بناء) تُنشر على GitHub Pages، والخلفية على Supabase.

## الملفات
- `index.html` + `app.js` + `style.css` + `store-data.js` — المتجر. `store-data.js` نسخة احتياطية فقط؛ الإعدادات الحية تأتي من `public_config()`.
- `admin.html` + `admin.js` + `admin.css` — لوحة الإدارة (`noindex`).
- `sw.js` — Service Worker (كاش للهيكل والأيقونات + الإشعارات).
- `supabase-schema.sql` — مخطط قاعدة جديدة. `supabase-security-fixes.sql`, `supabase-support-tickets.sql` — ترقيات.
- `supabase/functions/*` — مصدر الدالة الطرفية `send-push`. حمّل الباقي بـ `supabase functions download ai-support smm-order media-seed img-shrink`.
- `supabase/migrations/*` — التعديلات المطبّقة على القاعدة الحية بعد هذا التاريخ.

## ملاحظات مهمة
- القاعدة الحية تحوي جداول غير موجودة في ملفات SQL هنا: `push_subscriptions`, `push_broadcasts`, `reviews`, `payout_requests` ودوال مرتبطة بها. للمزامنة: `supabase db pull`.
- بعد تعديل `app.js` أو `style.css` أو `store-data.js` ارفع رقم `?v=` في `index.html`.
- المتجر يطلب تسجيل الدخول ثم تفعيل الإشعارات. صفحتا `#/policies` و`#/faq` مفتوحتان دون حساب.
- CAPTCHA حقيقي: ضع مفتاح Turnstile العام في `TURNSTILE_SITE_KEY` (قسم 13 في `app.js`) وفعّل Captcha في Supabase > Auth > Attack Protection بالمفتاح السري.
- تفعيل Leaked Password Protection من لوحة Supabase > Auth > Providers > Email (إعداد لا يمكن تغييره بـ SQL).
