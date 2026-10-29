-- Add an honest PUBG Mobile UC catalog slot; do not fabricate prices or stock without a live provider offer.
UPDATE public.store_config
SET data=jsonb_set(
  data,
  '{categories}',
  (data->'categories') ||
  CASE WHEN EXISTS (
    SELECT 1 FROM jsonb_array_elements(data->'categories') AS q(x) WHERE x->>'id'='pubg-mobile-uc'
  ) THEN '[]'::jsonb
  ELSE jsonb_build_array(jsonb_build_object(
    'id','pubg-mobile-uc','ty','shop','hub','games','i','bolt',
    'ar','شدات PUBG Mobile UC','en','PUBG Mobile UC',
    'da','قريباً — ستظهر الباقات بعد ربط مزوّد يوفّر شدات PUBG Mobile فعلياً',
    'de','Coming soon — packages appear when a provider offers PUBG Mobile UC',
    'f',jsonb_build_array(),'image_url',''
  )) END,
  true
),
updated_at=now()
WHERE id=1;
