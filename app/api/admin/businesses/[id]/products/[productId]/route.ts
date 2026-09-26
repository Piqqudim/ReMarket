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

type RouteContext = {
  params: Promise<{
    id: string;
    productId: string;
  }>;
};

type ProductImageInput = {
  url: string;
  publicId: string | null;
  sortOrder: number;
};

function cleanString(
  value: unknown
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function nullableString(
  value: unknown
): string | null {
  const cleaned =
    cleanString(value);

  return cleaned || null;
}

function parseOptionalInt(
  value: unknown
): number | null | undefined {
  if (
    value === undefined ||
    value === null ||
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

function isAvailability(
  value: unknown
): value is Availability {
  return (
    value === "AVAILABLE" ||
    value === "ASK_SELLER" ||
    value === "UNAVAILABLE"
  );
}

function isBusinessStatus(
  value: unknown
): value is BusinessStatus {
  return (
    value === "ACTIVE" ||
    value === "INACTIVE" ||
    value === "PENDING"
  );
}

function parseKeywords(
  value: unknown
): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return Array.from(
    new Set(
      value
        .filter(
          (
            item
          ): item is string =>
            typeof item === "string"
        )
        .map((item) =>
          item.trim()
        )
        .filter(Boolean)
    )
  );
}

function isNonNegativeInteger(
  value: unknown
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
  );
}

function parseImages(
  value: unknown
): ProductImageInput[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const images: ProductImageInput[] = [];

  for (
    const [index, item] of value.entries()
  ) {
    if (
      typeof item === "string"
    ) {
      const url =
        item.trim();

      if (url) {
        images.push({
          url,
          publicId: null,
          sortOrder: index,
        });
      }

      continue;
    }

    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item)
    ) {
      continue;
    }

    const image =
      item as Record<
        string,
        unknown
      >;

    const url =
      cleanString(image.url);

    if (!url) {
      continue;
    }

    const publicId =
      nullableString(
        image.publicId
      );

    const sortOrder =
      isNonNegativeInteger(
        image.sortOrder
      )
        ? image.sortOrder
        : index;

    images.push({
      url,
      publicId,
      sortOrder,
    });
  }

  return images;
}

async function getProduct(
  businessId: string,
  productId: string
) {
  return prisma.product.findFirst({
    where: {
      id: productId,
      businessId,
    },

    include: {
      business: {
        select: {
          id: true,
          name: true,
          deletedAt: true,
        },
      },

      category: true,

      images: {
        orderBy: {
          sortOrder: "asc",
        },
      },
    },
  });
}

export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  const auth =
    await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const {
    id: businessId,
    productId,
  } = await context.params;

  if (
    !businessId ||
    !productId
  ) {
    return NextResponse.json(
      {
        error:
          "Business ID and product ID are required.",
      },
      {
        status: 400,
      }
    );
  }

  try {
    const product =
      await getProduct(
        businessId,
        productId
      );

    if (!product) {
      return NextResponse.json(
        {
          error:
            "Product not found.",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      product,
    });
  } catch (error) {
    console.error(
      "Admin product GET error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load product.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const auth =
    await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const {
    id: businessId,
    productId,
  } = await context.params;

  if (
    !businessId ||
    !productId
  ) {
    return NextResponse.json(
      {
        error:
          "Business ID and product ID are required.",
      },
      {
        status: 400,
      }
    );
  }

  try {
    const existing =
      await prisma.product.findFirst({
        where: {
          id: productId,
          businessId,
        },

        include: {
          business: {
            select: {
              id: true,
              deletedAt: true,
            },
          },
        },
      });

    if (!existing) {
      return NextResponse.json(
        {
          error:
            "Product not found.",
        },
        {
          status: 404,
        }
      );
    }

    if (existing.deletedAt) {
      return NextResponse.json(
        {
          error:
            "This product has been deleted and cannot be edited.",
        },
        {
          status: 409,
        }
      );
    }

    if (existing.business.deletedAt) {
      return NextResponse.json(
        {
          error:
            "This business has been deleted and its products cannot be edited.",
        },
        {
          status: 409,
        }
      );
    }

    const body: unknown =
      await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
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

    const payload =
      body as Record<
        string,
        unknown
      >;

    const data: {
      name?: string;
      description?: string | null;
      categoryId?: string | null;
      price?: number | null;
      priceMin?: number | null;
      priceMax?: number | null;
      availability?: Availability;
      keywords?: string[];
      imageUrl?: string | null;
      status?: BusinessStatus;
    } = {};

    if ("name" in payload) {
      const name =
        cleanString(
          payload.name
        );

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

      data.name = name;
    }

    if ("description" in payload) {
      data.description =
        nullableString(
          payload.description
        );
    }

    if ("categoryId" in payload) {
      const categoryId =
        nullableString(
          payload.categoryId
        );

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
                "Selected category does not exist.",
            },
            {
              status: 400,
            }
          );
        }
      }

      data.categoryId =
        categoryId;
    }

    const price =
      parseOptionalInt(
        payload.price
      );

    if (
      price === undefined
    ) {
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

    if ("price" in payload) {
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

      data.price = price;
    }

    const priceMin =
      parseOptionalInt(
        payload.priceMin
      );

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

    if ("priceMin" in payload) {
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

      data.priceMin =
        priceMin;
    }

    const priceMax =
      parseOptionalInt(
        payload.priceMax
      );

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

    if ("priceMax" in payload) {
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

      data.priceMax =
        priceMax;
    }

    const finalPriceMin =
      "priceMin" in payload
        ? priceMin
        : existing.priceMin;

    const finalPriceMax =
      "priceMax" in payload
        ? priceMax
        : existing.priceMax;

    if (
      finalPriceMin !== null &&
      finalPriceMax !== null &&
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
        }
      );
    }

    if (
      "availability" in
      payload
    ) {
      if (
        !isAvailability(
          payload.availability
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid availability value.",
          },
          {
            status: 400,
          }
        );
      }

      data.availability =
        payload.availability;
    }

    if ("status" in payload) {
      if (
        !isBusinessStatus(
          payload.status
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid product status.",
          },
          {
            status: 400,
          }
        );
      }

      data.status =
        payload.status;
    }

    if ("keywords" in payload) {
      const keywords =
        parseKeywords(
          payload.keywords
        );

      if (!keywords) {
        return NextResponse.json(
          {
            error:
              "Keywords must be an array.",
          },
          {
            status: 400,
          }
        );
      }

      data.keywords =
        keywords;
    }

    let imageInputs:
      | ProductImageInput[]
      | null = null;

    if ("images" in payload) {
      imageInputs =
        parseImages(
          payload.images
        );

      if (!imageInputs) {
        return NextResponse.json(
          {
            error:
              "Images must be an array.",
          },
          {
            status: 400,
          }
        );
      }

      data.imageUrl =
        imageInputs[0]?.url ??
        null;
    }

    const updated =
      await prisma.$transaction(
        async (tx) => {
          const product =
            await tx.product.update({
              where: {
                id: productId,
              },
              data,
            });

          if (
            imageInputs !== null
          ) {
            await tx.productImage.deleteMany(
              {
                where: {
                  productId,
                },
              }
            );

            if (
              imageInputs.length >
              0
            ) {
              await tx.productImage.createMany(
                {
                  data:
                    imageInputs.map(
                      (
                        image,
                        index
                      ) => ({
                        productId,
                        url: image.url,
                        publicId:
                          image.publicId,
                        sortOrder:
                          image.sortOrder ??
                          index,
                      })
                    ),
                }
              );
            }
          }

          return product;
        }
      );

    const refreshed =
      await getProduct(
        businessId,
        updated.id
      );

    return NextResponse.json({
      success: true,
      product: refreshed,
    });
  } catch (error) {
    console.error(
      "Admin product PATCH error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to update product.",
      },
      {
        status: 500,
      }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: RouteContext
) {
  const auth =
    await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const {
    id: businessId,
    productId,
  } = await context.params;

  if (
    !businessId ||
    !productId
  ) {
    return NextResponse.json(
      {
        error:
          "Business ID and product ID are required.",
      },
      {
        status: 400,
      }
    );
  }

  try {
    const existing =
      await prisma.product.findFirst({
        where: {
          id: productId,
          businessId,
        },
        select: {
          id: true,
          deletedAt: true,
        },
      });

    if (!existing) {
      return NextResponse.json(
        {
          error:
            "Product not found.",
        },
        {
          status: 404,
        }
      );
    }

    /*
     * Soft delete only.
     * The product remains in the database
     * for admin reference.
     */
    if (existing.deletedAt) {
      return NextResponse.json({
        success: true,
      });
    }

    await prisma.product.update({
      where: {
        id: productId,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(
      "Admin product DELETE error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to delete product.",
      },
      {
        status: 500,
      }
    );
  }
}