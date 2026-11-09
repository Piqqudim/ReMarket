"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import {
  useParams,
  useRouter,
} from "next/navigation";

import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Heart,
  Image as ImageIcon,
  LoaderCircle,
  MapPin,
  Package,
  Share2,
  Store,
  X,
} from "lucide-react";

import SiteHeader from "@/components/layout/SiteHeader";
import MobileBottomNav from "@/components/layout/MobileBottomNav";
import AddToCartButton from "@/components/cart/AddToCartButton";

/* =========================================================
   TYPES
========================================================= */

type Availability =
  | "AVAILABLE"
  | "ASK_SELLER"
  | "UNAVAILABLE";

type Verification =
  | "VERIFIED"
  | "UNVERIFIED";

type ProductImage = {
  id: string;
  url: string;
  sortOrder: number;
};

type ProductCategory = {
  id?: string;
  name: string;
} | null;

type ProductBusiness = {
  id: string;
  name: string;
  ownerName: string | null;
  description: string | null;
  imageUrl: string | null;
  availability: Availability;
  verification: Verification;
  verified: boolean;

  location: {
    area: string | null;
    street: string | null;
  } | null;

  categories: Array<{
    id: string;
    name: string;
  }>;
};

type ProductDetail = {
  id: string;
  name: string;
  description: string | null;

  price: number | null;
  priceMin: number | null;
  priceMax: number | null;

  availability: Availability;

  imageUrl: string | null;
  keywords: string[];

  createdAt: string;
  updatedAt: string;

  category: ProductCategory;
  images: ProductImage[];

  business: ProductBusiness;
};

type RelatedProduct = {
  id: string;
  name: string;

  price: number | null;
  priceMin: number | null;
  priceMax: number | null;

  availability: Availability;

  imageUrl: string | null;
  images: ProductImage[];

  category: {
    name: string;
  } | null;
};

type SavedProductRecord = {
  found: boolean;
  savedListingId: string | null;
};

/* =========================================================
   HELPERS
========================================================= */

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function nullableString(
  value: unknown,
): string | null {
  return typeof value === "string"
    ? value
    : null;
}

function nullableNumber(
  value: unknown,
): number | null {
  return (
    typeof value === "number" &&
    Number.isFinite(value)
  )
    ? value
    : null;
}

function parseAvailability(
  value: unknown,
): Availability {
  if (
    value === "AVAILABLE" ||
    value === "UNAVAILABLE"
  ) {
    return value;
  }

  return "ASK_SELLER";
}

function parseImages(
  value: unknown,
): ProductImage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index) => {
    if (
      !isRecord(item) ||
      typeof item.url !== "string" ||
      !item.url.trim()
    ) {
      return [];
    }

    return [
      {
        id:
          typeof item.id === "string"
            ? item.id
            : `image-${index}`,

        url: item.url,

        sortOrder:
          typeof item.sortOrder === "number"
            ? item.sortOrder
            : index,
      },
    ];
  });
}

function parseProductCategory(
  value: unknown,
): ProductCategory {
  if (
    !isRecord(value) ||
    typeof value.name !== "string"
  ) {
    return null;
  }

  return {
    id:
      typeof value.id === "string"
        ? value.id
        : undefined,

    name: value.name,
  };
}

/* =========================================================
   PRODUCT PARSER
========================================================= */

function parseProduct(
  value: unknown,
): ProductDetail | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.name !== "string" ||
    !isRecord(value.seller)
  ) {
    return null;
  }

  /*
   * IMPORTANT:
   * The product details API returns the business
   * information under "seller", not "business".
   *
   * We map it to our internal "business" property
   * so the rest of this page can remain unchanged.
   */

  const rawBusiness = value.seller;

  if (
    typeof rawBusiness.id !== "string" ||
    typeof rawBusiness.name !== "string"
  ) {
    return null;
  }

  const rawLocation = isRecord(
    rawBusiness.location,
  )
    ? rawBusiness.location
    : null;

  const rawCategories = Array.isArray(
    rawBusiness.categories,
  )
    ? rawBusiness.categories
    : [];

  const categories = rawCategories.flatMap(
    (item) => {
      if (
        !isRecord(item) ||
        typeof item.id !== "string" ||
        typeof item.name !== "string"
      ) {
        return [];
      }

      return [
        {
          id: item.id,
          name: item.name,
        },
      ];
    },
  );

  const rawKeywords = Array.isArray(
    value.keywords,
  )
    ? value.keywords
    : [];

  const keywords = rawKeywords.filter(
    (item): item is string =>
      typeof item === "string" &&
      item.trim().length > 0,
  );

  const verification: Verification =
    rawBusiness.verification === "VERIFIED"
      ? "VERIFIED"
      : "UNVERIFIED";

  return {
    id: value.id,
    name: value.name,

    description: nullableString(
      value.description,
    ),

    price: nullableNumber(value.price),
    priceMin: nullableNumber(value.priceMin),
    priceMax: nullableNumber(value.priceMax),

    availability: parseAvailability(
      value.availability,
    ),

    imageUrl: nullableString(value.imageUrl),

    keywords,

    createdAt:
      typeof value.createdAt === "string"
        ? value.createdAt
        : "",

    updatedAt:
      typeof value.updatedAt === "string"
        ? value.updatedAt
        : "",

    category: parseProductCategory(
      value.category,
    ),

    images: parseImages(value.images),

    business: {
      id: rawBusiness.id,
      name: rawBusiness.name,

      ownerName: nullableString(
        rawBusiness.ownerName,
      ),

      description: nullableString(
        rawBusiness.description,
      ),

      imageUrl: nullableString(
        rawBusiness.imageUrl,
      ),

      availability: parseAvailability(
        rawBusiness.availability,
      ),

      verification,

      verified:
        rawBusiness.verified === true ||
        verification === "VERIFIED",

      location: rawLocation
        ? {
            area: nullableString(
              rawLocation.area,
            ),

            street: nullableString(
              rawLocation.street,
            ),
          }
        : null,

      categories,
    },
  };
}

/* =========================================================
   RELATED PRODUCTS PARSER
========================================================= */

function parseRelatedProducts(
  value: unknown,
): RelatedProduct[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.name !== "string"
    ) {
      return [];
    }

    const category =
      isRecord(item.category) &&
      typeof item.category.name === "string"
        ? {
            name: item.category.name,
          }
        : null;

    return [
      {
        id: item.id,
        name: item.name,

        price: nullableNumber(item.price),
        priceMin: nullableNumber(item.priceMin),
        priceMax: nullableNumber(item.priceMax),

        availability: parseAvailability(
          item.availability,
        ),

        imageUrl: nullableString(
          item.imageUrl,
        ),

        images: parseImages(item.images),

        category,
      },
    ];
  });
}

/* =========================================================
   SAVED LISTING HELPERS
========================================================= */

/*
 * The API stores the SavedListing record separately
 * from the Product record.
 *
 * Therefore:
 * - Product ID identifies the product.
 * - SavedListing ID identifies the saved record
 *   that must be deleted.
 */

function findSavedProduct(
  value: unknown,
  productId: string,
): SavedProductRecord {
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findSavedProduct(
        item,
        productId,
      );

      if (result.found) {
        return result;
      }
    }

    return {
      found: false,
      savedListingId: null,
    };
  }

  if (!isRecord(value)) {
    return {
      found: false,
      savedListingId: null,
    };
  }

  const nestedProduct = isRecord(value.product)
    ? value.product
    : null;

  const nestedSaved = isRecord(value.savedListing)
    ? value.savedListing
    : isRecord(value.saved)
      ? value.saved
      : null;

  const matchesProduct =
    value.productId === productId ||
    value.listingId === productId ||
    nestedProduct?.id === productId ||
    (
      (
        typeof value.savedListingId === "string" ||
        typeof value.savedId === "string"
      ) &&
      value.id === productId
    );

  if (matchesProduct) {
    const savedListingId =
      nullableString(value.savedListingId) ??
      nullableString(value.savedId) ??
      nullableString(nestedSaved?.id) ??
      (
        value.productId === productId ||
        value.listingId === productId ||
        nestedProduct?.id === productId
          ? nullableString(value.id)
          : null
      );

    return {
      found: true,
      savedListingId,
    };
  }

  const collections = [
    value.savedListings,
    value.savedProducts,
    value.products,
    value.items,
    value.results,
    value.saved,
    value.data,
  ];

  for (const collection of collections) {
    if (
      Array.isArray(collection) ||
      isRecord(collection)
    ) {
      const result = findSavedProduct(
        collection,
        productId,
      );

      if (result.found) {
        return result;
      }
    }
  }

  return {
    found: false,
    savedListingId: null,
  };
}

function extractCreatedSavedId(
  value: unknown,
): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const savedListing = isRecord(
    value.savedListing,
  )
    ? value.savedListing
    : isRecord(value.saved)
      ? value.saved
      : null;

  if (savedListing) {
    return nullableString(savedListing.id);
  }

  return (
    nullableString(value.savedListingId) ??
    nullableString(value.savedId)
  );
}

/* =========================================================
   PRICE AND STATUS HELPERS
========================================================= */

function formatNaira(value: number): string {
  return `₦${value.toLocaleString("en-NG")}`;
}

function formatPrice(
  product: Pick<
    ProductDetail,
    "price" | "priceMin" | "priceMax"
  >,
): string {
  if (product.price !== null) {
    return formatNaira(product.price);
  }

  if (
    product.priceMin !== null &&
    product.priceMax !== null
  ) {
    if (
      product.priceMin ===
      product.priceMax
    ) {
      return formatNaira(product.priceMin);
    }

    return `${formatNaira(
      product.priceMin,
    )} – ${formatNaira(
      product.priceMax,
    )}`;
  }

  if (product.priceMin !== null) {
    return `From ${formatNaira(
      product.priceMin,
    )}`;
  }

  if (product.priceMax !== null) {
    return `Up to ${formatNaira(
      product.priceMax,
    )}`;
  }

  return "Price unavailable";
}

function availabilityLabel(
  value: Availability,
): string {
  switch (value) {
    case "AVAILABLE":
      return "Available";

    case "UNAVAILABLE":
      return "Currently unavailable";

    default:
      return "Ask about availability";
  }
}

function availabilityClass(
  value: Availability,
): string {
  switch (value) {
    case "AVAILABLE":
      return "bg-[#DCFCE7] text-[#166534]";

    case "UNAVAILABLE":
      return "bg-[#FEE2E2] text-[#B42318]";

    default:
      return "bg-[#FEF3C7] text-[#92400E]";
  }
}

function formatDate(value: string): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* =========================================================
   RELATED PRODUCT CARD
========================================================= */

function ProductTile({
  product,
}: {
  product: RelatedProduct;
}) {
  const image =
    product.images[0]?.url ??
    product.imageUrl;

  return (
    <Link
      href={`/product/${encodeURIComponent(
        product.id,
      )}`}
      className="
        group min-w-0 overflow-hidden
        rounded-2xl border border-[#EAE6DF]
        bg-white transition
        hover:-translate-y-0.5
        hover:border-[#FFB39F]
        hover:shadow-[0_8px_24px_rgba(23,32,42,0.07)]
      "
    >
      <div className="aspect-square overflow-hidden bg-[#FCFAF6]">
        {image ? (
          <img
            src={image}
            alt={product.name}
            loading="lazy"
            className="
              h-full w-full object-cover
              transition duration-300
              group-hover:scale-[1.04]
            "
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[#B6A99E]">
            <Package className="h-8 w-8" />
          </div>
        )}
      </div>

      <div className="p-3">
        {product.category && (
          <p className="truncate text-[9px] font-bold uppercase tracking-wide text-[#9F2D18]">
            {product.category.name}
          </p>
        )}

        <p className="mt-1 line-clamp-2 min-h-10 text-xs font-bold leading-5 text-[#292522]">
          {product.name}
        </p>

        <p className="mt-2 text-sm font-extrabold text-[#9F2D18]">
          {formatPrice(product)}
        </p>
      </div>
    </Link>
  );
}

/* =========================================================
   MAIN PRODUCT DETAIL
========================================================= */

function ProductPageContent({
  id,
}: {
  id: string;
}) {
  const router = useRouter();

  const [product, setProduct] =
    useState<ProductDetail | null>(null);

  const [relatedProducts, setRelatedProducts] =
    useState<RelatedProduct[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [activeImageIndex, setActiveImageIndex] =
    useState(0);

  const [shareFeedback, setShareFeedback] =
    useState("");

  /* Saved product state */

  const [saved, setSaved] =
    useState(false);

  const [savedListingId, setSavedListingId] =
    useState<string | null>(null);

  const [savedLoading, setSavedLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [savedFeedback, setSavedFeedback] =
    useState("");

  const [savedFeedbackError, setSavedFeedbackError] =
    useState(false);

  /* =====================================================
     LOAD PRODUCT
  ===================================================== */

  useEffect(() => {
    if (!id) {
      setProduct(null);
      setRelatedProducts([]);
      setError("Product not found.");
      setLoading(false);

      return;
    }

    const controller = new AbortController();

    async function loadProduct() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(
          `/api/products/${encodeURIComponent(id)}`,
          {
            method: "GET",
            cache: "no-store",
            headers: {
              Accept: "application/json",
            },
            signal: controller.signal,
          },
        );

        const payload: unknown =
          await response.json().catch(() => null);

        if (!response.ok) {
          const message =
            isRecord(payload) &&
            typeof payload.error === "string"
              ? payload.error
              : "Unable to load this product.";

          throw new Error(message);
        }

        if (!isRecord(payload)) {
          throw new Error(
            "Product information is not available.",
          );
        }

        const normalizedProduct = parseProduct(
          payload.product,
        );

        if (!normalizedProduct) {
          throw new Error(
            "Product information is not available.",
          );
        }

        if (controller.signal.aborted) {
          return;
        }

        setProduct(normalizedProduct);

        setRelatedProducts(
          parseRelatedProducts(
            payload.relatedProducts,
          ),
        );

        setActiveImageIndex(0);
        setShareFeedback("");
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        if (!controller.signal.aborted) {
          setProduct(null);
          setRelatedProducts([]);

          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load this product.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadProduct();

    return () => {
      controller.abort();
    };
  }, [id]);

  /* =====================================================
     PRODUCT IMAGES
  ===================================================== */

  const images = useMemo(() => {
    if (!product) {
      return [];
    }

    const galleryImages =
      product.images.map((item) => item.url);

    const candidates =
      galleryImages.length > 0
        ? galleryImages
        : product.imageUrl
          ? [product.imageUrl]
          : [];

    return Array.from(
      new Set(
        candidates.filter(
          (image) =>
            typeof image === "string" &&
            image.trim().length > 0,
        ),
      ),
    );
  }, [product]);

  /* =====================================================
     LOAD SAVED PRODUCT
  ===================================================== */

  useEffect(() => {
    if (!id) {
      setSavedLoading(false);
      return;
    }

    const controller = new AbortController();

    async function loadSavedStatus() {
      setSavedLoading(true);

      try {
        const response = await fetch(
          "/api/saved",
          {
            method: "GET",
            cache: "no-store",
            headers: {
              Accept: "application/json",
            },
            signal: controller.signal,
          },
        );

        if (
          response.status === 401 ||
          response.status === 403
        ) {
          setSaved(false);
          setSavedListingId(null);
          return;
        }

        if (!response.ok) {
          return;
        }

        const payload: unknown =
          await response.json();

        const result = findSavedProduct(
          payload,
          id,
        );

        if (controller.signal.aborted) {
          return;
        }

        setSaved(result.found);
        setSavedListingId(
          result.savedListingId,
        );
      } catch (loadError) {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }

        console.error(
          "Saved product status error:",
          loadError,
        );
      } finally {
        if (!controller.signal.aborted) {
          setSavedLoading(false);
        }
      }
    }

    void loadSavedStatus();

    return () => {
      controller.abort();
    };
  }, [id]);

  /* =====================================================
     SAVE / REMOVE PRODUCT
  ===================================================== */

  async function toggleSavedProduct() {
    if (!product || saving) {
      return;
    }

    setSavedFeedback("");
    setSavedFeedbackError(false);
    setSaving(true);

    try {
      if (saved) {
        let recordId = savedListingId;

        /*
         * Refresh the Saved record ID when needed.
         * DELETE must use the SavedListing ID,
         * not the Product ID.
         */

        if (!recordId) {
          const savedResponse = await fetch(
            "/api/saved",
            {
              method: "GET",
              cache: "no-store",
              headers: {
                Accept: "application/json",
              },
            },
          );

          if (
            savedResponse.status === 401 ||
            savedResponse.status === 403
          ) {
            router.push("/buyer/login");
            return;
          }

          if (!savedResponse.ok) {
            throw new Error(
              "Unable to retrieve your saved product.",
            );
          }

          const savedPayload: unknown =
            await savedResponse.json();

          const record = findSavedProduct(
            savedPayload,
            product.id,
          );

          recordId = record.savedListingId;

          if (!record.found || !recordId) {
            throw new Error(
              "The saved listing record could not be identified. Refresh the page and try again.",
            );
          }
        }

        const response = await fetch(
          `/api/saved/${encodeURIComponent(recordId)}`,
          {
            method: "DELETE",
            headers: {
              Accept: "application/json",
            },
          },
        );

        const payload: unknown =
          await response.json().catch(() => null);

        if (!response.ok) {
          const message =
            isRecord(payload) &&
            typeof payload.error === "string"
              ? payload.error
              : "Unable to remove this product from Saved.";

          throw new Error(message);
        }

        setSaved(false);
        setSavedListingId(null);

        setSavedFeedback(
          "Product removed from your Saved listings.",
        );
      } else {
        const response = await fetch(
          "/api/saved",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              type: "PRODUCT",
              listingId: product.id,
            }),
          },
        );

        const payload: unknown =
          await response.json().catch(() => null);

        if (
          response.status === 401 ||
          response.status === 403
        ) {
          router.push("/buyer/login");
          return;
        }

        if (!response.ok) {
          const message =
            isRecord(payload) &&
            typeof payload.error === "string"
              ? payload.error
              : "Unable to save this product.";

          throw new Error(message);
        }

        setSaved(true);

        let recordId =
          extractCreatedSavedId(payload);

        /*
         * If the response did not expose the
         * SavedListing ID, retrieve it from
         * the Saved endpoint.
         */

        if (!recordId) {
          try {
            const refreshResponse = await fetch(
              "/api/saved",
              {
                method: "GET",
                cache: "no-store",
                headers: {
                  Accept: "application/json",
                },
              },
            );

            if (refreshResponse.ok) {
              const refreshPayload: unknown =
                await refreshResponse.json();

              const record = findSavedProduct(
                refreshPayload,
                product.id,
              );

              recordId =
                record.savedListingId;
            }
          } catch (refreshError) {
            console.error(
              "Saved listing ID refresh error:",
              refreshError,
            );
          }
        }

        setSavedListingId(recordId);

        setSavedFeedback(
          "Product added to your Saved listings.",
        );
      }
    } catch (saveError) {
      console.error(
        "Product save action error:",
        saveError,
      );

      setSavedFeedbackError(true);

      setSavedFeedback(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update your Saved listings.",
      );
    } finally {
      setSaving(false);
    }
  }

  /* =====================================================
     SHARE PRODUCT
  ===================================================== */

  async function shareProduct() {
    if (
      !product ||
      typeof window === "undefined"
    ) {
      return;
    }

    const url = window.location.href;

    const shareData = {
      title: `${product.name} | ReMarket`,
      text: `Discover ${product.name} on ReMarket.`,
      url,
    };

    setShareFeedback("");

    if (
      typeof navigator.share === "function"
    ) {
      try {
        await navigator.share(shareData);

        setShareFeedback(
          "Thanks for sharing this product.",
        );

        return;
      } catch (shareError) {
        if (
          shareError instanceof Error &&
          shareError.name === "AbortError"
        ) {
          return;
        }
      }
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);

        setShareFeedback(
          "Product link copied. You can now share it.",
        );

        return;
      }
    } catch (copyError) {
      console.error(
        "Product link copy error:",
        copyError,
      );
    }

    setShareFeedback(
      "Copy the product page address from your browser.",
    );
  }

  /* =====================================================
     IMAGE NAVIGATION
  ===================================================== */

  function showPreviousImage() {
    if (images.length <= 1) {
      return;
    }

    setActiveImageIndex((current) =>
      current === 0
        ? images.length - 1
        : current - 1,
    );
  }

  function showNextImage() {
    if (images.length <= 1) {
      return;
    }

    setActiveImageIndex((current) =>
      current === images.length - 1
        ? 0
        : current + 1,
    );
  }

  /* =====================================================
     LOADING STATE
  ===================================================== */

  if (loading) {
    return (
      <>
        <SiteHeader searchMode="PRODUCTS" />

        <main className="flex min-h-[65vh] items-center justify-center bg-[#FFFDFC] px-4 pb-28">
          <div
            role="status"
            className="flex items-center gap-3 text-sm font-semibold text-[#756B61]"
          >
            <LoaderCircle className="h-5 w-5 animate-spin text-[#FF5A36]" />
            Loading product...
          </div>
        </main>

        <MobileBottomNav />
      </>
    );
  }

  /* =====================================================
     ERROR STATE
  ===================================================== */

  if (error || !product) {
    return (
      <>
        <SiteHeader searchMode="PRODUCTS" />

        <main className="flex min-h-[65vh] items-center justify-center bg-[#FFFDFC] px-4 pb-28">
          <section className="w-full max-w-md rounded-2xl border border-[#F0C9BF] bg-[#FFF1ED] p-7 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFE0D6] text-[#9F2D18]">
              <Package className="h-7 w-7" />
            </div>

            <h1 className="mt-4 text-lg font-extrabold text-[#17202A]">
              Product not available
            </h1>

            <p className="mt-2 text-sm leading-6 text-[#756B61]">
              {error ||
                "This product may have been removed or is no longer available."}
            </p>

            <Link
              href="/shop"
              className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-bold text-white transition hover:bg-[#E94E2C]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Products
            </Link>
          </section>
        </main>

        <MobileBottomNav />
      </>
    );
  }

  /* =====================================================
     PRODUCT DISPLAY DATA
  ===================================================== */

  const business = product.business;

  const locationLabel = [
    business.location?.street,
    business.location?.area,
  ]
    .filter(Boolean)
    .join(", ");

  const listedDate = formatDate(
    product.createdAt,
  );

  /*
   * Correct seller profile route.
   * ReMarket uses /seller/[id] for public business profiles.
   */

  const businessProfileUrl =
    `/seller/${encodeURIComponent(business.id)}`;

  /* =====================================================
     MAIN PAGE
  ===================================================== */

  return (
    <>
      <SiteHeader searchMode="PRODUCTS" />

      <main
        id="main-content"
        className="min-h-dvh overflow-x-clip bg-[#FFFDFC] pb-28 text-[#17202A] lg:pb-10"
      >
        <div className="mx-auto max-w-[1500px] px-4 pb-8 pt-5 sm:px-6 lg:px-8 lg:pt-7">

          {/* =====================================
              BREADCRUMB / TOP ACTIONS
          ===================================== */}

          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2 text-[11px] text-[#756B61]">
              <Link
                href="/"
                className="transition hover:text-[#9F2D18]"
              >
                Home
              </Link>

              <ChevronRight className="h-3 w-3 shrink-0" />

              <Link
                href="/shop"
                className="transition hover:text-[#9F2D18]"
              >
                Products
              </Link>

              {product.category && (
                <>
                  <ChevronRight className="h-3 w-3 shrink-0" />

                  <span className="truncate font-semibold text-[#9F2D18]">
                    {product.category.name}
                  </span>
                </>
              )}
            </div>

            <Link
              href="/shop"
              className="inline-flex shrink-0 items-center gap-1.5 text-[11px] font-bold text-[#9F2D18] transition hover:text-[#FF5A36]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to products
            </Link>
          </div>

          {/* =====================================
              PRODUCT CONTENT
          ===================================== */}

          <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] xl:gap-8">

            {/* =================================
                IMAGE GALLERY
            ================================= */}

            <section className="min-w-0">
              <div className="relative overflow-hidden rounded-[22px] border border-[#EAE6DF] bg-[#FCFAF6]">
                <div className="relative flex aspect-square max-h-[680px] items-center justify-center">
                  {(() => {
                    const mainImage =
                      images[activeImageIndex] ?? null;

                    return mainImage ? (
                      <img
                        src={mainImage}
                        alt={product.name}
                        fetchPriority="high"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-3 text-[#B6A99E]">
                        <ImageIcon className="h-12 w-12" />

                        <span className="text-xs font-semibold">
                          No product image
                        </span>
                      </div>
                    );
                  })()}

                  {images.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={showPreviousImage}
                        aria-label="Previous product image"
                        className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#EAE6DF] bg-white/95 text-[#514840] shadow-sm transition hover:text-[#9F2D18]"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>

                      <button
                        type="button"
                        onClick={showNextImage}
                        aria-label="Next product image"
                        className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#EAE6DF] bg-white/95 text-[#514840] shadow-sm transition hover:text-[#9F2D18]"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>

                      <span className="absolute bottom-3 right-3 rounded-full bg-[#17202A]/70 px-3 py-1.5 text-[10px] font-semibold text-white">
                        {activeImageIndex + 1} / {images.length}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* THUMBNAILS */}

              {images.length > 1 && (
                <div
                  className="mt-3 flex gap-2 overflow-x-auto pb-2"
                  aria-label="Product image thumbnails"
                >
                  {images.map((image, index) => {
                    const isActive =
                      activeImageIndex === index;

                    return (
                      <button
                        key={`${product.id}-image-${index}`}
                        type="button"
                        onClick={() =>
                          setActiveImageIndex(index)
                        }
                        aria-label={`Show product image ${index + 1}`}
                        aria-pressed={isActive}
                        className={`h-[68px] w-[68px] shrink-0 overflow-hidden rounded-xl border-2 bg-white transition sm:h-[76px] sm:w-[76px] ${
                          isActive
                            ? "border-[#FF5A36]"
                            : "border-[#EAE6DF] hover:border-[#FFB39F]"
                        }`}
                      >
                        <img
                          src={image}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* IMAGE COUNT */}

              {images.length === 1 && (
                <p className="mt-2 text-[10px] text-[#91877E]">
                  1 product image
                </p>
              )}
            </section>

            {/* =================================
                PRODUCT INFORMATION
            ================================= */}

            <section className="min-w-0">
              <div className="rounded-[22px] border border-[#EAE6DF] bg-white p-5 shadow-[0_4px_20px_rgba(23,32,42,0.035)] sm:p-6">

                {/* CATEGORY AND AVAILABILITY */}

                <div className="flex flex-wrap items-center gap-2">
                  {product.category && (
                    <span className="rounded-full border border-[#FFD9CE] bg-[#FFF1ED] px-3 py-1.5 text-[10px] font-bold text-[#9F2D18]">
                      {product.category.name}
                    </span>
                  )}

                  <span
                    className={`rounded-full px-3 py-1.5 text-[10px] font-bold ${availabilityClass(product.availability)}`}
                  >
                    {availabilityLabel(product.availability)}
                  </span>
                </div>

                {/* PRODUCT NAME */}

                <h1 className="mt-4 break-words text-[25px] font-extrabold leading-tight tracking-tight text-[#17202A] sm:text-[32px]">
                  {product.name}
                </h1>

                {/* PRICE */}

                <div className="mt-4 flex flex-wrap items-baseline gap-2">
                  <p className="text-[27px] font-black tracking-tight text-[#9F2D18] sm:text-[31px]">
                    {formatPrice(product)}
                  </p>
                </div>

                {listedDate && (
                  <p className="mt-2 text-[10px] text-[#9B9188]">
                    Listed {listedDate}
                  </p>
                )}

                {/* SAVE / SHARE */}

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void toggleSavedProduct();
                    }}
                    disabled={saving || savedLoading}
                    aria-pressed={saved}
                    className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      saved
                        ? "border-[#FFB39F] bg-[#FFF1ED] text-[#9F2D18]"
                        : "border-[#EAE6DF] bg-white text-[#514840] hover:border-[#FFB39F] hover:text-[#9F2D18]"
                    }`}
                  >
                    {saving || savedLoading ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Heart
                        className="h-4 w-4"
                        fill={
                          saved
                            ? "currentColor"
                            : "none"
                        }
                      />
                    )}

                    {saved
                      ? "Saved"
                      : "Save product"}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      void shareProduct();
                    }}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-3 py-3 text-xs font-bold text-[#514840] transition hover:border-[#FFB39F] hover:text-[#9F2D18]"
                  >
                    <Share2 className="h-4 w-4" />
                    Share
                  </button>
                </div>

                {savedFeedback && (
                  <div
                    role="status"
                    className={`mt-3 flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-[11px] leading-5 ${
                      savedFeedbackError
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-[#FFD9CE] bg-[#FFF1ED] text-[#9F2D18]"
                    }`}
                  >
                    <span>{savedFeedback}</span>

                    <button
                      type="button"
                      onClick={() =>
                        setSavedFeedback("")
                      }
                      aria-label="Dismiss message"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {shareFeedback && (
                  <p
                    role="status"
                    className="mt-3 text-[11px] text-[#137A59]"
                  >
                    {shareFeedback}
                  </p>
                )}

                {/* DIVIDER */}

                <div className="my-6 h-px bg-[#F0ECE7]" />

                {/* DESCRIPTION */}

                <section>
                  <h2 className="text-sm font-extrabold text-[#292522]">
                    Product description
                  </h2>

                  {product.description ? (
                    <p className="mt-3 whitespace-pre-wrap break-words text-[13px] leading-7 text-[#6F675F]">
                      {product.description}
                    </p>
                  ) : (
                    <p className="mt-3 text-xs leading-6 text-[#8B847E]">
                      The seller has not added a product
                      description yet.
                    </p>
                  )}
                </section>

                {/* KEYWORDS */}

                {product.keywords.length > 0 && (
                  <section className="mt-6 border-t border-[#F0ECE7] pt-5">
                    <h2 className="text-xs font-extrabold text-[#292522]">
                      Product tags
                    </h2>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {product.keywords.map(
                        (keyword, index) => (
                          <span
                            key={`${product.id}-${keyword}-${index}`}
                            className="rounded-full bg-[#F5F2ED] px-3 py-1.5 text-[10px] font-semibold text-[#6F675F]"
                          >
                            {keyword}
                          </span>
                        ),
                      )}
                    </div>
                  </section>
                )}
              </div>

              {/* =====================================
                  PRODUCT PURCHASE / ADD TO CART
              ===================================== */}

              <div className="mt-4">
                <AddToCartButton
                  productId={product.id}
                  availability={product.availability}
                  price={product.price}
                  priceMin={product.priceMin}
                  priceMax={product.priceMax}
                />
              </div>
            </section>
          </div>

          {/* =====================================
              BUSINESS INFORMATION
          ===================================== */}

          <section className="mt-7 rounded-[22px] border border-[#EAE6DF] bg-white p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#EAE6DF] bg-[#FFF0E9] text-[#9F2D18]">
                  {business.imageUrl ? (
                    <img
                      src={business.imageUrl}
                      alt={business.name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Store className="h-6 w-6" />
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-sm font-extrabold text-[#17202A] sm:text-base">
                      {business.name}
                    </h2>

                    {business.verified && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#DCFCE7] px-2 py-1 text-[9px] font-bold text-[#166534]">
                        <BadgeCheck className="h-3 w-3" />
                        Verified
                      </span>
                    )}
                  </div>

                  {business.ownerName && (
                    <p className="mt-1 truncate text-[11px] text-[#8B847E]">
                      {business.ownerName}
                    </p>
                  )}

                  {locationLabel && (
                    <p className="mt-1 flex items-center gap-1 text-[10px] text-[#8B847E]">
                      <MapPin className="h-3 w-3 shrink-0 text-[#FF5A36]" />

                      <span className="truncate">
                        {locationLabel}
                      </span>
                    </p>
                  )}
                </div>
              </div>

              <Link
                href={businessProfileUrl}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-bold text-white transition hover:bg-[#E94E2C]"
              >
                View business profile
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {business.description && (
              <div className="mt-5 border-t border-[#F0ECE7] pt-4">
                <h3 className="text-xs font-extrabold text-[#292522]">
                  About this business
                </h3>

                <p className="mt-2 max-w-3xl whitespace-pre-wrap text-xs leading-6 text-[#756B61]">
                  {business.description}
                </p>
              </div>
            )}

            {business.categories.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {business.categories.map(
                  (category) => (
                    <span
                      key={category.id}
                      className="rounded-full bg-[#FCFAF6] px-3 py-1.5 text-[10px] font-semibold text-[#6F675F]"
                    >
                      {category.name}
                    </span>
                  ),
                )}
              </div>
            )}
          </section>

          {/* =====================================
              RELATED PRODUCTS
          ===================================== */}

          {relatedProducts.length > 0 && (
            <section className="mt-9">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-extrabold tracking-tight text-[#401B13]">
                    More from this business
                  </h2>

                  <p className="mt-1 text-xs text-[#756B61]">
                    Explore other products listed by{" "}
                    {business.name}.
                  </p>
                </div>

                <Link
                  href={businessProfileUrl}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#9F2D18] transition hover:text-[#FF5A36]"
                >
                  View business
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {relatedProducts.map((related) => (
                  <ProductTile
                    key={related.id}
                    product={related}
                  />
                ))}
              </div>
            </section>
          )}

          {/* =====================================
              FOOTER
          ===================================== */}

          <footer className="mt-10 flex items-center justify-center gap-3 pb-4 text-[10px] text-[#9B9188]">
            <span className="h-px w-12 bg-[#EAE6DF]" />

            <span>
              ReMarket · Find it nearby
            </span>

            <span className="h-px w-12 bg-[#EAE6DF]" />
          </footer>
        </div>
      </main>

      <MobileBottomNav />
    </>
  );
}

/* =========================================================
   PAGE ENTRY
========================================================= */

export default function ProductPage() {
  const params = useParams();

  const id =
    typeof params.id === "string"
      ? params.id
      : "";

  return (
    <ProductPageContent
      key={id}
      id={id}
    />
  );
}