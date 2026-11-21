"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  LoaderCircle,
  MapPin,
  Package,
  PackageCheck,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
  XCircle,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";

/* =========================================================
   CONSTANTS
========================================================= */

const MAX_QUANTITY_PER_PRODUCT = 50;
const MAX_ORDER_TOTAL = 2_147_483_647;
const CART_CHANGED_EVENT = "remarket-cart-changed";
const CHECKOUT_IDEMPOTENCY_STORAGE_KEY = "remarket-checkout-idempotency";
const QUOTE_EXPIRY_WARNING_MS = 5 * 60 * 1000;

const noStoreHeaders = {
  Accept: "application/json",
  "Cache-Control": "no-store",
};

/* =========================================================
   TYPES
========================================================= */

type CheckoutCartItem = {
  id: string;
  productId: string;
  businessId: string;
  businessName: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number | null;
  originalPrice: number | null;
  lineTotal: number | null;
  purchasable: boolean;
  unavailableReason: string | null;
};

type CartGroup = {
  businessId: string;
  businessName: string;
  items: CheckoutCartItem[];
};

type DeliveryForm = {
  deliveryRecipient: string;
  deliveryPhone: string;
  deliveryAddress: string;
  deliveryArea: string;
  deliveryLandmark: string;
  deliveryNotes: string;
};

type StoredCheckoutAttempt = {
  key: string;
  fingerprint: string;
};

type CourierRate = {
  courierId: string;
  courierName: string;
  serviceCode: string;
  serviceType: string | null;
  amount: number;
  currency: string;
  eta: string | null;
  pickupEta: string | null;
};

type DeliveryQuotePackage = {
  id?: string;
  businessId: string;
  businessName: string;
  items: Array<{ productId: string; productName: string; quantity: number }>;
  rates: CourierRate[];
  selectedCourierId?: string | null;
  selectedServiceCode?: string | null;
  selectedDeliveryFee?: number | null;
  selectedCourierName?: string | null;
  selectedDeliveryEta?: string | null;
};

type DeliveryQuote = {
  id: string;
  quoteCode: string;
  expiresAt: string;
  itemsSubtotal: number;
  packages: DeliveryQuotePackage[];
};

type QuoteSelection = {
  businessId: string;
  courierId: string;
  serviceCode: string;
};

type CheckoutApiResult = {
  orderId: string;
  orderCode: string;
  authorizationUrl: string | null;
  paymentStatus: string | null;
};

type CartResponse = {
  items: CheckoutCartItem[];
  itemCount: number;
  subtotal: number;
  currency: string;
};

/* =========================================================
   INITIAL STATE
========================================================= */

const initialDeliveryForm: DeliveryForm = {
  deliveryRecipient: "",
  deliveryPhone: "",
  deliveryAddress: "",
  deliveryArea: "",
  deliveryLandmark: "",
  deliveryNotes: "",
};

/* =========================================================
   GENERAL HELPERS
========================================================= */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown, fallback: string | null = null): string | null {
  if (typeof value !== "string") return fallback;
  const cleaned = value.trim();
  return cleaned || fallback;
}

function getSafeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function isNotDeleted(value: unknown): boolean {
  return value === null || value === undefined;
}

function formatNaira(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}

function dispatchCartChanged() {
  window.dispatchEvent(new Event(CART_CHANGED_EVENT));
}

function rateKey(rate: CourierRate): string {
  return `${rate.courierId}::${rate.serviceCode}`;
}

function formatEta(value: string | null): string {
  return value || "Delivery estimate provided by courier";
}

function parseApiError(payload: unknown, fallback: string): string {
  if (isRecord(payload) && typeof payload.error === "string") return payload.error;
  if (isRecord(payload) && typeof payload.message === "string") return payload.message;
  return fallback;
}

function createCartFingerprint(items: CheckoutCartItem[]): string {
  const snapshot = items
    .map((item) => ({
      cartItemId: item.id,
      productId: item.productId,
      businessId: item.businessId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }))
    .sort((a, b) => a.cartItemId.localeCompare(b.cartItemId));
  return JSON.stringify(snapshot);
}

function createCheckoutFingerprint(
  cartFingerprint: string,
  quoteId: string,
  form: DeliveryForm,
): string {
  return JSON.stringify({
    cartFingerprint,
    quoteId,
    deliveryRecipient: form.deliveryRecipient.trim(),
    deliveryPhone: form.deliveryPhone.trim(),
    deliveryAddress: form.deliveryAddress.trim(),
    deliveryArea: form.deliveryArea.trim(),
    deliveryLandmark: form.deliveryLandmark.trim(),
    deliveryNotes: form.deliveryNotes.trim(),
  });
}

/* =========================================================
   CART RESPONSE PARSER
========================================================= */

function getValidOriginalPrice(raw: unknown, unitPrice: number | null): number | null {
  const originalPrice = getSafeInteger(raw);
  if (
    unitPrice === null ||
    unitPrice <= 0 ||
    originalPrice === null ||
    originalPrice <= unitPrice ||
    originalPrice > MAX_ORDER_TOTAL
  ) return null;
  return originalPrice;
}

function parseCheckoutCart(value: unknown): CartResponse | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;

  const items: CheckoutCartItem[] = [];

  for (const rawItem of value.items) {
    if (!isRecord(rawItem)) continue;
    const product = isRecord(rawItem.product) ? rawItem.product : null;
    const business = product && isRecord(product.business) ? product.business : null;
    const quantity = getSafeInteger(rawItem.quantity);
    const productId = getString(rawItem.productId) ?? getString(product?.id);

    if (typeof rawItem.id !== "string" || !productId || quantity === null || quantity < 1) continue;

    const businessName = getString(business?.name, "Business unavailable")!;
    const businessId = getString(business?.id, `business:${businessName}`)!;
    const name = getString(product?.name, "Product unavailable")!;
    const unitPrice = getSafeInteger(product?.price);
    const originalPrice = getValidOriginalPrice(product?.originalPrice, unitPrice);

    const stockFieldExists = product !== null && Object.prototype.hasOwnProperty.call(product, "stockQuantity");
    const rawStock = product?.stockQuantity;
    const stock = rawStock === null ? null : getSafeInteger(rawStock);
    const validStock = stockFieldExists && (rawStock === null || (stock !== null && stock >= 0));
    const enoughStock = validStock && (stock === null || (stock !== null && stock >= quantity));

    const productAvailable = Boolean(
      product &&
      product.status === "ACTIVE" &&
      isNotDeleted(product.deletedAt) &&
      product.availability === "AVAILABLE" &&
      business &&
      business.status === "ACTIVE" &&
      isNotDeleted(business.deletedAt),
    );

    const validPrice = unitPrice !== null && unitPrice > 0 && unitPrice <= MAX_ORDER_TOTAL;
    const validQuantity = quantity <= MAX_QUANTITY_PER_PRODUCT;
    const lineTotalCalculated = validPrice && unitPrice !== null ? unitPrice * quantity : null;
    const validLineTotal = lineTotalCalculated !== null &&
      Number.isSafeInteger(lineTotalCalculated) &&
      lineTotalCalculated > 0 &&
      lineTotalCalculated <= MAX_ORDER_TOTAL;

    const apiLineExists = rawItem.lineTotal !== null && rawItem.lineTotal !== undefined;
    const apiLineTotal = getSafeInteger(rawItem.lineTotal);
    const apiLineMatches = !apiLineExists || (apiLineTotal !== null && apiLineTotal === lineTotalCalculated);

    const purchasable = Boolean(
      rawItem.purchasable === true &&
      productAvailable &&
      validPrice &&
      validQuantity &&
      validStock &&
      enoughStock &&
      validLineTotal &&
      apiLineMatches,
    );

    const images = Array.isArray(product?.images) ? product.images : [];
    const firstImage = images.find(isRecord);
    const imageUrl = getString(product?.imageUrl) ?? getString(firstImage?.url) ?? getString(firstImage?.imageUrl);

    let unavailableReason: string | null = null;
    if (!validQuantity) unavailableReason = `You can purchase up to ${MAX_QUANTITY_PER_PRODUCT} units of one product.`;
    else if (!productAvailable) unavailableReason = "This product or its business is no longer available.";
    else if (!validPrice) unavailableReason = "This product does not have a confirmed fixed price.";
    else if (!validStock) unavailableReason = "The stock information for this product is unavailable.";
    else if (!enoughStock) unavailableReason = "The requested quantity exceeds the available stock.";
    else if (!validLineTotal || !apiLineMatches) unavailableReason = "The product price or total has changed. Refresh your cart.";
    else if (!purchasable) unavailableReason = getString(rawItem.unavailableReason, "This product is unavailable for checkout.");

    items.push({
      id: rawItem.id,
      productId,
      businessId,
      businessName,
      name,
      imageUrl,
      quantity,
      unitPrice,
      originalPrice,
      lineTotal: validLineTotal ? lineTotalCalculated : null,
      purchasable,
      unavailableReason,
    });
  }

  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + (item.purchasable ? item.lineTotal ?? 0 : 0), 0);

  return {
    items,
    itemCount,
    subtotal,
    currency: typeof value.currency === "string" ? value.currency : "NGN",
  };
}

/* =========================================================
   DELIVERY QUOTE RESPONSE PARSER
========================================================= */

function parseCourierRate(value: unknown): CourierRate | null {
  if (!isRecord(value)) return null;
  const courierId = getString(value.courierId ?? value.courier_id);
  const serviceCode = getString(value.serviceCode ?? value.service_code);
  const courierName = getString(value.courierName ?? value.courier_name, "Delivery partner")!;
  const rawAmount = value.amount ?? value.total ?? value.rate_card_amount;
  const amount = getSafeInteger(rawAmount);

  if (!courierId || !serviceCode || amount === null || amount < 0 || amount > MAX_ORDER_TOTAL) return null;

  return {
    courierId,
    courierName,
    serviceCode,
    serviceType: getString(value.serviceType ?? value.service_type),
    amount,
    currency: getString(value.currency ?? value.rate_card_currency, "NGN")!,
    eta: getString(value.eta ?? value.delivery_eta ?? value.delivery_eta_time),
    pickupEta: getString(value.pickupEta ?? value.pickup_eta ?? value.pickup_eta_time),
  };
}

function parseDeliveryQuote(value: unknown): DeliveryQuote | null {
  if (!isRecord(value)) return null;
  const rawQuote = isRecord(value.quote) ? value.quote : isRecord(value.data) ? value.data : value;
  const id = getString(rawQuote.id ?? rawQuote.quoteId);
  const expiresAt = getString(rawQuote.expiresAt ?? rawQuote.expires_at);
  const quoteCode = getString(rawQuote.quoteCode ?? rawQuote.quote_code, id ?? "")!;
  const rawPackages = Array.isArray(rawQuote.packages) ? rawQuote.packages : null;
  const itemsSubtotal = getSafeInteger(rawQuote.itemsSubtotal ?? rawQuote.items_subtotal);

  if (!id || !expiresAt || !rawPackages || itemsSubtotal === null) return null;
  if (!Number.isFinite(new Date(expiresAt).getTime())) return null;

  const packages: DeliveryQuotePackage[] = [];
  for (const rawPackage of rawPackages) {
    if (!isRecord(rawPackage)) continue;
    const businessId = getString(rawPackage.businessId ?? rawPackage.business_id);
    if (!businessId) continue;
    const rawRates = Array.isArray(rawPackage.rates)
      ? rawPackage.rates
      : Array.isArray(rawPackage.availableRates)
        ? rawPackage.availableRates
        : Array.isArray(rawPackage.available_rates)
          ? rawPackage.available_rates
          : [];
    const rates = rawRates.map(parseCourierRate).filter((rate): rate is CourierRate => rate !== null);
    const rawItems = Array.isArray(rawPackage.items) ? rawPackage.items : [];
    const items = rawItems.flatMap((item) => {
      if (!isRecord(item)) return [];
      const productId = getString(item.productId ?? item.product_id);
      const productName = getString(item.productName ?? item.product_name);
      const quantity = getSafeInteger(item.quantity);
      if (!productId || !productName || quantity === null || quantity < 1) return [];
      return [{ productId, productName, quantity }];
    });

    packages.push({
      id: getString(rawPackage.id) ?? undefined,
      businessId,
      businessName: getString(rawPackage.businessName ?? rawPackage.business_name, "Seller")!,
      items,
      rates,
      selectedCourierId: getString(rawPackage.selectedCourierId ?? rawPackage.selected_courier_id),
      selectedServiceCode: getString(rawPackage.selectedServiceCode ?? rawPackage.selected_service_code),
      selectedDeliveryFee: getSafeInteger(rawPackage.selectedDeliveryFee ?? rawPackage.selected_delivery_fee),
      selectedCourierName: getString(rawPackage.selectedCourierName ?? rawPackage.selected_courier_name),
      selectedDeliveryEta: getString(rawPackage.selectedDeliveryEta ?? rawPackage.selected_delivery_eta),
    });
  }

  if (packages.length === 0) return null;
  return { id, quoteCode, expiresAt, itemsSubtotal, packages };
}

/* =========================================================
   CHECKOUT RESPONSE PARSER
========================================================= */

function parseCheckoutApiResult(value: unknown): CheckoutApiResult | null {
  if (!isRecord(value) || !isRecord(value.order) || typeof value.order.id !== "string" || typeof value.order.orderCode !== "string") {
    return null;
  }
  const payment = isRecord(value.payment) ? value.payment : null;
  return {
    orderId: value.order.id,
    orderCode: value.order.orderCode,
    authorizationUrl: getString(payment?.authorizationUrl),
    paymentStatus: getString(payment?.status),
  };
}

/* =========================================================
   STORE GROUPING
========================================================= */

function groupCartItems(items: CheckoutCartItem[]): CartGroup[] {
  const groups = new Map<string, CartGroup>();
  for (const item of items) {
    if (!groups.has(item.businessId)) {
      groups.set(item.businessId, {
        businessId: item.businessId,
        businessName: item.businessName,
        items: [],
      });
    }
    groups.get(item.businessId)!.items.push(item);
  }
  return Array.from(groups.values());
}

/* =========================================================
   CHECKOUT PROGRESS
========================================================= */

function CheckoutSteps({ step }: { step: 1 | 2 | 3 }) {
  const steps = ["Delivery address", "Delivery options", "Payment"] as const;

  return (
    <section className="rm-panel p-4 sm:p-5" aria-label="Checkout progress">
      <ol className="grid grid-cols-3 gap-3">
        {steps.map((label, index) => {
          const number = (index + 1) as 1 | 2 | 3;
          const complete = number < step;
          const active = number === step;
          return (
            <li key={label} className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold"
                  style={{
                    background: complete ? "var(--rm-green-bg)" : active ? "var(--rm-coral)" : "var(--rm-surface-muted)",
                    color: complete ? "var(--rm-green)" : active ? "#fff" : "var(--rm-muted)",
                  }}
                >
                  {complete ? <Check className="h-4 w-4" /> : `0${number}`}
                </span>
                <span
                  className="truncate text-[10px] font-bold sm:text-xs"
                  style={{ color: active ? "var(--rm-coral-dark)" : complete ? "var(--rm-green)" : "var(--rm-muted)" }}
                >
                  {label}
                </span>
              </div>
              <div
                className="mt-3 h-1 rounded-full"
                style={{ background: complete || active ? "var(--rm-coral)" : "var(--rm-border)" }}
              />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* =========================================================
   MAIN CHECKOUT PAGE
========================================================= */

export default function CheckoutPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const idempotencyKeyRef = useRef<StoredCheckoutAttempt | null>(null);

  const [items, setItems] = useState<CheckoutCartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [form, setForm] = useState<DeliveryForm>(initialDeliveryForm);
  const [quote, setQuote] = useState<DeliveryQuote | null>(null);
  const [quoteCartFingerprint, setQuoteCartFingerprint] = useState<string | null>(null);
  const [selectedRateKeys, setSelectedRateKeys] = useState<Record<string, string>>({});
  const [confirmedQuoteId, setConfirmedQuoteId] = useState<string | null>(null);
  const [clockNow, setClockNow] = useState(() => Date.now());

  const [quoting, setQuoting] = useState(false);
  const [confirmingRates, setConfirmingRates] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [submitError, setSubmitError] = useState("");

  /* -------------------- Cart calculations -------------------- */

  const itemCount = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);
  const subtotal = useMemo(() => items.reduce((sum, item) => sum + (item.purchasable ? item.lineTotal ?? 0 : 0), 0), [items]);
  const unavailableItems = useMemo(() => items.filter((item) => !item.purchasable), [items]);
  const groups = useMemo(() => groupCartItems(items), [items]);
  const cartFingerprint = useMemo(() => createCartFingerprint(items), [items]);

  const selectedRates = useMemo(() => {
    if (!quote) return [] as Array<{ businessId: string; rate: CourierRate }>;
    return quote.packages.flatMap((pack) => {
      const selectedKey = selectedRateKeys[pack.businessId];
      const rate = pack.rates.find((candidate) => rateKey(candidate) === selectedKey);
      return rate ? [{ businessId: pack.businessId, rate }] : [];
    });
  }, [quote, selectedRateKeys]);

  const selectedDeliveryFee = selectedRates.reduce((sum, item) => sum + item.rate.amount, 0);
  const displayedTotal = subtotal + selectedDeliveryFee;
  const quoteExpired = Boolean(quote && new Date(quote.expiresAt).getTime() <= clockNow);
  const quoteMatchesCart = Boolean(quote && quoteCartFingerprint === cartFingerprint);
  const allPackagesSelected = Boolean(quote && quote.packages.length > 0 && selectedRates.length === quote.packages.length);
  const quoteConfirmed = Boolean(quote && quoteMatchesCart && confirmedQuoteId === quote.id && allPackagesSelected && !quoteExpired);
  const quoteAlmostExpired = Boolean(quote && new Date(quote.expiresAt).getTime() - clockNow < QUOTE_EXPIRY_WARNING_MS && !quoteExpired);

  const validCart = items.length > 0 && unavailableItems.length === 0 &&
    items.every((item) => item.lineTotal !== null && Number.isSafeInteger(item.lineTotal) && item.lineTotal > 0) &&
    Number.isSafeInteger(subtotal) && subtotal > 0 && subtotal <= MAX_ORDER_TOTAL;

  const canSubmitPayment = validCart && quoteConfirmed && !quoting && !confirmingRates && !submitting;

  /* -------------------- Checkout key -------------------- */

  const getOrCreateCheckoutKey = useCallback((fingerprint: string): string => {
    if (idempotencyKeyRef.current?.fingerprint === fingerprint) return idempotencyKeyRef.current.key;

    try {
      const saved = window.sessionStorage.getItem(CHECKOUT_IDEMPOTENCY_STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isRecord(parsed) && typeof parsed.key === "string" && /^[A-Za-z0-9._:-]{16,100}$/.test(parsed.key) && parsed.fingerprint === fingerprint) {
          idempotencyKeyRef.current = { key: parsed.key, fingerprint };
          return parsed.key;
        }
      }
    } catch {
      // Storage may be unavailable; use an in-memory key.
    }

    const randomPart = typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const record = { key: `rm-${randomPart}`, fingerprint };
    idempotencyKeyRef.current = record;
    try {
      window.sessionStorage.setItem(CHECKOUT_IDEMPOTENCY_STORAGE_KEY, JSON.stringify(record));
    } catch {
      // The in-memory key still protects retry attempts in this page.
    }
    return record.key;
  }, []);

  /* -------------------- Load cart -------------------- */

  const loadCart = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/cart", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: noStoreHeaders,
        signal,
      });
      if (response.status === 401 || response.status === 403) {
        router.replace("/buyer/login");
        return;
      }
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(parseApiError(payload, "Unable to load your cart."));
      const parsed = parseCheckoutCart(payload);
      if (!parsed) throw new Error("We could not read your cart information.");
      if (signal.aborted) return;
      setItems(parsed.items);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (!signal.aborted) {
        console.error("Checkout cart error:", error);
        setLoadError(error instanceof Error ? error.message : "Unable to load your cart.");
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    void loadCart(controller.signal);
    return () => controller.abort();
  }, [loadCart, refreshKey]);

  useEffect(() => {
    const refreshCart = () => setRefreshKey((value) => value + 1);
    window.addEventListener(CART_CHANGED_EVENT, refreshCart);
    return () => window.removeEventListener(CART_CHANGED_EVENT, refreshCart);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  /* -------------------- Reset quotes when address changes -------------------- */

  function updateField(field: keyof DeliveryForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setQuote(null);
    setQuoteCartFingerprint(null);
    setSelectedRateKeys({});
    setConfirmedQuoteId(null);
    setQuoteError("");
    setSubmitError("");
    idempotencyKeyRef.current = null;
  }

  function validateDeliveryForm(): boolean {
    if (!formRef.current?.reportValidity()) return false;
    const phoneDigits = form.deliveryPhone.replace(/\D/g, "");
    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      setQuoteError("Enter a valid delivery phone number.");
      return false;
    }
    return true;
  }

  /* -------------------- Request Shipbubble delivery rates -------------------- */

  async function handleGetDeliveryRates() {
    if (quoting || !validCart || !validateDeliveryForm()) return;
    setQuoting(true);
    setQuoteError("");
    setSubmitError("");
    setQuote(null);
    setQuoteCartFingerprint(null);
    setSelectedRateKeys({});
    setConfirmedQuoteId(null);

    try {
      const response = await fetch("/api/shipping/quotes", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...noStoreHeaders },
        body: JSON.stringify({
          deliveryRecipient: form.deliveryRecipient.trim(),
          deliveryPhone: form.deliveryPhone.trim(),
          deliveryAddress: form.deliveryAddress.trim(),
          deliveryArea: form.deliveryArea.trim(),
          deliveryLandmark: form.deliveryLandmark.trim() || null,
          deliveryNotes: form.deliveryNotes.trim() || null,
        }),
      });
      if (response.status === 401 || response.status === 403) {
        router.replace("/buyer/login");
        return;
      }
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(parseApiError(payload, "We could not retrieve delivery options."));
      const parsed = parseDeliveryQuote(payload);
      if (!parsed) throw new Error("Shipbubble returned an incomplete delivery quote. Please try again.");
      if (parsed.itemsSubtotal !== subtotal) throw new Error("Your cart total changed while delivery was being calculated. Refresh checkout and try again.");
      if (parsed.packages.length !== groups.length) throw new Error("Delivery options were not returned for every seller in your cart.");

      const expectedBusinessIds = new Set(groups.map((group) => group.businessId));
      const receivedBusinessIds = new Set(parsed.packages.map((pack) => pack.businessId));
      if (
        parsed.packages.some((pack) => !expectedBusinessIds.has(pack.businessId)) ||
        receivedBusinessIds.size !== parsed.packages.length ||
        groups.some((group) => !receivedBusinessIds.has(group.businessId))
      ) {
        throw new Error("The delivery quote does not match every seller in your cart. Please refresh and try again.");
      }
      if (parsed.packages.some((pack) => pack.rates.length === 0)) {
        const noRate = parsed.packages.find((pack) => pack.rates.length === 0);
        throw new Error(`No delivery services are currently available for ${noRate?.businessName ?? "one of your sellers"}. Try another delivery address or contact support.`);
      }
      if (parsed.packages.some((pack) => pack.rates.some((rate) => rate.currency.toUpperCase() !== "NGN"))) {
        throw new Error("A delivery option was returned in an unsupported currency. Please contact support.");
      }

      // The buyer must actively choose one courier for every seller parcel.
      setQuote(parsed);
      setQuoteCartFingerprint(cartFingerprint);
      setSelectedRateKeys({});
    } catch (error) {
      console.error("Shipbubble delivery quote error:", error);
      setQuoteError(error instanceof Error ? error.message : "Unable to load delivery options.");
    } finally {
      setQuoting(false);
    }
  }

  /* -------------------- Courier selection -------------------- */

  function selectCourier(businessId: string, selectedKey: string) {
    setSelectedRateKeys((current) => ({ ...current, [businessId]: selectedKey }));
    setConfirmedQuoteId(null);
    setSubmitError("");
  }

  /* -------------------- Persist courier choices -------------------- */

  async function handleConfirmDeliveryOptions() {
    if (!quote || !quoteMatchesCart || !allPackagesSelected || quoteExpired || confirmingRates) return;
    setConfirmingRates(true);
    setQuoteError("");
    setSubmitError("");

    const selections: QuoteSelection[] = quote.packages.flatMap((pack) => {
      const selectedKey = selectedRateKeys[pack.businessId];
      const rate = pack.rates.find((candidate) => rateKey(candidate) === selectedKey);
      return rate ? [{ businessId: pack.businessId, courierId: rate.courierId, serviceCode: rate.serviceCode }] : [];
    });

    try {
      const response = await fetch("/api/shipping/quotes/select", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", ...noStoreHeaders },
        body: JSON.stringify({ quoteId: quote.id, selections }),
      });
      if (response.status === 401 || response.status === 403) {
        router.replace("/buyer/login");
        return;
      }
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(parseApiError(payload, "We could not save your delivery choices."));

      const returnedQuote = parseDeliveryQuote(payload);
      if (!returnedQuote || returnedQuote.id !== quote.id || returnedQuote.packages.length !== quote.packages.length) {
        throw new Error("The server could not confirm every selected delivery service. Please request rates again.");
      }
      setConfirmedQuoteId(quote.id);
    } catch (error) {
      console.error("Confirm delivery options error:", error);
      setQuoteError(error instanceof Error ? error.message : "Unable to confirm delivery options.");
    } finally {
      setConfirmingRates(false);
    }
  }

  /* -------------------- Start Paystack checkout -------------------- */

  async function handlePayNow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmitPayment || !quote || !quoteMatchesCart) return;
    if (!validateDeliveryForm()) return;
    if (quoteExpired) {
      setQuoteError("Your delivery quote has expired. Request new delivery rates before paying.");
      setConfirmedQuoteId(null);
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    const fingerprint = createCheckoutFingerprint(cartFingerprint, quote.id, form);
    const idempotencyKey = getOrCreateCheckoutKey(fingerprint);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          ...noStoreHeaders,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          deliveryRecipient: form.deliveryRecipient.trim(),
          deliveryPhone: form.deliveryPhone.trim(),
          deliveryAddress: form.deliveryAddress.trim(),
          deliveryArea: form.deliveryArea.trim(),
          deliveryLandmark: form.deliveryLandmark.trim() || null,
          deliveryNotes: form.deliveryNotes.trim() || null,
          deliveryQuoteId: quote.id,
        }),
      });

      if (response.status === 401 || response.status === 403) {
        router.replace("/buyer/login");
        return;
      }

      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(parseApiError(payload, "We could not prepare your payment. Please try again."));

      const checkout = parseCheckoutApiResult(payload);
      if (!checkout) throw new Error("We received an unexpected checkout response. Please retry using the same checkout session.");

      if (checkout.authorizationUrl) {
        // Paystack's hosted checkout is the payment collection surface.
        window.location.assign(checkout.authorizationUrl);
        return;
      }

      if (checkout.paymentStatus === "SUCCESS") {
        dispatchCartChanged();
        router.replace(`/orders/${encodeURIComponent(checkout.orderId)}`);
        return;
      }

      throw new Error("Your order was prepared, but Paystack did not return a payment link. Please retry or contact support with your order reference.");
    } catch (error) {
      console.error("Paystack checkout error:", error);
      setSubmitError(error instanceof Error ? error.message : "Unable to start payment. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  /* =====================================================
     SHARED PAGE SHELLS
  ===================================================== */

  if (loading) {
    return (
      <>
        <SiteHeader searchMode="PRODUCTS" />
        <main className="rm-storefront flex min-h-[70vh] items-center justify-center px-4 pb-28">
          <section className="rm-panel w-full max-w-sm p-8 text-center" aria-live="polite">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-[var(--rm-coral-soft)] text-[var(--rm-coral-dark)]">
              <ShoppingBag className="h-7 w-7" aria-hidden="true" />
            </div>
            <LoaderCircle className="mx-auto mt-5 h-5 w-5 animate-spin text-[var(--rm-coral)]" aria-hidden="true" />
            <h1 className="mt-4 text-base font-bold text-[var(--rm-ink)]">Preparing your checkout</h1>
            <p className="mt-2 text-xs leading-6 text-[var(--rm-muted)]">Checking your products, prices and stock availability.</p>
          </section>
        </main>
        <MobileBottomNav />
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <SiteHeader searchMode="PRODUCTS" />
        <main className="rm-storefront flex min-h-[65vh] items-center justify-center px-4 pb-28">
          <section className="rm-panel w-full max-w-md p-7 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-[var(--rm-coral-soft)] text-[var(--rm-coral-dark)]">
              <Package className="h-7 w-7" aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-lg font-bold text-[var(--rm-ink)]">Checkout unavailable</h1>
            <p className="mt-2 text-xs leading-6 text-[var(--rm-muted)]">{loadError}</p>
            <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="rm-button rm-button-primary mt-6">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />Try again
            </button>
            <Link href="/cart" className="rm-text-link mt-4 justify-center">Return to cart</Link>
          </section>
        </main>
        <MobileBottomNav />
      </>
    );
  }

  if (items.length === 0) {
    return (
      <>
        <SiteHeader searchMode="PRODUCTS" />
        <main className="rm-storefront flex min-h-[65vh] items-center justify-center px-4 pb-28">
          <section className="rm-panel w-full max-w-md p-8 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-xl bg-[var(--rm-surface-muted)] text-[var(--rm-coral-dark)]">
              <PackageCheck className="h-7 w-7" aria-hidden="true" />
            </div>
            <h1 className="mt-5 text-xl font-bold text-[var(--rm-ink)]">Your cart is empty</h1>
            <p className="mt-2 text-xs leading-6 text-[var(--rm-muted)]">Add products to your cart before proceeding to checkout.</p>
            <Link href="/shop" className="rm-button rm-button-primary mt-6">
              Explore products<ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link href="/cart" className="rm-text-link mt-4 justify-center">Return to cart</Link>
          </section>
        </main>
        <MobileBottomNav />
      </>
    );
  }

  /* =====================================================
     MAIN CHECKOUT EXPERIENCE
  ===================================================== */

  const currentStep: 1 | 2 | 3 = !quote ? 1 : !quoteConfirmed ? 2 : 3;

  return (
    <>
      <SiteHeader searchMode="PRODUCTS" />
      <main id="main-content" className="rm-storefront min-h-dvh overflow-x-clip pb-36 lg:pb-10">
        <div className="rm-container pb-8 pt-5 lg:pt-7">
          <nav aria-label="Breadcrumb" className="mb-5 flex flex-wrap items-center gap-2 text-xs text-[var(--rm-muted)]">
            <Link href="/" className="hover:text-[var(--rm-coral-dark)]">Home</Link>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <Link href="/cart" className="hover:text-[var(--rm-coral-dark)]">Cart</Link>
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
            <span className="font-bold text-[var(--rm-coral-dark)]" aria-current="page">Checkout</span>
          </nav>

          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[var(--rm-coral-dark)]">Secure marketplace checkout</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--rm-ink)] sm:text-3xl">Checkout</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--rm-muted)]">Confirm your address, choose delivery for each seller’s parcel and pay once for your complete order.</p>
            </div>
            <Link href="/cart" className="rm-button rm-button-secondary self-start sm:self-auto">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to cart
            </Link>
          </div>

          <CheckoutSteps step={currentStep} />

          {unavailableItems.length > 0 && (
            <section role="alert" className="mt-5 rounded-xl border p-4" style={{ borderColor: "var(--rm-yellow-bg)", background: "#fffaf0" }}>
              <div className="flex items-start gap-3">
                <XCircle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--rm-yellow)" }} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold text-[var(--rm-ink)]">Some products need attention</h2>
                  <p className="mt-1 text-xs leading-5 text-[var(--rm-muted)]">Remove or update unavailable items before requesting delivery prices.</p>
                  <div className="mt-3 space-y-2">
                    {unavailableItems.map((item) => (
                      <div key={item.id} className="rounded-lg border border-[var(--rm-border)] bg-white px-3 py-2">
                        <p className="text-xs font-semibold text-[var(--rm-ink)]">{item.name}</p>
                        <p className="mt-1 text-xs text-[var(--rm-muted)]">{item.unavailableReason}</p>
                      </div>
                    ))}
                  </div>
                  <Link href="/cart" className="rm-text-link mt-3">Update cart<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
                </div>
              </div>
            </section>
          )}

          <div className="mt-5 grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px] xl:gap-7">
            <div className="min-w-0 space-y-5">
              <form ref={formRef} onSubmit={handlePayNow} className="space-y-5">
                {/* Delivery address */}
                <section className="rm-panel overflow-hidden">
                  <header className="rm-panel-header">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--rm-coral-soft)] text-[var(--rm-coral-dark)]">
                        <MapPin className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--rm-coral-dark)]">Step 1 · Address</p>
                        <h2 className="mt-0.5 text-base font-bold text-[var(--rm-ink)]">Where should we deliver?</h2>
                      </div>
                    </div>
                    <span className="hidden rounded-full bg-[var(--rm-surface-muted)] px-3 py-1 text-[10px] font-semibold text-[var(--rm-muted)] sm:inline-flex">Required for delivery rates</span>
                  </header>

                  <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5">
                    <div>
                      <label htmlFor="deliveryRecipient" className="rm-field-label">Recipient full name <span className="text-[var(--rm-coral)]">*</span></label>
                      <input id="deliveryRecipient" name="deliveryRecipient" value={form.deliveryRecipient} onChange={(event) => updateField("deliveryRecipient", event.target.value)} placeholder="Name of the person receiving the order" autoComplete="name" minLength={2} maxLength={100} required className="rm-input" />
                    </div>
                    <div>
                      <label htmlFor="deliveryPhone" className="rm-field-label">Phone number <span className="text-[var(--rm-coral)]">*</span></label>
                      <input id="deliveryPhone" name="deliveryPhone" type="tel" value={form.deliveryPhone} onChange={(event) => updateField("deliveryPhone", event.target.value)} placeholder="08012345678" autoComplete="tel" maxLength={30} pattern="[+]?[0-9() -]{7,30}" required className="rm-input" />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="deliveryAddress" className="rm-field-label">Street address, building or estate <span className="text-[var(--rm-coral)]">*</span></label>
                      <textarea id="deliveryAddress" name="deliveryAddress" value={form.deliveryAddress} onChange={(event) => updateField("deliveryAddress", event.target.value)} placeholder="House number, street name, estate or building" autoComplete="street-address" rows={2} minLength={5} maxLength={300} required className="rm-textarea leading-6" />
                    </div>
                    <div>
                      <label htmlFor="deliveryArea" className="rm-field-label">Area / neighbourhood <span className="text-[var(--rm-coral)]">*</span></label>
                      <input id="deliveryArea" name="deliveryArea" value={form.deliveryArea} onChange={(event) => updateField("deliveryArea", event.target.value)} placeholder="e.g. Ogba, Ikeja" autoComplete="address-level2" minLength={2} maxLength={100} required className="rm-input" />
                    </div>
                    <div>
                      <label htmlFor="deliveryLandmark" className="rm-field-label">Nearby landmark <span className="font-normal text-[var(--rm-muted)]">(optional)</span></label>
                      <input id="deliveryLandmark" name="deliveryLandmark" value={form.deliveryLandmark} onChange={(event) => updateField("deliveryLandmark", event.target.value)} placeholder="e.g. Near a filling station" maxLength={150} className="rm-input" />
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor="deliveryNotes" className="rm-field-label">Delivery instructions <span className="font-normal text-[var(--rm-muted)]">(optional)</span></label>
                      <textarea id="deliveryNotes" name="deliveryNotes" value={form.deliveryNotes} onChange={(event) => updateField("deliveryNotes", event.target.value)} placeholder="Gate instructions or other useful delivery details" rows={2} maxLength={300} className="rm-textarea leading-6" />
                    </div>
                    <div className="sm:col-span-2 flex flex-col gap-3 rounded-lg bg-[var(--rm-surface-muted)] p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-start gap-2">
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--rm-green)]" aria-hidden="true" />
                        <p className="text-xs leading-5 text-[var(--rm-muted)]">Your delivery details are shared with the assigned courier only as required to fulfil this order.</p>
                      </div>
                      <button type="button" onClick={handleGetDeliveryRates} disabled={!validCart || quoting} className="rm-button rm-button-primary min-h-11 shrink-0">
                        {quoting ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Finding delivery options</> : <><Truck className="h-4 w-4" aria-hidden="true" />Get delivery options</>}
                      </button>
                    </div>
                  </div>
                </section>

                {/* Delivery choices */}
                <section className="rm-panel overflow-hidden">
                  <header className="rm-panel-header">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--rm-coral-soft)] text-[var(--rm-coral-dark)]">
                        <Truck className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--rm-coral-dark)]">Step 2 · Delivery service</p>
                        <h2 className="mt-0.5 text-base font-bold text-[var(--rm-ink)]">Choose delivery for each seller</h2>
                        <p className="mt-1 text-xs text-[var(--rm-muted)]">Items from different sellers may arrive in separate packages.</p>
                      </div>
                    </div>
                  </header>

                  {!quote && (
                    <div className="px-5 py-9 text-center sm:px-8">
                      <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[var(--rm-surface-muted)] text-[var(--rm-coral-dark)]">
                        <Package className="h-6 w-6" aria-hidden="true" />
                      </div>
                      <p className="mt-3 text-sm font-bold text-[var(--rm-ink)]">Delivery prices haven’t been calculated yet</p>
                      <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[var(--rm-muted)]">Enter your delivery address above and select “Get delivery options” to see available couriers and prices.</p>
                    </div>
                  )}

                  {quote && (
                    <div className="space-y-4 p-4 sm:p-5">
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--rm-surface-muted)] px-3 py-3">
                        <div>
                          <p className="text-xs font-bold text-[var(--rm-ink)]">Delivery options found</p>
                          <p className="mt-0.5 text-xs text-[var(--rm-muted)]">Choose one service for each seller package.</p>
                        </div>
                        <button type="button" onClick={handleGetDeliveryRates} disabled={quoting} className="rm-text-link disabled:opacity-50">
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />Refresh rates
                        </button>
                      </div>

                      {quote.packages.map((pack, index) => {
                        const group = groups.find((item) => item.businessId === pack.businessId);
                        const selectedKey = selectedRateKeys[pack.businessId] ?? "";
                        return (
                          <section key={pack.businessId} className="overflow-hidden rounded-lg border border-[var(--rm-border)]">
                            <header className="flex items-center justify-between gap-3 border-b border-[var(--rm-border)] bg-[var(--rm-surface-muted)] px-3 py-3 sm:px-4">
                              <div className="flex min-w-0 items-center gap-2.5">
                                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[var(--rm-coral-dark)]">
                                  <Store className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <div className="min-w-0">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--rm-muted)]">Package {index + 1} · Seller</p>
                                  <p className="truncate text-xs font-bold text-[var(--rm-ink)]">{group?.businessName ?? pack.businessName}</p>
                                </div>
                              </div>
                              <span className="shrink-0 text-xs text-[var(--rm-muted)]">{group?.items.reduce((sum, item) => sum + item.quantity, 0) ?? pack.items.length} item(s)</span>
                            </header>

                            <div className="grid gap-2 p-3 sm:grid-cols-2 sm:p-4">
                              {pack.rates.map((rate) => {
                                const key = rateKey(rate);
                                const selected = selectedKey === key;
                                return (
                                  <label
                                    key={key}
                                    className="flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors"
                                    style={{
                                      borderColor: selected ? "var(--rm-coral)" : "var(--rm-border)",
                                      background: selected ? "var(--rm-coral-soft)" : "#fff",
                                    }}
                                  >
                                    <input type="radio" name={`courier-${pack.businessId}`} value={key} checked={selected} onChange={() => selectCourier(pack.businessId, key)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--rm-coral)]" />
                                    <span className="min-w-0 flex-1">
                                      <span className="flex flex-wrap items-center justify-between gap-2">
                                        <span className="text-xs font-bold text-[var(--rm-ink)]">{rate.courierName}</span>
                                        <span className="text-sm font-extrabold text-[var(--rm-coral-dark)]">{formatNaira(rate.amount)}</span>
                                      </span>
                                      {rate.serviceType && <span className="mt-1 block text-xs text-[var(--rm-muted)]">{rate.serviceType}</span>}
                                      <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--rm-muted)]">
                                        <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" aria-hidden="true" />{formatEta(rate.eta)}</span>
                                        {rate.pickupEta && <span>Pickup: {rate.pickupEta}</span>}
                                      </span>
                                      {selected && <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[var(--rm-green)]"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />Selected</span>}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </section>
                        );
                      })}

                      {!quoteMatchesCart && <p role="alert" className="rounded-lg border border-[var(--rm-yellow-bg)] bg-[#fffaf0] px-3 py-2 text-xs text-[var(--rm-yellow)]">Your cart has changed since these rates were calculated. Refresh delivery rates before continuing.</p>}
                      {quoteAlmostExpired && <p className="rounded-lg border border-[var(--rm-yellow-bg)] bg-[#fffaf0] px-3 py-2 text-xs text-[var(--rm-yellow)]">These delivery rates expire soon. Confirm and complete checkout now, or refresh the rates.</p>}
                      {quoteExpired && <p role="alert" className="rounded-lg border border-[var(--rm-red-bg)] bg-[var(--rm-red-bg)] px-3 py-2 text-xs text-[var(--rm-red)]">These delivery rates have expired. Refresh rates to continue.</p>}

                      <div className="flex flex-col gap-3 rounded-lg border border-[var(--rm-border)] p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold text-[var(--rm-ink)]">Selected delivery total</p>
                          <p className="mt-1 text-xl font-extrabold text-[var(--rm-coral-dark)]">{formatNaira(selectedDeliveryFee)}</p>
                          <p className="mt-0.5 text-xs text-[var(--rm-muted)]">One delivery option is charged for each seller package.</p>
                        </div>
                        <button type="button" onClick={handleConfirmDeliveryOptions} disabled={!quoteMatchesCart || !allPackagesSelected || quoteExpired || confirmingRates} className="rm-button rm-button-secondary min-h-11">
                          {confirmingRates ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Saving choices</> : quoteConfirmed ? <><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Delivery confirmed</> : <>Confirm delivery choices<ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                {/* Payment notice */}
                <section className="rounded-xl border p-4 sm:p-5" style={{ borderColor: "#dcebe2", background: "#f5faf7" }}>
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-[var(--rm-green)]">
                      <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold text-[var(--rm-ink)]">Secure payment with Paystack</h2>
                      <p className="mt-1 text-xs leading-5 text-[var(--rm-muted)]">You’ll be redirected to Paystack to pay for all products and selected deliveries in one checkout. ReMarket confirms payment with Paystack before processing your order.</p>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-[var(--rm-muted)]">
                        <span className="rounded-md bg-white px-2.5 py-1">Cards</span>
                        <span className="rounded-md bg-white px-2.5 py-1">Bank transfer</span>
                        <span className="rounded-md bg-white px-2.5 py-1">USSD</span>
                      </div>
                    </div>
                  </div>
                </section>

                {quoteError && <div role="alert" className="rounded-lg border border-[var(--rm-red-bg)] bg-[var(--rm-red-bg)] p-3 text-xs leading-5 text-[var(--rm-red)]">{quoteError}</div>}
                {submitError && <div role="alert" className="rounded-lg border border-[var(--rm-red-bg)] bg-[var(--rm-red-bg)] p-3 text-xs leading-5 text-[var(--rm-red)]">{submitError}</div>}
              </form>
            </div>

            {/* Order summary */}
            <aside className="min-w-0 lg:sticky lg:top-24">
              <section className="rm-panel overflow-hidden">
                <header className="rm-panel-header">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--rm-coral-dark)]">Order summary</p>
                    <h2 className="mt-0.5 text-base font-bold text-[var(--rm-ink)]">Your items</h2>
                  </div>
                  <span className="rounded-full bg-[var(--rm-coral-soft)] px-2.5 py-1 text-xs font-bold text-[var(--rm-coral-dark)]">{itemCount} items</span>
                </header>

                <div className="max-h-[420px] space-y-4 overflow-y-auto p-4">
                  {groups.map((group) => (
                    <section key={group.businessId} className="overflow-hidden rounded-lg border border-[var(--rm-border)]">
                      <div className="flex items-center gap-2 border-b border-[var(--rm-border)] bg-[var(--rm-surface-muted)] px-3 py-2.5">
                        <Store className="h-3.5 w-3.5 shrink-0 text-[var(--rm-coral-dark)]" aria-hidden="true" />
                        <p className="min-w-0 flex-1 truncate text-xs font-bold text-[var(--rm-ink)]">{group.businessName}</p>
                        <span className="text-[10px] text-[var(--rm-muted)]">{group.items.length} product(s)</span>
                      </div>
                      <div className="divide-y divide-[var(--rm-border)] px-3">
                        {group.items.map((item) => {
                          const oldLine = item.originalPrice !== null ? item.originalPrice * item.quantity : null;
                          const showOld = oldLine !== null && Number.isSafeInteger(oldLine) && oldLine > (item.lineTotal ?? 0);
                          return (
                            <div key={item.id} className="flex gap-3 py-3">
                              <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--rm-border)] bg-[var(--rm-surface-muted)]">
                                {item.imageUrl ? <img src={item.imageUrl} alt={item.name} loading="lazy" className="h-full w-full object-cover" /> : <Package className="h-5 w-5 text-[var(--rm-subtle)]" aria-hidden="true" />}
                                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-white bg-[var(--rm-coral)] px-1 text-[9px] font-bold text-white">{item.quantity}</span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-2 text-xs font-semibold leading-4 text-[var(--rm-ink)]">{item.name}</p>
                                <p className="mt-1 text-[11px] text-[var(--rm-muted)]">Qty {item.quantity}</p>
                                <div className="mt-1 flex items-center justify-between gap-2">
                                  <span className="text-[11px] text-[var(--rm-muted)]">{item.unitPrice !== null ? `${formatNaira(item.unitPrice)} each` : "Price unavailable"}</span>
                                  <span className="text-xs font-bold text-[var(--rm-ink)]">{item.lineTotal !== null ? formatNaira(item.lineTotal) : "—"}</span>
                                </div>
                                {showOld && <p className="text-right text-[10px] text-[var(--rm-subtle)] line-through">{formatNaira(oldLine!)}</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>

                <div className="border-t border-[var(--rm-border)] p-4 sm:p-5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-[var(--rm-muted)]">Products subtotal</span>
                      <span className="font-bold text-[var(--rm-ink)]">{formatNaira(subtotal)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-[var(--rm-muted)]">Delivery</span>
                      <span className="font-bold text-[var(--rm-ink)]">{quote && allPackagesSelected ? formatNaira(selectedDeliveryFee) : "Choose options"}</span>
                    </div>
                  </div>
                  <div className="my-4 h-px bg-[var(--rm-border)]" />
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--rm-muted)]">Total to pay</p>
                      <p className="mt-1 text-2xl font-extrabold tracking-tight text-[var(--rm-coral-dark)]">{quote && allPackagesSelected ? formatNaira(displayedTotal) : formatNaira(subtotal)}</p>
                    </div>
                    <span className="mb-1 rounded-md bg-[var(--rm-surface-muted)] px-2.5 py-1 text-[10px] font-bold text-[var(--rm-muted)]">NGN</span>
                  </div>
                  {!quoteConfirmed && <p className="mt-2 text-xs leading-5 text-[var(--rm-muted)]">{quote ? "Confirm each seller’s delivery service to calculate your final amount." : "Delivery charges are not included yet. Get delivery options to calculate the final total."}</p>}
                  {quoteConfirmed && <p className="mt-2 text-xs leading-5 text-[var(--rm-green)]">Delivery selections confirmed. This is the amount that will be sent to Paystack.</p>}

                  <button type="button" onClick={() => formRef.current?.requestSubmit()} disabled={!canSubmitPayment} className="rm-button rm-button-primary mt-5 min-h-12 w-full">
                    {submitting ? <><LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />Connecting to Paystack</> : <><CreditCard className="h-4 w-4" aria-hidden="true" />Pay securely with Paystack<ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
                  </button>

                  {!validCart && <p className="mt-2 text-center text-xs leading-5 text-[var(--rm-red)]">Resolve unavailable products before checkout.</p>}
                  {validCart && !quote && <p className="mt-2 text-center text-xs leading-5 text-[var(--rm-muted)]">Enter your address and get delivery options to continue.</p>}
                  {quote && !quoteConfirmed && <p className="mt-2 text-center text-xs leading-5 text-[var(--rm-muted)]">Confirm your delivery choices before payment.</p>}
                  <div className="mt-4 flex items-start gap-2 rounded-lg bg-[var(--rm-surface-muted)] p-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--rm-green)]" aria-hidden="true" />
                    <p className="text-xs leading-5 text-[var(--rm-muted)]">Your payment is processed on Paystack. ReMarket never receives or stores your card PIN or full card details.</p>
                  </div>
                  <Link href="/cart" className="rm-button rm-button-quiet mt-3 w-full">
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to cart
                  </Link>
                </div>
              </section>
            </aside>
          </div>

          {/* Mobile fixed summary/action bar */}
          <div className="fixed inset-x-0 bottom-[64px] z-30 border-t border-[var(--rm-border)] bg-white px-4 py-3 shadow-[0_-6px_18px_rgba(23,32,42,0.07)] lg:hidden">
            <div className="mx-auto flex max-w-3xl items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold text-[var(--rm-muted)]">{quoteConfirmed ? "Total to pay" : "Products subtotal"}</p>
                <p className="truncate text-lg font-extrabold text-[var(--rm-coral-dark)]">{formatNaira(quoteConfirmed ? displayedTotal : subtotal)}</p>
              </div>
              <button type="button" onClick={() => formRef.current?.requestSubmit()} disabled={!canSubmitPayment} className="rm-button rm-button-primary min-h-11 min-w-[158px]">
                {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CreditCard className="h-4 w-4" aria-hidden="true" />}
                {submitting ? "Connecting…" : "Pay with Paystack"}
              </button>
            </div>
          </div>

          <footer className="mt-10 hidden items-center justify-center gap-3 pb-4 text-xs text-[var(--rm-subtle)] lg:flex">
            <span className="h-px w-12 bg-[var(--rm-border)]" />
            <span>ReMarket · Find it nearby</span>
            <span className="h-px w-12 bg-[var(--rm-border)]" />
          </footer>
        </div>
      </main>
      <MobileBottomNav />
    </>
  );
}
