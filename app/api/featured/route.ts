import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const businesses = await prisma.business.findMany({
      where: {
        status: "ACTIVE",
      },

      include: {
        location: true,

        categories: {
          include: {
            category: true,
          },
        },

        products: {
          where: {
            status: "ACTIVE",
          },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            priceMin: true,
            priceMax: true,
            availability: true,
            imageUrl: true,
          },
          orderBy: {
            updatedAt: "desc",
          },
        },

        socialLinks: true,
      },

      orderBy: [
        {
          verification: "desc",
        },
        {
          onboardedAt: "desc",
        },
      ],

      take: 4,
    });

    const featured = businesses.map((business) => ({
      id: business.id,
      name: business.name,
      ownerName: business.ownerName,
      description: business.description,

      area: business.location?.area ?? "Location not added",

      availability: business.availability,
      verification: business.verification,

      category:
        business.categories[0]?.category.name ?? "Other",

      categories: business.categories.map(
        (item) => item.category.name
      ),

      productCount: business.products.length,

      products: business.products,

      socialLinks: business.socialLinks,
    }));

    return NextResponse.json({
      businesses: featured,
      total: featured.length,
    });
  } catch (error) {
    console.error("Featured businesses error:", error);

    return NextResponse.json(
      {
        businesses: [],
        total: 0,
        error: "Unable to load featured businesses",
      },
      {
        status: 500,
      }
    );
  }
}