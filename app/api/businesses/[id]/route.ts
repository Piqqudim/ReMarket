import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";
import { checkPublicRateLimit } from "@/lib/rate-limit";

const MAX_BUSINESS_ID_LENGTH = 100;

function getResponseHeaders(rateLimitHeaders: Headers): Headers {
  const headers = new Headers(rateLimitHeaders);
  headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
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

/**
 * Only expose an original price when it represents a valid discount:
 * - The current selling price must be a positive fixed price.
 * - The original price must be greater than the selling price.
 *
 * The original price is display information only. Checkout and order
 * calculations must continue to use Product.price.
 */
function getValidOriginalPrice(
  price: number | null,
  originalPrice: number | null,
): number | null {
  if (
    price === null ||
    !Number.isSafeInteger(price) ||
    price <= 0 ||
    originalPrice === null ||
    !Number.isSafeInteger(originalPrice) ||
    originalPrice <= price
  ) {
    return null;
  }

  return originalPrice;
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

    if (!id || !id.trim()) {
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
        ownerName: true,
        description: true,
        imageUrl: true,
        availability: true,
        verification: true,
        phone: true,

        // Contact details are only returned publicly when enabled by the seller.
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
            originalPrice: true,
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

        // Only active, non-deleted services are visible on public profiles.
        // Service price ranges remain supported independently of product pricing.
        services: {
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
            durationMinutes: true,
            fulfillmentType: true,
            availability: true,
            keywords: true,
            imageUrl: true,
            createdAt: true,
            updatedAt: true,
            category: {
              select: {
                id: true,
                name: true,
                iconKey: true,
                isActive: true,
                sortOrder: true,
              },
            },
            images: {
              select: {
                id: true,
                url: true,
                sortOrder: true,
              },
              orderBy: {
                sortOrder: "asc",
              },
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
            services: {
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
      reviewCount > 0 && reviewSummary._avg.rating !== null
        ? Number(reviewSummary._avg.rating.toFixed(1))
        : 0;

    /*
     * Contact information is only formatted and returned
     * when the seller has explicitly enabled public visibility.
     */
    const formattedSocialLinks: {
      id: string;
      platform: string;
      handle: string;
    }[] = [];

    if (business.showContactInfo === true) {
      for (const link of business.socialLinks) {
        formattedSocialLinks.push({
          id: link.id,
          platform: link.platform,
          handle: normalizeSocialHandle(
            link.platform,
            link.handle,
          ),
        });
      }

      const hasPhoneSocialLink = formattedSocialLinks.some(
        (link) => link.platform === "PHONE",
      );

      // Backward compatibility for older businesses with a legacy phone field.
      if (!hasPhoneSocialLink && business.phone) {
        formattedSocialLinks.push({
          id: `legacy-phone-${business.id}`,
          platform: "PHONE",
          handle: normalizeNigerianPhone(business.phone),
        });
      }
    }

    // Coordinates are used only to determine whether directions are available.
    // They are deliberately not included in the public response.
    const hasValidCoordinates = Boolean(
      business.location &&
        typeof business.location.lat === "number" &&
        Number.isFinite(business.location.lat) &&
        business.location.lat >= -90 &&
        business.location.lat <= 90 &&
        typeof business.location.long === "number" &&
        Number.isFinite(business.location.long) &&
        business.location.long >= -180 &&
        business.location.long <= 180,
    );

    const hasAddress = Boolean(
      business.location?.address?.trim(),
    );

    const hasDirections = hasValidCoordinates || hasAddress;

    const formattedBusiness = {
      id: business.id,
      name: business.name,
      ownerName: business.ownerName,
      description: business.description,
      imageUrl: business.imageUrl,

      // Do not expose ownerId or the removed claim-business state.
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
      serviceCount: business._count.services,
      averageRating,
      reviewCount,

      products: business.products.map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        originalPrice: getValidOriginalPrice(
          product.price,
          product.originalPrice,
        ),
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

      services: business.services.map((service) => ({
        id: service.id,
        name: service.name,
        description: service.description,
        price: service.price,
        priceMin: service.priceMin,
        priceMax: service.priceMax,
        durationMinutes: service.durationMinutes,
        fulfillmentType: service.fulfillmentType,
        availability: service.availability,
        keywords: service.keywords,
        imageUrl: service.imageUrl,
        createdAt: service.createdAt,
        updatedAt: service.updatedAt,
        category: service.category?.isActive
          ? {
              id: service.category.id,
              name: service.category.name,
              iconKey: service.category.iconKey,
              sortOrder: service.category.sortOrder,
            }
          : null,
        images: service.images.map((image) => ({
          id: image.id,
          url: image.url,
          sortOrder: image.sortOrder,
        })),
      })),

      // This remains an empty array when public contact visibility is disabled.
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
