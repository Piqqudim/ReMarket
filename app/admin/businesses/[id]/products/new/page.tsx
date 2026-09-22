"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Package,
  Save,
  Store,
} from "lucide-react";

type Category = {
  id: string;
  name: string;
};

type Business = {
  id: string;
  name: string;
};

export default function NewProductPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const businessId = params.id;

  const [business, setBusiness] =
    useState<Business | null>(null);

  const [categories, setCategories] =
    useState<Category[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

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
    useState("ASK_SELLER");

  const [status, setStatus] =
    useState("ACTIVE");

  const [keywords, setKeywords] =
    useState("");

  const [imageUrl, setImageUrl] =
    useState("");

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError("");

        const [
          businessResponse,
          categoriesResponse,
        ] = await Promise.all([
          fetch(
            `/api/admin/businesses/${businessId}`
          ),
          fetch("/api/categories"),
        ]);

        const businessData =
          await businessResponse.json();

        const categoriesData =
          await categoriesResponse.json();

        if (!businessResponse.ok) {
          throw new Error(
            businessData.error ||
              "Unable to load business"
          );
        }

        if (!categoriesResponse.ok) {
          throw new Error(
            categoriesData.error ||
              "Unable to load categories"
          );
        }

        const loadedBusiness =
          businessData.business ??
          businessData;

        if (!loadedBusiness?.id) {
          throw new Error(
            "Business data is missing."
          );
        }

        setBusiness({
          id: loadedBusiness.id,
          name: loadedBusiness.name,
        });

        setCategories(
          Array.isArray(categoriesData)
            ? categoriesData
            : categoriesData.categories ??
                []
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to load product form"
        );
      } finally {
        setLoading(false);
      }
    }

    if (businessId) {
      loadData();
    }
  }, [businessId]);

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!name.trim()) {
      setError(
        "Product name is required."
      );
      return;
    }

    if (
      price &&
      (!Number.isInteger(Number(price)) ||
        Number(price) < 0)
    ) {
      setError(
        "Price must be a valid non-negative whole number."
      );
      return;
    }

    if (
      priceMin &&
      (!Number.isInteger(
        Number(priceMin)
      ) ||
        Number(priceMin) < 0)
    ) {
      setError(
        "Minimum price must be a valid non-negative whole number."
      );
      return;
    }

    if (
      priceMax &&
      (!Number.isInteger(
        Number(priceMax)
      ) ||
        Number(priceMax) < 0)
    ) {
      setError(
        "Maximum price must be a valid non-negative whole number."
      );
      return;
    }

    if (
      priceMin &&
      priceMax &&
      Number(priceMin) >
        Number(priceMax)
    ) {
      setError(
        "Minimum price cannot be greater than maximum price."
      );
      return;
    }

    try {
      setSaving(true);
      setError("");

      const response = await fetch(
        `/api/admin/businesses/${businessId}/products`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name: name.trim(),
            description:
              description.trim() ||
              undefined,

            categoryId:
              categoryId || undefined,

            price:
              price
                ? Number(price)
                : undefined,

            priceMin:
              priceMin
                ? Number(priceMin)
                : undefined,

            priceMax:
              priceMax
                ? Number(priceMax)
                : undefined,

            availability,
            status,

            keywords: keywords
              .split(",")
              .map((keyword) =>
                keyword.trim()
              )
              .filter(Boolean),

            imageUrl:
              imageUrl.trim() ||
              undefined,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to create product"
        );
      }

      router.push(
        `/admin/businesses/${businessId}`
      );

      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create product"
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#FFF7ED] p-4 md:p-6">
        <div className="mx-auto max-w-[1500px]">
          <div className="rounded-[22px] border border-[#FF5A36] bg-[#FFFDFC] p-8 shadow-sm">
            <div className="h-6 w-48 animate-pulse rounded bg-[#F2ECE4]" />
            <div className="mt-4 h-4 w-72 animate-pulse rounded bg-[#F2ECE4]" />
          </div>
        </div>
      </main>
    );
  }

  if (!business) {
    return (
      <main className="min-h-screen bg-[#FFF7ED] p-4 md:p-6">
        <div className="mx-auto max-w-[1500px]">
          <div className="rounded-[22px] border border-[#FF5A36] bg-[#FFFDFC] p-8 shadow-sm">
            <p className="font-bold text-[#9F2D18]">
              {error || "Business not found."}
            </p>

            <Link
              href="/admin/businesses"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-sm font-extrabold text-white"
            >
              <ArrowLeft size={17} />
              Back to Businesses
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FFF7ED] p-3 md:p-6">
      <div className="mx-auto flex min-h-[calc(100vh-24px)] max-w-[1500px] overflow-hidden rounded-[22px] border border-[#FF5A36] bg-[#FFFDFC] shadow-[0_10px_30px_rgba(255,90,54,0.08)] md:min-h-[calc(100vh-48px)]">

        {/* Sidebar */}
        <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] md:block">
          <div className="flex h-16 items-center border-b border-[#EAE6DF] px-5">
            <Link
              href="/admin"
              className="text-xl font-black tracking-tight text-[#17202A]"
            >
              Re<span className="text-[#FF5A36]">Market</span>
            </Link>
          </div>

          <nav className="space-y-1 p-3">
            <Link
              href="/admin"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-[#68707A] hover:bg-white"
            >
              <Store size={18} />
              Overview
            </Link>

            <Link
              href="/admin/businesses"
              className="flex items-center gap-3 rounded-xl bg-[#FFE6DE] px-3 py-2.5 text-sm font-extrabold text-[#9F2D18]"
            >
              <Store size={18} />
              Businesses
            </Link>

            <Link
              href="/admin/products"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold text-[#68707A] hover:bg-white"
            >
              <Package size={18} />
              Products
            </Link>
          </nav>
        </aside>

        {/* Main */}
        <section className="min-w-0 flex-1">
          <header className="flex min-h-16 items-center justify-between border-b border-[#EAE6DF] px-4 md:px-7">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm text-[#7B828A]">
                <Link
                  href="/admin/businesses"
                  className="hover:text-[#FF5A36]"
                >
                  Businesses
                </Link>

                <span>/</span>

                <Link
                  href={`/admin/businesses/${businessId}`}
                  className="max-w-[180px] truncate hover:text-[#FF5A36]"
                >
                  {business.name}
                </Link>

                <span>/</span>

                <span className="text-[#17202A]">
                  New Product
                </span>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-4xl p-4 md:p-7">
            <div className="mb-6">
              <Link
                href={`/admin/businesses/${businessId}`}
                className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-[#68707A] hover:text-[#FF5A36]"
              >
                <ArrowLeft size={17} />
                Back to {business.name}
              </Link>

              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#9F2D18]">
                  <Package size={21} />
                </div>

                <div>
                  <h1 className="text-2xl font-black tracking-tight text-[#17202A]">
                    Add Product
                  </h1>

                  <p className="mt-1 text-sm text-[#68707A]">
                    Add a product to{" "}
                    <span className="font-bold text-[#17202A]">
                      {business.name}
                    </span>
                    .
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                {error}
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              className="space-y-5"
            >
              <section className="rounded-2xl border border-[#EAE6DF] bg-white p-5 shadow-sm md:p-6">
                <div className="mb-5">
                  <h2 className="text-base font-black text-[#17202A]">
                    Product information
                  </h2>

                  <p className="mt-1 text-sm text-[#7B828A]">
                    Basic information customers will see.
                  </p>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-extrabold text-[#17202A]">
                      Product name *
                    </label>

                    <input
                      value={name}
                      onChange={(event) =>
                        setName(event.target.value)
                      }
                      placeholder="e.g. Samsung Galaxy A15"
                      className="h-11 w-full rounded-xl border border-[#E8E4DE] bg-[#FFFDFC] px-3 text-sm text-[#17202A] outline-none transition placeholder:text-[#A0A4A8] focus:border-[#FF5A36]"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-extrabold text-[#17202A]">
                      Description
                    </label>

                    <textarea
                      value={description}
                      onChange={(event) =>
                        setDescription(
                          event.target.value
                        )
                      }
                      rows={4}
                      placeholder="Describe the product..."
                      className="w-full resize-none rounded-xl border border-[#E8E4DE] bg-[#FFFDFC] px-3 py-3 text-sm text-[#17202A] outline-none transition placeholder:text-[#A0A4A8] focus:border-[#FF5A36]"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-extrabold text-[#17202A]">
                      Category
                    </label>

                    <select
                      value={categoryId}
                      onChange={(event) =>
                        setCategoryId(
                          event.target.value
                        )
                      }
                      className="h-11 w-full rounded-xl border border-[#E8E4DE] bg-[#FFFDFC] px-3 text-sm font-semibold text-[#17202A] outline-none focus:border-[#FF5A36]"
                    >
                      <option value="">
                        Select a category
                      </option>

                      {categories.map(
                        (category) => (
                          <option
                            key={category.id}
                            value={category.id}
                          >
                            {category.name}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-[#EAE6DF] bg-white p-5 shadow-sm md:p-6">
                <div className="mb-5">
                  <h2 className="text-base font-black text-[#17202A]">
                    Pricing
                  </h2>

                  <p className="mt-1 text-sm text-[#7B828A]">
                    Enter an exact price or a price range.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <PriceField
                    label="Exact price"
                    value={price}
                    onChange={setPrice}
                  />

                  <PriceField
                    label="Minimum price"
                    value={priceMin}
                    onChange={setPriceMin}
                  />

                  <PriceField
                    label="Maximum price"
                    value={priceMax}
                    onChange={setPriceMax}
                  />
                </div>

                <p className="mt-3 text-xs text-[#8A8F95]">
                  Leave exact price empty when the product has a range.
                </p>
              </section>

              <section className="rounded-2xl border border-[#EAE6DF] bg-white p-5 shadow-sm md:p-6">
                <div className="mb-5">
                  <h2 className="text-base font-black text-[#17202A]">
                    Availability
                  </h2>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <SelectField
                    label="Availability"
                    value={availability}
                    onChange={setAvailability}
                    options={[
                      {
                        value: "AVAILABLE",
                        label: "Available",
                      },
                      {
                        value: "ASK_SELLER",
                        label: "Ask seller",
                      },
                      {
                        value: "UNAVAILABLE",
                        label: "Unavailable",
                      },
                    ]}
                  />

                  <SelectField
                    label="Status"
                    value={status}
                    onChange={setStatus}
                    options={[
                      {
                        value: "ACTIVE",
                        label: "Active",
                      },
                      {
                        value: "INACTIVE",
                        label: "Inactive",
                      },
                      {
                        value: "PENDING",
                        label: "Pending",
                      },
                    ]}
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-[#EAE6DF] bg-white p-5 shadow-sm md:p-6">
                <div className="mb-5">
                  <h2 className="text-base font-black text-[#17202A]">
                    Search information
                  </h2>

                  <p className="mt-1 text-sm text-[#7B828A]">
                    Keywords help ReMarket match customer searches.
                  </p>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-sm font-extrabold text-[#17202A]">
                      Keywords
                    </label>

                    <input
                      value={keywords}
                      onChange={(event) =>
                        setKeywords(
                          event.target.value
                        )
                      }
                      placeholder="phone, samsung, android, 5g"
                      className="h-11 w-full rounded-xl border border-[#E8E4DE] bg-[#FFFDFC] px-3 text-sm text-[#17202A] outline-none placeholder:text-[#A0A4A8] focus:border-[#FF5A36]"
                    />

                    <p className="mt-2 text-xs text-[#8A8F95]">
                      Separate keywords with commas.
                    </p>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-extrabold text-[#17202A]">
                      Image URL
                    </label>

                    <input
                      value={imageUrl}
                      onChange={(event) =>
                        setImageUrl(
                          event.target.value
                        )
                      }
                      placeholder="https://..."
                      className="h-11 w-full rounded-xl border border-[#E8E4DE] bg-[#FFFDFC] px-3 text-sm text-[#17202A] outline-none placeholder:text-[#A0A4A8] focus:border-[#FF5A36]"
                    />
                  </div>
                </div>
              </section>

              <div className="flex flex-col-reverse gap-3 border-t border-[#EAE6DF] pt-5 sm:flex-row sm:justify-end">
                <Link
                  href={`/admin/businesses/${businessId}`}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-[#E8E4DE] bg-white px-5 text-sm font-extrabold text-[#68707A] transition hover:bg-[#FCFAF6]"
                >
                  Cancel
                </Link>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#E94B29] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <CheckCircle2
                        size={17}
                        className="animate-pulse"
                      />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={17} />
                      Create Product
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}

function PriceField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-extrabold text-[#17202A]">
        {label}
      </label>

      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-[#7B828A]">
          ₦
        </span>

        <input
          type="number"
          min="0"
          step="1"
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          placeholder="0"
          className="h-11 w-full rounded-xl border border-[#E8E4DE] bg-[#FFFDFC] pl-8 pr-3 text-sm text-[#17202A] outline-none focus:border-[#FF5A36]"
        />
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: {
    value: string;
    label: string;
  }[];
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-extrabold text-[#17202A]">
        {label}
      </label>

      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="h-11 w-full rounded-xl border border-[#E8E4DE] bg-[#FFFDFC] px-3 text-sm font-semibold text-[#17202A] outline-none focus:border-[#FF5A36]"
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}