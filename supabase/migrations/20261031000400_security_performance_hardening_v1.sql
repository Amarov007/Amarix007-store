-- Harden RPC access, make checkout idempotent under concurrent requests,
-- validate email addresses without fragile regex escaping, and index foreign keys.
create or replace function public.create_wallet_order(
 p_product_id uuid,p_quantity numeric default 1,p_customer_inputs jsonb default '{}'::jsonb,p_idempotency_key text default null
) returns public.orders language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_product public.products%rowtype; v_order public.orders%rowtype; v_total numeric(14,2); v_balance numeric; v_key text; v_kind text;
begin
 if v_uid is null then raise exception 'authentication_required' using errcode='28000'; end if;
 if p_quantity is null or p_quantity<=0 or p_quantity>100000 then raise exception 'invalid_quantity' using errcode='22023'; end if;
 if p_customer_inputs is null or jsonb_typeof(p_customer_inputs)<>'object' then raise exception 'customer_inputs_must_be_object' using errcode='22023'; end if;
 if p_idempotency_key is null or length(trim(p_idempotency_key))<8 or length(p_idempotency_key)>128 then raise exception 'valid_idempotency_key_required' using errcode='22023'; end if;
 v_key:=v_uid::text||':'||p_idempotency_key;
 perform pg_advisory_xact_lock(hashtextextended(v_key,0));
 select * into v_order from public.orders where idempotency_key=v_key;
 if found then return v_order; end if;
 select * into v_product from public.products where id=p_product_id and is_active=true for share;
 if not found then raise exception 'product_unavailable' using errcode='P0002'; end if;
 select kind into v_kind from public.categories where id=v_product.category_id;
 if v_kind='smm' and coalesce(p_customer_inputs->>'link','') !~ '^https?://[^[:space:]]+$' then raise exception 'valid_service_link_required' using errcode='22023'; end if;
 if v_kind='numbers' and (length(trim(coalesce(p_customer_inputs->>'phone','')))<5 or length(trim(coalesce(p_customer_inputs->>'whatsapp','')))<5) then raise exception 'phone_and_whatsapp_required' using errcode='22023'; end if;
 if v_kind='games' and length(trim(coalesce(p_customer_inputs->>'player_id','')))<2 then raise exception 'player_id_required' using errcode='22023'; end if;
 if v_kind in ('apps','ai') and coalesce(p_customer_inputs->>'email','') !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}$' then raise exception 'valid_account_email_required' using errcode='22023'; end if;
 if v_kind='custom' and length(trim(coalesce(p_customer_inputs->>'details','')))<2 then raise exception 'order_details_required' using errcode='22023'; end if;
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
revoke execute on function public.handle_new_user() from public,anon,authenticated;
create index if not exists orders_product_id_idx on public.orders(product_id);
create index if not exists payment_topups_reviewed_by_idx on public.payment_topups(reviewed_by);
create index if not exists payment_topups_user_id_idx on public.payment_topups(user_id);
create index if not exists product_provider_routes_provider_service_id_idx on public.product_provider_routes(provider_service_id);
create index if not exists staff_permissions_granted_by_idx on public.staff_permissions(granted_by);
