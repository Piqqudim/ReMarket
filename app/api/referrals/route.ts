
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import {
  getReferralDashboardSummary,
} from "@/lib/referrals";

function jsonHeaders() {
  return {
    "Cache-Control": "no-store",
  };
}

/*
 * GET /api/referrals
 *
 * Returns the authenticated buyer's or seller's
 * referral dashboard summary.
 *
 * ADMIN accounts are not eligible for referrals.
 * User identity always comes from the server session.
 */

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    const userId = session?.user?.id;
    const role = session?.user?.role;

    /*
     * Require an authenticated account.
     */

    if (
      typeof userId !== "string" ||
      !userId
    ) {
      return NextResponse.json(
        {
          error: "Please sign in to view your referrals.",
        },
        {
          status: 401,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * Only buyers and sellers may use referrals.
     */

    if (
      role !== "BUYER" &&
      role !== "SELLER"
    ) {
      return NextResponse.json(
        {
          error:
            "Referral rewards are available to buyer and seller accounts only.",
        },
        {
          status: 403,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * Generate or retrieve the user's referral code
     * and obtain their referral statistics, history,
     * and rewards through the existing service.
     */

    const dashboard =
      await getReferralDashboardSummary(userId);

    return NextResponse.json(
      {
        success: true,
        dashboard,
      },
      {
        status: 200,
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    console.error(
      "Referral dashboard API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load your referral information. Please try again.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}
