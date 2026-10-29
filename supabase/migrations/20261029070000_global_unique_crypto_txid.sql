-- Prevent a transaction ID from being reused across any payment method.
-- The normalized unique index is the final authority under concurrent submissions.
-- TXIDs are retained after cancellation/rejection; a submitted on-chain transaction
-- must never be claimed by another payment, regardless of status or method.
create unique index if not exists payments_tx_ref_global_unique_idx
  on public.payments (
    (lower(regexp_replace(btrim(tx_ref), '\\s+', '', 'g')))
  )
  where nullif(btrim(tx_ref), '') is not null;

comment on index public.payments_tx_ref_global_unique_idx is
  'Globally unique normalized transaction references across all payment methods and statuses; prevents crypto TXID reuse.';
