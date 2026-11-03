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


## Reconciliation update — 2026-11-03

The live Supabase wallet mismatch was corrected using recorded migrations:

- A private pre-change snapshot was created before the wallet migration.
- Wallet balances were moved from `smm` into `main` without changing the total balance.
- The wallet and top-up defaults now use `main`.
- The immutable `wallet_transactions` ledger was deliberately not updated. Historical rows retain their original section label.
- `wallet_eligible` preserves the authenticated-user check and the 1–50 item limit; unknown products and missing catalog configuration fail closed.
- Payments V2 remains disabled.
- The live-only `provider-api` and `smmnine-readonly` function sources were retrieved from the deployed project and added to the repository. Neither function was redeployed.

The private backup is retained at `private.amarix_wallet_backup_20261103`. Do not drop it as part of routine cleanup.

Remaining security review items include DNS rebinding resistance in provider outbound requests, CSP `unsafe-inline`, and the existing Supabase advisor findings. These were not silently changed because doing so without runtime verification could break provider access or storefront/admin behavior.
