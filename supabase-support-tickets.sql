-- =====================================================================
-- AMARIX007 — ترقية: تذاكر الدعم + حدود كمية الرشق (آمن للتشغيل أكثر من مرة)
-- شغّله مرة واحدة في Supabase > SQL Editor. لا يحتاج إعادة تشغيل الملف الكامل.
-- يعتمد على الدوال الموجودة مسبقاً: is_admin / rl_hit / notify_telegram (من supabase-schema.sql)
-- =====================================================================

-- 1) تحديث دالة التسعير لتفرض أقل/أعلى كمية لكل منتج (qmin / qmax)
create or replace function public.orders_enforce_pricing() returns trigger
language plpgsql security definer set search_path = public as $function$
declare
  cfg jsonb; prods jsonb; it jsonb; p jsonb; newitems jsonb := '[]'::jsonb;
  qty numeric; unit numeric; sub numeric := 0; disc numeric := 0; cp jsonb; code text;
  base_cur text; trusted boolean;
begin
  trusted := auth.uid() is null or public.is_admin();

  if not trusted and not public.rl_hit('order:' || auth.uid()::text, 10, 3600) then
    raise exception 'rate_limited';                       -- 10 طلبات / ساعة لكل مستخدم
  end if;

  -- رقم الطلب: دائماً من التسلسل للعملاء؛ المدير/الخلفية يستطيعون تمرير رقم يدوي صالح
  if not trusted or new.id is null or new.id = '' then
    new.id := 'AMX-' || nextval('public.orders_seq')::text;
  end if;

  select data into cfg from public.store_config where id = 1;
  prods := coalesce(cfg->'products', '[]'::jsonb);

  if jsonb_typeof(new.items) <> 'array' or jsonb_array_length(new.items) = 0 then raise exception 'invalid_items'; end if;
  if jsonb_array_length(new.items) > 50 then raise exception 'too_many_items'; end if;
  if new.id !~ '^AMX-[A-Z0-9]{3,30}$' then raise exception 'invalid_order_id'; end if;

  for it in select * from jsonb_array_elements(new.items) loop
    select x into p from jsonb_array_elements(prods) x where x->>'id' = it->>'id' limit 1;
    if p is null then raise exception 'unknown_product %', it->>'id'; end if;
    if not trusted and (p->>'k' = 'link' or coalesce((p->>'p')::numeric, 0) <= 0) then
      raise exception 'not_orderable %', it->>'id';       -- منتج زيارة فقط أو بلا سعر
    end if;
    qty := coalesce(nullif(it->>'q','')::numeric, 0);
    if qty < 1 or qty <> trunc(qty) or qty > 100000 then raise exception 'invalid_quantity'; end if;
    -- حدود الكمية التي يحددها المدير لكل منتج (qmin / qmax بالوحدات). تُطبَّق على العملاء فقط.
    if not trusted then
      if qty < greatest(1, coalesce(nullif(p->>'qmin', '')::numeric, 1)) then raise exception 'below_min_quantity'; end if;
      if coalesce(nullif(p->>'qmax', '')::numeric, 0) > 0 and qty > (p->>'qmax')::numeric then raise exception 'above_max_quantity'; end if;
    end if;
    unit := round(coalesce((p->>'p')::numeric, 0) * (1 - coalesce((p->>'d')::numeric, 0) / 100), 2);
    sub := sub + unit * qty;
    newitems := newitems || jsonb_build_object(
      'id', p->>'id', 'q', qty, 'price', unit,
      'ar', coalesce(p->>'ar', ''), 'en', coalesce(p->>'en', ''),
      'name', case when new.lang = 'en' then coalesce(nullif(p->>'en', ''), p->>'ar', '')
                   else coalesce(nullif(p->>'ar', ''), p->>'en', '') end,
      'link', left(coalesce(it->>'link', ''), 500));
  end loop;

  code := upper(trim(coalesce(new.coupon, '')));
  if code <> '' then
    cp := cfg->'coupons'->code;
    if cp is null or jsonb_typeof(cp) <> 'array' or not public.coupon_usable(cp, code) then
      if trusted then new.coupon := null; else raise exception 'coupon_invalid'; end if;
    else
      new.coupon := code;
      disc := least(sub, sub * coalesce((cp->>0)::numeric, 0) / 100 + coalesce((cp->>1)::numeric, 0));
    end if;
  else
    new.coupon := null;
  end if;

  new.items := newitems;
  new.total := round(greatest(0, sub - disc), 2);

  if not trusted then
    select e.key into base_cur
      from jsonb_each(coalesce(cfg->'rates', '{}'::jsonb)) e
     where jsonb_typeof(e.value) = 'array' and jsonb_typeof(e.value->0) = 'number'
       and (e.value->>0)::numeric = 1 limit 1;
    new.currency := coalesce(base_cur, 'SAR');
    if new.lang is null or new.lang not in ('ar','en') then new.lang := 'ar'; end if;
    if new.payment_method is not null and new.payment_method !~ '^[a-z0-9_-]{1,40}$' then new.payment_method := null; end if;
    new.customer_email := coalesce(nullif(auth.jwt() ->> 'email', ''), new.customer_email);
    new.customer_name  := left(coalesce(new.customer_name, ''), 120);
    new.created_at := now();
    new.pay_currency := case when upper(coalesce(new.pay_currency, '')) ~ '^[A-Z]{3,10}$'
                             then upper(new.pay_currency) else null end;
    new.status := 'new'; new.payment_status := 'pending';
    new.affiliate_ref := null; new.affiliate_commission := 0;
    new.smm := null; new.smm_status := null;
  end if;
  return new;
end $function$;

-- =====================================================================
-- تذاكر الدعم (Support tickets) + حدود كمية الرشق
-- يصل إشعار تلغرام عند إرسال تذكرة (عبر notify_telegram الموجودة) وتظهر التذاكر في لوحة التحكم > تذاكر الدعم.
-- =====================================================================
create table if not exists public.support_tickets (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete cascade,
  customer_name text, customer_email text,
  order_id text,
  subject text not null, message text not null,
  attachment text,
  lang text,
  status text not null default 'open' check (status in ('open','answered','closed')),
  admin_reply text, replied_at timestamptz
);
create index if not exists support_tickets_user_idx   on public.support_tickets (user_id, created_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);
alter table public.support_tickets enable row level security;

create or replace function public.tickets_before_insert() returns trigger
language plpgsql security definer set search_path = public as $function$
declare uid uuid := auth.uid();
begin
  if uid is not null and not public.is_admin() then
    if not public.rl_hit('ticket:' || uid::text, 5, 3600) then raise exception 'rate_limited'; end if;  -- 5 تذاكر / ساعة
    new.user_id := uid;
    new.customer_email := coalesce(nullif(auth.jwt() ->> 'email', ''), new.customer_email);
    new.status := 'open'; new.admin_reply := null; new.replied_at := null;
    new.created_at := now();
    if new.attachment is not null
       and new.attachment !~ ('^' || uid::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$') then
      new.attachment := null;
    end if;
  end if;
  new.customer_name  := left(coalesce(new.customer_name, ''), 120);
  new.subject        := left(btrim(coalesce(new.subject, '')), 120);
  new.message        := left(btrim(coalesce(new.message, '')), 2000);
  new.order_id       := nullif(left(upper(btrim(coalesce(new.order_id, ''))), 40), '');
  new.lang           := case when new.lang in ('ar','en') then new.lang else 'ar' end;
  if length(new.subject) < 3 or length(new.message) < 5 then raise exception 'invalid_ticket'; end if;
  return new;
end $function$;

create or replace function public.tickets_notify() returns trigger
language plpgsql security definer set search_path = public as $function$
begin
  begin
    perform public.notify_telegram(
      '🎫 تذكرة دعم جديدة #' || new.id
      || E'\n👤 ' || coalesce(new.customer_name, '') || ' (' || coalesce(new.customer_email, '') || ')'
      || case when new.order_id is not null then E'\n🧾 الطلب: ' || new.order_id else '' end
      || E'\n📌 ' || new.subject
      || E'\n\n' || left(new.message, 1500)
      || case when new.attachment is not null then E'\n\n📎 صورة مرفقة (تظهر في لوحة التحكم > تذاكر الدعم)' else '' end);
  exception when others then
    null;
  end;
  return new;
end $function$;

drop trigger if exists tickets_before_insert_trg on public.support_tickets;
create trigger tickets_before_insert_trg before insert on public.support_tickets for each row execute function public.tickets_before_insert();
drop trigger if exists tickets_notify_trg on public.support_tickets;
create trigger tickets_notify_trg after insert on public.support_tickets for each row execute function public.tickets_notify();

drop policy if exists "tickets insert own" on public.support_tickets;
create policy "tickets insert own" on public.support_tickets for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'open' and admin_reply is null);
drop policy if exists "tickets read own or admin" on public.support_tickets;
create policy "tickets read own or admin" on public.support_tickets for select to authenticated
  using (public.is_admin() or user_id = (select auth.uid()));
drop policy if exists "tickets admin update" on public.support_tickets;
create policy "tickets admin update" on public.support_tickets for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "tickets admin delete" on public.support_tickets;
create policy "tickets admin delete" on public.support_tickets for delete to authenticated
  using (public.is_admin());

-- صور التذاكر: حاوية خاصة، كل مستخدم يرفع داخل مجلده فقط والمدير يراها
create or replace function public.my_ticket_file_count() returns integer
language sql stable security definer set search_path = public, storage as $$
  select count(*)::int from storage.objects o
   where o.bucket_id = 'ticket-files'
     and (storage.foldername(o.name))[1] = (select auth.uid())::text;
$$;
revoke execute on function public.my_ticket_file_count() from public, anon;
grant  execute on function public.my_ticket_file_count() to authenticated, service_role;
revoke execute on function public.tickets_before_insert() from public, anon, authenticated;
revoke execute on function public.tickets_notify()        from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ticket-files', 'ticket-files', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ticket files read own or admin" on storage.objects;
create policy "ticket files read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'ticket-files' and (public.is_admin() or (storage.foldername(name))[1] = (select auth.uid())::text));
drop policy if exists "ticket files insert own" on storage.objects;
create policy "ticket files insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'ticket-files' and (storage.foldername(name))[1] = (select auth.uid())::text and public.my_ticket_file_count() < 30);
