import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

const AVAILABILITIES = [
  "AVAILABLE",
  "ASK_SELLER",
  "UNAVAILABLE",
] as const;

const BUSINESS_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "PENDING",
] as const;

type RouteContext = {
  params: Promise<{ id: string }>;
};

function isNonNegativeInteger(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
  );
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function cleanKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export async function GET(
  request: Request,
  { params }: RouteContext,
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id: businessId } = await params;

  if (!businessId) {
    return NextResponse.json(
      { error: "Business ID is required" },
      { status: 400 },
    );
  }

  try {
    const business = await prisma.business.findUnique({
      where: {
        id: businessId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!business) {
      return NextResponse.json(
        { error: "Business not found" },
        { status: 404 },
      );
    }

    const products = await prisma.product.findMany({
      where: {
        businessId,
      },
      orderBy: {
        updatedAt: "desc",
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      business,
      products,
    });
  } catch (error) {
    console.error("Admin business products GET error:", error);

    return NextResponse.json(
      { error: "Unable to load business products" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: RouteContext,
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id: businessId } = await params;

  if (!businessId) {
    return NextResponse.json(
      { error: "Business ID is required" },
      { status: 400 },
    );
  }

  try {
    const body = await request.json();

    const name = cleanString(body.name);

    if (!name) {
      return NextResponse.json(
        { error: "Product name is required" },
        { status: 400 },
      );
    }

    const business = await prisma.business.findUnique({
      where: {
        id: businessId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!business) {
      return NextResponse.json(
        { error: "Business not found" },
        { status: 404 },
      );
    }

    const description = cleanString(body.description);
    const imageUrl = cleanString(body.imageUrl);
    const categoryId = cleanString(body.categoryId);

    const price =
      body.price === null ||
      body.price === undefined ||
      body.price === ""
        ? null
        : Number(body.price);

    const priceMin =
      body.priceMin === null ||
      body.priceMin === undefined ||
      body.priceMin === ""
        ? null
        : Number(body.priceMin);

    const priceMax =
      body.priceMax === null ||
      body.priceMax === undefined ||
      body.priceMax === ""
        ? null
        : Number(body.priceMax);

    if (
      price !== null &&
      !isNonNegativeInteger(price)
    ) {
      return NextResponse.json(
        { error: "Price must be a non-negative whole number" },
        { status: 400 },
      );
    }

    if (
      priceMin !== null &&
      !isNonNegativeInteger(priceMin)
    ) {
      return NextResponse.json(
        { error: "Minimum price must be a non-negative whole number" },
        { status: 400 },
      );
    }

    if (
      priceMax !== null &&
      !isNonNegativeInteger(priceMax)
    ) {
      return NextResponse.json(
        { error: "Maximum price must be a non-negative whole number" },
        { status: 400 },
      );
    }

    if (
      priceMin !== null &&
      priceMax !== null &&
      priceMin > priceMax
    ) {
      return NextResponse.json(
        { error: "Minimum price cannot be greater than maximum price" },
        { status: 400 },
      );
    }

    const availability =
      typeof body.availability === "string" &&
      AVAILABILITIES.includes(body.availability as any)
        ? body.availability
        : "ASK_SELLER";

    const status =
      typeof body.status === "string" &&
      BUSINESS_STATUSES.includes(body.status as any)
        ? body.status
        : "ACTIVE";

    if (categoryId) {
      const category = await prisma.category.findUnique({
        where: {
          id: categoryId,
        },
        select: {
          id: true,
        },
      });

      if (!category) {
        return NextResponse.json(
          { error: "Category not found" },
          { status: 400 },
        );
      }
    }

    const product = await prisma.product.create({
      data: {
        businessId,
        name,
        description,
        categoryId,
        price,
        priceMin,
        priceMax,
        availability,
        keywords: cleanKeywords(body.keywords),
        imageUrl,
        status,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
        business: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        product,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Admin business product POST error:", error);

    return NextResponse.json(
      { error: "Unable to create product" },
      { status: 500 },
    );
  }
}