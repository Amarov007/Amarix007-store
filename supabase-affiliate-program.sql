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
create or replace function public.apply_affiliate(p_payout text) returns text
language plpgsql security definer set search_path = public as $function$
declare
  uid uuid := auth.uid();
  pay text := left(trim(coalesce(p_payout, '')), 120);
  st  text;
begin
  if uid is null then raise exception 'not_allowed'; end if;
  if length(pay) < 3 then raise exception 'payout_required'; end if;
  if not public.rl_hit('affapply:' || uid::text, 5, 3600) then raise exception 'rate_limited'; end if;

  insert into public.affiliates (user_id)
    select id from public.profiles where id = uid
  on conflict (user_id) do nothing;

  select status into st from public.affiliates where user_id = uid;
  if st is null then raise exception 'no_profile'; end if;
  if st in ('pending', 'approved') then return st; end if;

  update public.affiliates
     set status = 'pending', payout_id = pay, applied_at = now()
   where user_id = uid;
  return 'pending';
end $function$;

revoke all on function public.apply_affiliate(text) from public, anon;
grant execute on function public.apply_affiliate(text) to authenticated;

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

-- ---------- العمولة: شريك معتمد فقط + نسبته الخاصة ----------
create or replace function public.orders_affiliate() returns trigger
language plpgsql security definer set search_path = public as $function$
declare ref_code_ text; ref_id uuid; arate numeric; rate numeric; amt numeric;
begin
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' and new.user_id is not null then
    select p2.id, p2.ref_code, a.rate into ref_id, ref_code_, arate
      from public.profiles p
      join public.profiles p2 on p2.ref_code = p.referred_by
      join public.affiliates a on a.user_id = p2.id and a.status = 'approved'
     where p.id = new.user_id and p2.id <> new.user_id;
    if ref_id is not null then
      select coalesce(arate, (data->>'affiliate_rate')::numeric, 5) into rate
        from public.store_config where id = 1;
      rate := coalesce(rate, arate, 5);
      amt := round(coalesce(new.total, 0) * rate / 100, 2);
      new.affiliate_ref := ref_code_; new.affiliate_commission := amt;
      update public.affiliates
         set sales = coalesce(sales, 0) + 1, total_commission = coalesce(total_commission, 0) + amt
       where user_id = ref_id;
    end if;
  elsif old.payment_status = 'paid' and new.payment_status is distinct from 'paid' and coalesce(old.affiliate_commission, 0) > 0 then
    update public.affiliates
       set sales = greatest(coalesce(sales, 0) - 1, 0),
           total_commission = greatest(coalesce(total_commission, 0) - old.affiliate_commission, 0)
     where user_id = (select id from public.profiles where ref_code = old.affiliate_ref);
    new.affiliate_commission := 0;
  end if;
  return new;
end $function$;
