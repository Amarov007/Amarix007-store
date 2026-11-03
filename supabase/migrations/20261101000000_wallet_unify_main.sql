-- =====================================================================
-- Migration: wallet_unify_main_corrected_20261103
-- Consolidate all wallet funds and records into the single "main" section.
-- Preserves the live wallet_eligible authentication and 1..50 item guards.
-- Requires the verified pre-migration snapshot in private.amarix_wallet_backup_20261103.
-- =====================================================================

do $$
begin
  if to_regclass('private.amarix_wallet_backup_20261103') is null
     or not exists (select 1 from private.amarix_wallet_backup_20261103
                    where backup_id = 'pre_wallet_main_unification') then
    raise exception 'wallet_backup_missing';
  end if;
  if not exists (select 1 from public.store_config where id = 1) then
    raise exception 'store_config_missing';
  end if;
  if public.payments_v2_on() is distinct from false then
    raise exception 'payments_v2_must_remain_disabled';
  end if;
end $;

-- Freeze all wallet writes while taking the in-transaction total guard and migrating.
lock table public.wallets, public.wallet_transactions, public.wallet_topups in access exclusive mode;
create temporary table wallet_main_total_guard (total numeric not null) on commit drop;
insert into wallet_main_total_guard select coalesce(sum(balance), 0) from public.wallets;

alter table public.wallets alter column section set default 'main';
alter table public.wallet_topups alter column section set default 'main';

-- Transfer, rather than duplicate, old section balances. The DELETE below
-- makes this data operation idempotent and the unique key protects one row/user.
insert into public.wallets (user_id, section, balance, updated_at)
select user_id, 'main', balance, updated_at
from public.wallets
where section = 'smm'
on conflict (user_id, section) do update
set balance = public.wallets.balance + excluded.balance,
    updated_at = greatest(public.wallets.updated_at, excluded.updated_at);

delete from public.wallets where section = 'smm';
update public.wallet_transactions set section = 'main' where section = 'smm';
update public.wallet_topups set section = 'main' where section = 'smm';

-- This installation intentionally uses one wallet section only.
create or replace function public.wallet_sections(cfg jsonb)
returns text[]
language sql stable
set search_path = public
as $$
  select array['main']::text[];
$$;

create or replace function public.wallet_item_section(p jsonb, cfg jsonb)
returns text
language sql stable
set search_path = public
as $$
  select case
    when jsonb_typeof(p) <> 'object' then null
    when nullif(btrim(p->>'id'), '') is null then null
    else 'main'
  end;
$$;

create or replace function public.wallet_order_section(items jsonb, cfg jsonb)
returns text
language plpgsql stable
set search_path = public
as $function$
declare
  it jsonb;
  product jsonb;
  section_name text;
begin
  if items is null or jsonb_typeof(items) <> 'array' then return null; end if;
  if jsonb_array_length(items) < 1 or jsonb_array_length(items) > 50 then return null; end if;
  if cfg is null or jsonb_typeof(cfg->'products') <> 'array' then return null; end if;

  for it in select value from jsonb_array_elements(items) loop
    if jsonb_typeof(it) <> 'object' or nullif(btrim(it->>'id'), '') is null then
      return null;
    end if;

    product := null;
    select x into product
    from jsonb_array_elements(cfg->'products') x
    where x->>'id' = it->>'id'
    limit 1;

    section_name := public.wallet_item_section(product, cfg);
    if section_name is distinct from 'main' then return null; end if;
  end loop;

  return 'main';
end
$function$;

-- Preserve the live security contract: signed-in user, valid JSON objects,
-- and a hard 1..50 item bound. CREATE OR REPLACE retains existing ACLs.
create or replace function public.wallet_eligible(p_items jsonb)
returns boolean
language plpgsql stable security definer
set search_path = public
as $function$
declare
  cfg jsonb;
  item jsonb;
  item_count integer;
  section_name text;
begin
  if auth.uid() is null then return false; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then return false; end if;

  item_count := jsonb_array_length(p_items);
  if item_count < 1 or item_count > 50 then return false; end if;

  for item in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(item) <> 'object'
       or nullif(btrim(item->>'id'), '') is null then
      return false;
    end if;
  end loop;

  select data into cfg from public.store_config where id = 1;
  if cfg is null or coalesce(cfg->'wallet'->>'on', 'true') = 'false' then
    return false;
  end if;

  section_name := public.wallet_order_section(p_items, cfg);
  return section_name = any(public.wallet_sections(cfg));
end
$function$;

create or replace function public.wallet_topup_create(
  p_amount numeric,
  p_method text,
  p_currency text default null::text,
  p_section text default 'main'::text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
  cfg jsonb;
  w jsonb;
  mn numeric;
  mx numeric;
  dmx numeric;
  amt numeric;
  nid bigint;
  nm text;
  em text;
begin
  if uid is null then raise exception 'not_allowed'; end if;
  if not public.rl_hit('wtopup:' || uid::text, 10, 3600) then raise exception 'rate_limited'; end if;

  select data into cfg from public.store_config where id = 1;
  w := coalesce(cfg->'wallet', '{}'::jsonb);
  if coalesce(w->>'on', 'true') = 'false' then raise exception 'wallet_disabled'; end if;
  if coalesce(p_section, '') <> 'main' then raise exception 'invalid_section'; end if;

  mn := greatest(coalesce(nullif(w->>'min', '')::numeric, 1), 0.5);
  mx := coalesce(nullif(w->>'max', '')::numeric, 1000);
  dmx := coalesce(nullif(w->>'daily_max', '')::numeric, 0);
  amt := round(coalesce(p_amount, 0), 2);

  if amt < mn then raise exception 'below_min'; end if;
  if mx > 0 and amt > mx then raise exception 'above_max'; end if;
  if dmx > 0 and amt + coalesce((
    select sum(amount) from public.wallet_topups
    where user_id = uid and status <> 'rejected'
      and created_at > now() - interval '24 hours'
  ), 0) > dmx then
    raise exception 'above_daily';
  end if;

  if p_method is null or not exists (
    select 1 from jsonb_array_elements(coalesce(cfg->'payments', '[]'::jsonb)) m
    where m->>'id' = p_method and coalesce(m->>'on', 'true') <> 'false'
  ) then
    raise exception 'invalid_method';
  end if;

  if (select count(*) from public.wallet_topups
      where user_id = uid and status in ('pending','review')) >= 5 then
    raise exception 'too_many_pending';
  end if;

  insert into public.wallet_topups (user_id, section, amount, payment_method, pay_currency)
  values (
    uid, 'main', amt, p_method,
    case when upper(coalesce(p_currency, '')) ~ '^[A-Z]{3,10}$'
         then upper(p_currency) else null end
  )
  returning id into nid;

  select full_name, email into nm, em from public.profiles where id = uid;
  perform public.notify_telegram(
    '💼 طلب شحن محفظة #' || nid || E'\n👤 ' || coalesce(nm, '') ||
    ' (' || coalesce(em, '') || ')' ||
    E'\n💰 ' || amt || ' USD · main' || E'\n💳 ' || p_method
  );
  return nid;
end
$function$;

do $$
declare
  current_total numeric;
  smm_rows bigint;
begin
  select coalesce(sum(balance), 0) into current_total from public.wallets;
  select count(*) into smm_rows from public.wallets where section = 'smm';
  if smm_rows <> 0 then raise exception 'wallet_smm_rows_remain'; end if;
  if current_total <> (select total from pg_temp.wallet_main_total_guard) then
    raise exception 'wallet_total_changed_during_migration';
  end if;
  if public.payments_v2_on() is distinct from false then
    raise exception 'payments_v2_invariant_failed';
  end if;
end $$;
