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
-- [moved] public.orders_affiliate is defined only in supabase/migrations/20261028070000_payments_restructure.sql.


-- [moved] affiliate accrual/reversals are maintained from affiliate_commissions by the payments migration.
-- ---------- تقرير الشريك الشهري (آخر 12 شهراً، لحسابه المعتمد فقط) ----------
-- [moved] public.my_affiliate_monthly is defined only in supabase/migrations/20261028070000_payments_restructure.sql.


revoke all on function public.my_affiliate_monthly() from public, anon;
grant execute on function public.my_affiliate_monthly() to authenticated;

-- ---------- تقرير المشرف: كل الشركاء، حسب الشهر ----------
-- [moved] public.admin_affiliate_monthly is defined only in supabase/migrations/20261028070000_payments_restructure.sql.


revoke all on function public.admin_affiliate_monthly(integer) from public, anon;
grant execute on function public.admin_affiliate_monthly(integer) to authenticated;
