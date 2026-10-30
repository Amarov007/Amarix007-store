CREATE OR REPLACE FUNCTION public.tickets_staff_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR current_user <> 'authenticated' OR public.is_admin() THEN
    RETURN new;
  END IF;

  new.id := old.id;
  new.created_at := old.created_at;
  new.user_id := old.user_id;
  new.customer_name := old.customer_name;
  new.customer_email := old.customer_email;
  new.order_id := old.order_id;
  new.subject := old.subject;
  new.message := old.message;
  new.attachment := old.attachment;
  new.lang := old.lang;
  new.resolved := old.resolved;
  new.rated_at := old.rated_at;
  new.email_status := old.email_status;
  new.replied_at := old.replied_at;

  RETURN new;
END
$function$;

-- Ticket submitters may provide only the customer-facing fields.
-- The BEFORE INSERT trigger assigns user_id, email, id, timestamps and workflow state.
REVOKE INSERT ON public.support_tickets FROM authenticated;
GRANT INSERT (user_id, customer_name, customer_email, order_id, subject, message, attachment, lang)
  ON public.support_tickets TO authenticated;

-- Staff may write only a reply and ticket status. Workflow/audit fields are trigger-owned.
REVOKE UPDATE ON public.support_tickets FROM authenticated;
GRANT UPDATE (admin_reply, status) ON public.support_tickets TO authenticated;
