/**
 * Provider price contract used by smm-order:
 * every provider's services/catalog response exposes rate as the provider cost
 * per 1,000 units in the store base currency (USDT), including custom providers
 * whose raw unit price is normalized by rate_is_unit in the Edge Function.
 *
 * Store product.p is the retail price for one sellable unit/package.
 */
export const PROVIDER_RATE_BASE = 1000;

export function providerRetailUnitPrice(ratePerThousand, markupPct) {
  const rate = Number(ratePerThousand);
  const markup = Number(markupPct);
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  if (!Number.isFinite(markup) || markup < 0 || markup > 500) return 0;
  const value = (rate * (1 + markup / 100)) / PROVIDER_RATE_BASE;
  // Keep sub-micro USDT prices accurate; six decimals were too coarse for SMM.
  const rounded = Math.round((value + Number.EPSILON) * 1e12) / 1e12;
  return rounded > 0 ? rounded : 0;
}

export function providerPriceChanged(currentPrice, nextPrice) {
  const current = Number(currentPrice);
  const next = Number(nextPrice);
  if (!Number.isFinite(current) || !Number.isFinite(next) || current <= 0 || next <= 0) return false;
  return Math.abs(current - next) > Math.max(1e-12, Math.abs(current) * 1e-8);
}

export function providerProductKey(providerId, serviceId, country = "") {
  return [providerId || "main", serviceId || "", country || ""].map(String).join("|");
}
