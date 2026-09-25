// lib/admin-auth.ts

import { getServerSession } from "next-auth";

import { authOptions } from "./auth";
import { prisma } from "./prisma";

export async function requireAdmin() {
  const session = await getServerSession(authOptions);

  // No authenticated session.
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

  // Always verify the user against the database.
  const user = await prisma.user.findUnique({
    where: {
      id: session.user.id,
    },

    select: {
      id: true,
      role: true,
    },
  });

  // User no longer exists or is not an admin.
  if (!user || user.role !== "ADMIN") {
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
  };
}