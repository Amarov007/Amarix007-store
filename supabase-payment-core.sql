-- =====================================================================
-- AMARIX007 — Payment Core
-- توحيد مراجعة الدفعات اليدوية للطلبات وشحن المحفظة في طبقة واحدة.
-- شغّله بعد supabase-wallet.sql وآمن لإعادة التشغيل.
-- =====================================================================

create table if not exists public.payment_requests (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  scope text not null check (scope in ('order', 'wallet_topup')),
  scope_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(14,2) not null default 0,
  currency text,
  section text,
  payment_method text,
  pay_currency text,
  payment_proof text,
  proof_hash text,
  tx_ref text,
  status text not null default 'pending' check (status in ('pending', 'review', 'approved', 'rejected')),
  admin_note text,
  reviewed_at timestamptz,
  reviewed_by uuid,
  first_approved_by uuid,
  first_approved_at timestamptz,
  unique (scope, scope_id)
);

create index if not exists payment_requests_user_idx
  on public.payment_requests (user_id, created_at desc);
create index if not exists payment_requests_scope_status_idx
  on public.payment_requests (scope, status, created_at desc);
create unique index if not exists payment_requests_proof_hash_uq
  on public.payment_requests (proof_hash)
  where proof_hash is not null and status <> 'rejected';
create unique index if not exists payment_requests_tx_ref_uq
  on public.payment_requests (lower(tx_ref))
  where tx_ref is not null and status <> 'rejected';

alter table public.payment_requests enable row level security;
revoke all on public.payment_requests from anon, authenticated;
grant select on public.payment_requests to authenticated;

drop policy if exists "payment requests read own or admin" on public.payment_requests;
create policy "payment requests read own or admin" on public.payment_requests for select to authenticated
  using (public.is_admin() or user_id = (select auth.uid()));

create or replace function public.payment_requests_touch_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists payment_requests_touch_updated_at_trg on public.payment_requests;
create trigger payment_requests_touch_updated_at_trg
before update on public.payment_requests
for each row execute function public.payment_requests_touch_updated_at();

create or replace function public.payment_request_status_from_order(p_payment_status text) returns text
language sql immutable set search_path = public as $$
  select case
    when p_payment_status = 'paid' then 'approved'
    when p_payment_status = 'review' then 'review'
    else 'pending'
  end
$$;

create or replace function public.payment_request_status_from_topup(p_status text) returns text
language sql immutable set search_path = public as $$
  select case
    when p_status = 'approved' then 'approved'
    when p_status = 'rejected' then 'rejected'
    when p_status = 'review' then 'review'
    else 'pending'
  end
$$;

create or replace function public.payment_request_validate_ref(p_tx_ref text) returns text
language plpgsql immutable set search_path = public as $$
declare ref text := nullif(btrim(coalesce(p_tx_ref, '')), '');
begin
  if ref is not null and (length(ref) < 6 or length(ref) > 100 or ref !~ '^[A-Za-z0-9_:.\\- ]+$') then
    raise exception 'invalid_reference';
  end if;
  return ref;
end $$;

create or replace function public.sync_payment_request_order(p_order_id text) returns bigint
language plpgsql security definer set search_path = public as $$
declare o public.orders%rowtype; rid bigint;
begin
  select * into o from public.orders where id = p_order_id;
  if not found then
    delete from public.payment_requests where scope = 'order' and scope_id = p_order_id;
    return null;
  end if;

  if o.user_id is null or coalesce(o.payment_method, '') = 'wallet' then
    delete from public.payment_requests where scope = 'order' and scope_id = o.id;
    return null;
  end if;

  insert into public.payment_requests (
    scope, scope_id, user_id, amount, currency, payment_method, pay_currency,
    payment_proof, status
  )
  values (
    'order', o.id, o.user_id, round(coalesce(o.total, 0), 2), o.currency, o.payment_method,
    case when upper(coalesce(o.pay_currency, '')) ~ '^[A-Z]{3,10}$' then upper(o.pay_currency) else null end,
    o.payment_proof, public.payment_request_status_from_order(coalesce(o.payment_status, 'pending'))
  )
  on conflict (scope, scope_id) do update
    set user_id = excluded.user_id,
        amount = excluded.amount,
        currency = excluded.currency,
        payment_method = excluded.payment_method,
        pay_currency = excluded.pay_currency,
        payment_proof = excluded.payment_proof,
        status = excluded.status
  returning id into rid;

  return rid;
end $$;

create or replace function public.sync_payment_request_wallet_topup(p_id bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare r public.wallet_topups%rowtype; rid bigint;
begin
  select * into r from public.wallet_topups where id = p_id;
  if not found then
    delete from public.payment_requests where scope = 'wallet_topup' and scope_id = p_id::text;
    return null;
  end if;

  insert into public.payment_requests (
    scope, scope_id, user_id, amount, currency, section, payment_method, pay_currency,
    payment_proof, proof_hash, tx_ref, status, admin_note, reviewed_at, reviewed_by,
    first_approved_by, first_approved_at
  )
  values (
    'wallet_topup', r.id::text, r.user_id, round(coalesce(r.amount, 0), 2), 'USD', r.section,
    r.payment_method, case when upper(coalesce(r.pay_currency, '')) ~ '^[A-Z]{3,10}$' then upper(r.pay_currency) else null end,
    r.payment_proof, r.proof_hash, r.tx_ref, public.payment_request_status_from_topup(r.status), r.admin_note,
    r.reviewed_at, r.reviewed_by, r.first_approved_by, r.first_approved_at
  )
  on conflict (scope, scope_id) do update
    set user_id = excluded.user_id,
        amount = excluded.amount,
        currency = excluded.currency,
        section = excluded.section,
        payment_method = excluded.payment_method,
        pay_currency = excluded.pay_currency,
        payment_proof = excluded.payment_proof,
        proof_hash = excluded.proof_hash,
        tx_ref = excluded.tx_ref,
        status = excluded.status,
        admin_note = excluded.admin_note,
        reviewed_at = excluded.reviewed_at,
        reviewed_by = excluded.reviewed_by,
        first_approved_by = excluded.first_approved_by,
        first_approved_at = excluded.first_approved_at
  returning id into rid;

  return rid;
end $$;

create or replace function public.orders_payment_request_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_payment_request_order(new.id);
  return new;
end $$;

drop trigger if exists orders_payment_request_sync_trg on public.orders;
create trigger orders_payment_request_sync_trg
after insert or update of user_id, total, currency, pay_currency, payment_method, payment_status, payment_proof, status
on public.orders
for each row execute function public.orders_payment_request_sync();

create or replace function public.wallet_topups_payment_request_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.sync_payment_request_wallet_topup(new.id);
  return new;
end $$;

drop trigger if exists wallet_topups_payment_request_sync_trg on public.wallet_topups;
create trigger wallet_topups_payment_request_sync_trg
after insert or update of amount, section, payment_method, pay_currency, payment_proof, proof_hash, tx_ref,
  status, admin_note, reviewed_at, reviewed_by, first_approved_by, first_approved_at
on public.wallet_topups
for each row execute function public.wallet_topups_payment_request_sync();

insert into public.payment_requests (
  scope, scope_id, user_id, amount, currency, payment_method, pay_currency, payment_proof, status
)
select 'order', o.id, o.user_id, round(coalesce(o.total, 0), 2), o.currency, o.payment_method,
       case when upper(coalesce(o.pay_currency, '')) ~ '^[A-Z]{3,10}$' then upper(o.pay_currency) else null end,
       o.payment_proof, public.payment_request_status_from_order(coalesce(o.payment_status, 'pending'))
  from public.orders o
 where o.user_id is not null and coalesce(o.payment_method, '') <> 'wallet'
on conflict (scope, scope_id) do update
  set user_id = excluded.user_id,
      amount = excluded.amount,
      currency = excluded.currency,
      payment_method = excluded.payment_method,
      pay_currency = excluded.pay_currency,
      payment_proof = excluded.payment_proof,
      status = excluded.status;

insert into public.payment_requests (
  scope, scope_id, user_id, amount, currency, section, payment_method, pay_currency,
  payment_proof, proof_hash, tx_ref, status, admin_note, reviewed_at, reviewed_by,
  first_approved_by, first_approved_at
)
select 'wallet_topup', wt.id::text, wt.user_id, round(coalesce(wt.amount, 0), 2), 'USD', wt.section, wt.payment_method,
       case when upper(coalesce(wt.pay_currency, '')) ~ '^[A-Z]{3,10}$' then upper(wt.pay_currency) else null end,
       wt.payment_proof, wt.proof_hash, wt.tx_ref, public.payment_request_status_from_topup(wt.status), wt.admin_note,
       wt.reviewed_at, wt.reviewed_by, wt.first_approved_by, wt.first_approved_at
  from public.wallet_topups wt
on conflict (scope, scope_id) do update
  set user_id = excluded.user_id,
      amount = excluded.amount,
      currency = excluded.currency,
      section = excluded.section,
      payment_method = excluded.payment_method,
      pay_currency = excluded.pay_currency,
      payment_proof = excluded.payment_proof,
      proof_hash = excluded.proof_hash,
      tx_ref = excluded.tx_ref,
      status = excluded.status,
      admin_note = excluded.admin_note,
      reviewed_at = excluded.reviewed_at,
      reviewed_by = excluded.reviewed_by,
      first_approved_by = excluded.first_approved_by,
      first_approved_at = excluded.first_approved_at;

delete from public.payment_requests
 where scope = 'order'
   and exists (
     select 1 from public.orders o
      where o.id = payment_requests.scope_id
        and (o.user_id is null or coalesce(o.payment_method, '') = 'wallet')
   );

drop function if exists public.set_payment_proof(text, text);
create or replace function public.set_payment_proof(p_order_id text, p_path text, p_hash text default null) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); rid bigint;
begin
  if uid is null then raise exception 'not_allowed'; end if;
  if p_path is null or length(p_path) > 300
     or p_path !~ ('^' || uid::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$') then
    raise exception 'invalid_path';
  end if;
  if p_hash is not null and p_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid_path';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'payment-proofs' and name = p_path) then
    raise exception 'proof_missing';
  end if;

  update public.orders
     set payment_proof = p_path
   where id = p_order_id and user_id = uid
     and coalesce(payment_status, 'pending') = 'pending'
     and status <> 'cancelled'
     and coalesce(payment_method, '') <> 'wallet';
  if not found then raise exception 'not_allowed'; end if;

  rid := public.sync_payment_request_order(p_order_id);
  begin
    update public.payment_requests
       set payment_proof = p_path,
           proof_hash = coalesce(p_hash, proof_hash)
     where id = rid and user_id = uid;
  exception when unique_violation then
    raise exception 'duplicate_proof';
  end;
end $$;

drop function if exists public.claim_payment(text);
create or replace function public.claim_payment(p_order_id text, p_tx_ref text default null) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); ref text; rid bigint;
begin
  if uid is null then raise exception 'not_allowed'; end if;
  ref := public.payment_request_validate_ref(p_tx_ref);

  update public.orders
     set payment_status = 'review'
   where id = p_order_id and user_id = uid
     and coalesce(payment_status, 'pending') = 'pending'
     and status <> 'cancelled'
     and payment_proof is not null and payment_proof <> ''
     and coalesce(payment_method, '') <> 'wallet';
  if not found then
    if exists (
      select 1 from public.orders
       where id = p_order_id and user_id = uid
         and payment_status in ('review', 'paid')
    ) then
      return;
    end if;
    if exists (
      select 1 from public.orders
       where id = p_order_id and user_id = uid
         and coalesce(payment_status, 'pending') = 'pending'
         and status <> 'cancelled'
         and coalesce(payment_method, '') <> 'wallet'
    ) then
      raise exception 'proof_required';
    end if;
    raise exception 'not_allowed';
  end if;

  rid := public.sync_payment_request_order(p_order_id);
  begin
    update public.payment_requests
       set status = 'review',
           tx_ref = coalesce(ref, tx_ref)
     where id = rid and user_id = uid;
  exception when unique_violation then
    raise exception 'duplicate_reference';
  end;
end $$;

create or replace function public.approve_manual_payment(
  p_order_id text,
  p_confirmation text,
  p_tx_ref text default null,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  o public.orders%rowtype;
  rid bigint;
  ref text;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  ref := public.payment_request_validate_ref(p_tx_ref);

  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if coalesce(o.payment_method, '') = 'wallet' then raise exception 'payment_not_reviewable'; end if;
  if coalesce(o.payment_proof, '') = '' then raise exception 'payment_proof_required'; end if;
  if coalesce(o.payment_status, 'pending') = 'paid' then
    return jsonb_build_object('order_id', o.id, 'status', 'approved', 'already', true);
  end if;
  if coalesce(o.payment_status, 'pending') <> 'review' then raise exception 'payment_not_reviewable'; end if;
  if coalesce(p_confirmation, '') <> ('VERIFY-' || right(o.id, 8)) then raise exception 'confirmation_failed'; end if;

  rid := public.sync_payment_request_order(o.id);
  begin
    update public.payment_requests
       set status = 'approved',
           tx_ref = coalesce(ref, tx_ref),
           admin_note = left(nullif(btrim(coalesce(p_note, '')), ''), 300),
           reviewed_at = now(),
           reviewed_by = uid
     where id = rid;
  exception when unique_violation then
    raise exception 'duplicate_reference';
  end;

  update public.orders
     set payment_status = 'paid',
         payment_proof = coalesce(payment_proof, (select payment_proof from public.payment_requests where id = rid))
   where id = o.id;

  return jsonb_build_object('order_id', o.id, 'status', 'approved');
end $$;

create or replace function public.wallet_topup_set_proof(p_id bigint, p_path text, p_hash text default null) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); rid bigint;
begin
  if uid is null then raise exception 'not_allowed'; end if;
  if p_path is null or length(p_path) > 300
     or p_path !~ ('^' || uid::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$') then
    raise exception 'invalid_path';
  end if;
  if p_hash is not null and p_hash !~ '^[a-f0-9]{64}$' then raise exception 'invalid_path'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'payment-proofs' and name = p_path) then
    raise exception 'proof_missing';
  end if;

  begin
    update public.wallet_topups
       set payment_proof = p_path,
           proof_hash = p_hash
     where id = p_id and user_id = uid and status = 'pending';
  exception when unique_violation then
    raise exception 'duplicate_proof';
  end;
  if not found then raise exception 'not_allowed'; end if;

  rid := public.sync_payment_request_wallet_topup(p_id);
  begin
    update public.payment_requests
       set payment_proof = p_path,
           proof_hash = p_hash
     where id = rid and user_id = uid;
  exception when unique_violation then
    raise exception 'duplicate_proof';
  end;
end $$;

create or replace function public.wallet_topup_claim(p_id bigint, p_tx_ref text default null) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.wallet_topups%rowtype; nm text; em text; ref text; rid bigint;
begin
  if uid is null then raise exception 'not_allowed'; end if;
  ref := public.payment_request_validate_ref(p_tx_ref);

  select * into r from public.wallet_topups where id = p_id and user_id = uid for update;
  if not found then raise exception 'not_allowed'; end if;
  if r.status in ('review', 'approved') then return; end if;
  if r.status <> 'pending' then raise exception 'not_allowed'; end if;
  if coalesce(r.payment_proof, '') = '' then raise exception 'proof_required'; end if;

  begin
    update public.wallet_topups
       set status = 'review',
           tx_ref = coalesce(ref, tx_ref)
     where id = p_id;
  exception when unique_violation then
    raise exception 'duplicate_reference';
  end;

  rid := public.sync_payment_request_wallet_topup(p_id);
  begin
    update public.payment_requests
       set status = 'review',
           tx_ref = coalesce(ref, tx_ref)
     where id = rid;
  exception when unique_violation then
    raise exception 'duplicate_reference';
  end;

  select full_name, email into nm, em from public.profiles where id = uid;
  perform public.notify_telegram(
    '💸 شحن محفظة يحتاج مراجعة #' || p_id || E'\n👤 ' || coalesce(nm, '') || ' (' || coalesce(em, '') || ')'
    || E'\n💰 ' || r.amount || ' USD · ' || r.section || E'\n💳 ' || coalesce(r.payment_method, '')
    || E'\n🧾 إثبات: مرفق'
    || case when coalesce(ref, r.tx_ref) is not null then E'\n🔖 رقم العملية: ' || coalesce(ref, r.tx_ref) else '' end
  );
end $$;

create or replace function public.wallet_topup_approve(p_id bigint, p_amount numeric default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  r public.wallet_topups%rowtype;
  rid bigint;
  amt numeric;
  nb numeric;
  cfg jsonb;
  thr numeric;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;

  select * into r from public.wallet_topups where id = p_id for update;
  if not found or r.status not in ('pending', 'review') then raise exception 'not_allowed'; end if;
  if coalesce(r.payment_proof, '') = '' then raise exception 'proof_required'; end if;
  amt := round(coalesce(p_amount, r.amount), 2);
  if amt <= 0 or amt > 100000 then raise exception 'invalid_amount'; end if;

  rid := public.sync_payment_request_wallet_topup(p_id);
  select data into cfg from public.store_config where id = 1;
  thr := coalesce(nullif(cfg->'wallet'->>'dual_threshold', '')::numeric, 0);

  if thr > 0 and amt >= thr then
    if r.first_approved_by is null then
      update public.wallet_topups
         set first_approved_by = uid,
             first_approved_at = now(),
             status = 'review'
       where id = p_id;
      update public.payment_requests
         set first_approved_by = uid,
             first_approved_at = now(),
             status = 'review'
       where id = rid;
      perform public.notify_telegram('🕒 موافقة أولى على شحن #' || p_id || ' بمبلغ ' || amt || ' USD — بانتظار أدمن ثانٍ');
      return -1;
    elsif r.first_approved_by = uid then
      raise exception 'second_approver_required';
    end if;
  end if;

  nb := public.wallet_apply(r.user_id, r.section, amt, 'topup', 'TOPUP-' || r.id, null);
  update public.wallet_topups
     set status = 'approved',
         amount = amt,
         reviewed_at = now(),
         reviewed_by = uid
   where id = p_id;
  update public.payment_requests
     set status = 'approved',
         amount = amt,
         reviewed_at = now(),
         reviewed_by = uid
   where id = rid;
  return nb;
end $$;

create or replace function public.wallet_topup_reject(p_id bigint, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare rid bigint;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;

  update public.wallet_topups
     set status = 'rejected',
         admin_note = left(p_note, 300),
         reviewed_at = now(),
         reviewed_by = auth.uid()
   where id = p_id and status in ('pending', 'review');
  if not found then raise exception 'not_allowed'; end if;

  rid := public.sync_payment_request_wallet_topup(p_id);
  update public.payment_requests
     set status = 'rejected',
         admin_note = left(p_note, 300),
         reviewed_at = now(),
         reviewed_by = auth.uid()
   where id = rid;
end $$;

revoke execute on function public.payment_requests_touch_updated_at() from public, anon, authenticated;
revoke execute on function public.payment_request_status_from_order(text) from public, anon, authenticated;
revoke execute on function public.payment_request_status_from_topup(text) from public, anon, authenticated;
revoke execute on function public.payment_request_validate_ref(text) from public, anon, authenticated;
revoke execute on function public.sync_payment_request_order(text) from public, anon, authenticated;
revoke execute on function public.sync_payment_request_wallet_topup(bigint) from public, anon, authenticated;
revoke execute on function public.orders_payment_request_sync() from public, anon, authenticated;
revoke execute on function public.wallet_topups_payment_request_sync() from public, anon, authenticated;
revoke execute on function public.set_payment_proof(text, text, text) from public, anon;
revoke execute on function public.claim_payment(text, text) from public, anon;
revoke execute on function public.approve_manual_payment(text, text, text, text) from public, anon;
revoke execute on function public.wallet_topup_set_proof(bigint, text, text) from public, anon;
revoke execute on function public.wallet_topup_claim(bigint, text) from public, anon;
revoke execute on function public.wallet_topup_approve(bigint, numeric) from public, anon;
revoke execute on function public.wallet_topup_reject(bigint, text) from public, anon;

grant execute on function public.set_payment_proof(text, text, text) to authenticated;
grant execute on function public.claim_payment(text, text) to authenticated;
grant execute on function public.approve_manual_payment(text, text, text, text) to authenticated;
grant execute on function public.wallet_topup_set_proof(bigint, text, text) to authenticated;
grant execute on function public.wallet_topup_claim(bigint, text) to authenticated;
grant execute on function public.wallet_topup_approve(bigint, numeric) to authenticated;
grant execute on function public.wallet_topup_reject(bigint, text) to authenticated;
grant execute on all functions in schema public to service_role;
