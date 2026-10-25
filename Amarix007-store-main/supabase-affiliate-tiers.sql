-- =====================================================================
-- برنامج الشركاء — الجزء الثاني: شرائح العمولة + نموذج تقديم موسّع + تقارير شهرية
-- شغّله بعد supabase-affiliate-program.sql. آمن لإعادة التشغيل.
--
-- نظام العمولة (مثل برامج شركات الكريبتو — مستويات حسب الأداء الشهري):
--   كل طلب مدفوع من عميل الشريك يُحتسب بنسبة المستوى الذي وصل إليه الشريك
--   في ذلك الشهر (ترتيب الطلب داخل الشهر). مثال بالقيم الافتراضية:
--     الطلبات 1–9 → 5% ، 10–29 → 7% ، 30–99 → 10% ، 100+ → 12%
--   أولوية النسبة: نسبة خاصة بالشريك (affiliates.rate) ← شريحة الشهر ← affiliate_rate في
--   store_config ← 5%. الشهر = شهر إنشاء الطلب (UTC).
-- =====================================================================

-- ---------- شرائح العمولة ----------
create table if not exists public.affiliate_tiers (
  id uuid primary key default gen_random_uuid(),
  label text not null default '',
  min_sales integer not null check (min_sales >= 0),
  rate numeric not null check (rate >= 0 and rate <= 100),
  unique (min_sales)
);
alter table public.affiliate_tiers enable row level security;

drop policy if exists "tiers read" on public.affiliate_tiers;
create policy "tiers read" on public.affiliate_tiers for select to anon, authenticated using (true);
drop policy if exists "tiers admin insert" on public.affiliate_tiers;
create policy "tiers admin insert" on public.affiliate_tiers for insert to authenticated with check (public.is_admin());
drop policy if exists "tiers admin update" on public.affiliate_tiers;
create policy "tiers admin update" on public.affiliate_tiers for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "tiers admin delete" on public.affiliate_tiers;
create policy "tiers admin delete" on public.affiliate_tiers for delete to authenticated using (public.is_admin());

grant select on public.affiliate_tiers to anon, authenticated;
grant insert, update, delete on public.affiliate_tiers to authenticated;

insert into public.affiliate_tiers (label, min_sales, rate)
select v.label, v.min_sales, v.rate
  from (values ('Bronze', 0, 5), ('Silver', 10, 7), ('Gold', 30, 10), ('Platinum', 100, 12)) as v(label, min_sales, rate)
 where not exists (select 1 from public.affiliate_tiers);

-- ---------- بيانات نموذج التقديم ----------
alter table public.affiliates add column if not exists channel_type text;
alter table public.affiliates add column if not exists channel_url  text;
alter table public.affiliates add column if not exists audience     text;
alter table public.affiliates add column if not exists pitch        text;

drop function if exists public.apply_affiliate(text);

create or replace function public.apply_affiliate(
  p_payout text, p_channel_type text, p_channel_url text, p_audience text, p_pitch text
) returns text
language plpgsql security definer set search_path = public as $function$
declare
  uid uuid := auth.uid();
  pay text := left(trim(coalesce(p_payout, '')), 120);
  ch  text := lower(trim(coalesce(p_channel_type, '')));
  url text := left(trim(coalesce(p_channel_url, '')), 200);
  aud text := trim(coalesce(p_audience, ''));
  pit text := left(trim(coalesce(p_pitch, '')), 400);
  st  text;
begin
  if uid is null then raise exception 'not_allowed'; end if;
  if length(pay) < 3 then raise exception 'payout_required'; end if;
  if length(url) < 3 then raise exception 'channel_required'; end if;
  if ch not in ('telegram', 'youtube', 'tiktok', 'instagram', 'x', 'website', 'other') then ch := 'other'; end if;
  if aud not in ('lt1k', '1k-10k', '10k-50k', 'gt50k') then aud := null; end if;
  if not public.rl_hit('affapply:' || uid::text, 5, 3600) then raise exception 'rate_limited'; end if;

  insert into public.affiliates (user_id)
    select id from public.profiles where id = uid
  on conflict (user_id) do nothing;

  select status into st from public.affiliates where user_id = uid;
  if st is null then raise exception 'no_profile'; end if;
  if st in ('pending', 'approved') then return st; end if;

  update public.affiliates
     set status = 'pending', payout_id = pay, channel_type = ch, channel_url = url,
         audience = aud, pitch = nullif(pit, ''), applied_at = now()
   where user_id = uid;
  return 'pending';
end $function$;

revoke all on function public.apply_affiliate(text, text, text, text, text) from public, anon;
grant execute on function public.apply_affiliate(text, text, text, text, text) to authenticated;

-- ---------- العمولة بالشرائح ----------
create or replace function public.orders_affiliate() returns trigger
language plpgsql security definer set search_path = public as $function$
declare ref_code_ text; ref_id uuid; arate numeric; rate numeric; amt numeric; idx integer;
begin
  if new.payment_status = 'paid' and old.payment_status is distinct from 'paid' and new.user_id is not null then
    select p2.id, p2.ref_code, a.rate into ref_id, ref_code_, arate
      from public.profiles p
      join public.profiles p2 on p2.ref_code = p.referred_by
      join public.affiliates a on a.user_id = p2.id and a.status = 'approved'
     where p.id = new.user_id and p2.id <> new.user_id;
    if ref_id is not null then
      rate := arate;
      if rate is null then
        select count(*) + 1 into idx
          from public.orders o
         where o.affiliate_ref = ref_code_ and o.payment_status = 'paid'
           and o.created_at >= date_trunc('month', new.created_at)
           and o.created_at <  date_trunc('month', new.created_at) + interval '1 month';
        select t.rate into rate from public.affiliate_tiers t
         where t.min_sales <= idx order by t.min_sales desc limit 1;
      end if;
      if rate is null then
        select (data->>'affiliate_rate')::numeric into rate from public.store_config where id = 1;
      end if;
      rate := coalesce(rate, 5);
      amt := round(coalesce(new.total, 0) * rate / 100, 2);
      new.affiliate_ref := ref_code_; new.affiliate_commission := amt;
      update public.affiliates
         set sales = coalesce(sales, 0) + 1, total_commission = coalesce(total_commission, 0) + amt
       where user_id = ref_id;
    end if;
  elsif old.payment_status = 'paid' and new.payment_status is distinct from 'paid' and coalesce(old.affiliate_commission, 0) > 0 then
    update public.affiliates
       set sales = greatest(coalesce(sales, 0) - 1, 0),
           total_commission = greatest(coalesce(total_commission, 0) - old.affiliate_commission, 0)
     where user_id = (select id from public.profiles where ref_code = old.affiliate_ref);
    new.affiliate_commission := 0;
  end if;
  return new;
end $function$;

-- ---------- تقرير الشريك الشهري (آخر 12 شهراً، لحسابه المعتمد فقط) ----------
create or replace function public.my_affiliate_monthly()
returns table(month text, sales integer, volume numeric, commission numeric)
language sql stable security definer set search_path = public as $function$
  select to_char(date_trunc('month', o.created_at), 'YYYY-MM'),
         count(*)::int,
         coalesce(sum(o.total), 0),
         coalesce(sum(o.affiliate_commission), 0)
    from public.orders o
    join public.profiles p on p.ref_code = o.affiliate_ref and p.id = (select auth.uid())
    join public.affiliates a on a.user_id = p.id and a.status = 'approved'
   where o.payment_status = 'paid' and coalesce(o.affiliate_commission, 0) > 0
     and o.created_at >= date_trunc('month', now()) - interval '11 months'
   group by 1
   order by 1 desc;
$function$;

revoke all on function public.my_affiliate_monthly() from public, anon;
grant execute on function public.my_affiliate_monthly() to authenticated;

-- ---------- تقرير المشرف: كل الشركاء، حسب الشهر ----------
create or replace function public.admin_affiliate_monthly(p_months integer default 6)
returns table(user_id uuid, email text, month text, sales integer, volume numeric, commission numeric)
language plpgsql stable security definer set search_path = public as $function$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  return query
    select p.id, p.email,
           to_char(date_trunc('month', o.created_at), 'YYYY-MM'),
           count(*)::int,
           coalesce(sum(o.total), 0),
           coalesce(sum(o.affiliate_commission), 0)
      from public.orders o
      join public.profiles p on p.ref_code = o.affiliate_ref
     where o.payment_status = 'paid' and coalesce(o.affiliate_commission, 0) > 0
       and o.created_at >= date_trunc('month', now()) - make_interval(months => greatest(least(coalesce(p_months, 6), 24), 1) - 1)
     group by p.id, p.email, 3
     order by 3 desc, 6 desc;
end $function$;

revoke all on function public.admin_affiliate_monthly(integer) from public, anon;
grant execute on function public.admin_affiliate_monthly(integer) to authenticated;
