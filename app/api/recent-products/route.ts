import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { checkPublicRateLimit } from "@/lib/rate-limit";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 8;
const MAX_PAGE_SIZE = 50;
const MAX_DATABASE_OFFSET = 2_147_483_647;

const recentProductSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  priceMin: true,
  priceMax: true,
  availability: true,
  imageUrl: true,
  createdAt: true,
  category: {
    select: {
      id: true,
      name: true,
      isActive: true,
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
  fallback: number
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
  searchParams: URLSearchParams
): PaginationResult {
  const page = parsePositiveInteger(
    searchParams.get("page"),
    DEFAULT_PAGE
  );

  if (page === null) {
    return {
      valid: false,
      error: "'page' must be a positive integer.",
    };
  }

  const requestedPageSize = parsePositiveInteger(
    searchParams.get("pageSize"),
    DEFAULT_PAGE_SIZE
  );

  if (requestedPageSize === null) {
    return {
      valid: false,
      error: "'pageSize' must be a positive integer.",
    };
  }

  const pageSize = Math.min(
    requestedPageSize,
    MAX_PAGE_SIZE
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

function paginationMetadata(
  total: number,
  page: number,
  pageSize: number
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

function responseHeaders(
  rateLimitHeaders?: Headers
): Headers {
  const headers = new Headers(rateLimitHeaders);

  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json");

  return headers;
}

function serializeProduct(
  product: RecentProductRecord
) {
  const {
    category,
    images,
    business,
    ...fields
  } = product;

  return {
    ...fields,

    // Product.imageUrl is the compatibility mirror.
    // The first ProductImage is used as a fallback.
    imageUrl: product.imageUrl ?? images[0]?.url ?? null,

    category: category?.isActive
      ? {
          id: category.id,
          name: category.name,
        }
      : null,

    business: {
      id: business.id,
      name: business.name,
      availability: business.availability,
      verification: business.verification,

      // Do not expose precise coordinates or a street address.
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
    "recent-products"
  );

  const headers = responseHeaders(rateLimit.headers);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        products: [],
        total: 0,
        error:
          "Too many product requests. Please try again shortly.",
      },
      {
        status: 429,
        headers,
      }
    );
  }

  const url = new URL(request.url);

  const pagination = parsePagination(
    url.searchParams
  );

  if (!pagination.valid) {
    return NextResponse.json(
      {
        products: [],
        total: 0,
        error: pagination.error,
      },
      {
        status: 400,
        headers,
      }
    );
  }

  const {
    page,
    pageSize,
    skip,
  } = pagination;

  try {
    const [total, records] = await Promise.all([
      prisma.product.count({
        where: publicProductWhere,
      }),

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

    return NextResponse.json(
      {
        products: records.map(serializeProduct),
        ...paginationMetadata(
          total,
          page,
          pageSize
        ),
      },
      {
        headers,
      }
    );
  } catch (error) {
    console.error(
      "Recent products API error:",
      error
    );

    return NextResponse.json(
      {
        products: [],
        total: 0,
        error:
          "Unable to load recently added products.",
      },
      {
        status: 500,
        headers,
      }
    );
  }
}