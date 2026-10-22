import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

/**
 * Convert the currently authenticated BUYER account to SELLER.
 *
 * The account ID, email, name, password hash, referral code, and existing
 * relations are preserved. The client cannot provide a target user ID or
 * request an ADMIN role; the account ID comes only from the server session.
 *
 * The current schema stores one role per user, so this is a role switch rather
 * than a dual-role account. The client must sign out and sign in again so the
 * JWT session receives the new role.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const sessionUserId = (
      session?.user as ({ id?: unknown } | undefined)
    )?.id;

    if (typeof sessionUserId !== "string" || !sessionUserId) {
      return jsonNoStore(
        { error: "Please sign in to continue." },
        401
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: sessionUserId },
      select: {
        id: true,
        role: true,
      },
    });

    if (!user) {
      return jsonNoStore(
        { error: "Your account could not be found." },
        404
      );
    }

    if (user.role === "ADMIN") {
      return jsonNoStore(
        { error: "Administrator accounts cannot be converted to seller accounts." },
        403
      );
    }

    if (user.role === "SELLER") {
      return jsonNoStore({
        message: "This account is already a seller account.",
        role: "SELLER",
        alreadySeller: true,
      });
    }

    // Conditional update prevents overwriting a role changed by another request.
    const update = await prisma.user.updateMany({
      where: {
        id: sessionUserId,
        role: "BUYER",
      },
      data: {
        role: "SELLER",
      },
    });

    if (update.count !== 1) {
      const latestUser = await prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { role: true },
      });

      if (latestUser?.role === "SELLER") {
        return jsonNoStore({
          message: "This account is already a seller account.",
          role: "SELLER",
          alreadySeller: true,
        });
      }

      return jsonNoStore(
        { error: "Your account role changed. Refresh the page and try again." },
        409
      );
    }

    return jsonNoStore({
      message: "Your account is now set up as a seller account.",
      role: "SELLER",
      alreadySeller: false,
    });
  } catch (error) {
    console.error("Buyer-to-seller account conversion error:", error);

    return jsonNoStore(
      { error: "Unable to switch this account to seller. Please try again." },
      500
    );
  }
}
