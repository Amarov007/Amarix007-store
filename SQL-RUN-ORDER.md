# ترتيب تشغيل ملفات SQL (Supabase › SQL Editor)

> مبني على قراءة الملفات الموجودة في المستودع، وقورنت صلاحيات التنفيذ مع القاعدة الحية بتاريخ 2026-10-25. **كل دالة معرَّفة الآن في ملف واحد فقط** (يفرضه `tests/verify-project.py` فحص 5)، وكل `revoke/grant execute` على الدوال مجمّع في `supabase-final-grants.sql` (فحص 6) ويُشغَّل **أخيراً دائماً**.

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
supabase functions download ai-support smm-order media-seed img-shrink send-push telegram-auth
supabase functions deploy send-push                # بعد تعديل supabase/functions/send-push
```

## pg_cron (اختياري، لكن موصى به)

`supabase-schema.sql` ينشئ وظيفتين: `amarix-keepalive` (كل 3 أيام) و`amarix-ratelimit-cleanup` (يومياً 03:17). للتحقق:

```sql
select jobname, schedule, active from cron.job order by jobname;
```

إن كان الناتج فارغاً (امتداد pg_cron غير مفعّل): فعّله من Database › Extensions ثم أعد تشغيل مقطع «pg_cron» الأخير من `supabase-schema.sql` (الأسطر التي تحوي `cron.schedule`). احذر: المقطع يحذف الوظيفتين القديمتين بالاسم نفسه ثم ينشئهما، فلا يتكرر.
