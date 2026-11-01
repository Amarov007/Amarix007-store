-- =====================================================================
-- AMARIX007 — ترقية: تذاكر الدعم + حدود كمية الرشق (آمن للتشغيل أكثر من مرة)
-- شغّله مرة واحدة في Supabase > SQL Editor. لا يحتاج إعادة تشغيل الملف الكامل.
-- يعتمد على الدوال الموجودة مسبقاً: is_admin / rl_hit / notify_telegram (من supabase-schema.sql)
-- =====================================================================
-- ملاحظة (توحيد التعريفات): دوال my_ticket_file_count / tickets_before_insert / tickets_notify / orders_enforce_pricing لم تعد معرَّفة هنا؛ تعريفها الوحيد في
-- supabase-schema.sql (و supabase-boost-units.sql للتسعير). على قاعدة قديمة بلا هذه الدوال شغّل supabase-schema.sql أولاً. الصلاحيات: supabase-final-grants.sql أخيراً.

-- 1) تحديث دالة التسعير لتفرض أقل/أعلى كمية لكل منتج (qmin / qmax)
-- [moved] public.orders_enforce_pricing() is defined only in supabase-boost-units.sql (one definition per function; see tests/verify-project.py check 5).

-- =====================================================================
-- تذاكر الدعم (Support tickets) + حدود كمية الرشق
-- يصل إشعار تلغرام عند إرسال تذكرة (عبر notify_telegram الموجودة) وتظهر التذاكر في لوحة التحكم > تذاكر الدعم.
-- =====================================================================
create table if not exists public.support_tickets (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete cascade,
  customer_name text, customer_email text,
  order_id text,
  subject text not null, message text not null,
  attachment text,
  lang text,
  status text not null default 'open' check (status in ('open','answered','closed')),
  admin_reply text, replied_at timestamptz
);
create index if not exists support_tickets_user_idx   on public.support_tickets (user_id, created_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);
alter table public.support_tickets enable row level security;

-- [moved] public.tickets_before_insert() is defined only in supabase-schema.sql (one definition per function; see tests/verify-project.py check 5).

-- [moved] public.tickets_notify() is defined only in supabase-schema.sql (one definition per function; see tests/verify-project.py check 5).

drop trigger if exists tickets_before_insert_trg on public.support_tickets;
create trigger tickets_before_insert_trg before insert on public.support_tickets for each row execute function public.tickets_before_insert();
drop trigger if exists tickets_notify_trg on public.support_tickets;
create trigger tickets_notify_trg after insert on public.support_tickets for each row execute function public.tickets_notify();

drop policy if exists "tickets insert own" on public.support_tickets;
create policy "tickets insert own" on public.support_tickets for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'open' and admin_reply is null);
drop policy if exists "tickets read own or admin" on public.support_tickets;
create policy "tickets read own or admin" on public.support_tickets for select to authenticated
  using (public.is_admin() or user_id = (select auth.uid()));
drop policy if exists "tickets admin update" on public.support_tickets;
create policy "tickets admin update" on public.support_tickets for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "tickets admin delete" on public.support_tickets;
create policy "tickets admin delete" on public.support_tickets for delete to authenticated
  using (public.is_admin());

-- صور التذاكر: حاوية خاصة، كل مستخدم يرفع داخل مجلده فقط والمدير يراها
-- [moved] public.my_ticket_file_count() is defined only in supabase-schema.sql (one definition per function; see tests/verify-project.py check 5).
revoke execute on function public.my_ticket_file_count() from public, anon;
grant  execute on function public.my_ticket_file_count() to authenticated, service_role;
revoke execute on function public.tickets_before_insert() from public, anon, authenticated;
revoke execute on function public.tickets_notify()        from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ticket-files', 'ticket-files', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ticket files read own or admin" on storage.objects;
create policy "ticket files read own or admin" on storage.objects for select to authenticated
  using (bucket_id = 'ticket-files' and (public.is_admin() or (storage.foldername(name))[1] = (select auth.uid())::text));
drop policy if exists "ticket files insert own" on storage.objects;
create policy "ticket files insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'ticket-files' and (storage.foldername(name))[1] = (select auth.uid())::text and public.my_ticket_file_count() < 30);
