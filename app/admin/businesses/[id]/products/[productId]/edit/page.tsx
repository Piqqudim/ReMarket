"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertTriangle,
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

import {
  DEFAULT_CATEGORIES,
  mergeCategories,
  type ReMarketCategory,
} from "@/lib/categories";

type Availability =
  | "AVAILABLE"
  | "ASK_SELLER"
  | "UNAVAILABLE";

type BusinessStatus =
  | "ACTIVE"
  | "INACTIVE"
  | "PENDING";

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
  categoryName: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  availability: Availability;
  keywords: string[];
  imageUrl: string | null;
  status: BusinessStatus;
  images: ProductImage[];
  deletedAt: string | null;
};

type ApiCategory = {
  id: string;
  name: string;
  iconKey?: string;
  isActive?: boolean;
  sortOrder?: number;
};

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isApiCategory(
  value: unknown
): value is ApiCategory {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string"
  );
}

function isAvailability(
  value: unknown
): value is Availability {
  return (
    value === "AVAILABLE" ||
    value === "ASK_SELLER" ||
    value === "UNAVAILABLE"
  );
}

function isBusinessStatus(
  value: unknown
): value is BusinessStatus {
  return (
    value === "ACTIVE" ||
    value === "INACTIVE" ||
    value === "PENDING"
  );
}

function getString(
  record: Record<string, unknown>,
  key: string
): string | null {
  return typeof record[key] === "string"
    ? record[key]
    : null;
}

function getNumber(
  record: Record<string, unknown>,
  key: string
): number | null {
  const value = record[key];

  return (
    typeof value === "number" &&
    Number.isFinite(value)
  )
    ? value
    : null;
}

function getOptionalIntegerFromString(
  value: string
): number | null | "INVALID" {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (!/^\d+$/.test(trimmed)) {
    return "INVALID";
  }

  const parsed = Number(trimmed);

  if (!Number.isSafeInteger(parsed)) {
    return "INVALID";
  }

  return parsed;
}

function formatPriceInput(
  value: number | null
): string {
  return value === null
    ? ""
    : String(value);
}

function normalizeProductImage(
  value: unknown,
  fallbackIndex: number
): ProductImage | null {
  if (!isRecord(value)) {
    return null;
  }

  const url = getString(
    value,
    "url"
  );

  if (!url) {
    return null;
  }

  const id =
    getString(
      value,
      "id"
    ) ??
    `${fallbackIndex}-${url}`;

  const publicId =
    getString(
      value,
      "publicId"
    );

  const sortOrder =
    getNumber(
      value,
      "sortOrder"
    );

  return {
    id,
    url,
    publicId,
    sortOrder:
      sortOrder !== null &&
      Number.isInteger(sortOrder)
        ? sortOrder
        : fallbackIndex,
  };
}

function normalizeProduct(
  value: unknown
): Product | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = getString(
    value,
    "id"
  );

  const name = getString(
    value,
    "name"
  );

  if (!id || !name) {
    return null;
  }

  const rawImages =
    Array.isArray(value.images)
      ? value.images
      : [];

  const images = rawImages
    .map(
      (image, index) =>
        normalizeProductImage(
          image,
          index
        )
    )
    .filter(
      (
        image
      ): image is ProductImage =>
        image !== null
    )
    .sort(
      (a, b) =>
        a.sortOrder -
        b.sortOrder
    );

  const imageUrl =
    getString(
      value,
      "imageUrl"
    );

  if (
    images.length === 0 &&
    imageUrl
  ) {
    images.push({
      id: `legacy-${id}`,
      url: imageUrl,
      publicId: null,
      sortOrder: 0,
    });
  }

  const rawKeywords =
    Array.isArray(
      value.keywords
    )
      ? value.keywords
      : [];

  const keywords =
    rawKeywords.filter(
      (
        item
      ): item is string =>
        typeof item === "string"
    );

  const availability =
    isAvailability(
      value.availability
    )
      ? value.availability
      : "ASK_SELLER";

  const status =
    isBusinessStatus(
      value.status
    )
      ? value.status
      : "ACTIVE";

  const rawCategory =
    isRecord(
      value.category
    )
      ? value.category
      : null;

  return {
    id,
    name,
    description:
      getString(
        value,
        "description"
      ),

    categoryId:
      getString(
        value,
        "categoryId"
      ),

    categoryName:
      rawCategory &&
      typeof rawCategory.name ===
        "string"
        ? rawCategory.name
        : null,

    price:
      getNumber(
        value,
        "price"
      ),

    priceMin:
      getNumber(
        value,
        "priceMin"
      ),

    priceMax:
      getNumber(
        value,
        "priceMax"
      ),

    availability,

    keywords,

    imageUrl,

    status,

    images,

    deletedAt:
      getString(
        value,
        "deletedAt"
      ),
  };
}

function normalizeBusinessProducts(
  value: unknown
): Product[] {
  if (!isRecord(value)) {
    return [];
  }

  if (!Array.isArray(value.products)) {
    return [];
  }

  return value.products
    .map(
      (product) =>
        normalizeProduct(product)
    )
    .filter(
      (
        product
      ): product is Product =>
        product !== null
    );
}

function getCategoryList(
  value: unknown
): {
  categories: ReMarketCategory[];
  fallback: boolean;
} {
  const rawCategories =
    isRecord(value)
      ? value.categories
      : undefined;

  if (
    !Array.isArray(
      rawCategories
    )
  ) {
    return {
      categories:
        DEFAULT_CATEGORIES,
      fallback: true,
    };
  }

  const backendCategories =
    rawCategories.filter(
      isApiCategory
    );

  if (
    backendCategories.length ===
    0
  ) {
    return {
      categories:
        DEFAULT_CATEGORIES,
      fallback: true,
    };
  }

  return {
    categories:
      mergeCategories(
        backendCategories
      ),
    fallback: false,
  };
}

export default function EditProductPage() {
  const params =
    useParams<{
      id: string;
      productId: string;
    }>();

  const router =
    useRouter();

  const businessId =
    params.id;

  const productId =
    params.productId;

  const [businessName, setBusinessName] =
    useState("");

  const [
    businessDeletedAt,
    setBusinessDeletedAt,
  ] =
    useState<
      string | null
    >(null);

  const [product, setProduct] =
    useState<Product | null>(
      null
    );

  const [
    categories,
    setCategories,
  ] =
    useState<
      ReMarketCategory[]
    >(
      DEFAULT_CATEGORIES
    );

  const [
    categoriesFallback,
    setCategoriesFallback,
  ] =
    useState(false);

  const [name, setName] =
    useState("");

  const [
    description,
    setDescription,
  ] =
    useState("");

  const [
    categoryId,
    setCategoryId,
  ] =
    useState("");

  const [price, setPrice] =
    useState("");

  const [
    priceMin,
    setPriceMin,
  ] =
    useState("");

  const [
    priceMax,
    setPriceMax,
  ] =
    useState("");

  const [
    availability,
    setAvailability,
  ] =
    useState<Availability>(
      "ASK_SELLER"
    );

  const [status, setStatus] =
    useState<BusinessStatus>(
      "ACTIVE"
    );

  const [
    keywords,
    setKeywords,
  ] =
    useState("");

  const [
    images,
    setImages,
  ] =
    useState<string[]>(
      []
    );

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

        const businessData: unknown =
          await businessResponse.json();

        const categoriesData: unknown =
          await categoriesResponse.json();

        if (
          !businessResponse.ok
        ) {
          throw new Error(
            isRecord(
              businessData
            ) &&
            typeof businessData.error ===
              "string"
              ? businessData.error
              : "Unable to load business."
          );
        }

        if (
          !categoriesResponse.ok
        ) {
          throw new Error(
            isRecord(
              categoriesData
            ) &&
            typeof categoriesData.error ===
              "string"
              ? categoriesData.error
              : "Unable to load categories."
          );
        }

        if (
          !isRecord(
            businessData
          ) ||
          !isRecord(
            businessData.business
          )
        ) {
          throw new Error(
            "Unable to load business."
          );
        }

        const business =
          businessData.business;

        const rawProducts =
          normalizeBusinessProducts(
            business
          );

        const foundProduct =
          rawProducts.find(
            (item) =>
              item.id ===
              productId
          );

        if (!foundProduct) {
          throw new Error(
            "Product not found."
          );
        }

        setBusinessName(
          typeof business.name ===
            "string"
            ? business.name
            : ""
        );

        setBusinessDeletedAt(
          typeof business.deletedAt ===
            "string"
            ? business.deletedAt
            : null
        );

        setProduct(
          foundProduct
        );

        setName(
          foundProduct.name
        );

        setDescription(
          foundProduct.description ??
            ""
        );

        setCategoryId(
          foundProduct.categoryId ??
            ""
        );

        setPrice(
          formatPriceInput(
            foundProduct.price
          )
        );

        setPriceMin(
          formatPriceInput(
            foundProduct.priceMin
          )
        );

        setPriceMax(
          formatPriceInput(
            foundProduct.priceMax
          )
        );

        setAvailability(
          foundProduct.availability
        );

        setStatus(
          foundProduct.status
        );

        setKeywords(
          foundProduct.keywords.join(
            ", "
          )
        );

        setImages(
          foundProduct.images.map(
            (image) =>
              image.url
          )
        );

        const categoryState =
          getCategoryList(
            categoriesData
          );

        setCategories(
          categoryState.categories
        );

        setCategoriesFallback(
          categoryState.fallback
        );
      } catch (
        loadError
      ) {
        if (
          loadError instanceof
            DOMException &&
          loadError.name ===
            "AbortError"
        ) {
          return;
        }

        console.error(
          "Edit product load error:",
          loadError
        );

        setError(
          loadError instanceof
            Error
            ? loadError.message
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

  const businessDeleted =
    businessDeletedAt !==
    null;

  const productDeleted =
    product?.deletedAt !==
    null;

  const editingDisabled =
    businessDeleted ||
    productDeleted;

  const currentCategoryName =
    product?.categoryName ??
    "Existing category";

  const categoryOptions =
    useMemo(() => {
      if (
        categoriesFallback
      ) {
        return [];
      }

      return categories;
    }, [
      categories,
      categoriesFallback,
    ]);

  function parsePriceField(
    value: string,
    label: string
  ): number | null {
    const parsed =
      getOptionalIntegerFromString(
        value
      );

    if (
      parsed ===
      "INVALID"
    ) {
      throw new Error(
        `${label} must be a whole number.`
      );
    }

    return parsed;
  }

  async function submit(
    event: React.SubmitEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!product) {
      setError(
        "Product could not be loaded."
      );
      return;
    }

    if (
      editingDisabled
    ) {
      setError(
        productDeleted
          ? "This product has been deleted."
          : "This business has been deleted."
      );
      return;
    }

    setSaving(true);
    setError("");

    const trimmedName =
      name.trim();

    const trimmedDescription =
      description.trim();

    if (!trimmedName) {
      setError(
        "Product name is required."
      );
      setSaving(false);
      return;
    }

    let parsedPrice:
      | number
      | null;

    let parsedPriceMin:
      | number
      | null;

    let parsedPriceMax:
      | number
      | null;

    try {
      parsedPrice =
        parsePriceField(
          price,
          "Exact price"
        );

      parsedPriceMin =
        parsePriceField(
          priceMin,
          "Minimum price"
        );

      parsedPriceMax =
        parsePriceField(
          priceMax,
          "Maximum price"
        );
    } catch (
      priceError
    ) {
      setError(
        priceError instanceof
          Error
          ? priceError.message
          : "Price values are invalid."
      );

      setSaving(false);
      return;
    }

    if (
      parsedPrice !==
        null &&
      parsedPrice < 0
    ) {
      setError(
        "Exact price cannot be negative."
      );
      setSaving(false);
      return;
    }

    if (
      parsedPriceMin !==
        null &&
      parsedPriceMin < 0
    ) {
      setError(
        "Minimum price cannot be negative."
      );
      setSaving(false);
      return;
    }

    if (
      parsedPriceMax !==
        null &&
      parsedPriceMax < 0
    ) {
      setError(
        "Maximum price cannot be negative."
      );
      setSaving(false);
      return;
    }

    if (
      parsedPriceMin !==
        null &&
      parsedPriceMax !==
        null &&
      parsedPriceMin >
        parsedPriceMax
    ) {
      setError(
        "Minimum price cannot be greater than maximum price."
      );
      setSaving(false);
      return;
    }

    const keywordValues =
      keywords
        .split(",")
        .map(
          (value: string) =>
            value.trim()
        )
        .filter(Boolean);

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

            body:
              JSON.stringify({
                name:
                  trimmedName,

                description:
                  trimmedDescription ||
                  null,

                categoryId:
                  categoryId ||
                  null,

                price:
                  parsedPrice,

                priceMin:
                  parsedPriceMin,

                priceMax:
                  parsedPriceMax,

                availability,

                status,

                keywords:
                  keywordValues,

                images,
              }),
          }
        );

      const data: unknown =
        await response.json();

      if (!response.ok) {
        throw new Error(
          isRecord(data) &&
          typeof data.error ===
            "string"
            ? data.error
            : "Unable to update product."
        );
      }

      router.push(
        `/admin/businesses/${businessId}`
      );
    } catch (
      submitError
    ) {
      console.error(
        "Update product error:",
        submitError
      );

      setError(
        submitError instanceof
          Error
          ? submitError.message
          : "Unable to update product."
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct() {
    if (
      !product ||
      editingDisabled
    ) {
      return;
    }

    const confirmed =
      window.confirm(
        "Delete this product? The product will be soft-deleted and kept in the admin record."
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

      const data: unknown =
        await response.json();

      if (!response.ok) {
        throw new Error(
          isRecord(data) &&
          typeof data.error ===
            "string"
            ? data.error
            : "Unable to delete product."
        );
      }

      router.push(
        `/admin/businesses/${businessId}`
      );
    } catch (
      deleteError
    ) {
      console.error(
        "Delete product error:",
        deleteError
      );

      setError(
        deleteError instanceof
          Error
          ? deleteError.message
          : "Unable to delete product."
      );
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#FFF7ED] p-4 sm:p-6">
        <div className="mx-auto flex min-h-[70vh] max-w-[900px] items-center justify-center">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading product...
          </div>
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="min-h-screen bg-[#FFF7ED] p-4 sm:p-6">
        <div className="mx-auto max-w-[900px]">
          <Link
            href={`/admin/businesses/${businessId}`}
            className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-[#9F2D18]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to business
          </Link>

          <div className="mt-5 rounded-[22px] border border-red-200 bg-red-50 p-6 text-xs text-red-700">
            {error ||
              "Product not found."}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FFF7ED] p-4 sm:p-6">
      <div className="mx-auto max-w-[900px]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href={`/admin/businesses/${businessId}`}
            className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-[#9F2D18]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to{" "}
            {businessName ||
              "business"}
          </Link>

          {!editingDisabled && (
            <button
              type="button"
              onClick={() =>
                void deleteProduct()
              }
              disabled={
                deleting ||
                saving
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-60"
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
          )}
        </div>

        <div className="mt-5 overflow-hidden rounded-[22px] border border-[#E8E4DE] bg-[#FFFDFC] shadow-sm">
          <div className="border-b border-[#EAE6DF] bg-white px-5 py-5 sm:px-7">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FF5A36] text-white">
                <Package className="h-5 w-5" />
              </div>

              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                  Product
                </p>

                <h1 className="mt-1 truncate text-xl font-bold text-[#17202A]">
                  Edit product
                </h1>

                <p className="mt-0.5 text-xs text-gray-500">
                  Update{" "}
                  {product.name}{" "}
                  for{" "}
                  {businessName ||
                    "this business"}
                  .
                </p>
              </div>
            </div>

            {(businessDeleted ||
              productDeleted) && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />

                <span>
                  {productDeleted
                    ? "This product has been soft-deleted and can no longer be edited."
                    : "This business has been deleted and its products can no longer be edited."}
                </span>
              </div>
            )}
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
                    onChange={(
                      event
                    ) =>
                      setName(
                        event.target.value
                      )
                    }
                    disabled={
                      editingDisabled ||
                      saving ||
                      deleting
                    }
                    placeholder="e.g. Men's Sneakers"
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-gray-50 disabled:text-gray-500"
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
                        event.target.value
                      )
                    }
                    disabled={
                      editingDisabled ||
                      saving ||
                      deleting
                    }
                    rows={4}
                    placeholder="Describe the product."
                    className="mt-2 w-full resize-none rounded-xl border border-[#E8E4DE] bg-white px-3 py-3 text-xs outline-none focus:border-[#FF9B82] disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-sm font-bold text-[#17202A]">
                Product images
              </h2>

              <p className="mt-1 text-[11px] text-gray-500">
                Add individual
                images or an image
                folder. The first
                image is the cover.
              </p>

              <div className="mt-4">
                <ProductImageUpload
                  value={images}
                  onChange={
                    setImages
                  }
                  disabled={
                    editingDisabled ||
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

                  {categoriesFallback ? (
                    <div className="mt-2 rounded-xl border border-[#E8E4DE] bg-gray-50 px-3 py-3 text-xs text-gray-600">
                      {currentCategoryName}

                      <p className="mt-1 text-[10px] text-gray-400">
                        Categories could
                        not be loaded.
                        The existing
                        category will
                        be preserved.
                      </p>
                    </div>
                  ) : (
                    <select
                      value={
                        categoryId
                      }
                      onChange={(
                        event
                      ) =>
                        setCategoryId(
                          event.target.value
                        )
                      }
                      disabled={
                        editingDisabled ||
                        saving ||
                        deleting
                      }
                      className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs disabled:bg-gray-50 disabled:text-gray-500"
                    >
                      <option value="">
                        No category
                      </option>

                      {categoryOptions.map(
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
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Exact price
                  </label>

                  <input
                    value={
                      price
                    }
                    onChange={(
                      event
                    ) =>
                      setPrice(
                        event.target.value
                      )
                    }
                    disabled={
                      editingDisabled ||
                      saving ||
                      deleting
                    }
                    inputMode="numeric"
                    placeholder="Optional"
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs disabled:bg-gray-50 disabled:text-gray-500"
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
                        event.target.value
                      )
                    }
                    disabled={
                      editingDisabled ||
                      saving ||
                      deleting
                    }
                    inputMode="numeric"
                    placeholder="Optional"
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs disabled:bg-gray-50 disabled:text-gray-500"
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
                        event.target.value
                      )
                    }
                    disabled={
                      editingDisabled ||
                      saving ||
                      deleting
                    }
                    inputMode="numeric"
                    placeholder="Optional"
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs disabled:bg-gray-50 disabled:text-gray-500"
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
                    ) => {
                      if (
                        isAvailability(
                          event.target.value
                        )
                      ) {
                        setAvailability(
                          event.target.value
                        );
                      }
                    }}
                    disabled={
                      editingDisabled ||
                      saving ||
                      deleting
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs disabled:bg-gray-50 disabled:text-gray-500"
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
                    value={
                      status
                    }
                    onChange={(
                      event
                    ) => {
                      if (
                        isBusinessStatus(
                          event.target.value
                        )
                      ) {
                        setStatus(
                          event.target.value
                        );
                      }
                    }}
                    disabled={
                      editingDisabled ||
                      saving ||
                      deleting
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs disabled:bg-gray-50 disabled:text-gray-500"
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
                value={
                  keywords
                }
                onChange={(
                  event
                ) =>
                  setKeywords(
                    event.target.value
                  )
                }
                disabled={
                  editingDisabled ||
                  saving ||
                  deleting
                }
                placeholder="e.g. sneakers, shoes, footwear"
                className="mt-3 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] disabled:bg-gray-50 disabled:text-gray-500"
              />

              <p className="mt-1.5 text-[10px] text-gray-400">
                Separate keywords
                with commas.
              </p>
            </section>

            <div className="flex flex-col-reverse gap-2 border-t border-[#EAE6DF] pt-5 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() =>
                  void deleteProduct()
                }
                disabled={
                  editingDisabled ||
                  deleting ||
                  saving
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50 sm:mr-auto"
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

              <div className="flex justify-end gap-2">
                <Link
                  href={`/admin/businesses/${businessId}`}
                  className="rounded-xl border border-[#E8E4DE] bg-white px-4 py-3 text-xs font-bold text-gray-700"
                >
                  Cancel
                </Link>

                <button
                  type="submit"
                  disabled={
                    editingDisabled ||
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