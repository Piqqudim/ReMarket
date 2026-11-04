
import {
  NotificationPriority,
  NotificationType,
} from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSeller } from "@/lib/seller-auth";
import { geocodeBusinessLocation } from "@/lib/geocoding";
import { createNotification } from "@/lib/notifications";

const MAX_PRISMA_INT = 2_147_483_647;
const MAX_REQUEST_BODY_BYTES = 100 * 1024;
const MAX_CATEGORY_IDS = 50;
const MAX_CATEGORY_ID_LENGTH = 100;
const MAX_SOCIAL_LINKS = 30;
const MAX_SOCIAL_HANDLE_LENGTH = 2000;

const ALLOWED_AVAILABILITY = [
  "AVAILABLE",
  "ASK_SELLER",
  "UNAVAILABLE",
] as const;

type AvailabilityValue = (typeof ALLOWED_AVAILABILITY)[number];
type SocialPlatform =
  | "WHATSAPP"
  | "INSTAGRAM"
  | "TIKTOK"
  | "FACEBOOK"
  | "PHONE"
  | "DIRECTIONS";

type ParsedSocialLink = {
  platform: SocialPlatform;
  handle: string;
};

type ParsedLocationInput = {
  area: string;
  address: string;
  houseNumber: string;
  street: string;
  city: string;
};

type ParsedStoredAddress = {
  houseNumber: string;
  street: string;
  city: string;
};

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableString(value: unknown): string | null {
  return cleanString(value) || null;
}

function hasOwn(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function parseOptionalInt(
  value: unknown,
): number | null | "INVALID" {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_PRISMA_INT
  ) {
    return "INVALID";
  }

  return value;
}

function parseOptionalFloat(
  value: unknown,
): number | null | "INVALID" {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : "INVALID";
  }

  if (typeof value === "string") {
    const cleaned = value.trim();
    if (!cleaned) return null;

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : "INVALID";
  }

  return "INVALID";
}

function parseAvailability(
  value: unknown,
): AvailabilityValue | null {
  const cleaned = cleanString(value);

  return ALLOWED_AVAILABILITY.includes(
    cleaned as AvailabilityValue,
  )
    ? (cleaned as AvailabilityValue)
    : null;
}

function jsonHeaders() {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function validateCoordinates(
  lat: number | null,
  long: number | null,
): string | null {
  if ((lat === null) !== (long === null)) {
    return "Latitude and longitude must be provided together.";
  }

  if (lat !== null && (lat < -90 || lat > 90)) {
    return "Latitude must be between -90 and 90.";
  }

  if (long !== null && (long < -180 || long > 180)) {
    return "Longitude must be between -180 and 180.";
  }

  return null;
}

function isSocialPlatform(value: unknown): value is SocialPlatform {
  return (
    value === "WHATSAPP" ||
    value === "INSTAGRAM" ||
    value === "TIKTOK" ||
    value === "FACEBOOK" ||
    value === "PHONE" ||
    value === "DIRECTIONS"
  );
}

function normalizeNigerianPhone(value: string): string {
  let clean = value.trim().replace(/[^\d+]/g, "");
  if (!clean) return "";

  if (clean.startsWith("00")) clean = clean.slice(2);
  if (clean.startsWith("+")) clean = clean.slice(1);

  if (clean.startsWith("234")) return `+${clean}`;
  if (clean.startsWith("0")) return `+234${clean.slice(1)}`;

  return `+234${clean}`;
}

function normalizeSocialHandle(
  platform: SocialPlatform,
  handle: string,
): string {
  const clean = handle.trim();
  if (!clean) return "";

  if (platform === "WHATSAPP" || platform === "PHONE") {
    if (clean.startsWith("http://") || clean.startsWith("https://")) {
      return clean;
    }
    return normalizeNigerianPhone(clean);
  }

  return clean;
}

function parseSocialLinkUpdates(
  value: unknown,
): ParsedSocialLink[] | null {
  if (!Array.isArray(value) || value.length > MAX_SOCIAL_LINKS) {
    return null;
  }

  const result: ParsedSocialLink[] = [];
  let phoneAlreadyProvided = false;

  for (const item of value) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item)
    ) {
      return null;
    }

    const record = item as Record<string, unknown>;

    if (!isSocialPlatform(record.platform)) return null;
    if (typeof record.handle !== "string") return null;

    let handle = record.handle.trim();
    if (handle.length > MAX_SOCIAL_HANDLE_LENGTH) return null;

    if (record.platform === "PHONE") {
      if (phoneAlreadyProvided) return null;
      phoneAlreadyProvided = true;
    }

    if (handle) {
      handle = normalizeSocialHandle(record.platform, handle);
    }

    if (handle.length > MAX_SOCIAL_HANDLE_LENGTH) return null;

    result.push({
      platform: record.platform,
      handle,
    });
  }

  return result;
}

function getPhoneUpdateFromSocialLinks(
  socialLinks: ParsedSocialLink[],
): ParsedSocialLink | null {
  return (
    socialLinks.find((link) => link.platform === "PHONE") ?? null
  );
}

function parseCategoryIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > MAX_CATEGORY_IDS) {
    return null;
  }

  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string") return null;

    const id = item.trim();
    if (!id || id.length > MAX_CATEGORY_ID_LENGTH || seen.has(id)) {
      return null;
    }

    seen.add(id);
    result.push(id);
  }

  return result;
}

function composeLocationAddress(
  houseNumber: string,
  street: string,
  area: string,
  city: string,
): string {
  return [
    houseNumber,
    street,
    area,
    city,
    "Nigeria",
  ].filter(Boolean).join(", ");
}

function parseLocationInput(
  payload: Record<string, unknown>,
): ParsedLocationInput {
  const area = cleanString(payload.area);
  const street = cleanString(payload.street);
  const houseNumber = cleanString(payload.houseNumber);
  const city = cleanString(payload.city);
  const suppliedAddress = cleanString(payload.address);

  const address = street
    ? composeLocationAddress(houseNumber, street, area, city)
    : suppliedAddress;

  return { area, address, houseNumber, street, city };
}

function parseStoredLocationAddress(
  address: string | null,
  area: string,
): ParsedStoredAddress {
  if (!address) {
    return { houseNumber: "", street: "", city: "" };
  }

  let parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!parts.length) {
    return { houseNumber: "", street: "", city: "" };
  }

  if (parts[parts.length - 1].toLowerCase() === "nigeria") {
    parts = parts.slice(0, -1);
  }

  const normalizedArea = area.trim().toLowerCase();

  if (normalizedArea) {
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      if (
        parts[index].toLowerCase() === normalizedArea &&
        (index === parts.length - 1 ||
          index === parts.length - 2)
      ) {
        parts.splice(index, 1);
        break;
      }
    }
  }

  if (!parts.length) {
    return { houseNumber: "", street: "", city: "" };
  }

  if (parts.length === 1) {
    return { houseNumber: "", street: parts[0], city: "" };
  }

  if (parts.length === 2) {
    const looksLikeHouseNumber =
      /^(?:\d+[A-Za-z]?(?:\s*[/-]\s*[\w-]+)?|(?:shop|suite|unit|plot|house|block)\s*[\w-]+)$/i.test(
        parts[0],
      );

    return looksLikeHouseNumber
      ? {
          houseNumber: parts[0],
          street: parts[1],
          city: "",
        }
      : {
          houseNumber: "",
          street: parts[0],
          city: parts[1],
        };
  }

  return {
    houseNumber: parts[0],
    street: parts[1],
    city: parts.slice(2).join(", "),
  };
}

async function loadSellerBusiness(ownerId: string) {
  return prisma.business.findUnique({
    where: { ownerId },
    include: {
      location: true,
      categories: {
        include: { category: true },
      },
      products: {
        where: { deletedAt: null },
        orderBy: { updatedAt: "desc" },
        include: {
          images: {
            orderBy: { sortOrder: "asc" },
          },
          category: true,
        },
      },
      socialLinks: {
        orderBy: { platform: "asc" },
      },
    },
  });
}

function isRequestBodyTooLarge(request: Request): boolean {
  const contentLength = request.headers.get("content-length");
  if (contentLength === null) return false;

  const parsed = Number(contentLength);

  return (
    !Number.isSafeInteger(parsed) ||
    parsed < 0 ||
    parsed > MAX_REQUEST_BODY_BYTES
  );
}

async function readRequestBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  if (isRequestBodyTooLarge(request)) return null;

  let rawBody: string;

  try {
    rawBody = await request.text();
  } catch {
    return null;
  }

  if (
    Buffer.byteLength(rawBody, "utf8") >
    MAX_REQUEST_BODY_BYTES
  ) {
    return null;
  }

  let body: unknown;

  try {
    body = JSON.parse(rawBody);
  } catch {
    return null;
  }

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return null;
  }

  return body as Record<string, unknown>;
}

async function notifyAdminsOfBusinessUpdate(
  businessId: string,
  businessName: string,
): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { role: "ADMIN" },
      select: { id: true },
    });

    for (const admin of admins) {
      try {
        await createNotification({
          userId: admin.id,
          type: NotificationType.BUSINESS_UPDATED,
          title: "Business updated",
          message: `${businessName} was updated by its seller.`,
          priority: NotificationPriority.NORMAL,
          data: {
            businessId,
            href: `/admin/businesses/${businessId}`,
          },
          dedupeKey: null,
        });
      } catch (error) {
        console.error("Business admin notification error:", error);
      }
    }
  } catch (error) {
    console.error("Business admin lookup error:", error);
  }
}

/* GET */
export async function GET() {
  const auth = await requireSeller();
  if (!auth.authorized) return auth.response;

  try {
    const business = await loadSellerBusiness(auth.user.id);

    return NextResponse.json(
      { business },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Seller business GET error:", error);

    return NextResponse.json(
      { error: "Unable to load business." },
      { status: 500, headers: jsonHeaders() },
    );
  }
}

/* POST */
export async function POST(request: Request) {
  const auth = await requireSeller();
  if (!auth.authorized) return auth.response;

  if (auth.business) {
    return NextResponse.json(
      { error: "This seller account already has a business." },
      { status: 409, headers: jsonHeaders() },
    );
  }

  try {
    if (isRequestBodyTooLarge(request)) {
      return NextResponse.json(
        { error: "Request body is too large." },
        { status: 413, headers: jsonHeaders() },
      );
    }

    const payload = await readRequestBody(request);

    if (!payload) {
      return NextResponse.json(
        { error: "Invalid request body or JSON." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    const name = cleanString(payload.name);
    const ownerName = cleanString(payload.ownerName);
    const description = cleanString(payload.description);
    const locationInput = parseLocationInput(payload);

    const { area, address, street } = locationInput;
    const imageUrl = cleanString(payload.imageUrl);

    const categoryIds = parseCategoryIds(payload.categoryIds);

    if (payload.categoryIds !== undefined && !categoryIds) {
      return NextResponse.json(
        { error: "categoryIds must be an array of valid IDs." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    const finalCategoryIds = categoryIds ?? [];
    const availability = parseAvailability(payload.availability);

    // Contact visibility is private unless explicitly enabled.
    if (
      payload.showContactInfo !== undefined &&
      typeof payload.showContactInfo !== "boolean"
    ) {
      return NextResponse.json(
        { error: "Contact visibility must be true or false." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    const showContactInfo = payload.showContactInfo === true;

    if (!name) {
      return NextResponse.json(
        { error: "Business name is required." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    if (name.length > 200) {
      return NextResponse.json(
        { error: "Business name is too long." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    if (!area) {
      return NextResponse.json(
        { error: "Business area is required." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    if (area.length > 200) {
      return NextResponse.json(
        { error: "Business area is too long." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    if (!street && !address) {
      return NextResponse.json(
        { error: "Business street/address is required." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    if (address.length > 2000 || street.length > 300) {
      return NextResponse.json(
        { error: "Business address or street is too long." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    if (
      locationInput.houseNumber.length > 100 ||
      locationInput.city.length > 100
    ) {
      return NextResponse.json(
        { error: "House number or city is too long." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    if (ownerName.length > 200 || description.length > 2000) {
      return NextResponse.json(
        { error: "Owner name or business description is too long." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    if (imageUrl.length > 2000 || (imageUrl && !isValidHttpUrl(imageUrl))) {
      return NextResponse.json(
        { error: "Image URL must be a valid HTTP or HTTPS URL." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    const availabilityWasProvided =
      payload.availability !== undefined &&
      payload.availability !== null &&
      payload.availability !== "";

    if (availabilityWasProvided && availability === null) {
      return NextResponse.json(
        { error: "Invalid availability value." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    const priceMin = parseOptionalInt(payload.priceMin);
    const priceMax = parseOptionalInt(payload.priceMax);

    if (priceMin === "INVALID" || priceMax === "INVALID") {
      return NextResponse.json(
        { error: "Price values must be whole numbers." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    if (
      priceMin !== null &&
      priceMax !== null &&
      priceMin > priceMax
    ) {
      return NextResponse.json(
        { error: "Minimum price cannot be greater than maximum price." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    const parsedLat = parseOptionalFloat(payload.lat);
    const longProvided = hasOwn(payload, "long");
    const lngProvided = hasOwn(payload, "lng");

    if (longProvided && lngProvided) {
      return NextResponse.json(
        { error: "Provide longitude using either 'long' or 'lng', not both." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    const parsedLong = parseOptionalFloat(
      longProvided ? payload.long : payload.lng,
    );

    if (parsedLat === "INVALID" || parsedLong === "INVALID") {
      return NextResponse.json(
        { error: "Latitude and longitude must be valid numbers." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    const coordinateError = validateCoordinates(
      parsedLat,
      parsedLong,
    );

    if (coordinateError) {
      return NextResponse.json(
        { error: coordinateError },
        { status: 400, headers: jsonHeaders() },
      );
    }

    const socialLinksProvided = payload.socialLinks !== undefined;
    let socialLinks: ParsedSocialLink[] | null = null;

    if (socialLinksProvided) {
      socialLinks = parseSocialLinkUpdates(payload.socialLinks);

      if (!socialLinks) {
        return NextResponse.json(
          { error: "socialLinks must be an array of valid links." },
          { status: 400, headers: jsonHeaders() },
        );
      }
    }

    const legacyPhoneProvided = hasOwn(payload, "phone");
    const legacyPhoneRaw = legacyPhoneProvided
      ? cleanString(payload.phone)
      : "";

    if (legacyPhoneRaw.length > 50) {
      return NextResponse.json(
        { error: "Phone number is too long." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    const normalizedLegacyPhone = legacyPhoneRaw
      ? normalizeNigerianPhone(legacyPhoneRaw)
      : null;

    if (normalizedLegacyPhone && normalizedLegacyPhone.length > 50) {
      return NextResponse.json(
        { error: "Phone number is too long." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    const createSocialLinks = (socialLinks ?? []).filter(
      (link) => Boolean(link.handle),
    );

    const createPhoneSocial = createSocialLinks.find(
      (link) => link.platform === "PHONE",
    );

    const finalCreateSocialLinks = [...createSocialLinks];

    if (!createPhoneSocial && normalizedLegacyPhone) {
      finalCreateSocialLinks.push({
        platform: "PHONE",
        handle: normalizedLegacyPhone,
      });
    }

    const phone =
      finalCreateSocialLinks.find(
        (link) => link.platform === "PHONE",
      )?.handle ?? null;

    if (phone && phone.length > 50) {
      return NextResponse.json(
        { error: "Phone number is too long." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    let categories: { id: string }[] = [];

    if (finalCategoryIds.length > 0) {
      categories = await prisma.category.findMany({
        where: {
          id: { in: finalCategoryIds },
          isActive: true,
        },
        select: { id: true },
      });

      if (categories.length !== finalCategoryIds.length) {
        return NextResponse.json(
          { error: "One or more selected categories are invalid or inactive." },
          { status: 400, headers: jsonHeaders() },
        );
      }
    }

    const existingBusiness = await prisma.business.findUnique({
      where: { ownerId: auth.user.id },
      select: { id: true },
    });

    if (existingBusiness) {
      return NextResponse.json(
        { error: "This seller account already has a business." },
        { status: 409, headers: jsonHeaders() },
      );
    }

    let resolvedLat = parsedLat;
    let resolvedLong = parsedLong;
    let resolvedStreet: string | null = street || null;

    if (resolvedLat === null && resolvedLong === null && address) {
      try {
        const geocoded = await geocodeBusinessLocation({
          address,
          area,
          city: locationInput.city || undefined,
        });

        resolvedLat = geocoded.latitude;
        resolvedLong = geocoded.longitude;

        if (geocoded.street) {
          resolvedStreet = geocoded.street;
        }
      } catch (error) {
        console.warn(
          "Business address could not be geocoded; saving without precise coordinates:",
          error,
        );
      }
    }

    const resolvedCoordinateError = validateCoordinates(
      resolvedLat,
      resolvedLong,
    );

    if (resolvedCoordinateError) {
      return NextResponse.json(
        { error: resolvedCoordinateError },
        { status: 400, headers: jsonHeaders() },
      );
    }

    const businessAvailability: AvailabilityValue =
      availability ?? "ASK_SELLER";

    const business = await prisma.$transaction(async (tx) => {
      const location = await tx.location.create({
        data: {
          area,
          street: resolvedStreet,
          address: address || null,
          lat: resolvedLat,
          long: resolvedLong,
          verification: "UNVERIFIED",
        },
      });

      const createdBusiness = await tx.business.create({
        data: {
          name,
          ownerName: ownerName || auth.user.name || null,
          ownerId: auth.user.id,
          description: description || null,
          locationId: location.id,
          priceMin,
          priceMax,
          availability: businessAvailability,
          phone,
          imageUrl: imageUrl || null,
          showContactInfo,
          categories: categories.length > 0
            ? {
                create: categories.map((category) => ({
                  categoryId: category.id,
                })),
              }
            : undefined,
        },
      });

      if (finalCreateSocialLinks.length > 0) {
        await tx.businessSocialLink.createMany({
          data: finalCreateSocialLinks.map((link) => ({
            businessId: createdBusiness.id,
            platform: link.platform,
            handle: link.handle,
          })),
          skipDuplicates: true,
        });
      }

      return tx.business.findUniqueOrThrow({
        where: { id: createdBusiness.id },
        include: {
          location: true,
          categories: {
            include: { category: true },
          },
          products: {
            where: { deletedAt: null },
            orderBy: { updatedAt: "desc" },
            include: {
              images: {
                orderBy: { sortOrder: "asc" },
              },
              category: true,
            },
          },
          socialLinks: {
            orderBy: { platform: "asc" },
          },
        },
      });
    });

    return NextResponse.json(
      {
        message: "Business created successfully.",
        business,
      },
      { status: 201, headers: jsonHeaders() },
    );
  } catch (error) {
    console.error("Seller business creation error:", error);

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "This seller account already has a business." },
        { status: 409, headers: jsonHeaders() },
      );
    }

    return NextResponse.json(
      { error: "Unable to create business." },
      { status: 500, headers: jsonHeaders() },
    );
  }
}

/* PATCH */
export async function PATCH(request: Request) {
  const auth = await requireSeller();
  if (!auth.authorized) return auth.response;

  try {
    if (isRequestBodyTooLarge(request)) {
      return NextResponse.json(
        { error: "Request body is too large." },
        { status: 413, headers: jsonHeaders() },
      );
    }

    const payload = await readRequestBody(request);

    if (!payload) {
      return NextResponse.json(
        { error: "Invalid request body or JSON." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    const supportedPatchFields = new Set([
      "name",
      "ownerName",
      "description",
      "phone",
      "imageUrl",
      "availability",
      "priceMin",
      "priceMax",
      "categoryIds",
      "socialLinks",
      "area",
      "address",
      "street",
      "houseNumber",
      "city",
      "lat",
      "long",
      "lng",
      "showContactInfo",
    ]);

    if (
      Object.keys(payload).length === 0 ||
      !Object.keys(payload).some((key) =>
        supportedPatchFields.has(key),
      )
    ) {
      return NextResponse.json(
        { error: "Provide at least one supported field to update." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    const existingBusiness = await prisma.business.findUnique({
      where: { ownerId: auth.user.id },
      select: {
        id: true,
        ownerId: true,
        name: true,
        deletedAt: true,
        priceMin: true,
        priceMax: true,
        location: {
          select: {
            id: true,
            area: true,
            street: true,
            address: true,
            lat: true,
            long: true,
            verification: true,
          },
        },
      },
    });

    if (!existingBusiness) {
      return NextResponse.json(
        { error: "You do not have a business linked to this seller account." },
        { status: 404, headers: jsonHeaders() },
      );
    }

    if (existingBusiness.ownerId !== auth.user.id) {
      return NextResponse.json(
        { error: "You are not allowed to edit this business." },
        { status: 403, headers: jsonHeaders() },
      );
    }

    if (existingBusiness.deletedAt) {
      return NextResponse.json(
        { error: "This business has been deleted." },
        { status: 410, headers: jsonHeaders() },
      );
    }

    const has = (key: string) => hasOwn(payload, key);

    const name = has("name") ? cleanString(payload.name) : undefined;
    const ownerName = has("ownerName")
      ? cleanString(payload.ownerName)
      : undefined;
    const description = has("description")
      ? cleanString(payload.description)
      : undefined;
    const imageUrl = has("imageUrl")
      ? cleanString(payload.imageUrl)
      : undefined;

    const availabilityProvided = has("availability");
    const availability = availabilityProvided
      ? parseAvailability(payload.availability)
      : undefined;

    // Validate visibility before adding it to the update object.
    if (
      has("showContactInfo") &&
      typeof payload.showContactInfo !== "boolean"
    ) {
      return NextResponse.json(
        { error: "Contact visibility must be true or false." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    if (name !== undefined && !name) {
      return NextResponse.json(
        { error: "Business name cannot be empty." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    if (
      (name !== undefined && name.length > 200) ||
      (ownerName !== undefined && ownerName.length > 200) ||
      (description !== undefined && description.length > 2000)
    ) {
      return NextResponse.json(
        { error: "Business name, owner name or description is too long." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    if (imageUrl !== undefined && imageUrl.length > 2000) {
      return NextResponse.json(
        { error: "Image URL is too long." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    if (imageUrl && !isValidHttpUrl(imageUrl)) {
      return NextResponse.json(
        { error: "Image URL must be a valid HTTP or HTTPS URL." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    if (availabilityProvided && availability === null) {
      return NextResponse.json(
        { error: "Invalid availability value." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    const priceMinProvided = has("priceMin");
    const priceMaxProvided = has("priceMax");

    const priceMin = priceMinProvided
      ? parseOptionalInt(payload.priceMin)
      : undefined;

    const priceMax = priceMaxProvided
      ? parseOptionalInt(payload.priceMax)
      : undefined;

    if (priceMin === "INVALID" || priceMax === "INVALID") {
      return NextResponse.json(
        { error: "Price values must be whole numbers." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    const resultingPriceMin = priceMinProvided
      ? priceMin ?? null
      : existingBusiness.priceMin;

    const resultingPriceMax = priceMaxProvided
      ? priceMax ?? null
      : existingBusiness.priceMax;

    if (
      resultingPriceMin !== null &&
      resultingPriceMax !== null &&
      resultingPriceMin > resultingPriceMax
    ) {
      return NextResponse.json(
        { error: "Minimum price cannot be greater than maximum price." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    const categoryIdsProvided = has("categoryIds");
    let categoryIds: string[] = [];

    if (categoryIdsProvided) {
      const parsedCategoryIds = parseCategoryIds(
        payload.categoryIds,
      );

      if (!parsedCategoryIds) {
        return NextResponse.json(
          { error: "categoryIds must be an array of valid IDs." },
          { status: 400, headers: jsonHeaders() },
        );
      }

      categoryIds = parsedCategoryIds;

      if (categoryIds.length > 0) {
        const validCategories = await prisma.category.findMany({
          where: {
            id: { in: categoryIds },
            isActive: true,
          },
          select: { id: true },
        });

        if (validCategories.length !== categoryIds.length) {
          return NextResponse.json(
            { error: "One or more selected categories are invalid or inactive." },
            { status: 400, headers: jsonHeaders() },
          );
        }
      }
    }

    const socialLinksProvided = has("socialLinks");
    let socialLinks: ParsedSocialLink[] | null = null;

    if (socialLinksProvided) {
      socialLinks = parseSocialLinkUpdates(payload.socialLinks);

      if (!socialLinks) {
        return NextResponse.json(
          { error: "socialLinks must be an array of valid links." },
          { status: 400, headers: jsonHeaders() },
        );
      }
    }

    const legacyPhoneProvided = has("phone");
    const legacyPhoneRaw = legacyPhoneProvided
      ? cleanString(payload.phone)
      : "";

    if (legacyPhoneRaw.length > 50) {
      return NextResponse.json(
        { error: "Phone number is too long." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    const normalizedLegacyPhone = legacyPhoneRaw
      ? normalizeNigerianPhone(legacyPhoneRaw)
      : null;

    if (
      normalizedLegacyPhone &&
      normalizedLegacyPhone.length > 50
    ) {
      return NextResponse.json(
        { error: "Phone number is too long." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    const phoneSocialUpdate = getPhoneUpdateFromSocialLinks(
      socialLinks ?? [],
    );

    let phoneUpdate: string | null | undefined = undefined;

    if (phoneSocialUpdate) {
      phoneUpdate = phoneSocialUpdate.handle || null;
    } else if (legacyPhoneProvided) {
      phoneUpdate = normalizedLegacyPhone;
    }

    if (phoneUpdate && phoneUpdate.length > 50) {
      return NextResponse.json(
        { error: "Phone number is too long." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    const areaProvided = has("area");
    const addressProvided = has("address");
    const streetProvided = has("street");
    const houseNumberProvided = has("houseNumber");
    const cityProvided = has("city");
    const latProvided = has("lat");
    const longProvided = has("long");
    const lngProvided = has("lng");

    if (longProvided && lngProvided) {
      return NextResponse.json(
        { error: "Provide longitude using either 'long' or 'lng', not both." },
        { status: 400, headers: jsonHeaders() },
      );
    }

    const locationWasProvided =
      areaProvided ||
      addressProvided ||
      streetProvided ||
      houseNumberProvided ||
      cityProvided ||
      latProvided ||
      longProvided ||
      lngProvided;

    let newLocationData: {
      area: string;
      street: string | null;
      address: string | null;
      lat: number | null;
      long: number | null;
    } | null = null;

    if (locationWasProvided) {
      const currentArea = existingBusiness.location?.area ?? "";
      const currentStoredStreet =
        existingBusiness.location?.street ?? null;
      const currentAddress =
        existingBusiness.location?.address ?? null;
      const currentLat = existingBusiness.location?.lat ?? null;
      const currentLong = existingBusiness.location?.long ?? null;

      const parsedExistingAddress = parseStoredLocationAddress(
        currentAddress,
        currentArea,
      );

      const existingStreet =
        currentStoredStreet || parsedExistingAddress.street;

      const resultingArea = areaProvided
        ? cleanString(payload.area)
        : currentArea;

      if (!resultingArea) {
        return NextResponse.json(
          { error: "Business area is required." },
          { status: 400, headers: jsonHeaders() },
        );
      }

      if (resultingArea.length > 200) {
        return NextResponse.json(
          { error: "Business area is too long." },
          { status: 400, headers: jsonHeaders() },
        );
      }

      const structuredLocationWasProvided =
        streetProvided || houseNumberProvided || cityProvided;

      let resultingStreet = existingStreet;
      let resultingAddress = "";

      if (structuredLocationWasProvided) {
        resultingStreet = streetProvided
          ? cleanString(payload.street)
          : existingStreet;

        const resultingHouseNumber = houseNumberProvided
          ? cleanString(payload.houseNumber)
          : parsedExistingAddress.houseNumber;

        const resultingCity = cityProvided
          ? cleanString(payload.city)
          : parsedExistingAddress.city;

        if (!resultingStreet) {
          return NextResponse.json(
            { error: "Street, road, or close is required." },
            { status: 400, headers: jsonHeaders() },
          );
        }

        if (
          resultingStreet.length > 300 ||
          resultingHouseNumber.length > 100 ||
          resultingCity.length > 100
        ) {
          return NextResponse.json(
            { error: "Street, house number or city is too long." },
            { status: 400, headers: jsonHeaders() },
          );
        }

        resultingAddress = composeLocationAddress(
          resultingHouseNumber,
          resultingStreet,
          resultingArea,
          resultingCity,
        );
      } else if (addressProvided) {
        resultingAddress = cleanString(payload.address);
      } else if (
        areaProvided &&
        resultingArea !== currentArea &&
        existingStreet
      ) {
        resultingAddress = composeLocationAddress(
          parsedExistingAddress.houseNumber,
          existingStreet,
          resultingArea,
          parsedExistingAddress.city,
        );
      } else {
        resultingAddress = currentAddress ?? "";
      }

      if (!resultingAddress) {
        return NextResponse.json(
          { error: "Business address is required." },
          { status: 400, headers: jsonHeaders() },
        );
      }

      if (resultingAddress.length > 2000) {
        return NextResponse.json(
          { error: "Business address is too long." },
          { status: 400, headers: jsonHeaders() },
        );
      }

      const parsedLat = latProvided
        ? parseOptionalFloat(payload.lat)
        : currentLat;

      const parsedLong =
        longProvided || lngProvided
          ? parseOptionalFloat(
              longProvided ? payload.long : payload.lng,
            )
          : currentLong;

      if (parsedLat === "INVALID" || parsedLong === "INVALID") {
        return NextResponse.json(
          { error: "Latitude and longitude must be valid numbers." },
          { status: 400, headers: jsonHeaders() },
        );
      }

      const coordinateError = validateCoordinates(
        parsedLat,
        parsedLong,
      );

      if (coordinateError) {
        return NextResponse.json(
          { error: coordinateError },
          { status: 400, headers: jsonHeaders() },
        );
      }

      const areaChanged = currentArea !== resultingArea;
      const addressChanged =
        currentAddress !== (resultingAddress || null);
      const coordinatesChanged =
        currentLat !== parsedLat || currentLong !== parsedLong;

      let resolvedLat = parsedLat;
      let resolvedLong = parsedLong;
      let resolvedStreet: string | null =
        resultingStreet || null;

      if (areaChanged || addressChanged) {
        const hasFreshCoordinates =
          parsedLat !== null &&
          parsedLong !== null &&
          coordinatesChanged;

        if (!hasFreshCoordinates) {
          resolvedStreet = structuredLocationWasProvided
            ? resultingStreet || null
            : null;

          if (resultingAddress) {
            try {
              const geocoded = await geocodeBusinessLocation({
                address: resultingAddress,
                area: resultingArea,
              });

              resolvedLat = geocoded.latitude;
              resolvedLong = geocoded.longitude;

              if (geocoded.street) {
                resolvedStreet = geocoded.street;
              }
            } catch (error) {
              console.warn(
                "Updated business address could not be geocoded:",
                error,
              );
              resolvedLat = null;
              resolvedLong = null;
            }
          } else {
            resolvedLat = null;
            resolvedLong = null;
          }
        }
      }

      const locationChanged =
        !existingBusiness.location ||
        currentArea !== resultingArea ||
        currentStoredStreet !== (resolvedStreet || null) ||
        currentAddress !== (resultingAddress || null) ||
        currentLat !== resolvedLat ||
        currentLong !== resolvedLong;

      const resolvedCoordinateError = validateCoordinates(
        resolvedLat,
        resolvedLong,
      );

      if (resolvedCoordinateError) {
        return NextResponse.json(
          { error: resolvedCoordinateError },
          { status: 400, headers: jsonHeaders() },
        );
      }

      if (locationChanged) {
        newLocationData = {
          area: resultingArea,
          street: resolvedStreet,
          address: resultingAddress || null,
          lat: resolvedLat,
          long: resolvedLong,
        };
      }
    }

    const updateData: {
      name?: string;
      ownerName?: string | null;
      description?: string | null;
      locationId?: string;
      phone?: string | null;
      imageUrl?: string | null;
      availability?: AvailabilityValue;
      priceMin?: number | null;
      priceMax?: number | null;
      showContactInfo?: boolean;
    } = {};

    if (name !== undefined) updateData.name = name;
    if (ownerName !== undefined) updateData.ownerName = ownerName || null;
    if (description !== undefined) {
      updateData.description = description || null;
    }
    if (imageUrl !== undefined) updateData.imageUrl = imageUrl || null;

    if (
      availabilityProvided &&
      availability !== null &&
      availability !== undefined
    ) {
      updateData.availability = availability;
    }

    if (priceMinProvided) updateData.priceMin = priceMin ?? null;
    if (priceMaxProvided) updateData.priceMax = priceMax ?? null;

    if (has("showContactInfo")) {
      updateData.showContactInfo = payload.showContactInfo as boolean;
    }

    if (phoneUpdate !== undefined) {
      updateData.phone = phoneUpdate;
    }

    await prisma.$transaction(async (tx) => {
      if (newLocationData) {
        const location = await tx.location.create({
          data: {
            area: newLocationData.area,
            street: newLocationData.street,
            address: newLocationData.address,
            lat: newLocationData.lat,
            long: newLocationData.long,
            verification: "UNVERIFIED",
          },
        });

        updateData.locationId = location.id;
      }

      await tx.business.update({
        where: { id: existingBusiness.id },
        data: updateData,
      });

      if (categoryIdsProvided) {
        await tx.businessCategory.deleteMany({
          where: { businessId: existingBusiness.id },
        });

        if (categoryIds.length > 0) {
          await tx.businessCategory.createMany({
            data: categoryIds.map((categoryId) => ({
              businessId: existingBusiness.id,
              categoryId,
            })),
            skipDuplicates: true,
          });
        }
      }

      if (socialLinksProvided) {
        for (const link of socialLinks ?? []) {
          await tx.businessSocialLink.deleteMany({
            where: {
              businessId: existingBusiness.id,
              platform: link.platform,
            },
          });

          if (!link.handle) continue;

          await tx.businessSocialLink.create({
            data: {
              businessId: existingBusiness.id,
              platform: link.platform,
              handle: link.handle,
            },
          });
        }
      }

      if (legacyPhoneProvided && !phoneSocialUpdate) {
        await tx.businessSocialLink.deleteMany({
          where: {
            businessId: existingBusiness.id,
            platform: "PHONE",
          },
        });

        if (normalizedLegacyPhone) {
          await tx.businessSocialLink.create({
            data: {
              businessId: existingBusiness.id,
              platform: "PHONE",
              handle: normalizedLegacyPhone,
            },
          });
        }
      }
    });

    const business = await loadSellerBusiness(auth.user.id);

    await notifyAdminsOfBusinessUpdate(
      existingBusiness.id,
      business?.name ??
        (cleanString(payload.name) || existingBusiness.name),
    );

    return NextResponse.json(
      {
        message: "Business updated successfully.",
        business,
      },
      { headers: jsonHeaders() },
    );
  } catch (error) {
    console.error("Seller business PATCH error:", error);

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2025"
    ) {
      return NextResponse.json(
        { error: "Business could not be found." },
        { status: 404, headers: jsonHeaders() },
      );
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "This business update conflicts with an existing record." },
        { status: 409, headers: jsonHeaders() },
      );
    }

    return NextResponse.json(
      { error: "Unable to update business." },
      { status: 500, headers: jsonHeaders() },
    );
  }
}
