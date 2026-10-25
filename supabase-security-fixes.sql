-- =====================================================================
-- AMARIX007 — ترقية الأمان للقواعد القديمة (محدَّث 2026-10-22 ليطابق القاعدة الحية)
-- آمن لإعادة التشغيل. لا يحذف بيانات. للقاعدة الجديدة استخدم supabase-schema.sql فقط.
-- شغّل هذا الملف كاملاً في Supabase > SQL Editor ثم انشر app.js/admin.js.
-- يتطلب وجود الدوال والجداول من supabase-schema.sql (rl_hit, coupon_usable, rate_limits ...)،
-- فإن كانت قاعدتك قديمة جداً شغّل supabase-schema.sql بدلاً منه.
-- =====================================================================

-- 1) صلاحية الأدمن: ربط بـ auth.uid() + بريد مؤكَّد
alter table public.admins add column if not exists user_id uuid references auth.users(id) on delete cascade;
update public.admins a set user_id = u.id from auth.users u
 where a.user_id is null and lower(u.email)=lower(a.email) and u.email_confirmed_at is not null;
do $$ begin
  if not exists (select 1 from public.admins where user_id is not null) then
    raise exception 'no admin linked to a confirmed account';
  end if;
end $$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.admins a
     where a.user_id is not null and a.user_id = auth.uid());
$$;

-- 2) store_config: القراءة المباشرة للأدمن فقط (كانت للعامة وتكشف الكوبونات السرية)
drop policy if exists "config read" on public.store_config;
create policy "config read" on public.store_config for select to authenticated using (public.is_admin());

-- 3) المتجر يقرأ الإعدادات عبر public_config() بدون الكوبونات السرية
create or replace function public.public_config() returns jsonb
language sql stable security definer set search_path = public as $function$
  select (coalesce(data, '{}'::jsonb) - 'coupons')
         || jsonb_build_object('coupons', coalesce((
              select jsonb_object_agg(e.key, jsonb_build_array(e.value->0, e.value->1, 1))
                from jsonb_each(case when jsonb_typeof(data->'coupons') = 'object' then data->'coupons' else '{}'::jsonb end) e
               where jsonb_typeof(e.value) = 'array' and coalesce(e.value->>2, '0') = '1'
                 and public.coupon_usable(e.value, e.key)
            ), '{}'::jsonb))
    from public.store_config where id = 1;
$function$;

-- 4) التسعير على الخادم يعمل بصلاحية security definer
alter function public.orders_enforce_pricing() security definer;
alter function public.orders_enforce_pricing() set search_path = public;

-- 5) «تم الدفع» يشترط وجود إثبات دفع مرفوع
create or replace function public.claim_payment(p_order_id text) returns void
language plpgsql security definer set search_path = public as $function$
begin
  update public.orders set payment_status = 'review'
   where id = p_order_id and user_id = auth.uid()
     and coalesce(payment_status, 'pending') = 'pending' and status <> 'cancelled'
     and payment_proof is not null and payment_proof <> '';
  if not found then
    if exists (select 1 from public.orders where id = p_order_id and user_id = auth.uid() and payment_status in ('review', 'paid')) then return; end if;
    if exists (select 1 from public.orders where id = p_order_id and user_id = auth.uid()
                and coalesce(payment_status, 'pending') = 'pending' and status <> 'cancelled') then
      raise exception 'proof_required';
    end if;
    raise exception 'not_allowed';
  end if;
end $function$;


-- 9) تحديد معدّل لا يُتجاوز عند غياب IP + تنظيف created_at/pay_currency + keepalive
create or replace function public.check_coupon(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $function$
declare code text := upper(trim(coalesce(p_code, ''))); ip text := public.client_ip(); cp jsonb;
begin
  if code !~ '^[A-Z0-9_-]{1,40}$' then return null; end if;
  if not public.rl_hit('coupon:' || ip, case when ip = 'unknown' then 120 else 30 end, 600) then return null; end if;
  select data->'coupons'->code into cp from public.store_config where id = 1;
  if cp is null or jsonb_typeof(cp) <> 'array' or not public.coupon_usable(cp, code) then return null; end if;
  return jsonb_build_array(cp->0, cp->1);
end $function$;

create or replace function public.track_ref_click(p_code text) returns void
language plpgsql security definer set search_path = public as $function$
declare ip text := public.client_ip();
begin
  if p_code !~ '^[A-Za-z0-9]{6,12}$' then return; end if;
  if ip = 'unknown' then return; end if;
  if not public.rl_hit('refclk:' || ip || ':' || upper(p_code), 1, 86400) then return; end if;
  if not public.rl_hit('refclk-ip:' || ip, 20, 3600) then return; end if;
  update public.affiliates set clicks = coalesce(clicks, 0) + 1
   where user_id = (select id from public.profiles where ref_code = upper(p_code));
end $function$;

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

create or replace function public.keepalive_ping() returns void
language plpgsql security definer set search_path = public, extensions as $function$
begin
  update public.keepalive set last_ping = now(), pings = pings + 1 where id = 1;
  perform net.http_post(
    url := 'https://pvuobngrybygohendwaz.supabase.co/rest/v1/rpc/public_config',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2dW9ibmdyeWJ5Z29oZW5kd2F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzMTI0ODIsImV4cCI6MjEwNzg4ODQ4Mn0.enSKw1_Wt58iK8-Y0eaHMWtBGQ7HyYXP_JEwYLsSfpU',
      'Content-Type', 'application/json')
  );
end $function$;

-- 6) صلاحيات تنفيذ الدوال: العامة فقط ما يلزم
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function public.public_config()            to anon, authenticated;
grant execute on function public.check_coupon(text)         to anon, authenticated;
grant execute on function public.track_ref_click(text)      to anon, authenticated;
grant execute on function public.is_admin()                 to authenticated;
grant execute on function public.my_proof_count()           to authenticated;
grant execute on function public.set_payment_proof(text, text) to authenticated;
grant execute on function public.claim_payment(text)        to authenticated;

-- 7) إصلاح keepalive: يجب أن يستدعي public_config (لا store_config) وإلا يعطي 401.
--    الدالة الكاملة (مع YOUR_PROJECT_REF / YOUR_ANON_KEY) موجودة في supabase-schema.sql — شغّل مقطعها هناك.

-- 8) يدوياً من لوحة Supabase: Authentication > Providers > Email > فعّل «Leaked password protection».
