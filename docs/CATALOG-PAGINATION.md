# Paginated storefront catalogue

For anonymous storefront visitors, the response from `public_config()` no longer includes product JSON. Authenticated staff with the `products` permission still receive the full product array through the same RPC so the existing staff editor continues to work.

## Database

- `private.store_catalog_products` stores each valid product JSON row with its stable display position.
- The table has RLS enabled and no grants to `anon`, `authenticated`, or `PUBLIC`.
- A trigger on `public.store_config` refreshes the private catalogue when the published products array changes.
- `public.catalog_products_page(p_offset, p_limit)` returns a bounded JSON page and total count. The function is SECURITY DEFINER with an empty search path and clamps offsets/limits.
- `public_config()` now returns store metadata and `products_total`, but excludes the products array.

## Frontend

`app.js` requests the first 500 products, paints the storefront, then retrieves further pages in 500-row chunks. It updates the in-memory catalogue and cache as pages arrive, preserving the existing client-side product filtering, product routes, cart and order flow. The separate 60-card DOM batch limits how many product cards are rendered at once.

## Verification

The live database currently reports 9,491 valid indexed products. A role-scoped SQL test as `anon` confirmed that the product field is JSON null, `products_total` matches the private catalogue count, the RPC returns bounded pages, and anon cannot read the private table. The public configuration payload is currently about 43.7 KB, down from about 659.8 KB before this change (approximately 93.4% smaller).

This is progressive transfer, not server-side filtering: after background loading completes, the browser still has the full catalogue for existing local search/filter behavior.
