-- =====================================================================
-- AMARIX007 — supabase-invoices.sql  (نظام الفواتير)
-- فاتورة تلقائية لكل طلب (لقطة ثابتة من البنود والأسعار وقت الطلب) + تحديث حالتها مع الدفع/الإلغاء.
-- آمن لإعادة التشغيل. يتطلب: orders, profiles (+uid من supabase-user-uid.sql), has_perm من supabase-staff.sql.
-- بعد التشغيل أعد تشغيل supabase-final-grants.sql (أضيف إليه get_invoice و admin_invoices).
-- =====================================================================

create sequence if not exists public.invoices_seq start 1001;

create table if not exists public.invoices (
  id bigint generated always as identity primary key,
  invoice_no text not null unique,
  order_id text not null unique references public.orders(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  customer_name text, customer_email text,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(14,2) not null default 0,
  discount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  currency text, coupon text, payment_method text,
  status text not null default 'issued' check (status in ('issued','paid','void')),
  issued_at timestamptz not null default now(),
  paid_at timestamptz,
  notes text
);
create index if not exists invoices_user_idx on public.invoices (user_id, issued_at desc);

-- ---------- بناء/مزامنة فاتورة من طلب ----------
create or replace function public.invoice_status_of(p_status text, p_pay text) returns text
language sql immutable set search_path = public as $$
  select case when p_status = 'cancelled' then 'void' when p_pay = 'paid' then 'paid' else 'issued' end
$$;

create or replace function public.orders_invoice() returns trigger
language plpgsql security definer set search_path = public as $function$
declare sub numeric; st text := public.invoice_status_of(new.status, new.payment_status);
begin
  if tg_op = 'INSERT' then
    select coalesce(sum(coalesce((x->>'price')::numeric, 0) * coalesce((x->>'q')::numeric, 0)), 0)
      into sub from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) x;
    insert into public.invoices (invoice_no, order_id, user_id, customer_name, customer_email, items,
                                 subtotal, discount, total, currency, coupon, payment_method, status, issued_at, paid_at)
    values ('INV-' || lpad(nextval('public.invoices_seq')::text, 6, '0'), new.id, new.user_id, new.customer_name, new.customer_email,
            coalesce(new.items, '[]'::jsonb), round(sub, 2), round(greatest(0, sub - coalesce(new.total, 0)), 2),
            round(coalesce(new.total, 0), 2), new.currency, new.coupon, new.payment_method, st, coalesce(new.created_at, now()),
            case when st = 'paid' then now() end)
    on conflict (order_id) do nothing;
  else
    update public.invoices
       set status = st,
           payment_method = new.payment_method,
           paid_at = case when st = 'paid' then coalesce(paid_at, now()) else null end
     where order_id = new.id and (status is distinct from st or payment_method is distinct from new.payment_method);
  end if;
  return null;
end $function$;

drop trigger if exists orders_invoice_ins on public.orders;
create trigger orders_invoice_ins after insert on public.orders for each row execute function public.orders_invoice();
drop trigger if exists orders_invoice_upd on public.orders;
create trigger orders_invoice_upd after update of status, payment_status, payment_method on public.orders for each row execute function public.orders_invoice();

-- ---------- فواتير للطلبات الموجودة ----------
insert into public.invoices (invoice_no, order_id, user_id, customer_name, customer_email, items, subtotal, discount, total,
                             currency, coupon, payment_method, status, issued_at, paid_at)
select 'INV-' || lpad(nextval('public.invoices_seq')::text, 6, '0'), o.id, o.user_id, o.customer_name, o.customer_email,
       coalesce(o.items, '[]'::jsonb), s.sub, round(greatest(0, s.sub - coalesce(o.total, 0)), 2), round(coalesce(o.total, 0), 2),
       o.currency, o.coupon, o.payment_method, public.invoice_status_of(o.status, o.payment_status), o.created_at,
       case when o.payment_status = 'paid' then o.created_at end
  from (select * from public.orders o2
         where not exists (select 1 from public.invoices i where i.order_id = o2.id) order by o2.created_at) o
  cross join lateral (select round(coalesce(sum(coalesce((x->>'price')::numeric, 0) * coalesce((x->>'q')::numeric, 0)), 0), 2) as sub
                        from jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) x) s;

-- ---------- الأمان: قراءة فقط للمالك أو الإدارة، والكتابة عبر التريغر فقط ----------
alter table public.invoices enable row level security;
revoke all on public.invoices from anon, authenticated;
grant select on public.invoices to authenticated;
drop policy if exists "invoices read own or staff" on public.invoices;
create policy "invoices read own or staff" on public.invoices for select to authenticated
  using ((select auth.uid()) = user_id or public.has_perm('orders'));

-- ---------- فاتورة واحدة (للعميل صاحبها أو لموظف الطلبات) مع UID العميل ----------
create or replace function public.get_invoice(p_order_id text) returns jsonb
language plpgsql stable security definer set search_path = public as $function$
declare i public.invoices%rowtype; uid text; pay text;
begin
  select * into i from public.invoices where order_id = upper(trim(coalesce(p_order_id, ''))) or invoice_no = upper(trim(coalesce(p_order_id, '')));
  if not found then return null; end if;
  if i.user_id is distinct from auth.uid() and not public.has_perm('orders') then return null; end if;
  select p.uid into uid from public.profiles p where p.id = i.user_id;
  select o.payment_status into pay from public.orders o where o.id = i.order_id;
  return to_jsonb(i) || jsonb_build_object('customer_uid', uid, 'payment_status', pay);
end $function$;

-- ---------- قائمة الفواتير للإدارة: بحث برقم الفاتورة/الطلب/البريد/الاسم/UID ----------
create or replace function public.admin_invoices(p_q text default '', p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = public as $function$
declare q text := trim(coalesce(p_q, '')); lim int := least(greatest(coalesce(p_limit, 100), 1), 300);
begin
  if not public.has_perm('orders') then raise exception 'forbidden' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(r) from (
    select i.id, i.invoice_no, i.order_id, i.customer_name, i.customer_email, i.total, i.currency, i.status,
           i.issued_at, i.paid_at, p.uid as customer_uid
      from public.invoices i left join public.profiles p on p.id = i.user_id
     where q = '' or i.invoice_no ilike '%' || replace(replace(q, '%', ''), '_', '') || '%'
        or i.order_id ilike '%' || replace(replace(q, '%', ''), '_', '') || '%'
        or i.customer_email ilike '%' || replace(replace(q, '%', ''), '_', '') || '%'
        or i.customer_name ilike '%' || replace(replace(q, '%', ''), '_', '') || '%'
        or p.uid = regexp_replace(q, '\D', '', 'g')
     order by i.issued_at desc limit lim) r), '[]'::jsonb);
end $function$;

revoke execute on function public.orders_invoice()          from public, anon, authenticated;
revoke execute on function public.invoice_status_of(text, text) from public, anon, authenticated;
revoke execute on function public.get_invoice(text)         from public, anon;
revoke execute on function public.admin_invoices(text, int) from public, anon;
grant  execute on function public.get_invoice(text)         to authenticated;
grant  execute on function public.admin_invoices(text, int) to authenticated;
