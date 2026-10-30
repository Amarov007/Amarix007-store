-- Restore the explicit safety invariant: the v2 payment flow stays disabled
-- until end-to-end payment, refund, and fulfillment tests are signed off.
-- This migration is intentionally narrow and does not alter financial records.
UPDATE public.store_config
SET data = jsonb_set(
  COALESCE(data, '{}'::jsonb),
  '{payments_v2,on}',
  'false'::jsonb,
  true
),
updated_at = now()
WHERE id = 1
  AND COALESCE(data #>> '{payments_v2,on}', 'false') <> 'false';

DO $$
BEGIN
  IF public.payments_v2_on() IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Safety invariant failed: payments_v2 must remain disabled';
  END IF;
END $$;
