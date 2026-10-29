UPDATE public.store_config AS sc
SET data=jsonb_set(
  sc.data,
  '{products}',
  (
    SELECT coalesce(jsonb_agg(
      CASE
        WHEN p->>'c' IN ('cmvpwlz5nx9d','cmvpwlz5hziq')
          THEN p || jsonb_build_object('smm_input','text','req',jsonb_build_array('user_id'))
        ELSE p
      END ORDER BY ord
    ),'[]'::jsonb)
    FROM jsonb_array_elements(sc.data->'products') WITH ORDINALITY AS x(p,ord)
  ),
  true
),
updated_at=now()
WHERE sc.id=1;
