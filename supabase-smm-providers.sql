-- =====================================================================
-- AMARIX007 — مزوّدو الرشق المتعددون (Multi-provider SMM)
-- نفّذ هذا الملف مرة واحدة في Supabase > SQL Editor (آمن لإعادة التشغيل).
--
-- ينشئ:
--   smm_providers  : مواقع الرشق (رابط API + مفتاح + أولوية + هامش ربح افتراضي ...). أدمن فقط.
--   smm_order_log  : سجل كل عنصر أُرسل لمزوّد (يمنع الإرسال المزدوج ويُظهر الأخطاء). أدمن فقط.
-- ثم ينقل مزوّد api_settings القديم (smm_api_url / smm_api_key) تلقائياً كمزوّد افتراضي id = main.
-- المفاتيح لا تخرج من القاعدة إلا للأدمن (RLS) وللدالة الطرفية smm-hub (service_role).
-- =====================================================================

create table if not exists public.smm_providers (
  id               text primary key check (id ~ '^[a-z0-9_]{2,24}$'),
  name             text not null check (char_length(name) between 1 and 60),
  api_url          text not null check (api_url ~* '^https://'),
  api_key          text not null default '',
  enabled          boolean not null default true,
  is_default       boolean not null default false,   -- يُستخدم للمنتجات القديمة التي بلا smm_provider
  priority         integer not null default 100,     -- الأصغر أولاً (للترتيب والمزوّد الافتراضي الاحتياطي)
  default_markup   numeric not null default 30 check (default_markup >= 0),
  low_balance      numeric not null default 5 check (low_balance >= 0),
  note             text,
  last_balance     numeric,
  last_currency    text,
  last_checked_at  timestamptz,
  last_ok          boolean,
  last_error       text,
  last_ms          integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- مزوّد افتراضي واحد فقط
create unique index if not exists smm_providers_one_default
  on public.smm_providers (is_default) where is_default;

create or replace function public.smm_providers_touch() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists smm_providers_touch_trg on public.smm_providers;
create trigger smm_providers_touch_trg before update on public.smm_providers
  for each row execute function public.smm_providers_touch();

alter table public.smm_providers enable row level security;
drop policy if exists "smm providers admin all" on public.smm_providers;
create policy "smm providers admin all" on public.smm_providers
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------- سجل الإرسال ----------
create table if not exists public.smm_order_log (
  id               bigint generated always as identity primary key,
  order_id         text not null,
  item_idx         integer not null,                 -- موضع العنصر داخل الطلب
  item_id          text,
  provider_id      text,
  service_id       text,
  quantity         numeric,
  link             text,
  provider_order   text,                             -- رقم الطلب عند المزوّد
  status           text not null default 'sending'
                   check (status in ('sending','sent','failed','unknown')),
  provider_status  text,
  charge           numeric,
  remains          numeric,
  error            text,
  attempt          integer not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (order_id, item_idx)                        -- حارس الإرسال المزدوج
);
create index if not exists smm_order_log_created_idx on public.smm_order_log (created_at desc);
create index if not exists smm_order_log_prov_idx    on public.smm_order_log (provider_id, created_at desc);

alter table public.smm_order_log enable row level security;
drop policy if exists "smm log admin read" on public.smm_order_log;
create policy "smm log admin read" on public.smm_order_log
  for select to authenticated using (public.is_admin());
-- لا سياسات كتابة: الدالة الطرفية تكتب بصلاحية service_role.

-- ---------- ترحيل المزوّد القديم (مرة واحدة) ----------
insert into public.smm_providers (id, name, api_url, api_key, is_default, priority)
select 'main', 'المزوّد الرئيسي', btrim(a.smm_api_url), coalesce(a.smm_api_key, ''), true, 10
  from public.api_settings a
 where a.id = 1
   and coalesce(btrim(a.smm_api_url), '') ~* '^https://'
   and not exists (select 1 from public.smm_providers)
on conflict (id) do nothing;
