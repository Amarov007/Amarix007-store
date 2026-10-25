-- =====================================================================
-- AMARIX007 — تسجيل الدخول عبر تيليغرام (الجداول فقط؛ المنطق في الدالة الطرفية telegram-auth)
-- شغّله مرة واحدة في Supabase > SQL Editor. آمن لإعادة التشغيل.
-- =====================================================================

-- ربط حساب تيليغرام بمستخدم (حساب واحد لكل معرّف تيليغرام، ومعرّف واحد لكل حساب)
create table if not exists public.telegram_identities (
  telegram_id bigint primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  username text,
  first_name text,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
alter table public.telegram_identities enable row level security;
drop policy if exists "tg identity read own or admin" on public.telegram_identities;
create policy "tg identity read own or admin" on public.telegram_identities for select to authenticated
  using (public.is_admin() or user_id = (select auth.uid()));
-- لا سياسات كتابة: الدالة الطرفية (service_role) فقط

-- منع إعادة استعمال نفس توقيع تيليغرام (Replay) — يُحفظ ساعة ثم يُنظَّف
create table if not exists public.telegram_auth_seen (
  hash text primary key,
  seen_at timestamptz not null default now()
);
alter table public.telegram_auth_seen enable row level security;
create index if not exists telegram_auth_seen_at_idx on public.telegram_auth_seen (seen_at);

create or replace function public.telegram_auth_cleanup() returns void
language sql security definer set search_path = public as $$
  delete from public.telegram_auth_seen where seen_at < now() - interval '2 hours';
$$;
revoke execute on function public.telegram_auth_cleanup() from public, anon, authenticated;
grant  execute on function public.telegram_auth_cleanup() to service_role;

grant select, insert, update, delete on public.telegram_identities, public.telegram_auth_seen to service_role;
