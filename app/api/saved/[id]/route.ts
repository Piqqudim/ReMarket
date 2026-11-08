import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

// ---------------------------------------------------------
// RESPONSE HELPERS
// ---------------------------------------------------------

function jsonHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  };
}

function apiResponse(
  data: unknown,
  status = 200,
) {
  return NextResponse.json(data, {
    status,
    headers: jsonHeaders(),
  });
}

// ---------------------------------------------------------
// AUTHENTICATED ACCOUNT
// ---------------------------------------------------------

async function getAuthenticatedAccount() {
  const session = await getServerSession(authOptions);

  const userId = session?.user?.id;

  if (!userId) {
    return null;
  }

  return prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      role: true,
    },
  });
}

function canManageSavedListings(role: string): boolean {
  return role === "BUYER" || role === "SELLER";
}

// ---------------------------------------------------------
// DELETE /api/saved/[id]
//
// Removes a saved Product or Service.
//
// The ID must be the SavedListing record ID,
// returned by GET /api/saved.
//
// Authentication is required.
// A user can only remove their own saved listings.
// ---------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  },
) {
  try {
    // 1. Authenticate the user.

    const account = await getAuthenticatedAccount();

    if (!account) {
      return apiResponse(
        {
          error: "You must be logged in to remove saved listings.",
        },
        401,
      );
    }

    // 2. Check account permissions.

    if (!canManageSavedListings(account.role)) {
      return apiResponse(
        {
          error: "Your account cannot manage saved listings.",
        },
        403,
      );
    }

    // 3. Resolve the dynamic route parameter.
    // Next.js 15+ uses Promise-based route params.

    const routeParams = await params;

    const savedListingId =
      typeof routeParams?.id === "string"
        ? routeParams.id.trim()
        : "";

    if (!savedListingId) {
      return apiResponse(
        {
          error: "A valid saved listing ID is required.",
        },
        400,
      );
    }

    // 4. Delete only the record belonging to this user.
    //
    // Using deleteMany allows us to safely check whether
    // a matching record was actually deleted.
    //
    // It also prevents users from deleting another
    // user's saved listings by guessing their IDs.

    const result = await prisma.savedListing.deleteMany({
      where: {
        id: savedListingId,
        userId: account.id,
      },
    });

    // 5. Handle missing records.

    if (result.count === 0) {
      return apiResponse(
        {
          error: "Saved listing not found.",
          removed: false,
        },
        404,
      );
    }

    // 6. Return successful deletion response.

    return apiResponse({
      message: "Saved listing removed successfully.",
      removed: true,
      id: savedListingId,
    });
  } catch (error) {
    console.error(
      "Saved listing DELETE error:",
      error,
    );

    return apiResponse(
      {
        error: "Unable to remove saved listing.",
        removed: false,
      },
      500,
    );
  }
}