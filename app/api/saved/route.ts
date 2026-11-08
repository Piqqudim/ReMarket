import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

type ListingType = "PRODUCT" | "SERVICE";

function jsonHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  };
}

function apiResponse(
  data: unknown,
  status = 200,
) {
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

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, maximum);
}

// ---------------------------------------------------------
// AUTHENTICATED ACCOUNT
// ---------------------------------------------------------

async function getAuthenticatedAccount() {
  const session = await getServerSession(authOptions);

  const userId = session?.user?.id;

  if (!userId) {
    return null;
  }

  return prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      role: true,
    },
  });
}

function canUseSavedListings(
  role: string,
): boolean {
  return role === "BUYER" || role === "SELLER";
}

// ---------------------------------------------------------
// ACTIVE LISTING FILTERS
// ---------------------------------------------------------

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

// ---------------------------------------------------------
// PRISMA SELECT DEFINITIONS
// ---------------------------------------------------------

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

// ---------------------------------------------------------
// EXPLICIT PRISMA RESULT TYPES
// ---------------------------------------------------------

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
  socialLinks: {
    platform: string;
    handle: string;
  }[];
};

type SavedProductItem = {
  id: string;
  type: "PRODUCT";
  savedAt: Date;

  listing: Omit<ProductPayload, "business"> & {
    seller: FormattedSeller;
  };
};

type SavedServiceItem = {
  id: string;
  type: "SERVICE";
  savedAt: Date;

  listing: Omit<ServicePayload, "business"> & {
    seller: FormattedSeller;
  };
};

type SavedListingItem =
  | SavedProductItem
  | SavedServiceItem;

// ---------------------------------------------------------
// FORMAT SELLER INFORMATION
// ---------------------------------------------------------

function formatSeller(
  business: BusinessPayload,
): FormattedSeller {
  const socialLinks: {
    platform: string;
    handle: string;
  }[] = business.showContactInfo
    ? business.socialLinks.map((link) => ({
        platform: link.platform,
        handle: link.handle,
      }))
    : [];

  // Include phone only when the seller allows
  // contact information to be displayed.

  if (
    business.showContactInfo &&
    business.phone &&
    !socialLinks.some(
      (link) => link.platform === "PHONE",
    )
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

// ---------------------------------------------------------
// GET /api/saved
//
// Query parameters:
//
// ?type=PRODUCT
// ?type=SERVICE
// ?page=1
// ?limit=20
//
// Returns:
//
// {
//   items: [
//     {
//       id,
//       type,
//       savedAt,
//       listing: {
//         id,
//         name,
//         seller: {}
//       }
//     }
//   ],
//   pagination: {}
// }
// ---------------------------------------------------------

export async function GET(
  request: NextRequest,
) {
  try {
    // Authenticate user.

    const account = await getAuthenticatedAccount();

    if (!account) {
      return apiResponse(
        {
          error: "You must be logged in to view saved listings.",
        },
        401,
      );
    }

    if (!canUseSavedListings(account.role)) {
      return apiResponse(
        {
          error: "Your account cannot access saved listings.",
        },
        403,
      );
    }

    // Read query parameters.

    const { searchParams } = new URL(request.url);

    const rawType = (
      searchParams.get("type") || ""
    )
      .trim()
      .toUpperCase();

    if (
      rawType &&
      rawType !== "PRODUCT" &&
      rawType !== "SERVICE"
    ) {
      return apiResponse(
        {
          error: "Type must be PRODUCT or SERVICE.",
        },
        400,
      );
    }

    const type: ListingType | null =
      rawType === "PRODUCT"
        ? "PRODUCT"
        : rawType === "SERVICE"
          ? "SERVICE"
          : null;

    const page = parsePositiveInteger(
      searchParams.get("page"),
      1,
      100000,
    );

    const limit = parsePositiveInteger(
      searchParams.get("limit"),
      20,
      50,
    );

    // Build the database filter.

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

    // Get total saved count.

    const total = await prisma.savedListing.count({
      where,
    });

    const totalPages = Math.ceil(total / limit);

    const safePage =
      totalPages > 0
        ? Math.min(page, totalPages)
        : 1;

    // Load saved listings.

    const savedListings =
      await prisma.savedListing.findMany({
        where,

        orderBy: [
          {
            createdAt: "desc",
          },
          {
            id: "desc",
          },
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

    // Format PRODUCT and SERVICE records into
    // one consistently typed response.

    const items = savedListings.flatMap<SavedListingItem>(
      (saved): SavedListingItem[] => {
        // PRODUCT

        if (saved.product) {
          const {
            business,
            ...product
          } = saved.product;

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

        // SERVICE

        if (saved.service) {
          const {
            business,
            ...service
          } = saved.service;

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

        // Ignore invalid orphaned SavedListing records.

        return [];
      },
    );

    // Return response.

    return apiResponse({
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
    console.error(
      "Saved listings GET error:",
      error,
    );

    return apiResponse(
      {
        error: "Unable to load saved listings.",
      },
      500,
    );
  }
}

// ---------------------------------------------------------
// POST /api/saved
//
// Save a product:
//
// {
//   "type": "PRODUCT",
//   "listingId": "product_id"
// }
//
// Save a service:
//
// {
//   "type": "SERVICE",
//   "listingId": "service_id"
// }
// ---------------------------------------------------------

export async function POST(
  request: NextRequest,
) {
  try {
    // Authenticate user.

    const account = await getAuthenticatedAccount();

    if (!account) {
      return apiResponse(
        {
          error: "You must be logged in to save listings.",
        },
        401,
      );
    }

    if (!canUseSavedListings(account.role)) {
      return apiResponse(
        {
          error: "Your account cannot save listings.",
        },
        403,
      );
    }

    // Parse request body.

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return apiResponse(
        {
          error: "Invalid JSON request body.",
        },
        400,
      );
    }

    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body)
    ) {
      return apiResponse(
        {
          error: "Invalid request body.",
        },
        400,
      );
    }

    const data = body as {
      type?: unknown;
      listingId?: unknown;
    };

    const rawType =
      typeof data.type === "string"
        ? data.type.trim().toUpperCase()
        : "";

    const listingId =
      typeof data.listingId === "string"
        ? data.listingId.trim()
        : "";

    if (
      (rawType !== "PRODUCT" &&
        rawType !== "SERVICE") ||
      !listingId
    ) {
      return apiResponse(
        {
          error: "A valid type and listingId are required.",
        },
        400,
      );
    }

    // TypeScript now knows this is a valid ListingType.

    const listingType: ListingType = rawType;

    // Confirm that the listing exists and is active.

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

      listingExists = product !== null;
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

      listingExists = service !== null;
    }

    if (!listingExists) {
      return apiResponse(
        {
          error: "Listing not found or unavailable.",
        },
        404,
      );
    }

    // Prepare the correct compound unique key.
    //
    // These keys correspond to:
    // @@unique([userId, productId])
    // @@unique([userId, serviceId])

    const existingWhere: Prisma.SavedListingWhereUniqueInput =
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

    const savedSelect = {
      id: true,
      productId: true,
      serviceId: true,
      createdAt: true,
    } satisfies Prisma.SavedListingSelect;

    // Check whether this listing is already saved.

    const existing =
      await prisma.savedListing.findUnique({
        where: existingWhere,
        select: savedSelect,
      });

    if (existing) {
      return apiResponse({
        message: "Listing is already saved.",
        saved: true,
        alreadySaved: true,
        item: existing,
      });
    }

    // Create the saved listing.

    try {
      const saved =
        await prisma.savedListing.create({
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

          select: savedSelect,
        });

      return apiResponse(
        {
          message: "Listing saved successfully.",
          saved: true,
          alreadySaved: false,
          item: saved,
        },
        201,
      );
    } catch (error) {
      // Handle simultaneous save requests.
      // The compound unique constraint prevents duplicates.

      if (
        error instanceof
          Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existingAfterConflict =
          await prisma.savedListing.findUnique({
            where: existingWhere,
            select: savedSelect,
          });

        if (existingAfterConflict) {
          return apiResponse({
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
    console.error(
      "Saved listings POST error:",
      error,
    );

    return apiResponse(
      {
        error: "Unable to save listing.",
      },
      500,
    );
  }
}