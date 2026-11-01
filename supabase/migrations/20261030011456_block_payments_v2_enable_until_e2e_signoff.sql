CREATE OR REPLACE FUNCTION public.payments_v2_flag_set(p_on boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_perm('payments.settings') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  -- The v2 flow must remain disabled until payment, refund, and fulfillment
  -- E2E tests and the staff-role matrix are explicitly signed off.
  IF COALESCE(p_on, false) THEN
    RAISE EXCEPTION 'payments_v2_e2e_not_signed_off' USING ERRCODE = '42501';
  END IF;

  UPDATE public.store_config
     SET data = jsonb_set(
           jsonb_set(COALESCE(data, '{}'::jsonb), '{payments_v2}',
                     COALESCE(data->'payments_v2', '{}'::jsonb), true),
           '{payments_v2,on}', 'false'::jsonb, true),
         updated_at = now()
   WHERE id = 1;

  RETURN FOUND;
END
$function$;
