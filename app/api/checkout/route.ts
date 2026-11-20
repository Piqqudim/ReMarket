import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { Prisma } from "@prisma/client";

import { requireBuyer } from "@/lib/buyer-auth";
import { initializePaystackTransaction, PaystackError } from "@/lib/paystack";
import { confirmPaystackPayment } from "@/lib/paystack-payment-confirmation";
import { createDeliveryCartFingerprint } from "@/lib/delivery-quote-fingerprint";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_ORDER_TOTAL = 2_147_483_647;
const MAX_QUANTITY_PER_PRODUCT = 50;
const MAX_REQUEST_BODY_BYTES = 32 * 1024;
const MAX_CHECKOUT_RETRIES = 3;
const MAX_IDEMPOTENCY_KEY_LENGTH = 100;
const PAYMENT_WINDOW_MINUTES = 30;

const MAX_RECIPIENT_LENGTH = 100;
const MAX_PHONE_LENGTH = 30;
const MAX_ADDRESS_LENGTH = 300;
const MAX_AREA_LENGTH = 100;
const MAX_LANDMARK_LENGTH = 150;
const MAX_NOTES_LENGTH = 300;

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

class CheckoutError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "CheckoutError";
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

type CheckoutLine = {
  productId: string;
  productName: string;
  productImageUrl: string | null;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  inventoryReserved: boolean;
};

type SellerGroup = {
  businessId: string;
  sellerId: string;
  subtotal: number;
  items: CheckoutLine[];
};

type CreatedSellerOrder = {
  id: string;
  sellerOrderCode: string;
  sellerId: string;
};

type CheckoutResult = {
  order: {
    id: string;
    orderCode: string;
    itemsSubtotal: number;
    deliveryFee: number;
    totalAmount: number;
    deliveryFeeStatus: string;
    status: string;
    paymentExpiresAt: Date | null;
    createdAt: Date;
  };
  sellerOrders: CreatedSellerOrder[];
  paymentId: string;
  paymentReference: string;
  created: boolean;
};

type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; reason: "TOO_LARGE" | "INVALID_JSON" };

const checkoutCartInclude = {
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          priceMin: true,
          priceMax: true,
          imageUrl: true,
          availability: true,
          status: true,
          deletedAt: true,
          stockQuantity: true,
          shippingWeightKg: true,
          shippingLengthCm: true,
          shippingWidthCm: true,
          shippingHeightCm: true,
          images: {
            select: { url: true, sortOrder: true },
            orderBy: { sortOrder: "asc" as const },
            take: 1,
          },
          business: {
            select: {
              id: true,
              status: true,
              deletedAt: true,
              ownerId: true,
              shipbubblePickupAddressCode: true,
              owner: {
                select: { id: true, role: true },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.CartInclude;

type CheckoutCart = Prisma.CartGetPayload<{
  include: typeof checkoutCartInclude;
}>;

const existingCheckoutSelect = {
  id: true,
  buyerId: true,
  orderCode: true,
  itemsSubtotal: true,
  deliveryFee: true,
  totalAmount: true,
  deliveryFeeStatus: true,
  status: true,
  paymentExpiresAt: true,
  createdAt: true,
  deliveryRecipient: true,
  deliveryPhone: true,
  deliveryAddress: true,
  deliveryArea: true,
  deliveryLandmark: true,
  deliveryNotes: true,
  deliveryQuote: { select: { id: true } },
  sellerOrders: {
    select: {
      id: true,
      sellerOrderCode: true,
      sellerId: true,
    },
  },
} satisfies Prisma.OrderSelect;

type ExistingCheckoutRecord = Prisma.OrderGetPayload<{
  select: typeof existingCheckoutSelect;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function createCode(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(8).toString("hex").toUpperCase()}`;
}

function isSerializationConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

function isUniqueConstraintConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function getIdempotencyKey(request: Request): string | null {
  const key = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (
    key.length < 16 ||
    key.length > MAX_IDEMPOTENCY_KEY_LENGTH ||
    !/^[A-Za-z0-9._:-]+$/.test(key)
  ) return null;
  return key;
}

async function readJsonBody(request: Request): Promise<JsonBodyResult> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const declaredLength = Number(contentLength);
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0) {
      return { ok: false, reason: "INVALID_JSON" };
    }
    if (declaredLength > MAX_REQUEST_BODY_BYTES) {
      return { ok: false, reason: "TOO_LARGE" };
    }
  }

  if (!request.body) return { ok: false, reason: "INVALID_JSON" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "TOO_LARGE" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "INVALID_JSON" };
  } finally {
    try { reader.releaseLock(); } catch { /* already cancelled */ }
  }

  try {
    const bytes = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(decoded) as unknown };
  } catch {
    return { ok: false, reason: "INVALID_JSON" };
  }
}

function validateDeliveryDetails(
  body: Record<string, unknown>,
): { valid: true; value: DeliveryDetails } | { valid: false; error: string } {
  const deliveryRecipient = cleanText(body.deliveryRecipient);
  const deliveryPhone = cleanText(body.deliveryPhone);
  const deliveryAddress = cleanText(body.deliveryAddress);
  const deliveryArea = cleanText(body.deliveryArea);
  const deliveryLandmark = cleanText(body.deliveryLandmark) || null;
  const deliveryNotes = cleanText(body.deliveryNotes) || null;

  if (deliveryRecipient.length < 2 || deliveryRecipient.length > MAX_RECIPIENT_LENGTH) {
    return { valid: false, error: "Enter a valid recipient name." };
  }
  const phoneDigits = deliveryPhone.replace(/\D/g, "");
  if (
    !/^\+?[0-9][0-9\s()-]*$/.test(deliveryPhone) ||
    deliveryPhone.length > MAX_PHONE_LENGTH ||
    phoneDigits.length < 7 || phoneDigits.length > 15
  ) return { valid: false, error: "Enter a valid delivery phone number." };
  if (deliveryAddress.length < 5 || deliveryAddress.length > MAX_ADDRESS_LENGTH) {
    return { valid: false, error: "Enter a complete delivery address." };
  }
  if (deliveryArea.length < 2 || deliveryArea.length > MAX_AREA_LENGTH) {
    return { valid: false, error: "Enter a valid delivery area or neighbourhood." };
  }
  if (deliveryLandmark && deliveryLandmark.length > MAX_LANDMARK_LENGTH) {
    return { valid: false, error: "Delivery landmark is too long." };
  }
  if (deliveryNotes && deliveryNotes.length > MAX_NOTES_LENGTH) {
    return { valid: false, error: "Delivery notes are too long." };
  }

  return {
    valid: true,
    value: {
      deliveryRecipient,
      deliveryPhone,
      deliveryAddress,
      deliveryArea,
      deliveryLandmark,
      deliveryNotes,
    },
  };
}

function createFingerprintLines(cart: CheckoutCart) {
  return cart.items.map(({ product, quantity }) => {
    const unitPrice = product.price;
    const dimensions = [
      product.shippingWeightKg,
      product.shippingLengthCm,
      product.shippingWidthCm,
      product.shippingHeightCm,
    ];

    if (
      unitPrice === null ||
      dimensions.some((value) => value === null || !Number.isFinite(value) || value <= 0)
    ) {
      throw new CheckoutError(
        `Shipping measurements or a fixed price are missing for "${product.name}". Ask the seller to complete the product details before checkout.`,
        409,
      );
    }

    return {
      productId: product.id,
      businessId: product.business.id,
      productName: product.name,
      description: product.description,
      unitPrice,
      quantity,
      weightKg: product.shippingWeightKg as number,
      lengthCm: product.shippingLengthCm as number,
      widthCm: product.shippingWidthCm as number,
      heightCm: product.shippingHeightCm as number,
    };
  });
}

async function createCheckout(
  buyerId: string,
  buyerEmail: string,
  delivery: DeliveryDetails,
  deliveryQuoteId: string,
  idempotencyKey: string,
): Promise<CheckoutResult> {
  for (let attempt = 0; attempt < MAX_CHECKOUT_RETRIES; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx): Promise<CheckoutResult> => {
        const existingOrder = await tx.order.findUnique({
          where: { checkoutIdempotencyKey: idempotencyKey },
          select: existingCheckoutSelect,
        });

        if (existingOrder) {
          if (
            existingOrder.buyerId !== buyerId ||
            existingOrder.deliveryQuote?.id !== deliveryQuoteId ||
            existingOrder.deliveryRecipient !== delivery.deliveryRecipient ||
            existingOrder.deliveryPhone !== delivery.deliveryPhone ||
            existingOrder.deliveryAddress !== delivery.deliveryAddress ||
            existingOrder.deliveryArea !== delivery.deliveryArea ||
            existingOrder.deliveryLandmark !== delivery.deliveryLandmark ||
            existingOrder.deliveryNotes !== delivery.deliveryNotes
          ) {
            throw new CheckoutError(
              "This checkout key has already been used with different checkout details. Start a new checkout attempt.",
              409,
            );
          }

          const existingPayment = await tx.payment.findFirst({
            where: { orderId: existingOrder.id },
            orderBy: { createdAt: "desc" },
            select: { id: true, providerReference: true },
          });

          if (!existingPayment?.providerReference) {
            throw new CheckoutError("The existing checkout has no payment reference. Please contact support.", 409);
          }

          return {
            order: {
              id: existingOrder.id,
              orderCode: existingOrder.orderCode,
              itemsSubtotal: existingOrder.itemsSubtotal,
              deliveryFee: existingOrder.deliveryFee,
              totalAmount: existingOrder.totalAmount,
              deliveryFeeStatus: existingOrder.deliveryFeeStatus,
              status: existingOrder.status,
              paymentExpiresAt: existingOrder.paymentExpiresAt,
              createdAt: existingOrder.createdAt,
            },
            sellerOrders: existingOrder.sellerOrders,
            paymentId: existingPayment.id,
            paymentReference: existingPayment.providerReference,
            created: false,
          };
        }

        const cart = await tx.cart.findUnique({
          where: { buyerId },
          include: checkoutCartInclude,
        });

        if (!cart || cart.items.length === 0) {
          throw new CheckoutError("Your cart is empty.", 400);
        }

        const groups = new Map<string, SellerGroup>();
        let itemsSubtotal = 0;

        const fingerprintLines = createFingerprintLines(cart);
        const cartFingerprint = createDeliveryCartFingerprint(fingerprintLines);

        for (const cartItem of cart.items) {
          const product = cartItem.product;
          const business = product.business;
          const quantity = cartItem.quantity;

          if (
            !Number.isSafeInteger(quantity) ||
            quantity < 1 ||
            quantity > MAX_QUANTITY_PER_PRODUCT
          ) {
            throw new CheckoutError(
              `The quantity for "${product.name}" must be between 1 and ${MAX_QUANTITY_PER_PRODUCT}. Update your cart and try again.`,
            );
          }

          if (
            product.status !== "ACTIVE" ||
            product.deletedAt !== null ||
            product.availability !== "AVAILABLE" ||
            product.priceMin !== null ||
            product.priceMax !== null ||
            business.status !== "ACTIVE" ||
            business.deletedAt !== null
          ) {
            throw new CheckoutError(
              `"${product.name}" is no longer available for checkout.`,
              409,
            );
          }

          const unitPrice = product.price;
          if (
            unitPrice === null ||
            !Number.isSafeInteger(unitPrice) ||
            unitPrice <= 0 ||
            unitPrice > MAX_ORDER_TOTAL
          ) {
            throw new CheckoutError(
              `"${product.name}" does not have a valid fixed selling price.`,
              409,
            );
          }

          if (
            !business.ownerId ||
            !business.owner ||
            business.owner.id !== business.ownerId ||
            business.owner.role !== "SELLER"
          ) {
            throw new CheckoutError(
              `The business selling "${product.name}" is not connected to an active seller account.`,
              409,
            );
          }

          if (!business.shipbubblePickupAddressCode) {
            throw new CheckoutError(
              `The seller for "${product.name}" has not completed a delivery pickup address.`,
              409,
            );
          }

          if (
            product.stockQuantity !== null &&
            (!Number.isSafeInteger(product.stockQuantity) || product.stockQuantity < quantity)
          ) {
            throw new CheckoutError(
              `There is not enough stock for "${product.name}". Update your cart and try again.`,
              409,
            );
          }

          const lineTotal = unitPrice * quantity;
          if (!Number.isSafeInteger(lineTotal) || lineTotal <= 0 || lineTotal > MAX_ORDER_TOTAL) {
            throw new CheckoutError(`The total for "${product.name}" is invalid.`, 400);
          }

          itemsSubtotal += lineTotal;
          if (!Number.isSafeInteger(itemsSubtotal) || itemsSubtotal > MAX_ORDER_TOTAL) {
            throw new CheckoutError("Your order total exceeds the supported amount.", 400);
          }

          const group = groups.get(business.id) ?? {
            businessId: business.id,
            sellerId: business.owner.id,
            subtotal: 0,
            items: [],
          };

          group.subtotal += lineTotal;
          if (!Number.isSafeInteger(group.subtotal) || group.subtotal > MAX_ORDER_TOTAL) {
            throw new CheckoutError("A seller order total exceeds the supported amount.", 400);
          }

          group.items.push({
            productId: product.id,
            productName: product.name,
            productImageUrl: product.imageUrl ?? product.images[0]?.url ?? null,
            unitPrice,
            quantity,
            lineTotal,
            inventoryReserved: product.stockQuantity !== null,
          });
          groups.set(business.id, group);
        }

        if (groups.size === 0 || itemsSubtotal <= 0) {
          throw new CheckoutError("Your cart does not contain valid products.", 400);
        }

        const now = new Date();
        const quote = await tx.deliveryQuote.findFirst({
          where: {
            id: deliveryQuoteId,
            buyerId,
            status: "SELECTED",
            expiresAt: { gt: now },
          },
          include: {
            packages: true,
          },
        });

        if (!quote) {
          throw new CheckoutError(
            "Your delivery quote has expired or is no longer selected. Request delivery rates again.",
            409,
          );
        }

        const quoteMatchesDelivery =
          quote.deliveryRecipient === delivery.deliveryRecipient &&
          quote.deliveryPhone === delivery.deliveryPhone &&
          quote.deliveryAddress === delivery.deliveryAddress &&
          quote.deliveryArea === delivery.deliveryArea &&
          quote.deliveryLandmark === delivery.deliveryLandmark &&
          quote.deliveryNotes === delivery.deliveryNotes &&
          quote.deliveryEmail.toLowerCase() === buyerEmail.toLowerCase();

        if (!quoteMatchesDelivery) {
          throw new CheckoutError(
            "Your delivery details have changed. Request new delivery rates before paying.",
            409,
          );
        }

        if (quote.cartFingerprint !== cartFingerprint || quote.itemsSubtotal !== itemsSubtotal) {
          throw new CheckoutError(
            "Your cart has changed since delivery was calculated. Refresh delivery rates and try again.",
            409,
          );
        }

        if (quote.packages.length !== groups.size) {
          throw new CheckoutError(
            "The delivery quote does not cover every seller in your cart. Request new rates.",
            409,
          );
        }

        let deliveryFee = 0;
        for (const group of groups.values()) {
          const pack = quote.packages.find((entry) => entry.businessId === group.businessId);
          if (
            !pack ||
            pack.sellerId !== group.sellerId ||
            !pack.selectedAt ||
            !pack.selectedCourierId ||
            !pack.selectedServiceCode ||
            pack.selectedDeliveryFee === null ||
            !Number.isSafeInteger(pack.selectedDeliveryFee) ||
            pack.selectedDeliveryFee < 0 ||
            pack.expiresAt <= now
          ) {
            throw new CheckoutError(
              "A seller delivery option is missing or has expired. Request delivery rates again.",
              409,
            );
          }

          const currentBusiness = await tx.business.findUnique({
            where: { id: group.businessId },
            select: { shipbubblePickupAddressCode: true, status: true, deletedAt: true },
          });

          if (
            !currentBusiness ||
            currentBusiness.status !== "ACTIVE" ||
            currentBusiness.deletedAt !== null ||
            currentBusiness.shipbubblePickupAddressCode !== pack.senderAddressCode
          ) {
            throw new CheckoutError(
              "A seller's pickup address has changed. Request delivery rates again.",
              409,
            );
          }

          deliveryFee += pack.selectedDeliveryFee;
          if (!Number.isSafeInteger(deliveryFee) || deliveryFee > MAX_ORDER_TOTAL) {
            throw new CheckoutError("The delivery total exceeds the supported amount.", 400);
          }
        }

        const totalAmount = itemsSubtotal + deliveryFee;
        if (!Number.isSafeInteger(totalAmount) || totalAmount <= 0 || totalAmount > MAX_ORDER_TOTAL) {
          throw new CheckoutError("Your checkout total is invalid or too high.", 400);
        }

        if (
          quote.deliveryFee !== deliveryFee ||
          quote.totalAmount !== totalAmount ||
          quote.currency !== "NGN"
        ) {
          throw new CheckoutError(
            "The selected delivery totals do not match the saved quote. Request delivery rates again.",
            409,
          );
        }

        // Reserve tracked stock atomically. An expiry worker must release
        // these reservations if the buyer does not complete payment.
        for (const cartItem of cart.items) {
          if (cartItem.product.stockQuantity === null) continue;

          const reserved = await tx.product.updateMany({
            where: {
              id: cartItem.product.id,
              status: "ACTIVE",
              deletedAt: null,
              availability: "AVAILABLE",
              stockQuantity: { gte: cartItem.quantity },
              business: {
                id: cartItem.product.business.id,
                ownerId: cartItem.product.business.ownerId,
                status: "ACTIVE",
                deletedAt: null,
              },
            },
            data: { stockQuantity: { decrement: cartItem.quantity } },
          });

          if (reserved.count !== 1) {
            throw new CheckoutError(
              `Stock for "${cartItem.product.name}" has just changed. Refresh your cart and try again.`,
              409,
            );
          }
        }

        const paymentExpiresAt = new Date(now.getTime() + PAYMENT_WINDOW_MINUTES * 60 * 1000);
        const order = await tx.order.create({
          data: {
            orderCode: createCode("RM"),
            buyerId,
            checkoutIdempotencyKey: idempotencyKey,
            status: "PENDING_PAYMENT",
            itemsSubtotal,
            deliveryFee,
            deliveryFeeStatus: "CONFIRMED",
            totalAmount,
            currency: "NGN",
            paidAt: null,
            paymentExpiresAt,
            deliveryRecipient: delivery.deliveryRecipient,
            deliveryPhone: delivery.deliveryPhone,
            deliveryAddress: delivery.deliveryAddress,
            deliveryArea: delivery.deliveryArea,
            deliveryLandmark: delivery.deliveryLandmark,
            deliveryNotes: delivery.deliveryNotes,
          },
          select: {
            id: true,
            orderCode: true,
            itemsSubtotal: true,
            deliveryFee: true,
            totalAmount: true,
            deliveryFeeStatus: true,
            status: true,
            paymentExpiresAt: true,
            createdAt: true,
          },
        });

        const createdSellerOrders: CreatedSellerOrder[] = [];
        for (const group of groups.values()) {
          const sellerOrder = await tx.sellerOrder.create({
            data: {
              sellerOrderCode: createCode("RMS"),
              orderId: order.id,
              sellerId: group.sellerId,
              businessId: group.businessId,
              status: "PENDING_ACCEPTANCE",
              subtotal: group.subtotal,
              items: {
                create: group.items.map((item) => ({
                  productId: item.productId,
                  productName: item.productName,
                  productImageUrl: item.productImageUrl,
                  unitPrice: item.unitPrice,
                  quantity: item.quantity,
                  lineTotal: item.lineTotal,
                  inventoryReserved: item.inventoryReserved,
                })),
              },
            },
            select: { id: true, sellerOrderCode: true, sellerId: true },
          });
          createdSellerOrders.push(sellerOrder);
        }

        // Consume the selected quote and link it to the parent order.
        const consumed = await tx.deliveryQuote.updateMany({
          where: {
            id: quote.id,
            buyerId,
            status: "SELECTED",
            expiresAt: { gt: now },
          },
          data: {
            status: "CONSUMED",
            consumedAt: now,
          },
        });

        if (consumed.count !== 1) {
          throw new CheckoutError(
            "The delivery quote was used by another checkout. Request new delivery rates.",
            409,
          );
        }

        await tx.deliveryQuote.update({
          where: { id: quote.id },
          data: { orderId: order.id },
        });

        const paymentReference = createCode("RMPAY");
        const payment = await tx.payment.create({
          data: {
            orderId: order.id,
            amount: totalAmount,
            currency: "NGN",
            status: "PENDING",
            provider: "PAYSTACK",
            providerReference: paymentReference,
            idempotencyKey: `order:${order.id}:payment:1`,
            expiresAt: paymentExpiresAt,
            metadata: {
              orderCode: order.orderCode,
              deliveryQuoteId: quote.id,
              paymentWindowMinutes: PAYMENT_WINDOW_MINUTES,
            },
          },
          select: { id: true, providerReference: true },
        });

        return {
          order,
          sellerOrders: createdSellerOrders,
          paymentId: payment.id,
          paymentReference: payment.providerReference as string,
          created: true,
        };
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (isUniqueConstraintConflict(error)) {
        const existingOrder = await prisma.order.findUnique({
          where: { checkoutIdempotencyKey: idempotencyKey },
          select: existingCheckoutSelect,
        });
        if (existingOrder) {
          if (
            existingOrder.buyerId !== buyerId ||
            existingOrder.deliveryQuote?.id !== deliveryQuoteId ||
            existingOrder.deliveryRecipient !== delivery.deliveryRecipient ||
            existingOrder.deliveryPhone !== delivery.deliveryPhone ||
            existingOrder.deliveryAddress !== delivery.deliveryAddress ||
            existingOrder.deliveryArea !== delivery.deliveryArea ||
            existingOrder.deliveryLandmark !== delivery.deliveryLandmark ||
            existingOrder.deliveryNotes !== delivery.deliveryNotes
          ) {
            throw new CheckoutError("This checkout key has already been used with different details.", 409);
          }
          const latestPayment = await prisma.payment.findFirst({
            where: { orderId: existingOrder.id },
            orderBy: { createdAt: "desc" },
            select: { id: true, providerReference: true },
          });
          if (!latestPayment?.providerReference) {
            throw new CheckoutError("The existing checkout payment could not be retrieved.", 409);
          }
          return {
            order: {
              id: existingOrder.id,
              orderCode: existingOrder.orderCode,
              itemsSubtotal: existingOrder.itemsSubtotal,
              deliveryFee: existingOrder.deliveryFee,
              totalAmount: existingOrder.totalAmount,
              deliveryFeeStatus: existingOrder.deliveryFeeStatus,
              status: existingOrder.status,
              paymentExpiresAt: existingOrder.paymentExpiresAt,
              createdAt: existingOrder.createdAt,
            },
            sellerOrders: existingOrder.sellerOrders,
            paymentId: latestPayment.id,
            paymentReference: latestPayment.providerReference,
            created: false,
          };
        }
      }

      if (isSerializationConflict(error) && attempt < MAX_CHECKOUT_RETRIES - 1) {
        continue;
      }
      if (isSerializationConflict(error)) {
        throw new CheckoutError(
          "Your cart or available stock changed while checkout was processing. Refresh and try again.",
          409,
        );
      }
      throw error;
    }
  }

  throw new CheckoutError("Unable to process checkout. Please try again.", 409);
}

async function getOrCreatePaymentAttempt(orderId: string, currentPaymentId: string) {
  const current = await prisma.payment.findUnique({
    where: { id: currentPaymentId },
    select: {
      id: true,
      providerReference: true,
      status: true,
      authorizationUrl: true,
      providerAccessCode: true,
      expiresAt: true,
      metadata: true,
    },
  });
  if (!current?.providerReference) {
    throw new CheckoutError("The payment reference could not be retrieved.", 409);
  }

  if (current.status === "INITIATED" && current.authorizationUrl && current.expiresAt && current.expiresAt > new Date()) {
    return current;
  }

  if (current.status === "PENDING") return current;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, paymentExpiresAt: true, totalAmount: true },
  });
  if (!order || order.status !== "PENDING_PAYMENT" || !order.paymentExpiresAt || order.paymentExpiresAt <= new Date()) {
    throw new CheckoutError("This payment session has expired. Return to your cart and start checkout again.", 409);
  }

  return prisma.$transaction(async (tx) => {
    const latest = await tx.payment.findFirst({
      where: { orderId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        providerReference: true,
        status: true,
        authorizationUrl: true,
        providerAccessCode: true,
        expiresAt: true,
        metadata: true,
      },
    });

    if (latest && latest.status === "INITIATED" && latest.authorizationUrl && latest.expiresAt && latest.expiresAt > new Date()) {
      return latest;
    }
    if (latest && latest.status === "PENDING") return latest;

    const attemptNumber = await tx.payment.count({ where: { orderId } }) + 1;
    const reference = createCode("RMPAY");
    return tx.payment.create({
      data: {
        orderId,
        amount: order.totalAmount,
        currency: "NGN",
        status: "PENDING",
        provider: "PAYSTACK",
        providerReference: reference,
        idempotencyKey: `order:${orderId}:payment:${attemptNumber}`,
        expiresAt: order.paymentExpiresAt,
        metadata: { retryAttempt: attemptNumber },
      },
      select: {
        id: true,
        providerReference: true,
        status: true,
        authorizationUrl: true,
        providerAccessCode: true,
        expiresAt: true,
        metadata: true,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function POST(request: Request) {
  const access = await requireBuyer();
  if (!access.authorized) return access.response;

  const idempotencyKey = getIdempotencyKey(request);
  if (!idempotencyKey) {
    return NextResponse.json(
      { error: "A valid checkout request key is required. Refresh checkout and try again." },
      { status: 400, headers: noStore },
    );
  }

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { error: bodyResult.reason === "TOO_LARGE" ? "Checkout request is too large." : "Invalid JSON request." },
      { status: bodyResult.reason === "TOO_LARGE" ? 413 : 400, headers: noStore },
    );
  }
  if (!isRecord(bodyResult.value)) {
    return NextResponse.json({ error: "Checkout details are required." }, { status: 400, headers: noStore });
  }

  const deliveryResult = validateDeliveryDetails(bodyResult.value);
  if (!deliveryResult.valid) {
    return NextResponse.json({ error: deliveryResult.error }, { status: 400, headers: noStore });
  }

  const deliveryQuoteId = cleanText(bodyResult.value.deliveryQuoteId);
  if (!deliveryQuoteId || deliveryQuoteId.length > 100) {
    return NextResponse.json(
      { error: "Select a valid delivery option before continuing to payment." },
      { status: 400, headers: noStore },
    );
  }
  if (!access.user.email) {
    return NextResponse.json({ error: "Your account needs a valid email address for payment." }, { status: 400, headers: noStore });
  }

  try {
    const result = await createCheckout(
      access.user.id,
      access.user.email,
      deliveryResult.value,
      deliveryQuoteId,
      idempotencyKey,
    );

    const order = await prisma.order.findUnique({
      where: { id: result.order.id },
      select: { status: true, paymentExpiresAt: true, paidAt: true },
    });
    if (!order) {
      throw new CheckoutError("The order could not be found. Please contact support.", 404);
    }

    // An idempotent retry after a successful webhook must not create another charge.
    if (order.status !== "PENDING_PAYMENT") {
      const completedPayment = await prisma.payment.findFirst({
        where: { orderId: result.order.id, status: "SUCCESS" },
        orderBy: { paidAt: "desc" },
        select: {
          id: true,
          providerReference: true,
          status: true,
          paidAt: true,
        },
      });

      if (completedPayment) {
        return NextResponse.json({
          message: "This order has already been paid.",
          order: { ...result.order, status: order.status },
          sellerOrders: result.sellerOrders,
          payment: {
            id: completedPayment.id,
            reference: completedPayment.providerReference,
            status: completedPayment.status,
            paidAt: completedPayment.paidAt,
            authorizationUrl: null,
            accessCode: null,
          },
          idempotentReplay: true,
        }, { status: 200, headers: noStore });
      }

      throw new CheckoutError("This order is no longer awaiting payment. Please check your orders.", 409);
    }

    if (!order.paymentExpiresAt || order.paymentExpiresAt <= new Date()) {
      throw new CheckoutError("This checkout has expired. Return to your cart and request delivery rates again.", 409);
    }

    let payment = await getOrCreatePaymentAttempt(result.order.id, result.paymentId);

    // A previous Paystack initialization timed out or returned an ambiguous
    // server response. Verify that exact reference before attempting another
    // initialization, so the same buyer cannot accidentally create a second
    // charge or have stock released while the first charge is still pending.
    const paymentMetadata = isRecord(payment.metadata) ? payment.metadata : {};
    if (payment.status === "PENDING" && paymentMetadata.initializationOutcomeUnknown === true) {
      let verification: Awaited<ReturnType<typeof confirmPaystackPayment>>;
      try {
        verification = await confirmPaystackPayment(payment.providerReference as string);
      } catch (verificationError) {
        console.error("PAYSTACK_INITIALIZATION_RECONCILIATION_ERROR:", verificationError);
        return NextResponse.json(
          {
            error: "We are still checking the previous Paystack request. Please do not start another payment attempt yet.",
            orderId: result.order.id,
            orderCode: result.order.orderCode,
            paymentReference: payment.providerReference,
            requiresReconciliation: true,
          },
          { status: 503, headers: noStore },
        );
      }

      if (verification.paymentStatus === "SUCCESS") {
        return NextResponse.json(
          {
            message: verification.requiresManualReview
              ? "Paystack received the payment, but this order needs review before fulfilment."
              : "Your payment has already been confirmed.",
            order: { ...result.order, status: verification.orderStatus },
            sellerOrders: result.sellerOrders,
            payment: {
              id: payment.id,
              reference: payment.providerReference,
              status: verification.paymentStatus,
              paidAt: verification.paidAt,
              authorizationUrl: null,
              accessCode: null,
            },
            requiresManualReview: verification.requiresManualReview,
            idempotentReplay: true,
          },
          { status: verification.requiresManualReview ? 409 : 200, headers: noStore },
        );
      }

      if (verification.paymentStatus === "PENDING") {
        return NextResponse.json(
          {
            error: "Paystack is still processing the previous payment request. Please check again shortly; do not start another payment yet.",
            orderId: result.order.id,
            orderCode: result.order.orderCode,
            paymentReference: payment.providerReference,
            paymentStatus: "PENDING",
            requiresReconciliation: true,
          },
          { status: 409, headers: noStore },
        );
      }

      // A conclusive provider failure/cancellation has been recorded. A new
      // reference may now be created safely within the original payment window.
      payment = await getOrCreatePaymentAttempt(result.order.id, payment.id);
    }

    if (payment.status === "INITIATED" && payment.authorizationUrl) {
      return NextResponse.json({
        message: "Continue to your existing Paystack payment session.",
        order: result.order,
        sellerOrders: result.sellerOrders,
        payment: {
          id: payment.id,
          reference: payment.providerReference,
          authorizationUrl: payment.authorizationUrl,
          accessCode: payment.providerAccessCode,
          status: payment.status,
          expiresAt: payment.expiresAt,
        },
        idempotentReplay: !result.created,
      }, { status: result.created ? 201 : 200, headers: noStore });
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin).replace(/\/$/, "");
    const callbackUrl = `${appUrl}/checkout/payment/callback`;

    try {
      const initialized = await initializePaystackTransaction({
        email: access.user.email,
        amountKobo: result.order.totalAmount * 100,
        reference: payment.providerReference as string,
        callbackUrl,
        metadata: {
          orderId: result.order.id,
          orderCode: result.order.orderCode,
          paymentId: payment.id,
          buyerId: access.user.id,
          deliveryQuoteId,
        },
      });

      const updatedPayment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "INITIATED",
          authorizationUrl: initialized.authorization_url,
          providerAccessCode: initialized.access_code,
          initializedAt: new Date(),
          failureReason: null,
        },
        select: {
          id: true,
          providerReference: true,
          authorizationUrl: true,
          providerAccessCode: true,
          status: true,
          expiresAt: true,
        },
      });

      return NextResponse.json({
        message: "Your order is ready. Continue to Paystack to complete payment.",
        order: result.order,
        sellerOrders: result.sellerOrders,
        payment: {
          id: updatedPayment.id,
          reference: updatedPayment.providerReference,
          authorizationUrl: updatedPayment.authorizationUrl,
          accessCode: updatedPayment.providerAccessCode,
          status: updatedPayment.status,
          expiresAt: updatedPayment.expiresAt,
        },
        idempotentReplay: !result.created,
      }, { status: result.created ? 201 : 200, headers: noStore });
    } catch (providerError) {
      const message = providerError instanceof PaystackError
        ? providerError.message
        : "Paystack could not initialize this payment. Please try again.";

      const providerStatus = providerError instanceof PaystackError ? providerError.status : 502;
      const outcomeMayBeUnknown = providerStatus >= 500 || [408, 409, 429].includes(providerStatus);
      const existingPayment = await prisma.payment.findUnique({
        where: { id: payment.id },
        select: { metadata: true },
      });
      const priorMetadata = isRecord(existingPayment?.metadata) ? existingPayment.metadata : {};

      await prisma.payment.updateMany({
        where: { id: payment.id, status: "PENDING" },
        data: {
          // A transport timeout or server/rate-limit response may have
          // happened after Paystack accepted the request. Keep the payment
          // pending until its reference is reconciled with Paystack.
          ...(outcomeMayBeUnknown ? {} : { status: "FAILED" as const }),
          failureReason: message.slice(0, 500),
          metadata: {
            ...priorMetadata,
            initializationOutcomeUnknown: outcomeMayBeUnknown,
          } as Prisma.InputJsonValue,
        },
      });

      console.error("PAYSTACK_INITIALIZATION_ERROR:", providerError);
      return NextResponse.json(
        {
          error: "We created your pending order, but payment could not be started. You can retry checkout before the payment reservation expires.",
          orderId: result.order.id,
          orderCode: result.order.orderCode,
          paymentError: message,
        },
        { status: 502, headers: noStore },
      );
    }
  } catch (error) {
    if (error instanceof CheckoutError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore });
    }
    console.error("Checkout and Paystack initialization error:", error);
    return NextResponse.json(
      { error: "We could not prepare your checkout. Your cart has been kept; please try again." },
      { status: 500, headers: noStore },
    );
  }
}