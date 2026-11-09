import { NextResponse } from "next/server";

import { requireBuyer } from "@/lib/buyer-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_QUANTITY_PER_PRODUCT = 50;
const MAX_ORDER_TOTAL = 2_147_483_647;

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

/**
 * GET /api/cart
 *
 * Retrieves the authenticated buyer's cart.
 * Checks product availability, pricing and inventory.
 */
export async function GET() {
  const access = await requireBuyer();

  if (!access.authorized) {
    return access.response;
  }

  try {
    const cart = await prisma.cart.findUnique({
      where: {
        buyerId: access.user.id,
      },
      include: {
        items: {
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
                imageUrl: true,

                business: {
                  select: {
                    id: true,
                    name: true,
                    status: true,
                    deletedAt: true,
                  },
                },

                images: {
                  take: 1,
                },
              },
            },
          },
        },
      },
    });

    const items = (cart?.items ?? []).map((item) => {
      const product = item.product;

      const validQuantity =
        Number.isSafeInteger(item.quantity) &&
        item.quantity >= 1 &&
        item.quantity <= MAX_QUANTITY_PER_PRODUCT;

      const isAvailable =
        product !== null &&
        product.status === "ACTIVE" &&
        product.deletedAt === null &&
        product.availability === "AVAILABLE" &&
        product.business.status === "ACTIVE" &&
        product.business.deletedAt === null;

      const hasFixedPrice =
        product !== null &&
        product.price !== null &&
        Number.isSafeInteger(product.price) &&
        product.price > 0 &&
        product.priceMin === null &&
        product.priceMax === null;

      // null means inventory tracking is disabled.
      // Zero means out of stock.
      const hasValidStock =
        product !== null &&
        (
          product.stockQuantity === null ||
          (
            Number.isSafeInteger(product.stockQuantity) &&
            product.stockQuantity >= 0
          )
        );

      const hasEnoughStock =
        product !== null &&
        (
          product.stockQuantity === null ||
          (
            product.stockQuantity !== null &&
            validQuantity &&
            product.stockQuantity >= item.quantity
          )
        );

      let lineTotal: number | null = null;

      if (
        validQuantity &&
        hasFixedPrice &&
        product?.price !== null &&
        product?.price !== undefined
      ) {
        const calculatedTotal =
          product.price * item.quantity;

        if (
          Number.isSafeInteger(calculatedTotal) &&
          calculatedTotal > 0 &&
          calculatedTotal <= MAX_ORDER_TOTAL
        ) {
          lineTotal = calculatedTotal;
        }
      }

      const purchasable =
        validQuantity &&
        isAvailable &&
        hasFixedPrice &&
        hasValidStock &&
        hasEnoughStock &&
        lineTotal !== null;

      let unavailableReason: string | null = null;

      if (!validQuantity) {
        unavailableReason = "Invalid cart quantity.";
      } else if (!product || !isAvailable) {
        unavailableReason =
          "This product is no longer available.";
      } else if (!hasFixedPrice) {
        unavailableReason =
          "This product does not have a confirmed fixed price.";
      } else if (!hasValidStock) {
        unavailableReason =
          "The inventory information for this product is invalid.";
      } else if (!hasEnoughStock) {
        unavailableReason =
          "The requested quantity is higher than the available stock.";
      } else if (lineTotal === null) {
        unavailableReason =
          "The product total exceeds the maximum allowed order value.";
      }

      return {
        ...item,

        product: product
          ? {
              ...product,
              isAvailable,
              hasFixedPrice,
              hasValidStock,
              hasEnoughStock,
              purchasable,
              unavailableReason,
            }
          : null,

        lineTotal,
        purchasable,
        unavailableReason,
      };
    });

    // Calculate the cart subtotal from valid fixed-price line totals.
    const subtotal = items.reduce(
      (total, item) => total + (item.lineTotal ?? 0),
      0,
    );

    if (
      !Number.isSafeInteger(subtotal) ||
      subtotal < 0 ||
      subtotal > MAX_ORDER_TOTAL
    ) {
      return NextResponse.json(
        {
          error: "Your cart total exceeds the maximum allowed order value.",
        },
        {
          status: 409,
          headers: noStore,
        },
      );
    }

    // Count only valid quantities.
    const itemCount = items.reduce(
      (total, item) => {
        if (
          Number.isSafeInteger(item.quantity) &&
          item.quantity > 0
        ) {
          return total + item.quantity;
        }

        return total;
      },
      0,
    );

    if (!Number.isSafeInteger(itemCount)) {
      return NextResponse.json(
        {
          error: "Your cart contains an invalid quantity total.",
        },
        {
          status: 409,
          headers: noStore,
        },
      );
    }

    const purchasableItems = items.filter(
      (item) => item.purchasable,
    ).length;

    const unavailableItems =
      items.length - purchasableItems;

    return NextResponse.json(
      {
        success: true,

        cart: cart
          ? {
              id: cart.id,
            }
          : null,

        items,
        itemCount,
        subtotal,
        currency: "NGN",

        summary: {
          totalItems: items.length,
          totalQuantity: itemCount,
          purchasableItems,
          unavailableItems,
        },
      },
      {
        status: 200,
        headers: noStore,
      },
    );
  } catch (error) {
    console.error("Get cart error:", error);

    return NextResponse.json(
      {
        error: "Unable to retrieve your cart.",
      },
      {
        status: 500,
        headers: noStore,
      },
    );
  }
}

/**
 * DELETE /api/cart
 *
 * Removes all items from the authenticated buyer's cart.
 * Does not delete the cart itself or modify product inventory.
 */
export async function DELETE() {
  const access = await requireBuyer();

  if (!access.authorized) {
    return access.response;
  }

  try {
    const result = await prisma.cartItem.deleteMany({
      where: {
        cart: {
          is: {
            buyerId: access.user.id,
          },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Your cart has been cleared.",
        deletedCount: result.count,
      },
      {
        status: 200,
        headers: noStore,
      },
    );
  } catch (error) {
    console.error("Clear cart error:", error);

    return NextResponse.json(
      {
        error: "Unable to clear your cart.",
      },
      {
        status: 500,
        headers: noStore,
      },
    );
  }
}