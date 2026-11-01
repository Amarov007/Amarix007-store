# قائمة الأمان قبل الإطلاق — AMARIX007

1. **مفتاح المزوّد (SMM):** إن ظهر في أي محادثة أو لقطة شاشة، بدّله من حساب المزوّد ثم احفظ الجديد في لوحة الإدارة › إعدادات APIs. المفتاح لا يوضع في `app.js`.
2. **Turnstile (كابتشا حقيقية):** ضع المفتاح العام في `TURNSTILE_SITE_KEY` (القسم 13 في `app.js`)، وفعّل Captcha في Supabase › Auth › Attack Protection بالمفتاح السري.
3. **Leaked Password Protection:** فعّلها من Supabase › Auth › Providers › Email.
4. **RLS:** شغّل `supabase-rls-audit.sql` في SQL Editor. الاستعلام 1 يجب أن يكون فارغاً، والاستعلام 3 لا يُظهر جداول حساسة (`api_settings`, `orders`, `profiles`, `payout_requests`, `push_subscriptions`) للدور `anon`.
5. **مزامنة القاعدة:** الجداول `push_subscriptions` و`push_broadcasts` و`reviews` و`payout_requests` وغيرها صارت معرَّفة في `supabase-live-sync.sql`. ما بقي (دوال مساعدة وتريغرات ووظائف cron) مدرج في `docs/LIVE-ONLY.md`؛ نفّذ `supabase db pull` لحفظه.
6. **حساب الإدارة:** استخدم كلمة مرور طويلة فريدة، وفعّل التحقق بخطوتين على حساب Supabase.
7. **بعد الرفع:** افتح المتجر في نافذة خاصة وتأكد أن الطلب لا يُنشأ بدون تسجيل دخول، وأن `admin.html` لا يفتح بدون حساب مدير.
