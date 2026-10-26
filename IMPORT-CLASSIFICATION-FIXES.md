# Amarix007 Store import and classification fixes

## Root cause findings
- `admin.html` originally loaded `store-data.js`, `svc-parse.js`, and `admin.js`, but did not load the existing `admin-import.js` extension. Thus its import center, bulk product tools, top-up manager, and SMM manager were not registered.
- `admin-import.js` originally changed `ptype` when the target hub differed from auto-classification (`mkRows`, old line 212). This conflated destination routing with product semantics. The revised importer retains the detected type and stores the selected destination separately.
- `admin-import.js` originally assumed a narrow provider response shape and used `rate / 1000` for every product type. This can corrupt package pricing and discard provider-specific image/denomination fields.
- `hubs.js` originally inferred hub membership for shop categories from the presence of `smm_provider` and category text. The revised code prioritizes explicit product types and avoids classifying explicit SMM-only categories as game/app hubs.
- `app.js` calls `AMXSvc.refine` and `AMXSvc.sortList`; these methods were not exported by the original `svc-parse.js`. They are now implemented with deterministic tie-breakers.

## Changes
- Added and loaded `admin-import.js` from `admin.html`; bumped cache versions for changed scripts/styles.
- Extended `svc-parse.js` with deterministic product classification, brand/hub mapping, required fields, provider/delivery/availability filters, denomination parsing, and stable sorting.
- Improved provider response normalization in `admin-import.js`, preserving raw provider fields and normalizing common ID/name/category/rate/image/amount/availability aliases.
- Kept SMM pricing per 1,000 while treating game/app provider rates as package prices.
- Improved `ext-store.js` package safety, price normalization, explicit product types, and image/denomination preservation.
- Improved `hubs.js` to prioritize explicit `ptype` and avoid cross-contaminating SMM products into game/app hubs.
- Added styling for the import center and product-management controls.
- No SQL migration was added: the inspected schema stores the store catalog in `store_config.data` JSONB, and these changes use existing JSON product/category fields. Deploy/publish through the existing authenticated admin flow and verify RLS policies remain enabled.

## Validation
- Ran `node --check` across every top-level JavaScript file in the project: passed.
- Ran a Node smoke test for PUBG/game, Netflix/app, Instagram/SMM classification and stable price sorting: passed.
- Provider response variants and live Supabase API calls still need staging verification with real provider credentials; they cannot be simulated from this archive alone.
