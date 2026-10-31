-- مستخرجة من القاعدة الحية؛ شغّلها قبل supabase-final-grants.sql

CREATE OR REPLACE FUNCTION public.cancel_store_config_publish(p_batch_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 DELETE FROM public.store_config_publish_batches WHERE batch_id=p_batch_id AND user_id=auth.uid();
 RETURN true;
END $function$


CREATE OR REPLACE FUNCTION public.notify_provider_balance_if_low(p_provider text, p_balance numeric, p_currency text DEFAULT ''::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s public.provider_alert_state%rowtype;
  provider_label text;
  cur text := left(coalesce(p_currency,''),12);
  should_alert boolean := false;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF coalesce(p_provider,'') !~ '^[a-z0-9_-]{1,30}$'
     OR p_balance IS NULL OR p_balance < 0 THEN
    RAISE EXCEPTION 'invalid_provider_balance' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.provider_alert_state(provider_id)
  VALUES (p_provider)
  ON CONFLICT (provider_id) DO NOTHING;

  SELECT * INTO s FROM public.provider_alert_state
  WHERE provider_id = p_provider FOR UPDATE;

  SELECT CASE WHEN p_provider = 'main' THEN 'المزوّد الرئيسي'
              ELSE coalesce(name, p_provider) END
    INTO provider_label
  FROM public.smm_providers
  WHERE id = p_provider;
  provider_label := coalesce(provider_label, CASE WHEN p_provider='main' THEN 'المزوّد الرئيسي' ELSE p_provider END);

  should_alert := p_balance <= s.threshold
    AND (s.last_alert_at IS NULL
      OR s.last_alert_at < now() - interval '6 hours'
      OR (s.last_balance IS NOT NULL AND p_balance < s.last_balance * 0.5));

  UPDATE public.provider_alert_state
  SET last_balance = p_balance,
      last_alert_at = CASE WHEN should_alert THEN now() ELSE last_alert_at END,
      updated_at = now()
  WHERE provider_id = p_provider;

  IF should_alert THEN
    PERFORM public.notify_telegram(
      '⚠️ رصيد مزوّد منخفض: ' || provider_label
      || E'\n💰 الرصيد الحالي: ' || p_balance::text || CASE WHEN cur <> '' THEN ' ' || cur ELSE '' END
      || E'\n🔔 حد التنبيه: ' || s.threshold::text || CASE WHEN cur <> '' THEN ' ' || cur ELSE '' END
    );
  END IF;
  RETURN should_alert;
END
$function$


CREATE OR REPLACE FUNCTION public.payment_approve_received(p_id uuid, p_confirmation text, p_received_amount numeric, p_received_currency text, p_note text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare uid uuid:=auth.uid(); p public.payments%rowtype; thr numeric; tol numeric;
        cur text; note_text text:=nullif(btrim(coalesce(p_note,'')),'');
begin
  if uid is null or not public.has_perm('payments.review') then raise exception 'not_allowed'; end if;
  if p_received_amount is null or p_received_amount<=0 or p_received_currency is null or length(btrim(p_received_currency))>10 then
    raise exception 'received_amount_required';
  end if;
  select * into p from public.payments where id=p_id for update;
  if not found or p.status<>'under_review' then raise exception 'payment_not_reviewable'; end if;
  if p.user_id = uid and not public.is_admin() then raise exception 'self_review_not_allowed'; end if;
  if exists(select 1 from public.payment_methods m where m.id=p.method_id and m.requires_proof)
     and coalesce(p.proof_path,'')='' then raise exception 'proof_required'; end if;
  if p.confirmation_token_hash is null or p.confirmation_token_expires_at<now()
     or p.confirmation_token_hash<>encode(digest(upper(coalesce(p_confirmation,'')),'sha256'),'hex') then
    raise exception 'confirmation_failed';
  end if;
  cur:=upper(btrim(p_received_currency));
  tol:=coalesce(public.payments_cfg_num('received_amount_tolerance',0.01),0.01);
  if cur<>upper(p.pay_currency) then raise exception 'currency_mismatch'; end if;
  if p_received_amount < p.pay_amount - tol then raise exception 'underpayment_not_allowed'; end if;
  if p_received_amount - p.pay_amount > tol then
    if note_text is null or length(note_text)<6 then raise exception 'amount_difference_note_required'; end if;
  end if;
  thr:=public.payments_cfg_num('dual_threshold',200);
  update public.payments set received_amount=round(p_received_amount,6),received_currency=cur,
    confirmation_token_hash=null,confirmation_token_expires_at=null,updated_at=now() where id=p_id returning * into p;
  if thr>0 and p.amount_base>=thr then
    if p.first_reviewed_by is null then
      update public.payments set first_reviewed_by=uid,first_reviewed_at=now() where id=p_id;
      insert into public.payment_events(payment_id,from_status,to_status,actor,note)
      values(p_id,'under_review','under_review',uid,'first approval; received='||p_received_amount||' '||cur||'; '||coalesce(left(note_text,180),''));
      return 'first_approved';
    elsif p.first_reviewed_by=uid then raise exception 'second_approver_required';
    end if;
  end if;
  update public.payments set reviewed_by=uid,reviewed_at=now() where id=p_id;
  perform public.transition_payment(p_id,'captured','verified amount='||p_received_amount||' '||cur||'; '||coalesce(left(note_text,180),''));
  return 'captured';
end $function$


CREATE OR REPLACE FUNCTION public.payment_confirmation_issue(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare uid uuid:=auth.uid(); token text;
begin
  if uid is null or not public.has_perm('payments.review') then raise exception 'not_allowed'; end if;
  if not exists(select 1 from public.payments where id=p_id and status='under_review') then
    raise exception 'payment_not_reviewable';
  end if;
  token:=upper(encode(gen_random_bytes(12),'hex'));
  update public.payments set confirmation_token_hash=encode(digest(token,'sha256'),'hex'),
    confirmation_token_expires_at=now()+interval '10 minutes',updated_at=now() where id=p_id;
  return token;
end $function$


CREATE OR REPLACE FUNCTION public.payment_methods_admin_delete(p_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or not public.has_perm('payments.settings') then raise exception 'not_allowed'; end if;
  if p_id is null or p_id='wallet' then raise exception 'invalid_method'; end if;
  if exists(select 1 from public.payments where method_id=p_id) then
    update public.payment_methods set enabled=false,updated_at=now() where id=p_id;
    return false;
  end if;
  delete from public.payment_methods where id=p_id;
  return found;
end $function$


CREATE OR REPLACE FUNCTION public.payment_methods_admin_save(p_methods jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or not public.has_perm('payments.settings') then raise exception 'not_allowed'; end if;
  return public.payment_settings_save(p_methods);
end $function$


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
$function$


CREATE OR REPLACE FUNCTION public.smm_providers_admin_list()
 RETURNS TABLE(id text, name text, kind text, api_url text, api_key_secret_name text, config jsonb, enabled boolean, created_at timestamp with time zone, has_key boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  return query
    select p.id, p.name, p.kind, p.api_url, p.api_key_secret_name, p.config, p.enabled, p.created_at,
           (coalesce(btrim(p.api_key), '') <> '')
      from public.smm_providers p
     order by p.created_at, p.id;
end $function$

