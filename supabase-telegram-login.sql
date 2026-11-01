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

-- 2) حماية البريد المحجوز: حسابات تيليغرام تستخدم tg<ID>@telegram.amarix007.store (الشكل الذي تُنشئه الدالة فعلاً)
--    ويشمل الحارس الشكل القديم tg<ID>@amarix007.store أيضاً
--    ولا يجوز لأحد التسجيل/تغيير بريده إلى هذا الشكل إلا عبر الدالة الطرفية (app_metadata.tg_id)
--    وإلا يستطيع مهاجم حجز الحساب مسبقاً بكلمة مرور يعرفها قبل أن يدخل صاحبه.
create or replace function public.guard_reserved_tg_email() returns trigger
language plpgsql security definer set search_path = public as $$
declare m text[];
begin
  m := regexp_match(lower(coalesce(new.email, '')), '^tg([0-9]+)@(telegram\.)?amarix007\.store$');
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

-- 3) وسم الحسابات القديمة (نفّذه مرة واحدة بعد نشر الدالة الجديدة)
--    الحسابات التي أنشأتها الدالة عبر admin.createUser بلا كلمة مرور (encrypted_password فارغ).
--    أما أي حساب بهذا البريد وله كلمة مرور فهو محجوز بتسجيل عادي ويجب مراجعته يدوياً قبل أي وسم.
--    (أ) فحص أولي — اقرأ النتيجة أولاً:
--    select id, email, created_at, (encrypted_password is not null and encrypted_password <> '') as has_password,
--           raw_app_meta_data->>'tg_id' as tg_tag, raw_user_meta_data->>'telegram_id' as tg_meta
--      from auth.users
--     where lower(email) ~ '^tg[0-9]+@(telegram\.)?amarix007\.store$'
--     order by created_at;
--    (ب) وسم الشرعي فقط (بلا كلمة مرور، وبريده يطابق telegram_id المحفوظ عند إنشائه):
update auth.users u
   set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb)
         || jsonb_build_object('tg_id', (regexp_match(lower(u.email), '^tg([0-9]+)@'))[1])
 where lower(u.email) ~ '^tg[0-9]+@(telegram\.)?amarix007\.store$'
   and coalesce(u.encrypted_password, '') = ''
   and coalesce(u.raw_app_meta_data->>'tg_id', '') = ''
   and coalesce(u.raw_user_meta_data->>'telegram_id', '') = (regexp_match(lower(u.email), '^tg([0-9]+)@'))[1];
