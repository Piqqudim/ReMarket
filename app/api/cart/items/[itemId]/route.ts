import { NextResponse } from "next/server";

import { requireBuyer } from "@/lib/buyer-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_QUANTITY_PER_PRODUCT = 50;
const MAX_ITEM_ID_LENGTH = 100;
const MAX_ORDER_TOTAL = 2_147_483_647;
const MAX_TRANSACTION_ATTEMPTS = 3;

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

type RouteContext = {
  params: Promise<{
    itemId: string;
  }>;
};

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

function isSerializationConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}

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

  throw new Error("Unable to complete cart operation.");
}

/**
 * PATCH /api/cart/items/[itemId]
 *
 * Updates the quantity of an item belonging
 * to the currently authenticated buyer.
 */
export async function PATCH(
  request: Request,
  context: RouteContext,
) {
  const access = await requireBuyer();

  if (!access.authorized) {
    return access.response;
  }

  const { itemId } = await context.params;

  if (
    typeof itemId !== "string" ||
    !itemId.trim() ||
    itemId.trim().length > MAX_ITEM_ID_LENGTH
  ) {
    return NextResponse.json(
      { error: "Invalid cart item ID." },
      {
        status: 400,
        headers: noStore,
      },
    );
  }

  const validatedItemId = itemId.trim();

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request." },
      {
        status: 400,
        headers: noStore,
      },
    );
  }

  if (
    !isRecord(body) ||
    typeof body.quantity !== "number" ||
    !Number.isSafeInteger(body.quantity) ||
    body.quantity < 1 ||
    body.quantity > MAX_QUANTITY_PER_PRODUCT
  ) {
    return NextResponse.json(
      {
        error: `Quantity must be a whole number between 1 and ${MAX_QUANTITY_PER_PRODUCT}.`,
      },
      {
        status: 400,
        headers: noStore,
      },
    );
  }

  const quantity = body.quantity;

  try {
    const updatedItem = await withSerializableRetry(() =>
      prisma.$transaction(
        async (tx) => {
          // 1. Find the cart item and confirm ownership.
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
                  priceMin: true,
                  priceMax: true,
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

          const product = item.product;

          // 2. Confirm that the product is still available.
          const isAvailable =
            product.status === "ACTIVE" &&
            product.deletedAt === null &&
            product.availability === "AVAILABLE" &&
            product.business.status === "ACTIVE" &&
            product.business.deletedAt === null;

          if (!isAvailable) {
            throw new CartRouteError(
              "This product is no longer available.",
              409,
            );
          }

          // 3. Confirm that the product still has a fixed price.
          const hasFixedPrice =
            product.price !== null &&
            Number.isSafeInteger(product.price) &&
            product.price > 0 &&
            product.priceMin === null &&
            product.priceMax === null;

          if (!hasFixedPrice || product.price === null) {
            throw new CartRouteError(
              "This product no longer has a confirmed fixed price.",
              409,
            );
          }

          // 4. Validate the inventory value.
          // null means inventory tracking is disabled.
          // Zero means the product is out of stock.
          if (
            product.stockQuantity !== null &&
            (
              !Number.isSafeInteger(product.stockQuantity) ||
              product.stockQuantity < 0
            )
          ) {
            throw new CartRouteError(
              "The inventory information for this product is invalid.",
              409,
            );
          }

          // 5. Check the requested quantity against available stock.
          if (
            product.stockQuantity !== null &&
            quantity > product.stockQuantity
          ) {
            throw new CartRouteError(
              "The requested quantity is higher than the available stock.",
              409,
            );
          }

          // 6. Validate the product line total.
          const lineTotal = product.price * quantity;

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

          // 7. Update only the authenticated buyer's cart item.
          const updated = await tx.cartItem.updateMany({
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

          // 8. Return the updated item.
          const result = await tx.cartItem.findFirst({
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

    return NextResponse.json(
      {
        success: true,
        message: "Cart quantity updated successfully.",
        item: updatedItem,
      },
      {
        status: 200,
        headers: noStore,
      },
    );
  } catch (error) {
    if (error instanceof CartRouteError) {
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

    console.error("Update cart item error:", error);

    return NextResponse.json(
      {
        error: "Unable to update this cart item.",
      },
      {
        status: 500,
        headers: noStore,
      },
    );
  }
}

/**
 * DELETE /api/cart/items/[itemId]
 *
 * Removes an item only from the authenticated
 * buyer's own cart.
 */
export async function DELETE(
  _request: Request,
  context: RouteContext,
) {
  const access = await requireBuyer();

  if (!access.authorized) {
    return access.response;
  }

  const { itemId } = await context.params;

  if (
    typeof itemId !== "string" ||
    !itemId.trim() ||
    itemId.trim().length > MAX_ITEM_ID_LENGTH
  ) {
    return NextResponse.json(
      { error: "Invalid cart item ID." },
      {
        status: 400,
        headers: noStore,
      },
    );
  }

  const validatedItemId = itemId.trim();

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

    if (deleted.count === 0) {
      return NextResponse.json(
        {
          error: "Cart item not found.",
        },
        {
          status: 404,
          headers: noStore,
        },
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: "Product removed from your cart.",
      },
      {
        status: 200,
        headers: noStore,
      },
    );
  } catch (error) {
    console.error("Delete cart item error:", error);

    return NextResponse.json(
      {
        error: "Unable to remove this cart item.",
      },
      {
        status: 500,
        headers: noStore,
      },
    );
  }
}