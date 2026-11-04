/**
 * Shared ReMarket product pricing rules.
 *
 * A product must have either:
 * - One fixed price, or
 * - A starting price, with an optional maximum price.
 *
 * Prices are stored as Prisma Int fields, so they must not exceed
 * 2,147,483,647.
 */

const MAX_PRISMA_INT = 2_147_483_647;

export function validateProductPricing(
  price: number | null,
  priceMin: number | null,
  priceMax: number | null,
): string | null {
  const values: Array<[string, number | null]> = [
    ["Price", price],
    ["Minimum price", priceMin],
    ["Maximum price", priceMax],
  ];

  for (const [label, value] of values) {
    if (value === null) continue;

    if (!Number.isSafeInteger(value) || value <= 0) {
      return `${label} must be a positive whole number in naira.`;
    }

    if (value > MAX_PRISMA_INT) {
      return `${label} cannot exceed ₦2,147,483,647.`;
    }
  }

  // Fixed price and price range cannot be used together.
  if (price !== null && (priceMin !== null || priceMax !== null)) {
    return "Use either one fixed price or a price range, not both.";
  }

  // A product must have at least one price.
  if (price === null && priceMin === null) {
    return "A product price is required. Enter a fixed price or a minimum price.";
  }

  // A maximum price cannot exist without a minimum price.
  if (priceMin === null && priceMax !== null) {
    return "Enter a minimum price when using a price range.";
  }

  // The minimum cannot exceed the maximum.
  if (
    priceMin !== null &&
    priceMax !== null &&
    priceMin > priceMax
  ) {
    return "Minimum price cannot be greater than maximum price.";
  }

  return null;
}