import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSeller } from "@/lib/seller-auth";

const MAX_ACTIVE_PRODUCTS = 10;

const ALLOWED_AVAILABILITY = [
  "AVAILABLE",
  "ASK_SELLER",
  "UNAVAILABLE",
] as const;

type Availability =
  (typeof ALLOWED_AVAILABILITY)[number];

type ParsedProductImage = {
  url: string;
  publicId: string | null;
  sortOrder: number;
};

function jsonHeaders() {
  return {
    "Cache-Control": "no-store",
  };
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function cleanString(
  value: unknown
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function parseOptionalInteger(
  value: unknown
): {
  valid: boolean;
  value: number | null;
} {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return {
      valid: true,
      value: null,
    };
  }

  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    !Number.isFinite(parsed) ||
    !Number.isInteger(parsed)
  ) {
    return {
      valid: false,
      value: null,
    };
  }

  return {
    valid: true,
    value: parsed,
  };
}

function parseKeywords(
  value: unknown
): {
  valid: boolean;
  value: string[];
} {
  if (value === undefined) {
    return {
      valid: true,
      value: [],
    };
  }

  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : null;

  if (!values) {
    return {
      valid: false,
      value: [],
    };
  }

  const normalized: string[] = [];

  for (
    const item of values
  ) {
    if (
      typeof item !==
      "string"
    ) {
      return {
        valid: false,
        value: [],
      };
    }

    const cleaned =
      item.trim();

    if (!cleaned) {
      continue;
    }

    if (
      !normalized.includes(
        cleaned
      )
    ) {
      normalized.push(
        cleaned
      );
    }
  }

  return {
    valid: true,
    value: normalized,
  };
}

function isAvailability(
  value: string
): value is Availability {
  return ALLOWED_AVAILABILITY.includes(
    value as Availability
  );
}

/*
 * --------------------------------------------------
 * PRODUCT IMAGES
 * --------------------------------------------------
 *
 * New image payload:
 *
 * images: [
 *   {
 *     url: "...",
 *     publicId: "...",
 *     sortOrder: 0
 *   }
 * ]
 *
 * `url` is the uploaded image URL returned by
 * the existing image-upload system.
 *
 * ProductImage is the primary image record.
 *
 * Product.imageUrl is only maintained as a
 * compatibility mirror of the first image.
 *
 * We intentionally do NOT require `imageUrl`
 * for new product creation.
 * --------------------------------------------------
 */

function parseProductImages(
  value: unknown
): {
  valid: boolean;
  value: ParsedProductImage[];
} {
  if (
    value === undefined
  ) {
    return {
      valid: true,
      value: [],
    };
  }

  if (
    !Array.isArray(value)
  ) {
    return {
      valid: false,
      value: [],
    };
  }

  const images:
    ParsedProductImage[] = [];

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    const item =
      value[index];

    /*
     * Also accept a plain string as a
     * backwards-compatible image entry.
     *
     * The new Seller UI will use the object
     * form produced by the upload workflow.
     */
    if (
      typeof item ===
      "string"
    ) {
      const url =
        item.trim();

      if (!url) {
        continue;
      }

      if (
        url.length >
        2000
      ) {
        return {
          valid: false,
          value: [],
        };
      }

      images.push({
        url,
        publicId: null,
        sortOrder:
          index,
      });

      continue;
    }

    if (
      !isRecord(item)
    ) {
      return {
        valid: false,
        value: [],
      };
    }

    const url =
      cleanString(
        item.url
      );

    if (!url) {
      continue;
    }

    if (
      url.length >
      2000
    ) {
      return {
        valid: false,
        value: [],
      };
    }

    let publicId:
      string | null = null;

    if (
      item.publicId !==
      undefined &&
      item.publicId !==
      null
    ) {
      if (
        typeof item.publicId !==
        "string"
      ) {
        return {
          valid: false,
          value: [],
        };
      }

      publicId =
        item.publicId.trim() ||
        null;
    }

    let sortOrder =
      index;

    if (
      item.sortOrder !==
        undefined &&
      item.sortOrder !==
        null &&
      item.sortOrder !==
        ""
    ) {
      const parsedSortOrder =
        parseOptionalInteger(
          item.sortOrder
        );

      if (
        !parsedSortOrder.valid ||
        parsedSortOrder.value ===
          null ||
        parsedSortOrder.value <
          0
      ) {
        return {
          valid: false,
          value: [],
        };
      }

      sortOrder =
        parsedSortOrder.value;
    }

    images.push({
      url,
      publicId,
      sortOrder,
    });
  }

  /*
   * Normalize ordering after parsing.
   *
   * The database then receives stable,
   * predictable sortOrder values.
   */
  images.sort(
    (a, b) =>
      a.sortOrder -
      b.sortOrder
  );

  return {
    valid: true,
    value: images.map(
      (
        image,
        index
      ) => ({
        ...image,
        sortOrder:
          index,
      })
    ),
  };
}

function getCompatibilityImageUrl(
  images: ParsedProductImage[]
): string | null {
  return (
    images[0]?.url ??
    null
  );
}

class ActiveProductLimitError extends Error {
  constructor() {
    super(
      `You have reached the maximum of ${MAX_ACTIVE_PRODUCTS} active products.`
    );

    this.name =
      "ActiveProductLimitError";
  }
}

async function createProductWithLimit(
  businessId: string,
  data: Prisma.ProductCreateInput
) {
  const MAX_RETRIES = 3;

  for (
    let attempt = 0;
    attempt < MAX_RETRIES;
    attempt += 1
  ) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const activeCount =
            await tx.product.count({
              where: {
                businessId,
                status: "ACTIVE",
                deletedAt: null,
              },
            });

          if (
            activeCount >=
            MAX_ACTIVE_PRODUCTS
          ) {
            throw new ActiveProductLimitError();
          }

          return tx.product.create({
            data,
            include: {
              category: true,

              images: {
                orderBy: {
                  sortOrder:
                    "asc",
                },
              },
            },
          });
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        }
      );
    } catch (error) {
      if (
        error instanceof
        ActiveProductLimitError
      ) {
        throw error;
      }

      if (
        error instanceof
          Prisma.PrismaClientKnownRequestError &&
        error.code ===
          "P2034"
      ) {
        if (
          attempt ===
          MAX_RETRIES - 1
        ) {
          throw new Error(
            "The product could not be created safely. Please try again."
          );
        }

        continue;
      }

      throw error;
    }
  }

  throw new Error(
    "Unable to create product."
  );
}

/* --------------------------------------------------
 * GET
 *
 * Returns products owned by the authenticated seller.
 * -------------------------------------------------- */

export async function GET() {
  const auth =
    await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const business =
      await prisma.business.findUnique({
        where: {
          ownerId:
            auth.user.id,
        },

        select: {
          id: true,
          name: true,
          deletedAt: true,
        },
      });

    if (!business) {
      return NextResponse.json(
        {
          error:
            "You do not have a business linked to this seller account.",
        },
        {
          status: 404,
          headers:
            jsonHeaders(),
        }
      );
    }

    if (
      business.deletedAt
    ) {
      return NextResponse.json(
        {
          error:
            "This business has been deleted.",
        },
        {
          status: 410,
          headers:
            jsonHeaders(),
        }
      );
    }

    const [
      products,
      activeCount,
    ] = await Promise.all([
      prisma.product.findMany({
        where: {
          businessId:
            business.id,

          deletedAt:
            null,
        },

        orderBy: {
          updatedAt:
            "desc",
        },

        include: {
          category: true,

          /*
           * ProductImage is the primary image
           * source for seller products.
           */
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
      }),

      prisma.product.count({
        where: {
          businessId:
            business.id,

          status: "ACTIVE",

          deletedAt:
            null,
        },
      }),
    ]);

    return NextResponse.json(
      {
        business: {
          id:
            business.id,

          name:
            business.name,
        },

        products,

        total:
          products.length,

        activeCount,

        maxActiveProducts:
          MAX_ACTIVE_PRODUCTS,

        remainingSlots:
          Math.max(
            0,
            MAX_ACTIVE_PRODUCTS -
              activeCount
          ),
      },
      {
        headers:
          jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Seller products GET error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load your products.",
      },
      {
        status: 500,
        headers:
          jsonHeaders(),
      }
    );
  }
}

/* --------------------------------------------------
 * POST
 *
 * Creates an active product for the seller's business.
 * Seller cannot choose status.
 *
 * Images are supplied through ProductImage records.
 * -------------------------------------------------- */

export async function POST(
  request: Request
) {
  const auth =
    await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const body: unknown =
      await request.json();

    if (!isRecord(body)) {
      return NextResponse.json(
        {
          error:
            "Invalid request body.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
        }
      );
    }

    const name =
      cleanString(
        body.name
      );

    const description =
      cleanString(
        body.description
      );

    const categoryId =
      cleanString(
        body.categoryId
      );

    const availabilityValue =
      cleanString(
        body.availability
      );

    const keywordsResult =
      parseKeywords(
        body.keywords
      );

    const priceResult =
      parseOptionalInteger(
        body.price
      );

    const priceMinResult =
      parseOptionalInteger(
        body.priceMin
      );

    const priceMaxResult =
      parseOptionalInteger(
        body.priceMax
      );

    /*
     * Primary image input.
     */
    const imagesResult =
      parseProductImages(
        body.images
      );

    /*
     * Existing callers may still send
     * imageUrl. We convert that one image
     * into a ProductImage when no new image
     * array was supplied.
     */
    const legacyImageUrl =
      cleanString(
        body.imageUrl
      );

    if (
      legacyImageUrl.length >
      2000
    ) {
      return NextResponse.json(
        {
          error:
            "Legacy image URL is too long.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
        }
      );
    }

    if (!imagesResult.valid) {
      return NextResponse.json(
        {
          error:
            "Images must be an array of uploaded image records.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
        }
      );
    }

    let images =
      imagesResult.value;

    /*
     * Backward compatibility only:
     *
     * If the new `images` field was not supplied
     * and an older caller still supplied
     * `imageUrl`, convert it into ProductImage.
     *
     * The new Seller UI will never need to
     * submit imageUrl.
     */
    if (
      body.images ===
        undefined &&
      !images.length &&
      legacyImageUrl
    ) {
      images = [
        {
          url:
            legacyImageUrl,

          publicId:
            null,

          sortOrder:
            0,
        },
      ];
    }

    if (!name) {
      return NextResponse.json(
        {
          error:
            "Product name is required.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
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
            "Product name is too long.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
        }
      );
    }

    if (
      description.length >
      2000
    ) {
      return NextResponse.json(
        {
          error:
            "Product description is too long.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
        }
      );
    }

    if (
      !keywordsResult.valid
    ) {
      return NextResponse.json(
        {
          error:
            "Keywords must be an array of strings or a comma-separated string.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
        }
      );
    }

    if (
      !priceResult.valid ||
      !priceMinResult.valid ||
      !priceMaxResult.valid
    ) {
      return NextResponse.json(
        {
          error:
            "Prices must be valid whole numbers.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
        }
      );
    }

    const price =
      priceResult.value;

    const priceMin =
      priceMinResult.value;

    const priceMax =
      priceMaxResult.value;

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
          headers:
            jsonHeaders(),
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
          headers:
            jsonHeaders(),
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
          headers:
            jsonHeaders(),
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
          headers:
            jsonHeaders(),
        }
      );
    }

    if (
      availabilityValue &&
      !isAvailability(
        availabilityValue
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid availability value.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * SELLER BUSINESS
     * -----------------------------------------
     */

    const business =
      await prisma.business.findUnique({
        where: {
          ownerId:
            auth.user.id,
        },

        select: {
          id: true,
          deletedAt: true,
        },
      });

    if (!business) {
      return NextResponse.json(
        {
          error:
            "You do not have a business linked to this seller account.",
        },
        {
          status: 404,
          headers:
            jsonHeaders(),
        }
      );
    }

    if (
      business.deletedAt
    ) {
      return NextResponse.json(
        {
          error:
            "This business has been deleted.",
        },
        {
          status: 410,
          headers:
            jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * CATEGORY
     * -----------------------------------------
     */

    let validatedCategoryId:
      | string
      | null = null;

    if (categoryId) {
      const category =
        await prisma.category.findFirst({
          where: {
            id:
              categoryId,

            isActive:
              true,
          },

          select: {
            id: true,
          },
        });

      if (!category) {
        return NextResponse.json(
          {
            error:
              "Selected category was not found or is inactive.",
          },
          {
            status: 400,
            headers:
              jsonHeaders(),
          }
        );
      }

      validatedCategoryId =
        category.id;
    }

    /*
     * -----------------------------------------
     * CREATE DATA
     * -----------------------------------------
     *
     * ProductImage is the actual image
     * relationship.
     *
     * imageUrl is only mirrored to the first
     * image for compatibility with existing
     * code that still reads Product.imageUrl.
     */

    const compatibilityImageUrl =
      getCompatibilityImageUrl(
        images
      );

    const product =
      await createProductWithLimit(
        business.id,
        {
          business: {
            connect: {
              id:
                business.id,
            },
          },

          name,

          description:
            description ||
            null,

          category:
            validatedCategoryId
              ? {
                  connect: {
                    id:
                      validatedCategoryId,
                  },
                }
              : undefined,

          price,

          priceMin,

          priceMax,

          availability:
            (availabilityValue ||
              "ASK_SELLER") as Availability,

          keywords:
            keywordsResult.value,

          /*
           * Compatibility mirror only.
           */
          imageUrl:
            compatibilityImageUrl,

          images:
            images.length >
            0
              ? {
                  create:
                    images.map(
                      (
                        image
                      ) => ({
                        url:
                          image.url,

                        publicId:
                          image.publicId,

                        sortOrder:
                          image.sortOrder,
                      })
                    ),
                }
              : undefined,

          status:
            "ACTIVE",
        }
      );

    const activeCount =
      await prisma.product.count({
        where: {
          businessId:
            business.id,

          status:
            "ACTIVE",

          deletedAt:
            null,
        },
      });

    return NextResponse.json(
      {
        message:
          "Product created successfully.",

        product,

        activeCount,

        maxActiveProducts:
          MAX_ACTIVE_PRODUCTS,

        remainingSlots:
          Math.max(
            0,
            MAX_ACTIVE_PRODUCTS -
              activeCount
          ),
      },
      {
        status: 201,
        headers:
          jsonHeaders(),
      }
    );
  } catch (error) {
    if (
      error instanceof
      ActiveProductLimitError
    ) {
      return NextResponse.json(
        {
          error:
            error.message,

          code:
            "ACTIVE_PRODUCT_LIMIT",

          maxActiveProducts:
            MAX_ACTIVE_PRODUCTS,
        },
        {
          status: 409,
          headers:
            jsonHeaders(),
        }
      );
    }

    console.error(
      "Seller products POST error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to create product.",
      },
      {
        status: 500,
        headers:
          jsonHeaders(),
      }
    );
  }
}