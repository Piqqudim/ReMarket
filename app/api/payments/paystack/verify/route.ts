import { NextResponse } from "next/server";

import { requireBuyer } from "@/lib/buyer-auth";
import { confirmPaystackPayment } from "@/lib/paystack-payment-confirmation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

export async function GET(request: Request) {
  const access = await requireBuyer();
  if (!access.authorized) {
    return NextResponse.json(
      { error: "Please sign in to verify your payment." },
      { status: 401, headers: noStore },
    );
  }

  const url = new URL(request.url);
  const reference = (url.searchParams.get("reference") ?? "").trim();
  if (!reference || reference.length > 120) {
    return NextResponse.json(
      { error: "A valid Paystack reference is required." },
      { status: 400, headers: noStore },
    );
  }

  try {
    const payment = await prisma.payment.findUnique({
      where: { providerReference: reference },
      select: {
        id: true,
        provider: true,
        status: true,
        order: { select: { id: true, buyerId: true } },
      },
    });

    if (!payment || payment.provider !== "PAYSTACK") {
      return NextResponse.json(
        { error: "We could not find this payment." },
        { status: 404, headers: noStore },
      );
    }

    if (payment.order.buyerId !== access.user.id) {
      return NextResponse.json(
        { error: "You are not allowed to verify this payment." },
        { status: 403, headers: noStore },
      );
    }

    const result = await confirmPaystackPayment(reference);
    return NextResponse.json(
      {
        success: result.paymentStatus === "SUCCESS" && !result.requiresManualReview,
        paymentStatus: result.paymentStatus,
        orderStatus: result.orderStatus,
        order: {
          id: result.orderId,
          orderCode: result.orderCode,
        },
        payment: {
          reference: result.paymentReference,
          status: result.paymentStatus,
          paidAt: result.paidAt,
        },
        requiresManualReview: result.requiresManualReview,
        message: result.message,
      },
      { status: 200, headers: noStore },
    );
  } catch (error) {
    console.error("PAYSTACK_CALLBACK_VERIFICATION_ERROR:", error);
    const message = error instanceof Error
      ? error.message
      : "Unable to verify this payment right now.";
    const status = typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
      ? error.status
      : 502;
    return NextResponse.json(
      { error: message },
      { status, headers: noStore },
    );
  }
}