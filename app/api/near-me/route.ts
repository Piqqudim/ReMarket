import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";
import {
  haversineDistance,
} from "@/lib/distance";
import {
  reverseGeocodeLocation,
} from "@/lib/geocoding";

/**
 * ------------------------------------------------
 * REMARKET NEAR ME CONFIGURATION
 * ------------------------------------------------
 *
 * Ranking hierarchy:
 *
 * 1. Same Street
 * 2. Adjacent Street
 * 3. Nearby Street
 * 4. Whole Area
 *
 * Ranking level always takes precedence over
 * raw physical distance.
 */

/**
 * Maximum physical distance used by the
 * street-based Near Me levels.
 *
 * Can be overridden with:
 *
 * REMARKET_NEAR_ME_RADIUS_KM=10
 */
const DEFAULT_NEAR_ME_RADIUS_KM = 10;

/**
 * Maximum distance for Adjacent Street.
 *
 * Can be overridden with:
 *
 * REMARKET_ADJACENT_STREET_MAX_KM=1
 */
const DEFAULT_ADJACENT_STREET_MAX_KM = 1;

type ParsedCoordinate =
  | number
  | null
  | "INVALID";

type NearMeRanking =
  | 1
  | 2
  | 3
  | 4;

type NearMeRankingLabel =
  | "same-street"
  | "adjacent-street"
  | "nearby-street"
  | "whole-area";

type RankedBusiness = {
  id: string;
  name: string;
  ownerName: string | null;
  description: string | null;
  imageUrl: string | null;
  area: string;
  location: ReturnType<
    typeof serializeLocation
  >;
  availability:
    | "AVAILABLE"
    | "ASK_SELLER"
    | "UNAVAILABLE";
  verification:
    | "VERIFIED"
    | "UNVERIFIED";
  verified: boolean;
  categories: unknown;
  products: unknown;
  socialLinks: unknown;

  distanceKm:
    number | null;

  ranking:
    NearMeRanking;

  rankingLabel:
    NearMeRankingLabel;

  distanceKmRaw:
    number | null;
};

function getNearMeRadiusKm(): number {
  const configured =
    Number(
      process.env
        .REMARKET_NEAR_ME_RADIUS_KM
    );

  if (
    Number.isFinite(
      configured
    ) &&
    configured > 0
  ) {
    return configured;
  }

  return DEFAULT_NEAR_ME_RADIUS_KM;
}

function getAdjacentStreetMaxKm(): number {
  const configured =
    Number(
      process.env
        .REMARKET_ADJACENT_STREET_MAX_KM
    );

  if (
    Number.isFinite(
      configured
    ) &&
    configured > 0
  ) {
    return configured;
  }

  return DEFAULT_ADJACENT_STREET_MAX_KM;
}

function clean(
  value: string | null
): string {
  return value?.trim() ?? "";
}

function parseCoordinate(
  value: string | null
): ParsedCoordinate {
  if (!value?.trim()) {
    return null;
  }

  const parsed =
    Number(
      value.trim()
    );

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return "INVALID";
  }

  return parsed;
}

function isValidLatitude(
  value: number | null
): value is number {
  return (
    value !== null &&
    Number.isFinite(
      value
    ) &&
    value >= -90 &&
    value <= 90
  );
}

function isValidLongitude(
  value: number | null
): value is number {
  return (
    value !== null &&
    Number.isFinite(
      value
    ) &&
    value >= -180 &&
    value <= 180
  );
}

function formatDistance(
  distanceKm: number
): number {
  return Number(
    distanceKm.toFixed(1)
  );
}

/**
 * ------------------------------------------------
 * STREET NORMALIZATION
 * ------------------------------------------------
 *
 * Used for comparing the buyer's reverse-
 * geocoded road against the stored business
 * street.
 */
function normalizeStreetName(
  value: string
): string {
  let normalized =
    value
      .normalize("NFKD")
      .replace(
        /[\u0300-\u036f]/g,
        ""
      )
      .toLowerCase()
      .replace(
        /[.,'"`’()-]+/g,
        " "
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  const replacements: Array<
    [RegExp, string]
  > = [
    [
      /\bst\b/g,
      "street",
    ],
    [
      /\brd\b/g,
      "road",
    ],
    [
      /\bave\b/g,
      "avenue",
    ],
    [
      /\bdr\b/g,
      "drive",
    ],
    [
      /\bln\b/g,
      "lane",
    ],
    [
      /\bcl\b/g,
      "close",
    ],
    [
      /\bcres\b/g,
      "crescent",
    ],
    [
      /\bblvd\b/g,
      "boulevard",
    ],
    [
      /\bexpwy\b/g,
      "expressway",
    ],
  ];

  for (
    const [
      pattern,
      replacement,
    ] of replacements
  ) {
    normalized =
      normalized.replace(
        pattern,
        replacement
      );
  }

  return normalized
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function streetsMatch(
  first: string | null,
  second: string | null
): boolean {
  if (
    !first ||
    !second
  ) {
    return false;
  }

  const normalizedFirst =
    normalizeStreetName(
      first
    );

  const normalizedSecond =
    normalizeStreetName(
      second
    );

  if (
    !normalizedFirst ||
    !normalizedSecond
  ) {
    return false;
  }

  return (
    normalizedFirst ===
    normalizedSecond
  );
}

/**
 * ------------------------------------------------
 * AREA NORMALIZATION
 * ------------------------------------------------
 *
 * Whole Area uses the detected buyer area
 * and the business Location.area.
 *
 * The values are normalized before comparison
 * so differences in case, punctuation, and
 * whitespace do not prevent a match.
 */
function normalizeAreaName(
  value: string
): string {
  return value
    .normalize("NFKD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function areasMatch(
  first: string | null,
  second: string | null
): boolean {
  if (
    !first ||
    !second
  ) {
    return false;
  }

  const normalizedFirst =
    normalizeAreaName(
      first
    );

  const normalizedSecond =
    normalizeAreaName(
      second
    );

  if (
    !normalizedFirst ||
    !normalizedSecond
  ) {
    return false;
  }

  return (
    normalizedFirst ===
    normalizedSecond
  );
}

/**
 * ------------------------------------------------
 * LEGACY STREET FALLBACK
 * ------------------------------------------------
 *
 * Existing locations created before the
 * dedicated Location.street field was added
 * may still have street information inside
 * the canonical address.
 */
function parseLegacyStreetFromAddress(
  address: string | null,
  area: string
): string | null {
  if (!address) {
    return null;
  }

  let parts =
    address
      .split(",")
      .map((part) =>
        part.trim()
      )
      .filter(Boolean);

  if (
    parts.length ===
    0
  ) {
    return null;
  }

  const lastPart =
    parts[
      parts.length - 1
    ];

  if (
    lastPart.toLowerCase() ===
    "nigeria"
  ) {
    parts =
      parts.slice(
        0,
        -1
      );
  }

  if (
    parts.length > 0 &&
    area &&
    parts[
      parts.length - 1
    ].toLowerCase() ===
      area.trim().toLowerCase()
  ) {
    parts =
      parts.slice(
        0,
        -1
      );
  }

  if (
    parts.length ===
    0
  ) {
    return null;
  }

  if (
    parts.length ===
    1
  ) {
    return (
      parts[0] ||
      null
    );
  }

  if (
    parts.length ===
    2
  ) {
    const firstPart =
      parts[0];

    const looksLikeHouseNumber =
      /^\d+[A-Za-z]?(?:\s*[/-]\s*[\w-]+)?$/.test(
        firstPart
      );

    if (
      looksLikeHouseNumber
    ) {
      return (
        parts[1] ||
        null
      );
    }

    return (
      parts[0] ||
      null
    );
  }

  return (
    parts[1] ||
    null
  );
}

function getBusinessStreet(
  location: {
    street: string | null;
    address: string | null;
    area: string;
  }
): string | null {
  const storedStreet =
    location.street?.trim() ??
    "";

  if (storedStreet) {
    return storedStreet;
  }

  return parseLegacyStreetFromAddress(
    location.address,
    location.area
  );
}

function serializeLocation(
  location: {
    id: string;
    area: string;
    street: string | null;
  } | null
) {
  if (!location) {
    return null;
  }

  /*
   * Exact business coordinates remain
   * server-side.
   */
  return {
    id:
      location.id,

    area:
      location.area,

    street:
      location.street,
  };
}

export async function GET(
  request: NextRequest
) {
  try {
    const {
      searchParams,
    } = new URL(
      request.url
    );

    /*
     * -----------------------------------------
     * READ QUERY PARAMETERS
     * -----------------------------------------
     */

    const area =
      clean(
        searchParams.get(
          "area"
        )
      );

    const latitudeRaw =
      searchParams.get(
        "lat"
      );

    const longitudeRaw =
      searchParams.get(
        "lng"
      ) ??
      searchParams.get(
        "long"
      );

    const parsedLatitude =
      parseCoordinate(
        latitudeRaw
      );

    const parsedLongitude =
      parseCoordinate(
        longitudeRaw
      );

    const latitudeSupplied =
      latitudeRaw !==
        null &&
      latitudeRaw.trim() !==
        "";

    const longitudeSupplied =
      longitudeRaw !==
        null &&
      longitudeRaw.trim() !==
        "";

    /*
     * -----------------------------------------
     * VALIDATE SUPPLIED COORDINATES
     * -----------------------------------------
     */

    if (
      (
        latitudeSupplied &&
        parsedLatitude ===
          "INVALID"
      ) ||
      (
        longitudeSupplied &&
        parsedLongitude ===
          "INVALID"
      )
    ) {
      return NextResponse.json(
        {
          businesses: [],
          total: 0,
          mode:
            "none",
          location:
            null,
          error:
            "Latitude and longitude must be valid numbers.",
        },
        {
          status: 400,
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    const latitude:
      | number
      | null =
      parsedLatitude ===
      "INVALID"
        ? null
        : parsedLatitude;

    const longitude:
      | number
      | null =
      parsedLongitude ===
      "INVALID"
        ? null
        : parsedLongitude;

    const hasLatitude =
      latitude !==
      null;

    const hasLongitude =
      longitude !==
      null;

    /*
     * GPS mode requires both coordinates.
     *
     * Existing area precedence remains intact.
     */
    const hasPartialGps =
      hasLatitude !==
      hasLongitude;

    if (
      hasPartialGps &&
      !area
    ) {
      return NextResponse.json(
        {
          businesses: [],
          total: 0,
          mode:
            "none",
          location:
            null,
          error:
            "Both latitude and longitude are required for current-location search.",
        },
        {
          status: 400,
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    /*
     * -----------------------------------------
     * VALIDATE GEOGRAPHIC RANGE
     * -----------------------------------------
     */

    if (
      (
        hasLatitude &&
        !isValidLatitude(
          latitude
        )
      ) ||
      (
        hasLongitude &&
        !isValidLongitude(
          longitude
        )
      )
    ) {
      return NextResponse.json(
        {
          businesses: [],
          total: 0,
          mode:
            "none",
          location:
            null,
          error:
            "Latitude must be between -90 and 90, and longitude must be between -180 and 180.",
        },
        {
          status: 400,
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    const hasValidGps =
      isValidLatitude(
        latitude
      ) &&
      isValidLongitude(
        longitude
      );

    const searchMode =
      area
        ? "area"
        : hasValidGps
          ? "gps"
          : "none";

    /*
     * -----------------------------------------
     * NO LOCATION PROVIDED
     * -----------------------------------------
     */

    if (
      searchMode ===
      "none"
    ) {
      return NextResponse.json(
        {
          businesses: [],
          total: 0,
          mode:
            "none",
          location:
            null,
        },
        {
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    /*
     * -----------------------------------------
     * EXPLICIT AREA SEARCH
     * -----------------------------------------
     *
     * This remains separate from GPS Near Me.
     *
     * When a caller explicitly asks for an area,
     * we return businesses in that area without
     * applying street ranking.
     */

    if (
      searchMode ===
      "area"
    ) {
      const baseBusinesses =
        await prisma.business.findMany(
          {
            where: {
              status:
                "ACTIVE",

              deletedAt:
                null,

              location: {
                area: {
                  contains:
                    area,

                  mode:
                    "insensitive",
                },
              },
            },

            select: {
              id: true,
              name: true,
              ownerName: true,
              description: true,
              imageUrl: true,
              availability: true,
              verification: true,
              onboardedAt: true,

              location: {
                select: {
                  id: true,
                  area: true,
                  street: true,
                },
              },

              categories: {
                where: {
                  category: {
                    isActive:
                      true,
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
                  status:
                    "ACTIVE",

                  deletedAt:
                    null,
                },

                select: {
                  id: true,
                  name: true,
                  description:
                    true,
                  price:
                    true,
                  priceMin:
                    true,
                  priceMax:
                    true,
                  availability:
                    true,
                  imageUrl:
                    true,
                  keywords:
                    true,

                  images: {
                    select: {
                      id: true,
                      url: true,
                      publicId:
                        true,
                      sortOrder:
                        true,
                    },

                    orderBy: {
                      sortOrder:
                        "asc",
                    },

                    take: 1,
                  },
                },

                orderBy: {
                  updatedAt:
                    "desc",
                },

                take: 1,
              },

              socialLinks: {
                select: {
                  id: true,
                  platform:
                    true,
                  handle:
                    true,
                },
              },
            },

            orderBy: {
              onboardedAt:
                "desc",
            },
          }
        );

      const formattedBusinesses =
        baseBusinesses.map(
          (business) => ({
            id:
              business.id,

            name:
              business.name,

            ownerName:
              business.ownerName,

            description:
              business.description,

            imageUrl:
              business.imageUrl,

            area:
              business.location
                ?.area ??
              "Location not added",

            location:
              serializeLocation(
                business.location
              ),

            availability:
              business.availability,

            verification:
              business.verification,

            verified:
              business.verification ===
              "VERIFIED",

            categories:
              business.categories,

            products:
              business.products,

            socialLinks:
              business.socialLinks,

            distanceKm:
              null,

            ranking:
              4,

            rankingLabel:
              "whole-area",
          })
        );

      return NextResponse.json(
        {
          businesses:
            formattedBusinesses,

          total:
            formattedBusinesses.length,

          mode:
            "area",

          ranking:
            "whole-area",

          location:
            area,
        },
        {
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    /*
     * -----------------------------------------
     * GPS NEAR ME
     * -----------------------------------------
     */

    const radiusKm =
      getNearMeRadiusKm();

    const adjacentStreetMaxKm =
      getAdjacentStreetMaxKm();

    /*
     * -----------------------------------------
     * DETERMINE BUYER STREET + AREA
     * -----------------------------------------
     */

    let reverseLocation:
      Awaited<
        ReturnType<
          typeof reverseGeocodeLocation
        >
      >;

    try {
      reverseLocation =
        await reverseGeocodeLocation(
          {
            latitude:
              latitude as number,

            longitude:
              longitude as number,
          }
        );
    } catch (error) {
      console.error(
        "Near Me reverse geocoding error:",
        error
      );

      return NextResponse.json(
        {
          businesses: [],
          total: 0,
          mode:
            "gps",

          ranking:
            "street-area",

          location: {
            type:
              "current",

            street:
              null,

            area:
              null,
          },

          radiusKm,

          adjacentStreetMaxKm,

          error:
            "We could not determine your current street. Please try again.",
        },
        {
          status: 503,
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    const userStreet =
      reverseLocation.street
        ?.trim() ||
      null;

    const userArea =
      reverseLocation.area
        ?.trim() ||
      null;

    /*
     * The first three ranking levels require
     * a buyer street.
     *
     * Whole Area can still operate if only an
     * area is returned, but the current GPS
     * request is primarily a street-first flow.
     */
    if (!userStreet) {
      if (!userArea) {
        return NextResponse.json(
          {
            businesses: [],
            total: 0,
            mode:
              "gps",

            ranking:
              "street-area",

            location: {
              type:
                "current",

              street:
                null,

              area:
                null,
            },

            radiusKm,

            adjacentStreetMaxKm,

            reason:
              "street-and-area-not-found",
          },
          {
            headers: {
              "Cache-Control":
                "no-store",
            },
          }
        );
      }

      /*
       * If the location service gives us an area
       * but no road, use the Whole Area fallback.
       */
      const wholeAreaBusinesses =
        await prisma.business.findMany(
          {
            where: {
              status:
                "ACTIVE",

              deletedAt:
                null,

              location: {
                isNot:
                  null,
              },
            },

            select: {
              id: true,
              name: true,
              ownerName: true,
              description: true,
              imageUrl: true,
              availability: true,
              verification: true,
              onboardedAt: true,

              location: {
                select: {
                  id: true,
                  area: true,
                  street: true,
                },
              },

              categories: {
                where: {
                  category: {
                    isActive:
                      true,
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
                  status:
                    "ACTIVE",

                  deletedAt:
                    null,
                },

                select: {
                  id: true,
                  name: true,
                  description:
                    true,
                  price:
                    true,
                  priceMin:
                    true,
                  priceMax:
                    true,
                  availability:
                    true,
                  imageUrl:
                    true,
                  keywords:
                    true,

                  images: {
                    select: {
                      id: true,
                      url: true,
                      publicId:
                        true,
                      sortOrder:
                        true,
                    },

                    orderBy: {
                      sortOrder:
                        "asc",
                    },

                    take: 1,
                  },
                },

                orderBy: {
                  updatedAt:
                    "desc",
                },

                take: 1,
              },

              socialLinks: {
                select: {
                  id: true,
                  platform:
                    true,
                  handle:
                    true,
                },
              },
            },

            orderBy: {
              onboardedAt:
                "desc",
            },
          }
        );

      const fallbackResults =
        wholeAreaBusinesses
          .filter(
            (business) =>
              business.location !==
                null &&
              areasMatch(
                business.location.area,
                userArea
              )
          )
          .map(
            (business) => ({
              id:
                business.id,

              name:
                business.name,

              ownerName:
                business.ownerName,

              description:
                business.description,

              imageUrl:
                business.imageUrl,

              area:
                business.location
                  ?.area ??
                "Location not added",

              location:
                serializeLocation(
                  business.location
                ),

              availability:
                business.availability,

              verification:
                business.verification,

              verified:
                business.verification ===
                "VERIFIED",

              categories:
                business.categories,

              products:
                business.products,

              socialLinks:
                business.socialLinks,

              distanceKm:
                null,

              ranking:
                4,

              rankingLabel:
                "whole-area",

              distanceKmRaw:
                null,
            })
          );

      return NextResponse.json(
        {
          businesses:
            fallbackResults,

          total:
            fallbackResults.length,

          mode:
            "gps",

          ranking:
            "whole-area",

          location: {
            type:
              "current",

            street:
              null,

            area:
              userArea,
          },

          radiusKm,

          adjacentStreetMaxKm,

          reason:
            "street-not-found",
        },
        {
          headers: {
            "Cache-Control":
              "no-store",
          },
        }
      );
    }

    /*
     * -----------------------------------------
     * LOAD ACTIVE BUSINESS CANDIDATES
     * -----------------------------------------
     */

    const baseBusinesses =
      await prisma.business.findMany(
        {
          where: {
            status:
              "ACTIVE",

            deletedAt:
              null,

            location: {
              isNot:
                null,
            },
          },

          select: {
            id: true,
            name: true,
            ownerName: true,
            description: true,
            imageUrl: true,
            availability: true,
            verification: true,
            onboardedAt: true,

            location: {
              select: {
                id: true,
                area: true,
                street: true,
                address: true,
                lat: true,
                long: true,
              },
            },

            categories: {
              where: {
                category: {
                  isActive:
                    true,
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
                status:
                  "ACTIVE",

                deletedAt:
                  null,
              },

              select: {
                id: true,
                name: true,
                description:
                  true,
                price:
                  true,
                priceMin:
                  true,
                priceMax:
                  true,
                availability:
                  true,
                imageUrl:
                  true,
                keywords:
                  true,

                images: {
                  select: {
                    id: true,
                    url: true,
                    publicId:
                      true,
                    sortOrder:
                      true,
                  },

                  orderBy: {
                    sortOrder:
                      "asc",
                  },

                  take: 1,
                },
              },

              orderBy: {
                updatedAt:
                  "desc",
              },

              take: 1,
            },

            socialLinks: {
              select: {
                id: true,
                platform:
                  true,
                handle:
                  true,
              },
            },
          },

          orderBy: {
            onboardedAt:
              "desc",
          },
        }
      );

    /*
     * -----------------------------------------
     * CLASSIFY BUSINESSES
     * -----------------------------------------
     *
     * Every business is assigned exactly one
     * ranking level:
     *
     * 1 Same Street
     * 2 Adjacent Street
     * 3 Nearby Street
     * 4 Whole Area
     *
     * Businesses outside the buyer's area that
     * do not qualify for the first three levels
     * are excluded.
     */

    const rankedResults =
      baseBusinesses
        .map(
          (
            business
          ): RankedBusiness | null => {
            const location =
              business.location;

            if (!location) {
              return null;
            }

            const businessStreet =
              getBusinessStreet(
                location
              );

            const sameStreet =
              streetsMatch(
                businessStreet,
                userStreet
              );

            let distanceKm:
              | number
              | null =
              null;

            /*
             * Calculate distance whenever
             * coordinates are available.
             */
            if (
              isValidLatitude(
                location.lat
              ) &&
              isValidLongitude(
                location.long
              )
            ) {
              distanceKm =
                haversineDistance(
                  latitude as number,
                  longitude as number,
                  location.lat,
                  location.long
                );
            }

            /*
             * -------------------------------------
             * 1. SAME STREET
             * -------------------------------------
             */

            if (
              sameStreet &&
              distanceKm !==
                null &&
              distanceKm <=
                radiusKm
            ) {
              return {
                id:
                  business.id,

                name:
                  business.name,

                ownerName:
                  business.ownerName,

                description:
                  business.description,

                imageUrl:
                  business.imageUrl,

                area:
                  location.area,

                location:
                  serializeLocation(
                    {
                      id:
                        location.id,

                      area:
                        location.area,

                      street:
                        businessStreet,
                    }
                  ),

                availability:
                  business.availability,

                verification:
                  business.verification,

                verified:
                  business.verification ===
                  "VERIFIED",

                categories:
                  business.categories,

                products:
                  business.products,

                socialLinks:
                  business.socialLinks,

                distanceKm:
                  formatDistance(
                    distanceKm
                  ),

                ranking:
                  1,

                rankingLabel:
                  "same-street",

                distanceKmRaw:
                  distanceKm,
              };
            }

            /*
             * -------------------------------------
             * 2. ADJACENT STREET
             * -------------------------------------
             *
             * The business must be on a different
             * street and within the adjacent-street
             * distance band.
             */

            if (
              !sameStreet &&
              distanceKm !==
                null &&
              distanceKm <=
                adjacentStreetMaxKm
            ) {
              return {
                id:
                  business.id,

                name:
                  business.name,

                ownerName:
                  business.ownerName,

                description:
                  business.description,

                imageUrl:
                  business.imageUrl,

                area:
                  location.area,

                location:
                  serializeLocation(
                    {
                      id:
                        location.id,

                      area:
                        location.area,

                      street:
                        businessStreet,
                    }
                  ),

                availability:
                  business.availability,

                verification:
                  business.verification,

                verified:
                  business.verification ===
                  "VERIFIED",

                categories:
                  business.categories,

                products:
                  business.products,

                socialLinks:
                  business.socialLinks,

                distanceKm:
                  formatDistance(
                    distanceKm
                  ),

                ranking:
                  2,

                rankingLabel:
                  "adjacent-street",

                distanceKmRaw:
                  distanceKm,
              };
            }

            /*
             * -------------------------------------
             * 3. NEARBY STREET
             * -------------------------------------
             *
             * A different street farther away than
             * the Adjacent Street band but still
             * inside the Near Me radius.
             *
             * This remains a different street from
             * the buyer's street.
             */

            if (
              !sameStreet &&
              distanceKm !==
                null &&
              distanceKm >
                adjacentStreetMaxKm &&
              distanceKm <=
                radiusKm
            ) {
              return {
                id:
                  business.id,

                name:
                  business.name,

                ownerName:
                  business.ownerName,

                description:
                  business.description,

                imageUrl:
                  business.imageUrl,

                area:
                  location.area,

                location:
                  serializeLocation(
                    {
                      id:
                        location.id,

                      area:
                        location.area,

                      street:
                        businessStreet,
                    }
                  ),

                availability:
                  business.availability,

                verification:
                  business.verification,

                verified:
                  business.verification ===
                  "VERIFIED",

                categories:
                  business.categories,

                products:
                  business.products,

                socialLinks:
                  business.socialLinks,

                distanceKm:
                  formatDistance(
                    distanceKm
                  ),

                ranking:
                  3,

                rankingLabel:
                  "nearby-street",

                distanceKmRaw:
                  distanceKm,
              };
            }

            /*
             * -------------------------------------
             * 4. WHOLE AREA
             * -------------------------------------
             *
             * Whole Area is the fallback.
             *
             * It is intentionally based on area
             * membership, not on the 10 km radius.
             *
             * This allows a business elsewhere in
             * the buyer's recognized area to appear
             * as a true area-level fallback.
             */

            if (
              userArea &&
              areasMatch(
                location.area,
                userArea
              )
            ) {
              return {
                id:
                  business.id,

                name:
                  business.name,

                ownerName:
                  business.ownerName,

                description:
                  business.description,

                imageUrl:
                  business.imageUrl,

                area:
                  location.area,

                location:
                  serializeLocation(
                    {
                      id:
                        location.id,

                      area:
                        location.area,

                      street:
                        businessStreet,
                    }
                  ),

                availability:
                  business.availability,

                verification:
                  business.verification,

                verified:
                  business.verification ===
                  "VERIFIED",

                categories:
                  business.categories,

                products:
                  business.products,

                socialLinks:
                  business.socialLinks,

                distanceKm:
                  distanceKm !==
                  null
                    ? formatDistance(
                        distanceKm
                      )
                    : null,

                ranking:
                  4,

                rankingLabel:
                  "whole-area",

                distanceKmRaw:
                  distanceKm,
              };
            }

            /*
             * The business is not relevant to
             * this Near Me request.
             */
            return null;
          }
        )
        .filter(
          (
            business
          ): business is RankedBusiness =>
            business !== null
        )
        .sort(
          (a, b) => {
            /*
             * -------------------------------------
             * PRIMARY SORT
             * -------------------------------------
             *
             * Ranking level always wins.
             */
            if (
              a.ranking !==
              b.ranking
            ) {
              return (
                a.ranking -
                b.ranking
              );
            }

            /*
             * -------------------------------------
             * SECONDARY SORT
             * -------------------------------------
             *
             * Businesses within the same ranking
             * level are ordered by physical distance.
             *
             * For Whole Area businesses without
             * coordinates, those businesses are placed
             * after businesses that have coordinates.
             */
            if (
              a.distanceKmRaw ===
                null &&
              b.distanceKmRaw ===
                null
            ) {
              return 0;
            }

            if (
              a.distanceKmRaw ===
              null
            ) {
              return 1;
            }

            if (
              b.distanceKmRaw ===
              null
            ) {
              return -1;
            }

            return (
              a.distanceKmRaw -
              b.distanceKmRaw
            );
          }
        )
        .map(
          ({
            distanceKmRaw,
            ...business
          }) =>
            business
        );

    /*
     * -----------------------------------------
     * GPS RESPONSE
     * -----------------------------------------
     */

    return NextResponse.json(
      {
        businesses:
          rankedResults,

        total:
          rankedResults.length,

        mode:
          "gps",

        ranking:
          "same-street-adjacent-street-nearby-street-whole-area",

        location: {
          type:
            "current",

          street:
            userStreet,

          area:
            userArea,
        },

        radiusKm,

        adjacentStreetMaxKm,
      },
      {
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "Near Me API error:",
      error
    );

    return NextResponse.json(
      {
        businesses: [],
        total: 0,
        mode:
          "none",
        location:
          null,
        error:
          "Unable to load nearby businesses.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control":
            "no-store",
        },
      }
    );
  }
}