-- =====================================================================
-- AMARIX007 — ترقية الأمان للقواعد القديمة (محدَّث 2026-10-22 ليطابق القاعدة الحية)
-- آمن لإعادة التشغيل. لا يحذف بيانات. للقاعدة الجديدة استخدم supabase-schema.sql فقط.
-- شغّل هذا الملف كاملاً في Supabase > SQL Editor ثم انشر app.js/admin.js.
-- يتطلب وجود الدوال والجداول من supabase-schema.sql (rl_hit, coupon_usable, rate_limits ...)،
-- فإن كانت قاعدتك قديمة جداً شغّل supabase-schema.sql بدلاً منه.
-- =====================================================================

-- 1) صلاحية الأدمن: ربط بـ auth.uid() + بريد مؤكَّد
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.admins a
      join auth.users u on lower(u.email) = lower(a.email)
     where u.id = auth.uid() and u.email_confirmed_at is not null);
$$;

-- 2) store_config: القراءة المباشرة للأدمن فقط (كانت للعامة وتكشف الكوبونات السرية)
drop policy if exists "config read" on public.store_config;
create policy "config read" on public.store_config for select to authenticated using (public.is_admin());

-- 3) المتجر يقرأ الإعدادات عبر public_config() بدون الكوبونات السرية
create or replace function public.public_config() returns jsonb
language sql stable security definer set search_path = public as $function$
  select (coalesce(data, '{}'::jsonb) - 'coupons')
         || jsonb_build_object('coupons', coalesce((
              select jsonb_object_agg(e.key, jsonb_build_array(e.value->0, e.value->1, 1))
                from jsonb_each(case when jsonb_typeof(data->'coupons') = 'object' then data->'coupons' else '{}'::jsonb end) e
               where jsonb_typeof(e.value) = 'array' and coalesce(e.value->>2, '0') = '1'
                 and public.coupon_usable(e.value, e.key)
            ), '{}'::jsonb))
    from public.store_config where id = 1;
$function$;

-- 4) التسعير على الخادم يعمل بصلاحية security definer
alter function public.orders_enforce_pricing() security definer;
alter function public.orders_enforce_pricing() set search_path = public;

-- 5) «تم الدفع» يشترط وجود إثبات دفع مرفوع
create or replace function public.claim_payment(p_order_id text) returns void
language plpgsql security definer set search_path = public as $function$
begin
  update public.orders set payment_status = 'review'
   where id = p_order_id and user_id = auth.uid()
     and coalesce(payment_status, 'pending') = 'pending' and status <> 'cancelled'
     and payment_proof is not null and payment_proof <> '';
  if not found then
    if exists (select 1 from public.orders where id = p_order_id and user_id = auth.uid() and payment_status in ('review', 'paid')) then return; end if;
    if exists (select 1 from public.orders where id = p_order_id and user_id = auth.uid()
                and coalesce(payment_status, 'pending') = 'pending' and status <> 'cancelled') then
      raise exception 'proof_required';
    end if;
    raise exception 'not_allowed';
  end if;
end $function$;

-- 6) صلاحيات تنفيذ الدوال: العامة فقط ما يلزم
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function public.public_config()            to anon, authenticated;
grant execute on function public.check_coupon(text)         to anon, authenticated;
grant execute on function public.track_ref_click(text)      to anon, authenticated;
grant execute on function public.is_admin()                 to authenticated;
grant execute on function public.my_proof_count()           to authenticated;
grant execute on function public.set_payment_proof(text, text) to authenticated;
grant execute on function public.claim_payment(text)        to authenticated;

-- 7) إصلاح keepalive: يجب أن يستدعي public_config (لا store_config) وإلا يعطي 401.
--    الدالة الكاملة (مع YOUR_PROJECT_REF / YOUR_ANON_KEY) موجودة في supabase-schema.sql — شغّل مقطعها هناك.

-- 8) يدوياً من لوحة Supabase: Authentication > Providers > Email > فعّل «Leaked password protection».
