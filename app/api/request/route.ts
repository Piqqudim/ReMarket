import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findMatches, parseQuery } from "@/lib/matching";

function clean(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function optionalInt(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.floor(number);
}

/*
 * Generate a short human-friendly request code.
 *
 * Example:
 * RM-7K4P
 */
function generateRequestCode(): string {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "RM-";

  for (let i = 0; i < 4; i++) {
    const index = Math.floor(
      Math.random() * characters.length
    );

    code += characters[index];
  }

  return code;
}

/*
 * Make sure the generated code is actually unique.
 */
async function createUniqueRequestCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const requestCode = generateRequestCode();

    const existing = await prisma.buyerRequest.findUnique({
      where: {
        requestCode,
      },
      select: {
        id: true,
      },
    });

    if (!existing) {
      return requestCode;
    }
  }

  throw new Error("Unable to generate request code");
}

/*
 * Convert a database request into the shape
 * expected by the ReMarket UI.
 */
function formatRequest(request: any) {
  return {
    id: request.id,
    requestCode: request.requestCode,

    query: request.query,

    category:
      request.category?.name ?? null,

    budget: request.budget,
    locationArea: request.locationArea,
    quantity: request.quantity,
    description: request.description,
    imageUrl: request.imageUrl,

    status: request.status,

    createdAt:
      request.createdAt instanceof Date
        ? request.createdAt.toISOString()
        : request.createdAt,

    matches: (request.matches ?? []).map(
      (match: any) => ({
        id: match.id,
        score: match.score,

        business: {
          id: match.business.id,
          name: match.business.name,
          verification:
            match.business.verification,

          location:
            match.business.location
              ? {
                  area:
                    match.business.location.area,
                }
              : null,
        },
      })
    ),
  };
}

/*
 * GET
 *
 * Retrieve requests using either:
 *
 * /api/requests?code=RM-7K4P
 *
 * or:
 *
 * /api/requests?contact=08012345678
 */
export async function GET(
  request: NextRequest
) {
  try {
    const { searchParams } =
      new URL(request.url);

    const code = clean(
      searchParams.get("code")
    ).toUpperCase();

    const contact = clean(
      searchParams.get("contact")
    );

    if (!code && !contact) {
      return NextResponse.json(
        {
          requests: [],
          total: 0,
          error:
            "Request code or contact is required",
        },
        {
          status: 400,
        }
      );
    }

    const requests =
      await prisma.buyerRequest.findMany({
        where: code
          ? {
              requestCode: code,
            }
          : {
              buyerContact: contact,
            },

        include: {
          category: true,

          matches: {
            orderBy: {
              score: "desc",
            },

            include: {
              business: {
                select: {
                  id: true,
                  name: true,
                  verification: true,

                  location: {
                    select: {
                      area: true,
                    },
                  },
                },
              },
            },
          },
        },

        orderBy: {
          createdAt: "desc",
        },
      });

    const formattedRequests =
      requests.map(formatRequest);

    return NextResponse.json({
      requests: formattedRequests,
      total: formattedRequests.length,
    });
  } catch (error) {
    console.error(
      "Get requests API error:",
      error
    );

    return NextResponse.json(
      {
        requests: [],
        total: 0,
        error:
          "Unable to load your requests",
      },
      {
        status: 500,
      }
    );
  }
}

/*
 * POST
 *
 * Creates a request without requiring
 * the buyer to create an account.
 */
export async function POST(
  request: NextRequest
) {
  try {
    const body = await request.json();

    const query = clean(body.query);
    const category = clean(body.category);
    const locationArea = clean(
      body.locationArea
    );

    const buyerContact = clean(
      body.buyerContact
    );

    const description = clean(
      body.description
    );

    const imageUrl = clean(
      body.imageUrl
    );

    const budget = optionalInt(
      body.budget
    );

    const quantity = optionalInt(
      body.quantity
    );

    /*
     * Required fields
     */
    if (!query) {
      return NextResponse.json(
        {
          error:
            "What you're looking for is required",
        },
        {
          status: 400,
        }
      );
    }

    if (!buyerContact) {
      return NextResponse.json(
        {
          error:
            "A WhatsApp number or phone number is required",
        },
        {
          status: 400,
        }
      );
    }

    if (
      budget !== null &&
      budget < 0
    ) {
      return NextResponse.json(
        {
          error:
            "Budget cannot be negative",
        },
        {
          status: 400,
        }
      );
    }

    if (
      quantity !== null &&
      quantity < 1
    ) {
      return NextResponse.json(
        {
          error:
            "Quantity must be at least 1",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * Find category.
     */
    let categoryId: string | null = null;

    if (category) {
      const categoryRecord =
        await prisma.category.findFirst({
          where: {
            name: {
              equals: category,
              mode: "insensitive",
            },
          },

          select: {
            id: true,
          },
        });

      categoryId =
        categoryRecord?.id ?? null;
    }

    /*
     * Generate request code.
     */
    const requestCode =
      await createUniqueRequestCode();

    /*
     * Create the request.
     */
    const buyerRequest =
      await prisma.buyerRequest.create({
        data: {
          requestCode,

          query,

          categoryId,

          budget,

          locationArea:
            locationArea || null,

          quantity,

          description:
            description || null,

          imageUrl:
            imageUrl || null,

          buyerContact,

          status: "NEW",
        },
      });

    /*
     * Find matching sellers.
     *
     * If matching fails, the request itself
     * still remains safely stored.
     */
    try {
      const parsedQuery = parseQuery(
        query,
        locationArea || undefined
      );

      const matches =
        await findMatches(parsedQuery);

      const validMatches = matches
        .filter(
          (match) =>
            match?.business?.id &&
            Number.isFinite(match.score)
        )
        .map((match) => ({
          requestId: buyerRequest.id,
          businessId: match.business.id,
          score: Math.round(match.score),
          addedManually: false,
        }));

      if (validMatches.length > 0) {
        await prisma.match.createMany({
          data: validMatches,
          skipDuplicates: true,
        });

        await prisma.buyerRequest.update({
          where: {
            id: buyerRequest.id,
          },

          data: {
            status: "MATCHED",
          },
        });
      }
    } catch (matchingError) {
      console.error(
        "Request matching error:",
        matchingError
      );
    }

    /*
     * Load the final request with
     * its matches and category.
     */
    const result =
      await prisma.buyerRequest.findUnique({
        where: {
          id: buyerRequest.id,
        },

        include: {
          category: true,

          matches: {
            orderBy: {
              score: "desc",
            },

            include: {
              business: {
                select: {
                  id: true,
                  name: true,
                  verification: true,

                  location: {
                    select: {
                      area: true,
                    },
                  },
                },
              },
            },
          },
        },
      });

    if (!result) {
      return NextResponse.json(
        {
          error:
            "Request was created but could not be loaded",
        },
        {
          status: 500,
        }
      );
    }

    return NextResponse.json(
      {
        request: formatRequest(result),
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Create request API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to create your request",
      },
      {
        status: 500,
      }
    );
  }
}