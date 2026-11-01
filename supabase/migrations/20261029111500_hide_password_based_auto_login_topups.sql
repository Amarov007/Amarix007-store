-- Hide the login-based Arknight Endfield packages until a secure, supported fulfillment flow exists.
-- The provider's current instructions request account email + password, which the storefront must not collect.
UPDATE public.store_config AS sc
SET data=jsonb_set(
  sc.data,
  '{products}',
  (
    SELECT coalesce(jsonb_agg(
      CASE WHEN p->>'c'='cmvpwlz5250x'
        THEN jsonb_set(p,'{hid}','true'::jsonb,true)
        ELSE p
      END ORDER BY ord
    ),'[]'::jsonb)
    FROM jsonb_array_elements(sc.data->'products') WITH ORDINALITY AS x(p,ord)
  ),
  true
),
updated_at=now()
WHERE sc.id=1;
