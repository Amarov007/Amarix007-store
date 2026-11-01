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
CREATE OR REPLACE FUNCTION public.wallet_topup_create(p_amount numeric, p_method text, p_currency text DEFAULT NULL::text, p_section text DEFAULT 'smm'::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid(); cfg jsonb; w jsonb; mn numeric; mx numeric; dmx numeric; amt numeric; nid bigint; nm text; em text;
begin
  if uid is null then raise exception 'not_allowed'; end if;
  if not public.rl_hit('wtopup:' || uid::text, 10, 3600) then raise exception 'rate_limited'; end if;
  select data into cfg from public.store_config where id = 1;
  w := coalesce(cfg->'wallet', '{}'::jsonb);
  if coalesce(w->>'on', 'true') = 'false' then raise exception 'wallet_disabled'; end if;
  if not (p_section = any (public.wallet_sections(cfg))) then raise exception 'invalid_section'; end if;
  mn := greatest(coalesce(nullif(w->>'min', '')::numeric, 1), 0.5);
  mx := coalesce(nullif(w->>'max', '')::numeric, 1000);
  dmx := coalesce(nullif(w->>'daily_max', '')::numeric, 0);
  amt := round(coalesce(p_amount, 0), 2);
  if amt < mn then raise exception 'below_min'; end if;
  if mx > 0 and amt > mx then raise exception 'above_max'; end if;
  if dmx > 0 and amt + coalesce((select sum(amount) from public.wallet_topups
        where user_id = uid and status <> 'rejected' and created_at > now() - interval '24 hours'), 0) > dmx then
    raise exception 'above_daily';
  end if;
  if p_method is null or not exists (
       select 1 from jsonb_array_elements(coalesce(cfg->'payments', '[]'::jsonb)) m
        where m->>'id' = p_method and coalesce(m->>'on', 'true') <> 'false') then
    raise exception 'invalid_method';
  end if;
  if (select count(*) from public.wallet_topups where user_id = uid and status in ('pending','review')) >= 5 then
    raise exception 'too_many_pending';
  end if;
  insert into public.wallet_topups (user_id, section, amount, payment_method, pay_currency)
  values (uid, p_section, amt, p_method,
          case when upper(coalesce(p_currency, '')) ~ '^[A-Z]{3,10}$' then upper(p_currency) else null end)
  returning id into nid;
  select full_name, email into nm, em from public.profiles where id = uid;
  perform public.notify_telegram('💼 طلب شحن محفظة #' || nid || E'\n👤 ' || coalesce(nm, '') || ' (' || coalesce(em, '') || ')'
                                 || E'\n💰 ' || amt || ' USD · ' || p_section || E'\n💳 ' || p_method);
  return nid;
end $function$;

-- 2) إرفاق إثبات الدفع (صورة في حاوية payment-proofs داخل مجلد المستخدم)
drop function if exists public.wallet_topup_set_proof(bigint, text);
CREATE OR REPLACE FUNCTION public.wallet_topup_set_proof(p_id bigint, p_path text, p_hash text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;

-- 3) «تم الدفع» -> مراجعة المدير
drop function if exists public.wallet_topup_claim(bigint);
CREATE OR REPLACE FUNCTION public.wallet_topup_claim(p_id bigint, p_tx_ref text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$;

-- 4) الدفع من المحفظة لطلب موجود (يخص المستخدم وبانتظار الدفع)
CREATE OR REPLACE FUNCTION public.pay_order_with_wallet(p_order_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  update public.orders set payment_status = 'paid', payment_method = 'wallet' where id = o.id;
  select full_name into nm from public.profiles where id = uid;
  perform public.notify_telegram('✅ دُفع من المحفظة ' || o.id || E'\n👤 ' || coalesce(nm, '') || ' (' || coalesce(o.customer_email, '') || ')'
                                 || E'\n💰 ' || o.total || ' USD');
  return jsonb_build_object('balance', nb, 'section', sec);
end $function$;

-- ---------- دوال المدير ----------
CREATE OR REPLACE FUNCTION public.wallet_topup_approve(p_id bigint, p_amount numeric DEFAULT NULL::numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.wallet_topups%rowtype; amt numeric; nb numeric;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  select * into r from public.wallet_topups where id = p_id for update;
  if not found or r.status not in ('pending','review') then raise exception 'not_allowed'; end if;
  amt := round(coalesce(p_amount, r.amount), 2);
  if amt <= 0 or amt > 100000 then raise exception 'invalid_amount'; end if;
  nb := public.wallet_apply(r.user_id, r.section, amt, 'topup', 'TOPUP-' || r.id, null);
  update public.wallet_topups set status = 'approved', amount = amt, reviewed_at = now() where id = p_id;
  return nb;
end $function$;

CREATE OR REPLACE FUNCTION public.wallet_topup_reject(p_id bigint, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  update public.wallet_topups set status = 'rejected', admin_note = left(p_note, 300), reviewed_at = now()
   where id = p_id and status in ('pending','review');
  if not found then raise exception 'not_allowed'; end if;
end $function$;


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
