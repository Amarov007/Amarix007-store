# Supabase migration history recovery

**Status: recovery required — do not reset production or assume this folder can recreate it.**

At the time of the AMARIX007 maintenance pass (2026-10-30 UTC):

- The connected production database reported **117 applied migration records**.
- The repository's `supabase/migrations/` folder contained **22 SQL files**.
- Several repository SQL files are aggregate scripts whose filenames do not match individual migration-ledger versions. The ledger therefore cannot be reconciled by filename alone.

## Safety rules

1. Do not run `supabase db reset`, destructive schema reconciliation, or bulk re-application against production as a shortcut.
2. Do not create empty placeholder migrations to make the version numbers appear complete. Supabase's migration ledger stores version/name metadata, not the original SQL body.
3. Do not delete, rename, or squash already-applied migration records in production.
4. Recover the original SQL from a trusted source (prior repository history, deployment archive, or verified backup), then map each applied version to its actual SQL.
5. If the original migration bodies cannot be recovered, create a separately reviewed baseline/schema snapshot from the live database and validate it on a fresh development project before using it for future provisioning.

## Current safety migration

`20261030210908_harden_payments_v2_store_config_invariant.sql` is present in this repository and was applied to the connected production database. It forces `payments_v2.on=false` on every `store_config.data` insert/update and blocks `payments_v2` from the `publish_store_config` patch.

This note is intentional: an incomplete migration history is a reproducibility issue, but fabricating historical SQL or resetting live data would create a larger production risk.


## Free, read-only recovery workflow

A paid Supabase branch is not required. Use the Supabase CLI and Docker locally:

1. Install the Supabase CLI and Docker, then run `supabase login` and `supabase link --project-ref pvuobngrybygohendwaz`.
2. Export schema only (no table rows) from production: `mkdir -p supabase/recovery && supabase db dump --linked --schema public,private -f supabase/recovery/schema_snapshot.sql`.
3. Start the local stack with `supabase start` and inspect its connection details using `supabase status`. Restore and test the snapshot against the local database only.
4. Keep the snapshot outside `supabase/migrations/` until reviewed. It is a current-state schema baseline, not a reconstruction of the original migration SQL or history.

Safety: do not run linked reset/push commands or alter the production migration ledger during recovery. The dump excludes Supabase-managed schemas such as Auth and Storage, so validate dependencies on the local Supabase stack. No hosted branch or extra Supabase compute is created by this workflow.

Official references: https://supabase.com/docs/reference/cli/global-flags and https://supabase.com/docs/guides/local-development/cli-workflows
