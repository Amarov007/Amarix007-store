-- ============================================================================
-- تسجيل الدخول عبر تيليغرام (Telegram Login Widget) — نفّذه مرة واحدة
-- يعتمد على: notify_settings.telegram_bot_token (نفس بوت الإشعارات) + rl_hit + دالة telegram-auth الطرفية.
-- ============================================================================

-- 1) منع إعادة استخدام نفس طلب الدخول (replay): كل (id, auth_date) يُقبل مرة واحدة فقط
create table if not exists public.telegram_logins (
  tg_id      bigint      not null,
  auth_date  bigint      not null,
  created_at timestamptz not null default now(),
  primary key (tg_id, auth_date)
);
alter table public.telegram_logins enable row level security;   -- بلا سياسات: لا وصول إلا لـ service_role
revoke all on public.telegram_logins from anon, authenticated;
grant all on public.telegram_logins to service_role;

-- 2) حماية البريد المحجوز: حسابات تيليغرام تستخدم tg<ID>@amarix007.store
--    ولا يجوز لأحد التسجيل/تغيير بريده إلى هذا الشكل إلا عبر الدالة الطرفية (app_metadata.tg_id)
--    وإلا يستطيع مهاجم حجز الحساب مسبقاً بكلمة مرور يعرفها قبل أن يدخل صاحبه.
create or replace function public.guard_reserved_tg_email() returns trigger
language plpgsql security definer set search_path = public as $$
declare m text[];
begin
  m := regexp_match(lower(coalesce(new.email, '')), '^tg([0-9]+)@amarix007\.store$');
  if m is null then return new; end if;
  -- مسموح فقط: (أ) حساب تيليغرام موسوم app_metadata.tg_id، أو (ب) لحظة إنشائه من الدالة الطرفية
  -- بعد أن سجّلت دخولاً موقّعاً حديثاً في telegram_logins (جدول لا يصل إليه إلا service_role).
  if coalesce(new.raw_app_meta_data->>'tg_id', '') = m[1] then return new; end if;
  if exists (select 1 from public.telegram_logins l
              where l.tg_id = m[1]::bigint and l.created_at > now() - interval '2 minutes') then
    return new;
  end if;
  raise exception 'reserved_email';
end $$;
revoke execute on function public.guard_reserved_tg_email() from public, anon, authenticated;

drop trigger if exists guard_reserved_tg_email on auth.users;
create trigger guard_reserved_tg_email
  before insert or update of email on auth.users
  for each row execute function public.guard_reserved_tg_email();
