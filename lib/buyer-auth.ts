import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function requireBuyer() {
  const session = await getServerSession(authOptions);

  const userId = session?.user?.id;

  if (typeof userId !== "string" || !userId.trim()) {
    return {
      authorized: false as const,
      response: Response.json(
        { error: "Please sign in to continue." },
        { status: 401 },
      ),
    };
  }

  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
    },
  });

  if (!user) {
    return {
      authorized: false as const,
      response: Response.json(
        { error: "Your account could not be found. Please sign in again." },
        { status: 401 },
      ),
    };
  }

  if (user.role !== "BUYER") {
    return {
      authorized: false as const,
      response: Response.json(
        { error: "A buyer account is required." },
        { status: 403 },
      ),
    };
  }

  return {
    authorized: true as const,
    user,
  };
}