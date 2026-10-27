-- =====================================================================
-- AMARIX007 — supabase-payments-migrate.sql  (ترحيل البيانات القديمة إلى payments — يدوي، مرة واحدة)
-- شغّله بعد supabase-payments.sql وقبل تفعيل العلم payments_v2.on. آمن لإعادة التشغيل (لا يكرر شيئاً).
-- يحوّل: الطلبات اليدوية قيد المراجعة/المدفوعة، طلبات الدفع بالمحفظة، طلبات شحن المحفظة، ثم يرحّل أرصدة
-- كل الأقسام (smm وغيرها) إلى الرصيد العام main بحركتين في الدفتر (فيبقى مجموع الدفتر = الرصيد).
-- يتوقف كله (rollback تلقائي) إن اختلف مجموع الأرصدة قبل/بعد.
-- لا يلمس orders ولا wallet_topups ولا الدوال القديمة (تبقى للتراجع).
-- =====================================================================

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
     and not exists (select 1 from public.payments p where p.order_id = o.id)
  on conflict (user_id, idempotency_key) do nothing
  returning id, status
)
insert into public.payment_events (payment_id, from_status, to_status, note) select id, null, status, 'backfill' from ins;

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

-- 3) ترحيل الأرصدة إلى الرصيد العام main (ذرّي، مع مطابقة المجموع)
do $mig$
declare before_sum numeric; after_sum numeric; r record;
begin
  select coalesce(sum(balance), 0) into before_sum from public.wallets;
  for r in select user_id, section, balance from public.wallets where section <> 'main' and balance > 0 for update loop
    perform public.wallet_apply(r.user_id, r.section, -r.balance, 'adjust', 'MIGRATE-OUT-' || r.section, 'migrate to main');
    perform public.wallet_apply(r.user_id, 'main', r.balance, 'adjust', 'MIGRATE-IN-' || r.section, 'migrate from ' || r.section);
  end loop;
  select coalesce(sum(balance), 0) into after_sum from public.wallets;
  if before_sum <> after_sum then raise exception 'migration_sum_mismatch % <> %', before_sum, after_sum; end if;
  raise notice 'تم الترحيل: مجموع الأرصدة % قبل وبعد', before_sum;
end $mig$;

-- 4) تحقق نهائي (يجب أن يعود فارغاً):  select * from public.payments_reconcile();
--    (نفّذه كأدمن من تطبيق الإدارة/SQL Editor بعد تسجيل الدخول؛ داخل SQL Editor قد يرفض لأن auth.uid() فارغ.)
--    بديل مباشر:  select user_id, section, balance from public.wallets w
--                  where balance <> coalesce((select sum(amount) from public.wallet_transactions x where x.user_id = w.user_id and x.section = w.section), 0);
--
-- 5) تراجع الأرصدة (يدوي، فقط بعد إيقاف payments_v2): انقل من main إلى smm بالطريقة نفسها
--    (حركتان لكل مستخدم: wallet_apply(u,'main',-b,...) ثم wallet_apply(u,'smm',+b,...)) — اطلب مني السكربت الجاهز.
