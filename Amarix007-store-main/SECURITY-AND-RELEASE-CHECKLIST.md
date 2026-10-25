# AMARIX007 — Security & production release checklist

This repository is a static storefront backed by Supabase. Client-side code and the public/anon Supabase key are visible to every visitor; authorization must be enforced by PostgreSQL RLS, grants, trusted database functions, and Edge Functions.

## Before deploying

- [ ] Take a verified Supabase backup and test restoration to a separate project.
- [ ] Apply SQL changes to staging first; inspect every error and verify the resulting policies/grants in the Supabase dashboard.
- [ ] Confirm RLS is enabled on every table exposed through the Data API, including tables added outside `supabase-schema.sql`.
- [ ] Review policies for `orders`, `profiles`, `store_config`, `api_settings`, `notify_settings`, `affiliates`, `support_tickets`, and all other live tables. Remember: permissive policies combine with OR.
- [ ] Confirm `api_settings`, `notify_settings`, payment proofs, and customer-private files cannot be read by `anon` or unrelated authenticated users.
- [ ] Confirm `public_config()` exposes only public settings and intentionally public coupon data; never return API keys or private configuration.
- [ ] Review every `SECURITY DEFINER` function: fixed `search_path`, least-privilege execute grants, explicit authorization checks, input validation, and rate limiting where needed.
- [ ] Verify order totals, discounts, product eligibility, and order status are computed/validated on the server. A browser value is never authoritative.
- [ ] Verify customers cannot set `payment_status='paid'`, mark their own order complete, change ownership, or update another user's order.
- [ ] Verify payment proof upload does not itself mean payment is verified; only a trusted admin/provider flow may mark an order paid.
- [ ] Keep service-role, payment, AI, Telegram, and SMM secrets out of HTML/JS, public config, logs, and public storage.
- [ ] Configure Supabase Auth CAPTCHA/Turnstile (both site and secret keys) and leaked-password protection in the dashboard where supported.
- [ ] Confirm Edge Functions exist in the deployment and enforce authentication, authorization, rate limits, payload limits, and provider error handling.
- [ ] Test sign-up, email confirmation, login, logout, recovery, expired sessions, product browsing, cart, coupon, order creation, proof upload, admin order update, support tickets, and affiliate flows.
- [ ] Run the static checks: `python tests/verify-project.py`; if Node.js is available, run `node --check app.js`, `node --check admin.js`, `node --check sw.js`.
- [ ] Test on mobile and desktop, including offline/slow-network behavior and the service worker's cache update path.
- [ ] Add actual HTTP response headers at the hosting/CDN layer: `Content-Security-Policy`, `Strict-Transport-Security` (HTTPS only), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and an appropriate `Permissions-Policy`. Meta tags cannot set every security header (notably HSTS or CSP `frame-ancestors`).
- [ ] Monitor browser console, Supabase logs, failed function invocations, and order/payment discrepancies after release.

## Required adversarial tests

1. Anonymous visitor attempts to read private tables and private Storage objects: denied.
2. Customer A attempts to read/update Customer B's order or proof: denied.
3. Customer attempts to modify profile identity/referral fields or grant themselves admin access: denied or safely ignored by a database trigger.
4. Customer tampers with product price, quantity, coupon discount, order total, status, and payment status in browser requests: server rejects or recomputes trusted values.
5. Duplicate payment webhook/callback or repeated checkout request: no duplicate fulfillment or commission.
6. Admin-only operations with a normal user JWT: denied even if the UI is manually modified.
7. Storage uploads with wrong MIME type, oversized files, or another user's folder: denied.

## Scope and limitations

The static checker only catches common repository mistakes. It does not connect to Supabase, execute SQL, prove RLS correctness, audit remote Edge Functions, or replace a penetration test. The SQL files in this ZIP may not represent the live database exactly; compare against the live schema before production changes.
