# Amarix Store

واجهة متجر خدمات رقمية عربية RTL مبنية بملفات HTML/CSS/JavaScript ثابتة ومتوافقة مع GitHub Pages، مع Supabase للمصادقة وقاعدة البيانات.

## الملفات
- `index.html` و`app.js`: واجهة المتجر وتحميل الأقسام والمنتجات.
- `admin.html` و`admin.js`: لوحة الإدارة وملخص بيانات المتجر.
- `config.js`: يحتوي على مفتاح Supabase publishable العام فقط.
- `styles.css`: التصميم المتجاوب.

## إعداد Supabase
- المشروع: `pvuobngrybygohendwaz`
- المفتاح في `config.js` هو publishable key عام ومخصص للواجهة.
- لا تضع أبدًا `service_role` أو مفاتيح المزوّدين أو أي أسرار في ملفات الواجهة.
- طبّق ملفات `supabase/migrations` على قواعد البيانات الجديدة بالترتيب.
- أسرار المزوّدين تحفظ في Supabase Edge Function Secrets فقط.

## الحالة الحالية
المخطط الأساسي والجداول وسياسات RLS موجودة في Supabase، والواجهة ولوحة الإدارة على فرع `rebuild`. لوحة الإدارة الحالية تعرض البيانات للقراءة؛ عمليات إنشاء المنتجات وإدارة المزوّدين وتنفيذ الطلبات لم تُفعّل بعد. لا يعتبر هذا الفرع منشورًا للإنتاج حتى إكمال وظائف الطلبات والدفع والمزامنة والاختبارات وإعداد GitHub Pages.


## Current implementation update (2026-10-31)

- Admin workspace now supports category creation/activation, manual product drafts/publishing, inactive provider registration, and top-up review.
- Storefront checkout forms are selected by category kind (SMM link, number phone + WhatsApp, game player ID, apps/AI email).
- Checkout validation is enforced in the database RPC. The RPC uses a per-user idempotency advisory lock to prevent duplicate charges from concurrent retries.
- Top-up requests can be submitted for manual review; approval credits the wallet through a single database transaction.
- Security hardening revokes direct execution of the signup trigger function and adds missing foreign-key indexes.
- GitHub Actions static checks were added for JavaScript syntax and required page elements.

### Not production-ready

- Provider integrations are not implemented. Provider records remain inactive until a real provider API contract and secret are configured.
- No products are imported yet. Do not publish placeholder prices or pretend catalog data is live.
- Payment methods are only manual review placeholders; no payment verification or proof upload flow is configured.
- Existing legacy Edge Functions and Storage objects were not deleted during the public-schema rebuild; audit/cleanup is still required.
- Browser end-to-end tests, real provider sandbox tests, payment tests, and Pages deployment verification are outstanding.
- The rebuild is in a draft pull request and must not be merged/deployed until the blockers above are closed.
