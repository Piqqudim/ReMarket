import {
  Availability,
  Prisma,
  VerificationStatus,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkPublicRateLimit } from "@/lib/rate-limit";
import { getProductRatingSummaries } from "@/lib/product-ratings";

const MAX_QUERY_LENGTH = 100;
const MAX_CATEGORY_LENGTH = 100;
const MAX_CATEGORY_ID_LENGTH = 100;
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

const productSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  originalPrice: true,
  stockQuantity: true,
  shippingWeightKg: true,
  shippingLengthCm: true,
  shippingWidthCm: true,
  shippingHeightCm: true,
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
      imageUrl: true,
      isActive: true,
      sortOrder: true,
      parentId: true,
      parent: {
        select: {
          id: true,
          name: true,
          iconKey: true,
          imageUrl: true,
          isActive: true,
          sortOrder: true,
        },
      },
    },
  },
  images: {
    select: {
      id: true,
      url: true,
      sortOrder: true,
    },
    orderBy: { sortOrder: "asc" },
  },
  business: {
    select: {
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
          state: true,
          lga: true,
          verification: true,
        },
      },
      categories: {
        where: { category: { isActive: true } },
        select: {
          category: {
            select: {
              id: true,
              name: true,
              iconKey: true,
              imageUrl: true,
              isActive: true,
              sortOrder: true,
              parentId: true,
              parent: {
                select: {
                  id: true,
                  name: true,
                  iconKey: true,
                  imageUrl: true,
                  isActive: true,
                  sortOrder: true,
                },
              },
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
    },
  },
} satisfies Prisma.ProductSelect;

type ProductRecord = Prisma.ProductGetPayload<{
  select: typeof productSelect;
}>;

type ProductFilters = {
  query: string;
  category: string;
  categoryIds: string[];
  state: string;
  lga: string;
  area: string;
  legacyLocation: string;
  minPrice: number | null;
  maxPrice: number | null;
  availability: Availability | null;
  verified: boolean | null;
};

type PaginationResult =
  | { valid: true; page: number; pageSize: number; skip: number }
  | { valid: false; error: string };

type CategoryResolution = {
  id: string;
  name: string;
  categoryIds: string[];
};

const categoryResolutionSelect = {
  id: true,
  name: true,
  isActive: true,
  parentId: true,
  children: {
    where: { isActive: true },
    select: { id: true },
  },
} satisfies Prisma.CategorySelect;

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

function jsonError(message: string, status: number, headers?: HeadersInit) {
  return NextResponse.json(
    { products: [], services: [], error: message },
    { status, headers: noStoreHeaders(headers) },
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
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
}

function parsePagination(searchParams: URLSearchParams): PaginationResult {
  const page = parsePositiveInteger(searchParams.get("page"), DEFAULT_PAGE);
  if (page === null) {
    return { valid: false, error: "'page' must be a positive integer." };
  }

  const requestedPageSize = parsePositiveInteger(
    searchParams.get("pageSize"),
    DEFAULT_PAGE_SIZE,
  );
  if (requestedPageSize === null) {
    return { valid: false, error: "'pageSize' must be a positive integer." };
  }

  const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);
  const skip = (page - 1) * pageSize;
  if (!Number.isSafeInteger(skip) || skip > MAX_DATABASE_OFFSET) {
    return { valid: false, error: "Requested page is too large." };
  }

  return { valid: true, page, pageSize, skip };
}

function parsePrice(value: string | null, label: string) {
  const raw = value?.trim() ?? "";
  if (!raw) return { value: null as number | null };
  const normalized = raw.replace(/,/g, "");
  if (!/^\d+$/.test(normalized)) {
    return { value: null as number | null, error: `${label} must be a whole-number price.` };
  }

  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > MAX_PRICE_VALUE) {
    return { value: null as number | null, error: `${label} is outside the permitted range.` };
  }
  return { value: parsed };
}

function parseMoneyAmount(input: string): number | null {
  const normalized = input.trim().replace(/[₦,\s]/g, "").toLowerCase();
  const match = normalized.match(/^(\d+(?:\.\d+)?)(k)?$/);
  if (!match) return null;
  const amount = Math.round(Number(match[1]) * (match[2] === "k" ? 1000 : 1));
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= MAX_PRICE_VALUE
    ? amount
    : null;
}

function parseInlineBudget(query: string) {
  let cleanedQuery = query.trim();
  let minPrice: number | null = null;
  let maxPrice: number | null = null;

  const betweenPattern = /\bbetween\s+([\d,]+(?:\.\d+)?\s*k?)\s+and\s+([\d,]+(?:\.\d+)?\s*k?)\b/i;
  const betweenMatch = cleanedQuery.match(betweenPattern);
  if (betweenMatch) {
    const lower = parseMoneyAmount(betweenMatch[1]);
    const upper = parseMoneyAmount(betweenMatch[2]);
    if (lower !== null && upper !== null && lower <= upper) {
      minPrice = lower;
      maxPrice = upper;
      cleanedQuery = cleanedQuery.replace(betweenMatch[0], " ").replace(/\s+/g, " ").trim();
      return { query: cleanedQuery, minPrice, maxPrice };
    }
  }

  const maximumPattern = /\b(?:under|below|less\s+than|up\s+to|at\s+most|max(?:imum)?)\s+(?:₦\s*)?([\d,]+(?:\.\d+)?\s*k?)\b/i;
  const maximumMatch = cleanedQuery.match(maximumPattern);
  if (maximumMatch) {
    const amount = parseMoneyAmount(maximumMatch[1]);
    if (amount !== null) {
      maxPrice = amount;
      cleanedQuery = cleanedQuery.replace(maximumMatch[0], " ").replace(/\s+/g, " ").trim();
    }
  } else {
    const minimumPattern = /\b(?:over|above|more\s+than|at\s+least|min(?:imum)?)\s+(?:₦\s*)?([\d,]+(?:\.\d+)?\s*k?)\b/i;
    const minimumMatch = cleanedQuery.match(minimumPattern);
    if (minimumMatch) {
      const amount = parseMoneyAmount(minimumMatch[1]);
      if (amount !== null) {
        minPrice = amount;
        cleanedQuery = cleanedQuery.replace(minimumMatch[0], " ").replace(/\s+/g, " ").trim();
      }
    }
  }

  return { query: cleanedQuery, minPrice, maxPrice };
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
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("ing") && token.length > 5) return token.slice(0, -3);
  if (token.endsWith("ed") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("es") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3) return token.slice(0, -1);
  return token;
}

function getSearchTerms(query: string): string[] {
  return Array.from(new Set(
    normalizeText(query)
      .split(" ")
      .filter(Boolean)
      .flatMap((token) => [token, stemToken(token)]),
  ));
}

async function resolveCategorySelection(
  categoryId: string,
  categoryName: string,
): Promise<CategoryResolution | null> {
  if (!categoryId && !categoryName) return null;

  const selected = categoryId
    ? await prisma.category.findUnique({
        where: { id: categoryId },
        select: categoryResolutionSelect,
      })
    : await prisma.category.findFirst({
        where: { name: { equals: categoryName, mode: "insensitive" } },
        select: categoryResolutionSelect,
      });

  if (!selected || !selected.isActive) return null;

  const categoryIds = selected.parentId === null
    ? [selected.id, ...selected.children.map((child) => child.id)]
    : [selected.id];

  return {
    id: selected.id,
    name: selected.name,
    categoryIds,
  };
}

function buildLocationWhere(filters: ProductFilters): Prisma.LocationWhereInput {
  const conditions: Prisma.LocationWhereInput[] = [];

  if (filters.state) {
    conditions.push({ state: { equals: filters.state, mode: "insensitive" } });
  }
  if (filters.lga) {
    conditions.push({ lga: { equals: filters.lga, mode: "insensitive" } });
  }
  if (filters.area) {
    conditions.push({
      OR: [
        { area: { contains: filters.area, mode: "insensitive" } },
        { street: { contains: filters.area, mode: "insensitive" } },
        { address: { contains: filters.area, mode: "insensitive" } },
      ],
    });
  }
  if (filters.legacyLocation && !filters.state && !filters.lga && !filters.area) {
    conditions.push({
      OR: [
        { area: { contains: filters.legacyLocation, mode: "insensitive" } },
        { street: { contains: filters.legacyLocation, mode: "insensitive" } },
        { address: { contains: filters.legacyLocation, mode: "insensitive" } },
      ],
    });
  }

  return conditions.length ? { AND: conditions } : {};
}

function buildProductPriceConditions(filters: ProductFilters): Prisma.ProductWhereInput[] {
  const { minPrice, maxPrice } = filters;
  if (minPrice === null && maxPrice === null) return [];
  if (minPrice !== null && maxPrice !== null) {
    return [{ price: { gte: minPrice, lte: maxPrice } }];
  }
  if (minPrice !== null) return [{ price: { gte: minPrice } }];
  return [{ price: { lte: maxPrice! } }];
}

function buildProductTextConditions(terms: string[]): Prisma.ProductWhereInput[] {
  return terms.map((term) => ({
    OR: [
      { name: { contains: term, mode: "insensitive" } },
      { description: { contains: term, mode: "insensitive" } },
      { keywords: { has: term } },
      {
        category: {
          is: {
            isActive: true,
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              {
                parent: {
                  is: {
                    isActive: true,
                    name: { contains: term, mode: "insensitive" },
                  },
                },
              },
            ],
          },
        },
      },
      {
        business: {
          is: {
            OR: [
              { name: { contains: term, mode: "insensitive" } },
              { description: { contains: term, mode: "insensitive" } },
              {
                categories: {
                  some: {
                    category: {
                      isActive: true,
                      name: { contains: term, mode: "insensitive" },
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

function buildProductCategoryConditions(filters: ProductFilters): Prisma.ProductWhereInput[] {
  if (filters.categoryIds.length > 0) {
    return [
      {
        category: {
          is: {
            isActive: true,
            id: { in: filters.categoryIds },
          },
        },
      },
      {
        AND: [
          { category: { is: null } },
          {
            business: {
              is: {
                categories: {
                  some: {
                    category: {
                      isActive: true,
                      id: { in: filters.categoryIds },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    ];
  }

  if (!filters.category) return [];
  const activeCategory = {
    isActive: true,
    name: { equals: filters.category, mode: "insensitive" as const },
  };
  return [
    { category: { is: activeCategory } },
    {
      AND: [
        { category: { is: null } },
        { business: { is: { categories: { some: { category: activeCategory } } } } },
      ],
    },
  ];
}

function buildProductWhere(filters: ProductFilters, terms: string[]): Prisma.ProductWhereInput {
  const conditions: Prisma.ProductWhereInput[] = [
    {
      status: "ACTIVE",
      deletedAt: null,
      availability: filters.availability ?? { not: Availability.UNAVAILABLE },
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
                  : { not: VerificationStatus.VERIFIED },
              }),
          ...((filters.state || filters.lga || filters.area || filters.legacyLocation)
            ? { location: { is: buildLocationWhere(filters) } }
            : {}),
        },
      },
    },
  ];

  if (terms.length) conditions.push(...buildProductTextConditions(terms));
  const categoryConditions = buildProductCategoryConditions(filters);
  if (categoryConditions.length) conditions.push({ OR: categoryConditions });
  conditions.push(...buildProductPriceConditions(filters));
  return { AND: conditions };
}

function toMoneyNumber(value: unknown): number | null {
  let amount: number;
  if (typeof value === "number") {
    amount = value;
  } else if (typeof value === "string") {
    const normalized = value.trim().replace(/,/g, "");
    if (!normalized) return null;
    amount = Number(normalized);
  } else if (typeof value === "object" && value !== null) {
    const decimal = value as { toNumber?: () => number };
    if (typeof decimal.toNumber !== "function") return null;
    try {
      amount = decimal.toNumber();
    } catch {
      return null;
    }
  } else {
    return null;
  }
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function normalizeNigerianPhone(value: string): string {
  let phone = value.trim().replace(/[^\d+]/g, "");
  if (!phone) return "";
  if (phone.startsWith("00")) phone = phone.slice(2);
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (phone.startsWith("234")) return `+${phone}`;
  if (phone.startsWith("0")) return `+234${phone.slice(1)}`;
  return `+234${phone}`;
}

function normalizeSocialHandle(platform: string, handle: string): string {
  const cleanHandle = handle.trim();
  if (!cleanHandle) return "";
  if (platform === "PHONE" || platform === "WHATSAPP") {
    if (cleanHandle.startsWith("http://") || cleanHandle.startsWith("https://")) {
      return cleanHandle;
    }
    return normalizeNigerianPhone(cleanHandle);
  }
  return cleanHandle;
}

type CategoryPayload = {
  id: string;
  name: string;
  iconKey: string;
  imageUrl: string | null;
  sortOrder: number;
  parentId: string | null;
  parent: {
    id: string;
    name: string;
    iconKey: string;
    imageUrl: string | null;
    sortOrder: number;
  } | null;
};

function formatProductCategory(
  category: ProductRecord["category"],
): CategoryPayload | null {
  if (!category?.isActive) return null;

  const parent = category.parent?.isActive
    ? {
        id: category.parent.id,
        name: category.parent.name,
        iconKey: category.parent.iconKey,
        imageUrl: category.parent.imageUrl,
        sortOrder: category.parent.sortOrder,
      }
    : null;

  return {
    id: category.id,
    name: category.name,
    iconKey: category.iconKey,
    imageUrl: category.imageUrl,
    sortOrder: category.sortOrder,
    parentId: category.parentId,
    parent,
  };
}

function formatBusinessCategory(
  category: ProductRecord["business"]["categories"][number]["category"],
): CategoryPayload | null {
  if (!category.isActive) return null;

  const parent = category.parent?.isActive
    ? {
        id: category.parent.id,
        name: category.parent.name,
        iconKey: category.parent.iconKey,
        imageUrl: category.parent.imageUrl,
        sortOrder: category.parent.sortOrder,
      }
    : null;

  return {
    id: category.id,
    name: category.name,
    iconKey: category.iconKey,
    imageUrl: category.imageUrl,
    sortOrder: category.sortOrder,
    parentId: category.parentId,
    parent,
  };
}

function formatSeller(business: ProductRecord["business"]) {
  const socialLinks = business.showContactInfo
    ? business.socialLinks
        .map((link) => ({
          id: link.id,
          platform: link.platform,
          handle: normalizeSocialHandle(link.platform, link.handle),
        }))
        .filter((link) => Boolean(link.handle))
    : [];

  if (business.showContactInfo && business.phone && !socialLinks.some((link) => link.platform === "PHONE")) {
    socialLinks.push({
      id: `legacy-phone-${business.id}`,
      platform: "PHONE",
      handle: normalizeNigerianPhone(business.phone),
    });
  }

  const businessCategories = business.categories
    .map((item) => formatBusinessCategory(item.category))
    .filter((category): category is CategoryPayload => category !== null);
  const categoryNames = businessCategories.map((category) => category.name);

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
          state: business.location.state,
          lga: business.location.lga,
          verification: business.location.verification,
        }
      : null,
    categories: categoryNames,
    category: categoryNames[0] ?? "Uncategorised",
    businessCategories,
    socialLinks,
  };
}

export async function GET(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(request, "search");
  if (!rateLimit.allowed) {
    return jsonError(
      "Too many product requests. Please try again shortly.",
      429,
      rateLimit.headers,
    );
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const type = clean(searchParams.get("type")) || "product";
    if (type !== "product") {
      return jsonError("Service search is currently unavailable.", 503, rateLimit.headers);
    }

    const rawQuery = clean(searchParams.get("q"));
    const categoryInput = clean(searchParams.get("category"));
    const categoryId = clean(searchParams.get("categoryId"));
    const state = clean(searchParams.get("state"));
    const lga = clean(searchParams.get("lga"));
    const area = clean(searchParams.get("area"));
    const legacyLocation = clean(searchParams.get("location"));

    if (rawQuery.length > MAX_QUERY_LENGTH) {
      return jsonError(`Search text must not exceed ${MAX_QUERY_LENGTH} characters.`, 400, rateLimit.headers);
    }
    if (categoryInput.length > MAX_CATEGORY_LENGTH) {
      return jsonError(`Category must not exceed ${MAX_CATEGORY_LENGTH} characters.`, 400, rateLimit.headers);
    }
    if (categoryId.length > MAX_CATEGORY_ID_LENGTH) {
      return jsonError(`Category ID must not exceed ${MAX_CATEGORY_ID_LENGTH} characters.`, 400, rateLimit.headers);
    }
    if ([state, lga, area, legacyLocation].some((value) => value.length > MAX_LOCATION_LENGTH)) {
      return jsonError(`Location fields must not exceed ${MAX_LOCATION_LENGTH} characters.`, 400, rateLimit.headers);
    }

    const minimumPriceInput = parsePrice(searchParams.get("minPrice"), "Minimum price");
    if (minimumPriceInput.error) return jsonError(minimumPriceInput.error, 400, rateLimit.headers);
    const maximumPriceInput = parsePrice(searchParams.get("maxPrice"), "Maximum price");
    if (maximumPriceInput.error) return jsonError(maximumPriceInput.error, 400, rateLimit.headers);

    const availabilityRaw = clean(searchParams.get("availability"));
    if (availabilityRaw && !ALLOWED_AVAILABILITY.has(availabilityRaw as Availability)) {
      return jsonError("Availability filter is invalid.", 400, rateLimit.headers);
    }

    const verifiedRaw = clean(searchParams.get("verified"));
    if (verifiedRaw && verifiedRaw !== "true" && verifiedRaw !== "false") {
      return jsonError("Verification filter must be true or false.", 400, rateLimit.headers);
    }

    const sort = clean(searchParams.get("sort")) || "newest";
    const allowedSorts = new Set(["newest", "oldest", "updated"]);
    if (!allowedSorts.has(sort)) {
      return jsonError("Sort option is invalid. Use newest, oldest or updated.", 400, rateLimit.headers);
    }

    const pagination = parsePagination(searchParams);
    if (!pagination.valid) return jsonError(pagination.error, 400, rateLimit.headers);

    let resolvedCategory: CategoryResolution | null = null;
    if (categoryId || categoryInput) {
      resolvedCategory = await resolveCategorySelection(categoryId, categoryInput);
      if (categoryId && !resolvedCategory) {
        return jsonError("The selected category does not exist or is inactive.", 404, rateLimit.headers);
      }
    }

    const inlineBudget = parseInlineBudget(rawQuery);
    const filters: ProductFilters = {
      query: inlineBudget.query,
      category: resolvedCategory?.name ?? categoryInput,
      categoryIds: resolvedCategory?.categoryIds ?? [],
      state,
      lga,
      area,
      legacyLocation,
      minPrice: minimumPriceInput.value ?? inlineBudget.minPrice,
      maxPrice: maximumPriceInput.value ?? inlineBudget.maxPrice,
      availability: availabilityRaw ? availabilityRaw as Availability : null,
      verified: verifiedRaw === "" ? null : verifiedRaw === "true",
    };

    if (filters.minPrice !== null && filters.maxPrice !== null && filters.minPrice > filters.maxPrice) {
      return jsonError("Minimum price cannot be greater than maximum price.", 400, rateLimit.headers);
    }

    const terms = getSearchTerms(filters.query);
    const where = buildProductWhere(filters, terms);
    const orderBy: Prisma.ProductOrderByWithRelationInput[] = sort === "oldest"
      ? [{ createdAt: "asc" }, { id: "asc" }]
      : sort === "updated"
        ? [{ updatedAt: "desc" }, { id: "desc" }]
        : [{ createdAt: "desc" }, { id: "desc" }];

    const [total, records] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        select: productSelect,
        orderBy,
        skip: pagination.skip,
        take: pagination.pageSize,
      }),
    ]);

    const ratingSummaries = await getProductRatingSummaries(records.map((product) => product.id));
    const products = records.map((product) => {
      const ratingSummary = ratingSummaries.get(product.id);
      const price = toMoneyNumber(product.price);
      const candidateOriginalPrice = toMoneyNumber(product.originalPrice);
      const originalPrice = price !== null && price > 0 && candidateOriginalPrice !== null && candidateOriginalPrice > price
        ? candidateOriginalPrice
        : null;

      return {
        id: product.id,
        name: product.name,
        description: product.description,
        price,
        originalPrice,
        rating: ratingSummary?.rating ?? null,
        reviewCount: ratingSummary?.reviewCount ?? 0,
        stockQuantity: product.stockQuantity,
        hasShippingMeasurements: [product.shippingWeightKg, product.shippingLengthCm, product.shippingWidthCm, product.shippingHeightCm].every((value) => typeof value === "number" && Number.isFinite(value) && value > 0),
        availability: product.availability,
        keywords: product.keywords,
        imageUrl: product.imageUrl ?? product.images[0]?.url ?? null,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
        category: formatProductCategory(product.category),
        images: product.images.map((image) => ({
          id: image.id,
          url: image.url,
          sortOrder: image.sortOrder,
        })),
        seller: formatSeller(product.business),
      };
    });

    const totalPages = Math.ceil(total / pagination.pageSize);
    const truncated = total > products.length;

    return NextResponse.json(
      {
        type: "product",
        products,
        services: [],
        page: pagination.page,
        pageSize: pagination.pageSize,
        total,
        totalPages,
        hasNextPage: pagination.page < totalPages,
        hasPreviousPage: pagination.page > 1 && totalPages > 0,
        resultMeta: {
          type: "product",
          totalProducts: total,
          totalServices: 0,
          totalResults: total,
          returnedResults: products.length,
          page: pagination.page,
          pageSize: pagination.pageSize,
          totalPages,
          hasMore: pagination.page < totalPages,
          maxResults: MAX_PAGE_SIZE,
          truncated,
          sort,
          filters: {
            category: filters.category || null,
            categoryId: resolvedCategory?.id ?? null,
            state: filters.state || null,
            lga: filters.lga || null,
            area: filters.area || filters.legacyLocation || null,
          },
        },
        filters: {
          query: filters.query,
          category: filters.category || null,
          categoryId: resolvedCategory?.id ?? null,
          state: filters.state || null,
          lga: filters.lga || null,
          area: filters.area || filters.legacyLocation || null,
          minPrice: filters.minPrice,
          maxPrice: filters.maxPrice,
          availability: filters.availability,
          verified: filters.verified,
          sort,
        },
      },
      { headers: noStoreHeaders(rateLimit.headers) },
    );
  } catch (error) {
    console.error("Public Products API error:", error);
    return jsonError("Unable to load products. Please try again.", 500, rateLimit.headers);
  }
}
