-- =====================================================================
-- AMARIX007 — كمية الرشق بالوحدة الحقيقية (آمن للتشغيل أكثر من مرة)
-- شغّله مرة واحدة في Supabase > SQL Editor بعد رفع الملفات الجديدة.
-- التغيير الوحيد عن النسخة السابقة من الدالة:
--   1) سعر الوحدة يُقرَّب إلى 6 خانات عشرية بدل 2 (سعر المتابع الواحد قد يكون 0.0009)
--   2) الحد الأعلى للكمية في السطر الواحد 10,000,000 بدل 100,000
-- الإجمالي النهائي للطلب يبقى مقرّباً إلى خانتين كما كان.
-- =====================================================================

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
    if qty < 1 or qty <> trunc(qty) or qty > 10000000 then raise exception 'invalid_quantity'; end if;
    -- حدود الكمية التي يحددها المدير لكل منتج (qmin / qmax بالوحدات). تُطبَّق على العملاء فقط.
    if not trusted then
      if qty < greatest(1, coalesce(nullif(p->>'qmin', '')::numeric, 1)) then raise exception 'below_min_quantity'; end if;
      if coalesce(nullif(p->>'qmax', '')::numeric, 0) > 0 and qty > (p->>'qmax')::numeric then raise exception 'above_max_quantity'; end if;
    end if;
    unit := round(coalesce((p->>'p')::numeric, 0) * (1 - coalesce((p->>'d')::numeric, 0) / 100),6);
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

drop trigger if exists orders_enforce_pricing on public.orders;
create trigger orders_enforce_pricing before insert on public.orders for each row execute function public.orders_enforce_pricing();
