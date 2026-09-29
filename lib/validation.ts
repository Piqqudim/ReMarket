export type ValidationResult<T> =
  | {
      success: true;
      data: T;
    }
  | {
      success: false;
      error: string;
    };

export type BusinessInput = {
  name: string;
  ownerName: string | null;
  description: string | null;
  area: string;
  address: string | null;
  lat: number | null;
  long: number | null;
  priceMin: number | null;
  priceMax: number | null;
  availability:
    | "AVAILABLE"
    | "ASK_SELLER"
    | "UNAVAILABLE";
  phone: string | null;
  imageUrl: string | null;
  categoryIds: string[];
};

export type LocationInput = {
  area: string;
  address: string | null;
  lat: number | null;
  long: number | null;
};

const ALLOWED_AVAILABILITY = [
  "AVAILABLE",
  "ASK_SELLER",
  "UNAVAILABLE",
] as const;

type Availability =
  (typeof ALLOWED_AVAILABILITY)[number];

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function readString(
  value: unknown,
  field: string,
  maxLength: number
): ValidationResult<string> {
  if (typeof value !== "string") {
    return {
      success: false,
      error: `${field} must be a string.`,
    };
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return {
      success: false,
      error: `${field} is required.`,
    };
  }

  if (normalized.length > maxLength) {
    return {
      success: false,
      error: `${field} must not exceed ${maxLength} characters.`,
    };
  }

  return {
    success: true,
    data: normalized,
  };
}

function readOptionalString(
  value: unknown,
  field: string,
  maxLength: number
): ValidationResult<string | null> {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return {
      success: true,
      data: null,
    };
  }

  if (typeof value !== "string") {
    return {
      success: false,
      error: `${field} must be a string.`,
    };
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    return {
      success: true,
      data: null,
    };
  }

  if (normalized.length > maxLength) {
    return {
      success: false,
      error: `${field} must not exceed ${maxLength} characters.`,
    };
  }

  return {
    success: true,
    data: normalized,
  };
}

function readOptionalInteger(
  value: unknown,
  field: string,
  minimum = 0
): ValidationResult<number | null> {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return {
      success: true,
      data: null,
    };
  }

  let numberValue: number;

  if (typeof value === "number") {
    numberValue = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim();

    if (trimmed === "") {
      return {
        success: true,
        data: null,
      };
    }

    numberValue = Number(trimmed);
  } else {
    return {
      success: false,
      error: `${field} must be a number.`,
    };
  }

  if (
    !Number.isFinite(numberValue) ||
    !Number.isInteger(numberValue)
  ) {
    return {
      success: false,
      error: `${field} must be a valid integer.`,
    };
  }

  if (numberValue < minimum) {
    return {
      success: false,
      error: `${field} must be at least ${minimum}.`,
    };
  }

  return {
    success: true,
    data: numberValue,
  };
}

function readOptionalCoordinate(
  value: unknown,
  field: string,
  minimum: number,
  maximum: number
): ValidationResult<number | null> {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return {
      success: true,
      data: null,
    };
  }

  let numberValue: number;

  if (typeof value === "number") {
    numberValue = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim();

    /*
     * A whitespace-only coordinate is omitted,
     * not interpreted as zero.
     */
    if (trimmed === "") {
      return {
        success: true,
        data: null,
      };
    }

    numberValue = Number(trimmed);
  } else {
    return {
      success: false,
      error: `${field} must be a valid number.`,
    };
  }

  if (!Number.isFinite(numberValue)) {
    return {
      success: false,
      error: `${field} must be a valid number.`,
    };
  }

  if (
    numberValue < minimum ||
    numberValue > maximum
  ) {
    return {
      success: false,
      error:
        `${field} must be between ` +
        `${minimum} and ${maximum}.`,
    };
  }

  return {
    success: true,
    data: numberValue,
  };
}

function readAvailability(
  value: unknown
): ValidationResult<Availability> {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return {
      success: true,
      data: "ASK_SELLER",
    };
  }

  if (
    typeof value !== "string" ||
    !ALLOWED_AVAILABILITY.includes(
      value as Availability
    )
  ) {
    return {
      success: false,
      error:
        "availability must be AVAILABLE, ASK_SELLER, or UNAVAILABLE.",
    };
  }

  return {
    success: true,
    data: value as Availability,
  };
}

function readCategoryIds(
  value: unknown
): ValidationResult<string[]> {
  if (
    value === undefined ||
    value === null
  ) {
    return {
      success: true,
      data: [],
    };
  }

  if (!Array.isArray(value)) {
    return {
      success: false,
      error:
        "categoryIds must be an array.",
    };
  }

  const categoryIds: string[] = [];

  for (const item of value) {
    if (typeof item !== "string") {
      return {
        success: false,
        error:
          "Every category ID must be a string.",
      };
    }

    const id = item.trim();

    if (id.length === 0) {
      return {
        success: false,
        error:
          "Category IDs cannot be empty.",
      };
    }

    categoryIds.push(id);
  }

  return {
    success: true,
    data: [
      ...new Set(categoryIds),
    ],
  };
}

export function validateLocationInput(
  body: unknown
): ValidationResult<LocationInput> {
  if (!isRecord(body)) {
    return {
      success: false,
      error: "Invalid request body.",
    };
  }

  const area = readString(
    body.area,
    "area",
    120
  );

  if (!area.success) {
    return area;
  }

  const address =
    readOptionalString(
      body.address,
      "address",
      300
    );

  if (!address.success) {
    return address;
  }

  const lat =
    readOptionalCoordinate(
      body.lat,
      "lat",
      -90,
      90
    );

  if (!lat.success) {
    return lat;
  }

  const long =
    readOptionalCoordinate(
      body.long,
      "long",
      -180,
      180
    );

  if (!long.success) {
    return long;
  }

  const hasLat =
    lat.data !== null;

  const hasLong =
    long.data !== null;

  /*
   * Coordinates must always be supplied
   * together.
   */
  if (hasLat !== hasLong) {
    return {
      success: false,
      error:
        "lat and long must either both be provided or both be omitted.",
    };
  }

  return {
    success: true,
    data: {
      area: area.data,
      address: address.data,
      lat: lat.data,
      long: long.data,
    },
  };
}

export function validateBusinessInput(
  body: unknown
): ValidationResult<BusinessInput> {
  if (!isRecord(body)) {
    return {
      success: false,
      error: "Invalid request body.",
    };
  }

  const name = readString(
    body.name,
    "name",
    150
  );

  if (!name.success) {
    return name;
  }

  const ownerName =
    readOptionalString(
      body.ownerName,
      "ownerName",
      150
    );

  if (!ownerName.success) {
    return ownerName;
  }

  const description =
    readOptionalString(
      body.description,
      "description",
      2000
    );

  if (!description.success) {
    return description;
  }

  const area = readString(
    body.area,
    "area",
    120
  );

  if (!area.success) {
    return area;
  }

  const address =
    readOptionalString(
      body.address,
      "address",
      300
    );

  if (!address.success) {
    return address;
  }

  const lat =
    readOptionalCoordinate(
      body.lat,
      "lat",
      -90,
      90
    );

  if (!lat.success) {
    return lat;
  }

  const long =
    readOptionalCoordinate(
      body.long,
      "long",
      -180,
      180
    );

  if (!long.success) {
    return long;
  }

  const hasLat =
    lat.data !== null;

  const hasLong =
    long.data !== null;

  if (hasLat !== hasLong) {
    return {
      success: false,
      error:
        "lat and long must either both be provided or both be omitted.",
    };
  }

  const priceMin =
    readOptionalInteger(
      body.priceMin,
      "priceMin"
    );

  if (!priceMin.success) {
    return priceMin;
  }

  const priceMax =
    readOptionalInteger(
      body.priceMax,
      "priceMax"
    );

  if (!priceMax.success) {
    return priceMax;
  }

  if (
    priceMin.data !== null &&
    priceMax.data !== null &&
    priceMin.data > priceMax.data
  ) {
    return {
      success: false,
      error:
        "priceMin cannot be greater than priceMax.",
    };
  }

  const availability =
    readAvailability(
      body.availability
    );

  if (!availability.success) {
    return availability;
  }

  const phone =
    readOptionalString(
      body.phone,
      "phone",
      40
    );

  if (!phone.success) {
    return phone;
  }

  const imageUrl =
    readOptionalString(
      body.imageUrl,
      "imageUrl",
      2000
    );

  if (!imageUrl.success) {
    return imageUrl;
  }

  const categoryIds =
    readCategoryIds(
      body.categoryIds
    );

  if (!categoryIds.success) {
    return categoryIds;
  }

  return {
    success: true,
    data: {
      name: name.data,
      ownerName:
        ownerName.data,
      description:
        description.data,
      area: area.data,
      address:
        address.data,
      lat: lat.data,
      long: long.data,
      priceMin:
        priceMin.data,
      priceMax:
        priceMax.data,
      availability:
        availability.data,
      phone: phone.data,
      imageUrl:
        imageUrl.data,
      categoryIds:
        categoryIds.data,
    },
  };
}