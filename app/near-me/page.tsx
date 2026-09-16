"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import Link from "next/link";

import {
  Home,
  ShoppingBag,
  ClipboardList,
  Heart,
  Search,
  MapPin,
  Navigation,
  Store,
  CheckCircle2,
  Package,
  RefreshCw,
} from "lucide-react";

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
  Fashion: "#FFE0D6",
  Electronics: "#DDF5EA",
  Food: "#FFF0C7",
  Beauty: "#E7E5FF",
  Textiles: "#F9DCE8",
  Services: "#E4E9EF",
};

type Business = {
  id: string;
  name: string;
  area?: string | null;
  distanceKm?: number | null;
  category?: string | null;
  productCount?: number;
  verified?: boolean;
  verification?: string;
  availability?:
    | "AVAILABLE"
    | "ASK_SELLER"
    | "UNAVAILABLE";
};

function getCategoryColor(
  category?: string | null
) {
  return (
    CATEGORY_COLORS[category ?? ""] ??
    "#E4E9EF"
  );
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

function getInitials(name: string) {
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) {
    return "RM";
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

export default function NearMePage() {
  const [businesses, setBusinesses] =
    useState<Business[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [locationLoading, setLocationLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [locationMode, setLocationMode] =
    useState<"gps" | "area">("gps");

  const [area, setArea] = useState("");

  const [searchArea, setSearchArea] =
    useState("");

  const [locationDenied, setLocationDenied] =
    useState(false);

  const fetchNearby = useCallback(
    async (
      latitude?: number,
      longitude?: number,
      selectedArea?: string
    ) => {
      try {
        setLoading(true);
        setError("");

        const params = new URLSearchParams();

        if (
          latitude !== undefined &&
          longitude !== undefined
        ) {
          params.set(
            "lat",
            String(latitude)
          );

          params.set(
            "lng",
            String(longitude)
          );
        }

        if (selectedArea?.trim()) {
          params.set(
            "area",
            selectedArea.trim()
          );
        }

        const response = await fetch(
          `/api/near-me?${params.toString()}`,
          {
            cache: "no-store",
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data?.error ||
              "Unable to find nearby businesses."
          );
        }

        setBusinesses(
          Array.isArray(data?.businesses)
            ? data.businesses
            : []
        );
      } catch (fetchError) {
        console.error(
          "Near Me error:",
          fetchError
        );

        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Unable to find nearby businesses."
        );

        setBusinesses([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const requestLocation = useCallback(() => {
    if (
      typeof window === "undefined" ||
      !navigator.geolocation
    ) {
      setLocationDenied(true);
      setLocationMode("area");
      setLoading(false);
      return;
    }

    setLocationLoading(true);
    setLocationDenied(false);
    setError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationLoading(false);
        setLocationMode("gps");

        fetchNearby(
          position.coords.latitude,
          position.coords.longitude
        );
      },
      (geoError) => {
        console.warn(
          "Geolocation unavailable:",
          geoError
        );

        setLocationLoading(false);
        setLocationDenied(true);
        setLocationMode("area");
        setLoading(false);

        /*
         * Important:
         * Do NOT treat location failure as
         * a fatal page error.
         */
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  }, [fetchNearby]);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  function handleAreaSubmit(
    event: React.SubmitEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const value = searchArea.trim();

    if (!value) {
      return;
    }

    setArea(value);
    setLocationMode("area");

    fetchNearby(undefined, undefined, value);
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
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
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
                  <Icon size={17} />
                  {item.label}
                </Link>
              );
            })}
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
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
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
                    <Icon size={17} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="my-5 border-t border-[#E8E4DE]" />

            <Link
              href="/near-me"
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
              <MapPin size={17} />
              Near You
            </Link>

            <Link
              href="/shop"
              className="
                mt-1
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
                hover:bg-white
                hover:text-[#FF5A36]
              "
            >
              <Store size={17} />
              All sellers
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
            {/* HEADING */}
            <div className="mb-6">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#FFE8E0] px-3 py-1.5">
                <MapPin
                  size={13}
                  className="text-[#FF5A36]"
                />

                <span className="text-[11px] font-bold text-[#9F2D18]">
                  Near You
                </span>
              </div>

              <h1 className="text-[28px] font-black tracking-tight text-[#17202A] sm:text-[34px]">
                Find it nearby
              </h1>

              <p className="mt-2 max-w-[650px] text-[13px] leading-6 text-[#77716C]">
                Discover local businesses and
                products around you.
              </p>
            </div>

            {/* LOCATION CONTROL */}
            <div
              className="
                mb-6
                rounded-[18px]
                border
                border-[#E8E4DE]
                bg-white
                p-4
                shadow-[0_4px_18px_rgba(30,20,10,0.035)]
                sm:p-5
              "
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <div
                    className="
                      flex
                      h-10
                      w-10
                      shrink-0
                      items-center
                      justify-center
                      rounded-xl
                      bg-[#FFE0D6]
                      text-[#FF5A36]
                    "
                  >
                    <MapPin size={19} />
                  </div>

                  <div>
                    <p className="text-[12px] font-bold text-[#3D3834]">
                      {locationMode === "gps"
                        ? "Using your location"
                        : area
                          ? `Showing results around ${area}`
                          : "Choose your area"}
                    </p>

                    <p className="mt-1 text-[11px] leading-5 text-[#89817A]">
                      {locationMode === "gps"
                        ? "We'll use your location to find nearby sellers."
                        : "You can search by area if location access isn't available."}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={requestLocation}
                  disabled={locationLoading}
                  className="
                    inline-flex
                    h-10
                    items-center
                    justify-center
                    gap-2
                    rounded-xl
                    border
                    border-[#FFB39F]
                    bg-white
                    px-4
                    text-[11px]
                    font-bold
                    text-[#FF5A36]
                    transition
                    hover:bg-[#FFF4F0]
                    disabled:cursor-not-allowed
                    disabled:opacity-60
                  "
                >
                  {locationLoading ? (
                    <RefreshCw
                      size={15}
                      className="animate-spin"
                    />
                  ) : (
                    <Navigation size={15} />
                  )}

                  {locationLoading
                    ? "Getting location..."
                    : "Use my location"}
                </button>
              </div>

              {/* AREA FALLBACK */}
              {(locationDenied ||
                locationMode === "area") && (
                <div className="mt-4 border-t border-[#EAE6DF] pt-4">
                  <p className="mb-2 text-[11px] font-bold text-[#514B46]">
                    Search by area instead
                  </p>

                  <form
                    onSubmit={handleAreaSubmit}
                    className="flex flex-col gap-2 sm:flex-row"
                  >
                    <div className="relative flex-1">
                      <MapPin
                        size={15}
                        className="
                          absolute
                          left-3
                          top-1/2
                          -translate-y-1/2
                          text-[#A49C95]
                        "
                      />

                      <input
                        value={searchArea}
                        onChange={(event) =>
                          setSearchArea(
                            event.target.value
                          )
                        }
                        placeholder="e.g. Yaba, Ikeja, Surulere"
                        className="
                          h-11
                          w-full
                          rounded-xl
                          border
                          border-[#E3DED7]
                          bg-[#FFFDFC]
                          pl-9
                          pr-4
                          text-[12px]
                          outline-none
                          transition
                          placeholder:text-[#AAA39D]
                          focus:border-[#FF5A36]
                          focus:ring-4
                          focus:ring-[#FF5A36]/10
                        "
                      />
                    </div>

                    <button
                      type="submit"
                      className="
                        h-11
                        rounded-xl
                        bg-[#FF5A36]
                        px-5
                        text-[11px]
                        font-bold
                        text-white
                        transition
                        hover:bg-[#E94E2C]
                      "
                    >
                      Find nearby
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* ERROR */}
            {error && (
              <div
                className="
                  mb-5
                  rounded-xl
                  border
                  border-[#F0C9BF]
                  bg-[#FFF1ED]
                  px-4
                  py-3
                  text-[12px]
                  font-medium
                  text-[#9F2D18]
                "
              >
                {error}
              </div>
            )}

            {/* RESULTS HEADER */}
            <div className="mb-4 flex items-end justify-between">
              <div>
                <h2 className="text-[17px] font-black text-[#17202A]">
                  Local sellers
                </h2>

                {!loading && (
                  <p className="mt-1 text-[11px] text-[#8B847E]">
                    {businesses.length}{" "}
                    {businesses.length === 1
                      ? "seller"
                      : "sellers"}{" "}
                    found
                  </p>
                )}
              </div>
            </div>

            {/* LOADING */}
            {loading && (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map(
                  (item) => (
                    <div
                      key={item}
                      className="
                        h-[245px]
                        animate-pulse
                        rounded-[18px]
                        bg-[#F3EEE8]
                      "
                    />
                  )
                )}
              </div>
            )}

            {/* EMPTY */}
            {!loading &&
              !error &&
              businesses.length === 0 && (
                <div
                  className="
                    rounded-[18px]
                    border
                    border-dashed
                    border-[#DDD6CE]
                    bg-[#FCFAF6]
                    px-5
                    py-14
                    text-center
                  "
                >
                  <div
                    className="
                      mx-auto
                      flex
                      h-14
                      w-14
                      items-center
                      justify-center
                      rounded-full
                      bg-[#FFE0D6]
                      text-[#FF5A36]
                    "
                  >
                    <Store size={25} />
                  </div>

                  <h3 className="mt-4 text-[15px] font-black text-[#17202A]">
                    No sellers found here yet
                  </h3>

                  <p className="mx-auto mt-2 max-w-[430px] text-[12px] leading-5 text-[#888079]">
                    Try another area or browse all
                    sellers on ReMarket.
                  </p>

                  <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={requestLocation}
                      className="
                        inline-flex
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
                      "
                    >
                      <Navigation size={14} />
                      Try my location
                    </button>

                    <Link
                      href="/shop"
                      className="
                        inline-flex
                        items-center
                        justify-center
                        gap-2
                        rounded-xl
                        border
                        border-[#E2DCD5]
                        bg-white
                        px-4
                        py-2.5
                        text-[11px]
                        font-bold
                        text-[#5E5751]
                      "
                    >
                      <ShoppingBag size={14} />
                      Browse all sellers
                    </Link>
                  </div>
                </div>
              )}

            {/* RESULTS */}
            {!loading &&
              businesses.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {businesses.map(
                    (business) => (
                      <Link
                        key={business.id}
                        href={`/seller/${business.id}`}
                        className="
                          group
                          overflow-hidden
                          rounded-[18px]
                          border
                          border-[#E8E4DE]
                          bg-white
                          shadow-[0_4px_18px_rgba(30,20,10,0.035)]
                          transition
                          hover:-translate-y-0.5
                          hover:shadow-[0_8px_25px_rgba(30,20,10,0.07)]
                        "
                      >
                        {/* CATEGORY HEADER */}
                        <div
                          className="h-20 p-4"
                          style={{
                            backgroundColor:
                              getCategoryColor(
                                business.category
                              ),
                          }}
                        >
                          <div className="flex items-start justify-between">
                            <div
                              className="
                                flex
                                h-11
                                w-11
                                items-center
                                justify-center
                                rounded-xl
                                bg-white/70
                                text-[13px]
                                font-black
                                text-[#9F2D18]
                              "
                            >
                              {getInitials(
                                business.name
                              )}
                            </div>

                            <span
                              className={`
                                rounded-full
                                px-2.5
                                py-1
                                text-[9px]
                                font-bold
                                ${getAvailabilityStyle(
                                  business.availability
                                )}
                              `}
                            >
                              {getAvailabilityLabel(
                                business.availability
                              )}
                            </span>
                          </div>
                        </div>

                        {/* BODY */}
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <h3 className="truncate text-[14px] font-black text-[#2E2925]">
                                  {business.name}
                                </h3>

                                {(business.verified ||
                                  business.verification ===
                                    "VERIFIED") && (
                                  <CheckCircle2
                                    size={14}
                                    className="shrink-0 text-[#FF5A36]"
                                  />
                                )}
                              </div>

                              <p className="mt-1 text-[11px] font-medium text-[#8B847E]">
                                {business.category ??
                                  "Local business"}
                              </p>
                            </div>
                          </div>

                          <div className="mt-4 space-y-2">
                            {business.area && (
                              <div className="flex items-center gap-2 text-[11px] text-[#716A64]">
                                <MapPin
                                  size={14}
                                  className="shrink-0 text-[#FF5A36]"
                                />

                                <span className="truncate">
                                  {business.area}
                                </span>
                              </div>
                            )}

                            {business.distanceKm !=
                              null && (
                              <div className="flex items-center gap-2 text-[11px] font-semibold text-[#716A64]">
                                <Navigation
                                  size={14}
                                  className="shrink-0 text-[#FF5A36]"
                                />

                                {business.distanceKm.toFixed(
                                  1
                                )}{" "}
                                km away
                              </div>
                            )}

                            <div className="flex items-center gap-2 text-[11px] text-[#716A64]">
                              <Package
                                size={14}
                                className="shrink-0 text-[#FF5A36]"
                              />

                              {business.productCount ??
                                0}{" "}
                              products
                            </div>
                          </div>

                          <div
                            className="
                              mt-4
                              flex
                              items-center
                              justify-between
                              border-t
                              border-[#EEE9E3]
                              pt-3
                            "
                          >
                            <span className="text-[10px] font-bold text-[#FF5A36]">
                              View seller
                            </span>

                            <span className="text-[11px] text-[#A29A93] transition group-hover:translate-x-0.5 group-hover:text-[#FF5A36]">
                              →
                            </span>
                          </div>
                        </div>
                      </Link>
                    )
                  )}
                </div>
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
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
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
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </main>
  );
}