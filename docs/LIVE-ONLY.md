# توثيق الكائنات الحية والمحفظة الموحدة (Live Objects & Unified Wallet)

توثيق الكائنات الموجودة في القاعدة الحية لمشروع Supabase (`pvuobngrybygohendwaz`) وتوحيد المحفظة.

---

## 1. توحيد المحفظة على القسم الرئيسي (`main`)

- تم توحيد قسم المحفظة في الجداول والدوال ليكون `'main'` بشكل افتراضي وثابت:
  - جدول `public.wallets`: القيمة الافتراضية للعمود `section` هي `'main'`.
  - جدول `public.wallet_topups`: القيمة الافتراضية للعمود `section` هي `'main'`.
  - دالة `public.wallet_sections(cfg jsonb)`: ترجع `array['main']` كقسم افتراضي.
  - دالة `public.wallet_item_section(p jsonb, cfg jsonb)`: ترجع `'main'` لكل المنتجات الصالحة.
  - دالة `public.wallet_eligible(p_items jsonb)`: هي المصدر المعتمد الوحيد لفحص أهلية الدفع من المحفظة على الخادم دون أي شروط تضييقية موازية في JavaScript.
  - دالة `public.wallet_topup_create(p_amount, p_method, p_currency, p_section)`: المعامل `p_section` أصبح افتراضيه `'main'::text`.
  - ملف الترحيل: `supabase/migrations/20261101000000_wallet_unify_main.sql`
  - ملف التراجع: `supabase/rollbacks/20261101000000_wallet_unify_main.sql`

---

## 2. دوال المحفظة المتاحة للمستخدم المسجل (`authenticated`)

| الدالة | المعاملات | الوصف |
| --- | --- | --- |
| `wallet_eligible` | `p_items jsonb` | فحص أهلية عناصر السلة للشراء من رصيد المحفظة |
| `wallet_topup_create` | `p_amount numeric, p_method text, p_currency text, p_section text` | إنشاء طلب شحن محفظة جديد |
| `wallet_topup_set_proof` | `p_id bigint, p_path text, p_hash text` | إرفاق مسار وتجزئة صورة إثبات التحويل لطلب الشحن |
| `wallet_topup_claim` | `p_id bigint, p_tx_ref text` | تأكيد إرسال التحويل والمطالبة باعتماد الشحن |
| `pay_order_with_wallet` | `p_order_id text` | دفع طلب معلق مباشرة بخصم إجمالي المبلغ من رصيد المحفظة الرئيسي |

---

## 3. دوال شحن ودفع v2 (متوقفة خلف علم `payments_v2.on = false`)

- `payment_create_topup(p_amount, p_method, p_key)`
- `payment_create_wallet_pay(p_order_id, p_key)`
- `payment_submit(p_id, p_tx_ref)`
- `payment_instructions(p_id)`
- `payments_status(p_id)`
- `payments_status_for_order(p_order_id)`

> ملاحظة هامة: يبقى `payments_v2.on = false` ولا يتم تفعيله حتى استكمال توقيع اختبارات E2E. تعمل واجهة المتجر تلقائياً بالمسار القياسي v1 عبر `wallet_topup_create` و `pay_order_with_wallet`.

---

## 4. جداول المحفظة وسياسات RLS

- `public.wallets`: جدول أرصدة المستخدمين (`user_id`, `section`, `balance`, `updated_at`). قراءة السجل الخاص بالمستخدم فقط أو المدير.
- `public.wallet_transactions`: دفتر الحركات المالية المقيد (`user_id`, `section`, `kind`, `amount`, `balance_after`, `ref`, `note`).
- `public.wallet_topups`: طلبات الشحن اليدوية للمحفظة مع تتبع حالة المراجعة والصور.
