import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";
import {
  attachReferralAtSignup,
  ReferralServiceError,
} from "@/lib/referrals";

const MIN_PASSWORD_LENGTH = 8;
const MAX_BCRYPT_PASSWORD_BYTES = 72;
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 320;
const MAX_REQUEST_BODY_SIZE = 32 * 1024;

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

function isRequestTooLarge(request: Request): boolean {
  const contentLength =
    request.headers.get("content-length");

  if (contentLength === null) {
    return false;
  }

  const parsedLength = Number(contentLength);

  if (
    !Number.isSafeInteger(parsedLength) ||
    parsedLength < 0
  ) {
    return true;
  }

  return parsedLength > MAX_REQUEST_BODY_SIZE;
}

export async function POST(request: Request) {
  try {
    /*
     * -----------------------------------------
     * REQUEST SIZE
     * -----------------------------------------
     */

    if (isRequestTooLarge(request)) {
      return NextResponse.json(
        {
          error: "Request body is too large.",
        },
        {
          status: 413,
          headers: jsonHeaders(),
        }
      );
    }

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
        {
          error: "Invalid JSON body.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (!isRecord(body)) {
      return NextResponse.json(
        {
          error: "Invalid request body.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * READ INPUTS
     * -----------------------------------------
     */

    const name = cleanString(body.name);

    const email = cleanString(body.email)
      .toLowerCase();

    /*
     * Do not trim passwords. Spaces may be
     * an intentional part of the password.
     */
    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    /*
     * -----------------------------------------
     * VALIDATE NAME
     * -----------------------------------------
     */

    if (!name) {
      return NextResponse.json(
        {
          error: "Name is required.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (name.length > MAX_NAME_LENGTH) {
      return NextResponse.json(
        {
          error: "Name is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * VALIDATE EMAIL
     * -----------------------------------------
     */

    if (!email) {
      return NextResponse.json(
        {
          error: "Email address is required.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (email.length > MAX_EMAIL_LENGTH) {
      return NextResponse.json(
        {
          error: "Email address is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        {
          error: "Enter a valid email address.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * -----------------------------------------
     * VALIDATE PASSWORD
     * -----------------------------------------
     */

    if (!password) {
      return NextResponse.json(
        {
          error: "Password is required.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      Array.from(password).length <
      MIN_PASSWORD_LENGTH
    ) {
      return NextResponse.json(
        {
          error:
            `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    /*
     * Bcrypt's input limit is measured in UTF-8 bytes,
     * not JavaScript string characters.
     */
    const passwordBytes = Buffer.byteLength(
      password,
      "utf8"
    );

    if (
      passwordBytes >
      MAX_BCRYPT_PASSWORD_BYTES
    ) {
      return NextResponse.json(
        {
          error:
            "Password is too long. It must not exceed 72 UTF-8 bytes.",
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
     *
     * This check provides a friendly response.
     * The database unique constraint still protects
     * against concurrent duplicate signup requests.
     */

    const existingUser =
      await prisma.user.findUnique({
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
     * The new account and its referral attribution
     * are created inside the same transaction.
     *
     * If a supplied referral code is invalid,
     * attachReferralAtSignup throws and the
     * transaction rolls back.
     *
     * Referral codes are optional. Ordinary buyer
     * signup continues to work without one.
     *
     * The role is set on the server. A client cannot
     * create an administrator by supplying another role.
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
     * -----------------------------------------
     * SUCCESS
     * -----------------------------------------
     *
     * Preserve the existing behavior: the buyer
     * signs in separately after signup.
     *
     * Never return the password or password hash.
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
    /*
     * -----------------------------------------
     * REFERRAL VALIDATION ERRORS
     * -----------------------------------------
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
     * -----------------------------------------
     * UNIQUE CONSTRAINT ERRORS
     * -----------------------------------------
     *
     * The database is authoritative if concurrent
     * requests attempt to register the same email.
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

    console.error(
      "Buyer signup error:",
      error
    );

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