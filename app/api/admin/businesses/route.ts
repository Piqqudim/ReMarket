import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  Availability,
  BusinessStatus,
  Prisma,
  SocialPlatform,
  VerificationStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { geocodeBusinessLocation } from "@/lib/geocoding";

const MAX_PRISMA_INT = 2_147_483_647;
const MAX_REQUEST_BODY_BYTES = 100_000;
const MAX_NAME_LENGTH = 200;
const MAX_OWNER_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5_000;
const MAX_AREA_LENGTH = 200;
const MAX_STREET_LENGTH = 300;
const MAX_HOUSE_NUMBER_LENGTH = 100;
const MAX_CITY_LENGTH = 100;
const MAX_ADDRESS_LENGTH = 2_000;
const MAX_PHONE_LENGTH = 32;
const MAX_IMAGE_URL_LENGTH = 2_000;
const MAX_CATEGORY_IDS = 50;
const MAX_CATEGORY_ID_LENGTH = 100;
const MAX_SOCIAL_LINKS = 6;
const MAX_SOCIAL_HANDLE_LENGTH = 2_000;
const MAX_QUERY_LENGTH = 100;
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

function noStoreHeaders(): Headers {
  const headers = new Headers();
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  return headers;
}

function invalidBodyResponse(): NextResponse {
  return NextResponse.json(
    { error: "Invalid request body." },
    { status: 400, headers: noStoreHeaders() }
  );
}

function isTooLargeRequest(request: NextRequest): boolean {
  const rawLength = request.headers.get("content-length");
  if (rawLength === null) return false;
  const length = Number(rawLength);
  return !Number.isSafeInteger(length) || length < 0 || length > MAX_REQUEST_BODY_BYTES;
}

function parsePositiveQueryInteger(
  value: string | null,
  fallback: number
): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
}

function cleanString(
  value: unknown
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function nullableString(
  value: unknown
): string | null {
  const valueString =
    cleanString(value);

  return valueString || null;
}

function parseOptionalInt(
  value: unknown
): number | null | undefined {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < 0 ||
    parsed > MAX_PRISMA_INT
  ) {
    return undefined;
  }

  return parsed;
}

function parseOptionalFloat(
  value: unknown
): number | null | undefined {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    Number(value);

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return undefined;
  }

  return parsed;
}

function isAvailability(
  value: unknown
): value is Availability {
  return (
    value === "AVAILABLE" ||
    value === "ASK_SELLER" ||
    value === "UNAVAILABLE"
  );
}

function isBusinessStatus(
  value: unknown
): value is BusinessStatus {
  return (
    value === "ACTIVE" ||
    value === "INACTIVE" ||
    value === "PENDING"
  );
}

function isVerificationStatus(
  value: unknown
): value is VerificationStatus {
  return (
    value === "VERIFIED" ||
    value === "UNVERIFIED"
  );
}

function isSocialPlatform(
  value: unknown
): value is SocialPlatform {
  return (
    value === "WHATSAPP" ||
    value === "INSTAGRAM" ||
    value === "TIKTOK" ||
    value === "FACEBOOK" ||
    value === "PHONE" ||
    value === "DIRECTIONS"
  );
}

function normalizeWhatsApp(
  value: string
): string {
  const trimmed =
    value.trim();

  if (!trimmed) {
    return "";
  }

  // Preserve WhatsApp click-to-chat links as supplied.
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return trimmed;
      }
    } catch {
      return "";
    }
  }

  const digits =
    trimmed.replace(
      /\D/g,
      ""
    );

  if (!digits) {
    return "";
  }

  if (
    digits.startsWith("234")
  ) {
    return `+${digits}`;
  }

  if (
    digits.startsWith("0")
  ) {
    return `+234${digits.slice(
      1
    )}`;
  }

  return trimmed;
}

type ParsedSocialLink = {
  platform: SocialPlatform;
  handle: string;
};

function parseSocialLinks(
  value: unknown
): ParsedSocialLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result:
    ParsedSocialLink[] = [];

  const seen =
    new Set<SocialPlatform>();

  for (const item of value) {
    if (
      !item ||
      typeof item !==
        "object" ||
      Array.isArray(item)
    ) {
      continue;
    }

    const record =
      item as Record<
        string,
        unknown
      >;

    if (
      !isSocialPlatform(
        record.platform
      )
    ) {
      continue;
    }

    let handle =
      cleanString(
        record.handle
      );

    if (handle.length > MAX_SOCIAL_HANDLE_LENGTH) {
      continue;
    }

    if (
      record.platform ===
      SocialPlatform.WHATSAPP
    ) {
      handle =
        normalizeWhatsApp(
          handle
        );
    }

    if (
      !handle ||
      seen.has(
        record.platform
      )
    ) {
      continue;
    }

    seen.add(
      record.platform
    );

    result.push({
      platform:
        record.platform,
      handle,
    });

    if (result.length >= MAX_SOCIAL_LINKS) break;
  }

  return result;
}

function parseCategoryIds(
  value: unknown
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const cleaned = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= MAX_CATEGORY_ID_LENGTH);

  return Array.from(new Set(cleaned)).slice(0, MAX_CATEGORY_IDS);
}

function isDeletionFilter(
  value: string | null
): value is
  | "ALL"
  | "ACTIVE"
  | "DELETED" {
  return (
    value === "ALL" ||
    value === "ACTIVE" ||
    value === "DELETED"
  );
}

/*
 * ------------------------------------------------
 * LOCATION HELPERS
 * ------------------------------------------------
 *
 * Admin location input now supports:
 *
 * area
 * address
 * street
 * houseNumber
 * city
 *
 * Existing address-only callers remain valid.
 */

function composeLocationAddress(
  houseNumber: string,
  street: string,
  area: string,
  city: string
): string {
  return [
    houseNumber,
    street,
    area,
    city,
    "Nigeria",
  ]
    .filter(Boolean)
    .join(", ");
}

function getLocationInput(
  payload: Record<
    string,
    unknown
  >
): {
  area: string;
  address: string | null;
  street: string | null;
  houseNumber: string;
  city: string;
} {
  const area =
    cleanString(
      payload.area
    );

  const street =
    cleanString(
      payload.street
    );

  const houseNumber =
    cleanString(
      payload.houseNumber
    );

  const city =
    cleanString(
      payload.city
    );

  const suppliedAddress =
    cleanString(
      payload.address
    );

  const address =
    street
      ? composeLocationAddress(
          houseNumber,
          street,
          area,
          city
        )
      : suppliedAddress;

  return {
    area,
    address:
      address || null,
    street:
      street || null,
    houseNumber,
    city,
  };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const q = cleanString(searchParams.get("q"));
    const status = searchParams.get("status");
    const verification = searchParams.get("verification");
    const requestedDeletionFilter = searchParams.get("deleted");

    // Pagination is opt-in to preserve the existing businesses-management page,
    // which currently expects all filtered records when page/pageSize are absent.
    const paginationRequested = searchParams.has("page") || searchParams.has("pageSize");
    const page = parsePositiveQueryInteger(searchParams.get("page"), 1);
    const pageSize = parsePositiveQueryInteger(
      searchParams.get("pageSize"),
      DEFAULT_PAGE_SIZE
    );
    const sort = searchParams.get("sort");

    if (q.length > MAX_QUERY_LENGTH) {
      return NextResponse.json(
        { error: "Search query is too long." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    if (status !== null && !isBusinessStatus(status)) {
      return NextResponse.json(
        { error: "Invalid business status." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    if (verification !== null && !isVerificationStatus(verification)) {
      return NextResponse.json(
        { error: "Invalid verification status." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    if (requestedDeletionFilter !== null && !isDeletionFilter(requestedDeletionFilter)) {
      return NextResponse.json(
        { error: "Invalid deletion filter." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    if (paginationRequested && (page === null || pageSize === null || pageSize > MAX_PAGE_SIZE)) {
      return NextResponse.json(
        { error: `Pagination must use a positive page and a pageSize between 1 and ${MAX_PAGE_SIZE}.` },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    if (paginationRequested && !Number.isSafeInteger(((page as number) - 1) * (pageSize as number))) {
      return NextResponse.json(
        { error: "The requested page is too large." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    if (sort !== null && sort !== "onboardedAt" && sort !== "updatedAt") {
      return NextResponse.json(
        { error: "Invalid business sort order." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    const deletionFilter = isDeletionFilter(requestedDeletionFilter)
      ? requestedDeletionFilter
      : "ALL";

    const where: Prisma.BusinessWhereInput = {
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { ownerName: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(status && isBusinessStatus(status) ? { status } : {}),
      ...(verification && isVerificationStatus(verification) ? { verification } : {}),
      ...(deletionFilter === "ACTIVE"
        ? { deletedAt: null }
        : deletionFilter === "DELETED"
          ? { deletedAt: { not: null } }
          : {}),
    };

    const orderBy: Prisma.BusinessOrderByWithRelationInput[] =
      sort === "onboardedAt"
        ? [{ onboardedAt: "desc" }, { id: "desc" }]
        : sort === "updatedAt"
          ? [{ updatedAt: "desc" }, { id: "desc" }]
          : [{ deletedAt: "asc" }, { updatedAt: "desc" }, { id: "desc" }];

    const [businesses, total] = await Promise.all([
      prisma.business.findMany({
        where,
        include: {
          location: true,
          categories: { include: { category: true } },
          _count: {
            select: {
              products: {
                where: { status: "ACTIVE", deletedAt: null },
              },
            },
          },
        },
        orderBy,
        ...(paginationRequested
          ? { skip: ((page as number) - 1) * (pageSize as number), take: pageSize as number }
          : {}),
      }),
      paginationRequested ? prisma.business.count({ where }) : Promise.resolve(0),
    ]);

    const mappedBusinesses = businesses.map((business) => ({
      id: business.id,
      name: business.name,
      ownerName: business.ownerName,
      description: business.description,
      area: business.location?.area ?? "",
      street: business.location?.street ?? "",
      address: business.location?.address ?? null,
      status: business.status,
      verification: business.verification,
      availability: business.availability,
      phone: business.phone,
      categories: business.categories.map((item) => item.category),
      productCount: business._count.products,
      onboardedAt: business.onboardedAt,
      deletedAt: business.deletedAt,
    }));

    const headers = noStoreHeaders();
    if (!paginationRequested) {
      return NextResponse.json({ businesses: mappedBusinesses }, { headers });
    }

    const safePage = page as number;
    const safePageSize = pageSize as number;
    const totalPages = Math.ceil(total / safePageSize);

    return NextResponse.json(
      {
        businesses: mappedBusinesses,
        pagination: {
          page: safePage,
          pageSize: safePageSize,
          total,
          totalPages,
          hasPreviousPage: safePage > 1,
          hasNextPage: safePage < totalPages,
        },
      },
      { headers }
    );
  } catch (error) {
    console.error("Admin businesses GET error:", error);
    return NextResponse.json(
      { error: "Unable to load businesses." },
      { status: 500, headers: noStoreHeaders() }
    );
  }
}

export async function POST(
  request: NextRequest
) {
  const auth =
    await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    if (isTooLargeRequest(request)) {
      return NextResponse.json(
        { error: "Request body is too large." },
        { status: 413, headers: noStoreHeaders() }
      );
    }

    let body: unknown;
    try {
      const rawBody = await request.text();
      if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BODY_BYTES) {
        return NextResponse.json(
          { error: "Request body is too large." },
          { status: 413, headers: noStoreHeaders() }
        );
      }
      body = JSON.parse(rawBody) as unknown;
    } catch {
      return invalidBodyResponse();
    }

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return invalidBodyResponse();
    }

    const payload =
      body as Record<
        string,
        unknown
      >;

    const name =
      cleanString(
        payload.name
      );

    if (!name) {
      return NextResponse.json(
        {
          error:
            "Business name is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      name.length >
      200
    ) {
      return NextResponse.json(
        {
          error:
            "Business name is too long.",
        },
        {
          status: 400,
        }
      );
    }

    const ownerName =
      nullableString(
        payload.ownerName
      );

    if (ownerName && ownerName.length > MAX_OWNER_NAME_LENGTH) {
      return NextResponse.json(
        { error: "Owner name is too long." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    const description =
      nullableString(
        payload.description
      );

    if (description && description.length > MAX_DESCRIPTION_LENGTH) {
      return NextResponse.json(
        { error: "Business description is too long." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    const locationInput =
      getLocationInput(
        payload
      );

    const area =
      locationInput.area;

    const address =
      locationInput.address;

    const street =
      locationInput.street;

    const city =
      locationInput.city;

    if (street && street.length > MAX_STREET_LENGTH) {
      return NextResponse.json(
        { error: "Business street is too long." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    if (locationInput.houseNumber.length > MAX_HOUSE_NUMBER_LENGTH) {
      return NextResponse.json(
        { error: "House or shop number is too long." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    if (city.length > MAX_CITY_LENGTH) {
      return NextResponse.json(
        { error: "City is too long." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    if (!area) {
      return NextResponse.json(
        {
          error:
            "Business area is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      area.length >
      MAX_AREA_LENGTH
    ) {
      return NextResponse.json(
        {
          error:
            "Business area is too long.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !address &&
      !street
    ) {
      return NextResponse.json(
        {
          error:
            "Business street/address is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      address !== null &&
      address.length >
        2000
    ) {
      return NextResponse.json(
        {
          error:
            "Business address is too long.",
        },
        {
          status: 400,
        }
      );
    }

    const lat =
      parseOptionalFloat(
        payload.lat
      );

    if (
      lat === undefined ||
      (
        lat !== null &&
        (
          lat < -90 ||
          lat > 90
        )
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Latitude must be a valid value between -90 and 90.",
        },
        {
          status: 400,
        }
      );
    }

    const longitudeProvidedByLong =
      Object.prototype.hasOwnProperty.call(
        payload,
        "long"
      );

    const longitudeProvidedByLng =
      Object.prototype.hasOwnProperty.call(
        payload,
        "lng"
      );

    if (
      longitudeProvidedByLong &&
      longitudeProvidedByLng
    ) {
      return NextResponse.json(
        {
          error:
            "Provide longitude using either 'long' or 'lng', not both.",
        },
        {
          status: 400,
        }
      );
    }

    const long =
      parseOptionalFloat(
        longitudeProvidedByLong
          ? payload.long
          : payload.lng
      );

    if (
      long === undefined ||
      (
        long !== null &&
        (
          long < -180 ||
          long > 180
        )
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Longitude must be a valid value between -180 and 180.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Latitude and longitude must be supplied
     * together when coordinates are provided.
     */
    const hasLatitude =
      lat !== null;

    const hasLongitude =
      long !== null;

    if (
      hasLatitude !==
      hasLongitude
    ) {
      return NextResponse.json(
        {
          error:
            "Latitude and longitude must be provided together.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * ------------------------------------------------
     * LOCATION RESOLUTION
     * ------------------------------------------------
     *
     * Coordinates, when explicitly supplied by an
     * API caller, are used directly.
     *
     * When coordinates are absent, use the business
     * address through the shared geocoder.
     *
     * The geocoder can provide a canonical road
     * through its `street` result.
     *
     * If geocoding fails, the manually supplied
     * structured street is preserved.
     */

    let resolvedLat =
      lat;

    let resolvedLong =
      long;

    let resolvedStreet:
      | string
      | null =
      street;

    if (
      resolvedLat === null &&
      resolvedLong === null &&
      address
    ) {
      try {
        const geocoded =
          await geocodeBusinessLocation(
            {
              address,
              area,
              city:
                city ||
                undefined,
            }
          );

        resolvedLat =
          geocoded.latitude;

        resolvedLong =
          geocoded.longitude;

        if (
          geocoded.street
        ) {
          resolvedStreet =
            geocoded.street;
        }
      } catch (error) {
        console.warn(
          "Business address could not be geocoded. Saving without precise coordinates:",
          error
        );
      }
    }

    /*
     * If coordinates are supplied without a
     * structured street, we intentionally leave
     * street null rather than inventing one from
     * coordinates.
     *
     * A later location update can populate the
     * canonical street through address geocoding.
     */

    const priceMin =
      parseOptionalInt(
        payload.priceMin
      );

    if (
      priceMin ===
      undefined
    ) {
      return NextResponse.json(
        {
          error:
            "Minimum price must be a valid integer.",
        },
        {
          status: 400,
        }
      );
    }

    const priceMax =
      parseOptionalInt(
        payload.priceMax
      );

    if (
      priceMax ===
      undefined
    ) {
      return NextResponse.json(
        {
          error:
            "Maximum price must be a valid integer.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      priceMin !== null &&
      priceMax !== null &&
      priceMin >
        priceMax
    ) {
      return NextResponse.json(
        {
          error:
            "Minimum price cannot be greater than maximum price.",
        },
        {
          status: 400,
        }
      );
    }

    const availability =
      isAvailability(
        payload.availability
      )
        ? payload.availability
        : Availability.ASK_SELLER;

    const status =
      isBusinessStatus(
        payload.status
      )
        ? payload.status
        : BusinessStatus.ACTIVE;

    const verification =
      isVerificationStatus(
        payload.verification
      )
        ? payload.verification
        : VerificationStatus.UNVERIFIED;

    /*
     * ------------------------------------------------
     * PHONE / SOCIAL LINKS
     * ------------------------------------------------
     *
     * The PHONE social link is the canonical contact
     * value when it is supplied.
     *
     * The legacy Business.phone field is kept in sync
     * for compatibility with existing consumers.
     */

    const legacyPhone =
      nullableString(
        payload.phone
      );

    const imageUrl =
      nullableString(
        payload.imageUrl
      );

    if (legacyPhone && legacyPhone.length > MAX_PHONE_LENGTH) {
      return NextResponse.json(
        { error: "Phone number is too long." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    if (imageUrl && imageUrl.length > MAX_IMAGE_URL_LENGTH) {
      return NextResponse.json(
        { error: "Image URL is too long." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    if (imageUrl) {
      try {
        const parsedImageUrl = new URL(imageUrl);
        if (parsedImageUrl.protocol !== "http:" && parsedImageUrl.protocol !== "https:") {
          return NextResponse.json(
            { error: "Image URL must use HTTP or HTTPS." },
            { status: 400, headers: noStoreHeaders() }
          );
        }
      } catch {
        return NextResponse.json(
          { error: "Invalid image URL." },
          { status: 400, headers: noStoreHeaders() }
        );
      }
    }

    if (payload.categoryIds !== undefined && !Array.isArray(payload.categoryIds)) {
      return NextResponse.json(
        { error: "Category IDs must be an array." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    if (Array.isArray(payload.categoryIds) && payload.categoryIds.length > MAX_CATEGORY_IDS) {
      return NextResponse.json(
        { error: "Too many categories were selected." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    if (Array.isArray(payload.categoryIds) && payload.categoryIds.some(
      (item) => typeof item !== "string" || !item.trim() || item.trim().length > MAX_CATEGORY_ID_LENGTH
    )) {
      return NextResponse.json(
        { error: "Category IDs must be non-empty strings within the supported length." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    const categoryIds =
      parseCategoryIds(
        payload.categoryIds
      );

    if (
      categoryIds.length >
      0
    ) {
      const categories =
        await prisma.category.findMany(
          {
            where: {
              id: {
                in: categoryIds,
              },
            },

            select: {
              id: true,
            },
          }
        );

      if (
        categories.length !==
        categoryIds.length
      ) {
        return NextResponse.json(
          {
            error:
              "One or more selected categories do not exist.",
          },
          {
            status: 400,
          }
        );
      }
    }

    if (payload.socialLinks !== undefined && !Array.isArray(payload.socialLinks)) {
      return NextResponse.json(
        { error: "Social links must be an array." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    if (Array.isArray(payload.socialLinks) && payload.socialLinks.length > MAX_SOCIAL_LINKS) {
      return NextResponse.json(
        { error: "Too many social links were supplied." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    if (Array.isArray(payload.socialLinks) && payload.socialLinks.some((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return true;
      const record = item as Record<string, unknown>;
      return !isSocialPlatform(record.platform) || typeof record.handle !== "string" || record.handle.trim().length > MAX_SOCIAL_HANDLE_LENGTH;
    })) {
      return NextResponse.json(
        { error: "One or more social links are invalid." },
        { status: 400, headers: noStoreHeaders() }
      );
    }

    const socialLinks =
      parseSocialLinks(
        payload.socialLinks
      );

    const phoneFromSocial =
      socialLinks.find(
        (link) =>
          link.platform ===
          SocialPlatform.PHONE
      )?.handle ??
      null;

    const phone =
      phoneFromSocial ??
      legacyPhone;

    if (
      phone &&
      !socialLinks.some(
        (link) =>
          link.platform ===
          SocialPlatform.PHONE
      )
    ) {
      socialLinks.push({
        platform:
          SocialPlatform.PHONE,
        handle:
          phone,
      });
    }

    const business =
      await prisma.$transaction(
        async (tx) => {
          /*
           * -----------------------------------------
           * BUSINESS-SPECIFIC LOCATION
           * -----------------------------------------
           *
           * Every newly created business receives
           * its own Location record.
           *
           * We NEVER search for or reuse a Location
           * by area.
           */

          const location =
            await tx.location.create(
              {
                data: {
                  area,

                  /*
                   * Canonical street used by
                   * ReMarket Near Me.
                   */
                  street:
                    resolvedStreet,

                  address,

                  lat:
                    resolvedLat,

                  long:
                    resolvedLong,

                  /*
                   * Location verification is separate
                   * from Business verification.
                   *
                   * A new location is unverified until
                   * its physical position is confirmed.
                   */
                  verification:
                    "UNVERIFIED",
                },
              }
            );

          const created =
            await tx.business.create(
              {
                data: {
                  name,

                  ownerName,

                  description,

                  locationId:
                    location.id,

                  priceMin,

                  priceMax,

                  availability,

                  phone,

                  status,

                  verification,

                  imageUrl,

                  onboardedAt:
                    new Date(),
                },
              }
            );

          if (
            categoryIds.length >
            0
          ) {
            await tx.businessCategory.createMany(
              {
                data:
                  categoryIds.map(
                    (
                      categoryId
                    ) => ({
                      businessId:
                        created.id,

                      categoryId,
                    })
                  ),

                skipDuplicates:
                  true,
              }
            );
          }

          if (
            socialLinks.length >
            0
          ) {
            await tx.businessSocialLink.createMany(
              {
                data:
                  socialLinks.map(
                    (
                      link
                    ) => ({
                      businessId:
                        created.id,

                      platform:
                        link.platform,

                      handle:
                        link.handle,
                    })
                  ),

                skipDuplicates:
                  true,
              }
            );
          }

          return tx.business.findUniqueOrThrow(
            {
              where: {
                id:
                  created.id,
              },

              include: {
                location: true,

                categories: {
                  include: {
                    category:
                      true,
                  },
                },

                products: {
                  where: {
                    deletedAt:
                      null,
                  },

                  orderBy: {
                    updatedAt:
                      "desc",
                  },

                  include: {
                    images: {
                      orderBy: {
                        sortOrder:
                          "asc",
                      },
                    },

                    category:
                      true,
                  },
                },

                socialLinks: {
                  orderBy: {
                    platform:
                      "asc",
                  },
                },
              },
            }
          );
        }
      );

    return NextResponse.json(
      {
        message:
          "Business created successfully.",

        business,
      },
      {
        status: 201,
        headers: noStoreHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Admin businesses POST error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to create business.",
      },
      {
        status: 500,
        headers: noStoreHeaders(),
      }
    );
  }
}