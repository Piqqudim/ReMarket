import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";

const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 24;

function clean(
  value: string | null
): string {
  return value?.trim() ?? "";
}

function parsePositiveInteger(
  value: string | null,
  fallback: number
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < 1
  ) {
    return fallback;
  }

  return parsed;
}

export async function GET(
  request: NextRequest
) {
  try {
    const { searchParams } =
      new URL(request.url);

    const q = clean(
      searchParams.get("q")
    );

    const category = clean(
      searchParams.get("category")
    );

    const requestedPage =
      parsePositiveInteger(
        searchParams.get("page"),
        1
      );

    const requestedPageSize =
      parsePositiveInteger(
        searchParams.get("pageSize"),
        DEFAULT_PAGE_SIZE
      );

    const pageSize = Math.min(
      requestedPageSize,
      MAX_PAGE_SIZE
    );

    const where = {
      status: "ACTIVE" as const,
      deletedAt: null,

      ...(category
        ? {
            categories: {
              some: {
                category: {
                  name: {
                    equals: category,
                    mode: "insensitive" as const,
                  },
                },
              },
            },
          }
        : {}),

      ...(q
        ? {
            OR: [
              {
                name: {
                  contains: q,
                  mode: "insensitive" as const,
                },
              },
              {
                description: {
                  contains: q,
                  mode: "insensitive" as const,
                },
              },
              {
                products: {
                  some: {
                    status: "ACTIVE" as const,
                    deletedAt: null,

                    OR: [
                      {
                        name: {
                          contains: q,
                          mode: "insensitive" as const,
                        },
                      },
                      {
                        description: {
                          contains: q,
                          mode: "insensitive" as const,
                        },
                      },
                      {
                        keywords: {
                          has: q.toLowerCase(),
                        },
                      },
                    ],
                  },
                },
              },
            ],
          }
        : {}),
    };

    const total =
      await prisma.business.count({
        where,
      });

    const totalPages =
      Math.max(
        1,
        Math.ceil(
          total / pageSize
        )
      );

    const page =
      Math.min(
        requestedPage,
        totalPages
      );

    const businesses =
      await prisma.business.findMany({
        where,

        skip:
          (page - 1) *
          pageSize,

        take: pageSize,

        select: {
          id: true,
          name: true,
          ownerName: true,
          description: true,
          imageUrl: true,
          availability: true,
          verification: true,

          location: {
            select: {
              id: true,
              area: true,
            },
          },

          categories: {
            select: {
              category: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },

          products: {
            where: {
              status: "ACTIVE",
              deletedAt: null,
            },

            select: {
              id: true,
              name: true,
              description: true,
              price: true,
              priceMin: true,
              priceMax: true,
              availability: true,
              imageUrl: true,
              keywords: true,

              images: {
                select: {
                  id: true,
                  url: true,
                  publicId: true,
                  sortOrder: true,
                },

                orderBy: {
                  sortOrder: "asc",
                },

                take: 1,
              },
            },

            orderBy: {
              updatedAt: "desc",
            },

            take: 4,
          },

          _count: {
            select: {
              products: {
                where: {
                  status: "ACTIVE",
                  deletedAt: null,
                },
              },
            },
          },

          socialLinks: {
            select: {
              id: true,
              platform: true,
              handle: true,
            },
          },
        },

        orderBy: [
          {
            onboardedAt: "desc",
          },
          {
            id: "desc",
          },
        ],
      });

    const formattedBusinesses =
      businesses.map(
        (business) => ({
          id: business.id,

          name: business.name,

          ownerName:
            business.ownerName,

          description:
            business.description,

          imageUrl:
            business.imageUrl,

          availability:
            business.availability,

          verification:
            business.verification,

          location:
            business.location,

          categories:
            business.categories,

          products:
            business.products,

          productCount:
            business._count.products,

          socialLinks:
            business.socialLinks,
        })
      );

    return NextResponse.json({
      businesses:
        formattedBusinesses,

      total,

      page,

      pageSize,

      totalPages,
    });
  } catch (error) {
    console.error(
      "Browse API error:",
      error
    );

    return NextResponse.json(
      {
        businesses: [],
        total: 0,
        page: 1,
        pageSize:
          DEFAULT_PAGE_SIZE,
        totalPages: 1,
        error:
          "Unable to load businesses.",
      },
      {
        status: 500,
      }
    );
  }
}