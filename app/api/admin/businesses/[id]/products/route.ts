import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import {
  Availability,
  BusinessStatus,
} from "@prisma/client";

function isAvailability(
  value: unknown
): value is Availability {
  return (
    value === Availability.AVAILABLE ||
    value ===
      Availability.ASK_SELLER ||
    value ===
      Availability.UNAVAILABLE
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
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const parsed =
    Number(value);

  if (
    !Number.isFinite(parsed)
  ) {
    return null;
  }

  return Math.floor(parsed);
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
        typeof item ===
        "string"
    )
    .map((item) =>
      item.trim()
    )
    .filter(Boolean);
}

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    await requireAdmin();

    const { id: businessId } =
      await params;

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
  try {
    await requireAdmin();

    const { id: businessId } =
      await params;

    const body =
      await request.json();

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
      Array.isArray(body.images)
        ? body.images
            .filter(
              (
                value
              ): value is string =>
                typeof value ===
                "string"
            )
            .map((value) =>
              value.trim()
            )
            .filter(Boolean)
        : [];

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
              imageUrls.length
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