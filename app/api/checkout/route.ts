
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import {
  NotificationPriority,
  NotificationType,
  Prisma,
} from "@prisma/client";

import { requireBuyer } from "@/lib/buyer-auth";
import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_ORDER_TOTAL = 2_147_483_647;
const MAX_QUANTITY_PER_PRODUCT = 50;
const MAX_REQUEST_BODY_BYTES = 32 * 1024;
const MAX_CHECKOUT_RETRIES = 3;
const MAX_IDEMPOTENCY_KEY_LENGTH = 100;

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

  // True only when tracked stock was reserved.
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
    createdAt: Date;
  };
  sellerOrders: CreatedSellerOrder[];

  // Internal flag. It is not returned as part of the order.
  created: boolean;
};

type JsonBodyResult =
  | {
      ok: true;
      value: unknown;
    }
  | {
      ok: false;
      reason: "TOO_LARGE" | "INVALID_JSON";
    };

/*
 * --------------------------------------------------
 * EXISTING CHECKOUT LOOKUP
 * --------------------------------------------------
 *
 * Used when a buyer retries a request with the same
 * idempotency key.
 * --------------------------------------------------
 */

const existingCheckoutSelect = {
  id: true,
  buyerId: true,
  orderCode: true,
  itemsSubtotal: true,
  deliveryFee: true,
  totalAmount: true,
  deliveryFeeStatus: true,
  status: true,
  createdAt: true,

  deliveryRecipient: true,
  deliveryPhone: true,
  deliveryAddress: true,
  deliveryArea: true,
  deliveryLandmark: true,
  deliveryNotes: true,

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

function buildExistingCheckoutResult(
  existing: ExistingCheckoutRecord,
  buyerId: string,
  delivery: DeliveryDetails,
): CheckoutResult {
  if (existing.buyerId !== buyerId) {
    throw new CheckoutError(
      "This checkout key has already been used.",
      409,
    );
  }

  /*
   * Prevent the same idempotency key from being reused
   * with different delivery information.
   */

  const deliveryMatches =
    existing.deliveryRecipient === delivery.deliveryRecipient &&
    existing.deliveryPhone === delivery.deliveryPhone &&
    existing.deliveryAddress === delivery.deliveryAddress &&
    existing.deliveryArea === delivery.deliveryArea &&
    existing.deliveryLandmark === delivery.deliveryLandmark &&
    existing.deliveryNotes === delivery.deliveryNotes;

  if (!deliveryMatches) {
    throw new CheckoutError(
      "This checkout request has already been used with different delivery details. Start a new checkout attempt.",
      409,
    );
  }

  return {
    order: {
      id: existing.id,
      orderCode: existing.orderCode,
      itemsSubtotal: existing.itemsSubtotal,
      deliveryFee: existing.deliveryFee,
      totalAmount: existing.totalAmount,
      deliveryFeeStatus: existing.deliveryFeeStatus,
      status: existing.status,
      createdAt: existing.createdAt,
    },

    sellerOrders: existing.sellerOrders,

    created: false,
  };
}

/*
 * --------------------------------------------------
 * GENERAL HELPERS
 * --------------------------------------------------
 */

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function cleanText(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function createCode(prefix: string): string {
  return `${prefix}-${Date.now()
    .toString(36)
    .toUpperCase()}-${randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
}

function isSerializationConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

function isUniqueConstraintConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/*
 * --------------------------------------------------
 * IDEMPOTENCY KEY
 * --------------------------------------------------
 *
 * The checkout page must send this in the request header:
 *
 * Idempotency-Key: a-unique-client-generated-key
 *
 * The same key must be reused when retrying the same
 * checkout request.
 * --------------------------------------------------
 */

function getIdempotencyKey(
  request: Request,
): string | null {
  const key =
    request.headers.get("Idempotency-Key")?.trim() ?? "";

  if (
    key.length < 16 ||
    key.length > MAX_IDEMPOTENCY_KEY_LENGTH ||
    !/^[A-Za-z0-9._:-]+$/.test(key)
  ) {
    return null;
  }

  return key;
}

/*
 * --------------------------------------------------
 * REQUEST BODY
 * --------------------------------------------------
 *
 * Enforces the request body size limit while reading.
 * This also protects requests without Content-Length.
 * --------------------------------------------------
 */

async function readJsonBody(
  request: Request,
): Promise<JsonBodyResult> {
  const contentLength = request.headers.get("content-length");

  if (contentLength !== null) {
    const declaredLength = Number(contentLength);

    if (
      !Number.isSafeInteger(declaredLength) ||
      declaredLength < 0
    ) {
      return {
        ok: false,
        reason: "INVALID_JSON",
      };
    }

    if (declaredLength > MAX_REQUEST_BODY_BYTES) {
      return {
        ok: false,
        reason: "TOO_LARGE",
      };
    }
  }

  if (!request.body) {
    return {
      ok: false,
      reason: "INVALID_JSON",
    };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];

  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (!value) {
        continue;
      }

      totalBytes += value.byteLength;

      if (totalBytes > MAX_REQUEST_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);

        return {
          ok: false,
          reason: "TOO_LARGE",
        };
      }

      chunks.push(value);
    }
  } catch {
    return {
      ok: false,
      reason: "INVALID_JSON",
    };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // The reader may already have been cancelled.
    }
  }

  try {
    const bytes = new Uint8Array(totalBytes);

    let offset = 0;

    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const decoded = new TextDecoder("utf-8", {
      fatal: true,
    }).decode(bytes);

    return {
      ok: true,
      value: JSON.parse(decoded) as unknown,
    };
  } catch {
    return {
      ok: false,
      reason: "INVALID_JSON",
    };
  }
}

/*
 * --------------------------------------------------
 * DELIVERY VALIDATION
 * --------------------------------------------------
 */

function validateDeliveryDetails(
  body: Record<string, unknown>,
):
  | {
      valid: true;
      value: DeliveryDetails;
    }
  | {
      valid: false;
      error: string;
    } {
  const deliveryRecipient = cleanText(
    body.deliveryRecipient,
  );

  const deliveryPhone = cleanText(
    body.deliveryPhone,
  );

  const deliveryAddress = cleanText(
    body.deliveryAddress,
  );

  const deliveryArea = cleanText(
    body.deliveryArea,
  );

  const deliveryLandmark =
    cleanText(body.deliveryLandmark) || null;

  const deliveryNotes =
    cleanText(body.deliveryNotes) || null;

  if (
    deliveryRecipient.length < 2 ||
    deliveryRecipient.length > MAX_RECIPIENT_LENGTH
  ) {
    return {
      valid: false,
      error: "Enter a valid recipient name.",
    };
  }

  const phoneDigits = deliveryPhone.replace(/\D/g, "");

  if (
    !/^\+?[0-9][0-9\s()-]*$/.test(deliveryPhone) ||
    deliveryPhone.length > MAX_PHONE_LENGTH ||
    phoneDigits.length < 7 ||
    phoneDigits.length > 15
  ) {
    return {
      valid: false,
      error: "Enter a valid delivery phone number.",
    };
  }

  if (
    deliveryAddress.length < 5 ||
    deliveryAddress.length > MAX_ADDRESS_LENGTH
  ) {
    return {
      valid: false,
      error: "Enter a complete delivery address.",
    };
  }

  if (
    deliveryArea.length < 2 ||
    deliveryArea.length > MAX_AREA_LENGTH
  ) {
    return {
      valid: false,
      error: "Enter a valid delivery area or neighbourhood.",
    };
  }

  if (
    deliveryLandmark &&
    deliveryLandmark.length > MAX_LANDMARK_LENGTH
  ) {
    return {
      valid: false,
      error: "Delivery landmark is too long.",
    };
  }

  if (
    deliveryNotes &&
    deliveryNotes.length > MAX_NOTES_LENGTH
  ) {
    return {
      valid: false,
      error: "Delivery notes are too long.",
    };
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

/*
 * --------------------------------------------------
 * CHECKOUT TRANSACTION
 * --------------------------------------------------
 *
 * One buyer checkout creates:
 *
 * - One parent Order.
 * - One SellerOrder for each business.
 * - OrderItems under each SellerOrder.
 *
 * Tracked inventory is reserved atomically.
 *
 * The idempotency key prevents duplicate orders when
 * the buyer retries the same checkout request.
 *
 * Serializable isolation protects concurrent checkout
 * attempts and stock updates.
 * --------------------------------------------------
 */

async function createCheckout(
  buyerId: string,
  delivery: DeliveryDetails,
  idempotencyKey: string,
): Promise<CheckoutResult> {
  for (
    let attempt = 0;
    attempt < MAX_CHECKOUT_RETRIES;
    attempt += 1
  ) {
    try {
      return await prisma.$transaction(
        async (tx): Promise<CheckoutResult> => {
          /*
           * --------------------------------------------------
           * CHECK FOR AN EXISTING CHECKOUT
           * --------------------------------------------------
           *
           * If this key already created an order, return
           * that order instead of creating another one.
           * --------------------------------------------------
           */

          const existingOrder = await tx.order.findUnique({
            where: {
              checkoutIdempotencyKey: idempotencyKey,
            },

            select: existingCheckoutSelect,
          });

          if (existingOrder) {
            return buildExistingCheckoutResult(
              existingOrder,
              buyerId,
              delivery,
            );
          }

          /*
           * LOAD BUYER CART
           */

          const cart = await tx.cart.findUnique({
            where: {
              buyerId,
            },

            include: {
              items: {
                orderBy: {
                  createdAt: "asc",
                },

                include: {
                  product: {
                    select: {
                      id: true,
                      name: true,
                      price: true,
                      imageUrl: true,
                      availability: true,
                      status: true,
                      deletedAt: true,
                      stockQuantity: true,

                      images: {
                        select: {
                          url: true,
                          sortOrder: true,
                        },

                        orderBy: {
                          sortOrder: "asc",
                        },

                        take: 1,
                      },

                      business: {
                        select: {
                          id: true,
                          status: true,
                          deletedAt: true,
                          ownerId: true,

                          owner: {
                            select: {
                              id: true,
                              role: true,
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          });

          if (!cart || cart.items.length === 0) {
            throw new CheckoutError(
              "Your cart is empty.",
              400,
            );
          }

          const groups = new Map<string, SellerGroup>();

          let itemsSubtotal = 0;

          /*
           * --------------------------------------------------
           * VALIDATE CART ITEMS AND GROUP BY BUSINESS
           * --------------------------------------------------
           */

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
                400,
              );
            }

            /*
             * PRODUCT AND BUSINESS AVAILABILITY
             */

            if (
              product.status !== "ACTIVE" ||
              product.deletedAt !== null ||
              product.availability !== "AVAILABLE" ||
              business.status !== "ACTIVE" ||
              business.deletedAt !== null
            ) {
              throw new CheckoutError(
                `"${product.name}" is no longer available. Remove it from your cart to continue.`,
                409,
              );
            }

            /*
             * FIXED SELLING PRICE VALIDATION
             *
             * Product price is the current selling price.
             * originalPrice is display-only.
             */

            const unitPrice = product.price;

            if (
              unitPrice === null ||
              !Number.isSafeInteger(unitPrice) ||
              unitPrice <= 0 ||
              unitPrice > MAX_ORDER_TOTAL
            ) {
              throw new CheckoutError(
                `"${product.name}" does not have a valid confirmed fixed selling price and cannot be checked out yet.`,
                409,
              );
            }

            /*
             * INVENTORY VALIDATION
             *
             * null = inventory tracking disabled.
             * zero = out of stock.
             */

            if (
              product.stockQuantity !== null &&
              (
                !Number.isSafeInteger(product.stockQuantity) ||
                product.stockQuantity < 0
              )
            ) {
              throw new CheckoutError(
                `The inventory information for "${product.name}" is invalid.`,
                409,
              );
            }

            if (
              product.stockQuantity !== null &&
              quantity > product.stockQuantity
            ) {
              throw new CheckoutError(
                `There is not enough stock for "${product.name}". Update its quantity in your cart.`,
                409,
              );
            }

            /*
             * VERIFY SELLER OWNERSHIP
             */

            const seller = business.owner;

            if (
              !business.ownerId ||
              !seller ||
              seller.id !== business.ownerId ||
              seller.role !== "SELLER"
            ) {
              throw new CheckoutError(
                `The business selling "${product.name}" is not connected to an active seller account yet.`,
                409,
              );
            }

            /*
             * CALCULATE ITEM TOTAL
             */

            const lineTotal = unitPrice * quantity;

            if (
              !Number.isSafeInteger(lineTotal) ||
              lineTotal <= 0 ||
              lineTotal > MAX_ORDER_TOTAL
            ) {
              throw new CheckoutError(
                `The total for "${product.name}" is invalid or exceeds the supported amount.`,
                400,
              );
            }

            itemsSubtotal += lineTotal;

            if (
              !Number.isSafeInteger(itemsSubtotal) ||
              itemsSubtotal > MAX_ORDER_TOTAL
            ) {
              throw new CheckoutError(
                "Your order total exceeds the supported amount.",
                400,
              );
            }

            /*
             * GROUP ITEMS BY BUSINESS
             */

            const group = groups.get(business.id) ?? {
              businessId: business.id,
              sellerId: seller.id,
              subtotal: 0,
              items: [],
            };

            group.subtotal += lineTotal;

            if (
              !Number.isSafeInteger(group.subtotal) ||
              group.subtotal > MAX_ORDER_TOTAL
            ) {
              throw new CheckoutError(
                "A seller order total exceeds the supported amount.",
                400,
              );
            }

            group.items.push({
              productId: product.id,
              productName: product.name,

              productImageUrl:
                product.imageUrl ??
                product.images[0]?.url ??
                null,

              unitPrice,
              quantity,
              lineTotal,

              /*
               * This flag is saved on the OrderItem.
               * It tells us whether stock was reserved.
               */

              inventoryReserved:
                product.stockQuantity !== null,
            });

            groups.set(business.id, group);
          }

          if (groups.size === 0 || itemsSubtotal <= 0) {
            throw new CheckoutError(
              "Your cart does not contain any valid products.",
              400,
            );
          }

          /*
           * --------------------------------------------------
           * ATOMIC STOCK RESERVATION
           * --------------------------------------------------
           *
           * Untracked products are not decremented.
           *
           * Tracked products are decremented only when
           * enough stock remains in the database.
           *
           * If one reservation fails, all earlier stock
           * changes in this transaction are rolled back.
           * --------------------------------------------------
           */

          for (const cartItem of cart.items) {
            const product = cartItem.product;

            if (product.stockQuantity === null) {
              continue;
            }

            const reserved = await tx.product.updateMany({
              where: {
                id: product.id,
                status: "ACTIVE",
                deletedAt: null,
                availability: "AVAILABLE",

                stockQuantity: {
                  gte: cartItem.quantity,
                },

                business: {
                  id: product.business.id,
                  ownerId: product.business.ownerId,
                  status: "ACTIVE",
                  deletedAt: null,
                },
              },

              data: {
                stockQuantity: {
                  decrement: cartItem.quantity,
                },
              },
            });

            if (reserved.count !== 1) {
              throw new CheckoutError(
                `Stock for "${product.name}" has just changed. Refresh your cart and try again.`,
                409,
              );
            }
          }

          /*
           * --------------------------------------------------
           * CREATE PARENT ORDER
           * --------------------------------------------------
           */

          const order = await tx.order.create({
            data: {
              orderCode: createCode("RM"),

              buyerId,

              checkoutIdempotencyKey: idempotencyKey,

              status: "PLACED",

              itemsSubtotal,

              /*
               * Delivery fee has not been confirmed.
               * The checkout page must not present this
               * subtotal as the final delivered amount.
               */

              deliveryFee: 0,
              deliveryFeeStatus: "UNCONFIRMED",

              totalAmount: itemsSubtotal,

              currency: "NGN",

              deliveryRecipient:
                delivery.deliveryRecipient,

              deliveryPhone:
                delivery.deliveryPhone,

              deliveryAddress:
                delivery.deliveryAddress,

              deliveryArea:
                delivery.deliveryArea,

              deliveryLandmark:
                delivery.deliveryLandmark,

              deliveryNotes:
                delivery.deliveryNotes,
            },

            select: {
              id: true,
              orderCode: true,
              itemsSubtotal: true,
              deliveryFee: true,
              totalAmount: true,
              deliveryFeeStatus: true,
              status: true,
              createdAt: true,
            },
          });

          /*
           * --------------------------------------------------
           * CREATE SELLER ORDERS
           * --------------------------------------------------
           *
           * Every seller receives a separate order containing
           * only products belonging to their business.
           * --------------------------------------------------
           */

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

                    /*
                     * Used later to restore reserved stock
                     * when the seller order is rejected or
                     * cancellation is approved.
                     */

                    inventoryReserved: item.inventoryReserved,
                  })),
                },
              },

              select: {
                id: true,
                sellerOrderCode: true,
                sellerId: true,
              },
            });

            createdSellerOrders.push(sellerOrder);
          }

          /*
           * --------------------------------------------------
           * CLEAR BUYER CART
           * --------------------------------------------------
           *
           * Only happens after all order records have
           * been successfully created.
           * --------------------------------------------------
           */

          await tx.cartItem.deleteMany({
            where: {
              cartId: cart.id,
            },
          });

          return {
            order,
            sellerOrders: createdSellerOrders,
            created: true,
          };
        },

        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        },
      );
    } catch (error) {
      /*
       * --------------------------------------------------
       * HANDLE DUPLICATE IDEMPOTENCY KEY
       * --------------------------------------------------
       *
       * Two identical requests can arrive at almost
       * the same time. If one creates the order first,
       * the other may encounter a unique constraint error.
       *
       * Return the existing order rather than creating
       * another one.
       * --------------------------------------------------
       */

      if (isUniqueConstraintConflict(error)) {
        const existingOrder = await prisma.order.findUnique({
          where: {
            checkoutIdempotencyKey: idempotencyKey,
          },

          select: existingCheckoutSelect,
        });

        if (existingOrder) {
          return buildExistingCheckoutResult(
            existingOrder,
            buyerId,
            delivery,
          );
        }
      }

      /*
       * RETRY SERIALIZATION CONFLICTS
       */

      if (isSerializationConflict(error)) {
        if (attempt < MAX_CHECKOUT_RETRIES - 1) {
          continue;
        }

        throw new CheckoutError(
          "Your cart or product stock changed while checkout was processing. Refresh your cart and try again.",
          409,
        );
      }

      throw error;
    }
  }

  throw new CheckoutError(
    "Unable to process checkout. Please try again.",
    409,
  );
}

/*
 * --------------------------------------------------
 * POST - BUYER CHECKOUT
 * --------------------------------------------------
 */

export async function POST(request: Request) {
  const access = await requireBuyer();

  if (!access.authorized) {
    return access.response;
  }

  /*
   * VALIDATE IDEMPOTENCY KEY
   */

  const idempotencyKey = getIdempotencyKey(request);

  if (!idempotencyKey) {
    return NextResponse.json(
      {
        error:
          "A valid checkout request key is required. Refresh checkout and try again.",
      },
      {
        status: 400,
        headers: noStore,
      },
    );
  }

  /*
   * READ AND VALIDATE REQUEST BODY
   */

  const bodyResult = await readJsonBody(request);

  if (!bodyResult.ok) {
    return NextResponse.json(
      {
        error:
          bodyResult.reason === "TOO_LARGE"
            ? "Checkout request is too large."
            : "Invalid JSON request.",
      },
      {
        status:
          bodyResult.reason === "TOO_LARGE"
            ? 413
            : 400,
        headers: noStore,
      },
    );
  }

  if (!isRecord(bodyResult.value)) {
    return NextResponse.json(
      {
        error: "Checkout details are required.",
      },
      {
        status: 400,
        headers: noStore,
      },
    );
  }

  /*
   * VALIDATE DELIVERY INFORMATION
   */

  const deliveryResult = validateDeliveryDetails(
    bodyResult.value,
  );

  if (!deliveryResult.valid) {
    return NextResponse.json(
      {
        error: deliveryResult.error,
      },
      {
        status: 400,
        headers: noStore,
      },
    );
  }

  try {
    /*
     * PLACE ORDER
     *
     * Stock reservation, order creation, seller order
     * creation and cart clearing happen in one transaction.
     */

    const result = await createCheckout(
      access.user.id,
      deliveryResult.value,
      idempotencyKey,
    );

    /*
     * --------------------------------------------------
     * NOTIFICATIONS
     * --------------------------------------------------
     *
     * Only send notifications when a new order was
     * created. Replaying an existing checkout must not
     * send another set of order notifications.
     * --------------------------------------------------
     */

    if (result.created) {
      const notificationJobs = [
        /*
         * Notify the buyer.
         */

        createNotification({
          userId: access.user.id,

          type: NotificationType.ORDER_PLACED,

          title: "Your order has been placed",

          message:
            `Your order (${result.order.orderCode}) has been placed successfully. You can track its progress from your orders.`,

          priority: NotificationPriority.HIGH,

          dedupeKey:
            `buyer-order-placed:${result.order.id}`,

          data: {
            orderId: result.order.id,
            orderCode: result.order.orderCode,
            href: `/orders/${result.order.id}`,
          } as Prisma.InputJsonValue,
        }),

        /*
         * Notify every seller receiving an order.
         */

        ...result.sellerOrders.map((sellerOrder) =>
          createNotification({
            userId: sellerOrder.sellerId,

            type: NotificationType.ORDER_PLACED,

            title: "New product order",

            message:
              `You have received a new order (${sellerOrder.sellerOrderCode}).`,

            priority: NotificationPriority.HIGH,

            dedupeKey:
              `order-placed:${sellerOrder.id}`,

            data: {
              orderId: result.order.id,
              orderCode: result.order.orderCode,
              sellerOrderId: sellerOrder.id,
              sellerOrderCode: sellerOrder.sellerOrderCode,
              href: "/seller/orders",
            } as Prisma.InputJsonValue,
          }),
        ),
      ];

      const notificationResults = await Promise.allSettled(
        notificationJobs,
      );

      for (const notificationResult of notificationResults) {
        if (notificationResult.status === "rejected") {
          console.error(
            "CHECKOUT_NOTIFICATION_ERROR:",
            notificationResult.reason,
          );
        }
      }
    }

    /*
     * CHECKOUT SUCCESS
     *
     * New checkout: 201
     * Existing checkout replay: 200
     *
     * The response continues to include the order and
     * sellerOrders fields expected by the checkout page.
     */

    return NextResponse.json(
      {
        message: result.created
          ? "Your order has been placed successfully."
          : "Your previously placed order has been retrieved.",

        order: result.order,
        sellerOrders: result.sellerOrders,

        idempotentReplay: !result.created,
      },
      {
        status: result.created ? 201 : 200,
        headers: noStore,
      },
    );
  } catch (error) {
    if (error instanceof CheckoutError) {
      return NextResponse.json(
        {
          error: error.message,
        },
        {
          status: error.status,
          headers: noStore,
        },
      );
    }

    console.error(
      "Checkout creation error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "We could not place your order. Your cart has been kept; please try again.",
      },
      {
        status: 500,
        headers: noStore,
      },
    );
  }
}
