import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSeller } from "@/lib/seller-auth";
import { ShipbubbleError, validateShipbubbleAddress } from "@/lib/shipbubble";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_BODY_BYTES = 8 * 1024;
const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: noStore });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeNigerianPhone(value: string): string {
  let digits = value.trim().replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("234")) return `+${digits}`;
  if (digits.startsWith("0")) return `+234${digits.slice(1)}`;
  return `+234${digits}`;
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const length = Number(contentLength);
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_BODY_BYTES) return null;
  }
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return null;
    const value: unknown = JSON.parse(raw);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

async function getSellerBusiness(ownerId: string) {
  return prisma.business.findFirst({
    where: { ownerId, deletedAt: null },
    select: {
      id: true,
      ownerId: true,
      name: true,
      locationId: true,
      ownerName: true,
      phone: true,
      shipbubblePickupAddressCode: true,
      shipbubblePickupValidatedAt: true,
      pickupContactName: true,
      pickupPhone: true,
      location: {
        select: {
          area: true,
          street: true,
          address: true,
          lga: true,
          state: true,
          lat: true,
          long: true,
        },
      },
    },
  });
}

function buildPickupAddress(location: NonNullable<Awaited<ReturnType<typeof getSellerBusiness>>>["location"]): string {
  if (!location) return "";
  const savedAddress = location.address?.trim() ?? "";
  const address = savedAddress || [
    location.street,
    location.area,
    location.lga,
    location.state,
  ].filter((part): part is string => Boolean(part?.trim())).join(", ");
  const withNigeria = address.toLowerCase().includes("nigeria")
    ? address
    : `${address}, Nigeria`;
  return withNigeria.trim();
}

export async function GET() {
  const auth = await requireSeller();
  if (!auth.authorized) return auth.response;

  try {
    const business = await getSellerBusiness(auth.user.id);
    if (!business) return jsonError("Active seller business not found.", 404);

    const pickupAddress = buildPickupAddress(business.location);
    return NextResponse.json({
      success: true,
      pickup: {
        isConfigured: business.shipbubblePickupAddressCode !== null && business.shipbubblePickupValidatedAt !== null,
        addressCode: business.shipbubblePickupAddressCode,
        validatedAt: business.shipbubblePickupValidatedAt,
        contactName: business.pickupContactName,
        phone: business.pickupPhone,
        businessAddress: pickupAddress || null,
        requiresValidation: !business.shipbubblePickupAddressCode || !business.shipbubblePickupValidatedAt,
      },
    }, { headers: noStore });
  } catch (error) {
    console.error("SELLER_SHIPBUBBLE_PICKUP_GET_ERROR:", error);
    return jsonError("Unable to load the Shipbubble pickup setup.", 500);
  }
}

export async function POST(request: Request) {
  const auth = await requireSeller();
  if (!auth.authorized) return auth.response;

  const body = await readBody(request);
  if (!body) return jsonError("Request body must be valid JSON and no larger than 8 KB.", 400);

  const unsupported = Object.keys(body).filter((key) => key !== "contactName" && key !== "phone");
  if (unsupported.length) return jsonError(`Unsupported fields: ${unsupported.join(", ")}.`, 400);

  const contactName = typeof body.contactName === "string" ? body.contactName.trim() : "";
  const rawPhone = typeof body.phone === "string" ? body.phone.trim() : "";
  const phone = normalizeNigerianPhone(rawPhone);
  if (contactName.length < 2 || contactName.length > 120) {
    return jsonError("Enter a pickup contact name between 2 and 120 characters.", 400);
  }
  if (!/^\+234\d{10}$/.test(phone)) {
    return jsonError("Enter a valid Nigerian mobile phone number.", 400);
  }

  try {
    const business = await getSellerBusiness(auth.user.id);
    if (!business) return jsonError("Active seller business not found.", 404);
    if (!business.locationId || !business.location) {
      return jsonError("Add a complete business pickup location before validating it with Shipbubble.", 409);
    }

    const address = buildPickupAddress(business.location);
    if (address.length < 10) {
      return jsonError("Your business address is incomplete. Update your business location first.", 400);
    }

    const validated = await validateShipbubbleAddress({
      name: contactName,
      email: auth.user.email,
      phone,
      address,
      ...(business.location.lat !== null && business.location.long !== null
        ? { latitude: business.location.lat, longitude: business.location.long }
        : {}),
    });

    if (!Number.isSafeInteger(validated.address_code) || validated.address_code <= 0) {
      return jsonError("Shipbubble did not return a valid pickup address code.", 502);
    }

    // locationId acts as an optimistic concurrency check: a location edited
    // while Shipbubble validation was in progress must be validated again.
    const saved = await prisma.business.updateMany({
      where: {
        id: business.id,
        ownerId: auth.user.id,
        locationId: business.locationId,
        deletedAt: null,
      },
      data: {
        shipbubblePickupAddressCode: validated.address_code,
        shipbubblePickupValidatedAt: new Date(),
        pickupContactName: contactName,
        pickupPhone: phone,
      },
    });

    if (saved.count !== 1) {
      return jsonError("Your business location changed while it was being validated. Refresh and validate the updated location.", 409);
    }

    return NextResponse.json({
      success: true,
      message: "Your business pickup address has been validated and saved with Shipbubble.",
      pickup: {
        isConfigured: true,
        addressCode: validated.address_code,
        validatedAt: new Date().toISOString(),
        contactName,
        phone,
        formattedAddress: validated.formatted_address,
      },
    }, { status: 200, headers: noStore });
  } catch (error) {
    console.error("SELLER_SHIPBUBBLE_PICKUP_VALIDATION_ERROR:", error);
    const status = error instanceof ShipbubbleError ? error.status : 502;
    return jsonError(
      error instanceof ShipbubbleError ? error.message : "Unable to validate the business pickup address with Shipbubble.",
      status,
    );
  }
}
