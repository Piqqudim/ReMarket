const SHIPBUBBLE_BASE_URL = "https://api.shipbubble.com/v1";

export class ShipbubbleError extends Error {
  status: number;
  providerMessage?: string;

  constructor(message: string, status = 502, providerMessage?: string) {
    super(message);
    this.name = "ShipbubbleError";
    this.status = status;
    this.providerMessage = providerMessage;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getApiKey(): string {
  const apiKey = process.env.SHIPBUBBLE_API_KEY?.trim();
  if (!apiKey) {
    throw new ShipbubbleError(
      "Shipbubble is not configured. Add SHIPBUBBLE_API_KEY to the server environment.",
      503,
    );
  }
  return apiKey;
}

async function shipbubbleRequest<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${SHIPBUBBLE_BASE_URL}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${getApiKey()}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...init.headers,
      },
    });
  } catch (error) {
    throw new ShipbubbleError(
      error instanceof Error ? error.message : "Unable to reach Shipbubble.",
      502,
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isRecord(payload) || payload.status !== "success" || !("data" in payload)) {
    const providerMessage = isRecord(payload) && typeof payload.message === "string"
      ? payload.message
      : undefined;
    throw new ShipbubbleError(
      providerMessage || "Shipbubble could not complete the request.",
      response.status || 502,
      providerMessage,
    );
  }

  return payload.data as T;
}

export type ShipbubbleValidatedAddress = {
  address_code: number;
  formatted_address: string;
  country?: string;
  country_code?: string;
  city?: string;
  city_code?: string;
  state?: string;
  state_code?: string;
  postal_code?: string;
  latitude?: number;
  longitude?: number;
};

export async function validateShipbubbleAddress(input: {
  name: string;
  email: string;
  phone: string;
  address: string;
  latitude?: number;
  longitude?: number;
}) {
  if (!input.name.trim() || !/^\S+@\S+\.\S+$/.test(input.email) || !input.phone.trim() || input.address.trim().length < 8) {
    throw new ShipbubbleError("A name, valid email, phone number and complete address are required.", 400);
  }
  if ((input.latitude === undefined) !== (input.longitude === undefined)) {
    throw new ShipbubbleError("Both latitude and longitude must be supplied together.", 400);
  }

  return shipbubbleRequest<ShipbubbleValidatedAddress>("/shipping/address/validate", {
    method: "POST",
    body: JSON.stringify({
      name: input.name.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      address: input.address.trim(),
      ...(input.latitude !== undefined && input.longitude !== undefined
        ? { latitude: input.latitude, longitude: input.longitude }
        : {}),
    }),
  });
}

export type ShipbubblePackageItem = {
  name: string;
  description: string;
  unit_weight: string;
  unit_amount: string;
  quantity: string;
};

export type ShipbubbleRate = {
  courier_id: string | number;
  courier_name?: string;
  service_code: string;
  service_type?: string;
  rate_card_amount?: number;
  total?: number;
  currency?: string;
  rate_card_currency?: string;
  delivery_eta?: string;
  delivery_eta_time?: string;
  pickup_eta?: string;
  pickup_eta_time?: string;
  tracking?: { bars?: number; label?: string };
  [key: string]: unknown;
};

export type ShipbubbleRatesResponse = {
  request_token: string;
  data?: unknown;
  rates?: ShipbubbleRate[];
  [key: string]: unknown;
};

export async function fetchShipbubbleRates(input: {
  senderAddressCode: number;
  receiverAddressCode: number;
  pickupDate: string;
  categoryId: number;
  packageItems: ShipbubblePackageItem[];
  packageDimension: { length: number; width: number; height: number };
  serviceType?: "pickup" | "dropoff";
  deliveryInstructions?: string;
}) {
  if (!Number.isSafeInteger(input.senderAddressCode) || !Number.isSafeInteger(input.receiverAddressCode)) {
    throw new ShipbubbleError("Valid Shipbubble sender and receiver address codes are required.", 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.pickupDate)) {
    throw new ShipbubbleError("Pickup date must use YYYY-MM-DD format.", 400);
  }
  if (!Number.isSafeInteger(input.categoryId) || input.categoryId <= 0) {
    throw new ShipbubbleError("A valid Shipbubble package category ID is required.", 400);
  }
  if (input.packageItems.length === 0) {
    throw new ShipbubbleError("At least one package item is required.", 400);
  }
  const dims = input.packageDimension;
  if (![dims.length, dims.width, dims.height].every((n) => Number.isFinite(n) && n > 0)) {
    throw new ShipbubbleError("Package dimensions must be positive centimetre values.", 400);
  }

  return shipbubbleRequest<ShipbubbleRatesResponse>("/shipping/fetch_rates", {
    method: "POST",
    body: JSON.stringify({
      sender_address_code: input.senderAddressCode,
      reciever_address_code: input.receiverAddressCode,
      pickup_date: input.pickupDate,
      category_id: input.categoryId,
      package_items: input.packageItems,
      package_dimension: input.packageDimension,
      ...(input.serviceType ? { service_type: input.serviceType } : {}),
      ...(input.deliveryInstructions ? { delivery_instructions: input.deliveryInstructions } : {}),
    }),
  });
}

export async function createShipbubbleShipment(input: {
  requestToken: string;
  serviceCode: string;
  courierId: string | number;
  insuranceCode?: string;
  isCashOnDelivery?: boolean;
}) {
  if (!input.requestToken.trim() || !input.serviceCode.trim() || !String(input.courierId).trim()) {
    throw new ShipbubbleError("A rate request token, service code and courier ID are required.", 400);
  }

  return shipbubbleRequest<Record<string, unknown>>("/shipping/labels", {
    method: "POST",
    body: JSON.stringify({
      request_token: input.requestToken,
      service_code: input.serviceCode,
      courier_id: String(input.courierId),
      ...(input.insuranceCode ? { insurance_code: input.insuranceCode } : {}),
      is_cod_label: input.isCashOnDelivery === true,
    }),
  });
}

export async function getShipbubbleShipments(params?: { page?: number; perPage?: number }) {
  const query = new URLSearchParams();
  if (params?.page) query.set("page", String(params.page));
  if (params?.perPage) query.set("perPage", String(params.perPage));
  const queryString = query.toString();
  const suffix = queryString ? `?${queryString}` : "";
  return shipbubbleRequest<Record<string, unknown>>(`/shipping/labels${suffix}`, { method: "GET" });
}

export async function cancelShipbubbleShipment(providerOrderId: string) {
  if (!providerOrderId.trim()) {
    throw new ShipbubbleError("A Shipbubble order ID is required.", 400);
  }
  return shipbubbleRequest<Record<string, unknown>>(
    `/shipping/labels/cancel/${encodeURIComponent(providerOrderId)}`,
    { method: "POST" },
  );
}

export function getShipbubbleDefaultCategoryId(): number {
  const value = Number(process.env.SHIPBUBBLE_DEFAULT_CATEGORY_ID);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new ShipbubbleError(
      "Set SHIPBUBBLE_DEFAULT_CATEGORY_ID to a package category ID from Shipbubble.",
      503,
    );
  }
  return value;
}