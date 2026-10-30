-- Large catalog publishing: stage bounded chunks, then atomically commit once.
CREATE TABLE IF NOT EXISTS public.store_config_publish_batches (
  batch_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  base_ts numeric NOT NULL,
  patch jsonb NOT NULL DEFAULT '{}'::jsonb,
  delete_ids text[] NOT NULL DEFAULT '{}'::text[],
  product_order text[],
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.store_config_publish_items (
  batch_id uuid NOT NULL REFERENCES public.store_config_publish_batches(batch_id) ON DELETE CASCADE,
  product_id text NOT NULL,
  seq integer NOT NULL,
  product jsonb NOT NULL,
  PRIMARY KEY (batch_id, product_id),
  UNIQUE (batch_id, seq)
);
REVOKE ALL ON public.store_config_publish_batches, public.store_config_publish_items FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.stage_store_config_publish(
  p_batch_id uuid, p_base_ts numeric, p_patch jsonb, p_product_upserts jsonb,
  p_product_delete_ids text[], p_product_order text[], p_chunk_no integer
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE uid uuid := auth.uid(); n integer;
BEGIN
  IF uid IS NULL OR (NOT public.is_admin() AND NOT public.has_perm('products')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF p_batch_id IS NULL OR p_chunk_no < 0
     OR jsonb_typeof(coalesce(p_patch,'{}'::jsonb)) <> 'object'
     OR jsonb_typeof(coalesce(p_product_upserts,'[]'::jsonb)) <> 'array'
     OR pg_column_size(coalesce(p_patch,'{}'::jsonb)) > 900000
     OR pg_column_size(coalesce(p_product_upserts,'[]'::jsonb)) > 900000
     OR coalesce(array_length(p_product_delete_ids,1),0) > 20000
     OR coalesce(cardinality(p_product_order),0) > 20000 THEN
    RAISE EXCEPTION 'invalid_publish_chunk' USING ERRCODE='22023';
  END IF;
  IF NOT public.is_admin() AND coalesce(p_patch,'{}'::jsonb) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'forbidden_patch' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_product_upserts,'[]'::jsonb)) e
    WHERE jsonb_typeof(e) <> 'object' OR coalesce(e->>'id','') !~ '^[A-Za-z0-9_-]{1,60}$') THEN
    RAISE EXCEPTION 'invalid_product' USING ERRCODE='22023';
  END IF;
  IF (SELECT count(*) <> count(DISTINCT e->>'id') FROM jsonb_array_elements(coalesce(p_product_upserts,'[]'::jsonb)) e) THEN
    RAISE EXCEPTION 'duplicate_product_id' USING ERRCODE='22023';
  END IF;
  IF p_chunk_no=0 THEN
    INSERT INTO public.store_config_publish_batches(batch_id,user_id,base_ts,patch,delete_ids,product_order)
    VALUES(p_batch_id,uid,coalesce(p_base_ts,0),coalesce(p_patch,'{}'::jsonb),
      coalesce(p_product_delete_ids,'{}'::text[]),p_product_order);
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.store_config_publish_batches WHERE batch_id=p_batch_id AND user_id=uid) THEN
      RAISE EXCEPTION 'publish_batch_missing' USING ERRCODE='22023';
    END IF;
  END IF;
  INSERT INTO public.store_config_publish_items(batch_id,product_id,seq,product)
  SELECT p_batch_id, e->>'id', p_chunk_no*100000 + ord::integer, e
  FROM jsonb_array_elements(coalesce(p_product_upserts,'[]'::jsonb)) WITH ORDINALITY AS x(e,ord);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.commit_store_config_publish(p_batch_id uuid)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
DECLARE
  uid uuid := auth.uid(); b public.store_config_publish_batches%ROWTYPE;
  current_data jsonb; current_products jsonb; upserts jsonb; merged_products jsonb;
  current_ts numeric; new_ts numeric; final_count integer;
BEGIN
  IF uid IS NULL OR (NOT public.is_admin() AND NOT public.has_perm('products')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT * INTO b FROM public.store_config_publish_batches WHERE batch_id=p_batch_id AND user_id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'publish_batch_missing' USING ERRCODE='22023'; END IF;
  SELECT coalesce(jsonb_agg(product ORDER BY seq),'[]'::jsonb) INTO upserts
    FROM public.store_config_publish_items WHERE batch_id=p_batch_id;
  IF (SELECT count(*) FROM public.store_config_publish_items WHERE batch_id=p_batch_id) > 20000 THEN
    RAISE EXCEPTION 'too_many_products' USING ERRCODE='22023';
  END IF;
  SELECT data INTO current_data FROM public.store_config WHERE id=1 FOR UPDATE;
  IF current_data IS NULL THEN RAISE EXCEPTION 'store_config_missing' USING ERRCODE='P0002'; END IF;
  current_ts := coalesce(nullif(current_data->>'ts','')::numeric,0);
  IF current_ts > b.base_ts THEN RAISE EXCEPTION 'stale' USING ERRCODE='40001'; END IF;
  IF coalesce(b.patch,'{}'::jsonb) ?| ARRAY['products','ts','api','payments_v2'] THEN
    RAISE EXCEPTION 'invalid_publish_patch' USING ERRCODE='22023';
  END IF;
  current_products := coalesce(current_data->'products','[]'::jsonb);
  IF b.product_order IS NOT NULL THEN
    IF cardinality(b.product_order) > 20000 OR
       (SELECT count(*) <> count(DISTINCT x) FROM unnest(b.product_order) x) THEN
      RAISE EXCEPTION 'invalid_product_order' USING ERRCODE='22023';
    END IF;
    WITH cr AS MATERIALIZED (
      SELECT value->>'id' id,value product FROM jsonb_array_elements(current_products)
      WHERE jsonb_typeof(value)='object' AND value->>'id' IS NOT NULL
    ), ur AS MATERIALIZED (
      SELECT value->>'id' id,value product FROM jsonb_array_elements(upserts)
    ), req AS (
      SELECT id,ord FROM unnest(b.product_order) WITH ORDINALITY x(id,ord)
    ), merged AS (
      SELECT coalesce(u.product,c.product) product,r.ord
      FROM req r LEFT JOIN cr c ON c.id=r.id LEFT JOIN ur u ON u.id=r.id
      WHERE coalesce(u.product,c.product) IS NOT NULL
    )
    SELECT coalesce(jsonb_agg(product ORDER BY ord),'[]'::jsonb),count(*) INTO merged_products,final_count FROM merged;
    IF final_count <> cardinality(b.product_order) THEN RAISE EXCEPTION 'missing_product_in_publish_order' USING ERRCODE='22023'; END IF;
  ELSE
    WITH cr AS MATERIALIZED (
      SELECT value->>'id' id,value product,ord FROM jsonb_array_elements(current_products) WITH ORDINALITY x(value,ord)
      WHERE jsonb_typeof(value)='object' AND value->>'id' IS NOT NULL
    ), ur AS MATERIALIZED (
      SELECT value->>'id' id,value product,ord FROM jsonb_array_elements(upserts) WITH ORDINALITY x(value,ord)
    ), merged AS (
      SELECT coalesce(u.product,c.product) product,c.ord
      FROM cr c LEFT JOIN ur u ON u.id=c.id
      WHERE NOT (c.id=ANY(coalesce(b.delete_ids,'{}'::text[])))
      UNION ALL
      SELECT u.product,2000000000+u.ord
      FROM ur u WHERE NOT EXISTS(SELECT 1 FROM cr c WHERE c.id=u.id)
        AND NOT (u.id=ANY(coalesce(b.delete_ids,'{}'::text[])))
    )
    SELECT coalesce(jsonb_agg(product ORDER BY ord),'[]'::jsonb),count(*) INTO merged_products,final_count FROM merged;
  END IF;
  IF final_count > 20000 THEN RAISE EXCEPTION 'too_many_products' USING ERRCODE='22023'; END IF;
  new_ts := greatest(floor(extract(epoch FROM clock_timestamp())*1000),current_ts+1);
  UPDATE public.store_config
  SET data=((current_data-'products'-'ts'-'api')||coalesce(b.patch,'{}'::jsonb))
      ||jsonb_build_object('products',merged_products,'ts',new_ts), updated_at=now()
  WHERE id=1;
  DELETE FROM public.store_config_publish_batches WHERE batch_id=p_batch_id;
  RETURN new_ts;
END $$;

CREATE OR REPLACE FUNCTION public.cancel_store_config_publish(p_batch_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
  DELETE FROM public.store_config_publish_batches
  WHERE batch_id=p_batch_id AND user_id=auth.uid();
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.stage_store_config_publish(uuid,numeric,jsonb,jsonb,text[],text[],integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.commit_store_config_publish(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cancel_store_config_publish(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.stage_store_config_publish(uuid,numeric,jsonb,jsonb,text[],text[],integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commit_store_config_publish(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_store_config_publish(uuid) TO authenticated;
