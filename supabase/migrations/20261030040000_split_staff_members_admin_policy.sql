-- Split the administrator ALL policy so staff self-read is not a second permissive SELECT policy.
DROP POLICY "staff admin all" ON public.staff_members;
DROP POLICY "staff read self" ON public.staff_members;

CREATE POLICY "staff admin read" ON public.staff_members
  FOR SELECT TO authenticated
  USING (public.is_admin() OR user_id = (SELECT auth.uid()));

CREATE POLICY "staff admin insert" ON public.staff_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY "staff admin update" ON public.staff_members
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "staff admin delete" ON public.staff_members
  FOR DELETE TO authenticated
  USING (public.is_admin());
