import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

import {
  Availability,
  BusinessStatus,
  VerificationStatus,
} from "@prisma/client";

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

function isVerificationStatus(
  value: unknown
): value is VerificationStatus {
  return (
    value ===
      VerificationStatus.VERIFIED ||
    value ===
      VerificationStatus.UNVERIFIED
  );
}

/* -------------------------------------------------------------------------- */
/* GET                                                                        */
/* -------------------------------------------------------------------------- */

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

    const { id } =
      await params;

    const business =
      await prisma.business.findUnique(
        {
          where: {
            id,
          },

          include: {
            location: true,

            categories: {
              include: {
                category: true,
              },
            },

            products: {
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
            },

            socialLinks: true,
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

    return NextResponse.json({
      business,
    });
  } catch (error) {
    console.error(
      "Admin business GET error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load business.",
      },
      {
        status: 500,
      }
    );
  }
}

/* -------------------------------------------------------------------------- */
/* PATCH                                                                      */
/* -------------------------------------------------------------------------- */

export async function PATCH(
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

    const { id } =
      await params;

    const existing =
      await prisma.business.findUnique(
        {
          where: {
            id,
          },

          select: {
            id: true,
          },
        }
      );

    if (!existing) {
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

    const body =
      await request.json();

    const data: {
      name?: string;
      ownerName?: string | null;
      description?: string | null;
      phone?: string | null;
      imageUrl?: string | null;
      availability?: Availability;
      status?: BusinessStatus;
      verification?: VerificationStatus;
    } = {};

    if (
      body.name !==
      undefined
    ) {
      const name =
        cleanString(
          body.name
        );

      if (!name) {
        return NextResponse.json(
          {
            error:
              "Business name is required.",
          },
          {
            status: 400,
          }
        );
      }

      data.name = name;
    }

    if (
      body.ownerName !==
      undefined
    ) {
      data.ownerName =
        nullableString(
          body.ownerName
        );
    }

    if (
      body.description !==
      undefined
    ) {
      data.description =
        nullableString(
          body.description
        );
    }

    if (
      body.phone !==
      undefined
    ) {
      data.phone =
        nullableString(
          body.phone
        );
    }

    if (
      body.imageUrl !==
      undefined
    ) {
      data.imageUrl =
        nullableString(
          body.imageUrl
        );
    }

    if (
      body.availability !==
      undefined
    ) {
      if (
        !isAvailability(
          body.availability
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid availability.",
          },
          {
            status: 400,
          }
        );
      }

      data.availability =
        body.availability;
    }

    if (
      body.status !==
      undefined
    ) {
      if (
        !isBusinessStatus(
          body.status
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid business status.",
          },
          {
            status: 400,
          }
        );
      }

      data.status =
        body.status;
    }

    if (
      body.verification !==
      undefined
    ) {
      if (
        !isVerificationStatus(
          body.verification
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Invalid verification status.",
          },
          {
            status: 400,
          }
        );
      }

      data.verification =
        body.verification;
    }

    const business =
      await prisma.business.update(
        {
          where: {
            id,
          },

          data,

          include: {
            location: true,

            categories: {
              include: {
                category: true,
              },
            },

            products: {
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
            },

            socialLinks: true,
          },
        }
      );

    return NextResponse.json({
      business,
    });
  } catch (error) {
    console.error(
      "Admin business PATCH error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to update business.",
      },
      {
        status: 500,
      }
    );
  }
}