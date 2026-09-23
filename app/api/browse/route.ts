import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";

function clean(
  value: string | null
): string {
  return value?.trim() ?? "";
}

export async function GET(
  request: NextRequest
) {
  try {
    const {
      searchParams,
    } = new URL(
      request.url
    );

    const q = clean(
      searchParams.get("q")
    );

    const category = clean(
      searchParams.get(
        "category"
      )
    );

    const businesses =
      await prisma.business.findMany(
        {
          where: {
            status: "ACTIVE",

            ...(category
              ? {
                  categories: {
                    some: {
                      category: {
                        name: {
                          equals:
                            category,
                          mode: "insensitive",
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
                        contains:
                          q,
                        mode: "insensitive",
                      },
                    },
                    {
                      description: {
                        contains:
                          q,
                        mode: "insensitive",
                      },
                    },
                    {
                      products: {
                        some: {
                          status:
                            "ACTIVE",
                          OR: [
                            {
                              name: {
                                contains:
                                  q,
                                mode: "insensitive",
                              },
                            },
                            {
                              description: {
                                contains:
                                  q,
                                mode: "insensitive",
                              },
                            },
                            {
                              keywords: {
                                has:
                                  q.toLowerCase(),
                              },
                            },
                          ],
                        },
                      },
                    },
                  ],
                }
              : {}),
          },

          include: {
            location: true,

            categories: {
              include: {
                category: true,
              },
            },

            products: {
              where: {
                status: "ACTIVE",
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
                },
              },

              orderBy: {
                updatedAt: "desc",
              },

              take: 4,
            },

            socialLinks: true,
          },

          orderBy: {
            onboardedAt: "desc",
          },
        }
      );

    return NextResponse.json({
      businesses,
      total:
        businesses.length,
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
        error:
          "Unable to load businesses.",
      },
      {
        status: 500,
      }
    );
  }
}