// lib/business-auth.ts

import { prisma } from "./prisma";
import { requireSeller } from "./seller-auth";

/**
 * Requires an authenticated seller who owns the requested business.
 *
 * This is intentionally separate from requireSeller():
 *
 * requireSeller()
 *   → proves the user is a SELLER
 *
 * requireSellerBusiness()
 *   → proves the seller owns the specific business
 */
export async function requireSellerBusiness(
  businessId: string
) {
  const auth = await requireSeller();

  if (!auth.authorized) {
    return auth;
  }

  const business = await prisma.business.findUnique({
    where: {
      id: businessId,
    },

    select: {
      id: true,
      ownerId: true,
      name: true,
      status: true,
      deletedAt: true,
    },
  });

  if (!business) {
    return {
      authorized: false as const,

      response: new Response(
        JSON.stringify({
          error: "Business not found",
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        }
      ),
    };
  }

  if (business.ownerId !== auth.user.id) {
    return {
      authorized: false as const,

      response: new Response(
        JSON.stringify({
          error: "Forbidden",
        }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
          },
        }
      ),
    };
  }

  return {
    authorized: true as const,
    user: auth.user,
    business,
  };
}