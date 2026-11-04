
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

type ListingType = "PRODUCT" | "SERVICE";

type SellerRecord = {
  id: string;
  name: string;
  imageUrl: string | null;
  showContactInfo: boolean;
  phone: string | null;
  socialLinks: {
    platform: string;
    handle: string;
  }[];
  location: {
    area: string;
    street: string | null;
  } | null;
};

function jsonHeaders() {
  return {
    "Cache-Control": "no-store",
    Pragma: "no-cache",
  };
}

function response(
  data: unknown,
  status = 200
) {
  return NextResponse.json(data, {
    status,
    headers: jsonHeaders(),
  });
}

function parsePositiveInteger(
  value: string | null,
  fallback: number,
  maximum: number
) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, maximum);
}

async function getAuthenticatedAccount() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return null;
  }

  return prisma.user.findUnique({
    where: {
      id: session.user.id,
    },
    select: {
      id: true,
      role: true,
    },
  });
}

function formatSeller(business: SellerRecord | null) {
  if (!business) return null;

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
    socialLinks.push({
      platform: "PHONE",
      handle: business.phone,
    });
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

const productSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  priceMin: true,
  priceMax: true,
  availability: true,
  imageUrl: true,
  category: {
    select: {
      id: true,
      name: true,
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
    select: businessSelect,
  },
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
  category: {
    select: {
      id: true,
      name: true,
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
    select: businessSelect,
  },
} satisfies Prisma.ServiceSelect;

/*
 * Explicit result types for saved products and services.
 * This prevents TypeScript from treating the combined
 * response as PRODUCT-only.
 */

type ProductPayload = Prisma.ProductGetPayload<{
  select: typeof productSelect;
}>;

type ServicePayload = Prisma.ServiceGetPayload<{
  select: typeof serviceSelect;
}>;

type SavedProductItem = {
  id: string;
  type: "PRODUCT";
  savedAt: Date;
  listing: Omit<ProductPayload, "business"> & {
    seller: ReturnType<typeof formatSeller>;
  };
};

type SavedServiceItem = {
  id: string;
  type: "SERVICE";
  savedAt: Date;
  listing: Omit<ServicePayload, "business"> & {
    seller: ReturnType<typeof formatSeller>;
  };
};

type SavedListingItem = SavedProductItem | SavedServiceItem;

/*
 * GET /api/saved
 *
 * Optional query parameters:
 * ?type=PRODUCT
 * ?type=SERVICE
 * ?page=1
 * ?limit=20
 */

export async function GET(request: NextRequest) {
  try {
    const account = await getAuthenticatedAccount();

    if (!account) {
      return response(
        { error: "You must be logged in to view saved listings." },
        401
      );
    }

    if (account.role !== "BUYER" && account.role !== "SELLER") {
      return response(
        { error: "Your account cannot access saved listings." },
        403
      );
    }

    const { searchParams } = new URL(request.url);

    const rawType = (
      searchParams.get("type") || ""
    ).trim().toUpperCase();

    if (
      rawType &&
      rawType !== "PRODUCT" &&
      rawType !== "SERVICE"
    ) {
      return response(
        { error: "Type must be PRODUCT or SERVICE." },
        400
      );
    }

    const type = rawType as ListingType | "";

    const page = parsePositiveInteger(
      searchParams.get("page"),
      1,
      100000
    );

    const limit = parsePositiveInteger(
      searchParams.get("limit"),
      20,
      50
    );

    const where: Prisma.SavedListingWhereInput = {
      userId: account.id,

      ...(type === "PRODUCT"
        ? {
            product: {
              is: activeProductWhere,
            },
          }
        : type === "SERVICE"
        ? {
            service: {
              is: activeServiceWhere,
            },
          }
        : {
            OR: [
              {
                product: {
                  is: activeProductWhere,
                },
              },
              {
                service: {
                  is: activeServiceWhere,
                },
              },
            ],
          }),
    };

    const total = await prisma.savedListing.count({
      where,
    });

    const totalPages = Math.ceil(total / limit);

    const safePage =
      totalPages > 0
        ? Math.min(page, totalPages)
        : 1;

    const savedListings = await prisma.savedListing.findMany({
      where,
      orderBy: [
        { createdAt: "desc" },
        { id: "desc" },
      ],
      skip: (safePage - 1) * limit,
      take: limit,
      select: {
        id: true,
        createdAt: true,
        product: {
          select: productSelect,
        },
        service: {
          select: serviceSelect,
        },
      },
    });

    // Both PRODUCT and SERVICE records can now be returned
    // safely through one explicitly typed result array.
    const items = savedListings.flatMap<SavedListingItem>(
      (saved): SavedListingItem[] => {
        if (saved.product) {
          const { business, ...product } = saved.product;

          return [
            {
              id: saved.id,
              type: "PRODUCT",
              savedAt: saved.createdAt,
              listing: {
                ...product,
                seller: formatSeller(business),
              },
            },
          ];
        }

        if (saved.service) {
          const { business, ...service } = saved.service;

          return [
            {
              id: saved.id,
              type: "SERVICE",
              savedAt: saved.createdAt,
              listing: {
                ...service,
                seller: formatSeller(business),
              },
            },
          ];
        }

        return [];
      }
    );

    return response({
      items,
      pagination: {
        page: safePage,
        limit,
        total,
        totalPages,
        hasNextPage: safePage < totalPages,
        hasPreviousPage: safePage > 1,
      },
    });
  } catch (error) {
    console.error("Saved listings GET error:", error);

    return response(
      { error: "Unable to load saved listings." },
      500
    );
  }
}

/*
 * POST /api/saved
 *
 * Request body:
 * {
 *   "type": "PRODUCT",
 *   "listingId": "product_id"
 * }
 *
 * Or:
 * {
 *   "type": "SERVICE",
 *   "listingId": "service_id"
 * }
 */

export async function POST(request: NextRequest) {
  try {
    const account = await getAuthenticatedAccount();

    if (!account) {
      return response(
        { error: "You must be logged in to save listings." },
        401
      );
    }

    if (account.role !== "BUYER" && account.role !== "SELLER") {
      return response(
        { error: "Your account cannot save listings." },
        403
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return response(
        { error: "Invalid JSON request body." },
        400
      );
    }

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return response(
        { error: "Invalid request body." },
        400
      );
    }

    const data = body as {
      type?: unknown;
      listingId?: unknown;
    };

    const type =
      typeof data.type === "string"
        ? data.type.trim().toUpperCase()
        : "";

    const listingId =
      typeof data.listingId === "string"
        ? data.listingId.trim()
        : "";

    if (
      (type !== "PRODUCT" && type !== "SERVICE") ||
      !listingId
    ) {
      return response(
        {
          error: "A valid type and listingId are required.",
        },
        400
      );
    }

    const listingType = type as ListingType;

    let listingExists = false;

    if (listingType === "PRODUCT") {
      const product = await prisma.product.findFirst({
        where: {
          id: listingId,
          ...activeProductWhere,
        },
        select: {
          id: true,
        },
      });

      listingExists = Boolean(product);
    } else {
      const service = await prisma.service.findFirst({
        where: {
          id: listingId,
          ...activeServiceWhere,
        },
        select: {
          id: true,
        },
      });

      listingExists = Boolean(service);
    }

    if (!listingExists) {
      return response(
        { error: "Listing not found or unavailable." },
        404
      );
    }

    const existingWhere =
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

    const existing = await prisma.savedListing.findUnique({
      where: existingWhere,
      select: {
        id: true,
        productId: true,
        serviceId: true,
        createdAt: true,
      },
    });

    if (existing) {
      return response({
        message: "Listing is already saved.",
        saved: true,
        alreadySaved: true,
        item: existing,
      });
    }

    try {
      const saved = await prisma.savedListing.create({
        data:
          listingType === "PRODUCT"
            ? {
                userId: account.id,
                productId: listingId,
              }
            : {
                userId: account.id,
                serviceId: listingId,
              },
        select: {
          id: true,
          productId: true,
          serviceId: true,
          createdAt: true,
        },
      });

      return response(
        {
          message: "Listing saved successfully.",
          saved: true,
          alreadySaved: false,
          item: saved,
        },
        201
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existingAfterConflict =
          await prisma.savedListing.findUnique({
            where: existingWhere,
            select: {
              id: true,
              productId: true,
              serviceId: true,
              createdAt: true,
            },
          });

        if (existingAfterConflict) {
          return response({
            message: "Listing is already saved.",
            saved: true,
            alreadySaved: true,
            item: existingAfterConflict,
          });
        }
      }

      throw error;
    }
  } catch (error) {
    console.error("Saved listings POST error:", error);

    return response(
      { error: "Unable to save listing." },
      500
    );
  }
}
