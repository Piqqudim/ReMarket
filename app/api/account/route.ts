
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

async function getAuthenticatedUser() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) return null;

  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true },
  });
}

const accountSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  business: {
    select: {
      id: true,
      name: true,
      ownerName: true,
      description: true,
      imageUrl: true,
      phone: true,
      showContactInfo: true,
      status: true,
      verification: true,
      onboardedAt: true,
      updatedAt: true,
      location: {
        select: {
          area: true,
          street: true,
        },
      },
      socialLinks: {
        select: {
          platform: true,
          handle: true,
        },
      },
    },
  },
};

/*
 * GET /api/account
 *
 * Retrieves the authenticated user's account.
 */

export async function GET() {
  try {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
      return response(
        { error: "You must be logged in to access your account." },
        401
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: authenticatedUser.id },
      select: accountSelect,
    });

    if (!user) {
      return response(
        { error: "Account not found." },
        404
      );
    }

    return response({
      user,
      accountType: user.role,
      isSeller: Boolean(user.business),
      isBuyer: user.role === "BUYER" || user.role === "SELLER",
      sellerBusiness: user.business,
    });
  } catch (error) {
    console.error("Account GET error:", error);

    return response(
      { error: "Unable to retrieve account information." },
      500
    );
  }
}

/*
 * PATCH /api/account
 *
 * Updates the authenticated user's account name.
 *
 * Request body:
 * {
 *   "name": "New Name"
 * }
 *
 * Email and role cannot be changed through this endpoint.
 */

export async function PATCH(request: NextRequest) {
  try {
    const authenticatedUser = await getAuthenticatedUser();

    if (!authenticatedUser) {
      return response(
        { error: "You must be logged in to update your account." },
        401
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return response(
        { error: "Invalid JSON request body." },
        400
      );
    }

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return response(
        { error: "Invalid request body." },
        400
      );
    }

    const data = body as { name?: unknown };

    if (!Object.prototype.hasOwnProperty.call(data, "name")) {
      return response(
        { error: "Name is required." },
        400
      );
    }

    if (typeof data.name !== "string") {
      return response(
        { error: "Name must be a valid string." },
        400
      );
    }

    const name = data.name.trim();

    if (!name || name.length > 100) {
      return response(
        { error: "Name must contain between 1 and 100 characters." },
        400
      );
    }

    const user = await prisma.user.update({
      where: { id: authenticatedUser.id },
      data: { name },
      select: accountSelect,
    });

    return response({
      message: "Account updated successfully.",
      user,
      accountType: user.role,
      isSeller: Boolean(user.business),
      isBuyer: user.role === "BUYER" || user.role === "SELLER",
      sellerBusiness: user.business,
    });
  } catch (error) {
    console.error("Account PATCH error:", error);

    return response(
      { error: "Unable to update account information." },
      500
    );
  }
}
