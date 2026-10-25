-- =====================================================================
-- AMARIX007 — الموظفون (حسابات بصلاحيات محدودة داخل لوحة الإدارة)
-- الترقية إضافية فقط: لا تغيّر صلاحيات الأدمن الحالية، وتضيف سياسات "OR" جديدة.
-- الصلاحيات المتاحة: orders | tickets | users | products
--   orders  : عرض الطلبات وتغيير (status / payment_status / delivery) فقط
--   tickets : عرض تذاكر الدعم والرد عليها (status / admin_reply / replied_at) فقط
--   users   : عرض قائمة المستخدمين (قراءة فقط)
--   products: تعديل المنتجات ونشرها (دالة staff_save_products تكتب مفتاح products فقط)
--   ملاحظة: إرسال الطلبات لمزوّد الرشق يتم عبر الدالة الطرفية smm-order (صلاحية orders)
-- الموظف لا يصل إلى: store_config، api_settings، الكوبونات، المفاتيح، النشر.
-- =====================================================================

-- ---------- الجدول ----------
create table if not exists public.staff_members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  full_name  text,
  perms      text[] not null default '{}',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  constraint staff_members_perms_valid check (perms <@ array['orders','tickets','users','products']::text[])
);
alter table public.staff_members enable row level security;

drop policy if exists "staff admin all" on public.staff_members;
create policy "staff admin all" on public.staff_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "staff read self" on public.staff_members;
create policy "staff read self" on public.staff_members for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------- الدوال ----------
-- هل المستخدم الحالي أدمن، أو موظف مفعّل يملك هذه الصلاحية؟
create or replace function public.has_perm(p text) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select public.is_admin() or exists (
    select 1 from public.staff_members s
     where s.user_id = auth.uid() and s.active and p = any (s.perms));
$$;

-- صلاحيات الموظف الحالي (null إن لم يكن موظفاً مفعّلاً)
create or replace function public.my_staff_perms() returns text[]
language sql stable security definer set search_path = public, auth as $$
  select (select s.perms from public.staff_members s where s.user_id = auth.uid() and s.active);
$$;

revoke execute on function public.has_perm(text)    from public, anon;
revoke execute on function public.my_staff_perms()  from public, anon;
grant  execute on function public.has_perm(text)    to authenticated, service_role;
grant  execute on function public.my_staff_perms()  to authenticated, service_role;

-- ---------- سياسات الجداول (إضافية) ----------
drop policy if exists "staff orders read" on public.orders;
create policy "staff orders read" on public.orders for select to authenticated
  using (public.has_perm('orders'));
drop policy if exists "staff orders update" on public.orders;
create policy "staff orders update" on public.orders for update to authenticated
  using (public.has_perm('orders')) with check (public.has_perm('orders'));

drop policy if exists "staff tickets read" on public.support_tickets;
create policy "staff tickets read" on public.support_tickets for select to authenticated
  using (public.has_perm('tickets'));
drop policy if exists "staff tickets update" on public.support_tickets;
create policy "staff tickets update" on public.support_tickets for update to authenticated
  using (public.has_perm('tickets')) with check (public.has_perm('tickets'));

drop policy if exists "staff profiles read" on public.profiles;
create policy "staff profiles read" on public.profiles for select to authenticated
  using (public.has_perm('users'));

-- إثباتات الدفع وصور التذاكر (تُقرأ عبر روابط موقّعة)
drop policy if exists "staff proofs read" on storage.objects;
create policy "staff proofs read" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and public.has_perm('orders'));
drop policy if exists "staff ticket files read" on storage.objects;
create policy "staff ticket files read" on storage.objects for select to authenticated
  using (bucket_id = 'ticket-files' and public.has_perm('tickets'));

-- ---------- حماية الأعمدة ----------
-- الموظف (وليس الأدمن) لا يستطيع تغيير غير الحقول المسموحة حتى لو أرسل طلباً مباشراً.
-- الفحص بـ current_user يستثني دوال العملاء (security definer مثل رفع إثبات الدفع).
create or replace function public.orders_staff_guard() returns trigger
language plpgsql set search_path = public as $function$
begin
  if auth.uid() is null or current_user <> 'authenticated' or public.is_admin() then return new; end if;
  new.id := old.id;                         new.created_at := old.created_at;
  new.customer_name := old.customer_name;   new.customer_email := old.customer_email;
  new.items := old.items;                   new.total := old.total;
  new.lang := old.lang;                     new.affiliate_ref := old.affiliate_ref;
  new.user_id := old.user_id;               new.currency := old.currency;
  new.coupon := old.coupon;                 new.payment_method := old.payment_method;
  new.smm := old.smm;                       new.smm_status := old.smm_status;
  new.affiliate_commission := old.affiliate_commission;
  new.payment_proof := old.payment_proof;   new.pay_currency := old.pay_currency;
  new.delivered_at := old.delivered_at;     new.reminded_at := old.reminded_at;   -- المسموح للموظف: status / payment_status / delivery
  return new;
end $function$;

drop trigger if exists orders_a_staff_guard_trg on public.orders;
create trigger orders_a_staff_guard_trg before update on public.orders
  for each row execute function public.orders_staff_guard();

create or replace function public.tickets_staff_guard() returns trigger
language plpgsql set search_path = public as $function$
begin
  if auth.uid() is null or current_user <> 'authenticated' or public.is_admin() then return new; end if;
  new.id := old.id;                         new.created_at := old.created_at;
  new.user_id := old.user_id;               new.customer_name := old.customer_name;
  new.customer_email := old.customer_email; new.order_id := old.order_id;
  new.subject := old.subject;               new.message := old.message;
  new.attachment := old.attachment;         new.lang := old.lang;
  new.resolved := old.resolved;             new.rated_at := old.rated_at;
  new.email_status := old.email_status;     -- المسموح للموظف: status / admin_reply / replied_at
  return new;
end $function$;

drop trigger if exists tickets_a_staff_guard_trg on public.support_tickets;
create trigger tickets_a_staff_guard_trg before update on public.support_tickets
  for each row execute function public.tickets_staff_guard();

revoke execute on function public.orders_staff_guard()  from public, anon, authenticated;
revoke execute on function public.tickets_staff_guard() from public, anon, authenticated;

-- ---------- صلاحية المنتجات ----------
-- (تحديث الـ constraint أعلاه مطبّق في القاعدة الحية بالتعديل التالي)
create or replace function public.staff_save_products(p_products jsonb, p_base_ts numeric default 0) returns numeric
language plpgsql security definer set search_path = public as $function$
declare cur numeric; new_ts numeric := floor(extract(epoch from clock_timestamp()) * 1000);
begin
  if auth.uid() is null or not public.has_perm('products') then raise exception 'forbidden'; end if;
  if jsonb_typeof(p_products) <> 'array' or jsonb_array_length(p_products) > 500
     or pg_column_size(p_products) > 1500000 then raise exception 'invalid_products'; end if;
  if exists (select 1 from jsonb_array_elements(p_products) e
              where jsonb_typeof(e) <> 'object' or coalesce(e->>'id', '') !~ '^[A-Za-z0-9_-]{1,60}$') then
    raise exception 'invalid_product';
  end if;
  select coalesce(nullif(data->>'ts', '')::numeric, 0) into cur from public.store_config where id = 1 for update;
  if cur > coalesce(p_base_ts, 0) then raise exception 'stale'; end if;
  update public.store_config
     set data = jsonb_set(data, '{products}', p_products) || jsonb_build_object('ts', new_ts),
         updated_at = now()
   where id = 1;
  return new_ts;
end $function$;
revoke execute on function public.staff_save_products(jsonb, numeric) from public, anon;
grant  execute on function public.staff_save_products(jsonb, numeric) to authenticated, service_role;

drop policy if exists "staff media insert" on storage.objects;
create policy "staff media insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'store-media' and public.has_perm('products'));
drop policy if exists "staff media update" on storage.objects;
create policy "staff media update" on storage.objects for update to authenticated
  using (bucket_id = 'store-media' and public.has_perm('products'));

-- ---------- الأدوار + سجل النشاط + تنبيهات تلغرام (مطبّقة على القاعدة الحية) ----------
-- staff_members.role : اسم دور جاهز للعرض فقط (الصلاحيات الفعلية في perms)
-- staff_activity     : سجل يكتبه الخادم فقط (triggers + الدالة الطرفية smm-order)، قراءته للأدمن فقط
--   يسجَّل: حالات الطلبات والدفع، الرد/حالة التذاكر، المنتجات (إضافة/تعديل/سعر/حذف)،
--           الإرسال للرشق، إدارة الموظفين. لا يسجَّل نص الرد ولا نص التسليم.
-- تنبيه تلغرام عبر notify_telegram() عند أفعال الموظف (وليس الأدمن) التالية:
--   order_paid, smm_send, product_price, product_add, product_remove
-- التنظيف: وظيفة cron أسبوعية تحذف ما هو أقدم من 180 يوماً.
-- (نص الـ migration الكامل موجود في سجل migrations بمشروع Supabase باسم staff_activity_roles_alerts)
