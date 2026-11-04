
import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { checkPublicRateLimit } from "@/lib/rate-limit";

const HOME_PRODUCT_LIMIT = 8;
const HOME_SERVICE_LIMIT = 8;
const HOME_CATEGORY_LIMIT = 12;

const homeSellerSelect = {
  id: true,
  name: true,
  ownerName: true,
  imageUrl: true,
  availability: true,
  verification: true,
  showContactInfo: true,
  phone: true,
  location: {
    select: {
      id: true,
      area: true,
      street: true,
      address: true,
      verification: true,
    },
  },
  categories: {
    where: {
      category: { isActive: true },
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
  socialLinks: {
    select: {
      id: true,
      platform: true,
      handle: true,
    },
  },
} satisfies Prisma.BusinessSelect;

const homeProductSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  priceMin: true,
  priceMax: true,
  availability: true,
  imageUrl: true,
  createdAt: true,
  category: {
    select: {
      id: true,
      name: true,
      iconKey: true,
      isActive: true,
    },
  },
  images: {
    select: {
      id: true,
      url: true,
      publicId: true,
      sortOrder: true,
    },
    orderBy: [
      { sortOrder: "asc" },
      { createdAt: "asc" },
    ],
    take: 1,
  },
  business: {
    select: homeSellerSelect,
  },
} satisfies Prisma.ProductSelect;

const homeServiceSelect = {
  id: true,
  name: true,
  description: true,
  price: true,
  priceMin: true,
  priceMax: true,
  durationMinutes: true,
  fulfillmentType: true,
  availability: true,
  imageUrl: true,
  createdAt: true,
  category: {
    select: {
      id: true,
      name: true,
      iconKey: true,
      isActive: true,
    },
  },
  images: {
    select: {
      id: true,
      url: true,
      publicId: true,
      sortOrder: true,
    },
    orderBy: [
      { sortOrder: "asc" },
      { createdAt: "asc" },
    ],
    take: 1,
  },
  business: {
    select: homeSellerSelect,
  },
} satisfies Prisma.ServiceSelect;

type HomeSeller = Prisma.BusinessGetPayload<{
  select: typeof homeSellerSelect;
}>;

type HomeProduct = Prisma.ProductGetPayload<{
  select: typeof homeProductSelect;
}>;

type HomeService = Prisma.ServiceGetPayload<{
  select: typeof homeServiceSelect;
}>;

function responseHeaders(baseHeaders?: HeadersInit): Headers {
  const headers = new Headers(baseHeaders);
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

  if (platform === "PHONE" || platform === "WHATSAPP") {
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

function formatSeller(business: HomeSeller) {
  const showContactInfo = business.showContactInfo === true;

  const socialLinks = showContactInfo
    ? business.socialLinks.map((link) => ({
        id: link.id,
        platform: link.platform,
        handle: normalizeSocialHandle(
          link.platform,
          link.handle,
        ),
      }))
    : [];

  if (
    showContactInfo &&
    business.phone &&
    !socialLinks.some((link) => link.platform === "PHONE")
  ) {
    socialLinks.push({
      id: `legacy-phone-${business.id}`,
      platform: "PHONE",
      handle: normalizeNigerianPhone(business.phone),
    });
  }

  const categories = business.categories.map(
    (item) => item.category.name,
  );

  return {
    id: business.id,
    name: business.name,
    ownerName: business.ownerName,
    imageUrl: business.imageUrl,
    availability: business.availability,
    verification: business.verification,
    verified: business.verification === "VERIFIED",
    showContactInfo,
    location: business.location
      ? {
          id: business.location.id,
          area: business.location.area,
          street: business.location.street,
          address: business.location.address,
          verification: business.location.verification,
        }
      : null,
    categories,
    category: categories[0] ?? "Uncategorised",
    socialLinks,
  };
}

function formatProduct(product: HomeProduct) {
  return {
    id: product.id,
    type: "PRODUCT" as const,
    name: product.name,
    description: product.description,
    price: product.price,
    priceMin: product.priceMin,
    priceMax: product.priceMax,
    availability: product.availability,
    imageUrl: product.imageUrl,
    createdAt: product.createdAt,
    category: product.category?.isActive
      ? {
          id: product.category.id,
          name: product.category.name,
          iconKey: product.category.iconKey,
        }
      : null,
    images: product.images.map((image) => ({
      id: image.id,
      url: image.url,
      publicId: image.publicId,
      sortOrder: image.sortOrder,
    })),
    seller: formatSeller(product.business),
  };
}

function formatService(service: HomeService) {
  return {
    id: service.id,
    type: "SERVICE" as const,
    name: service.name,
    description: service.description,
    price: service.price,
    priceMin: service.priceMin,
    priceMax: service.priceMax,
    durationMinutes: service.durationMinutes,
    fulfillmentType: service.fulfillmentType,
    availability: service.availability,
    imageUrl: service.imageUrl,
    createdAt: service.createdAt,
    category: service.category?.isActive
      ? {
          id: service.category.id,
          name: service.category.name,
          iconKey: service.category.iconKey,
        }
      : null,
    images: service.images.map((image) => ({
      id: image.id,
      url: image.url,
      publicId: image.publicId,
      sortOrder: image.sortOrder,
    })),
    seller: formatSeller(service.business),
  };
}

export async function GET(request: NextRequest) {
  const rateLimit = checkPublicRateLimit(request, "featured");

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        products: [],
        services: [],
        categories: [],
        error: "Too many requests. Please try again shortly.",
      },
      {
        status: 429,
        headers: responseHeaders(rateLimit.headers),
      },
    );
  }

  try {
    const activeBusinessWhere = {
      status: "ACTIVE" as const,
      deletedAt: null,
      business: {
        is: {
          status: "ACTIVE" as const,
          deletedAt: null,
        },
      },
    };

    const [
      products,
      services,
      categories,
      totalProducts,
      totalServices,
    ] = await Promise.all([
      prisma.product.findMany({
        where: {
          ...activeBusinessWhere,
          availability: {
            not: "UNAVAILABLE",
          },
        },
        select: homeProductSelect,
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        take: HOME_PRODUCT_LIMIT,
      }),

      prisma.service.findMany({
        where: {
          ...activeBusinessWhere,
          availability: {
            not: "UNAVAILABLE",
          },
        },
        select: homeServiceSelect,
        orderBy: [
          { createdAt: "desc" },
          { id: "desc" },
        ],
        take: HOME_SERVICE_LIMIT,
      }),

      prisma.category.findMany({
        where: {
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          iconKey: true,
          sortOrder: true,
        },
        orderBy: [
          { sortOrder: "asc" },
          { name: "asc" },
        ],
        take: HOME_CATEGORY_LIMIT,
      }),

      prisma.product.count({
        where: activeBusinessWhere,
      }),

      prisma.service.count({
        where: activeBusinessWhere,
      }),
    ]);

    const formattedProducts = products.map(formatProduct);
    const formattedServices = services.map(formatService);

    const listings = [
      ...formattedProducts,
      ...formattedServices,
    ].sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime(),
    );

    return NextResponse.json(
      {
        products: formattedProducts,
        services: formattedServices,
        listings,
        categories,
        meta: {
          returnedProducts: formattedProducts.length,
          returnedServices: formattedServices.length,
          totalProducts,
          totalServices,
          productLimit: HOME_PRODUCT_LIMIT,
          serviceLimit: HOME_SERVICE_LIMIT,
        },
      },
      {
        headers: responseHeaders(rateLimit.headers),
      },
    );
  } catch (error) {
    console.error("Home API error:", error);

    return NextResponse.json(
      {
        products: [],
        services: [],
        listings: [],
        categories: [],
        error: "Unable to load ReMarket homepage content.",
      },
      {
        status: 500,
        headers: responseHeaders(rateLimit.headers),
      },
    );
  }
}
