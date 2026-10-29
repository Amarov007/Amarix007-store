-- Hide direct-top-up products that require multiple independent account fields until the order API supports structured fields.
-- Do not accept a single text input for a provider flow that requires UID + server/platform/zone.
UPDATE public.store_config AS sc
SET data=jsonb_set(
  sc.data,
  '{products}',
  (
    SELECT coalesce(jsonb_agg(
      CASE WHEN p->>'smm_provider'='fazer' AND p->>'smm_country' IN ('dunk_city_dynasty','badlanders','be_the_king','dragon_nest_m_sea','astral_guardians_cyber_fantasy','conquer_online','dragon_nest_m_tw_hk_mo','destiny_rising','ace_racer','duet_night_abyss','asphalt_9_legends','azur_lane')
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
