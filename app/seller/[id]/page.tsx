// app/seller/[id]/page.tsx

"use client";

import {
  type MouseEvent,
  useEffect,
  useState,
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
  getSavedBusinesses,
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

type Product = {
  id: string;
  name: string;
  description?: string | null;
  price?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  availability?:
    | "AVAILABLE"
    | "ASK_SELLER"
    | "UNAVAILABLE";
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
  lat?: number | null;
  long?: number | null;
} | null;

type Seller = {
  id: string;
  name: string;
  ownerName: string | null;
  description: string | null;

  location: SellerLocation;

  availability: string;
  verification: string;
  verified: boolean;

  category: string;
  categories: string[];

  productCount: number;
  products: Product[];

  socialLinks: SocialLink[];
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

/**
 * Normalize Nigerian WhatsApp numbers internally.
 *
 * Supported examples:
 *
 * 08012345678
 * 8012345678
 * 2348012345678
 * +2348012345678
 * 00 234 8012345678
 *
 * Result:
 *
 * +2348012345678
 */
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

function buildContactUrl(
  platform: string,
  handle: string,
  latitude?: number | null,
  longitude?: number | null
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
        clean.startsWith(
          "http://"
        ) ||
        clean.startsWith(
          "https://"
        )
      ) {
        return clean;
      }

      const normalizedPhone =
        normalizeNigerianPhone(
          clean
        );

      if (!normalizedPhone) {
        return "#";
      }

      /*
       * WhatsApp wa.me uses digits without
       * the leading + sign.
       *
       * Internally we still normalize the
       * number to +234.
       */
      return `https://wa.me/${normalizedPhone.slice(
        1
      )}`;
    }

    case "INSTAGRAM":
      if (!clean) {
        return "#";
      }

      return clean.startsWith(
        "http://"
      ) ||
        clean.startsWith(
          "https://"
        )
        ? clean
        : `https://instagram.com/${clean}`;

    case "TIKTOK":
      if (!clean) {
        return "#";
      }

      return clean.startsWith(
        "http://"
      ) ||
        clean.startsWith(
          "https://"
        )
        ? clean
        : `https://tiktok.com/@${clean}`;

    case "FACEBOOK":
      if (!clean) {
        return "#";
      }

      return clean.startsWith(
        "http://"
      ) ||
        clean.startsWith(
          "https://"
        )
        ? clean
        : `https://facebook.com/${clean}`;

    case "PHONE": {
      if (!clean) {
        return "#";
      }

      const normalizedPhone =
        normalizeNigerianPhone(
          clean
        );

      if (!normalizedPhone) {
        return "#";
      }

      return `tel:${normalizedPhone}`;
    }

    case "DIRECTIONS": {
      if (
        typeof latitude !==
          "number" ||
        typeof longitude !==
          "number"
      ) {
        return "#";
      }

      return `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
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
      return (
        <MessageCircle
          size={16}
        />
      );

    case "INSTAGRAM":
      return (
        <ExternalLink
          size={16}
        />
      );

    case "TIKTOK":
      return (
        <Music2 size={16} />
      );

    case "FACEBOOK":
      return (
        <ExternalLink
          size={16}
        />
      );

    case "PHONE":
      return (
        <Phone size={16} />
      );

    default:
      return (
        <ExternalLink
          size={16}
        />
      );
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
    platform ===
      "WHATSAPP" ||
    platform ===
      "INSTAGRAM" ||
    platform ===
      "TIKTOK" ||
    platform ===
      "FACEBOOK" ||
    platform ===
      "PHONE" ||
    platform ===
      "DIRECTIONS"
  );
}

function SellerPageContent({
  id,
}: {
  id: string;
}) {
  const [
    seller,
    setSeller,
  ] = useState<Seller | null>(
    null
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    saved,
    setSaved,
  ] = useState(() =>
    isBusinessSaved(id)
  );

  /*
   * -----------------------------------------
   * SAVED BUSINESS SYNC
   * -----------------------------------------
   */

  useEffect(() => {
    function syncSaved() {
      setSaved(
        isBusinessSaved(id)
      );
    }

    window.addEventListener(
      SAVED_BUSINESSES_CHANGED_EVENT,
      syncSaved
    );

    return () => {
      window.removeEventListener(
        SAVED_BUSINESSES_CHANGED_EVENT,
        syncSaved
      );
    };
  }, [id]);

  /*
   * -----------------------------------------
   * LOAD SELLER
   * -----------------------------------------
   */

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
              cache:
                "no-store",
              signal:
                controller.signal,
            }
          );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            typeof data?.error ===
              "string"
              ? data.error
              : "Unable to load seller."
          );
        }

        const business =
          data?.business ??
          data;

        if (!business?.id) {
          throw new Error(
            "Seller information was not found."
          );
        }

        setSeller({
          ...business,

          location:
            business.location ??
            null,

          products:
            Array.isArray(
              business.products
            )
              ? business.products
              : [],

          categories:
            Array.isArray(
              business.categories
            )
              ? business.categories
              : [],

          socialLinks:
            Array.isArray(
              business.socialLinks
            )
              ? business.socialLinks
              : [],
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

  /*
   * -----------------------------------------
   * SAVE / UNSAVE BUSINESS
   * -----------------------------------------
   */

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

      setSaved(false);

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
        (
          seller as Seller & {
            imageUrl?: string | null;
          }
        ).imageUrl ??
        null,
    });

    setSaved(true);
  }

  /*
   * -----------------------------------------
   * CONTACT TRACKING
   * -----------------------------------------
   */

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

  /*
   * -----------------------------------------
   * STOP LINK CLICK FROM BUBBLING
   * -----------------------------------------
   */

  function handleSaveClick(
    event: MouseEvent<HTMLButtonElement>
  ) {
    event.preventDefault();
    event.stopPropagation();

    toggleSavedBusiness();
  }

  /*
   * -----------------------------------------
   * NO ID
   * -----------------------------------------
   */

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
        {/* HEADER */}
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
                    {
                      item.label
                    }
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
          {/* SIDEBAR */}
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
                      {
                        item.label
                      }
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

          {/* MAIN */}
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
            {/* BACK */}
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

            {/* LOADING */}
            {loading && (
              <div className="space-y-5">
                <div className="h-[210px] animate-pulse rounded-[18px] bg-[#F3EEE8]" />

                <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
                  <div className="h-[300px] animate-pulse rounded-[18px] bg-[#F3EEE8]" />

                  <div className="h-[220px] animate-pulse rounded-[18px] bg-[#F3EEE8]" />
                </div>
              </div>
            )}

            {/* ERROR */}
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

            {/* SELLER */}
            {!loading &&
              !error &&
              seller && (
                <>
                  {/* SELLER HERO */}
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
                          {/* Avatar */}
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

                              {(seller.verified ||
                                seller.verification ===
                                  "VERIFIED") && (
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

                        {/* SAVE */}
                        <button
                          type="button"
                          aria-label={
                            saved
                              ? `Remove ${seller.name} from saved businesses`
                              : `Save ${seller.name}`
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

                      {/* LOCATION */}
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

                      {/* DIRECTIONS */}
                      {seller.location &&
                        typeof seller
                          .location
                          .lat ===
                          "number" &&
                        typeof seller
                          .location
                          .long ===
                          "number" && (
                          <a
                            href={buildContactUrl(
                              "DIRECTIONS",
                              "",
                              seller
                                .location
                                .lat,
                              seller
                                .location
                                .long
                            )}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() =>
                              handleContactClick(
                                "DIRECTIONS"
                              )
                            }
                            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#FFF0E9] px-3 py-2 text-[11px] font-bold text-[#9F2D18] transition hover:bg-[#FFE4DA]"
                          >
                            <MapPin className="h-4 w-4" />
                            <span>
                              Directions
                            </span>
                          </a>
                        )}

                      {/* Description */}
                      {seller.description && (
                        <p className="mt-4 max-w-[800px] text-[13px] leading-6 text-[#68615C]">
                          {
                            seller.description
                          }
                        </p>
                      )}
                    </div>
                  </div>

                  {/* CONTENT */}
                  <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
                    {/* PRODUCTS */}
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
                            {seller.productCount ??
                              seller.products
                                ?.length ??
                              0}{" "}
                            items listed
                          </p>
                        </div>

                        <Package
                          size={20}
                          className="text-[#FF5A36]"
                        />
                      </div>

                      {seller.products &&
                      seller.products
                        .length >
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

                    {/* CONTACT */}
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
                          {seller.socialLinks &&
                          seller.socialLinks
                            .length >
                            0 ? (
                            seller.socialLinks.map(
                              (
                                link
                              ) => {
                                const url =
                                  buildContactUrl(
                                    link.platform,
                                    link.handle,
                                    seller
                                      .location
                                      ?.lat,
                                    seller
                                      .location
                                      ?.long
                                  );

                                const isPhone =
                                  link.platform ===
                                  "PHONE";

                                const isDirections =
                                  link.platform ===
                                  "DIRECTIONS";

                                if (
                                  url ===
                                    "#" &&
                                  isDirections
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
                        </div>
                      </div>

                      {/* Categories */}
                      {seller.categories &&
                        seller.categories
                          .length >
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

                      {/* REQUEST */}
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

        {/* MOBILE NAV */}
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
                    {
                      item.label
                    }
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