-- =====================================================================
-- Migration: 20261101000000_wallet_unify_main.sql
-- توحيد المحفظة على قسم واحد 'main' وجعل wallet_eligible المصدر الوحيد للأهلية
-- Idempotent: آمن لإعادة التشغيل أكثر من مرة
-- =====================================================================

-- 1) تحديث القيم الافتراضية للجداول لتكون 'main'
alter table if exists public.wallets alter column section set default 'main';
alter table if exists public.wallet_topups alter column section set default 'main';

-- 2) ترحيل أي صفوف سابقة بقسم 'smm' إلى 'main' بأمان مع دمج الأرصدة
insert into public.wallets (user_id, section, balance, updated_at)
select user_id, 'main', balance, updated_at
from public.wallets where section = 'smm'
on conflict (user_id, section) do update
set balance = public.wallets.balance + excluded.balance,
    updated_at = greatest(public.wallets.updated_at, excluded.updated_at);

delete from public.wallets where section = 'smm';

update public.wallet_transactions set section = 'main' where section = 'smm';
update public.wallet_topups set section = 'main' where section = 'smm';

-- 3) دالة الأقسام المسموحة: الافتراضي 'main' بدلاً من 'smm'
create or replace function public.wallet_sections(cfg jsonb) returns text[]
language sql stable set search_path = public as $$
  select coalesce(
    (select array_agg(x) from jsonb_array_elements_text(
       case when jsonb_typeof(cfg->'wallet'->'sections') = 'array' then cfg->'wallet'->'sections' else '[]'::jsonb end) x
      where x ~ '^[a-z0-9_]{2,30}$'),
    array['main']);
$$;

-- 4) دالة قسم المنتج: إرجاع 'main' لأي منتج صالح بدلاً من حصرها بالرشق
create or replace function public.wallet_item_section(p jsonb, cfg jsonb) returns text
language sql stable set search_path = public as $$
  select case
    when p is null then null
    when p->>'id' is null or btrim(p->>'id') = '' then null
    else 'main'
  end;
$$;

-- 5) دالة قسم الطلب كاملاً: إرجاع 'main'
create or replace function public.wallet_order_section(items jsonb, cfg jsonb) returns text
language plpgsql stable set search_path = public as $$
declare it jsonb; p jsonb; s text; first_s text;
begin
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then return null; end if;
  for it in select * from jsonb_array_elements(items) loop
    select x into p from jsonb_array_elements(coalesce(cfg->'products', '[]'::jsonb)) x where x->>'id' = it->>'id' limit 1;
    s := public.wallet_item_section(p, cfg);
    if s is null then return null; end if;
    if first_s is null then first_s := s; elsif first_s <> s then return null; end if;
  end loop;
  return coalesce(first_s, 'main');
end $$;

-- 6) دالة التحقق من الأهلية: المصدر الوحيد للأهلية
create or replace function public.wallet_eligible(p_items jsonb) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  cfg jsonb;
  sec text;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return false;
  end if;
  select data into cfg from public.store_config where id = 1;
  if coalesce(cfg->'wallet'->>'on', 'true') = 'false' then
    return false;
  end if;
  sec := public.wallet_order_section(p_items, cfg);
  return sec is not null and sec = any(public.wallet_sections(cfg));
end $$;

-- 7) دالة إنشاء طلب شحن: الافتراضي 'main'
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
declare uid uuid := auth.uid(); cfg jsonb; w jsonb; mn numeric; mx numeric; dmx numeric; amt numeric; nid bigint; nm text; em text;
begin
  if uid is null then raise exception 'not_allowed'; end if;
  if not public.rl_hit('wtopup:' || uid::text, 10, 3600) then raise exception 'rate_limited'; end if;
  select data into cfg from public.store_config where id = 1;
  w := coalesce(cfg->'wallet', '{}'::jsonb);
  if coalesce(w->>'on', 'true') = 'false' then raise exception 'wallet_disabled'; end if;
  if not (p_section = any (public.wallet_sections(cfg))) then raise exception 'invalid_section'; end if;
  mn := greatest(coalesce(nullif(w->>'min', '')::numeric, 1), 0.5);
  mx := coalesce(nullif(w->>'max', '')::numeric, 1000);
  dmx := coalesce(nullif(w->>'daily_max', '')::numeric, 0);
  amt := round(coalesce(p_amount, 0), 2);
  if amt < mn then raise exception 'below_min'; end if;
  if mx > 0 and amt > mx then raise exception 'above_max'; end if;
  if dmx > 0 and amt + coalesce((select sum(amount) from public.wallet_topups
        where user_id = uid and status <> 'rejected' and created_at > now() - interval '24 hours'), 0) > dmx then
    raise exception 'above_daily';
  end if;
  if p_method is null or not exists (
       select 1 from jsonb_array_elements(coalesce(cfg->'payments', '[]'::jsonb)) m
        where m->>'id' = p_method and coalesce(m->>'on', 'true') <> 'false') then
    raise exception 'invalid_method';
  end if;
  if (select count(*) from public.wallet_topups where user_id = uid and status in ('pending','review')) >= 5 then
    raise exception 'too_many_pending';
  end if;
  insert into public.wallet_topups (user_id, section, amount, payment_method, pay_currency)
  values (uid, p_section, amt, p_method,
          case when upper(coalesce(p_currency, '')) ~ '^[A-Z]{3,10}$' then upper(p_currency) else null end)
  returning id into nid;
  select full_name, email into nm, em from public.profiles where id = uid;
  perform public.notify_telegram('💼 طلب شحن محفظة #' || nid || E'\n👤 ' || coalesce(nm, '') || ' (' || coalesce(em, '') || ')'
                                 || E'\n💰 ' || amt || ' USD · ' || p_section || E'\n💳 ' || p_method);
  return nid;
end $function$;
