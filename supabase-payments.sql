-- =====================================================================
-- AMARIX007 — supabase-payments.sql  (نظام الدفع الموحّد — المرحلة 1: قاعدة البيانات)
-- مصدر حقيقة واحد للمدفوعات: payments + payment_events (append-only) + refunds، وآلة حالات واحدة.
-- الدفع منفصل عن التنفيذ: هذا الملف لا يعرف شيئاً عن الرشق أو أنواع المنتجات.
-- آمن لإعادة التشغيل. يتطلب: orders, profiles(+uid), wallets, staff, invoices, supabase-payment-lockdown.sql.
-- بعده: شغّل supabase-final-grants.sql (أخيراً). الترحيل في ملف منفصل: supabase-payments-migrate.sql (يدوي).
-- التفعيل خلف علم: store_config.data.payments_v2 = {"on": true, "dual_threshold": 200, "expiry_minutes": 1440}
--   (القرارات الافتراضية: بلا دفع مختلط، بلا رسوم على العميل، استرجاع للمحفظة، سعر SYP يدوي).
-- =====================================================================

-- ---------- صلاحيات الموظفين الجديدة ----------
alter table public.staff_members drop constraint if exists staff_members_perms_valid;
alter table public.staff_members add constraint staff_members_perms_valid check (perms <@ array[
  'orders','tickets','users','products','payments.review','payments.refund','payments.settings']::text[]);

-- ---------- orders.payment_status يقبل refunded ----------
do $c$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.orders'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%payment_status%' loop
    execute format('alter table public.orders drop constraint %I', c.conname);
  end loop;
  alter table public.orders add constraint orders_payment_status_check
    check (payment_status is null or payment_status in ('pending','review','paid','refunded'));
end $c$;

-- ---------- الجداول ----------
create table if not exists public.payment_methods (
  id text primary key check (id ~ '^[a-z0-9_-]{1,40}$'),
  kind text not null default 'manual' check (kind in ('manual','wallet','crypto_auto','gateway')),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3,10}$'),
  enabled boolean not null default true,
  sort integer not null default 0,
  min_base numeric(14,2) check (min_base is null or min_base >= 0),
  max_base numeric(14,2) check (max_base is null or max_base >= 0),
  fee_pct numeric(6,3) not null default 0 check (fee_pct >= 0 and fee_pct <= 100),
  fee_fixed numeric(14,2) not null default 0 check (fee_fixed >= 0),
  requires_proof boolean not null default true,
  expiry_minutes integer not null default 1440 check (expiry_minutes between 5 and 20160),
  confirm_mode text not null default 'manual' check (confirm_mode in ('manual','auto')),
  config jsonb not null default '{}'::jsonb,        -- ar/en/icon/logo/color/da/de (عامة) + acc (سرّي: لا يُكشف إلا بعد إنشاء الدفعة)
  updated_at timestamptz not null default now()
);

create table if not exists public.fx_rates (
  id bigint generated always as identity primary key,
  pair text not null default 'SYP/USDT' check (pair ~ '^[A-Z]{3,10}/[A-Z]{3,10}$'),
  rate numeric(18,6) not null check (rate > 0 and rate < 100000000),
  source text not null default 'manual' check (source in ('manual','api')),
  valid_from timestamptz not null default now(),
  set_by uuid
);
create index if not exists fx_rates_pair_idx on public.fx_rates (pair, valid_from desc, id desc);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references public.profiles(id),
  purpose text not null check (purpose in ('order','wallet_topup')),
  order_id text references public.orders(id),
  method_id text not null references public.payment_methods(id),
  amount_base numeric(14,2) not null check (amount_base > 0 and amount_base < 10000000),   -- USDT، من الخادم فقط
  fee_amount numeric(14,2) not null default 0 check (fee_amount >= 0),
  pay_currency text not null,
  pay_amount numeric(18,2) not null check (pay_amount > 0),
  fx_rate numeric(18,6) not null default 1 check (fx_rate > 0),                              -- لقطة السعر وقت الإنشاء
  status text not null default 'created' check (status in ('created','awaiting_payment','proof_submitted',
    'under_review','captured','rejected','cancelled','expired','refunded_partially','refunded')),
  proof_path text, proof_hash text, tx_ref text, provider_ref text,
  idempotency_key text not null check (length(idempotency_key) between 8 and 80),
  expires_at timestamptz,
  reviewed_by uuid, first_reviewed_by uuid, first_reviewed_at timestamptz, reviewed_at timestamptz,
  reject_reason text, captured_at timestamptz,
  refunded_total numeric(14,2) not null default 0 check (refunded_total >= 0),
  meta jsonb not null default '{}'::jsonb,
  constraint payments_order_needs_id check (purpose <> 'order' or order_id is not null),
  constraint payments_idem_uq unique (user_id, idempotency_key)
);
create index if not exists payments_user_idx   on public.payments (user_id, created_at desc);
create index if not exists payments_status_idx on public.payments (status, created_at desc);
create index if not exists payments_order_idx  on public.payments (order_id);
-- دفعة حيّة واحدة فقط لكل طلب (تمنع الدفع المزدوج)
create unique index if not exists payments_one_live_per_order on public.payments (order_id)
  where order_id is not null and status in ('created','awaiting_payment','proof_submitted','under_review','captured','refunded_partially');
create unique index if not exists payments_proof_hash_uq on public.payments (proof_hash)
  where proof_hash is not null and status not in ('rejected','cancelled','expired');
create unique index if not exists payments_txref_uq on public.payments (lower(tx_ref))
  where tx_ref is not null and status not in ('rejected','cancelled','expired');

create table if not exists public.payment_events (
  id bigint generated always as identity primary key,
  payment_id uuid not null references public.payments(id),
  from_status text, to_status text not null,
  actor uuid, note text,
  created_at timestamptz not null default now()
);
create index if not exists payment_events_pay_idx on public.payment_events (payment_id, id);

create table if not exists public.refunds (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  payment_id uuid not null references public.payments(id),
  amount numeric(14,2) not null check (amount > 0),
  target text not null default 'wallet' check (target in ('wallet')),
  reason text,
  status text not null default 'requested' check (status in ('requested','approved','rejected')),
  requested_by uuid, approved_by uuid, decided_at timestamptz
);
create index if not exists refunds_pay_idx on public.refunds (payment_id);

-- أرصدة المحفظة: تفرّد حركات الدفع/الاسترجاع (idempotency على مستوى الدفتر)
create unique index if not exists wallet_tx_pay_uq on public.wallet_transactions (ref, kind)
  where ref like 'PAY-%' or ref like 'REF-%';

-- ---------- RLS: قراءة فقط ----------
alter table public.payment_methods enable row level security;
alter table public.fx_rates        enable row level security;
alter table public.payments        enable row level security;
alter table public.payment_events  enable row level security;
alter table public.refunds         enable row level security;

drop policy if exists "pm staff read" on public.payment_methods;
create policy "pm staff read" on public.payment_methods for select to authenticated using (public.has_perm('payments.settings'));
drop policy if exists "fx staff read" on public.fx_rates;
create policy "fx staff read" on public.fx_rates for select to authenticated using (public.has_perm('payments.settings') or public.has_perm('payments.review'));
drop policy if exists "payments read own or staff" on public.payments;
create policy "payments read own or staff" on public.payments for select to authenticated
  using (user_id = (select auth.uid()) or public.has_perm('payments.review'));
drop policy if exists "payment events read" on public.payment_events;
create policy "payment events read" on public.payment_events for select to authenticated
  using (public.has_perm('payments.review') or exists (select 1 from public.payments p where p.id = payment_id and p.user_id = (select auth.uid())));
drop policy if exists "refunds read" on public.refunds;
create policy "refunds read" on public.refunds for select to authenticated
  using (public.has_perm('payments.refund') or exists (select 1 from public.payments p where p.id = payment_id and p.user_id = (select auth.uid())));

revoke all on table public.payment_methods, public.fx_rates, public.payments, public.payment_events, public.refunds from anon, authenticated, public;
grant select on table public.payment_methods, public.fx_rates, public.payments, public.payment_events, public.refunds to authenticated;

-- المراجعون يرون الإثباتات (الموظفون بصلاحية orders لديهم سياسة سابقة)
drop policy if exists "payments reviewers proof read" on storage.objects;
create policy "payments reviewers proof read" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and public.has_perm('payments.review'));

-- سجل الأحداث: لا تعديل ولا حذف
create or replace function public.payment_events_immutable() returns trigger
language plpgsql set search_path = public as $function$
begin raise exception 'audit_immutable'; end $function$;
drop trigger if exists payment_events_immutable_trg on public.payment_events;
create trigger payment_events_immutable_trg before update or delete on public.payment_events
  for each row execute function public.payment_events_immutable();

-- ---------- بذر الوسائل من الإعدادات الحالية + المحفظة ----------
insert into public.payment_methods (id, kind, currency, enabled, sort, config)
select m->>'id', 'manual', case when upper(coalesce(m->>'currency','')) ~ '^[A-Z]{3,10}$' then upper(m->>'currency') else 'USD' end,
       coalesce(m->>'on', 'true') <> 'false', t.ord::int, m - 'id' - 'on' - 'currency'
  from public.store_config c, jsonb_array_elements(coalesce(c.data->'payments', '[]'::jsonb)) with ordinality as t(m, ord)
 where c.id = 1 and coalesce(m->>'id', '') ~ '^[a-z0-9_-]{1,40}$'
on conflict (id) do nothing;
insert into public.payment_methods (id, kind, currency, requires_proof, expiry_minutes, config, sort)
values ('wallet', 'wallet', 'USD', false, 5, '{"ar":"المحفظة","en":"Wallet"}'::jsonb, 0)
on conflict (id) do nothing;

-- ---------- دوال مساعدة داخلية (بلا منح) ----------
create or replace function public.payments_v2_on() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (data->'payments_v2'->>'on') = 'true' from public.store_config where id = 1), false);
$$;

create or replace function public.payments_cfg_num(p_key text, p_default numeric) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(data->'payments_v2'->>p_key, '')::numeric from public.store_config where id = 1), p_default);
$$;

-- سعر الصرف الحالي SYP لكل 1 USDT (سجل fx_rates ثم الإعدادات القديمة ثم 140)
create or replace function public.fx_current() returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select rate from public.fx_rates where pair = 'SYP/USDT' order by valid_from desc, id desc limit 1),
    (select nullif(data->'rates'->'SYP'->>0, '')::numeric from public.store_config where id = 1),
    140);
$$;

create or replace function public.payment_round(p_cur text, p_val numeric) returns numeric
language sql immutable set search_path = public as $$
  select case when p_cur = 'SYP' then round(p_val, 0) else round(p_val, 2) end;
$$;

-- جدول الانتقالات المسموحة — يُعرَّف هنا مرة واحدة
create or replace function public.payment_transition_allowed(p_from text, p_to text) returns boolean
language sql immutable set search_path = public as $$
  select (p_from, p_to) in (
    ('created','awaiting_payment'), ('created','cancelled'),
    ('awaiting_payment','proof_submitted'), ('awaiting_payment','captured'),   -- captured: المحفظة/المزوّد الآلي فقط (داخلياً)
    ('awaiting_payment','expired'), ('awaiting_payment','cancelled'),
    ('proof_submitted','under_review'), ('proof_submitted','awaiting_payment'),
    ('proof_submitted','expired'), ('proof_submitted','cancelled'),
    ('under_review','captured'), ('under_review','rejected'),
    ('rejected','awaiting_payment'),
    ('captured','refunded_partially'), ('captured','refunded'),
    ('refunded_partially','refunded_partially'), ('refunded_partially','refunded'));
$$;

-- مزامنة orders.payment_status (مشتق) من أحدث دفعة للطلب
create or replace function public.payment_sync_order(p_order text) returns void
language plpgsql security definer set search_path = public as $function$
declare s text; ns text; prior text;
begin
  if p_order is null then return; end if;
  select status into s from public.payments where order_id=p_order order by created_at desc limit 1;
  if s is null then return; end if;
  ns:=case s when 'captured' then 'paid' when 'refunded_partially' then 'paid' when 'refunded' then 'refunded'
      when 'proof_submitted' then 'review' when 'under_review' then 'review' else 'pending' end;
  prior:=current_setting('amx.payment_sync',true);
  perform set_config('amx.payment_sync','1',true);
  update public.orders set payment_status=ns where id=p_order and payment_status is distinct from ns;
  perform set_config('amx.payment_sync',coalesce(prior,''),true);
exception when others then
  perform set_config('amx.payment_sync',coalesce(prior,''),true);
  raise;
end $function$;

-- الدالة الوحيدة التي تغيّر حالة الدفعة (قفل الصف + التحقق + الحدث + الآثار)
create or replace function public.transition_payment(p_id uuid, p_to text, p_note text default null) returns public.payments
language plpgsql security definer set search_path = public as $function$
declare p public.payments%rowtype; old_status text;
begin
  select * into p from public.payments where id = p_id for update;
  if not found then raise exception 'payment_not_found'; end if;
  old_status := p.status;
  if not public.payment_transition_allowed(p.status, p_to) then raise exception 'invalid_transition'; end if;
  update public.payments
     set status = p_to, updated_at = now(),
         captured_at = case when p_to = 'captured' then now() else captured_at end,
         reject_reason = case when p_to = 'rejected' then left(p_note, 300) else reject_reason end
   where id = p_id returning * into p;
  insert into public.payment_events (payment_id, from_status, to_status, actor, note)
  values (p.id, old_status, p_to, auth.uid(), left(p_note, 300));
  if p_to = 'captured' and p.purpose = 'wallet_topup' then
    perform public.wallet_apply(p.user_id, 'main', p.amount_base, 'topup', 'PAY-' || p.id::text, null);
  end if;
  if p.order_id is not null then perform public.payment_sync_order(p.order_id); end if;
  return p;
end $function$;

-- ---------- دوال العميل ----------
create or replace function public.payment_methods_public() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('fx', public.fx_current(), 'on', public.payments_v2_on(), 'methods',
    coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'currency', currency, 'min_base', min_base,
              'max_base', max_base, 'min_amount',min_amount,'max_amount',max_amount,'fee_pct', fee_pct, 'fee_fixed', fee_fixed, 'requires_proof', requires_proof,
              'expiry_minutes', expiry_minutes, 'config', jsonb_strip_nulls(jsonb_build_object(
                'ar',config->'ar','en',config->'en','icon',config->'icon','logo',config->'logo','logo_url',config->'logo_url',
                'color',config->'color','network',config->'network','memo',config->'memo')) ) order by sort, id)
       from public.payment_methods where enabled), '[]'::jsonb));
$$;

-- إنشاء دفعة لطلب بوسيلة يدوية
create or replace function public.payment_create(p_order_id text, p_method text, p_key text) returns jsonb
language plpgsql security definer set search_path = public as $function$
declare uid uuid := auth.uid(); o public.orders%rowtype; m public.payment_methods%rowtype; ex public.payments%rowtype;
        rate numeric := 1; fee numeric; quoted_amount numeric; pid uuid; exp_min integer; r public.payments%rowtype;
begin
  if uid is null then raise exception 'not_allowed'; end if;
  if not public.payments_v2_on() then raise exception 'payments_disabled'; end if;
  if p_key is null or length(p_key) not between 8 and 80 then raise exception 'invalid_key'; end if;
  select * into ex from public.payments where user_id = uid and idempotency_key = p_key;
  if found then return jsonb_build_object('id', ex.id, 'status', ex.status, 'pay_amount', ex.pay_amount,
                                          'pay_currency', ex.pay_currency, 'expires_at', ex.expires_at, 'replayed', true); end if;
  if not public.rl_hit('paycreate:' || uid::text, 20, 3600) then raise exception 'rate_limited'; end if;
  select * into o from public.orders where id = p_order_id and user_id = uid for update;
  if not found then raise exception 'not_allowed'; end if;
  if o.status = 'cancelled' or coalesce(o.payment_status, 'pending') <> 'pending' or coalesce(o.total, 0) <= 0 then
    raise exception 'order_not_payable';
  end if;
  select * into m from public.payment_methods where id = p_method;
  if not found or not m.enabled or m.kind <> 'manual' then raise exception 'method_disabled'; end if;
  if m.min_base is not null and o.total < m.min_base then raise exception 'below_min'; end if;
  if m.max_base is not null and m.max_base > 0 and o.total > m.max_base then raise exception 'above_max'; end if;
  if exists (select 1 from public.payments where order_id = o.id
              and status in ('created','awaiting_payment','proof_submitted','under_review','captured','refunded_partially')) then
    raise exception 'duplicate_active_payment';
  end if;
  if (select count(*) from public.payments where user_id = uid and status in ('awaiting_payment','proof_submitted','under_review')) >= 5 then
    raise exception 'too_many_pending';
  end if;
  if m.currency = 'SYP' then rate := public.fx_current(); end if;
  fee := round(o.total * m.fee_pct / 100 + m.fee_fixed, 2);
  quoted_amount := public.payment_round(m.currency, (o.total + fee) * rate);
  if m.min_amount is not null and quoted_amount < m.min_amount then raise exception 'below_min_currency'; end if;
  if m.max_amount is not null and m.max_amount > 0 and quoted_amount > m.max_amount then raise exception 'above_max_currency'; end if;
  exp_min := least(m.expiry_minutes, public.payments_cfg_num('expiry_minutes', m.expiry_minutes)::int);
  insert into public.payments (user_id, purpose, order_id, method_id, amount_base, fee_amount, pay_currency, pay_amount, fx_rate,
                               idempotency_key, expires_at)
  values (uid, 'order', o.id, m.id, o.total, fee, m.currency, quoted_amount, rate,
          p_key, now() + make_interval(mins => exp_min))
  returning id into pid;
  insert into public.payment_events (payment_id, from_status, to_status, actor, note) values (pid, null, 'created', uid, null);
  r := public.transition_payment(pid, 'awaiting_payment', null);
  update public.orders set payment_method = m.id, pay_currency = m.currency where id = o.id;
  return jsonb_build_object('id', r.id, 'status', r.status, 'pay_amount', r.pay_amount, 'pay_currency', r.pay_currency,
                            'fx_rate', r.fx_rate, 'expires_at', r.expires_at);
end $function$;

-- الدفع من الرصيد العام (كل أنواع المنتجات)
create or replace function public.payment_create_wallet_pay(p_order_id text, p_key text) returns jsonb
language plpgsql security definer set search_path = public as $function$
declare uid uuid := auth.uid(); o public.orders%rowtype; ex public.payments%rowtype; bal numeric; pid uuid; nb numeric; r public.payments%rowtype;
begin
  if uid is null then raise exception 'not_allowed'; end if;
  if not public.payments_v2_on() then raise exception 'payments_disabled'; end if;
  if coalesce((select data->'wallet'->>'on' from public.store_config where id = 1), 'true') = 'false' then raise exception 'wallet_disabled'; end if;
  if p_key is null or length(p_key) not between 8 and 80 then raise exception 'invalid_key'; end if;
  select * into ex from public.payments where user_id = uid and idempotency_key = p_key;
  if found then return jsonb_build_object('id', ex.id, 'status', ex.status, 'replayed', true); end if;
  if not public.rl_hit('paywallet:' || uid::text, 30, 3600) then raise exception 'rate_limited'; end if;
  select * into o from public.orders where id = p_order_id and user_id = uid for update;
  if not found then raise exception 'not_allowed'; end if;
  if o.status = 'cancelled' or coalesce(o.payment_status, 'pending') <> 'pending' or coalesce(o.total, 0) <= 0 then
    raise exception 'order_not_payable';
  end if;
  if not public.wallet_eligible(o.items) then raise exception 'wallet_not_eligible'; end if;
  if exists (select 1 from public.payments where order_id = o.id
              and status in ('created','awaiting_payment','proof_submitted','under_review','captured','refunded_partially')) then
    raise exception 'duplicate_active_payment';
  end if;
  select balance into bal from public.wallets where user_id = uid and section = 'main' for update;
  if bal is null or bal < o.total then raise exception 'insufficient_balance'; end if;
  insert into public.payments (user_id, purpose, order_id, method_id, amount_base, pay_currency, pay_amount, fx_rate, idempotency_key, expires_at)
  values (uid, 'order', o.id, 'wallet', o.total, 'USD', o.total, 1, p_key, now() + interval '5 minutes') returning id into pid;
  insert into public.payment_events (payment_id, from_status, to_status, actor) values (pid, null, 'created', uid);
  perform public.transition_payment(pid, 'awaiting_payment', null);
  nb := public.wallet_apply(uid, 'main', -o.total, 'spend', 'PAY-' || pid::text, null);
  r := public.transition_payment(pid, 'captured', 'wallet');
  update public.orders set payment_method = 'wallet', pay_currency = 'USD' where id = o.id;
  return jsonb_build_object('id', r.id, 'status', r.status, 'balance', nb);
end $function$;

-- شحن الرصيد العام
create or replace function public.payment_create_topup(p_amount numeric, p_method text, p_key text) returns jsonb
language plpgsql security definer set search_path = public as $function$
declare uid uuid := auth.uid(); cfg jsonb; w jsonb; m public.payment_methods%rowtype; ex public.payments%rowtype;
        amt numeric; mn numeric; mx numeric; dmx numeric; rate numeric := 1; quoted_amount numeric; pid uuid; r public.payments%rowtype; exp_min integer;
begin
  if uid is null then raise exception 'not_allowed'; end if;
  if not public.payments_v2_on() then raise exception 'payments_disabled'; end if;
  if p_key is null or length(p_key) not between 8 and 80 then raise exception 'invalid_key'; end if;
  select * into ex from public.payments where user_id = uid and idempotency_key = p_key;
  if found then return jsonb_build_object('id', ex.id, 'status', ex.status, 'pay_amount', ex.pay_amount,
                                          'pay_currency', ex.pay_currency, 'expires_at', ex.expires_at, 'replayed', true); end if;
  if not public.rl_hit('paytopup:' || uid::text, 10, 3600) then raise exception 'rate_limited'; end if;
  select data into cfg from public.store_config where id = 1;
  w := coalesce(cfg->'wallet', '{}'::jsonb);
  if coalesce(w->>'on', 'true') = 'false' then raise exception 'wallet_disabled'; end if;
  mn := greatest(coalesce(nullif(w->>'min', '')::numeric, 1), 0.5);
  mx := coalesce(nullif(w->>'max', '')::numeric, 1000);
  dmx := coalesce(nullif(w->>'daily_max', '')::numeric, 0);
  amt := round(coalesce(p_amount, 0), 2);
  if amt < mn then raise exception 'below_min'; end if;
  if mx > 0 and amt > mx then raise exception 'above_max'; end if;
  if dmx > 0 and amt + coalesce((select sum(amount_base) from public.payments where user_id = uid and purpose = 'wallet_topup'
        and status not in ('rejected','cancelled','expired') and created_at > now() - interval '24 hours'), 0) > dmx then
    raise exception 'above_daily';
  end if;
  select * into m from public.payment_methods where id = p_method;
  if not found or not m.enabled or m.kind <> 'manual' then raise exception 'method_disabled'; end if;
  if m.min_base is not null and amt < m.min_base then raise exception 'below_min'; end if;
  if m.max_base is not null and m.max_base > 0 and amt > m.max_base then raise exception 'above_max'; end if;
  if (select count(*) from public.payments where user_id = uid and status in ('awaiting_payment','proof_submitted','under_review')) >= 5 then
    raise exception 'too_many_pending';
  end if;
  if m.currency = 'SYP' then rate := public.fx_current(); end if;
  quoted_amount := public.payment_round(m.currency, amt * rate);
  if m.min_amount is not null and quoted_amount < m.min_amount then raise exception 'below_min_currency'; end if;
  if m.max_amount is not null and m.max_amount > 0 and quoted_amount > m.max_amount then raise exception 'above_max_currency'; end if;
  exp_min := least(m.expiry_minutes, public.payments_cfg_num('expiry_minutes', m.expiry_minutes)::int);
  insert into public.payments (user_id, purpose, method_id, amount_base, pay_currency, pay_amount, fx_rate, idempotency_key, expires_at)
  values (uid, 'wallet_topup', m.id, amt, m.currency, quoted_amount, rate, p_key,
          now() + make_interval(mins => exp_min)) returning id into pid;
  insert into public.payment_events (payment_id, from_status, to_status, actor) values (pid, null, 'created', uid);
  r := public.transition_payment(pid, 'awaiting_payment', null);
  return jsonb_build_object('id', r.id, 'status', r.status, 'pay_amount', r.pay_amount, 'pay_currency', r.pay_currency,
                            'fx_rate', r.fx_rate, 'expires_at', r.expires_at);
end $function$;

-- تعليمات الدفع (الحساب) — لصاحب الدفعة وبعد إنشائها فقط
create or replace function public.payment_instructions(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $function$
declare p public.payments%rowtype; m public.payment_methods%rowtype;
begin
  select * into p from public.payments where id = p_id and user_id = auth.uid();
  if not found or p.status not in ('awaiting_payment','proof_submitted','under_review') then raise exception 'not_allowed'; end if;
  select * into m from public.payment_methods where id = p.method_id;
  return jsonb_build_object('id',p.id,'method', m.id, 'acc', m.config->>'acc', 'da', m.config->>'da', 'de', m.config->>'de',
                            'pay_amount', p.pay_amount, 'pay_currency', p.pay_currency, 'amount_base',p.amount_base,'fx_rate',p.fx_rate,
                            'created_at',p.created_at,'expires_at', p.expires_at,'status',p.status,
                            'requires_proof', m.requires_proof,'purpose',p.purpose,'order_id',p.order_id);
end $function$;

-- إرفاق إثبات (ينقل awaiting_payment → proof_submitted، والاستبدال مسموح قبل المراجعة)
-- [moved] public.payment_attach_proof is defined only in supabase/migrations/20261028070000_payments_restructure.sql.


-- «تم الدفع» → قيد المراجعة
create or replace function public.payment_submit(p_id uuid, p_tx_ref text default null) returns void
language plpgsql security definer set search_path = public as $function$
declare uid uuid := auth.uid(); p public.payments%rowtype; m public.payment_methods%rowtype; ref text := nullif(btrim(coalesce(p_tx_ref, '')), '');
        nm text; em text;
begin
  if uid is null then raise exception 'not_allowed'; end if;
  if ref is not null and (length(ref) < 6 or length(ref) > 100 or ref !~ '^[A-Za-z0-9_:.\- ]+$') then raise exception 'invalid_reference'; end if;
  select * into p from public.payments where id = p_id and user_id = uid for update;
  if not found then raise exception 'not_allowed'; end if;
  if p.status in ('under_review','captured') then return; end if;
  select * into m from public.payment_methods where id = p.method_id;
  if p.status = 'awaiting_payment' and not m.requires_proof then
    perform public.transition_payment(p_id, 'proof_submitted', 'no proof required');
    p.status := 'proof_submitted';
  end if;
  if p.status <> 'proof_submitted' then raise exception 'proof_required'; end if;
  if p.expires_at is not null and p.expires_at < now() then raise exception 'payment_expired'; end if;
  begin
    update public.payments set tx_ref = coalesce(ref, tx_ref), updated_at = now() where id = p_id;
  exception when unique_violation then raise exception 'duplicate_reference';
  end;
  perform public.transition_payment(p_id, 'under_review', 'submitted');
  select full_name, email into nm, em from public.profiles where id = uid;
  perform public.notify_telegram('💸 دفعة تحتاج مراجعة ' || left(p_id::text, 8) || E'\n👤 ' || coalesce(nm, '') || ' (' || coalesce(em, '') || ')'
    || E'\n💰 ' || p.amount_base || ' USDT · ' || p.pay_amount || ' ' || p.pay_currency || E'\n💳 ' || p.method_id
    || case when p.order_id is not null then E'\n🧾 ' || p.order_id else E'\n💼 شحن محفظة' end
    || case when coalesce(ref, p.tx_ref) is not null then E'\n🔖 ' || coalesce(ref, p.tx_ref) else '' end);
end $function$;

create or replace function public.payment_cancel(p_id uuid) returns void
language plpgsql security definer set search_path = public as $function$
declare p public.payments%rowtype;
begin
  select * into p from public.payments where id = p_id and user_id = auth.uid() for update;
  if not found or p.status not in ('awaiting_payment','proof_submitted') then raise exception 'not_allowed'; end if;
  perform public.transition_payment(p_id, 'cancelled', 'by customer');
end $function$;

-- ---------- دوال الإدارة ----------
create or replace function public.payment_review_queue(p_status text default 'under_review', p_method text default null,
  p_search text default null, p_limit integer default 50, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $function$
declare q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not public.has_perm('payments.review') then raise exception 'not_allowed'; end if;
  return coalesce((select jsonb_agg(x) from (
    select jsonb_build_object('id', p.id, 'created_at', p.created_at, 'status', p.status, 'purpose', p.purpose, 'order_id', p.order_id,
             'method_id', p.method_id, 'amount_base', p.amount_base, 'pay_amount', p.pay_amount, 'pay_currency', p.pay_currency,
             'fx_rate', p.fx_rate, 'tx_ref', p.tx_ref, 'proof_path', p.proof_path, 'first_reviewed_by', p.first_reviewed_by,
             'email', pr.email, 'uid', pr.uid, 'name', pr.full_name) as x
      from public.payments p join public.profiles pr on pr.id = p.user_id
     where (p_status is null or p.status = p_status) and (p_method is null or p.method_id = p_method)
       and (q is null or lower(p.tx_ref) = lower(q) or pr.uid = q or lower(pr.email) = lower(q))
     order by p.created_at desc limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0)) s), '[]'::jsonb);
end $function$;

-- اعتماد: المبلغ من الخادم فقط (لا معامل مبلغ)، وموافقة مزدوجة فوق العتبة
-- [moved] public.payment_approve is defined only in supabase/migrations/20261028070000_payments_restructure.sql.


create or replace function public.payment_reject(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $function$
declare p public.payments%rowtype;
begin
  if auth.uid() is null or not public.has_perm('payments.review') then raise exception 'not_allowed'; end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'reason_required'; end if;
  select * into p from public.payments where id = p_id for update;
  if not found or p.status <> 'under_review' then raise exception 'payment_not_reviewable'; end if;
  update public.payments set reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  perform public.transition_payment(p_id, 'rejected', p_reason);
  perform public.notify_telegram('❌ رُفضت دفعة ' || left(p_id::text, 8) || ' — ' || left(p_reason, 100));
end $function$;

-- الاسترجاع (للمحفظة فقط حالياً)
create or replace function public.refund_request(p_payment_id uuid, p_amount numeric default null, p_reason text default null) returns bigint
language plpgsql security definer set search_path = public as $function$
declare p public.payments%rowtype; left_amt numeric; amt numeric; rid bigint;
begin
  if auth.uid() is null or not public.has_perm('payments.refund') then raise exception 'not_allowed'; end if;
  select * into p from public.payments where id = p_payment_id for update;
  if not found or p.status not in ('captured','refunded_partially') or p.purpose <> 'order' then raise exception 'not_refundable'; end if;
  left_amt := p.amount_base - p.refunded_total
              - coalesce((select sum(amount) from public.refunds where payment_id = p.id and status = 'requested'), 0);
  amt := round(coalesce(p_amount, left_amt), 2);
  if amt <= 0 or amt > left_amt then raise exception 'above_refundable'; end if;
  insert into public.refunds (payment_id, amount, reason, requested_by) values (p.id, amt, left(p_reason, 300), auth.uid()) returning id into rid;
  return rid;
end $function$;

create or replace function public.refund_approve(p_id bigint) returns numeric
language plpgsql security definer set search_path = public as $function$
declare uid uuid := auth.uid(); rf public.refunds%rowtype; p public.payments%rowtype; nb numeric; thr numeric;
begin
  if uid is null or not public.has_perm('payments.refund') then raise exception 'not_allowed'; end if;
  select * into rf from public.refunds where id = p_id for update;
  if not found or rf.status <> 'requested' then raise exception 'not_allowed'; end if;
  select * into p from public.payments where id = rf.payment_id for update;
  thr := public.payments_cfg_num('dual_threshold', 200);
  if thr > 0 and rf.amount >= thr and rf.requested_by = uid then raise exception 'second_approver_required'; end if;
  if p.status not in ('captured','refunded_partially') or p.refunded_total + rf.amount > p.amount_base then raise exception 'above_refundable'; end if;
  nb := public.wallet_apply(p.user_id, 'main', rf.amount, 'refund', 'REF-' || rf.id::text, 'refund of ' || left(p.id::text, 8));
  update public.refunds set status = 'approved', approved_by = uid, decided_at = now() where id = rf.id;
  update public.payments set refunded_total = refunded_total + rf.amount where id = p.id returning * into p;
  perform public.transition_payment(p.id, case when p.refunded_total >= p.amount_base then 'refunded' else 'refunded_partially' end,
                                    'refund #' || rf.id);
  return nb;
end $function$;

create or replace function public.refund_reject(p_id bigint, p_note text default null) returns void
language plpgsql security definer set search_path = public as $function$
begin
  if auth.uid() is null or not public.has_perm('payments.refund') then raise exception 'not_allowed'; end if;
  update public.refunds set status = 'rejected', approved_by = auth.uid(), decided_at = now(), reason = coalesce(left(p_note, 300), reason)
   where id = p_id and status = 'requested';
  if not found then raise exception 'not_allowed'; end if;
end $function$;

-- مطابقة: كل ما يظهر هنا فرق يحتاج مراجعة (فارغ = سليم)
create or replace function public.payments_reconcile() returns table(kind text, ref text, expected numeric, actual numeric)
language plpgsql stable security definer set search_path = public as $function$
begin
  if not public.has_perm('payments.review') then raise exception 'not_allowed'; end if;
  return query
  select 'wallet_balance'::text, w.user_id::text || ':' || w.section, coalesce(t.s, 0), w.balance
    from public.wallets w left join (select x.user_id, x.section, sum(x.amount) s from public.wallet_transactions x group by 1, 2) t
      on t.user_id = w.user_id and t.section = w.section where w.balance <> coalesce(t.s, 0)
  union all
  select 'topup_credit'::text, p.id::text, p.amount_base,
         coalesce((select sum(x.amount) from public.wallet_transactions x where x.kind = 'topup'
                    and x.ref in ('PAY-' || p.id::text, coalesce(p.meta->>'legacy_ref', '-'))), 0)
    from public.payments p where p.purpose = 'wallet_topup' and p.status in ('captured','refunded_partially','refunded')
     and p.amount_base <> coalesce((select sum(x.amount) from public.wallet_transactions x where x.kind = 'topup'
                    and x.ref in ('PAY-' || p.id::text, coalesce(p.meta->>'legacy_ref', '-'))), 0)
  union all
  select 'wallet_spend'::text, p.id::text, -p.amount_base,
         coalesce((select sum(x.amount) from public.wallet_transactions x where x.kind = 'spend'
                    and x.ref in ('PAY-' || p.id::text, coalesce(p.meta->>'legacy_ref', '-'))), 0)
    from public.payments p where p.purpose = 'order' and p.method_id = 'wallet' and p.status in ('captured','refunded_partially','refunded')
     and -p.amount_base <> coalesce((select sum(x.amount) from public.wallet_transactions x where x.kind = 'spend'
                    and x.ref in ('PAY-' || p.id::text, coalesce(p.meta->>'legacy_ref', '-'))), 0)
  union all
  select 'order_paid_mismatch'::text, o.id, 1, 0
    from public.orders o join public.payments p on p.order_id = o.id
   where p.status in ('captured','refunded_partially') and o.payment_status is distinct from 'paid'
     and p.created_at = (select max(p2.created_at) from public.payments p2 where p2.order_id = o.id);
end $function$;

-- الإعدادات
create or replace function public.payment_settings_save(p_methods jsonb) returns integer
language plpgsql security definer set search_path = public as $function$
declare m jsonb; n integer := 0; mid text; kd text;
begin
  if auth.uid() is null or not public.has_perm('payments.settings') then raise exception 'not_allowed'; end if;
  if jsonb_typeof(p_methods) <> 'array' or jsonb_array_length(p_methods) > 30 then raise exception 'invalid_input'; end if;
  for m in select * from jsonb_array_elements(p_methods) loop
    mid := m->>'id'; kd := coalesce(m->>'kind', 'manual');
    if mid is null or mid !~ '^[a-z0-9_-]{1,40}$' or kd not in ('manual','wallet') then raise exception 'invalid_input'; end if;
    insert into public.payment_methods (id, kind, currency, enabled, sort, min_base, max_base, min_amount, max_amount, fee_pct, fee_fixed, requires_proof, expiry_minutes, config)
    values (mid, kd, upper(coalesce(m->>'currency', 'USD')), coalesce((m->>'enabled')::boolean, true), coalesce((m->>'sort')::int, 0),
            nullif(m->>'min_base', '')::numeric, nullif(m->>'max_base', '')::numeric,
            nullif(m->>'min_amount', '')::numeric, nullif(m->>'max_amount', '')::numeric,
            coalesce(nullif(m->>'fee_pct', '')::numeric, 0), coalesce(nullif(m->>'fee_fixed', '')::numeric, 0),
            coalesce((m->>'requires_proof')::boolean, true), coalesce(nullif(m->>'expiry_minutes', '')::int, 1440),
            case when jsonb_typeof(m->'config') = 'object' then m->'config' else '{}'::jsonb end)
    on conflict (id) do update set kind = excluded.kind, currency = excluded.currency, enabled = excluded.enabled, sort = excluded.sort,
      min_base = excluded.min_base, max_base = excluded.max_base, min_amount = excluded.min_amount, max_amount = excluded.max_amount, fee_pct = excluded.fee_pct, fee_fixed = excluded.fee_fixed,
      requires_proof = excluded.requires_proof, expiry_minutes = excluded.expiry_minutes, config = excluded.config, updated_at = now();
    n := n + 1;
  end loop;
  return n;
end $function$;

create or replace function public.fx_rate_set(p_pair text, p_rate numeric) returns bigint
language plpgsql security definer set search_path = public as $function$
declare nid bigint;
begin
  if auth.uid() is null or not public.has_perm('payments.settings') then raise exception 'not_allowed'; end if;
  if p_pair is distinct from 'SYP/USDT' or p_rate is null or p_rate <= 0 or p_rate >= 100000000 then raise exception 'invalid_input'; end if;
  insert into public.fx_rates (pair, rate, source, set_by) values (p_pair, round(p_rate, 6), 'manual', auth.uid()) returning id into nid;
  return nid;
end $function$;

-- ---------- دوال خلفية (cron / تريغرات) — بلا منح ----------
create or replace function public.payments_expire() returns integer
language plpgsql security definer set search_path = public as $function$
declare r record; n integer := 0;
begin
  for r in select id from public.payments where status in ('awaiting_payment','proof_submitted') and expires_at < now() limit 200 loop
    begin
      perform public.transition_payment(r.id, 'expired', 'timeout'); n := n + 1;
    exception when others then null;   -- فشل آمن: تُترك للدورة التالية
    end;
  end loop;
  return n;
end $function$;

-- Cancellation refund is ledger-backed and defaults to the customer's main wallet for all payment methods.
create or replace function public.payment_on_order_cancel() returns trigger
language plpgsql security definer set search_path = public as $function$
declare p public.payments%rowtype; rem numeric; rid bigint; ik text;
begin
  if new.status='cancelled' and old.status is distinct from 'cancelled' then
    for p in select * from public.payments where order_id=new.id and status in ('awaiting_payment','proof_submitted','under_review') for update loop
      perform public.transition_payment(p.id,'cancelled','order cancelled before capture');
    end loop;
    for p in select * from public.payments where order_id=new.id and status in ('captured','refunded_partially') for update loop
      rem:=greatest(0,round(p.amount_base-p.refunded_total,2));
      ik:='cancel:'||p.id::text;
      if rem>0 and not exists(select 1 from public.refunds where payment_id=p.id and reason='order cancelled' and status='approved') then
        insert into public.refunds(payment_id,amount,target,reason,status,requested_by,approved_by,decided_at,idempotency_key)
        values(p.id,rem,'wallet','order cancelled','requested',auth.uid(),null,null,ik)
        on conflict(idempotency_key) where idempotency_key is not null do nothing returning id into rid;
        if rid is not null then
          perform public.wallet_apply(p.user_id,'main',rem,'refund','REF-'||rid::text,'order cancelled');
          update public.refunds set status='approved',approved_by=auth.uid(),decided_at=now() where id=rid;
          update public.payments set refunded_total=refunded_total+rem,updated_at=now() where id=p.id;
          perform public.transition_payment(p.id,'refunded','order cancelled');
        end if;
      end if;
    end loop;
  end if;
  return null;
end $function$;
drop trigger if exists orders_payment_cancel_trg on public.orders;
create trigger orders_payment_cancel_trg after update of status on public.orders
  for each row execute function public.payment_on_order_cancel();

-- pg_cron: انتهاء الدفعات المعلّقة كل 5 دقائق (إن كان الامتداد مفعّلاً)
do $cron$
begin
  perform cron.unschedule('amarix-payments-expire');
exception when others then null;
end $cron$;
do $cron$
begin
  perform cron.schedule('amarix-payments-expire', '*/5 * * * *', 'select public.payments_expire()');
exception when others then raise notice 'pg_cron غير مفعّل: فعّله من Database > Extensions ثم أعد تشغيل هذا المقطع';
end $cron$;
