
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import {
  attachReferralAtSignup,
  ReferralServiceError,
} from "@/lib/referrals";

function cleanString(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function jsonHeaders() {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
}

function isPrismaUniqueConstraintError(
  error: unknown
): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export async function POST(request: Request) {
  try {
    /*
     * -----------------------------------------
     * PARSE REQUEST BODY
     * -----------------------------------------
     */

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body." },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (!isRecord(body)) {
      return NextResponse.json(
        { error: "Invalid request body." },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const name = cleanString(body.name);
    const email = cleanString(body.email).toLowerCase();

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    /*
     * -----------------------------------------
     * VALIDATION
     * -----------------------------------------
     */

    if (!name) {
      return NextResponse.json(
        { error: "Name is required." },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (name.length > 100) {
      return NextResponse.json(
        { error: "Name is too long." },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (!email) {
      return NextResponse.json(
        { error: "Email address is required." },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Enter a valid email address." },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (email.length > 320) {
      return NextResponse.json(
        { error: "Email address is too long." },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (!password) {
      return NextResponse.json(
        { error: "Password is required." },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        {
          error: "Password must be at least 8 characters.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (password.length > 100) {
      return NextResponse.json(
        { error: "Password is too long." },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * CHECK EXISTING ACCOUNT
     * -----------------------------------------
     */

    const existingUser = await prisma.user.findUnique({
      where: {
        email,
      },
      select: {
        id: true,
      },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          error:
            "An account with this email already exists.",
        },
        {
          status: 409,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * HASH PASSWORD
     * -----------------------------------------
     */

    const hashedPassword = await bcrypt.hash(
      password,
      12
    );

    /*
     * -----------------------------------------
     * CREATE BUYER AND ATTRIBUTE REFERRAL
     * -----------------------------------------
     *
     * The account and its referral attribution are
     * created in one transaction.
     *
     * If the supplied referral code is invalid,
     * the transaction rolls back and no account
     * is left partially created.
     *
     * Referral codes are optional, so ordinary
     * registration continues to work unchanged.
     */

    const user = await prisma.$transaction(
      async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            name,
            email,
            password: hashedPassword,
            role: "BUYER",
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        });

        await attachReferralAtSignup(
          tx,
          body.referralCode,
          {
            id: createdUser.id,
            role: createdUser.role,
          }
        );

        return createdUser;
      }
    );

    /*
     * Preserve the existing behavior:
     * the buyer signs in separately.
     *
     * Password hashes and referral records are
     * never returned to the client.
     */

    return NextResponse.json(
      {
        message:
          "Buyer account created successfully.",
        user,
      },
      {
        status: 201,
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    if (error instanceof ReferralServiceError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (isPrismaUniqueConstraintError(error)) {
      return NextResponse.json(
        {
          error:
            "An account with this email already exists.",
        },
        {
          status: 409,
          headers: jsonHeaders(),
        }
      );
    }

    console.error("Buyer signup error:", error);

    return NextResponse.json(
      {
        error:
          "Something went wrong. Please try again.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}
