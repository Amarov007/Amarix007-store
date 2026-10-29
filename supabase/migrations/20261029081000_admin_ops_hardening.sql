-- Admin operations hardening: notifications, exact stats, low-balance throttling,
-- published price-change alerts, and disabling the malformed placeholder payment method.
-- This migration is idempotent and keeps financial history intact.

CREATE OR REPLACE FUNCTION public.payments_notify_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE method_label text; amount_label text; proof_label text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('proof_submitted','under_review') THEN RETURN NEW; END IF;
  ELSE
    IF NEW.status NOT IN ('proof_submitted','under_review') THEN RETURN NEW; END IF;
    IF OLD.status IS NOT DISTINCT FROM NEW.status AND OLD.proof_path IS NOT DISTINCT FROM NEW.proof_path THEN RETURN NEW; END IF;
  END IF;
  SELECT COALESCE(NULLIF(to_jsonb(m)->>'name_ar',''),NULLIF(to_jsonb(m)->>'name',''),
                  NULLIF(to_jsonb(m)->>'label',''),NEW.method_id,'غير محددة')
    INTO method_label
  FROM public.payment_methods m WHERE to_jsonb(m)->>'id' = NEW.method_id LIMIT 1;
  method_label := COALESCE(method_label,NEW.method_id,'غير محددة');
  amount_label := COALESCE(NEW.pay_amount,NEW.amount_base,0)::text || ' ' ||
                  COALESCE(NEW.pay_currency,NEW.received_currency,'USD');
  proof_label := CASE WHEN NULLIF(NEW.proof_path,'') IS NULL THEN 'لم يُرفق إيصال بعد'
                      ELSE 'يوجد إيصال مرفق في لوحة الدفع' END;
  PERFORM public.notify_telegram(
    '💳 دفعة بانتظار المراجعة #' || NEW.id::text || E'\n💰 المبلغ: ' || amount_label ||
    E'\n🏦 الوسيلة: ' || method_label || E'\n📌 الغرض: ' || COALESCE(NEW.purpose,'غير محدد') ||
    E'\n🧾 ' || proof_label ||
    CASE WHEN NEW.order_id IS NOT NULL THEN E'\n🛒 الطلب: ' || NEW.order_id ELSE '' END
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS payments_notify_review_insert_trg ON public.payments;
CREATE TRIGGER payments_notify_review_insert_trg AFTER INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.payments_notify_review();
DROP TRIGGER IF EXISTS payments_notify_review_update_trg ON public.payments;
CREATE TRIGGER payments_notify_review_update_trg AFTER UPDATE OF status,proof_path ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.payments_notify_review();

CREATE OR REPLACE FUNCTION public.wallet_topups_notify_pending()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE method_label text;
BEGIN
  IF NEW.status NOT IN ('pending','review','under_review') THEN RETURN NEW; END IF;
  SELECT COALESCE(NULLIF(to_jsonb(m)->>'name_ar',''),NULLIF(to_jsonb(m)->>'name',''),
                  NULLIF(to_jsonb(m)->>'label',''),NEW.payment_method,'غير محددة')
    INTO method_label
  FROM public.payment_methods m WHERE to_jsonb(m)->>'id' = NEW.payment_method LIMIT 1;
  method_label := COALESCE(method_label,NEW.payment_method,'غير محددة');
  PERFORM public.notify_telegram(
    '👛 طلب شحن محفظة جديد #' || NEW.id::text || E'\n💰 المبلغ: ' || NEW.amount::text ||
    ' ' || COALESCE(NEW.pay_currency,'USD') || E'\n🏦 الوسيلة: ' || method_label ||
    E'\n🧾 الإيصال: ' || CASE WHEN NULLIF(NEW.payment_proof,'') IS NULL THEN 'غير مرفق'
                               ELSE 'مرفق في لوحة التحكم' END
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS wallet_topups_notify_pending_trg ON public.wallet_topups;
CREATE TRIGGER wallet_topups_notify_pending_trg AFTER INSERT ON public.wallet_topups
FOR EACH ROW EXECUTE FUNCTION public.wallet_topups_notify_pending();

CREATE TABLE IF NOT EXISTS public.provider_alert_state (
  provider_id text PRIMARY KEY CHECK (provider_id ~ '^[a-z0-9_-]{1,30}$'),
  threshold numeric NOT NULL DEFAULT 5 CHECK (threshold >= 0),
  last_balance numeric,
  last_alert_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provider_alert_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provider_alert_state FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_provider_balance_if_low(
  p_provider text, p_balance numeric, p_currency text DEFAULT ''
)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE s public.provider_alert_state%rowtype; provider_label text;
  cur text := left(coalesce(p_currency,''),12); should_alert boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF coalesce(p_provider,'') !~ '^[a-z0-9_-]{1,30}$' OR p_balance IS NULL OR p_balance < 0 THEN
    RAISE EXCEPTION 'invalid_provider_balance' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.provider_alert_state(provider_id) VALUES (p_provider) ON CONFLICT (provider_id) DO NOTHING;
  SELECT * INTO s FROM public.provider_alert_state WHERE provider_id = p_provider FOR UPDATE;
  SELECT CASE WHEN p_provider = 'main' THEN 'المزوّد الرئيسي' ELSE coalesce(name,p_provider) END
    INTO provider_label FROM public.smm_providers WHERE id = p_provider;
  provider_label := coalesce(provider_label,CASE WHEN p_provider='main' THEN 'المزوّد الرئيسي' ELSE p_provider END);
  should_alert := p_balance <= s.threshold AND (
    s.last_alert_at IS NULL OR s.last_alert_at < now() - interval '6 hours'
    OR (s.last_balance IS NOT NULL AND p_balance < s.last_balance * 0.5)
  );
  UPDATE public.provider_alert_state SET last_balance=p_balance,
    last_alert_at=CASE WHEN should_alert THEN now() ELSE last_alert_at END, updated_at=now()
  WHERE provider_id=p_provider;
  IF should_alert THEN
    PERFORM public.notify_telegram(
      '⚠️ رصيد مزوّد منخفض: ' || provider_label || E'\n💰 الرصيد الحالي: ' || p_balance::text ||
      CASE WHEN cur<>'' THEN ' '||cur ELSE '' END || E'\n🔔 حد التنبيه: ' || s.threshold::text ||
      CASE WHEN cur<>'' THEN ' '||cur ELSE '' END
    );
  END IF;
  RETURN should_alert;
END $function$;
REVOKE ALL ON FUNCTION public.notify_provider_balance_if_low(text,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_provider_balance_if_low(text,numeric,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.config_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  np jsonb := coalesce(new.data->'products','[]'::jsonb);
  op jsonb := coalesce(old.data->'products','[]'::jsonb);
  rec record; n integer:=0; nm text; price_count integer:=0; price_lines text[]:=ARRAY[]::text[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_perm('products') THEN RETURN NULL; END IF;
  IF np IS NOT DISTINCT FROM op THEN RETURN NULL; END IF;
  FOR rec IN
    WITH new_products AS MATERIALIZED (
      SELECT value->>'id' id,value product FROM jsonb_array_elements(np)
      WHERE jsonb_typeof(value)='object' AND value->>'id' IS NOT NULL
    ), old_products AS MATERIALIZED (
      SELECT value->>'id' id,value product FROM jsonb_array_elements(op)
      WHERE jsonb_typeof(value)='object' AND value->>'id' IS NOT NULL
    )
    SELECT coalesce(nn.id,oo.id) id,oo.product old_product,nn.product new_product
    FROM old_products oo FULL OUTER JOIN new_products nn ON nn.id=oo.id
    WHERE oo.product IS DISTINCT FROM nn.product LIMIT 20
  LOOP
    IF rec.old_product IS NULL THEN
      nm:=coalesce(nullif(rec.new_product->>'ar',''),nullif(rec.new_product->>'en',''),rec.id);
      PERFORM public.log_activity('product_add',rec.id,jsonb_build_object('name',nm));
    ELSIF rec.new_product IS NULL THEN
      nm:=coalesce(nullif(rec.old_product->>'ar',''),nullif(rec.old_product->>'en',''),rec.id);
      PERFORM public.log_activity('product_remove',rec.id,jsonb_build_object('name',nm));
    ELSE
      nm:=coalesce(nullif(rec.new_product->>'ar',''),nullif(rec.new_product->>'en',''),rec.id);
      IF rec.old_product->'p' IS DISTINCT FROM rec.new_product->'p'
         OR rec.old_product->'d' IS DISTINCT FROM rec.new_product->'d' THEN
        PERFORM public.log_activity('product_price',rec.id,jsonb_build_object(
          'name',nm,'p_from',rec.old_product->'p','p_to',rec.new_product->'p',
          'd_from',rec.old_product->'d','d_to',rec.new_product->'d'));
        price_count:=price_count+1;
        IF cardinality(price_lines)<8 THEN
          price_lines:=array_append(price_lines,nm||': '||coalesce(rec.old_product->>'p','?')||' → '||coalesce(rec.new_product->>'p','?'));
        END IF;
      ELSE
        PERFORM public.log_activity('product_edit',rec.id,jsonb_build_object('name',nm));
      END IF;
    END IF;
    n:=n+1; EXIT WHEN n>=20;
  END LOOP;
  IF price_count>0 THEN
    BEGIN
      PERFORM public.notify_telegram('📊 تغيّرت أسعار منتجات المتجر بعد النشر (حتى '||price_count||
        ' تغييرات ضمن سجل التدقيق)'||E'\n'||array_to_string(price_lines,E'\n')||
        CASE WHEN price_count>cardinality(price_lines) THEN E'\n… وتغييرات أخرى' ELSE '' END);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END $function$;

CREATE OR REPLACE FUNCTION public.admin_home_stats(p_day_start timestamptz,p_week_start timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR (NOT public.is_admin() AND NOT public.has_perm('orders')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_day_start IS NULL OR p_week_start IS NULL OR p_week_start>p_day_start THEN
    RAISE EXCEPTION 'invalid_period' USING ERRCODE = '22023';
  END IF;
  SELECT jsonb_build_object(
    'sales_today',coalesce(sum(CASE WHEN o.payment_status='paid' AND o.created_at>=p_day_start
      THEN o.total/coalesce(nullif((c.data->'rates'->upper(coalesce(nullif(o.currency,''),'USD'))->>0),'')::numeric,1) ELSE 0 END),0),
    'sales_7d',coalesce(sum(CASE WHEN o.payment_status='paid' AND o.created_at>=p_week_start
      THEN o.total/coalesce(nullif((c.data->'rates'->upper(coalesce(nullif(o.currency,''),'USD'))->>0),'')::numeric,1) ELSE 0 END),0),
    'pending_review',count(*) FILTER(WHERE o.payment_status='review'),
    'open_orders',count(*) FILTER(WHERE o.status IN ('new','processing'))
  ) INTO result FROM public.orders o CROSS JOIN public.store_config c WHERE c.id=1;
  RETURN result;
END $function$;
REVOKE ALL ON FUNCTION public.admin_home_stats(timestamptz,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_home_stats(timestamptz,timestamptz) TO authenticated;

CREATE INDEX IF NOT EXISTS payments_review_queue_idx ON public.payments(status,created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_topups_review_queue_idx ON public.wallet_topups(status,created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_admin_queue_idx ON public.support_tickets(status,created_at DESC);
CREATE INDEX IF NOT EXISTS orders_created_at_desc_idx ON public.orders(created_at DESC);

-- Disable a clearly malformed placeholder account without deleting financial history.
UPDATE public.payment_methods SET enabled=false,updated_at=now()
WHERE id='pmmvgmi1ib8qm' AND enabled IS DISTINCT FROM false;
UPDATE public.store_config sc
SET data=jsonb_set(
  jsonb_set(sc.data,'{payments}',coalesce((
    SELECT jsonb_agg(p ORDER BY ord)
    FROM jsonb_array_elements(coalesce(sc.data->'payments','[]'::jsonb)) WITH ORDINALITY AS x(p,ord)
    WHERE p->>'id'<>'pmmvgmi1ib8qm'
  ),'[]'::jsonb),true),
  '{ts}',to_jsonb(greatest(coalesce(nullif(sc.data->>'ts','')::numeric,0)+1,
                            floor(extract(epoch FROM clock_timestamp())*1000))),true),
  updated_at=now()
WHERE sc.id=1 AND EXISTS(
  SELECT 1 FROM jsonb_array_elements(coalesce(sc.data->'payments','[]'::jsonb)) p
  WHERE p->>'id'='pmmvgmi1ib8qm'
);
