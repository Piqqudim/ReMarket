"use client";

import Link from "next/link";
import { useState, type ChangeEvent } from "react";
import {
  Home,
  ShoppingBag,
  ClipboardList,
  Heart,
  Plus,
  Image as ImageIcon,
  ArrowLeft,
  CheckCircle2,
  Copy,
  MapPin,
  Phone,
  Store,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Shop", href: "/shop", icon: ShoppingBag },
  { label: "Requests", href: "/my-requests", icon: ClipboardList },
  { label: "Saved", href: "/saved", icon: Heart },
];

const CATEGORIES = [
  "Fashion",
  "Electronics",
  "Food",
  "Beauty",
  "Textiles",
  "Services",
];

type RequestMatch = {
  id: string;
  score: number;
  business: {
    id: string;
    name: string;
    area: string;
    verified: boolean;
  };
};

type CreatedRequest = {
  requestCode: string;
  query: string;
  category?: string | null;
  matches: RequestMatch[];
};

export default function RequestPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [budget, setBudget] = useState("");
  const [locationArea, setLocationArea] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [description, setDescription] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdRequest, setCreatedRequest] =
    useState<CreatedRequest | null>(null);

  async function handleImageUpload(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to upload image");
      }

      setImageUrl(data.url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to upload image"
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(
    event: React.SubmitEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");

    if (!query.trim()) {
      setError("Tell us what you are looking for.");
      return;
    }

    if (!buyerContact.trim()) {
      setError("Add your WhatsApp number or phone number.");
      return;
    }

    const quantityNumber = Number(quantity);

    if (
      !Number.isInteger(quantityNumber) ||
      quantityNumber < 1
    ) {
      setError("Quantity must be at least 1.");
      return;
    }

    const budgetNumber = budget
      ? Number(budget)
      : undefined;

    if (
      budgetNumber !== undefined &&
      (!Number.isFinite(budgetNumber) || budgetNumber < 0)
    ) {
      setError("Enter a valid budget.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: query.trim(),
          category: category || undefined,
          budget: budgetNumber,
          locationArea: locationArea.trim() || undefined,
          quantity: quantityNumber,
          description: description.trim() || undefined,
          imageUrl: imageUrl || undefined,
          buyerContact: buyerContact.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to create request"
        );
      }

      if (!data.request?.requestCode) {
        throw new Error(
          "Request was created but no request code was returned."
        );
      }

      setCreatedRequest({
        requestCode: data.request.requestCode,
        query: data.request.query ?? query.trim(),
        category: data.request.category ?? null,
        matches: Array.isArray(data.request.matches)
          ? data.request.matches
          : [],
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setQuery("");
    setCategory("");
    setBudget("");
    setLocationArea("");
    setQuantity("1");
    setDescription("");
    setBuyerContact("");
    setImageUrl("");
    setError("");
    setCreatedRequest(null);
  }

  async function copyRequestCode() {
    if (!createdRequest?.requestCode) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        createdRequest.requestCode
      );
    } catch {
      // Clipboard may be unavailable in some browsers.
    }
  }

  return (
    <div className="min-h-screen bg-[#FFF7ED] px-3 py-3 sm:px-5 sm:py-5">
      <div className="mx-auto flex min-h-[calc(100vh-24px)] max-w-[1500px] flex-col overflow-hidden rounded-[22px] border border-[#FF5A36] bg-[#FFFDFC] shadow-sm sm:min-h-[calc(100vh-40px)]">
        <header className="flex h-[66px] shrink-0 items-center justify-between border-b border-[#EAE6DF] bg-white px-4 sm:px-6">
          <Link
            href="/"
            className="text-xl font-black tracking-tight text-[#17202A]"
          >
            Re<span className="text-[#FF5A36]">Market</span>
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex items-center gap-2 text-sm font-semibold transition ${
                    item.label === "Requests"
                      ? "text-[#FF5A36]"
                      : "text-[#6F675F] hover:text-[#17202A]"
                  }`}
                >
                  <Icon size={17} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Link
            href="/request"
            className="hidden items-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 sm:flex"
          >
            <Plus size={17} />
            Request something
          </Link>
        </header>

        <div className="flex flex-1">
          <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] p-3 md:block">
            <div className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.label === "Requests";

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${
                      active
                        ? "bg-[#FFE0D6] text-[#9F2D18]"
                        : "text-[#6F675F] hover:bg-white hover:text-[#17202A]"
                    }`}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <div className="mt-8 rounded-2xl bg-[#FFF0D9] p-4">
              <p className="text-sm font-bold text-[#9F2D18]">
                Cannot find it?
              </p>

              <p className="mt-1 text-xs leading-5 text-[#7C5B4E]">
                Tell nearby sellers what you need.
              </p>
            </div>
          </aside>

          <main className="min-w-0 flex-1 overflow-y-auto pb-24 md:pb-8">
            {createdRequest ? (
              <SuccessView
                request={createdRequest}
                onCopy={copyRequestCode}
                onNewRequest={resetForm}
              />
            ) : (
              <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
                <div className="mb-6">
                  <Link
                    href="/"
                    className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-[#8A8178] hover:text-[#17202A]"
                  >
                    <ArrowLeft size={16} />
                    Back home
                  </Link>

                  <div>
                    <h1 className="text-2xl font-black tracking-tight text-[#17202A] sm:text-3xl">
                      Request something
                    </h1>

                    <p className="mt-2 max-w-xl text-sm leading-6 text-[#7C746C]">
                      Cannot find what you need? Tell us what you
                      are looking for and we&apos;ll help connect
                      you with nearby sellers.
                    </p>
                  </div>
                </div>

                <form
                  onSubmit={handleSubmit}
                  className="rounded-2xl border border-[#EAE6DF] bg-white p-4 shadow-sm sm:p-6"
                >
                  {error && (
                    <div className="mb-5 rounded-xl border border-[#F5C4B3] bg-[#FFE0D6] px-4 py-3 text-sm font-medium text-[#9F2D18]">
                      {error}
                    </div>
                  )}

                  <div className="space-y-5">
                    <div>
                      <label
                        htmlFor="query"
                        className="mb-2 block text-sm font-bold text-[#17202A]"
                      >
                        What are you looking for?
                      </label>

                      <input
                        id="query"
                        value={query}
                        onChange={(e) =>
                          setQuery(e.target.value)
                        }
                        placeholder="e.g. black school shoes"
                        className="w-full rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] px-4 py-3 text-sm outline-none transition placeholder:text-[#A69D94] focus:border-[#FF5A36] focus:bg-white"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="category"
                        className="mb-2 block text-sm font-bold text-[#17202A]"
                      >
                        Category
                      </label>

                      <select
                        id="category"
                        value={category}
                        onChange={(e) =>
                          setCategory(e.target.value)
                        }
                        className="w-full rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] px-4 py-3 text-sm outline-none focus:border-[#FF5A36] focus:bg-white"
                      >
                        <option value="">
                          Choose a category
                        </option>

                        {CATEGORIES.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="budget"
                          className="mb-2 block text-sm font-bold text-[#17202A]"
                        >
                          Budget
                        </label>

                        <div className="relative">
                          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#8A8178]">
                            ₦
                          </span>

                          <input
                            id="budget"
                            type="number"
                            min="0"
                            step="1"
                            value={budget}
                            onChange={(e) =>
                              setBudget(e.target.value)
                            }
                            placeholder="Optional"
                            className="w-full rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] py-3 pl-9 pr-4 text-sm outline-none placeholder:text-[#A69D94] focus:border-[#FF5A36] focus:bg-white"
                          />
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="quantity"
                          className="mb-2 block text-sm font-bold text-[#17202A]"
                        >
                          Quantity
                        </label>

                        <input
                          id="quantity"
                          type="number"
                          min="1"
                          step="1"
                          value={quantity}
                          onChange={(e) =>
                            setQuantity(e.target.value)
                          }
                          className="w-full rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] px-4 py-3 text-sm outline-none focus:border-[#FF5A36] focus:bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="locationArea"
                        className="mb-2 block text-sm font-bold text-[#17202A]"
                      >
                        Your area
                      </label>

                      <div className="relative">
                        <MapPin
                          size={17}
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8A8178]"
                        />

                        <input
                          id="locationArea"
                          value={locationArea}
                          onChange={(e) =>
                            setLocationArea(e.target.value)
                          }
                          placeholder="e.g. LASU, Ikeja, Yaba"
                          className="w-full rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] py-3 pl-11 pr-4 text-sm outline-none placeholder:text-[#A69D94] focus:border-[#FF5A36] focus:bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="description"
                        className="mb-2 block text-sm font-bold text-[#17202A]"
                      >
                        More details
                      </label>

                      <textarea
                        id="description"
                        value={description}
                        onChange={(e) =>
                          setDescription(e.target.value)
                        }
                        rows={4}
                        placeholder="Add colour, size, brand or anything else sellers should know."
                        className="w-full resize-none rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] px-4 py-3 text-sm outline-none placeholder:text-[#A69D94] focus:border-[#FF5A36] focus:bg-white"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold text-[#17202A]">
                        Add a photo
                        <span className="ml-1 font-normal text-[#A69D94]">
                          (optional)
                        </span>
                      </label>

                      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-[#D8D1C9] bg-[#FCFAF6] px-4 py-4 transition hover:border-[#FF5A36] hover:bg-[#FFF7ED]">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#FF5A36]">
                          <ImageIcon size={19} />
                        </div>

                        <div>
                          <p className="text-sm font-bold text-[#17202A]">
                            {uploading
                              ? "Uploading..."
                              : imageUrl
                                ? "Photo added"
                                : "Upload a photo"}
                          </p>

                          <p className="mt-0.5 text-xs text-[#8A8178]">
                            Help sellers understand exactly what
                            you need.
                          </p>
                        </div>

                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div className="rounded-2xl bg-[#FFF0D9] p-4">
                      <label
                        htmlFor="buyerContact"
                        className="mb-2 block text-sm font-bold text-[#9F2D18]"
                      >
                        WhatsApp or phone number
                      </label>

                      <div className="relative">
                        <Phone
                          size={17}
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9F2D18]"
                        />

                        <input
                          id="buyerContact"
                          value={buyerContact}
                          onChange={(e) =>
                            setBuyerContact(e.target.value)
                          }
                          placeholder="e.g. 08012345678"
                          className="w-full rounded-xl border border-[#F5D6B4] bg-white py-3 pl-11 pr-4 text-sm outline-none placeholder:text-[#A69D94] focus:border-[#FF5A36]"
                        />
                      </div>

                      <p className="mt-2 text-xs leading-5 text-[#7C5B4E]">
                        We use this to help you retrieve your
                        requests later. No account is required.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || uploading}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading ? (
                        "Sending request..."
                      ) : (
                        <>
                          <Plus size={18} />
                          Send request
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </main>
        </div>

        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#EAE6DF] bg-white px-3 py-2 md:hidden">
          <div className="mx-auto flex max-w-md items-center justify-around">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.label === "Requests";

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-semibold ${
                    active
                      ? "bg-[#FFE0D6] text-[#FF5A36]"
                      : "text-[#8A8178]"
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

function SuccessView({
  request,
  onCopy,
  onNewRequest,
}: {
  request: CreatedRequest;
  onCopy: () => void;
  onNewRequest: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full">
        <div className="rounded-2xl border border-[#EAE6DF] bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#DDF5EA] text-[#238B5B]">
              <CheckCircle2 size={34} />
            </div>

            <h1 className="mt-5 text-2xl font-black text-[#17202A]">
              Request sent!
            </h1>

            <p className="mt-2 max-w-md text-sm leading-6 text-[#7C746C]">
              Your request has been created. Keep your request
              code so you can check its status later.
            </p>

            <div className="mt-6 w-full max-w-sm rounded-2xl bg-[#FFF0D9] p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-[#9F2D18]">
                Your request code
              </p>

              <div className="mt-2 flex items-center justify-center gap-2">
                <span className="text-2xl font-black tracking-wider text-[#17202A]">
                  {request.requestCode}
                </span>

                <button
                  type="button"
                  onClick={onCopy}
                  aria-label="Copy request code"
                  className="rounded-lg p-2 text-[#8A8178] transition hover:bg-white hover:text-[#FF5A36]"
                >
                  <Copy size={17} />
                </button>
              </div>

              <p className="mt-2 text-xs text-[#7C5B4E]">
                Save this code. You can use it on My Requests.
              </p>
            </div>
          </div>

          <div className="mt-7 border-t border-[#EAE6DF] pt-6">
            <p className="text-sm font-bold text-[#17202A]">
              Your request
            </p>

            <div className="mt-3 rounded-xl bg-[#FCFAF6] p-4">
              <p className="font-bold text-[#17202A]">
                {request.query}
              </p>

              {request.category && (
                <p className="mt-1 text-xs text-[#8A8178]">
                  {request.category}
                </p>
              )}
            </div>
          </div>

          {request.matches.length > 0 ? (
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-[#17202A]">
                  Potential matches
                </p>

                <span className="text-xs font-semibold text-[#FF5A36]">
                  {request.matches.length} found
                </span>
              </div>

              <div className="mt-3 space-y-3">
                {request.matches.slice(0, 3).map((match) => (
                  <Link
                    key={match.id}
                    href={`/seller/${match.business.id}`}
                    className="flex items-center gap-3 rounded-xl border border-[#EAE6DF] p-3 transition hover:border-[#FF5A36]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#FF5A36]">
                      <Store size={18} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[#17202A]">
                        {match.business.name}
                      </p>

                      <p className="mt-1 flex items-center gap-1 text-xs text-[#8A8178]">
                        <MapPin size={12} />
                        {match.business.area}
                      </p>
                    </div>

                    {match.business.verified && (
                      <span className="text-[11px] font-bold text-[#FF5A36]">
                        Verified
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-xl bg-[#FCFAF6] p-4 text-center">
              <p className="text-sm font-bold text-[#17202A]">
                No matches yet
              </p>

              <p className="mt-1 text-xs leading-5 text-[#8A8178]">
                No worries. You can check your request later for
                updates.
              </p>
            </div>
          )}

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/my-requests"
              className="flex flex-1 items-center justify-center rounded-xl bg-[#FF5A36] px-4 py-3 text-sm font-bold text-white transition hover:opacity-90"
            >
              Check my requests
            </Link>

            <button
              type="button"
              onClick={onNewRequest}
              className="flex flex-1 items-center justify-center rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] px-4 py-3 text-sm font-bold text-[#6F675F] transition hover:bg-white hover:text-[#17202A]"
            >
              Make another request
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}