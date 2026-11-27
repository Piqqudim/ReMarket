"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, PackageCheck, RefreshCw, Search, Truck } from "lucide-react";

type ShipmentRow = {
  id: string;
  provider: string;
  providerOrderId: string | null;
  courierId: string | null;
  courierName: string | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  waybillUrl: string | null;
  status: string;
  shippingFee: number;
  currency: string;
  estimatedDelivery: string | null;
  failureReason: string | null;
  bookedAt: string | null;
  pickedUpAt: string | null;
  inTransitAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  sellerOrder: {
    id: string;
    sellerOrderCode: string;
    status: string;
    seller: { id: string; name: string | null; email: string };
    business: { id: string; name: string };
    order: { id: string; orderCode: string; status: string; deliveryRecipient: string; deliveryPhone: string; deliveryAddress: string; deliveryArea: string };
  };
  quotePackage: { packageWeightKg: number; packageLengthCm: number; packageWidthCm: number; packageHeightCm: number; selectedCourierName: string | null; selectedDeliveryFee: number | null; selectedDeliveryEta: string | null } | null;
  trackingEvents: Array<{ id: string; status: string; statusLabel: string; message: string | null; location: string | null; occurredAt: string | null; createdAt: string }>;
};
type DeliveryResponse = { success: boolean; shipments: ShipmentRow[]; pagination: { page: number; pageSize: number; total: number; totalPages: number }; statusCounts: Record<string, number>; error?: string };

const STATUSES = ["", "BOOKING_PENDING", "PENDING", "CONFIRMED", "COURIER_ASSIGNED", "AWAITING_PICKUP", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERY_FAILED", "DELIVERED", "RETURNING", "RETURNED", "CANCELLED", "FAILED"];
function readable(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function formatDate(value: string | null) { if (!value) return "—"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" }); }
function formatMoney(value: number, currency: string) { return new Intl.NumberFormat("en-NG", { style: "currency", currency: currency || "NGN", maximumFractionDigits: 0 }).format(value); }
function statusClasses(status: string) {
  if (status === "DELIVERED") return "bg-[#E8F6EE] text-[#167344]";
  if (["FAILED", "DELIVERY_FAILED", "CANCELLED"].includes(status)) return "bg-[#FCE8E6] text-[#B42318]";
  if (["IN_TRANSIT", "OUT_FOR_DELIVERY", "PICKED_UP"].includes(status)) return "bg-[#EAF2FF] text-[#2456A6]";
  return "bg-[#FFF0D9] text-[#9F5A18]";
}
function safeExternalUrl(value: string | null) { if (!value) return null; try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : null; } catch { return null; } }

export default function AdminDeliveryPage() {
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true); setError("");
    const params = new URLSearchParams({ page: String(page), pageSize: "25" });
    if (appliedQuery) params.set("q", appliedQuery);
    if (status) params.set("status", status);
    try {
      const response = await fetch(`/api/admin/delivery?${params.toString()}`, { cache: "no-store", signal });
      const payload = await response.json().catch(() => null) as DeliveryResponse | null;
      if (!response.ok || !payload?.success || !Array.isArray(payload.shipments)) throw new Error(payload?.error || "Unable to load delivery records.");
      setShipments(payload.shipments); setCounts(payload.statusCounts || {}); setTotal(payload.pagination?.total ?? 0); setTotalPages(payload.pagination?.totalPages ?? 0);
    } catch (loadError) {
      if (signal.aborted) return;
      setShipments([]); setError(loadError instanceof Error ? loadError.message : "Unable to load delivery records.");
    } finally { if (!signal.aborted) setLoading(false); }
  }, [page, appliedQuery, status]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load, reloadKey]);

  const totalRecords = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const moving = (counts.IN_TRANSIT ?? 0) + (counts.OUT_FOR_DELIVERY ?? 0) + (counts.PICKED_UP ?? 0);
  const delivered = counts.DELIVERED ?? 0;
  const exceptions = (counts.FAILED ?? 0) + (counts.DELIVERY_FAILED ?? 0) + (counts.RETURNED ?? 0);

  function applySearch() { setPage(1); setAppliedQuery(query.trim()); }

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-6 pb-12 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#FF5A36]">Operations workspace</p><h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#2E241F] sm:text-3xl">Delivery</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#766C63]">Monitor recorded shipments, courier tracking, delivery progress and exceptions. Shipment statuses are provider-controlled; this workspace does not bypass courier transitions.</p></div><button type="button" onClick={() => setReloadKey((value) => value + 1)} disabled={loading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#E8DED3] bg-white px-4 text-sm font-semibold text-[#514840] hover:bg-[#FFF7F0] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</button></div>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Delivery status summary">{[{ label: "Shipment records", value: totalRecords, icon: Truck }, { label: "In progress", value: moving, icon: RefreshCw }, { label: "Delivered", value: delivered, icon: PackageCheck }, { label: "Exceptions", value: exceptions, icon: MapPin }].map((item) => { const Icon = item.icon; return <article key={item.label} className="rounded-2xl border border-[#E8DED3] bg-white p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-[#766C63]">{item.label}</p><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#FFF0E8] text-[#9F2D18]"><Icon className="h-4 w-4" /></span></div><p className="mt-2 text-2xl font-extrabold tabular-nums text-[#2E241F]">{item.value.toLocaleString("en-NG")}</p></article>; })}</section>

      <section className="overflow-hidden rounded-2xl border border-[#E8DED3] bg-white"><div className="flex flex-col gap-3 border-b border-[#F0E9E2] p-4 sm:flex-row sm:items-center"><div className="flex min-w-0 flex-1 gap-2"><label className="relative min-w-0 flex-1"><span className="sr-only">Search shipments</span><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B8178]" /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") applySearch(); }} placeholder="Tracking code, courier, order or seller" className="min-h-10 w-full rounded-xl border border-[#E8DED3] bg-[#FFFDFC] pl-9 pr-3 text-sm outline-none focus:border-[#FF5A36]" /></label><button type="button" onClick={applySearch} className="min-h-10 rounded-xl bg-[#9F2D18] px-4 text-sm font-semibold text-white hover:bg-[#842512]">Search</button></div><label className="flex items-center gap-2 text-xs font-semibold text-[#766C63]"><span>Status</span><select value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }} className="min-h-10 rounded-xl border border-[#E8DED3] bg-white px-3 text-sm text-[#2E241F] outline-none focus:border-[#FF5A36]">{STATUSES.map((value) => <option key={value || "ALL"} value={value}>{value ? readable(value) : "All statuses"}</option>)}</select></label></div>
        {error && <div role="alert" className="m-4 rounded-xl border border-[#F1D1CC] bg-[#FFF4F2] p-3 text-sm text-[#B42318]">{error}</div>}
        {loading ? <div className="p-10 text-center text-sm text-[#766C63]">Loading shipment records…</div> : shipments.length === 0 ? <div className="p-10 text-center"><Truck className="mx-auto h-8 w-8 text-[#B8AEA4]" /><h2 className="mt-3 text-sm font-bold text-[#2E241F]">No shipment records found</h2><p className="mt-1 text-xs text-[#766C63]">Try another search or status. ReMarket does not create placeholder shipments.</p></div> : <>
          <div className="divide-y divide-[#F0E9E2]">{shipments.map((shipment) => { const trackingUrl = safeExternalUrl(shipment.trackingUrl); const waybillUrl = safeExternalUrl(shipment.waybillUrl); const order = shipment.sellerOrder.order; const dimensions = shipment.quotePackage; return <article key={shipment.id} className="space-y-3 p-4 sm:p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusClasses(shipment.status)}`}>{readable(shipment.status)}</span><span className="text-[10px] text-[#8B8178]">{shipment.provider}</span><span className="text-[10px] text-[#8B8178]">Updated {formatDate(shipment.updatedAt)}</span></div><h2 className="mt-2 break-all text-sm font-extrabold text-[#2E241F]">{order.orderCode} <span className="font-medium text-[#8B8178]">/ {shipment.sellerOrder.sellerOrderCode}</span></h2><p className="mt-1 text-xs text-[#766C63]">{shipment.sellerOrder.business.name} · Seller: {shipment.sellerOrder.seller.name || shipment.sellerOrder.seller.email}</p><p className="mt-1 text-xs text-[#766C63]">Recipient: {order.deliveryRecipient} · {order.deliveryArea}</p><p className="mt-1 break-words text-xs leading-5 text-[#8B8178]">{order.deliveryAddress}</p></div><div className="shrink-0 rounded-xl bg-[#FCFAF6] p-3 lg:min-w-[210px]"><p className="text-[10px] font-semibold uppercase tracking-wide text-[#8B8178]">Courier</p><p className="mt-1 text-sm font-bold text-[#2E241F]">{shipment.courierName || dimensions?.selectedCourierName || "Not assigned"}</p><p className="mt-2 text-xs text-[#766C63]">Tracking: <span className="font-semibold text-[#2E241F]">{shipment.trackingCode || "Not available"}</span></p><p className="mt-1 text-xs text-[#766C63]">Delivery fee: {formatMoney(shipment.shippingFee, shipment.currency)}</p>{trackingUrl && <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex text-xs font-bold text-[#9F2D18] underline">Open tracking</a>}{waybillUrl && <a href={waybillUrl} target="_blank" rel="noopener noreferrer" className="mt-2 ml-3 inline-flex text-xs font-bold text-[#9F2D18] underline">Waybill</a>}</div></div>
                {dimensions && <div className="rounded-xl border border-[#E8DED3] bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#8B8178]">Package measurements recorded for this quote</p><p className="mt-1 text-xs font-semibold text-[#514840]">{dimensions.packageWeightKg.toLocaleString("en-NG", { maximumFractionDigits: 2 })} kg · {dimensions.packageLengthCm.toLocaleString("en-NG", { maximumFractionDigits: 2 })} × {dimensions.packageWidthCm.toLocaleString("en-NG", { maximumFractionDigits: 2 })} × {dimensions.packageHeightCm.toLocaleString("en-NG", { maximumFractionDigits: 2 })} cm</p></div>}
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-[#8B8178]"><span>Booked: {formatDate(shipment.bookedAt)}</span><span>Picked up: {formatDate(shipment.pickedUpAt)}</span><span>In transit: {formatDate(shipment.inTransitAt)}</span><span>Delivered: {formatDate(shipment.deliveredAt)}</span><span>ETA: {shipment.estimatedDelivery || dimensions?.selectedDeliveryEta || "Not recorded"}</span></div>
                {shipment.failureReason && <p className="rounded-xl border border-[#F1D1CC] bg-[#FFF4F2] p-3 text-xs leading-5 text-[#B42318]">Delivery exception: {shipment.failureReason}</p>}
                {shipment.trackingEvents.length > 0 && <details className="rounded-xl border border-[#E8DED3] p-3"><summary className="cursor-pointer text-xs font-semibold text-[#514840]">Recent courier events ({shipment.trackingEvents.length})</summary><div className="mt-3 space-y-3">{shipment.trackingEvents.map((event) => <div key={event.id} className="border-l-2 border-[#F1C5B6] pl-3"><p className="text-xs font-bold text-[#2E241F]">{event.statusLabel || readable(event.status)}</p>{event.message && <p className="mt-1 text-xs leading-5 text-[#766C63]">{event.message}</p>}<p className="mt-1 text-[10px] text-[#8B8178]">{event.location ? `${event.location} · ` : ""}{formatDate(event.occurredAt || event.createdAt)}</p></div>)}</div></details>}
              </article>; })}</div>
          <div className="flex items-center justify-between gap-3 border-t border-[#F0E9E2] px-4 py-3"><p className="text-xs text-[#8B8178]">Showing {shipments.length} of {total} records · Page {page} of {Math.max(totalPages, 1)}</p><div className="flex gap-2"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1 || loading} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#E8DED3] px-3 text-xs font-semibold disabled:opacity-40"><ChevronLeft className="h-4 w-4" />Previous</button><button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages || loading} className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[#E8DED3] px-3 text-xs font-semibold disabled:opacity-40">Next<ChevronRight className="h-4 w-4" /></button></div></div>
        </>}
      </section>
      <p className="mt-4 text-xs leading-5 text-[#8B8178]">Delivery information is read from the existing shipment and order records. Courier status changes remain controlled by the existing provider/webhook workflow; no manual status mutation is exposed here.</p>
    </main>
  );
}
