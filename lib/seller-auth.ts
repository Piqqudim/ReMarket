import { getServerSession } from "next-auth";
import { BusinessStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import { authOptions } from "./auth";
import { prisma } from "./prisma";

/*
 * ---------------------------------------------------------
 * SELLER USER SELECTION
 * ---------------------------------------------------------
 */

const sellerUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  business: {
    select: {
      id: true,
      name: true,
      ownerId: true,
      status: true,
      deletedAt: true,
    },
  },
} satisfies Prisma.UserSelect;

/*
 * Derive the seller user type directly from Prisma.
 */

type SellerUser = Prisma.UserGetPayload<{
  select: typeof sellerUserSelect;
}>;

type SellerBusiness = NonNullable<
  SellerUser["business"]
>;

/*
 * ---------------------------------------------------------
 * AUTHENTICATION RESULT TYPES
 * ---------------------------------------------------------
 */

export type SellerAccountAuthResult =
  | {
      authorized: false;
      response: Response;
    }
  | {
      authorized: true;
      user: SellerUser;
      business: SellerUser["business"];
    };

export type SellerAuthResult =
  | {
      authorized: false;
      response: Response;
    }
  | {
      authorized: true;
      user: SellerUser;
      business: SellerBusiness;
    };

/*
 * ---------------------------------------------------------
 * AUTHENTICATION RESPONSE HELPER
 * ---------------------------------------------------------
 */

function createAuthError(
  message: string,
  status: number,
): Response {
  return new Response(
    JSON.stringify({
      error: message,
    }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}

/*
 * ---------------------------------------------------------
 * REQUIRE SELLER ACCOUNT
 *
 * Checks:
 * - User is authenticated.
 * - User exists in the database.
 * - User has the SELLER role.
 *
 * A business does not need to exist yet.
 * ---------------------------------------------------------
 */

export async function requireSellerAccount(): Promise<SellerAccountAuthResult> {
  const session = await getServerSession(authOptions);

  /*
   * 1. Check authentication.
   */

  if (!session?.user?.id) {
    return {
      authorized: false,
      response: createAuthError("Unauthorized", 401),
    };
  }

  /*
   * 2. Load the seller account and associated business.
   */

  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id,
    },
    select: sellerUserSelect,
  });

  /*
   * 3. Verify that the account exists
   * and has the SELLER role.
   */

  if (!user || user.role !== "SELLER") {
    return {
      authorized: false,
      response: createAuthError("Forbidden", 403),
    };
  }

  /*
   * 4. Successful seller account authentication.
   *
   * The business can be null here because this helper
   * also allows sellers creating their first business.
   */

  return {
    authorized: true,
    user,
    business: user.business,
  };
}

/*
 * ---------------------------------------------------------
 * REQUIRE ACTIVE SELLER
 *
 * Checks:
 * - User is authenticated.
 * - User has the SELLER role.
 * - Business exists.
 * - Business belongs to the authenticated seller.
 * - Business is ACTIVE.
 * - Business has not been deleted.
 * ---------------------------------------------------------
 */

export async function requireSeller(): Promise<SellerAuthResult> {
  const auth = await requireSellerAccount();

  /*
   * 1. Return authentication failure immediately.
   */

  if (!auth.authorized) {
    return auth;
  }

  /*
   * 2. Validate the seller's business.
   */

  const business = auth.business;

  if (
    !business ||
    business.ownerId !== auth.user.id ||
    business.status !== BusinessStatus.ACTIVE ||
    business.deletedAt
  ) {
    return {
      authorized: false,
      response: createAuthError(
        "An active seller business is required.",
        403,
      ),
    };
  }

  /*
   * 3. Successful seller authentication.
   */

  return {
    authorized: true,
    user: auth.user,
    business,
  };
}