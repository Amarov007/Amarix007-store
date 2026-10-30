-- AMARIX007: checkout retry recovery and pending-payment hygiene
-- Applied to production Supabase project pvuobngrybygohendwaz.
create or replace function public.payment_create(p_order_id text, p_method text, p_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  o public.orders%rowtype;
  m public.payment_methods%rowtype;
  ex public.payments%rowtype;
  rate numeric := 1;
  fee numeric;
  quoted_amount numeric;
  pid uuid;
  exp_min integer;
  r public.payments%rowtype;
  stale record;
begin
  if uid is null then raise exception 'not_allowed'; end if;
  if not public.payments_v2_on() then raise exception 'payments_disabled'; end if;
  if p_key is null or length(p_key) not between 8 and 80 then raise exception 'invalid_key'; end if;
  select * into ex from public.payments where user_id = uid and idempotency_key = p_key;
  if found then
    return jsonb_build_object('id', ex.id, 'status', ex.status, 'pay_amount', ex.pay_amount,
                              'pay_currency', ex.pay_currency, 'expires_at', ex.expires_at, 'replayed', true);
  end if;
  for stale in
    select id from public.payments
    where user_id = uid and status in ('awaiting_payment','proof_submitted') and expires_at < now()
    order by expires_at asc limit 20 for update
  loop
    begin
      perform public.transition_payment(stale.id, 'expired', 'timeout');
    exception when others then null;
    end;
  end loop;
  if not public.rl_hit('paycreate:' || uid::text, 40, 3600) then raise exception 'rate_limited'; end if;
  select * into o from public.orders where id = p_order_id and user_id = uid for update;
  if not found then raise exception 'not_allowed'; end if;
  if o.status = 'cancelled' or coalesce(o.payment_status, 'pending') <> 'pending' or coalesce(o.total, 0) <= 0 then raise exception 'order_not_payable'; end if;
  select * into m from public.payment_methods where id = p_method;
  if not found or not m.enabled or m.kind <> 'manual' then raise exception 'method_disabled'; end if;
  if m.min_base is not null and o.total < m.min_base then raise exception 'below_min'; end if;
  if m.max_base is not null and m.max_base > 0 and o.total > m.max_base then raise exception 'above_max'; end if;
  if exists (select 1 from public.payments where order_id = o.id and status in ('created','awaiting_payment','proof_submitted','under_review','captured','refunded_partially')) then raise exception 'duplicate_active_payment'; end if;
  if (select count(*) from public.payments where user_id = uid and status in ('awaiting_payment','proof_submitted','under_review')) >= 10 then raise exception 'too_many_pending'; end if;
  if m.currency = 'SYP' then rate := public.fx_current(); end if;
  fee := round(o.total * m.fee_pct / 100 + m.fee_fixed, 2);
  quoted_amount := public.payment_round(m.currency, (o.total + fee) * rate);
  if m.min_amount is not null and quoted_amount < m.min_amount then raise exception 'below_min_currency'; end if;
  if m.max_amount is not null and m.max_amount > 0 and quoted_amount > m.max_amount then raise exception 'above_max_currency'; end if;
  exp_min := least(m.expiry_minutes, public.payments_cfg_num('expiry_minutes', m.expiry_minutes)::int);
  insert into public.payments (user_id, purpose, order_id, method_id, amount_base, fee_amount, pay_currency, pay_amount, fx_rate, idempotency_key, expires_at)
  values (uid, 'order', o.id, m.id, o.total, fee, m.currency, quoted_amount, rate, p_key, now() + make_interval(mins => exp_min))
  returning id into pid;
  insert into public.payment_events (payment_id, from_status, to_status, actor, note) values (pid, null, 'created', uid, null);
  r := public.transition_payment(pid, 'awaiting_payment', null);
  update public.orders set payment_method = m.id, pay_currency = m.currency where id = o.id;
  return jsonb_build_object('id', r.id, 'status', r.status, 'pay_amount', r.pay_amount, 'pay_currency', r.pay_currency, 'fx_rate', r.fx_rate, 'expires_at', r.expires_at);
end
$function$;
