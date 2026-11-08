import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type ListingType = "PRODUCT" | "SERVICE";

const MAX_LISTING_ID_LENGTH = 100;

function jsonHeaders() {
  return {
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    Pragma: "no-cache",
    Expires: "0",
  };
}

function apiResponse(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: jsonHeaders(),
  });
}

function parsePositiveInteger(
  value: string | null,
  fallback: number,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

async function getAuthenticatedAccount() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;

  if (typeof userId !== "string" || !userId.trim()) return null;

  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
}

function canUseSavedListings(role: string): boolean {
  return role === "BUYER" || role === "SELLER";
}

const activeProductWhere: Prisma.ProductWhereInput = {
  status: "ACTIVE",
  deletedAt: null,
  business: {
    is: {
      status: "ACTIVE",
      deletedAt: null,
    },
  },
};

const activeServiceWhere: Prisma.ServiceWhereInput = {
  status: "ACTIVE",
  deletedAt: null,
  business: {
    is: {
      status: "ACTIVE",
      deletedAt: null,
    },
  },
};

const businessSelect = {
  id: true,
  name: true,
  imageUrl: true,
  phone: true,
  showContactInfo: true,
  status: true,
  deletedAt: true,
  socialLinks: {
    select: {
      platform: true,
      handle: true,
    },
  },
  location: {
    select: {
      area: true,
      street: true,
    },
  },
} satisfies Prisma.BusinessSelect;

type BusinessPayload = Prisma.BusinessGetPayload<{
  select: typeof businessSelect;
}>;

const productSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  priceMin: true,
  priceMax: true,
  availability: true,
  imageUrl: true,
  status: true,
  deletedAt: true,
  category: {
    select: { id: true, name: true },
  },
  images: {
    select: {
      id: true,
      url: true,
      sortOrder: true,
    },
    orderBy: { sortOrder: "asc" },
  },
  business: { select: businessSelect },
} satisfies Prisma.ProductSelect;

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
  imageUrl: true,
  status: true,
  deletedAt: true,
  category: {
    select: { id: true, name: true },
  },
  images: {
    select: {
      id: true,
      url: true,
      sortOrder: true,
    },
    orderBy: { sortOrder: "asc" },
  },
  business: { select: businessSelect },
} satisfies Prisma.ServiceSelect;

type ProductPayload = Prisma.ProductGetPayload<{
  select: typeof productSelect;
}>;

type ServicePayload = Prisma.ServiceGetPayload<{
  select: typeof serviceSelect;
}>;

type FormattedSeller = {
  id: string;
  name: string;
  imageUrl: string | null;
  location: {
    area: string;
    street: string | null;
  } | null;
  showContactInfo: boolean;
  socialLinks: { platform: string; handle: string }[];
};

type SavedProductItem = {
  id: string;
  type: "PRODUCT";
  savedAt: Date;
  listing: Omit<ProductPayload, "business"> & { seller: FormattedSeller };
};

type SavedServiceItem = {
  id: string;
  type: "SERVICE";
  savedAt: Date;
  listing: Omit<ServicePayload, "business"> & { seller: FormattedSeller };
};

type SavedListingItem = SavedProductItem | SavedServiceItem;

function formatSeller(business: BusinessPayload): FormattedSeller {
  const socialLinks = business.showContactInfo
    ? business.socialLinks.map((link) => ({
        platform: link.platform,
        handle: link.handle,
      }))
    : [];

  if (
    business.showContactInfo &&
    business.phone &&
    !socialLinks.some((link) => link.platform === "PHONE")
  ) {
    socialLinks.push({ platform: "PHONE", handle: business.phone });
  }

  return {
    id: business.id,
    name: business.name,
    imageUrl: business.imageUrl,
    location: business.location,
    showContactInfo: business.showContactInfo,
    socialLinks,
  };
}

function getPrismaCode(error: unknown): string | null {
  return error instanceof Prisma.PrismaClientKnownRequestError
    ? error.code
    : null;
}

function getSafeDatabaseMessage(error: unknown, action: "load" | "save") {
  const code = getPrismaCode(error);

  if (code === "P2021" || code === "P2022") {
    return "The saved-items database schema is not up to date. Check the SavedListing migration and regenerate Prisma Client.";
  }
  if (code === "P2003") {
    return "The listing or account reference is no longer valid. Refresh the page and try again.";
  }
  if (code === "P2000") {
    return "The listing identifier is longer than the database allows.";
  }
  if (code === "P2025") {
    return "The listing could not be found. Refresh the page and try again.";
  }

  return action === "load"
    ? "Unable to load saved listings. Please try again."
    : "Unable to save listing. Please try again.";
}

function logSavedApiError(action: string, error: unknown, referenceId: string) {
  console.error(`[Saved listings ${action} error]`, {
    referenceId,
    prismaCode: getPrismaCode(error),
    error,
  });
}

// ---------------------------------------------------------------------------
// GET /api/saved
// Supports both response contracts used by ReMarket's existing pages:
// - items: { id, type, savedAt, listing }
// - savedListings: { id, createdAt, product, service }
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const referenceId = randomUUID();

  try {
    const account = await getAuthenticatedAccount();

    if (!account) {
      return apiResponse(
        { error: "You must be logged in to view saved listings." },
        401,
      );
    }

    if (!canUseSavedListings(account.role)) {
      return apiResponse(
        { error: "Your account cannot access saved listings." },
        403,
      );
    }

    const { searchParams } = new URL(request.url);
    const rawType = (searchParams.get("type") || "").trim().toUpperCase();

    if (rawType && rawType !== "PRODUCT" && rawType !== "SERVICE") {
      return apiResponse(
        { error: "Type must be PRODUCT or SERVICE." },
        400,
      );
    }

    const type: ListingType | null =
      rawType === "PRODUCT" ? "PRODUCT" :
      rawType === "SERVICE" ? "SERVICE" : null;

    const page = parsePositiveInteger(searchParams.get("page"), 1, 100000);
    const limit = parsePositiveInteger(searchParams.get("limit"), 20, 50);

    const where: Prisma.SavedListingWhereInput = {
      userId: account.id,
      ...(type === "PRODUCT"
        ? { product: { is: activeProductWhere } }
        : type === "SERVICE"
          ? { service: { is: activeServiceWhere } }
          : {
              OR: [
                { product: { is: activeProductWhere } },
                { service: { is: activeServiceWhere } },
              ],
            }),
    };

    const total = await prisma.savedListing.count({ where });
    const totalPages = Math.ceil(total / limit);
    const safePage = totalPages > 0 ? Math.min(page, totalPages) : 1;

    const savedListings = await prisma.savedListing.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (safePage - 1) * limit,
      take: limit,
      select: {
        id: true,
        createdAt: true,
        product: { select: productSelect },
        service: { select: serviceSelect },
      },
    });

    const items = savedListings.flatMap<SavedListingItem>((saved) => {
      if (saved.product) {
        const { business, ...product } = saved.product;
        return [{
          id: saved.id,
          type: "PRODUCT" as const,
          savedAt: saved.createdAt,
          listing: {
            ...product,
            seller: formatSeller(business),
          },
        }];
      }

      if (saved.service) {
        const { business, ...service } = saved.service;
        return [{
          id: saved.id,
          type: "SERVICE" as const,
          savedAt: saved.createdAt,
          listing: {
            ...service,
            seller: formatSeller(business),
          },
        }];
      }

      return [];
    });

    const products = savedListings.filter((saved) => saved.product !== null).length;
    const services = savedListings.filter((saved) => saved.service !== null).length;

    return apiResponse({
      // Current response format used by the Shop and Services pages.
      items,

      // Compatibility format used by the existing /saved and detail pages.
      // Do not remove this alias until all clients use `items`.
      savedListings,

      pagination: {
        page: safePage,
        limit,
        total,
        totalPages,
        hasNextPage: safePage < totalPages,
        hasPreviousPage: safePage > 1,
      },
      total,
      products,
      services,
    });
  } catch (error) {
    logSavedApiError("GET", error, referenceId);
    return apiResponse(
      {
        error: getSafeDatabaseMessage(error, "load"),
        referenceId,
        code: getPrismaCode(error),
      },
      500,
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/saved
// Body: { type: "PRODUCT" | "SERVICE", listingId: string }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const referenceId = randomUUID();

  try {
    const account = await getAuthenticatedAccount();

    if (!account) {
      return apiResponse(
        { error: "You must be logged in to save listings." },
        401,
      );
    }

    if (!canUseSavedListings(account.role)) {
      return apiResponse(
        { error: "Your account cannot save listings." },
        403,
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return apiResponse({ error: "Invalid JSON request body." }, 400);
    }

    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return apiResponse({ error: "Invalid request body." }, 400);
    }

    const data = body as { type?: unknown; listingId?: unknown };
    const rawType = typeof data.type === "string"
      ? data.type.trim().toUpperCase()
      : "";
    const listingId = typeof data.listingId === "string"
      ? data.listingId.trim()
      : "";

    if (rawType !== "PRODUCT" && rawType !== "SERVICE") {
      return apiResponse(
        { error: "Type must be PRODUCT or SERVICE." },
        400,
      );
    }

    if (!listingId || listingId.length > MAX_LISTING_ID_LENGTH) {
      return apiResponse({ error: "A valid listingId is required." }, 400);
    }

    const listingType = rawType as ListingType;

    if (listingType === "PRODUCT") {
      const product = await prisma.product.findFirst({
        where: { id: listingId, ...activeProductWhere },
        select: { id: true },
      });

      if (!product) {
        return apiResponse(
          { error: "Product not found or no longer available." },
          404,
        );
      }
    } else {
      const service = await prisma.service.findFirst({
        where: { id: listingId, ...activeServiceWhere },
        select: { id: true },
      });

      if (!service) {
        return apiResponse(
          { error: "Service not found or no longer available." },
          404,
        );
      }
    }

    const where: Prisma.SavedListingWhereUniqueInput =
      listingType === "PRODUCT"
        ? {
            userId_productId: {
              userId: account.id,
              productId: listingId,
            },
          }
        : {
            userId_serviceId: {
              userId: account.id,
              serviceId: listingId,
            },
          };

    const createData: Prisma.SavedListingCreateInput =
      listingType === "PRODUCT"
        ? {
            user: { connect: { id: account.id } },
            product: { connect: { id: listingId } },
          }
        : {
            user: { connect: { id: account.id } },
            service: { connect: { id: listingId } },
          };

    const savedSelect = {
      id: true,
      productId: true,
      serviceId: true,
      createdAt: true,
    } satisfies Prisma.SavedListingSelect;

    const existing = await prisma.savedListing.findUnique({
      where,
      select: { id: true },
    });

    // Upsert makes repeat clicks and simultaneous requests idempotent.
    const saved = await prisma.savedListing.upsert({
      where,
      create: createData,
      update: {},
      select: savedSelect,
    });

    return apiResponse(
      {
        message: existing ? "Listing is already saved." : "Listing saved successfully.",
        saved: true,
        alreadySaved: Boolean(existing),
        type: listingType,

        // Current payload consumed by Shop and Services pages.
        item: saved,

        // Compatibility aliases used by product/service detail pages.
        savedListing: saved,
        savedListingId: saved.id,
      },
      existing ? 200 : 201,
    );
  } catch (error) {
    logSavedApiError("POST", error, referenceId);
    return apiResponse(
      {
        error: getSafeDatabaseMessage(error, "save"),
        referenceId,
        code: getPrismaCode(error),
      },
      500,
    );
  }
}
