"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Wallet,
} from "lucide-react";

type Bank = { name: string; code: string };
type PayoutAccount = {
  id: string;
  bankName: string;
  bankCode: string;
  accountName: string;
  accountNumberLast4: string;
  currency: string;
  verifiedAt: string;
  updatedAt: string;
} | null;
type Settlement = {
  id: string;
  grossSalesAmount: number;
  commissionRateBps: number;
  commissionAmount: number;
  adjustmentAmount: number;
  netPayoutAmount: number;
  currency: string;
  status: string;
  deliveryConfirmedAt: string;
  paidAt: string | null;
  failureReason: string | null;
  sellerOrder: { sellerOrderCode: string };
  payout: null | {
    status: string;
    reference: string;
    providerTransferCode: string | null;
    attemptCount: number;
    failureReason: string | null;
    paidAt: string | null;
    attempts?: Array<{
      attemptNumber: number;
      reference: string;
      status: string;
      failureReason: string | null;
      submittedAt: string | null;
      paidAt: string | null;
      reversedAt?: string | null;
    }>;
  };
};
type Pickup = {
  isConfigured: boolean;
  addressCode: number | null;
  validatedAt: string | null;
  contactName: string | null;
  phone: string | null;
  businessAddress: string | null;
  requiresValidation: boolean;
};

const cardClass = "rounded-2xl border border-[#E8DED3] bg-white p-4 shadow-sm sm:p-5";
const inputClass = "h-11 w-full rounded-xl border border-[#E8DED3] bg-[#FFFDFC] px-3 text-sm text-[#2E241F] outline-none transition placeholder:text-[#A0968E] focus:border-[#FF8A70] focus:ring-2 focus:ring-[#FF5A36]/10 disabled:opacity-60";
const labelClass = "mb-1.5 block text-xs font-semibold text-[#5F554D]";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json().catch(() => null);
  return isRecord(value) ? value : {};
}

function formatCurrency(value: number, currency = "NGN") {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString("en-NG", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function statusClass(value: string) {
  if (value === "PAID" || value === "SUCCESS") return "bg-[#E7F7EF] text-[#287A4B]";
  if (value === "FAILED" || value === "REVERSED") return "bg-[#FCE8E6] text-[#B42318]";
  if (value === "REQUIRES_REVIEW") return "bg-[#FFF0D9] text-[#9F5A18]";
  return "bg-[#EAF1FF] text-[#315DA8]";
}

export default function SellerPayoutSettingsPage() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [payoutAccount, setPayoutAccount] = useState<PayoutAccount>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [pickup, setPickup] = useState<Pickup | null>(null);
  const [transfersEnabled, setTransfersEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [resolvedName, setResolvedName] = useState("");
  const [contactName, setContactName] = useState("");
  const [pickupPhone, setPickupPhone] = useState("");
  const [bankBusy, setBankBusy] = useState(false);
  const [resolveBusy, setResolveBusy] = useState(false);
  const [pickupBusy, setPickupBusy] = useState(false);
  const [pageError, setPageError] = useState("");
  const [bankMessage, setBankMessage] = useState("");
  const [bankError, setBankError] = useState("");
  const [pickupMessage, setPickupMessage] = useState("");
  const [pickupError, setPickupError] = useState("");

  const selectedBank = useMemo(() => banks.find((bank) => bank.code === bankCode) ?? null, [banks, bankCode]);

  const loadData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setPageError("");
    try {
      const [accountResponse, banksResponse, pickupResponse] = await Promise.all([
        fetch("/api/seller/payout-account", { cache: "no-store" }),
        fetch("/api/seller/payout-account/banks", { cache: "no-store" }),
        fetch("/api/seller/business/shipbubble-pickup", { cache: "no-store" }),
      ]);
      const [accountPayload, banksPayload, pickupPayload] = await Promise.all([
        readJson(accountResponse), readJson(banksResponse), readJson(pickupResponse),
      ]);
      if (!accountResponse.ok) throw new Error(typeof accountPayload.error === "string" ? accountPayload.error : "Unable to load your payout account.");
      if (banksResponse.ok && Array.isArray(banksPayload.banks)) {
        setBanks(banksPayload.banks.filter(isRecord).map((item) => ({ name: String(item.name ?? ""), code: String(item.code ?? "") })).filter((item) => item.name && item.code));
      } else if (!banksResponse.ok) {
        setBankError(typeof banksPayload.error === "string" ? banksPayload.error : "Unable to load the bank list.");
      }
      setPayoutAccount(isRecord(accountPayload.payoutAccount) ? accountPayload.payoutAccount as unknown as PayoutAccount : null);
      setSettlements(Array.isArray(accountPayload.settlements) ? accountPayload.settlements as Settlement[] : []);
      setTransfersEnabled(accountPayload.transfersEnabled === true);
      if (pickupResponse.ok && isRecord(pickupPayload.pickup)) {
        const current = pickupPayload.pickup as unknown as Pickup;
        setPickup(current);
        setContactName(current.contactName ?? "");
        setPickupPhone(current.phone ?? "");
      } else if (pickupResponse.status === 404 || pickupResponse.status === 403) {
        setPickup(null);
      } else if (!pickupResponse.ok) {
        setPickupError(typeof pickupPayload.error === "string" ? pickupPayload.error : "Unable to load the pickup address.");
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Unable to load payout settings.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  async function resolveAccount() {
    setResolveBusy(true);
    setBankError("");
    setBankMessage("");
    setResolvedName("");
    try {
      const response = await fetch("/api/seller/payout-account/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountNumber: accountNumber.trim(), bankCode }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to verify this bank account.");
      setResolvedName(typeof payload.accountName === "string" ? payload.accountName : "");
      setBankMessage("Account name verified by Paystack. Confirm that it belongs to you before saving.");
    } catch (error) {
      setBankError(error instanceof Error ? error.message : "Unable to verify this bank account.");
    } finally {
      setResolveBusy(false);
    }
  }

  async function saveAccount() {
    if (!resolvedName || !selectedBank) return;
    setBankBusy(true);
    setBankError("");
    setBankMessage("");
    try {
      const response = await fetch("/api/seller/payout-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountNumber: accountNumber.trim(), bankCode, confirmAccountName: true }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to save your payout account.");
      setAccountNumber("");
      setResolvedName("");
      setBankMessage(typeof payload.message === "string" ? payload.message : "Your payout account has been saved.");
      await loadData(false);
    } catch (error) {
      setBankError(error instanceof Error ? error.message : "Unable to save your payout account.");
    } finally {
      setBankBusy(false);
    }
  }

  async function validatePickup() {
    setPickupBusy(true);
    setPickupError("");
    setPickupMessage("");
    try {
      const response = await fetch("/api/seller/business/shipbubble-pickup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactName, phone: pickupPhone }),
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Unable to validate the pickup address.");
      setPickupMessage(typeof payload.message === "string" ? payload.message : "Pickup address validated.");
      await loadData(false);
    } catch (error) {
      setPickupError(error instanceof Error ? error.message : "Unable to validate the pickup address.");
    } finally {
      setPickupBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#FAF6EF] px-3 pb-12 pt-5 text-[#2E241F] sm:px-6 sm:pt-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/seller" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#8B8178] hover:text-[#9F2D18]"><ArrowLeft className="h-3.5 w-3.5" />Seller dashboard</Link>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#9F2D18]">Seller settings</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Payout & delivery setup</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#766C63]">Set up the bank account for automatic settlements and validate the address couriers will use to pick up your orders.</p>
          </div>
          <button type="button" onClick={() => { setRefreshing(true); void loadData(false); }} disabled={loading || refreshing} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E8DED3] bg-white px-4 text-xs font-semibold text-[#6F675F] hover:bg-[#FFF0E8] hover:text-[#9F2D18] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />Refresh</button>
        </div>

        <div className="mb-5 rounded-2xl border border-[#F1D1C9] bg-[#FFF7F3] p-4 sm:p-5">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#9F2D18]" /><div><p className="text-sm font-semibold text-[#7C2C1A]">How seller payouts work</p><p className="mt-1 text-xs leading-5 text-[#8B5A4C]">ReMarket only prepares a seller settlement after the buyer confirms delivery of that seller's order. ReMarket deducts its 5% commission from the seller's product sales; the buyer is not charged this commission. Transfers are marked paid only after Paystack confirms the transfer.</p>{!transfersEnabled && <p className="mt-2 text-xs font-semibold text-[#9F5A18]">Automatic transfers are not enabled on this server yet. Your verified account can be saved, and eligible settlements will remain queued.</p>}</div></div>
        </div>

        {pageError && <div role="alert" className="mb-5 rounded-xl border border-[#F1C5BF] bg-[#FFF4F2] p-3 text-sm text-[#B42318]">{pageError}</div>}
        {loading ? <div className="space-y-4"><div className="h-64 animate-pulse rounded-2xl bg-white" /><div className="h-48 animate-pulse rounded-2xl bg-white" /></div> : <div className="grid gap-5 lg:grid-cols-2">
          <section className={cardClass}>
            <div className="mb-4 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#9F2D18]"><Wallet className="h-5 w-5" /></div><div><h2 className="text-base font-semibold">Seller payout bank account</h2><p className="mt-1 text-xs text-[#8B8178]">Paystack verifies the account name before it is saved.</p></div></div>
            {payoutAccount ? <div className="mb-4 rounded-xl border border-[#D4EBDD] bg-[#F0FAF4] p-3"><div className="flex items-center gap-2 text-[#287A4B]"><CheckCircle2 className="h-4 w-4" /><p className="text-xs font-semibold">Verified payout account</p></div><p className="mt-2 text-sm font-semibold text-[#2E241F]">{payoutAccount.accountName}</p><p className="mt-1 text-xs text-[#6F675F]">{payoutAccount.bankName} · •••• {payoutAccount.accountNumberLast4}</p><p className="mt-1 text-[11px] text-[#8B8178]">Verified {formatDate(payoutAccount.verifiedAt)}</p></div> : <div className="mb-4 rounded-xl bg-[#F7F1EB] p-3 text-xs leading-5 text-[#6F675F]">No payout bank account has been saved yet.</div>}
            <div className="space-y-3">
              <label className="block"><span className={labelClass}>Bank</span><span className="relative block"><select value={bankCode} onChange={(event) => { setBankCode(event.target.value); setResolvedName(""); setBankMessage(""); }} className={`${inputClass} appearance-none pr-9`}><option value="">Select your bank</option>{banks.map((bank) => <option key={bank.code} value={bank.code}>{bank.name}</option>)}</select><ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-[#8B8178]" /></span></label>
              <label className="block"><span className={labelClass}>10-digit account number</span><input value={accountNumber} onChange={(event) => { setAccountNumber(event.target.value.replace(/\D/g, "").slice(0, 10)); setResolvedName(""); setBankMessage(""); }} inputMode="numeric" autoComplete="off" placeholder="Enter your bank account number" className={inputClass} maxLength={10} /></label>
              <button type="button" onClick={() => void resolveAccount()} disabled={resolveBusy || !bankCode || accountNumber.length !== 10} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#E8DED3] bg-white px-4 text-xs font-semibold text-[#6F675F] hover:bg-[#FFF0E8] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-50">{resolveBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Verify account name</button>
              {resolvedName && <div className="rounded-xl border border-[#D4EBDD] bg-[#F0FAF4] p-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-[#287A4B]">Paystack verified account name</p><p className="mt-1 text-sm font-semibold text-[#2E241F]">{resolvedName}</p><p className="mt-1 text-[11px] text-[#6F675F]">Only save this account if the displayed name is correct and belongs to you.</p></div>}
              {bankError && <p role="alert" className="rounded-lg bg-[#FFF4F2] p-2.5 text-xs text-[#B42318]">{bankError}</p>}
              {bankMessage && <p role="status" className="rounded-lg bg-[#F0FAF4] p-2.5 text-xs text-[#287A4B]">{bankMessage}</p>}
              <button type="button" onClick={() => void saveAccount()} disabled={bankBusy || !resolvedName || !selectedBank} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#9F2D18] px-4 text-sm font-semibold text-white hover:bg-[#842515] disabled:cursor-not-allowed disabled:opacity-50">{bankBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}Save verified bank account</button>
            </div>
          </section>

          <section className={cardClass}>
            <div className="mb-4 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#9F2D18]"><MapPin className="h-5 w-5" /></div><div><h2 className="text-base font-semibold">Shipbubble pickup address</h2><p className="mt-1 text-xs text-[#8B8178]">Couriers use this address to collect prepared orders.</p></div></div>
            {pickup?.isConfigured ? <div className="mb-4 rounded-xl border border-[#D4EBDD] bg-[#F0FAF4] p-3"><div className="flex items-center gap-2 text-[#287A4B]"><CheckCircle2 className="h-4 w-4" /><p className="text-xs font-semibold">Pickup address validated</p></div><p className="mt-2 text-sm font-semibold text-[#2E241F]">{pickup.contactName}</p><p className="mt-1 text-xs text-[#6F675F]">{pickup.businessAddress || "Business address on file"}</p><p className="mt-1 text-xs text-[#6F675F]">{pickup.phone}</p><p className="mt-1 text-[11px] text-[#8B8178]">Validated {formatDate(pickup.validatedAt)}</p></div> : <div className="mb-4 rounded-xl bg-[#F7F1EB] p-3 text-xs leading-5 text-[#6F675F]">Your business location must be complete before it can be validated with Shipbubble. Changing the business location clears its previous pickup validation.</div>}
            <div className="space-y-3">
              <label className="block"><span className={labelClass}>Pickup contact name</span><input value={contactName} onChange={(event) => setContactName(event.target.value)} maxLength={120} placeholder="Person the courier should contact" className={inputClass} /></label>
              <label className="block"><span className={labelClass}>Pickup phone number</span><input value={pickupPhone} onChange={(event) => setPickupPhone(event.target.value)} inputMode="tel" maxLength={30} placeholder="080... or +234..." className={inputClass} /></label>
              {pickupError && <p role="alert" className="rounded-lg bg-[#FFF4F2] p-2.5 text-xs text-[#B42318]">{pickupError}</p>}
              {pickupMessage && <p role="status" className="rounded-lg bg-[#F0FAF4] p-2.5 text-xs text-[#287A4B]">{pickupMessage}</p>}
              <button type="button" onClick={() => void validatePickup()} disabled={pickupBusy || contactName.trim().length < 2 || pickupPhone.trim().length < 7} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#9F2D18] px-4 text-sm font-semibold text-white hover:bg-[#842515] disabled:cursor-not-allowed disabled:opacity-50">{pickupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}Validate pickup address</button>
              <Link href="/seller" className="inline-flex items-center gap-1 text-xs font-semibold text-[#9F2D18] hover:underline"><Building2 className="h-3.5 w-3.5" />Update business location</Link>
            </div>
          </section>
        </div>}

        <section className={`${cardClass} mt-5`}>
          <div className="mb-4 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F7F1EB] text-[#6F675F]"><Clock3 className="h-5 w-5" /></div><div><h2 className="text-base font-semibold">Settlement history</h2><p className="mt-1 text-xs text-[#8B8178]">Each seller order is settled separately after buyer-confirmed delivery.</p></div></div>
          {settlements.length === 0 ? <div className="rounded-xl bg-[#F7F1EB] p-4 text-xs leading-5 text-[#6F675F]">No seller settlements have been recorded yet. Completed orders will appear here after buyers confirm delivery.</div> : <div className="space-y-3">{settlements.map((settlement) => <article key={settlement.id} className="rounded-xl border border-[#F0E9E2] p-3 sm:p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold text-[#9F2D18]">{settlement.sellerOrder.sellerOrderCode}</p><p className="mt-1 text-[11px] text-[#8B8178]">Buyer confirmed {formatDate(settlement.deliveryConfirmedAt)}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusClass(settlement.status)}`}>{settlement.status.replaceAll("_", " ")}</span></div><div className="mt-3 grid grid-cols-3 gap-2 border-t border-[#F0E9E2] pt-3"><div><p className="text-[10px] text-[#8B8178]">Gross sales</p><p className="mt-1 text-xs font-semibold text-[#2E241F]">{formatCurrency(settlement.grossSalesAmount, settlement.currency)}</p></div><div><p className="text-[10px] text-[#8B8178]">5% commission</p><p className="mt-1 text-xs font-semibold text-[#B42318]">−{formatCurrency(settlement.commissionAmount, settlement.currency)}</p></div><div><p className="text-[10px] text-[#8B8178]">Seller proceeds</p><p className="mt-1 text-xs font-semibold text-[#287A4B]">{formatCurrency(settlement.netPayoutAmount, settlement.currency)}</p></div></div>{(settlement.failureReason || settlement.payout?.failureReason) && <p className="mt-3 rounded-lg bg-[#FFF4F2] p-2.5 text-xs leading-5 text-[#B42318]">{settlement.failureReason || settlement.payout?.failureReason}</p>}{settlement.payout?.paidAt && <p className="mt-2 text-[11px] text-[#287A4B]">Paystack confirmed payout: {formatDate(settlement.payout.paidAt)}</p>}{settlement.payout?.attempts?.length ? <details className="mt-3 rounded-lg border border-[#E8DED3] p-3"><summary className="cursor-pointer text-xs font-semibold text-[#6F675F]">Transfer attempt history ({settlement.payout.attempts.length})</summary><div className="mt-3 space-y-2">{settlement.payout.attempts.map((attempt) => <div key={`${attempt.attemptNumber}-${attempt.reference}`} className="border-t border-[#F0E9E2] pt-2"><p className="text-xs font-semibold text-[#4B4038]">Attempt {attempt.attemptNumber} · {attempt.status.replaceAll("_", " ")}</p><p className="mt-1 break-all text-[10px] text-[#8B8178]">{attempt.reference}</p>{attempt.failureReason && <p className="mt-1 text-[11px] text-[#B42318]">{attempt.failureReason}</p>}<p className="mt-1 text-[10px] text-[#8B8178]">{formatDate(attempt.paidAt || attempt.reversedAt || attempt.submittedAt)}</p></div>)}</div></details> : null}</article>)}</div>}
        </section>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><Link href="/seller/profile" className="text-xs font-semibold text-[#8B8178] hover:text-[#9F2D18]">Return to profile</Link><p className="text-[11px] text-[#A0968E]">Bank account numbers are not stored in full by ReMarket.</p></div>
      </div>
    </main>
  );
}
