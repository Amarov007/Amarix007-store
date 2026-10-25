-- مطبّق على القاعدة الحية بتاريخ 2026-10-25
-- A) harden_wallet_and_new_table_grants
revoke all on table public.wallets, public.wallet_transactions, public.wallet_topups from anon, authenticated, public;
grant select on table public.wallets, public.wallet_transactions, public.wallet_topups to authenticated;
revoke truncate, trigger, references on table public.affiliate_tiers, public.smm_providers, public.staff_members from anon, authenticated;

-- B) wallet_daily_cap_reconcile_default_privs
-- (1) wallet_topup_create مع سقف يومي اختياري wallet.daily_max:
--     أضيف داخل الدالة:  dmx := coalesce(nullif(w->>'daily_max','')::numeric, 0);
--     if dmx > 0 and amt + coalesce((select sum(amount) from public.wallet_topups
--         where user_id = uid and status <> 'rejected' and created_at > now() - interval '24 hours'), 0) > dmx
--       then raise exception 'above_daily'; end if;
-- (2) public.wallet_reconcile() — للمدير فقط، تُرجع أي محفظة يختلف رصيدها عن مجموع الحركات.
-- (3) alter default privileges in schema public revoke all on tables/sequences from anon, authenticated;
-- للتعريفات الكاملة شغّل: supabase db pull
