-- AMARIX007: enforce the Payments V2 safety gate at the data layer.
-- This is intentionally fail-closed until payment/refund/fulfillment E2E sign-off.
-- It preserves all other store_config keys and all existing financial/user data.

CREATE OR REPLACE FUNCTION public.store_config_enforce_payments_v2_off()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  v_payments jsonb;
BEGIN
  IF NEW.data IS NULL OR jsonb_typeof(NEW.data) <> 'object' THEN
    RAISE EXCEPTION 'invalid_store_config_data' USING ERRCODE = '22023';
  END IF;

  v_payments := CASE
    WHEN jsonb_typeof(NEW.data->'payments_v2') = 'object'
      THEN NEW.data->'payments_v2'
    ELSE '{}'::jsonb
  END;

  NEW.data := jsonb_set(
    NEW.data,
    '{payments_v2}',
    jsonb_set(v_payments, '{on}', 'false'::jsonb, true),
    true
  );
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.store_config_enforce_payments_v2_off() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS store_config_payments_v2_off_trg ON public.store_config;
CREATE TRIGGER store_config_payments_v2_off_trg
BEFORE INSERT OR UPDATE OF data ON public.store_config
FOR EACH ROW
EXECUTE FUNCTION public.store_config_enforce_payments_v2_off();

CREATE OR REPLACE FUNCTION public.publish_store_config(
  p_base_ts numeric,
  p_patch jsonb DEFAULT '{}'::jsonb,
  p_product_upserts jsonb DEFAULT '[]'::jsonb,
  p_product_delete_ids text[] DEFAULT '{}'::text[],
  p_product_order text[] DEFAULT NULL::text[]
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
  IF coalesce(p_patch, '{}'::jsonb) ?| ARRAY['products','ts','api','payments_v2'] THEN
    RAISE EXCEPTION 'invalid_publish_patch' USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_admin() AND coalesce(p_patch, '{}'::jsonb) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'forbidden_patch' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(coalesce(p_product_upserts, '[]'::jsonb)) e
    WHERE jsonb_typeof(e) <> 'object'
       OR coalesce(e->>'id','') !~ '^[A-Za-z0-9_-]{1,60}$'
  ) THEN
    RAISE EXCEPTION 'invalid_product' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT e->>'id')
      FROM jsonb_array_elements(coalesce(p_product_upserts, '[]'::jsonb)) e) THEN
    RAISE EXCEPTION 'duplicate_product_id' USING ERRCODE = '22023';
  END IF;
  IF p_product_order IS NOT NULL
     AND (SELECT count(*) <> count(DISTINCT x) FROM unnest(p_product_order) x) THEN
    RAISE EXCEPTION 'duplicate_product_order_id' USING ERRCODE = '22023';
  END IF;

  SELECT data INTO current_data
  FROM public.store_config
  WHERE id = 1
  FOR UPDATE;
  IF current_data IS NULL THEN
    RAISE EXCEPTION 'store_config_missing' USING ERRCODE = 'P0002';
  END IF;
  current_ts := coalesce(nullif(current_data->>'ts','')::numeric, 0);
  IF current_ts > coalesce(p_base_ts, 0) THEN
    RAISE EXCEPTION 'stale' USING ERRCODE = '40001';
  END IF;
  current_products := coalesce(current_data->'products', '[]'::jsonb);

  IF p_product_order IS NOT NULL THEN
    WITH current_rows AS MATERIALIZED (
      SELECT value->>'id' AS id, value AS product
      FROM jsonb_array_elements(current_products)
      WHERE jsonb_typeof(value) = 'object' AND value->>'id' IS NOT NULL
    ),
    upsert_rows AS MATERIALIZED (
      SELECT value->>'id' AS id, value AS product
      FROM jsonb_array_elements(coalesce(p_product_upserts, '[]'::jsonb))
    ),
    requested AS (
      SELECT id, ord
      FROM unnest(p_product_order) WITH ORDINALITY AS x(id, ord)
    ),
    merged AS (
      SELECT coalesce(u.product, c.product) AS product, r.ord
      FROM requested r
      LEFT JOIN current_rows c ON c.id = r.id
      LEFT JOIN upsert_rows u ON u.id = r.id
      WHERE coalesce(u.product, c.product) IS NOT NULL
    )
    SELECT coalesce(jsonb_agg(product ORDER BY ord), '[]'::jsonb), count(*)
      INTO merged_products, final_count
    FROM merged;
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
      FROM current_rows c
      LEFT JOIN upsert_rows u ON u.id = c.id
      WHERE NOT (c.id = ANY(coalesce(p_product_delete_ids, '{}'::text[])))
      UNION ALL
      SELECT u.product, 2000000000 + u.ord
      FROM upsert_rows u
      WHERE NOT EXISTS (SELECT 1 FROM current_rows c WHERE c.id = u.id)
        AND NOT (u.id = ANY(coalesce(p_product_delete_ids, '{}'::text[])))
    )
    SELECT coalesce(jsonb_agg(product ORDER BY ord), '[]'::jsonb), count(*)
      INTO merged_products, final_count
    FROM merged;
  END IF;

  IF final_count > 20000 THEN
    RAISE EXCEPTION 'too_many_products' USING ERRCODE = '22023';
  END IF;

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

-- Repair the inconsistent live value; the trigger also prevents future re-enabling.
UPDATE public.store_config
SET data = jsonb_set(
  jsonb_set(
    COALESCE(data, '{}'::jsonb),
    '{payments_v2}',
    CASE WHEN jsonb_typeof(data->'payments_v2') = 'object' THEN data->'payments_v2' ELSE '{}'::jsonb END,
    true
  ),
  '{payments_v2,on}',
  'false'::jsonb,
  true
),
updated_at = now()
WHERE id = 1
  AND COALESCE(data->'payments_v2'->>'on', 'false') <> 'false';
