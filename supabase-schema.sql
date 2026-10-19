-- =====================================================================
-- AMARIX007 — MIGRATION فوق مخططك الحالي (آمن للتشغيل أكثر من مرة)
-- لا يلمس دالة is_admin() ولا جدول admins ولا باقي الجداول.
-- شغّله في: Supabase > SQL Editor   (كرّر التشغيل عند كل تحديث جديد)
-- =====================================================================

-- 1) أعمدة جديدة في orders
alter table public.orders add column if not exists user_id        uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists currency       text default 'SAR';
alter table public.orders add column if not exists coupon         text;
alter table public.orders add column if not exists payment_status text default 'pending';   -- pending | review | paid
alter table public.orders add column if not exists payment_method text;                     -- id من وسائل الدفع
alter table public.orders add column if not exists smm            jsonb;                    -- نتائج الإرسال لموقع الرشق
alter table public.orders add column if not exists smm_status     text;
create index if not exists orders_user_id_idx on public.orders(user_id, created_at desc);

-- 2) سياسات orders
--    الإدراج: للمسجّلين فقط، بحالة new ودفع pending، ولا يمكن تزوير user_id.
--    القراءة: المدير يرى الكل، والعميل يرى طلباته فقط.
--    (سياسة orders update الحالية للمدير تبقى كما هي)
drop policy if exists "orders insert" on public.orders;
drop policy if exists "orders read"   on public.orders;

create policy "orders insert" on public.orders for insert to authenticated
  with check (status = 'new' and coalesce(payment_status, 'pending') = 'pending'
              and jsonb_array_length(items) <= 50 and user_id = auth.uid());

create policy "orders read" on public.orders for select to authenticated
  using (public.is_admin() or user_id = auth.uid());

-- 3) زر "تم الدفع" للعميل: ينقل طلبه فقط من pending إلى review (المدير يؤكد paid)
create or replace function public.claim_payment(p_order_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.orders
     set payment_status = 'review'
   where id = p_order_id and user_id = auth.uid()
     and coalesce(payment_status, 'pending') = 'pending' and status <> 'cancelled';
  if not found then
    -- already reported/confirmed by the same customer: treat a second tap as success
    if exists (select 1 from public.orders where id = p_order_id and user_id = auth.uid() and payment_status in ('review', 'paid')) then return; end if;
    raise exception 'not_allowed';
  end if;
end $$;
revoke all on function public.claim_payment(text) from public, anon;
grant execute on function public.claim_payment(text) to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================
-- تحقق بعد التشغيل (انسخ كل استعلام وشغّله منفرداً — للقراءة فقط):
--   1) يجب ألا توجد سياسة INSERT قديمة تسمح لـ anon أو بلا شرط user_id على orders:
--        select policyname, cmd, roles, with_check from pg_policies where tablename = 'orders';
--   2) نوع عمود id يجب أن يكون text (الدالة claim_payment تقارنه بنص):
--        select data_type from information_schema.columns where table_name = 'orders' and column_name = 'id';
--   3) المجلد/الـ bucket الخاص برفع الصور (store-media) موجود وعام:
--        select id, public from storage.buckets where id = 'store-media';
-- =====================================================================
