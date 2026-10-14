
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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function jsonHeaders() {
  return {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
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
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
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

    if (name.length > 200) {
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
        { error: "Email is required." },
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
          error:
            "Password must be at least 8 characters.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    // bcrypt only safely processes up to 72 password bytes.
    if (password.length > 72) {
      return NextResponse.json(
        {
          error:
            "Password must not exceed 72 characters.",
        },
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
      where: { email },
      select: { id: true },
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

    const passwordHash = await bcrypt.hash(password, 12);

    /*
     * -----------------------------------------
     * CREATE SELLER AND ATTRIBUTE REFERRAL
     * -----------------------------------------
     *
     * Both operations use the same transaction.
     *
     * If referral validation or attribution fails,
     * user creation rolls back too.
     *
     * Without a referralCode, registration continues
     * normally.
     */

    const user = await prisma.$transaction(
      async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            name,
            email,
            password: passwordHash,
            role: "SELLER",
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

    return NextResponse.json(
      {
        message:
          "Seller account created successfully.",
        user,
      },
      {
        status: 201,
        headers: jsonHeaders(),
      }
    );
  } catch (error) {
    /*
     * A referral error rolls back the complete transaction.
     */
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

    /*
     * The database unique constraint is authoritative
     * if concurrent signup requests use the same email.
     */
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

    console.error("Seller signup error:", error);

    return NextResponse.json(
      {
        error:
          "Unable to create seller account.",
      },
      {
        status: 500,
        headers: jsonHeaders(),
      }
    );
  }
}
