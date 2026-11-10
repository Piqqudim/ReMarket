import { NextResponse } from "next/server";

import { requireBuyer } from "@/lib/buyer-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

/* =========================================================
   CONSTANTS
========================================================= */

const MAX_QUANTITY_PER_PRODUCT = 50;
const MAX_ITEM_ID_LENGTH = 100;
const MAX_ORDER_TOTAL = 2_147_483_647;
const MAX_TRANSACTION_ATTEMPTS = 3;

const noStore = {
  "Cache-Control":
    "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

/* =========================================================
   TYPES
========================================================= */

type RouteContext = {
  params: Promise<{
    itemId: string;
  }>;
};

/* =========================================================
   HELPERS
========================================================= */

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

class CartRouteError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);

    this.name = "CartRouteError";
    this.status = status;
  }
}

/**
 * Prisma P2034:
 * Transaction write conflict or deadlock.
 */
function isSerializationConflict(
  error: unknown,
): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}

/**
 * Retry transactions when Prisma reports a
 * serialization conflict.
 *
 * The transaction is retried up to three times.
 */
async function withSerializableRetry<T>(
  operation: () => Promise<T>,
): Promise<T> {
  for (
    let attempt = 0;
    attempt < MAX_TRANSACTION_ATTEMPTS;
    attempt++
  ) {
    try {
      return await operation();
    } catch (error) {
      if (
        !isSerializationConflict(error) ||
        attempt === MAX_TRANSACTION_ATTEMPTS - 1
      ) {
        throw error;
      }
    }
  }

  throw new Error(
    "Unable to complete cart operation.",
  );
}

/**
 * Standard JSON response for cart errors.
 */
function cartErrorResponse(
  message: string,
  status: number,
) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status,
      headers: noStore,
    },
  );
}

/**
 * Validates a cart item ID from the route.
 */
function validateItemId(
  itemId: unknown,
): string | null {
  if (
    typeof itemId !== "string" ||
    !itemId.trim() ||
    itemId.trim().length > MAX_ITEM_ID_LENGTH
  ) {
    return null;
  }

  return itemId.trim();
}

/* =========================================================
   PATCH /api/cart/items/[itemId]

   Updates the quantity of one product in the
   authenticated buyer's cart.

   Validation:
   - Buyer authentication.
   - Cart ownership.
   - Product status.
   - Seller/business status.
   - Product availability.
   - Fixed selling price.
   - Stock quantity.
   - Maximum quantity.
   - Maximum line total.

   Pricing:
   - price is the current selling price.
   - originalPrice is display-only.
   - Legacy priceMin and priceMax are not used.

   Inventory:
   - null stockQuantity means inventory tracking
     is disabled.
   - zero means out of stock.
   - positive values represent available stock.

   Important:
   This endpoint updates cart quantities.
   It does not reserve inventory.
========================================================= */

export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  /* =====================================================
     AUTHENTICATION
  ===================================================== */

  const access = await requireBuyer();

  if (!access.authorized) {
    return access.response;
  }

  /* =====================================================
     VALIDATE ITEM ID
  ===================================================== */

  const { itemId } = await context.params;

  const validatedItemId =
    validateItemId(itemId);

  if (!validatedItemId) {
    return cartErrorResponse(
      "Invalid cart item ID.",
      400,
    );
  }

  /* =====================================================
     READ REQUEST BODY
  ===================================================== */

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return cartErrorResponse(
      "Invalid JSON request.",
      400,
    );
  }

  /* =====================================================
     VALIDATE QUANTITY
  ===================================================== */

  if (
    !isRecord(body) ||
    typeof body.quantity !== "number" ||
    !Number.isSafeInteger(body.quantity) ||
    body.quantity < 1 ||
    body.quantity > MAX_QUANTITY_PER_PRODUCT
  ) {
    return cartErrorResponse(
      `Quantity must be a whole number between 1 and ${MAX_QUANTITY_PER_PRODUCT}.`,
      400,
    );
  }

  const quantity = body.quantity;

  /* =====================================================
     UPDATE CART ITEM
  ===================================================== */

  try {
    const updatedItem = await withSerializableRetry(
      () =>
        prisma.$transaction(
          async (tx) => {
            /* =========================================
               1. FIND CART ITEM AND VERIFY OWNERSHIP
            ========================================= */

            const item = await tx.cartItem.findFirst({
              where: {
                id: validatedItemId,

                cart: {
                  is: {
                    buyerId: access.user.id,
                  },
                },
              },

              select: {
                id: true,

                product: {
                  select: {
                    id: true,

                    price: true,

                    status: true,
                    deletedAt: true,
                    availability: true,

                    stockQuantity: true,

                    business: {
                      select: {
                        status: true,
                        deletedAt: true,
                      },
                    },
                  },
                },
              },
            });

            if (!item) {
              throw new CartRouteError(
                "Cart item not found.",
                404,
              );
            }

            /* =========================================
               2. VERIFY PRODUCT EXISTS
            ========================================= */

            const product = item.product;

            if (!product) {
              throw new CartRouteError(
                "This product no longer exists.",
                409,
              );
            }

            /* =========================================
               3. VERIFY BUSINESS EXISTS
            ========================================= */

            const business = product.business;

            if (!business) {
              throw new CartRouteError(
                "The seller for this product is unavailable.",
                409,
              );
            }

            /* =========================================
               4. VERIFY PRODUCT AND BUSINESS STATUS
            ========================================= */

            const isAvailable =
              product.status === "ACTIVE" &&
              product.deletedAt === null &&
              product.availability === "AVAILABLE" &&
              business.status === "ACTIVE" &&
              business.deletedAt === null;

            if (!isAvailable) {
              throw new CartRouteError(
                "This product is no longer available.",
                409,
              );
            }

            /* =========================================
               5. VERIFY FIXED SELLING PRICE
            ========================================= */

            const hasFixedPrice =
              product.price !== null &&
              Number.isSafeInteger(product.price) &&
              product.price > 0 &&
              product.price <= MAX_ORDER_TOTAL;

            if (
              !hasFixedPrice ||
              product.price === null
            ) {
              throw new CartRouteError(
                "This product no longer has a confirmed fixed selling price.",
                409,
              );
            }

            /*
             * The current selling price is used.
             *
             * originalPrice is not consulted here.
             * Legacy priceMin and priceMax are not used.
             */

            /* =========================================
               6. VERIFY INVENTORY INFORMATION
            ========================================= */

            /*
             * null means inventory tracking is disabled.
             * Zero means out of stock.
             */

            if (
              product.stockQuantity !== null &&
              (
                !Number.isSafeInteger(
                  product.stockQuantity,
                ) ||
                product.stockQuantity < 0
              )
            ) {
              throw new CartRouteError(
                "The inventory information for this product is invalid.",
                409,
              );
            }

            /* =========================================
               7. CHECK REQUESTED QUANTITY AGAINST STOCK
            ========================================= */

            if (
              product.stockQuantity !== null &&
              quantity > product.stockQuantity
            ) {
              throw new CartRouteError(
                "The requested quantity is higher than the available stock.",
                409,
              );
            }

            /* =========================================
               8. VALIDATE LINE TOTAL
            ========================================= */

            const lineTotal =
              product.price * quantity;

            if (
              !Number.isSafeInteger(lineTotal) ||
              lineTotal <= 0 ||
              lineTotal > MAX_ORDER_TOTAL
            ) {
              throw new CartRouteError(
                "The requested quantity exceeds the maximum allowed order value.",
                409,
              );
            }

            /* =========================================
               9. UPDATE ONLY THE BUYER'S CART ITEM
            ========================================= */

            const updated =
              await tx.cartItem.updateMany({
                where: {
                  id: validatedItemId,

                  cart: {
                    is: {
                      buyerId: access.user.id,
                    },
                  },
                },

                data: {
                  quantity,
                },
              });

            if (updated.count !== 1) {
              throw new CartRouteError(
                "Cart item not found.",
                404,
              );
            }

            /* =========================================
               10. RETRIEVE UPDATED CART ITEM
            ========================================= */

            const result =
              await tx.cartItem.findFirst({
                where: {
                  id: validatedItemId,

                  cart: {
                    is: {
                      buyerId: access.user.id,
                    },
                  },
                },

                select: {
                  id: true,
                  productId: true,
                  quantity: true,
                  updatedAt: true,
                },
              });

            if (!result) {
              throw new CartRouteError(
                "Cart item could not be retrieved after updating.",
                404,
              );
            }

            return result;
          },

          {
            isolationLevel: "Serializable",
          },
        ),
    );

    /* ===================================================
       SUCCESS RESPONSE
    =================================================== */

    return NextResponse.json(
      {
        success: true,

        message:
          "Cart quantity updated successfully.",

        item: updatedItem,
      },
      {
        status: 200,
        headers: noStore,
      },
    );

  } catch (error) {
    /* ===================================================
       APPLICATION ERRORS
    =================================================== */

    if (error instanceof CartRouteError) {
      return cartErrorResponse(
        error.message,
        error.status,
      );
    }

    /* ===================================================
       SERIALIZATION CONFLICT
    =================================================== */

    if (isSerializationConflict(error)) {
      return cartErrorResponse(
        "Your cart or product inventory changed while updating. Please refresh your cart and try again.",
        409,
      );
    }

    /* ===================================================
       UNEXPECTED ERRORS
    =================================================== */

    console.error(
      "Update cart item error:",
      error,
    );

    return cartErrorResponse(
      "Unable to update this cart item.",
      500,
    );
  }
}

/* =========================================================
   DELETE /api/cart/items/[itemId]

   Removes one product from the authenticated
   buyer's cart.

   This does not:
   - Delete the actual product.
   - Change product inventory.
   - Delete seller information.
   - Modify existing orders.
========================================================= */

export async function DELETE(
  _request: Request,
  context: RouteContext,
) {
  /* =====================================================
     AUTHENTICATION
  ===================================================== */

  const access = await requireBuyer();

  if (!access.authorized) {
    return access.response;
  }

  /* =====================================================
     VALIDATE ITEM ID
  ===================================================== */

  const { itemId } = await context.params;

  const validatedItemId =
    validateItemId(itemId);

  if (!validatedItemId) {
    return cartErrorResponse(
      "Invalid cart item ID.",
      400,
    );
  }

  /* =====================================================
     DELETE CART ITEM
  ===================================================== */

  try {
    const deleted = await prisma.cartItem.deleteMany({
      where: {
        id: validatedItemId,

        cart: {
          is: {
            buyerId: access.user.id,
          },
        },
      },
    });

    /* ===================================================
       ITEM NOT FOUND
    =================================================== */

    if (deleted.count === 0) {
      return cartErrorResponse(
        "Cart item not found.",
        404,
      );
    }

    /* ===================================================
       SUCCESS RESPONSE
    =================================================== */

    return NextResponse.json(
      {
        success: true,

        message:
          "Product removed from your cart.",

        deletedCount: deleted.count,
      },
      {
        status: 200,
        headers: noStore,
      },
    );

  } catch (error) {
    console.error(
      "Delete cart item error:",
      error,
    );

    return cartErrorResponse(
      "Unable to remove this cart item.",
      500,
    );
  }
}