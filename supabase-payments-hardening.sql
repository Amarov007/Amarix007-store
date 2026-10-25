-- =====================================================================
-- AMARIX007 — تشديد نظام الدفع والمحافظ (Payments hardening)
-- شغّله مرة واحدة في Supabase > SQL Editor بعد: supabase-schema.sql + supabase-staff.sql + supabase-wallet.sql
-- آمن لإعادة التشغيل أكثر من مرة.
--
-- ما الذي يفعله؟
--  1) حالة دفع جديدة «rejected» (مرفوض) مع سبب يراه العميل، ويستطيع إعادة الرفع (حتى 3 محاولات).
--  2) اعتماد الدفع/رفضه يتم عبر دوال على الخادم فقط (order_payment_approve / order_payment_reject).
--     أي PATCH مباشر على payment_status من المتصفح (أدمن أو موظف) يُرفض.
--  3) رقم العملية (TxID / رقم التحويل) إلزامي عند «تم الدفع»، وبصمة SHA-256 لصورة الإثبات:
--     نفس الرقم أو نفس الصورة لا يمكن استخدامهما في طلبين (طلبات أو شحنات محفظة).
--  4) المبلغ المستلم يُدخله المشرف عند الاعتماد، ويُرفض إن كان أقل من إجمالي الطلب.
--     الموظف لا يعتمد طلبه الشخصي، ولا يعتمد فوق حدّ يحدده الأدمن (store_config.data.pay_policy.staff_max، الافتراضي 100).
--  5) سجل تتبع غير قابل للتعديل (payment_events) يسجّل كل تغيير حالة دفع/طلب/شحن مع الفاعل ودوره.
--     والعميل يرى خط سير طلبه عبر my_payment_timeline() دون أي ملاحظات داخلية.
--  6) دفتر المحفظة غير قابل للتعديل/الحذف، وفهارس فريدة تمنع تكرار الخصم/الاسترجاع/الإيداع للمرجع نفسه.
--  7) لا استرجاع تلقائي إن كان الطلب قد أُرسل فعلاً لموقع الرشق (يُنبَّه الأدمن لقرار يدوي)، ولا يمكن إعادة فتح طلب مُسترجَع.
--  8) شحن المحفظة: السقف عند الموافقة هو المبلغ المطلوب (الزيادة فقط عبر wallet_admin_adjust مع ملاحظة)، ورفض الشحن يحتاج سبباً.
--  9) wallet_reconcile() و payments_audit() لفحص التطابق (أدمن فقط).
--
-- ملاحظة: إن فشل إنشاء فهرس فريد بسبب بيانات قديمة مكرّرة شغّل أولاً:  select public.payments_audit();  (بعد تشغيل هذا الملف دون الفهارس) أو راجع التكرار يدوياً.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) الأعمدة والقيود
-- ---------------------------------------------------------------------
do $$
declare c text;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.orders'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) ilike '%payment_status%' loop
    execute format('alter table public.orders drop constraint %I', c);
  end loop;
end $$;
alter table public.orders add constraint orders_payment_status_check
  check (payment_status is null or payment_status in ('pending','review','paid','rejected'));

alter table public.orders
  add column if not exists payment_ref text,
  add column if not exists proof_hash text,
  add column if not exists paid_amount numeric(14,2),
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by uuid,
  add column if not exists pay_reject_reason text,
  add column if not exists pay_attempts int not null default 0;

alter table public.wallet_topups
  add column if not exists payment_ref text,
  add column if not exists proof_hash text,
  add column if not exists reviewed_by uuid;

-- ---------------------------------------------------------------------
-- 1) سجل التتبع (append-only) + دفتر المحفظة غير قابل للتعديل
-- ---------------------------------------------------------------------
create table if not exists public.payment_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event text not null,                       -- order_created | order_payment_review | order_payment_paid | topup_approved ...
  user_id uuid,                              -- صاحب الطلب/الشحنة
  actor_id uuid,                             -- من نفّذ (null = النظام/لوحة SQL)
  actor_role text,                           -- customer | staff | admin | system
  order_id text,
  topup_id bigint,
  amount numeric(14,2),
  from_status text,
  to_status text,
  note text,                                 -- داخلي (لا يراه العميل)
  public_note text,                          -- يراه العميل (سبب الرفض مثلاً)
  meta jsonb not null default '{}'::jsonb
);
create index if not exists payment_events_order_idx on public.payment_events (order_id, id);
create index if not exists payment_events_topup_idx on public.payment_events (topup_id, id);
create index if not exists payment_events_user_idx  on public.payment_events (user_id, id desc);
create index if not exists payment_events_event_idx on public.payment_events (event, id desc);
alter table public.payment_events enable row level security;
drop policy if exists "payment events staff read" on public.payment_events;
create policy "payment events staff read" on public.payment_events for select to authenticated
  using (public.has_perm('orders'));
-- لا سياسات كتابة: الكتابة عبر الدوال/المحفّزات فقط.

create or replace function public.ledger_immutable() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then raise exception 'ledger_immutable'; end if;
  -- الحذف التتابعي (حذف حساب مستخدم) يمرّ لأنه لا يعمل بدور العميل؛ أي حذف من واجهة العميل مرفوض
  if tg_op = 'DELETE' and current_user in ('authenticated', 'anon', 'service_role') then
    raise exception 'ledger_immutable';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke execute on function public.ledger_immutable() from public, anon, authenticated;

drop trigger if exists payment_events_immutable_trg on public.payment_events;
create trigger payment_events_immutable_trg before update or delete on public.payment_events
  for each row execute function public.ledger_immutable();
drop trigger if exists wallet_tx_immutable_trg on public.wallet_transactions;
create trigger wallet_tx_immutable_trg before update or delete on public.wallet_transactions
  for each row execute function public.ledger_immutable();

-- مرجع واحد = حركة واحدة من كل نوع (الخصم/الاسترجاع/الإيداع لا يتكرر حتى مع سباق الطلبات)
create unique index if not exists wallet_tx_spend_uq  on public.wallet_transactions (ref) where kind = 'spend'  and ref is not null;
create unique index if not exists wallet_tx_refund_uq on public.wallet_transactions (ref) where kind = 'refund' and ref is not null;
create unique index if not exists wallet_tx_topup_uq  on public.wallet_transactions (ref) where kind = 'topup'  and ref is not null;

-- رقم العملية وبصمة الإثبات لا يُستعملان إلا مرة واحدة (ما دام الطلب/الشحنة قيد المراجعة أو معتمداً)
create unique index if not exists orders_payref_uq on public.orders (lower(btrim(payment_ref)))
  where payment_ref is not null and payment_status in ('review','paid');
create unique index if not exists orders_proofhash_uq on public.orders (proof_hash)
  where proof_hash is not null and payment_status in ('review','paid');
create unique index if not exists wallet_topups_payref_uq on public.wallet_topups (lower(btrim(payment_ref)))
  where payment_ref is not null and status in ('review','approved');
create unique index if not exists wallet_topups_proofhash_uq on public.wallet_topups (proof_hash)
  where proof_hash is not null and status in ('review','approved');

-- ---------------------------------------------------------------------
-- 2) دوال مساعدة داخلية
-- ---------------------------------------------------------------------
create or replace function public.pay_actor_role() returns text
language sql stable security definer set search_path = public as $$
  select case
    when auth.uid() is null then 'system'
    when public.is_admin() then 'admin'
    when exists (select 1 from public.staff_members s where s.user_id = auth.uid() and s.active) then 'staff'
    else 'customer' end;
$$;

create or replace function public.pay_log(p_event text, p_user uuid, p_order text, p_topup bigint, p_amount numeric,
                                          p_from text, p_to text, p_note text default null, p_public text default null,
                                          p_meta jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.payment_events (event, user_id, actor_id, actor_role, order_id, topup_id, amount, from_status, to_status, note, public_note, meta)
  values (p_event, p_user, auth.uid(), public.pay_actor_role(), p_order, p_topup, p_amount, p_from, p_to,
          left(p_note, 500), left(p_public, 300), coalesce(p_meta, '{}'::jsonb));
end $$;

-- هل رقم العملية/بصمة الصورة مستعملان في طلب أو شحنة نشطة؟ (يرجع 'ref' أو 'proof' أو null)
create or replace function public.pay_dup_check(p_ref text, p_hash text, p_skip_order text default null, p_skip_topup bigint default null)
returns text
language plpgsql stable security definer set search_path = public as $$
begin
  if coalesce(btrim(p_ref), '') <> '' then
    if exists (select 1 from public.orders where lower(btrim(payment_ref)) = lower(btrim(p_ref))
                and payment_status in ('review','paid') and id is distinct from p_skip_order)
       or exists (select 1 from public.wallet_topups where lower(btrim(payment_ref)) = lower(btrim(p_ref))
                and status in ('review','approved') and id is distinct from p_skip_topup) then
      return 'ref';
    end if;
  end if;
  if coalesce(p_hash, '') <> '' then
    if exists (select 1 from public.orders where proof_hash = p_hash
                and payment_status in ('review','paid') and id is distinct from p_skip_order)
       or exists (select 1 from public.wallet_topups where proof_hash = p_hash
                and status in ('review','approved') and id is distinct from p_skip_topup) then
      return 'proof';
    end if;
  end if;
  return null;
end $$;

create or replace function public.pay_clean_ref(p_ref text) returns text
language sql immutable as $$
  select nullif(left(regexp_replace(btrim(coalesce(p_ref, '')), '[^A-Za-z0-9_.:#/ -]', '', 'g'), 120), '');
$$;

revoke execute on function public.pay_actor_role()                                  from public, anon, authenticated;
revoke execute on function public.pay_log(text, uuid, text, bigint, numeric, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.pay_dup_check(text, text, text, bigint)           from public, anon, authenticated;
revoke execute on function public.pay_clean_ref(text)                               from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) حارس الطلبات: لا تغيير لحالة الدفع/الأعمدة المالية من المتصفح مباشرة
--    (current_user = 'authenticated' يعني PATCH مباشر؛ دوال security definer تعمل بدور المالك فتمرّ)
-- ---------------------------------------------------------------------
create or replace function public.orders_payment_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or current_user <> 'authenticated' then return new; end if;

  if new.payment_status is distinct from old.payment_status then raise exception 'use_payment_rpc'; end if;
  if new.payment_ref  is distinct from old.payment_ref  or new.proof_hash  is distinct from old.proof_hash
     or new.paid_amount is distinct from old.paid_amount or new.paid_at    is distinct from old.paid_at
     or new.paid_by     is distinct from old.paid_by     or new.pay_reject_reason is distinct from old.pay_reject_reason
     or new.pay_attempts is distinct from old.pay_attempts or new.payment_proof is distinct from old.payment_proof then
    raise exception 'use_payment_rpc';
  end if;
  -- بعد الإرسال للمراجعة أو الدفع تُقفل البنود والمبلغ والعميل
  if coalesce(old.payment_status, 'pending') in ('review', 'paid')
     and (new.total is distinct from old.total or new.items is distinct from old.items or new.user_id is distinct from old.user_id
          or new.currency is distinct from old.currency or new.coupon is distinct from old.coupon
          or new.payment_method is distinct from old.payment_method) then
    raise exception 'order_locked';
  end if;
  return new;
end $$;
revoke execute on function public.orders_payment_guard() from public, anon, authenticated;

-- طلب مُسترجَع لا يُعاد فتحه (لأي جهة، حتى الأدمن): يُنشأ طلب جديد بدلاً منه (security definer ليرى الدفتر كاملاً)
create or replace function public.orders_no_reopen_refunded() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'cancelled' and new.status is distinct from 'cancelled'
     and exists (select 1 from public.wallet_transactions where ref = old.id and kind = 'refund') then
    raise exception 'order_refunded';
  end if;
  return new;
end $$;
revoke execute on function public.orders_no_reopen_refunded() from public, anon, authenticated;
drop trigger if exists orders_c_no_reopen_trg on public.orders;
create trigger orders_c_no_reopen_trg before update of status on public.orders
  for each row execute function public.orders_no_reopen_refunded();

drop trigger if exists orders_b_payment_guard_trg on public.orders;
create trigger orders_b_payment_guard_trg before update on public.orders
  for each row execute function public.orders_payment_guard();

-- ---------------------------------------------------------------------
-- 4) سجل تلقائي لا يمكن تجاوزه: كل تغيير حالة دفع/طلب/شحن يُسجَّل
--    (الملاحظات تُمرَّر من الدوال عبر set_config('app.pay_note'/'app.pay_public'))
-- ---------------------------------------------------------------------
create or replace function public.orders_pay_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare nt text := nullif(current_setting('app.pay_note', true), ''); pb text := nullif(current_setting('app.pay_public', true), '');
begin
  if tg_op = 'INSERT' then
    perform public.pay_log('order_created', new.user_id, new.id, null, new.total, null, new.payment_status, null, null,
                           jsonb_build_object('method', new.payment_method, 'items', jsonb_array_length(coalesce(new.items, '[]'::jsonb))));
    return new;
  end if;
  if new.payment_status is distinct from old.payment_status then
    perform public.pay_log('order_payment_' || coalesce(new.payment_status, 'pending'), new.user_id, new.id, null,
                           coalesce(new.paid_amount, new.total), old.payment_status, new.payment_status, nt, pb,
                           jsonb_build_object('method', new.payment_method, 'ref', new.payment_ref, 'attempt', new.pay_attempts));
  end if;
  if new.status is distinct from old.status then
    perform public.pay_log('order_status_' || new.status, new.user_id, new.id, null, new.total, old.status, new.status, nt, null, '{}'::jsonb);
  end if;
  return new;
end $$;
revoke execute on function public.orders_pay_audit() from public, anon, authenticated;
drop trigger if exists orders_pay_audit_ins_trg on public.orders;
create trigger orders_pay_audit_ins_trg after insert on public.orders for each row execute function public.orders_pay_audit();
drop trigger if exists orders_pay_audit_upd_trg on public.orders;
create trigger orders_pay_audit_upd_trg after update of payment_status, status on public.orders for each row execute function public.orders_pay_audit();

create or replace function public.topups_pay_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare nt text := nullif(current_setting('app.pay_note', true), ''); pb text := nullif(current_setting('app.pay_public', true), '');
begin
  if tg_op = 'INSERT' then
    perform public.pay_log('topup_created', new.user_id, null, new.id, new.amount, null, new.status, null, null,
                           jsonb_build_object('method', new.payment_method, 'section', new.section));
    return new;
  end if;
  if new.status is distinct from old.status then
    perform public.pay_log('topup_' || new.status, new.user_id, null, new.id, new.amount, old.status, new.status,
                           coalesce(nt, new.admin_note), coalesce(pb, case when new.status = 'rejected' then new.admin_note end),
                           jsonb_build_object('method', new.payment_method, 'ref', new.payment_ref));
  end if;
  return new;
end $$;
revoke execute on function public.topups_pay_audit() from public, anon, authenticated;
drop trigger if exists topups_pay_audit_ins_trg on public.wallet_topups;
create trigger topups_pay_audit_ins_trg after insert on public.wallet_topups for each row execute function public.topups_pay_audit();
drop trigger if exists topups_pay_audit_upd_trg on public.wallet_topups;
create trigger topups_pay_audit_upd_trg after update of status on public.wallet_topups for each row execute function public.topups_pay_audit();

-- ---------------------------------------------------------------------
-- 5) دوال العميل (طلبات عادية): إثبات + رقم العملية + «تم الدفع»
-- ---------------------------------------------------------------------
drop function if exists public.set_payment_proof(text, text);
create or replace function public.set_payment_proof(p_order_id text, p_path text, p_hash text default null) returns void
language plpgsql security definer set search_path = public as $function$
declare uid uuid := auth.uid(); h text := lower(nullif(btrim(coalesce(p_hash, '')), ''));
begin
  if uid is null then raise exception 'not_allowed'; end if;
  if p_path is null or length(p_path) > 300
     or p_path !~ ('^' || uid::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$') then
    raise exception 'invalid_path';
  end if;
  if h is not null and h !~ '^[a-f0-9]{64}$' then raise exception 'invalid_hash'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'payment-proofs' and name = p_path) then
    raise exception 'proof_missing';
  end if;
  if h is not null and public.pay_dup_check(null, h, p_order_id, null) = 'proof' then raise exception 'duplicate_proof'; end if;
  update public.orders set payment_proof = p_path, proof_hash = h
   where id = p_order_id and user_id = uid
     and coalesce(payment_status, 'pending') in ('pending', 'rejected') and status <> 'cancelled'
     and coalesce(payment_method, '') <> 'wallet';
  if not found then raise exception 'not_allowed'; end if;
end $function$;

create or replace function public.order_payment_claim(p_order_id text, p_ref text default null) returns void
language plpgsql security definer set search_path = public as $function$
declare uid uuid := auth.uid(); o public.orders%rowtype; ref text := public.pay_clean_ref(p_ref); dup text;
begin
  if uid is null then raise exception 'not_allowed'; end if;
  if not public.rl_hit('payclaim:' || uid::text, 20, 3600) then raise exception 'rate_limited'; end if;
  select * into o from public.orders where id = p_order_id and user_id = uid for update;
  if not found then raise exception 'not_allowed'; end if;
  if coalesce(o.payment_status, 'pending') in ('review', 'paid') then return; end if;     -- مكرّر: لا شيء
  if o.status = 'cancelled' or coalesce(o.payment_method, '') = 'wallet' then raise exception 'not_allowed'; end if;
  if coalesce(o.payment_proof, '') = '' then raise exception 'proof_required'; end if;
  if ref is null or length(ref) < 4 then raise exception 'ref_required'; end if;
  if coalesce(o.pay_attempts, 0) >= 3 then raise exception 'too_many_attempts'; end if;
  dup := public.pay_dup_check(ref, o.proof_hash, o.id, null);
  if dup = 'ref' then raise exception 'duplicate_ref'; end if;
  if dup = 'proof' then raise exception 'duplicate_proof'; end if;
  perform set_config('app.pay_note', '', true);
  perform set_config('app.pay_public', '', true);
  update public.orders set payment_status = 'review', payment_ref = ref, pay_attempts = coalesce(pay_attempts, 0) + 1,
         pay_reject_reason = null where id = o.id;
end $function$;

-- النسخة القديمة (بلا رقم عملية) تُرفض صراحةً حتى لا تُستعمل كثغرة من نسخ مخزّنة في الكاش
create or replace function public.claim_payment(p_order_id text) returns void
language plpgsql security definer set search_path = public as $function$
begin
  perform public.order_payment_claim(p_order_id, null);
end $function$;

-- الدفع من المحفظة (نفس منطق supabase-wallet.sql + تسجيل المبلغ والوقت)
create or replace function public.pay_order_with_wallet(p_order_id text) returns jsonb
language plpgsql security definer set search_path = public as $function$
declare uid uuid := auth.uid(); o public.orders%rowtype; cfg jsonb; sec text; bal numeric; nb numeric; nm text;
begin
  if uid is null then raise exception 'not_allowed'; end if;
  if not public.rl_hit('walletpay:' || uid::text, 30, 3600) then raise exception 'rate_limited'; end if;
  select data into cfg from public.store_config where id = 1;
  if coalesce(cfg->'wallet'->>'on', 'true') = 'false' then raise exception 'wallet_disabled'; end if;
  select * into o from public.orders where id = p_order_id and user_id = uid for update;
  if not found then raise exception 'not_allowed'; end if;
  if coalesce(o.payment_status, 'pending') <> 'pending' or o.status = 'cancelled' then raise exception 'not_allowed'; end if;
  if coalesce(o.total, 0) <= 0 then raise exception 'not_allowed'; end if;
  sec := public.wallet_order_section(o.items, cfg);
  if sec is null or not (sec = any (public.wallet_sections(cfg))) then raise exception 'wallet_not_eligible'; end if;
  select balance into bal from public.wallets where user_id = uid and section = sec for update;
  if bal is null or bal < o.total then raise exception 'insufficient_balance'; end if;
  nb := public.wallet_apply(uid, sec, -o.total, 'spend', o.id, null);
  perform set_config('app.pay_note', 'wallet balance after: ' || nb, true);
  perform set_config('app.pay_public', '', true);
  update public.orders set payment_status = 'paid', payment_method = 'wallet', paid_amount = o.total, paid_at = now(), paid_by = null
   where id = o.id;
  select full_name into nm from public.profiles where id = uid;
  perform public.notify_telegram('✅ دُفع من المحفظة ' || o.id || E'\n👤 ' || coalesce(nm, '') || ' (' || coalesce(o.customer_email, '') || ')'
                                 || E'\n💰 ' || o.total || ' USD');
  return jsonb_build_object('balance', nb, 'section', sec);
end $function$;

-- ---------------------------------------------------------------------
-- 6) دوال المشرف/الموظف: اعتماد / رفض الدفع (الطريق الوحيد لتغيير payment_status)
-- ---------------------------------------------------------------------
create or replace function public.order_payment_approve(p_order_id text, p_received numeric, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $function$
declare uid uuid := auth.uid(); o public.orders%rowtype; cfg jsonb; recv numeric := round(coalesce(p_received, 0), 2);
        staff_max numeric; who text; nt text := left(nullif(btrim(coalesce(p_note, '')), ''), 300);
begin
  if uid is null or not public.has_perm('orders') then raise exception 'not_allowed'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'not_found'; end if;
  if o.user_id = uid then raise exception 'self_approval'; end if;
  if o.status = 'cancelled' or coalesce(o.payment_method, '') = 'wallet' then raise exception 'not_allowed'; end if;
  if coalesce(o.payment_status, 'pending') = 'paid' then return jsonb_build_object('already', true); end if;
  -- الاعتماد الطبيعي من «قيد المراجعة». اعتماد طلب لم يُرسل إثباته (دفع نقدي/يدوي) للأدمن فقط وبملاحظة إلزامية
  if coalesce(o.payment_status, 'pending') <> 'review' then
    if not public.is_admin() then raise exception 'not_in_review'; end if;
    if nt is null or length(nt) < 5 then raise exception 'note_required'; end if;
  end if;
  if recv <= 0 or recv > 1000000 then raise exception 'invalid_amount'; end if;
  if recv < round(coalesce(o.total, 0) * 0.995, 2) then raise exception 'underpaid'; end if;
  select data into cfg from public.store_config where id = 1;
  staff_max := coalesce(nullif(cfg->'pay_policy'->>'staff_max', '')::numeric, 100);
  if not public.is_admin() and coalesce(o.total, 0) > staff_max then raise exception 'admin_required'; end if;
  perform set_config('app.pay_note', coalesce(nt, '') || case when recv <> coalesce(o.total, 0) then ' [received ' || recv || ' vs total ' || o.total || ']' else '' end, true);
  perform set_config('app.pay_public', '', true);
  update public.orders set payment_status = 'paid', paid_amount = recv, paid_at = now(), paid_by = uid, pay_reject_reason = null
   where id = o.id;
  select coalesce(full_name, email) into who from public.profiles where id = uid;
  perform public.notify_telegram('✅ اعتماد دفع ' || o.id || E'\n👮 ' || coalesce(who, uid::text) || ' (' || public.pay_actor_role() || ')'
                                 || E'\n💰 المستلم ' || recv || ' من ' || coalesce(o.total, 0) || ' USD'
                                 || case when coalesce(o.payment_ref, '') <> '' then E'\n🔖 ' || o.payment_ref else '' end);
  return jsonb_build_object('ok', true, 'received', recv);
end $function$;

create or replace function public.order_payment_reject(p_order_id text, p_reason text) returns void
language plpgsql security definer set search_path = public as $function$
declare uid uuid := auth.uid(); o public.orders%rowtype; rs text := left(nullif(btrim(coalesce(p_reason, '')), ''), 300); who text;
begin
  if uid is null or not public.has_perm('orders') then raise exception 'not_allowed'; end if;
  if rs is null or length(rs) < 3 then raise exception 'reason_required'; end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then raise exception 'not_found'; end if;
  if o.user_id = uid then raise exception 'self_approval'; end if;
  if coalesce(o.payment_status, 'pending') <> 'review' then raise exception 'not_in_review'; end if;
  perform set_config('app.pay_note', rs, true);
  perform set_config('app.pay_public', rs, true);
  update public.orders set payment_status = 'rejected', pay_reject_reason = rs, paid_amount = null, paid_at = null, paid_by = null
   where id = o.id;
  select coalesce(full_name, email) into who from public.profiles where id = uid;
  perform public.notify_telegram('⛔ رفض دفع ' || o.id || E'\n👮 ' || coalesce(who, uid::text) || E'\n📝 ' || rs);
end $function$;

-- ---------------------------------------------------------------------
-- 7) شحن المحفظة: رقم العملية + بصمة + سقف + أسباب الرفض + سجل
-- ---------------------------------------------------------------------
drop function if exists public.wallet_topup_set_proof(bigint, text);
create or replace function public.wallet_topup_set_proof(p_id bigint, p_path text, p_hash text default null) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); h text := lower(nullif(btrim(coalesce(p_hash, '')), ''));
begin
  if uid is null then raise exception 'not_allowed'; end if;
  if p_path is null or length(p_path) > 300
     or p_path !~ ('^' || uid::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$') then
    raise exception 'invalid_path';
  end if;
  if h is not null and h !~ '^[a-f0-9]{64}$' then raise exception 'invalid_hash'; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'payment-proofs' and name = p_path) then
    raise exception 'proof_missing';
  end if;
  if h is not null and public.pay_dup_check(null, h, null, p_id) = 'proof' then raise exception 'duplicate_proof'; end if;
  update public.wallet_topups set payment_proof = p_path, proof_hash = h
   where id = p_id and user_id = uid and status = 'pending';
  if not found then raise exception 'not_allowed'; end if;
end $$;

drop function if exists public.wallet_topup_claim(bigint);
create or replace function public.wallet_topup_claim(p_id bigint, p_ref text default null) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.wallet_topups%rowtype; nm text; em text; ref text := public.pay_clean_ref(p_ref); dup text;
begin
  if uid is null then raise exception 'not_allowed'; end if;
  select * into r from public.wallet_topups where id = p_id and user_id = uid for update;
  if not found then raise exception 'not_allowed'; end if;
  if r.status in ('review', 'approved') then return; end if;
  if r.status <> 'pending' then raise exception 'not_allowed'; end if;
  if coalesce(r.payment_proof, '') = '' then raise exception 'proof_required'; end if;
  if ref is null or length(ref) < 4 then raise exception 'ref_required'; end if;
  dup := public.pay_dup_check(ref, r.proof_hash, null, r.id);
  if dup = 'ref' then raise exception 'duplicate_ref'; end if;
  if dup = 'proof' then raise exception 'duplicate_proof'; end if;
  perform set_config('app.pay_note', '', true);
  update public.wallet_topups set status = 'review', payment_ref = ref where id = p_id;
  select full_name, email into nm, em from public.profiles where id = uid;
  perform public.notify_telegram('💸 شحن محفظة يحتاج مراجعة #' || p_id || E'\n👤 ' || coalesce(nm, '') || ' (' || coalesce(em, '') || ')'
                                 || E'\n💰 ' || r.amount || ' USD · ' || r.section || E'\n💳 ' || coalesce(r.payment_method, '')
                                 || E'\n🔖 ' || ref || E'\n🧾 إثبات: مرفق');
end $$;

drop function if exists public.wallet_topup_approve(bigint, numeric);
create or replace function public.wallet_topup_approve(p_id bigint, p_amount numeric default null, p_note text default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare r public.wallet_topups%rowtype; amt numeric; nb numeric; who text;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  select * into r from public.wallet_topups where id = p_id for update;
  if not found or r.status <> 'review' then raise exception 'not_in_review'; end if;     -- لا موافقة قبل «تم الدفع» + الإثبات + الرقم
  if r.user_id = auth.uid() then raise exception 'self_approval'; end if;
  if coalesce(r.payment_proof, '') = '' then raise exception 'proof_required'; end if;      -- (رقم العملية يُفرض عند «تم الدفع»؛ الشحنات القديمة قيد المراجعة بلا رقم تبقى قابلة للاعتماد)
  amt := round(coalesce(p_amount, r.amount), 2);
  if amt <= 0 or amt > 100000 then raise exception 'invalid_amount'; end if;
  if amt > r.amount then raise exception 'above_requested'; end if;       -- الزيادة عبر wallet_admin_adjust مع ملاحظة
  nb := public.wallet_apply(r.user_id, r.section, amt, 'topup', 'TOPUP-' || r.id, left(p_note, 300));
  perform set_config('app.pay_note', coalesce(left(p_note, 300), '') || case when amt <> r.amount then ' [requested ' || r.amount || ' credited ' || amt || ']' else '' end, true);
  perform set_config('app.pay_public', '', true);
  update public.wallet_topups set status = 'approved', amount = amt, reviewed_at = now(), reviewed_by = auth.uid(),
         admin_note = coalesce(left(p_note, 300), admin_note) where id = p_id;
  select coalesce(full_name, email) into who from public.profiles where id = auth.uid();
  perform public.notify_telegram('✅ اعتماد شحن محفظة #' || p_id || E'\n👮 ' || coalesce(who, '') || E'\n💰 ' || amt || ' USD → رصيد ' || nb);
  return nb;
end $$;

create or replace function public.wallet_topup_reject(p_id bigint, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare rs text := left(nullif(btrim(coalesce(p_note, '')), ''), 300);
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  if rs is null or length(rs) < 3 then raise exception 'reason_required'; end if;
  perform set_config('app.pay_note', rs, true);
  perform set_config('app.pay_public', rs, true);
  update public.wallet_topups set status = 'rejected', admin_note = rs, reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_id and status in ('pending', 'review');
  if not found then raise exception 'not_allowed'; end if;
end $$;

create or replace function public.wallet_admin_adjust(p_user uuid, p_section text, p_amount numeric, p_note text default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare cfg jsonb; nb numeric; who text;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  select data into cfg from public.store_config where id = 1;
  if not (p_section = any (public.wallet_sections(cfg))) then raise exception 'invalid_section'; end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 100000 then raise exception 'invalid_amount'; end if;
  if p_note is null or length(btrim(p_note)) < 5 then raise exception 'note_required'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'not_allowed'; end if;
  nb := public.wallet_apply(p_user, p_section, round(p_amount, 2), 'adjust', null, p_note);
  perform public.pay_log('wallet_adjust', p_user, null, null, round(p_amount, 2), null, null, p_note, null, jsonb_build_object('section', p_section, 'balance_after', nb));
  select coalesce(full_name, email) into who from public.profiles where id = auth.uid();
  perform public.notify_telegram('🛠 تعديل رصيد يدوي' || E'\n👮 ' || coalesce(who, '') || E'\n💰 ' || round(p_amount, 2) || ' USD · ' || p_section || E'\n📝 ' || left(p_note, 200));
  return nb;
end $$;

-- ---------------------------------------------------------------------
-- 8) الاسترجاع التلقائي عند إلغاء طلب مدفوع من المحفظة — مع حماية من «استلم الخدمة وأخذ المال»
-- ---------------------------------------------------------------------
create or replace function public.orders_wallet_refund() returns trigger
language plpgsql security definer set search_path = public as $$
declare spent numeric; sec text; sent boolean;
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' and new.user_id is not null then
    select -amount, section into spent, sec from public.wallet_transactions
     where ref = new.id and kind = 'spend' order by id desc limit 1;
    if spent is not null and spent > 0
       and not exists (select 1 from public.wallet_transactions where ref = new.id and kind = 'refund') then
      -- أُرسل فعلاً إلى موقع الرشق ولم يفشل؟ لا استرجاع آلي: قرار يدوي من الأدمن (wallet_admin_adjust)
      sent := new.smm is not null and coalesce(new.smm_status, '') <> ''
              and coalesce(new.smm_status, '') !~* '(fail|error|cancel|refund|reject|فشل|ملغ)';
      if sent then
        perform public.pay_log('refund_held', new.user_id, new.id, null, spent, null, null,
                               'order was already sent to SMM provider; manual decision required', null, '{}'::jsonb);
        begin
          perform public.notify_telegram('⚠️ إلغاء طلب أُرسل للمزوّد ولم يُسترجع رصيده تلقائياً ' || new.id || E'\n💰 ' || spent || ' USD' || E'\nراجعه يدوياً (تعديل رصيد مع ملاحظة).');
        exception when others then null; end;
      else
        perform public.wallet_apply(new.user_id, sec, spent, 'refund', new.id, 'cancelled order');
      end if;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.orders_wallet_refund() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 9) خط سير الدفع للعميل (بدون ملاحظات داخلية) + أدوات الفحص للأدمن
-- ---------------------------------------------------------------------
create or replace function public.my_payment_timeline(p_order text default null, p_topup bigint default null)
returns table (created_at timestamptz, event text, to_status text, public_note text, amount numeric)
language sql stable security definer set search_path = public as $$
  select e.created_at, e.event, e.to_status, e.public_note, e.amount
    from public.payment_events e
   where e.user_id = auth.uid()
     and ((p_order is not null and e.order_id = p_order) or (p_topup is not null and e.topup_id = p_topup))
   order by e.id
$$;

create or replace function public.wallet_reconcile()
returns table (user_id uuid, section text, balance numeric, ledger_sum numeric, diff numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  return query
    select w.user_id, w.section, w.balance, coalesce(l.s, 0), w.balance - coalesce(l.s, 0)
      from public.wallets w
      left join (select t.user_id, t.section, sum(t.amount) s from public.wallet_transactions t group by 1, 2) l
        on l.user_id = w.user_id and l.section = w.section
     where w.balance <> coalesce(l.s, 0);
end $$;

create or replace function public.payments_audit() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  return jsonb_build_object(
    'balance_mismatch', (select count(*) from public.wallet_reconcile()),
    'wallet_paid_without_spend', (select coalesce(jsonb_agg(o.id), '[]'::jsonb) from public.orders o
        where o.payment_method = 'wallet' and o.payment_status = 'paid'
          and not exists (select 1 from public.wallet_transactions t where t.ref = o.id and t.kind = 'spend')),
    'spend_without_paid_order', (select coalesce(jsonb_agg(t.ref), '[]'::jsonb) from public.wallet_transactions t
        where t.kind = 'spend' and not exists (select 1 from public.orders o where o.id = t.ref and o.payment_status = 'paid')
          and not exists (select 1 from public.wallet_transactions r where r.ref = t.ref and r.kind = 'refund')),
    'paid_without_amount', (select coalesce(jsonb_agg(o.id), '[]'::jsonb) from public.orders o
        where o.payment_status = 'paid' and o.paid_amount is null and o.created_at > now() - interval '30 days'),
    'paid_below_total', (select coalesce(jsonb_agg(o.id), '[]'::jsonb) from public.orders o
        where o.payment_status = 'paid' and o.paid_amount is not null and o.paid_amount < o.total * 0.995),
    'refund_without_cancel', (select coalesce(jsonb_agg(t.ref), '[]'::jsonb) from public.wallet_transactions t
        where t.kind = 'refund' and not exists (select 1 from public.orders o where o.id = t.ref and o.status = 'cancelled'))
  );
end $$;

-- ---------------------------------------------------------------------
-- 10) الصلاحيات
-- ---------------------------------------------------------------------
revoke execute on function public.set_payment_proof(text, text, text)               from public, anon;
revoke execute on function public.order_payment_claim(text, text)                   from public, anon;
revoke execute on function public.claim_payment(text)                               from public, anon;
revoke execute on function public.pay_order_with_wallet(text)                       from public, anon;
revoke execute on function public.order_payment_approve(text, numeric, text)        from public, anon;
revoke execute on function public.order_payment_reject(text, text)                  from public, anon;
revoke execute on function public.wallet_topup_set_proof(bigint, text, text)        from public, anon;
revoke execute on function public.wallet_topup_claim(bigint, text)                  from public, anon;
revoke execute on function public.wallet_topup_approve(bigint, numeric, text)       from public, anon;
revoke execute on function public.wallet_topup_reject(bigint, text)                 from public, anon;
revoke execute on function public.wallet_admin_adjust(uuid, text, numeric, text)    from public, anon;
revoke execute on function public.my_payment_timeline(text, bigint)                 from public, anon;
revoke execute on function public.wallet_reconcile()                                from public, anon;
revoke execute on function public.payments_audit()                                  from public, anon;

grant execute on function public.set_payment_proof(text, text, text)                to authenticated;
grant execute on function public.order_payment_claim(text, text)                    to authenticated;
grant execute on function public.claim_payment(text)                                to authenticated;
grant execute on function public.pay_order_with_wallet(text)                        to authenticated;
grant execute on function public.order_payment_approve(text, numeric, text)         to authenticated;   -- has_perm('orders') داخلياً
grant execute on function public.order_payment_reject(text, text)                   to authenticated;   -- has_perm('orders') داخلياً
grant execute on function public.wallet_topup_set_proof(bigint, text, text)         to authenticated;
grant execute on function public.wallet_topup_claim(bigint, text)                   to authenticated;
grant execute on function public.wallet_topup_approve(bigint, numeric, text)        to authenticated;   -- is_admin() داخلياً
grant execute on function public.wallet_topup_reject(bigint, text)                  to authenticated;
grant execute on function public.wallet_admin_adjust(uuid, text, numeric, text)     to authenticated;
grant execute on function public.my_payment_timeline(text, bigint)                  to authenticated;
grant execute on function public.wallet_reconcile()                                 to authenticated;   -- is_admin() داخلياً
grant execute on function public.payments_audit()                                   to authenticated;
grant execute on all functions in schema public to service_role;

-- إعادة تحميل مخطط PostgREST ليرى الدوال الجديدة فوراً
notify pgrst, 'reload schema';
