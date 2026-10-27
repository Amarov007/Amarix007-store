-- =====================================================================
-- AMARIX007 — supabase-user-uid.sql
-- معرّف رقمي (UID) قصير لكل مستخدم في ملفه الشخصي + بحث الإدارة عنه.
-- آمن لإعادة التشغيل. شغّله بعد supabase-wallet.sql وsupabase-staff.sql (يستخدم wallets و has_perm)،
-- وأعد تشغيل supabase-final-grants.sql أخيراً (أُضيف إليه admin_find_user).
-- =====================================================================

-- 1) العمود + مولّد الأرقام (8 خانات، لا يبدأ بصفر)
create or replace function public.gen_user_uid() returns text
language plpgsql set search_path = public as $function$
declare c text;
begin
  loop
    c := (10000000 + floor(random() * 90000000))::bigint::text;
    exit when not exists (select 1 from public.profiles where uid = c);
  end loop;
  return c;
end $function$;

alter table public.profiles add column if not exists uid text;

-- 2) تعبئة المستخدمين الحاليين (من لا uid له فقط)
do $$
declare r record;
begin
  for r in select id from public.profiles where uid is null loop
    update public.profiles set uid = public.gen_user_uid() where id = r.id;
  end loop;
end $$;

alter table public.profiles alter column uid drop default;
alter table public.profiles alter column uid set not null;
create unique index if not exists profiles_uid_key on public.profiles (uid);
alter table public.profiles drop constraint if exists profiles_uid_fmt;
alter table public.profiles add constraint profiles_uid_fmt check (uid ~ '^[0-9]{8}$');

-- 3) الحماية: المستخدم العادي لا يختار uid ولا يغيّره (الإدارة وservice_role فقط)
create or replace function public.profiles_protect_uid() returns trigger
language plpgsql security definer set search_path = public as $function$
begin
  if tg_op = 'INSERT' then
    -- التوليد داخل التريغر (security definer) فلا يحتاج المستخدم صلاحية تنفيذ على gen_user_uid
    if new.uid is null or (auth.uid() is not null and not public.is_admin()) then
      new.uid := public.gen_user_uid();
    end if;
  elsif auth.uid() is not null and not public.is_admin() then
    new.uid := old.uid;
  end if;
  return new;
end $function$;

drop trigger if exists profiles_protect_uid_trg on public.profiles;
create trigger profiles_protect_uid_trg before insert or update of uid on public.profiles
  for each row execute function public.profiles_protect_uid();

-- 4) بحث الإدارة: كل معلومات المستخدم بالـ UID (صلاحية «users» للمدير أو الموظف)
create or replace function public.admin_find_user(p_uid text) returns jsonb
language plpgsql stable security definer set search_path = public, auth as $function$
declare
  q text := regexp_replace(coalesce(p_uid, ''), '\D', '', 'g');
  p public.profiles%rowtype;
  au record;
  res jsonb;
begin
  if not public.has_perm('users') then raise exception 'forbidden' using errcode = '42501'; end if;
  if q = '' then return null; end if;
  select * into p from public.profiles where uid = q;
  if not found then return null; end if;
  select u.last_sign_in_at, u.email_confirmed_at, u.created_at, u.phone,
         coalesce(u.raw_app_meta_data->>'provider', '') as provider,
         coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture', '') as avatar
    into au from auth.users u where u.id = p.id;
  res := jsonb_build_object(
    'profile', to_jsonb(p),
    'auth', to_jsonb(au),
    'orders', jsonb_build_object(
      'count',     (select count(*) from public.orders o where o.user_id = p.id),
      'paid_total',(select coalesce(sum(o.total), 0) from public.orders o where o.user_id = p.id and o.status <> 'cancelled'),
      'recent',    coalesce((select jsonb_agg(x) from (
                      select o.id, o.created_at, o.total, o.currency, o.status, o.payment_status, o.payment_method
                        from public.orders o where o.user_id = p.id order by o.created_at desc limit 10) x), '[]'::jsonb)),
    'tickets', jsonb_build_object(
      'count', (select count(*) from public.support_tickets t where t.user_id = p.id),
      'open',  (select count(*) from public.support_tickets t where t.user_id = p.id and t.status = 'open')),
    'wallets', coalesce((select jsonb_agg(jsonb_build_object('section', w.section, 'balance', w.balance))
                           from public.wallets w where w.user_id = p.id), '[]'::jsonb),
    'affiliate', (select to_jsonb(a) from public.affiliates a where a.user_id = p.id),
    'referred_by_uid', (select r.uid from public.profiles r where r.ref_code = p.referred_by)
  );
  return res;
end $function$;

-- 5) صلاحيات: gen_user_uid وprofiles_protect_uid داخليتان؛ admin_find_user للمسجّلين فقط (يتحقق من has_perm داخلياً)
revoke execute on function public.gen_user_uid()           from public, anon, authenticated;
revoke execute on function public.profiles_protect_uid()   from public, anon, authenticated;
revoke execute on function public.admin_find_user(text)    from public, anon;
grant  execute on function public.admin_find_user(text)    to authenticated;
