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
  }>;
};

type ProductImageInput = {
  url: string;
  publicId: string | null;
  sortOrder: number;
};

function isNonNegativeInteger(
  value: unknown
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
  );
}

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
          (item): item is string =>
            typeof item === "string"
        )
        .map((item) =>
          item.trim().toLowerCase()
        )
        .filter(Boolean)
    )
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
  productId: string
) {
  return prisma.product.findUnique({
    where: {
      id: productId,
    },

    include: {
      business: {
        select: {
          id: true,
          name: true,
          deletedAt: true,

          location: {
            select: {
              area: true,
            },
          },
        },
      },

      category: true,

      images: {
        orderBy: [
          {
            sortOrder: "asc",
          },
          {
            createdAt: "asc",
          },
        ],
      },
    },
  });
}

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  const auth =
    await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id: productId } =
    await params;

  if (!productId) {
    return NextResponse.json(
      {
        error:
          "Product ID is required.",
      },
      {
        status: 400,
      }
    );
  }

  try {
    const product =
      await getProduct(
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
  { params }: RouteContext
) {
  const auth =
    await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id: productId } =
    await params;

  if (!productId) {
    return NextResponse.json(
      {
        error:
          "Product ID is required.",
      },
      {
        status: 400,
      }
    );
  }

  try {
    const existing =
      await prisma.product.findUnique({
        where: {
          id: productId,
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

    if ("name" in body) {
      const name =
        cleanString(body.name);

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

    if ("description" in body) {
      data.description =
        nullableString(
          body.description
        );
    }

    if ("categoryId" in body) {
      const categoryId =
        nullableString(
          body.categoryId
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

    if ("price" in body) {
      const price =
        parseOptionalInt(
          body.price
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

    if ("priceMin" in body) {
      const priceMin =
        parseOptionalInt(
          body.priceMin
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

    if ("priceMax" in body) {
      const priceMax =
        parseOptionalInt(
          body.priceMax
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
      "priceMin" in body
        ? parseOptionalInt(
            body.priceMin
          )
        : existing.priceMin;

    const finalPriceMax =
      "priceMax" in body
        ? parseOptionalInt(
            body.priceMax
          )
        : existing.priceMax;

    if (
      finalPriceMin !== null &&
      finalPriceMin !== undefined &&
      finalPriceMax !== null &&
      finalPriceMax !== undefined &&
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
      "availability" in body
    ) {
      if (
        !isAvailability(
          body.availability
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
        body.availability;
    }

    if ("status" in body) {
      if (
        !isBusinessStatus(
          body.status
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
        body.status;
    }

    if ("keywords" in body) {
      const keywords =
        parseKeywords(
          body.keywords
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

    if ("images" in body) {
      imageInputs =
        parseImages(
          body.images
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

    if (
      Object.keys(data)
        .length === 0 &&
      imageInputs === null
    ) {
      return NextResponse.json(
        {
          error:
            "No changes provided.",
        },
        {
          status: 400,
        }
      );
    }

    await prisma.$transaction(
      async (tx) => {
        if (
          Object.keys(data)
            .length > 0
        ) {
          await tx.product.update({
            where: {
              id: productId,
            },
            data,
          });
        }

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
            imageInputs.length > 0
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
      }
    );

    const refreshed =
      await getProduct(
        productId
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
  { params }: RouteContext
) {
  const auth =
    await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id: productId } =
    await params;

  if (!productId) {
    return NextResponse.json(
      {
        error:
          "Product ID is required.",
      },
      {
        status: 400,
      }
    );
  }

  try {
    const existing =
      await prisma.product.findUnique({
        where: {
          id: productId,
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