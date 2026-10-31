-- Atomic wallet, order and manual top-up RPCs.
-- Apply after 20261031000100_amarix_core_schema_v1.sql.

create or replace function public.create_wallet_order(
  p_product_id uuid, p_quantity numeric default 1, p_customer_inputs jsonb default '{}'::jsonb, p_idempotency_key text default null
) returns public.orders language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_product public.products%rowtype; v_order public.orders%rowtype; v_total numeric(14,2); v_balance numeric; v_key text;
begin
 if v_uid is null then raise exception 'authentication_required' using errcode='28000'; end if;
 if p_quantity is null or p_quantity<=0 or p_quantity>100000 then raise exception 'invalid_quantity' using errcode='22023'; end if;
 if p_customer_inputs is null or jsonb_typeof(p_customer_inputs)<>'object' then raise exception 'customer_inputs_must_be_object' using errcode='22023'; end if;
 if p_idempotency_key is null or length(trim(p_idempotency_key))<8 or length(p_idempotency_key)>128 then raise exception 'valid_idempotency_key_required' using errcode='22023'; end if;
 v_key:=v_uid::text||':'||p_idempotency_key;
 select * into v_order from public.orders where idempotency_key=v_key;
 if found then return v_order; end if;
 select * into v_product from public.products where id=p_product_id and is_active=true for share;
 if not found then raise exception 'product_unavailable' using errcode='P0002'; end if;
 v_total:=round(v_product.price*p_quantity,2);
 if v_total<=0 then raise exception 'invalid_product_price' using errcode='22023'; end if;
 insert into public.wallets(user_id,currency,balance) values(v_uid,v_product.currency,0) on conflict(user_id,currency) do nothing;
 select balance into v_balance from public.wallets where user_id=v_uid and currency=v_product.currency for update;
 if v_balance<v_total then raise exception 'insufficient_wallet_balance' using errcode='P0001'; end if;
 update public.wallets set balance=balance-v_total,updated_at=now() where user_id=v_uid and currency=v_product.currency returning balance into v_balance;
 insert into public.orders(user_id,product_id,product_snapshot,customer_inputs,quantity,total,currency,status,payment_status,idempotency_key)
 values(v_uid,v_product.id,jsonb_build_object('name_ar',v_product.name_ar,'name_en',v_product.name_en,'slug',v_product.slug,'price',v_product.price,'currency',v_product.currency,'fulfillment_type',v_product.fulfillment_type),p_customer_inputs,p_quantity,v_total,v_product.currency,'pending','paid',v_key)
 returning * into v_order;
 insert into public.wallet_ledger(user_id,currency,amount,balance_after,entry_type,reference,note)
 values(v_uid,v_product.currency,-v_total,v_balance,'purchase',v_order.id::text,'طلب رقم '||v_order.order_number);
 return v_order;
end $$;

create or replace function public.submit_payment_topup(p_amount numeric,p_currency text,p_method text,p_proof_path text default null,p_reference text default null)
returns public.payment_topups language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_row public.payment_topups%rowtype;
begin
 if v_uid is null then raise exception 'authentication_required' using errcode='28000'; end if;
 if p_amount is null or p_amount<=0 or p_amount>1000000 then raise exception 'invalid_amount' using errcode='22023'; end if;
 if p_currency not in ('USD','SYP','EUR') then raise exception 'unsupported_currency' using errcode='22023'; end if;
 if p_method not in ('syriatel_cash','sham_cash','usdt_bep20','binance_pay','manual') then raise exception 'unsupported_payment_method' using errcode='22023'; end if;
 if p_proof_path is not null and (p_proof_path like '/%' or p_proof_path like '%..%') then raise exception 'invalid_proof_path' using errcode='22023'; end if;
 insert into public.payment_topups(user_id,amount,currency,method,proof_path,reference) values(v_uid,p_amount,p_currency,p_method,p_proof_path,p_reference) returning * into v_row;
 return v_row;
end $$;

create or replace function public.review_payment_topup(p_topup_id uuid,p_approve boolean)
returns public.payment_topups language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_row public.payment_topups%rowtype; v_balance numeric;
begin
 if v_uid is null or not exists(select 1 from public.profiles where id=v_uid and role='admin') then raise exception 'admin_only' using errcode='42501'; end if;
 select * into v_row from public.payment_topups where id=p_topup_id for update;
 if not found then raise exception 'topup_not_found' using errcode='P0002'; end if;
 if v_row.status<>'pending' then raise exception 'topup_already_reviewed' using errcode='55000'; end if;
 update public.payment_topups set status=case when p_approve then 'approved' else 'rejected' end,reviewed_by=v_uid,reviewed_at=now() where id=p_topup_id returning * into v_row;
 if p_approve then
  insert into public.wallets(user_id,currency,balance) values(v_row.user_id,v_row.currency,0) on conflict(user_id,currency) do nothing;
  update public.wallets set balance=balance+v_row.amount,updated_at=now() where user_id=v_row.user_id and currency=v_row.currency returning balance into v_balance;
  insert into public.wallet_ledger(user_id,currency,amount,balance_after,entry_type,reference,note) values(v_row.user_id,v_row.currency,v_row.amount,v_balance,'topup',v_row.id::text,'اعتماد طلب شحن رصيد');
 end if;
 return v_row;
end $$;

create or replace function public.refund_order(p_order_id uuid,p_reason text default 'استرداد طلب')
returns public.orders language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_order public.orders%rowtype; v_balance numeric;
begin
 if v_uid is null or not exists(select 1 from public.profiles where id=v_uid and role='admin') then raise exception 'admin_only' using errcode='42501'; end if;
 select * into v_order from public.orders where id=p_order_id for update;
 if not found then raise exception 'order_not_found' using errcode='P0002'; end if;
 if v_order.payment_status='refunded' then return v_order; end if;
 if v_order.payment_status<>'paid' then raise exception 'order_not_paid' using errcode='55000'; end if;
 insert into public.wallets(user_id,currency,balance) values(v_order.user_id,v_order.currency,0) on conflict(user_id,currency) do nothing;
 update public.wallets set balance=balance+v_order.total,updated_at=now() where user_id=v_order.user_id and currency=v_order.currency returning balance into v_balance;
 insert into public.wallet_ledger(user_id,currency,amount,balance_after,entry_type,reference,note) values(v_order.user_id,v_order.currency,v_order.total,v_balance,'refund',v_order.id::text,left(coalesce(p_reason,'استرداد طلب'),300));
 update public.orders set status='failed',payment_status='refunded',updated_at=now() where id=p_order_id returning * into v_order;
 return v_order;
end $$;

revoke all on function public.create_wallet_order(uuid,numeric,jsonb,text) from public,anon;
revoke all on function public.submit_payment_topup(numeric,text,text,text,text) from public,anon;
revoke all on function public.review_payment_topup(uuid,boolean) from public,anon;
revoke all on function public.refund_order(uuid,text) from public,anon;
grant execute on function public.create_wallet_order(uuid,numeric,jsonb,text) to authenticated;
grant execute on function public.submit_payment_topup(numeric,text,text,text,text) to authenticated;
grant execute on function public.review_payment_topup(uuid,boolean) to authenticated;
grant execute on function public.refund_order(uuid,text) to authenticated;
