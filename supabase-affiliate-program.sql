-- =====================================================================
-- برنامج الشركاء (Affiliate) بدل الإحالة المفتوحة
-- شغّل هذا الملف مرة واحدة في Supabase → SQL Editor (بعد supabase-schema.sql
-- و supabase-security-fixes.sql). آمن لإعادة التشغيل.
--
-- ما الذي يتغيّر:
--   • لم يعد كل مستخدم يملك رابط إحالة تلقائياً؛ يقدّم طلب انضمام ثم يوافق المشرف.
--   • الاحتساب (نقرات / تسجيلات / عمولات) يعمل فقط لحسابات الشركاء المعتمدين.
--   • نسبة عمولة خاصة لكل شريك (rate)؛ وإن تُركت فارغة تُستخدم affiliate_rate
--     من store_config، وإن لم توجد فـ 5%.
--   • الشركاء الحاليون (لديهم مبيعات أو عمولة أو كوبون) يُعتمدون تلقائياً مرة واحدة.
-- =====================================================================

-- ---------- أعمدة جديدة ----------
alter table public.affiliates add column if not exists coupon      text;
alter table public.affiliates add column if not exists rate        numeric;
alter table public.affiliates add column if not exists payout_id   text;
alter table public.affiliates add column if not exists applied_at  timestamptz;
alter table public.affiliates add column if not exists approved_at timestamptz;

do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'affiliates' and column_name = 'status') then
    alter table public.affiliates add column status text not null default 'none';
    -- تثبيت الشركاء الحاليين كمعتمدين (يعمل مرة واحدة فقط عند إضافة العمود)
    update public.affiliates
       set status = 'approved', approved_at = coalesce(approved_at, now())
     where coalesce(sales, 0) > 0 or coalesce(total_commission, 0) > 0 or coupon is not null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'affiliates_status_chk') then
    alter table public.affiliates
      add constraint affiliates_status_chk check (status in ('none', 'pending', 'approved', 'rejected'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'affiliates_rate_chk') then
    alter table public.affiliates
      add constraint affiliates_rate_chk check (rate is null or (rate >= 0 and rate <= 100));
  end if;
end $$;

-- ---------- طلب الانضمام (المستخدم لا يستطيع تعديل جدول affiliates مباشرة) ----------
-- [moved] public.apply_affiliate() is defined only in supabase-affiliate-tiers.sql (one definition per function; see tests/verify-project.py check 5).

-- [moved] apply_affiliate grants -> supabase-affiliate-tiers.sql / supabase-final-grants.sql

-- ---------- النقرات: تُحتسب للشركاء المعتمدين فقط ----------
create or replace function public.track_ref_click(p_code text) returns void
language plpgsql security definer set search_path = public as $function$
declare ip text := public.client_ip();
begin
  if p_code !~ '^[A-Za-z0-9]{6,12}$' then return; end if;
  if ip = 'unknown' then return; end if;
  if not public.rl_hit('refclk:' || ip || ':' || upper(p_code), 1, 86400) then return; end if;
  if not public.rl_hit('refclk-ip:' || ip, 20, 3600) then return; end if;
  update public.affiliates a set clicks = coalesce(a.clicks, 0) + 1
   where a.status = 'approved'
     and a.user_id = (select id from public.profiles where ref_code = upper(p_code));
end $function$;

-- ---------- حساب جديد: لا يُنسب لأي كود إلا إن كان كود شريك معتمد ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $function$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  rc text := upper(trim(coalesce(meta->>'ref', '')));
  refd text;
begin
  if rc <> '' and exists (
       select 1 from public.profiles p
         join public.affiliates a on a.user_id = p.id and a.status = 'approved'
        where p.ref_code = rc) then
    refd := rc;
  end if;
  insert into public.profiles (id, email, full_name, ref_code, referred_by)
  values (new.id, new.email, coalesce(meta->>'full_name', meta->>'name'), public.gen_ref_code(), refd)
  on conflict (id) do nothing;
  insert into public.affiliates (user_id) values (new.id) on conflict (user_id) do nothing;
  if refd is not null then
    update public.affiliates set signups = coalesce(signups, 0) + 1
     where user_id = (select id from public.profiles where ref_code = refd);
  end if;
  return new;
end $function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------- ربط كود بحساب موجود (تسجيل Google): للشركاء المعتمدين فقط ----------
create or replace function public.profiles_protect_referral() returns trigger
language plpgsql security definer set search_path = public as $function$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  new.ref_code := old.ref_code;
  if old.referred_by is not null then
    new.referred_by := old.referred_by;
  elsif new.referred_by is not null then
    new.referred_by := upper(trim(new.referred_by));
    if new.referred_by = old.ref_code
       or coalesce(old.created_at, now()) < now() - interval '2 days'
       or exists (select 1 from public.orders where user_id = old.id)
       or not exists (
            select 1 from public.profiles p
              join public.affiliates a on a.user_id = p.id and a.status = 'approved'
             where p.ref_code = new.referred_by) then
      new.referred_by := null;
    else
      update public.affiliates set signups = coalesce(signups, 0) + 1
       where user_id = (select id from public.profiles where ref_code = new.referred_by);
    end if;
  end if;
  return new;
end $function$;

drop trigger if exists profiles_protect_referral_trg on public.profiles;
create trigger profiles_protect_referral_trg before update of ref_code, referred_by on public.profiles for each row execute function public.profiles_protect_referral();

-- ---------- العمولة: شريك معتمد فقط + نسبته الخاصة ----------
-- [moved] public.orders_affiliate() is defined only in supabase-affiliate-tiers.sql (one definition per function; see tests/verify-project.py check 5).
