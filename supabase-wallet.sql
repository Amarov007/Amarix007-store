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
create or replace function public.wallet_topup_create(p_amount numeric, p_method text, p_currency text default null, p_section text default 'smm')
returns bigint
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cfg jsonb; w jsonb; mn numeric; mx numeric; amt numeric; nid bigint; nm text; em text;
begin
  if uid is null then raise exception 'not_allowed'; end if;
  if not public.rl_hit('wtopup:' || uid::text, 10, 3600) then raise exception 'rate_limited'; end if;
  select data into cfg from public.store_config where id = 1;
  w := coalesce(cfg->'wallet', '{}'::jsonb);
  if coalesce(w->>'on', 'true') = 'false' then raise exception 'wallet_disabled'; end if;
  if not (p_section = any (public.wallet_sections(cfg))) then raise exception 'invalid_section'; end if;
  mn := greatest(coalesce(nullif(w->>'min', '')::numeric, 1), 0.5);
  mx := coalesce(nullif(w->>'max', '')::numeric, 1000);
  amt := round(coalesce(p_amount, 0), 2);
  if amt < mn then raise exception 'below_min'; end if;
  if mx > 0 and amt > mx then raise exception 'above_max'; end if;
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
end $$;

-- 2) إرفاق إثبات الدفع (صورة في حاوية payment-proofs داخل مجلد المستخدم)
create or replace function public.wallet_topup_set_proof(p_id bigint, p_path text) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not_allowed'; end if;
  if p_path is null or length(p_path) > 300
     or p_path !~ ('^' || uid::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$') then
    raise exception 'invalid_path';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'payment-proofs' and name = p_path) then
    raise exception 'proof_missing';
  end if;
  update public.wallet_topups set payment_proof = p_path
   where id = p_id and user_id = uid and status = 'pending';
  if not found then raise exception 'not_allowed'; end if;
end $$;

-- 3) «تم الدفع» -> مراجعة المدير
create or replace function public.wallet_topup_claim(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.wallet_topups%rowtype; nm text; em text;
begin
  if uid is null then raise exception 'not_allowed'; end if;
  select * into r from public.wallet_topups where id = p_id and user_id = uid for update;
  if not found then raise exception 'not_allowed'; end if;
  if r.status in ('review','approved') then return; end if;
  if r.status <> 'pending' then raise exception 'not_allowed'; end if;
  if coalesce(r.payment_proof, '') = '' then raise exception 'proof_required'; end if;
  update public.wallet_topups set status = 'review' where id = p_id;
  select full_name, email into nm, em from public.profiles where id = uid;
  perform public.notify_telegram('💸 شحن محفظة يحتاج مراجعة #' || p_id || E'\n👤 ' || coalesce(nm, '') || ' (' || coalesce(em, '') || ')'
                                 || E'\n💰 ' || r.amount || ' USD · ' || r.section || E'\n💳 ' || coalesce(r.payment_method, '') || E'\n🧾 إثبات: مرفق');
end $$;

-- 4) الدفع من المحفظة لطلب موجود (يخص المستخدم وبانتظار الدفع)
create or replace function public.pay_order_with_wallet(p_order_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
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
end $$;

-- ---------- دوال المدير ----------
create or replace function public.wallet_topup_approve(p_id bigint, p_amount numeric default null) returns numeric
language plpgsql security definer set search_path = public as $$
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
end $$;

create or replace function public.wallet_topup_reject(p_id bigint, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  update public.wallet_topups set status = 'rejected', admin_note = left(p_note, 300), reviewed_at = now()
   where id = p_id and status in ('pending','review');
  if not found then raise exception 'not_allowed'; end if;
end $$;

create or replace function public.wallet_admin_adjust(p_user uuid, p_section text, p_amount numeric, p_note text default null) returns numeric
language plpgsql security definer set search_path = public as $$
declare cfg jsonb;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  select data into cfg from public.store_config where id = 1;
  if not (p_section = any (public.wallet_sections(cfg))) then raise exception 'invalid_section'; end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 100000 then raise exception 'invalid_amount'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'not_allowed'; end if;
  return public.wallet_apply(p_user, p_section, round(p_amount, 2), 'adjust', null, p_note);
end $$;

-- ---------- استرجاع الرصيد عند إلغاء طلب دُفع من المحفظة ----------
create or replace function public.orders_wallet_refund() returns trigger
language plpgsql security definer set search_path = public as $$
declare spent numeric; sec text;
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' and new.user_id is not null then
    select -amount, section into spent, sec from public.wallet_transactions
     where ref = new.id and kind = 'spend' order by id desc limit 1;
    if spent is not null and spent > 0
       and not exists (select 1 from public.wallet_transactions where ref = new.id and kind = 'refund') then
      perform public.wallet_apply(new.user_id, sec, spent, 'refund', new.id, 'cancelled order');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists orders_wallet_refund_trg on public.orders;
create trigger orders_wallet_refund_trg after update of status on public.orders
  for each row execute function public.orders_wallet_refund();

-- ---------- الصلاحيات (اتّباعاً لنمط بقية الملف: لا شيء مفتوح افتراضياً) ----------
revoke execute on function public.wallet_sections(jsonb)                     from public, anon, authenticated;
revoke execute on function public.wallet_item_section(jsonb, jsonb)          from public, anon, authenticated;
revoke execute on function public.wallet_order_section(jsonb, jsonb)         from public, anon, authenticated;
revoke execute on function public.wallet_apply(uuid, text, numeric, text, text, text) from public, anon, authenticated;
revoke execute on function public.orders_wallet_refund()                     from public, anon, authenticated;
revoke execute on function public.wallet_topup_create(numeric, text, text, text) from public, anon;
revoke execute on function public.wallet_topup_set_proof(bigint, text)       from public, anon;
revoke execute on function public.wallet_topup_claim(bigint)                 from public, anon;
revoke execute on function public.pay_order_with_wallet(text)                from public, anon;
revoke execute on function public.wallet_topup_approve(bigint, numeric)      from public, anon;
revoke execute on function public.wallet_topup_reject(bigint, text)          from public, anon;
revoke execute on function public.wallet_admin_adjust(uuid, text, numeric, text) from public, anon;

grant execute on function public.wallet_topup_create(numeric, text, text, text) to authenticated;
grant execute on function public.wallet_topup_set_proof(bigint, text)       to authenticated;
grant execute on function public.wallet_topup_claim(bigint)                 to authenticated;
grant execute on function public.pay_order_with_wallet(text)                to authenticated;
grant execute on function public.wallet_topup_approve(bigint, numeric)      to authenticated;   -- تتحقق is_admin() داخلياً
grant execute on function public.wallet_topup_reject(bigint, text)          to authenticated;
grant execute on function public.wallet_admin_adjust(uuid, text, numeric, text) to authenticated;
grant execute on all functions in schema public to service_role;


-- =====================================================================
-- تحديثات لاحقة (مطبّقة على القاعدة الحية)
-- =====================================================================
-- 1) المحفظة للقراءة فقط من العميل؛ الكتابة عبر الدوال security definer فقط
revoke all on table public.wallets, public.wallet_transactions, public.wallet_topups from anon, authenticated, public;
grant select on table public.wallets, public.wallet_transactions, public.wallet_topups to authenticated;

-- 2) سقف شحن يومي اختياري: store_config.data.wallet.daily_max (غير موجود أو 0 = بلا سقف) — الخطأ: above_daily
--    (التعريف الكامل لـ wallet_topup_create المحدّث في supabase/migrations/20261025_wallet_daily_cap_reconcile.sql)

-- 3) مطابقة الأرصدة مع الدفتر (للمدير): select * from public.wallet_reconcile();  -- أي صف = عدم تطابق
