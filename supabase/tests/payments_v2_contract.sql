-- Local-only contract test. Run only against a disposable local Supabase database after the schema,
-- supabase-payments.sql and payments restructure migration have been applied.
-- No live project or customer data is modified by this file; assertions are read-only.
do $test$
declare flag boolean; rls boolean; projection jsonb; body text;
begin
  if to_regclass('public.payment_methods') is null or to_regclass('public.payments') is null
     or to_regclass('public.refunds') is null or to_regclass('public.fulfillment_jobs') is null
     or to_regclass('public.affiliate_commissions') is null or to_regclass('public.wallet_transactions') is null then
    raise exception 'payments v2 contract: required tables are missing';
  end if;
  select relrowsecurity into rls from pg_class where oid='public.payments'::regclass;
  if not coalesce(rls,false) then raise exception 'payments RLS must be enabled'; end if;
  select relrowsecurity into rls from pg_class where oid='public.payment_methods'::regclass;
  if not coalesce(rls,false) then raise exception 'payment_methods RLS must be enabled'; end if;
  if has_table_privilege('anon','public.payments','select') then raise exception 'anon must not SELECT payments directly'; end if;
  if has_table_privilege('anon','public.payment_methods','select') then raise exception 'anon must not SELECT payment_methods directly'; end if;
  if not has_table_privilege('authenticated','public.payments','select') then raise exception 'authenticated owner-scoped SELECT grant expected (RLS still applies)'; end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='payments_proof_hash_uq' and indexdef ilike '%UNIQUE%') then
    raise exception 'proof_hash unique index missing'; end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='payments_txref_uq' and indexdef ilike '%UNIQUE%') then
    raise exception 'tx_ref unique index missing'; end if;
  if not exists(select 1 from pg_indexes where schemaname='public' and indexname='refunds_idempotency_uq' and indexdef ilike '%UNIQUE%') then
    raise exception 'refund idempotency index missing'; end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.orders'::regclass and tgname='orders_payment_status_guard_trg' and not tgisinternal) then
    raise exception 'derived order payment status guard trigger missing'; end if;
  if not exists(select 1 from pg_trigger where tgrelid='public.wallet_transactions'::regclass and tgname='wallet_transactions_immutable_trg' and not tgisinternal) then
    raise exception 'immutable wallet ledger trigger missing'; end if;
  select public.payments_v2_on() into flag;
  if coalesce(flag,true) then raise exception 'payments_v2 must remain disabled until owner rollout'; end if;
  projection:=public.payment_methods_public();
  if projection::text ilike '%"acc"%' or projection::text ilike '%"account_number"%' or projection::text ilike '%"secret_key"%' then
    raise exception 'public payment method projection leaks account/secret property names'; end if;
  select pg_get_functiondef('public.payment_instructions(uuid)'::regprocedure) into body;
  if body not ilike '%user_id = auth.uid()%' then raise exception 'payment_instructions must enforce owner scope'; end if;
  if body not ilike '%awaiting_payment%' or body not ilike '%under_review%' then raise exception 'payment_instructions status scope missing'; end if;
  raise notice 'payments v2 contract assertions passed (structural only; concurrency/RLS identity fixtures are separate tests)';
end $test$;
