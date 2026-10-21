-- =====================================================================
-- AMARIX007 — إصلاحات الأمان (شغّله مرة واحدة في Supabase > SQL Editor)
-- آمن لإعادة التشغيل. لا يحذف بيانات.
-- ترتيب التشغيل المهم: شغّل هذا الملف كاملاً ثم انشر app.js/admin.js الجديدين.
-- =====================================================================

-- 1) صلاحية الأدمن: ربط بـ auth.uid() + بريد مؤكَّد (بدل الاعتماد على claim البريد وحده)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1
      from public.admins a
      join auth.users u on lower(u.email) = lower(a.email)
     where u.id = auth.uid()
       and u.email_confirmed_at is not null);
$$;
grant execute on function public.is_admin() to authenticated;

-- 2) تريغر التسعير يصبح security definer (لأن العملاء لن يقرؤوا store_config مباشرة بعد الآن)
alter function public.orders_enforce_pricing() security definer;
alter function public.orders_enforce_pricing() set search_path = public;

-- 3) store_config: القراءة المباشرة للأدمن فقط. المتجر يقرأ عبر public_config() بدون الكوبونات السرية
drop policy if exists "config read" on public.store_config;
create policy "config read" on public.store_config for select to authenticated using (public.is_admin());

create or replace function public.public_config() returns jsonb
language sql stable security definer set search_path = public as $$
  select (coalesce(data, '{}'::jsonb) - 'coupons')
         || jsonb_build_object('coupons', coalesce((
              select jsonb_object_agg(e.key, e.value)
                from jsonb_each(case when jsonb_typeof(data->'coupons') = 'object' then data->'coupons' else '{}'::jsonb end) e
               where jsonb_typeof(e.value) = 'array' and coalesce(e.value->>2, '0') = '1'
            ), '{}'::jsonb))
    from public.store_config where id = 1;
$$;

create or replace function public.check_coupon(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when jsonb_typeof(data->'coupons'->upper(trim(p_code))) = 'array'
              then (data->'coupons'->upper(trim(p_code))) - 2   -- [نسبة، مبلغ ثابت] بدون علامة "عام"
              else null end
    from public.store_config where id = 1;
$$;

revoke all on function public.public_config() from public;
revoke all on function public.check_coupon(text) from public;
grant execute on function public.public_config() to anon, authenticated;
grant execute on function public.check_coupon(text) to anon, authenticated;

-- 4) إثباتات الدفع: حدّ أقصى 30 ملفاً لكل مستخدم (منع استنزاف المساحة)
drop policy if exists "proofs insert own" on storage.objects;
create policy "proofs insert own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select count(*) from storage.objects o
          where o.bucket_id = 'payment-proofs'
            and (storage.foldername(o.name))[1] = (select auth.uid())::text) < 30);

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- بعد التشغيل:
--  • الكوبونات الحالية تصبح سرية. لإظهار كوبون كعرض في المتجر: لوحة الأدمن > الكوبونات > «يظهر للجميع» = 1 ثم انشر.
--  • تحقق: افتح المتجر في نافذة خاصة ← جرّب كوبوناً صحيحاً (يجب أن يعمل) وآخر خاطئاً (يُرفض).
--  • تحقق: تسجيل دخول الأدمن ما زال يعمل (يتطلب بريداً مؤكَّداً في auth.users).
-- ---------------------------------------------------------------------
