
import {
  Availability,
  Prisma,
  ServiceFulfillmentType,
  VerificationStatus,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkPublicRateLimit } from "@/lib/rate-limit";

const MAX_QUERY_LENGTH = 100;
const MAX_CATEGORY_LENGTH = 100;
const MAX_LOCATION_LENGTH = 100;
const MAX_PRICE_VALUE = 1_000_000_000;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;
const MAX_DATABASE_OFFSET = 2_147_483_647;

const ALLOWED_AVAILABILITY = new Set<Availability>([
  Availability.AVAILABLE,
  Availability.ASK_SELLER,
  Availability.UNAVAILABLE,
]);

const ALLOWED_FULFILLMENT = new Set<ServiceFulfillmentType>([
  ServiceFulfillmentType.AT_PROVIDER,
  ServiceFulfillmentType.AT_CUSTOMER,
  ServiceFulfillmentType.REMOTE,
  ServiceFulfillmentType.FLEXIBLE,
]);

const serviceSellerSelect = {
  id: true,
  name: true,
  ownerName: true,
  description: true,
  imageUrl: true,
  phone: true,
  availability: true,
  verification: true,
  showContactInfo: true,
  location: {
    select: {
      id: true,
      area: true,
      street: true,
      address: true,
      verification: true,
    },
  },
  categories: {
    where: {
      category: {
        isActive: true,
      },
    },
    select: {
      category: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  socialLinks: {
    select: {
      id: true,
      platform: true,
      handle: true,
    },
  },
} satisfies Prisma.BusinessSelect;

const serviceSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  priceMin: true,
  priceMax: true,
  durationMinutes: true,
  fulfillmentType: true,
  availability: true,
  keywords: true,
  imageUrl: true,
  createdAt: true,
  updatedAt: true,
  category: {
    select: {
      id: true,
      name: true,
      iconKey: true,
      isActive: true,
      sortOrder: true,
    },
  },
  images: {
    select: {
      id: true,
      url: true,
      sortOrder: true,
    },
    orderBy: {
      sortOrder: "asc",
    },
  },
  business: {
    select: serviceSellerSelect,
  },
} satisfies Prisma.ServiceSelect;

type ServiceRecord = Prisma.ServiceGetPayload<{
  select: typeof serviceSelect;
}>;

type ServiceFilters = {
  query: string;
  category: string;
  location: string;
  minPrice: number | null;
  maxPrice: number | null;
  availability: Availability | null;
  fulfillmentType: ServiceFulfillmentType | null;
  verified: boolean | null;
};

type PaginationResult =
  | {
      valid: true;
      page: number;
      pageSize: number;
      skip: number;
    }
  | {
      valid: false;
      error: string;
    };

function clean(value: string | null): string {
  return value?.trim() ?? "";
}

function noStoreHeaders(baseHeaders?: HeadersInit): Headers {
  const headers = new Headers(baseHeaders);
  headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  return headers;
}

function jsonError(
  message: string,
  status: number,
  headers?: HeadersInit,
) {
  return NextResponse.json(
    {
      services: [],
      error: message,
    },
    {
      status,
      headers: noStoreHeaders(headers),
    },
  );
}

function parsePositiveInteger(
  value: string | null,
  fallback: number,
): number | null {
  if (value === null) return fallback;

  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;

  const parsed = Number(normalized);

  return Number.isSafeInteger(parsed) && parsed >= 1
    ? parsed
    : null;
}

function parsePagination(
  searchParams: URLSearchParams,
): PaginationResult {
  const page = parsePositiveInteger(
    searchParams.get("page"),
    DEFAULT_PAGE,
  );

  if (page === null) {
    return {
      valid: false,
      error: "'page' must be a positive integer.",
    };
  }

  const requestedPageSize = parsePositiveInteger(
    searchParams.get("pageSize"),
    DEFAULT_PAGE_SIZE,
  );

  if (requestedPageSize === null) {
    return {
      valid: false,
      error: "'pageSize' must be a positive integer.",
    };
  }

  const pageSize = Math.min(
    requestedPageSize,
    MAX_PAGE_SIZE,
  );

  const skip = (page - 1) * pageSize;

  if (
    !Number.isSafeInteger(skip) ||
    skip > MAX_DATABASE_OFFSET
  ) {
    return {
      valid: false,
      error: "Requested page is too large.",
    };
  }

  return {
    valid: true,
    page,
    pageSize,
    skip,
  };
}

function parsePrice(
  value: string | null,
  label: string,
): {
  value: number | null;
  error?: string;
} {
  const raw = value?.trim() ?? "";

  if (!raw) return { value: null };

  const normalized = raw.replace(/,/g, "");

  if (!/^\d+$/.test(normalized)) {
    return {
      value: null,
      error: `${label} must be a whole-number price.`,
    };
  }

  const parsed = Number(normalized);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 0 ||
    parsed > MAX_PRICE_VALUE
  ) {
    return {
      value: null,
      error: `${label} is outside the permitted range.`,
    };
  }

  return { value: parsed };
}

function parseMoneyAmount(input: string): number | null {
  const normalized = input
    .trim()
    .replace(/[₦,\s]/g, "")
    .toLowerCase();

  const match = normalized.match(/^(\d+(?:\.\d+)?)(k)?$/);

  if (!match) return null;

  const amount = Math.round(
    Number(match[1]) * (match[2] === "k" ? 1000 : 1),
  );

  return Number.isSafeInteger(amount) &&
    amount >= 0 &&
    amount <= MAX_PRICE_VALUE
    ? amount
    : null;
}

function parseInlineBudget(query: string): {
  query: string;
  minPrice: number | null;
  maxPrice: number | null;
} {
  let cleanedQuery = query.trim();
  let minPrice: number | null = null;
  let maxPrice: number | null = null;

  const betweenPattern =
    /\bbetween\s+([\d,]+(?:\.\d+)?\s*k?)\s+and\s+([\d,]+(?:\.\d+)?\s*k?)\b/i;

  const betweenMatch = cleanedQuery.match(betweenPattern);

  if (betweenMatch) {
    const lower = parseMoneyAmount(betweenMatch[1]);
    const upper = parseMoneyAmount(betweenMatch[2]);

    if (
      lower !== null &&
      upper !== null &&
      lower <= upper
    ) {
      minPrice = lower;
      maxPrice = upper;

      cleanedQuery = cleanedQuery
        .replace(betweenMatch[0], " ")
        .replace(/\s+/g, " ")
        .trim();

      return { query: cleanedQuery, minPrice, maxPrice };
    }
  }

  const maximumPattern =
    /\b(?:under|below|less\s+than|up\s+to|at\s+most|max(?:imum)?)\s+(?:₦\s*)?([\d,]+(?:\.\d+)?\s*k?)\b/i;

  const maximumMatch = cleanedQuery.match(maximumPattern);

  if (maximumMatch) {
    const amount = parseMoneyAmount(maximumMatch[1]);

    if (amount !== null) {
      maxPrice = amount;

      cleanedQuery = cleanedQuery
        .replace(maximumMatch[0], " ")
        .replace(/\s+/g, " ")
        .trim();
    }
  } else {
    const minimumPattern =
      /\b(?:over|above|more\s+than|at\s+least|min(?:imum)?)\s+(?:₦\s*)?([\d,]+(?:\.\d+)?\s*k?)\b/i;

    const minimumMatch = cleanedQuery.match(minimumPattern);

    if (minimumMatch) {
      const amount = parseMoneyAmount(minimumMatch[1]);

      if (amount !== null) {
        minPrice = amount;

        cleanedQuery = cleanedQuery
          .replace(minimumMatch[0], " ")
          .replace(/\s+/g, " ")
          .trim();
      }
    }
  }

  return {
    query: cleanedQuery,
    minPrice,
    maxPrice,
  };
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stemToken(token: string): string {
  if (token.length < 4) return token;

  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith("ing") && token.length > 5) {
    return token.slice(0, -3);
  }

  if (token.endsWith("ed") && token.length > 4) {
    return token.slice(0, -2);
  }

  if (token.endsWith("es") && token.length > 4) {
    return token.slice(0, -2);
  }

  if (
    token.endsWith("s") &&
    !token.endsWith("ss") &&
    token.length > 3
  ) {
    return token.slice(0, -1);
  }

  return token;
}

function getSearchTerms(query: string): string[] {
  const tokens = normalizeText(query)
    .split(" ")
    .filter(Boolean);

  return Array.from(
    new Set(
      tokens.flatMap((token) => [
        token,
        stemToken(token),
      ]),
    ),
  );
}

function buildLocationWhere(
  location: string,
): Prisma.LocationWhereInput {
  return {
    OR: [
      {
        area: {
          contains: location,
          mode: "insensitive",
        },
      },
      {
        street: {
          contains: location,
          mode: "insensitive",
        },
      },
      {
        address: {
          contains: location,
          mode: "insensitive",
        },
      },
    ],
  };
}

function buildServicePriceConditions(
  filters: ServiceFilters,
): Prisma.ServiceWhereInput[] {
  const { minPrice, maxPrice } = filters;

  if (minPrice === null && maxPrice === null) {
    return [];
  }

  if (minPrice !== null && maxPrice !== null) {
    return [
      {
        OR: [
          {
            price: {
              gte: minPrice,
              lte: maxPrice,
            },
          },
          {
            AND: [
              {
                priceMin: {
                  lte: maxPrice,
                },
              },
              {
                OR: [
                  {
                    priceMax: {
                      gte: minPrice,
                    },
                  },
                  {
                    priceMax: null,
                  },
                ],
              },
            ],
          },
          {
            AND: [
              {
                priceMin: null,
              },
              {
                priceMax: {
                  gte: minPrice,
                  lte: maxPrice,
                },
              },
            ],
          },
        ],
      },
    ];
  }

  if (minPrice !== null) {
    return [
      {
        OR: [
          {
            price: {
              gte: minPrice,
            },
          },
          {
            priceMax: {
              gte: minPrice,
            },
          },
          {
            AND: [
              {
                priceMax: null,
              },
              {
                priceMin: {
                  gte: minPrice,
                },
              },
            ],
          },
        ],
      },
    ];
  }

  const maximum = maxPrice!;

  return [
    {
      OR: [
        {
          price: {
            lte: maximum,
          },
        },
        {
          priceMin: {
            lte: maximum,
          },
        },
        {
          AND: [
            {
              priceMin: null,
            },
            {
              priceMax: {
                lte: maximum,
              },
            },
          ],
        },
      ],
    },
  ];
}

function buildServiceTextConditions(
  terms: string[],
): Prisma.ServiceWhereInput[] {
  return terms.map((term) => ({
    OR: [
      {
        name: {
          contains: term,
          mode: "insensitive",
        },
      },
      {
        description: {
          contains: term,
          mode: "insensitive",
        },
      },
      {
        keywords: {
          has: term,
        },
      },
      {
        category: {
          is: {
            isActive: true,
            name: {
              contains: term,
              mode: "insensitive",
            },
          },
        },
      },
      {
        business: {
          is: {
            OR: [
              {
                name: {
                  contains: term,
                  mode: "insensitive",
                },
              },
              {
                description: {
                  contains: term,
                  mode: "insensitive",
                },
              },
              {
                categories: {
                  some: {
                    category: {
                      isActive: true,
                      name: {
                        contains: term,
                        mode: "insensitive",
                      },
                    },
                  },
                },
              },
            ],
          },
        },
      },
    ],
  }));
}

function buildServiceCategoryConditions(
  category: string,
): Prisma.ServiceWhereInput[] {
  const activeCategory = {
    isActive: true,
    name: {
      equals: category,
      mode: "insensitive" as const,
    },
  };

  return [
    {
      category: {
        is: activeCategory,
      },
    },
    {
      AND: [
        {
          category: {
            is: null,
          },
        },
        {
          business: {
            is: {
              categories: {
                some: {
                  category: activeCategory,
                },
              },
            },
          },
        },
      ],
    },
  ];
}

function buildServiceWhere(
  filters: ServiceFilters,
  terms: string[],
): Prisma.ServiceWhereInput {
  const conditions: Prisma.ServiceWhereInput[] = [
    {
      status: "ACTIVE",
      deletedAt: null,
      availability: filters.availability ?? {
        not: Availability.UNAVAILABLE,
      },
    },
    {
      business: {
        is: {
          status: "ACTIVE",
          deletedAt: null,

          ...(filters.verified === null
            ? {}
            : {
                verification: filters.verified
                  ? VerificationStatus.VERIFIED
                  : {
                      not: VerificationStatus.VERIFIED,
                    },
              }),

          ...(filters.location
            ? {
                location: {
                  is: buildLocationWhere(filters.location),
                },
              }
            : {}),
        },
      },
    },
  ];

  if (terms.length > 0) {
    conditions.push(...buildServiceTextConditions(terms));
  }

  if (filters.category) {
    conditions.push({
      OR: buildServiceCategoryConditions(filters.category),
    });
  }

  if (filters.fulfillmentType) {
    conditions.push({
      fulfillmentType: filters.fulfillmentType,
    });
  }

  conditions.push(...buildServicePriceConditions(filters));

  return {
    AND: conditions,
  };
}

function normalizeNigerianPhone(value: string): string {
  let cleanPhone = value.trim().replace(/[^\d+]/g, "");

  if (!cleanPhone) return "";

  if (cleanPhone.startsWith("00")) {
    cleanPhone = cleanPhone.slice(2);
  }

  if (cleanPhone.startsWith("+")) {
    cleanPhone = cleanPhone.slice(1);
  }

  if (cleanPhone.startsWith("234")) {
    return `+${cleanPhone}`;
  }

  if (cleanPhone.startsWith("0")) {
    return `+234${cleanPhone.slice(1)}`;
  }

  return `+234${cleanPhone}`;
}

function normalizeSocialHandle(
  platform: string,
  handle: string,
): string {
  const cleanHandle = handle.trim();

  if (!cleanHandle) return "";

  if (platform === "PHONE" || platform === "WHATSAPP") {
    if (
      cleanHandle.startsWith("http://") ||
      cleanHandle.startsWith("https://")
    ) {
      return cleanHandle;
    }

    return normalizeNigerianPhone(cleanHandle);
  }

  return cleanHandle;
}

function formatSeller(
  business: ServiceRecord["business"],
) {
  const socialLinks = business.showContactInfo
    ? business.socialLinks.map((link) => ({
        id: link.id,
        platform: link.platform,
        handle: normalizeSocialHandle(
          link.platform,
          link.handle,
        ),
      }))
    : [];

  if (
    business.showContactInfo &&
    business.phone &&
    !socialLinks.some((link) => link.platform === "PHONE")
  ) {
    socialLinks.push({
      id: `legacy-phone-${business.id}`,
      platform: "PHONE",
      handle: normalizeNigerianPhone(business.phone),
    });
  }

  const categoryNames = business.categories.map(
    (item) => item.category.name,
  );

  return {
    id: business.id,
    name: business.name,
    ownerName: business.ownerName,
    description: business.description,
    imageUrl: business.imageUrl,
    availability: business.availability,
    verification: business.verification,
    verified: business.verification === VerificationStatus.VERIFIED,
    showContactInfo: business.showContactInfo === true,
    location: business.location
      ? {
          id: business.location.id,
          area: business.location.area,
          street: business.location.street,
          address: business.location.address,
          verification: business.location.verification,
        }
      : null,
    categories: categoryNames,
    category: categoryNames[0] ?? "Uncategorised",
    socialLinks,
  };
}

export async function GET(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(request, "search");

  if (!rateLimit.allowed) {
    return jsonError(
      "Too many service requests. Please try again shortly.",
      429,
      rateLimit.headers,
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;

    const rawQuery = clean(searchParams.get("q"));
    const category = clean(searchParams.get("category"));
    const location = clean(searchParams.get("location"));

    if (rawQuery.length > MAX_QUERY_LENGTH) {
      return jsonError(
        `Search text must not exceed ${MAX_QUERY_LENGTH} characters.`,
        400,
        rateLimit.headers,
      );
    }

    if (category.length > MAX_CATEGORY_LENGTH) {
      return jsonError(
        `Category must not exceed ${MAX_CATEGORY_LENGTH} characters.`,
        400,
        rateLimit.headers,
      );
    }

    if (location.length > MAX_LOCATION_LENGTH) {
      return jsonError(
        `Location must not exceed ${MAX_LOCATION_LENGTH} characters.`,
        400,
        rateLimit.headers,
      );
    }

    const minimumPriceInput = parsePrice(
      searchParams.get("minPrice"),
      "Minimum price",
    );

    if (minimumPriceInput.error) {
      return jsonError(
        minimumPriceInput.error,
        400,
        rateLimit.headers,
      );
    }

    const maximumPriceInput = parsePrice(
      searchParams.get("maxPrice"),
      "Maximum price",
    );

    if (maximumPriceInput.error) {
      return jsonError(
        maximumPriceInput.error,
        400,
        rateLimit.headers,
      );
    }

    const availabilityRaw = clean(
      searchParams.get("availability"),
    );

    if (
      availabilityRaw &&
      !ALLOWED_AVAILABILITY.has(availabilityRaw as Availability)
    ) {
      return jsonError(
        "Availability filter is invalid.",
        400,
        rateLimit.headers,
      );
    }

    const fulfillmentRaw = clean(
      searchParams.get("fulfillmentType"),
    );

    if (
      fulfillmentRaw &&
      !ALLOWED_FULFILLMENT.has(
        fulfillmentRaw as ServiceFulfillmentType,
      )
    ) {
      return jsonError(
        "Service fulfilment filter is invalid.",
        400,
        rateLimit.headers,
      );
    }

    const verifiedRaw = clean(
      searchParams.get("verified"),
    );

    if (
      verifiedRaw &&
      verifiedRaw !== "true" &&
      verifiedRaw !== "false"
    ) {
      return jsonError(
        "Verification filter must be true or false.",
        400,
        rateLimit.headers,
      );
    }

    const sort = clean(searchParams.get("sort")) || "newest";

    const allowedSorts = new Set([
      "newest",
      "oldest",
      "updated",
    ]);

    if (!allowedSorts.has(sort)) {
      return jsonError(
        "Sort option is invalid. Use newest, oldest or updated.",
        400,
        rateLimit.headers,
      );
    }

    const pagination = parsePagination(searchParams);

    if (!pagination.valid) {
      return jsonError(
        pagination.error,
        400,
        rateLimit.headers,
      );
    }

    const inlineBudget = parseInlineBudget(rawQuery);

    const filters: ServiceFilters = {
      query: inlineBudget.query,
      category,
      location,
      minPrice:
        minimumPriceInput.value ?? inlineBudget.minPrice,
      maxPrice:
        maximumPriceInput.value ?? inlineBudget.maxPrice,
      availability: availabilityRaw
        ? availabilityRaw as Availability
        : null,
      fulfillmentType: fulfillmentRaw
        ? fulfillmentRaw as ServiceFulfillmentType
        : null,
      verified: verifiedRaw === ""
        ? null
        : verifiedRaw === "true",
    };

    if (
      filters.minPrice !== null &&
      filters.maxPrice !== null &&
      filters.minPrice > filters.maxPrice
    ) {
      return jsonError(
        "Minimum price cannot be greater than maximum price.",
        400,
        rateLimit.headers,
      );
    }

    const terms = getSearchTerms(filters.query);
    const where = buildServiceWhere(filters, terms);

    const orderBy: Prisma.ServiceOrderByWithRelationInput[] =
      sort === "oldest"
        ? [{ createdAt: "asc" }, { id: "asc" }]
        : sort === "updated"
          ? [{ updatedAt: "desc" }, { id: "desc" }]
          : [{ createdAt: "desc" }, { id: "desc" }];

    const [total, records] = await Promise.all([
      prisma.service.count({ where }),
      prisma.service.findMany({
        where,
        select: serviceSelect,
        orderBy,
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
    ]);

    const services = records.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      price: service.price,
      priceMin: service.priceMin,
      priceMax: service.priceMax,
      durationMinutes: service.durationMinutes,
      fulfillmentType: service.fulfillmentType,
      availability: service.availability,
      keywords: service.keywords,
      imageUrl: service.imageUrl,
      createdAt: service.createdAt,
      updatedAt: service.updatedAt,
      category: service.category?.isActive
        ? service.category
        : null,
      images: service.images.map((image) => ({
        id: image.id,
        url: image.url,
        sortOrder: image.sortOrder,
      })),
      seller: formatSeller(service.business),
    }));

    const totalPages = Math.ceil(
      total / pagination.pageSize,
    );

    return NextResponse.json(
      {
        services,
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages,
        hasNextPage: pagination.page < totalPages,
        hasPreviousPage:
          pagination.page > 1 && totalPages > 0,
        filters: {
          query: filters.query,
          category: filters.category || null,
          location: filters.location || null,
          minPrice: filters.minPrice,
          maxPrice: filters.maxPrice,
          availability: filters.availability,
          fulfillmentType: filters.fulfillmentType,
          verified: filters.verified,
          sort,
        },
      },
      {
        headers: noStoreHeaders(rateLimit.headers),
      },
    );
  } catch (error) {
    console.error("Public Services API error:", error);

    return jsonError(
      "Unable to load services. Please try again.",
      500,
      rateLimit.headers,
    );
  }
}
