"use client";

import {
  type MouseEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import Link from "next/link";
import { useParams } from "next/navigation";
import { getSession } from "next-auth/react";

import {
  Home,
  ShoppingBag,
  ClipboardList,
  Heart,
  Search,
  MapPin,
  ArrowLeft,
  Store,
  CheckCircle2,
  MessageCircle,
  Phone,
  Music2,
  Package,
  ExternalLink,
  Star,
  Pencil,
  Trash2,
  LoaderCircle,
  ShieldCheck,
  Clock3,
  X,
} from "lucide-react";

import { trackContactEvent } from "@/lib/contact-event";

import {
  isBusinessSaved,
  saveBusiness,
  removeSavedBusiness,
  SAVED_BUSINESSES_CHANGED_EVENT,
} from "@/lib/saved";

const NAV_ITEMS = [
  {
    label: "Home",
    href: "/",
    icon: Home,
  },
  {
    label: "Shop",
    href: "/shop",
    icon: ShoppingBag,
  },
  {
    label: "Requests",
    href: "/my-requests",
    icon: ClipboardList,
  },
  {
    label: "Saved",
    href: "/saved",
    icon: Heart,
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  fashion: "#FFE0D6",
  electronics: "#DDF5EA",
  food: "#FFF0C7",
  beauty: "#E7E5FF",
  textiles: "#F9DCE8",
  services: "#E4E9EF",
};

type Availability =
  | "AVAILABLE"
  | "ASK_SELLER"
  | "UNAVAILABLE";

type Verification =
  | "VERIFIED"
  | "UNVERIFIED";

type ProductImage = {
  id?: string;
  url: string;
  publicId?: string | null;
  sortOrder?: number;
};

type Product = {
  id: string;
  name: string;
  description?: string | null;
  price?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  availability?: Availability;
  imageUrl?: string | null;
  images: ProductImage[];
  category?: {
    id?: string;
    name: string;
  } | null;
  keywords: string[];
};

type SocialLink = {
  id: string;
  platform: string;
  handle: string;
};

type SellerLocation = {
  id?: string;
  area: string;
  street?: string | null;
  address?: string | null;
  lat?: number | null;
  long?: number | null;
} | null;

type Seller = {
  id: string;
  name: string;
  ownerName: string | null;
  description: string | null;

  location: SellerLocation;

  availability: Availability;
  verification: Verification;
  verified?: boolean;

  category: string | null;
  categories: string[];

  productCount: number;
  products: Product[];

  socialLinks: SocialLink[];

  imageUrl?: string | null;
  claimable: boolean;
  averageRating: number;
  reviewCount: number;
};

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string };
};

type RatingBreakdown = { 1: number; 2: number; 3: number; 4: number; 5: number };
type ReMarketRole = "ADMIN" | "SELLER" | "BUYER";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatReviewDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function getRatingLabel(rating: number): string {
  switch (rating) {
    case 1: return "Poor";
    case 2: return "Fair";
    case 3: return "Good";
    case 4: return "Very good";
    case 5: return "Excellent";
    default: return "Select a rating";
  }
}

function ReviewStars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <div className="flex items-center" aria-label={`${rating.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} size={size} strokeWidth={2} className={star <= Math.round(rating) ? "fill-[#FFB300] text-[#FFB300]" : "text-[#D8D1CA]"} />
      ))}
    </div>
  );
}

function getInitials(
  name: string
) {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "R";
  }

  if (words.length === 1) {
    return words[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return (
    words[0][0] +
    words[words.length - 1][0]
  ).toUpperCase();
}

function getCategoryColor(
  category?: string | null
) {
  if (!category) {
    return "#E4E9EF";
  }

  return (
    CATEGORY_COLORS[category.trim().toLowerCase()] ??
    "#E4E9EF"
  );
}

function formatPrice(
  product: Product
) {
  if (
    product.priceMin != null &&
    product.priceMax != null
  ) {
    if (
      product.priceMin ===
      product.priceMax
    ) {
      return `₦${product.priceMin.toLocaleString()}`;
    }

    return `₦${product.priceMin.toLocaleString()}-₦${product.priceMax.toLocaleString()}`;
  }

  if (product.price != null) {
    return `₦${product.price.toLocaleString()}`;
  }

  if (product.priceMin != null) {
    return `From ₦${product.priceMin.toLocaleString()}`;
  }

  if (product.priceMax != null) {
    return `Up to ₦${product.priceMax.toLocaleString()}`;
  }

  return "Ask seller";
}

function getProductImages(
  product: Product
): ProductImage[] {
  const images = Array.isArray(product.images)
    ? product.images
        .filter(
          (image) =>
            image &&
            typeof image.url === "string" &&
            image.url.trim()
        )
        .sort(
          (a, b) =>
            (a.sortOrder ?? 0) -
            (b.sortOrder ?? 0)
        )
    : [];

  if (images.length > 0) {
    return images;
  }

  return product.imageUrl
    ? [{ url: product.imageUrl }]
    : [];
}

function getAvailabilityLabel(
  availability?: string
) {
  switch (availability) {
    case "AVAILABLE":
      return "Available";

    case "UNAVAILABLE":
      return "Unavailable";

    default:
      return "Ask seller";
  }
}

function getAvailabilityStyle(
  availability?: string
) {
  switch (availability) {
    case "AVAILABLE":
      return "bg-[#E4F7EC] text-[#237A48]";

    case "UNAVAILABLE":
      return "bg-[#F3ECEA] text-[#8B6960]";

    default:
      return "bg-[#FFF0D9] text-[#9F2D18]";
  }
}

function normalizeNigerianPhone(value: string): string {
  let clean = value.trim();
  if (!clean) return "";

  if (clean.startsWith("00")) {
    clean = `+${clean.slice(2)}`;
  }

  if (clean.startsWith("+")) {
    const internationalDigits = clean.slice(1).replace(/\D/g, "");
    return internationalDigits ? `+${internationalDigits}` : "";
  }

  const digits = clean.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("234")) return `+${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `+234${digits.slice(1)}`;
  if (digits.length === 10) return `+234${digits}`;
  return "";
}

function hasValidCoordinates(
  latitude?: number | null,
  longitude?: number | null
): latitude is number {
  return (
    typeof latitude ===
      "number" &&
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    typeof longitude ===
      "number" &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/*
 * -----------------------------------------
 * GOOGLE MAPS DIRECTIONS
 * -----------------------------------------
 *
 * Destination resolution order:
 *
 * 1. Valid ReMarket business coordinates
 * 2. Existing ReMarket business address
 *
 * The business name is NEVER added to the
 * Google Maps destination.
 *
 * The address is also NOT rebuilt here.
 * It is passed exactly as the canonical
 * ReMarket Location.address value.
 *
 * Expected address format:
 *
 * Shop/House Number, Street, Area, City, Nigeria
 *
 * Origin is supplied when the buyer's current
 * browser location is available. A destination-only
 * fallback remains available when location access
 * is denied or unavailable.
 */
function buildDirectionsUrl(
  address: string | null | undefined,
  latitude?: number | null,
  longitude?: number | null,
  originLatitude?: number | null,
  originLongitude?: number | null
): string {
  let destination = "";

  if (
    hasValidCoordinates(
      latitude,
      longitude
    )
  ) {
    /*
     * Coordinates are the preferred destination
     * because they represent the exact ReMarket
     * business location.
     */
    destination = `${latitude},${longitude}`;
  } else if (
    typeof address ===
      "string" &&
    address.trim()
  ) {
    /*
     * Text fallback.
     *
     * Do NOT add:
     * - business name
     * - area again
     * - country again
     *
     * The Location.address value is already
     * expected to contain the complete address.
     */
    destination =
      address.trim();
  }

  if (!destination) {
    return "#";
  }

  const params =
    new URLSearchParams();

  params.set(
    "api",
    "1"
  );

  params.set(
    "destination",
    destination
  );

  if (
    hasValidCoordinates(
      originLatitude,
      originLongitude
    )
  ) {
    params.set(
      "origin",
      `${originLatitude},${originLongitude}`
    );
  }

  params.set(
    "travelmode",
    "driving"
  );

  params.set(
    "dir_action",
    "navigate"
  );

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function buildContactUrl(
  platform: string,
  handle: string,
  latitude?: number | null,
  longitude?: number | null,
  address?: string | null
): string {
  const clean = handle
    .trim()
    .replace(/^@/, "");

  switch (platform) {
    case "WHATSAPP": {
      if (!clean) {
        return "#";
      }

      if (
        clean.startsWith("http://") ||
        clean.startsWith("https://")
      ) {
        return clean;
      }

      const normalizedPhone =
        normalizeNigerianPhone(clean);

      if (!normalizedPhone) {
        return "#";
      }

      return `https://wa.me/${normalizedPhone.slice(
        1
      )}`;
    }

    case "INSTAGRAM": {
      if (!clean) {
        return "#";
      }

      return clean.startsWith("http://") ||
        clean.startsWith("https://")
        ? clean
        : `https://instagram.com/${clean}`;
    }

    case "TIKTOK": {
      if (!clean) {
        return "#";
      }

      return clean.startsWith("http://") ||
        clean.startsWith("https://")
        ? clean
        : `https://tiktok.com/@${clean}`;
    }

    case "FACEBOOK": {
      if (!clean) {
        return "#";
      }

      return clean.startsWith("http://") ||
        clean.startsWith("https://")
        ? clean
        : `https://facebook.com/${clean}`;
    }

    case "PHONE": {
      if (!clean) {
        return "#";
      }

      const normalizedPhone =
        normalizeNigerianPhone(clean);

      if (!normalizedPhone) {
        return "#";
      }

      return `tel:${normalizedPhone}`;
    }

    case "DIRECTIONS": {
      return buildDirectionsUrl(
        address,
        latitude,
        longitude
      );
    }

    default:
      return "#";
  }
}

function ContactIcon({
  platform,
}: {
  platform: string;
}) {
  switch (platform) {
    case "WHATSAPP":
      return <MessageCircle size={16} />;

    case "INSTAGRAM":
      return <ExternalLink size={16} />;

    case "TIKTOK":
      return <Music2 size={16} />;

    case "FACEBOOK":
      return <ExternalLink size={16} />;

    case "PHONE":
      return <Phone size={16} />;

    case "DIRECTIONS":
      return <MapPin size={16} />;

    default:
      return <ExternalLink size={16} />;
  }
}

function isTrackableContactPlatform(
  platform: string
): platform is
  | "WHATSAPP"
  | "INSTAGRAM"
  | "TIKTOK"
  | "FACEBOOK"
  | "PHONE"
  | "DIRECTIONS" {
  return (
    platform === "WHATSAPP" ||
    platform === "INSTAGRAM" ||
    platform === "TIKTOK" ||
    platform === "FACEBOOK" ||
    platform === "PHONE" ||
    platform === "DIRECTIONS"
  );
}

function subscribeSavedBusinesses(
  onStoreChange: () => void
) {
  window.addEventListener(
    SAVED_BUSINESSES_CHANGED_EVENT,
    onStoreChange
  );

  window.addEventListener(
    "storage",
    onStoreChange
  );

  return () => {
    window.removeEventListener(
      SAVED_BUSINESSES_CHANGED_EVENT,
      onStoreChange
    );

    window.removeEventListener(
      "storage",
      onStoreChange
    );
  };
}

function getSavedBusinessesSnapshot(
  id: string
) {
  return isBusinessSaved(id);
}

function SellerPageContent({
  id,
}: {
  id: string;
}) {
  const [
    seller,
    setSeller,
  ] = useState<Seller | null>(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    directionsLoading,
    setDirectionsLoading,
  ] = useState(false);

  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [reviewError, setReviewError] = useState("");
  const [reviewSuccess, setReviewSuccess] = useState("");
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<ReMarketRole | null>(null);
  const [currentUserLoading, setCurrentUserLoading] = useState(true);
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [editingRating, setEditingRating] = useState(0);
  const [editingComment, setEditingComment] = useState("");
  const [reviewUpdatingId, setReviewUpdatingId] = useState<string | null>(null);
  const [reviewDeletingId, setReviewDeletingId] = useState<string | null>(null);
  const [ratingBreakdown, setRatingBreakdown] = useState<RatingBreakdown>({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  const reviewRequestIdRef = useRef(0);

  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [claimReason, setClaimReason] = useState("");
  const [claimSubmitting, setClaimSubmitting] = useState(false);
  const [claimPending, setClaimPending] = useState(false);
  const [claimChecking, setClaimChecking] = useState(false);
  const [claimError, setClaimError] = useState("");
  const [claimSuccess, setClaimSuccess] = useState("");

  const getSavedSnapshot =
    useCallback(
      () =>
        getSavedBusinessesSnapshot(
          id
        ),
      [id]
    );

  const saved =
    useSyncExternalStore(
      subscribeSavedBusinesses,
      getSavedSnapshot,
      () => false
    );

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUser() {
      try {
        const session = await getSession();
        if (cancelled) return;
        const user = session?.user;
        setCurrentUserId(typeof user?.id === "string" ? user.id : null);
        setCurrentUserRole(
          user?.role === "ADMIN" || user?.role === "SELLER" || user?.role === "BUYER"
            ? user.role
            : null
        );
      } catch (sessionError) {
        console.error("Seller page session lookup error:", sessionError);
        if (!cancelled) {
          setCurrentUserId(null);
          setCurrentUserRole(null);
        }
      } finally {
        if (!cancelled) setCurrentUserLoading(false);
      }
    }

    void loadCurrentUser();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const controller =
      new AbortController();

    async function loadSeller() {
      try {
        setLoading(true);
        setError("");

        const response =
          await fetch(
            `/api/businesses/${encodeURIComponent(
              id
            )}`,
            {
              cache: "no-store",
              signal:
                controller.signal,
            }
          );

        let data:
          | {
              business?: unknown;
              error?: unknown;
            }
          | unknown = null;

        try {
          data =
            await response.json();
        } catch {
          throw new Error(
            "Unable to read seller information."
          );
        }

        if (!response.ok) {
          const responseError =
            typeof data ===
              "object" &&
            data !== null &&
            "error" in data &&
            typeof data.error ===
              "string"
              ? data.error
              : "Unable to load seller.";

          throw new Error(
            responseError
          );
        }

        const business =
          typeof data ===
              "object" &&
          data !== null &&
          "business" in data
            ? data.business
            : data;

        if (
          typeof business !==
            "object" ||
          business === null ||
          !("id" in business) ||
          typeof business.id !==
            "string"
        ) {
          throw new Error(
            "Seller information was not found."
          );
        }

        const rawBusiness =
          business as Record<
            string,
            unknown
          >;

        const rawLocation =
          rawBusiness.location;

        const rawCategories =
          rawBusiness.categories;

        const rawProducts =
          rawBusiness.products;

        const rawSocialLinks =
          rawBusiness.socialLinks;

        const categories =
          Array.isArray(
            rawCategories
          )
            ? rawCategories
                .map((item) => {
                  if (
                    typeof item ===
                      "string"
                  ) {
                    return item;
                  }

                  if (
                    typeof item ===
                      "object" &&
                    item !== null
                  ) {
                    if (
                      "category" in
                        item &&
                      typeof item.category ===
                        "object" &&
                      item.category !==
                        null &&
                      "name" in
                        item.category &&
                      typeof item
                        .category
                        .name ===
                        "string"
                    ) {
                      return item.category
                        .name;
                    }

                    if (
                      "name" in item &&
                      typeof item.name ===
                        "string"
                    ) {
                      return item.name;
                    }
                  }

                  return null;
                })
                .filter(
                  (
                    item
                  ): item is string =>
                    typeof item ===
                    "string"
                )
            : [];

        const products: Product[] =
          Array.isArray(
            rawProducts
          )
            ? rawProducts
                .filter(
                  (
                    product
                  ): product is Record<
                    string,
                    unknown
                  > =>
                    typeof product ===
                      "object" &&
                    product !== null &&
                    "id" in product &&
                    typeof product.id ===
                      "string" &&
                    "name" in product &&
                    typeof product.name ===
                      "string"
                )
                .map(
                  (
                    product
                  ): Product => ({
                    id:
                      product.id as string,

                    name:
                      product.name as string,

                    description:
                      typeof product.description ===
                        "string"
                        ? product.description
                        : null,

                    price:
                      typeof product.price ===
                        "number"
                        ? product.price
                        : null,

                    priceMin:
                      typeof product.priceMin ===
                        "number"
                        ? product.priceMin
                        : null,

                    priceMax:
                      typeof product.priceMax ===
                        "number"
                        ? product.priceMax
                        : null,

                    availability:
                      product.availability ===
                        "AVAILABLE"
                        ? "AVAILABLE"
                        : product.availability ===
                            "UNAVAILABLE"
                          ? "UNAVAILABLE"
                          : "ASK_SELLER",

                    imageUrl:
                      typeof product.imageUrl ===
                        "string"
                        ? product.imageUrl
                        : null,

                    images:
                      Array.isArray(
                        product.images
                      )
                        ? product.images
                            .filter(
                              (image): image is Record<string, unknown> =>
                                typeof image ===
                                  "object" &&
                                image !== null &&
                                typeof (image as Record<string, unknown>).url ===
                                  "string"
                            )
                            .map((image) => ({
                              id:
                                typeof image.id ===
                                  "string"
                                  ? image.id
                                  : undefined,
                              url:
                                image.url as string,
                              publicId:
                                typeof image.publicId ===
                                  "string"
                                  ? image.publicId
                                  : null,
                              sortOrder:
                                typeof image.sortOrder ===
                                  "number"
                                  ? image.sortOrder
                                  : 0,
                            }))
                            .sort(
                              (a, b) =>
                                (a.sortOrder ?? 0) -
                                (b.sortOrder ?? 0)
                            )
                        : [],

                    keywords:
                      Array.isArray(product.keywords)
                        ? product.keywords.filter(
                            (keyword): keyword is string =>
                              typeof keyword === "string" && keyword.trim().length > 0
                          )
                        : [],

                    category:
                      typeof product.category ===
                        "object" &&
                      product.category !== null &&
                      "name" in product.category &&
                      typeof product.category.name ===
                        "string"
                        ? {
                            id:
                              "id" in product.category &&
                              typeof product.category.id ===
                                "string"
                                ? product.category.id
                                : undefined,
                            name:
                              product.category.name,
                          }
                        : null,
                  })
                )
            : [];

        const location =
          typeof rawLocation ===
              "object" &&
          rawLocation !== null
            ? {
                id:
                  "id" in rawLocation &&
                  typeof rawLocation.id ===
                    "string"
                    ? rawLocation.id
                    : undefined,

                area:
                  "area" in rawLocation &&
                  typeof rawLocation.area ===
                    "string"
                    ? rawLocation.area
                    : "",

                street:
                  "street" in rawLocation &&
                  typeof rawLocation.street === "string"
                    ? rawLocation.street
                    : null,

                address:
                  "address" in
                    rawLocation &&
                  typeof rawLocation.address ===
                    "string"
                    ? rawLocation.address
                    : null,

                lat:
                  "lat" in rawLocation &&
                  typeof rawLocation.lat ===
                    "number"
                    ? rawLocation.lat
                    : null,

                long:
                  "long" in rawLocation &&
                  typeof rawLocation.long ===
                    "number"
                    ? rawLocation.long
                    : null,
              }
            : null;

        const availability =
          rawBusiness.availability ===
              "AVAILABLE" ||
          rawBusiness.availability ===
              "UNAVAILABLE"
            ? rawBusiness.availability
            : "ASK_SELLER";

        const verification =
          rawBusiness.verification ===
            "VERIFIED"
            ? "VERIFIED"
            : "UNVERIFIED";

        const verified =
          rawBusiness.verified ===
            true ||
          verification ===
            "VERIFIED";

        const category =
          typeof rawBusiness.category ===
            "string"
            ? rawBusiness.category
            : categories[0] ??
              null;

        const rawProductCount =
          rawBusiness.productCount;

        const productCount =
          typeof rawProductCount ===
          "number"
            ? rawProductCount
            : products.length;

        setSeller({
          id:
            rawBusiness.id as string,

          name:
            typeof rawBusiness.name ===
            "string"
              ? rawBusiness.name
              : "ReMarket Seller",

          ownerName:
            typeof rawBusiness.ownerName ===
            "string"
              ? rawBusiness.ownerName
              : null,

          description:
            typeof rawBusiness.description ===
            "string"
              ? rawBusiness.description
              : null,

          location,

          availability,

          verification,

          verified,

          category,

          categories,

          productCount,

          products,

          socialLinks:
            Array.isArray(
              rawSocialLinks
            )
              ? rawSocialLinks
                  .filter(
                    (
                      link
                    ): link is Record<
                      string,
                      unknown
                    > =>
                      typeof link ===
                        "object" &&
                      link !== null &&
                      "id" in link &&
                      typeof link.id ===
                        "string" &&
                      "platform" in link &&
                      typeof link.platform ===
                        "string" &&
                      "handle" in link &&
                      typeof link.handle ===
                        "string"
                  )
                  .map(
                    (link) => ({
                      id:
                        link.id as string,

                      platform:
                        link.platform as string,

                      handle:
                        link.handle as string,
                    })
                  )
              : [],

          imageUrl:
            typeof rawBusiness.imageUrl ===
            "string"
              ? rawBusiness.imageUrl
              : null,

          claimable: rawBusiness.claimable === true,
          averageRating:
            typeof rawBusiness.averageRating === "number" && Number.isFinite(rawBusiness.averageRating)
              ? Math.min(5, Math.max(0, rawBusiness.averageRating))
              : 0,
          reviewCount:
            typeof rawBusiness.reviewCount === "number" && Number.isInteger(rawBusiness.reviewCount) && rawBusiness.reviewCount >= 0
              ? rawBusiness.reviewCount
              : 0,
        });
      } catch (
        fetchError
      ) {
        if (
          fetchError instanceof
            DOMException &&
          fetchError.name ===
            "AbortError"
        ) {
          return;
        }

        console.error(
          "Seller page error:",
          fetchError
        );

        setError(
          fetchError instanceof
            Error
            ? fetchError.message
            : "Unable to load seller."
        );
      } finally {
        if (
          !controller.signal.aborted
        ) {
          setLoading(false);
        }
      }
    }

    void loadSeller();

    return () => {
      controller.abort();
    };
  }, [id]);

  useEffect(() => {
    if (currentUserRole !== "SELLER" || !id) {
      setClaimPending(false);
      setClaimChecking(false);
      return;
    }

    let cancelled = false;

    async function checkClaimStatus() {
      try {
        setClaimChecking(true);
        const response = await fetch("/api/seller/business-claim-requests", { cache: "no-store" });
        if (response.status === 401 || response.status === 403) {
          if (!cancelled) setClaimPending(false);
          return;
        }
        if (!response.ok) return;

        const payload: unknown = await response.json();
        if (!isRecord(payload)) return;
        const requests = payload.requests ?? payload.claims ?? payload.claimRequests ?? [];
        if (!Array.isArray(requests)) return;

        const pending = requests.some((item) =>
          isRecord(item) && item.businessId === id && item.status === "PENDING"
        );
        if (!cancelled) setClaimPending(pending);
      } catch (claimStatusError) {
        console.error("Claim status lookup error:", claimStatusError);
      } finally {
        if (!cancelled) setClaimChecking(false);
      }
    }

    void checkClaimStatus();
    return () => { cancelled = true; };
  }, [currentUserRole, id]);

  const loadReviews = useCallback(async () => {
    if (!id) return;
    const requestId = ++reviewRequestIdRef.current;

    try {
      setReviewsLoading(true);
      setReviewError("");
      const response = await fetch(`/api/businesses/${encodeURIComponent(id)}/reviews`, { cache: "no-store" });
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error("Unable to read reviews.");
      }

      if (!response.ok) {
        throw new Error(isRecord(payload) && typeof payload.error === "string" ? payload.error : "Unable to load reviews.");
      }
      if (requestId !== reviewRequestIdRef.current) return;

      const data = isRecord(payload) ? payload : {};
      const rawReviews = Array.isArray(data.reviews) ? data.reviews : [];
      const normalizedReviews: Review[] = rawReviews
        .filter((review): review is Record<string, unknown> =>
          isRecord(review) && typeof review.id === "string" && typeof review.rating === "number" && isRecord(review.user)
        )
        .map((review) => {
          const user = review.user as Record<string, unknown>;
          return {
            id: review.id as string,
            rating: Number.isInteger(review.rating) ? Math.min(5, Math.max(1, review.rating as number)) : 0,
            comment: typeof review.comment === "string" ? review.comment : null,
            createdAt: typeof review.createdAt === "string" ? review.createdAt : "",
            updatedAt: typeof review.updatedAt === "string" ? review.updatedAt : "",
            user: {
              id: typeof user.id === "string" ? user.id : "",
              name: typeof user.name === "string" && user.name.trim() ? user.name : "ReMarket user",
            },
          };
        })
        .filter((review) => review.rating >= 1);

      const averageRating = typeof data.averageRating === "number" && Number.isFinite(data.averageRating)
        ? Math.min(5, Math.max(0, data.averageRating))
        : 0;
      const reviewCount = typeof data.reviewCount === "number" && Number.isInteger(data.reviewCount) && data.reviewCount >= 0
        ? data.reviewCount
        : normalizedReviews.length;

      const breakdown: RatingBreakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      if (isRecord(data.ratingBreakdown)) {
        for (let rating = 1; rating <= 5; rating += 1) {
          const value = data.ratingBreakdown[String(rating)];
          if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
            breakdown[rating as 1 | 2 | 3 | 4 | 5] = value;
          }
        }
      } else {
        for (const review of normalizedReviews) {
          breakdown[review.rating as 1 | 2 | 3 | 4 | 5] += 1;
        }
      }

      if (requestId !== reviewRequestIdRef.current) return;
      setReviews(normalizedReviews);
      setRatingBreakdown(breakdown);
      setSeller((current) => current ? { ...current, averageRating, reviewCount } : current);
    } catch (reviewsFetchError) {
      if (requestId !== reviewRequestIdRef.current) return;
      console.error("Reviews load error:", reviewsFetchError);
      setReviewError(reviewsFetchError instanceof Error ? reviewsFetchError.message : "Unable to load reviews.");
    } finally {
      if (requestId === reviewRequestIdRef.current) setReviewsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadReviews();
    return () => { reviewRequestIdRef.current += 1; };
  }, [loadReviews]);

  function getClaimCallbackUrl(): string {
    if (typeof window === "undefined") return `/seller/${id}`;
    return `${window.location.pathname}${window.location.search}`;
  }

  function handleClaimAction() {
    if (!seller || !seller.claimable || claimSubmitting) return;
    setClaimError("");
    setClaimSuccess("");
    if (currentUserRole === "SELLER") {
      setClaimReason("");
      setClaimModalOpen(true);
      return;
    }
    window.location.assign(`/seller/login?callbackUrl=${encodeURIComponent(getClaimCallbackUrl())}`);
  }

  async function submitBusinessClaim() {
    if (!seller || claimSubmitting) return;
    setClaimError("");
    setClaimSuccess("");
    if (currentUserRole !== "SELLER") {
      setClaimError("You must be signed in as a seller to claim a business.");
      return;
    }
    if (!seller.claimable) {
      setClaimError("This business has already been claimed.");
      return;
    }
    if (claimPending) {
      setClaimError("You already have a pending claim request for this business.");
      return;
    }
    const reason = claimReason.trim();
    if (reason.length > 1000) {
      setClaimError("Your claim reason is too long. Please keep it under 1000 characters.");
      return;
    }

    setClaimSubmitting(true);
    try {
      const response = await fetch("/api/seller/business-claim-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: seller.id, reason: reason || null }),
      });
      let payload: unknown = null;
      try { payload = await response.json(); } catch { payload = null; }
      if (response.status === 401 || response.status === 403) {
        window.location.assign(`/seller/login?callbackUrl=${encodeURIComponent(getClaimCallbackUrl())}`);
        return;
      }
      if (!response.ok) {
        setClaimError(isRecord(payload) && typeof payload.error === "string" ? payload.error : "Unable to submit your claim request.");
        return;
      }
      setClaimPending(true);
      setClaimReason("");
      setClaimModalOpen(false);
      setClaimSuccess(`Your claim request for "${seller.name}" has been submitted for admin review.`);
    } catch (claimSubmitError) {
      console.error("Business claim submission error:", claimSubmitError);
      setClaimError("Something went wrong while submitting your claim. Please try again.");
    } finally {
      setClaimSubmitting(false);
    }
  }

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reviewSubmitting || !seller) return;
    if (currentUserRole !== "BUYER") {
      setReviewError(currentUserRole ? "Only buyer accounts can leave business reviews." : "You must be signed in as a buyer to leave a review.");
      return;
    }
    setReviewError("");
    setReviewSuccess("");
    if (reviewRating < 1 || reviewRating > 5) {
      setReviewError("Please select a rating from 1 to 5 stars.");
      return;
    }
    if (reviewComment.trim().length > 2000) {
      setReviewError("Your review is too long. Please keep it under 2000 characters.");
      return;
    }
    setReviewSubmitting(true);
    try {
      const response = await fetch(`/api/businesses/${encodeURIComponent(id)}/reviews`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: reviewRating, comment: reviewComment }),
      });
      let payload: unknown = null;
      try { payload = await response.json(); } catch { payload = null; }
      if (response.status === 401) { setReviewError("You must be signed in as a buyer to leave a review."); return; }
      if (response.status === 403) { setReviewError("Only buyer accounts can leave business reviews."); return; }
      if (response.status === 409) { setReviewError(isRecord(payload) && typeof payload.error === "string" ? payload.error : "You have already reviewed this business."); return; }
      if (!response.ok) { setReviewError(isRecord(payload) && typeof payload.error === "string" ? payload.error : "Unable to submit your review."); return; }
      setReviewRating(0);
      setReviewComment("");
      setReviewSuccess("Your review was submitted successfully.");
      await loadReviews();
    } catch (submitError) {
      console.error("Review submission error:", submitError);
      setReviewError("Something went wrong. Please try again.");
    } finally {
      setReviewSubmitting(false);
    }
  }

  function startEditingReview(review: Review) {
    setReviewError(""); setReviewSuccess("");
    setEditingReviewId(review.id); setEditingRating(review.rating); setEditingComment(review.comment ?? "");
  }

  function cancelEditingReview() {
    if (reviewUpdatingId) return;
    setEditingReviewId(null); setEditingRating(0); setEditingComment(""); setReviewError("");
  }

  async function updateReview(reviewId: string) {
    if (reviewUpdatingId || editingReviewId !== reviewId) return;
    setReviewError(""); setReviewSuccess("");
    if (currentUserRole !== "BUYER") {
      setReviewError(currentUserRole ? "Only buyer accounts can manage reviews." : "You must be signed in as a buyer to manage reviews.");
      return;
    }
    if (editingRating < 1 || editingRating > 5) { setReviewError("Please select a rating from 1 to 5 stars."); return; }
    if (editingComment.trim().length > 2000) { setReviewError("Your review is too long. Please keep it under 2000 characters."); return; }
    setReviewUpdatingId(reviewId);
    try {
      const response = await fetch(`/api/businesses/${encodeURIComponent(id)}/reviews/${encodeURIComponent(reviewId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: editingRating, comment: editingComment }),
      });
      let payload: unknown = null; try { payload = await response.json(); } catch { payload = null; }
      if (response.status === 401) { setReviewError("Your session has expired. Please sign in again."); return; }
      if (response.status === 403) { setReviewError("Only buyer accounts can manage reviews."); return; }
      if (response.status === 404) { setReviewError(isRecord(payload) && typeof payload.error === "string" ? payload.error : "This review could not be found."); return; }
      if (!response.ok) { setReviewError(isRecord(payload) && typeof payload.error === "string" ? payload.error : "Unable to update your review."); return; }
      setEditingReviewId(null); setEditingRating(0); setEditingComment("");
      setReviewSuccess("Your review was updated successfully.");
      await loadReviews();
    } catch (updateError) {
      console.error("Review update error:", updateError); setReviewError("Something went wrong. Please try again.");
    } finally { setReviewUpdatingId(null); }
  }

  async function deleteReview(reviewId: string) {
    if (reviewDeletingId) return;
    if (currentUserRole !== "BUYER") {
      setReviewError(currentUserRole ? "Only buyer accounts can manage reviews." : "You must be signed in as a buyer to manage reviews.");
      return;
    }
    if (!window.confirm("Delete your review from this business?")) return;
    setReviewError(""); setReviewSuccess(""); setReviewDeletingId(reviewId);
    try {
      const response = await fetch(`/api/businesses/${encodeURIComponent(id)}/reviews/${encodeURIComponent(reviewId)}`, { method: "DELETE" });
      let payload: unknown = null; try { payload = await response.json(); } catch { payload = null; }
      if (response.status === 401) { setReviewError("Your session has expired. Please sign in again."); return; }
      if (response.status === 403) { setReviewError("Only buyer accounts can manage reviews."); return; }
      if (response.status === 404) { setReviewError(isRecord(payload) && typeof payload.error === "string" ? payload.error : "This review could not be found."); return; }
      if (!response.ok) { setReviewError(isRecord(payload) && typeof payload.error === "string" ? payload.error : "Unable to delete your review."); return; }
      if (editingReviewId === reviewId) { setEditingReviewId(null); setEditingRating(0); setEditingComment(""); }
      setReviewSuccess("Your review was deleted successfully.");
      await loadReviews();
    } catch (deleteError) {
      console.error("Review deletion error:", deleteError); setReviewError("Something went wrong. Please try again.");
    } finally { setReviewDeletingId(null); }
  }

  function toggleSavedBusiness() {
    if (!seller) {
      return;
    }

    if (
      isBusinessSaved(
        seller.id
      )
    ) {
      removeSavedBusiness(
        seller.id
      );

      return;
    }

    const categoryName =
      seller.category ||
      seller.categories?.[0] ||
      "Services";

    saveBusiness({
      id: seller.id,

      name: seller.name,

      area:
        seller.location?.area ??
        "Local",

      category:
        categoryName,

      verified:
        seller.verified ||
        seller.verification ===
          "VERIFIED",

      availability:
        seller.availability,

      imageUrl:
        seller.imageUrl ?? null,
    });
  }

  function handleContactClick(
    platform: string
  ) {
    if (!seller?.id) {
      return;
    }

    if (
      !isTrackableContactPlatform(
        platform
      )
    ) {
      return;
    }

    void trackContactEvent({
      businessId:
        seller.id,
      platform,
    });
  }

  function handleSaveClick(
    event: MouseEvent<HTMLButtonElement>
  ) {
    event.preventDefault();
    event.stopPropagation();

    toggleSavedBusiness();
  }

  function getDirectionsUrl() {
    if (!seller) {
      return "#";
    }

    return buildDirectionsUrl(
      seller.location?.address,
      seller.location?.lat,
      seller.location?.long
    );
  }

  function handleDirectionsClick(
    event: MouseEvent<HTMLButtonElement>
  ) {
    event.preventDefault();

    if (!seller) {
      return;
    }

    const fallbackUrl =
      getDirectionsUrl();

    if (fallbackUrl === "#") {
      return;
    }

    handleContactClick("DIRECTIONS");
    setDirectionsLoading(true);

    const navigationWindow =
      window.open(
        fallbackUrl,
        "_blank"
      );

    if (navigationWindow) {
      navigationWindow.opener = null;
    }

    if (!navigator.geolocation) {
      setDirectionsLoading(false);

      if (!navigationWindow || navigationWindow.closed) {
        window.location.assign(fallbackUrl);
      }

      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const exactUrl =
          buildDirectionsUrl(
            seller.location?.address,
            seller.location?.lat,
            seller.location?.long,
            position.coords.latitude,
            position.coords.longitude
          );

        if (
          navigationWindow &&
          !navigationWindow.closed
        ) {
          navigationWindow.location.href = exactUrl;
        } else {
          // Keep directions usable if the popup was blocked or closed.
          window.location.assign(exactUrl);
        }

        setDirectionsLoading(false);
      },
      () => {
        /*
         * Location access can be denied or
         * unavailable. The already-opened map keeps
         * the existing destination-only fallback.
         */
        setDirectionsLoading(false);

        if (!navigationWindow || navigationWindow.closed) {
          window.location.assign(fallbackUrl);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }

  if (!id) {
    return (
      <main className="min-h-screen bg-[#FFF7ED] p-0 md:p-3">
        <div className="mx-auto flex min-h-screen max-w-[1500px] items-center justify-center overflow-hidden bg-[#FFFDFC] md:min-h-[calc(100vh-24px)] md:rounded-[22px] md:border md:border-[#FF5A36]">
          <div className="max-w-[700px] rounded-[18px] border border-[#F0C9BF] bg-[#FFF1ED] p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#FFE0D6] text-[#9F2D18]">
              <Store size={22} />
            </div>

            <h1 className="text-xl font-black text-[#17202A]">
              Seller not found
            </h1>

            <p className="mt-2 text-[13px] leading-6 text-[#77716C]">
              We couldn&apos;t find the seller you&apos;re looking for.
            </p>

            <Link
              href="/shop"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-[12px] font-bold text-white transition hover:bg-[#E94E2C]"
            >
              <ShoppingBag size={15} />
              Browse sellers
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FFF7ED] p-0 md:p-3">
      <div
        className="
          mx-auto
          min-h-screen
          max-w-[1500px]
          overflow-hidden
          border-[#FF5A36]
          bg-[#FFFDFC]
          shadow-[0_8px_30px_rgba(159,45,24,0.06)]
          md:min-h-[calc(100vh-24px)]
          md:rounded-[22px]
          md:border
        "
      >
        <header
          className="
            flex
            h-[66px]
            items-center
            justify-between
            border-b
            border-[#EAE6DF]
            bg-white
            px-4
            md:px-6
          "
        >
          <Link
            href="/"
            className="flex items-center gap-2"
          >
            <div
              className="
                flex
                h-9
                w-9
                items-center
                justify-center
                rounded-xl
                bg-[#FF5A36]
                text-white
              "
            >
              <Search
                size={19}
                strokeWidth={2.5}
              />
            </div>

            <div className="hidden sm:block">
              <div className="text-[17px] font-black tracking-tight text-[#17202A]">
                ReMarket
              </div>

              <div className="text-[10px] font-medium text-[#8C8580]">
                Find it nearby
              </div>
            </div>
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            {NAV_ITEMS.map(
              (item) => {
                const Icon =
                  item.icon;

                return (
                  <Link
                    key={
                      item.href
                    }
                    href={
                      item.href
                    }
                    className="
                      flex
                      items-center
                      gap-2
                      text-[13px]
                      font-semibold
                      text-[#68615C]
                      transition
                      hover:text-[#FF5A36]
                    "
                  >
                    <Icon
                      size={17}
                    />

                    {item.label}
                  </Link>
                );
              }
            )}
          </nav>

          <Link
            href="/request"
            className="
              rounded-xl
              bg-[#FF5A36]
              px-3
              py-2
              text-[12px]
              font-bold
              text-white
              shadow-sm
              transition
              hover:bg-[#E94E2C]
              sm:px-4
            "
          >
            Request something
          </Link>
        </header>

        <div className="flex">
          <aside
            className="
              hidden
              w-[190px]
              shrink-0
              border-r
              border-[#EAE6DF]
              bg-[#FCFAF6]
              px-3
              py-5
              md:block
            "
          >
            <div className="mb-5 px-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#A29B94]">
                Browse
              </p>
            </div>

            <nav className="space-y-1">
              {NAV_ITEMS.map(
                (item) => {
                  const Icon =
                    item.icon;

                  return (
                    <Link
                      key={
                        item.href
                      }
                      href={
                        item.href
                      }
                      className="
                        flex
                        items-center
                        gap-3
                        rounded-xl
                        px-3
                        py-2.5
                        text-[13px]
                        font-semibold
                        text-[#68615C]
                        transition
                        hover:bg-[#FFF0E9]
                        hover:text-[#FF5A36]
                      "
                    >
                      <Icon
                        size={17}
                      />

                      {item.label}
                    </Link>
                  );
                }
              )}
            </nav>

            <div className="my-5 border-t border-[#E8E4DE]" />

            <Link
              href="/shop"
              className="
                flex
                items-center
                gap-3
                rounded-xl
                bg-[#FFF0E9]
                px-3
                py-2.5
                text-[13px]
                font-bold
                text-[#FF5A36]
              "
            >
              <ShoppingBag
                size={17}
              />

              Browse sellers
            </Link>
          </aside>

          <section
            className="
              min-w-0
              flex-1
              px-4
              py-5
              pb-24
              sm:px-6
              md:px-8
              md:py-7
              md:pb-8
            "
          >
            <Link
              href="/shop"
              className="
                mb-5
                inline-flex
                items-center
                gap-2
                text-[12px]
                font-semibold
                text-[#746D67]
                transition
                hover:text-[#FF5A36]
              "
            >
              <ArrowLeft
                size={15}
              />

              Back to Shop
            </Link>

            {loading && (
              <div className="space-y-5">
                <div className="h-[210px] animate-pulse rounded-[18px] bg-[#F3EEE8]" />

                <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
                  <div className="h-[300px] animate-pulse rounded-[18px] bg-[#F3EEE8]" />

                  <div className="h-[220px] animate-pulse rounded-[18px] bg-[#F3EEE8]" />
                </div>
              </div>
            )}

            {!loading &&
              error && (
                <div
                  className="
                    mx-auto
                    max-w-[700px]
                    rounded-[18px]
                    border
                    border-[#F0C9BF]
                    bg-[#FFF1ED]
                    p-8
                    text-center
                  "
                >
                  <div
                    className="
                      mx-auto
                      mb-4
                      flex
                      h-12
                      w-12
                      items-center
                      justify-center
                      rounded-full
                      bg-[#FFE0D6]
                      text-[#9F2D18]
                    "
                  >
                    <Store size={22} />
                  </div>

                  <h1 className="text-xl font-black text-[#17202A]">
                    Seller not found
                  </h1>

                  <p className="mt-2 text-[13px] leading-6 text-[#77716C]">
                    We couldn&apos;t find the seller you&apos;re looking for.
                  </p>

                  <Link
                    href="/shop"
                    className="
                      mt-5
                      inline-flex
                      items-center
                      gap-2
                      rounded-xl
                      bg-[#FF5A36]
                      px-4
                      py-2.5
                      text-[12px]
                      font-bold
                      text-white
                      transition
                      hover:bg-[#E94E2C]
                    "
                  >
                    <ShoppingBag
                      size={15}
                    />

                    Browse sellers
                  </Link>
                </div>
              )}

            {!loading &&
              !error &&
              seller && (
                <>
                  <div
                    className="
                      overflow-hidden
                      rounded-[18px]
                      border
                      border-[#E8E4DE]
                      bg-white
                      shadow-[0_4px_18px_rgba(30,20,10,0.035)]
                    "
                  >
                    <div
                      className="h-3"
                      style={{
                        backgroundColor:
                          getCategoryColor(
                            seller.category
                          ),
                      }}
                    />

                    <div className="p-5 sm:p-7">
                      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 gap-4">
                          <div
                            className="
                              flex
                              h-16
                              w-16
                              shrink-0
                              items-center
                              justify-center
                              overflow-hidden
                              rounded-2xl
                              bg-[#FFE0D6]
                              text-[18px]
                              font-black
                              text-[#9F2D18]
                              sm:h-20
                              sm:w-20
                              sm:text-xl
                            "
                          >
                            {seller.imageUrl ? (
                              <img
                                src={seller.imageUrl}
                                alt={seller.name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              getInitials(seller.name)
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h1 className="text-[23px] font-black tracking-tight text-[#17202A] sm:text-[28px]">
                                {
                                  seller.name
                                }
                              </h1>

                              {(
                                seller.verified ||
                                seller.verification ===
                                  "VERIFIED"
                              ) && (
                                <CheckCircle2
                                  size={18}
                                  className="text-[#FF5A36]"
                                />
                              )}
                            </div>

                            {seller.ownerName && (
                              <p className="mt-1 text-[12px] text-[#89817A]">
                                {
                                  seller.ownerName
                                }
                              </p>
                            )}

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              {seller.category && (
                                <span
                                  className="
                                    rounded-full
                                    px-2.5
                                    py-1
                                    text-[10px]
                                    font-bold
                                    text-[#514B46]
                                  "
                                  style={{
                                    backgroundColor:
                                      getCategoryColor(
                                        seller.category
                                      ),
                                  }}
                                >
                                  {
                                    seller.category
                                  }
                                </span>
                              )}

                              <span
                                className={`
                                  rounded-full
                                  px-2.5
                                  py-1
                                  text-[10px]
                                  font-bold
                                  ${getAvailabilityStyle(
                                    seller.availability
                                  )}
                                `}
                              >
                                {getAvailabilityLabel(
                                  seller.availability
                                )}
                              </span>

                              {seller.verification ===
                                "VERIFIED" && (
                                <span className="rounded-full bg-[#E4F7EC] px-2.5 py-1 text-[10px] font-bold text-[#237A48]">
                                  Verified
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          aria-label={
                            saved
                              ? `Remove ${seller.name} from saved businesses`
                              : `Save ${seller.name} from saved businesses`
                          }
                          aria-pressed={
                            saved
                          }
                          onClick={
                            handleSaveClick
                          }
                          className={`
                            flex
                            h-10
                            w-10
                            shrink-0
                            items-center
                            justify-center
                            rounded-xl
                            border
                            transition
                            ${
                              saved
                                ? "border-[#FFB39F] bg-[#FFF0E9] text-[#9F2D18]"
                                : "border-[#E5E0D9] bg-white text-[#746D67] hover:border-[#FFB39F] hover:text-[#FF5A36]"
                            }
                          `}
                        >
                          <Heart
                            size={18}
                            fill={
                              saved
                                ? "currentColor"
                                : "none"
                            }
                          />
                        </button>
                      </div>

                      {seller.location?.area && (
                        <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#FCFAF6] px-3 py-2 text-[11px] font-semibold text-[#68615C]">
                          <MapPin
                            size={15}
                            className="text-[#FF5A36]"
                          />

                          <span>
                            {
                              seller.location
                                .area
                            }
                          </span>
                        </div>
                      )}

                      {seller.location
                        ?.address && (
                        <div className="mt-2 flex items-start gap-2 rounded-xl bg-[#FCFAF6] px-3 py-2 text-[11px] leading-5 text-[#68615C]">
                          <MapPin
                            size={14}
                            className="mt-0.5 shrink-0 text-[#FF5A36]"
                          />

                          <span>
                            {
                              seller.location
                                .address
                            }
                          </span>
                        </div>
                      )}

                      {getDirectionsUrl() !==
                        "#" && (
                        <button
                          type="button"
                          onClick={
                            handleDirectionsClick
                          }
                          disabled={
                            directionsLoading
                          }
                          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#FFF0E9] px-3 py-2 text-[11px] font-bold text-[#9F2D18] transition hover:bg-[#FFE4DA] disabled:cursor-wait disabled:opacity-70"
                        >
                          <MapPin className="h-4 w-4" />

                          <span>
                            {directionsLoading
                              ? "Opening..."
                              : "Directions"}
                          </span>
                        </button>
                      )}

                      {seller.description && (
                        <p className="mt-4 max-w-[800px] text-[13px] leading-6 text-[#68615C]">
                          {
                            seller.description
                          }
                        </p>
                      )}

                      {seller.claimable && currentUserRole !== "ADMIN" && (
                        <div className="mt-4">
                          {currentUserLoading ? (
                            <div className="inline-flex items-center gap-2 rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] px-4 py-2.5 text-[11px] font-bold text-[#746D67]"><LoaderCircle className="h-4 w-4 animate-spin" />Checking account...</div>
                          ) : currentUserRole === "SELLER" && claimChecking ? (
                            <div className="inline-flex items-center gap-2 rounded-xl border border-[#F0D7B3] bg-[#FFF8EC] px-4 py-2.5 text-[11px] font-bold text-[#9F5A18]"><LoaderCircle className="h-4 w-4 animate-spin" />Checking claim status...</div>
                          ) : currentUserRole === "SELLER" && claimPending ? (
                            <div role="status" className="inline-flex items-center gap-2 rounded-xl border border-[#F0D7B3] bg-[#FFF8EC] px-4 py-2.5 text-[11px] font-bold text-[#9F5A18]"><Clock3 className="h-4 w-4" />Claim request pending</div>
                          ) : (
                            <button type="button" onClick={handleClaimAction} disabled={claimSubmitting} className="inline-flex items-center gap-2 rounded-xl border border-[#FFB39F] bg-white px-4 py-2.5 text-[11px] font-bold text-[#9F2D18] hover:bg-[#FFF0E9] disabled:opacity-60"><ShieldCheck className="h-4 w-4" />Claim this business</button>
                          )}
                        </div>
                      )}
                      {claimSuccess && <div role="status" aria-live="polite" className="mt-3 rounded-xl border border-[#BDE8D8] bg-[#EFFBF6] px-3 py-2.5 text-[11px] font-semibold leading-5 text-[#137A59]">{claimSuccess}</div>}
                      {claimError && !claimModalOpen && <div role="alert" className="mt-3 rounded-xl border border-[#F0C9BF] bg-[#FFF1ED] px-3 py-2.5 text-[11px] font-semibold leading-5 text-[#9F2D18]">{claimError}</div>}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                    <div
                      className="
                        rounded-[18px]
                        border
                        border-[#E8E4DE]
                        bg-white
                        p-5
                        shadow-[0_4px_18px_rgba(30,20,10,0.035)]
                      "
                    >
                      <div className="mb-5 flex items-center justify-between">
                        <div>
                          <h2 className="text-[17px] font-black text-[#17202A]">
                            Products
                          </h2>

                          <p className="mt-1 text-[11px] text-[#8B847E]">
                            {
                              seller.productCount
                            }{" "}
                            items listed
                          </p>
                        </div>

                        <Package
                          size={20}
                          className="text-[#FF5A36]"
                        />
                      </div>

                      {seller.products.length >
                      0 ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {seller.products.map(
                            (
                              product
                            ) => (
                              <div
                                key={
                                  product.id
                                }
                                className="
                                  overflow-hidden
                                  rounded-[15px]
                                  border
                                  border-[#E8E4DE]
                                  bg-[#FFFDFC]
                                  transition
                                  hover:-translate-y-0.5
                                  hover:shadow-sm
                                "
                              >
                                {getProductImages(product).length > 0 ? (
                                  <div>
                                    <img
                                      src={
                                        getProductImages(product)[0]?.url ??
                                        ""
                                      }
                                      alt={
                                        product.name
                                      }
                                      className="h-40 w-full object-cover"
                                    />

                                    {getProductImages(product).length > 1 && (
                                      <div className="flex gap-2 overflow-x-auto border-t border-[#E8E4DE] bg-white p-2">
                                        {getProductImages(product).map((image, imageIndex) => (
                                          <img
                                            key={image.id ?? `${product.id}-image-${imageIndex}`}
                                            src={image.url}
                                            alt=""
                                            className="h-12 w-12 shrink-0 rounded-lg object-cover"
                                          />
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div
                                    className="
                                      flex
                                      h-28
                                      items-center
                                      justify-center
                                    "
                                    style={{
                                      backgroundColor:
                                        getCategoryColor(
                                          seller.category
                                        ),
                                    }}
                                  >
                                    <Package
                                      size={27}
                                      className="text-[#9F2D18]"
                                    />
                                  </div>
                                )}

                                <div className="p-4">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <h3 className="text-[13px] font-bold text-[#2E2925]">
                                        {
                                          product.name
                                        }
                                      </h3>

                                      {product.category?.name && (
                                        <p className="mt-1 text-[10px] font-semibold text-[#8B847E]">
                                          {product.category.name}
                                        </p>
                                      )}
                                    </div>

                                    <span
                                      className={`
                                        shrink-0
                                        rounded-full
                                        px-2
                                        py-1
                                        text-[9px]
                                        font-bold
                                        ${getAvailabilityStyle(
                                          product.availability
                                        )}
                                      `}
                                    >
                                      {getAvailabilityLabel(
                                        product.availability
                                      )}
                                    </span>
                                  </div>

                                  {product.description && (
                                    <p className="mt-2 text-[11px] leading-5 text-[#878079]">
                                      {product.description}
                                    </p>
                                  )}

                                  <div className="mt-4 text-[13px] font-black text-[#9F2D18]">
                                    {formatPrice(
                                      product
                                    )}
                                  </div>

                                  {product.keywords.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                      {product.keywords.map((keyword) => (
                                        <span
                                          key={`${product.id}-${keyword}`}
                                          className="rounded-full bg-[#F3F0EB] px-2 py-1 text-[9px] font-semibold text-[#6F675F]"
                                        >
                                          {keyword}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      ) : (
                        <div
                          className="
                            rounded-xl
                            border
                            border-dashed
                            border-[#DDD6CE]
                            bg-[#FCFAF6]
                            px-5
                            py-10
                            text-center
                          "
                        >
                          <Package
                            size={25}
                            className="mx-auto text-[#AAA29B]"
                          />

                          <p className="mt-3 text-[12px] font-bold text-[#625B55]">
                            No products listed yet
                          </p>

                          <p className="mt-1 text-[11px] text-[#928A83]">
                            Contact the seller to ask
                            what they currently have.
                          </p>
                        </div>
                      )}
                    </div>

                    <aside className="space-y-4">
                      <div
                        className="
                          rounded-[18px]
                          bg-[#FFF0D9]
                          p-5
                        "
                      >
                        <h2 className="text-[15px] font-black text-[#17202A]">
                          Contact seller
                        </h2>

                        <p className="mt-1 text-[11px] leading-5 text-[#7E7771]">
                          Reach out directly using
                          their available contact
                          channels.
                        </p>

                        <div className="mt-4 space-y-2">
                          {seller.socialLinks.length >
                          0 ? (
                            seller.socialLinks.map(
                              (
                                link
                              ) => {
                                if (
                                  link.platform ===
                                  "DIRECTIONS"
                                ) {
                                  if (getDirectionsUrl() === "#") {
                                    return null;
                                  }

                                  return (
                                    <button
                                      key={
                                        link.id
                                      }
                                      type="button"
                                      onClick={
                                        handleDirectionsClick
                                      }
                                      disabled={
                                        directionsLoading
                                      }
                                      className="flex w-full items-center justify-between rounded-xl border border-[#F0D7B3] bg-white px-3 py-3 text-[11px] font-bold text-[#514B46] transition hover:border-[#FFB39F] hover:text-[#FF5A36] disabled:cursor-wait disabled:opacity-70"
                                    >
                                      <span className="flex items-center gap-2">
                                        <MapPin
                                          size={16}
                                        />

                                        {directionsLoading
                                          ? "Opening Directions..."
                                          : "Directions"}
                                      </span>

                                      <ExternalLink
                                        size={13}
                                      />
                                    </button>
                                  );
                                }

                                const url =
                                  buildContactUrl(
                                    link.platform,
                                    link.handle,
                                    seller
                                      .location
                                      ?.lat,
                                    seller
                                      .location
                                      ?.long,
                                    seller
                                      .location
                                      ?.address
                                  );

                                const isPhone =
                                  link.platform ===
                                  "PHONE";

                                if (
                                  url ===
                                  "#"
                                ) {
                                  return null;
                                }

                                return (
                                  <a
                                    key={
                                      link.id
                                    }
                                    href={
                                      url
                                    }
                                    target={
                                      isPhone
                                        ? undefined
                                        : "_blank"
                                    }
                                    rel={
                                      isPhone
                                        ? undefined
                                        : "noreferrer"
                                    }
                                    onClick={() =>
                                      handleContactClick(
                                        link.platform
                                      )
                                    }
                                    className="
                                      flex
                                      items-center
                                      justify-between
                                      rounded-xl
                                      border
                                      border-[#F0D7B3]
                                      bg-white
                                      px-3
                                      py-3
                                      text-[11px]
                                      font-bold
                                      text-[#514B46]
                                      transition
                                      hover:border-[#FFB39F]
                                      hover:text-[#FF5A36]
                                    "
                                  >
                                    <span className="flex items-center gap-2">
                                      <ContactIcon
                                        platform={
                                          link.platform
                                        }
                                      />

                                      {link.platform ===
                                      "WHATSAPP"
                                        ? "WhatsApp"
                                        : link.platform ===
                                            "INSTAGRAM"
                                          ? "Instagram"
                                          : link.platform ===
                                              "TIKTOK"
                                            ? "TikTok"
                                            : link.platform ===
                                                "FACEBOOK"
                                              ? "Facebook"
                                              : link.platform ===
                                                  "PHONE"
                                                ? "Phone"
                                                : link.platform}
                                    </span>

                                    <ExternalLink
                                      size={
                                        13
                                      }
                                    />
                                  </a>
                                );
                              }
                            )
                          ) : (
                            <div className="rounded-xl bg-white/70 px-3 py-3 text-[11px] leading-5 text-[#817970]">
                              No contact details have
                              been added yet.
                            </div>
                          )}

                          {getDirectionsUrl() !==
                            "#" &&
                            !seller.socialLinks.some(
                              (
                                link
                              ) =>
                                link.platform ===
                                "DIRECTIONS"
                            ) && (
                              <button
                                type="button"
                                onClick={
                                  handleDirectionsClick
                                }
                                disabled={
                                  directionsLoading
                                }
                                className="
                                  flex
                                  w-full
                                  items-center
                                  justify-between
                                  rounded-xl
                                  border
                                  border-[#F0D7B3]
                                  bg-white
                                  px-3
                                  py-3
                                  text-[11px]
                                  font-bold
                                  text-[#514B46]
                                  transition
                                  hover:border-[#FFB39F]
                                  hover:text-[#FF5A36]
                                "
                              >
                                <span className="flex items-center gap-2">
                                  <MapPin
                                    size={16}
                                  />

                                  Directions
                                </span>

                                <ExternalLink
                                  size={13}
                                />
                              </button>
                            )}
                        </div>
                      </div>

                      {seller.categories.length >
                        0 && (
                        <div
                          className="
                            rounded-[18px]
                            border
                            border-[#E8E4DE]
                            bg-[#FCFAF6]
                            p-5
                          "
                        >
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#A29B94]">
                            Categories
                          </p>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {seller.categories.map(
                              (
                                item
                              ) => (
                                <span
                                  key={
                                    item
                                  }
                                  className="rounded-full px-2.5 py-1 text-[10px] font-bold text-[#514B46]"
                                  style={{
                                    backgroundColor:
                                      getCategoryColor(
                                        item
                                      ),
                                  }}
                                >
                                  {
                                    item
                                  }
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      )}

                      <div
                        className="
                          rounded-[18px]
                          border
                          border-[#E8E4DE]
                          bg-white
                          p-5
                        "
                      >
                        <p className="text-[12px] font-bold text-[#3D3834]">
                          Can&apos;t find what you need?
                        </p>

                        <p className="mt-1 text-[11px] leading-5 text-[#888079]">
                          Send a request and let
                          ReMarket help you find it.
                        </p>

                        <Link
                          href="/request"
                          className="
                            mt-4
                            flex
                            w-full
                            items-center
                            justify-center
                            gap-2
                            rounded-xl
                            bg-[#FF5A36]
                            px-4
                            py-2.5
                            text-[11px]
                            font-bold
                            text-white
                            transition
                            hover:bg-[#E94E2C]
                          "
                        >
                          Request something
                        </Link>
                      </div>
                    </aside>
                  </div>

                  {/* RATINGS AND REVIEWS */}
                  <section className="mt-5 rounded-[18px] border border-[#E8E4DE] bg-white p-5 shadow-[0_4px_18px_rgba(30,20,10,0.035)] sm:p-6">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#FF5A36]">Customer feedback</p>
                      <div className="mt-1 flex flex-wrap items-center gap-3">
                        <h2 className="text-[20px] font-black text-[#17202A]">Ratings &amp; Reviews</h2>
                        {seller.reviewCount > 0 && <div className="flex items-center gap-2 rounded-full bg-[#FFF7ED] px-3 py-1.5"><ReviewStars rating={seller.averageRating} size={14} /><span className="text-[11px] font-black text-[#17202A]">{seller.averageRating.toFixed(1)}</span><span className="text-[10px] text-[#8B847E]">{seller.reviewCount} {seller.reviewCount === 1 ? "review" : "reviews"}</span></div>}
                      </div>
                      <p className="mt-1 text-[11px] leading-5 text-[#8B847E]">See what customers are saying about this business.</p>
                    </div>
                    {reviewSuccess && <div role="status" aria-live="polite" className="mt-4 rounded-xl border border-[#BDE8D8] bg-[#EFFBF6] px-3 py-2.5 text-[11px] font-semibold text-[#137A59]">{reviewSuccess}</div>}
                    {reviewError && <div role="alert" aria-live="polite" className="mt-4 rounded-xl border border-[#F0C9BF] bg-[#FFF1ED] px-3 py-2.5 text-[11px] font-semibold text-[#9F2D18]">{reviewError}</div>}
                    <div className="mt-5 grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
                      <div className="rounded-[16px] border border-[#E8E4DE] bg-[#FCFAF6] p-4">
                        <div className="text-center"><p className="text-[34px] font-black leading-none text-[#17202A]">{seller.reviewCount > 0 ? seller.averageRating.toFixed(1) : "—"}</p><div className="mt-2 flex justify-center"><ReviewStars rating={seller.averageRating} size={18} /></div><p className="mt-2 text-[10px] font-semibold text-[#8B847E]">{seller.reviewCount} {seller.reviewCount === 1 ? "customer review" : "customer reviews"}</p></div>
                        <div className="mt-5 space-y-2">{[5,4,3,2,1].map((rating) => { const count = ratingBreakdown[rating as 1|2|3|4|5]; const percentage = seller.reviewCount > 0 ? Math.min(100, Math.round((count / seller.reviewCount) * 100)) : 0; return <div key={rating} className="flex items-center gap-2"><span className="w-5 text-right text-[10px] font-bold text-[#746D67]">{rating}</span><Star size={12} className="fill-[#FFB300] text-[#FFB300]" /><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#E7E0D8]"><div className="h-full rounded-full bg-[#FF5A36]" style={{ width: `${percentage}%` }} /></div><span className="w-7 text-right text-[9px] font-semibold text-[#8B847E]">{count}</span></div>; })}</div>
                      </div>
                      <div className="rounded-[16px] border border-[#E8E4DE] bg-white p-4">
                        {currentUserLoading ? <div className="flex min-h-[160px] items-center justify-center gap-2 text-[11px] font-semibold text-[#817970]"><LoaderCircle size={15} className="animate-spin text-[#FF5A36]" />Checking your account...</div> : currentUserRole === "BUYER" ? <><h3 className="text-[13px] font-black text-[#17202A]">Leave a review</h3><p className="mt-1 text-[10px] leading-5 text-[#8B847E]">Share your experience with this business.</p><form onSubmit={submitReview} className="mt-4"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#8C8580]">Your rating</p><div className="mt-2 flex flex-wrap items-center gap-2"><div className="flex items-center gap-1">{[1,2,3,4,5].map((rating) => <button key={rating} type="button" aria-label={`Rate ${rating} out of 5`} aria-pressed={reviewRating === rating} onClick={() => setReviewRating(rating)} className="rounded-lg p-1 transition hover:bg-[#FFF0E9]"><Star size={22} className={rating <= reviewRating ? "fill-[#FFB300] text-[#FFB300]" : "text-[#D6CFC8]"} /></button>)}</div><span className="text-[10px] font-semibold text-[#8B847E]">{getRatingLabel(reviewRating)}</span></div><label htmlFor="review-comment" className="mt-4 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#8C8580]">Review</label><textarea id="review-comment" value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} rows={4} maxLength={2000} placeholder="What was your experience with this business?" className="mt-2 w-full resize-none rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] px-3 py-3 text-[11px] leading-5 text-[#35302C] outline-none focus:border-[#FF9B86] focus:bg-white focus:ring-4 focus:ring-[#FF5A36]/10" /><div className="mt-1 flex justify-end"><span className="text-[9px] text-[#A29B94]">{reviewComment.length}/2000</span></div><div className="mt-4 flex justify-end"><button type="submit" disabled={reviewSubmitting} className="inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-[11px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{reviewSubmitting ? <><LoaderCircle size={14} className="animate-spin" />Submitting...</> : "Submit review"}</button></div></form></> : currentUserRole === null ? <div className="flex min-h-[160px] flex-col items-center justify-center text-center"><Star size={22} className="fill-current text-[#FF5A36]" /><h3 className="mt-3 text-[13px] font-black text-[#17202A]">Sign in to leave a review</h3><p className="mt-1 max-w-[320px] text-[10px] leading-5 text-[#8B847E]">Sign in as a buyer to share your experience.</p><div className="mt-4 flex flex-wrap justify-center gap-2"><Link href="/buyer/login" className="rounded-xl bg-[#FF5A36] px-4 py-2.5 text-[10px] font-bold text-white">Sign in as buyer</Link><Link href="/buyer/signup" className="rounded-xl border border-[#E8E4DE] bg-white px-4 py-2.5 text-[10px] font-bold text-[#746D67]">Create buyer account</Link></div></div> : <div className="flex min-h-[160px] flex-col items-center justify-center text-center"><Star size={22} className="text-[#8B6960]" /><h3 className="mt-3 text-[13px] font-black text-[#17202A]">Buyer reviews only</h3><p className="mt-1 max-w-[320px] text-[10px] leading-5 text-[#8B847E]">Only buyer accounts can submit reviews.</p></div>}
                      </div>
                    </div>
                    <div className="mt-6 border-t border-[#EAE6DF] pt-5"><div className="flex items-center justify-between"><div><h3 className="text-[14px] font-black text-[#17202A]">Customer reviews</h3><p className="mt-1 text-[10px] text-[#8B847E]">Recent feedback from ReMarket buyers.</p></div>{reviews.length > 0 && <span className="rounded-full bg-[#FCFAF6] px-2.5 py-1 text-[9px] font-bold text-[#746D67]">{reviews.length}</span>}</div>
                      {reviewsLoading ? <div className="mt-4 flex items-center justify-center rounded-xl border border-dashed border-[#DDD6CE] bg-[#FCFAF6] px-5 py-8"><div className="flex items-center gap-2 text-[11px] font-semibold text-[#817970]"><LoaderCircle size={15} className="animate-spin text-[#FF5A36]" />Loading reviews...</div></div> : reviews.length === 0 ? <div className="mt-4 rounded-xl border border-dashed border-[#DDD6CE] bg-[#FCFAF6] px-5 py-8 text-center"><Star size={24} className="mx-auto text-[#B7AFA7]" /><p className="mt-3 text-[12px] font-bold text-[#625B55]">No reviews yet</p><p className="mt-1 text-[10px] leading-5 text-[#928A83]">Be the first customer to rate this business.</p></div> : <div className="mt-4 space-y-3">{reviews.map((review) => { const isOwnReview = currentUserRole === "BUYER" && Boolean(currentUserId && review.user.id === currentUserId); const isEditing = editingReviewId === review.id; return <article key={review.id} className="rounded-[15px] border border-[#E8E4DE] bg-[#FFFDFC] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FFE0D6] text-[10px] font-black text-[#9F2D18]">{getInitials(review.user.name)}</div><div><p className="text-[11px] font-bold text-[#3D3834]">{review.user.name}</p><p className="text-[9px] text-[#A29B94]">{formatReviewDate(review.createdAt)}{review.updatedAt !== review.createdAt && " · Edited"}</p></div></div>{!isEditing ? <><div className="mt-3"><ReviewStars rating={review.rating} size={15} /></div>{review.comment && <p className="mt-3 whitespace-pre-wrap break-words text-[11px] leading-5 text-[#68615C]">{review.comment}</p>}</> : <div className="mt-3"><div className="flex flex-wrap items-center gap-2"><div className="flex items-center gap-1">{[1,2,3,4,5].map((rating) => <button key={rating} type="button" aria-label={`Change rating to ${rating} out of 5`} onClick={() => setEditingRating(rating)} className="rounded-lg p-0.5 hover:bg-[#FFF0E9]"><Star size={18} className={rating <= editingRating ? "fill-[#FFB300] text-[#FFB300]" : "text-[#D6CFC8]"} /></button>)}</div><span className="text-[9px] font-semibold text-[#8B847E]">{getRatingLabel(editingRating)}</span></div><textarea value={editingComment} onChange={(event) => setEditingComment(event.target.value)} maxLength={2000} rows={4} className="mt-3 w-full resize-none rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] px-3 py-3 text-[11px] leading-5 outline-none focus:border-[#FF9B86]" /><div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" onClick={cancelEditingReview} disabled={reviewUpdatingId === review.id} className="rounded-xl border border-[#E8E4DE] bg-white px-3 py-2 text-[10px] font-bold text-[#746D67] disabled:opacity-60">Cancel</button><button type="button" onClick={() => void updateReview(review.id)} disabled={reviewUpdatingId === review.id} className="inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-3 py-2 text-[10px] font-bold text-white disabled:opacity-60">{reviewUpdatingId === review.id ? <><LoaderCircle size={13} className="animate-spin" />Saving...</> : "Save changes"}</button></div></div>}</div>{isOwnReview && !isEditing && <div className="flex shrink-0 items-center gap-1"><button type="button" onClick={() => startEditingReview(review)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[9px] font-bold text-[#746D67] hover:bg-[#FFF0E9]"><Pencil size={12} />Edit</button><button type="button" onClick={() => void deleteReview(review.id)} disabled={reviewDeletingId === review.id} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[9px] font-bold text-[#9F2D18] hover:bg-[#FFF1ED] disabled:opacity-60">{reviewDeletingId === review.id ? <LoaderCircle size={12} className="animate-spin" /> : <Trash2 size={12} />}Delete</button></div>}</div></article>; })}</div>}
                    </div>
                  </section>
                </>
              )}
          </section>
        </div>

        <nav
          className="
            fixed
            bottom-0
            left-0
            right-0
            z-40
            border-t
            border-[#EAE6DF]
            bg-white/95
            px-3
            py-2
            backdrop-blur
            md:hidden
          "
        >
          <div className="mx-auto flex max-w-md items-center justify-around">
            {NAV_ITEMS.map(
              (item) => {
                const Icon =
                  item.icon;

                return (
                  <Link
                    key={
                      item.href
                    }
                    href={
                      item.href
                    }
                    className="
                      flex
                      min-w-[64px]
                      flex-col
                      items-center
                      gap-1
                      rounded-xl
                      px-2
                      py-1.5
                      text-[9px]
                      font-bold
                      text-[#8A837D]
                      transition
                      hover:text-[#FF5A36]
                    "
                  >
                    <Icon
                      size={18}
                    />

                    {item.label}
                  </Link>
                );
              }
            )}
          </div>
        </nav>
      </div>

      {claimModalOpen && seller && (
        <div className="fixed inset-0 z-[100] flex items-end bg-black/30 p-0 sm:items-center sm:justify-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget && !claimSubmitting) setClaimModalOpen(false); }}>
          <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-[24px] border border-[#E8E4DE] bg-[#FFFDFC] shadow-2xl sm:max-w-[520px] sm:rounded-[22px]" role="dialog" aria-modal="true" aria-labelledby="claim-business-title">
            <div className="flex items-start justify-between gap-4 border-b border-[#EAE6DF] px-5 py-5 sm:px-6"><div className="flex min-w-0 items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF0EB] text-[#FF5A36]"><ShieldCheck className="h-5 w-5" /></div><div className="min-w-0"><h2 id="claim-business-title" className="text-[16px] font-black text-[#17202A]">Claim this business</h2><p className="mt-1 text-[11px] leading-5 text-[#8B847E]">Request ownership of <span className="font-bold text-[#5E554E]">{seller.name}</span>.</p></div></div><button type="button" onClick={() => setClaimModalOpen(false)} disabled={claimSubmitting} aria-label="Close claim form" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E8E4DE] bg-white text-[#746D67] disabled:opacity-50"><X className="h-4 w-4" /></button></div>
            <div className="px-5 py-5 sm:px-6">{claimError && <div role="alert" className="mb-4 rounded-xl border border-[#F0C9BF] bg-[#FFF1ED] px-3 py-2.5 text-[11px] font-semibold leading-5 text-[#9F2D18]">{claimError}</div>}<div className="rounded-xl bg-[#FCFAF6] px-3 py-3"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#A29B94]">Business</p><p className="mt-1 text-[13px] font-bold text-[#17202A]">{seller.name}</p>{seller.location?.area && <p className="mt-1 text-[10px] text-[#8B847E]">{seller.location.area}</p>}</div><label htmlFor="business-claim-reason" className="mt-4 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#8C8580]">Reason</label><textarea id="business-claim-reason" value={claimReason} onChange={(event) => { setClaimReason(event.target.value); setClaimError(""); }} rows={5} maxLength={1000} disabled={claimSubmitting} placeholder="Tell the admin why you are the owner of this business." className="mt-2 w-full resize-none rounded-xl border border-[#E8E4DE] bg-white px-3 py-3 text-[11px] leading-5 text-[#35302C] outline-none focus:border-[#FF9B86] disabled:bg-[#FAF6EF]" /><div className="mt-1 flex justify-end"><span className="text-[9px] text-[#A29B94]">{claimReason.length}/1000</span></div><div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setClaimModalOpen(false)} disabled={claimSubmitting} className="h-11 rounded-xl border border-[#E8E4DE] bg-white px-5 text-[11px] font-bold text-[#746D67] disabled:opacity-50">Cancel</button><button type="button" onClick={() => void submitBusinessClaim()} disabled={claimSubmitting} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 text-[11px] font-bold text-white disabled:opacity-60">{claimSubmitting ? <><LoaderCircle className="h-4 w-4 animate-spin" />Submitting...</> : <><ShieldCheck className="h-4 w-4" />Submit claim</>}</button></div></div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function SellerPage() {
  const params =
    useParams();

  const id =
    typeof params.id ===
    "string"
      ? params.id
      : "";

  return (
    <SellerPageContent
      key={id}
      id={id}
    />
  );
}