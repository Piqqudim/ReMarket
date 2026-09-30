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
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  ExternalLink,
  Loader2,
  MapPin,
  Navigation,
  Package,
  RotateCcw,
  Save,
  Store,
  Trash2,
  X,
} from "lucide-react";

import ImageUpload from "@/components/ImageUpload";

import {
  DEFAULT_CATEGORIES,
  mergeCategories,
  type ApiCategory,
  type ReMarketCategory,
} from "@/lib/categories";

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
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  availability:
    | "AVAILABLE"
    | "ASK_SELLER"
    | "UNAVAILABLE";
  imageUrl: string | null;
  images: ProductImage[];
  deletedAt: string | null;
  status:
    | "ACTIVE"
    | "INACTIVE"
    | "PENDING";
  category: Category | null;
};

type SocialPlatform =
  | "WHATSAPP"
  | "INSTAGRAM"
  | "TIKTOK"
  | "FACEBOOK"
  | "PHONE"
  | "DIRECTIONS";

type SocialLink = {
  id: string;
  platform: SocialPlatform;
  handle: string;
};

type Business = {
  id: string;
  name: string;
  ownerName: string | null;
  description: string | null;
  imageUrl: string | null;
  phone: string | null;

  priceMin: number | null;
  priceMax: number | null;

  availability:
    | "AVAILABLE"
    | "ASK_SELLER"
    | "UNAVAILABLE";

  status:
    | "ACTIVE"
    | "INACTIVE"
    | "PENDING";

  verification:
    | "VERIFIED"
    | "UNVERIFIED";

  onboardedAt: string;

  deletedAt: string | null;

  location: {
    id: string;
    area: string;
    address: string | null;
    lat: number | null;
    long: number | null;
    verification:
      | "VERIFIED"
      | "UNVERIFIED";
  } | null;

  categories: Category[];

  socialLinks: SocialLink[];

  products: Product[];
};

type AnalyticsMetric = {
  label: string;
  value: number;
};

/*
 * Controlled Lagos Region vocabulary.
 *
 * These are ReMarket-facing Region/locality values.
 * They are grouped by LGA for easier selection.
 *
 * The selected Region continues to be stored in
 * the existing Location.area field.
 *
 * No new Region database model is introduced.
 */
const LAGOS_REGION_GROUPS = [
  {
    lga: "Agege",
    regions: [
      "Agege",
      "Orile Agege",
      "Dopemu",
      "Oko-Oba",
      "Isale Odo",
      "Keke",
    ],
  },
  {
    lga: "Ajeromi-Ifelodun",
    regions: [
      "Ajegunle",
      "Tolu",
      "Olodi",
      "Alaba Oro",
      "Awodi-Ora",
      "Layeni",
    ],
  },
  {
    lga: "Alimosho",
    regions: [
      "Alimosho",
      "Egbeda",
      "Akowonjo",
      "Shasha",
      "Idimu",
      "Egbe",
      "Ikotun",
      "Ijegun",
      "Igando",
      "Iyana-Ipaja",
      "Ayobo",
      "Abule Egba",
      "Aboru",
      "Meiran",
      "Oke-Odo",
      "Pleasure",
    ],
  },
  {
    lga: "Amuwo-Odofin",
    regions: [
      "Amuwo",
      "Festac",
      "Mile 2",
      "Satellite Town",
      "Kirikiri",
      "Irede",
      "Ibeshe",
    ],
  },
  {
    lga: "Apapa",
    regions: [
      "Apapa",
      "Apapa Wharf",
      "Iganmu",
      "Ijora",
      "Liverpool",
      "Tin Can",
    ],
  },
  {
    lga: "Badagry",
    regions: [
      "Badagry",
      "Badagry West",
      "Olorunda",
      "Oko-Afo",
    ],
  },
  {
    lga: "Epe",
    regions: [
      "Epe",
      "Eredo",
      "Ikosi-Ejinrin",
    ],
  },
  {
    lga: "Eti-Osa",
    regions: [
      "Ikoyi",
      "Obalende",
      "Victoria Island",
      "Oniru",
      "Lekki Phase 1",
      "Ikate",
      "Jakande",
      "Osapa London",
      "Agungi",
      "Igbo-Efon",
      "Idado",
      "Chevron",
      "Ikota",
      "VGC",
      "Ajah",
      "Badore",
      "Sangotedo",
    ],
  },
  {
    lga: "Ibeju-Lekki",
    regions: [
      "Ibeju-Lekki",
      "Abijo",
      "Awoyaya",
      "Lakowe",
      "Bogije",
      "Eleko",
      "Akodo",
    ],
  },
  {
    lga: "Ifako-Ijaiye",
    regions: [
      "Ifako",
      "Ijaiye",
      "Ojokoro",
      "Oke-Ira",
      "Agbado",
    ],
  },
  {
    lga: "Ikeja",
    regions: [
      "Ikeja",
      "Ikeja GRA",
      "Alausa",
      "Oregun",
      "Opebi",
      "Ogba",
      "Ojodu",
      "Onigbongbo",
      "Computer Village",
    ],
  },
  {
    lga: "Ikorodu",
    regions: [
      "Ikorodu",
      "Ikorodu North",
      "Ikorodu West",
      "Igbogbo",
      "Baiyeku",
      "Ijede",
      "Imota",
      "Odogunyan",
      "Itamaga",
      "Agric",
    ],
  },
  {
    lga: "Kosofe",
    regions: [
      "Kosofe",
      "Ketu",
      "Agboyi",
      "Ojota",
      "Gbagada",
      "Anthony",
      "Maryland",
      "Magodo",
      "Isheri",
      "Mile 12",
    ],
  },
  {
    lga: "Lagos Island",
    regions: [
      "Lagos Island",
      "Idumota",
      "Balogun",
      "Marina",
      "Isale Eko",
      "Lafiaji",
      "Onikan",
      "Epetedo",
      "Okepopo",
    ],
  },
  {
    lga: "Lagos Mainland",
    regions: [
      "Yaba",
      "Ebute Metta",
      "Akoka",
      "Sabo",
      "Alagomeji",
      "Adekunle",
      "Abule Oja",
      "Onike",
      "Iwaya",
      "Makoko",
      "Jibowu",
      "Oyingbo",
      "Tejuosho",
    ],
  },
  {
    lga: "Mushin",
    regions: [
      "Mushin",
      "Papa Ajao",
      "Idi-Araba",
      "Ilupeju",
      "Odi-Olowo",
      "Ojuwoye",
    ],
  },
  {
    lga: "Ojo",
    regions: [
      "Ojo",
      "Iba",
      "Iyana-Iba",
      "Ajangbadi",
      "Oto-Awori",
      "Alaba",
      "Mosafejo",
    ],
  },
  {
    lga: "Oshodi-Isolo",
    regions: [
      "Oshodi",
      "Isolo",
      "Ejigbo",
      "Okota",
      "Ajao Estate",
      "Mafoluku",
      "Ago Palace",
    ],
  },
  {
    lga: "Shomolu",
    regions: [
      "Shomolu",
      "Bariga",
      "Pedro",
      "Onipanu",
      "Palmgrove",
      "Fadeyi",
    ],
  },
  {
    lga: "Surulere",
    regions: [
      "Surulere",
      "Ojuelegba",
      "Lawanson",
      "Itire",
      "Aguda",
      "Coker",
      "Ijeshatedo",
    ],
  },
] as const;

const DEFAULT_COUNTRY = "Nigeria";

function isKnownLagosRegion(
  region: string
): boolean {
  const normalized =
    region.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return LAGOS_REGION_GROUPS.some(
    (group) =>
      group.regions.some(
        (item) =>
          item.toLowerCase() ===
          normalized
      )
  );
}

function parseLocationAddress(
  address: string | null | undefined,
  region: string
): {
  houseNumber: string;
  street: string;
  city: string;
} {
  const fallback = {
    houseNumber: "",
    street: "",
    city: "Lagos",
  };

  const trimmedAddress =
    typeof address === "string"
      ? address.trim()
      : "";

  if (!trimmedAddress) {
    return fallback;
  }

  const parts =
    trimmedAddress
      .split(",")
      .map(
        (part) =>
          part.trim()
      )
      .filter(Boolean);

  if (parts.length === 0) {
    return fallback;
  }

  const withoutCountry =
    parts[
      parts.length - 1
    ].toLowerCase() ===
    DEFAULT_COUNTRY.toLowerCase()
      ? parts.slice(0, -1)
      : parts;

  const normalizedRegion =
    region.trim().toLowerCase();

  const regionIndex =
    normalizedRegion
      ? withoutCountry.findLastIndex(
          (part) =>
            part.toLowerCase() ===
            normalizedRegion
        )
      : -1;

  if (regionIndex >= 0) {
    const beforeRegion =
      withoutCountry.slice(
        0,
        regionIndex
      );

    const afterRegion =
      withoutCountry.slice(
        regionIndex + 1
      );

    if (afterRegion.length > 0) {
      const working = [
        ...beforeRegion,
      ];

      const street =
        working.pop() ??
        "";

      return {
        houseNumber:
          working.join(", "),
        street,
        city:
          afterRegion[0] ||
          "Lagos",
      };
    }

    const working = [
      ...beforeRegion,
    ];

    const city =
      working.pop() ||
      "Lagos";

    const street =
      working.pop() ||
      "";

    return {
      houseNumber:
        working.join(", "),
      street,
      city,
    };
  }

  /*
   * Legacy/unknown address format:
   * preserve the complete saved address
   * rather than dropping it.
   */
  return {
    houseNumber: "",
    street:
      withoutCountry.join(
        ", "
      ),
    city: "Lagos",
  };
}

const SOCIAL_PLATFORMS: {
  value: SocialPlatform;
  label: string;
}[] = [
  {
    value: "WHATSAPP",
    label: "WhatsApp",
  },
  {
    value: "INSTAGRAM",
    label: "Instagram",
  },
  {
    value: "TIKTOK",
    label: "TikTok",
  },
  {
    value: "FACEBOOK",
    label: "Facebook",
  },
  {
    value: "PHONE",
    label: "Phone",
  },
  {
    value: "DIRECTIONS",
    label: "Directions",
  },
];

function getLocationStatus(
  location: Business["location"]
): string {
  if (!location) {
    return "No business location has been saved yet.";
  }

  const hasExactCoordinates =
    location.lat !== null &&
    location.long !== null;

  if (
    location.verification ===
      "VERIFIED" &&
    hasExactCoordinates
  ) {
    return "Exact business coordinates are saved and the location is verified.";
  }

  if (
    location.verification ===
    "VERIFIED"
  ) {
    return "Business location is verified, but exact coordinates have not been captured yet.";
  }

  if (hasExactCoordinates) {
    return "Exact business coordinates are saved, but the location is not yet verified.";
  }

  return "No exact business coordinates have been captured yet.";
}

function formatPrice(
  value: number | null
): string {
  if (value === null) {
    return "";
  }

  return String(value);
}

function getSocialValue(
  links: SocialLink[],
  platform: SocialPlatform
): string {
  return (
    links.find(
      (link) =>
        link.platform ===
        platform
    )?.handle ?? ""
  );
}

function prettifyMetricLabel(
  path: string[]
): string {
  const label =
    path[path.length - 1] ??
    "";

  const knownLabels: Record<
    string,
    string
  > = {
    views: "Views",
    viewCount: "Views",
    totalViews: "Total views",
    uniqueViews: "Unique views",
    uniqueVisitors:
      "Unique visitors",
    contacts: "Contacts",
    contactCount: "Contacts",
    totalContacts:
      "Total contacts",
    products: "Products",
    productCount: "Products",
    totalProducts:
      "Total products",
    activeProducts:
      "Active products",
    deletedProducts:
      "Deleted products",
    matches: "Matches",
    matchCount: "Matches",
    totalMatches:
      "Total matches",
    requests: "Requests",
    requestCount: "Requests",
    matchedRequests:
      "Matched requests",
    WHATSAPP: "WhatsApp",
    PHONE: "Phone",
    INSTAGRAM: "Instagram",
    TIKTOK: "TikTok",
    FACEBOOK: "Facebook",
    DIRECTIONS: "Directions",
  };

  if (
    knownLabels[label]
  ) {
    return knownLabels[label];
  }

  return label
    .replace(
      /([a-z])([A-Z])/g,
      "$1 $2"
    )
    .replace(
      /[_-]+/g,
      " "
    )
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase()
    );
}

function isAnalyticsMetricKey(
  key: string
): boolean {
  return /count|total|views?|contacts?|products?|matches?|requests?|visitors?|active|deleted|whatsapp|phone|instagram|tiktok|facebook|directions/i.test(
    key
  );
}

function shouldSkipAnalyticsKey(
  key: string
): boolean {
  return (
    key === "id" ||
    key.endsWith("Id") ||
    key === "businessId" ||
    key === "requestId" ||
    key === "productId" ||
    key === "createdAt" ||
    key === "updatedAt" ||
    key === "deletedAt" ||
    key === "lat" ||
    key === "long" ||
    key === "latitude" ||
    key === "longitude" ||
    key === "price" ||
    key === "priceMin" ||
    key === "priceMax" ||
    key === "score"
  );
}

function collectAnalyticsMetrics(
  value: unknown,
  path: string[] = [],
  output: AnalyticsMetric[] = []
): AnalyticsMetric[] {
  if (
    typeof value !== "object" ||
    value === null
  ) {
    return output;
  }

  if (Array.isArray(value)) {
    return output;
  }

  const record =
    value as Record<
      string,
      unknown
    >;

  for (const [
    key,
    nestedValue,
  ] of Object.entries(record)) {
    if (
      shouldSkipAnalyticsKey(
        key
      )
    ) {
      continue;
    }

    const nextPath = [
      ...path,
      key,
    ];

    if (
      typeof nestedValue ===
        "number" &&
      Number.isFinite(
        nestedValue
      ) &&
      isAnalyticsMetricKey(
        key
      )
    ) {
      output.push({
        label:
          prettifyMetricLabel(
            nextPath
          ),
        value:
          nestedValue,
      });

      continue;
    }

    if (
      typeof nestedValue ===
        "object" &&
      nestedValue !== null
    ) {
      collectAnalyticsMetrics(
        nestedValue,
        nextPath,
        output
      );
    }
  }

  return output;
}

function dedupeAnalyticsMetrics(
  metrics: AnalyticsMetric[]
): AnalyticsMetric[] {
  const seen =
    new Set<string>();

  return metrics.filter(
    (metric) => {
      const key =
        `${metric.label}:${metric.value}`;

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);

      return true;
    }
  );
}

function AnalyticsMetricCard({
  metric,
}: {
  metric: AnalyticsMetric;
}) {
  return (
    <div className="rounded-2xl border border-[#E8DED3] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#9F2D18]">
          <BarChart3 className="h-5 w-5" />
        </div>

        <p className="text-2xl font-semibold tracking-tight text-[#2E241F]">
          {metric.value.toLocaleString(
            "en-NG"
          )}
        </p>
      </div>

      <p className="mt-4 text-sm font-medium text-[#6F675F]">
        {metric.label}
      </p>
    </div>
  );
}

export default function BusinessDetailsPage() {
  const params =
    useParams<{
      id: string;
    }>();

  const router = useRouter();

  const businessId =
    params.id;

  const [business, setBusiness] =
    useState<Business | null>(
      null
    );

  const [
    categories,
    setCategories,
  ] = useState<
    ReMarketCategory[]
  >(DEFAULT_CATEGORIES);

  const [
    usingCategoryFallback,
    setUsingCategoryFallback,
  ] = useState(true);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [deleting, setDeleting] =
    useState(false);

  const [restoring, setRestoring] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [
    showDeleteConfirmation,
    setShowDeleteConfirmation,
  ] = useState(false);

  const [
    analytics,
    setAnalytics,
  ] = useState<unknown>(null);

  const [
    analyticsLoading,
    setAnalyticsLoading,
  ] = useState(true);

  const [
    analyticsError,
    setAnalyticsError,
  ] = useState("");

  const analyticsMetrics =
    useMemo(
      () =>
        dedupeAnalyticsMetrics(
          collectAnalyticsMetrics(
            analytics
          )
        ),
      [analytics]
    );

  async function loadBusiness() {
    if (!businessId) {
      return;
    }

    try {
      setLoading(true);
      setError("");

      const [
        businessResponse,
        categoriesResponse,
      ] = await Promise.all([
        fetch(
          `/api/admin/businesses/${businessId}`,
          {
            cache: "no-store",
          }
        ),
        fetch(
          "/api/categories",
          {
            cache: "no-store",
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

      setBusiness(
        businessData.business ??
          null
      );

      const backendCategories =
        categoriesResponse.ok &&
        Array.isArray(
          categoriesData.categories
        )
          ? (
              categoriesData.categories as ApiCategory[]
            )
          : [];

      const mergedCategories =
        mergeCategories(
          backendCategories
        );

      if (
        mergedCategories.length >
        0
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
      }
    } catch (loadError) {
      console.error(
        "Business details load error:",
        loadError
      );

      setError(
        loadError instanceof
          Error
          ? loadError.message
          : "Unable to load business."
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadAnalytics() {
    if (!businessId) {
      return;
    }

    try {
      setAnalyticsLoading(
        true
      );
      setAnalyticsError("");

      const response =
        await fetch(
          `/api/admin/businesses/${businessId}/analytics`,
          {
            cache: "no-store",
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data?.error ===
            "string"
            ? data.error
            : "Unable to load business analytics."
        );
      }

      setAnalytics(data);
    } catch (
      analyticsLoadError
    ) {
      console.error(
        "Business analytics load error:",
        analyticsLoadError
      );

      setAnalytics(null);

      setAnalyticsError(
        analyticsLoadError instanceof
          Error
          ? analyticsLoadError.message
          : "Unable to load business analytics."
      );
    } finally {
      setAnalyticsLoading(
        false
      );
    }
  }

  useEffect(() => {
    void loadBusiness();
  }, [businessId]);

  useEffect(() => {
    void loadAnalytics();
  }, [businessId]);

  async function deleteBusiness() {
    if (!business) {
      return;
    }

    try {
      setDeleting(true);
      setError("");
      setSuccess("");

      const response =
        await fetch(
          `/api/admin/businesses/${business.id}`,
          {
            method: "DELETE",
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data?.error ===
            "string"
            ? data.error
            : "Unable to delete business."
        );
      }

      setBusiness(
        (current) =>
          current
            ? {
                ...current,
                deletedAt:
                  data.business
                    ?.deletedAt ??
                  new Date().toISOString(),
              }
            : current
      );

      setShowDeleteConfirmation(
        false
      );

      setSuccess(
        `${business.name} was moved to deleted businesses.`
      );
    } catch (deleteError) {
      console.error(
        "Business delete error:",
        deleteError
      );

      setError(
        deleteError instanceof
          Error
          ? deleteError.message
          : "Unable to delete business."
      );
    } finally {
      setDeleting(false);
    }
  }

  async function restoreBusiness() {
    if (!business) {
      return;
    }

    try {
      setRestoring(true);
      setError("");
      setSuccess("");

      const response =
        await fetch(
          `/api/admin/businesses/${business.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              restore: true,
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
            : "Unable to restore business."
        );
      }

      setBusiness(
        (current) =>
          current
            ? {
                ...current,
                ...(data.business ??
                  {}),
                deletedAt: null,
              }
            : current
      );

      setSuccess(
        `${business.name} was restored successfully.`
      );

      void loadAnalytics();
    } catch (restoreError) {
      console.error(
        "Business restore error:",
        restoreError
      );

      setError(
        restoreError instanceof
          Error
          ? restoreError.message
          : "Unable to restore business."
      );
    } finally {
      setRestoring(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#FFF7ED] p-4 sm:p-6">
        <div className="mx-auto flex min-h-[70vh] max-w-[1100px] items-center justify-center">
          <div className="flex items-center gap-2 text-xs text-[#8A8178]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading business...
          </div>
        </div>
      </main>
    );
  }

  if (!business) {
    return (
      <main className="min-h-screen bg-[#FFF7ED] p-4 sm:p-6">
        <div className="mx-auto max-w-[1100px]">
          <Link
            href="/admin/businesses"
            className="inline-flex items-center gap-2 rounded-xl px-1 py-2 text-xs font-semibold text-[#6F675F] transition hover:text-[#9F2D18]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to businesses
          </Link>

          <div className="mt-6 rounded-[22px] border border-[#EAE6DF] bg-[#FFFDFC] px-6 py-12 text-center">
            <Store className="mx-auto h-8 w-8 text-[#CFC8C0]" />

            <p className="mt-3 text-sm font-bold text-[#17202A]">
              Business not found
            </p>

            {error && (
              <p className="mt-1 text-xs text-[#8A8178]">
                {error}
              </p>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      <BusinessEditor
        key={`${business.id}-${business.deletedAt ?? "active"}`}
        business={business}
        categories={categories}
        usingCategoryFallback={
          usingCategoryFallback
        }
        saving={saving}
        setSaving={setSaving}
        error={error}
        setError={setError}
        success={success}
        setSuccess={setSuccess}
        router={router}
        deleting={deleting}
        restoring={restoring}
        onDelete={() =>
          setShowDeleteConfirmation(
            true
          )
        }
        onRestore={() => {
          void restoreBusiness();
        }}
      />

      <section className="min-h-screen bg-[#FFF7ED] px-4 pb-10 sm:px-6">
        <div className="mx-auto max-w-[1100px]">
          <BusinessAnalyticsSection
            businessName={
              business.name
            }
            loading={
              analyticsLoading
            }
            error={
              analyticsError
            }
            metrics={
              analyticsMetrics
            }
            onRetry={() => {
              void loadAnalytics();
            }}
          />
        </div>
      </section>

      {showDeleteConfirmation && (
        <DeleteConfirmationModal
          business={business}
          loading={deleting}
          onCancel={() =>
            setShowDeleteConfirmation(
              false
            )
          }
          onConfirm={() => {
            void deleteBusiness();
          }}
        />
      )}
    </>
  );
}

function BusinessAnalyticsSection({
  businessName,
  loading,
  error,
  metrics,
  onRetry,
}: {
  businessName: string;
  loading: boolean;
  error: string;
  metrics: AnalyticsMetric[];
  onRetry: () => void;
}) {
  return (
    <section className="rounded-[22px] border border-[#EAE6DF] bg-[#FFFDFC] p-5 shadow-sm sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[#9F2D18]" />

            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#A39A91]">
              Business analytics
            </p>
          </div>

          <h2 className="mt-1 text-lg font-bold text-[#17202A]">
            {businessName}
          </h2>

          <p className="mt-1 text-xs leading-5 text-[#7E766F]">
            Basic business visibility,
            contact, product, and matching
            activity.
          </p>
        </div>

        {!loading && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-3.5 py-2.5 text-[11px] font-bold text-[#6F675F] transition hover:border-[#FFB49F] hover:bg-[#FCFAF6]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Refresh analytics
          </button>
        )}
      </div>

      {loading && (
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map(
            (item) => (
              <div
                key={item}
                className="h-32 animate-pulse rounded-2xl border border-[#E8DED3] bg-white"
              />
            )
          )}
        </div>
      )}

      {!loading && error && (
        <div className="mt-5 rounded-2xl border border-[#F1C5BF] bg-[#FFF4F2] px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-medium text-[#B42318]">
              {error}
            </p>

            <button
              type="button"
              onClick={onRetry}
              className="rounded-xl bg-[#FF5A36] px-3.5 py-2 text-[10px] font-bold text-white"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {!loading &&
        !error &&
        metrics.length === 0 && (
          <div className="mt-5 rounded-2xl border border-[#EAE6DF] bg-white px-5 py-10 text-center">
            <BarChart3 className="mx-auto h-8 w-8 text-[#CFC8C0]" />

            <p className="mt-3 text-sm font-semibold text-[#6F675F]">
              No analytics recorded yet
            </p>

            <p className="mt-1 text-xs leading-5 text-[#A39A91]">
              Business activity will appear
              here as ReMarket records views,
              contacts, products, and matching
              activity.
            </p>
          </div>
        )}

      {!loading &&
        !error &&
        metrics.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {metrics.map(
              (
                metric,
                index
              ) => (
                <AnalyticsMetricCard
                  key={`${metric.label}-${metric.value}-${index}`}
                  metric={metric}
                />
              )
            )}
          </div>
        )}
    </section>
  );
}

type BusinessEditorProps = {
  business: Business;
  categories: ReMarketCategory[];
  usingCategoryFallback: boolean;
  saving: boolean;
  setSaving: (
    value: boolean
  ) => void;
  error: string;
  setError: (
    value: string
  ) => void;
  success: string;
  setSuccess: (
    value: string
  ) => void;
  router: ReturnType<
    typeof useRouter
  >;
  deleting: boolean;
  restoring: boolean;
  onDelete: () => void;
  onRestore: () => void;
};

function BusinessEditor({
  business,
  categories,
  usingCategoryFallback,
  saving,
  setSaving,
  error,
  setError,
  success,
  setSuccess,
  router,
  deleting,
  restoring,
  onDelete,
  onRestore,
}: BusinessEditorProps) {
  const deleted =
    Boolean(business.deletedAt);

  const [name, setName] =
    useState(business.name);

  const [
    ownerName,
    setOwnerName,
  ] = useState(
    business.ownerName ?? ""
  );

  const [
    description,
    setDescription,
  ] = useState(
    business.description ?? ""
  );

  const [phone, setPhone] =
    useState(
      business.phone ?? ""
    );

  const [
    imageUrl,
    setImageUrl,
  ] = useState(
    business.imageUrl ?? ""
  );

  const initialAddress =
    parseLocationAddress(
      business.location?.address,
      business.location?.area ??
        ""
    );

  const [
    houseNumber,
    setHouseNumber,
  ] = useState(
    initialAddress.houseNumber
  );

  const [
    street,
    setStreet,
  ] = useState(
    initialAddress.street
  );

  const [city, setCity] =
    useState(
      initialAddress.city
    );

  /*
   * UI terminology is Region.
   *
   * The existing database/API value remains
   * Location.area.
   */
  const [region, setRegion] =
    useState(
      business.location?.area ??
        ""
    );

  /*
   * Coordinates are kept internally.
   * The admin does not type them manually.
   */
  const [lat, setLat] =
    useState(
      business.location?.lat ==
        null
        ? ""
        : String(
            business.location.lat
          )
    );

  const [long, setLong] =
    useState(
      business.location?.long ==
        null
        ? ""
        : String(
            business.location.long
          )
    );

  const [
    locationStatus,
    setLocationStatus,
  ] = useState(
    getLocationStatus(
      business.location
    )
  );

  const [
    locationVerification,
    setLocationVerification,
  ] = useState<
    "VERIFIED" | "UNVERIFIED"
  >(
    business.location?.verification ??
      "UNVERIFIED"
  );

  const [
    capturingLocation,
    setCapturingLocation,
  ] = useState(false);

  const [
    priceMin,
    setPriceMin,
  ] = useState(
    formatPrice(
      business.priceMin
    )
  );

  const [
    priceMax,
    setPriceMax,
  ] = useState(
    formatPrice(
      business.priceMax
    )
  );

  const [
    availability,
    setAvailability,
  ] = useState<
    | "AVAILABLE"
    | "ASK_SELLER"
    | "UNAVAILABLE"
  >(business.availability);

  const [status, setStatus] =
    useState<
      | "ACTIVE"
      | "INACTIVE"
      | "PENDING"
    >(business.status);

  const [
    verification,
    setVerification,
  ] = useState<
    | "VERIFIED"
    | "UNVERIFIED"
  >(business.verification);

  const [
    selectedCategoryIds,
    setSelectedCategoryIds,
  ] = useState<string[]>(
    business.categories.map(
      (category) =>
        category.id
    )
  );

  const [
    socialValues,
    setSocialValues,
  ] = useState<
    Record<
      SocialPlatform,
      string
    >
  >({
    WHATSAPP:
      getSocialValue(
        business.socialLinks,
        "WHATSAPP"
      ),
    INSTAGRAM:
      getSocialValue(
        business.socialLinks,
        "INSTAGRAM"
      ),
    TIKTOK:
      getSocialValue(
        business.socialLinks,
        "TIKTOK"
      ),
    FACEBOOK:
      getSocialValue(
        business.socialLinks,
        "FACEBOOK"
      ),
    PHONE:
      getSocialValue(
        business.socialLinks,
        "PHONE"
      ),
    DIRECTIONS:
      getSocialValue(
        business.socialLinks,
        "DIRECTIONS"
      ),
  });

  function captureCurrentLocation() {
    if (
      typeof navigator ===
        "undefined" ||
      !navigator.geolocation
    ) {
      setError(
        "Location is not supported by this browser."
      );

      return;
    }

    if (deleted) {
      return;
    }

    setCapturingLocation(
      true
    );

    setError("");

    setLocationStatus(
      "Capturing business location..."
    );

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude =
          position.coords.latitude;

        const longitude =
          position.coords.longitude;

        if (
          !Number.isFinite(
            latitude
          ) ||
          !Number.isFinite(
            longitude
          )
        ) {
          setLocationStatus(
            "Unable to capture a valid business location."
          );

          setCapturingLocation(
            false
          );

          return;
        }

        setLat(
          String(latitude)
        );

        setLong(
          String(longitude)
        );

        setLocationVerification(
          "UNVERIFIED"
        );

        setLocationStatus(
          "Business location captured successfully. Save the changes to store this new location as unverified."
        );

        setCapturingLocation(
          false
        );
      },

      (locationError) => {
        console.error(
          "Business location capture error:",
          locationError
        );

        setLocationStatus(
          "Location permission was not granted or the location could not be determined."
        );

        setError(
          "Allow location access to capture the business location."
        );

        setCapturingLocation(
          false
        );
      },

      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      }
    );
  }

  function toggleCategory(
    categoryId: string
  ) {
    if (
      usingCategoryFallback ||
      deleted
    ) {
      return;
    }

    setSelectedCategoryIds(
      (current) =>
        current.includes(
          categoryId
        )
          ? current.filter(
              (id) =>
                id !==
                categoryId
            )
          : [
              ...current,
              categoryId,
            ]
    );
  }

  function updateSocial(
    platform: SocialPlatform,
    value: string
  ) {
    if (deleted) {
      return;
    }

    setSocialValues(
      (current) => ({
        ...current,
        [platform]: value,
      })
    );
  }

  async function submit(
    event: React.SubmitEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setSaving(true);
    setError("");
    setSuccess("");

    const trimmedName =
      name.trim();

    const trimmedRegion =
      region.trim();

    const trimmedHouseNumber =
      houseNumber.trim();

    const trimmedStreet =
      street.trim();

    const trimmedCity =
      city.trim();

    /*
     * Canonical ReMarket address order:
     *
     * shop/house number,
     * street,
     * region,
     * city,
     * country
     */
    const composedAddress =
      [
        trimmedHouseNumber,
        trimmedStreet,
        trimmedRegion,
        trimmedCity,
        DEFAULT_COUNTRY,
      ]
        .filter(Boolean)
        .join(", ");

    if (!trimmedName) {
      setError(
        "Business name is required."
      );

      setSaving(false);

      return;
    }

    if (!trimmedRegion) {
      setError(
        "Business Region is required."
      );

      setSaving(false);

      return;
    }

    if (!trimmedStreet) {
      setError(
        "Street, road, or close is required."
      );

      setSaving(false);

      return;
    }

    if (!trimmedCity) {
      setError(
        "City is required."
      );

      setSaving(false);

      return;
    }

    if (!composedAddress) {
      setError(
        "A business address is required."
      );

      setSaving(false);

      return;
    }

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

    const parsedLat =
      lat.trim()
        ? Number(
            lat.trim()
          )
        : null;

    const parsedLong =
      long.trim()
        ? Number(
            long.trim()
          )
        : null;

    if (
      (parsedLat === null) !==
      (parsedLong === null)
    ) {
      setError(
        "Business coordinates must be provided as a complete location pair."
      );

      setSaving(false);

      return;
    }

    if (
      parsedPriceMin !==
        null &&
      !Number.isInteger(
        parsedPriceMin
      )
    ) {
      setError(
        "Minimum price must be a valid integer."
      );

      setSaving(false);

      return;
    }

    if (
      parsedPriceMax !==
        null &&
      !Number.isInteger(
        parsedPriceMax
      )
    ) {
      setError(
        "Maximum price must be a valid integer."
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

    if (
      parsedLat !==
        null &&
      (
        !Number.isFinite(
          parsedLat
        ) ||
        parsedLat < -90 ||
        parsedLat > 90
      )
    ) {
      setError(
        "Saved business latitude is invalid."
      );

      setSaving(false);

      return;
    }

    if (
      parsedLong !==
        null &&
      (
        !Number.isFinite(
          parsedLong
        ) ||
        parsedLong < -180 ||
        parsedLong > 180
      )
    ) {
      setError(
        "Saved business longitude is invalid."
      );

      setSaving(false);

      return;
    }

    const socialLinks =
      SOCIAL_PLATFORMS
        .map(
          ({
            value,
          }) => ({
            platform:
              value,
            handle:
              socialValues[
                value
              ].trim(),
          })
        )
        .filter(
          (item) =>
            item.handle
        );

    try {
      const response =
        await fetch(
          `/api/admin/businesses/${business.id}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              name:
                trimmedName,

              ownerName:
                ownerName.trim() ||
                null,

              description:
                description.trim() ||
                null,

              phone:
                phone.trim() ||
                null,

              imageUrl:
                imageUrl.trim() ||
                null,

              /*
               * IMPORTANT:
               *
               * UI uses `region`.
               * Existing API/database use `area`.
               */
              area:
                trimmedRegion,

              address:
                composedAddress,

              lat:
                parsedLat,

              long:
                parsedLong,

              priceMin:
                parsedPriceMin,

              priceMax:
                parsedPriceMax,

              availability,

              status,

              verification,

              locationVerification,

              categoryIds:
                usingCategoryFallback
                  ? business.categories.map(
                      (category) =>
                        category.id
                    )
                  : selectedCategoryIds,

              socialLinks,
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
            : "Unable to update business."
        );
      }

      const updatedBusiness =
        data.business as
          | Business
          | undefined;

      if (
        updatedBusiness
      ) {
        setName(
          updatedBusiness.name
        );

        setOwnerName(
          updatedBusiness.ownerName ??
            ""
        );

        setDescription(
          updatedBusiness.description ??
            ""
        );

        setPhone(
          updatedBusiness.phone ??
            ""
        );

        setImageUrl(
          updatedBusiness.imageUrl ??
            ""
        );

        const updatedAddress =
          parseLocationAddress(
            updatedBusiness
              .location
              ?.address,
            updatedBusiness
              .location
              ?.area ??
              ""
          );

        setHouseNumber(
          updatedAddress.houseNumber
        );

        setStreet(
          updatedAddress.street
        );

        setCity(
          updatedAddress.city
        );

        setRegion(
          updatedBusiness
            .location
            ?.area ?? ""
        );

        setLat(
          updatedBusiness
            .location
            ?.lat != null
            ? String(
                updatedBusiness
                  .location
                  .lat
              )
            : ""
        );

        setLong(
          updatedBusiness
            .location
            ?.long != null
            ? String(
                updatedBusiness
                  .location
                  .long
              )
            : ""
        );

        setAvailability(
          updatedBusiness
            .availability
        );

        setStatus(
          updatedBusiness
            .status
        );

        setVerification(
          updatedBusiness
            .verification
        );

        setLocationVerification(
          updatedBusiness
            .location
            ?.verification ??
            "UNVERIFIED"
        );

        setSelectedCategoryIds(
          updatedBusiness
            .categories
            .map(
              (category) =>
                category.id
            )
        );

        setSocialValues({
          WHATSAPP:
            getSocialValue(
              updatedBusiness
                .socialLinks,
              "WHATSAPP"
            ),

          INSTAGRAM:
            getSocialValue(
              updatedBusiness
                .socialLinks,
              "INSTAGRAM"
            ),

          TIKTOK:
            getSocialValue(
              updatedBusiness
                .socialLinks,
              "TIKTOK"
            ),

          FACEBOOK:
            getSocialValue(
              updatedBusiness
                .socialLinks,
              "FACEBOOK"
            ),

          PHONE:
            getSocialValue(
              updatedBusiness
                .socialLinks,
              "PHONE"
            ),

          DIRECTIONS:
            getSocialValue(
              updatedBusiness
                .socialLinks,
              "DIRECTIONS"
            ),
        });

        setLocationStatus(
          getLocationStatus(
            updatedBusiness
              .location
          )
        );
      }

      setSuccess(
        "Business changes saved successfully."
      );

      router.refresh();

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (submitError) {
      console.error(
        "Business update error:",
        submitError
      );

      setError(
        submitError instanceof
          Error
          ? submitError.message
          : "Unable to update business."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#FFF7ED] p-4 sm:p-6">
      <div className="mx-auto max-w-[1100px]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/admin/businesses"
            className="inline-flex items-center gap-2 rounded-xl px-1 py-2 text-xs font-semibold text-[#6F675F] transition hover:text-[#9F2D18]"
          >
            <ArrowLeft className="h-4 w-4" />

            Back to businesses
          </Link>

          <div className="flex flex-wrap gap-2">
            {!deleted && (
              <>
                <Link
                  href={`/seller/${business.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-4 py-2.5 text-xs font-bold text-[#6F675F] transition hover:border-[#FFB49F] hover:bg-[#FCFAF6]"
                >
                  <ExternalLink className="h-4 w-4" />

                  View public page
                </Link>

                <Link
                  href={`/admin/businesses/${business.id}/products/new`}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#E94F2D]"
                >
                  <Package className="h-4 w-4" />

                  Add product
                </Link>

                <button
                  type="button"
                  disabled={
                    saving ||
                    deleting ||
                    restoring
                  }
                  onClick={
                    onDelete
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-[#F2C7BC] bg-[#FFF5F2] px-4 py-2.5 text-xs font-bold text-[#9F2D18] transition hover:bg-[#FFE9E3] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />

                  {deleting
                    ? "Deleting..."
                    : "Delete business"}
                </button>
              </>
            )}

            {deleted && (
              <button
                type="button"
                disabled={
                  restoring ||
                  saving ||
                  deleting
                }
                onClick={
                  onRestore
                }
                className="inline-flex items-center gap-2 rounded-xl bg-[#E7F7EF] px-4 py-2.5 text-xs font-bold text-[#287A4B] transition hover:bg-[#D8F1E3] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />

                {restoring
                  ? "Restoring..."
                  : "Restore business"}
              </button>
            )}
          </div>
        </div>

        {success && (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-[#BFE3CE] bg-[#EEF9F2] px-4 py-3">
            <p className="text-sm font-semibold text-[#287A4B]">
              {success}
            </p>

            <button
              type="button"
              onClick={() =>
                setSuccess("")
              }
              className="text-[#287A4B]"
              aria-label="Dismiss success message"
            >
              <X size={16} />
            </button>
          </div>
        )}

        <div className="mt-5 overflow-hidden rounded-[22px] border border-[#EAE6DF] bg-[#FFFDFC] shadow-sm">
          <div className="border-b border-[#EAE6DF] bg-white px-5 py-5 sm:px-6">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#FFE0D6]">
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={business.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Store className="h-7 w-7 text-[#9F2D18]" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#A39A91]">
                  Business details
                </p>

                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-xl font-bold text-[#17202A]">
                    {business.name}
                  </h1>

                  {deleted && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#FFF0ED] px-2.5 py-1 text-[10px] font-bold text-[#9F2D18]">
                      <Trash2 size={10} />

                      Deleted
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                      business.status ===
                      "ACTIVE"
                        ? "bg-[#E7F7EF] text-[#287A4B]"
                        : business.status ===
                          "PENDING"
                        ? "bg-[#FFF0D9] text-[#9F5A18]"
                        : "bg-[#F0ECE7] text-[#6F675F]"
                    }`}
                  >
                    {business.status}
                  </span>

                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                      business.verification ===
                      "VERIFIED"
                        ? "bg-[#DDF5EA] text-[#137A59]"
                        : "bg-[#F3F0EB] text-[#6F675F]"
                    }`}
                  >
                    {
                      business.verification
                    }
                  </span>

                  <span className="rounded-full bg-[#F3F0EB] px-2.5 py-1 text-[10px] font-bold text-[#6F675F]">
                    {
                      business
                        .products
                        .length
                    }{" "}
                    products
                  </span>
                </div>
              </div>
            </div>
          </div>

          {deleted && (
            <div className="border-b border-[#F2C7BC] bg-[#FFF5F2] px-5 py-4 sm:px-6">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#FF5A36]">
                  <Trash2 size={15} />
                </div>

                <div>
                  <p className="text-sm font-bold text-[#9F2D18]">
                    This business is
                    soft-deleted.
                  </p>

                  <p className="mt-1 text-xs leading-5 text-[#9F2D18]">
                    It is retained in the
                    Admin system but should
                    not be visible to customers.
                    Restore it to return it to
                    normal customer-facing
                    discovery.
                  </p>
                </div>
              </div>
            </div>
          )}

          <form
            onSubmit={submit}
            className="space-y-6 p-5 sm:p-6"
          >
            {error && (
              <div className="rounded-xl border border-[#F2C7BC] bg-[#FFF0ED] px-4 py-3 text-xs font-medium text-[#9F2D18]">
                {error}
              </div>
            )}

            {/* BASIC INFORMATION */}

            <section>
              <h2 className="text-sm font-bold text-[#17202A]">
                Basic information
              </h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Business name"
                  value={name}
                  onChange={setName}
                  required
                />

                <Field
                  label="Owner name"
                  value={ownerName}
                  onChange={
                    setOwnerName
                  }
                />

                <div className="sm:col-span-2">
                  <Field
                    label="Description"
                    value={description}
                    onChange={
                      setDescription
                    }
                    multiline
                  />
                </div>

                <Field
                  label="Phone"
                  value={phone}
                  onChange={
                    setPhone
                  }
                  type="tel"
                />

                <div>
                  <label className="text-[10px] font-semibold text-[#6F675F]">
                    Business image
                  </label>

                  <p className="mt-1 text-[10px] leading-4 text-[#A39A91]">
                    Change the business image using your file manager.
                  </p>

                  <div className="mt-3">
                    <ImageUpload
                      value={
                        imageUrl ||
                        undefined
                      }
                      onChange={
                        setImageUrl
                      }
                      disabled={
                        saving ||
                        deleted
                      }
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* LOCATION */}

            <section className="border-t border-[#EAE6DF] pt-6">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[#9F2D18]" />

                <h2 className="text-sm font-bold text-[#17202A]">
                  Business location
                </h2>
              </div>

              <p className="mt-1 max-w-[760px] text-[11px] leading-5 text-[#7E766F]">
                Choose the business Region from the standardized Lagos
                list, enter the physical address, then capture the
                exact business location from the device. You do not
                need to type latitude or longitude.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  label="House / Shop / Building number"
                  value={houseNumber}
                  onChange={
                    setHouseNumber
                  }
                  placeholder="e.g. Shop 12"
                />

                <Field
                  label="Street / Road / Close"
                  value={street}
                  onChange={setStreet}
                  placeholder="e.g. Adewale Close"
                  required
                />

                <Field
                  label="City"
                  value={city}
                  onChange={setCity}
                  placeholder="e.g. Lagos or Epe"
                  required
                />

                <div>
                  <label className="text-[10px] font-semibold text-[#6F675F]">
                    Region
                  </label>

                  <select
                    value={region}
                    onChange={(event) =>
                      setRegion(
                        event.target.value
                      )
                    }
                    required
                    className="mt-2 h-11 w-full rounded-xl border border-[#EAE6DF] bg-white px-3.5 text-xs font-medium text-[#17202A] outline-none focus:border-[#FF9B82]"
                  >
                    <option value="">
                      Select a region
                    </option>

                    {!isKnownLagosRegion(
                      region
                    ) &&
                      region && (
                        <option
                          value={
                            region
                          }
                        >
                          {region}{" "}
                          (current)
                        </option>
                      )}

                    {LAGOS_REGION_GROUPS.map(
                      (group) => (
                        <optgroup
                          key={
                            group.lga
                          }
                          label={
                            group.lga
                          }
                        >
                          {group.regions.map(
                            (
                              item
                            ) => (
                              <option
                                key={`${group.lga}-${item}`}
                                value={
                                  item
                                }
                              >
                                {item}
                              </option>
                            )
                          )}
                        </optgroup>
                      )
                    )}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-[10px] font-semibold text-[#6F675F]">
                    Country
                  </label>

                  <input
                    value={
                      DEFAULT_COUNTRY
                    }
                    readOnly
                    className="mt-2 h-11 w-full rounded-xl border border-[#EAE6DF] bg-[#F3F0EB] px-3.5 text-xs text-[#6F675F] outline-none"
                  />

                  <p className="mt-1.5 text-[10px] text-[#A39A91]">
                    Country is fixed to Nigeria for this Lagos location workflow.
                  </p>
                </div>
              </div>

              {(
                houseNumber ||
                street ||
                city ||
                region
              ) && (
                <div className="mt-4 rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#A39A91]">
                    Address that will be saved
                  </p>

                  <p className="mt-1 text-xs font-medium text-[#17202A]">
                    {[
                      houseNumber.trim(),
                      street.trim(),
                      region.trim(),
                      city.trim(),
                      DEFAULT_COUNTRY,
                    ]
                      .filter(Boolean)
                      .join(", ") ||
                      "Complete the address fields above."}
                  </p>
                </div>
              )}

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <SelectField
                  label="Location verification"
                  value={
                    locationVerification
                  }
                  onChange={(value) =>
                    setLocationVerification(
                      value as
                        | "VERIFIED"
                        | "UNVERIFIED"
                    )
                  }
                  disabled={
                    deleted ||
                    !business.location
                  }
                  options={[
                    {
                      value:
                        "VERIFIED",
                      label:
                        "Location verified",
                    },
                    {
                      value:
                        "UNVERIFIED",
                      label:
                        "Location unverified",
                    },
                  ]}
                />
              </div>

              <p className="mt-2 text-[10px] leading-5 text-[#9A9087]">
                Location verification is separate from business verification.
                Changing the physical address or coordinates automatically
                resets a changed location to unverified.
              </p>

              <div className="mt-4 rounded-2xl border border-[#EAE6DF] bg-[#FCFAF6] p-4">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Navigation className="h-4 w-4 text-[#FF5A36]" />

                      <p className="text-xs font-bold text-[#17202A]">
                        Exact business
                        location
                      </p>
                    </div>

                    <p className="mt-1 text-[11px] leading-5 text-[#7E766F]">
                      {
                        locationStatus
                      }
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={
                      deleted ||
                      capturingLocation
                    }
                    onClick={
                      captureCurrentLocation
                    }
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-[11px] font-bold text-white transition hover:bg-[#E94B29] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {capturingLocation ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Navigation className="h-4 w-4" />
                    )}

                    {capturingLocation
                      ? "Capturing..."
                      : "Use current location"}
                  </button>
                </div>

                <p className="mt-3 text-[10px] leading-5 text-[#9A9087]">
                  Use this only when the device is
                  physically at the business location.
                  ReMarket stores the coordinates
                  automatically; the admin does not
                  type latitude or longitude.
                </p>
              </div>
            </section>

            {/* PRICE */}

            <section className="border-t border-[#EAE6DF] pt-6">
              <h2 className="text-sm font-bold text-[#17202A]">
                Price range
              </h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Minimum price"
                  value={priceMin}
                  onChange={
                    setPriceMin
                  }
                  type="number"
                  step="1"
                  min="0"
                />

                <Field
                  label="Maximum price"
                  value={priceMax}
                  onChange={
                    setPriceMax
                  }
                  type="number"
                  step="1"
                  min="0"
                />
              </div>
            </section>

            {/* BUSINESS STATE */}

            <section className="border-t border-[#EAE6DF] pt-6">
              <h2 className="text-sm font-bold text-[#17202A]">
                Business state
              </h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <SelectField
                  label="Availability"
                  value={
                    availability
                  }
                  onChange={(
                    value
                  ) =>
                    setAvailability(
                      value as
                        | "AVAILABLE"
                        | "ASK_SELLER"
                        | "UNAVAILABLE"
                    )
                  }
                  disabled={deleted}
                  options={[
                    {
                      value:
                        "AVAILABLE",
                      label:
                        "Available",
                    },
                    {
                      value:
                        "ASK_SELLER",
                      label:
                        "Ask seller",
                    },
                    {
                      value:
                        "UNAVAILABLE",
                      label:
                        "Unavailable",
                    },
                  ]}
                />

                <SelectField
                  label="Status"
                  value={status}
                  onChange={(
                    value
                  ) =>
                    setStatus(
                      value as
                        | "ACTIVE"
                        | "INACTIVE"
                        | "PENDING"
                    )
                  }
                  disabled={deleted}
                  options={[
                    {
                      value:
                        "ACTIVE",
                      label:
                        "Active",
                    },
                    {
                      value:
                        "INACTIVE",
                      label:
                        "Inactive",
                    },
                    {
                      value:
                        "PENDING",
                      label:
                        "Pending",
                    },
                  ]}
                />

                <SelectField
                  label="Verification"
                  value={
                    verification
                  }
                  onChange={(
                    value
                  ) =>
                    setVerification(
                      value as
                        | "VERIFIED"
                        | "UNVERIFIED"
                    )
                  }
                  disabled={deleted}
                  options={[
                    {
                      value:
                        "VERIFIED",
                      label:
                        "Verified",
                    },
                    {
                      value:
                        "UNVERIFIED",
                      label:
                        "Unverified",
                    },
                  ]}
                />
              </div>

              {deleted && (
                <p className="mt-2 text-[10px] text-[#A39A91]">
                  Restore this business before
                  changing its normal business
                  state.
                </p>
              )}
            </section>

            {/* CATEGORIES */}

            <section className="border-t border-[#EAE6DF] pt-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#17202A]">
                    Categories
                  </h2>

                  <p className="mt-1 text-[10px] text-[#A39A91]">
                    Select categories assigned to
                    this business.
                  </p>
                </div>

                {usingCategoryFallback && (
                  <span className="text-[10px] font-semibold text-[#9F5A18]">
                    Category service unavailable
                  </span>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {categories.map(
                  (
                    category
                  ) => {
                    const selected =
                      selectedCategoryIds.includes(
                        category.id
                      );

                    return (
                      <button
                        key={
                          category.id
                        }
                        type="button"
                        disabled={
                          usingCategoryFallback ||
                          deleted
                        }
                        onClick={() =>
                          toggleCategory(
                            category.id
                          )
                        }
                        className={[
                          "rounded-full border px-3 py-2 text-[10px] font-bold transition",
                          selected
                            ? "border-[#FF5A36] bg-[#FFE0D6] text-[#9F2D18]"
                            : "border-[#EAE6DF] bg-white text-[#6F675F] hover:border-[#FFB49F]",
                          usingCategoryFallback ||
                          deleted
                            ? "cursor-not-allowed opacity-60"
                            : "",
                        ].join(
                          " "
                        )}
                      >
                        {
                          category.name
                        }
                      </button>
                    );
                  }
                )}
              </div>

              {usingCategoryFallback && (
                <p className="mt-3 rounded-xl bg-[#FFF0D9] px-3 py-2 text-[10px] leading-5 text-[#9F5A18]">
                  The category list could not be loaded.
                  Existing database category IDs will be
                  preserved, and fallback display categories
                  cannot be submitted.
                </p>
              )}
            </section>

            {/* CONTACT LINKS */}

            <section className="border-t border-[#EAE6DF] pt-6">
              <h2 className="text-sm font-bold text-[#17202A]">
                Contact and social links
              </h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {SOCIAL_PLATFORMS.map(
                  ({
                    value,
                    label,
                  }) => (
                    <Field
                      key={value}
                      label={label}
                      value={
                        socialValues[
                          value
                        ]
                      }
                      onChange={(
                        nextValue
                      ) =>
                        updateSocial(
                          value,
                          nextValue
                        )
                      }
                      placeholder={
                        value ===
                        "WHATSAPP"
                          ? "080..."
                          : value ===
                            "PHONE"
                          ? "080..."
                          : value ===
                            "DIRECTIONS"
                          ? "https://maps.google.com/..."
                          : "@username or URL"
                      }
                    />
                  )
                )}
              </div>
            </section>

            {/* PRODUCTS */}

            <section className="border-t border-[#EAE6DF] pt-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-bold text-[#17202A]">
                    Products
                  </h2>

                  <p className="mt-1 text-[10px] text-[#A39A91]">
                    Manage products from this
                    business.
                  </p>
                </div>

                {!deleted && (
                  <Link
                    href={`/admin/businesses/${business.id}/products/new`}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-3.5 py-2.5 text-xs font-bold text-[#6F675F] transition hover:border-[#FFB49F] hover:bg-[#FCFAF6]"
                  >
                    Add product
                  </Link>
                )}
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-[#EAE6DF] bg-white">
                {business.products.length ===
                0 ? (
                  <div className="px-5 py-10 text-center">
                    <Package className="mx-auto h-8 w-8 text-[#CFC8C0]" />

                    <p className="mt-3 text-sm font-semibold text-[#6F675F]">
                      No products yet
                    </p>

                    <p className="mt-1 text-xs text-[#A39A91]">
                      Add the first product for
                      this business.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#EAE6DF]">
                    {business.products.map(
                      (
                        product
                      ) => (
                        <div
                          key={
                            product.id
                          }
                          className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[#F3F0EB]">
                              {product.imageUrl ? (
                                <img
                                  src={
                                    product.imageUrl
                                  }
                                  alt={
                                    product.name
                                  }
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center">
                                  <Package className="h-5 w-5 text-[#A39A91]" />
                                </div>
                              )}
                            </div>

                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-[#17202A]">
                                {
                                  product.name
                                }
                              </p>

                              <p className="mt-1 text-[10px] text-[#A39A91]">
                                {product.category?.name ??
                                  "No category"}{" "}
                                ·{" "}
                                {product.deletedAt
                                  ? "Deleted"
                                  : product.status}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Link
                              href={`/admin/businesses/${business.id}/products/${product.id}/edit`}
                              className="rounded-xl border border-[#EAE6DF] bg-white px-3 py-2 text-[10px] font-bold text-[#6F675F] transition hover:border-[#FFB49F] hover:bg-[#FCFAF6]"
                            >
                              Edit
                            </Link>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* SAVE */}

            <div className="flex flex-col-reverse gap-2 border-t border-[#EAE6DF] pt-5 sm:flex-row sm:justify-end">
              <Link
                href="/admin/businesses"
                className="rounded-xl border border-[#EAE6DF] bg-white px-5 py-3 text-center text-xs font-bold text-[#6F675F] transition hover:bg-[#FCFAF6]"
              >
                Back to businesses
              </Link>

              <button
                type="submit"
                disabled={
                  saving
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-bold text-white transition hover:bg-[#E94B2D] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}

                {saving
                  ? "Saving..."
                  : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  multiline?: boolean;
  step?: string;
  min?: string;
};

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  multiline = false,
  step,
  min,
}: FieldProps) {
  const className =
    "mt-2 w-full rounded-xl border border-[#EAE6DF] bg-white px-3.5 py-3 text-xs text-[#17202A] outline-none transition placeholder:text-[#CFC8C0] focus:border-[#FF9B82]";

  return (
    <div>
      <label className="text-[10px] font-semibold text-[#6F675F]">
        {label}
      </label>

      {multiline ? (
        <textarea
          value={value}
          onChange={(event) =>
            onChange(
              event.target.value
            )
          }
          placeholder={
            placeholder
          }
          required={required}
          rows={5}
          className={`${className} resize-y`}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(event) =>
            onChange(
              event.target.value
            )
          }
          placeholder={
            placeholder
          }
          required={required}
          step={step}
          min={min}
          className={className}
        />
      )}
    </div>
  );
}

type SelectOption = {
  value: string;
  label: string;
};

type SelectFieldProps = {
  label: string;
  value: string;
  onChange: (
    value: string
  ) => void;
  options: SelectOption[];
  disabled?: boolean;
};

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: SelectFieldProps) {
  return (
    <div>
      <label className="text-[10px] font-semibold text-[#6F675F]">
        {label}
      </label>

      <select
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        className="mt-2 h-11 w-full rounded-xl border border-[#EAE6DF] bg-white px-3.5 text-xs font-medium text-[#17202A] outline-none focus:border-[#FF9B82] disabled:cursor-not-allowed disabled:bg-[#F3F0EB] disabled:text-[#A39A91]"
      >
        {options.map(
          (option) => (
            <option
              key={
                option.value
              }
              value={
                option.value
              }
            >
              {option.label}
            </option>
          )
        )}
      </select>
    </div>
  );
}

function DeleteConfirmationModal({
  business,
  loading,
  onCancel,
  onConfirm,
}: {
  business: Business;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#17202A]/30 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-2xl border border-[#EAE6DF] bg-[#FFFDFC] p-5 shadow-xl">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#FFF0ED] text-[#FF5A36]">
            <AlertTriangle
              size={21}
            />
          </div>

          <div className="min-w-0">
            <h3 className="text-lg font-black text-[#17202A]">
              Delete business?
            </h3>

            <p className="mt-1 text-sm leading-6 text-[#6F675F]">
              <span className="font-bold text-[#17202A]">
                {business.name}
              </span>{" "}
              will be removed from customer-facing
              ReMarket results. Its information will
              remain in the Admin system and can be
              restored later.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={loading}
            onClick={
              onCancel
            }
            className="h-10 rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-4 text-sm font-bold text-[#6F675F] transition hover:bg-[#FFF0D9] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={
              onConfirm
            }
            className="h-10 rounded-xl bg-[#FF5A36] px-4 text-sm font-extrabold text-white transition hover:bg-[#E94B29] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Deleting..."
              : "Delete business"}
          </button>
        </div>
      </div>
    </div>
  );
}