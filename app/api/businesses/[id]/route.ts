
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";
import { checkPublicRateLimit } from "@/lib/rate-limit";

const MAX_BUSINESS_ID_LENGTH = 100;

function getResponseHeaders(rateLimitHeaders: Headers): Headers {
  const headers = new Headers(rateLimitHeaders);
  headers.set("Cache-Control", "no-store");
  return headers;
}

function normalizeNigerianPhone(value: string): string {
  let clean = value.trim().replace(/[^\d+]/g, "");

  if (!clean) return "";
  if (clean.startsWith("00")) clean = clean.slice(2);
  if (clean.startsWith("+")) clean = clean.slice(1);
  if (clean.startsWith("234")) return `+${clean}`;
  if (clean.startsWith("0")) return `+234${clean.slice(1)}`;

  return `+234${clean}`;
}

function normalizeSocialHandle(
  platform: string,
  handle: string,
): string {
  const clean = handle.trim();
  if (!clean) return "";

  if (platform === "WHATSAPP" || platform === "PHONE") {
    if (
      clean.startsWith("http://") ||
      clean.startsWith("https://")
    ) {
      return clean;
    }

    return normalizeNigerianPhone(clean);
  }

  return clean;
}

export async function GET(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ id: string }>;
  },
) {
  const rateLimit = checkPublicRateLimit(request, "featured");

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: "Too many business requests. Please try again shortly.",
      },
      {
        status: 429,
        headers: getResponseHeaders(rateLimit.headers),
      },
    );
  }

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Business ID is required." },
        {
          status: 400,
          headers: getResponseHeaders(rateLimit.headers),
        },
      );
    }

    if (id.length > MAX_BUSINESS_ID_LENGTH) {
      return NextResponse.json(
        { error: "Invalid business ID." },
        {
          status: 400,
          headers: getResponseHeaders(rateLimit.headers),
        },
      );
    }

    const business = await prisma.business.findFirst({
      where: {
        id,
        status: "ACTIVE",
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        ownerId: true,
        ownerName: true,
        description: true,
        imageUrl: true,
        availability: true,
        verification: true,
        phone: true,

        // Seller contact visibility preference.
        showContactInfo: true,

        location: {
          select: {
            id: true,
            area: true,
            street: true,
            address: true,
            lat: true,
            long: true,
            verification: true,
          },
        },

        categories: {
          where: {
            category: {
              isActive: true,
            },
          },
          select: {
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },

        products: {
          where: {
            status: "ACTIVE",
            deletedAt: null,
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
            keywords: true,
            images: {
              select: {
                id: true,
                url: true,
                publicId: true,
                sortOrder: true,
                createdAt: true,
              },
              orderBy: [
                { sortOrder: "asc" },
                { createdAt: "asc" },
              ],
            },
          },
          orderBy: {
            updatedAt: "desc",
          },
        },

        _count: {
          select: {
            products: {
              where: {
                status: "ACTIVE",
                deletedAt: null,
              },
            },
          },
        },

        socialLinks: {
          select: {
            id: true,
            platform: true,
            handle: true,
          },
        },
      },
    });

    if (!business) {
      return NextResponse.json(
        { error: "Business not found." },
        {
          status: 404,
          headers: getResponseHeaders(rateLimit.headers),
        },
      );
    }

    const reviewSummary = await prisma.businessReview.aggregate({
      where: {
        businessId: business.id,
      },
      _avg: {
        rating: true,
      },
      _count: {
        _all: true,
      },
    });

    const reviewCount = reviewSummary._count._all;

    const averageRating =
      reviewCount > 0 &&
      reviewSummary._avg.rating !== null
        ? Number(reviewSummary._avg.rating.toFixed(1))
        : 0;

    /*
     * Contact information is only formatted and returned
     * when the seller has explicitly enabled public visibility.
     */
    let formattedSocialLinks: {
      id: string;
      platform: string;
      handle: string;
    }[] = [];

    if (business.showContactInfo === true) {
      formattedSocialLinks = business.socialLinks.map((link) => ({
        id: link.id,
        platform: link.platform,
        handle: normalizeSocialHandle(
          link.platform,
          link.handle,
        ),
      }));

      const hasPhoneSocialLink = formattedSocialLinks.some(
        (link) => link.platform === "PHONE",
      );

      // Backward compatibility for older businesses.
      if (!hasPhoneSocialLink && business.phone) {
        formattedSocialLinks.push({
          id: `legacy-phone-${business.id}`,
          platform: "PHONE",
          handle: normalizeNigerianPhone(business.phone),
        });
      }
    }

    const hasDirections = Boolean(
      business.location &&
        (
          (
            typeof business.location.lat === "number" &&
            Number.isFinite(business.location.lat) &&
            business.location.lat >= -90 &&
            business.location.lat <= 90 &&
            typeof business.location.long === "number" &&
            Number.isFinite(business.location.long) &&
            business.location.long >= -180 &&
            business.location.long <= 180
          ) ||
          (
            typeof business.location.address === "string" &&
            business.location.address.trim().length > 0
          )
        ),
    );

    const formattedBusiness = {
      id: business.id,
      name: business.name,
      ownerName: business.ownerName,
      description: business.description,
      imageUrl: business.imageUrl,
      claimable: business.ownerId === null,

      // Safe visibility flag. Never expose ownerId.
      showContactInfo: business.showContactInfo === true,

      location: {
        id: business.location?.id ?? null,
        area: business.location?.area ?? "Location not added",
        street: business.location?.street ?? null,
        address: business.location?.address ?? null,
        hasDirections,
        verification:
          business.location?.verification ?? "UNVERIFIED",
      },

      availability: business.availability,
      verification: business.verification,
      verified: business.verification === "VERIFIED",

      category:
        business.categories[0]?.category?.name ?? "Other",

      categories: business.categories.map(
        (item) => item.category.name,
      ),

      productCount: business._count.products,
      averageRating,
      reviewCount,

      products: business.products.map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        priceMin: product.priceMin,
        priceMax: product.priceMax,
        availability: product.availability,
        imageUrl: product.imageUrl,
        keywords: product.keywords,

        images: product.images.map((image) => ({
          id: image.id,
          url: image.url,
          publicId: image.publicId,
          sortOrder: image.sortOrder,
        })),
      })),

      // Empty array when contact visibility is private.
      socialLinks: formattedSocialLinks,
    };

    return NextResponse.json(
      { business: formattedBusiness },
      {
        headers: getResponseHeaders(rateLimit.headers),
      },
    );
  } catch (error) {
    console.error("Public Business API error:", error);

    return NextResponse.json(
      { error: "Unable to load business." },
      {
        status: 500,
        headers: getResponseHeaders(rateLimit.headers),
      },
    );
  }
}
