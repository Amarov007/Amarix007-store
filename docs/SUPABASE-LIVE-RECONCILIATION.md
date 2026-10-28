# Supabase live reconciliation — 2026-10-29

This branch synchronizes supporting source and test artifacts with the live Supabase payment-v2 work.

## Safety notes

- The live project records these payment-related migrations: `20261028161625` (`amarix_payments_v2_core_safe`), `20261028175249` (`fix_payment_proof_verification_regex`), `20261028175440` (`amarix_fulfillment_queue_safe`), and `20261028175703` (`repair_payment_contract_guards`).
- The ZIP's proposed SQL files do not use those exact version/name pairs, and two files share timestamp `20261028200000`. They must not be copied directly into `supabase/migrations` and then run against production.
- Keep `payments_v2.on` disabled until authenticated-user RLS fixtures, proof submission, capture/refund idempotency, and end-to-end fulfillment tests pass.
- The `fulfillment-worker` source is not deployed by this branch. It requires a securely configured `FULFILLMENT_WORKER_TOKEN` and the Supabase service-role secret. Never commit either secret.
- Structural contract tests do not prove the complete payment and fulfillment flow.
- No customer, order, wallet, invoice, or payment rows are modified by this repository sync.

## Included

- `supabase/functions/payment-proof-hash/index.ts`: source for the deployed proof-hashing function.

## Deliberately not done

- No unverified SQL migration was added to the runnable migration directory.
- No payment feature flag was enabled.
- No fulfillment worker was deployed without its secret configured.
