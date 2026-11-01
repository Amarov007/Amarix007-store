-- =====================================================================
-- AMARIX007 — ترقية الأمان للقواعد القديمة (محدَّث 2026-10-22 ليطابق القاعدة الحية)
-- آمن لإعادة التشغيل. لا يحذف بيانات. للقاعدة الجديدة استخدم supabase-schema.sql فقط.
-- شغّل هذا الملف كاملاً في Supabase > SQL Editor ثم انشر app.js/admin.js.
-- يتطلب وجود الدوال والجداول من supabase-schema.sql (rl_hit, coupon_usable, rate_limits ...)،
-- فإن كانت قاعدتك قديمة جداً شغّل supabase-schema.sql بدلاً منه.
-- =====================================================================
-- ملاحظة (توحيد التعريفات): دوال check_coupon / claim_payment / is_admin / keepalive_ping / public_config / track_ref_click / orders_enforce_pricing
-- لم تعد معرَّفة هنا؛ تعريفها الوحيد في supabase-schema.sql (وsupabase-affiliate-program.sql وsupabase-boost-units.sql). وصلاحيات التنفيذ في supabase-final-grants.sql (شغّله أخيراً).

-- 1) صلاحية الأدمن: ربط بـ auth.uid() + بريد مؤكَّد
alter table public.admins add column if not exists user_id uuid references auth.users(id) on delete cascade;
update public.admins a set user_id = u.id from auth.users u
 where a.user_id is null and lower(u.email)=lower(a.email) and u.email_confirmed_at is not null;
do $$ begin
  if not exists (select 1 from public.admins where user_id is not null) then
    raise exception 'no admin linked to a confirmed account';
  end if;
end $$;

-- [moved] public.is_admin() is defined only in supabase-schema.sql (one definition per function; see tests/verify-project.py check 5).

-- 2) store_config: القراءة المباشرة للأدمن فقط (كانت للعامة وتكشف الكوبونات السرية)
drop policy if exists "config read" on public.store_config;
create policy "config read" on public.store_config for select to authenticated using (public.is_admin());

-- 3) المتجر يقرأ الإعدادات عبر public_config() بدون الكوبونات السرية
-- [moved] public.public_config() is defined only in supabase-schema.sql (one definition per function; see tests/verify-project.py check 5).

-- 4) التسعير على الخادم يعمل بصلاحية security definer
alter function public.orders_enforce_pricing() security definer;
alter function public.orders_enforce_pricing() set search_path = public;

-- 5) «تم الدفع» يشترط وجود إثبات دفع مرفوع
-- [moved] public.claim_payment() is defined only in supabase-schema.sql (one definition per function; see tests/verify-project.py check 5).


-- 9) تحديد معدّل لا يُتجاوز عند غياب IP + تنظيف created_at/pay_currency + keepalive
-- [moved] public.check_coupon() is defined only in supabase-schema.sql (one definition per function; see tests/verify-project.py check 5).

-- [moved] public.track_ref_click() is defined only in supabase-affiliate-program.sql (one definition per function; see tests/verify-project.py check 5).

-- [moved] public.orders_enforce_pricing() is defined only in supabase-boost-units.sql (one definition per function; see tests/verify-project.py check 5).

-- [moved] public.keepalive_ping() is defined only in supabase-schema.sql (one definition per function; see tests/verify-project.py check 5).

-- 6) صلاحيات تنفيذ الدوال: العامة فقط ما يلزم
-- [moved] function execute grants -> supabase-final-grants.sql, which must be run LAST.

-- 7) إصلاح keepalive: يجب أن يستدعي public_config (لا store_config) وإلا يعطي 401.
--    الدالة الكاملة (مع YOUR_PROJECT_REF / YOUR_ANON_KEY) موجودة في supabase-schema.sql — شغّل مقطعها هناك.

-- 8) يدوياً من لوحة Supabase: Authentication > Providers > Email > فعّل «Leaked password protection».
