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

/* =========================================================
   GET CART
========================================================= */

/**
 * GET /api/cart
 *
 * Retrieves the authenticated buyer's cart.
 *
 * Pricing:
 * - price is the actual selling price.
 * - originalPrice is only for discount display.
 * - priceMin and priceMax are not used.
 *
 * Inventory:
 * - null stockQuantity means inventory tracking is disabled.
 * - zero means out of stock.
 * - a positive number represents tracked stock.
 *
 * Important:
 * This endpoint reports cart availability.
 * The checkout endpoint must independently validate
 * prices, inventory and seller status before creating orders.
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
                originalPrice: true,

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

                  orderBy: [
                    { sortOrder: "asc" },
                    { createdAt: "asc" },
                  ],
                },
              },
            },
          },
        },
      },
    });

    /* =====================================================
       NORMALIZE CART ITEMS
    ===================================================== */

    const items = (cart?.items ?? []).map((item) => {
      const product = item.product;

      const business = product?.business ?? null;

      /* QUANTITY */

      const validQuantity =
        Number.isSafeInteger(item.quantity) &&
        item.quantity >= 1 &&
        item.quantity <= MAX_QUANTITY_PER_PRODUCT;

      /* PRODUCT AND SELLER AVAILABILITY */

      const isAvailable =
        product !== null &&
        product.status === "ACTIVE" &&
        product.deletedAt === null &&
        product.availability === "AVAILABLE" &&
        business !== null &&
        business.status === "ACTIVE" &&
        business.deletedAt === null;

      /* FIXED SELLING PRICE */

      const hasFixedPrice =
        product !== null &&
        product.price !== null &&
        Number.isSafeInteger(product.price) &&
        product.price > 0 &&
        product.price <= MAX_ORDER_TOTAL;

      /*
       * originalPrice is optional.
       * It is used only when it is a valid higher price.
       * It is never used for checkout calculations.
       */

      const validOriginalPrice =
        product !== null &&
        hasFixedPrice &&
        product.originalPrice !== null &&
        Number.isSafeInteger(product.originalPrice) &&
        product.originalPrice > (product.price ?? 0) &&
        product.originalPrice <= MAX_ORDER_TOTAL
          ? product.originalPrice
          : null;

      /* INVENTORY VALIDATION */

      const hasValidStock =
        product !== null &&
        (
          product.stockQuantity === null ||
          (
            Number.isSafeInteger(product.stockQuantity) &&
            product.stockQuantity >= 0
          )
        );

      /*
       * null stockQuantity means inventory tracking
       * is disabled, not that the product is out of stock.
       */

      const hasEnoughStock =
        product !== null &&
        validQuantity &&
        hasValidStock &&
        (
          product.stockQuantity === null ||
          (
            product.stockQuantity !== null &&
            product.stockQuantity >= item.quantity
          )
        );

      /* LINE TOTAL */

      let lineTotal: number | null = null;

      if (
        validQuantity &&
        hasFixedPrice &&
        product !== null &&
        product.price !== null
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

      /* PURCHASABILITY */

      const purchasable =
        validQuantity &&
        isAvailable &&
        hasFixedPrice &&
        hasValidStock &&
        hasEnoughStock &&
        lineTotal !== null;

      /* UNAVAILABLE REASON */

      let unavailableReason: string | null = null;

      if (!validQuantity) {
        unavailableReason =
          `You can purchase up to ${MAX_QUANTITY_PER_PRODUCT} units of one product.`;
      } else if (!product || !isAvailable) {
        unavailableReason =
          "This product or its business is no longer available.";
      } else if (!hasFixedPrice) {
        unavailableReason =
          "This product does not have a confirmed fixed selling price.";
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

      /* NORMALIZED PRODUCT */

      return {
        ...item,

        product: product
          ? {
              ...product,

              originalPrice: validOriginalPrice,

              hasDiscount:
                validOriginalPrice !== null,

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

    /* =====================================================
       CART SUBTOTAL

       CRITICAL FIX:
       Only purchasable products contribute to the
       payable subtotal.

       Unavailable products can still have a displayed
       lineTotal, but they must not increase the subtotal.
    ===================================================== */

    const subtotal = items.reduce(
      (total, item) => {
        if (
          !item.purchasable ||
          item.lineTotal === null
        ) {
          return total;
        }

        return total + item.lineTotal;
      },
      0,
    );

    if (
      !Number.isSafeInteger(subtotal) ||
      subtotal < 0 ||
      subtotal > MAX_ORDER_TOTAL
    ) {
      return NextResponse.json(
        {
          error:
            "Your cart total exceeds the maximum allowed order value.",
        },
        {
          status: 409,
          headers: noStore,
        },
      );
    }

    /* =====================================================
       ITEM COUNT

       This represents the total quantity in the cart,
       including unavailable items.
    ===================================================== */

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
          error:
            "Your cart contains an invalid quantity total.",
        },
        {
          status: 409,
          headers: noStore,
        },
      );
    }

    /* =====================================================
       CART SUMMARY
    ===================================================== */

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

/* =========================================================
   CLEAR CART
========================================================= */

/**
 * DELETE /api/cart
 *
 * Removes all items from the authenticated buyer's cart.
 *
 * This does not:
 * - Delete the cart itself.
 * - Delete products.
 * - Modify product inventory.
 * - Modify seller orders.
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