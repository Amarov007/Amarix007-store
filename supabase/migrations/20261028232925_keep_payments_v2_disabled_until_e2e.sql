-- Keep the new payment flow disabled until end-to-end payment and fulfillment tests are signed off.
-- Safe/idempotent: changes only the payments_v2 feature flag in store_config.
UPDATE public.store_config
SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{payments_v2,on}', 'false'::jsonb, true),
    updated_at = now()
WHERE id = 1
  AND COALESCE(data #>> '{payments_v2,on}', 'false') <> 'false';

DO $$
BEGIN
  IF public.payments_v2_on() IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Safety check failed: payments_v2 must remain disabled until end-to-end tests pass';
  END IF;
END $$;
