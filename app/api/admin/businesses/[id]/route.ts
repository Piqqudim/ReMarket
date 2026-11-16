import {
  Availability,
  BusinessStatus,
  LocationVerificationStatus,
  NotificationType,
  Prisma,
  SocialPlatform,
  VerificationStatus,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { geocodeBusinessLocation } from "@/lib/geocoding";
import { createNotification } from "@/lib/notifications";
import { qualifyReferralForUser } from "@/lib/referrals";
import { prisma } from "@/lib/prisma";
import { writeAdminAuditLog } from "@/lib/admin-audit";

type RouteContext = { params: Promise<{ id: string }> };
type ParsedSocialLink = { platform: SocialPlatform; handle: string };
type BusinessAuditRecord = {
  id: string;
  name: string;
  ownerId: string | null;
  ownerName: string | null;
  description: string | null;
  phone: string | null;
  imageUrl: string | null;
  availability: Availability;
  status: BusinessStatus;
  verification: VerificationStatus;
  priceMin: number | null;
  priceMax: number | null;
  deletedAt: Date | null;
  location: {
    id: string;
    area: string;
    street: string | null;
    address: string | null;
    lat: number | null;
    long: number | null;
    verification: LocationVerificationStatus;
  } | null;
  categories: Array<{ categoryId: string }>;
  socialLinks: Array<{ platform: SocialPlatform; handle: string }>;
};

const MAX_PRISMA_INT = 2_147_483_647;
const MAX_BUSINESS_ID_LENGTH = 100;
const MAX_NAME_LENGTH = 200;
const MAX_OWNER_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_AREA_LENGTH = 200;
const MAX_STREET_LENGTH = 300;
const MAX_HOUSE_NUMBER_LENGTH = 100;
const MAX_CITY_LENGTH = 100;
const MAX_ADDRESS_LENGTH = 2000;
const MAX_PHONE_LENGTH = 50;
const MAX_IMAGE_URL_LENGTH = 2000;
const MAX_CATEGORY_IDS = 50;
const MAX_CATEGORY_ID_LENGTH = 100;
const MAX_SOCIAL_LINKS = 6;
const MAX_SOCIAL_HANDLE_LENGTH = 2000;
const MAX_REQUEST_BODY_SIZE = 100 * 1024;

const SUPPORTED_PATCH_FIELDS = new Set([
  "name", "ownerName", "description", "phone", "imageUrl", "availability",
  "status", "verification", "locationVerification", "priceMin", "priceMax",
  "area", "address", "street", "houseNumber", "city", "lat", "lng", "long",
  "categoryIds", "socialLinks",
]);

const BUSINESS_AUDIT_INCLUDE = {
  location: true,
  categories: { select: { categoryId: true } },
  socialLinks: { select: { platform: true, handle: true } },
} satisfies Prisma.BusinessInclude;

function noStoreHeaders(): Headers {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  return headers;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: noStoreHeaders() });
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown): string | null {
  return cleanString(value) || null;
}

function parseOptionalInt(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  const parsed = typeof value === "number" ? value : Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= MAX_PRISMA_INT
    ? parsed
    : undefined;
}

function parseOptionalFloat(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && !value.trim()) return undefined;
  const parsed = typeof value === "number" ? value : Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isAvailability(value: unknown): value is Availability {
  return Object.values(Availability).includes(value as Availability);
}

function isBusinessStatus(value: unknown): value is BusinessStatus {
  return Object.values(BusinessStatus).includes(value as BusinessStatus);
}

function isVerificationStatus(value: unknown): value is VerificationStatus {
  return Object.values(VerificationStatus).includes(value as VerificationStatus);
}

function isLocationVerificationStatus(value: unknown): value is LocationVerificationStatus {
  return Object.values(LocationVerificationStatus).includes(value as LocationVerificationStatus);
}

function isSocialPlatform(value: unknown): value is SocialPlatform {
  return Object.values(SocialPlatform).includes(value as SocialPlatform);
}

function normalizeWhatsApp(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("234")) return `+${digits}`;
  if (digits.startsWith("0")) return `+234${digits.slice(1)}`;
  return trimmed;
}

function parseSocialLinks(value: unknown): ParsedSocialLink[] | null {
  if (!Array.isArray(value) || value.length > MAX_SOCIAL_LINKS) return null;
  const result: ParsedSocialLink[] = [];
  const seen = new Set<SocialPlatform>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const record = item as Record<string, unknown>;
    if (!isSocialPlatform(record.platform)) return null;
    let handle = cleanString(record.handle);
    if (handle.length > MAX_SOCIAL_HANDLE_LENGTH) return null;
    if (record.platform === SocialPlatform.WHATSAPP) handle = normalizeWhatsApp(handle);
    if (!handle) continue;
    if (seen.has(record.platform)) return null;
    seen.add(record.platform);
    result.push({ platform: record.platform, handle });
  }
  return result;
}

function phoneFromSocialLinks(links: ParsedSocialLink[]): string | null {
  return links.find((link) => link.platform === SocialPlatform.PHONE)?.handle ?? null;
}

function parseCategoryIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_CATEGORY_IDS) return null;
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") return null;
    const id = item.trim();
    if (!id) continue;
    if (id.length > MAX_CATEGORY_ID_LENGTH || seen.has(id)) return null;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function composeLocationAddress(houseNumber: string, street: string, area: string, city: string): string {
  return [houseNumber, street, area, city, "Nigeria"].filter(Boolean).join(", ");
}

function parseStoredLocationAddress(address: string | null, area: string) {
  let parts = (address ?? "").split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.at(-1)?.toLowerCase() === "nigeria") parts = parts.slice(0, -1);
  const areaIndex = parts.findIndex((part) => part.toLowerCase() === area.trim().toLowerCase());
  if (areaIndex >= 0) parts.splice(areaIndex, 1);
  if (parts.length === 0) return { houseNumber: "", street: "", city: "" };
  if (parts.length === 1) return { houseNumber: "", street: parts[0], city: "" };
  if (parts.length === 2) {
    const first = parts[0];
    const looksLikeHouseNumber =
      /^\d+[A-Za-z]?(?:\s*[/-]\s*[\w-]+)?$/.test(first) ||
      /^(?:shop|suite|unit|plot|house|block)\s*[\w-]+$/i.test(first);
    return looksLikeHouseNumber
      ? { houseNumber: first, street: parts[1], city: "" }
      : { houseNumber: "", street: parts[0], city: parts[1] };
  }
  return { houseNumber: parts[0], street: parts[1], city: parts.slice(2).join(", ") };
}

function businessAuditSnapshot(business: BusinessAuditRecord): Prisma.InputJsonValue {
  return {
    id: business.id,
    name: business.name,
    ownerId: business.ownerId,
    ownerName: business.ownerName,
    description: business.description,
    phone: business.phone,
    imageUrl: business.imageUrl,
    availability: business.availability,
    status: business.status,
    verification: business.verification,
    priceMin: business.priceMin,
    priceMax: business.priceMax,
    deletedAt: business.deletedAt?.toISOString() ?? null,
    location: business.location
      ? {
          id: business.location.id,
          area: business.location.area,
          street: business.location.street,
          address: business.location.address,
          lat: business.location.lat,
          long: business.location.long,
          verification: business.location.verification,
        }
      : null,
    categoryIds: business.categories.map((item) => item.categoryId),
    socialLinks: business.socialLinks.map((item) => ({ platform: item.platform, handle: item.handle })),
  } as Prisma.InputJsonValue;
}

async function loadBusiness(id: string) {
  const business = await prisma.business.findUnique({
    where: { id },
    include: {
      location: true,
      categories: { include: { category: true } },
      products: {
        include: {
          category: true,
          images: { orderBy: { sortOrder: "asc" } },
        },
        orderBy: { updatedAt: "desc" },
      },
      socialLinks: { orderBy: { platform: "asc" } },
    },
  });
  if (!business) return null;
  return { ...business, categories: business.categories.map((item) => item.category) };
}

function bodyTooLarge(request: NextRequest): boolean {
  const header = request.headers.get("content-length");
  if (!header) return false;
  const size = Number(header);
  return !Number.isSafeInteger(size) || size < 0 || size > MAX_REQUEST_BODY_SIZE;
}

async function notifyBusinessOwner(input: {
  ownerId: string | null;
  businessId: string;
  type: NotificationType;
  title: string;
  message: string;
}): Promise<void> {
  if (!input.ownerId?.trim()) return;
  try {
    await createNotification({
      userId: input.ownerId,
      type: input.type,
      title: input.title,
      message: input.message,
      data: { businessId: input.businessId, href: `/seller/${input.businessId}` },
    });
  } catch (error) {
    console.error("Business owner notification error:", error);
  }
}

async function tryQualifySellerReferral(ownerId: string | null, context: string): Promise<void> {
  if (!ownerId) return;
  try {
    await qualifyReferralForUser(ownerId, "SELLER");
  } catch (error) {
    console.error(`Seller referral qualification failed (${context}):`, error);
  }
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;
  const { id } = await context.params;
  if (!id) return jsonError("Business ID is required.", 400);
  if (id.length > MAX_BUSINESS_ID_LENGTH) return jsonError("Invalid business ID.", 400);
  try {
    const business = await loadBusiness(id);
    if (!business) return jsonError("Business not found.", 404);
    return NextResponse.json({ business }, { status: 200, headers: noStoreHeaders() });
  } catch (error) {
    console.error("Admin business GET error:", error);
    return jsonError("Unable to load business.", 500);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;
  const { id } = await context.params;
  if (!id) return jsonError("Business ID is required.", 400);
  if (id.length > MAX_BUSINESS_ID_LENGTH) return jsonError("Invalid business ID.", 400);

  try {
    if (bodyTooLarge(request)) return jsonError("Request body is too large.", 413);

    const existing = await prisma.business.findUnique({ where: { id }, include: { location: true } });
    if (!existing) return jsonError("Business not found.", 404);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Invalid request body.", 400);
    const payload = body as Record<string, unknown>;

    if ("restore" in payload) {
      if (Object.keys(payload).length !== 1) return jsonError("A restore request cannot include other updates.", 400);
      if (payload.restore !== true) return jsonError("Restore value must be true.", 400);

      const restoration = await prisma.$transaction(async (tx) => {
        const before = await tx.business.findUnique({ where: { id }, include: BUSINESS_AUDIT_INCLUDE });
        if (!before) return { kind: "NOT_FOUND" as const };
        if (!before.deletedAt) return { kind: "NOT_DELETED" as const };
        const changed = await tx.business.updateMany({
          where: { id, deletedAt: { not: null } },
          data: { deletedAt: null },
        });
        if (changed.count !== 1) return { kind: "CONFLICT" as const };
        const after = await tx.business.findUnique({ where: { id }, include: BUSINESS_AUDIT_INCLUDE });
        if (!after) throw new Error("BUSINESS_RESTORE_RELOAD_FAILED");
        await writeAdminAuditLog(tx, {
          adminId: auth.user.id,
          action: "BUSINESS_RESTORED_BY_ADMIN",
          entityType: "BUSINESS",
          entityId: id,
          beforeData: businessAuditSnapshot(before),
          afterData: businessAuditSnapshot(after),
          metadata: { restored: true } as Prisma.InputJsonValue,
        });
        return { kind: "RESTORED" as const, ownerId: after.ownerId, status: after.status };
      });

      if (restoration.kind === "NOT_FOUND") return jsonError("Business not found.", 404);
      if (restoration.kind === "NOT_DELETED") return jsonError("Business is not deleted.", 409);
      if (restoration.kind === "CONFLICT") return jsonError("Business changed during restoration. Reload and try again.", 409);

      if (restoration.status === BusinessStatus.ACTIVE && restoration.ownerId) {
        await tryQualifySellerReferral(restoration.ownerId, "business restoration");
      }
      const business = await loadBusiness(id);
      if (!business) return jsonError("Business was restored but could not be reloaded.", 500);
      return NextResponse.json({ success: true, restored: true, business }, { status: 200, headers: noStoreHeaders() });
    }

    if (!Object.keys(payload).some((key) => SUPPORTED_PATCH_FIELDS.has(key))) {
      return jsonError("Provide at least one supported business field to update.", 400);
    }

    const data: {
      name?: string;
      ownerName?: string | null;
      description?: string | null;
      phone?: string | null;
      imageUrl?: string | null;
      availability?: Availability;
      status?: BusinessStatus;
      verification?: VerificationStatus;
      priceMin?: number | null;
      priceMax?: number | null;
      locationId?: string;
    } = {};

    if ("name" in payload) {
      const name = cleanString(payload.name);
      if (!name) return jsonError("Business name is required.", 400);
      if (name.length > MAX_NAME_LENGTH) return jsonError("Business name is too long.", 400);
      data.name = name;
    }
    if ("ownerName" in payload) {
      const ownerName = nullableString(payload.ownerName);
      if (ownerName && ownerName.length > MAX_OWNER_NAME_LENGTH) return jsonError("Owner name is too long.", 400);
      data.ownerName = ownerName;
    }
    if ("description" in payload) {
      const description = nullableString(payload.description);
      if (description && description.length > MAX_DESCRIPTION_LENGTH) return jsonError("Business description is too long.", 400);
      data.description = description;
    }

    const legacyPhoneProvided = "phone" in payload;
    const legacyPhone = legacyPhoneProvided ? nullableString(payload.phone) : null;
    if (legacyPhone && legacyPhone.length > MAX_PHONE_LENGTH) return jsonError("Phone number is too long.", 400);
    if (legacyPhoneProvided) data.phone = legacyPhone;

    if ("imageUrl" in payload) {
      const imageUrl = nullableString(payload.imageUrl);
      if (imageUrl && imageUrl.length > MAX_IMAGE_URL_LENGTH) return jsonError("Image URL is too long.", 400);
      if (imageUrl) {
        try {
          const parsed = new URL(imageUrl);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return jsonError("Image URL must use HTTP or HTTPS.", 400);
        } catch {
          return jsonError("Invalid image URL.", 400);
        }
      }
      data.imageUrl = imageUrl;
    }

    if ("availability" in payload) {
      if (!isAvailability(payload.availability)) return jsonError("Invalid availability value.", 400);
      data.availability = payload.availability;
    }
    if ("status" in payload) {
      if (!isBusinessStatus(payload.status)) return jsonError("Invalid business status.", 400);
      data.status = payload.status;
    }
    if ("verification" in payload) {
      if (!isVerificationStatus(payload.verification)) return jsonError("Invalid verification status.", 400);
      data.verification = payload.verification;
    }

    const locationVerificationWasProvided = "locationVerification" in payload;
    let requestedLocationVerification: LocationVerificationStatus | undefined;
    if (locationVerificationWasProvided) {
      if (!isLocationVerificationStatus(payload.locationVerification)) return jsonError("Invalid location verification status.", 400);
      requestedLocationVerification = payload.locationVerification;
    }

    const priceMinProvided = "priceMin" in payload;
    const priceMaxProvided = "priceMax" in payload;
    const priceMin = parseOptionalInt(payload.priceMin);
    if (priceMin === undefined) return jsonError("Minimum price must be a valid integer between 0 and 2147483647.", 400);
    const priceMax = parseOptionalInt(payload.priceMax);
    if (priceMax === undefined) return jsonError("Maximum price must be a valid integer between 0 and 2147483647.", 400);
    if (priceMinProvided) data.priceMin = priceMin;
    if (priceMaxProvided) data.priceMax = priceMax;
    const finalPriceMin = priceMinProvided ? priceMin : existing.priceMin;
    const finalPriceMax = priceMaxProvided ? priceMax : existing.priceMax;
    if (finalPriceMin != null && finalPriceMax != null && finalPriceMin > finalPriceMax) {
      return jsonError("Minimum price cannot be greater than maximum price.", 400);
    }

    const locationWasProvided = ["area", "address", "street", "houseNumber", "city", "lat", "lng", "long"].some((key) => key in payload);
    const categoryIdsProvided = "categoryIds" in payload;
    const socialLinksProvided = "socialLinks" in payload;

    let categoryIds: string[] | null = null;
    if (categoryIdsProvided) {
      categoryIds = parseCategoryIds(payload.categoryIds);
      if (!categoryIds) return jsonError("categoryIds must be an array containing no more than 50 valid IDs.", 400);
      if (categoryIds.length > 0) {
        const categories = await prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true } });
        if (categories.length !== categoryIds.length) return jsonError("One or more selected categories do not exist.", 400);
      }
    }

    let socialLinks: ParsedSocialLink[] | null = null;
    if (socialLinksProvided) {
      socialLinks = parseSocialLinks(payload.socialLinks);
      if (!socialLinks) return jsonError("socialLinks must be an array containing no more than 6 valid links, with no duplicate platforms.", 400);
      const phoneFromSocial = phoneFromSocialLinks(socialLinks);
      if (phoneFromSocial && phoneFromSocial.length > MAX_PHONE_LENGTH) return jsonError("Phone number is too long.", 400);
      if (phoneFromSocial) {
        data.phone = phoneFromSocial;
      } else if (legacyPhoneProvided) {
        if (legacyPhone) socialLinks.push({ platform: SocialPlatform.PHONE, handle: legacyPhone });
        data.phone = legacyPhone;
      } else {
        data.phone = null;
      }
    }

    let requestedArea: string | undefined;
    let requestedAddress: string | null | undefined;
    let requestedStreet: string | null | undefined;
    let requestedLat: number | null | undefined;
    let requestedLong: number | null | undefined;
    let resolvedLat: number | null | undefined;
    let resolvedLong: number | null | undefined;
    let resolvedStreet: string | null | undefined;
    let locationChanged = false;

    if (locationWasProvided) {
      const currentArea = existing.location?.area ?? "";
      const currentStreet = existing.location?.street ?? null;
      const currentAddress = existing.location?.address ?? null;
      const currentLat = existing.location?.lat ?? null;
      const currentLong = existing.location?.long ?? null;
      const parsedAddress = parseStoredLocationAddress(currentAddress, currentArea);
      const existingStreet = currentStreet || parsedAddress.street;

      requestedArea = "area" in payload ? cleanString(payload.area) : currentArea;
      if (!requestedArea) return jsonError("Business area is required.", 400);
      if (requestedArea.length > MAX_AREA_LENGTH) return jsonError("Business area is too long.", 400);

      const streetProvided = "street" in payload;
      const houseNumberProvided = "houseNumber" in payload;
      const cityProvided = "city" in payload;
      const structuredLocationWasProvided = streetProvided || houseNumberProvided || cityProvided;

      if (structuredLocationWasProvided) {
        const resultingStreet = streetProvided ? cleanString(payload.street) : existingStreet;
        const resultingHouseNumber = houseNumberProvided ? cleanString(payload.houseNumber) : parsedAddress.houseNumber;
        const resultingCity = cityProvided ? cleanString(payload.city) : parsedAddress.city;
        if (resultingStreet.length > MAX_STREET_LENGTH) return jsonError("Business street is too long.", 400);
        if (resultingHouseNumber.length > MAX_HOUSE_NUMBER_LENGTH) return jsonError("House or shop number is too long.", 400);
        if (resultingCity.length > MAX_CITY_LENGTH) return jsonError("Business city is too long.", 400);
        if (!resultingStreet) return jsonError("Street, road, or close is required.", 400);
        requestedStreet = resultingStreet;
        requestedAddress = composeLocationAddress(resultingHouseNumber, resultingStreet, requestedArea, resultingCity);
      } else {
        const addressWasProvided = "address" in payload;
        if (addressWasProvided) {
          requestedAddress = nullableString(payload.address);
        } else if (requestedArea !== currentArea && existingStreet) {
          requestedAddress = composeLocationAddress(parsedAddress.houseNumber, existingStreet, requestedArea, parsedAddress.city);
        } else {
          requestedAddress = currentAddress;
        }
        requestedStreet = existingStreet || null;
      }

      if (requestedAddress != null && requestedAddress.length > MAX_ADDRESS_LENGTH) return jsonError("Business address is too long.", 400);

      requestedLat = "lat" in payload ? parseOptionalFloat(payload.lat) : currentLat;
      if (requestedLat === undefined) return jsonError("Latitude must be a valid number.", 400);
      if ("long" in payload && "lng" in payload) return jsonError("Provide longitude using either 'long' or 'lng', not both.", 400);
      requestedLong = "long" in payload ? parseOptionalFloat(payload.long) : "lng" in payload ? parseOptionalFloat(payload.lng) : currentLong;
      if (requestedLong === undefined) return jsonError("Longitude must be a valid number.", 400);
      if ((requestedLat === null) !== (requestedLong === null)) return jsonError("Latitude and longitude must be provided together.", 400);
      if (requestedLat !== null && (requestedLat < -90 || requestedLat > 90)) return jsonError("Latitude must be between -90 and 90.", 400);
      if (requestedLong !== null && (requestedLong < -180 || requestedLong > 180)) return jsonError("Longitude must be between -180 and 180.", 400);

      const areaChanged = requestedArea !== currentArea;
      const addressChanged = requestedAddress !== currentAddress;
      const streetChanged = (requestedStreet ?? null) !== currentStreet;
      const coordinatesChanged = requestedLat !== currentLat || requestedLong !== currentLong;
      resolvedLat = requestedLat;
      resolvedLong = requestedLong;
      resolvedStreet = requestedStreet ?? null;

      if (areaChanged || addressChanged || streetChanged) {
        const hasFreshCoordinates = requestedLat !== null && requestedLong !== null && coordinatesChanged;
        if (!hasFreshCoordinates) {
          resolvedStreet = structuredLocationWasProvided ? requestedStreet ?? null : null;
          if (requestedAddress) {
            try {
              const geocoded = await geocodeBusinessLocation({ address: requestedAddress, area: requestedArea });
              resolvedLat = geocoded.latitude;
              resolvedLong = geocoded.longitude;
              if (geocoded.street) resolvedStreet = geocoded.street;
            } catch (error) {
              console.warn("Business address could not be geocoded; saving without precise coordinates:", error);
              resolvedLat = null;
              resolvedLong = null;
            }
          } else {
            resolvedLat = null;
            resolvedLong = null;
          }
        } else {
          resolvedStreet = requestedStreet ?? null;
        }
      }
      if (streetChanged && !areaChanged && !addressChanged) resolvedStreet = requestedStreet ?? null;
      locationChanged = !existing.location || areaChanged || (resolvedStreet ?? null) !== currentStreet || addressChanged ||
        resolvedLat !== currentLat || resolvedLong !== currentLong;
    }

    if (locationVerificationWasProvided && !existing.location && !locationWasProvided) {
      return jsonError("Business has no saved location to verify.", 400);
    }

    await prisma.$transaction(async (tx) => {
      const before = await tx.business.findUnique({ where: { id }, include: BUSINESS_AUDIT_INCLUDE });
      if (!before) throw new Error("BUSINESS_NOT_FOUND");

      if (locationWasProvided && locationChanged) {
        const location = await tx.location.create({
          data: {
            area: requestedArea!,
            street: resolvedStreet ?? null,
            address: requestedAddress ?? null,
            lat: resolvedLat ?? null,
            long: resolvedLong ?? null,
            verification: LocationVerificationStatus.UNVERIFIED,
          },
        });
        data.locationId = location.id;
      } else if (locationVerificationWasProvided && before.location) {
        await tx.location.update({
          where: { id: before.location.id },
          data: { verification: requestedLocationVerification! },
        });
      }

      await tx.business.update({ where: { id }, data });

      if (categoryIdsProvided) {
        await tx.businessCategory.deleteMany({ where: { businessId: id } });
        if (categoryIds?.length) {
          await tx.businessCategory.createMany({
            data: categoryIds.map((categoryId) => ({ businessId: id, categoryId })),
            skipDuplicates: true,
          });
        }
      }

      if (socialLinksProvided) {
        await tx.businessSocialLink.deleteMany({ where: { businessId: id } });
        if (socialLinks?.length) {
          await tx.businessSocialLink.createMany({
            data: socialLinks.map((link) => ({ businessId: id, platform: link.platform, handle: link.handle })),
            skipDuplicates: true,
          });
        }
      } else if (legacyPhoneProvided) {
        await tx.businessSocialLink.deleteMany({ where: { businessId: id, platform: SocialPlatform.PHONE } });
        if (legacyPhone) {
          await tx.businessSocialLink.create({ data: { businessId: id, platform: SocialPlatform.PHONE, handle: legacyPhone } });
        }
      }

      const after = await tx.business.findUnique({ where: { id }, include: BUSINESS_AUDIT_INCLUDE });
      if (!after) throw new Error("BUSINESS_UPDATE_RELOAD_FAILED");

      const action = before.status !== after.status
        ? "BUSINESS_STATUS_CHANGED_BY_ADMIN"
        : before.verification !== after.verification
          ? "BUSINESS_VERIFICATION_CHANGED_BY_ADMIN"
          : before.location?.verification !== after.location?.verification
            ? "BUSINESS_LOCATION_VERIFICATION_CHANGED_BY_ADMIN"
            : "BUSINESS_UPDATED_BY_ADMIN";

      await writeAdminAuditLog(tx, {
        adminId: auth.user.id,
        action,
        entityType: "BUSINESS",
        entityId: id,
        beforeData: businessAuditSnapshot(before),
        afterData: businessAuditSnapshot(after),
        metadata: {
          changedFields: Object.keys(payload).filter((key) => SUPPORTED_PATCH_FIELDS.has(key)),
          locationChanged,
          categoriesReplaced: categoryIdsProvided,
          socialLinksReplaced: socialLinksProvided,
          statusChanged: before.status !== after.status,
          verificationChanged: before.verification !== after.verification,
          locationVerificationChanged: before.location?.verification !== after.location?.verification,
        } as Prisma.InputJsonValue,
      });
    });

    const updatedBusiness = await loadBusiness(id);
    if (!updatedBusiness) return jsonError("Business was updated but could not be reloaded.", 500);

    const resultingStatus = data.status ?? existing.status;
    const resultingVerification = data.verification ?? existing.verification;
    const becameActive = existing.status !== BusinessStatus.ACTIVE && resultingStatus === BusinessStatus.ACTIVE;
    if (becameActive && !existing.deletedAt && existing.ownerId) {
      await tryQualifySellerReferral(existing.ownerId, "business activation");
    }

    if (existing.status === BusinessStatus.PENDING && resultingStatus === BusinessStatus.ACTIVE) {
      await notifyBusinessOwner({ ownerId: existing.ownerId, businessId: existing.id, type: NotificationType.BUSINESS_APPROVED, title: "Business approved", message: `"${existing.name}" has been approved and is now active on ReMarket.` });
    }
    if (existing.status === BusinessStatus.PENDING && resultingStatus === BusinessStatus.INACTIVE) {
      await notifyBusinessOwner({ ownerId: existing.ownerId, businessId: existing.id, type: NotificationType.BUSINESS_REJECTED, title: "Business not approved", message: `"${existing.name}" was not approved and is currently inactive on ReMarket.` });
    }
    if (existing.status === BusinessStatus.ACTIVE && resultingStatus === BusinessStatus.INACTIVE) {
      await notifyBusinessOwner({ ownerId: existing.ownerId, businessId: existing.id, type: NotificationType.BUSINESS_DEACTIVATED, title: "Business deactivated", message: `"${existing.name}" has been deactivated by a ReMarket admin.` });
    }
    if (existing.verification === VerificationStatus.UNVERIFIED && resultingVerification === VerificationStatus.VERIFIED) {
      await notifyBusinessOwner({ ownerId: existing.ownerId, businessId: existing.id, type: NotificationType.BUSINESS_VERIFIED, title: "Business verified", message: `"${existing.name}" has been verified by ReMarket.` });
    }

    return NextResponse.json({ success: true, business: updatedBusiness }, { status: 200, headers: noStoreHeaders() });
  } catch (error) {
    console.error("Admin business PATCH error:", error);
    if (error instanceof Error && error.message === "BUSINESS_NOT_FOUND") return jsonError("Business not found.", 404);
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") return jsonError("Business could not be found.", 404);
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return jsonError("The update conflicts with an existing record.", 409);
    return jsonError("Unable to update business.", 500);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;
  const { id } = await context.params;
  if (!id) return jsonError("Business ID is required.", 400);
  if (id.length > MAX_BUSINESS_ID_LENGTH) return jsonError("Invalid business ID.", 400);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.business.findUnique({ where: { id }, include: BUSINESS_AUDIT_INCLUDE });
      if (!before) return { kind: "NOT_FOUND" as const };
      if (before.deletedAt) return { kind: "ALREADY_DELETED" as const };

      const deletedAt = new Date();
      const changed = await tx.business.updateMany({
        where: { id, deletedAt: null },
        data: { deletedAt },
      });
      if (changed.count !== 1) return { kind: "CONFLICT" as const };

      const after = await tx.business.findUnique({ where: { id }, include: BUSINESS_AUDIT_INCLUDE });
      if (!after) throw new Error("BUSINESS_DELETE_RELOAD_FAILED");
      await writeAdminAuditLog(tx, {
        adminId: auth.user.id,
        action: "BUSINESS_DELETED_BY_ADMIN",
        entityType: "BUSINESS",
        entityId: id,
        beforeData: businessAuditSnapshot(before),
        afterData: businessAuditSnapshot(after),
        metadata: { softDeleted: true, deletedAt: deletedAt.toISOString() } as Prisma.InputJsonValue,
      });
      return { kind: "DELETED" as const, id: before.id, name: before.name, ownerId: before.ownerId, deletedAt };
    });

    if (result.kind === "NOT_FOUND") return jsonError("Business not found.", 404);
    if (result.kind === "ALREADY_DELETED") return jsonError("Business is already deleted.", 409);
    if (result.kind === "CONFLICT") return jsonError("The business was already deleted or changed. Reload and try again.", 409);

    await notifyBusinessOwner({
      ownerId: result.ownerId,
      businessId: result.id,
      type: NotificationType.BUSINESS_DEACTIVATED,
      title: "Business deactivated",
      message: `"${result.name}" has been deactivated on ReMarket.`,
    });

    return NextResponse.json({
      success: true,
      deleted: true,
      business: { id: result.id, name: result.name, deletedAt: result.deletedAt.toISOString() },
    }, { status: 200, headers: noStoreHeaders() });
  } catch (error) {
    console.error("Admin business DELETE error:", error);
    if (error && typeof error === "object" && "code" in error && error.code === "P2025") return jsonError("Business could not be found.", 404);
    return jsonError("Unable to delete business.", 500);
  }
}
