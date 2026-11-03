-- Immutable pre-wallet-unification snapshot (2026-11-03).
create table if not exists private.amarix_wallet_backup_20261103 (
  backup_id text primary key check (backup_id = 'pre_wallet_main_unification'),
  created_at timestamptz not null default now(),
  snapshot jsonb not null
);
revoke all on table private.amarix_wallet_backup_20261103 from public, anon, authenticated;
insert into private.amarix_wallet_backup_20261103 (backup_id, snapshot)
select 'pre_wallet_main_unification',
       jsonb_build_object(
         'wallets', (select coalesce(jsonb_agg(to_jsonb(w) order by w.user_id,w.section),'[]'::jsonb) from public.wallets w),
         'wallet_transactions', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.wallet_transactions t),
         'wallet_topups', (select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from public.wallet_topups t),
         'store_config_data', (select data from public.store_config where id=1),
         'function_definitions', (select coalesce(jsonb_object_agg(p.proname,pg_get_functiondef(p.oid)),'{}'::jsonb)
           from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname in ('wallet_eligible','wallet_sections','wallet_item_section','wallet_order_section','wallet_topup_create','pay_order_with_wallet','wallet_apply')),
         'column_defaults', (select coalesce(jsonb_object_agg(table_name||'.'||column_name,column_default),'{}'::jsonb)
           from information_schema.columns where table_schema='public'
           and (table_name,column_name) in (('wallets','section'),('wallet_topups','section')))
       )
where not exists (select 1 from private.amarix_wallet_backup_20261103 where backup_id='pre_wallet_main_unification');
