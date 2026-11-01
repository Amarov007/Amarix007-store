-- Require account IDs for verified direct-top-up categories whose provider documentation explicitly requests them.
UPDATE public.store_config
SET data=jsonb_set(
  data,
  '{products}',
  (
    SELECT coalesce(jsonb_agg(
      CASE
        WHEN p->>'c' IN ('cmvpwlz559mg','cmvpwlz5jak3','cmvpwlz5nx9d','cmvpwlz5hziq','cmvpwlz5hd6o')
          THEN jsonb_set(
            jsonb_set(p,'{smm_input}','"text"'::jsonb,true),
            '{req}','["user_id"]'::jsonb,true
          )
        ELSE p
      END ORDER BY ord
    ),'[]'::jsonb)
    FROM jsonb_array_elements(data->'products') WITH ORDINALITY AS x(p,ord)
  ),
  true
),
updated_at=now()
WHERE id=1;
