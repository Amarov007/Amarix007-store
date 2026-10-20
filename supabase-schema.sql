-- =====================================================================
-- AMARIX007 — مخطط قاعدة البيانات الكامل (متزامن مع مشروع Supabase الحالي)
-- آمن للتشغيل أكثر من مرة. شغّله في: Supabase > SQL Editor
-- بعد التشغيل أضف بريد المدير:  insert into public.admins(email) values ('you@example.com');
-- =====================================================================

-- ---------- الجداول ----------
create table if not exists public.admins (email text primary key);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, email text,
  ref_code text unique, referred_by text,
  created_at timestamptz default now()
);

create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles(id) on delete cascade,
  clicks integer default 0, signups integer default 0, sales integer default 0,
  total_commission numeric default 0
);

create table if not exists public.orders (
  id text primary key,
  created_at timestamptz not null default now(),
  customer_name text, customer_email text,
  items jsonb not null default '[]'::jsonb,
  total numeric, lang text,
  status text not null default 'new' check (status in ('new','processing','done','cancelled')),
  payment_status text default 'pending' check (payment_status is null or payment_status in ('pending','review','paid')),
  affiliate_ref text, affiliate_commission numeric default 0,
  user_id uuid references auth.users(id) on delete set null,
  currency text default 'SAR', coupon text, payment_method text,
  smm jsonb, smm_status text
);
create index if not exists orders_user_id_idx on public.orders(user_id, created_at desc);

create table if not exists public.store_config (
  id integer primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.api_settings (
  id integer primary key default 1 check (id = 1),
  smm_api_url text, smm_api_key text,
  payment_gateway text, payment_public_key text, payment_secret_key text,
  ai_api_key text, ai_system_prompt text
);

create table if not exists public.smm_service_map (
  item_id text primary key,
  service_id integer not null,
  qty_per_unit integer not null default 1 check (qty_per_unit > 0),
  note text, created_at timestamptz not null default now()
);

-- لو كان affiliates قديماً بلا CASCADE (كان يمنع حذف المستخدمين)
alter table public.affiliates drop constraint if exists affiliates_user_id_fkey;
alter table public.affiliates add constraint affiliates_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete cascade;

alter table public.admins          enable row level security;  -- بلا سياسات عمداً: تُقرأ فقط عبر is_admin()
alter table public.profiles        enable row level security;
alter table public.affiliates      enable row level security;
alter table public.orders          enable row level security;
alter table public.store_config    enable row level security;
alter table public.api_settings    enable row level security;
alter table public.smm_service_map enable row level security;

-- ---------- تسلسل أرقام الطلبات: AMX-1001, AMX-1002, ... ----------
create sequence if not exists public.orders_seq start 1001 minvalue 1001;
grant usage, select on sequence public.orders_seq to authenticated;

-- ---------- الدوال ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins
                  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

create or replace function public.gen_ref_code() returns text
language plpgsql set search_path = public as $$
declare c text;
begin
  loop
    c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.profiles where ref_code = c);
  end loop;
  return c;
end $$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
        rc text := upper(trim(coalesce(meta->>'ref', ''))); refd text;
begin
  if rc <> '' and exists (select 1 from public.profiles where ref_code = rc) then refd := rc; end if;
  insert into public.profiles (id, email, full_name, ref_code, referred_by)
  values (new.id, new.email, coalesce(meta->>'full_name', meta->>'name'), public.gen_ref_code(), refd)
  on conflict (id) do nothing;
  insert into public.affiliates (user_id) values (new.id) on conflict (user_id) do nothing;
  if refd is not null then
    update public.affiliates set signups = coalesce(signups, 0) + 1
     where user_id = (select id from public.profiles where ref_code = refd);
  end if;
  return new;
end $$;

create or replace function public.profiles_protect_referral() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  new.ref_code := old.ref_code;
  if old.referred_by is not null then
    new.referred_by := old.referred_by;
  elsif new.referred_by is not null then
    new.referred_by := upper(trim(new.referred_by));
    if new.referred_by = old.ref_code
       or not exists (select 1 from public.profiles where ref_code = new.referred_by) then
      new.referred_by := null;
    else
      update public.affiliates set signups = coalesce(signups, 0) + 1
       where user_id = (select id from public.profiles where ref_code = new.referred_by);
    end if;
  end if;
  return new;
end $$;

create or replace function public.orders_enforce_pricing() returns trigger
language plpgsql set search_path = public as $$
declare
  cfg jsonb; prods jsonb; it jsonb; p jsonb; newitems jsonb := '[]'::jsonb;
  qty numeric; unit numeric; sub numeric := 0; disc numeric := 0; cp jsonb; code text;
  base_cur text; trusted boolean;
begin
  trusted := auth.uid() is null or public.is_admin();
  -- رقم الطلب من التسلسل دائماً للعملاء؛ المدير/الخلفية يستطيعون تمرير رقم يدوي صالح
  if not trusted or new.id is null or new.id = '' then
    new.id := 'AMX-' || nextval('public.orders_seq')::text;
  end if;
  select data into cfg from public.store_config where id = 1;
  prods := coalesce(cfg->'products', '[]'::jsonb);

  if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) = 0 then raise exception 'invalid_items'; end if;
  if jsonb_array_length(new.items) > 50 then raise exception 'too_many_items'; end if;
  if new.id !~ '^AMX-[A-Z0-9]{3,30}$' then raise exception 'invalid_order_id'; end if;

  for it in select * from jsonb_array_elements(new.items) loop
    select x into p from jsonb_array_elements(prods) x where x->>'id' = it->>'id' limit 1;
    if p is null then raise exception 'unknown_product %', it->>'id'; end if;
    qty := coalesce(nullif(it->>'q','')::numeric, 0);
    if qty < 1 or qty <> trunc(qty) or qty > 100000 then raise exception 'invalid_quantity'; end if;
    unit := round(coalesce((p->>'p')::numeric, 0) * (1 - coalesce((p->>'d')::numeric, 0) / 100), 2);
    sub := sub + unit * qty;
    newitems := newitems || jsonb_build_object(
      'id', p->>'id', 'q', qty, 'price', unit,
      'ar', coalesce(p->>'ar', ''), 'en', coalesce(p->>'en', ''),
      'name', case when new.lang = 'en' then coalesce(nullif(p->>'en', ''), p->>'ar', '')
                   else coalesce(nullif(p->>'ar', ''), p->>'en', '') end,
      'link', left(coalesce(it->>'link', ''), 500));
  end loop;

  code := new.coupon;
  if code is not null and code <> '' then
    cp := cfg->'coupons'->code;
    if cp is null then new.coupon := null;
    else disc := least(sub, sub * coalesce((cp->>0)::numeric, 0) / 100 + coalesce((cp->>1)::numeric, 0));
    end if;
  else new.coupon := null;
  end if;

  new.items := newitems;
  new.total := round(greatest(0, sub - disc), 2);

  if not trusted then
    select e.key into base_cur
      from jsonb_each(coalesce(cfg->'rates', '{}'::jsonb)) e
     where jsonb_typeof(e.value) = 'array' and jsonb_typeof(e.value->0) = 'number'
       and (e.value->>0)::numeric = 1 limit 1;
    new.currency := coalesce(base_cur, 'SAR');
    if new.lang is null or new.lang not in ('ar','en') then new.lang := 'ar'; end if;
    if new.payment_method is not null and new.payment_method !~ '^[a-z0-9_-]{1,40}$' then new.payment_method := null; end if;
    new.customer_email := coalesce(nullif(auth.jwt() ->> 'email', ''), new.customer_email);
    new.customer_name  := left(coalesce(new.customer_name, ''), 120);
    new.status := 'new'; new.payment_status := 'pending';
    new.affiliate_ref := null; new.affiliate_commission := 0;
    new.smm := null; new.smm_status := null;
  end if;
  return new;
end $$;

create or replace function public.orders_affiliate() returns trigger
language plpgsql security definer set search_path = public as $$
declare ref_code_ text; ref_id uuid; rate numeric; amt numeric;
begin
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' and new.user_id is not null then
    select p2.id, p2.ref_code into ref_id, ref_code_
      from public.profiles p join public.profiles p2 on p2.ref_code = p.referred_by
     where p.id = new.user_id and p2.id <> new.user_id;
    if ref_id is not null then
      select coalesce((data->>'affiliate_rate')::numeric, 5) into rate from public.store_config where id = 1;
      amt := round(coalesce(new.total, 0) * coalesce(rate, 5) / 100, 2);
      new.affiliate_ref := ref_code_; new.affiliate_commission := amt;
      update public.affiliates set sales = coalesce(sales, 0) + 1,
             total_commission = coalesce(total_commission, 0) + amt where user_id = ref_id;
    end if;
  elsif old.payment_status = 'paid' and new.payment_status is distinct from 'paid' and coalesce(old.affiliate_commission, 0) > 0 then
    update public.affiliates set sales = greatest(coalesce(sales, 0) - 1, 0),
           total_commission = greatest(coalesce(total_commission, 0) - old.affiliate_commission, 0)
     where user_id = (select id from public.profiles where ref_code = old.affiliate_ref);
    new.affiliate_commission := 0;
  end if;
  return new;
end $$;

create or replace function public.claim_payment(p_order_id text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.orders set payment_status = 'review'
   where id = p_order_id and user_id = auth.uid()
     and coalesce(payment_status, 'pending') = 'pending' and status <> 'cancelled';
  if not found then
    if exists (select 1 from public.orders where id = p_order_id and user_id = auth.uid() and payment_status in ('review', 'paid')) then return; end if;
    raise exception 'not_allowed';
  end if;
end $$;

create or replace function public.track_ref_click(p_code text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_code !~ '^[A-Za-z0-9]{6,12}$' then return; end if;
  update public.affiliates set clicks = coalesce(clicks, 0) + 1
   where user_id = (select id from public.profiles where ref_code = upper(p_code));
end $$;

-- ---------- التريغرات ----------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
drop trigger if exists orders_enforce_pricing on public.orders;
create trigger orders_enforce_pricing before insert on public.orders for each row execute function public.orders_enforce_pricing();
drop trigger if exists orders_affiliate_trg on public.orders;
create trigger orders_affiliate_trg before update of payment_status on public.orders for each row execute function public.orders_affiliate();
drop trigger if exists profiles_protect_referral_trg on public.profiles;
create trigger profiles_protect_referral_trg before update of ref_code, referred_by on public.profiles for each row execute function public.profiles_protect_referral();

-- ---------- الصلاحيات على الدوال ----------
revoke execute on function public.orders_enforce_pricing(), public.orders_affiliate(), public.profiles_protect_referral(),
                           public.handle_new_user(), public.gen_ref_code() from public, anon, authenticated;
revoke all on function public.claim_payment(text) from public, anon;
grant execute on function public.claim_payment(text) to authenticated;
grant execute on function public.track_ref_click(text) to anon, authenticated;   -- يُستدعى من الزوار (تتبع نقرات الإحالة)
grant execute on function public.is_admin() to authenticated;                     -- تستخدمه السياسات والدوال

-- ---------- سياسات RLS ----------
do $$ declare r record; begin
  for r in select schemaname, tablename, policyname from pg_policies
            where schemaname = 'public' and tablename in ('profiles','affiliates','orders','store_config','api_settings','smm_service_map')
  loop execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename); end loop;
end $$;

create policy "profiles insert" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles read"   on public.profiles for select to authenticated using (public.is_admin() or (select auth.uid()) = id);
create policy "profiles update" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "affiliates read"         on public.affiliates for select to authenticated using (public.is_admin() or user_id = (select auth.uid()));
create policy "affiliates admin insert" on public.affiliates for insert to authenticated with check (public.is_admin());
create policy "affiliates admin update" on public.affiliates for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "affiliates admin delete" on public.affiliates for delete to authenticated using (public.is_admin());

create policy "orders insert" on public.orders for insert to authenticated
  with check (status = 'new' and coalesce(payment_status, 'pending') = 'pending'
              and jsonb_array_length(items) <= 50 and user_id = (select auth.uid()));
create policy "orders read"   on public.orders for select to authenticated using (public.is_admin() or user_id = (select auth.uid()));
create policy "orders update" on public.orders for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "config read"   on public.store_config for select to public using (true);
create policy "config insert" on public.store_config for insert to authenticated with check (public.is_admin());
create policy "config update" on public.store_config for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "settings read"   on public.api_settings for select to authenticated using (public.is_admin());
create policy "settings insert" on public.api_settings for insert to authenticated with check (public.is_admin());
create policy "settings update" on public.api_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "settings delete" on public.api_settings for delete to authenticated using (public.is_admin());

create policy "smm map admin all" on public.smm_service_map for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- التخزين: bucket الصور ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-media', 'store-media', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = true, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif'];

drop policy if exists "media read"   on storage.objects;
drop policy if exists "media insert" on storage.objects;
drop policy if exists "media update" on storage.objects;
drop policy if exists "media delete" on storage.objects;
create policy "media read"   on storage.objects for select to public        using (bucket_id = 'store-media');
create policy "media insert" on storage.objects for insert to authenticated with check (bucket_id = 'store-media' and public.is_admin());
create policy "media update" on storage.objects for update to authenticated using (bucket_id = 'store-media' and public.is_admin());
create policy "media delete" on storage.objects for delete to authenticated using (bucket_id = 'store-media' and public.is_admin());

-- ---------- منع إيقاف المشروع المجاني (Keep-alive كل 3 أيام) ----------
create extension if not exists pg_cron;
create table if not exists public.keepalive (
  id integer primary key default 1 check (id = 1),
  last_ping timestamptz not null default now(),
  pings bigint not null default 0
);
alter table public.keepalive enable row level security;
insert into public.keepalive (id) values (1) on conflict (id) do nothing;

create or replace function public.keepalive_ping() returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  update public.keepalive set last_ping = now(), pings = pings + 1 where id = 1;
  perform net.http_get(
    url := 'https://pvuobngrybygohendwaz.supabase.co/rest/v1/store_config?select=id&limit=1',
    headers := jsonb_build_object('apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dW9ibmdyeWJ5Z29oZW5kd2F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMTI0ODIsImV4cCI6MjEwNzg4ODQ4Mn0.enSKw1_Wt58iK8-Y0eaHMWtBGQ7HyYXP_JEwYLsSfpU')
  );
end $$;
revoke execute on function public.keepalive_ping() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'amarix-keepalive') then perform cron.unschedule('amarix-keepalive'); end if;
  perform cron.schedule('amarix-keepalive', '0 3 */3 * *', 'select public.keepalive_ping()');
end $$;

notify pgrst, 'reload schema';
