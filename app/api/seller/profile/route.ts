import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireSeller } from "@/lib/seller-auth";

function cleanString(
  value: unknown
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function jsonHeaders() {
  return {
    "Content-Type":
      "application/json",
    "Cache-Control":
      "no-store",
  };
}

async function readJsonBody(
  request: Request
): Promise<
  | {
      success: true;
      payload: Record<
        string,
        unknown
      >;
    }
  | {
      success: false;
    }
> {
  try {
    const text =
      await request.text();

    if (!text.trim()) {
      return {
        success: true,
        payload: {},
      };
    }

    const parsed: unknown =
      JSON.parse(text);

    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return {
        success: false,
      };
    }

    return {
      success: true,
      payload:
        parsed as Record<
          string,
          unknown
        >,
    };
  } catch {
    return {
      success: false,
    };
  }
}

/*
 * ----------------------------------------------------
 * GET
 * ----------------------------------------------------
 *
 * Returns the authenticated seller's profile.
 *
 * Business data is intentionally returned only as a
 * small summary. Full business management remains under:
 *
 * /api/seller/business
 */
export async function GET() {
  const auth =
    await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const user =
      await prisma.user.findUnique({
        where: {
          id: auth.user.id,
        },

        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,

          business: {
            select: {
              id: true,
              name: true,
              ownerId: true,
              status: true,
              verification: true,
              deletedAt: true,
            },
          },
        },
      });

    if (!user) {
      return NextResponse.json(
        {
          error:
            "Seller account could not be found.",
        },
        {
          status: 404,
          headers:
            jsonHeaders(),
        }
      );
    }

    if (
      user.role !==
      "SELLER"
    ) {
      return NextResponse.json(
        {
          error:
            "This account is not a seller account.",
        },
        {
          status: 403,
          headers:
            jsonHeaders(),
        }
      );
    }

    return NextResponse.json(
      {
        profile: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt:
            user.createdAt,
        },

        business:
          user.business,
      },
      {
        status: 200,
        headers:
          jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Seller profile fetch error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load seller profile.",
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
 * ----------------------------------------------------
 * PATCH
 * ----------------------------------------------------
 *
 * Updates the authenticated seller's profile.
 *
 * Supported field:
 *
 * - name
 *
 * Email remains read-only.
 *
 * Business information belongs to:
 *
 * /api/seller/business
 */
export async function PATCH(
  request: Request
) {
  const auth =
    await requireSeller();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const body =
      await readJsonBody(
        request
      );

    if (!body.success) {
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

    const payload =
      body.payload;

    const hasName =
      Object.prototype.hasOwnProperty.call(
        payload,
        "name"
      );

    if (!hasName) {
      return NextResponse.json(
        {
          error:
            "No profile fields were provided.",
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
        payload.name
      );

    if (!name) {
      return NextResponse.json(
        {
          error:
            "Name cannot be empty.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
        }
      );
    }

    if (
      name.length > 150
    ) {
      return NextResponse.json(
        {
          error:
            "Name must not exceed 150 characters.",
        },
        {
          status: 400,
          headers:
            jsonHeaders(),
        }
      );
    }

    /*
     * Only the authenticated seller can update
     * their own profile.
     *
     * No user ID is accepted from the body.
     */
    const user =
      await prisma.user.update({
        where: {
          id: auth.user.id,
        },

        data: {
          name,
        },

        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
      });

    return NextResponse.json(
      {
        message:
          "Seller profile updated successfully.",

        profile: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt:
            user.createdAt,
        },
      },
      {
        status: 200,
        headers:
          jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Seller profile update error:",
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
            "Seller account could not be found.",
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
          "Unable to update seller profile.",
      },
      {
        status: 500,
        headers:
          jsonHeaders(),
      }
    );
  }
}