/**
 * Shared ReMarket product pricing rules.
 * A product must have either one fixed price or a starting price.
 * A maximum price is optional when a starting price is supplied.
 */
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
    if (value !== null && (!Number.isSafeInteger(value) || value <= 0)) {
      return `${label} must be a positive whole number in naira.`;
    }
  }

  if (price !== null && (priceMin !== null || priceMax !== null)) {
    return "Use either one fixed price or a price range, not both.";
  }

  if (price === null && priceMin === null) {
    return "A product price is required. Enter a fixed price or a minimum price.";
  }

  if (priceMin === null && priceMax !== null) {
    return "Enter a minimum price when using a price range.";
  }

  if (priceMin !== null && priceMax !== null && priceMin > priceMax) {
    return "Minimum price cannot be greater than maximum price.";
  }

  return null;
}
