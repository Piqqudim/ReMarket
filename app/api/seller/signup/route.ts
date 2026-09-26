import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body)
    ) {
      return NextResponse.json(
        {
          error: "Invalid request body.",
        },
        {
          status: 400,
        }
      );
    }

    const payload = body as Record<string, unknown>;

    const name = cleanString(payload.name);
    const email = cleanString(payload.email).toLowerCase();
    const password =
      typeof payload.password === "string"
        ? payload.password
        : "";

    if (!name) {
      return NextResponse.json(
        {
          error: "Name is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (!email) {
      return NextResponse.json(
        {
          error: "Email is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (!password) {
      return NextResponse.json(
        {
          error: "Password is required.",
        },
        {
          status: 400,
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
        }
      );
    }

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
          error: "An account with this email already exists.",
        },
        {
          status: 409,
        }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
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

    return NextResponse.json(
      {
        message: "Seller account created successfully.",
        user,
      },
      {
        status: 201,
      }
    );
  } catch (error) {
    console.error(
      "Seller signup error:",
      error
    );

    return NextResponse.json(
      {
        error: "Unable to create seller account.",
      },
      {
        status: 500,
      }
    );
  }
}