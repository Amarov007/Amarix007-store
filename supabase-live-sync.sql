-- =====================================================================
-- supabase-live-sync.sql
-- كائنات كانت موجودة في القاعدة الحية فقط (مشروع pvuobngrybygohendwaz)
-- وغير معرَّفة في أي ملف داخل المستودع. مسحوبة من القاعدة الحية بتاريخ 2026-10-25.
--
-- • آمن لإعادة التشغيل (if not exists / create or replace / drop policy if exists).
-- • على القاعدة الحية: لا يغيّر شيئاً (التعريفات مطابقة لما هو مطبّق فعلاً).
-- • على قاعدة جديدة: يُشغَّل بعد supabase-wallet.sql وقبل supabase-final-grants.sql.
-- • صلاحيات التنفيذ (grant execute) ليست هنا: مكانها supabase-final-grants.sql.
-- =====================================================================

-- ---------- 1) الجداول ----------

create table if not exists public.reviews (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id text not null,
  product_id text not null,
  rating smallint not null check (rating >= 1 and rating <= 5),
  comment text check (comment is null or char_length(comment) <= 500),
  author text,
  approved boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, order_id, product_id)
);
create index if not exists reviews_product_idx on public.reviews (product_id, created_at desc) where approved;

create table if not exists public.product_views (
  product_id text not null,
  day date not null default ((now() at time zone 'utc')::date),
  views integer not null default 0,
  primary key (product_id, day)
);

create table if not exists public.cart_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  lang text,
  updated_at timestamptz not null default now(),
  reminded_at timestamptz
);

create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  lang text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table if not exists public.push_broadcasts (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  title text not null,
  body text not null,
  url text not null default '#/',
  test boolean not null default false,
  recipients integer,
  sent integer,
  failed integer
);

create table if not exists public.payout_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric not null check (amount > 0),
  method text not null check (char_length(method) between 1 and 40),
  account text not null check (char_length(account) between 1 and 200),
  status text not null default 'pending' check (status in ('pending','paid','rejected')),
  note text,
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create index if not exists payout_requests_user_id_idx on public.payout_requests (user_id);
create index if not exists payout_requests_status_created_at_idx on public.payout_requests (status, created_at desc);

create table if not exists public.affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount numeric not null check (amount > 0),
  txid text,
  paid_at timestamptz not null default now(),
  paid_by uuid
);
create index if not exists affiliate_payouts_user_month_idx on public.affiliate_payouts (user_id, month);

create table if not exists public.smm_providers (
  id text primary key check (id ~ '^[a-z0-9_-]{1,30}$' and id <> 'main'),
  name text not null default '',
  kind text not null default 'smm' check (kind in ('smm','smsactivate','custom')),
  api_url text not null default '',
  api_key text not null default '',
  config jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.staff_activity (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_email text,
  actor_kind text not null default 'staff' check (actor_kind in ('admin','staff')),
  action text not null,
  target text,
  details jsonb not null default '{}'::jsonb
);
create index if not exists staff_activity_at_idx on public.staff_activity (at desc);
create index if not exists staff_activity_actor_idx on public.staff_activity (actor_id, at desc);

create table if not exists public.store_config_backups (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  data jsonb not null
);

create table if not exists public.telegram_links (
  tg_id bigint primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  username text,
  kind text not null default 'login' check (kind in ('login','link')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.telegram_logins (
  tg_id bigint not null,
  auth_date bigint not null,
  created_at timestamptz not null default now(),
  primary key (tg_id, auth_date)
);

create table if not exists public.tg_auth_seen (
  hash text primary key,
  seen_at timestamptz not null default now()
);

-- ---------- 2) RLS + السياسات (مطابقة للحي) ----------

alter table public.reviews              enable row level security;
alter table public.product_views        enable row level security;
alter table public.cart_snapshots       enable row level security;
alter table public.push_subscriptions   enable row level security;
alter table public.push_broadcasts      enable row level security;
alter table public.payout_requests      enable row level security;
alter table public.affiliate_payouts    enable row level security;
alter table public.smm_providers        enable row level security;
alter table public.staff_activity       enable row level security;
alter table public.store_config_backups enable row level security;
alter table public.telegram_links       enable row level security;
alter table public.telegram_logins      enable row level security;
alter table public.tg_auth_seen         enable row level security;

-- جداول داخلية: لا وصول لأدوار الـ API إطلاقاً (تُقرأ عبر دوال security definer فقط)
drop policy if exists "cart_snapshots deny api roles" on public.cart_snapshots;
create policy "cart_snapshots deny api roles" on public.cart_snapshots as restrictive for all
  to anon, authenticated using (false) with check (false);

drop policy if exists "product_views deny api roles" on public.product_views;
create policy "product_views deny api roles" on public.product_views as restrictive for all
  to anon, authenticated using (false) with check (false);

-- telegram_links / telegram_logins / tg_auth_seen: RLS مفعّل بلا سياسات = مغلقة لغير service_role

drop policy if exists "reviews admin all" on public.reviews;
create policy "reviews admin all" on public.reviews for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "push own select" on public.push_subscriptions;
create policy "push own select" on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "push own delete" on public.push_subscriptions;
create policy "push own delete" on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "broadcasts admin read" on public.push_broadcasts;
create policy "broadcasts admin read" on public.push_broadcasts for select to authenticated
  using (public.is_admin());

drop policy if exists "payouts read own or admin" on public.payout_requests;
create policy "payouts read own or admin" on public.payout_requests for select to authenticated
  using (public.is_admin() or user_id = (select auth.uid()));
drop policy if exists "payouts admin update" on public.payout_requests;
create policy "payouts admin update" on public.payout_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "payouts admin read" on public.affiliate_payouts;
create policy "payouts admin read" on public.affiliate_payouts for select to authenticated
  using (public.is_admin());
drop policy if exists "payouts admin delete" on public.affiliate_payouts;
create policy "payouts admin delete" on public.affiliate_payouts for delete to authenticated
  using (public.is_admin());

drop policy if exists "smm providers admin all" on public.smm_providers;
create policy "smm providers admin all" on public.smm_providers for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "activity admin read" on public.staff_activity;
create policy "activity admin read" on public.staff_activity for select to authenticated
  using (public.is_admin());

drop policy if exists "store_config_backups_admin_read" on public.store_config_backups;
create policy "store_config_backups_admin_read" on public.store_config_backups for select to authenticated
  using (public.is_admin());

-- صلاحيات الجداول (مطابقة للحي؛ أي شيء آخر محجوب بـ RLS وبعدم وجود grant)
grant select, update, delete on public.reviews            to authenticated;
grant select, delete         on public.push_subscriptions to authenticated;
grant select                 on public.push_broadcasts    to authenticated;
grant select, update         on public.payout_requests    to authenticated;
grant select, delete         on public.affiliate_payouts  to authenticated;
grant select, insert, update, delete on public.smm_providers to authenticated;
grant select                 on public.staff_activity     to authenticated;
grant select                 on public.store_config_backups to authenticated;

-- ---------- 3) الدوال التي تستدعيها الواجهة (RPC) ----------

create or replace function public.track_view(p_product text) returns void
language plpgsql security definer set search_path = public as $$
declare pid text := left(coalesce(p_product, ''), 80);
begin
  if pid !~ '^[A-Za-z0-9_.-]{1,80}$' then return; end if;
  if not exists (select 1 from public.store_config c, jsonb_array_elements(coalesce(c.data->'products', '[]'::jsonb)) x
                  where c.id = 1 and x->>'id' = pid) then return; end if;
  if not public.rl_hit('view:' || coalesce(public.client_ip()::text, 'x') || ':' || pid, 3, 3600) then return; end if;
  insert into public.product_views (product_id, day, views) values (pid, (now() at time zone 'utc')::date, 1)
  on conflict (product_id, day) do update set views = public.product_views.views + 1;
exception when others then
  null;
end $$;

create or replace function public.product_stats() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(x.pid, jsonb_build_object('s', x.s, 'rc', x.rc, 'ra', x.ra)), '{}'::jsonb)
  from (
    select coalesce(a.pid, b.pid) as pid, coalesce(a.s, 0) as s, coalesce(b.rc, 0) as rc, b.ra
    from (select it->>'id' as pid, count(distinct o.id) as s
            from public.orders o, jsonb_array_elements(o.items) it
           where jsonb_typeof(o.items) = 'array' and o.payment_status = 'paid' and o.status <> 'cancelled'
           group by 1) a
    full join (select product_id as pid, count(*) as rc, round(avg(rating)::numeric, 1) as ra
                 from public.reviews where approved group by 1) b on a.pid = b.pid
  ) x where x.pid is not null;
$$;

create or replace function public.my_reviews() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('o', order_id, 'p', product_id, 'r', rating)), '[]'::jsonb) from public.reviews where user_id = auth.uid();
$$;

create or replace function public.submit_review(p_order text, p_product text, p_rating integer, p_comment text) returns boolean
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); nm text; c text := left(nullif(trim(coalesce(p_comment,'')),''), 500);
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'invalid_rating'; end if;
  if not public.rl_hit('review:' || uid::text, 20, 3600) then raise exception 'rate_limited'; end if;
  if not exists (select 1 from public.orders o where o.id = p_order and o.user_id = uid and o.status = 'done'
                 and o.items @> jsonb_build_array(jsonb_build_object('id', p_product))) then
    raise exception 'not_purchased';
  end if;
  select nullif(split_part(trim(coalesce(full_name,'')), ' ', 1), '') into nm from public.profiles where id = uid;
  insert into public.reviews (user_id, order_id, product_id, rating, comment, author)
  values (uid, p_order, left(p_product, 80), p_rating, c, left(coalesce(nm, 'عميل'), 40))
  on conflict (user_id, order_id, product_id) do update set rating = excluded.rating, comment = excluded.comment, created_at = now();
  begin perform public.notify_telegram('⭐ تقييم جديد ' || p_rating || '/5 للمنتج ' || p_product || coalesce(E'\n' || c, '')); exception when others then null; end;
  return true;
end $$;

create or replace function public.rate_ticket(p_id bigint, p_resolved boolean) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); tk record;
begin
  if uid is null or p_resolved is null then raise exception 'not_allowed'; end if;
  if not public.rl_hit('tkrate:' || uid::text, 20, 3600) then raise exception 'rate_limited'; end if;
  select * into tk from public.support_tickets where id = p_id and user_id = uid for update;
  if not found then raise exception 'not_allowed'; end if;
  if tk.admin_reply is null then raise exception 'no_reply_yet'; end if;
  -- مقيَّمة مسبقاً: يُسمح فقط بالتحويل من «حُلّت» إلى «لم تُحل» (إعادة فتح)
  if tk.resolved is not null and not (tk.resolved and not p_resolved) then return; end if;

  update public.support_tickets
     set resolved = p_resolved, rated_at = now(),
         status = case when p_resolved then 'closed' else 'open' end
   where id = p_id;

  begin
    perform public.notify_telegram(
      case when p_resolved then '✅ تقييم: تم حل المشكلة' else '❌ تقييم: المشكلة لم تُحل — بانتظار ردّك' end
      || E'\n🎫 تذكرة #' || tk.id || ' · ' || tk.subject
      || E'\n👤 ' || coalesce(tk.customer_name, '') || ' (' || coalesce(tk.customer_email, '') || ')');
  exception when others then
    null;
  end;
end $$;

create or replace function public.save_cart(p_items jsonb, p_lang text default 'ar') returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); clean jsonb;
begin
  if uid is null then return; end if;
  if not public.rl_hit('cart:' || uid::text, 60, 3600) then return; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'q', s.q)), '[]'::jsonb) into clean
    from (select x->>'id' as id,
                 least(greatest(coalesce(nullif(x->>'q', '')::numeric, 1), 1), 100000) as q
            from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) x
           where x->>'id' ~ '^[A-Za-z0-9_.-]{1,80}$' limit 30) s;
  if jsonb_array_length(clean) = 0 then
    delete from public.cart_snapshots where user_id = uid;
    return;
  end if;
  insert into public.cart_snapshots as c (user_id, items, lang, updated_at)
  values (uid, clean, case when p_lang like 'en%' then 'en' else 'ar' end, now())
  on conflict (user_id) do update
    set lang = excluded.lang,
        updated_at = case when c.items = excluded.items then c.updated_at else now() end,
        reminded_at = case when c.items = excluded.items then c.reminded_at else null end,
        items = excluded.items;
exception when others then
  null;
end $$;

create or replace function public.push_register(p_endpoint text, p_p256dh text, p_auth text, p_lang text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if coalesce(p_endpoint, '') = '' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then raise exception 'bad_subscription'; end if;
  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, lang)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, p_lang)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth, lang = excluded.lang;
end $$;

create or replace function public.admin_push_stats() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden'; end if;
  return jsonb_build_object('devices', (select count(*) from public.push_subscriptions), 'users', (select count(distinct user_id) from public.push_subscriptions));
end $$;

create or replace function public.admin_send_broadcast(p_title text, p_body text, p_url text default '#/', p_test boolean default false) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare s record; bid bigint; t text := btrim(coalesce(p_title, '')); b text := btrim(coalesce(p_body, '')); u text := coalesce(p_url, '#/');
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'forbidden'; end if;
  if length(t) < 1 or length(t) > 80 then raise exception 'bad_title'; end if;
  if length(b) < 1 or length(b) > 200 then raise exception 'bad_body'; end if;
  if u not in ('#/', '#/orders', '#/account', '#/cart', '#/support') then u := '#/'; end if;
  if not p_test and exists (select 1 from public.push_broadcasts where not test and created_at > now() - interval '20 seconds') then
    raise exception 'too_fast';
  end if;
  select * into s from public.notify_settings where id = 1;
  if s.id is null or coalesce(s.push_function_url, '') = '' or coalesce(s.push_secret, '') = '' then raise exception 'push_not_configured'; end if;
  insert into public.push_broadcasts(created_by, title, body, url, test) values (auth.uid(), t, b, u, p_test) returning id into bid;
  perform net.http_post(
    url := s.push_function_url,
    body := jsonb_build_object('broadcast', not p_test, 'user_id', case when p_test then auth.uid() else null end,
                               'broadcast_id', bid, 'title', t, 'body', b, 'url', u, 'tag', 'bc-' || bid),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', s.push_secret),
    timeout_milliseconds := 5000);
  return bid;
end $$;

create or replace function public.admin_stats(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d int := least(greatest(coalesce(p_days, 30), 1), 365); since timestamptz; r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  since := now() - make_interval(days => d);
  select jsonb_build_object(
    'days', d,
    'revenue', coalesce((select sum(total) from public.orders where payment_status = 'paid' and status <> 'cancelled' and created_at >= since), 0),
    'orders', (select count(*) from public.orders where created_at >= since),
    'paid_orders', (select count(*) from public.orders where payment_status = 'paid' and status <> 'cancelled' and created_at >= since),
    'by_day', coalesce((select jsonb_agg(jsonb_build_object('d', s.day, 'rev', s.rev, 'n', s.n) order by s.day)
                         from (select (created_at at time zone 'UTC')::date as day,
                                      coalesce(sum(total) filter (where payment_status = 'paid' and status <> 'cancelled'), 0) as rev, count(*) as n
                                 from public.orders where created_at >= since group by 1) s), '[]'::jsonb),
    'top', coalesce((select jsonb_agg(jsonb_build_object('id', t.pid, 'name', t.name, 'qty', t.qty, 'rev', t.rev) order by t.rev desc)
                      from (select it->>'id' as pid, max(it->>'name') as name, sum((it->>'q')::numeric) as qty,
                                   round(sum((it->>'q')::numeric * (it->>'price')::numeric), 2) as rev
                              from public.orders o, jsonb_array_elements(o.items) it
                             where o.payment_status = 'paid' and o.status <> 'cancelled' and o.created_at >= since
                             group by 1 order by 4 desc limit 8) t), '[]'::jsonb),
    'funnel', jsonb_build_object(
      'ref_clicks', (select coalesce(sum(clicks), 0) from public.affiliates),
      'signups', (select count(*) from public.profiles),
      'buyers', (select count(distinct user_id) from public.orders where status <> 'cancelled'),
      'paid_buyers', (select count(distinct user_id) from public.orders where payment_status = 'paid' and status <> 'cancelled')),
    'pending_payouts', (select count(*) from public.payout_requests where status = 'pending'),
    'reviews', jsonb_build_object('count', (select count(*) from public.reviews), 'avg', (select round(avg(rating)::numeric, 1) from public.reviews))
  ) into r;
  return r;
end $$;

create or replace function public.admin_product_stats(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d int := least(greatest(coalesce(p_days, 30), 1), 365); since timestamptz; r jsonb;
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  since := now() - make_interval(days => d);
  select jsonb_build_object(
    'days', d,
    'views', coalesce((select sum(views) from public.product_views where day >= since::date), 0),
    'paid_orders', (select count(*) from public.orders where payment_status = 'paid' and status <> 'cancelled' and created_at >= since),
    'carts_waiting', (select count(*) from public.cart_snapshots where reminded_at is null),
    'carts_reminded', (select count(*) from public.cart_snapshots where reminded_at is not null),
    'rows', coalesce((select jsonb_agg(jsonb_build_object('id', z.pid, 'name', z.name, 'views', z.v, 'orders', z.o, 'conv',
                       case when z.v > 0 then round(z.o::numeric * 100 / z.v, 1) else null end) order by z.v desc, z.o desc)
                        from (select coalesce(a.pid, b.pid) as pid,
                                     coalesce((select coalesce(nullif(x->>'ar', ''), x->>'en') from public.store_config c,
                                               jsonb_array_elements(coalesce(c.data->'products', '[]'::jsonb)) x
                                               where c.id = 1 and x->>'id' = coalesce(a.pid, b.pid) limit 1), coalesce(a.pid, b.pid)) as name,
                                     coalesce(a.v, 0) as v, coalesce(b.o, 0) as o
                                from (select product_id as pid, sum(views) as v from public.product_views where day >= since::date group by 1) a
                                full join (select it->>'id' as pid, count(distinct o.id) as o
                                             from public.orders o, jsonb_array_elements(o.items) it
                                            where jsonb_typeof(o.items) = 'array' and o.payment_status = 'paid' and o.status <> 'cancelled' and o.created_at >= since
                                            group by 1) b on a.pid = b.pid) z), '[]'::jsonb)
  ) into r;
  return r;
end $$;
