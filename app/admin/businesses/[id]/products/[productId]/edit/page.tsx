"use client";

import {
  useEffect,
  useState,

} from "react";

import {
  ArrowLeft,
  Loader2,
  Package,
  Trash2,
} from "lucide-react";

import Link from "next/link";
import {
  useParams,
  useRouter,
} from "next/navigation";

import ProductImageUpload from "@/components/ProductImageUpload";

type Category = {
  id: string;
  name: string;
};

type ProductImage = {
  id: string;
  url: string;
  publicId: string | null;
  sortOrder: number;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  categoryId: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  availability:
    | "AVAILABLE"
    | "ASK_SELLER"
    | "UNAVAILABLE";
  keywords: string[];
  imageUrl: string | null;
  status:
    | "ACTIVE"
    | "INACTIVE"
    | "PENDING";
  images: ProductImage[];
};

export default function EditProductPage() {
  const router =
    useRouter();

  const params =
    useParams<{
      id: string;
      productId: string;
    }>();

  const businessId =
    params.id;

  const productId =
    params.productId;

  const [businessName, setBusinessName] =
    useState("");

  const [categories, setCategories] =
    useState<Category[]>([]);

  const [product, setProduct] =
    useState<Product | null>(
      null
    );

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

  const [deleting, setDeleting] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    if (
      !businessId ||
      !productId
    ) {
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

        if (
          !categoriesResponse.ok
        ) {
          throw new Error(
            "Unable to load categories."
          );
        }

        const loadedProduct =
          businessData.business?.products?.find(
            (
              item: Product
            ) =>
              item.id ===
              productId
          ) as
            | Product
            | undefined;

        if (!loadedProduct) {
          throw new Error(
            "Product not found."
          );
        }

        setBusinessName(
          businessData.business?.name ??
            ""
        );

        setCategories(
          Array.isArray(
            categoriesData.categories
          )
            ? categoriesData.categories
            : []
        );

        setProduct(
          loadedProduct
        );

        setName(
          loadedProduct.name
        );

        setDescription(
          loadedProduct.description ??
            ""
        );

        setCategoryId(
          loadedProduct.categoryId ??
            ""
        );

        setPrice(
          loadedProduct.price !=
            null
            ? String(
                loadedProduct.price
              )
            : ""
        );

        setPriceMin(
          loadedProduct.priceMin !=
            null
            ? String(
                loadedProduct.priceMin
              )
            : ""
        );

        setPriceMax(
          loadedProduct.priceMax !=
            null
            ? String(
                loadedProduct.priceMax
              )
            : ""
        );

        setAvailability(
          loadedProduct.availability
        );

        setStatus(
          loadedProduct.status
        );

        setKeywords(
          loadedProduct.keywords.join(
            ", "
          )
        );

        const gallery =
          loadedProduct.images
            .slice()
            .sort(
              (a, b) =>
                a.sortOrder -
                b.sortOrder
            )
            .map(
              (
                image
              ) =>
                image.url
            );

        /*
         * Backwards compatibility:
         * older products may only have imageUrl.
         */
        setImages(
          gallery.length > 0
            ? gallery
            : loadedProduct.imageUrl
              ? [
                  loadedProduct.imageUrl,
                ]
              : []
        );
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name ===
            "AbortError"
        ) {
          return;
        }

        console.error(
          "Edit product load error:",
          error
        );

        setError(
          error instanceof Error
            ? error.message
            : "Unable to load product."
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
    productId,
  ]);

  async function submit(
    event: React.SubmitEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setSaving(true);
    setError("");

    if (!name.trim()) {
      setError(
        "Product name is required."
      );
      setSaving(false);
      return;
    }

    try {
      const response =
        await fetch(
          `/api/admin/businesses/${businessId}/products/${productId}`,
          {
            method:
              "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              name:
                name.trim(),

              description:
                description.trim() ||
                null,

              categoryId:
                categoryId ||
                null,

              price:
                price.trim() ||
                null,

              priceMin:
                priceMin.trim() ||
                null,

              priceMax:
                priceMax.trim() ||
                null,

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

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data?.error ===
            "string"
            ? data.error
            : "Unable to update product."
        );
      }

      setProduct(
        data.product as Product
      );

      router.push(
        `/admin/businesses/${businessId}`
      );
    } catch (error) {
      console.error(
        "Update product error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to update product."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct() {
    const confirmed =
      window.confirm(
        "Delete this product?"
      );

    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/admin/businesses/${businessId}/products/${productId}`,
          {
            method:
              "DELETE",
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data?.error ===
            "string"
            ? data.error
            : "Unable to delete product."
        );
      }

      router.push(
        `/admin/businesses/${businessId}`
      );
    } catch (error) {
      console.error(
        "Delete product error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to delete product."
      );
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#FFF7ED] p-6">
        <div className="mx-auto flex min-h-[70vh] max-w-[900px] items-center justify-center">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading product...
          </div>
        </div>
      </main>
    );
  }

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

              <div className="min-w-0">
                <h1 className="truncate text-xl font-bold text-[#17202A]">
                  Edit product
                </h1>

                <p className="mt-0.5 truncate text-xs text-gray-500">
                  {product?.name ||
                    "Product"}
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
                    onChange={(event) =>
                      setName(
                        event.target
                          .value
                      )
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82]"
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
                    onChange={(event) =>
                      setDescription(
                        event.target
                          .value
                      )
                    }
                    rows={4}
                    className="mt-2 w-full resize-none rounded-xl border border-[#E8E4DE] bg-white px-3 py-3 text-xs outline-none focus:border-[#FF9B82]"
                  />
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-sm font-bold text-[#17202A]">
                Product images
              </h2>

              <p className="mt-1 text-[11px] text-gray-500">
                The first image is the cover image.
              </p>

              <div className="mt-4">
                <ProductImageUpload
                  value={images}
                  onChange={
                    setImages
                  }
                  disabled={
                    saving ||
                    deleting
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
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs"
                  >
                    <option value="">
                      No category
                    </option>

                    {categories.map(
                      (category) => (
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
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Exact price
                  </label>

                  <input
                    value={price}
                    onChange={(event) =>
                      setPrice(
                        event.target
                          .value
                      )
                    }
                    inputMode="numeric"
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs"
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
                    onChange={(event) =>
                      setPriceMin(
                        event.target
                          .value
                      )
                    }
                    inputMode="numeric"
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs"
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
                    onChange={(event) =>
                      setPriceMax(
                        event.target
                          .value
                      )
                    }
                    inputMode="numeric"
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs"
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
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs"
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
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs"
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
                onChange={(event) =>
                  setKeywords(
                    event.target
                      .value
                  )
                }
                placeholder="e.g. sneakers, shoes, footwear"
                className="mt-3 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs"
              />

              <p className="mt-1.5 text-[10px] text-gray-400">
                Separate keywords with commas.
              </p>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EAE6DF] pt-5">
              <button
                type="button"
                onClick={
                  deleteProduct
                }
                disabled={
                  saving ||
                  deleting
                }
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-xs font-bold text-red-600 disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}

                {deleting
                  ? "Deleting..."
                  : "Delete product"}
              </button>

              <div className="flex gap-2">
                <Link
                  href={`/admin/businesses/${businessId}`}
                  className="rounded-xl border border-[#E8E4DE] bg-white px-4 py-3 text-xs font-bold text-gray-700"
                >
                  Cancel
                </Link>

                <button
                  type="submit"
                  disabled={
                    saving ||
                    deleting
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-bold text-white disabled:opacity-60"
                >
                  {saving && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}

                  {saving
                    ? "Saving..."
                    : "Save changes"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}