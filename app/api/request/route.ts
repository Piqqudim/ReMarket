import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";

import { prisma } from "@/lib/prisma";

import {
  findMatches,
  parseQuery,
} from "@/lib/matching";

/*
 * -----------------------------------------
 * HELPERS
 * -----------------------------------------
 */

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function clean(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function optionalInt(
  value: unknown
): number | null | undefined {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const numberValue = Number(value);

  if (
    !Number.isFinite(numberValue) ||
    !Number.isInteger(numberValue)
  ) {
    return undefined;
  }

  return numberValue;
}

/*
 * -----------------------------------------
 * NIGERIAN PHONE NORMALIZATION
 * -----------------------------------------
 *
 * Canonical form:
 *
 * +2348012345678
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
   * 002348012345678
   * ↓
   * 2348012345678
   */
  if (cleanValue.startsWith("00")) {
    cleanValue = cleanValue.slice(2);
  }

  /*
   * +2348012345678
   * ↓
   * 2348012345678
   */
  if (cleanValue.startsWith("+")) {
    cleanValue = cleanValue.slice(1);
  }

  /*
   * Already using Nigerian country code.
   */
  if (cleanValue.startsWith("234")) {
    return `+${cleanValue}`;
  }

  /*
   * Local Nigerian format.
   *
   * 08012345678
   * ↓
   * +2348012345678
   */
  if (cleanValue.startsWith("0")) {
    return `+234${cleanValue.slice(1)}`;
  }

  /*
   * Number without leading zero.
   *
   * 8012345678
   * ↓
   * +2348012345678
   */
  if (/^\d+$/.test(cleanValue)) {
    return `+234${cleanValue}`;
  }

  /*
   * Preserve non-phone text.
   */
  return original;
}

function isValidNigerianPhone(
  value: string
): boolean {
  const normalized =
    normalizeNigerianPhone(value);

  return /^\+234\d{10}$/.test(
    normalized
  );
}

/*
 * -----------------------------------------
 * CONTACT LOOKUP VARIANTS
 * -----------------------------------------
 *
 * Supports requests saved before phone
 * normalization was introduced.
 */

function getContactLookupVariants(
  value: string
): string[] {
  const original = value.trim();

  if (!original) {
    return [];
  }

  const normalized =
    normalizeNigerianPhone(value);

  const digitsOnly =
    original.replace(/\D/g, "");

  const variants = new Set<string>();

  variants.add(original);

  if (normalized) {
    variants.add(normalized);
  }

  if (digitsOnly) {
    variants.add(digitsOnly);

    /*
     * 2348012345678
     */
    if (digitsOnly.startsWith("234")) {
      variants.add(`+${digitsOnly}`);

      variants.add(
        `0${digitsOnly.slice(3)}`
      );
    }

    /*
     * 08012345678
     */
    if (digitsOnly.startsWith("0")) {
      variants.add(
        `234${digitsOnly.slice(1)}`
      );

      variants.add(
        `+234${digitsOnly.slice(1)}`
      );
    }

    /*
     * 8012345678
     */
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

  return Array.from(variants).filter(
    Boolean
  );
}

/*
 * -----------------------------------------
 * REQUEST CODE
 * -----------------------------------------
 *
 * Example:
 *
 * RM-7K4P
 */

const REQUEST_CODE_CHARACTERS =
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRequestCode(): string {
  let code = "RM-";

  for (let i = 0; i < 4; i++) {
    const index = randomInt(
      REQUEST_CODE_CHARACTERS.length
    );

    code +=
      REQUEST_CODE_CHARACTERS[index];
  }

  return code;
}

/*
 * requestCode is deliberately excluded from
 * the input type because this function
 * generates it itself.
 */
async function createUniqueRequest(
  data: Omit<
    Prisma.BuyerRequestCreateInput,
    "requestCode"
  >
) {
  /*
   * The database unique constraint is the
   * final protection against collisions.
   */
  for (
    let attempt = 0;
    attempt < 10;
    attempt++
  ) {
    const requestCode =
      generateRequestCode();

    const existing =
      await prisma.buyerRequest.findUnique({
        where: {
          requestCode,
        },
        select: {
          id: true,
        },
      });

    if (existing) {
      continue;
    }

    try {
      return await prisma.buyerRequest.create({
        data: {
          ...data,
          requestCode,
        },
      });
    } catch (error) {
      /*
       * Handle a race condition where another
       * request receives the same requestCode.
       */
      if (
        error instanceof
          Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }

      throw error;
    }
  }

  throw new Error(
    "Unable to generate a unique request code"
  );
}

/*
 * -----------------------------------------
 * REQUEST INCLUDE
 * -----------------------------------------
 */

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

/*
 * -----------------------------------------
 * FORMAT REQUEST
 * -----------------------------------------
 */

function formatRequest(
  request: RequestWithDetails
) {
  return {
    id: request.id,

    requestCode:
      request.requestCode,

    query:
      request.query,

    category:
      request.category?.name ?? null,

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
      request.createdAt instanceof Date
        ? request.createdAt.toISOString()
        : request.createdAt,

    matches:
      request.matches.map((match) => ({
        id: match.id,

        score: match.score,

        business: {
          id: match.business.id,

          name: match.business.name,

          area:
            match.business.location?.area ??
            "Location not specified",

          verified:
            match.business.verification ===
            "VERIFIED",
        },
      })),
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
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }

    const contactVariants = contact
      ? getContactLookupVariants(contact)
      : [];

    const requests =
      await prisma.buyerRequest.findMany({
        where: code
          ? {
              requestCode: code,
            }
          : {
              buyerContact: {
                in: contactVariants,
              },
            },

        include: requestInclude,

        orderBy: {
          createdAt: "desc",
        },
      });

    const formattedRequests =
      requests.map(formatRequest);

    return NextResponse.json(
      {
        requests:
          formattedRequests,

        total:
          formattedRequests.length,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        },
      }
    );
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
        headers: {
          "Cache-Control": "no-store",
        },
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
    let rawBody: unknown;

    /*
     * Invalid JSON is a client error,
     * not a server error.
     */
    try {
      rawBody =
        await request.json();
    } catch {
      return NextResponse.json(
        {
          error:
            "Invalid request body",
        },
        {
          status: 400,
        }
      );
    }

    if (!isRecord(rawBody)) {
      return NextResponse.json(
        {
          error:
            "Invalid request body",
        },
        {
          status: 400,
        }
      );
    }

    const query = clean(
      rawBody.query
    );

    const category = clean(
      rawBody.category
    );

    const locationArea = clean(
      rawBody.locationArea
    );

    const rawBuyerContact = clean(
      rawBody.buyerContact
    );

    const description = clean(
      rawBody.description
    );

    const imageUrl = clean(
      rawBody.imageUrl
    );

    const budget = optionalInt(
      rawBody.budget
    );

    const quantity = optionalInt(
      rawBody.quantity
    );

    /*
     * -----------------------------------------
     * VALIDATION
     * -----------------------------------------
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

    if (query.length > 200) {
      return NextResponse.json(
        {
          error:
            "What you're looking for is too long",
        },
        {
          status: 400,
        }
      );
    }

    if (budget === undefined) {
      return NextResponse.json(
        {
          error:
            "Budget must be a valid integer",
        },
        {
          status: 400,
        }
      );
    }

    if (quantity === undefined) {
      return NextResponse.json(
        {
          error:
            "Quantity must be a valid integer",
        },
        {
          status: 400,
        }
      );
    }

    if (!rawBuyerContact) {
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
      !isValidNigerianPhone(
        rawBuyerContact
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Enter a valid Nigerian phone or WhatsApp number",
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

    if (description.length > 2000) {
      return NextResponse.json(
        {
          error:
            "Description is too long",
        },
        {
          status: 400,
        }
      );
    }

    if (imageUrl.length > 2000) {
      return NextResponse.json(
        {
          error:
            "Image URL is too long",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * -----------------------------------------
     * CATEGORY
     * -----------------------------------------
     *
     * Only active categories can be attached
     * to a new buyer request.
     */

    let categoryId:
      | string
      | null = null;

    if (category) {
      const categoryRecord =
        await prisma.category.findFirst({
          where: {
            name: {
              equals: category,
              mode: "insensitive",
            },

            isActive: true,
          },

          select: {
            id: true,
          },
        });

      if (!categoryRecord) {
        return NextResponse.json(
          {
            error:
              "Selected category was not found",
          },
          {
            status: 400,
          }
        );
      }

      categoryId =
        categoryRecord.id;
    }

    /*
     * -----------------------------------------
     * CREATE REQUEST
     * -----------------------------------------
     */

    const buyerContact =
      normalizeNigerianPhone(
        rawBuyerContact
      );

    const buyerRequest =
      await createUniqueRequest({
        query,

        category: categoryId
          ? {
              connect: {
                id: categoryId,
              },
            }
          : undefined,

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
      });

    /*
     * -----------------------------------------
     * MATCHING
     * -----------------------------------------
     *
     * Matching failure does not prevent the
     * buyer request from being created.
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

      /*
       * Collect only actual business IDs.
       */
      const candidateBusinessIds = [
        ...new Set(
          matches
            .map(
              (match) =>
                match.business?.id
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
        /*
         * Re-check business visibility before
         * creating Match records.
         */
        const activeBusinesses =
          await prisma.business.findMany({
            where: {
              id: {
                in: candidateBusinessIds,
              },

              status: "ACTIVE",

              deletedAt: null,
            },

            select: {
              id: true,
            },
          });

        const activeBusinessIds =
          new Set(
            activeBusinesses.map(
              (business) =>
                business.id
            )
          );

        /*
         * Only create valid Match records.
         */
        const validMatches =
          matches
            .filter(
              (match) =>
                typeof match
                  ?.business?.id ===
                  "string" &&
                activeBusinessIds.has(
                  match.business.id
                ) &&
                Number.isFinite(
                  match.score
                )
            )
            .map((match) => ({
              requestId:
                buyerRequest.id,

              businessId:
                match.business.id,

              score:
                Math.round(
                  match.score
                ),

              addedManually: false,
            }));

        if (
          validMatches.length >
          0
        ) {
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
      }
    } catch (matchingError) {
      console.error(
        "Request matching error:",
        matchingError
      );
    }

    /*
     * -----------------------------------------
     * LOAD FINAL REQUEST
     * -----------------------------------------
     */

    const result =
      await prisma.buyerRequest.findUnique({
        where: {
          id: buyerRequest.id,
        },

        include: requestInclude,
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
        request:
          formatRequest(result),
      },
      {
        status: 201,
        headers: {
          "Cache-Control":
            "no-store",
        },
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