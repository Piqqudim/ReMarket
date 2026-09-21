import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
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

    const business = await prisma.business.findUnique({
      where: {
        id,
      },

      include: {
        location: true,

        categories: {
          include: {
            category: true,
          },
        },

        products: {
          orderBy: {
            updatedAt: "desc",
          },

          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            priceMin: true,
            priceMax: true,
            availability: true,
            status: true,
            imageUrl: true,
            updatedAt: true,
          },
        },

        socialLinks: true,
      },
    });

    if (!business) {
      return NextResponse.json(
        {
          error: "Business not found",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      id: business.id,
      name: business.name,
      ownerName: business.ownerName,
      description: business.description,
      phone: business.phone,

      area:
        business.location?.area ??
        "Location not added",

      lat: business.location?.lat ?? null,
      lng: business.location?.long ?? null,

      status: business.status,
      verification: business.verification,
      availability: business.availability,

      categories: business.categories.map(
        (item) => item.category.name
      ),

      products: business.products.map(
        (product) => ({
          id: product.id,
          name: product.name,
          description: product.description,
          price: product.price,
          priceMin: product.priceMin,
          priceMax: product.priceMax,
          availability: product.availability,
          status: product.status,
          imageUrl: product.imageUrl,
          updatedAt: product.updatedAt,
        })
      ),

      socialLinks: business.socialLinks.map(
        (link) => ({
          id: link.id,
          platform: link.platform,
          handle: link.handle,
        })
      ),

      onboardedAt: business.onboardedAt,
    });
  } catch (error) {
    console.error(
      "Admin business GET error:",
      error
    );

    return NextResponse.json(
      {
        error: "Unable to load business",
      },
      {
        status: 500,
      }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  }
) {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        {
          error: "Business ID is required",
        },
        {
          status: 400,
        }
      );
    }

    const body = await request.json();

    const existingBusiness =
      await prisma.business.findUnique({
        where: { id },
      });

    if (!existingBusiness) {
      return NextResponse.json(
        {
          error: "Business not found",
        },
        {
          status: 404,
        }
      );
    }

    const data: {
      name?: string;
      ownerName?: string | null;
      description?: string | null;
      phone?: string | null;
      status?:
        | "ACTIVE"
        | "INACTIVE"
        | "PENDING";
      verification?:
        | "VERIFIED"
        | "UNVERIFIED";
      availability?:
        | "AVAILABLE"
        | "ASK_SELLER"
        | "UNAVAILABLE";
    } = {};

    if (body.name !== undefined) {
      if (
        typeof body.name !== "string" ||
        !body.name.trim()
      ) {
        return NextResponse.json(
          {
            error: "Business name cannot be empty",
          },
          {
            status: 400,
          }
        );
      }

      data.name = body.name.trim();
    }

    if (body.ownerName !== undefined) {
      data.ownerName =
        typeof body.ownerName === "string" &&
        body.ownerName.trim()
          ? body.ownerName.trim()
          : null;
    }

    if (body.description !== undefined) {
      data.description =
        typeof body.description === "string" &&
        body.description.trim()
          ? body.description.trim()
          : null;
    }

    if (body.phone !== undefined) {
      data.phone =
        typeof body.phone === "string" &&
        body.phone.trim()
          ? body.phone.trim()
          : null;
    }

    if (body.status !== undefined) {
      if (
        ![
          "ACTIVE",
          "INACTIVE",
          "PENDING",
        ].includes(body.status)
      ) {
        return NextResponse.json(
          {
            error: "Invalid business status",
          },
          {
            status: 400,
          }
        );
      }

      data.status = body.status;
    }

    if (body.verification !== undefined) {
      if (
        ![
          "VERIFIED",
          "UNVERIFIED",
        ].includes(body.verification)
      ) {
        return NextResponse.json(
          {
            error: "Invalid verification status",
          },
          {
            status: 400,
          }
        );
      }

      data.verification = body.verification;
    }

    if (body.availability !== undefined) {
      if (
        ![
          "AVAILABLE",
          "ASK_SELLER",
          "UNAVAILABLE",
        ].includes(body.availability)
      ) {
        return NextResponse.json(
          {
            error: "Invalid availability",
          },
          {
            status: 400,
          }
        );
      }

      data.availability =
        body.availability;
    }

    const business =
      await prisma.business.update({
        where: { id },

        data,

        include: {
          location: true,

          categories: {
            include: {
              category: true,
            },
          },

          products: {
            select: {
              id: true,
              name: true,
              price: true,
              priceMin: true,
              priceMax: true,
              availability: true,
              status: true,
              imageUrl: true,
              description: true,
              updatedAt: true,
            },

            orderBy: {
              updatedAt: "desc",
            },
          },

          socialLinks: true,
        },
      });

    return NextResponse.json({
      id: business.id,
      name: business.name,
      ownerName: business.ownerName,
      description: business.description,
      phone: business.phone,

      area:
        business.location?.area ??
        "Location not added",

      lat: business.location?.lat ?? null,
      lng: business.location?.long?? null,

      status: business.status,
      verification: business.verification,
      availability: business.availability,

      categories: business.categories.map(
        (item) => item.category.name
      ),

      products: business.products,

      socialLinks: business.socialLinks.map(
        (link) => ({
          id: link.id,
          platform: link.platform,
          handle: link.handle,
        })
      ),

      onboardedAt: business.onboardedAt,
    });
  } catch (error) {
    console.error(
      "Admin business PATCH error:",
      error
    );

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