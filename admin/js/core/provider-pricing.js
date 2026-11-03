/**
 * Provider price contract used by smm-order:
 * SMM/custom services are normalized by smm-order to a provider cost per 1,000
 * units in the store base currency (USDT). SMSActivate numbers_catalog instead
 * returns a price for one activation. The caller must pass the explicit basis.
 *
 * Store product.p is always the retail price for one sellable unit/package.
 */
export const PROVIDER_RATE_BASE = 1000;

export function providerRetailUnitPrice(rate, markupPct, rateBasis = "per_1000", discountPct = 0) {
  const cost = Number(rate);
  const markup = Number(markupPct);
  const discount = Number(discountPct);
  if (!Number.isFinite(cost) || cost <= 0) return 0;
  if (!Number.isFinite(markup) || markup < 0 || markup > 500) return 0;
  if (!Number.isFinite(discount) || discount < 0 || discount >= 100) return 0;
  const divisor = rateBasis === "per_unit" ? 1 : rateBasis === "per_1000" ? PROVIDER_RATE_BASE : 0;
  if (!divisor) return 0;
  const value = (cost * (1 + markup / 100)) / divisor / (1 - discount / 100);
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
