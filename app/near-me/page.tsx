"use client";
import { type FormEvent, useEffect, useSyncExternalStore, useState, useRef } from "react";
import { Home, ShoppingBag, ClipboardList, Heart, UserCircle, Store, MapPin, Navigation, Loader2, Bookmark, Package, ArrowRight, Search, ListFilter, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSavedBusinesses, isBusinessSaved, saveBusiness, removeSavedBusiness, SAVED_BUSINESSES_CHANGED_EVENT, } from "@/lib/saved";
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
    price: number | null;
    priceMin: number | null;
    priceMax: number | null;
    availability: "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
    imageUrl: string | null;
    keywords: string[];
    images: ProductImage[];
};
type BusinessLocation = {
    id: string;
    area: string;
    street: string | null;
};
type NearMeRanking = 1 | 2 | 3 | 4;
type NearMeRankingLabel = "same-street" | "adjacent-street" | "nearby-street" | "whole-area";
type Business = {
    id: string;
    name: string;
    ownerName: string | null;
    description: string | null;
    imageUrl: string | null;
    area: string;
    location: BusinessLocation | null;
    availability: "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
    verification: "VERIFIED" | "UNVERIFIED";
    verified: boolean;
    categories: {
        category: {
            id: string;
            name: string;
        };
    }[];
    products: Product[];
    socialLinks: {
        id: string;
        platform: string;
        handle: string;
    }[];
    distanceKm: number | null;
    ranking?: NearMeRanking;
    rankingLabel?: NearMeRankingLabel;
};

type SearchLocation = {
    street: string | null;
    area: string | null;
};

type NearMeMode = "none" | "area" | "street" | "gps";

type AreaGroup = {
    lga: string;
    areas: string[];
};

type PaginationState = {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
};

type GpsCoordinates = {
    lat: number;
    lng: number;
};

const DEFAULT_PAGE_SIZE = 12;
const EMPTY_PAGINATION: PaginationState = {
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    total: 0,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
};
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
function formatPrice(product: Product): string {
    if (product.price !==
        null) {
        return `₦${product.price.toLocaleString()}`;
    }
    if (product.priceMin !==
        null &&
        product.priceMax !==
            null) {
        return `₦${product.priceMin.toLocaleString()} - ₦${product.priceMax.toLocaleString()}`;
    }
    if (product.priceMin !==
        null) {
        return `From ₦${product.priceMin.toLocaleString()}`;
    }
    if (product.priceMax !==
        null) {
        return `Up to ₦${product.priceMax.toLocaleString()}`;
    }
    return "Ask seller";
}
function getProductImage(product: Product): string | null {
    return (product.images?.[0]?.url ??
        product.imageUrl ??
        null);
}
function getDistanceLabel(distanceKm: number | null): string | null {
    if (typeof distanceKm !==
        "number" ||
        !Number.isFinite(distanceKm) ||
        distanceKm < 0) {
        return null;
    }
    /*
  
     * Haversine gives straight-line
  
     * distance.
  
     *
  
     * Keep the presentation neutral
  
     * and do not describe this value as
  
     * driving distance.
  
     */
    if (distanceKm < 1) {
        const distanceMetres = Math.round(distanceKm * 1000);
        if (distanceMetres < 1) {
            return "Less than 1 m away";
        }
        return `${distanceMetres.toLocaleString()} m away`;
    }
    if (distanceKm < 10) {
        return `${distanceKm.toFixed(1)} km away`;
    }
    return `${Math.round(distanceKm).toLocaleString()} km away`;
}
function getRankingLabel(rankingLabel: NearMeRankingLabel | undefined): string | null {
    switch (rankingLabel) {
        case "same-street":
            return "Same street";
        case "adjacent-street":
            return "Adjacent street";
        case "nearby-street":
            return "Nearby street";
        case "whole-area":
            return "Whole area";
        default:
            return null;
    }
}

function getBusinessAvailabilityLabel(availability: Business["availability"]): string {
    switch (availability) {
        case "AVAILABLE":
            return "Available";
        case "UNAVAILABLE":
            return "Unavailable";
        case "ASK_SELLER":
        default:
            return "Ask seller";
    }
}

function getBusinessAvailabilityClass(availability: Business["availability"]): string {
    switch (availability) {
        case "AVAILABLE":
            return "bg-[#DDF5EA] text-[#137A59]";
        case "UNAVAILABLE":
            return "bg-[#F3ECEA] text-[#8B6960]";
        case "ASK_SELLER":
        default:
            return "bg-[#FFF0D9] text-[#9F2D18]";
    }
}
/*

 * -----------------------------------------

 * SAVED BUSINESSES EXTERNAL STORE

 * -----------------------------------------

 */
function subscribeToSavedBusinesses(callback: () => void) {
    window.addEventListener(SAVED_BUSINESSES_CHANGED_EVENT, callback);
    window.addEventListener("storage", callback);
    return () => {
        window.removeEventListener(SAVED_BUSINESSES_CHANGED_EVENT, callback);
        window.removeEventListener("storage", callback);
    };
}
function getSavedBusinessesSnapshot(): string {
    return JSON.stringify(getSavedBusinesses()
        .map((business) => business.id)
        .sort());
}
function getSavedBusinessesServerSnapshot(): string {
    return "[]";
}
export default function NearMePage() {
    const router = useRouter();
    const searchRequestId = useRef(0);
    const [area, setArea] = useState("");
    const [businesses, setBusinesses,] = useState<Business[]>([]);
    const [mode, setMode] = useState<NearMeMode>("none");
    const [loading, setLoading,] = useState(false);
    const [locating, setLocating,] = useState(false);
    const [error, setError] = useState("");
    const [warning, setWarning] = useState("");
    const [areaGroups, setAreaGroups] = useState<AreaGroup[]>([]);
    const [showAreaPicker, setShowAreaPicker] = useState(false);
    const [pagination, setPagination] = useState<PaginationState>(EMPTY_PAGINATION);
    const [activeSearch, setActiveSearch] = useState("");
    const [gpsCoordinates, setGpsCoordinates] = useState<GpsCoordinates | null>(null);
    const [searchLocation, setSearchLocation,] = useState<SearchLocation>({
        street: null,
        area: null,
    });
    useEffect(() => {
        let cancelled = false;

        async function loadAreaGroups() {
            try {
                const response = await fetch("/api/areas", { cache: "no-store" });
                if (!response.ok) throw new Error("Unable to load predefined areas.");
                const data = await response.json();
                if (!cancelled && Array.isArray(data?.groups)) {
                    setAreaGroups(data.groups);
                }
            } catch (areaError) {
                console.error("Failed to load predefined areas:", areaError);
            }
        }

        void loadAreaGroups();
        return () => { cancelled = true; };
    }, []);

    const savedSnapshot = useSyncExternalStore(subscribeToSavedBusinesses, getSavedBusinessesSnapshot, getSavedBusinessesServerSnapshot);
    const savedBusinessIds = (() => {
        try {
            const ids = JSON.parse(savedSnapshot);
            if (!Array.isArray(ids)) {
                return new Set<string>();
            }
            return new Set<string>(ids.filter((value): value is string => typeof value ===
                "string"));
        }
        catch {
            return new Set<string>();
        }
    })();
   function paginationFromResponse(data: {
    page?: number;
    pageSize?: number;
    total?: number;
    totalPages?: number;
    hasNextPage?: boolean;
    hasPreviousPage?: boolean;
}): PaginationState {
    const pageValue = data?.page;
    const pageSizeValue = data?.pageSize;
    const totalValue = data?.total;
    const totalPagesValue = data?.totalPages;

    const pageNumber =
        typeof pageValue === "number" &&
        Number.isInteger(pageValue) &&
        pageValue > 0
            ? pageValue
            : 1;

    const pageSize =
        typeof pageSizeValue === "number" &&
        Number.isInteger(pageSizeValue) &&
        pageSizeValue > 0
            ? pageSizeValue
            : DEFAULT_PAGE_SIZE;

    const total =
        typeof totalValue === "number" &&
        Number.isInteger(totalValue) &&
        totalValue >= 0
            ? totalValue
            : 0;

    const totalPages =
        typeof totalPagesValue === "number" &&
        Number.isInteger(totalPagesValue) &&
        totalPagesValue >= 0
            ? totalPagesValue
            : Math.ceil(total / pageSize);

    return {
        page: pageNumber,
        pageSize,
        total,
        totalPages,
        hasNextPage:
            typeof data?.hasNextPage === "boolean"
                ? data.hasNextPage
                : pageNumber < totalPages,
        hasPreviousPage:
            typeof data?.hasPreviousPage === "boolean"
                ? data.hasPreviousPage
                : pageNumber > 1 && totalPages > 0,
    };
}

    async function loadByArea(selectedSearch: string, requestedPage = 1) {
        const requestId = ++searchRequestId.current;
        const trimmedSearch = selectedSearch.trim();
        if (!trimmedSearch) {
            setBusinesses([]);
            setMode("none");
            setSearchLocation({ street: null, area: null });
            setPagination(EMPTY_PAGINATION);
            setError("Enter an area or street name to search for local businesses.");
            setWarning("");
            setLoading(false);
            return;
        }

        setLoading(true);
        setError("");
        setWarning("");
        setBusinesses([]);
        setMode("none");
        setSearchLocation({ street: null, area: null });
        setGpsCoordinates(null);
        setActiveSearch(trimmedSearch);
        setPagination({ ...EMPTY_PAGINATION, page: requestedPage });

        try {
            const params = new URLSearchParams();
            params.set("q", trimmedSearch);
            params.set("page", String(requestedPage));
            params.set("pageSize", String(DEFAULT_PAGE_SIZE));

            const response = await fetch(`/api/near-me?${params.toString()}`, {
                method: "GET",
                cache: "no-store",
            });
            const data = await response.json();
            if (requestId !== searchRequestId.current) return;

            if (!response.ok && data?.code === "INVALID_AREA") {
                setBusinesses([]);
                setMode("none");
                setPagination(EMPTY_PAGINATION);
                setWarning(
                    typeof data?.warning === "string"
                        ? data.warning
                        : typeof data?.error === "string"
                            ? data.error
                            : "This area is not valid. Choose an area from the predefined list or enter a registered street name."
                );
                return;
            }

            if (!response.ok) {
                throw new Error(typeof data?.error === "string" ? data.error : "Unable to load nearby businesses.");
            }

            setBusinesses(Array.isArray(data?.businesses) ? data.businesses : []);
            setMode(data?.mode === "street" ? "street" : "area");
            setPagination(paginationFromResponse(data));
            if (data?.mode === "area" && typeof data?.location === "string") {
                setArea(data.location);
            }
        } catch (searchError) {
            if (requestId !== searchRequestId.current) return;
            console.error("Near Me text search error:", searchError);
            setBusinesses([]);
            setMode("none");
            setPagination(EMPTY_PAGINATION);
            setError(searchError instanceof Error ? searchError.message : "Unable to load nearby businesses.");
        } finally {
            if (requestId === searchRequestId.current) setLoading(false);
        }
    }

    function submitArea(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        void loadByArea(area, 1);
    }

    function goToPage(nextPage: number) {
        if (loading || nextPage < 1 || nextPage > pagination.totalPages) return;

        if (mode === "gps" && gpsCoordinates) {
            void loadGpsPage(gpsCoordinates, nextPage);
            return;
        }

        if (activeSearch) {
            void loadByArea(activeSearch, nextPage);
        }
    }

    /*
  
     * -----------------------------------------
  
     * CURRENT LOCATION
  
     * -----------------------------------------
  
     *
  
     * Latitude and longitude are obtained
  
     * internally from the browser.
  
     * The user never types them.
  
     *
  
     * The API converts the coordinates into
  
     * the buyer's current street and area.
  
     */
    async function loadGpsPage(coordinates: GpsCoordinates, requestedPage = 1) {
        const requestId = ++searchRequestId.current;
        setLoading(true);
        setError("");
        setWarning("");
        setBusinesses([]);
        setMode("none");
        setGpsCoordinates(coordinates);
        setPagination({ ...EMPTY_PAGINATION, page: requestedPage });

        try {
            const params = new URLSearchParams();
            params.set("lat", String(coordinates.lat));
            params.set("lng", String(coordinates.lng));
            params.set("page", String(requestedPage));
            params.set("pageSize", String(DEFAULT_PAGE_SIZE));

            const response = await fetch(`/api/near-me?${params.toString()}`, {
                method: "GET",
                cache: "no-store",
            });
            const data = await response.json();
            if (requestId !== searchRequestId.current) return;

            if (!response.ok) {
                throw new Error(typeof data?.error === "string" ? data.error : "Unable to find businesses near you.");
            }

            setBusinesses(Array.isArray(data?.businesses) ? data.businesses : []);
            setSearchLocation({
                street: typeof data?.location?.street === "string" ? data.location.street : null,
                area: typeof data?.location?.area === "string" ? data.location.area : null,
            });
            setPagination(paginationFromResponse(data));
            setMode("gps");
            setActiveSearch("");
        } catch (locationError) {
            if (requestId !== searchRequestId.current) return;
            console.error("GPS near-me error:", locationError);
            setBusinesses([]);
            setMode("none");
            setGpsCoordinates(null);
            setPagination(EMPTY_PAGINATION);
            setSearchLocation({ street: null, area: null });
            setError(locationError instanceof Error ? locationError.message : "Unable to find businesses near you.");
        } finally {
            if (requestId === searchRequestId.current) {
                setLocating(false);
                setLoading(false);
            }
        }
    }

    function useCurrentLocation() {
        if (loading) return;
        const requestId = ++searchRequestId.current;

        if (!navigator.geolocation) {
            setError("Location services are not available in this browser.");
            return;
        }

        setLocating(true);
        setLoading(true);
        setError("");
        setWarning("");
        setBusinesses([]);
        setMode("none");
        setActiveSearch("");
        setPagination(EMPTY_PAGINATION);
        setSearchLocation({ street: null, area: null });

        navigator.geolocation.getCurrentPosition(
            (position) => {
                if (requestId !== searchRequestId.current) return;
                void loadGpsPage({
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                }, 1);
            },
            (geoError) => {
                if (requestId !== searchRequestId.current) return;
                console.error("Geolocation error:", geoError);
                setLocating(false);
                setLoading(false);
                setBusinesses([]);
                setMode("none");
                setGpsCoordinates(null);
                setPagination(EMPTY_PAGINATION);
                setSearchLocation({ street: null, area: null });

                switch (geoError.code) {
                    case geoError.PERMISSION_DENIED:
                        setError("Location permission was denied. Enter an area or street instead.");
                        break;
                    case geoError.POSITION_UNAVAILABLE:
                        setError("Your current location is unavailable. Enter an area or street instead.");
                        break;
                    case geoError.TIMEOUT:
                        setError("Finding your location took too long. Enter an area or street instead.");
                        break;
                    default:
                        setError("We couldn't access your current location. Enter an area or street instead.");
                }
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 60000,
            }
        );
    }

    /*
  
     * -----------------------------------------
  
     * SAVE / UNSAVE
  
     * -----------------------------------------
  
     */
    function toggleSaved(business: Business) {
        if (isBusinessSaved(business.id)) {
            removeSavedBusiness(business.id);
            return;
        }
        const category = business.categories?.[0]
            ?.category?.name ??
            "Services";
        saveBusiness({
            id: business.id,
            name: business.name,
            area: business.area ??
                business.location?.area ??
                "Local",
            category,
            verified: business.verified ??
                business.verification ===
                    "VERIFIED",
            availability: business.availability,
            imageUrl: business.imageUrl,
        });
    }
    return (<main className="min-h-dvh w-full overflow-x-clip bg-[#FFFDFC]">
      <div className="min-h-dvh w-full">
        <div className="min-h-dvh w-full overflow-hidden bg-[#FFFDFC]">

          {/* HEADER */}

          <header className="flex h-[64px] items-center justify-between border-b border-[#EAE6DF] bg-white px-4 sm:px-6 lg:h-[66px]">

            <Link href="/" className="flex min-w-0 shrink-0 items-center gap-2.5">

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF5A36] text-white">

                <Store className="h-5 w-5"/>

              </div>

              <div>

                <p className="text-sm font-bold">

                  ReMarket

                </p>

                <p className="text-[10px] text-muted">

                  Find it nearby

                </p>

              </div>

            </Link>

            <nav className="hidden items-center gap-1 xl:flex">

              {NAV_ITEMS.map((item) => (<button key={item.label} type="button" onClick={() => router.push(item.href)} className="rounded-xl px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">

                    {item.label}

                  </button>))}

            </nav>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">

              <button type="button" onClick={() => router.push("/saved")} className="hidden h-9 w-9 items-center justify-center rounded-full hover:bg-gray-50 sm:flex" aria-label="Saved">

                <Heart className="h-[19px] w-[19px] text-gray-700"/>

              </button>

              <button type="button" className="hidden h-9 w-9 items-center justify-center rounded-full bg-gray-100 sm:flex" aria-label="Profile">

                <UserCircle className="h-6 w-6 text-gray-700"/>

              </button>

              <button type="button" onClick={() => router.push("/request")} className="shrink-0 whitespace-nowrap rounded-xl bg-[#FF5A36] px-2.5 py-2.5 text-[10px] font-bold text-white sm:px-4 sm:text-xs">
                <span className="sm:hidden">Request</span>
                <span className="hidden sm:inline">Request something</span>
              </button>

            </div>

          </header>

          <div className="flex">

            {/* SIDEBAR */}

            <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] px-3 py-5 lg:block">

              <nav className="space-y-1">

                {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (<button key={item.label} type="button" onClick={() => router.push(item.href)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium ${item.label ===
                    "Shop"
                    ? "bg-white text-[#9F2D18]"
                    : "text-gray-700"}`}>

                        <Icon className="h-[18px] w-[18px]"/>

                        {item.label}

                      </button>);
        })}

              </nav>

            </aside>

            {/* MAIN */}

            <div className="min-w-0 flex-1">

              <div className="px-4 pb-24 pt-4 sm:px-6 sm:pt-6 lg:px-6 lg:pb-8">

                {/* HERO */}

                <section className="rounded-[18px] bg-[#FF5A36] px-5 py-6 text-white shadow-soft sm:px-7 sm:py-7">

                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/75">

                    Near You

                  </p>

                  <h1 className="mt-2 text-[26px] font-bold leading-tight sm:text-[30px]">

                    Find local businesses nearby

                  </h1>

                  <p className="mt-2 max-w-[560px] text-xs leading-5 text-white/80 sm:text-sm">

                    Search by street or area, or use your current location to discover businesses around you.

                  </p>

                  <form onSubmit={submitArea} className="mt-5 flex h-[48px] w-full max-w-[720px] items-center rounded-full bg-white p-1.5">
                    <MapPin className="ml-3 h-[18px] w-[18px] shrink-0 text-gray-500" />
                    <input
                      value={area}
                      onChange={(event) => {
                        setArea(event.target.value);
                        setWarning("");
                      }}
                      placeholder="Enter a street or area, e.g. Ogba or Acme Road"
                      className="min-w-0 flex-1 bg-transparent px-3 text-xs text-gray-800 outline-none placeholder:text-gray-400"
                      aria-label="Search by street or area"
                    />
                    <button
                      type="button"
                      aria-label="Browse predefined areas"
                      aria-expanded={showAreaPicker}
                      onClick={() => setShowAreaPicker((current) => !current)}
                      disabled={loading}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#9F2D18] hover:bg-[#FFF1ED] disabled:opacity-60"
                    >
                      {showAreaPicker ? <X className="h-4 w-4" /> : <ListFilter className="h-4 w-4" />}
                    </button>
                    <button type="submit" disabled={loading} className="shrink-0 rounded-full bg-[#FF5A36] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-60 sm:px-5">
                      {loading ? "Searching..." : "Search"}
                    </button>
                  </form>

                  {showAreaPicker && (
                    <div className="mt-3 max-h-72 w-full max-w-[720px] overflow-y-auto rounded-2xl border border-[#EAE6DF] bg-white p-4 text-gray-800 shadow-lg">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold text-[#17202A]">Predefined Lagos areas</p>
                          <p className="mt-1 text-[10px] text-gray-500">Choose an area to search.</p>
                        </div>
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      </div>
                      {areaGroups.length === 0 ? (
                        <p className="rounded-lg bg-[#FCFAF6] p-3 text-xs text-gray-500">The area list is temporarily unavailable. You can still enter a street or area.</p>
                      ) : (
                        <div className="space-y-4">
                          {areaGroups.map((group) => (
                            <div key={group.lga}>
                              <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[#9F2D18]">{group.lga}</p>
                              <div className="flex flex-wrap gap-2">
                                {group.areas.map((listedArea) => (
                                  <button
                                    key={`${group.lga}-${listedArea}`}
                                    type="button"
                                    onClick={() => {
                                      setArea(listedArea);
                                      setShowAreaPicker(false);
                                      void loadByArea(listedArea, 1);
                                    }}
                                    className="rounded-full border border-[#E8E4DE] bg-[#FCFAF6] px-3 py-1.5 text-[10px] font-medium text-gray-700 hover:border-[#FF5A36] hover:text-[#9F2D18]"
                                  >
                                    {listedArea}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <button type="button" onClick={useCurrentLocation} disabled={loading ||
            locating} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white/15 px-3.5 py-2.5 text-[11px] font-bold text-white backdrop-blur transition hover:bg-white/20 disabled:opacity-60">

                    {locating ? (<Loader2 className="h-4 w-4 animate-spin"/>) : (<Navigation className="h-4 w-4"/>)}

                    {locating
            ? "Finding you..."
            : "Use my current location"}

                  </button>

                </section>

                {/* RESULTS */}

                <section className="mt-5">

                  <div className="flex items-center justify-between gap-3">

                    <div>

                      <h2 className="text-lg font-bold text-[#17202A]">

                        {mode === "gps"
                          ? "Businesses near you"
                          : mode === "street"
                            ? `Businesses on or matching ${activeSearch}`
                            : mode === "area"
                              ? `Businesses around ${area.trim()}`
                              : "Nearby businesses"}

                      </h2>

                      <p className="mt-0.5 text-xs text-muted">
                        {loading
                          ? "Finding local businesses..."
                          : pagination.total > 0
                            ? `${pagination.total.toLocaleString()} ${pagination.total === 1 ? "business" : "businesses"} found`
                            : mode === "gps"
                              ? "No businesses were found around your current street or area"
                              : mode === "area"
                                ? "No businesses were found in this area"
                                : mode === "street"
                                  ? "No businesses were found on this street"
                                  : "Choose a street, area, or use your current location"}
                      </p>

                      {mode ===
            "gps" &&
            !loading &&
            (searchLocation.street ||
                searchLocation.area) && (<div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] text-[#9A928B]">

                            <MapPin className="h-3 w-3 shrink-0"/>

                            {searchLocation.street && (<span className="font-semibold text-[#6F665F]">

                                {searchLocation.street}

                              </span>)}

                            {searchLocation.street &&
                searchLocation.area && (<span className="text-[#C6BDB5]">

                                  ·

                                </span>)}

                            {searchLocation.area && (<span>

                                {searchLocation.area}

                              </span>)}

                          </div>)}

                      {mode ===
            "gps" &&
            !loading &&
            businesses.length >
                0 && (<p className="mt-1 text-[10px] text-[#9A928B]">

                            Results are ranked by street first, then by distance within each ranking level.

                          </p>)}

                    </div>

                    {mode !==
            "none" && (<button type="button" onClick={() => router.push("/shop")} className="inline-flex items-center gap-1 text-[11px] font-bold text-[#9F2D18]">

                        Browse all

                        <ArrowRight className="h-3.5 w-3.5"/>

                      </button>)}

                  </div>

                  {warning && (
                    <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{warning}</span>
                    </div>
                  )}

                  {/* ERROR */}

                  {error && (<div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">

                      {error}

                    </div>)}

                  {/* LOADING */}

                  {loading && (<div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">

                      {[
                1,
                2,
                3,
                4,
            ].map((item) => (<div key={item} className="h-[240px] animate-pulse rounded-xl border border-[#E8E4DE] bg-white"/>))}

                    </div>)}

                  {/* EMPTY RESULT */}

                  {!loading &&
            !error &&
            businesses.length ===
                0 &&
            mode !==
                "none" && (<div className="mt-5 rounded-xl border border-[#E8E4DE] bg-white px-5 py-12 text-center">

                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFF1ED]">

                          {mode ===
                "gps" ? (<Navigation className="h-6 w-6 text-[#FF5A36]"/>) : (<Search className="h-6 w-6 text-[#FF5A36]"/>)}

                        </div>

                        <p className="mt-4 text-sm font-semibold text-gray-700">

                          {mode ===
                "gps"
                ? "No businesses found near you"
                : "No businesses found in this area"}

                        </p>

                        <p className="mx-auto mt-1 max-w-[360px] text-xs leading-5 text-gray-400">

                          {mode ===
                "gps"
                ? "We searched your current street first, then nearby streets and your wider area."
                : `We don't have businesses registered around ${area.trim()} yet. Try another area or browse all businesses.`}

                        </p>

                        <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">

                          <button type="button" onClick={() => {
                setMode("none");
                setBusinesses([]);
                setError("");
                setSearchLocation({
                    street: null,
                    area: null,
                });
            }} className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#FF5A36] px-4 py-2.5 text-[11px] font-bold text-white">

                            Search another area

                            <Search className="h-3.5 w-3.5"/>

                          </button>

                          <Link href="/shop" className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#E8E4DE] bg-white px-4 py-2.5 text-[11px] font-bold text-[#9F2D18]">

                            Browse all businesses

                            <ArrowRight className="h-3.5 w-3.5"/>

                          </Link>

                        </div>

                      </div>)}

                  {/* BUSINESS RESULTS */}

                  {!loading &&
            !error &&
            businesses.length >
                0 && (<div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">

                        {businesses.map((business) => {
                const category = business
                    .categories?.[0]
                    ?.category?.name ??
                    "Services";
                const saved = savedBusinessIds.has(business.id);
                const product = business
                    .products?.[0] ??
                    null;
                const productImage = product
                    ? getProductImage(product)
                    : null;
                const distanceLabel = getDistanceLabel(business.distanceKm);
                const rankingLabel = mode ===
                    "gps"
                    ? getRankingLabel(business.rankingLabel)
                    : null;
                const street = business
                    .location
                    ?.street ??
                    null;
                return (<article key={business.id} className="overflow-hidden rounded-xl border border-[#E8E4DE] bg-white transition hover:-translate-y-0.5 hover:shadow-md">

                                <Link href={`/seller/${business.id}`} className="relative flex h-[110px] items-center justify-center overflow-hidden bg-[#FFE0D6]">

                                  {business.imageUrl ? (<img src={business.imageUrl} alt={business.name} className="absolute inset-0 h-full w-full object-cover"/>) : (<div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/80">

                                      <Store className="h-7 w-7 text-gray-700"/>

                                    </div>)}

                                  {rankingLabel !==
                        null && (<span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[9px] font-bold text-[#9F2D18] shadow-sm">

                                      {rankingLabel}

                                    </span>)}

                                  {distanceLabel !==
                        null && (<span title="Straight-line distance from your current location" className={`absolute ${rankingLabel !==
                            null
                            ? "left-3 top-10"
                            : "left-3 top-3"} rounded-full bg-white/90 px-2.5 py-1 text-[9px] font-bold text-[#9F2D18] shadow-sm`}>

                                      {distanceLabel}

                                    </span>)}

                                  <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[9px] font-semibold ${getBusinessAvailabilityClass(business.availability)}`}>
                                    {getBusinessAvailabilityLabel(business.availability)}
                                  </span>

                                </Link>

                                <div className="p-3.5">

                                  <div className="flex items-start justify-between gap-2">

                                    <div className="min-w-0">

                                      <Link href={`/seller/${business.id}`} className="truncate text-sm font-bold text-[#17202A] hover:text-[#9F2D18]">

                                        {business.name}

                                      </Link>

                                      <p className="mt-1 flex items-center gap-1 text-[10px] text-muted">

                                        <span>

                                          {category}

                                        </span>

                                        <span>

                                          ·

                                        </span>

                                        <span className="flex min-w-0 items-center gap-1 truncate">

                                          <MapPin className="h-3 w-3 shrink-0"/>

                                          {street ??
                        business.area}

                                        </span>

                                      </p>

                                      {street &&
                        business.area &&
                        street.trim()
                            .toLowerCase() !==
                            business.area
                                .trim()
                                .toLowerCase() && (<p className="mt-1 truncate pl-4 text-[10px] text-gray-400">

                                            {business.area}

                                          </p>)}

                                    </div>

                                    <button type="button" aria-label={saved
                        ? `Remove ${business.name} from saved businesses`
                        : `Save ${business.name}`} aria-pressed={saved} onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        toggleSaved(business);
                    }} className={`shrink-0 ${saved
                        ? "text-[#9F2D18]"
                        : "text-gray-500"}`}>

                                      <Bookmark className="h-4 w-4" fill={saved
                        ? "currentColor"
                        : "none"}/>

                                    </button>

                                  </div>

                                  {product && (<div className="mt-3 flex items-center gap-2.5 border-t border-[#F0ECE6] pt-3">

                                      {productImage ? (<img src={productImage} alt={product.name} className="h-10 w-10 rounded-lg object-cover"/>) : (<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#FCFAF6] text-gray-400">

                                          <Package className="h-4 w-4"/>

                                        </div>)}

                                      <div className="min-w-0">

                                        <p className="truncate text-[10px] font-semibold text-gray-600">

                                          {product.name}

                                        </p>

                                        <p className="mt-1 text-[10px] text-gray-400">

                                          {formatPrice(product)}

                                        </p>

                                      </div>

                                    </div>)}

                                  <Link href={`/seller/${business.id}`} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#FFF1ED] py-2.5 text-[11px] font-bold text-[#9F2D18]">

                                    Browse

                                    <ArrowRight className="h-3.5 w-3.5"/>

                                  </Link>

                                </div>

                              </article>);
            })}

                      </div>)}

                  {!loading && !warning && pagination.totalPages > 1 && (
                    <nav aria-label="Business results pagination" className="mt-6 flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => goToPage(pagination.page - 1)}
                        disabled={!pagination.hasPreviousPage || loading}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#E8E4DE] bg-white px-3 py-2 text-xs font-semibold text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronLeft className="h-4 w-4" /> Previous
                      </button>
                      <span className="text-xs text-gray-600" aria-live="polite">
                        Page {pagination.page} of {pagination.totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => goToPage(pagination.page + 1)}
                        disabled={!pagination.hasNextPage || loading}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#E8E4DE] bg-white px-3 py-2 text-xs font-semibold text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Next <ChevronRight className="h-4 w-4" />
                      </button>
                    </nav>
                  )}

                  {/* INITIAL STATE */}

                  {mode ===
            "none" &&
            !loading &&
            !error &&
            !warning && (<div className="mt-5 rounded-xl border border-[#E8E4DE] bg-white px-5 py-12 text-center">

                        <MapPin className="mx-auto h-8 w-8 text-gray-300"/>

                        <p className="mt-3 text-sm font-semibold text-gray-700">

                          Tell us where you are

                        </p>

                        <p className="mt-1 text-xs leading-5 text-gray-400">

                          Enter a street or area, or use your current location to discover local businesses.

                        </p>

                      </div>)}

                </section>

                {/* FOOTER */}

                <footer className="mt-7 flex items-center justify-center gap-3 text-[10px] text-gray-400">

                  <span className="h-px w-16 bg-gray-200"/>

                  <span>

                    ReMarket · Find it nearby

                  </span>

                  <span className="h-px w-16 bg-gray-200"/>

                </footer>

              </div>

            </div>

          </div>

          {/* MOBILE NAV */}

          <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white/95 px-2 pb-[max(6px,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur lg:hidden">

            <div className="grid w-full grid-cols-4">

              {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (<button key={item.label} type="button" onClick={() => router.push(item.href)} className="flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-gray-500">

                      <Icon className="h-[19px] w-[19px]"/>

                      <span className="text-[9px] font-medium">

                        {item.label}

                      </span>

                    </button>);
        })}

            </div>

          </nav>

        </div>

      </div>

    </main>);
}
