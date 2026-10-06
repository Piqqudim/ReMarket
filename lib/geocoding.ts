// lib/geocoding.ts

export type GeocodeBusinessLocationInput = {
  address: string | null | undefined;
  area: string | null | undefined;
  city?: string | null | undefined;
};

export type GeocodeBusinessLocationResult = {
  latitude: number;
  longitude: number;
  formattedAddress: string | null;
  street: string | null;
};

export type ReverseGeocodeLocationInput = {
  latitude: number;
  longitude: number;
};

export type ReverseGeocodeLocationResult = {
  street: string | null;
  area: string | null;
  city: string | null;
  formattedAddress: string | null;
};

type NominatimAddress = Record<
  string,
  unknown
>;

type NominatimResult = {
  lat?: unknown;
  lon?: unknown;
  display_name?: unknown;
  type?: unknown;
  category?: unknown;
  addresstype?: unknown;
  address?: NominatimAddress;
};

const NOMINATIM_URL =
  "https://nominatim.openstreetmap.org/search";

const NOMINATIM_REVERSE_URL =
  "https://nominatim.openstreetmap.org/reverse";

/*
 * Maximum amount of time ReMarket will wait
 * for a Nominatim response.
 */
const NOMINATIM_TIMEOUT_MS = 10_000;

const PRECISE_TYPES =
  new Set([
    "house",
    "building",
    "commercial",
    "industrial",
    "retail",
    "shop",
    "office",
    "amenity",
    "craft",
    "tourism",
  ]);

const BROAD_TYPES =
  new Set([
    "city",
    "town",
    "village",
    "suburb",
    "neighbourhood",
    "quarter",
    "district",
    "county",
    "state",
    "region",
    "road",
    "residential",
  ]);

const LOCALITY_ADDRESS_KEYS =
  new Set([
    "suburb",
    "neighbourhood",
    "quarter",
    "village",
    "town",
    "city",
    "municipality",
    "district",
    "city_district",
    "county",
    "state_district",
    "region",
  ]);

function cleanPart(
  value: string | null | undefined
): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeComparableText(
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

function containsPart(
  value: string,
  part: string
): boolean {
  const normalizedValue =
    normalizeComparableText(
      value
    );

  const normalizedPart =
    normalizeComparableText(
      part
    );

  if (
    !normalizedValue ||
    !normalizedPart
  ) {
    return false;
  }

  return (
    ` ${normalizedValue} `.includes(
      ` ${normalizedPart} `
    )
  );
}

function isValidLatitude(
  value: unknown
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= -90 &&
    value <= 90
  );
}

function isValidLongitude(
  value: unknown
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= -180 &&
    value <= 180
  );
}

function buildQuery(
  input: GeocodeBusinessLocationInput
): string {
  const address =
    cleanPart(input.address);

  const area =
    cleanPart(input.area);

  const city =
    cleanPart(input.city);

  const parts: string[] = [];

  if (address) {
    parts.push(address);
  }

  if (
    area &&
    !containsPart(
      address,
      area
    )
  ) {
    parts.push(area);
  }

  if (
    city &&
    !containsPart(
      address,
      city
    ) &&
    !containsPart(
      area,
      city
    )
  ) {
    parts.push(city);
  }

  /*
   * Nigeria remains the country boundary
   * for this geocoding utility.
   */
  parts.push("Nigeria");

  return Array.from(
    new Set(
      parts
        .map(
          (part) =>
            part.trim()
        )
        .filter(Boolean)
    )
  ).join(", ");
}

function hasHouseNumber(
  result: NominatimResult
): boolean {
  const houseNumber =
    result.address?.house_number;

  return (
    typeof houseNumber ===
      "string" &&
    houseNumber.trim()
      .length > 0
  );
}

function hasStreet(
  result: NominatimResult
): boolean {
  const road =
    result.address?.road;

  return (
    typeof road === "string" &&
    road.trim().length > 0
  );
}

function getStreet(
  result: NominatimResult
): string | null {
  const road =
    result.address?.road;

  if (
    typeof road !== "string"
  ) {
    return null;
  }

  const cleaned =
    road.trim();

  return cleaned || null;
}

function getResultType(
  result: NominatimResult
): string {
  return typeof result.type ===
    "string"
    ? result.type
    : "";
}

function getResultCategory(
  result: NominatimResult
): string {
  return typeof result.category ===
    "string"
    ? result.category
    : "";
}

function isBroadResult(
  result: NominatimResult
): boolean {
  const type =
    getResultType(result);

  const category =
    getResultCategory(result);

  return (
    BROAD_TYPES.has(type) ||
    BROAD_TYPES.has(category)
  );
}

function isPreciseResult(
  result: NominatimResult
): boolean {
  const type =
    getResultType(result);

  const category =
    getResultCategory(result);

  /*
   * A result containing an actual house
   * number and street is acceptable even when
   * the OSM feature type is different.
   */
  if (
    hasHouseNumber(result) &&
    hasStreet(result)
  ) {
    return true;
  }

  /*
   * Never accept a result that represents
   * only an area, suburb, city, or road.
   */
  if (
    BROAD_TYPES.has(type) ||
    BROAD_TYPES.has(category)
  ) {
    return false;
  }

  return (
    PRECISE_TYPES.has(type) ||
    PRECISE_TYPES.has(category)
  );
}

function getLocalityValues(
  result: NominatimResult
): string[] {
  const values: string[] = [];

  const address =
    result.address ?? {};

  for (
    const [key, value] of Object.entries(
      address
    )
  ) {
    if (
      !LOCALITY_ADDRESS_KEYS.has(
        key
      )
    ) {
      continue;
    }

    if (
      typeof value === "string" &&
      value.trim()
    ) {
      values.push(
        value.trim()
      );
    }
  }

  if (
    typeof result.display_name ===
      "string" &&
    result.display_name.trim()
  ) {
    values.push(
      result.display_name.trim()
    );
  }

  return values;
}

function hasRequestedArea(
  result: NominatimResult,
  area: string
): boolean {
  const cleanedArea =
    cleanPart(area);

  if (!cleanedArea) {
    return false;
  }

  return getLocalityValues(
    result
  ).some((value) =>
    containsPart(
      value,
      cleanedArea
    )
  );
}

function hasRequestedCity(
  result: NominatimResult,
  city: string
): boolean {
  const cleanedCity =
    cleanPart(city);

  if (!cleanedCity) {
    return false;
  }

  return getLocalityValues(
    result
  ).some((value) =>
    containsPart(
      value,
      cleanedCity
    )
  );
}

function getCountryCode(
  result: NominatimResult
): string {
  const countryCode =
    result.address
      ?.country_code;

  return typeof countryCode ===
    "string"
    ? countryCode
        .trim()
        .toLowerCase()
    : "";
}

function isNigeriaResult(
  result: NominatimResult
): boolean {
  const countryCode =
    getCountryCode(result);

  /*
   * countrycodes=ng is already supplied to
   * Nominatim. This additional validation makes
   * the acceptance rule explicit.
   */
  if (!countryCode) {
    return true;
  }

  return (
    countryCode === "ng"
  );
}

function getResultScore(
  result: NominatimResult,
  area: string,
  city?: string | null
): number {
  const type =
    getResultType(result);

  const category =
    getResultCategory(result);

  let score = 0;

  if (
    hasHouseNumber(result)
  ) {
    score += 100;
  }

  if (
    hasStreet(result)
  ) {
    score += 25;
  }

  if (
    PRECISE_TYPES.has(type)
  ) {
    score += 30;
  }

  if (
    PRECISE_TYPES.has(category)
  ) {
    score += 20;
  }

  if (
    hasRequestedArea(
      result,
      area
    )
  ) {
    score += 120;
  }

  if (
    city &&
    hasRequestedCity(
      result,
      city
    )
  ) {
    score += 60;
  }

  if (
    isNigeriaResult(result)
  ) {
    score += 10;
  }

  if (
    isBroadResult(result)
  ) {
    score -= 100;
  }

  return score;
}

function selectBestResult(
  results: NominatimResult[],
  area: string,
  city?: string | null
): NominatimResult | null {
  /*
   * The result must first be structurally
   * precise enough for a business location.
   */
  const preciseResults =
    results.filter(
      (result) =>
        isPreciseResult(
          result
        )
    );

  if (
    preciseResults.length === 0
  ) {
    return null;
  }

  /*
   * Only accept results that can be tied back
   * to the requested ReMarket area.
   *
   * This prevents a precise building somewhere
   * else from being accepted simply because
   * Nominatim returned it as a good address match.
   */
  const areaMatchedResults =
    preciseResults.filter(
      (result) =>
        hasRequestedArea(
          result,
          area
        )
    );

  if (
    areaMatchedResults.length ===
    0
  ) {
    return null;
  }

  const sorted =
    [...areaMatchedResults].sort(
      (a, b) =>
        getResultScore(
          b,
          area,
          city
        ) -
        getResultScore(
          a,
          area,
          city
        )
    );

  return (
    sorted[0] ?? null
  );
}

function getAddressValue(
  result: NominatimResult,
  key: string
): string | null {
  const value =
    result.address?.[key];

  if (
    typeof value !== "string"
  ) {
    return null;
  }

  const cleaned =
    value.trim();

  return cleaned || null;
}

function getReverseArea(
  result: NominatimResult
): string | null {
  const address =
    result.address ?? {};

  const preferredKeys = [
    "suburb",
    "neighbourhood",
    "quarter",
    "village",
    "town",
    "district",
  ];

  for (
    const key of preferredKeys
  ) {
    const value =
      address[key];

    if (
      typeof value === "string" &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return null;
}

function getReverseCity(
  result: NominatimResult
): string | null {
  const address =
    result.address ?? {};

  const preferredKeys = [
    "city",
    "municipality",
    "town",
    "county",
    "state_district",
  ];

  for (
    const key of preferredKeys
  ) {
    const value =
      address[key];

    if (
      typeof value === "string" &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return null;
}

function parseNominatimObject(
  value: unknown
): NominatimResult | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  return value as NominatimResult;
}

async function fetchNominatim(
  url: URL,
  userAgent: string
): Promise<
  NominatimResult |
  NominatimResult[]
> {
  let response: Response;

  try {
    response =
      await fetch(
        url.toString(),
        {
          method: "GET",

          headers: {
            "User-Agent":
              userAgent,

            "Accept":
              "application/json",
          },

          cache:
            "no-store",

          /*
           * Prevent an external location-service
           * request from hanging indefinitely.
           */
          signal:
            AbortSignal.timeout(
              NOMINATIM_TIMEOUT_MS
            ),
        }
      );
  } catch (error) {
    if (
      error instanceof
        DOMException &&
      error.name ===
        "TimeoutError"
    ) {
      throw new Error(
        "The location service timed out."
      );
    }

    throw new Error(
      "The location service could not be reached right now."
    );
  }

  if (!response.ok) {
    console.error(
      "Nominatim request failed:",
      {
        status:
          response.status,

        statusText:
          response.statusText,

        url:
          url.pathname,
      }
    );

    throw new Error(
      "The location service could not be reached right now."
    );
  }

  const data: unknown =
    await response.json();

  if (
    Array.isArray(data)
  ) {
    return data
      .map(
        (item) =>
          parseNominatimObject(
            item
          )
      )
      .filter(
        (
          item
        ): item is NominatimResult =>
          item !== null
      );
  }

  const result =
    parseNominatimObject(
      data
    );

  if (!result) {
    throw new Error(
      "The location service returned an invalid response."
    );
  }

  return result;
}

export async function geocodeBusinessLocation(
  input: GeocodeBusinessLocationInput
): Promise<GeocodeBusinessLocationResult> {
  const userAgent =
    process.env.NOMINATIM_USER_AGENT?.trim();

  if (!userAgent) {
    throw new Error(
      "NOMINATIM_USER_AGENT is not configured."
    );
  }

  const address =
    cleanPart(input.address);

  const area =
    cleanPart(input.area);

  const city =
    cleanPart(input.city);

  if (!address) {
    throw new Error(
      "A business address is required to determine its map location."
    );
  }

  if (!area) {
    throw new Error(
      "A business area is required to determine its map location."
    );
  }

  const query =
    buildQuery({
      address,
      area,
      city:
        city || undefined,
    });

  const url =
    new URL(
      NOMINATIM_URL
    );

  url.searchParams.set(
    "q",
    query
  );

  url.searchParams.set(
    "format",
    "jsonv2"
  );

  url.searchParams.set(
    "addressdetails",
    "1"
  );

  url.searchParams.set(
    "countrycodes",
    "ng"
  );

  url.searchParams.set(
    "limit",
    "5"
  );

  url.searchParams.set(
    "accept-language",
    "en"
  );

  const response =
    await fetchNominatim(
      url,
      userAgent
    );

  const results =
    Array.isArray(response)
      ? response
      : [response];

  const bestResult =
    selectBestResult(
      results,
      area,
      city || undefined
    );

  if (!bestResult) {
    throw new Error(
      "The business address could not be resolved to a precise enough map location within the selected area. Use a more complete address or capture the location while physically at the business."
    );
  }

  const latitude =
    bestResult.lat !==
      undefined
      ? Number(
          bestResult.lat
        )
      : NaN;

  const longitude =
    bestResult.lon !==
      undefined
      ? Number(
          bestResult.lon
        )
      : NaN;

  if (
    !isValidLatitude(
      latitude
    ) ||
    !isValidLongitude(
      longitude
    )
  ) {
    throw new Error(
      "The location service returned invalid business coordinates."
    );
  }

  if (
    !isNigeriaResult(
      bestResult
    )
  ) {
    throw new Error(
      "The location service returned a result outside Nigeria."
    );
  }

  return {
    latitude,
    longitude,

    formattedAddress:
      typeof bestResult.display_name ===
      "string"
        ? bestResult.display_name
        : null,

    street:
      getStreet(
        bestResult
      ),
  };
}

/*
 * ------------------------------------------------
 * REVERSE GEOCODING
 * ------------------------------------------------
 *
 * Used by the Near Me flow to determine the
 * street corresponding to the buyer's current
 * coordinates.
 *
 * Nominatim reverse geocoding returns the closest
 * suitable OSM object, so the street is treated
 * as a location signal rather than an absolute
 * guarantee of the user's exact road.
 */
export async function reverseGeocodeLocation(
  input: ReverseGeocodeLocationInput
): Promise<ReverseGeocodeLocationResult> {
  const userAgent =
    process.env.NOMINATIM_USER_AGENT?.trim();

  if (!userAgent) {
    throw new Error(
      "NOMINATIM_USER_AGENT is not configured."
    );
  }

  if (
    !isValidLatitude(
      input.latitude
    )
  ) {
    throw new Error(
      "Latitude must be between -90 and 90."
    );
  }

  if (
    !isValidLongitude(
      input.longitude
    )
  ) {
    throw new Error(
      "Longitude must be between -180 and 180."
    );
  }

  const url =
    new URL(
      NOMINATIM_REVERSE_URL
    );

  url.searchParams.set(
    "lat",
    String(
      input.latitude
    )
  );

  url.searchParams.set(
    "lon",
    String(
      input.longitude
    )
  );

  url.searchParams.set(
    "format",
    "jsonv2"
  );

  url.searchParams.set(
    "addressdetails",
    "1"
  );

  /*
   * Zoom 18 requests the most detailed
   * address level available.
   */
  url.searchParams.set(
    "zoom",
    "18"
  );

  /*
   * Restrict reverse results to address
   * objects rather than unrelated themes.
   */
  url.searchParams.set(
    "layer",
    "address"
  );

  url.searchParams.set(
    "accept-language",
    "en"
  );

  const response =
    await fetchNominatim(
      url,
      userAgent
    );

  if (
    Array.isArray(response)
  ) {
    throw new Error(
      "The reverse location service returned an unexpected response."
    );
  }

  const result =
    response;

  if (
    !isNigeriaResult(
      result
    )
  ) {
    throw new Error(
      "The current location could not be confirmed within Nigeria."
    );
  }

  return {
    street:
      getStreet(
        result
      ),

    area:
      getReverseArea(
        result
      ),

    city:
      getReverseCity(
        result
      ),

    formattedAddress:
      typeof result.display_name ===
      "string"
        ? result.display_name
        : null,
  };
}