import { NextResponse } from "next/server";

import { requireBuyer } from "@/lib/buyer-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_QUANTITY_PER_PRODUCT = 50;
const MAX_PRODUCT_ID_LENGTH = 100;
const MAX_ORDER_TOTAL = 2_147_483_647;
const MAX_TRANSACTION_ATTEMPTS = 3;

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
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

function validateProductId(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= MAX_PRODUCT_ID_LENGTH
  );
}

class CartConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CartConflictError";
  }
}

function getPrismaErrorCode(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return null;
}

function isRetryableTransactionError(error: unknown): boolean {
  const code = getPrismaErrorCode(error);

  return code === "P2034" || code === "P2002";
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
        !isRetryableTransactionError(error) ||
        attempt === MAX_TRANSACTION_ATTEMPTS - 1
      ) {
        throw error;
      }
    }
  }

  throw new Error("Unable to complete cart operation.");
}

/**
 * POST /api/cart/item
 *
 * Adds a product to the authenticated buyer's cart.
 * If the product already exists, its quantity increases.
 */
export async function POST(request: Request) {
  const access = await requireBuyer();

  if (!access.authorized) {
    return access.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid JSON request.",
      },
      {
        status: 400,
        headers: noStore,
      },
    );
  }

  if (!isRecord(body)) {
    return NextResponse.json(
      {
        error: "Invalid cart item details.",
      },
      {
        status: 400,
        headers: noStore,
      },
    );
  }

  if (!validateProductId(body.productId)) {
    return NextResponse.json(
      {
        error: "A valid product ID is required.",
      },
      {
        status: 400,
        headers: noStore,
      },
    );
  }

  const productId = body.productId.trim();

  const quantity =
    body.quantity === undefined ? 1 : body.quantity;

  if (
    typeof quantity !== "number" ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_QUANTITY_PER_PRODUCT
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

  try {
    const result = await withSerializableRetry(() =>
      prisma.$transaction(
        async (tx) => {
          // 1. Find a product that is active and available.
          const product = await tx.product.findFirst({
            where: {
              id: productId,
              status: "ACTIVE",
              deletedAt: null,
              availability: "AVAILABLE",

              business: {
                is: {
                  status: "ACTIVE",
                  deletedAt: null,
                },
              },
            },
            select: {
              id: true,
              price: true,
              priceMin: true,
              priceMax: true,
              stockQuantity: true,
            },
          });

          if (!product) {
            throw new CartConflictError(
              "This product is not currently available.",
            );
          }

          // 2. Only confirmed fixed-price products can be added.
          if (
            product.price === null ||
            !Number.isSafeInteger(product.price) ||
            product.price <= 0 ||
            product.priceMin !== null ||
            product.priceMax !== null
          ) {
            throw new CartConflictError(
              "Only products with a confirmed fixed price can be added to the cart.",
            );
          }

          // null means inventory tracking is disabled.
          // Zero means the product is out of stock.
          if (
            product.stockQuantity !== null &&
            (
              !Number.isSafeInteger(product.stockQuantity) ||
              product.stockQuantity < 0
            )
          ) {
            throw new CartConflictError(
              "The inventory information for this product is invalid.",
            );
          }

          // 3. Find or create the buyer's cart.
          const cart = await tx.cart.upsert({
            where: {
              buyerId: access.user.id,
            },
            create: {
              buyerId: access.user.id,
            },
            update: {},
            select: {
              id: true,
            },
          });

          // 4. Check whether the product already exists in the cart.
          const existing = await tx.cartItem.findUnique({
            where: {
              cartId_productId: {
                cartId: cart.id,
                productId: product.id,
              },
            },
            select: {
              id: true,
              quantity: true,
            },
          });

          if (
            existing &&
            (
              !Number.isSafeInteger(existing.quantity) ||
              existing.quantity < 1
            )
          ) {
            throw new CartConflictError(
              "The existing cart quantity is invalid. Please remove this item and add it again.",
            );
          }

          // 5. Increase the existing quantity or use the new quantity.
          const nextQuantity =
            (existing?.quantity ?? 0) + quantity;

          if (nextQuantity > MAX_QUANTITY_PER_PRODUCT) {
            throw new CartConflictError(
              `You can add up to ${MAX_QUANTITY_PER_PRODUCT} units of one product.`,
            );
          }

          // 6. Check available inventory when tracking is enabled.
          if (
            product.stockQuantity !== null &&
            nextQuantity > product.stockQuantity
          ) {
            throw new CartConflictError(
              "The requested quantity is higher than the available stock.",
            );
          }

          // 7. Validate the product line total.
          const lineTotal = product.price * nextQuantity;

          if (
            !Number.isSafeInteger(lineTotal) ||
            lineTotal <= 0 ||
            lineTotal > MAX_ORDER_TOTAL
          ) {
            throw new CartConflictError(
              "The requested quantity exceeds the maximum allowed order value.",
            );
          }

          // 8. Create the cart item or update its quantity.
          const item = await tx.cartItem.upsert({
            where: {
              cartId_productId: {
                cartId: cart.id,
                productId: product.id,
              },
            },
            create: {
              cartId: cart.id,
              productId: product.id,
              quantity,
            },
            update: {
              quantity: nextQuantity,
            },
            select: {
              id: true,
              productId: true,
              quantity: true,
              updatedAt: true,
            },
          });

          return item;
        },
        {
          isolationLevel: "Serializable",
        },
      ),
    );

    return NextResponse.json(
      {
        success: true,
        message: "Product added to your cart.",
        item: result,
      },
      {
        status: 200,
        headers: noStore,
      },
    );
  } catch (error) {
    if (error instanceof CartConflictError) {
      return NextResponse.json(
        {
          error: error.message,
        },
        {
          status: 409,
          headers: noStore,
        },
      );
    }

    console.error("Add cart item error:", error);

    return NextResponse.json(
      {
        error: "Unable to add this product to your cart.",
      },
      {
        status: 500,
        headers: noStore,
      },
    );
  }
}

/**
 * DELETE /api/cart/item
 *
 * Removes a product from the authenticated buyer's cart.
 * Requires productId in the JSON request body.
 */
export async function DELETE(request: Request) {
  const access = await requireBuyer();

  if (!access.authorized) {
    return access.response;
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "Invalid JSON request.",
      },
      {
        status: 400,
        headers: noStore,
      },
    );
  }

  if (
    !isRecord(body) ||
    !validateProductId(body.productId)
  ) {
    return NextResponse.json(
      {
        error: "A valid product ID is required.",
      },
      {
        status: 400,
        headers: noStore,
      },
    );
  }

  const productId = body.productId.trim();

  try {
    // Delete only this product from the authenticated buyer's cart.
    const result = await prisma.cartItem.deleteMany({
      where: {
        productId,
        cart: {
          is: {
            buyerId: access.user.id,
          },
        },
      },
    });

    if (result.count === 0) {
      return NextResponse.json(
        {
          error: "This product was not found in your cart.",
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
    console.error("Remove cart item error:", error);

    return NextResponse.json(
      {
        error: "Unable to remove this product from your cart.",
      },
      {
        status: 500,
        headers: noStore,
      },
    );
  }
}