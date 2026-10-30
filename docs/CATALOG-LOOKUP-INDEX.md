# Catalog product-ID lookup index

Applied to the live Supabase project as migration `store_catalog_product_id_lookup`.

## Why

The storefront's `track_view(p_product)` function previously searched the product array inside `store_config.data` with `jsonb_array_elements` for every product view. The live catalog contains 9,493 array entries, so that lookup repeated a full JSON array expansion on a hot path.

## What changed

- Added the non-exposed `private.store_product_ids` lookup table with a primary-key index on `product_id`.
- Seeded it from valid product IDs in the current catalog.
- Added an `AFTER INSERT OR UPDATE OF data` trigger on `public.store_config`; it refreshes the lookup only when the products array changes.
- Updated `public.track_view(text)` to perform an indexed existence lookup instead of expanding the full JSON array.
- Revoked schema/table access from `PUBLIC`, `anon`, and `authenticated`; enabled RLS as defense in depth.

## Verification

At deployment, the lookup contained 9,491 IDs, matching all 9,491 valid unique product IDs in the catalog. Two catalog array entries do not have IDs matching the existing product-ID format and were deliberately left untouched. The anonymous role has neither schema usage nor table SELECT access.

The catalog itself remains in `store_config`; this change is backwards-compatible with the existing admin publishing RPC and storefront contract. It does not yet split the 9,493-product payload into paginated catalog endpoints.
