CREATE OR REPLACE FUNCTION public.orders_enforce_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  cfg jsonb; prods jsonb; it jsonb; p jsonb; newitems jsonb := '[]'::jsonb;
  qty numeric; unit numeric; sub numeric := 0; disc numeric := 0; cp jsonb; code text;
  base_cur text; trusted boolean;
BEGIN
  trusted := auth.uid() IS NULL OR public.is_admin();

  IF NOT trusted AND NOT public.rl_hit('order:' || auth.uid()::text, 10, 3600) THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  IF NOT trusted OR new.id IS NULL OR new.id = '' THEN
    new.id := 'AMX-' || nextval('public.orders_seq')::text;
  END IF;

  SELECT data INTO cfg FROM public.store_config WHERE id = 1;
  prods := COALESCE(cfg->'products', '[]'::jsonb);

  IF jsonb_typeof(new.items) <> 'array' OR jsonb_array_length(new.items) = 0 THEN RAISE EXCEPTION 'invalid_items'; END IF;
  IF jsonb_array_length(new.items) > 50 THEN RAISE EXCEPTION 'too_many_items'; END IF;
  IF new.id !~ '^AMX-[A-Z0-9]{3,30}$' THEN RAISE EXCEPTION 'invalid_order_id'; END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(new.items) LOOP
    SELECT x INTO p FROM jsonb_array_elements(prods) x WHERE x->>'id' = it->>'id' LIMIT 1;
    IF p IS NULL THEN RAISE EXCEPTION 'unknown_product %', it->>'id'; END IF;
    IF NOT trusted AND (p->>'k' = 'link' OR COALESCE((p->>'p')::numeric, 0) <= 0) THEN
      RAISE EXCEPTION 'not_orderable %', it->>'id';
    END IF;
    qty := COALESCE(NULLIF(it->>'q','')::numeric, 0);
    IF qty < 1 OR qty <> trunc(qty) OR qty > 10000000 THEN RAISE EXCEPTION 'invalid_quantity'; END IF;
    IF NOT trusted THEN
      IF qty < greatest(1, COALESCE(NULLIF(p->>'qmin', '')::numeric, 1)) THEN RAISE EXCEPTION 'below_min_quantity'; END IF;
      IF COALESCE(NULLIF(p->>'qmax', '')::numeric, 0) > 0 AND qty > (p->>'qmax')::numeric THEN RAISE EXCEPTION 'above_max_quantity'; END IF;
    END IF;
    unit := round(COALESCE((p->>'p')::numeric, 0) * (1 - COALESCE((p->>'d')::numeric, 0) / 100), 6);
    sub := sub + unit * qty;
    newitems := newitems || jsonb_build_object(
      'id', p->>'id', 'q', qty, 'price', unit,
      'ar', COALESCE(p->>'ar', ''), 'en', COALESCE(p->>'en', ''),
      'name', CASE WHEN new.lang = 'en' THEN COALESCE(NULLIF(p->>'en', ''), p->>'ar', '')
                   ELSE COALESCE(NULLIF(p->>'ar', ''), p->>'en', '') END,
      'link', left(COALESCE(it->>'link', ''), 500));
  END LOOP;

  code := upper(trim(COALESCE(new.coupon, '')));
  IF code <> '' THEN
    cp := cfg->'coupons'->code;
    IF cp IS NULL OR jsonb_typeof(cp) <> 'array' OR NOT public.coupon_usable(cp, code) THEN
      IF trusted THEN new.coupon := NULL; ELSE RAISE EXCEPTION 'coupon_invalid'; END IF;
    ELSE
      new.coupon := code;
      disc := least(sub, sub * COALESCE((cp->>0)::numeric, 0) / 100 + COALESCE((cp->>1)::numeric, 0));
    END IF;
  ELSE
    new.coupon := NULL;
  END IF;

  new.items := newitems;
  new.total := round(greatest(0, sub - disc), 2);

  IF NOT trusted THEN
    SELECT e.key INTO base_cur
      FROM jsonb_each(COALESCE(cfg->'rates', '{}'::jsonb)) e
     WHERE jsonb_typeof(e.value) = 'array' AND jsonb_typeof(e.value->0) = 'number'
       AND (e.value->>0)::numeric = 1 LIMIT 1;
    new.currency := COALESCE(base_cur, 'SAR');
    IF new.lang IS NULL OR new.lang NOT IN ('ar','en') THEN new.lang := 'ar'; END IF;
    IF new.payment_method IS NOT NULL AND new.payment_method !~ '^[a-z0-9_-]{1,40}$' THEN new.payment_method := NULL; END IF;
    new.customer_email := COALESCE(NULLIF(auth.jwt() ->> 'email', ''), new.customer_email);
    new.customer_name := left(COALESCE(new.customer_name, ''), 120);
    new.created_at := now();
    new.pay_currency := CASE WHEN upper(COALESCE(new.pay_currency, '')) ~ '^[A-Z]{3,10}$'
                             THEN upper(new.pay_currency) ELSE NULL END;
    new.status := 'new';
    new.payment_status := 'pending';
    new.affiliate_ref := NULL;
    new.affiliate_commission := 0;
    new.smm := NULL;
    new.smm_status := NULL;

    -- These fields are owned by trusted payment/fulfillment workflows, never by checkout input.
    new.payment_proof := NULL;
    new.payment_tx_ref := NULL;
    new.payment_reviewed_at := NULL;
    new.payment_reviewed_by := NULL;
    new.delivery := NULL;
    new.delivered_at := NULL;
    new.reminded_at := NULL;
  END IF;

  RETURN new;
END
$function$;

CREATE OR REPLACE FUNCTION public.orders_staff_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR current_user <> 'authenticated' OR public.is_admin() THEN
    RETURN new;
  END IF;

  new.id := old.id;
  new.created_at := old.created_at;
  new.customer_name := old.customer_name;
  new.customer_email := old.customer_email;
  new.items := old.items;
  new.total := old.total;
  new.lang := old.lang;
  new.affiliate_ref := old.affiliate_ref;
  new.user_id := old.user_id;
  new.currency := old.currency;
  new.coupon := old.coupon;
  new.payment_method := old.payment_method;
  new.smm := old.smm;
  new.smm_status := old.smm_status;
  new.affiliate_commission := old.affiliate_commission;
  new.payment_proof := old.payment_proof;
  new.pay_currency := old.pay_currency;
  new.delivered_at := old.delivered_at;
  new.reminded_at := old.reminded_at;
  new.payment_tx_ref := old.payment_tx_ref;
  new.payment_reviewed_at := old.payment_reviewed_at;
  new.payment_reviewed_by := old.payment_reviewed_by;

  RETURN new;
END
$function$;

-- Staff can change order workflow status only. Financial, identity, proof and fulfillment
-- fields are changed through guarded SECURITY DEFINER RPCs / service-role workflows.
REVOKE UPDATE ON public.orders FROM authenticated;
GRANT UPDATE (status) ON public.orders TO authenticated;
