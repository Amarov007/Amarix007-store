-- =====================================================================
-- Rollback: wallet_unify_main_corrected_20261103
-- Reverses section naming while preserving the current total funds and ledger.
-- Any wallet activity created after migration is also moved back to "smm".
-- =====================================================================

do $$
begin
  if to_regclass('private.amarix_wallet_backup_20261103') is null
     or not exists (select 1 from private.amarix_wallet_backup_20261103
                    where backup_id = 'pre_wallet_main_unification') then
    raise exception 'wallet_backup_missing';
  end if;
end $$;

insert into public.wallets (user_id, section, balance, updated_at)
select user_id, 'smm', balance, updated_at
from public.wallets
where section = 'main'
on conflict (user_id, section) do update
set balance = public.wallets.balance + excluded.balance,
    updated_at = greatest(public.wallets.updated_at, excluded.updated_at);

delete from public.wallets where section = 'main';
update public.wallet_transactions set section = 'smm' where section = 'main';
update public.wallet_topups set section = 'smm' where section = 'main';

do $$
declare
  definitions jsonb;
  defaults jsonb;
  fn record;
  expr text;
begin
  select snapshot->'function_definitions', snapshot->'column_defaults'
    into definitions, defaults
  from private.amarix_wallet_backup_20261103
  where backup_id = 'pre_wallet_main_unification';

  for fn in select key, value from jsonb_each_text(definitions) loop
    execute fn.value;
  end loop;

  expr := defaults->>'wallets.section';
  if expr is null then
    alter table public.wallets alter column section drop default;
  else
    execute 'alter table public.wallets alter column section set default ' || expr;
  end if;

  expr := defaults->>'wallet_topups.section';
  if expr is null then
    alter table public.wallet_topups alter column section drop default;
  else
    execute 'alter table public.wallet_topups alter column section set default ' || expr;
  end if;
end $$;
