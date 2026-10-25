-- AMARIX007 — RLS audit (read-only: run in Supabase > SQL Editor, nothing here changes data)

-- 1) Tables in `public` WITHOUT row level security (every row must be empty, or the table is exposed to the anon key)
select c.relname as table_without_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
order by 1;

-- 2) Tables WITH RLS but no policy at all (nobody can read them, usually a mistake)
select c.relname as rls_on_but_no_policy
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
group by c.relname having count(p.policyname) = 0
order by 1;

-- 3) Policies that let the anon role (not logged in) read or write
select tablename, policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public' and ('anon' = any(roles) or 'public' = any(roles))
order by tablename, cmd;

-- 4) Sensitive tables: api_settings, push_subscriptions, payout_requests, reviews, orders, profiles
--    These must NOT show an anon SELECT policy in query 3, except reviews (public reading is fine).

-- To enable RLS on a table reported by query 1 (replace the name, then add policies before using the table):
--   alter table public.<table_name> enable row level security;
