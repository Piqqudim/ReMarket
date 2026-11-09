
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkPublicRateLimit } from "@/lib/rate-limit";

const MAX_SERVICE_ID_LENGTH = 100;

function noStoreHeaders(baseHeaders?: HeadersInit): Headers {
  const headers = new Headers(baseHeaders);
  headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  return headers;
}

function jsonError(
  message: string,
  status: number,
  baseHeaders?: HeadersInit,
) {
  return NextResponse.json(
    { service: null, error: message },
    {
      status,
      headers: noStoreHeaders(baseHeaders),
    },
  );
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
    return jsonError(
      "Too many service requests. Please try again shortly.",
      429,
      rateLimit.headers,
    );
  }

  try {
    const { id } = await params;
    const serviceId = id?.trim();

    if (
      !serviceId ||
      serviceId.length > MAX_SERVICE_ID_LENGTH
    ) {
      return jsonError(
        "Invalid service ID.",
        400,
        rateLimit.headers,
      );
    }

    const service = await prisma.service.findFirst({
      where: {
        id: serviceId,
        status: "ACTIVE",
        deletedAt: null,
        business: {
          is: {
            status: "ACTIVE",
            deletedAt: null,
          },
        },
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
            createdAt: true,
          },
          orderBy: [
            { sortOrder: "asc" },
            { createdAt: "asc" },
          ],
        },

        business: {
          select: {
            id: true,
            name: true,
            ownerName: true,
            description: true,
            imageUrl: true,
            phone: true,
            availability: true,
            verification: true,
            showContactInfo: true,

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

            socialLinks: {
              select: {
                id: true,
                platform: true,
                handle: true,
              },
            },
          },
        },
      },
    });

    if (!service) {
      return jsonError(
        "Service not found.",
        404,
        rateLimit.headers,
      );
    }

    /*
     * --------------------------------------------------
     * SELLER CONTACT PRIVACY
     * --------------------------------------------------
     *
     * Phone numbers and social links are only exposed
     * when the seller enables showContactInfo.
     * --------------------------------------------------
     */

    const seller = service.business;
    const showContactInfo = seller.showContactInfo === true;

    const socialLinks = showContactInfo
      ? seller.socialLinks
          .map((link) => ({
            id: link.id,
            platform: link.platform,
            handle: normalizeSocialHandle(
              link.platform,
              link.handle,
            ),
          }))
          .filter((link) => Boolean(link.handle))
      : [];

    /*
     * Compatibility with older businesses that store
     * their phone number directly on Business.
     */

    if (
      showContactInfo &&
      seller.phone &&
      !socialLinks.some((link) => link.platform === "PHONE")
    ) {
      socialLinks.push({
        id: `legacy-phone-${seller.id}`,
        platform: "PHONE",
        handle: normalizeNigerianPhone(seller.phone),
      });
    }

    const categoryNames = seller.categories.map(
      (item) => item.category.name,
    );

    /*
     * --------------------------------------------------
     * PUBLIC SERVICE RESPONSE
     * --------------------------------------------------
     *
     * Cloudinary public IDs and private ownership fields
     * are not included in the response.
     * --------------------------------------------------
     */

    const formattedService = {
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

      seller: {
        id: seller.id,
        name: seller.name,
        ownerName: seller.ownerName,
        description: seller.description,
        imageUrl: seller.imageUrl,
        availability: seller.availability,
        verification: seller.verification,
        verified: seller.verification === "VERIFIED",
        showContactInfo,

        location: seller.location
          ? {
              id: seller.location.id,
              area: seller.location.area,
              street: seller.location.street,
              address: seller.location.address,
              verification: seller.location.verification,
            }
          : null,

        categories: categoryNames,
        category: categoryNames[0] ?? "Uncategorised",
        socialLinks,
      },
    };

    return NextResponse.json(
      {
        service: formattedService,
      },
      {
        headers: noStoreHeaders(rateLimit.headers),
      },
    );
  } catch (error) {
    console.error(
      "Public Service Details API error:",
      error,
    );

    return jsonError(
      "Unable to load this service. Please try again.",
      500,
      rateLimit.headers,
    );
  }
}
