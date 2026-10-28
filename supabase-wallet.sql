-- =====================================================================
-- AMARIX007 — محفظة المستخدم (Wallet)
-- لكل مستخدم رصيد منفصل لكل «قسم» (section). حالياً القسم الوحيد: smm (خدمات الرشق).
-- شغّل هذا الملف مرة واحدة في Supabase > SQL Editor (آمن للتشغيل أكثر من مرة).
--
-- المبدأ الأمني: العميل لا يكتب في جداول المحفظة أبداً. كل التعديلات تتم عبر دوال
-- security definer تتحقق من المستخدم وتقفل الصف (for update) وتسجّل كل حركة في دفتر الحركات.
--
-- لإضافة قسم جديد مستقبلاً (مثلاً accounts):
--   1) أضف اسمه في store_config.data.wallet.sections (من لوحة التحكم > المحافظ) أو عدّل wallet_sections() أدناه.
--   2) عدّل الدالة wallet_item_section() لتُرجع اسم القسم للمنتجات المناسبة.
--   لا تحتاج تغيير الجداول.
-- =====================================================================

-- ---------- الجداول ----------
create table if not exists public.wallets (
  user_id uuid not null references public.profiles(id) on delete cascade,
  section text not null default 'smm' check (section ~ '^[a-z0-9_]{2,30}$'),
  balance numeric(14,2) not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, section)
);

create table if not exists public.wallet_transactions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  section text not null,
  kind text not null check (kind in ('topup','spend','refund','adjust')),
  amount numeric(14,2) not null,            -- موجب = إضافة، سالب = خصم
  balance_after numeric(14,2) not null,
  ref text,                                 -- رقم الطلب أو رقم الشحن
  note text
);
create index if not exists wallet_tx_user_idx on public.wallet_transactions (user_id, created_at desc);
create index if not exists wallet_tx_ref_idx  on public.wallet_transactions (ref, kind);

create table if not exists public.wallet_topups (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  section text not null default 'smm',
  amount numeric(14,2) not null check (amount > 0),   -- بعملة المتجر الأساسية (USD)
  payment_method text,
  pay_currency text,
  payment_proof text,
  status text not null default 'pending' check (status in ('pending','review','approved','rejected')),
  admin_note text,
  reviewed_at timestamptz
);
create index if not exists wallet_topups_user_idx   on public.wallet_topups (user_id, created_at desc);
-- أعمدة أُضيفت في القاعدة الحية (مزامنة 2026-10-25): مرجع العملية، بصمة الإثبات، المراجعون، الموافقة المزدوجة
alter table public.wallet_topups add column if not exists tx_ref            text;
alter table public.wallet_topups add column if not exists proof_hash        text;
alter table public.wallet_topups add column if not exists reviewed_by       uuid;
alter table public.wallet_topups add column if not exists first_approved_by uuid;
alter table public.wallet_topups add column if not exists first_approved_at timestamptz;
create unique index if not exists wallet_topups_proof_hash_uq on public.wallet_topups (proof_hash)
  where proof_hash is not null and status <> 'rejected';
create unique index if not exists wallet_topups_txref_uq on public.wallet_topups (lower(tx_ref))
  where tx_ref is not null and status <> 'rejected';

create index if not exists wallet_topups_status_idx on public.wallet_topups (status, created_at desc);

alter table public.wallets             enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.wallet_topups       enable row level security;

drop policy if exists "wallets read own or admin" on public.wallets;
create policy "wallets read own or admin" on public.wallets for select to authenticated
  using (public.is_admin() or user_id = (select auth.uid()));
drop policy if exists "wallet tx read own or admin" on public.wallet_transactions;
create policy "wallet tx read own or admin" on public.wallet_transactions for select to authenticated
  using (public.is_admin() or user_id = (select auth.uid()));
drop policy if exists "wallet topups read own or admin" on public.wallet_topups;
create policy "wallet topups read own or admin" on public.wallet_topups for select to authenticated
  using (public.is_admin() or user_id = (select auth.uid()));
-- لا سياسات insert/update/delete عمداً: الكتابة فقط عبر الدوال أدناه.

-- ---------- دوال مساعدة داخلية ----------
-- الأقسام المسموحة (من الإعدادات، والافتراضي smm فقط)
create or replace function public.wallet_sections(cfg jsonb) returns text[]
language sql stable set search_path = public as $$
  select coalesce(
    (select array_agg(x) from jsonb_array_elements_text(
       case when jsonb_typeof(cfg->'wallet'->'sections') = 'array' then cfg->'wallet'->'sections' else '[]'::jsonb end) x
      where x ~ '^[a-z0-9_]{2,30}$'),
    array['smm']);
$$;

-- أي قسم محفظة يصلح لهذا المنتج؟ (null = لا يُدفع من المحفظة)
-- ► لإضافة قسم جديد عدّل هنا.
create or replace function public.wallet_item_section(p jsonb, cfg jsonb) returns text
language sql stable set search_path = public as $$
  select case
    when p is null then null
    when coalesce(nullif(btrim(p->>'smm_service'), ''), '0') <> '0' then 'smm'
    when exists (select 1 from jsonb_array_elements(coalesce(cfg->'categories', '[]'::jsonb)) c
                  where c->>'id' = p->>'c' and c->>'ty' = 'boost') then 'smm'
    else null
  end;
$$;

-- قسم الطلب كله: كل المنتجات يجب أن تكون من القسم نفسه وإلا null
create or replace function public.wallet_order_section(items jsonb, cfg jsonb) returns text
language plpgsql stable set search_path = public as $$
declare it jsonb; p jsonb; s text; first_s text;
begin
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) = 0 then return null; end if;
  for it in select * from jsonb_array_elements(items) loop
    select x into p from jsonb_array_elements(coalesce(cfg->'products', '[]'::jsonb)) x where x->>'id' = it->>'id' limit 1;
    s := public.wallet_item_section(p, cfg);
    if s is null then return null; end if;
    if first_s is null then first_s := s; elsif first_s <> s then return null; end if;
  end loop;
  return first_s;
end $$;

-- تعديل الرصيد + تسجيل الحركة (يُستدعى فقط من دوال security definer)
create or replace function public.wallet_apply(p_user uuid, p_section text, p_amount numeric, p_kind text, p_ref text, p_note text)
returns numeric
language plpgsql security definer set search_path = public as $$
declare nb numeric;
begin
  insert into public.wallets (user_id, section, balance) values (p_user, p_section, 0) on conflict do nothing;
  update public.wallets set balance = balance + p_amount, updated_at = now()
   where user_id = p_user and section = p_section
   returning balance into nb;          -- check (balance >= 0) يمنع الرصيد السالب
  insert into public.wallet_transactions (user_id, section, kind, amount, balance_after, ref, note)
  values (p_user, p_section, p_kind, p_amount, nb, p_ref, left(p_note, 300));
  return nb;
end $$;

-- ---------- دوال العميل ----------
-- 1) طلب شحن
-- [moved] public.wallet_topup_create is defined only in supabase/migrations/20261028070000_payments_restructure.sql.


-- 2) إرفاق إثبات الدفع (صورة في حاوية payment-proofs داخل مجلد المستخدم)
drop function if exists public.wallet_topup_set_proof(bigint, text);  -- توقيع قديم (بلا بصمة)
-- [moved] public.wallet_topup_set_proof is defined only in supabase/migrations/20261028070000_payments_restructure.sql.


-- 3) «تم الدفع» -> مراجعة المدير
drop function if exists public.wallet_topup_claim(bigint);  -- توقيع قديم (بلا رقم عملية)
-- [moved] public.wallet_topup_claim is defined only in supabase/migrations/20261028070000_payments_restructure.sql.


-- 4) الدفع من المحفظة لطلب موجود (يخص المستخدم وبانتظار الدفع)
-- [moved] public.pay_order_with_wallet is defined only in supabase/migrations/20261028070000_payments_restructure.sql.


-- ---------- دوال المدير ----------
-- [moved] public.wallet_topup_approve is defined only in supabase/migrations/20261028070000_payments_restructure.sql.


-- [moved] public.wallet_topup_reject is defined only in supabase/migrations/20261028070000_payments_restructure.sql.


-- تدقيق: أرصدة لا تطابق مجموع دفتر الحركات (فارغ = سليم)
create or replace function public.wallet_reconcile()
returns table(user_id uuid, section text, balance numeric, ledger_sum numeric, diff numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  return query
  select w.user_id, w.section, w.balance, coalesce(t.s, 0), w.balance - coalesce(t.s, 0)
    from public.wallets w
    left join (select x.user_id, x.section, sum(x.amount) s from public.wallet_transactions x group by 1, 2) t
      on t.user_id = w.user_id and t.section = w.section
   where w.balance <> coalesce(t.s, 0);
end $$;

create or replace function public.wallet_admin_adjust(p_user uuid, p_section text, p_amount numeric, p_note text default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare cfg jsonb;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  select data into cfg from public.store_config where id = 1;
  if p_section is not null and p_section <> 'main' then raise exception 'wallet_section_main_only'; end if;
  p_section := 'main';
  if p_amount is null or p_amount = 0 or abs(p_amount) > 100000 then raise exception 'invalid_amount'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'not_allowed'; end if;
  return public.wallet_apply(p_user, p_section, round(p_amount, 2), 'adjust', null, '[admin ' || auth.uid()::text || '] ' || coalesce(p_note, ''));
end $$;

-- ---------- استرجاع الرصيد عند إلغاء طلب دُفع من المحفظة ----------
-- [moved] public.orders_wallet_refund is defined only in supabase/migrations/20261028070000_payments_restructure.sql.


-- [moved] orders_wallet_refund_trg is retired by the payments restructure migration.
-- ---------- الصلاحيات (اتّباعاً لنمط بقية الملف: لا شيء مفتوح افتراضياً) ----------
revoke execute on function public.wallet_sections(jsonb)                     from public, anon, authenticated;
revoke execute on function public.wallet_item_section(jsonb, jsonb)          from public, anon, authenticated;
revoke execute on function public.wallet_order_section(jsonb, jsonb)         from public, anon, authenticated;
revoke execute on function public.wallet_apply(uuid, text, numeric, text, text, text) from public, anon, authenticated;
revoke execute on function public.wallet_topup_create(numeric, text, text, text) from public, anon;
revoke execute on function public.wallet_topup_set_proof(bigint, text, text) from public, anon;
revoke execute on function public.wallet_topup_claim(bigint, text)       from public, anon;
revoke execute on function public.pay_order_with_wallet(text)                from public, anon;
revoke execute on function public.wallet_topup_approve(bigint, numeric)      from public, anon;
revoke execute on function public.wallet_topup_reject(bigint, text)          from public, anon;
revoke execute on function public.wallet_admin_adjust(uuid, text, numeric, text) from public, anon;
revoke execute on function public.wallet_reconcile()                        from public, anon;

grant execute on function public.wallet_topup_create(numeric, text, text, text) to authenticated;
grant execute on function public.wallet_topup_set_proof(bigint, text, text) to authenticated;
grant execute on function public.wallet_topup_claim(bigint, text)       to authenticated;
grant execute on function public.pay_order_with_wallet(text)                to authenticated;
grant execute on function public.wallet_topup_approve(bigint, numeric)      to authenticated;   -- تتحقق is_admin() داخلياً
grant execute on function public.wallet_topup_reject(bigint, text)          to authenticated;
grant execute on function public.wallet_admin_adjust(uuid, text, numeric, text) to authenticated;
grant execute on function public.wallet_reconcile()                        to authenticated;   -- تتحقق is_admin() داخلياً
grant execute on all functions in schema public to service_role;
