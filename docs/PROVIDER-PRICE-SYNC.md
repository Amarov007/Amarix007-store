# Provider price reconciliation

## Contract

The store's product field `p` is always the retail price for one sellable unit/package in USDT. Provider responses do not all arrive in the same unit:

- SMM `services`: provider rate is per 1,000 service units.
- SMSActivate `numbers_catalog`: offer `p` is the price for one activation (the endpoint returns `cost * fx`, not `cost * 1000`).
- Custom providers: `smm-order` normalizes the configured source using `config.services.rate_is_unit`; its returned `rate` is per 1,000. Check that setting against the provider's documented API before enabling a custom integration.

Retail calculation:

- Per-thousand rate: `product.p = provider_rate * (1 + markup / 100) / 1000`.
- Per-unit rate: `product.p = provider_rate * (1 + markup / 100)`.
- If a product already has a discount `d`, the base `p` is divided by `(1 - d / 100)` so the discounted selling price retains the configured margin.

The helper keeps 12 decimal places so very small SMM prices are not rounded up to a much larger minimum price.

## Admin workflow

1. Open Admin → Import Center.
2. Select a provider and fetch its current catalogue.
3. Existing products are matched by provider ID + external service ID + country.
4. The preview shows provider cost, current store price, proposed store price, and price drift.
5. New services can be selected for import. Existing prices are never selected automatically; use “Select changed prices” and review the rows.
6. Choose the markup percentage. The preview recalculates before saving.
7. Saving changes only the admin catalogue draft. Review the draft and publish through the existing staged publish flow to make the prices live.

Rows with duplicate product mappings, unavailable services, or invalid/zero provider prices are not eligible for automatic repricing.

## Audit metadata

New imports and repriced products store non-secret metadata:

- `provider_cost_rate`
- `provider_rate_basis` (`per_1000` or `per_unit`)
- `provider_markup_pct`
- `provider_price_synced_at`

Existing products without this metadata are matched by their provider/service/country fields and use the configured default margin; once metadata exists, their own saved margin is preserved unless the administrator explicitly changes the margin field. They receive the metadata the first time they are repriced.

## Safety

- No live prices are changed just by fetching the catalogue.
- Existing orders and their saved item prices are not rewritten.
- No provider API keys are copied to the product catalogue.
- Do not assume a custom provider's raw price unit from a field name alone; validate `rate_is_unit` against the provider's official API documentation.
