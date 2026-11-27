"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSession } from "next-auth/react";
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, MessageSquareText, Star } from "lucide-react";

type PublicReview = {
  id: string; rating: number; comment: string | null; createdAt: string;
  buyerName: string; verifiedPurchase: boolean; sellerResponse: string | null;
  sellerRespondedAt: string | null; canReport: boolean;
};
type EligiblePurchase = { orderItemId: string; productName: string; purchasedAt: string; sellerOrderCode: string };
type ReviewPayload = {
  reviews: PublicReview[];
  summary: { rating: number | null; reviewCount: number; ratingDistribution: Record<string, number> };
  pagination: { page: number; limit: number; total: number; totalPages: number; hasNextPage: boolean };
  eligiblePurchases: EligiblePurchase[];
  ownReviews: Array<{ id: string; orderItemId: string | null; rating: number; comment: string | null; status: string; createdAt: string; updatedAt: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function readableError(value: unknown, fallback: string) { return isRecord(value) && typeof value.error === "string" ? value.error : fallback; }
function Stars({ value, onChange, size = 18 }: { value: number; onChange?: (value: number) => void; size?: number }) {
  return <div className="flex items-center gap-1" role={onChange ? "radiogroup" : "img"} aria-label={`${value} out of 5 stars`}>{[1, 2, 3, 4, 5].map((n) => onChange ? <button type="button" key={n} role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => onChange(n)} className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]"><Star size={size} className={n <= value ? "fill-[#F5A623] text-[#F5A623]" : "text-[#D7D0C8]"} /></button> : <Star key={n} size={size} className={n <= Math.round(value) ? "fill-[#F5A623] text-[#F5A623]" : "text-[#D7D0C8]"} />)}</div>;
}
function dateLabel(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }); }

export default function ProductReviewsPanel({ productId }: { productId: string }) {
  const { data: session } = useSession();
  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [orderItemId, setOrderItemId] = useState("");
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(productId)}/reviews?page=${page}&limit=8&sort=${sort}`, { cache: "no-store", signal });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok || !isRecord(data) || !isRecord(data.summary) || !Array.isArray(data.reviews) || !isRecord(data.pagination) || !Array.isArray(data.eligiblePurchases) || !Array.isArray(data.ownReviews)) throw new Error(readableError(data, "Unable to load product reviews."));
      const parsedData = data as unknown as ReviewPayload;

setPayload(parsedData);

setOrderItemId(
  (current) => current || parsedData.eligiblePurchases[0]?.orderItemId || ""
);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load product reviews.");
    } finally { setLoading(false); }
  }, [productId, page, sort]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  const eligiblePurchases = useMemo(() => payload?.eligiblePurchases ?? [], [payload]);
  const ownReviews = useMemo(() => payload?.ownReviews ?? [], [payload]);
  const isBuyer = (session?.user as { role?: string } | undefined)?.role === "BUYER";

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!orderItemId || !comment.trim()) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const url = editingReviewId
        ? `/api/products/${encodeURIComponent(productId)}/reviews/${encodeURIComponent(editingReviewId)}`
        : `/api/products/${encodeURIComponent(productId)}/reviews`;
      const response = await fetch(url, { method: editingReviewId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderItemId, rating, comment }) });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readableError(data, "Unable to submit your review."));
      setSuccess(editingReviewId ? "Your review has been updated." : "Thank you. Your verified purchase review is published.");
      setComment(""); setRating(5); setEditingReviewId(null); setPage(1);
      await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to submit your review."); }
    finally { setSaving(false); }
  }

  function editReview(review: ReviewPayload["ownReviews"][number]) {
    setEditingReviewId(review.id); setOrderItemId(review.orderItemId ?? ""); setRating(review.rating); setComment(review.comment ?? ""); setError(""); setSuccess("");
    const form = document.getElementById("product-review-form"); form?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function reportReview(reviewId: string) {
    const reason = window.prompt("Why are you reporting this review? Enter SPAM, ABUSIVE, MISLEADING, NOT_PRODUCT_RELATED, PERSONAL_INFORMATION or OTHER.");
    if (!reason) return;
    setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(productId)}/reviews/${encodeURIComponent(reviewId)}/report`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readableError(data, "Unable to report this review."));
      setSuccess("Thank you. The review has been sent to ReMarket for moderation.");
    } catch (reportError) { setError(reportError instanceof Error ? reportError.message : "Unable to report this review."); }
  }

  return <section id="product-reviews" className="mt-10 scroll-mt-24 rounded-3xl border border-[var(--rm-border)] bg-white p-4 sm:p-6" aria-labelledby="product-reviews-heading">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--rm-coral)]">Buyer feedback</p><h2 id="product-reviews-heading" className="mt-1 text-xl font-extrabold text-[var(--rm-ink)]">Product reviews</h2><p className="mt-1 text-xs leading-5 text-[var(--rm-muted)]">Reviews are available only from buyers with a delivered ReMarket purchase.</p></div>
      <div className="flex items-center gap-3 rounded-2xl bg-[var(--rm-surface-muted)] px-4 py-3"><span className="text-3xl font-black text-[var(--rm-coral-dark)]">{payload?.summary.rating ? payload.summary.rating.toFixed(1) : "—"}</span><div><Stars value={payload?.summary.rating ?? 0} size={14} /><p className="mt-1 text-[11px] text-[var(--rm-muted)]">{(payload?.summary.reviewCount ?? 0).toLocaleString("en-NG")} reviews</p></div></div>
    </div>

    {payload && <div className="mt-5 grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
      <div className="space-y-2">{[5, 4, 3, 2, 1].map((n) => { const count = payload.summary.ratingDistribution[String(n)] ?? 0; const percentage = payload.summary.reviewCount ? Math.round(count / payload.summary.reviewCount * 100) : 0; return <div key={n} className="flex items-center gap-2 text-[11px]"><span className="w-3 text-[var(--rm-muted)]">{n}</span><Star size={12} className="fill-[#F5A623] text-[#F5A623]"/><div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--rm-border)]"><div className="h-full rounded-full bg-[#F5A623]" style={{ width: `${percentage}%` }}/></div><span className="w-6 text-right text-[var(--rm-muted)]">{count}</span></div>; })}</div>
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-[var(--rm-border)] p-3"><div><p className="text-sm font-bold text-[var(--rm-ink)]">Sort reviews</p><p className="mt-1 text-xs text-[var(--rm-muted)]">Compare recent feedback and different ratings.</p></div><label className="flex items-center gap-2 text-xs font-semibold text-[var(--rm-ink)]"><span className="sr-only">Sort reviews</span><ChevronDown size={14}/><select value={sort} onChange={(event) => { setPage(1); setSort(event.target.value); }} className="h-10 rounded-xl border border-[var(--rm-border)] bg-white px-3"><option value="recent">Most recent</option><option value="highest">Highest rated</option><option value="lowest">Lowest rated</option></select></label></div>
    </div>}

    {success && <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-[#EEF9F2] px-3 py-2 text-xs font-semibold text-[#287A4B]"><CheckCircle2 size={15}/>{success}</p>}
    {error && <p role="alert" className="mt-4 flex items-center gap-2 rounded-xl bg-[#FFF0ED] px-3 py-2 text-xs font-semibold text-[#9F2D18]"><AlertCircle size={15}/>{error}</p>}

    {isBuyer && (eligiblePurchases.length > 0 || Boolean(editingReviewId)) && <form id="product-review-form" onSubmit={submitReview} className="mt-5 rounded-2xl border border-[#FFD6CA] bg-[#FFF8F5] p-4 sm:p-5">
      <div className="flex items-center gap-2"><MessageSquareText size={18} className="text-[var(--rm-coral)]"/><h3 className="text-sm font-extrabold text-[var(--rm-ink)]">{editingReviewId ? "Edit your review" : "Share your experience"}</h3></div>
      {eligiblePurchases.length > 1 && <label className="mt-4 block text-xs font-semibold text-[var(--rm-ink)]">Delivered purchase<select value={orderItemId} onChange={(event) => setOrderItemId(event.target.value)} disabled={Boolean(editingReviewId)} className="rm-input mt-1 h-11 w-full">{eligiblePurchases.map((purchase) => <option key={purchase.orderItemId} value={purchase.orderItemId}>{purchase.productName} · {purchase.sellerOrderCode}</option>)}</select></label>}
      <div className="mt-4"><p className="mb-2 text-xs font-semibold text-[var(--rm-ink)]">Your rating</p><Stars value={rating} onChange={setRating} size={25}/></div>
      <label className="mt-4 block text-xs font-semibold text-[var(--rm-ink)]">Your review<textarea value={comment} onChange={(event) => setComment(event.target.value.slice(0, 2_000))} rows={4} maxLength={2_000} placeholder="What did you think about the product?" className="rm-input mt-1 w-full resize-y p-3 text-sm" required/><span className="mt-1 block text-right text-[10px] font-medium text-[var(--rm-muted)]">{comment.length}/2,000</span></label>
      <div className="mt-3 flex flex-wrap items-center gap-3"><button type="submit" disabled={saving || !comment.trim()} className="rm-button rm-button-primary min-w-32">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}{editingReviewId ? "Save changes" : "Publish review"}</button>{editingReviewId && <button type="button" onClick={() => { setEditingReviewId(null); setComment(""); setRating(5); }} className="rm-button rm-button-secondary">Cancel edit</button>}<span className="text-[10px] text-[var(--rm-muted)]">Verified purchase reviews only.</span></div>
    </form>}
    {isBuyer && eligiblePurchases.length === 0 && ownReviews.length === 0 && <div className="mt-5 rounded-2xl bg-[var(--rm-surface-muted)] p-4 text-xs leading-5 text-[var(--rm-muted)]">You can review this product after it has been delivered as part of a ReMarket order.</div>}

    <div className="mt-5 space-y-3">
      {loading && <div className="flex items-center justify-center gap-2 py-8 text-xs text-[var(--rm-muted)]"><Loader2 size={16} className="animate-spin"/>Loading reviews…</div>}
      {!loading && payload?.reviews.length === 0 && <div className="rounded-2xl border border-dashed border-[var(--rm-border-strong)] px-4 py-9 text-center"><MessageSquareText className="mx-auto h-8 w-8 text-[var(--rm-muted)]"/><p className="mt-3 text-sm font-bold text-[var(--rm-ink)]">No published reviews yet</p><p className="mt-1 text-xs text-[var(--rm-muted)]">Be the first eligible buyer to share feedback.</p></div>}
      {payload?.reviews.map((review) => <article key={review.id} className="rounded-2xl border border-[var(--rm-border)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-bold text-[var(--rm-ink)]">{review.buyerName}</p><div className="mt-1 flex flex-wrap items-center gap-2"><Stars value={review.rating} size={13}/><span className="text-[10px] text-[var(--rm-muted)]">{dateLabel(review.createdAt)}</span><span className="rounded-full bg-[#EEF9F2] px-2 py-0.5 text-[9px] font-bold text-[#287A4B]">Verified purchase</span></div></div>{isBuyer && review.canReport && <button type="button" onClick={() => void reportReview(review.id)} className="text-[10px] font-semibold text-[var(--rm-muted)] underline underline-offset-2 hover:text-[var(--rm-coral-dark)]">Report</button>}</div>
        {review.comment && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--rm-muted)]">{review.comment}</p>}
        {review.sellerResponse && <div className="mt-3 rounded-xl bg-[var(--rm-surface-muted)] p-3"><p className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--rm-coral-dark)]">Seller response</p><p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[var(--rm-ink)]">{review.sellerResponse}</p>{review.sellerRespondedAt && <p className="mt-1 text-[10px] text-[var(--rm-muted)]">{dateLabel(review.sellerRespondedAt)}</p>}</div>}
      </article>)}
    </div>
    {payload && payload.pagination.totalPages > 1 && <div className="mt-5 flex items-center justify-between"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rm-button rm-button-secondary">Previous</button><span className="text-xs text-[var(--rm-muted)]">Page {page} of {payload.pagination.totalPages}</span><button type="button" disabled={!payload.pagination.hasNextPage || loading} onClick={() => setPage((current) => current + 1)} className="rm-button rm-button-secondary">Next</button></div>}
    {isBuyer && ownReviews.length > 0 && <div className="mt-5 border-t border-[var(--rm-border)] pt-4"><h3 className="text-xs font-extrabold text-[var(--rm-ink)]">Your reviews</h3><div className="mt-2 space-y-2">{ownReviews.map((review) => <div key={review.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--rm-surface-muted)] px-3 py-2"><div><Stars value={review.rating} size={12}/><p className="mt-1 text-[10px] text-[var(--rm-muted)]">{review.status === "PUBLISHED" ? "Published" : review.status}</p></div>{review.status !== "REMOVED" && Boolean(review.orderItemId) && <button type="button" onClick={() => editReview(review)} className="text-xs font-bold text-[var(--rm-coral-dark)]">Edit review</button>}</div>)}</div></div>}
  </section>;
}
