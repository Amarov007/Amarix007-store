-- Live-safe publish performance fix for Supabase project pvuobngrybygohendwaz.
-- Replaces quadratic nested scans in config_activity with a single FULL JOIN keyed by product id.
CREATE OR REPLACE FUNCTION public.config_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  np jsonb := coalesce(new.data->'products', '[]'::jsonb);
  op jsonb := coalesce(old.data->'products', '[]'::jsonb);
  rec record;
  n integer := 0;
  nm text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_perm('products') THEN RETURN NULL; END IF;
  IF np IS NOT DISTINCT FROM op THEN RETURN NULL; END IF;
  FOR rec IN
    WITH new_products AS MATERIALIZED (
      SELECT value->>'id' AS id, value AS product
      FROM jsonb_array_elements(np)
      WHERE jsonb_typeof(value) = 'object' AND value->>'id' IS NOT NULL
    ),
    old_products AS MATERIALIZED (
      SELECT value->>'id' AS id, value AS product
      FROM jsonb_array_elements(op)
      WHERE jsonb_typeof(value) = 'object' AND value->>'id' IS NOT NULL
    )
    SELECT coalesce(nn.id, oo.id) AS id, oo.product AS old_product, nn.product AS new_product
    FROM old_products oo
    FULL OUTER JOIN new_products nn ON nn.id = oo.id
    WHERE oo.product IS DISTINCT FROM nn.product
    LIMIT 20
  LOOP
    IF rec.old_product IS NULL THEN
      nm := coalesce(nullif(rec.new_product->>'ar',''), nullif(rec.new_product->>'en',''), rec.id);
      PERFORM public.log_activity('product_add', rec.id, jsonb_build_object('name', nm));
    ELSIF rec.new_product IS NULL THEN
      nm := coalesce(nullif(rec.old_product->>'ar',''), nullif(rec.old_product->>'en',''), rec.id);
      PERFORM public.log_activity('product_remove', rec.id, jsonb_build_object('name', nm));
    ELSE
      nm := coalesce(nullif(rec.new_product->>'ar',''), nullif(rec.new_product->>'en',''), rec.id);
      IF (rec.old_product->'p') IS DISTINCT FROM (rec.new_product->'p')
         OR (rec.old_product->'d') IS DISTINCT FROM (rec.new_product->'d') THEN
        PERFORM public.log_activity('product_price', rec.id, jsonb_build_object(
          'name', nm, 'p_from', rec.old_product->'p', 'p_to', rec.new_product->'p',
          'd_from', rec.old_product->'d', 'd_to', rec.new_product->'d'));
      ELSE
        PERFORM public.log_activity('product_edit', rec.id, jsonb_build_object('name', nm));
      END IF;
    END IF;
    n := n + 1;
    EXIT WHEN n >= 20;
  END LOOP;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Activity logging must not block an otherwise valid store publish.
  RETURN NULL;
END
$function$;

-- Atomic diff publishing. Product records are merged by id while unchanged
-- JSON is retained server-side; optimistic timestamp protects concurrent edits.
CREATE OR REPLACE FUNCTION public.publish_store_config(
  p_base_ts numeric,
  p_patch jsonb DEFAULT '{}'::jsonb,
  p_product_upserts jsonb DEFAULT '[]'::jsonb,
  p_product_delete_ids text[] DEFAULT '{}'::text[],
  p_product_order text[] DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_data jsonb;
  current_products jsonb;
  merged_products jsonb;
  current_ts numeric;
  new_ts numeric;
  final_count integer;
BEGIN
  IF auth.uid() IS NULL OR (NOT public.is_admin() AND NOT public.has_perm('products')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(coalesce(p_patch, '{}'::jsonb)) <> 'object'
     OR jsonb_typeof(coalesce(p_product_upserts, '[]'::jsonb)) <> 'array'
     OR coalesce(array_length(p_product_delete_ids, 1), 0) > 20000
     OR coalesce(cardinality(p_product_order), 0) > 20000
     OR pg_column_size(coalesce(p_patch, '{}'::jsonb)) > 1500000
     OR pg_column_size(coalesce(p_product_upserts, '[]'::jsonb)) > 1500000 THEN
    RAISE EXCEPTION 'invalid_publish_payload' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_patch, '{}'::jsonb) ?| ARRAY['products','ts','api'] THEN
    RAISE EXCEPTION 'invalid_publish_patch' USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_admin() AND coalesce(p_patch, '{}'::jsonb) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'forbidden_patch' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_product_upserts, '[]'::jsonb)) e
    WHERE jsonb_typeof(e) <> 'object' OR coalesce(e->>'id','') !~ '^[A-Za-z0-9_-]{1,60}$') THEN
    RAISE EXCEPTION 'invalid_product' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT e->>'id')
      FROM jsonb_array_elements(coalesce(p_product_upserts, '[]'::jsonb)) e) THEN
    RAISE EXCEPTION 'duplicate_product_id' USING ERRCODE = '22023';
  END IF;
  IF p_product_order IS NOT NULL AND
     (SELECT count(*) <> count(DISTINCT x) FROM unnest(p_product_order) x) THEN
    RAISE EXCEPTION 'duplicate_product_order_id' USING ERRCODE = '22023';
  END IF;
  SELECT data INTO current_data FROM public.store_config WHERE id = 1 FOR UPDATE;
  IF current_data IS NULL THEN RAISE EXCEPTION 'store_config_missing' USING ERRCODE = 'P0002'; END IF;
  current_ts := coalesce(nullif(current_data->>'ts','')::numeric, 0);
  IF current_ts > coalesce(p_base_ts, 0) THEN RAISE EXCEPTION 'stale' USING ERRCODE = '40001'; END IF;
  current_products := coalesce(current_data->'products', '[]'::jsonb);

  IF p_product_order IS NOT NULL THEN
    WITH current_rows AS MATERIALIZED (
      SELECT value->>'id' AS id, value AS product FROM jsonb_array_elements(current_products)
      WHERE jsonb_typeof(value) = 'object' AND value->>'id' IS NOT NULL
    ),
    upsert_rows AS MATERIALIZED (
      SELECT value->>'id' AS id, value AS product FROM jsonb_array_elements(coalesce(p_product_upserts, '[]'::jsonb))
    ),
    requested AS (SELECT id, ord FROM unnest(p_product_order) WITH ORDINALITY AS x(id, ord)),
    merged AS (
      SELECT coalesce(u.product, c.product) AS product, r.ord
      FROM requested r LEFT JOIN current_rows c ON c.id = r.id LEFT JOIN upsert_rows u ON u.id = r.id
      WHERE coalesce(u.product, c.product) IS NOT NULL
    )
    SELECT coalesce(jsonb_agg(product ORDER BY ord), '[]'::jsonb), count(*)
      INTO merged_products, final_count FROM merged;
    IF final_count <> cardinality(p_product_order) THEN
      RAISE EXCEPTION 'missing_product_in_publish_order' USING ERRCODE = '22023';
    END IF;
  ELSE
    WITH current_rows AS MATERIALIZED (
      SELECT value->>'id' AS id, value AS product, ord
      FROM jsonb_array_elements(current_products) WITH ORDINALITY AS x(value, ord)
      WHERE jsonb_typeof(value) = 'object' AND value->>'id' IS NOT NULL
    ),
    upsert_rows AS MATERIALIZED (
      SELECT value->>'id' AS id, value AS product, ord
      FROM jsonb_array_elements(coalesce(p_product_upserts, '[]'::jsonb)) WITH ORDINALITY AS x(value, ord)
    ),
    merged AS (
      SELECT coalesce(u.product, c.product) AS product, c.ord AS ord
      FROM current_rows c LEFT JOIN upsert_rows u ON u.id = c.id
      WHERE NOT (c.id = ANY(coalesce(p_product_delete_ids, '{}'::text[])))
      UNION ALL
      SELECT u.product, 2000000000 + u.ord
      FROM upsert_rows u
      WHERE NOT EXISTS (SELECT 1 FROM current_rows c WHERE c.id = u.id)
        AND NOT (u.id = ANY(coalesce(p_product_delete_ids, '{}'::text[])))
    )
    SELECT coalesce(jsonb_agg(product ORDER BY ord), '[]'::jsonb), count(*)
      INTO merged_products, final_count FROM merged;
  END IF;
  IF final_count > 20000 THEN RAISE EXCEPTION 'too_many_products' USING ERRCODE = '22023'; END IF;
  new_ts := greatest(floor(extract(epoch FROM clock_timestamp()) * 1000), current_ts + 1);
  UPDATE public.store_config
  SET data = ((current_data - 'products' - 'ts' - 'api') || coalesce(p_patch, '{}'::jsonb))
             || jsonb_build_object('products', merged_products, 'ts', new_ts),
      updated_at = now()
  WHERE id = 1;
  RETURN new_ts;
END
$function$;

REVOKE ALL ON FUNCTION public.publish_store_config(numeric, jsonb, jsonb, text[], text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_store_config(numeric, jsonb, jsonb, text[], text[]) TO authenticated;

-- Missing foreign-key and admin-queue indexes reported by the live performance advisor.
CREATE INDEX IF NOT EXISTS affiliate_commissions_payment_id_idx ON public.affiliate_commissions(payment_id);
CREATE INDEX IF NOT EXISTS fulfillment_jobs_payment_id_idx ON public.fulfillment_jobs(payment_id);
CREATE INDEX IF NOT EXISTS orders_payment_reviewed_by_idx ON public.orders(payment_reviewed_by);
CREATE INDEX IF NOT EXISTS payment_review_events_actor_id_idx ON public.payment_review_events(actor_id);
CREATE INDEX IF NOT EXISTS payment_review_events_order_id_idx ON public.payment_review_events(order_id);
CREATE INDEX IF NOT EXISTS payments_method_id_idx ON public.payments(method_id);
CREATE INDEX IF NOT EXISTS orders_admin_queue_idx ON public.orders(status, payment_status, created_at DESC);
