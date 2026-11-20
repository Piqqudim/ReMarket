import { createHash } from "node:crypto";

/**
 * Canonical cart line used to bind a Shipbubble quote to the exact cart
 * contents, seller, price and package measurements used to calculate it.
 * The quote-generation route and checkout route must use this same helper.
 */
export type DeliveryFingerprintLine = {
  productId: string;
  businessId: string;
  productName: string;
  description: string | null;
  unitPrice: number;
  quantity: number;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

export function createDeliveryCartFingerprint(
  lines: DeliveryFingerprintLine[],
): string {
  const canonical = lines
    .map((line) => ({
      productId: line.productId,
      businessId: line.businessId,
      productName: line.productName,
      description: line.description,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      weightKg: line.weightKg,
      lengthCm: line.lengthCm,
      widthCm: line.widthCm,
      heightCm: line.heightCm,
    }))
    .sort((a, b) => a.productId.localeCompare(b.productId));

  return createHash("sha256")
    .update(JSON.stringify(canonical), "utf8")
    .digest("hex");
}