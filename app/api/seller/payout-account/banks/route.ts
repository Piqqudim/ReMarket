import { NextResponse } from "next/server";

import { requireSellerAccount } from "@/lib/seller-auth";
import { listPaystackBanks, PaystackError } from "@/lib/paystack";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };

export async function GET() {
  const auth = await requireSellerAccount();
  if (!auth.authorized) return auth.response;

  try {
    const banks = await listPaystackBanks();
    return NextResponse.json(
      {
        success: true,
        banks: banks.map((bank) => ({
          name: bank.name,
          code: bank.code,
        })),
      },
      { headers: noStore },
    );
  } catch (error) {
    console.error("SELLER_PAYOUT_BANK_LIST_ERROR:", error);
    const status = error instanceof PaystackError ? error.status : 502;
    return NextResponse.json(
      { error: "Unable to load supported Nigerian banks from Paystack." },
      { status, headers: noStore },
    );
  }
}
