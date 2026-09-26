// lib/seller-auth.ts

import { getServerSession } from "next-auth";

import { authOptions } from "./auth";
import { prisma } from "./prisma";

export async function requireSeller() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return {
      authorized: false as const,
      response: new Response(
        JSON.stringify({
          error: "Unauthorized",
        }),
        {
          status: 401,
          headers: {
            "Content-Type": "application/json",
          },
        }
      ),
    };
  }

  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id,
    },
    select: {
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
    },
  });

  if (!user || user.role !== "SELLER") {
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
    user,
    business: user.business,
  };
}