-- =====================================================================
-- AMARIX007 — تشديد أمان المحفظة (wallet hardening) + جدول حماية دخول تيليغرام
-- شغّله مرة واحدة بعد supabase-wallet.sql (آمن للتشغيل أكثر من مرة).
--
-- 1) الموافقة على الشحن لا تتم بدون إثبات دفع مرفق.
-- 2) بصمة SHA-256 للإثبات + رقم العملية: كل منهما فريد، فلا يُستعمل نفس الإثبات لطلبين.
-- 3) تسجيل من وافق/رفض (reviewed_by) وموافقة ثانية من أدمن مختلف للمبالغ الكبيرة
--    (الحد من store_config.data.wallet.dual_threshold، الافتراضي 0 = معطّل لأن لديك أدمن واحداً؛ ضع مثلاً 500 بعد إضافة أدمن ثانٍ).
-- 4) تعديلات الأدمن اليدوية على الرصيد تسجّل هوية الأدمن في الملاحظة.
-- =====================================================================

alter table public.wallet_topups
  add column if not exists tx_ref text,
  add column if not exists proof_hash text,
  add column if not exists reviewed_by uuid,
  add column if not exists first_approved_by uuid,
  add column if not exists first_approved_at timestamptz;

create unique index if not exists wallet_topups_proof_hash_uq
  on public.wallet_topups (proof_hash) where proof_hash is not null and status <> 'rejected';
create unique index if not exists wallet_topups_txref_uq
  on public.wallet_topups (lower(tx_ref)) where tx_ref is not null and status <> 'rejected';

-- ---------- إرفاق الإثبات (مع البصمة) ----------
drop function if exists public.wallet_topup_set_proof(bigint, text);
create or replace function public.wallet_topup_set_proof(p_id bigint, p_path text, p_hash text default null) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
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
    update public.wallet_topups set payment_proof = p_path, proof_hash = p_hash
     where id = p_id and user_id = uid and status = 'pending';
  exception when unique_violation then
    raise exception 'duplicate_proof';
  end;
  if not found then raise exception 'not_allowed'; end if;
end $$;

-- ---------- «تم الدفع» (مع رقم العملية الاختياري) ----------
drop function if exists public.wallet_topup_claim(bigint);
create or replace function public.wallet_topup_claim(p_id bigint, p_tx_ref text default null) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.wallet_topups%rowtype; nm text; em text; ref text := nullif(btrim(coalesce(p_tx_ref, '')), '');
begin
  if uid is null then raise exception 'not_allowed'; end if;
  if ref is not null and (length(ref) < 6 or length(ref) > 100 or ref !~ '^[A-Za-z0-9_:.\- ]+$') then
    raise exception 'invalid_reference';
  end if;
  select * into r from public.wallet_topups where id = p_id and user_id = uid for update;
  if not found then raise exception 'not_allowed'; end if;
  if r.status in ('review','approved') then return; end if;
  if r.status <> 'pending' then raise exception 'not_allowed'; end if;
  if coalesce(r.payment_proof, '') = '' then raise exception 'proof_required'; end if;
  begin
    update public.wallet_topups set status = 'review', tx_ref = coalesce(ref, tx_ref) where id = p_id;
  exception when unique_violation then
    raise exception 'duplicate_reference';
  end;
  select full_name, email into nm, em from public.profiles where id = uid;
  perform public.notify_telegram('💸 شحن محفظة يحتاج مراجعة #' || p_id || E'\n👤 ' || coalesce(nm, '') || ' (' || coalesce(em, '') || ')'
                                 || E'\n💰 ' || r.amount || ' USD · ' || r.section || E'\n💳 ' || coalesce(r.payment_method, '')
                                 || E'\n🧾 إثبات: مرفق' || case when coalesce(ref, r.tx_ref) is not null then E'\n🔖 رقم العملية: ' || coalesce(ref, r.tx_ref) else '' end);
end $$;

-- ---------- موافقة الأدمن (إثبات إلزامي + موافقة ثانية للمبالغ الكبيرة) ----------
-- ترجع الرصيد الجديد، أو -1 إذا سُجّلت الموافقة الأولى وما زال المبلغ بانتظار أدمن ثانٍ.
create or replace function public.wallet_topup_approve(p_id bigint, p_amount numeric default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.wallet_topups%rowtype; amt numeric; nb numeric; cfg jsonb; thr numeric;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  select * into r from public.wallet_topups where id = p_id for update;
  if not found or r.status not in ('pending','review') then raise exception 'not_allowed'; end if;
  if coalesce(r.payment_proof, '') = '' then raise exception 'proof_required'; end if;
  amt := round(coalesce(p_amount, r.amount), 2);
  if amt <= 0 or amt > 100000 then raise exception 'invalid_amount'; end if;
  select data into cfg from public.store_config where id = 1;
  thr := coalesce(nullif(cfg->'wallet'->>'dual_threshold', '')::numeric, 0);
  if thr > 0 and amt >= thr then
    if r.first_approved_by is null then
      update public.wallet_topups set first_approved_by = uid, first_approved_at = now(), status = 'review' where id = p_id;
      perform public.notify_telegram('🕒 موافقة أولى على شحن #' || p_id || ' بمبلغ ' || amt || ' USD — بانتظار أدمن ثانٍ');
      return -1;
    elsif r.first_approved_by = uid then
      raise exception 'second_approver_required';
    end if;
  end if;
  nb := public.wallet_apply(r.user_id, r.section, amt, 'topup', 'TOPUP-' || r.id, null);
  update public.wallet_topups set status = 'approved', amount = amt, reviewed_at = now(), reviewed_by = uid where id = p_id;
  return nb;
end $$;

create or replace function public.wallet_topup_reject(p_id bigint, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  update public.wallet_topups set status = 'rejected', admin_note = left(p_note, 300), reviewed_at = now(), reviewed_by = auth.uid()
   where id = p_id and status in ('pending','review');
  if not found then raise exception 'not_allowed'; end if;
end $$;

-- ---------- التعديل اليدوي: تسجيل هوية الأدمن ----------
create or replace function public.wallet_admin_adjust(p_user uuid, p_section text, p_amount numeric, p_note text default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare cfg jsonb;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  select data into cfg from public.store_config where id = 1;
  if not (p_section = any (public.wallet_sections(cfg))) then raise exception 'invalid_section'; end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 100000 then raise exception 'invalid_amount'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'not_allowed'; end if;
  return public.wallet_apply(p_user, p_section, round(p_amount, 2), 'adjust', null, '[admin ' || auth.uid()::text || '] ' || coalesce(p_note, ''));
end $$;

-- ---------- الصلاحيات ----------
revoke execute on function public.wallet_topup_set_proof(bigint, text, text) from public, anon;
revoke execute on function public.wallet_topup_claim(bigint, text)           from public, anon;
revoke execute on function public.wallet_topup_approve(bigint, numeric)      from public, anon;
revoke execute on function public.wallet_topup_reject(bigint, text)          from public, anon;
revoke execute on function public.wallet_admin_adjust(uuid, text, numeric, text) from public, anon;
grant execute on function public.wallet_topup_set_proof(bigint, text, text)  to authenticated, service_role;
grant execute on function public.wallet_topup_claim(bigint, text)            to authenticated, service_role;
grant execute on function public.wallet_topup_approve(bigint, numeric)       to authenticated, service_role;
grant execute on function public.wallet_topup_reject(bigint, text)           to authenticated, service_role;
grant execute on function public.wallet_admin_adjust(uuid, text, numeric, text) to authenticated, service_role;

-- ---------- منع إعادة استخدام نتيجة دخول تيليغرام (replay) ----------
create table if not exists public.tg_auth_seen (
  hash text primary key,
  seen_at timestamptz not null default now()
);
alter table public.tg_auth_seen enable row level security;   -- بلا سياسات: يصلها service_role فقط
