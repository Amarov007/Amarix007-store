# Amarix007 — Manual payments only

This build keeps the existing Supabase schema and uses the existing `store_config`, `orders`, and payment-proof workflow. No SQL migration is required or included for these frontend changes, and no database operation was performed while preparing this ZIP.

## Configure a payment method

1. Open `admin.html` and sign in as an authorized administrator.
2. Open **وسائل الدفع**.
3. Add/edit a method and set its display names, destination account/address, network (for example, the exact crypto network), optional minimum/maximum transfer, reference instructions, and Arabic/English instructions.
4. Enable only methods you currently accept and can manually verify.
5. Save the draft and use the existing **نشر** action when you are ready to publish the public store configuration. This publish action is performed by you from the admin UI; this ZIP preparation did not publish or change live data.

## Manual verification

- The customer submits an order and can upload a payment proof using the existing private `payment-proofs` flow.
- An administrator must independently verify the actual received funds, amount, currency, network and transaction reference.
- Setting an order's payment status to `paid` now asks for explicit confirmation and a one-time typed confirmation token derived from that order ID. This is a browser-side safety prompt, not a replacement for server-side authorization/RLS.
- Never treat a screenshot by itself as proof that funds arrived. Never share secret keys in public payment instructions.

## Important boundaries

- No Supabase database schema, tables, rows, policies, functions, or storage objects were modified by creating this ZIP.
- New payment-method fields (`network`, `min`, `max`, `memo`) are optional properties in the existing JSON store configuration. Older payment methods remain valid without them.
- The existing admin access and Supabase RLS remain the security boundary. A frontend-only ZIP cannot add durable server-side audit logs, atomic ledger operations, or stronger database permissions without backend/database work.
- Manual payment review is distinct from automatic fulfilment after a payment has been manually confirmed; existing fulfilment settings are unchanged.
