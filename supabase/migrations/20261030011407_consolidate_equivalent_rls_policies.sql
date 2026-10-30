-- Consolidate equivalent permissive RLS policies without changing who can access rows.
-- has_perm(permission) already returns true for administrators via is_admin().

ALTER POLICY "staff orders read" ON public.orders
  USING (public.has_perm('orders') OR user_id = (SELECT auth.uid()));
DROP POLICY "orders read" ON public.orders;

ALTER POLICY "staff orders update" ON public.orders
  USING (public.has_perm('orders'))
  WITH CHECK (public.has_perm('orders'));
DROP POLICY "orders update" ON public.orders;

ALTER POLICY "staff profiles read" ON public.profiles
  USING (public.has_perm('users') OR id = (SELECT auth.uid()));
DROP POLICY "profiles read" ON public.profiles;

ALTER POLICY "staff read self" ON public.staff_members
  USING (user_id = (SELECT auth.uid()) AND NOT public.is_admin());

ALTER POLICY "staff tickets read" ON public.support_tickets
  USING (public.has_perm('tickets') OR user_id = (SELECT auth.uid()));
DROP POLICY "tickets read own or admin" ON public.support_tickets;

ALTER POLICY "staff tickets update" ON public.support_tickets
  USING (public.has_perm('tickets'))
  WITH CHECK (public.has_perm('tickets'));
DROP POLICY "tickets admin update" ON public.support_tickets;
