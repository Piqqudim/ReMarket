"use client";

import {
  type MouseEvent,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import Link from "next/link";
import { useParams } from "next/navigation";

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

const CATEGORY_COLORS: Record<
  string,
  string
> = {
  Fashion: "#FFE0D6",
  Electronics: "#DDF5EA",
  Food: "#FFF0C7",
  Beauty: "#E7E5FF",
  Textiles: "#F9DCE8",
  Services: "#E4E9EF",
};

type Availability =
  | "AVAILABLE"
  | "ASK_SELLER"
  | "UNAVAILABLE";

type Verification =
  | "VERIFIED"
  | "UNVERIFIED";

type Product = {
  id: string;
  name: string;
  description?: string | null;
  price?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  availability?: Availability;
  imageUrl?: string | null;
};

type SocialLink = {
  id: string;
  platform: string;
  handle: string;
};

type SellerLocation = {
  id?: string;
  area: string;
  address?: string | null;
  lat?: number | null;
  long?: number | null;
  verification?: Verification;
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
};

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
    CATEGORY_COLORS[category] ??
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

function normalizeNigerianPhone(
  value: string
): string {
  let clean = value
    .trim()
    .replace(/[^\d+]/g, "");

  if (!clean) {
    return "";
  }

  if (clean.startsWith("00")) {
    clean = clean.slice(2);
  }

  if (clean.startsWith("+")) {
    clean = clean.slice(1);
  }

  if (clean.startsWith("234")) {
    return `+${clean}`;
  }

  if (clean.startsWith("0")) {
    return `+234${clean.slice(1)}`;
  }

  return `+234${clean}`;
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
                  })
                )
            : [];

        const location: SellerLocation =
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

                verification:
                  "verification" in
                    rawLocation &&
                  rawLocation.verification ===
                    "VERIFIED"
                    ? "VERIFIED"
                    : "UNVERIFIED",
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

    if (!navigator.geolocation) {
      setDirectionsLoading(false);

      if (!navigationWindow) {
        window.location.assign(
          fallbackUrl
        );
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
          navigationWindow.location.href =
            exactUrl;
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

        if (!navigationWindow) {
          window.location.assign(
            fallbackUrl
          );
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
                    We couldn't find the seller you are looking for.
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
                            {getInitials(
                              seller.name
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
                                {product.imageUrl ? (
                                  <img
                                    src={
                                      product.imageUrl
                                    }
                                    alt={
                                      product.name
                                    }
                                    className="
                                      h-40
                                      w-full
                                      object-cover
                                    "
                                  />
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
                                    <h3 className="text-[13px] font-bold text-[#2E2925]">
                                      {
                                        product.name
                                      }
                                    </h3>

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
                                    <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-[#878079]">
                                      {
                                        product.description
                                      }
                                    </p>
                                  )}

                                  <div className="mt-4 text-[13px] font-black text-[#9F2D18]">
                                    {formatPrice(
                                      product
                                    )}
                                  </div>
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