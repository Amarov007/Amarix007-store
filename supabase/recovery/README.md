# خطة استعادة ومزامنة سجل Supabase — AMARIX Store

**تاريخ الجرد:** 2026-10-31 UTC  
**مشروع الإنتاج:** `pvuobngrybygohendwaz`  
**الحالة:** جرد ومطابقة أولية مكتملة؛ الاستعادة التنفيذية متوقفة عمداً إلى حين استعادة SQL والتحقق المحلي.

## ما الذي تحققنا منه؟

الجرد الحي عبر Supabase MCP كان للقراءة فقط. سجل `supabase_migrations.schema_migrations` يحتوي **140 إصداراً**، بينما يحتوي `supabase/migrations/` في GitHub على **23 ملفاً**. تطابق بادئة الإصدار حرفياً في **8 ملفات فقط**.

هذا لا يعني أن الملفات الـ15 الأخرى لم تُطبّق، ولا يعني أن 132 إصداراً كلها تغييرات مفقودة: بعض ملفات المستودع تجميعية أو تستخدم أرقاماً مختلفة، كما أن ثلاث عمليات `repo_apply_*` نفذت SQL من ملفات المستودع بعد إعادة بناء المخطط. لذلك لا يجوز تصنيف أي إصدار على أنه pending اعتماداً على الاسم فقط.

السبعة الأخيرة في سجل الإنتاج هي:

| الإصدار | الاسم المسجل |
|---|---|
| `20261031183835` | `backup_core_v1_and_clear_public_for_repo_schema` |
| `20261031183840` | `repo_apply_01_supabase_schema` |
| `20261031183847` | `repo_apply_02_repo_sql_batch` |
| `20261031185809` | `admins_user_id_fk_index` |
| `20261031190036` | `restore_authenticated_table_grants_matching_rls` |
| `20261031190412` | `restore_service_role_privileges_public` |
| `20261031193201` | `restore_execute_for_publish_and_admin_rpcs` |

توجد أيضاً ثلاثة ملفات SQL قديمة خارج مجلد migrations (`supabase-schema.sql` و`supabase-live-sync.sql` وملفات SQL مساعدة). لا تعتبر هذه الملفات baseline حالياً: تواريخها أقدم من حالة الإنتاج، وبعضها يصف مخططاً مختلفاً.

**لقطة الحالة البنيوية الحية وقت الفحص:** 42 جدولاً في `public`، و5 جداول في `private`، و130 routine، و28 trigger غير داخلي، و54 RLS policy. هذه أعداد جرد فقط وليست نسخة احتياطية.

## قواعد الأمان — إلزامية

1. لا تستخدم `db reset` أو `db reset --linked` أو `db push` على مشروع الإنتاج خلال الاستعادة.
2. لا تستخدم `migration repair` في الإنتاج الآن، ولا تحذف/تعِد تسمية/ت squash أي سجل موجود.
3. لا تنشئ ملفات migrations فارغة أو placeholders لمجرد جعل الأرقام تتطابق.
4. لا تنقل كل الملفات القديمة إلى مجلد migrations قبل مطابقة محتواها وترتيبها واعتمادياتها.
5. لا تشغّل ملفات `supabase-schema.sql` أو `supabase-live-sync.sql` على الإنتاج؛ هي ليست baseline حديثة معتمدة.
6. لا تُصدّر بيانات العملاء أو الطلبات أو المحافظ أو الفواتير أو المدفوعات إلى Git. المطلوب schema-only.
7. احتفظ بمفاتيح الاتصال والـ access token وكلمات مرور قاعدة البيانات خارج المستودع.

## خطة الاستعادة المقترحة

### المرحلة A — جمع أدلة schema-only (لا يغيّر الإنتاج)

على جهاز صيانة موثوق، وبعد مراجعة المساعدة الخاصة بإصدار Supabase CLI المثبت:

```bash
supabase --version
supabase db dump --help
```

الأكثر وضوحاً هو تمرير رابط اتصال قاعدة البيانات صراحةً عبر متغير بيئة محلي اسمه `DB_URL` (لا تضعه في Git أو المحادثة أو سجل الأوامر). استخدم Session Pooler عادةً، أو الاتصال المباشر إذا كانت الشبكة تدعم IPv6/لديك IPv4 مفعّل. بعد ضبط المتغير في بيئة الجهاز الآمنة:

```bash
mkdir -p supabase/recovery
supabase db dump --db-url "$DB_URL" -f supabase/recovery/production-schema.sql
```

هذا الأمر الافتراضي يصدّر المخطط فقط ولا يصدّر صفوف البيانات. لا تضف `--data-only`. إذا احتجت جرد الأدوار المخصصة، صدّرها إلى ملف محلي خارج Git ولا ترفعه للمستودع:

```bash
supabase db dump --db-url "$DB_URL" -f ./production-roles.sql --role-only
```

بعد التصدير، افحص الملف بحثاً عن أي قيم سرية أو بيانات اعتماد قبل مشاركته. لا ترفع dump الإنتاج إلى GitHub تلقائياً. لا تستخدم `db push` أو `db reset` أو `migration repair` على الإنتاج.

الـ dump الافتراضي schema-only لا يتضمن صفوف البيانات أو custom roles، كما يستثني مخططات Supabase المُدارة مثل Auth وStorage وبعض مخططات الإضافات. راجع صلاحيات الأدوار والـ extensions والـ triggers التي تعتمد على Auth/Storage بشكل منفصل قبل اعتبار اللقطة مكتملة.

صدّر كذلك ناتج `supabase migration list` إلى ملف محلي خاص بالمراجعة، وقارنه بالـ manifest الموجود هنا. لا تضع أي connection string أو secrets في الملف.
### المرحلة B — تحقق محلي معزول

1. استخدم Docker وSupabase local stack فقط، أو قاعدة تطوير منفصلة غير إنتاجية.
2. استعد `production-schema.sql` محلياً، ولا تضعه في `supabase/migrations/` بعد.
3. اختبر إنشاء المخطط من الصفر، بما يشمل RLS وgrants وdefault privileges وfunctions وtriggers وextensions.
4. قارن نتائج `pg_dump --schema-only` بعد الاستعادة مع لقطة الإنتاج، وافحص أي فروقات يدوية.
5. شغّل اختبارات العقود واختبارات الشراء/الدفع/الـ fulfillment على بيئة اختبار فقط.

### المرحلة C — بناء سجل قابل لإعادة الإنتاج

- استعد أجسام SQL الأصلية للترحيلات المفقودة من Git history أو أرشيف نشر موثوق، ثم اربط كل إصدار مسجل بملفه الحقيقي.
- بالنسبة لأي SQL لا يمكن استعادته، لا تخمّن محتواه. احتفظ بمرجع واضح إلى لقطة schema baseline التي تم التحقق منها محلياً.
- افصل بين baseline المستخدم لتجهيز بيئة جديدة وبين تاريخ الإنتاج القديم. لا تعتبر baseline ترحيلاً جديداً على الإنتاج تلقائياً.
- أنشئ خطة انتقال منفصلة تحدد كيف ستستمر الترحيلات المستقبلية بعد baseline، مع dry-run ومراجعة SQL وفحص عدم وجود DROP/TRUNCATE أو تعديل بيانات غير مقصود.

### المرحلة D — بوابة اعتماد الإنتاج (لم تُنفذ)

أي تعديل لاحق على سجل migrations في الإنتاج يحتاج:
- نسخة احتياطية قابلة للاستعادة واختبار restore موثق.
- موافقة صريحة على تغيير سجل migrations نفسه.
- مراجعة diff نهائي، مع تأكيد عدم وجود تغييرات schema أو data غير مقصودة.
- نافذة صيانة وخطة rollback.
- بعد التنفيذ: إعادة جرد migration list وschema وRLS/grants وبيانات الأعمال للتحقق.

## الحالة في هذه المهمة

- تم تنفيذ قراءات فقط من GitHub وSupabase.
- لم يتم إنشاء/تعديل/حذف أي جدول أو دالة أو trigger أو policy.
- لم يتم تشغيل migration أو repair أو push.
- لم تتغير صفوف الإنتاج أو سجل migrations.
- تمت إضافة هذا المستند وmanifest إلى فرع توثيق مستقل فقط.

## مراجع Supabase الرسمية

- [Local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows)
- [CLI db dump](https://supabase.com/docs/reference/cli/supabase-db-dump)
- [CLI migration list](https://supabase.com/docs/reference/cli/supabase-migration-list)
- [Database migrations deployment](https://supabase.com/docs/guides/deployment/database-migrations)
