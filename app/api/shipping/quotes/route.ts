import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { requireBuyer } from "@/lib/buyer-auth";
import { createDeliveryCartFingerprint } from "@/lib/delivery-quote-fingerprint";
import {
  fetchShipbubbleRates,
  getShipbubbleDefaultCategoryId,
  ShipbubbleError,
  validateShipbubbleAddress,
  type ShipbubblePackageItem,
  type ShipbubbleRate,
} from "@/lib/shipbubble";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_BODY_BYTES = 24 * 1024;
const MAX_ORDER_TOTAL = 2_147_483_647;
const QUOTE_TTL_DAYS = 6;
const MAX_PACKAGE_WEIGHT_KG = 70;
const MAX_PACKAGE_DIMENSION_CM = 300;

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

class QuoteRouteError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "QuoteRouteError";
    this.status = status;
  }
}

type DeliveryDetails = {
  deliveryRecipient: string;
  deliveryPhone: string;
  deliveryAddress: string;
  deliveryArea: string;
  deliveryLandmark: string | null;
  deliveryNotes: string | null;
};

type PackItem = {
  productId: string;
  productName: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

type SellerPackage = {
  businessId: string;
  businessName: string;
  sellerId: string;
  senderAddressCode: number;
  subtotal: number;
  items: PackItem[];
};

type NormalizedRate = {
  courierId: string;
  courierName: string;
  serviceCode: string;
  serviceType: string | null;
  amount: number;
  currency: string;
  eta: string | null;
  pickupEta: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function readJson(request: Request): Promise<unknown> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    throw new QuoteRouteError("The delivery request is too large.", 413);
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    throw new QuoteRouteError("The delivery request is too large.", 413);
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new QuoteRouteError("Invalid JSON request.", 400);
  }
}

function validateDelivery(value: unknown): DeliveryDetails {
  if (!isRecord(value)) throw new QuoteRouteError("Delivery information is required.");
  const recipient = text(value.deliveryRecipient, 100);
  const phone = text(value.deliveryPhone, 30);
  const address = text(value.deliveryAddress, 300);
  const area = text(value.deliveryArea, 100);
  const landmark = text(value.deliveryLandmark, 150) || null;
  const notes = text(value.deliveryNotes, 300) || null;
  const digits = phone.replace(/\D/g, "");

  if (recipient.length < 2) throw new QuoteRouteError("Enter the recipient's full name.");
  if (!/^\+?[0-9][0-9\s()\-]*$/.test(phone) || digits.length < 7 || digits.length > 15) {
    throw new QuoteRouteError("Enter a valid delivery phone number.");
  }
  if (address.length < 5) throw new QuoteRouteError("Enter a complete street delivery address.");
  if (area.length < 2) throw new QuoteRouteError("Enter a valid area or neighbourhood.");
  return {
    deliveryRecipient: recipient,
    deliveryPhone: phone,
    deliveryAddress: address,
    deliveryArea: area,
    deliveryLandmark: landmark,
    deliveryNotes: notes,
  };
}

function nextPickupDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}


function normalizeNigerianPhone(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.startsWith("234")) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+234${digits.slice(1)}`;
  return trimmed;
}

function makeAddressHash(input: {
  name: string;
  email: string;
  phone: string;
  address: string;
}): string {
  return createHash("sha256")
    .update([
      input.name.trim().toLowerCase(),
      input.email.trim().toLowerCase(),
      input.phone.replace(/\s+/g, "").toLowerCase(),
      input.address.trim().replace(/\s+/g, " ").toLowerCase(),
    ].join("|"), "utf8")
    .digest("hex");
}

async function getReceiverAddressCode(input: {
  userId: string;
  name: string;
  email: string;
  phone: string;
  address: string;
}) {
  const addressHash = makeAddressHash(input);
  const cached = await prisma.shipbubbleAddress.findUnique({
    where: { userId_addressHash: { userId: input.userId, addressHash } },
    select: { addressCode: true, formattedAddress: true },
  });
  if (cached) return { addressCode: cached.addressCode, formattedAddress: cached.formattedAddress };

  const validated = await validateShipbubbleAddress({
    name: input.name,
    email: input.email,
    phone: normalizeNigerianPhone(input.phone),
    address: input.address,
  });

  await prisma.shipbubbleAddress.upsert({
    where: { userId_addressHash: { userId: input.userId, addressHash } },
    create: {
      userId: input.userId,
      addressHash,
      addressCode: validated.address_code,
      contactName: input.name,
      email: input.email,
      phone: normalizeNigerianPhone(input.phone),
      addressText: input.address,
      formattedAddress: validated.formatted_address,
      state: validated.state ?? null,
      city: validated.city ?? null,
      postalCode: validated.postal_code ?? null,
      latitude: validated.latitude ?? null,
      longitude: validated.longitude ?? null,
      validatedAt: new Date(),
    },
    update: {
      addressCode: validated.address_code,
      contactName: input.name,
      email: input.email,
      phone: normalizeNigerianPhone(input.phone),
      addressText: input.address,
      formattedAddress: validated.formatted_address,
      state: validated.state ?? null,
      city: validated.city ?? null,
      postalCode: validated.postal_code ?? null,
      latitude: validated.latitude ?? null,
      longitude: validated.longitude ?? null,
      validatedAt: new Date(),
    },
  });

  return { addressCode: validated.address_code, formattedAddress: validated.formatted_address };
}

function aggregatePackageDimensions(items: PackItem[]) {
  // A conservative single-row arrangement: each product unit is placed
  // along the longest side; the other dimensions use the largest remaining
  // sides. The seller should keep product package measurements accurate.
  let length = 0;
  let width = 0;
  let height = 0;
  let weight = 0;

  for (const item of items) {
    const sides = [item.lengthCm, item.widthCm, item.heightCm].sort((a, b) => b - a);
    length += sides[0] * item.quantity;
    width = Math.max(width, sides[1]);
    height = Math.max(height, sides[2]);
    weight += item.weightKg * item.quantity;
  }

  if (
    ![length, width, height, weight].every((number) => Number.isFinite(number) && number > 0) ||
    weight > MAX_PACKAGE_WEIGHT_KG ||
    length > MAX_PACKAGE_DIMENSION_CM ||
    width > MAX_PACKAGE_DIMENSION_CM ||
    height > MAX_PACKAGE_DIMENSION_CM
  ) {
    throw new QuoteRouteError(
      "The combined package for one seller exceeds the supported shipping measurements. Ask the seller to review the product package dimensions or split the order.",
      409,
    );
  }

  return { length, width, height, weight };
}

function getRawRates(response: unknown): unknown[] {
  if (!isRecord(response)) return [];
  if (Array.isArray(response.rates)) return response.rates;
  if (Array.isArray(response.couriers)) return response.couriers;
  if (Array.isArray(response.data)) return response.data;
  if (isRecord(response.data) && Array.isArray(response.data.couriers)) return response.data.couriers;
  if (isRecord(response.data) && Array.isArray(response.data.rates)) return response.data.rates;
  if (isRecord(response.data) && Array.isArray(response.data.data)) return response.data.data;
  return [];
}

function normalizeRates(rawRates: unknown[]): NormalizedRate[] {
  const normalized: NormalizedRate[] = [];
  for (const raw of rawRates) {
    if (!isRecord(raw)) continue;
    const courierId = String(raw.courier_id ?? raw.courierId ?? "").trim();
    const serviceCode = String(raw.service_code ?? raw.serviceCode ?? "").trim();
    const courierName = text(raw.courier_name ?? raw.courierName, 100) || "Delivery partner";
    const rawAmount = raw.rate_card_amount ?? raw.total ?? raw.amount;
    const amountNumber = typeof rawAmount === "number" ? rawAmount : Number(rawAmount);
    const currency = text(raw.currency ?? raw.rate_card_currency, 3).toUpperCase() || "NGN";
    if (!courierId || !serviceCode || !Number.isFinite(amountNumber) || amountNumber < 0 || currency !== "NGN") continue;
    const amount = Math.ceil(amountNumber);
    if (!Number.isSafeInteger(amount) || amount > MAX_ORDER_TOTAL) continue;
    normalized.push({
      courierId,
      courierName,
      serviceCode,
      serviceType: text(raw.service_type ?? raw.serviceType, 100) || null,
      amount,
      currency,
      eta: text(raw.delivery_eta ?? raw.delivery_eta_time ?? raw.eta, 100) || null,
      pickupEta: text(raw.pickup_eta ?? raw.pickup_eta_time ?? raw.pickupEta, 100) || null,
    });
  }
  return normalized;
}

function quoteCode(): string {
  return `RMQ-${Date.now().toString(36).toUpperCase()}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

export async function POST(request: Request) {
  const access = await requireBuyer();
  if (!access.authorized) return access.response;

  try {
    if (!access.user.email || !/^\S+@\S+\.\S+$/.test(access.user.email)) {
      throw new QuoteRouteError("Your account needs a valid email address to arrange delivery.", 400);
    }

    const body = await readJson(request);
    const delivery = validateDelivery(body);

    const cart = await prisma.cart.findUnique({
      where: { buyerId: access.user.id },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            product: {
              select: {
                id: true,
                name: true,
                description: true,
                price: true,
                priceMin: true,
                priceMax: true,
                availability: true,
                status: true,
                deletedAt: true,
                stockQuantity: true,
                shippingWeightKg: true,
                shippingLengthCm: true,
                shippingWidthCm: true,
                shippingHeightCm: true,
                business: {
                  select: {
                    id: true,
                    name: true,
                    status: true,
                    deletedAt: true,
                    ownerId: true,
                    shipbubblePickupAddressCode: true,
                    owner: { select: { id: true, role: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) throw new QuoteRouteError("Your cart is empty.", 400);

    const groups = new Map<string, SellerPackage>();
    let itemsSubtotal = 0;
    const fingerprintLines = [];

    for (const cartItem of cart.items) {
      const product = cartItem.product;
      const business = product.business;
      const seller = business.owner;
      const quantity = cartItem.quantity;

      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 50) {
        throw new QuoteRouteError(`The quantity for "${product.name}" is invalid. Update your cart and try again.`);
      }
      if (
        product.status !== "ACTIVE" || product.deletedAt !== null || product.availability !== "AVAILABLE" ||
        product.price === null || product.priceMin !== null || product.priceMax !== null ||
        business.status !== "ACTIVE" || business.deletedAt !== null
      ) {
        throw new QuoteRouteError(`"${product.name}" is no longer available for checkout.`, 409);
      }
      if (!Number.isSafeInteger(product.price) || product.price <= 0) {
        throw new QuoteRouteError(`"${product.name}" does not have a confirmed fixed price.`, 409);
      }
      if (!seller || seller.id !== business.ownerId || seller.role !== "SELLER") {
        throw new QuoteRouteError(`The seller for "${product.name}" is not ready to receive online orders.`, 409);
      }
      if (!business.shipbubblePickupAddressCode || !Number.isSafeInteger(business.shipbubblePickupAddressCode)) {
        throw new QuoteRouteError(`${business.name} has not completed its courier pickup address.`, 409);
      }

      const measures = [product.shippingWeightKg, product.shippingLengthCm, product.shippingWidthCm, product.shippingHeightCm];
      if (measures.some((number) => number === null || !Number.isFinite(number) || number <= 0)) {
        throw new QuoteRouteError(`Shipping weight and package dimensions are missing for "${product.name}". Ask the seller to complete its shipping details.`, 409);
      }
      if (product.stockQuantity !== null && (!Number.isSafeInteger(product.stockQuantity) || product.stockQuantity < quantity)) {
        throw new QuoteRouteError(`There is not enough stock for "${product.name}".`, 409);
      }

      const unitPrice = product.price;
      const lineTotal = unitPrice * quantity;
      if (!Number.isSafeInteger(lineTotal) || lineTotal <= 0) throw new QuoteRouteError("A product line total is invalid.", 400);
      itemsSubtotal += lineTotal;
      if (!Number.isSafeInteger(itemsSubtotal) || itemsSubtotal > MAX_ORDER_TOTAL) throw new QuoteRouteError("Your order total exceeds the supported amount.", 400);

      const packItem: PackItem = {
        productId: product.id,
        productName: product.name,
        description: product.description,
        quantity,
        unitPrice,
        weightKg: product.shippingWeightKg as number,
        lengthCm: product.shippingLengthCm as number,
        widthCm: product.shippingWidthCm as number,
        heightCm: product.shippingHeightCm as number,
      };

      const group = groups.get(business.id) ?? {
        businessId: business.id,
        businessName: business.name,
        sellerId: seller.id,
        senderAddressCode: business.shipbubblePickupAddressCode,
        subtotal: 0,
        items: [],
      };
      group.subtotal += lineTotal;
      group.items.push(packItem);
      groups.set(business.id, group);

      fingerprintLines.push({
        productId: product.id,
        businessId: business.id,
        productName: product.name,
        description: product.description,
        unitPrice,
        quantity,
        weightKg: product.shippingWeightKg as number,
        lengthCm: product.shippingLengthCm as number,
        widthCm: product.shippingWidthCm as number,
        heightCm: product.shippingHeightCm as number,
      });
    }

    if (!groups.size || itemsSubtotal <= 0) throw new QuoteRouteError("Your cart does not contain valid products.", 400);

    const combinedReceiverAddress = `${delivery.deliveryAddress}, ${delivery.deliveryArea}, Nigeria`;
    const receiver = await getReceiverAddressCode({
      userId: access.user.id,
      name: delivery.deliveryRecipient,
      email: access.user.email,
      phone: delivery.deliveryPhone,
      address: combinedReceiverAddress,
    });

    const categoryId = getShipbubbleDefaultCategoryId();
    const pickupDate = nextPickupDate();
    const quoteExpiresAt = new Date(Date.now() + QUOTE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const packagesToCreate: Array<{
      businessId: string;
      sellerId: string;
      senderAddressCode: number;
      requestToken: string;
      categoryId: number;
      packageWeightKg: number;
      packageLengthCm: number;
      packageWidthCm: number;
      packageHeightCm: number;
      packageAmount: number;
      availableRates: Prisma.InputJsonValue;
      expiresAt: Date;
      rates: NormalizedRate[];
    }> = [];

    // Request one Shipbubble quote per seller parcel. We keep these calls
    // sequential to avoid bursting provider rate limits for multi-seller carts.
    for (const group of groups.values()) {
      const dimensions = aggregatePackageDimensions(group.items);
      const packageItems: ShipbubblePackageItem[] = group.items.map((item) => ({
        name: item.productName.slice(0, 100),
        description: (item.description || item.productName).slice(0, 250),
        unit_weight: String(item.weightKg),
        unit_amount: String(item.unitPrice),
        quantity: String(item.quantity),
      }));

      const ratesResponse = await fetchShipbubbleRates({
        senderAddressCode: group.senderAddressCode,
        receiverAddressCode: receiver.addressCode,
        pickupDate,
        categoryId,
        packageItems,
        packageDimension: {
          length: dimensions.length,
          width: dimensions.width,
          height: dimensions.height,
        },
        serviceType: "pickup",
        deliveryInstructions: delivery.deliveryNotes || undefined,
      });

      const rawRates = getRawRates(ratesResponse);
      const rates = normalizeRates(rawRates);
      if (!rates.length) {
        throw new QuoteRouteError(`No supported NGN courier rates were returned for ${group.businessName}. Try another delivery address or contact support.`, 409);
      }
      if (!ratesResponse.request_token) {
        throw new QuoteRouteError(`Shipbubble did not return a delivery quote token for ${group.businessName}. Please retry.`, 502);
      }

      packagesToCreate.push({
        businessId: group.businessId,
        sellerId: group.sellerId,
        senderAddressCode: group.senderAddressCode,
        requestToken: ratesResponse.request_token,
        categoryId,
        packageWeightKg: dimensions.weight,
        packageLengthCm: dimensions.length,
        packageWidthCm: dimensions.width,
        packageHeightCm: dimensions.height,
        packageAmount: group.subtotal,
        availableRates: rates as unknown as Prisma.InputJsonValue,
        expiresAt: quoteExpiresAt,
        rates,
      });
    }

    const fingerprint = createDeliveryCartFingerprint(fingerprintLines);
    const quote = await prisma.deliveryQuote.create({
      data: {
        quoteCode: quoteCode(),
        buyerId: access.user.id,
        status: "OPEN",
        deliveryRecipient: delivery.deliveryRecipient,
        deliveryEmail: access.user.email,
        deliveryPhone: delivery.deliveryPhone,
        deliveryAddress: delivery.deliveryAddress,
        deliveryArea: delivery.deliveryArea,
        deliveryLandmark: delivery.deliveryLandmark,
        deliveryNotes: delivery.deliveryNotes,
        receiverAddressCode: receiver.addressCode,
        receiverAddressData: {
          formattedAddress: receiver.formattedAddress,
          address: combinedReceiverAddress,
        },
        cartFingerprint: fingerprint,
        itemsSubtotal,
        deliveryFee: 0,
        totalAmount: itemsSubtotal,
        currency: "NGN",
        expiresAt: quoteExpiresAt,
        packages: {
          create: packagesToCreate.map((pack) => ({
            businessId: pack.businessId,
            sellerId: pack.sellerId,
            senderAddressCode: pack.senderAddressCode,
            requestToken: pack.requestToken,
            categoryId: pack.categoryId,
            packageWeightKg: pack.packageWeightKg,
            packageLengthCm: pack.packageLengthCm,
            packageWidthCm: pack.packageWidthCm,
            packageHeightCm: pack.packageHeightCm,
            packageAmount: pack.packageAmount,
            availableRates: pack.availableRates,
            expiresAt: pack.expiresAt,
          })),
        },
      },
      include: {
        packages: {
          include: { business: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json({
      quote: {
        id: quote.id,
        quoteCode: quote.quoteCode,
        expiresAt: quote.expiresAt,
        itemsSubtotal: quote.itemsSubtotal,
        packages: quote.packages.map((pack) => ({
          id: pack.id,
          businessId: pack.businessId,
          businessName: pack.business.name,
          items: groups.get(pack.businessId)?.items.map((item) => ({
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
          })) ?? [],
          rates: packagesToCreate.find((created) => created.businessId === pack.businessId)?.rates ?? [],
        })),
      },
    }, { status: 201, headers: noStore });
  } catch (error) {
    if (error instanceof QuoteRouteError || error instanceof ShipbubbleError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore });
    }
    console.error("SHIPBUBBLE_QUOTE_CREATE_ERROR:", error);
    return NextResponse.json({ error: "We could not calculate delivery options. Please try again." }, { status: 500, headers: noStore });
  }
}