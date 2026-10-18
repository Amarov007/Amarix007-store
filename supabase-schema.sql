-- =====================================================================
-- AMARIX007 — MIGRATION فوق مخططك الحالي (آمن للتشغيل أكثر من مرة)
-- لا يلمس دالة is_admin() ولا جدول admins ولا باقي الجداول.
-- يضيف فقط ما يحتاجه الشراء الجديد وصفحة "طلباتي".
-- شغّله في: Supabase > SQL Editor
-- =====================================================================

-- 1) أعمدة جديدة في orders
alter table public.orders add column if not exists user_id  uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists currency text default 'SAR';
alter table public.orders add column if not exists coupon   text;
create index if not exists orders_user_id_idx on public.orders(user_id, created_at desc);

-- 2) سياسات orders
--    الإدراج: للمسجّلين فقط، ولا يمكن تزوير user_id لمستخدم آخر.
--    القراءة: المدير يرى الكل، والعميل يرى طلباته فقط.
--    (سياسة orders update الحالية للمدير تبقى كما هي)
drop policy if exists "orders insert" on public.orders;
drop policy if exists "orders read"   on public.orders;

create policy "orders insert" on public.orders for insert to authenticated
  with check (status = 'new' and jsonb_array_length(items) <= 50 and user_id = auth.uid());

create policy "orders read" on public.orders for select to authenticated
  using (public.is_admin() or user_id = auth.uid());

-- ملاحظة: الطلبات القديمة (بدون user_id) يراها المدير فقط ولا تظهر في "طلباتي".
-- باقي الجداول عندك (store_config, profiles, api_settings, affiliates, storage)
-- سياساتها سليمة ولا تحتاج تغييراً.
