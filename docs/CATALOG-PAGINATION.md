# Paginated storefront catalogue

The storefront no longer receives all product JSON inside `public_config()`.

## Database

- `private.store_catalog_products` stores each valid product JSON row with its stable display position.
- The table has RLS enabled and no grants to `anon`, `authenticated`, or `PUBLIC`.
- A trigger on `public.store_config` refreshes the private catalogue when the published products array changes.
- `public.catalog_products_page(p_offset, p_limit)` returns a bounded JSON page and total count. The function is SECURITY DEFINER with an empty search path and clamps offsets/limits.
- `public_config()` now returns store metadata and `products_total`, but excludes the products array.

## Frontend

`app.js` requests the first 500 products, paints the storefront, then retrieves further pages in 500-row chunks. It updates the in-memory catalogue and cache as pages arrive, preserving the existing client-side product filtering, product routes, cart and order flow. The separate 60-card DOM batch limits how many product cards are rendered at once.

## Verification

The live database currently reports 9,491 valid indexed products. A direct SQL check confirmed that `public_config()` omits `products`, `products_total` matches the private catalogue count, and page requests return the expected bounded item count.

This is progressive transfer, not server-side filtering: after background loading completes, the browser still has the full catalogue for existing local search/filter behavior.
