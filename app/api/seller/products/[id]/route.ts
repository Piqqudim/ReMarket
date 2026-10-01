import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSeller } from "@/lib/seller-auth";

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

function hasOwn(
  payload: Record<string, unknown>,
  key: string
): boolean {
  return Object.prototype.hasOwnProperty.call(
    payload,
    key
  );
}

function isAvailability(
  value: string
): value is Availability {
  return ALLOWED_AVAILABILITY.includes(
    value as Availability
  );
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

  const keywords: string[] = [];

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
      !keywords.includes(
        cleaned
      )
    ) {
      keywords.push(
        cleaned
      );
    }
  }

  return {
    valid: true,
    value: keywords,
  };
}

/*
 * --------------------------------------------------
 * PRODUCT IMAGES
 * --------------------------------------------------
 *
 * New image contract:
 *
 * images: [
 *   {
 *     url: string,
 *     publicId?: string | null,
 *     sortOrder?: number
 *   }
 * ]
 *
 * ProductImage is the primary image
 * storage relationship.
 *
 * Product.imageUrl is maintained only as
 * a compatibility mirror of the first image.
 * --------------------------------------------------
 */

function parseProductImages(
  value: unknown
): {
  valid: boolean;
  value: ParsedProductImage[];
} {
  if (
    !Array.isArray(value)
  ) {
    return {
      valid: false,
      value: [],
    };
  }

  const images: ParsedProductImage[] = [];

  for (
    let index = 0;
    index < value.length;
    index += 1
  ) {
    const item =
      value[index];

    /*
     * Backward compatibility:
     *
     * A plain URL string is accepted so
     * older callers do not immediately break.
     *
     * The new Seller UI should send objects.
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

        publicId:
          null,

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

    /*
     * An empty image entry is ignored.
     *
     * The entire array can still be emptied
     * explicitly by sending images: [].
     */
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
      string | null =
      null;

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
        parsedSortOrder.value < 0
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
   * Normalize sort order into a predictable
   * zero-based sequence.
   */
  images.sort(
    (a, b) =>
      a.sortOrder -
      b.sortOrder
  );

  const normalized =
    images.map(
      (
        image,
        index
      ) => ({
        ...image,

        sortOrder:
          index,
      })
    );

  /*
   * Prevent the same image URL from being
   * stored multiple times in one product update.
   */
  const seenUrls =
    new Set<string>();

  const uniqueImages:
    ParsedProductImage[] =
    [];

  for (
    const image of
      normalized
  ) {
    if (
      seenUrls.has(
        image.url
      )
    ) {
      continue;
    }

    seenUrls.add(
      image.url
    );

    uniqueImages.push({
      ...image,

      sortOrder:
        uniqueImages.length,
    });
  }

  return {
    valid: true,
    value:
      uniqueImages,
  };
}

/*
 * Return the first uploaded image URL
 * for the compatibility Product.imageUrl
 * field.
 */
function getCompatibilityImageUrl(
  images: ParsedProductImage[]
): string | null {
  return (
    images[0]?.url ??
    null
  );
}

/*
 * --------------------------------------------------
 * SELLER PRODUCT LOOKUP
 * --------------------------------------------------
 *
 * Product ownership is enforced through the
 * seller-owned business relation.
 * --------------------------------------------------
 */

async function getSellerProduct(
  productId: string,
  sellerId: string
) {
  return prisma.product.findFirst({
    where: {
      id:
        productId,

      deletedAt:
        null,

      business: {
        ownerId:
          sellerId,

        deletedAt:
          null,
      },
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

      business: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });
}

/*
 * --------------------------------------------------
 * GET
 * --------------------------------------------------
 */

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const auth =
    await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id } =
      await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "Product ID is required.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
        }
      );
    }

    const product =
      await getSellerProduct(
        id,
        auth.user.id
      );

    if (!product) {
      return NextResponse.json(
        {
          error:
            "Product not found.",
        },
        {
          status: 404,
          headers:
            jsonHeaders(),
        }
      );
    }

    return NextResponse.json(
      {
        product,
      },
      {
        headers:
          jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Seller product GET error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load product.",
      },
      {
        status: 500,
        headers:
          jsonHeaders(),
      }
    );
  }
}

/*
 * --------------------------------------------------
 * PATCH
 * --------------------------------------------------
 *
 * Updates an existing seller product.
 *
 * Images:
 *
 * - images omitted:
 *     preserve existing ProductImage records
 *
 * - images: []:
 *     remove all ProductImage records
 *
 * - images: [ ... ]:
 *     replace the existing ProductImage records
 * --------------------------------------------------
 */

export async function PATCH(
  request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const auth =
    await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id } =
      await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "Product ID is required.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
        }
      );
    }

    const existing =
      await getSellerProduct(
        id,
        auth.user.id
      );

    if (!existing) {
      return NextResponse.json(
        {
          error:
            "Product not found.",
        },
        {
          status: 404,
          headers:
            jsonHeaders(),
        }
      );
    }

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

    if (
      Object.keys(body).length ===
      0
    ) {
      return NextResponse.json(
        {
          error:
            "No changes were supplied.",
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
     * BASIC UPDATE DATA
     * -----------------------------------------
     */

    const data: {
      name?: string;
      description?: string | null;
      categoryId?: string | null;
      imageUrl?: string | null;
      availability?: Availability;
      price?: number | null;
      priceMin?: number | null;
      priceMax?: number | null;
      keywords?: string[];
    } = {};

    /*
     * -----------------------------------------
     * NAME
     * -----------------------------------------
     */

    if (
      hasOwn(
        body,
        "name"
      )
    ) {
      const name =
        cleanString(
          body.name
        );

      if (!name) {
        return NextResponse.json(
          {
            error:
              "Product name cannot be empty.",
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

      data.name =
        name;
    }

    /*
     * -----------------------------------------
     * DESCRIPTION
     * -----------------------------------------
     */

    if (
      hasOwn(
        body,
        "description"
      )
    ) {
      const description =
        cleanString(
          body.description
        );

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

      data.description =
        description ||
        null;
    }

    /*
     * -----------------------------------------
     * AVAILABILITY
     * -----------------------------------------
     */

    if (
      hasOwn(
        body,
        "availability"
      )
    ) {
      const availability =
        cleanString(
          body.availability
        );

      if (
        !isAvailability(
          availability
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

      data.availability =
        availability;
    }

    /*
     * -----------------------------------------
     * KEYWORDS
     * -----------------------------------------
     */

    if (
      hasOwn(
        body,
        "keywords"
      )
    ) {
      const keywordsResult =
        parseKeywords(
          body.keywords
        );

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

      data.keywords =
        keywordsResult.value;
    }

    /*
     * -----------------------------------------
     * CATEGORY
     * -----------------------------------------
     */

    if (
      hasOwn(
        body,
        "categoryId"
      )
    ) {
      if (
        body.categoryId !==
          null &&
        typeof body.categoryId !==
          "string"
      ) {
        return NextResponse.json(
          {
            error:
              "Category ID must be a string or null.",
          },
          {
            status: 400,
            headers:
              jsonHeaders(),
          }
        );
      }

      const categoryId =
        body.categoryId ===
          null
          ? ""
          : cleanString(
              body.categoryId
            );

      if (!categoryId) {
        data.categoryId =
          null;
      } else {
        const category =
          await prisma.category.findFirst(
            {
              where: {
                id:
                  categoryId,

                isActive:
                  true,
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
                "Selected category was not found or is inactive.",
            },
            {
              status: 400,
              headers:
                jsonHeaders(),
            }
          );
        }

        data.categoryId =
          category.id;
      }
    }

    /*
     * -----------------------------------------
     * PRICE
     * -----------------------------------------
     */

    const priceProvided =
      hasOwn(
        body,
        "price"
      );

    const priceMinProvided =
      hasOwn(
        body,
        "priceMin"
      );

    const priceMaxProvided =
      hasOwn(
        body,
        "priceMax"
      );

    if (priceProvided) {
      const result =
        parseOptionalInteger(
          body.price
        );

      if (!result.valid) {
        return NextResponse.json(
          {
            error:
              "Price must be a valid whole number.",
          },
          {
            status: 400,
            headers:
              jsonHeaders(),
          }
        );
      }

      if (
        result.value !==
          null &&
        result.value <
          0
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

      data.price =
        result.value;
    }

    if (
      priceMinProvided
    ) {
      const result =
        parseOptionalInteger(
          body.priceMin
        );

      if (!result.valid) {
        return NextResponse.json(
          {
            error:
              "Minimum price must be a valid whole number.",
          },
          {
            status: 400,
            headers:
              jsonHeaders(),
          }
        );
      }

      if (
        result.value !==
          null &&
        result.value <
          0
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

      data.priceMin =
        result.value;
    }

    if (
      priceMaxProvided
    ) {
      const result =
        parseOptionalInteger(
          body.priceMax
        );

      if (!result.valid) {
        return NextResponse.json(
          {
            error:
              "Maximum price must be a valid whole number.",
          },
          {
            status: 400,
            headers:
              jsonHeaders(),
          }
        );
      }

      if (
        result.value !==
          null &&
        result.value <
          0
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

      data.priceMax =
        result.value;
    }

    /*
     * Preserve explicit null values correctly.
     *
     * Using `??` here would accidentally treat
     * null as "not supplied".
     */

    const finalPriceMin =
      priceMinProvided
        ? data.priceMin ??
          null
        : existing.priceMin;

    const finalPriceMax =
      priceMaxProvided
        ? data.priceMax ??
          null
        : existing.priceMax;

    if (
      finalPriceMin !==
        null &&
      finalPriceMax !==
        null &&
      finalPriceMin >
        finalPriceMax
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

    /*
     * -----------------------------------------
     * IMAGE UPDATE
     * -----------------------------------------
     *
     * We deliberately do not use Product.imageUrl
     * as the input contract.
     *
     * `images` is now the seller-facing image
     * contract.
     */

    const imagesProvided =
      hasOwn(
        body,
        "images"
      );

    let parsedImages:
      ParsedProductImage[] |
      null =
      null;

    if (
      imagesProvided
    ) {
      const imagesResult =
        parseProductImages(
          body.images
        );

      if (
        !imagesResult.valid
      ) {
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

      parsedImages =
        imagesResult.value;

      /*
       * The compatibility mirror is always
       * synchronized with the first uploaded image.
       */
      data.imageUrl =
        getCompatibilityImageUrl(
          parsedImages
        );
    }

    /*
     * -----------------------------------------
     * TRANSACTION
     * -----------------------------------------
     */

    const product =
      await prisma.$transaction(
        async (tx) => {
          /*
           * Update normal Product fields first.
           */
          await tx.product.update({
            where: {
              id:
                existing.id,
            },

            data,
          });

          /*
           * Replace ProductImage records only
           * when `images` was actually supplied.
           */
          if (
            imagesProvided
          ) {
            await tx.productImage.deleteMany(
              {
                where: {
                  productId:
                    existing.id,
                },
              }
            );

            if (
              parsedImages &&
              parsedImages.length >
                0
            ) {
              await tx.productImage.createMany(
                {
                  data:
                    parsedImages.map(
                      (
                        image
                      ) => ({
                        productId:
                          existing.id,

                        url:
                          image.url,

                        publicId:
                          image.publicId,

                        sortOrder:
                          image.sortOrder,
                      })
                    ),

                  skipDuplicates:
                    true,
                }
              );
            }
          }

          /*
           * Reload the final product inside
           * the same transaction.
           */
          return tx.product.findUniqueOrThrow(
            {
              where: {
                id:
                  existing.id,
              },

              include: {
                category:
                  true,

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

                business: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            }
          );
        }
      );

    return NextResponse.json(
      {
        message:
          "Product updated successfully.",

        product,
      },
      {
        headers:
          jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Seller product PATCH error:",
      error
    );

    if (
      typeof error ===
        "object" &&
      error !== null &&
      "code" in error &&
      error.code ===
        "P2025"
    ) {
      return NextResponse.json(
        {
          error:
            "Product could not be found.",
        },
        {
          status: 404,
          headers:
            jsonHeaders(),
        }
      );
    }

    return NextResponse.json(
      {
        error:
          "Unable to update product.",
      },
      {
        status: 500,
        headers:
          jsonHeaders(),
      }
    );
  }
}

/*
 * --------------------------------------------------
 * DELETE
 * --------------------------------------------------
 *
 * Soft delete only.
 *
 * ProductImage records are intentionally left
 * untouched because Product itself is soft-deleted.
 *
 * This preserves the existing product data and
 * avoids introducing Cloudinary deletion behavior
 * that is not already present in this route.
 * --------------------------------------------------
 */

export async function DELETE(
  _request: Request,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const auth =
    await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id } =
      await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "Product ID is required.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
        }
      );
    }

    const product =
      await getSellerProduct(
        id,
        auth.user.id
      );

    if (!product) {
      return NextResponse.json(
        {
          error:
            "Product not found.",
        },
        {
          status: 404,
          headers:
            jsonHeaders(),
        }
      );
    }

    const deletedAt =
      new Date();

    const result =
      await prisma.product.updateMany(
        {
          where: {
            id:
              product.id,

            deletedAt:
              null,
          },

          data: {
            deletedAt,

            deletedById:
              auth.user.id,
          },
        }
      );

    if (
      result.count !==
      1
    ) {
      return NextResponse.json(
        {
          error:
            "Product could not be deleted because it was already deleted.",
        },
        {
          status: 409,
          headers:
            jsonHeaders(),
        }
      );
    }

    return NextResponse.json(
      {
        message:
          "Product deleted successfully.",

        productId:
          product.id,

        deletedAt:
          deletedAt.toISOString(),
      },
      {
        headers:
          jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Seller product DELETE error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to delete product.",
      },
      {
        status: 500,
        headers:
          jsonHeaders(),
      }
    );
  }
}