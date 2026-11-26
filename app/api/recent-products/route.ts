import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { checkPublicRateLimit } from "@/lib/rate-limit";
import { getProductRatingSummaries } from "@/lib/product-ratings";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 8;
const MAX_PAGE_SIZE = 50;
const MAX_DATABASE_OFFSET = 2_147_483_647;

const recentProductSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  originalPrice: true,
  availability: true,
  stockQuantity: true,
  shippingWeightKg: true,
  shippingLengthCm: true,
  shippingWidthCm: true,
  shippingHeightCm: true,
  imageUrl: true,
  createdAt: true,
  category: {
    select: {
      id: true,
      name: true,
      isActive: true,
      iconKey: true,
      imageUrl: true,
      parentId: true,
      sortOrder: true,
      parent: {
        select: {
          id: true,
          name: true,
          isActive: true,
          iconKey: true,
          imageUrl: true,
          parentId: true,
          sortOrder: true,
        },
      },
    },
  },
  images: {
    select: {
      url: true,
      sortOrder: true,
      createdAt: true,
    },
    orderBy: [
      { sortOrder: "asc" },
      { createdAt: "asc" },
    ],
    take: 1,
  },
  business: {
    select: {
      id: true,
      name: true,
      availability: true,
      verification: true,
      location: {
        select: {
          area: true,
          street: true,
        },
      },
    },
  },
} satisfies Prisma.ProductSelect;

type RecentProductRecord = Prisma.ProductGetPayload<{
  select: typeof recentProductSelect;
}>;

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

function parsePositiveInteger(
  rawValue: string | null,
  fallback: number,
): number | null {
  if (rawValue === null) return fallback;

  const value = rawValue.trim();
  if (!/^\d+$/.test(value)) return null;

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return null;
  }

  return parsed;
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

  const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);
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

  return { valid: true, page, pageSize, skip };
}

function paginationMetadata(
  total: number,
  page: number,
  pageSize: number,
) {
  const totalPages = Math.ceil(total / pageSize);

  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: totalPages > 0 && page > 1,
  };
}

function responseHeaders(rateLimitHeaders?: Headers): Headers {
  const headers = new Headers(rateLimitHeaders);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json");
  return headers;
}

function toMoneyNumber(value: unknown): number | null {
  let parsed: number;

  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "string") {
    const cleaned = value.trim().replace(/,/g, "");
    if (!cleaned) return null;
    parsed = Number(cleaned);
  } else if (typeof value === "bigint") {
    parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) return null;
  } else if (typeof value === "object" && value !== null) {
    const decimalValue = value as { toNumber?: () => number };

    if (typeof decimalValue.toNumber !== "function") {
      return null;
    }

    try {
      parsed = decimalValue.toNumber();
    } catch {
      return null;
    }
  } else {
    return null;
  }

  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : null;
}

function serializeCategory(
  category: RecentProductRecord["category"],
) {
  if (!category?.isActive) return null;

  const parent = category.parent?.isActive
    ? {
        id: category.parent.id,
        name: category.parent.name,
        iconKey: category.parent.iconKey,
        imageUrl: category.parent.imageUrl,
        parentId: category.parent.parentId,
        sortOrder: category.parent.sortOrder,
      }
    : null;

  return {
    id: category.id,
    name: category.name,
    iconKey: category.iconKey,
    imageUrl: category.imageUrl,
    parentId: category.parentId,
    sortOrder: category.sortOrder,
    parent,
  };
}

function serializeProduct(product: RecentProductRecord) {
  const { category, images, business, ...fields } = product;

  const currentPrice = toMoneyNumber(product.price);
  const candidateOriginalPrice = toMoneyNumber(
    product.originalPrice,
  );

  const originalPrice =
    currentPrice !== null &&
    currentPrice > 0 &&
    candidateOriginalPrice !== null &&
    candidateOriginalPrice > currentPrice
      ? candidateOriginalPrice
      : null;

  return {
    ...fields,
    hasShippingMeasurements: [product.shippingWeightKg, product.shippingLengthCm, product.shippingWidthCm, product.shippingHeightCm].every((value) => typeof value === "number" && Number.isFinite(value) && value > 0),
    price: currentPrice,
    originalPrice,
    imageUrl: product.imageUrl ?? images[0]?.url ?? null,
    category: serializeCategory(category),
    business: {
      id: business.id,
      name: business.name,
      availability: business.availability,
      verification: business.verification,
      location: business.location
        ? {
            area: business.location.area,
            street: business.location.street,
          }
        : null,
    },
  };
}

const publicProductWhere = {
  status: "ACTIVE",
  deletedAt: null,
  business: {
    is: {
      status: "ACTIVE",
      deletedAt: null,
    },
  },
} satisfies Prisma.ProductWhereInput;

export async function GET(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(
    request,
    "recent-products",
  );
  const headers = responseHeaders(rateLimit.headers);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        products: [],
        total: 0,
        error: "Too many product requests. Please try again shortly.",
      },
      { status: 429, headers },
    );
  }

  const url = new URL(request.url);
  const pagination = parsePagination(url.searchParams);

  if (!pagination.valid) {
    return NextResponse.json(
      {
        products: [],
        total: 0,
        error: pagination.error,
      },
      { status: 400, headers },
    );
  }

  const { page, pageSize, skip } = pagination;

  try {
    const [total, records] = await Promise.all([
      prisma.product.count({ where: publicProductWhere }),
      prisma.product.findMany({
        where: publicProductWhere,
        select: recentProductSelect,
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        skip,
        take: pageSize,
      }),
    ]);

    const ratingSummaries = await getProductRatingSummaries(records.map((product) => product.id));

    return NextResponse.json(
      {
        products: records.map((product) => {
          const summary = ratingSummaries.get(product.id);
          return {
            ...serializeProduct(product),
            rating: summary?.rating ?? null,
            reviewCount: summary?.reviewCount ?? 0,
          };
        }),
        ...paginationMetadata(total, page, pageSize),
      },
      { headers },
    );
  } catch (error) {
    console.error("Recent products API error:", error);

    return NextResponse.json(
      {
        products: [],
        total: 0,
        error: "Unable to load recently added products.",
      },
      { status: 500, headers },
    );
  }
}
