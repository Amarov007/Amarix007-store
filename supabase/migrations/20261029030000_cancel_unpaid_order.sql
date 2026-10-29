-- Safely compensate for checkout failures after an order row is inserted but before payment creation succeeds.
-- This function only cancels the caller's own new, unpaid order when no active payment exists.
create or replace function public.cancel_unpaid_order(p_order_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
  o public.orders%rowtype;
begin
  if uid is null then raise exception 'not_allowed'; end if;
  if p_order_id is null or length(p_order_id) > 80 then raise exception 'invalid_order'; end if;

  select * into o
    from public.orders
   where id = p_order_id and user_id = uid
   for update;

  if not found then return false; end if;
  if o.status <> 'new' or coalesce(o.payment_status, 'pending') <> 'pending' then
    return false;
  end if;

  if exists (
    select 1 from public.payments p
     where p.order_id = o.id
       and p.status not in ('cancelled', 'rejected', 'expired')
  ) then
    return false;
  end if;

  update public.orders set status = 'cancelled' where id = o.id;
  return true;
end
$function$;

revoke all on function public.cancel_unpaid_order(text) from public, anon;
grant execute on function public.cancel_unpaid_order(text) to authenticated;
