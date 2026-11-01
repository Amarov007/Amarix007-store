-- Telegram admin webhook authentication and privileged actions.
-- The webhook secret is generated in the database and never stored in source control.
ALTER TABLE public.notify_settings ADD COLUMN IF NOT EXISTS telegram_webhook_secret text;
UPDATE public.notify_settings SET telegram_webhook_secret=encode(gen_random_bytes(32),'hex')
WHERE id=1 AND coalesce(telegram_webhook_secret,'')='';

CREATE OR REPLACE FUNCTION public.telegram_admin_action(
  p_secret text,p_chat_id text,p_action text,p_target_id text,
  p_value text DEFAULT NULL,p_note text DEFAULT NULL,p_amount numeric DEFAULT NULL,p_currency text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $function$
DECLARE s public.notify_settings%rowtype; admin_uid uuid; admin_count integer;
  order_id text; ticket_id bigint; topup_id bigint; pay_id uuid; result_text text; result_amount numeric;
BEGIN
  SELECT * INTO s FROM public.notify_settings WHERE id=1;
  IF s.id IS NULL OR coalesce(s.telegram_webhook_secret,'')=''
     OR p_secret IS DISTINCT FROM s.telegram_webhook_secret
     OR p_chat_id IS DISTINCT FROM s.telegram_chat_id
     OR coalesce(p_chat_id,'') !~ '^[1-9][0-9]{4,20}$' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  SELECT count(*),(array_agg(user_id))[1] INTO admin_count,admin_uid
  FROM public.admins WHERE user_id IS NOT NULL;
  IF admin_count<>1 OR admin_uid IS NULL THEN RAISE EXCEPTION 'telegram_admin_mapping_not_unique' USING ERRCODE='42501'; END IF;
  PERFORM set_config('request.jwt.claim.sub',admin_uid::text,true);
  CASE p_action
    WHEN 'order_status' THEN
      IF coalesce(p_target_id,'') !~ '^[A-Za-z0-9_-]{1,80}$' OR coalesce(p_value,'') NOT IN ('new','processing','done','cancelled') THEN
        RAISE EXCEPTION 'invalid_order_status' USING ERRCODE='22023';
      END IF;
      UPDATE public.orders SET status=p_value WHERE id=p_target_id RETURNING id INTO order_id;
      IF order_id IS NULL THEN RAISE EXCEPTION 'order_not_found' USING ERRCODE='P0002'; END IF;
      RETURN jsonb_build_object('ok',true,'message','order_updated','id',order_id,'status',p_value);
    WHEN 'ticket_reply' THEN
      IF coalesce(p_target_id,'') !~ '^\d{1,18}$' OR length(btrim(coalesce(p_value,'')))<1 OR length(p_value)>2000 THEN
        RAISE EXCEPTION 'invalid_ticket_reply' USING ERRCODE='22023';
      END IF;
      ticket_id:=p_target_id::bigint;
      UPDATE public.support_tickets SET admin_reply=p_value,status='answered' WHERE id=ticket_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found' USING ERRCODE='P0002'; END IF;
      RETURN jsonb_build_object('ok',true,'message','ticket_reply_saved','id',ticket_id);
    WHEN 'ticket_status' THEN
      IF coalesce(p_target_id,'') !~ '^\d{1,18}$' OR coalesce(p_value,'') NOT IN ('open','answered','closed') THEN
        RAISE EXCEPTION 'invalid_ticket_status' USING ERRCODE='22023';
      END IF;
      ticket_id:=p_target_id::bigint;
      UPDATE public.support_tickets SET status=p_value WHERE id=ticket_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'ticket_not_found' USING ERRCODE='P0002'; END IF;
      RETURN jsonb_build_object('ok',true,'message','ticket_status_updated','id',ticket_id,'status',p_value);
    WHEN 'topup_approve' THEN
      IF coalesce(p_target_id,'') !~ '^\d{1,18}$' THEN RAISE EXCEPTION 'invalid_topup_id' USING ERRCODE='22023'; END IF;
      topup_id:=p_target_id::bigint; result_amount:=public.wallet_topup_approve(topup_id,p_amount);
      RETURN jsonb_build_object('ok',true,'message',CASE WHEN result_amount=-1 THEN 'first_approved_second_admin_required' ELSE 'topup_approved' END,'balance',result_amount);
    WHEN 'topup_reject' THEN
      IF coalesce(p_target_id,'') !~ '^\d{1,18}$' THEN RAISE EXCEPTION 'invalid_topup_id' USING ERRCODE='22023'; END IF;
      topup_id:=p_target_id::bigint; PERFORM public.wallet_topup_reject(topup_id,left(coalesce(p_note,'رفض عبر بوت الإدارة'),200));
      RETURN jsonb_build_object('ok',true,'message','topup_rejected','id',topup_id);
    WHEN 'payment_prepare' THEN
      IF coalesce(p_target_id,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'invalid_payment_id' USING ERRCODE='22023';
      END IF;
      pay_id:=p_target_id::uuid; result_text:=public.payment_confirmation_issue(pay_id);
      RETURN jsonb_build_object('ok',true,'message','payment_confirmation_issued','token',result_text);
    WHEN 'payment_approve' THEN
      IF coalesce(p_target_id,'') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR p_amount IS NULL OR p_amount<=0 OR coalesce(p_currency,'')='' THEN
        RAISE EXCEPTION 'invalid_payment_approval' USING ERRCODE='22023';
      END IF;
      pay_id:=p_target_id::uuid; result_text:=public.payment_approve_received(pay_id,p_value,p_amount,p_currency,p_note);
      RETURN jsonb_build_object('ok',true,'message',result_text);
    ELSE RAISE EXCEPTION 'unknown_action' USING ERRCODE='22023';
  END CASE;
END
$function$;
REVOKE ALL ON FUNCTION public.telegram_admin_action(text,text,text,text,text,text,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_admin_action(text,text,text,text,text,text,numeric,text) TO service_role;

-- Stores the pg_net request id for operational verification; never stores bot credentials here.
ALTER TABLE public.notify_settings ADD COLUMN IF NOT EXISTS telegram_webhook_request_id bigint;
ALTER TABLE public.notify_settings ADD COLUMN IF NOT EXISTS telegram_webhook_test_request_id bigint;
