import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { ShipmentStatus } from "@prisma/client";

/**
 * Shipbubble webhook helpers.
 *
 * Shipbubble's public webhook simulator documents the payload shape and
 * status values. The signing key may be configured separately, or may be
 * the API key depending on the credentials supplied for the account.
 * Prefer SHIPBUBBLE_WEBHOOK_SECRET when Shipbubble provides one.
 */
export function verifyShipbubbleWebhookSignature(
  rawBody: Buffer,
  suppliedSignature: string | null,
): boolean {
  const secret =
    process.env.SHIPBUBBLE_WEBHOOK_SECRET?.trim() ||
    process.env.SHIPBUBBLE_API_KEY?.trim() ||
    "";

  if (!secret || !suppliedSignature) return false;

  const normalized = suppliedSignature
    .trim()
    .replace(/^sha512=/i, "")
    .toLowerCase();

  if (!/^[a-f0-9]{128}$/.test(normalized)) return false;

  const expected = createHmac("sha512", secret)
    .update(rawBody)
    .digest();
  const received = Buffer.from(normalized, "hex");

  return (
    received.length === expected.length &&
    timingSafeEqual(received, expected)
  );
}

export function createShipbubbleWebhookEventKey(rawBody: Buffer): string {
  return `SHIPBUBBLE:${createHash("sha256").update(rawBody).digest("hex")}`;
}

export function createShipbubbleProviderEventKey(rawBody: Buffer): string {
  return createHash("sha256").update(rawBody).digest("hex");
}

export function mapShipbubbleStatus(value: unknown): ShipmentStatus | null {
  if (typeof value !== "string") return null;

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  switch (normalized) {
    case "pending":
      return ShipmentStatus.PENDING;
    case "confirmed":
      return ShipmentStatus.CONFIRMED;
    case "courier_assigned":
      return ShipmentStatus.COURIER_ASSIGNED;
    case "awaiting_pickup":
      return ShipmentStatus.AWAITING_PICKUP;
    case "picked_up":
    case "pickedup":
      return ShipmentStatus.PICKED_UP;
    case "in_transit":
      return ShipmentStatus.IN_TRANSIT;
    case "out_for_delivery":
      return ShipmentStatus.OUT_FOR_DELIVERY;
    case "completed":
    case "delivered":
      return ShipmentStatus.DELIVERED;
    case "delivery_failed":
    case "failed_delivery":
      return ShipmentStatus.DELIVERY_FAILED;
    case "returning":
    case "return_to_sender":
      return ShipmentStatus.RETURNING;
    case "returned":
      return ShipmentStatus.RETURNED;
    case "cancelled":
    case "canceled":
      return ShipmentStatus.CANCELLED;
    case "failed":
      return ShipmentStatus.FAILED;
    default:
      return null;
  }
}

export function getLatestShipbubblePackageStatus(
  payload: Record<string, unknown>,
): { label: string; occurredAt: Date | null } | null {
  const packageStatuses = Array.isArray(payload.package_status)
    ? payload.package_status
    : [];

  const latest = packageStatuses.length > 0
    ? packageStatuses[packageStatuses.length - 1]
    : null;

  const rawStatus =
    latest && typeof latest === "object" && !Array.isArray(latest)
      ? (latest as Record<string, unknown>).status
      : payload.status;

  if (typeof rawStatus !== "string" || !rawStatus.trim()) return null;

  const rawDate =
    latest && typeof latest === "object" && !Array.isArray(latest)
      ? (latest as Record<string, unknown>).datetime
      : payload.date;

  const parsedDate = typeof rawDate === "string" ? new Date(rawDate) : null;

  return {
    label: rawStatus.trim().slice(0, 100),
    occurredAt:
      parsedDate && Number.isFinite(parsedDate.getTime())
        ? parsedDate
        : null,
  };
}