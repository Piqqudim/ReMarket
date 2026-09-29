"use client";

import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import {
  ArrowLeft,
  Loader2,
  Package,
} from "lucide-react";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import ProductImageUpload from "@/components/ProductImageUpload";

import {
  DEFAULT_CATEGORIES,
  mergeCategories,
  type ApiCategory,
  type ReMarketCategory,
} from "@/lib/categories";

export default function NewProductPage() {
  const router =
    useRouter();

  const params =
    useParams<{
      id: string;
    }>();

  const businessId =
    params.id;

  const [businessName, setBusinessName] =
    useState("");

  const [businessDeletedAt, setBusinessDeletedAt] =
    useState<string | null>(null);

  const [categories, setCategories] =
    useState<ReMarketCategory[]>(
      DEFAULT_CATEGORIES
    );

  const [usingCategoryFallback, setUsingCategoryFallback] =
    useState(true);

  const [name, setName] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [categoryId, setCategoryId] =
    useState("");

  const [price, setPrice] =
    useState("");

  const [priceMin, setPriceMin] =
    useState("");

  const [priceMax, setPriceMax] =
    useState("");

  const [availability, setAvailability] =
    useState<
      | "AVAILABLE"
      | "ASK_SELLER"
      | "UNAVAILABLE"
    >("ASK_SELLER");

  const [status, setStatus] =
    useState<
      | "ACTIVE"
      | "INACTIVE"
      | "PENDING"
    >("ACTIVE");

  const [keywords, setKeywords] =
    useState("");

  const [images, setImages] =
    useState<string[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    if (!businessId) {
      return;
    }

    const controller =
      new AbortController();

    async function load() {
      setLoading(true);
      setError("");

      try {
        const [
          businessResponse,
          categoriesResponse,
        ] =
          await Promise.all([
            fetch(
              `/api/admin/businesses/${businessId}`,
              {
                cache:
                  "no-store",
                signal:
                  controller.signal,
              }
            ),

            fetch(
              "/api/categories",
              {
                cache:
                  "no-store",
                signal:
                  controller.signal,
              }
            ),
          ]);

        const businessData =
          await businessResponse.json();

        const categoriesData =
          await categoriesResponse.json();

        if (
          !businessResponse.ok
        ) {
          throw new Error(
            typeof businessData?.error ===
              "string"
              ? businessData.error
              : "Unable to load business."
          );
        }

        const business =
          businessData?.business;

        if (
          !business ||
          typeof business.name !==
            "string"
        ) {
          throw new Error(
            "Business information is unavailable."
          );
        }

        setBusinessName(
          business.name
        );

        setBusinessDeletedAt(
          typeof business.deletedAt ===
            "string"
            ? business.deletedAt
            : null
        );

        const backendCategories =
          categoriesResponse.ok &&
          Array.isArray(
            categoriesData?.categories
          )
            ? categoriesData.categories.filter(
                (
                  item:unknown
                ): item is ApiCategory =>
                  Boolean(
                    item &&
                      typeof item ===
                        "object" &&
                      !Array.isArray(
                        item
                      ) &&
                      typeof (
                        item as Record<
                          string,
                          unknown
                        >
                      ).id ===
                        "string" &&
                      typeof (
                        item as Record<
                          string,
                          unknown
                        >
                      ).name ===
                        "string"
                  )
              )
            : [];

        const mergedCategories =
          mergeCategories(
            backendCategories
          );

        if (
          mergedCategories.length > 0
        ) {
          setCategories(
            mergedCategories
          );

          setUsingCategoryFallback(
            false
          );
        } else {
          setCategories(
            DEFAULT_CATEGORIES
          );

          setUsingCategoryFallback(
            true
          );

          setCategoryId("");
        }
      } catch (loadError) {
        if (
          loadError instanceof
            DOMException &&
          loadError.name ===
            "AbortError"
        ) {
          return;
        }

        console.error(
          "New product load error:",
          loadError
        );

        setError(
          loadError instanceof
            Error
            ? loadError.message
            : "Unable to load product form."
        );
      } finally {
        if (
          !controller.signal.aborted
        ) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      controller.abort();
    };
  }, [
    businessId,
  ]);

  async function submit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");

    if (businessDeletedAt) {
      setError(
        "This business has been deleted and cannot receive new products."
      );
      return;
    }

    const trimmedName =
      name.trim();

    if (!trimmedName) {
      setError(
        "Product name is required."
      );
      return;
    }

    const parsedPrice =
      price.trim()
        ? Number(
            price.trim()
          )
        : null;

    const parsedPriceMin =
      priceMin.trim()
        ? Number(
            priceMin.trim()
          )
        : null;

    const parsedPriceMax =
      priceMax.trim()
        ? Number(
            priceMax.trim()
          )
        : null;

    if (
      parsedPrice !== null &&
      (!Number.isInteger(
        parsedPrice
      ) ||
        parsedPrice < 0)
    ) {
      setError(
        "Exact price must be a valid non-negative integer."
      );
      return;
    }

    if (
      parsedPriceMin !== null &&
      (!Number.isInteger(
        parsedPriceMin
      ) ||
        parsedPriceMin < 0)
    ) {
      setError(
        "Minimum price must be a valid non-negative integer."
      );
      return;
    }

    if (
      parsedPriceMax !== null &&
      (!Number.isInteger(
        parsedPriceMax
      ) ||
        parsedPriceMax < 0)
    ) {
      setError(
        "Maximum price must be a valid non-negative integer."
      );
      return;
    }

    if (
      parsedPriceMin !== null &&
      parsedPriceMax !== null &&
      parsedPriceMin >
        parsedPriceMax
    ) {
      setError(
        "Minimum price cannot be greater than maximum price."
      );
      return;
    }

    /*
     * Fallback categories use synthetic display IDs.
     * They must never be submitted to the database.
     */
    const selectedCategoryId =
      usingCategoryFallback
        ? null
        : categoryId.trim() ||
          null;

    setSaving(true);

    try {
      const response =
        await fetch(
          `/api/admin/businesses/${businessId}/products`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body: JSON.stringify({
              name:
                trimmedName,

              description:
                description.trim() ||
                null,

              categoryId:
                selectedCategoryId,

              price:
                parsedPrice,

              priceMin:
                parsedPriceMin,

              priceMax:
                parsedPriceMax,

              availability,

              status,

              keywords:
                keywords
                  .split(",")
                  .map(
                    (item) =>
                      item.trim()
                  )
                  .filter(Boolean),

              images,
            }),
          }
        );

      const data: unknown =
        await response.json();

      if (!response.ok) {
        const apiError =
          data &&
          typeof data ===
            "object" &&
          !Array.isArray(data)
            ? (
                data as Record<
                  string,
                  unknown
                >
              ).error
            : null;

        throw new Error(
          typeof apiError ===
            "string"
            ? apiError
            : "Unable to create product."
        );
      }

      router.push(
        `/admin/businesses/${businessId}`
      );
    } catch (submitError) {
      console.error(
        "Create product error:",
        submitError
      );

      setError(
        submitError instanceof
          Error
          ? submitError.message
          : "Unable to create product."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#FFF7ED] p-6">
        <div className="mx-auto flex min-h-[70vh] max-w-[900px] items-center justify-center">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />

            Loading...
          </div>
        </div>
      </main>
    );
  }

  const businessDeleted =
    Boolean(businessDeletedAt);

  return (
    <main className="min-h-screen bg-[#FFF7ED] p-4 sm:p-6">
      <div className="mx-auto max-w-[900px]">
        <Link
          href={`/admin/businesses/${businessId}`}
          className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-[#9F2D18]"
        >
          <ArrowLeft className="h-4 w-4" />

          Back to {businessName || "business"}
        </Link>

        <div className="mt-5 overflow-hidden rounded-[22px] border border-[#E8E4DE] bg-[#FFFDFC] shadow-sm">
          <div className="border-b border-[#EAE6DF] bg-white px-5 py-5 sm:px-7">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FF5A36] text-white">
                <Package className="h-5 w-5" />
              </div>

              <div>
                <h1 className="text-xl font-bold text-[#17202A]">
                  Add product
                </h1>

                <p className="mt-0.5 text-xs text-gray-500">
                  Add a product to{" "}
                  {businessName ||
                    "this business"}.
                </p>
              </div>
            </div>
          </div>

          <form
            onSubmit={submit}
            className="space-y-7 p-5 sm:p-7"
          >
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
                {error}
              </div>
            )}

            {businessDeleted && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
                This business has been deleted and is retained for administrative reference. New products cannot be added until the business is restored.
              </div>
            )}

            <section>
              <h2 className="text-sm font-bold text-[#17202A]">
                Product details
              </h2>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Product name
                  </label>

                  <input
                    value={name}
                    onChange={(
                      event
                    ) =>
                      setName(
                        event.target
                          .value
                      )
                    }
                    placeholder="e.g. Men's Sneakers"
                    disabled={
                      businessDeleted ||
                      saving
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:cursor-not-allowed disabled:bg-gray-50"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Description
                  </label>

                  <textarea
                    value={
                      description
                    }
                    onChange={(
                      event
                    ) =>
                      setDescription(
                        event.target
                          .value
                      )
                    }
                    rows={4}
                    disabled={
                      businessDeleted ||
                      saving
                    }
                    placeholder="Describe the product."
                    className="mt-2 w-full resize-none rounded-xl border border-[#E8E4DE] bg-white px-3 py-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:cursor-not-allowed disabled:bg-gray-50"
                  />
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-sm font-bold text-[#17202A]">
                Product images
              </h2>

              <p className="mt-1 text-[11px] text-gray-500">
                Add individual images or an image folder. The first image is the cover.
              </p>

              <div className="mt-4">
                <ProductImageUpload
                  value={images}
                  onChange={
                    setImages
                  }
                  disabled={
                    saving ||
                    businessDeleted
                  }
                />
              </div>
            </section>

            <section>
              <h2 className="text-sm font-bold text-[#17202A]">
                Category and pricing
              </h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Category
                  </label>

                  <select
                    value={
                      categoryId
                    }
                    onChange={(
                      event
                    ) =>
                      setCategoryId(
                        event.target
                          .value
                      )
                    }
                    disabled={
                      saving ||
                      businessDeleted ||
                      usingCategoryFallback
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs disabled:cursor-not-allowed disabled:bg-gray-50"
                  >
                    <option value="">
                      No category
                    </option>

                    {categories.map(
                      (
                        category
                      ) => (
                        <option
                          key={
                            category.id
                          }
                          value={
                            category.id
                          }
                        >
                          {
                            category.name
                          }
                        </option>
                      )
                    )}
                  </select>

                  {usingCategoryFallback && (
                    <p className="mt-1.5 text-[10px] text-gray-400">
                      Categories are temporarily unavailable. You can create the product without a category.
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Exact price
                  </label>

                  <input
                    value={price}
                    onChange={(
                      event
                    ) =>
                      setPrice(
                        event.target
                          .value
                      )
                    }
                    inputMode="numeric"
                    placeholder="Optional"
                    disabled={
                      businessDeleted ||
                      saving
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:cursor-not-allowed disabled:bg-gray-50"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Minimum price
                  </label>

                  <input
                    value={
                      priceMin
                    }
                    onChange={(
                      event
                    ) =>
                      setPriceMin(
                        event.target
                          .value
                      )
                    }
                    inputMode="numeric"
                    placeholder="Optional"
                    disabled={
                      businessDeleted ||
                      saving
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:cursor-not-allowed disabled:bg-gray-50"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Maximum price
                  </label>

                  <input
                    value={
                      priceMax
                    }
                    onChange={(
                      event
                    ) =>
                      setPriceMax(
                        event.target
                          .value
                      )
                    }
                    inputMode="numeric"
                    placeholder="Optional"
                    disabled={
                      businessDeleted ||
                      saving
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:cursor-not-allowed disabled:bg-gray-50"
                  />
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-sm font-bold text-[#17202A]">
                Availability and status
              </h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Availability
                  </label>

                  <select
                    value={
                      availability
                    }
                    onChange={(
                      event
                    ) =>
                      setAvailability(
                        event.target
                          .value as typeof availability
                      )
                    }
                    disabled={
                      businessDeleted ||
                      saving
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs disabled:cursor-not-allowed disabled:bg-gray-50"
                  >
                    <option value="AVAILABLE">
                      Available
                    </option>

                    <option value="ASK_SELLER">
                      Ask seller
                    </option>

                    <option value="UNAVAILABLE">
                      Unavailable
                    </option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Status
                  </label>

                  <select
                    value={status}
                    onChange={(
                      event
                    ) =>
                      setStatus(
                        event.target
                          .value as typeof status
                      )
                    }
                    disabled={
                      businessDeleted ||
                      saving
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs disabled:cursor-not-allowed disabled:bg-gray-50"
                  >
                    <option value="ACTIVE">
                      Active
                    </option>

                    <option value="INACTIVE">
                      Inactive
                    </option>

                    <option value="PENDING">
                      Pending
                    </option>
                  </select>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-sm font-bold text-[#17202A]">
                Keywords
              </h2>

              <input
                value={keywords}
                onChange={(
                  event
                ) =>
                  setKeywords(
                    event.target
                      .value
                  )
                }
                placeholder="e.g. sneakers, shoes, footwear"
                disabled={
                  businessDeleted ||
                  saving
                }
                className="mt-3 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:cursor-not-allowed disabled:bg-gray-50"
              />

              <p className="mt-1.5 text-[10px] text-gray-400">
                Separate keywords with commas.
              </p>
            </section>

            <div className="flex justify-end gap-2 border-t border-[#EAE6DF] pt-5">
              <Link
                href={`/admin/businesses/${businessId}`}
                className="rounded-xl border border-[#E8E4DE] bg-white px-4 py-3 text-xs font-bold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </Link>

              <button
                type="submit"
                disabled={
                  saving ||
                  businessDeleted
                }
                className="inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}

                {businessDeleted
                  ? "Business deleted"
                  : saving
                    ? "Creating..."
                    : "Create product"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}