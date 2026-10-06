import { NextResponse } from "next/server";

import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";

function cleanString(
  value: unknown
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function isValidEmail(
  email: string
): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  );
}

function jsonHeaders() {
  return {
    "Content-Type": "application/json",
  };
}

export async function POST(
  request: Request
) {
  try {
    const body: unknown =
      await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid request body.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    const payload =
      body as Record<
        string,
        unknown
      >;

    const name =
      cleanString(
        payload.name
      );

    const email =
      cleanString(
        payload.email
      ).toLowerCase();

    const password =
      typeof payload.password ===
      "string"
        ? payload.password
        : "";

    /*
     * -----------------------------------------
     * VALIDATION
     * -----------------------------------------
     */

    if (!name) {
      return NextResponse.json(
        {
          error:
            "Name is required.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      name.length >
      200
    ) {
      return NextResponse.json(
        {
          error:
            "Name is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (!email) {
      return NextResponse.json(
        {
          error:
            "Email is required.",
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
          error:
            "Enter a valid email address.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      email.length >
      320
    ) {
      return NextResponse.json(
        {
          error:
            "Email address is too long.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (!password) {
      return NextResponse.json(
        {
          error:
            "Password is required.",
        },
        {
          status: 400,
          headers: jsonHeaders(),
        }
      );
    }

    if (
      password.length <
      8
    ) {
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

    /*
     * Prevent unnecessarily large passwords
     * from being processed by bcrypt.
     */
    if (
      password.length >
      72
    ) {
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
     *
     * Only the hash is stored in the database.
     */

    const passwordHash =
      await bcrypt.hash(
        password,
        12
      );

    /*
     * -----------------------------------------
     * CREATE SELLER
     * -----------------------------------------
     */

    try {
      const user =
        await prisma.user.create({
          data: {
            name,
            email,
            password:
              passwordHash,
            role:
              "SELLER",
          },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        });

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
    } catch (
      error
    ) {
      /*
       * The email column is unique in Prisma.
       *
       * If two signup requests race, the
       * database unique constraint wins.
       */

      if (
        typeof error ===
          "object" &&
        error !== null &&
        "code" in error &&
        error.code ===
          "P2002"
      ) {
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

      throw error;
    }
  } catch (
    error
  ) {
    console.error(
      "Seller signup error:",
      error
    );

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