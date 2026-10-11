"use client";

import Link from "next/link";

import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";

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
  Check,
  MapPin,
  Phone,
  Store,
  Search,
  Loader2,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Shop", href: "/shop", icon: ShoppingBag },
  {
    label: "Requests",
    href: "/my-requests",
    icon: ClipboardList,
  },
  { label: "Saved", href: "/saved", icon: Heart },
];

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

type Category = {
  id: string;
  name: string;
};

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

/*
 * -----------------------------------------
 * RESPONSE VALIDATION HELPERS
 * -----------------------------------------
 */

function isCategory(
  value: unknown
): value is Category {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const item = value as Record<string, unknown>;

  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    item.name.trim().length > 0
  );
}

function isRequestMatch(
  value: unknown
): value is RequestMatch {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return false;
  }

  const match = value as Record<string, unknown>;
  const business = match.business;

  if (
    typeof business !== "object" ||
    business === null
  ) {
    return false;
  }

  const seller =
    business as Record<string, unknown>;

  return (
    typeof match.id === "string" &&
    typeof match.score === "number" &&
    Number.isFinite(match.score) &&
    typeof seller.id === "string" &&
    typeof seller.name === "string" &&
    typeof seller.area === "string" &&
    typeof seller.verified === "boolean"
  );
}

function getErrorMessage(
  error: unknown,
  fallback: string
): string {
  return error instanceof Error
    ? error.message
    : fallback;
}

/*
 * -----------------------------------------
 * REQUEST PAGE
 * -----------------------------------------
 */

export default function RequestPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [budget, setBudget] = useState("");
  const [locationArea, setLocationArea] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [description, setDescription] = useState("");
  const [buyerContact, setBuyerContact] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [categoryError, setCategoryError] = useState("");

  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [createdRequest, setCreatedRequest] =
    useState<CreatedRequest | null>(null);

  /*
   * -----------------------------------------
   * LOAD ACTIVE BACKEND CATEGORIES
   * -----------------------------------------
   */

  useEffect(() => {
    let cancelled = false;

    async function loadCategories() {
      setLoadingCategories(true);
      setCategoryError("");

      try {
        const response = await fetch(
          "/api/categories",
          {
            cache: "no-store",
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "Unable to load categories."
          );
        }

        if (!Array.isArray(data.categories)) {
          throw new Error(
            "The categories response is invalid."
          );
        }

        const activeCategories: Category[] =
          data.categories
            .filter(isCategory)
            .map((item: Category) => ({
              id: item.id,
              name: item.name.trim(),
            }));

        if (!cancelled) {
          setCategories(activeCategories);
        }
      } catch (err) {
        console.error(
          "Load request categories error:",
          err
        );

        if (!cancelled) {
          setCategories([]);

          setCategoryError(
            "We couldn't load the categories right now."
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingCategories(false);
        }
      }
    }

    void loadCategories();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * -----------------------------------------
   * IMAGE UPLOAD
   * -----------------------------------------
   */

  async function handleImageUpload(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const input = event.currentTarget;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    /*
     * Allow selecting the same file again.
     */
    input.value = "";

    setError("");

    if (
      !ALLOWED_IMAGE_TYPES.includes(file.type)
    ) {
      setError(
        "Choose a JPG, PNG or WebP image."
      );
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setError(
        "The image must be 5 MB or smaller."
      );
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();

      formData.append("file", file);

      const response = await fetch(
        "/api/upload",
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Unable to upload image."
        );
      }

      if (
        typeof data?.url !== "string" ||
        !data.url.trim()
      ) {
        throw new Error(
          "The upload completed without returning an image URL."
        );
      }

      setImageUrl(data.url);
    } catch (err) {
      console.error(
        "Request image upload error:",
        err
      );

      setError(
        getErrorMessage(
          err,
          "Unable to upload image. Please try again."
        )
      );
    } finally {
      setUploading(false);
    }
  }

  /*
   * -----------------------------------------
   * SUBMIT REQUEST
   * -----------------------------------------
   */

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (loading || uploading) {
      return;
    }

    setError("");

    if (!query.trim()) {
      setError(
        "Tell us what you are looking for."
      );
      return;
    }

    if (!buyerContact.trim()) {
      setError(
        "Add your WhatsApp number or phone number."
      );
      return;
    }

    const quantityNumber = Number(quantity);

    if (
      !Number.isInteger(quantityNumber) ||
      quantityNumber < 1
    ) {
      setError(
        "Quantity must be a whole number of at least 1."
      );
      return;
    }

    const budgetNumber = budget.trim()
      ? Number(budget)
      : undefined;

    if (
      budgetNumber !== undefined &&
      (!Number.isFinite(budgetNumber) ||
        budgetNumber < 0)
    ) {
      setError("Enter a valid budget.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(
        "/api/request",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: query.trim(),
            category: category || undefined,
            budget: budgetNumber,
            locationArea:
              locationArea.trim() || undefined,
            quantity: quantityNumber,
            description:
              description.trim() || undefined,
            imageUrl: imageUrl || undefined,
            buyerContact: buyerContact.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Unable to create request."
        );
      }

      if (
        typeof data?.request?.requestCode !==
          "string" ||
        !data.request.requestCode.trim()
      ) {
        throw new Error(
          "The server did not return a request code. Check My Requests before submitting again."
        );
      }

      const returnedMatches: RequestMatch[] =
        Array.isArray(data.request.matches)
          ? data.request.matches.filter(
              isRequestMatch
            )
          : [];

      setCreatedRequest({
        requestCode:
          data.request.requestCode,
        query:
          typeof data.request.query === "string"
            ? data.request.query
            : query.trim(),
        category:
          typeof data.request.category === "string"
            ? data.request.category
            : null,
        matches: returnedMatches,
      });
    } catch (err) {
      console.error(
        "Create request error:",
        err
      );

      setError(
        getErrorMessage(
          err,
          "Something went wrong. Please try again."
        )
      );
    } finally {
      setLoading(false);
    }
  }

  /*
   * -----------------------------------------
   * RESET FORM
   * -----------------------------------------
   */

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

  return (
    /*
     * FIX: Full-width, full-viewport shell.
     * Removed page padding, max-width, border,
     * rounded outer frame and 100vh subtraction.
     */
    <div className="min-h-dvh w-full bg-[#FFF7ED]">
      <div className="flex min-h-dvh w-full flex-col bg-[#FFFDFC]">

        {/* HEADER */}

        <header className="flex h-[66px] shrink-0 items-center justify-between gap-2 border-b border-[#EAE6DF] bg-white px-4 sm:px-6">
          <Link
            href="/"
            className="shrink-0 text-xl font-black tracking-tight text-[#17202A]"
          >
            Re<span className="text-[#FF5A36]">Market</span>
          </Link>

          {/* DESKTOP HEADER NAVIGATION */}

          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-4 lg:flex xl:gap-7"
          >
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;

              const active =
                item.label === "Requests";

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={
                    active ? "page" : undefined
                  }
                  className={`flex items-center gap-2 whitespace-nowrap text-sm font-semibold transition ${
                    active
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

          {/* HEADER ACTIONS */}

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/search"
              aria-label="Search ReMarket"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0D9] text-[#9F2D18] transition hover:bg-[#FFE0D6] sm:hidden"
            >
              <Search size={19} />
            </Link>

            <Link
              href="/request"
              aria-label="Request something"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF5A36] text-white transition hover:opacity-90 sm:hidden"
            >
              <Plus size={20} />
            </Link>

            <Link
              href="/request"
              className="hidden items-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 sm:flex"
            >
              <Plus size={17} />

              Request something
            </Link>
          </div>
        </header>

        {/*
         * FIX: The content row now fills the available
         * viewport height below the header.
         * It can also grow naturally when content is taller.
         */}
        <div className="flex min-h-[calc(100dvh-66px)] flex-1">

          {/* DESKTOP SIDEBAR */}

          <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] p-3 lg:block">
            <nav
              aria-label="Sidebar navigation"
              className="space-y-1"
            >
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;

                const active =
                  item.label === "Requests";

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={
                      active ? "page" : undefined
                    }
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
            </nav>

            <div className="mt-8 rounded-2xl bg-[#FFF0D9] p-4">
              <p className="text-sm font-bold text-[#9F2D18]">
                Cannot find it?
              </p>

              <p className="mt-1 text-xs leading-5 text-[#7C5B4E]">
                Tell nearby sellers what you need.
              </p>
            </div>
          </aside>

          {/* MAIN CONTENT */}

          <main className="min-w-0 flex-1 pb-28 lg:pb-8">
            {createdRequest ? (
              <SuccessView
                request={createdRequest}
                onNewRequest={resetForm}
              />
            ) : (
              <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
                {/* PAGE INTRODUCTION */}

                <div className="mb-6">
                  <Link
                    href="/"
                    className="mb-4 inline-flex items-center gap-2 text-sm font-semibold text-[#8A8178] transition hover:text-[#17202A]"
                  >
                    <ArrowLeft size={16} />

                    Back home
                  </Link>

                  <div>
                    <h1 className="text-2xl font-black tracking-tight text-[#17202A] sm:text-3xl">
                      Request something
                    </h1>

                    <p className="mt-2 max-w-xl text-sm leading-6 text-[#7C746C]">
                      Cannot find what you need? Tell us
                      what you are looking for and we&apos;ll
                      help connect you with nearby sellers.
                    </p>
                  </div>
                </div>

                {/* REQUEST FORM */}

                <form
                  onSubmit={handleSubmit}
                  className="rounded-2xl border border-[#EAE6DF] bg-white p-4 shadow-sm sm:p-6"
                >
                  {error && (
                    <div
                      role="alert"
                      aria-live="polite"
                      className="mb-5 rounded-xl border border-[#F5C4B3] bg-[#FFE0D6] px-4 py-3 text-sm font-medium text-[#9F2D18]"
                    >
                      {error}
                    </div>
                  )}

                  <div className="space-y-5">

                    {/* ITEM / SERVICE */}

                    <div>
                      <label
                        htmlFor="query"
                        className="mb-2 block text-sm font-bold text-[#17202A]"
                      >
                        What are you looking for?
                      </label>

                      <input
                        id="query"
                        name="query"
                        value={query}
                        onChange={(event) =>
                          setQuery(event.target.value)
                        }
                        maxLength={200}
                        required
                        autoComplete="off"
                        placeholder="e.g. black school shoes"
                        className="w-full rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] px-4 py-3 text-sm outline-none transition placeholder:text-[#A69D94] focus:border-[#FF5A36] focus:bg-white"
                      />
                    </div>

                    {/* CATEGORY */}

                    <div>
                      <label
                        htmlFor="category"
                        className="mb-2 block text-sm font-bold text-[#17202A]"
                      >
                        Category
                      </label>

                      <select
                        id="category"
                        name="category"
                        value={category}
                        onChange={(event) =>
                          setCategory(event.target.value)
                        }
                        disabled={loadingCategories}
                        className="w-full rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] px-4 py-3 text-sm outline-none transition focus:border-[#FF5A36] focus:bg-white disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        <option value="">
                          {loadingCategories
                            ? "Loading categories..."
                            : "Choose a category"}
                        </option>

                        {categories.map((item) => (
                          <option
                            key={item.id}
                            value={item.name}
                          >
                            {item.name}
                          </option>
                        ))}
                      </select>

                      {categoryError && (
                        <p
                          role="status"
                          className="mt-2 text-xs text-[#9F2D18]"
                        >
                          {categoryError}
                        </p>
                      )}
                    </div>

                    {/* BUDGET AND QUANTITY */}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="min-w-0">
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
                            name="budget"
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            value={budget}
                            onChange={(event) =>
                              setBudget(event.target.value)
                            }
                            placeholder="Optional"
                            className="w-full rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] py-3 pl-9 pr-4 text-sm outline-none transition placeholder:text-[#A69D94] focus:border-[#FF5A36] focus:bg-white"
                          />
                        </div>
                      </div>

                      <div className="min-w-0">
                        <label
                          htmlFor="quantity"
                          className="mb-2 block text-sm font-bold text-[#17202A]"
                        >
                          Quantity
                        </label>

                        <input
                          id="quantity"
                          name="quantity"
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          value={quantity}
                          onChange={(event) =>
                            setQuantity(event.target.value)
                          }
                          required
                          className="w-full rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] px-4 py-3 text-sm outline-none transition focus:border-[#FF5A36] focus:bg-white"
                        />
                      </div>
                    </div>

                    {/* LOCATION */}

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
                          aria-hidden="true"
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8A8178]"
                        />

                        <input
                          id="locationArea"
                          name="locationArea"
                          value={locationArea}
                          onChange={(event) =>
                            setLocationArea(event.target.value)
                          }
                          maxLength={120}
                          placeholder="e.g. Ogba, Ikeja, Yaba"
                          className="w-full rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] py-3 pl-11 pr-4 text-sm outline-none transition placeholder:text-[#A69D94] focus:border-[#FF5A36] focus:bg-white"
                        />
                      </div>
                    </div>

                    {/* ADDITIONAL DETAILS */}

                    <div>
                      <label
                        htmlFor="description"
                        className="mb-2 block text-sm font-bold text-[#17202A]"
                      >
                        More details
                      </label>

                      <textarea
                        id="description"
                        name="description"
                        value={description}
                        onChange={(event) =>
                          setDescription(event.target.value)
                        }
                        maxLength={2000}
                        rows={4}
                        placeholder="Add colour, size, brand or anything else sellers should know."
                        className="w-full resize-none rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] px-4 py-3 text-sm outline-none transition placeholder:text-[#A69D94] focus:border-[#FF5A36] focus:bg-white"
                      />
                    </div>

                    {/* IMAGE UPLOAD */}

                    <div>
                      <label
                        htmlFor="request-image"
                        className="mb-2 block text-sm font-bold text-[#17202A]"
                      >
                        Add a photo
                        <span className="ml-1 font-normal text-[#A69D94]">
                          (optional)
                        </span>
                      </label>

                      <div className="rounded-xl border border-dashed border-[#D8D1C9] bg-[#FCFAF6] p-4 transition hover:border-[#FF5A36]">
                        <label
                          htmlFor="request-image"
                          className={`flex items-center gap-3 ${
                            uploading
                              ? "cursor-wait"
                              : "cursor-pointer"
                          }`}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#FF5A36]">
                            {uploading ? (
                              <Loader2
                                size={19}
                                className="animate-spin"
                              />
                            ) : (
                              <ImageIcon size={19} />
                            )}
                          </div>

                          <div className="min-w-0">
                            <p className="text-sm font-bold text-[#17202A]">
                              {uploading
                                ? "Uploading..."
                                : imageUrl
                                  ? "Photo added"
                                  : "Upload a photo"}
                            </p>

                            <p className="mt-0.5 text-xs leading-5 text-[#8A8178]">
                              JPG, PNG or WebP, up to 5 MB.
                            </p>
                          </div>
                        </label>

                        {imageUrl && (
                          <div className="mt-3 flex items-center justify-between gap-3 border-t border-[#E8E4DE] pt-3">
                            <a
                              href={imageUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-semibold text-[#9F2D18] underline"
                            >
                              View uploaded photo
                            </a>

                            <button
                              type="button"
                              onClick={() =>
                                setImageUrl("")
                              }
                              className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#8A8178] hover:text-[#9F2D18]"
                            >
                              <X size={13} />
                              Remove
                            </button>
                          </div>
                        )}

                        <input
                          id="request-image"
                          name="request-image"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={uploading || loading}
                          onChange={handleImageUpload}
                          className="sr-only"
                        />
                      </div>
                    </div>

                    {/* CONTACT */}

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
                          aria-hidden="true"
                          className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9F2D18]"
                        />

                        <input
                          id="buyerContact"
                          name="buyerContact"
                          type="tel"
                          autoComplete="tel"
                          value={buyerContact}
                          onChange={(event) =>
                            setBuyerContact(event.target.value)
                          }
                          maxLength={40}
                          required
                          placeholder="e.g. 08012345678"
                          className="w-full rounded-xl border border-[#F5D6B4] bg-white py-3 pl-11 pr-4 text-sm outline-none transition placeholder:text-[#A69D94] focus:border-[#FF5A36]"
                        />
                      </div>

                      <p className="mt-2 text-xs leading-5 text-[#7C5B4E]">
                        Add a number where you can be contacted
                        about your request.
                      </p>
                    </div>

                    {/* SUBMIT */}

                    <button
                      type="submit"
                      disabled={loading || uploading}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3.5 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loading ? (
                        <>
                          <Loader2
                            size={17}
                            className="animate-spin"
                          />
                          Sending request...
                        </>
                      ) : uploading ? (
                        "Please wait for the image upload..."
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

        {/* MOBILE / TABLET BOTTOM NAVIGATION */}

        <nav
          aria-label="Mobile navigation"
          className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#EAE6DF] bg-white/95 px-3 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden"
        >
          <div className="mx-auto flex max-w-md items-center justify-around">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;

              const active =
                item.label === "Requests";

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={
                    active ? "page" : undefined
                  }
                  className={`flex min-w-[60px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-[10px] font-semibold transition ${
                    active
                      ? "bg-[#FFE0D6] text-[#FF5A36]"
                      : "text-[#8A8178] hover:bg-[#FCFAF6]"
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

/*
 * -----------------------------------------
 * REQUEST SUCCESS VIEW
 * -----------------------------------------
 */

function SuccessView({
  request,
  onNewRequest,
}: {
  request: CreatedRequest;
  onNewRequest: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyRequestCode() {
    try {
      await navigator.clipboard.writeText(
        request.requestCode
      );

      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full">
        <div className="rounded-2xl border border-[#EAE6DF] bg-white p-5 shadow-sm sm:p-7">
          {/* SUCCESS HEADER */}

          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#DDF5EA] text-[#238B5B]">
              <CheckCircle2 size={34} />
            </div>

            <h1 className="mt-5 text-2xl font-black text-[#17202A]">
              Request sent!
            </h1>

            <p className="mt-2 max-w-md text-sm leading-6 text-[#7C746C]">
              Your request has been created. Keep your
              request code so you can check its status later.
            </p>

            {/* REQUEST CODE */}

            <div className="mt-6 w-full max-w-sm rounded-2xl bg-[#FFF0D9] p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-[#9F2D18]">
                Your request code
              </p>

              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <span className="break-all text-2xl font-black tracking-wider text-[#17202A]">
                  {request.requestCode}
                </span>

                <button
                  type="button"
                  onClick={copyRequestCode}
                  aria-label="Copy request code"
                  className="rounded-lg p-2 text-[#8A8178] transition hover:bg-white hover:text-[#FF5A36]"
                >
                  {copied ? (
                    <Check
                      size={17}
                      className="text-[#238B5B]"
                    />
                  ) : (
                    <Copy size={17} />
                  )}
                </button>
              </div>

              <p
                aria-live="polite"
                className="mt-2 text-xs text-[#7C5B4E]"
              >
                {copied
                  ? "Request code copied."
                  : "Save this code. You can use it on My Requests."}
              </p>
            </div>
          </div>

          {/* REQUEST SUMMARY */}

          <div className="mt-7 border-t border-[#EAE6DF] pt-6">
            <p className="text-sm font-bold text-[#17202A]">
              Your request
            </p>

            <div className="mt-3 rounded-xl bg-[#FCFAF6] p-4">
              <p className="break-words font-bold text-[#17202A]">
                {request.query}
              </p>

              {request.category && (
                <p className="mt-1 text-xs text-[#8A8178]">
                  {request.category}
                </p>
              )}
            </div>
          </div>

          {/* POTENTIAL MATCHES */}

          {request.matches.length > 0 ? (
            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
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
                    className="flex min-w-0 items-center gap-3 rounded-xl border border-[#EAE6DF] p-3 transition hover:border-[#FF5A36]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#FF5A36]">
                      <Store size={18} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[#17202A]">
                        {match.business.name}
                      </p>

                      <p className="mt-1 flex min-w-0 items-center gap-1 text-xs text-[#8A8178]">
                        <MapPin
                          size={12}
                          className="shrink-0"
                        />

                        <span className="truncate">
                          {match.business.area}
                        </span>
                      </p>
                    </div>

                    {match.business.verified && (
                      <span className="shrink-0 text-[11px] font-bold text-[#FF5A36]">
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
                You can check your request later for updates.
              </p>
            </div>
          )}

          {/* SUCCESS ACTIONS */}

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