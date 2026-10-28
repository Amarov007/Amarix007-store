-- =====================================================================
-- AMARIX007 — supabase-payments-migrate.sql  (ترحيل البيانات القديمة إلى payments — يدوي، مرة واحدة)
-- شغّله بعد supabase-payments.sql وقبل تفعيل العلم payments_v2.on. آمن لإعادة التشغيل (لا يكرر شيئاً).
-- يحوّل: الطلبات اليدوية والطلبات المدفوعة بالمحفظة، طلبات شحن المحفظة، ثم يرحّل أرصدة
-- كل الأقسام (smm وغيرها) إلى الرصيد العام main بحركتين في الدفتر (فيبقى مجموع الدفتر = الرصيد).
-- يتوقف كله (rollback تلقائي) إن اختلف مجموع الأرصدة قبل/بعد.
-- لا يلمس orders ولا wallet_topups ولا الدوال القديمة (تبقى للتراجع).
-- =====================================================================

begin;

-- Fail closed instead of silently omitting legacy transactions without a matching payment method.
do $preflight$
begin
  if exists(select 1 from public.orders o left join public.payment_methods m on m.id=o.payment_method
    where o.user_id is not null and coalesce(o.total,0)>0 and o.status<>'cancelled'
      and o.payment_status in ('review','paid') and coalesce(o.payment_method,'')<>'wallet' and m.id is null) then
    raise exception 'payment import blocked: one or more eligible orders have no mapped payment method';
  end if;
  if exists(select 1 from public.wallet_topups t left join public.payment_methods m on m.id=t.payment_method
    where t.user_id is not null and t.amount>0 and m.id is null) then
    raise exception 'payment import blocked: one or more eligible wallet topups have no mapped payment method';
  end if;
end $preflight$;

-- 1) طلبات يدوية قيد المراجعة أو مدفوعة
with ins as (
  insert into public.payments (user_id, purpose, order_id, method_id, amount_base, pay_currency, pay_amount, fx_rate, status,
                               proof_path, idempotency_key, captured_at, created_at, meta)
  select o.user_id, 'order', o.id, m.id, o.total, m.currency,
         public.payment_round(m.currency, o.total * case when m.currency = 'SYP' then public.fx_current() else 1 end),
         case when m.currency = 'SYP' then public.fx_current() else 1 end,
         case when o.payment_status = 'paid' then 'captured' else 'under_review' end,
         nullif(o.payment_proof, ''), 'legacy-' || o.id,
         case when o.payment_status = 'paid' then o.created_at end, o.created_at,
         jsonb_build_object('legacy', true, 'legacy_ref', o.id)
    from public.orders o join public.payment_methods m on m.id = o.payment_method
   where o.user_id is not null and coalesce(o.total, 0) > 0 and o.status <> 'cancelled'
     and o.payment_status in ('review', 'paid')
     and coalesce(o.payment_method,'') <> 'wallet'
     and not exists (select 1 from public.payments p where p.order_id = o.id)
  on conflict (user_id, idempotency_key) do nothing
  returning id, status
)
insert into public.payment_events (payment_id, from_status, to_status, note) select id, null, status, 'backfill' from ins;

-- 1b) الطلبات القديمة المدفوعة بالمحفظة. لا نخصم الرصيد ثانية؛ نربط السجل المالي القديم بالدفعة
-- عبر meta.legacy_ref حتى تطابق payments_reconcile() حركة spend التاريخية (ref = order_id).
with ins as (
  insert into public.payments (user_id, purpose, order_id, method_id, amount_base, pay_currency, pay_amount, fx_rate, status,
                               idempotency_key, captured_at, created_at, meta)
  select o.user_id, 'order', o.id, 'wallet', o.total, 'USD', o.total, 1, 'captured',
         'legacy-wallet-' || o.id, o.created_at, o.created_at,
         jsonb_build_object('legacy', true, 'legacy_ref', o.id, 'legacy_wallet_payment', true)
    from public.orders o
   where o.user_id is not null and coalesce(o.total,0)>0 and o.status<>'cancelled'
     and o.payment_status='paid' and o.payment_method='wallet'
     and not exists(select 1 from public.payments p where p.order_id=o.id)
  on conflict (user_id, idempotency_key) do nothing
  returning id,status
)
insert into public.payment_events(payment_id,from_status,to_status,note)
select id,null,status,'legacy wallet payment backfill; no second debit' from ins;

-- 2) طلبات شحن المحفظة القديمة
with ins as (
  insert into public.payments (user_id, purpose, method_id, amount_base, pay_currency, pay_amount, fx_rate, status, proof_path, proof_hash,
                               tx_ref, idempotency_key, expires_at, captured_at, created_at, reviewed_by, first_reviewed_by, reviewed_at, meta)
  select t.user_id, 'wallet_topup', m.id, t.amount, m.currency,
         public.payment_round(m.currency, t.amount * case when m.currency = 'SYP' then public.fx_current() else 1 end),
         case when m.currency = 'SYP' then public.fx_current() else 1 end,
         case t.status when 'approved' then 'captured' when 'review' then 'under_review' when 'rejected' then 'rejected' else 'awaiting_payment' end,
         nullif(t.payment_proof, ''), t.proof_hash, t.tx_ref, 'legacy-topup-' || t.id,
         case when t.status = 'pending' then now() + interval '24 hours' end,
         case when t.status = 'approved' then coalesce(t.reviewed_at, t.created_at) end, t.created_at,
         t.reviewed_by, t.first_approved_by, t.reviewed_at,
         jsonb_build_object('legacy', true, 'legacy_ref', 'TOPUP-' || t.id, 'legacy_section', t.section)
    from public.wallet_topups t join public.payment_methods m on m.id = t.payment_method
   where t.user_id is not null and t.amount > 0
  on conflict (user_id, idempotency_key) do nothing
  returning id, status
)
insert into public.payment_events (payment_id, from_status, to_status, note) select id, null, status, 'backfill' from ins;

-- 3) ترحيل الأرصدة إلى main بأحداث متعاكسة؛ لا تُعدّل أي حركة تاريخية.
do $mig$
declare before_sum numeric; after_sum numeric; r record; out_ref text; in_ref text; has_out boolean; has_in boolean;
begin
  if exists (select 1 from public.wallets w left join (select user_id,section,sum(amount) ledger from public.wallet_transactions group by 1,2) t
             on t.user_id=w.user_id and t.section=w.section where abs(w.balance-coalesce(t.ledger,0))>0.01) then
    raise exception 'migration blocked: wallet balance and ledger mismatch before migration';
  end if;
  select coalesce(sum(balance),0) into before_sum from public.wallets;
  for r in select user_id,section,balance from public.wallets where section<>'main' and balance<>0 order by user_id,section for update loop
    out_ref:='PAYV2-MIG-OUT|'||r.user_id::text||'|'||r.section;
    in_ref :='PAYV2-MIG-IN|' ||r.user_id::text||'|'||r.section;
    select exists(select 1 from public.wallet_transactions where user_id=r.user_id and ref=out_ref and kind='adjust'),
           exists(select 1 from public.wallet_transactions where user_id=r.user_id and ref=in_ref and kind='adjust') into has_out,has_in;
    if has_out is distinct from has_in then raise exception 'migration blocked: incomplete transfer for user %, section %',r.user_id,r.section; end if;
    if not has_out then
      if r.balance<0 then raise exception 'migration blocked: negative balance'; end if;
      perform public.wallet_apply(r.user_id,r.section,-r.balance,'adjust',out_ref,'payment v2 section consolidation');
      perform public.wallet_apply(r.user_id,'main',r.balance,'adjust',in_ref,'payment v2 section consolidation');
    end if;
  end loop;
  delete from public.wallets where section<>'main' and balance=0;
  if exists(select 1 from public.wallets where section<>'main' and balance<>0) then raise exception 'migration blocked: non-main balance remains'; end if;
  select coalesce(sum(balance),0) into after_sum from public.wallets;
  if before_sum<>after_sum then raise exception 'migration_sum_mismatch % <> %',before_sum,after_sum; end if;
  if exists(select 1 from public.wallets w left join (select user_id,section,sum(amount) ledger from public.wallet_transactions group by 1,2) t on t.user_id=w.user_id and t.section=w.section where abs(w.balance-coalesce(t.ledger,0))>0.01) then
    raise exception 'migration blocked: wallet ledger mismatch after migration'; end if;
  raise notice 'تم الترحيل مع مطابقة مجموع الأرصدة: % قبل وبعد',before_sum,after_sum;
end $mig$;

-- 4) تحقق نهائي (يجب أن يعود فارغاً):  select * from public.payments_reconcile();
--    (نفّذه كأدمن من تطبيق الإدارة/SQL Editor بعد تسجيل الدخول؛ داخل SQL Editor قد يرفض لأن auth.uid() فارغ.)
--    بديل مباشر:  select user_id, section, balance from public.wallets w
--                  where balance <> coalesce((select sum(amount) from public.wallet_transactions x where x.user_id = w.user_id and x.section = w.section), 0);
--
-- 5) تراجع الأرصدة (يدوي، فقط بعد إيقاف payments_v2): انقل من main إلى smm بالطريقة نفسها
--    (حركتان لكل مستخدم: wallet_apply(u,'main',-b,...) ثم wallet_apply(u,'smm',+b,...)) — اطلب مني السكربت الجاهز.
-- Safety: legacy captured payments are NOT auto-enqueued here because those orders may already have been fulfilled.
-- Review legacy paid orders in the admin queue against the existing `orders.smm`/delivery state before replaying any.
-- New v2 captures enqueue automatically through payment_capture_fulfillment_job_trg.

-- Final fail-closed import verification: every eligible non-wallet legacy order has a corresponding v2 payment.
do $verify_import$
declare legacy_orders bigint; v2_orders bigint; legacy_topups bigint; v2_topups bigint;
begin
  if exists(select 1 from public.orders o left join public.payments p on p.order_id=o.id
    where o.user_id is not null and coalesce(o.total,0)>0 and o.status<>'cancelled'
      and o.payment_status in ('review','paid') and p.id is null) then
    raise exception 'payment import verification failed: eligible legacy order missing in v2';
  end if;
  if exists(select 1 from public.wallet_topups t left join public.payments p on p.user_id=t.user_id and p.idempotency_key='legacy-topup-'||t.id::text
    where t.user_id is not null and t.amount>0 and p.id is null) then
    raise exception 'payment import verification failed: legacy topup missing in v2';
  end if;
  select count(*) into legacy_orders from public.orders o
    where o.user_id is not null and coalesce(o.total,0)>0 and o.status<>'cancelled' and o.payment_status in ('review','paid');
  select count(distinct p.order_id) into v2_orders from public.payments p join public.orders o on o.id=p.order_id
    where o.user_id is not null and coalesce(o.total,0)>0 and o.status<>'cancelled' and o.payment_status in ('review','paid');
  if legacy_orders<>v2_orders then raise exception 'payment import order count mismatch: legacy % <> v2 %',legacy_orders,v2_orders; end if;
  select count(*) into legacy_topups from public.wallet_topups where user_id is not null and amount>0;
  select count(*) into v2_topups from public.wallet_topups t join public.payments p
    on p.user_id=t.user_id and p.idempotency_key='legacy-topup-'||t.id::text where t.user_id is not null and t.amount>0;
  if legacy_topups<>v2_topups then raise exception 'payment import topup count mismatch: legacy % <> v2 %',legacy_topups,v2_topups; end if;
end $verify_import$;
commit;
