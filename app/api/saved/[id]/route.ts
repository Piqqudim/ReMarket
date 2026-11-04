
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";

function jsonHeaders() {
  return {
    "Cache-Control": "no-store",
    Pragma: "no-cache",
  };
}

function response(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: jsonHeaders(),
  });
}

async function getAuthenticatedAccount() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      role: true,
    },
  });
}

/*
 * DELETE /api/saved/[id]
 *
 * Removes a saved Product or Service.
 *
 * The ID must be the SavedListing record ID,
 * returned by GET /api/saved.
 */

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const account = await getAuthenticatedAccount();

    if (!account) {
      return response(
        { error: "You must be logged in to remove saved listings." },
        401
      );
    }

    if (account.role !== "BUYER" && account.role !== "SELLER") {
      return response(
        { error: "Your account cannot manage saved listings." },
        403
      );
    }

    const { id } = await params;
    const savedListingId = id.trim();

    if (!savedListingId) {
      return response(
        { error: "A saved listing ID is required." },
        400
      );
    }

    const result = await prisma.savedListing.deleteMany({
      where: {
        id: savedListingId,
        userId: account.id,
      },
    });

    if (result.count === 0) {
      return response(
        { error: "Saved listing not found." },
        404
      );
    }

    return response({
      message: "Saved listing removed successfully.",
      removed: true,
      id: savedListingId,
    });
  } catch (error) {
    console.error("Saved listing DELETE error:", error);

    return response(
      { error: "Unable to remove saved listing." },
      500
    );
  }
}
