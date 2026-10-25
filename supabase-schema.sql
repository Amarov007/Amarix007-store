-- =====================================================================
-- AMARIX007 — مخطط قاعدة البيانات الكامل (مولَّد من مشروع Supabase الحي بتاريخ 2026-10-22)
-- آمن للتشغيل أكثر من مرة. شغّله في: Supabase > SQL Editor
-- بعد التشغيل:
--   1) أضف المدير بعد تسجيل حسابه وتأكيد بريده:
--      insert into public.admins(email, user_id) select email, id from auth.users where lower(email)=lower('you@example.com') and email_confirmed_at is not null on conflict (email) do update set user_id = excluded.user_id;
--   2) keepalive_ping مضبوطة على مشروعك (بدّل القيم إن غيّرت المشروع).
--   3) فعّل «Leaked password protection» من Supabase > Authentication > Providers > Email (يدوياً).
-- مهم: لا تشغّل نسخة أقدم من هذا الملف؛ كانت تعيد store_config مقروءة للعامة وتلغي شرط إثبات الدفع.
-- =====================================================================

create extension if not exists pg_net  with schema extensions;
create extension if not exists pg_cron;

-- ---------- الجداول ----------
create table if not exists public.admins (email text primary key, user_id uuid references auth.users(id) on delete cascade);
alter table public.admins add column if not exists user_id uuid references auth.users(id) on delete cascade;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text, email text,
  ref_code text unique, referred_by text,
  created_at timestamptz default now()
);

create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  clicks integer default 0, signups integer default 0, sales integer default 0,
  total_commission numeric default 0
);
-- (user_id فريد عملياً: handle_new_user يستخدم on conflict (user_id))
create unique index if not exists affiliates_user_id_key on public.affiliates(user_id);

create sequence if not exists public.orders_seq start 1001;

create table if not exists public.orders (
  id text primary key,
  created_at timestamptz not null default now(),
  customer_name text, customer_email text,
  items jsonb not null default '[]'::jsonb,
  total numeric, lang text,
  status text not null default 'new' check (status in ('new','processing','done','cancelled')),
  payment_status text default 'pending' check (payment_status is null or payment_status in ('pending','review','paid')),
  affiliate_ref text,
  user_id uuid references auth.users(id) on delete set null,
  currency text default 'SAR',
  coupon text, payment_method text,
  smm jsonb, smm_status text,
  affiliate_commission numeric default 0,
  payment_proof text,
  pay_currency text
);
alter table public.orders add column if not exists pay_currency text;
create index if not exists orders_user_id_idx on public.orders (user_id, created_at desc);

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

create table if not exists public.notify_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default true,
  telegram_bot_token text, telegram_chat_id text
);

create table if not exists public.smm_service_map (
  item_id text primary key,
  service_id integer not null,
  qty_per_unit integer not null default 1 check (qty_per_unit > 0),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.rate_limits (
  k text not null, bucket bigint not null, n integer not null default 1,
  ts timestamptz not null default now(),
  primary key (k, bucket)
);

create table if not exists public.keepalive (
  id integer primary key default 1 check (id = 1),
  last_ping timestamptz not null default now(),
  pings bigint not null default 0
);

insert into public.store_config(id) values (1) on conflict do nothing;
insert into public.api_settings(id)  values (1) on conflict do nothing;
insert into public.notify_settings(id) values (1) on conflict do nothing;
insert into public.keepalive(id) values (1) on conflict do nothing;

alter table public.admins          enable row level security;
alter table public.profiles        enable row level security;
alter table public.affiliates      enable row level security;
alter table public.orders          enable row level security;
alter table public.store_config    enable row level security;
alter table public.api_settings    enable row level security;
alter table public.notify_settings enable row level security;
alter table public.smm_service_map enable row level security;
alter table public.rate_limits     enable row level security;
alter table public.keepalive       enable row level security;
-- admins / notify_settings / rate_limits / keepalive: بلا سياسات عمداً (تُقرأ فقط من دوال security definer)

-- ---------- الدوال ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.admins a
     where a.user_id is not null and a.user_id = auth.uid());
$$;

create or replace function public.client_ip() returns text
language plpgsql stable set search_path = public as $function$
declare h json; x text;
begin
  begin h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then h := null; end;
  if h is null then return 'unknown'; end if;
  x := nullif(trim(coalesce(h->>'cf-connecting-ip', '')), '');
  return coalesce(left(x, 64), 'unknown');
end $function$;

create or replace function public.rl_hit(p_key text, p_max integer, p_window_seconds integer) returns boolean
language plpgsql security definer set search_path = public as $function$
declare b bigint; c integer;
begin
  b := floor(extract(epoch from now()) / greatest(p_window_seconds, 1))::bigint;
  insert into public.rate_limits (k, bucket, n) values (left(p_key, 200), b, 1)
    on conflict (k, bucket) do update set n = public.rate_limits.n + 1
    returning n into c;
  return c <= p_max;
end $function$;

create or replace function public.coupon_usable(cp jsonb, p_code text) returns boolean
language plpgsql stable security definer set search_path = public as $function$
declare ex text; mx numeric := 0;
begin
  if jsonb_typeof(cp) <> 'array' then return false; end if;
  begin ex := nullif(cp->>4, ''); if ex is not null and current_date > ex::date then return false; end if;
  exception when others then null; end;
  begin mx := coalesce(nullif(cp->>3, '')::numeric, 0); exception when others then mx := 0; end;
  if mx > 0 and (select count(*) from public.orders where coupon = upper(p_code) and status <> 'cancelled') >= mx then
    return false;
  end if;
  return true;
end $function$;

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

create or replace function public.check_coupon(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $function$
declare code text := upper(trim(coalesce(p_code, ''))); ip text := public.client_ip(); cp jsonb;
begin
  if code !~ '^[A-Z0-9_-]{1,40}$' then return null; end if;
  if not public.rl_hit('coupon:' || ip, case when ip = 'unknown' then 120 else 30 end, 600) then return null; end if;
  select data->'coupons'->code into cp from public.store_config where id = 1;
  if cp is null or jsonb_typeof(cp) <> 'array' or not public.coupon_usable(cp, code) then return null; end if;
  return jsonb_build_array(cp->0, cp->1);
end $function$;

create or replace function public.gen_ref_code() returns text
language plpgsql set search_path = public as $function$
declare c text;
begin
  loop
    c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    exit when not exists (select 1 from public.profiles where ref_code = c);
  end loop;
  return c;
end $function$;

-- [moved] public.handle_new_user() is defined only in supabase-affiliate-program.sql (one definition per function; see tests/verify-project.py check 5).

create or replace function public.my_proof_count() returns integer
language sql stable security definer set search_path = public, storage as $$
  select count(*)::int from storage.objects o
   where o.bucket_id = 'payment-proofs'
     and (storage.foldername(o.name))[1] = (select auth.uid())::text;
$$;

-- [moved] public.track_ref_click() is defined only in supabase-affiliate-program.sql (one definition per function; see tests/verify-project.py check 5).

create or replace function public.set_payment_proof(p_order_id text, p_path text) returns void
language plpgsql security definer set search_path = public as $function$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_allowed'; end if;
  if p_path is null or length(p_path) > 300
     or p_path !~ ('^' || uid::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$') then
    raise exception 'invalid_path';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'payment-proofs' and name = p_path) then
    raise exception 'proof_missing';
  end if;
  update public.orders set payment_proof = p_path
   where id = p_order_id and user_id = uid
     and coalesce(payment_status, 'pending') = 'pending' and status <> 'cancelled';
  if not found then raise exception 'not_allowed'; end if;
end $function$;

create or replace function public.claim_payment(p_order_id text) returns void
language plpgsql security definer set search_path = public as $function$
begin
  update public.orders
     set payment_status = 'review'
   where id = p_order_id and user_id = auth.uid()
     and coalesce(payment_status, 'pending') = 'pending' and status <> 'cancelled'
     and payment_proof is not null and payment_proof <> '';
  if not found then
    if exists (select 1 from public.orders where id = p_order_id and user_id = auth.uid() and payment_status in ('review', 'paid')) then return; end if;
    -- الطلب للمستخدم وبانتظار الدفع لكن بلا إثبات -> رسالة واضحة
    if exists (select 1 from public.orders where id = p_order_id and user_id = auth.uid()
                and coalesce(payment_status, 'pending') = 'pending' and status <> 'cancelled') then
      raise exception 'proof_required';
    end if;
    raise exception 'not_allowed';
  end if;
end $function$;

create or replace function public.orders_clear_proof_on_insert() returns trigger
language plpgsql set search_path = public as $function$
begin
  if auth.uid() is not null and not public.is_admin() then new.payment_proof := null; end if;
  return new;
end $function$;

-- [moved] public.orders_enforce_pricing() is defined only in supabase-boost-units.sql (one definition per function; see tests/verify-project.py check 5).

-- [moved] public.orders_affiliate() is defined only in supabase-affiliate-tiers.sql (one definition per function; see tests/verify-project.py check 5).

-- [moved] public.profiles_protect_referral() is defined only in supabase-affiliate-program.sql (one definition per function; see tests/verify-project.py check 5).

-- ---------- إشعارات تلغرام ----------
create or replace function public.notify_telegram(p_text text) returns void
language plpgsql security definer set search_path = public, extensions as $function$
declare s record;
begin
  select * into s from public.notify_settings where id = 1;
  if s.id is null or not s.enabled
     or coalesce(s.telegram_bot_token, '') = '' or coalesce(s.telegram_chat_id, '') = '' then
    return;
  end if;
  perform net.http_post(
    url := 'https://api.telegram.org/bot' || s.telegram_bot_token || '/sendMessage',
    body := jsonb_build_object('chat_id', s.telegram_chat_id, 'text', left(coalesce(p_text, ''), 3500), 'disable_web_page_preview', true),
    headers := jsonb_build_object('Content-Type', 'application/json'));
exception when others then
  null;
end $function$;

create or replace function public.orders_notify() returns trigger
language plpgsql security definer set search_path = public as $function$
declare
  lines text; rates jsonb; k text; rate numeric; sym text; amt text; pm text;
begin
  begin
    select string_agg('• ' || coalesce(nullif(x->>'name', ''), x->>'id') || ' × ' || coalesce(x->>'q', '1')
                      || case when coalesce(x->>'link', '') <> '' then E'\n   ' || left(x->>'link', 120) else '' end, E'\n')
      into lines from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) x;

    amt := coalesce(new.total::text, '0') || ' ' || coalesce(new.currency, '');
    select data->'rates' into rates from public.store_config where id = 1;
    k := upper(coalesce(new.pay_currency, ''));
    if k <> '' and jsonb_typeof(rates->k) = 'array' and jsonb_typeof(rates->k->0) = 'number'
       and (rates->k->>0)::numeric > 0 then
      rate := (rates->k->>0)::numeric;
      sym  := coalesce(nullif(rates->k->>1, ''), k);
      amt  := case when k = 'SYP'
                   then to_char(round(coalesce(new.total, 0) * rate), 'FM999,999,999,999,990')
                   else to_char(round(coalesce(new.total, 0) * rate, 2), 'FM999,999,999,990.00') end
              || ' ' || sym;
    end if;

    pm := coalesce(
      (select coalesce(nullif(btrim(m->>'ar'), ''), nullif(btrim(m->>'en'), ''))
         from public.store_config c, jsonb_array_elements(coalesce(c.data->'payments', '[]'::jsonb)) m
        where c.id = 1 and m->>'id' = new.payment_method limit 1),
      new.payment_method, 'غير محدد');

    if tg_op = 'INSERT' then
      perform public.notify_telegram(
        '🛒 طلب جديد ' || new.id || E'\n👤 ' || coalesce(new.customer_name, '') || ' (' || coalesce(new.customer_email, '') || ')'
        || E'\n💰 ' || amt
        || E'\n💳 ' || pm || E'\n' || coalesce(lines, ''));
    elsif new.payment_status = 'review' and old.payment_status is distinct from 'review' then
      perform public.notify_telegram(
        '💸 العميل ضغط «تم الدفع» — يحتاج تحقق ' || new.id || E'\n👤 ' || coalesce(new.customer_name, '') || ' (' || coalesce(new.customer_email, '') || ')'
        || E'\n💰 ' || amt
        || E'\n💳 ' || pm
        || E'\n🧾 إثبات الدفع: ' || case when new.payment_proof is not null then 'مرفق' else 'غير مرفق' end);
    end if;
  exception when others then
    null;
  end;
  return new;
end $function$;

create or replace function public.profiles_notify() returns trigger
language plpgsql security definer set search_path = public as $function$
begin
  begin
    perform public.notify_telegram('👤 عميل جديد: ' || coalesce(new.full_name, '—') || ' (' || coalesce(new.email, '') || ')');
  exception when others then
    null;
  end;
  return new;
end $function$;

-- ---------- الحفاظ على نشاط المشروع (keepalive) ----------
-- بدّل YOUR_PROJECT_REF و YOUR_ANON_KEY (المفتاح العام anon) قبل التشغيل.
-- تستدعي public_config لأن store_config لم تعد مقروءة لـ anon (كانت تعطي 401).
create or replace function public.keepalive_ping() returns void
language plpgsql security definer set search_path = public, extensions as $function$
begin
  update public.keepalive set last_ping = now(), pings = pings + 1 where id = 1;
  perform net.http_post(
    url := 'https://pvuobngrybygohendwaz.supabase.co/rest/v1/rpc/public_config',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dW9ibmdyeWJ5Z29oZW5kd2F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMTI0ODIsImV4cCI6MjEwNzg4ODQ4Mn0.enSKw1_Wt58iK8-Y0eaHMWtBGQ7HyYXP_JEwYLsSfpU',
      'Content-Type', 'application/json')
  );
end $function$;

-- ---------- التريغرات ----------
-- [moved] trigger on_auth_user_created -> supabase-affiliate-program.sql (next to handle_new_user)

-- [moved] trigger orders_enforce_pricing -> supabase-boost-units.sql (next to the function)
drop trigger if exists orders_clear_proof_trg on public.orders;
create trigger orders_clear_proof_trg before insert on public.orders for each row execute function public.orders_clear_proof_on_insert();
-- [moved] trigger orders_affiliate_trg -> supabase-affiliate-tiers.sql (next to the function)
drop trigger if exists orders_notify_ins_trg on public.orders;
create trigger orders_notify_ins_trg after insert on public.orders for each row execute function public.orders_notify();
drop trigger if exists orders_notify_upd_trg on public.orders;
create trigger orders_notify_upd_trg after update of payment_status on public.orders for each row
  when (old.payment_status is distinct from new.payment_status) execute function public.orders_notify();

-- [moved] trigger profiles_protect_referral_trg -> supabase-affiliate-program.sql (next to the function)
drop trigger if exists profiles_notify_trg on public.profiles;
create trigger profiles_notify_trg after insert on public.profiles for each row execute function public.profiles_notify();

-- ---------- سياسات RLS ----------
-- orders
drop policy if exists "orders insert" on public.orders;
create policy "orders insert" on public.orders for insert to authenticated
  with check (status = 'new' and coalesce(payment_status, 'pending') = 'pending'
              and jsonb_array_length(items) <= 50 and user_id = (select auth.uid()));
drop policy if exists "orders read" on public.orders;
create policy "orders read" on public.orders for select to authenticated
  using (public.is_admin() or user_id = (select auth.uid()));
drop policy if exists "orders update" on public.orders;
create policy "orders update" on public.orders for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- store_config: القراءة المباشرة للأدمن فقط. المتجر يقرأ عبر public_config() (بلا كوبونات سرية)
drop policy if exists "config read" on public.store_config;
create policy "config read" on public.store_config for select to authenticated using (public.is_admin());
drop policy if exists "config insert" on public.store_config;
create policy "config insert" on public.store_config for insert to authenticated with check (public.is_admin());
drop policy if exists "config update" on public.store_config;
create policy "config update" on public.store_config for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- api_settings (مفاتيح سرّية: أدمن فقط)
drop policy if exists "settings read" on public.api_settings;
create policy "settings read" on public.api_settings for select to authenticated using (public.is_admin());
drop policy if exists "settings insert" on public.api_settings;
create policy "settings insert" on public.api_settings for insert to authenticated with check (public.is_admin());
drop policy if exists "settings update" on public.api_settings;
create policy "settings update" on public.api_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "settings delete" on public.api_settings;
create policy "settings delete" on public.api_settings for delete to authenticated using (public.is_admin());

-- smm_service_map
drop policy if exists "smm map admin all" on public.smm_service_map;
create policy "smm map admin all" on public.smm_service_map for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (public.is_admin() or (select auth.uid()) = id);
drop policy if exists "profiles update" on public.profiles;
create policy "profiles update" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists "profiles insert" on public.profiles;
create policy "profiles insert" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);

-- affiliates
drop policy if exists "affiliates read" on public.affiliates;
create policy "affiliates read" on public.affiliates for select to authenticated using (public.is_admin() or user_id = (select auth.uid()));
drop policy if exists "affiliates admin insert" on public.affiliates;
create policy "affiliates admin insert" on public.affiliates for insert to authenticated with check (public.is_admin());
drop policy if exists "affiliates admin update" on public.affiliates;
create policy "affiliates admin update" on public.affiliates for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "affiliates admin delete" on public.affiliates;
create policy "affiliates admin delete" on public.affiliates for delete to authenticated using (public.is_admin());

-- ---------- صلاحيات تنفيذ الدوال ----------
-- [moved] function execute grants (revoke all + every grant execute) -> supabase-final-grants.sql, which must be run LAST.

-- ---------- التخزين (Storage) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('store-media', 'store-media', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media read" on storage.objects;
create policy "media read" on storage.objects for select to public using (bucket_id = 'store-media');
drop policy if exists "media insert" on storage.objects;
create policy "media insert" on storage.objects for insert to authenticated with check (bucket_id = 'store-media' and public.is_admin());
drop policy if exists "media update" on storage.objects;
create policy "media update" on storage.objects for update to authenticated using (bucket_id = 'store-media' and public.is_admin());
drop policy if exists "media delete" on storage.objects;
create policy "media delete" on storage.objects for delete to authenticated using (bucket_id = 'store-media' and public.is_admin());
drop policy if exists "proofs read own or admin" on storage.objects;
create policy "proofs read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and (public.is_admin() or (storage.foldername(name))[1] = (select auth.uid())::text));
drop policy if exists "proofs insert own" on storage.objects;
create policy "proofs insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = (select auth.uid())::text and public.my_proof_count() < 30);

-- ---------- المهام المجدولة ----------
do $$ begin
  perform cron.unschedule(jobname) from cron.job where jobname in ('amarix-keepalive', 'amarix-ratelimit-cleanup');
end $$;
select cron.schedule('amarix-keepalive', '0 3 */3 * *', 'select public.keepalive_ping()');
select cron.schedule('amarix-ratelimit-cleanup', '17 3 * * *', $$delete from public.rate_limits where ts < now() - interval '2 days'$$);

-- =====================================================================
-- تذاكر الدعم (Support tickets) + حدود كمية الرشق
-- يصل إشعار تلغرام عند إرسال تذكرة (عبر notify_telegram الموجودة) وتظهر التذاكر في لوحة التحكم > تذاكر الدعم.
-- =====================================================================
create table if not exists public.support_tickets (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete cascade,
  customer_name text, customer_email text,
  order_id text,
  subject text not null, message text not null,
  attachment text,
  lang text,
  status text not null default 'open' check (status in ('open','answered','closed')),
  admin_reply text, replied_at timestamptz
);
create index if not exists support_tickets_user_idx   on public.support_tickets (user_id, created_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);
alter table public.support_tickets enable row level security;

create or replace function public.tickets_before_insert() returns trigger
language plpgsql security definer set search_path = public as $function$
declare uid uuid := auth.uid();
begin
  if uid is not null and not public.is_admin() then
    if not public.rl_hit('ticket:' || uid::text, 5, 3600) then raise exception 'rate_limited'; end if;  -- 5 تذاكر / ساعة
    new.user_id := uid;
    new.customer_email := coalesce(nullif(auth.jwt() ->> 'email', ''), new.customer_email);
    new.status := 'open'; new.admin_reply := null; new.replied_at := null;
    new.created_at := now();
    if new.attachment is not null
       and new.attachment !~ ('^' || uid::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$') then
      new.attachment := null;
    end if;
  end if;
  new.customer_name  := left(coalesce(new.customer_name, ''), 120);
  new.subject        := left(btrim(coalesce(new.subject, '')), 120);
  new.message        := left(btrim(coalesce(new.message, '')), 2000);
  new.order_id       := nullif(left(upper(btrim(coalesce(new.order_id, ''))), 40), '');
  new.lang           := case when new.lang in ('ar','en') then new.lang else 'ar' end;
  if length(new.subject) < 3 or length(new.message) < 5 then raise exception 'invalid_ticket'; end if;
  return new;
end $function$;

create or replace function public.tickets_notify() returns trigger
language plpgsql security definer set search_path = public as $function$
begin
  begin
    perform public.notify_telegram(
      '🎫 تذكرة دعم جديدة #' || new.id
      || E'\n👤 ' || coalesce(new.customer_name, '') || ' (' || coalesce(new.customer_email, '') || ')'
      || case when new.order_id is not null then E'\n🧾 الطلب: ' || new.order_id else '' end
      || E'\n📌 ' || new.subject
      || E'\n\n' || left(new.message, 1500)
      || case when new.attachment is not null then E'\n\n📎 صورة مرفقة (تظهر في لوحة التحكم > تذاكر الدعم)' else '' end);
  exception when others then
    null;
  end;
  return new;
end $function$;

drop trigger if exists tickets_before_insert_trg on public.support_tickets;
create trigger tickets_before_insert_trg before insert on public.support_tickets for each row execute function public.tickets_before_insert();
drop trigger if exists tickets_notify_trg on public.support_tickets;
create trigger tickets_notify_trg after insert on public.support_tickets for each row execute function public.tickets_notify();

drop policy if exists "tickets insert own" on public.support_tickets;
create policy "tickets insert own" on public.support_tickets for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'open' and admin_reply is null);
drop policy if exists "tickets read own or admin" on public.support_tickets;
create policy "tickets read own or admin" on public.support_tickets for select to authenticated
  using (public.is_admin() or user_id = (select auth.uid()));
drop policy if exists "tickets admin update" on public.support_tickets;
create policy "tickets admin update" on public.support_tickets for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "tickets admin delete" on public.support_tickets;
create policy "tickets admin delete" on public.support_tickets for delete to authenticated
  using (public.is_admin());

-- صور التذاكر: حاوية خاصة، كل مستخدم يرفع داخل مجلده فقط والمدير يراها
create or replace function public.my_ticket_file_count() returns integer
language sql stable security definer set search_path = public, storage as $$
  select count(*)::int from storage.objects o
   where o.bucket_id = 'ticket-files'
     and (storage.foldername(o.name))[1] = (select auth.uid())::text;
$$;
revoke execute on function public.my_ticket_file_count() from public, anon;
grant  execute on function public.my_ticket_file_count() to authenticated, service_role;
revoke execute on function public.tickets_before_insert() from public, anon, authenticated;
revoke execute on function public.tickets_notify()        from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ticket-files', 'ticket-files', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ticket files read own or admin" on storage.objects;
create policy "ticket files read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'ticket-files' and (public.is_admin() or (storage.foldername(name))[1] = (select auth.uid())::text));
drop policy if exists "ticket files insert own" on storage.objects;
create policy "ticket files insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'ticket-files' and (storage.foldername(name))[1] = (select auth.uid())::text and public.my_ticket_file_count() < 30);
