"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import ProductImageUpload from "@/components/ProductImageUpload";
import NotificationBell from "@/components/NotificationBell";
import AreaAutocomplete, { type AreaSelection } from "@/components/filters/AreaAutocomplete";
import {
  Store, MapPin, ChevronDown, Phone, Package, LogOut, ExternalLink,
  LoaderCircle, Plus, CheckCircle2, AlertCircle, Pencil, X, Trash2,
  AlertTriangle, UserRound, ShieldCheck, Share2, Copy, ArrowRight,
  Circle, ClipboardCheck, LockKeyhole, Globe, RefreshCw, Bookmark, Search, BarChart3,
} from "lucide-react";

const MAX_ACTIVE_PRODUCTS = 100;
const MAX_PRISMA_INT = 2_147_483_647;
const DEFAULT_COUNTRY = "Nigeria";

type Availability = "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
type RecordStatus = "ACTIVE" | "INACTIVE" | "PENDING";
type VerificationStatus = "VERIFIED" | "UNVERIFIED";
type SocialPlatform = "WHATSAPP" | "INSTAGRAM" | "TIKTOK" | "FACEBOOK" | "PHONE" | "DIRECTIONS";
type SharePlatform = "WHATSAPP" | "FACEBOOK" | "LINKEDIN" | "X";
type SellerCategory = {
  id: string;
  name: string;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  imageUrl?: string | null;
};
type SellerCategoryNode = SellerCategory & { children: SellerCategoryNode[] };
type SellerSocialLink = { id: string; platform: SocialPlatform; handle: string };
type SellerProductImage = { id: string; url: string; publicId: string | null; sortOrder: number };
type SellerProduct = {
  id: string; name: string; description: string | null;
  price: number | null; originalPrice: number | null;
  availability: Availability; stockQuantity: number | null;
  shippingWeightKg?: number | null; shippingLengthCm?: number | null;
  shippingWidthCm?: number | null; shippingHeightCm?: number | null;
  imageUrl: string | null; images: SellerProductImage[];
  status: RecordStatus; deletedAt: string | null;
  category: (SellerCategory & { parent?: SellerCategory | null }) | null;
};
type SellerBusiness = {
  id: string; name: string; ownerName: string | null; description: string | null;
  status: RecordStatus; verification: VerificationStatus; availability: Availability;
  phone: string | null; imageUrl: string | null; socialLinks: SellerSocialLink[];
  deletedAt: string | null;
  showContactInfo?: boolean;
  location: { id: string; area: string; address: string | null; verification: VerificationStatus } | null;
  categories: { category: SellerCategory }[];
  products: SellerProduct[];
};
type DeletionRequest = {
  id: string; businessId: string; reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewedAt: string | null; createdAt: string; updatedAt: string;
};
type BusinessForm = {
  name: string; ownerName: string; description: string; area: string;
  houseNumber: string; street: string; city: string; categoryId: string;
  availability: Availability; showContactInfo: boolean;
};
type ProductForm = {
  name: string; description: string; categoryId: string; price: string;
  originalPrice: string; availability: Availability; stockQuantity: string; images: string[];
  shippingWeightKg: string; shippingLengthCm: string; shippingWidthCm: string; shippingHeightCm: string;
};
type ProductCapacity = { maxActiveProducts: number; baseMaxActiveProducts: number; referralBonusSlots: number };
type ApiBusinessResponse = { business?: SellerBusiness | null; error?: unknown };
type ApiCategoriesResponse = { categories?: unknown; navigationCategories?: unknown };
type ApiDeletionResponse = { request?: DeletionRequest | null; error?: unknown };
type ApiErrorResponse = { error?: unknown };
type ApiSellerProductsResponse = {
  products?: SellerProduct[]; maxActiveProducts?: unknown;
  baseMaxActiveProducts?: unknown; referralBonusSlots?: unknown; error?: unknown;
};
type OrderItem = {
  id: string; productId: string | null; productName: string;
  productImageUrl: string | null; unitPrice: number; quantity: number; lineTotal: number;
};
type SellerShipment = {
  id: string;
  providerOrderId?: string | null;
  status: string;
  courierName?: string | null;
  trackingCode?: string | null;
  trackingUrl?: string | null;
  waybillUrl?: string | null;
  estimatedDelivery?: string | null;
  shippingFee?: number;
  currency?: string;
  bookedAt?: string | null;
  pickedUpAt?: string | null;
  inTransitAt?: string | null;
  deliveredAt?: string | null;
  failureReason?: string | null;
};
type SellerOrder = {
  id: string; sellerOrderCode: string; status: string; subtotal: number; createdAt: string;
  order: {
    id: string; orderCode: string; status: string; deliveryRecipient: string;
    deliveryPhone: string; deliveryAddress: string; deliveryArea: string;
    deliveryNotes: string | null;
    paymentVerified?: boolean;
    buyer?: { id: string; name: string | null };
  };
  items: OrderItem[];
  shipment?: SellerShipment | null;
  shipments?: SellerShipment[];
};
type SellerDashboardData = {
  hasBusiness?: boolean;
  listings?: { products?: { total?: number; active?: number } };
  inventory?: {
    trackedProducts?: number; untrackedProducts?: number; inStockProducts?: number;
    outOfStockProducts?: number; totalTrackedUnits?: number;
  };
  orders?: {
    total?: number; pendingAcceptance?: number; accepted?: number;
    processing?: number; readyForDispatch?: number; completed?: number;
  };
  recentOrders?: SellerOrder[];
};

const SOCIAL_PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: "WHATSAPP", label: "WhatsApp" }, { value: "INSTAGRAM", label: "Instagram" },
  { value: "TIKTOK", label: "TikTok" }, { value: "FACEBOOK", label: "Facebook" },
  { value: "PHONE", label: "Phone" }, { value: "DIRECTIONS", label: "Directions" },
];
const INITIAL_BUSINESS_FORM: BusinessForm = {
  name: "", ownerName: "", description: "", area: "", houseNumber: "", street: "",
  city: "", categoryId: "", availability: "ASK_SELLER",
  showContactInfo: false,
};
const INITIAL_PRODUCT_FORM: ProductForm = {
  name: "", description: "", categoryId: "", price: "", originalPrice: "",
  availability: "ASK_SELLER", stockQuantity: "", images: [],
  shippingWeightKg: "", shippingLengthCm: "", shippingWidthCm: "", shippingHeightCm: "",
};
const INITIAL_SOCIAL_VALUES: Record<SocialPlatform, string> = {
  WHATSAPP: "", INSTAGRAM: "", TIKTOK: "", FACEBOOK: "", PHONE: "", DIRECTIONS: "",
};
const inputClass = "rm-input h-12";
const labelClass = "rm-field-label mb-2";
const secondaryButtonClass = "rm-button rm-button-secondary min-h-10";
const primaryButtonClass = "rm-button rm-button-primary min-h-10";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function readJsonSafely<T>(response: Response): Promise<T | null> {
  try { return (await response.json()) as T; } catch { return null; }
}
function getResponseError(data: unknown, fallback: string): string {
  return isRecord(data) && typeof data.error === "string" && data.error.trim() ? data.error : fallback;
}
function parseProductCapacity(data: unknown): ProductCapacity | null {
  if (!isRecord(data)) return null;
  const { maxActiveProducts, baseMaxActiveProducts, referralBonusSlots } = data;
  if (typeof maxActiveProducts !== "number" || !Number.isSafeInteger(maxActiveProducts) || maxActiveProducts < 0 ||
      typeof baseMaxActiveProducts !== "number" || !Number.isSafeInteger(baseMaxActiveProducts) || baseMaxActiveProducts < 0 ||
      typeof referralBonusSlots !== "number" || !Number.isSafeInteger(referralBonusSlots) || referralBonusSlots < 0 ||
      baseMaxActiveProducts + referralBonusSlots !== maxActiveProducts) return null;
  return { maxActiveProducts, baseMaxActiveProducts, referralBonusSlots };
}
function getSocialValue(links: SellerSocialLink[] | undefined, platform: SocialPlatform): string {
  return links?.find((link) => link.platform === platform)?.handle ?? "";
}
function getSocialValues(links: SellerSocialLink[] | undefined, fallbackPhone?: string | null): Record<SocialPlatform, string> {
  return {
    WHATSAPP: getSocialValue(links, "WHATSAPP"), INSTAGRAM: getSocialValue(links, "INSTAGRAM"),
    TIKTOK: getSocialValue(links, "TIKTOK"), FACEBOOK: getSocialValue(links, "FACEBOOK"),
    PHONE: getSocialValue(links, "PHONE") || fallbackPhone?.trim() || "",
    DIRECTIONS: getSocialValue(links, "DIRECTIONS"),
  };
}
function buildSocialLinks(values: Record<SocialPlatform, string>) {
  return SOCIAL_PLATFORMS.map(({ value }) => ({ platform: value, handle: values[value].trim() })).filter((item) => item.handle);
}
function looksLikeHouseNumber(value: string): boolean {
  const s = value.trim().toLowerCase();
  return Boolean(s) && (/^\d+[a-z]?\b/.test(s) || /^(shop|house|building|block|plot|suite|unit|flat)\b/.test(s));
}
function parseLocationAddress(address: string | null | undefined, area: string) {
  const trimmed = typeof address === "string" ? address.trim() : "";
  if (!trimmed) return { houseNumber: "", street: "", city: "" };
  const parts = trimmed.split(",").map((p) => p.trim()).filter(Boolean);
  const withoutCountry = parts.at(-1)?.toLowerCase() === DEFAULT_COUNTRY.toLowerCase() ? parts.slice(0, -1) : parts;
  let areaIndex = -1;
  withoutCountry.forEach((part, i) => { if (area.trim() && part.toLowerCase() === area.trim().toLowerCase()) areaIndex = i; });
  if (areaIndex < 0) return { houseNumber: "", street: withoutCountry.join(", "), city: "" };
  const beforeArea = withoutCountry.slice(0, areaIndex);
  const city = withoutCountry.slice(areaIndex + 1).join(", ");
  if (!beforeArea.length) return { houseNumber: "", street: "", city };
  if (beforeArea.length === 1) return { houseNumber: "", street: beforeArea[0], city };
  if (looksLikeHouseNumber(beforeArea[0])) return { houseNumber: beforeArea[0], street: beforeArea.slice(1).join(", "), city };
  return { houseNumber: "", street: beforeArea.join(", "), city };
}
function buildLocationAddressPreview(area: string, houseNumber: string, street: string, city: string): string {
  return [houseNumber.trim(), street.trim(), area.trim(), city.trim(), DEFAULT_COUNTRY].filter(Boolean).join(", ");
}
function getInitialBusinessForm(business: SellerBusiness): BusinessForm {
  const parsed = parseLocationAddress(business.location?.address, business.location?.area ?? "");
  return {
    name: business.name ?? "", ownerName: business.ownerName ?? "", description: business.description ?? "",
    area: business.location?.area ?? "", houseNumber: parsed.houseNumber, street: parsed.street, city: parsed.city,
    categoryId: business.categories?.[0]?.category?.id ?? "", availability: business.availability ?? "ASK_SELLER",
    showContactInfo: business.showContactInfo === true,
  };
}
function getStatusClasses(status: string): string {
  if (["ACTIVE", "ACCEPTED", "PROCESSING", "READY_FOR_DISPATCH", "DISPATCHED", "DELIVERED", "COMPLETED", "IN_PROGRESS", "CONFIRMED", "COURIER_ASSIGNED", "AWAITING_PICKUP", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(status)) return "bg-[var(--rm-green-bg)] text-[var(--rm-green)]";
  if (["PENDING", "PENDING_ACCEPTANCE", "AWAITING_BUYER", "BOOKING_PENDING"].includes(status)) return "bg-[var(--rm-yellow-bg)] text-[var(--rm-yellow)]";
  if (status === "APPROVED" || status === "VERIFIED") return "bg-[#E7F0FF] text-[#3566B8]";
  return "bg-[var(--rm-red-bg)] text-[var(--rm-red)]";
}
function formatAvailability(value: Availability): string {
  return value === "AVAILABLE" ? "Available" : value === "UNAVAILABLE" ? "Unavailable" : "Ask seller";
}
function formatNaira(value: number): string {
  return `₦${value.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}
function safeCount(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
function getSellerOrderActions(status: string) {
  switch (status) {
    case "PENDING_ACCEPTANCE": return [{ status: "ACCEPTED", label: "Accept order" }];
    case "ACCEPTED": return [{ status: "PROCESSING", label: "Start preparing" }];
    case "PROCESSING": return [{ status: "READY_FOR_DISPATCH", label: "Mark ready" }];
    // Shipbubble booking and courier webhooks control dispatch and delivery.
    case "READY_FOR_DISPATCH":
    case "DISPATCHED":
    case "DELIVERED":
    default: return [];
  }
}
function getSafeExternalUrl(value: string | null | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function parseCategoryTree(payload: unknown): SellerCategoryNode[] {
  if (!isRecord(payload)) return [];
  const rawItems: Record<string, unknown>[] = [];
  const source = Array.isArray(payload.categories) ? payload.categories : payload.navigationCategories;
  if (!Array.isArray(source)) return [];
  const flatten = (items: unknown[], inheritedParentId: string | null = null, depth = 0) => {
    for (const raw of items) {
      if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.name !== "string") continue;
      const parentId = typeof raw.parentId === "string" ? raw.parentId : inheritedParentId;
      rawItems.push({ ...raw, parentId });
      if (depth === 0 && Array.isArray(raw.children)) flatten(raw.children, raw.id, 1);
    }
  };
  flatten(source);
  const nodes = new Map<string, SellerCategoryNode>();
  for (const item of rawItems) {
    if (item.isActive === false) continue;
    const id = typeof item.id === "string" ? item.id : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    if (!id || !name || nodes.has(id)) continue;
    nodes.set(id, {
      id, name,
      parentId: typeof item.parentId === "string" ? item.parentId : null,
      sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : 0,
      isActive: item.isActive !== false,
      imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : null,
      children: [],
    });
  }
  const roots: SellerCategoryNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent && !parent.parentId && parent.id !== node.id) parent.children.push(node);
    else if (!node.parentId || !parent) roots.push(node);
  }
  const sortTree = (items: SellerCategoryNode[]) => {
    items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
    items.forEach((item) => sortTree(item.children));
  };
  sortTree(roots);
  return roots;
}

function SellerCommerceOverview() {
  const [dashboard, setDashboard] = useState<SellerDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [updatingOrderId, setUpdatingOrderId] = useState("");
  const [bookingShipmentOrderId, setBookingShipmentOrderId] = useState("");
  const loadDashboard = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true); else setRefreshing(true);
    setLoadError("");
    try {
      const response = await fetch("/api/seller/dashboard", { cache: "no-store" });
      const payload: unknown = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) throw new Error("Your seller session has expired. Please sign in again.");
      if (!response.ok) throw new Error(getResponseError(payload, "Unable to load inventory and orders."));
      if (!isRecord(payload) || payload.hasBusiness !== true) throw new Error("The seller dashboard response was invalid.");
      setDashboard(payload as SellerDashboardData);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Unable to load inventory and orders.");
    } finally { setLoading(false); setRefreshing(false); }
  }, []);
  useEffect(() => { void loadDashboard(true); }, [loadDashboard]);
  async function updateSellerOrder(order: SellerOrder, nextStatus: string) {
    if (updatingOrderId || bookingShipmentOrderId) return;
    setUpdatingOrderId(order.id); setActionError(""); setActionMessage("");
    try {
      const response = await fetch(`/api/seller/orders/${encodeURIComponent(order.id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: nextStatus }),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(getResponseError(payload, "Unable to update this order."));
      setActionMessage(`${order.sellerOrderCode} updated to ${nextStatus.replace(/_/g, " ").toLowerCase()}.`);
      await loadDashboard(false);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to update this order.");
    } finally { setUpdatingOrderId(""); }
  }
  async function bookSellerShipment(order: SellerOrder) {
    if (updatingOrderId || bookingShipmentOrderId || order.status !== "READY_FOR_DISPATCH") return;
    setBookingShipmentOrderId(order.id); setActionError(""); setActionMessage("");
    try {
      const response = await fetch(`/api/seller/orders/${encodeURIComponent(order.id)}/shipments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("Your seller session is no longer authorised. Sign in again and retry.");
        }
        throw new Error(getResponseError(payload, "Unable to book Shipbubble delivery."));
      }
      const root = isRecord(payload) ? payload : {};
      const rawShipment = isRecord(root.shipment) ? root.shipment : null;
      const shipment: SellerShipment | null = rawShipment && typeof rawShipment.id === "string" && typeof rawShipment.status === "string"
        ? {
            id: rawShipment.id,
            providerOrderId: typeof rawShipment.providerOrderId === "string" ? rawShipment.providerOrderId : null,
            status: rawShipment.status,
            courierName: typeof rawShipment.courierName === "string" ? rawShipment.courierName : null,
            trackingCode: typeof rawShipment.trackingCode === "string" ? rawShipment.trackingCode : null,
            trackingUrl: typeof rawShipment.trackingUrl === "string" ? rawShipment.trackingUrl : null,
            waybillUrl: typeof rawShipment.waybillUrl === "string" ? rawShipment.waybillUrl : null,
            estimatedDelivery: typeof rawShipment.estimatedDelivery === "string" ? rawShipment.estimatedDelivery : null,
          }
        : null;
      const details = [
        shipment?.courierName,
        shipment?.trackingCode ? `Tracking code: ${shipment.trackingCode}` : null,
      ].filter(Boolean).join(" · ");
      setActionMessage(`${order.sellerOrderCode}: ${typeof root.message === "string" ? root.message : "Shipbubble delivery booked successfully."}${details ? ` ${details}` : ""}`);
      await loadDashboard(false);
      // The dashboard endpoint returns saved shipments. Merge the immediate
      // booking response too, so the tracking details appear without waiting
      // for another refresh or depending on response timing.
      if (shipment) {
        setDashboard((current) => current ? {
          ...current,
          recentOrders: (current.recentOrders ?? []).map((item) => item.id === order.id
            ? {
                ...item,
                shipment,
                shipments: [
                  shipment,
                  ...(item.shipments ?? []).filter((existing) => existing.id !== shipment.id),
                ],
              }
            : item),
        } : current);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to book Shipbubble delivery.");
    } finally { setBookingShipmentOrderId(""); }
  }
  const products = dashboard?.listings?.products ?? {};
  const inventory = dashboard?.inventory ?? {};
  const orders = dashboard?.orders ?? {};
  const recentOrders = Array.isArray(dashboard?.recentOrders) ? dashboard.recentOrders : [];
  const activeWork = safeCount(orders.accepted) + safeCount(orders.processing) + safeCount(orders.readyForDispatch);
  return (
    <section id="orders-section" className="rm-panel mt-5 scroll-mt-24 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[var(--rm-border)] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--rm-coral)]">Product operations</p><h2 className="mt-1 text-lg font-bold">Inventory and orders</h2><p className="mt-1 text-xs leading-5 text-gray-500">Monitor your stock and manage orders received from customers.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/seller/orders" className={secondaryButtonClass}><ClipboardCheck className="h-4 w-4" /> View all orders <ArrowRight className="h-4 w-4" /></Link>
          <button type="button" onClick={() => void loadDashboard(false)} disabled={loading || refreshing} className={secondaryButtonClass}><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh</button>
        </div>
      </div>
      <div className="p-5 sm:p-6">
        {(actionError || actionMessage) && <p role={actionError ? "alert" : "status"} className={`mb-4 rounded-xl px-3 py-2.5 text-xs ${actionError ? "border border-[#F1D5D0] bg-[var(--rm-red-bg)] text-[var(--rm-red)]" : "border border-[#BDE8D8] bg-[var(--rm-green-bg)] text-[var(--rm-green)]"}`}>{actionError || actionMessage}</p>}
        {loadError && !loading && <div role="alert" className="mb-4 rounded-xl border border-[#F1D5D0] bg-[var(--rm-red-bg)] px-4 py-3 text-xs leading-5 text-[var(--rm-red)]">{loadError}<button type="button" onClick={() => void loadDashboard(true)} className="ml-2 font-bold underline">Try again</button></div>}
        {loading ? <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500"><LoaderCircle className="h-5 w-5 animate-spin text-[var(--rm-coral)]" /> Loading inventory and orders...</div> : !dashboard ? <p className="rounded-xl bg-[var(--rm-surface-muted)] px-4 py-8 text-center text-xs text-gray-500">Inventory and order information is not available right now.</p> : <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <OverviewCard icon={<Package className="h-4 w-4" />} title="Products" value={`${safeCount(products.active)} / ${safeCount(products.total)}`} detail="Active listings" />
            <OverviewCard icon={<ClipboardCheck className="h-4 w-4" />} title="Tracked products" value={String(safeCount(inventory.trackedProducts))} detail={`${safeCount(inventory.untrackedProducts)} not tracking stock`} />
            <OverviewCard icon={<Package className="h-4 w-4" />} title="Units in stock" value={safeCount(inventory.totalTrackedUnits).toLocaleString("en-NG")} detail={`${safeCount(inventory.inStockProducts)} products have stock`} />
            <OverviewCard icon={<AlertCircle className="h-4 w-4" />} title="Out of stock" value={String(safeCount(inventory.outOfStockProducts))} detail="Tracked products with zero units" />
            <OverviewCard icon={<ClipboardCheck className="h-4 w-4" />} title="Total orders" value={String(safeCount(orders.total))} detail={`${safeCount(orders.pendingAcceptance)} awaiting your response`} />
            <OverviewCard icon={<CheckCircle2 className="h-4 w-4" />} title="Completed" value={String(safeCount(orders.completed))} detail={`${activeWork} orders in progress`} />
          </div>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-bold">Recent product orders</h3><p className="mt-1 text-[11px] text-gray-500">Review each order and move it through fulfilment.</p></div><span className="text-[11px] text-gray-400">Showing the latest {recentOrders.length} orders</span></div>
          {!recentOrders.length ? <div className="mt-4 rounded-2xl border border-dashed border-[var(--rm-border-strong)] bg-[var(--rm-surface-muted)] px-5 py-9 text-center"><Package className="mx-auto h-8 w-8 text-gray-300" /><h4 className="mt-3 text-sm font-bold text-gray-800">No product orders yet</h4><p className="mt-1 text-xs leading-5 text-gray-500">New customer orders will appear here.</p></div> : <div className="mt-4 grid gap-3">
            {recentOrders.map((order) => {
              const paymentPending = order.order?.paymentVerified !== true;
              const actions = paymentPending ? [] : getSellerOrderActions(order.status);
              const isUpdating = updatingOrderId === order.id;
              const isBookingShipment = bookingShipmentOrderId === order.id;
              const shipment = order.shipment ?? order.shipments?.find((item) => Boolean(item.providerOrderId)) ?? order.shipments?.[0] ?? null;
              const hasBookedShipment = Boolean(shipment?.providerOrderId);
              const bookingIsPending = shipment?.status === "BOOKING_PENDING";
              const shipmentFailed = shipment?.status === "FAILED";
              const trackingUrl = getSafeExternalUrl(shipment?.trackingUrl);
              const waybillUrl = getSafeExternalUrl(shipment?.waybillUrl);
              const buyerName = order.order?.buyer?.name || order.order?.deliveryRecipient || "Customer";
              const items = Array.isArray(order.items) ? order.items : [];
              return <article key={order.id} className="rounded-2xl border border-[var(--rm-border)] bg-white p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h4 className="break-all text-sm font-bold text-[var(--rm-ink)]">{order.sellerOrderCode}</h4><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${getStatusClasses(order.status)}`}>{order.status.replace(/_/g, " ")}</span></div><p className="mt-1 text-[11px] text-gray-500">Parent order: {order.order?.orderCode || "Unavailable"}</p><p className="mt-1 text-[11px] text-gray-400">{new Date(order.createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" })}</p></div><div className="sm:text-right"><p className="text-sm font-bold text-[var(--rm-coral-dark)]">{formatNaira(safeCount(order.subtotal))}</p><p className="mt-1 text-[10px] text-gray-400">{items.length} {items.length === 1 ? "line item" : "line items"}</p></div></div>
                <div className="mt-3 grid gap-3 rounded-xl bg-[var(--rm-surface-muted)] p-3 sm:grid-cols-2"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Customer</p><p className="mt-1 text-xs font-bold text-gray-800">{buyerName}</p><p className="mt-1 break-words text-[11px] leading-5 text-gray-500">{order.order?.deliveryArea || "Delivery area not supplied"}</p></div><div><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Delivery address</p><p className="mt-1 break-words text-[11px] leading-5 text-gray-600">{order.order?.deliveryAddress || "Address not supplied"}</p>{order.order?.deliveryPhone && <p className="mt-1 text-[11px] text-gray-500">Phone: {order.order.deliveryPhone}</p>}</div></div>
                {items.length > 0 && <div className="mt-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Ordered products</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{items.slice(0, 4).map((item) => <div key={item.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-[var(--rm-border)] px-3 py-2.5"><div className="min-w-0"><p className="break-words text-xs font-semibold text-gray-800">{item.productName}</p><p className="mt-0.5 text-[10px] text-gray-400">Qty: {item.quantity}</p></div><p className="shrink-0 text-xs font-bold text-gray-700">{formatNaira(safeCount(item.lineTotal))}</p></div>)}</div>{items.length > 4 && <p className="mt-2 text-[10px] text-gray-400">And {items.length - 4} more product line(s).</p>}</div>}
                {order.order?.deliveryNotes && <p className="mt-3 rounded-xl border border-[var(--rm-border)] px-3 py-2 text-[11px] leading-5 text-gray-500">Delivery note: {order.order.deliveryNotes}</p>}
                {shipment && <div className="mt-3 rounded-xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">Shipbubble delivery</p><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${getStatusClasses(shipment.status)}`}>{shipment.status.replace(/_/g, " ")}</span></div>{shipment.courierName && <p className="mt-2 text-xs font-semibold text-gray-800">{shipment.courierName}</p>}{shipment.trackingCode && <p className="mt-1 text-[11px] text-gray-500">Tracking code: <span className="font-semibold text-gray-700">{shipment.trackingCode}</span></p>}<div className="mt-2 flex flex-wrap gap-3">{trackingUrl && <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--rm-coral-dark)] underline">Track parcel <ExternalLink className="h-3 w-3" /></a>}{waybillUrl && <a href={waybillUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-bold text-[var(--rm-coral-dark)] underline">Waybill <ExternalLink className="h-3 w-3" /></a>}</div></div>}
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--rm-border)] pt-3">
                  {actions.map((action) => <button key={action.status} type="button" disabled={Boolean(updatingOrderId || bookingShipmentOrderId)} onClick={() => void updateSellerOrder(order, action.status)} className={primaryButtonClass}>{isUpdating && <LoaderCircle className="h-4 w-4 animate-spin" />}{action.label}</button>)}
                  {paymentPending && <span className="text-[11px] leading-5 text-[var(--rm-yellow)]">Waiting for verified Paystack payment. Seller fulfilment is not available yet.</span>}
                  {!paymentPending && order.status === "READY_FOR_DISPATCH" && !hasBookedShipment && !bookingIsPending && <button type="button" disabled={Boolean(updatingOrderId || bookingShipmentOrderId)} onClick={() => void bookSellerShipment(order)} className={primaryButtonClass}>{isBookingShipment ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}{isBookingShipment ? "Booking delivery..." : shipmentFailed ? "Retry delivery booking" : "Book Shipbubble delivery"}</button>}
                  {!paymentPending && order.status === "READY_FOR_DISPATCH" && hasBookedShipment && <span className="text-[11px] font-semibold text-[var(--rm-green)]">Courier booked. Dispatch and delivery status will update from Shipbubble.</span>}
                  {!paymentPending && order.status === "READY_FOR_DISPATCH" && bookingIsPending && <span className="text-[11px] leading-5 text-[var(--rm-yellow)]">Shipment booking is being reconciled. Do not submit another booking; contact an administrator if this remains unresolved.</span>}
                  {!paymentPending && order.status === "PENDING_ACCEPTANCE" && <span className="text-[11px] leading-5 text-gray-500">Need to decline this paid order? Contact ReMarket support; seller rejection is disabled until refunds are handled safely.</span>}
                  {!paymentPending && order.status === "DISPATCHED" && <span className="text-[11px] text-gray-500">Courier has collected the parcel. Delivery confirmation will come from Shipbubble.</span>}
                  {!paymentPending && order.status === "DELIVERED" && <span className="text-[11px] font-semibold text-[var(--rm-green)]">Delivery confirmed by Shipbubble.</span>}
                  {!paymentPending && !actions.length && order.status !== "READY_FOR_DISPATCH" && order.status !== "DISPATCHED" && order.status !== "DELIVERED" && order.status !== "PENDING_ACCEPTANCE" && <p className="text-[11px] text-gray-400">No further seller actions are available for this order.</p>}
                </div>
              </article>;
            })}
          </div>}
        </>}
      </div>
    </section>
  );
}

export default function SellerDashboard() {
  const router = useRouter();
  const businessEditorRef = useRef<HTMLElement | null>(null);
  const [business, setBusiness] = useState<SellerBusiness | null>(null);
  const [productCapacity, setProductCapacity] = useState<ProductCapacity>({ maxActiveProducts: MAX_ACTIVE_PRODUCTS, baseMaxActiveProducts: MAX_ACTIVE_PRODUCTS, referralBonusSlots: 0 });
  const [businessCategories, setBusinessCategories] = useState<SellerCategoryNode[]>([]);
  const [productCategories, setProductCategories] = useState<SellerCategoryNode[]>([]);
  const [deletionRequest, setDeletionRequest] = useState<DeletionRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashboardLoadFailed, setDashboardLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [redirecting, setRedirecting] = useState(false);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [updatingProduct, setUpdatingProduct] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [submittingDeletionRequest, setSubmittingDeletionRequest] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [showDeletionForm, setShowDeletionForm] = useState(false);
  const [deletionReason, setDeletionReason] = useState("");
  const [categoryChanged, setCategoryChanged] = useState(false);
  const [socialValues, setSocialValues] = useState(INITIAL_SOCIAL_VALUES);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [businessForm, setBusinessForm] = useState(INITIAL_BUSINESS_FORM);
  const [productForm, setProductForm] = useState(INITIAL_PRODUCT_FORM);
  const [productSearch, setProductSearch] = useState("");
  const [showShareOptions, setShowShareOptions] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const [shareNoticeIsError, setShareNoticeIsError] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const dashboardProducts = useMemo(() => business?.products?.filter((product) => !product.deletedAt) ?? [], [business?.products]);
  const filteredDashboardProducts = useMemo(() => {
    const query = productSearch.trim().toLocaleLowerCase();
    if (!query) return dashboardProducts;
    return dashboardProducts.filter((product) => [
      product.name, product.description ?? "", product.category?.name ?? "",
      product.category?.parent?.name ?? "", product.status, product.availability,
    ].some((value) => value.toLocaleLowerCase().includes(query)));
  }, [dashboardProducts, productSearch]);
  const activeProductCount = dashboardProducts.filter((product) => product.status === "ACTIVE").length;
  const reachedProductLimit = activeProductCount >= productCapacity.maxActiveProducts;
  const remainingProductSlots = Math.max(0, productCapacity.maxActiveProducts - activeProductCount);
  const canShareBusiness = Boolean(business && business.status === "ACTIVE" && !business.deletedAt);
  const profileIsComplete = Boolean(business?.name.trim() && business.location?.area.trim() && business.location?.address?.trim() &&
    (business.phone?.trim() || business.socialLinks?.some((link) => link.platform === "PHONE" || link.platform === "WHATSAPP")));
  const onboardingSteps = [
    { label: "Create your business profile", done: Boolean(business) },
    { label: "Add your location and contact details", done: profileIsComplete },
    { label: "Add your first product", done: dashboardProducts.length > 0 },
    { label: "Make your profile public", done: canShareBusiness },
  ];
  const completedSteps = onboardingSteps.filter((step) => step.done).length;
  const nextAction = !business ? {
    title: "Set up your business", description: "Start with the basics. You can complete the optional details later.", label: "Create business",
  } : dashboardProducts.length === 0 ? {
    title: "Add your first product", description: "Give nearby customers something specific to discover.", label: "Add first product",
  } : !profileIsComplete ? {
    title: "Complete your business profile", description: "Add a street address and a contact method so customers know how to reach you.", label: "Complete profile",
  } : !canShareBusiness ? {
    title: "Check your business status", description: "Your profile can be shared once it is active and publicly visible.", label: "View status",
  } : {
    title: "Help more people find you", description: "Share your public business profile with customers and local communities.", label: "Share business",
  };

  const clearFeedback = useCallback(() => { setError(""); setSuccess(""); }, []);
  useEffect(() => {
    if (!editingBusiness) return;
    const frame = window.requestAnimationFrame(() => businessEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [editingBusiness]);

  const loadDashboard = useCallback(async (signal: AbortSignal) => {
    setLoading(true); setDashboardLoadFailed(false); setRedirecting(false); setError("");
    try {
      const businessResponse = await fetch("/api/seller/business", { cache: "no-store", signal });
      if (businessResponse.status === 401 || businessResponse.status === 403) { setRedirecting(true); router.replace("/seller/login"); return; }
      if (!businessResponse.ok) throw new Error("Unable to load seller business.");
      const businessData = await readJsonSafely<ApiBusinessResponse>(businessResponse);
      if (!businessData || !Object.prototype.hasOwnProperty.call(businessData, "business")) throw new Error("The seller business response was invalid.");
      const loadedBusiness = businessData.business ?? null;
      const [categoriesResponse, deletionResponse, productsResponse] = await Promise.all([
        fetch("/api/categories?type=product&includeEmpty=true", { cache: "no-store", signal }).catch(() => null),
        fetch("/api/seller/business/deletion-request", { cache: "no-store", signal }).catch(() => null),
        loadedBusiness ? fetch("/api/seller/products", { cache: "no-store", signal }).catch(() => null) : Promise.resolve(null),
      ]);
      const categoryPayload = categoriesResponse?.ok ? await readJsonSafely<ApiCategoriesResponse>(categoriesResponse) : null;
      const deletionData = deletionResponse?.ok ? await readJsonSafely<ApiDeletionResponse>(deletionResponse) : null;
      let loadedCapacity: ProductCapacity | null = null;
      let businessWithProducts = loadedBusiness;
      if (loadedBusiness) {
        if (!productsResponse?.ok) throw new Error("Unable to load products and inventory. Please try again.");
        const productsPayload = await readJsonSafely<ApiSellerProductsResponse>(productsResponse);
        loadedCapacity = parseProductCapacity(productsPayload);
        if (!loadedCapacity) throw new Error("The seller product-capacity response was invalid.");
        if (Array.isArray(productsPayload?.products)) businessWithProducts = { ...loadedBusiness, products: productsPayload.products };
      }
      if (signal.aborted) return;
      setBusiness(businessWithProducts);
      setProductCapacity(loadedCapacity ?? { maxActiveProducts: MAX_ACTIVE_PRODUCTS, baseMaxActiveProducts: MAX_ACTIVE_PRODUCTS, referralBonusSlots: 0 });
      const categoryTree = parseCategoryTree(categoryPayload);
      // Root categories classify businesses; their active children classify products.
      setBusinessCategories(categoryTree);
      setProductCategories(categoryTree);
      setDeletionRequest(deletionData?.request ?? null);
      if (businessWithProducts) {
        setBusinessForm(getInitialBusinessForm(businessWithProducts));
        setSocialValues(getSocialValues(businessWithProducts.socialLinks, businessWithProducts.phone));
      } else { setBusinessForm(INITIAL_BUSINESS_FORM); setSocialValues(INITIAL_SOCIAL_VALUES); }
    } catch (loadError) {
      if (signal.aborted) return;
      console.error("Seller dashboard load error:", loadError);
      setError("Unable to load your seller dashboard. Please try again."); setDashboardLoadFailed(true);
    } finally { if (!signal.aborted) setLoading(false); }
  }, [router]);
  useEffect(() => {
    const controller = new AbortController();
    void loadDashboard(controller.signal);
    return () => controller.abort();
  }, [loadDashboard, loadAttempt]);

  function updateBusinessField<K extends keyof BusinessForm>(field: K, value: BusinessForm[K]) {
    setBusinessForm((current) => ({ ...current, [field]: value })); clearFeedback();
  }
  function updateProductField<K extends keyof ProductForm>(field: K, value: ProductForm[K]) {
    setProductForm((current) => ({ ...current, [field]: value })); clearFeedback();
  }
  function updateSocial(platform: SocialPlatform, value: string) {
    setSocialValues((current) => ({ ...current, [platform]: value })); clearFeedback();
  }
  function validateBusinessLocation() {
    if (!businessForm.area.trim()) { setError("Business area is required."); return false; }
    if (!businessForm.city.trim()) { setError("Local government and state are required. Select a suggestion or enter them manually."); return false; }
    if (!businessForm.street.trim()) { setError("Street, road, or close is required."); return false; }
    return true;
  }
  function buildBusinessLocationPayload() {
    return { area: businessForm.area.trim(), houseNumber: businessForm.houseNumber.trim(), street: businessForm.street.trim(), city: businessForm.city.trim() };
  }
  function handleAreaChange(value: string) { setBusinessForm((current) => ({ ...current, area: value, city: "" })); clearFeedback(); }
  function handleAreaSelect(selected: AreaSelection) { setBusinessForm((current) => ({ ...current, area: selected.area, city: `${selected.lga}, ${selected.state}` })); clearFeedback(); }
  function startEditingBusiness() {
    if (!business) return;
    clearFeedback(); setBusinessForm(getInitialBusinessForm(business));
    setSocialValues(getSocialValues(business.socialLinks, business.phone)); setCategoryChanged(false); setEditingBusiness(true);
  }
  function cancelEditingBusiness() {
    if (!business || savingBusiness) return;
    setBusinessForm(getInitialBusinessForm(business)); setSocialValues(getSocialValues(business.socialLinks, business.phone));
    setCategoryChanged(false); setEditingBusiness(false); clearFeedback();
  }
  function applyBusinessToForm(updated: SellerBusiness) {
    setBusiness(updated); setBusinessForm(getInitialBusinessForm(updated));
    setSocialValues(getSocialValues(updated.socialLinks, updated.phone));
  }

  async function createBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (savingBusiness) return; clearFeedback();
    if (!businessForm.name.trim()) { setError("Business name is required."); return; }
    if (!validateBusinessLocation()) return;
    setSavingBusiness(true);
    try {
      const response = await fetch("/api/seller/business", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: businessForm.name.trim(), ownerName: businessForm.ownerName.trim(), description: businessForm.description.trim(),
          ...buildBusinessLocationPayload(), socialLinks: buildSocialLinks(socialValues),
          categoryIds: businessForm.categoryId ? [businessForm.categoryId] : [],
          availability: businessForm.availability, showContactInfo: businessForm.showContactInfo === true,
        }),
      });
      const data = await readJsonSafely<ApiBusinessResponse>(response);
      if (response.status === 401 || response.status === 403) { router.replace("/seller/login"); return; }
      if (!response.ok) { setError(getResponseError(data, "Unable to create your business.")); return; }
      if (!data?.business) { setError("The server accepted the request but did not return your business. Refresh the dashboard before trying again."); setDashboardLoadFailed(true); return; }
      applyBusinessToForm(data.business); setSuccess("Your business has been created. Next, add your first product."); setShowShareOptions(false);
    } catch (createError) {
      console.error("Seller business creation error:", createError);
      setError("We could not confirm the save. Refresh your dashboard before submitting the business again.");
    } finally { setSavingBusiness(false); }
  }
  async function updateBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (savingBusiness || !business) return; clearFeedback();
    if (!businessForm.name.trim()) { setError("Business name is required."); return; }
    if (!validateBusinessLocation()) return;
    setSavingBusiness(true);
    try {
      const body: Record<string, unknown> = {
        name: businessForm.name.trim(), ownerName: businessForm.ownerName.trim(), description: businessForm.description.trim(),
        ...buildBusinessLocationPayload(), socialLinks: buildSocialLinks(socialValues), availability: businessForm.availability,
        showContactInfo: businessForm.showContactInfo === true,
      };
      if (categoryChanged) body.categoryIds = businessForm.categoryId ? [businessForm.categoryId] : [];
      const response = await fetch("/api/seller/business", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await readJsonSafely<ApiBusinessResponse>(response);
      if (response.status === 401 || response.status === 403) { router.replace("/seller/login"); return; }
      if (!response.ok) { setError(getResponseError(data, "Unable to update your business.")); return; }
      if (!data?.business) { setError("The server did not return the updated business. Refresh to verify your changes."); return; }
      applyBusinessToForm(data.business); setCategoryChanged(false); setEditingBusiness(false); setSuccess("Your business has been updated successfully.");
    } catch (updateError) {
      console.error("Seller business update error:", updateError);
      setError("We could not confirm the update. Refresh your dashboard to verify your changes.");
    } finally { setSavingBusiness(false); }
  }

  function getBusinessShareUrl() {
    if (!business || typeof window === "undefined") return "";
    return new URL(`/seller/${encodeURIComponent(business.id)}`, window.location.origin).toString();
  }
  function setShareMessage(message: string, isError = false) { setShareNotice(message); setShareNoticeIsError(isError); }
  async function copyBusinessShareLink() {
    if (!business || !canShareBusiness) { setShareMessage("Your business must be active and publicly visible before it can be shared.", true); return; }
    const url = getBusinessShareUrl();
    if (!url) { setShareMessage("Unable to create the business link.", true); return; }
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url); setShareMessage("Business profile link copied successfully."); return;
    } catch { /* Use the fallback below. */ }
    let textarea: HTMLTextAreaElement | null = null; let copied = false;
    try {
      textarea = document.createElement("textarea"); textarea.value = url; textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed"; textarea.style.left = "-9999px"; document.body.appendChild(textarea);
      textarea.select(); copied = document.execCommand("copy");
    } catch { copied = false; } finally { textarea?.remove(); }
    setShareMessage(copied ? "Business profile link copied successfully." : "Copying failed. Open your public business page and copy its URL from the address bar.", !copied);
  }
  async function shareBusinessFromDevice() {
    if (!business || !canShareBusiness) { setShareMessage("Your business must be active and publicly visible before it can be shared.", true); return; }
    const url = getBusinessShareUrl();
    if (!url) { setShareMessage("Unable to create the business link.", true); return; }
    if (typeof navigator.share !== "function") { await copyBusinessShareLink(); return; }
    try { await navigator.share({ title: `${business.name} | ReMarket`, text: `Discover ${business.name} on ReMarket. Find it nearby.`, url }); setShareNotice(""); setShareNoticeIsError(false); }
    catch (shareError) { if (shareError instanceof Error && shareError.name === "AbortError") return; await copyBusinessShareLink(); }
  }
  function getBusinessShareTarget(platform: SharePlatform) {
    if (!business || !canShareBusiness) return "";
    const url = getBusinessShareUrl(); if (!url) return "";
    const encodedUrl = encodeURIComponent(url); const message = `Discover ${business.name} on ReMarket. Find it nearby.`;
    switch (platform) {
      case "WHATSAPP": return `https://wa.me/?text=${encodeURIComponent(`${message} ${url}`)}`;
      case "FACEBOOK": return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
      case "LINKEDIN": return `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
      case "X": return `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}&url=${encodedUrl}`;
    }
  }
  function openBusinessShareTarget(platform: SharePlatform) {
    const target = getBusinessShareTarget(platform);
    if (!target) { setShareMessage("Unable to create the sharing link.", true); return; }
    window.open(target, "_blank", "noopener,noreferrer");
    setShareMessage(`Continue sharing your business on ${platform}. If the new tab did not open, use Copy profile link instead.`);
  }

  function resetProductForm() { setProductForm(INITIAL_PRODUCT_FORM); }
  function openProductForm() {
    if (reachedProductLimit || creatingProduct || updatingProduct) return;
    clearFeedback(); setEditingProductId(null); resetProductForm(); setShowProductForm(true);
  }
  function closeProductForm() {
    if (creatingProduct || updatingProduct) return;
    setShowProductForm(false); setEditingProductId(null); resetProductForm(); clearFeedback();
  }
  function startEditingProduct(product: SellerProduct) {
    clearFeedback();
    setProductForm({
      name: product.name ?? "", description: product.description ?? "", categoryId: product.category?.id ?? "",
      price: product.price != null ? String(product.price) : "",
      originalPrice: product.originalPrice != null ? String(product.originalPrice) : "",
      availability: product.availability ?? "ASK_SELLER",
      stockQuantity: product.stockQuantity != null ? String(product.stockQuantity) : "",
      shippingWeightKg: product.shippingWeightKg != null ? String(product.shippingWeightKg) : "",
      shippingLengthCm: product.shippingLengthCm != null ? String(product.shippingLengthCm) : "",
      shippingWidthCm: product.shippingWidthCm != null ? String(product.shippingWidthCm) : "",
      shippingHeightCm: product.shippingHeightCm != null ? String(product.shippingHeightCm) : "",
      images: product.images?.length ? [...product.images].sort((a, b) => a.sortOrder - b.sortOrder).map((image) => image.url) : product.imageUrl ? [product.imageUrl] : [],
    });
    setEditingProductId(product.id); setShowProductForm(true);
  }
  function getProductFormPrices() {
    return { price: productForm.price.trim() === "" ? null : Number(productForm.price), originalPrice: productForm.originalPrice.trim() === "" ? null : Number(productForm.originalPrice) };
  }
  function validateProductForm() {
    if (!productForm.name.trim()) { setError("Product name is required."); return false; }
    const { price, originalPrice } = getProductFormPrices();
    if (price !== null && (!Number.isSafeInteger(price) || price < 0 || price > MAX_PRISMA_INT)) { setError("Selling price must be a whole number between 0 and 2,147,483,647."); return false; }
    if (originalPrice !== null && (!Number.isSafeInteger(originalPrice) || originalPrice <= 0 || originalPrice > MAX_PRISMA_INT)) { setError("Original price must be a positive whole number."); return false; }
    if (originalPrice !== null && (price === null || price <= 0)) { setError("Enter a positive selling price before adding an original price."); return false; }
    if (originalPrice !== null && price !== null && originalPrice <= price) { setError("Original price must be greater than the selling price."); return false; }
    if (productForm.stockQuantity.trim() !== "") {
      const quantity = Number(productForm.stockQuantity);
      if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > MAX_PRISMA_INT) { setError("Stock quantity must be a whole number between 0 and 2,147,483,647, or left empty to disable tracking."); return false; }
    }
    const packageValues = [productForm.shippingWeightKg, productForm.shippingLengthCm, productForm.shippingWidthCm, productForm.shippingHeightCm];
    const suppliedPackageValues = packageValues.filter((value) => value.trim() !== "");
    if (suppliedPackageValues.length > 0 && suppliedPackageValues.length !== 4) {
      setError("Enter all four package measurements, or leave all four empty."); return false;
    }
    if (suppliedPackageValues.length === 4) {
      const values = suppliedPackageValues.map(Number);
      if (values.some((value) => !Number.isFinite(value) || value <= 0 || value > 1000)) {
        setError("Package weight and dimensions must be positive numbers no greater than 1,000."); return false;
      }
    }
    if (productForm.availability === "AVAILABLE" && price !== null && price > 0 && suppliedPackageValues.length !== 4) {
      setError("Add the packaged item's weight and dimensions before marking a fixed-price product as available for purchase."); return false;
    }
    return true;
  }
  const reloadBusiness = useCallback(async () => {
    const response = await fetch("/api/seller/business", { cache: "no-store" });
    if (response.status === 401 || response.status === 403) { router.replace("/seller/login"); throw new Error("Your session has expired. Please sign in again."); }
    if (!response.ok) throw new Error("Unable to refresh the dashboard.");
    const data = await readJsonSafely<ApiBusinessResponse>(response);
    if (!data || !Object.prototype.hasOwnProperty.call(data, "business")) throw new Error("The seller business response was invalid.");
    const refreshedBusiness = data.business ?? null;
    if (!refreshedBusiness) {
      setProductCapacity({ maxActiveProducts: MAX_ACTIVE_PRODUCTS, baseMaxActiveProducts: MAX_ACTIVE_PRODUCTS, referralBonusSlots: 0 });
      setBusiness(null); return null;
    }
    const productsResponse = await fetch("/api/seller/products", { cache: "no-store" });
    if (productsResponse.status === 401 || productsResponse.status === 403) { router.replace("/seller/login"); throw new Error("Your session has expired. Please sign in again."); }
    if (!productsResponse.ok) throw new Error("Unable to refresh product capacity.");
    const productsPayload = await readJsonSafely<ApiSellerProductsResponse>(productsResponse);
    const refreshedCapacity = parseProductCapacity(productsPayload);
    if (!refreshedCapacity) throw new Error("The seller product-capacity response was invalid.");
    const refreshedBusinessWithProducts = Array.isArray(productsPayload?.products) ? { ...refreshedBusiness, products: productsPayload.products } : refreshedBusiness;
    setBusiness(refreshedBusinessWithProducts);
    setBusinessForm(getInitialBusinessForm(refreshedBusinessWithProducts));
    setSocialValues(getSocialValues(refreshedBusinessWithProducts.socialLinks, refreshedBusinessWithProducts.phone));
    setProductCapacity(refreshedCapacity);
    return refreshedBusinessWithProducts;
  }, [router]);

  async function saveProductRequest(event: FormEvent<HTMLFormElement>, method: "POST" | "PATCH") {
    event.preventDefault();
    if (method === "POST" && (creatingProduct || !business || reachedProductLimit)) return;
    if (method === "PATCH" && (updatingProduct || !editingProductId)) return;
    clearFeedback(); if (!validateProductForm()) return;
    if (method === "POST") setCreatingProduct(true); else setUpdatingProduct(true);
    try {
      const url = method === "POST" ? "/api/seller/products" : `/api/seller/products/${encodeURIComponent(editingProductId!)}`;
      const response = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: productForm.name.trim(), description: productForm.description.trim(), categoryId: productForm.categoryId || null,
          ...getProductFormPrices(), availability: productForm.availability,
          stockQuantity: productForm.stockQuantity.trim() === "" ? null : Number(productForm.stockQuantity),
          shippingWeightKg: productForm.shippingWeightKg.trim() === "" ? null : Number(productForm.shippingWeightKg),
          shippingLengthCm: productForm.shippingLengthCm.trim() === "" ? null : Number(productForm.shippingLengthCm),
          shippingWidthCm: productForm.shippingWidthCm.trim() === "" ? null : Number(productForm.shippingWidthCm),
          shippingHeightCm: productForm.shippingHeightCm.trim() === "" ? null : Number(productForm.shippingHeightCm),
          images: productForm.images,
        }),
      });
      const data = await readJsonSafely<ApiErrorResponse>(response);
      if (response.status === 401 || response.status === 403) { router.replace("/seller/login"); return; }
      if (!response.ok) { setError(getResponseError(data, method === "POST" ? "Unable to create product." : "Unable to update product.")); return; }
      setShowProductForm(false); setEditingProductId(null); resetProductForm();
      try {
        await reloadBusiness();
        setSuccess(method === "POST" ? "Product added successfully. Add another product or share your business." : "Product updated successfully.");
      } catch (refreshError) {
        console.error("Product saved but dashboard refresh failed:", refreshError);
        setSuccess("Product saved successfully, but the dashboard could not refresh. Reload the page to see the latest product.");
      }
    } catch (productError) {
      console.error("Seller product save error:", productError);
      setError("We could not confirm the product save. Refresh your dashboard before submitting it again.");
    } finally { setCreatingProduct(false); setUpdatingProduct(false); }
  }
  async function deleteProduct(product: SellerProduct) {
    if (deletingProductId || !window.confirm(`Delete “${product.name}” from your active products?`)) return;
    clearFeedback(); setDeletingProductId(product.id);
    try {
      const response = await fetch(`/api/seller/products/${encodeURIComponent(product.id)}`, { method: "DELETE" });
      const data = await readJsonSafely<ApiErrorResponse>(response);
      if (response.status === 401 || response.status === 403) { router.replace("/seller/login"); return; }
      if (!response.ok) { setError(getResponseError(data, "Unable to delete product.")); return; }
      if (editingProductId === product.id) { resetProductForm(); setEditingProductId(null); setShowProductForm(false); }
      try { await reloadBusiness(); setSuccess("Product deleted successfully."); }
      catch (refreshError) { console.error("Product deleted but dashboard refresh failed:", refreshError); setSuccess("Product deleted successfully, but the dashboard could not refresh. Reload the page to confirm the latest list."); }
    } catch (deleteError) {
      console.error("Seller product deletion error:", deleteError);
      setError("We could not confirm the deletion. Refresh your dashboard before trying again.");
    } finally { setDeletingProductId(null); }
  }

  function openDeletionForm() { clearFeedback(); setDeletionReason(""); setShowDeletionForm(true); }
  function closeDeletionForm() { if (submittingDeletionRequest) return; setDeletionReason(""); setShowDeletionForm(false); setError(""); }
  async function submitDeletionRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submittingDeletionRequest || !business) return;
    clearFeedback(); setSubmittingDeletionRequest(true);
    try {
      const response = await fetch("/api/seller/business/deletion-request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: deletionReason.trim() }) });
      const data = await readJsonSafely<ApiDeletionResponse>(response);
      if (response.status === 401 || response.status === 403) { router.replace("/seller/login"); return; }
      if (!response.ok) { setError(getResponseError(data, "Unable to submit deletion request.")); return; }
      setDeletionRequest(data?.request ?? null); setDeletionReason(""); setShowDeletionForm(false);
      setSuccess("Your business deletion request has been submitted for admin review. Your business is not deleted immediately.");
    } catch (requestError) {
      console.error("Seller deletion request error:", requestError);
      setError("We could not confirm your deletion request. Refresh the dashboard before submitting it again.");
    } finally { setSubmittingDeletionRequest(false); }
  }
  async function logout() { await signOut({ callbackUrl: "/seller/login" }); }
  function handleNextAction() {
    clearFeedback();
    if (!business) {
      document.getElementById("business-create-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("create-business-name")?.focus({ preventScroll: true }); return;
    }
    if (dashboardProducts.length === 0) {
      openProductForm(); document.getElementById("products-section")?.scrollIntoView({ behavior: "smooth", block: "start" }); return;
    }
    if (!profileIsComplete) { startEditingBusiness(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (canShareBusiness) { setShowShareOptions(true); setShareNotice(""); setShareNoticeIsError(false); }
    document.getElementById("business-overview")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (loading || redirecting) return <main className="flex min-h-dvh w-full items-center justify-center bg-[var(--rm-page)] px-4"><div className="flex items-center gap-3 text-sm font-medium text-gray-600"><LoaderCircle className="h-5 w-5 animate-spin text-[var(--rm-coral)]" />{redirecting ? "Redirecting to login..." : "Loading seller dashboard..."}</div></main>;
  if (dashboardLoadFailed) return <main className="flex min-h-dvh w-full items-center justify-center bg-[var(--rm-page)] px-4 py-8"><section className="rm-panel w-full max-w-[480px] p-6 text-center sm:p-8"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--rm-red-bg)] text-[var(--rm-red)]"><AlertCircle className="h-6 w-6" /></div><h1 className="mt-4 text-xl font-bold text-[var(--rm-ink)]">Unable to load your dashboard</h1><p role="alert" className="mt-2 text-sm leading-6 text-gray-500">{error || "Your business information could not be loaded."}</p><button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)} className={`${primaryButtonClass} mt-5`}>Try again</button></section></main>;

  const businessLocationFields = (mode: "create" | "edit") => (
    <div className="grid gap-4 sm:grid-cols-2">
      <div><label htmlFor={`${mode}-area`} className={labelClass}>Area / community <span className="text-[var(--rm-coral)]">*</span></label><AreaAutocomplete id={`${mode}-area`} value={businessForm.area} onChange={handleAreaChange} onSelect={handleAreaSelect} placeholder="Search or choose an area" disabled={savingBusiness} /><p className="mt-1.5 text-[10px] leading-4 text-gray-500">Search by area, community, LGA or state, or type a custom area.</p></div>
      <div><label htmlFor={`${mode}-city`} className={labelClass}>Local government / State <span className="text-[var(--rm-coral)]">*</span></label><input id={`${mode}-city`} className={inputClass} value={businessForm.city} onChange={(event) => updateBusinessField("city", event.target.value)} placeholder="e.g. Ikeja, Lagos State" maxLength={100} required disabled={savingBusiness} /></div>
      <div><label htmlFor={`${mode}-house-number`} className={labelClass}>House / shop number</label><input id={`${mode}-house-number`} className={inputClass} value={businessForm.houseNumber} onChange={(event) => updateBusinessField("houseNumber", event.target.value)} placeholder="e.g. 12 or Shop 4" maxLength={100} disabled={savingBusiness} /></div>
      <div><label htmlFor={`${mode}-street`} className={labelClass}>Street / road / close <span className="text-[var(--rm-coral)]">*</span></label><input id={`${mode}-street`} className={inputClass} value={businessForm.street} onChange={(event) => updateBusinessField("street", event.target.value)} placeholder="e.g. Agidingbi Road" maxLength={200} required disabled={savingBusiness} /></div>
      <div className="rounded-xl border border-[var(--rm-border)] bg-white p-3 sm:col-span-2"><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Address preview</p><p className="mt-1 break-words text-xs leading-5 text-gray-600">{buildLocationAddressPreview(businessForm.area, businessForm.houseNumber, businessForm.street, businessForm.city)}</p></div>
    </div>
  );
  const socialFields = (mode: "create" | "edit") => (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <ContactVisibility id={`${mode}-show-contact`} value={businessForm.showContactInfo} onChange={(value) => updateBusinessField("showContactInfo", value)} disabled={savingBusiness} />
      {SOCIAL_PLATFORMS.map(({ value, label }) => <div key={value}><label htmlFor={`${mode}-social-${value.toLowerCase()}`} className={labelClass}>{label}</label><input id={`${mode}-social-${value.toLowerCase()}`} className={inputClass} type={value === "PHONE" ? "tel" : "text"} value={socialValues[value]} onChange={(event) => updateSocial(value, event.target.value)} placeholder={value === "PHONE" || value === "WHATSAPP" ? "080..." : value === "DIRECTIONS" ? "https://maps.google.com/..." : "@username or URL"} disabled={savingBusiness} /></div>)}
    </div>
  );

  return (
    <main className="rm-storefront min-h-dvh w-full overflow-x-clip">
      <header className="rm-site-header sticky top-0 z-50 flex min-h-[66px] w-full items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link href="/seller" className="rm-brand flex shrink-0 items-center gap-2.5" aria-label="ReMarket Seller Portal home"><span className="rm-brand-mark flex h-10 w-10 items-center justify-center"><Store className="h-5 w-5" /></span><span><span className="block text-sm font-bold tracking-tight">ReMarket</span><span className="block text-[10px] leading-none text-gray-400">Seller Portal</span></span></Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Seller navigation"><Link href="/seller" className="inline-flex items-center gap-2 rounded-xl bg-[var(--rm-coral-soft)] px-3 py-2.5 text-xs font-bold text-[var(--rm-coral)]"><Store className="h-4 w-4" /> Dashboard</Link>{business && <><a href="#products-section" className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-600 transition hover:bg-[var(--rm-cream)] hover:text-[var(--rm-coral-dark)]"><Package className="h-4 w-4" /> Products</a><Link href="/seller/orders" className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-600 transition hover:bg-[var(--rm-cream)] hover:text-[var(--rm-coral-dark)]"><ClipboardCheck className="h-4 w-4" /> Orders</Link><Link href="/seller/insights" className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-600 transition hover:bg-[var(--rm-cream)] hover:text-[var(--rm-coral-dark)]"><BarChart3 className="h-4 w-4" /> Insights</Link><a href="#orders-section" className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-600 transition hover:bg-[var(--rm-cream)] hover:text-[var(--rm-coral-dark)]"><Package className="h-4 w-4" /> Inventory overview</a></>}</nav>
        <div className="flex shrink-0 items-center gap-2"><div className="relative z-[100] shrink-0"><NotificationBell /></div><details className="group relative hidden sm:block"><summary className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-[var(--rm-border)] bg-white px-3 text-xs font-bold text-gray-700 transition hover:bg-[var(--rm-cream)] hover:text-[var(--rm-coral-dark)] [&::-webkit-details-marker]:hidden"><UserRound className="h-4 w-4" /><span>Account</span><ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" /></summary><div className="absolute right-0 top-full z-[120] mt-2 w-64 overflow-hidden rounded-2xl border border-[var(--rm-border)] bg-white p-2 shadow-[0_18px_45px_rgba(23,32,42,0.16)]"><div className="border-b border-[var(--rm-border)] px-3 py-3"><p className="text-xs font-bold text-[var(--rm-ink)]">Your ReMarket account</p><p className="mt-1 text-[10px] leading-4 text-gray-400">Manage your buyer and seller activities.</p></div><div className="grid gap-1 py-2"><AccountLink href="/account" icon={<UserRound className="h-4 w-4" />}>Account overview</AccountLink><AccountLink href="/saved" icon={<Bookmark className="h-4 w-4" />}>Saved items</AccountLink><AccountLink href="/seller/profile" icon={<Store className="h-4 w-4" />}>Seller profile</AccountLink></div><div className="border-t border-[var(--rm-border)] pt-2"><button type="button" onClick={() => void logout()} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-[var(--rm-red)] hover:bg-[var(--rm-red-bg)]"><LogOut className="h-4 w-4" /> Sign out</button></div></div></details><button type="button" onClick={() => void logout()} className={`${secondaryButtonClass} hidden !px-3 md:inline-flex`}><LogOut className="h-4 w-4" /> <span>Log out</span></button><button type="button" onClick={() => setMobileNavOpen((open) => !open)} aria-expanded={mobileNavOpen} aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"} className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--rm-border)] text-gray-600 sm:hidden"><span className="text-lg leading-none">{mobileNavOpen ? "×" : "☰"}</span></button></div>
        {mobileNavOpen && <nav className="absolute left-0 right-0 top-full z-[110] grid gap-1 border-b border-[var(--rm-border)] bg-white p-3 shadow-lg sm:hidden" aria-label="Mobile account and seller navigation"><p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Seller workspace</p><MobileLink href="/seller" onClick={() => setMobileNavOpen(false)} active>Dashboard</MobileLink>{business && <><MobileLink href="#products-section" onClick={() => setMobileNavOpen(false)}>Manage products</MobileLink><MobileLink href="/seller/orders" onClick={() => setMobileNavOpen(false)}>Manage orders</MobileLink><MobileLink href="/seller/insights" onClick={() => setMobileNavOpen(false)}>Insights</MobileLink><MobileLink href="#orders-section" onClick={() => setMobileNavOpen(false)}>Inventory overview</MobileLink></>}<MobileLink href="/seller/profile" onClick={() => setMobileNavOpen(false)}>Seller profile</MobileLink><div className="my-1 border-t border-[var(--rm-border)]" /><p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Your account</p><MobileLink href="/account" onClick={() => setMobileNavOpen(false)}>Account overview</MobileLink><MobileLink href="/saved" onClick={() => setMobileNavOpen(false)}>Saved items</MobileLink><div className="my-1 border-t border-[var(--rm-border)]" /><button type="button" onClick={() => void logout()} className="flex items-center gap-2 rounded-xl px-4 py-3 text-left text-sm font-bold text-[var(--rm-red)] hover:bg-[var(--rm-red-bg)]"><LogOut className="h-4 w-4" /> Sign out</button></nav>}
      </header>

      <div className="rm-container w-full max-w-[1600px] py-6 sm:py-8">
        <div className="mb-7 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div className="max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--rm-coral)]">Seller Dashboard</p><h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">Manage your business</h1><p className="mt-2 max-w-[700px] text-sm leading-6 text-gray-500">Keep your business details current, manage product inventory and fulfil customer orders.</p></div>{business && <div className="flex flex-wrap items-center gap-2"><StatusBadge status={business.status} />{business.verification === "VERIFIED" && <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E7F0FF] px-3 py-1.5 text-[11px] font-bold text-[#3566B8]"><ShieldCheck className="h-3.5 w-3.5" /> Verified</span>}<span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ${business.showContactInfo === true ? "bg-[var(--rm-green-bg)] text-[var(--rm-green)]" : "bg-[var(--rm-red-bg)] text-[var(--rm-coral-dark)]"}`}>{business.showContactInfo === true ? <Globe className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}Contact: {business.showContactInfo === true ? "Public" : "Private"}</span></div>}</div>
        {error && <div role="alert" aria-live="polite" className="mb-5 flex items-start gap-3 rounded-2xl border border-[#FFB8B0] bg-[var(--rm-red-bg)] px-4 py-4"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--rm-red)]" /><p className="text-sm text-[var(--rm-red)]">{error}</p></div>}
        {success && <div role="status" aria-live="polite" className="mb-5 flex items-start gap-3 rounded-2xl border border-[#BDE8D8] bg-[var(--rm-green-bg)] px-4 py-4"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--rm-green)]" /><p className="text-sm text-[var(--rm-green)]">{success}</p></div>}

        <section className="rm-panel mb-6 overflow-hidden"><div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:items-center lg:p-7"><div className="flex min-w-0 items-start gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--rm-coral)] text-white shadow-sm"><ClipboardCheck className="h-6 w-6" /></div><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#B94128]">Your next step</p><h2 className="mt-1 text-lg font-bold sm:text-xl">{nextAction.title}</h2><p className="mt-1 max-w-[600px] text-sm leading-6 text-gray-600">{nextAction.description}</p><button type="button" onClick={handleNextAction} className={`${primaryButtonClass} mt-4 min-h-11 px-5`}>{nextAction.label}<ArrowRight className="h-4 w-4" /></button></div></div><div className="rounded-[var(--rm-radius-md)] border border-[var(--rm-border)] bg-white p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold">Getting started</p><p className="mt-1 text-[11px] text-gray-500">A quick guide to a useful seller profile</p></div><span className="text-sm font-bold text-[var(--rm-coral-dark)]">{completedSteps}/4</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--rm-border)]"><div className="h-full rounded-full bg-[var(--rm-coral)] transition-all duration-300" style={{ width: `${(completedSteps / onboardingSteps.length) * 100}%` }} /></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{onboardingSteps.map((step) => <div key={step.label} className="flex min-w-0 items-start gap-2 text-xs"><span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${step.done ? "bg-[var(--rm-green-bg)] text-[var(--rm-green)]" : "border border-[var(--rm-border-strong)] text-gray-300"}`}>{step.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-2.5 w-2.5" />}</span><span className={step.done ? "text-gray-500 line-through decoration-gray-300" : "font-medium text-gray-700"}>{step.label}</span></div>)}</div></div></div></section>

        {!business && <section id="business-create-form" className="rm-panel scroll-mt-24 overflow-hidden"><div className="border-b border-[var(--rm-border)] px-5 py-5 sm:px-6"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--rm-coral-soft)] text-[var(--rm-coral)]"><Plus className="h-5 w-5" /></div><div><h2 className="text-lg font-bold">Add your business</h2><p className="mt-1 text-xs text-gray-500">Start with the essential details. You can update the rest later.</p></div></div></div><form onSubmit={createBusiness} className="space-y-6 px-5 py-6 sm:px-6"><div className="grid gap-5 sm:grid-cols-2"><FormInput id="create-business-name" label="Business name" value={businessForm.name} onChange={(v) => updateBusinessField("name", v)} required maxLength={150} placeholder="Your business name" disabled={savingBusiness} /><CategorySelect id="create-category" value={businessForm.categoryId} categories={businessCategories} mode="business" onChange={(v) => updateBusinessField("categoryId", v)} disabled={savingBusiness} /></div><details className="group rounded-2xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] p-4" open><summary className="cursor-pointer list-none text-sm font-bold"><span className="flex items-center justify-between gap-3">Location details<span className="text-[11px] font-medium text-gray-400">Area, LGA/state and street are required <ArrowRight className="inline h-4 w-4 rotate-90" /></span></span></summary><div className="mt-4">{businessLocationFields("create")}</div></details><details className="rounded-2xl border border-[var(--rm-border)] p-4" open><summary className="cursor-pointer list-none text-sm font-bold">Optional profile details<span className="ml-1 text-xs font-normal text-gray-400">Description, owner and contact links</span></summary><div className="mt-4 grid gap-4 sm:grid-cols-2"><FormInput id="create-owner-name" label="Owner name" value={businessForm.ownerName} onChange={(v) => updateBusinessField("ownerName", v)} maxLength={100} placeholder="Your name" disabled={savingBusiness} /><AvailabilitySelect id="create-availability" value={businessForm.availability} onChange={(v) => updateBusinessField("availability", v)} disabled={savingBusiness} /><div className="sm:col-span-2"><label htmlFor="create-description" className={labelClass}>Business description</label><textarea id="create-description" className="rm-textarea w-full resize-y" value={businessForm.description} onChange={(e) => updateBusinessField("description", e.target.value)} placeholder="Tell customers what your business offers" rows={3} maxLength={2000} disabled={savingBusiness} /></div>{socialFields("create")}</div></details><div className="flex flex-col gap-3 border-t border-[var(--rm-border)] pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-gray-500">You can edit these details after creating your profile.</p><button type="submit" disabled={savingBusiness} className={`${primaryButtonClass} min-h-12 w-full px-6 text-sm sm:w-auto`}>{savingBusiness ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Creating business...</> : <><Plus className="h-4 w-4" /> Create business</>}</button></div></form></section>}

        {business && <>
          <section id="business-overview" className="rm-panel scroll-mt-24 p-5 sm:p-6 lg:p-7"><div className="flex min-w-0 flex-col gap-5 xl:flex-row xl:items-start xl:justify-between"><div className="flex min-w-0 items-start gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--rm-coral-soft)] text-[var(--rm-coral)]"><Store className="h-7 w-7" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-xl font-bold">{business.name}</h2><StatusBadge status={business.status} />{business.verification === "VERIFIED" && <span className="rounded-full bg-[#E7F0FF] px-2.5 py-1 text-[10px] font-bold text-[#3566B8]">Verified</span>}</div><p className="mt-1 max-w-3xl break-words text-sm leading-6 text-gray-500">{business.description || "Add a short description to help customers understand what your business offers."}</p></div></div><div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap xl:justify-end"><button type="button" onClick={startEditingBusiness} className={secondaryButtonClass}><Pencil className="h-4 w-4" /> Edit details</button><Link href={`/seller/${encodeURIComponent(business.id)}`} className={`${primaryButtonClass} min-h-10`}>Public page <ExternalLink className="h-4 w-4" /></Link><button type="button" onClick={() => { setShowShareOptions((v) => !v); setShareNotice(""); setShareNoticeIsError(false); }} disabled={!canShareBusiness} aria-expanded={showShareOptions} aria-controls="business-share-options" className={`${secondaryButtonClass} col-span-2 sm:col-span-1`}><Share2 className="h-4 w-4" /> Share business</button></div></div>
            {showShareOptions && canShareBusiness && <div id="business-share-options" className="mt-5 rounded-2xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] p-4 sm:p-5"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--rm-coral-soft)] text-[var(--rm-coral)]"><Share2 className="h-5 w-5" /></div><div className="min-w-0"><h3 className="text-sm font-bold">Share your business</h3><p className="mt-1 text-xs leading-5 text-gray-500">Help more customers discover {business.name} on ReMarket.</p></div><button type="button" onClick={() => { setShowShareOptions(false); setShareNotice(""); }} aria-label="Close sharing options" className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--rm-border)] bg-white text-gray-500 hover:text-[var(--rm-coral-dark)]"><X className="h-4 w-4" /></button></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void shareBusinessFromDevice()} className={primaryButtonClass}><Share2 className="h-4 w-4" /> More sharing options</button><button type="button" onClick={() => void copyBusinessShareLink()} className={secondaryButtonClass}><Copy className="h-4 w-4" /> Copy profile link</button></div><div className="mt-4 border-t border-[var(--rm-border)] pt-4"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">Share directly</p><div className="mt-3 flex flex-wrap gap-2">{([ ["WHATSAPP", "WhatsApp"], ["FACEBOOK", "Facebook"], ["LINKEDIN", "LinkedIn"], ["X", "X"] ] as const).map(([p, label]) => <button key={p} type="button" onClick={() => openBusinessShareTarget(p)} className={secondaryButtonClass}><ExternalLink className="h-3.5 w-3.5" /> {label}</button>)}</div><p className="mt-4 break-all text-[11px] leading-5 text-gray-500">Profile link: <span className="font-medium text-[var(--rm-coral-dark)]">/seller/{business.id}</span></p></div>{shareNotice && <p role={shareNoticeIsError ? "alert" : "status"} aria-live="polite" className={`mt-3 rounded-xl px-3 py-2.5 text-xs leading-5 ${shareNoticeIsError ? "border border-[#F1D5D0] bg-[var(--rm-red-bg)] text-[var(--rm-red)]" : "border border-[#BDE8D8] bg-[var(--rm-green-bg)] text-[var(--rm-green)]"}`}>{shareNotice}</p>}</div>}
            {!canShareBusiness && <p className="mt-3 text-xs leading-5 text-gray-500">Sharing becomes available when your business is active and publicly visible.</p>}
            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><OverviewCard icon={<MapPin className="h-4 w-4" />} title="Business address" value={business.location?.area || "Not set"} detail={business.location?.address || "Add your street address to help customers find you."} /><OverviewCard icon={<Phone className="h-4 w-4" />} title="Phone" value={business.phone || getSocialValue(business.socialLinks, "PHONE") || "Not set"} /><OverviewCard icon={<Package className="h-4 w-4" />} title="Active products" value={`${activeProductCount}/${productCapacity.maxActiveProducts}`} detail={`${remainingProductSlots} slots remaining`} /><OverviewCard icon={<Store className="h-4 w-4" />} title="Availability" value={formatAvailability(business.availability)} /></div>
            {business.categories.length > 0 && <div className="mt-5"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Business categories</p><div className="mt-2 flex flex-wrap gap-2">{business.categories.map(({ category }) => <span key={category.id} className="rounded-full border border-[var(--rm-border)] bg-white px-3 py-1.5 text-xs font-medium text-gray-700">{category.name}</span>)}</div></div>}
            <div className="mt-5 rounded-2xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3">{business.showContactInfo === true ? <Globe className="mt-0.5 h-5 w-5 shrink-0 text-[var(--rm-green)]" /> : <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-[var(--rm-coral-dark)]" />}<div><h3 className="text-sm font-bold">Contact information visibility</h3><p className="mt-1 text-xs leading-5 text-gray-500">{business.showContactInfo === true ? "Your contact links are set to public visibility." : "Your contact links are private and should not be shown to public visitors."}</p></div></div><span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-bold ${business.showContactInfo === true ? "bg-[var(--rm-green-bg)] text-[var(--rm-green)]" : "bg-[var(--rm-red-bg)] text-[var(--rm-coral-dark)]"}`}>{business.showContactInfo === true ? "PUBLIC" : "PRIVATE"}</span></div></div>
            <div className="mt-5 border-t border-[var(--rm-border)] pt-5"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Contact & social links</p>{business.socialLinks.length ? <><p className="mt-1 text-[11px] text-gray-400">These are your saved contact details. Public visitors should only receive them when visibility is enabled.</p><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{business.socialLinks.map((link) => <div key={link.id} className="min-w-0 rounded-[var(--rm-radius-md)] border border-[var(--rm-border)] bg-white p-4"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{SOCIAL_PLATFORMS.find((p) => p.value === link.platform)?.label ?? link.platform}</p><p className="mt-2 break-words text-sm font-semibold text-gray-800">{link.handle}</p></div>)}</div></> : <p className="mt-2 text-xs text-gray-500">No contact or social links have been added yet.</p>}</div>
            <div className="mt-6 border-t border-[var(--rm-border)] pt-5"><div className="rounded-2xl border border-[#F1D5D0] bg-[#FFF9F7] p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex min-w-0 items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--rm-red-bg)] text-[var(--rm-red)]"><AlertTriangle className="h-5 w-5" /></div><div><h3 className="text-sm font-bold">Business deletion</h3><p className="mt-1 max-w-[650px] text-xs leading-5 text-gray-500">Deletion requires admin approval. Submitting a request does not remove your business immediately.</p></div></div>{deletionRequest && <span className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold ${getStatusClasses(deletionRequest.status)}`}>{deletionRequest.status}</span>}</div>
              {deletionRequest?.status === "PENDING" && <p className="mt-3 text-xs text-[var(--rm-yellow)]">Your request is waiting for admin review.</p>}{deletionRequest?.status === "APPROVED" && <p className="mt-3 text-xs text-[#3566B8]">Your deletion request was approved by an admin.</p>}{deletionRequest?.status === "REJECTED" && <p className="mt-3 text-xs text-[var(--rm-red)]">Your previous request was rejected. You may submit a new request.</p>}
              {(!deletionRequest || deletionRequest.status === "REJECTED") && <button type="button" onClick={openDeletionForm} className={`${secondaryButtonClass} mt-4 !border-[#E5B9B1] !text-[var(--rm-red)]`}><Trash2 className="h-4 w-4" /> Request business deletion</button>}
              {showDeletionForm && <form onSubmit={submitDeletionRequest} className="mt-4 rounded-2xl border border-[#F0CEC8] bg-white p-4"><h4 className="text-sm font-bold">Request business deletion</h4><p className="mt-1 text-xs leading-5 text-gray-500">Tell the admin why you want this business removed.</p><label htmlFor="deletion-reason" className={`${labelClass} mt-4`}>Reason (optional)</label><textarea id="deletion-reason" className="rm-textarea w-full resize-none" value={deletionReason} onChange={(e) => setDeletionReason(e.target.value)} rows={4} maxLength={1000} placeholder="Optional reason for your request" disabled={submittingDeletionRequest} /><div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={closeDeletionForm} disabled={submittingDeletionRequest} className={secondaryButtonClass}><X className="h-4 w-4" /> Cancel</button><button type="submit" disabled={submittingDeletionRequest} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--rm-red)] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-60">{submittingDeletionRequest ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Submitting...</> : <><Trash2 className="h-4 w-4" /> Submit request</>}</button></div></form>}
            </div></div>
          </section>

          <SellerCommerceOverview />

          {editingBusiness && <section ref={businessEditorRef} id="business-editor" className="rm-panel mt-5 scroll-mt-24 overflow-hidden"><div className="flex flex-col gap-3 border-b border-[var(--rm-border)] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--rm-coral)]">Business settings</p><h2 className="mt-1 text-lg font-bold">Edit your business</h2><p className="mt-1 text-xs text-gray-500">Update the information customers see on ReMarket.</p></div><button type="button" onClick={cancelEditingBusiness} disabled={savingBusiness} className={secondaryButtonClass}><X className="h-4 w-4" /> Cancel</button></div><form onSubmit={updateBusiness} className="space-y-5 px-5 py-6 sm:px-6"><div className="grid gap-5 sm:grid-cols-2"><FormInput id="edit-business-name" label="Business name" value={businessForm.name} onChange={(v) => updateBusinessField("name", v)} maxLength={150} required disabled={savingBusiness} /><FormInput id="edit-owner-name" label="Owner name" value={businessForm.ownerName} onChange={(v) => updateBusinessField("ownerName", v)} maxLength={100} disabled={savingBusiness} /></div><div><label htmlFor="edit-description" className={labelClass}>Description</label><textarea id="edit-description" className="rm-textarea w-full resize-y" value={businessForm.description} onChange={(e) => updateBusinessField("description", e.target.value)} rows={3} maxLength={2000} disabled={savingBusiness} /></div>{businessLocationFields("edit")}<div className="rounded-2xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] p-4"><p className="text-xs font-bold">Contact & social links</p><p className="mt-1 text-[10px] leading-5 text-gray-500">Add useful ways for customers to reach your business.</p><div className="mt-4">{socialFields("edit")}</div></div><div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4"><CategorySelect id="edit-category" value={businessForm.categoryId} categories={businessCategories} mode="business" onChange={(v) => { updateBusinessField("categoryId", v); setCategoryChanged(true); }} disabled={savingBusiness} /><AvailabilitySelect id="edit-availability" value={businessForm.availability} onChange={(v) => updateBusinessField("availability", v)} disabled={savingBusiness} /></div><div className="flex justify-end border-t border-[var(--rm-border)] pt-5"><button type="submit" disabled={savingBusiness} className={`${primaryButtonClass} min-h-12 w-full px-6 text-sm sm:w-auto`}>{savingBusiness ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Saving...</> : <><CheckCircle2 className="h-4 w-4" /> Save changes</>}</button></div></form></section>}

          <section id="products-section" className="rm-panel mt-5 scroll-mt-24 overflow-hidden">
            <div className="border-b border-[var(--rm-border)] px-5 py-5 sm:px-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--rm-coral)]">Product management</p><h2 className="mt-1 text-lg font-bold">Your products</h2><p className="mt-1 text-xs leading-5 text-gray-500">Manage your product listings, selling prices, discounts, availability and stock quantities.</p></div><button type="button" onClick={showProductForm ? closeProductForm : openProductForm} disabled={(reachedProductLimit && !showProductForm) || editingBusiness} className={`${primaryButtonClass} min-h-11 shrink-0 disabled:bg-gray-200 disabled:text-gray-500`}>{showProductForm ? <><X className="h-4 w-4" /> Close form</> : <><Plus className="h-4 w-4" /> Add product</>}</button></div>
              <div className="mt-5 rounded-2xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><Package className="h-4 w-4 text-[var(--rm-coral)]" /><p className="text-xs font-bold">Active product slots</p></div><p className="mt-1 text-[11px] text-gray-500">{reachedProductLimit ? "You have reached your active product limit." : `${remainingProductSlots} active ${remainingProductSlots === 1 ? "slot" : "slots"} remaining.`}</p><p className="mt-1 text-[10px] leading-4 text-gray-400">{productCapacity.baseMaxActiveProducts} base slots{productCapacity.referralBonusSlots > 0 ? ` + ${productCapacity.referralBonusSlots} referral bonus ${productCapacity.referralBonusSlots === 1 ? "slot" : "slots"}` : " · No referral bonus slots yet"}</p></div><p className={`text-sm font-bold ${reachedProductLimit ? "text-[var(--rm-red)]" : "text-[var(--rm-coral-dark)]"}`}>{activeProductCount}/{productCapacity.maxActiveProducts}</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--rm-border)]"><div className={`h-full rounded-full transition-all ${reachedProductLimit ? "bg-[var(--rm-red)]" : "bg-[var(--rm-coral)]"}`} style={{ width: `${Math.min(100, (activeProductCount / Math.max(1, productCapacity.maxActiveProducts)) * 100)}%` }} /></div></div>
            </div>

            {showProductForm && <form onSubmit={(event) => void saveProductRequest(event, editingProductId ? "PATCH" : "POST")} className="space-y-5 border-b border-[var(--rm-border)] bg-[var(--rm-surface-muted)] px-5 py-6 sm:px-6"><div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--rm-coral-soft)] text-[var(--rm-coral)]">{editingProductId ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}</div><div><h3 className="text-sm font-bold">{editingProductId ? "Edit product" : "Add a product"}</h3><p className="mt-1 text-xs leading-5 text-gray-500">{editingProductId ? "Update the information customers see." : "Add the essentials first. You can add more products after saving."}</p></div></div><button type="button" onClick={closeProductForm} disabled={creatingProduct || updatingProduct} aria-label="Close product form" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--rm-border)] bg-white text-gray-500 hover:text-[var(--rm-coral-dark)] disabled:opacity-50"><X className="h-4 w-4" /></button></div>
              <div className="grid gap-5 sm:grid-cols-2"><FormInput id="product-name" label="Product name" value={productForm.name} onChange={(v) => updateProductField("name", v)} placeholder="e.g. Native fabric" maxLength={150} required disabled={creatingProduct || updatingProduct} /><CategorySelect id="product-category" value={productForm.categoryId} categories={productCategories} mode="product" onChange={(v) => updateProductField("categoryId", v)} disabled={creatingProduct || updatingProduct} /></div>
              <div><label htmlFor="product-description" className={labelClass}>Description <span className="font-normal text-gray-400">(optional)</span></label><textarea id="product-description" className="w-full resize-y rounded-xl border border-[var(--rm-border-strong)] bg-white px-4 py-3 text-sm outline-none transition focus:border-[var(--rm-coral)] focus:ring-4 focus:ring-[var(--rm-coral)]/10 disabled:bg-gray-50" value={productForm.description} onChange={(e) => updateProductField("description", e.target.value)} rows={3} maxLength={2000} placeholder="Describe the product" disabled={creatingProduct || updatingProduct} /></div>
              <div className="grid gap-5 xl:grid-cols-2"><div className="grid gap-4 sm:grid-cols-2"><FormInput id="product-price" label="Selling price (₦)" type="number" min="0" max={String(MAX_PRISMA_INT)} step="1" value={productForm.price} onChange={(v) => updateProductField("price", v)} placeholder="Enter current selling price" disabled={creatingProduct || updatingProduct} help="Leave empty when customers need to ask for pricing." /><FormInput id="product-original-price" label="Original price (₦) (optional)" type="number" min="1" max={String(MAX_PRISMA_INT)} step="1" value={productForm.originalPrice} onChange={(v) => updateProductField("originalPrice", v)} placeholder="Enter previous price" disabled={creatingProduct || updatingProduct} help="Used to show a discount. It must be higher than the selling price." /><AvailabilitySelect id="product-availability" value={productForm.availability} onChange={(v) => updateProductField("availability", v)} disabled={creatingProduct || updatingProduct} /><div className="sm:col-span-2"><FormInput id="product-stock-quantity" label="Available stock quantity (optional)" type="number" min="0" max={String(MAX_PRISMA_INT)} step="1" value={productForm.stockQuantity} onChange={(v) => updateProductField("stockQuantity", v)} placeholder="Enter available quantity" disabled={creatingProduct || updatingProduct} help="Leave empty to disable stock tracking. Enter 0 when the product is out of stock." /></div></div><div className="min-w-0 rounded-2xl border border-[var(--rm-border)] bg-white p-4"><p className="text-xs font-bold">Product images</p><p className="mt-1 text-[10px] leading-4 text-gray-500">The first image becomes the cover image.</p><div className="mt-3 min-w-0"><ProductImageUpload value={productForm.images} onChange={(images) => updateProductField("images", images)} disabled={creatingProduct || updatingProduct} /></div></div></div>
              <section className="rounded-2xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] p-4 sm:p-5" aria-labelledby="product-package-heading">
                <div className="mb-4">
                  <h3 id="product-package-heading" className="text-sm font-bold text-[var(--rm-ink)]">Package and delivery</h3>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-[var(--rm-muted)]">Enter the measurements of the packaged item, not just the product itself. These details are used to calculate courier delivery. Weight is in kilograms; dimensions are in centimetres.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <FormInput id="product-shipping-weight" label="Package weight (kg)" type="number" min="0.01" max="1000" step="0.01" value={productForm.shippingWeightKg} onChange={(v) => updateProductField("shippingWeightKg", v)} placeholder="e.g. 1.2" disabled={creatingProduct || updatingProduct} />
                  <FormInput id="product-shipping-length" label="Package length (cm)" type="number" min="0.1" max="1000" step="0.1" value={productForm.shippingLengthCm} onChange={(v) => updateProductField("shippingLengthCm", v)} placeholder="e.g. 30" disabled={creatingProduct || updatingProduct} />
                  <FormInput id="product-shipping-width" label="Package width (cm)" type="number" min="0.1" max="1000" step="0.1" value={productForm.shippingWidthCm} onChange={(v) => updateProductField("shippingWidthCm", v)} placeholder="e.g. 20" disabled={creatingProduct || updatingProduct} />
                  <FormInput id="product-shipping-height" label="Package height (cm)" type="number" min="0.1" max="1000" step="0.1" value={productForm.shippingHeightCm} onChange={(v) => updateProductField("shippingHeightCm", v)} placeholder="e.g. 10" disabled={creatingProduct || updatingProduct} />
                </div>
                <p className="mt-3 text-[11px] leading-5 text-[var(--rm-muted)]">All four measurements are required for a fixed-price product marked Available. You may leave all four blank for a discovery-only or Ask seller listing; buyers will not be able to complete checkout until delivery information is added.</p>
              </section>
              <div className="flex flex-col gap-3 border-t border-[#E5E0D8] pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-gray-500">{editingProductId ? "Changes update this existing product." : `${remainingProductSlots} active ${remainingProductSlots === 1 ? "slot" : "slots"} remaining.`}</p><button type="submit" disabled={creatingProduct || updatingProduct} className={`${primaryButtonClass} min-h-12 w-full px-6 text-sm sm:w-auto`}>{creatingProduct || updatingProduct ? <><LoaderCircle className="h-4 w-4 animate-spin" /> {editingProductId ? "Saving..." : "Adding..."}</> : <>{editingProductId ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{editingProductId ? "Save changes" : "Add product"}</>}</button></div>
            </form>}

            <div className="p-5 sm:p-6">
              {dashboardProducts.length > 0 && <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="relative min-w-0 flex-1 sm:max-w-xl"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" /><input id="seller-product-search" type="search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search your products by name, category or description..." aria-label="Search your products" className="rm-input h-11 w-full pl-10 pr-4" />{productSearch && <button type="button" onClick={() => setProductSearch("")} aria-label="Clear product search" className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-[var(--rm-coral-soft)] hover:text-[var(--rm-coral-dark)]"><X className="h-3.5 w-3.5" /></button>}</div><p className="shrink-0 text-[11px] text-gray-500">Showing {filteredDashboardProducts.length} of {dashboardProducts.length} products</p></div>}
              {dashboardProducts.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--rm-border-strong)] bg-[var(--rm-surface-muted)] px-5 py-10 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-gray-400 shadow-sm"><Package className="h-6 w-6" /></div><h3 className="mt-4 text-sm font-bold">No products yet</h3><p className="mx-auto mt-1 max-w-[430px] text-xs leading-5 text-gray-500">Add your first product so customers can see what your business sells.</p><button type="button" onClick={openProductForm} disabled={reachedProductLimit || editingBusiness} className={`${primaryButtonClass} mt-4 min-h-10`}><Plus className="h-4 w-4" /> Add your first product</button></div>
              : filteredDashboardProducts.length === 0 ? <div className="rounded-2xl border border-dashed border-[var(--rm-border-strong)] bg-[var(--rm-surface-muted)] px-5 py-10 text-center"><Search className="mx-auto h-8 w-8 text-gray-300" /><h3 className="mt-3 text-sm font-bold">No matching products</h3><p className="mt-1 text-xs leading-5 text-gray-500">Try a different product name, category or description.</p><button type="button" onClick={() => setProductSearch("")} className={`${secondaryButtonClass} mt-4`}>Clear search</button></div>
              : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{filteredDashboardProducts.map((product) => {
                const cover = product.images?.slice().sort((a, b) => a.sortOrder - b.sortOrder)[0]?.url || product.imageUrl;
                const hasDiscount = product.price != null && product.originalPrice != null && product.originalPrice > product.price && product.originalPrice > 0;
                const discountPercentage = hasDiscount ? Math.round(((product.originalPrice! - product.price!) / product.originalPrice!) * 100) : null;
                return <article key={product.id} className="rm-product-card flex min-w-0 flex-col"><div className="rm-product-media">{cover ? <img src={cover} alt={product.name} loading="lazy" className="rm-product-image rm-image-cover" /> : <div className="absolute inset-0 flex h-full w-full items-center justify-center text-gray-300"><Package className="h-10 w-10" /></div>}</div><div className="flex flex-1 flex-col p-4"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-bold">{product.name}</h3><p className="mt-1 text-[11px] text-gray-500">{product.category?.parent?.name ? `${product.category.parent.name} · ${product.category.name}` : product.category?.name ?? "No category"}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${getStatusClasses(product.status)}`}>{product.status}</span></div><p className="mt-3 line-clamp-2 min-h-[34px] text-xs leading-5 text-gray-500">{product.description || "No description added."}</p><div className="mt-3 flex min-w-0 items-start justify-between gap-3"><div className="min-w-0">{product.price != null ? <><p className="break-words text-sm font-bold text-[var(--rm-coral-dark)]">{formatNaira(product.price)}</p>{hasDiscount && <div className="mt-1 flex flex-wrap items-center gap-2"><span className="text-[11px] text-gray-400 line-through">{formatNaira(product.originalPrice!)}</span><span className="rounded-md bg-[var(--rm-coral-soft)] px-2 py-1 text-[9px] font-bold text-[var(--rm-coral-dark)]">{discountPercentage}% OFF</span></div>}</> : <p className="text-xs font-semibold text-gray-500">Price not listed</p>}</div><span className="max-w-[46%] shrink-0 text-right text-[10px] font-medium text-gray-400">{formatAvailability(product.availability)}</span></div><div className={`mt-3 rounded-xl px-3 py-2 text-[10px] font-semibold ${product.stockQuantity == null ? "bg-[var(--rm-surface-muted)] text-gray-500" : product.stockQuantity === 0 ? "bg-[var(--rm-red-bg)] text-[var(--rm-red)]" : "bg-[var(--rm-green-bg)] text-[var(--rm-green)]"}`}>Stock: {product.stockQuantity == null ? "Not tracked" : product.stockQuantity === 0 ? "Out of stock" : `${product.stockQuantity.toLocaleString("en-NG")} available`}</div><div className="mt-auto flex gap-2 pt-4"><button type="button" onClick={() => startEditingProduct(product)} disabled={Boolean(deletingProductId) || editingBusiness} className={`${secondaryButtonClass} min-w-0 flex-1`}><Pencil className="h-3.5 w-3.5" /> Edit</button><button type="button" onClick={() => void deleteProduct(product)} disabled={Boolean(deletingProductId) || editingBusiness} aria-label={`Delete ${product.name}`} className="inline-flex shrink-0 items-center justify-center rounded-xl border border-[#F1D5D0] px-3 py-2.5 text-xs font-semibold text-[var(--rm-red)] transition hover:bg-[var(--rm-red-bg)] disabled:cursor-not-allowed disabled:opacity-50">{deletingProductId === product.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button></div></div></article>;
              })}</div>}
            </div>
          </section>
        </>}

        <footer className="mt-8 border-t border-[var(--rm-border)] py-5"><div className="flex flex-col gap-2 text-[11px] text-gray-400 sm:flex-row sm:items-center sm:justify-between"><p>ReMarket Seller Portal · Find it nearby.</p><div className="flex flex-wrap gap-4"><FooterLink href="/account">Account</FooterLink><FooterLink href="/saved">Saved items</FooterLink><FooterLink href="/seller/profile">Profile settings</FooterLink><button type="button" onClick={() => void logout()} className="text-left hover:text-[var(--rm-coral-dark)]">Sign out</button></div></div></footer>
      </div>
    </main>
  );
}

function OverviewCard({ icon, title, value, detail }: { icon: ReactNode; title: string; value: string; detail?: string }) {
  return <div className="min-w-0 rounded-[var(--rm-radius-md)] border border-[var(--rm-border)] bg-white p-4"><div className="flex items-center gap-2 text-gray-400">{icon}<span className="text-[10px] font-semibold uppercase tracking-wide">{title}</span></div><p className="mt-2 break-words text-sm font-semibold text-gray-800">{value}</p>{detail && <p className="mt-1 break-words text-[11px] leading-5 text-gray-500">{detail}</p>}</div>;
}
function ContactVisibility({ id, value, onChange, disabled }: { id: string; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return <div className="mt-2 rounded-xl border border-[var(--rm-border)] bg-[var(--rm-surface-muted)] p-4 sm:col-span-2"><div className="flex items-start gap-3"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${value ? "bg-[var(--rm-green-bg)] text-[var(--rm-green)]" : "bg-[var(--rm-red-bg)] text-[var(--rm-coral-dark)]"}`}>{value ? <Globe className="h-5 w-5" /> : <LockKeyhole className="h-5 w-5" />}</div><div className="min-w-0 flex-1"><label htmlFor={id} className="block cursor-pointer text-sm font-bold text-[var(--rm-ink)]">Show contact information publicly</label><p className="mt-1 text-xs leading-5 text-gray-500">Allow customers visiting your public business page to see your phone number and contact links.</p><p className="mt-2 text-[10px] font-semibold text-[var(--rm-coral-dark)]">Contact information is private by default.</p></div><input id={id} type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} disabled={disabled} className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-[var(--rm-coral)]" /></div></div>;
}
function FormInput({ id, label, value, onChange, type = "text", placeholder, required, disabled, maxLength, min, max, step, help }: { id: string; label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean; disabled?: boolean; maxLength?: number; min?: string; max?: string; step?: string; help?: string }) {
  return <div><label htmlFor={id} className={labelClass}>{label} {required && <span className="text-[var(--rm-coral)]">*</span>}</label><input id={id} className={inputClass} type={type} min={min} max={max} step={step} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} disabled={disabled} maxLength={maxLength} />{help && <p className="mt-1 text-[10px] leading-4 text-gray-400">{help}</p>}</div>;
}
function CategorySelect({ id, value, categories, onChange, disabled, mode }: { id: string; value: string; categories: SellerCategoryNode[]; onChange: (value: string) => void; disabled?: boolean; mode: "business" | "product" }) {
  return <div><label htmlFor={id} className={labelClass}>{mode === "business" ? "Business category" : "Product category"}</label><select id={id} className={inputClass} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}><option value="">{mode === "business" ? "Select business category" : "Select product category"}</option>{mode === "business" ? categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>) : categories.map((category) => category.children.length ? <optgroup key={category.id} label={category.name}>{category.children.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}</optgroup> : <option key={category.id} value={category.id}>{category.name}</option>)}</select><p className="mt-1 text-[10px] leading-4 text-gray-400">{mode === "business" ? "Choose the broad category that best describes your business." : "Choose a specific product category. Subcategories are grouped under their parent category."}</p></div>;
}
function AvailabilitySelect({ id, value, onChange, disabled }: { id: string; value: Availability; onChange: (value: Availability) => void; disabled?: boolean }) {
  return <div><label htmlFor={id} className={labelClass}>Availability</label><select id={id} className={inputClass} value={value} onChange={(event) => onChange(event.target.value as Availability)} disabled={disabled}><option value="ASK_SELLER">Ask seller</option><option value="AVAILABLE">Available</option><option value="UNAVAILABLE">Unavailable</option></select></div>;
}
function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ${getStatusClasses(status)}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{status}</span>;
}
function AccountLink({ href, icon, children }: { href: string; icon: ReactNode; children: ReactNode }) {
  return <Link href={href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-gray-700 hover:bg-[var(--rm-cream)] hover:text-[var(--rm-coral-dark)]"><span className="h-4 w-4 text-gray-400">{icon}</span>{children}</Link>;
}
function MobileLink({ href, onClick, active, children }: { href: string; onClick: () => void; active?: boolean; children: ReactNode }) {
  return <Link href={href} onClick={onClick} className={`rounded-xl px-4 py-3 text-sm ${active ? "bg-[var(--rm-coral-soft)] font-bold text-[var(--rm-coral)]" : "font-medium text-gray-700 hover:bg-[var(--rm-cream)]"}`}>{children}</Link>;
}
function FooterLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="hover:text-[var(--rm-coral-dark)]">{children}</Link>;
}
