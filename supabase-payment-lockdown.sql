-- =====================================================================
-- AMARIX007 — supabase-payment-lockdown.sql  (إصلاح عاجل مستقل، قبل نظام الدفع الجديد)
-- يسدّ: تغيير payment_status مباشرة بـ PATCH من الموظف/الأدمن (يتجاوز الإثبات ورمز VERIFY والتدقيق).
-- آمن لإعادة التشغيل. شغّله بعد supabase-invoices.sql وقبل supabase-final-grants.sql.
--
-- ⚠ قبل التشغيل على القاعدة الحية: دالة approve_manual_payment كانت غير معرّفة في المستودع.
--   إن كانت لديك نسخة حية، اقرأها أولاً:
--     select pg_get_functiondef('public.approve_manual_payment(text,text,text,text)'::regprocedure);
--   وقارنها بالتعريف أدناه؛ هذا الملف يستبدلها بنسخة موثّقة في المستودع.
-- =====================================================================

-- ---------- 1) سجل تدقيق append-only لتغيّرات حالة الدفع ----------
create table if not exists public.order_payment_audit (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  order_id text not null,
  from_status text,
  to_status text,
  actor uuid,
  via text not null default 'function',   -- direct | rpc | function
  tx_ref text,
  note text
);
create index if not exists order_payment_audit_order_idx on public.order_payment_audit (order_id, created_at desc);

alter table public.order_payment_audit enable row level security;
drop policy if exists "payment audit read" on public.order_payment_audit;
create policy "payment audit read" on public.order_payment_audit for select to authenticated
  using (public.is_admin() or public.has_perm('orders'));
revoke all on table public.order_payment_audit from anon, authenticated, public;
grant select on table public.order_payment_audit to authenticated;

create or replace function public.order_payment_audit_immutable() returns trigger
language plpgsql set search_path = public as $function$
begin
  raise exception 'audit_immutable';
end $function$;
drop trigger if exists order_payment_audit_immutable_trg on public.order_payment_audit;
create trigger order_payment_audit_immutable_trg before update or delete on public.order_payment_audit
  for each row execute function public.order_payment_audit_immutable();

-- ---------- 2) حارس: ممنوع تغيير payment_status مباشرة من REST ----------
-- الدالة SECURITY INVOKER عمداً: داخل دوال security definer يكون current_user = مالك الدالة (يمرّ)،
-- أما طلب REST مباشر فيكون current_user = authenticated/anon (يُرفض).
create or replace function public.orders_payment_guard() returns trigger
language plpgsql set search_path = public as $function$
begin
  if new.payment_status is distinct from old.payment_status and current_user in ('authenticated', 'anon') then
    if new.payment_status = 'paid' then
      raise exception 'payment_direct_paid_forbidden';        -- الاعتماد حصراً عبر approve_manual_payment
    end if;
    if old.payment_status = 'paid' and not public.is_admin() then
      raise exception 'not_allowed';                            -- الموظف لا يُخرج طلباً من «مدفوع»
    end if;
  end if;
  return new;
end $function$;
drop trigger if exists orders_b_payment_guard_trg on public.orders;
create trigger orders_b_payment_guard_trg before update of payment_status on public.orders
  for each row execute function public.orders_payment_guard();

-- ---------- 3) تسجيل كل تغيير (بعد نجاحه) ----------
create or replace function public.orders_payment_audit_log() returns trigger
language plpgsql security definer set search_path = public as $function$
begin
  if new.payment_status is distinct from old.payment_status
     and coalesce(current_setting('amx.audit_done', true), '') <> new.id then
    insert into public.order_payment_audit (order_id, from_status, to_status, actor, via)
    values (new.id, old.payment_status, new.payment_status, auth.uid(),
            case when current_user in ('authenticated', 'anon') then 'direct' else 'function' end);
  end if;
  return null;
end $function$;
drop trigger if exists orders_payment_audit_log_trg on public.orders;
create trigger orders_payment_audit_log_trg after update of payment_status on public.orders
  for each row execute function public.orders_payment_audit_log();

-- ---------- 4) اعتماد الدفع اليدوي (الدالة التي يستدعيها admin.js) ----------
-- [moved] public.approve_manual_payment is defined only in supabase/migrations/20261028070000_payments_restructure.sql.
