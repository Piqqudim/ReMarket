import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  Availability,
  BusinessStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

function isAvailability(
  value: unknown
): value is Availability {
  return (
    value === Availability.AVAILABLE ||
    value === Availability.ASK_SELLER ||
    value === Availability.UNAVAILABLE
  );
}

function isBusinessStatus(
  value: unknown
): value is BusinessStatus {
  return (
    value === BusinessStatus.ACTIVE ||
    value === BusinessStatus.INACTIVE ||
    value === BusinessStatus.PENDING
  );
}

function parseOptionalInt(
  value: unknown
): number | null | undefined {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;

  if (!Number.isInteger(parsed)) {
    return undefined;
  }

  return parsed;
}

function parseKeywords(
  value: unknown
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is string =>
        typeof item === "string"
    )
    .map((item) =>
      item.trim()
    )
    .filter(Boolean);
}

function parseImageUrls(
  value: unknown
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is string =>
        typeof item === "string"
    )
    .map((item) =>
      item.trim()
    )
    .filter(Boolean);
}

export async function GET(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const auth =
    await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id: businessId } =
    await params;

  if (!businessId) {
    return NextResponse.json(
      {
        error:
          "Business ID is required.",
      },
      {
        status: 400,
      }
    );
  }

  try {
    const business =
      await prisma.business.findUnique(
        {
          where: {
            id: businessId,
          },
          select: {
            id: true,
          },
        }
      );

    if (!business) {
      return NextResponse.json(
        {
          error:
            "Business not found.",
        },
        {
          status: 404,
        }
      );
    }

    const products =
      await prisma.product.findMany(
        {
          where: {
            businessId,
          },

          include: {
            category: true,

            images: {
              orderBy: [
                {
                  sortOrder:
                    "asc",
                },
                {
                  createdAt:
                    "asc",
                },
              ],
            },
          },

          orderBy: {
            updatedAt:
              "desc",
          },
        }
      );

    return NextResponse.json({
      products,
    });
  } catch (error) {
    console.error(
      "Admin products GET error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load products.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function POST(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const auth =
    await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id: businessId } =
    await params;

  if (!businessId) {
    return NextResponse.json(
      {
        error:
          "Business ID is required.",
      },
      {
        status: 400,
      }
    );
  }

  try {
    const rawBody: unknown =
      await request.json();

    if (
      !rawBody ||
      typeof rawBody !== "object" ||
      Array.isArray(rawBody)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid request body.",
        },
        {
          status: 400,
        }
      );
    }

    const body =
      rawBody as Record<
        string,
        unknown
      >;

    const name =
      typeof body.name ===
      "string"
        ? body.name.trim()
        : "";

    if (!name) {
      return NextResponse.json(
        {
          error:
            "Product name is required.",
        },
        {
          status: 400,
        }
      );
    }

    const business =
      await prisma.business.findUnique(
        {
          where: {
            id: businessId,
          },
          select: {
            id: true,
            deletedAt: true,
          },
        }
      );

    if (!business) {
      return NextResponse.json(
        {
          error:
            "Business not found.",
        },
        {
          status: 404,
        }
      );
    }

    if (business.deletedAt) {
      return NextResponse.json(
        {
          error:
            "This business has been deleted and cannot receive new products.",
        },
        {
          status: 409,
        }
      );
    }

    const categoryId =
      typeof body.categoryId ===
        "string" &&
      body.categoryId.trim()
        ? body.categoryId.trim()
        : null;

    if (categoryId) {
      const category =
        await prisma.category.findUnique(
          {
            where: {
              id: categoryId,
            },
            select: {
              id: true,
            },
          }
        );

      if (!category) {
        return NextResponse.json(
          {
            error:
              "Category not found.",
          },
          {
            status: 400,
          }
        );
      }
    }

    const price =
      parseOptionalInt(
        body.price
      );

    const priceMin =
      parseOptionalInt(
        body.priceMin
      );

    const priceMax =
      parseOptionalInt(
        body.priceMax
      );

    if (price === undefined) {
      return NextResponse.json(
        {
          error:
            "Price must be a valid integer.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      priceMin === undefined
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

    if (
      priceMax === undefined
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
      price !== null &&
      price < 0
    ) {
      return NextResponse.json(
        {
          error:
            "Price cannot be negative.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      priceMin !== null &&
      priceMin < 0
    ) {
      return NextResponse.json(
        {
          error:
            "Minimum price cannot be negative.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      priceMax !== null &&
      priceMax < 0
    ) {
      return NextResponse.json(
        {
          error:
            "Maximum price cannot be negative.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      priceMin !== null &&
      priceMax !== null &&
      priceMin > priceMax
    ) {
      return NextResponse.json(
        {
          error:
            "Minimum price cannot exceed maximum price.",
        },
        {
          status: 400,
        }
      );
    }

    const availability =
      isAvailability(
        body.availability
      )
        ? body.availability
        : Availability.ASK_SELLER;

    const status =
      isBusinessStatus(
        body.status
      )
        ? body.status
        : BusinessStatus.ACTIVE;

    const description =
      typeof body.description ===
      "string"
        ? body.description.trim() ||
          null
        : null;

    const keywords =
      parseKeywords(
        body.keywords
      );

    const requestedImages =
      parseImageUrls(
        body.images
      );

    const legacyImageUrl =
      typeof body.imageUrl ===
        "string" &&
      body.imageUrl.trim()
        ? body.imageUrl.trim()
        : null;

    const imageUrls =
      requestedImages.length >
      0
        ? requestedImages
        : legacyImageUrl
          ? [legacyImageUrl]
          : [];

    const product =
      await prisma.product.create(
        {
          data: {
            businessId,

            name,

            description,

            categoryId,

            price,

            priceMin,

            priceMax,

            availability,

            keywords,

            status,

            imageUrl:
              imageUrls[0] ??
              null,

            images:
              imageUrls.length > 0
                ? {
                    create:
                      imageUrls.map(
                        (
                          url,
                          index
                        ) => ({
                          url,
                          sortOrder:
                            index,
                        })
                      ),
                  }
                : undefined,
          },

          include: {
            category: true,

            images: {
              orderBy: [
                {
                  sortOrder:
                    "asc",
                },
                {
                  createdAt:
                    "asc",
                },
              ],
            },
          },
        }
      );

    return NextResponse.json(
      {
        product,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Admin products POST error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to create product.",
      },
      {
        status: 500,
      }
    );
  }
}