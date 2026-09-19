// app/api/admin/businesses/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Business ID is required" },
        { status: 400 }
      );
    }

    // Keep the rest of your existing PATCH implementation here 
       const body = await request.json();

    const allowedStatuses = [
      "ACTIVE",
      "INACTIVE",
      "PENDING",
    ];

    const allowedVerification = [
      "VERIFIED",
      "UNVERIFIED",
    ];

    const allowedAvailability = [
      "AVAILABLE",
      "ASK_SELLER",
      "UNAVAILABLE",
    ];

    const data: {
      name?: string;
      ownerName?: string | null;
      description?: string | null;
      phone?: string | null;
      status?: "ACTIVE" | "INACTIVE" | "PENDING";
      verification?: "VERIFIED" | "UNVERIFIED";
      availability?:
        | "AVAILABLE"
        | "ASK_SELLER"
        | "UNAVAILABLE";
    } = {};

    if (typeof body.name === "string") {
      const name = body.name.trim();

      if (!name) {
        return NextResponse.json(
          { error: "Business name cannot be empty" },
          { status: 400 }
        );
      }

      data.name = name;
    }

    if ("ownerName" in body) {
      data.ownerName =
        typeof body.ownerName === "string"
          ? body.ownerName.trim() || null
          : null;
    }

    if ("description" in body) {
      data.description =
        typeof body.description === "string"
          ? body.description.trim() || null
          : null;
    }

    if ("phone" in body) {
      data.phone =
        typeof body.phone === "string"
          ? body.phone.trim() || null
          : null;
    }

    if (
      typeof body.status === "string" &&
      allowedStatuses.includes(body.status)
    ) {
      data.status = body.status;
    }

    if (
      typeof body.verification === "string" &&
      allowedVerification.includes(body.verification)
    ) {
      data.verification = body.verification;
    }

    if (
      typeof body.availability === "string" &&
      allowedAvailability.includes(body.availability)
    ) {
      data.availability = body.availability;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json(
        { error: "No valid fields supplied" },
        { status: 400 }
      );
    }

    const business = await prisma.business.update({
      where: {
        id,
      },
      data,

      select: {
        id: true,
        name: true,
        ownerName: true,
        description: true,
        phone: true,
        status: true,
        verification: true,
        availability: true,
      },
    });

    return NextResponse.json({
      business,
    });
  } catch (error) {
    console.error("Admin business PATCH error:", error);

    return NextResponse.json(
      {
        error: "Unable to update business",
      },
      {
        status: 500,
      }
    );
  }
}