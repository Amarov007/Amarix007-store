# ترتيب تشغيل ملفات SQL (Supabase › SQL Editor)

> ترتيب مقترح مبني على ملفات المستودع، وليس تأكيداً بأن قاعدة الإنتاج مطابقة لها. لم تُسحب لقطة SQL حية كاملة في جلسة العمل هذه؛ راجع `docs/LIVE-ONLY.md` قبل التشغيل. يفحص `tests/verify-project.py` تكرار تعريفات الدوال محلياً، وكل `revoke/grant execute` الجديدة مجمّعة في `supabase-final-grants.sql` الذي يُشغَّل **أخيراً دائماً**.

## قاعدة جديدة (مشروع Supabase فارغ)

| # | الملف | ملاحظة |
| --- | --- | --- |
| 1 | `supabase-schema.sql` | المخطط الكامل (جداول، سياسات RLS، دوال، تريغرات، صلاحيات التنفيذ، Storage، وظيفتا pg_cron). يتضمن تذاكر الدعم. |
| 2 | `supabase-staff.sql` | الموظفون وصلاحياتهم (`staff_members`, `has_perm`, `my_staff_perms`, `staff_save_products`). |
| 3 | `supabase-affiliate-program.sql` | برنامج الشركاء (طلب انضمام + موافقة). |
| 4 | `supabase-affiliate-tiers.sql` | شرائح العمولة والتقارير الشهرية. بعد رقم 3 دائماً. |
| 5 | `supabase-boost-units.sql` | تعريف `orders_enforce_pricing` الوحيد (سعر الوحدة بـ 6 خانات، حد أعلى للكمية 10,000,000) **وتريغره**. |
| 6 | `supabase-wallet.sql` | المحفظة (`wallets`, `wallet_transactions`, `wallet_topups` + الدوال). يتطلب `profiles` و`rl_hit` و`notify_telegram` من رقم 1. |
| 7 | `supabase-live-sync.sql` | **جديد:** الجداول والسياسات والدوال التي كانت في القاعدة الحية فقط (التقييمات، الإشعارات، السلة، طلبات السحب، إحصاءات اللوحة…). يتطلب `profiles` و`orders` و`support_tickets` و`rl_hit` و`notify_telegram` و`notify_settings`. آمن لإعادة التشغيل. |
| 7b | `supabase-user-uid.sql` | **جديد:** عمود `profiles.uid` (8 أرقام فريدة لكل مستخدم، ثابت لا يعدّله المستخدم) + دالة `admin_find_user(uid)` لبحث الإدارة. بعد 3 و6. |
| 7c | `supabase-invoices.sql` | **جديد:** نظام الفواتير: جدول `invoices` + فاتورة تلقائية لكل طلب (تريغر) + `get_invoice` و`admin_invoices`. بعد 7b. |
| 7d | `supabase-payment-lockdown.sql` | **جديد (إصلاح عاجل):** يمنع تغيير `payment_status` مباشرة من REST، سجل تدقيق `order_payment_audit`، ويعرّف `approve_manual_payment`. بعد 7c. على قاعدة حية: اقرأ نسختك الحالية من الدالة أولاً (انظر رأس الملف). |
| 7e | `supabase-payments.sql` | **جديد:** نظام الدفع الموحّد (payments، الأحداث، الاسترجاع، آلة الحالات، الدوال، cron انتهاء الصلاحية). بعد 7d. يعمل خلف العلم `payments_v2.on` (مغلق افتراضياً). |
| 7f | `supabase-payments-migrate.sql` | **يدوي مرة واحدة** قبل تفعيل العلم: ترحيل الطلبات/الشحنات القديمة وأرصدة الأقسام إلى الرصيد العام مع مطابقة المجموع. |
| 8 | `supabase-rls-audit.sql` | استعلامات قراءة فقط للتدقيق (لا تغيّر شيئاً). الاستعلام 1 يجب أن يعود فارغاً. |
| 9 | `supabase-final-grants.sql` | **الأخير دائماً.** `revoke` شامل ثم كل صلاحيات `grant execute` (بالاسم لا بالتوقيع)، مطابقة لصلاحيات القاعدة الحية. آمن لإعادة التشغيل في أي وقت. |

لا تشغّل `supabase-security-fixes.sql` ولا `supabase-support-tickets.sql` على قاعدة جديدة: الأول ترقية للقواعد القديمة والثاني مضمَّن في المخطط. بعد توحيد التعريفات لم يعد في هذين الملفين أي `create function` مكرر؛ تعريفات الدوال التي كانت فيهما موجودة الآن في `supabase-schema.sql` (والتريغرات المرتبطة بالدوال المنقولة تُنشأ في الملف الذي يعرّف دالتها: `on_auth_user_created` و`profiles_protect_referral_trg` في `supabase-affiliate-program.sql`، و`orders_affiliate_trg` في `supabase-affiliate-tiers.sql`، و`orders_enforce_pricing` في `supabase-boost-units.sql`). لذلك على قاعدة قديمة جداً شغّل `supabase-schema.sql` أولاً.

بعد الملف 1 نفّذ يدوياً (مذكور في رأس الملف):

```sql
insert into public.admins(email, user_id)
select email, id from auth.users
where lower(email) = lower('you@example.com') and email_confirmed_at is not null
on conflict (email) do update set user_id = excluded.user_id;
```

ثم فعّل **Leaked password protection** من Authentication › Providers › Email (إعداد لوحة، لا يُغيَّر بـ SQL).

## قاعدة حية موجودة

شغّل فقط ما لم يُطبَّق بعد، وبالترتيب نفسه أعلاه، **وأنهِ دائماً بـ `supabase-final-grants.sql`**. لم يعد الملفان `supabase-schema.sql` و`supabase-security-fixes.sql` يحويان `revoke` شاملاً، ولم يعد أي ملف يعيد تعريف دالة بنسخة أقدم، فلا خطر من «permission denied for function» أو رجوع حد الكمية القديم بصمت. مع ذلك لا حاجة لإعادة تشغيل `supabase-schema.sql` على قاعدة تعمل.

إن ظهر خطأ `permission denied for function` لأي سبب: شغّل `supabase-final-grants.sql` فقط.

**دالة جديدة تُستدعى من المتصفح:** أضف اسمها إلى مصفوفة `anon_and_auth` أو `auth_only` في `supabase-final-grants.sql` وإلا فلن تُمنح صلاحية التنفيذ.

**ملاحظة (2026-10-25):** زُوِّد `supabase-wallet.sql` بتعريفات القاعدة الحية (`wallet_topup_set_proof(bigint, text, text)` و`wallet_topup_claim(bigint, text)` والموافقة المزدوجة والأعمدة `tx_ref` و`proof_hash`…)، فلم يعد هناك اختلاف توقيعات. **لا تشغّل النسخ القديمة من هذه الدوال على القاعدة الحية** (كانت ستُنشئ overload ثانياً).

## كائنات موجودة في القاعدة الحية فقط

ما بقي من الدوال المساعدة والتريغرات ووظائف pg_cron (تذكير السلة والدفع، سجل النشاط، لقطة الإعدادات) وEdge Functions مدرج في [`docs/LIVE-ONLY.md`](docs/LIVE-ONLY.md) مع طريقة سحبها بـ `supabase db pull`. لقاعدة جديدة تماماً ستفتقد هذه الكائنات حتى تُستورد من المشروع الحي.

## أوامر Supabase CLI

```bash
supabase login
supabase link --project-ref pvuobngrybygohendwaz
supabase db pull                                   # يحفظ المخطط الحي (يشمل الكائنات الموجودة في docs/LIVE-ONLY.md)
supabase functions download ai-support
supabase functions download smm-order
supabase functions download media-seed
supabase functions download img-shrink
supabase functions download send-push
supabase functions download telegram-auth
supabase functions download api-hub # ظهر في بيانات التعريف الحية
supabase functions deploy send-push                # بعد تعديل supabase/functions/send-push
```

## pg_cron (اختياري، لكن موصى به)

`supabase-schema.sql` ينشئ وظيفتين: `amarix-keepalive` (كل 3 أيام) و`amarix-ratelimit-cleanup` (يومياً 03:17). للتحقق:

```sql
select jobname, schedule, active from cron.job order by jobname;
```

إن كان الناتج فارغاً (امتداد pg_cron غير مفعّل): فعّله من Database › Extensions ثم أعد تشغيل مقطع «pg_cron» الأخير من `supabase-schema.sql` (الأسطر التي تحوي `cron.schedule`). احذر: المقطع يحذف الوظيفتين القديمتين بالاسم نفسه ثم ينشئهما، فلا يتكرر.

## تحديث 2026-10-27: دخول تيليغرام، CORS، الفحوص

1. **انشر الدالتين من مكانهما الجديد** (`supabase/functions/<name>/index.ts`):
   ```
   supabase functions deploy telegram-auth --no-verify-jwt
   supabase functions deploy smm-order
   ```
   `smm-order` يقبل الآن الطلبات من `amarix007.store` و`www.amarix007.store` فقط. لإضافة نطاق آخر (تجريبي مثلاً):
   `supabase secrets set ALLOWED_ORIGINS=https://staging.example.com`
2. **نفّذ `supabase-telegram-login.sql` من جديد** (آمن لإعادة التشغيل). القسم 2 يغطي الآن بريد `@telegram.amarix007.store`.
   قبل تنفيذ القسم 3 (وسم الحسابات القديمة) شغّل استعلام الفحص (أ) المعلَّق داخله وراجع أي حساب `has_password = true`.
3. أي حساب تيليغرام قديم بلا وسم `tg_id` سيُرفض (`account_conflict`) حتى يُوسَم؛ هذا مقصود.
4. الفحوص الآلية (تعمل تلقائياً في workflow الاستبدال، ويمكن تشغيلها محلياً):
   ```
   for f in *.js; do node --check "$f"; done
   python3 tests/verify-project.py
   node tools/lint-html-escape.mjs
   ```


## تفعيل نظام الدفع الموحّد (payments_v2)

يبقى العلم `payments_v2.on=false` بعد تطبيق migration. **لا تنفّذ تفعيل SQL مباشراً ولا تفعّل على الإنتاج لمجرد أن migration نجحت.** فعّله من لوحة الإدارة عبر `payments_v2_flag_set` فقط بعد اكتمال لقطة القاعدة الحية، والهجرة ومطابقة المجاميع واختبارات مستخدمين اثنين والتأكد من نشر الدوال والواجهة المتوافقتين. فوق ذلك يجب تقرير نافذة التبديل: أغلفة v1 في هذا الفرع ترفض المسارات القديمة بـ `use_payments_v2`، لذا لا توجد هنا فترة توافق خلفي كاملة مضمونة.

لإيقاف النظام طارئاً استخدم واجهة الإدارة أو سكربت التوقف المحافظ `supabase/rollbacks/20261028070000_payments_restructure.sql`. هذا يوقف العلم والجدولة مع حفظ الدفتر المالي؛ **ليس عكساً كاملاً لتعريفات SQL**.


## إعادة هيكلة الدفع (migration مؤرَّخة — لا تشغّل على الإنتاج بلا بيئة اختبار)

للترقية على قاعدة تتضمن المخطط الأساسي والملفات السابقة:

1. اسحب المخطط الحي أولاً (`supabase db pull`) وراجع `docs/LIVE-ONLY.md` و`CHANGELOG-PAYMENTS.md`. لا تنفّذ migration من ZIP على أساس افتراض أن القاعدة مطابقة.
2. شغّل `supabase-payments.sql` فقط إذا كانت التعريفات والجداول التي ينشئها غير موجودة بعد؛ لا تعِد إنشاء بيانات متطابقة من دون مراجعة.
3. بعد تهيئة `store_config`, `orders`, `profiles`, `wallets`, `wallet_transactions`, `wallet_topups`, `payment_methods`, `payments` والدوال الأساسية، راجع diff ثم نفّذ `supabase/migrations/20261028070000_payments_restructure.sql` على قاعدة اختبار. الملف مضاف وآمن لإعادة التشغيل في تصميمه، لكنه يتعمد إيقاف التنفيذ عند تضارب بيانات الدفتر أو تكرار الإثبات/مرجع التحويل.
4. تحقق من `supabase/tests/payments_v2_contract.sql`، ثم نفّذ استيراد البيانات عبر `supabase-payments-migrate.sql` داخل معاملة. هو قابل لإعادة التشغيل ويوقف عند فرق المجاميع. لا تدخل الطلبات التاريخية الملتقطة تلقائياً إلى طابور التنفيذ؛ راجع حالات التسليم القديمة يدوياً قبل إعادة أي طلب. راجع counts/money totals و`wallet_reconcile()` و`payments_reconcile()` قبل/بعد.
5. انشر `smm-order`, `payment-proof-hash`, و`fulfillment-worker` في بيئة اختبار، ثم اختبر تدفق دفع يدوي، مستخدمين اثنين، صرف/اعتماد/استرداد متزامن وحالات المزوّد. لا تنشر الواجهة حتى تنجح.
6. شغّل `supabase-final-grants.sql` **أخيراً دائماً**. لا تضف دالة جديدة تُستدعى من المتصفح من دون إدراجها في `anon_and_auth` أو `auth_only`.
7. يبقى `payments_v2.on=false` و`payment_methods.confirm_mode='manual'` افتراضياً. لا تفعّل العلم قبل إكمال إعداد الأسرار والـ cron والواجهة المطابقة. التفعيل يتم من لوحة الإدارة (صلاحية `payments.settings`) وليس من خلال واجهة المتجر.

يُحفظ السيناريو المحافظ للتوقف في `supabase/rollbacks/20261028070000_payments_restructure.sql`. هذا الملف يوقف العلم والجدولة مع حفظ دفتر المال؛ لا يستعيد تلقائياً أجسام RPC القديمة. العودة إلى UI قديمة تتطلب استعادة أجسامها من نسخة موثوقة أولاً، كما هو موضح في `docs/manual-owner-steps.md`.

## إصلاح أداء النشر الحي (29 أكتوبر 2026)

- `supabase-publish-performance-fix.sql`: ترقية قاعدة حية فقط، تتضمن إصلاح المقارنة داخل `config_activity()`، وRPC النشر الذري `publish_store_config()`، وفهارس طوابير الإدارة والمفاتيح الخارجية. طُبّق هذا التغيير مباشرة على مشروع Matgri (pvuobngrybygohendwaz) وتحقّق وجود الدالة والفهارس بعد التطبيق.
- لا ترفع `statement_timeout` على مستوى المشروع؛ سبب الخطأ المثبت كان المقارنة التربيعية لمصفوفة المنتجات (9,034 منتجاً) داخل trigger. الواجهة تستخدم الآن فروق المنتجات/الإعدادات مع حفظ ذري وفحص timestamp لمنع الكتابة فوق نسخة أحدث.
- لا تشغّل هذا الملف على قاعدة جديدة قبل `supabase-schema.sql` وبقية ملفات المخطط؛ هو ترقية لقاعدة تحتوي بالفعل على `store_config` و`has_perm` و`log_activity`.


## ترقيات الأداء وتشغيل الإدارة — 29 أكتوبر 2026

- `supabase/migrations/20261029080000_publish_performance_fix.sql`: نشر ذري باستخدام فروق المنتجات، إصلاح المقارنة المكلفة في `config_activity()`، وفهارس طوابير الإدارة والمفاتيح الخارجية.
- `supabase/migrations/20261029081000_admin_ops_hardening.sql`: إشعارات Telegram لدفعات الدفع v2 وطلبات شحن المحافظ عند انتظار المراجعة، تنبيه منخفض الرصيد (حد افتراضي 5 من عملة المزود مع كبح التكرار 6 ساعات)، تنبيه تغيّر أسعار المنتجات عند فحص لوحة الإدارة، إحصاءات دقيقة من الخادم، وتعطيل وسيلة Sham Cash ذات بيانات الحساب الوهمية/غير الصالحة مع إبقاء سجلها المالي.
- طُبّقت التغييرات على مشروع الإنتاج `pvuobngrybygohendwaz`. تم التحقق من أن وسيلة Sham Cash المعطوبة معطلة وغير موجودة في إعدادات الدفع العامة، وأن تريغرات الإشعارات وفهارس طوابير المراجعة موجودة.
- لا ترفع `statement_timeout`؛ السبب الجذري كان فحصاً تربيعياً لـ 9,034 منتجاً داخل تريغر النشر. دالة النشر الجديدة تحفظ التعديلات ذرياً وتمنع الكتابة فوق نسخة أحدث.
- تنبيه Telegram يعتمد على إعدادات `notify_settings` الحالية. تنبيه رصيد المزود يُفحص عند فتح لوحة الإدارة/فحص الرصيد، وتنبيه الأسعار عند اكتشاف الانحراف في لوحة الإدارة؛ ليسا فحصاً مجدولاً مستقلاً على مدار الساعة.
- لا يوجد webhook تفاعلي للبوت منشور في المشروع الحالي؛ الإشعارات الحالية أحادية الاتجاه، ولم تُمنح أزرار Telegram صلاحية تغيير الطلبات أو اعتماد الأموال دون ربط هوية أدمن موثوقة.

- `supabase/migrations/20261029082000_secure_telegram_admin_webhook.sql`: RPC مقيد بـ service_role فقط، secret عشوائي مخزّن في `notify_settings`، وربط إجراءات البوت بهوية الدردشة الخاصة الوحيدة. تم نشر Edge Function `telegram-admin` وتسجيل webhook في Telegram؛ استجابة Telegram كانت HTTP 200 و`ok=true` (`Webhook was set`).
- أوامر البوت: `/pending`, `/orders`, `/order ID STATUS CONFIRM`, `/ticket ID CONFIRM REPLY`, `/ticket_status ID STATUS CONFIRM`, `/topup_approve ID CONFIRM [AMOUNT]`, `/topup_reject ID CONFIRM [REASON]`, `/payment_prepare UUID`, ثم `/payment_approve UUID TOKEN AMOUNT CURRENCY CONFIRM [NOTE]`. كل تعديل يتطلب كلمة CONFIRM، وإجراءات الدفع تستخدم RPC المالية الحالية مع تحقق الإيصال والمبلغ والمراجع المزدوجة.
- البوت يقبل الأوامر من الدردشة الخاصة المحددة فقط؛ إذا أُضيف أدمن ثانٍ إلى جدول `admins`، تتوقف إجراءات البوت عن العمل عمداً حتى يُضاف ربط صريح لهوية Telegram بكل حساب أدمن.

- **ملاحظة أسرار المزودين:** أظهر الفحص أن مفاتيح المزوّد الرئيسي وFazerCards وManger2 وGizli ما زالت موجودة في أعمدة قاعدة البيانات، وأسماء Edge Secrets غير مضبوطة. لم تُحذف هذه القيم أو تُغيّر كي لا تتعطل الطلبات؛ لا تضغط «حذف مفاتيح SMM القديمة» قبل نقلها إلى Edge Secrets والتحقق من اتصال كل مزوّد. واجهة التكامل المتاحة في هذه الجلسة لا توفر عملية آمنة لكتابة أسرار Edge، لذلك بقي هذا الإجراء غير مكتمل.
- **إعداد أمان Auth:** حماية كلمات المرور المسرّبة ما زالت معطلة وفق Security Advisor، وهذا إعداد Authentication يحتاج تغييره من لوحة Supabase؛ لم أغيّر إعداد Auth عبر SQL أو أضعف صلاحيات أي دالة عشوائياً.

- `20261029100000_split_storefront_catalog_hubs.sql`: يفصل الألعاب عن تطبيقات الدردشة والبث والتطبيقات الرقمية، وينشئ مساحة مستقلة لاشتراكات الذكاء الاصطناعي، ويطلب User ID لمنتجات Dazz Live.
- `20261029101500_add_pubg_uc_catalog_slot.sql`: ينشئ بطاقة PUBG Mobile UC بحالة «قريباً» فقط؛ لم يعرض كتالوج FazerCards الحالي PUBG/UC، لذلك لا توجد أسعار وهمية أو زر شراء لمنتج غير متاح.
- `20261029103000_require_user_ids_for_direct_topups.sql`: يفعّل إدخال User ID في منتجات Bigo Live وChamet وDazz Live وCapCut وCall of Duty Mobile (India) وفق متطلبات كتالوج المزوّد. بيانات العميل تُحفظ في `orders.items[].link` مع الطلب.
- `20261029104500_correct_chat_app_account_id_labels.sql`: يضمن أن Bigo Live وChamet وDazz Live وCapCut وCall of Duty Mobile تطلب `user_id` بالاسم الصحيح، بدلاً من خلطه بمعرّف لاعب أو بريد إلكتروني.
- `20261029110000_require_ids_for_single_field_fazer_topups.sql`: يفعّل إدخال المعرّف المناسب حسب توثيق FazerCards في الباقات التي تتطلب حقلاً واحداً (Player ID / User ID / Unique ID / Account ID / Role ID). المنتجات التي تتطلب عدة حقول مستقلة لم تُحوّل إلى نموذج أحادي غير صحيح.


- لوحة المنتجات تعرض 100 منتج في البداية وبحد أقصى 300 صف مع تحميل تدريجي والبحث بالاسم أو المعرّف. نموذج المنتج يدعم `ptype` واختيار `req` بما فيه `user_id`.


## إصلاحات تجربة الألعاب والدردشة والذكاء الاصطناعي (2026-10-29)
- `supabase/migrations/20261029083000_game_chat_ai_catalog_fixes.sql`: يجعل باقات الألعاب المورّدة التي كانت تفتقد مدخل العميل تطلب `player_id`، ويجعل باقات Bigo Live وChamet وDazz Live وCapCut وCODM India تستخدم حقول الحساب المطلوبة بدلاً من ترك `input` فارغاً. يُحفظ الإدخال مع عنصر الطلب في `orders.items[].link` ويُمرر للمزوّد عبر قالب الطلب الحالي؛ لا نطلب كلمات المرور.
- تم تطبيق التصحيح مباشرة على `store_config.data.products` في مشروع الإنتاج والتحقق من العدّادات: 960 باقة ألعاب كانت بلا مدخل أصبحت تطلب `player_id`، و62 منتجاً لـ Bigo Live وChamet وDazz Live تستخدم `user_id`، و3 باقات CapCut تستخدم `user_id`، و9 باقات CODM India تستخدم `user_id`. لم تتغير الأسعار أو معرّفات العروض أو أسماء المنتجات.
- `hubs.js` يعرض أقساماً منفصلة لشحن الألعاب، وتطبيقات الدردشة والبث، واشتراكات الذكاء الاصطناعي، والتطبيقات/البطاقات الرقمية. تبقى صفحة الذكاء الاصطناعي ظاهرة مع حالة واضحة «لا توجد باقات موثّقة حالياً» حتى يُربط مزوّد فعلي؛ لا تُنشأ أسعار أو باقات ChatGPT/Claude/Gemini وهمية.
- `app.js` يوضح الفرق بين Player ID وUser ID في السلة، ويطلب المعرّف المناسب للمنتج قبل إرسال الطلب. لا توجد معاينة اسم حساب مباشرة لأن المزوّد الحالي لا يوفر تحققاً موثوقاً من الحساب في مسار المتجر.
- `admin.js` يحمّل 100 منتج أولاً، مع تحميل تدريجي حتى 300 منتج في العرض، وبحث على كامل القائمة لتقليل تجمّد اللوحة. نموذج المنتج يتيح تحديد نوع المنتج والحقول المطلوبة من العميل (`player_id`, `user_id`, `server_id`, `email`, `phone`).
- الاستلهام الوظيفي من خطوات الشحن الرسمية: التحقق من معرّف اللاعب ثم اختيار الباقة والدفع كما في [Midasbuy](https://www.midasbuy.com/midasbuy/helpcenter)، وإدخال BIGO ID الصحيح وعدم مشاركة بيانات الدخول كما توضح [BIGO LIVE](https://mobile.bigo.tv/live/bigolivepay/index.html). قسم الذكاء الاصطناعي يتبع فكرة مقارنة الخطط والمزايا المنشورة رسمياً، دون نسخ الأسعار أو بيع حسابات/مشاركة بيانات الدخول.
