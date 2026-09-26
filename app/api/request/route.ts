import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  findMatches,
  parseQuery,
} from "@/lib/matching";

function clean(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function optionalInt(
  value: unknown
): number | null {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.floor(number);
}

/*
 * -----------------------------------------
 * NIGERIAN PHONE NORMALIZATION
 * -----------------------------------------
 *
 * ReMarket stores Nigerian phone numbers in
 * one canonical format:
 *
 * +2348012345678
 *
 * This lets users submit:
 *
 * 08012345678
 * +2348012345678
 * 2348012345678
 * 080 1234 5678
 *
 * and still find the same request later.
 */

function normalizeNigerianPhone(
  value: string
): string {
  const original = value.trim();

  if (!original) {
    return "";
  }

  let cleanValue = original.replace(
    /[^\d+]/g,
    ""
  );

  if (!cleanValue) {
    return "";
  }

  /*
   * Convert 00 international prefix.
   *
   * 002348012345678
   *      ↓
   * 2348012345678
   */
  if (
    cleanValue.startsWith("00")
  ) {
    cleanValue =
      cleanValue.slice(2);
  }

  /*
   * Remove leading + before processing.
   *
   * +2348012345678
   *       ↓
   * 2348012345678
   */
  if (
    cleanValue.startsWith("+")
  ) {
    cleanValue =
      cleanValue.slice(1);
  }

  /*
   * Already using Nigerian country code.
   */
  if (
    cleanValue.startsWith("234")
  ) {
    return `+${cleanValue}`;
  }

  /*
   * Local Nigerian format.
   *
   * 08012345678
   *       ↓
   * +2348012345678
   */
  if (
    cleanValue.startsWith("0")
  ) {
    return `+234${cleanValue.slice(1)}`;
  }

  /*
   * Handle the common case where the user
   * enters the Nigerian number without the
   * leading zero.
   *
   * 8012345678
   *       ↓
   * +2348012345678
   */
  if (
    /^\d+$/.test(cleanValue)
  ) {
    return `+234${cleanValue}`;
  }

  /*
   * Preserve non-phone contact text rather
   * than changing the existing behavior.
   */
  return original;
}

/*
 * -----------------------------------------
 * CONTACT LOOKUP VARIANTS
 * -----------------------------------------
 *
 * Existing requests may already have been
 * stored before normalization was introduced.
 *
 * We therefore search both:
 *
 * - the canonical normalized value
 * - common legacy forms
 *
 * New requests are always stored canonically.
 */

function getContactLookupVariants(
  value: string
): string[] {
  const original = value.trim();

  if (!original) {
    return [];
  }

  const normalized =
    normalizeNigerianPhone(
      original
    );

  const digitsOnly =
    original.replace(
      /\D/g,
      ""
    );

  const variants = new Set<string>();

  variants.add(original);

  if (normalized) {
    variants.add(normalized);
  }

  if (digitsOnly) {
    variants.add(digitsOnly);

    if (
      digitsOnly.startsWith(
        "234"
      )
    ) {
      variants.add(
        `+${digitsOnly}`
      );

      variants.add(
        `0${digitsOnly.slice(3)}`
      );
    }

    if (
      digitsOnly.startsWith("0")
    ) {
      variants.add(
        `234${digitsOnly.slice(1)}`
      );

      variants.add(
        `+234${digitsOnly.slice(1)}`
      );
    }

    if (
      !digitsOnly.startsWith("0") &&
      !digitsOnly.startsWith("234")
    ) {
      variants.add(
        `234${digitsOnly}`
      );

      variants.add(
        `+234${digitsOnly}`
      );

      variants.add(
        `0${digitsOnly}`
      );
    }
  }

  return Array.from(
    variants
  ).filter(Boolean);
}

function generateRequestCode(): string {
  const characters =
    "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "RM-";

  for (
    let i = 0;
    i < 4;
    i++
  ) {
    const index =
      Math.floor(
        Math.random() *
          characters.length
      );

    code +=
      characters[index];
  }

  return code;
}

async function createUniqueRequestCode(): Promise<string> {
  for (
    let attempt = 0;
    attempt < 10;
    attempt++
  ) {
    const requestCode =
      generateRequestCode();

    const existing =
      await prisma.buyerRequest.findUnique(
        {
          where: {
            requestCode,
          },

          select: {
            id: true,
          },
        }
      );

    if (!existing) {
      return requestCode;
    }
  }

  throw new Error(
    "Unable to generate request code"
  );
}

const requestInclude = {
  category: true,

  matches: {
    where: {
      business: {
        status: "ACTIVE",
        deletedAt: null,
      },
    },

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
} satisfies Prisma.BuyerRequestInclude;

type RequestWithDetails =
  Prisma.BuyerRequestGetPayload<{
    include: typeof requestInclude;
  }>;

function formatRequest(
  request: RequestWithDetails
) {
  return {
    id: request.id,

    requestCode:
      request.requestCode,

    query: request.query,

    category:
      request.category?.name ??
      null,

    budget:
      request.budget,

    locationArea:
      request.locationArea,

    quantity:
      request.quantity,

    description:
      request.description,

    imageUrl:
      request.imageUrl,

    buyerContact:
      request.buyerContact,

    status:
      request.status,

    createdAt:
      request.createdAt instanceof
      Date
        ? request.createdAt.toISOString()
        : request.createdAt,

    matches:
      request.matches.map(
        (match) => ({
          id: match.id,

          score: match.score,

          business: {
            id:
              match.business.id,

            name:
              match.business.name,

            area:
              match.business
                .location?.area ??
              "Location not specified",

            verified:
              match.business
                .verification ===
              "VERIFIED",
          },
        })
      ),
  };
}

/*
 * -----------------------------------------
 * GET
 *
 * /api/request?code=RM-7K4P
 *
 * or
 *
 * /api/request?contact=08012345678
 * -----------------------------------------
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

    if (
      !code &&
      !contact
    ) {
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

    const contactVariants =
      contact
        ? getContactLookupVariants(
            contact
          )
        : [];

    const requests =
      await prisma.buyerRequest.findMany(
        {
          where: code
            ? {
                requestCode:
                  code,
              }
            : {
                buyerContact: {
                  in:
                    contactVariants,
                },
              },

          include:
            requestInclude,

          orderBy: {
            createdAt:
              "desc",
          },
        }
      );

    const formattedRequests =
      requests.map(
        formatRequest
      );

    return NextResponse.json({
      requests:
        formattedRequests,

      total:
        formattedRequests.length,
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
 * -----------------------------------------
 * POST
 *
 * Creates a buyer request without
 * requiring an account.
 * -----------------------------------------
 */

export async function POST(
  request: NextRequest
) {
  try {
    const body =
      await request.json();

    const query =
      clean(body.query);

    const category =
      clean(body.category);

    const locationArea =
      clean(
        body.locationArea
      );

    const rawBuyerContact =
      clean(
        body.buyerContact
      );

    const description =
      clean(
        body.description
      );

    const imageUrl =
      clean(
        body.imageUrl
      );

    const buyerContact =
      normalizeNigerianPhone(
        rawBuyerContact
      );

    const budget =
      optionalInt(
        body.budget
      );

    const quantity =
      optionalInt(
        body.quantity
      );

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

    let categoryId:
      | string
      | null = null;

    if (category) {
      const categoryRecord =
        await prisma.category.findFirst(
          {
            where: {
              name: {
                equals:
                  category,
                mode:
                  "insensitive",
              },
            },

            select: {
              id: true,
            },
          }
        );

      categoryId =
        categoryRecord?.id ??
        null;
    }

    const requestCode =
      await createUniqueRequestCode();

    const buyerRequest =
      await prisma.buyerRequest.create(
        {
          data: {
            requestCode,

            query,

            categoryId,

            budget,

            locationArea:
              locationArea ||
              null,

            quantity,

            description:
              description ||
              null,

            imageUrl:
              imageUrl ||
              null,

            /*
             * Store the canonical
             * normalized contact.
             */
            buyerContact,

            status: "NEW",
          },
        }
      );

    /*
     * -----------------------------------------
     * MATCHING
     * -----------------------------------------
     *
     * Existing matching architecture is preserved.
     * We only validate the returned businesses before
     * creating Match records.
     */

    try {
      const parsedQuery =
        parseQuery(
          query,
          locationArea ||
            undefined,
          budget ??
            undefined,
          category ||
            undefined
        );

      const matches =
        await findMatches(
          parsedQuery
        );

      const candidateBusinessIds =
        [
          ...new Set(
            matches
              .map(
                (match) =>
                  match.business
                    ?.id
              )
              .filter(
                (
                  id
                ): id is string =>
                  typeof id ===
                    "string" &&
                  id.length > 0
              )
          ),
        ];

      if (
        candidateBusinessIds.length >
        0
      ) {
        const activeBusinesses =
          await prisma.business.findMany(
            {
              where: {
                id: {
                  in:
                    candidateBusinessIds,
                },

                status:
                  "ACTIVE",

                deletedAt:
                  null,
              },

              select: {
                id: true,
              },
            }
          );

        const activeBusinessIds =
          new Set(
            activeBusinesses.map(
              (business) =>
                business.id
            )
          );

        const validMatches =
          matches
            .filter(
              (match) =>
                match?.business
                  ?.id &&
                activeBusinessIds.has(
                  match.business.id
                ) &&
                Number.isFinite(
                  match.score
                )
            )
            .map(
              (match) => ({
                requestId:
                  buyerRequest.id,

                businessId:
                  match.business.id,

                score:
                  Math.round(
                    match.score
                  ),

                addedManually:
                  false,
              })
            );

        if (
          validMatches.length >
          0
        ) {
          await prisma.match.createMany(
            {
              data:
                validMatches,

              skipDuplicates:
                true,
            }
          );

          await prisma.buyerRequest.update(
            {
              where: {
                id:
                  buyerRequest.id,
              },

              data: {
                status:
                  "MATCHED",
              },
            }
          );
        }
      }
    } catch (
      matchingError
    ) {
      console.error(
        "Request matching error:",
        matchingError
      );
    }

    const result =
      await prisma.buyerRequest.findUnique(
        {
          where: {
            id:
              buyerRequest.id,
          },

          include:
            requestInclude,
        }
      );

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
        request:
          formatRequest(
            result
          ),
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