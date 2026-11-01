-- Game and chat top-up input requirements.
-- FazerCards custom order schema sends the customer input as player_id.
-- Keep the catalog's offer IDs, prices, names, and category IDs unchanged.
UPDATE public.store_config
SET data = jsonb_set(
  data,
  '{products}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN p->>'ptype'='gift_card'
          AND p->>'smm_input'='none'
          AND coalesce(p->>'smm_service','') NOT IN ('','0')
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(data->'categories') c
            WHERE c->>'id'=p->>'c' AND c->>'hub'='games'
          )
        THEN jsonb_set(
          jsonb_set(p,'{smm_input}','"text"'::jsonb,true),
          '{req}','["player_id"]'::jsonb,true
        )
        WHEN p->>'c' IN ('cmvpwlz559mg','cmvpwlz5jak3','cmvpwlz5nx9d','cmvpwlz5hziq','cmvpwlz5hd6o')
          AND coalesce(p->>'smm_service','') NOT IN ('','0')
        THEN jsonb_set(
          jsonb_set(p,'{smm_input}','"text"'::jsonb,true),
          '{req}','["user_id"]'::jsonb,true
        )
        ELSE p
      END ORDER BY ord
    )
    FROM jsonb_array_elements(data->'products') WITH ORDINALITY AS x(p,ord)
  ),
  false
),
updated_at=now()
WHERE id=1
  AND jsonb_typeof(data->'products')='array';
