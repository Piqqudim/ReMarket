import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { requireBuyer } from "@/lib/buyer-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const MAX_BODY_BYTES = 16 * 1024;
const MAX_ORDER_TOTAL = 2_147_483_647;

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

class SelectQuoteError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "SelectQuoteError";
    this.status = status;
  }
}

type Selection = { businessId: string; courierId: string; serviceCode: string };
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

async function readBody(request: Request): Promise<unknown> {
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) throw new SelectQuoteError("The request is too large.", 413);
  try { return JSON.parse(raw) as unknown; } catch { throw new SelectQuoteError("Invalid JSON request."); }
}

function parseAvailableRates(value: Prisma.JsonValue): NormalizedRate[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const courierId = typeof entry.courierId === "string" ? entry.courierId : "";
    const serviceCode = typeof entry.serviceCode === "string" ? entry.serviceCode : "";
    const amount = typeof entry.amount === "number" ? entry.amount : NaN;
    if (!courierId || !serviceCode || !Number.isSafeInteger(amount) || amount < 0) return [];
    return [{
      courierId,
      courierName: typeof entry.courierName === "string" ? entry.courierName : "Delivery partner",
      serviceCode,
      serviceType: typeof entry.serviceType === "string" ? entry.serviceType : null,
      amount,
      currency: typeof entry.currency === "string" ? entry.currency : "NGN",
      eta: typeof entry.eta === "string" ? entry.eta : null,
      pickupEta: typeof entry.pickupEta === "string" ? entry.pickupEta : null,
    }];
  });
}

export async function POST(request: Request) {
  const access = await requireBuyer();
  if (!access.authorized) return access.response;

  try {
    const body = await readBody(request);
    if (!isRecord(body)) throw new SelectQuoteError("Select a delivery quote first.");
    const quoteId = typeof body.quoteId === "string" ? body.quoteId.trim() : "";
    if (!quoteId || quoteId.length > 100) throw new SelectQuoteError("A valid delivery quote is required.");
    if (!Array.isArray(body.selections) || body.selections.length < 1 || body.selections.length > 50) {
      throw new SelectQuoteError("Select a delivery service for every seller package.");
    }

    const selections: Selection[] = body.selections.map((raw: unknown) => {
      if (!isRecord(raw)) throw new SelectQuoteError("One of the delivery selections is invalid.");
      const businessId = typeof raw.businessId === "string" ? raw.businessId.trim() : "";
      const courierId = typeof raw.courierId === "string" ? raw.courierId.trim() : String(raw.courierId ?? "").trim();
      const serviceCode = typeof raw.serviceCode === "string" ? raw.serviceCode.trim() : "";
      if (!businessId || !courierId || !serviceCode) throw new SelectQuoteError("One of the courier selections is incomplete.");
      return { businessId, courierId, serviceCode };
    });

    if (new Set(selections.map((selection) => selection.businessId)).size !== selections.length) {
      throw new SelectQuoteError("Duplicate seller delivery selections were submitted.");
    }

    const selectedQuote = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const quote = await tx.deliveryQuote.findFirst({
        where: {
          id: quoteId,
          buyerId: access.user.id,
          status: { in: ["OPEN", "SELECTED"] },
          expiresAt: { gt: now },
        },
        include: {
          packages: { include: { business: { select: { name: true, status: true, deletedAt: true, shipbubblePickupAddressCode: true } } } },
        },
      });
      if (!quote) throw new SelectQuoteError("This delivery quote has expired. Request delivery rates again.", 409);
      if (quote.packages.length !== selections.length) {
        throw new SelectQuoteError("Select exactly one delivery service for every seller package.");
      }

      let deliveryFee = 0;
      const selectedPackages: Array<{
        id: string;
        businessId: string;
        businessName: string;
        items: [];
        rates: NormalizedRate[];
        selectedCourierId: string;
        selectedServiceCode: string;
        selectedDeliveryFee: number;
        selectedCourierName: string;
        selectedDeliveryEta: string | null;
      }> = [];

      for (const pack of quote.packages) {
        const selection = selections.find((item) => item.businessId === pack.businessId);
        if (!selection) throw new SelectQuoteError("A seller package has no selected delivery service.");
        if (
          pack.expiresAt <= now ||
          pack.business.status !== "ACTIVE" ||
          pack.business.deletedAt !== null ||
          pack.business.shipbubblePickupAddressCode !== pack.senderAddressCode
        ) {
          throw new SelectQuoteError("A seller's delivery quote or pickup address has changed. Request fresh rates.", 409);
        }

        const rates = parseAvailableRates(pack.availableRates);
        const rate = rates.find((candidate) => candidate.courierId === selection.courierId && candidate.serviceCode === selection.serviceCode);
        if (!rate || rate.currency.toUpperCase() !== "NGN") {
          throw new SelectQuoteError("One of the selected courier services is no longer available. Refresh delivery rates.", 409);
        }

        deliveryFee += rate.amount;
        if (!Number.isSafeInteger(deliveryFee) || deliveryFee > MAX_ORDER_TOTAL) {
          throw new SelectQuoteError("The delivery total exceeds the supported amount.", 400);
        }

        await tx.deliveryQuotePackage.update({
          where: { id: pack.id },
          data: {
            selectedCourierId: rate.courierId,
            selectedCourierName: rate.courierName,
            selectedServiceCode: rate.serviceCode,
            selectedDeliveryFee: rate.amount,
            selectedDeliveryEta: rate.eta,
            selectedAt: now,
          },
        });

        selectedPackages.push({
          id: pack.id,
          businessId: pack.businessId,
          businessName: pack.business.name,
          items: [],
          rates,
          selectedCourierId: rate.courierId,
          selectedServiceCode: rate.serviceCode,
          selectedDeliveryFee: rate.amount,
          selectedCourierName: rate.courierName,
          selectedDeliveryEta: rate.eta,
        });
      }

      const totalAmount = quote.itemsSubtotal + deliveryFee;
      if (!Number.isSafeInteger(totalAmount) || totalAmount <= 0 || totalAmount > MAX_ORDER_TOTAL) {
        throw new SelectQuoteError("The checkout total is invalid or too high.", 400);
      }

      const updatedQuote = await tx.deliveryQuote.update({
        where: { id: quote.id },
        data: {
          status: "SELECTED",
          selectedAt: now,
          deliveryFee,
          totalAmount,
        },
        select: { id: true, quoteCode: true, expiresAt: true, itemsSubtotal: true },
      });

      return { ...updatedQuote, packages: selectedPackages };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({
      quote: {
        id: selectedQuote.id,
        quoteCode: selectedQuote.quoteCode,
        expiresAt: selectedQuote.expiresAt,
        itemsSubtotal: selectedQuote.itemsSubtotal,
        deliveryFee: selectedQuote.packages.reduce((sum, pack) => sum + pack.selectedDeliveryFee, 0),
        totalAmount: selectedQuote.itemsSubtotal + selectedQuote.packages.reduce((sum, pack) => sum + pack.selectedDeliveryFee, 0),
        packages: selectedQuote.packages,
      },
    }, { status: 200, headers: noStore });
  } catch (error) {
    if (error instanceof SelectQuoteError) {
      return NextResponse.json({ error: error.message }, { status: error.status, headers: noStore });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Your delivery choices were updated at the same time. Please try again." }, { status: 409, headers: noStore });
    }
    console.error("SHIPBUBBLE_QUOTE_SELECT_ERROR:", error);
    return NextResponse.json({ error: "We could not confirm your delivery choices. Please try again." }, { status: 500, headers: noStore });
  }
}