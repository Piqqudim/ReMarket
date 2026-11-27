"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Loader2, MessageSquareText, Star } from "lucide-react";

type SellerReview = { id: string; productId: string | null; productName: string; rating: number; comment: string | null; status: string; sellerResponse: string | null; sellerRespondedAt: string | null; createdAt: string; buyerName: string; openReportCount: number };
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function Stars({ value }: { value: number }) { return <span className="inline-flex gap-0.5" aria-label={`${value} out of 5 stars`}>{[1,2,3,4,5].map((n)=><Star key={n} size={13} className={n<=value?"fill-[#F5A623] text-[#F5A623]":"text-[#D7D0C8]"}/>)}</span>; }

export default function SellerProductReviewsPage() {
  const router = useRouter();
  const { status } = useSession();
  const [reviews, setReviews] = useState<SellerReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/seller/product-reviews", { cache: "no-store" });
      const data: unknown = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) { router.replace("/seller/login"); return; }
      if (!response.ok || !isRecord(data) || !Array.isArray(data.reviews)) throw new Error(isRecord(data) && typeof data.error === "string" ? data.error : "Unable to load reviews.");
      const parsed = data.reviews.filter((item): item is SellerReview => isRecord(item) && typeof item.id === "string" && typeof item.productName === "string" && typeof item.rating === "number");
      setReviews(parsed); setDrafts(Object.fromEntries(parsed.map((item) => [item.id, item.sellerResponse ?? ""])));
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Unable to load reviews."); }
    finally { setLoading(false); }
  }, [router]);
  useEffect(() => { if (status === "unauthenticated") router.replace("/seller/login"); else if (status === "authenticated") void load(); }, [status, router, load]);

  async function saveResponse(review: SellerReview) {
    if (!review.productId) return;
    const responseText = (drafts[review.id] ?? "").trim();
    setSavingId(review.id); setError("");
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(review.productId)}/reviews/${encodeURIComponent(review.id)}/response`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response: responseText }) });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(isRecord(data) && typeof data.error === "string" ? data.error : "Unable to publish your response.");
      await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Unable to publish your response."); }
    finally { setSavingId(null); }
  }

  return <main className="min-h-dvh bg-[#FCFAF6] px-3 py-5 text-[#2E241F] sm:px-6 sm:py-8"><div className="mx-auto max-w-5xl">
    <Link href="/seller" className="mb-5 inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold text-[#756B61] hover:text-[#9F2D18]"><ArrowLeft size={16}/>Seller Dashboard</Link>
    <header className="rounded-3xl border border-[#EAE6DF] bg-white p-5 sm:p-7"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#FF5A36]">Seller workspace</p><h1 className="mt-1 text-2xl font-extrabold">Product reviews</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#756B61]">Read feedback from buyers who received products through ReMarket and respond to published reviews.</p></header>
    {error && <p role="alert" className="mt-4 rounded-xl bg-[#FFF0ED] px-4 py-3 text-sm font-semibold text-[#9F2D18]">{error}</p>}
    {loading ? <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-[#756B61]"><Loader2 className="animate-spin" size={18}/>Loading product reviews…</div> : reviews.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-[#D9D0C7] bg-white p-10 text-center"><MessageSquareText className="mx-auto h-9 w-9 text-[#A39A91]"/><h2 className="mt-3 font-bold">No product reviews yet</h2><p className="mt-1 text-sm text-[#756B61]">Verified reviews will appear here after buyers receive their orders.</p></div> : <div className="mt-5 space-y-4">{reviews.map((review)=><article key={review.id} className="rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-extrabold">{review.productName}</h2><p className="mt-1 text-xs text-[#756B61]">{review.buyerName} · {new Date(review.createdAt).toLocaleDateString("en-NG")}</p><div className="mt-2 flex items-center gap-2"><Stars value={review.rating}/><span className="text-xs font-bold">{review.rating}/5</span></div></div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-[#EEF9F2] px-3 py-1 text-[10px] font-bold text-[#287A4B]">{review.status}</span>{review.openReportCount>0&&<span className="rounded-full bg-[#FFF0ED] px-3 py-1 text-[10px] font-bold text-[#9F2D18]">Reported</span>}</div></div>
      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#514840]">{review.comment || "No written comment."}</p>
      <div className="mt-4 border-t border-[#EAE6DF] pt-4">
        {review.status === "PUBLISHED" ? (
          <>
            <label className="block text-xs font-bold" htmlFor={`response-${review.id}`}>Your response</label>
            <textarea id={`response-${review.id}`} value={drafts[review.id] ?? ""} onChange={(event) => setDrafts((current) => ({ ...current, [review.id]: event.target.value.slice(0, 1000) }))} rows={3} maxLength={1000} placeholder="Respond professionally to the buyer's feedback…" className="mt-2 w-full rounded-xl border border-[#EAE6DF] bg-[#FFFDFC] p-3 text-sm outline-none focus:border-[#FF5A36]" />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] text-[#8A8178]">{(drafts[review.id] ?? "").length}/1,000 characters</span>
              <button type="button" disabled={!review.productId || savingId === review.id || !(drafts[review.id] ?? "").trim()} onClick={() => void saveResponse(review)} className="rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#E94A28] disabled:opacity-50">
                {savingId === review.id ? "Saving…" : review.sellerResponse ? "Update response" : "Publish response"}
              </button>
            </div>
          </>
        ) : (
          <p className="text-xs leading-5 text-[#756B61]">This review is {review.status.toLowerCase()} and cannot receive a seller response.</p>
        )}
      </div>
    </article>)}</div>}
  </div></main>;
}
