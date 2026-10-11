"use client";

import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

import ProductImageUpload from "@/components/ProductImageUpload";
import NotificationBell from "@/components/NotificationBell";

import {
  Store,
  MapPin,
  Phone,
  Package,
  LogOut,
  ExternalLink,
  LoaderCircle,
  Plus,
  CheckCircle2,
  AlertCircle,
  Pencil,
  X,
  Trash2,
  AlertTriangle,
  UserRound,
  ShieldCheck,
} from "lucide-react";

const MAX_ACTIVE_PRODUCTS = 10;

type SellerCategory = {
  id: string;
  name: string;
};

type SocialPlatform =
  | "WHATSAPP"
  | "INSTAGRAM"
  | "TIKTOK"
  | "FACEBOOK"
  | "PHONE"
  | "DIRECTIONS";

type SellerSocialLink = {
  id: string;
  platform: SocialPlatform;
  handle: string;
};

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

function getSocialValue(
  links: SellerSocialLink[] | undefined,
  platform: SocialPlatform
): string {
  return (
    links?.find(
      (link) => link.platform === platform
    )?.handle ?? ""
  );
}

function getSocialValues(
  links: SellerSocialLink[] | undefined,
  fallbackPhone?: string | null
): Record<SocialPlatform, string> {
  return {
    WHATSAPP: getSocialValue(links, "WHATSAPP"),
    INSTAGRAM: getSocialValue(links, "INSTAGRAM"),
    TIKTOK: getSocialValue(links, "TIKTOK"),
    FACEBOOK: getSocialValue(links, "FACEBOOK"),
    PHONE:
      getSocialValue(links, "PHONE") ||
      fallbackPhone?.trim() ||
      "",
    DIRECTIONS: getSocialValue(links, "DIRECTIONS"),
  };
}

function buildSocialLinks(
  values: Record<SocialPlatform, string>
) {
  return SOCIAL_PLATFORMS
    .map(({ value }) => ({
      platform: value,
      handle: values[value].trim(),
    }))
    .filter((item) => item.handle);
}

const LAGOS_AREA_GROUPS = [
  {
    lga: "Agege",
    areas: [
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
    areas: [
      "Ajegunle",
      "Tolu",
      "Olodi",
      "Alaba Oro",
      "Awodi-Ora",
      "Layeni",
      "Mosafejo",
    ],
  },
  {
    lga: "Alimosho",
    areas: [
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
    areas: [
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
    areas: [
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
    areas: [
      "Badagry",
      "Badagry West",
      "Olorunda",
      "Oko-Afo",
    ],
  },
  {
    lga: "Epe",
    areas: [
      "Epe",
      "Eredo",
      "Ikosi-Ejinrin",
    ],
  },
  {
    lga: "Eti-Osa",
    areas: [
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
    areas: [
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
    areas: [
      "Ifako",
      "Ijaiye",
      "Ojokoro",
      "Oke-Ira",
      "Agbado",
    ],
  },
  {
    lga: "Ikeja",
    areas: [
      "Ikeja",
      "Ikeja GRA",
      "Alausa",
      "Allen Avenue",
      "Oregun",
      "Opebi",
      "Ogba",
      "Ojodu",
      "Onigbongbo",
      "Computer Village",
      "Airport Road",
    ],
  },
  {
    lga: "Ikorodu",
    areas: [
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
    areas: [
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
    areas: [
      "Lagos Island",
      "Idumota",
      "Balogun",
      "Marina",
      "Broad Street",
      "Isale Eko",
      "Lafiaji",
      "Onikan",
      "Epetedo",
      "Okepopo",
    ],
  },
  {
    lga: "Lagos Mainland",
    areas: [
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
    areas: [
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
    areas: [
      "Ojo",
      "Iba",
      "Iyana-Iba",
      "Ajangbadi",
      "Oto-Awori",
      "Alaba",
    ],
  },
  {
    lga: "Oshodi-Isolo",
    areas: [
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
    areas: [
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
    areas: [
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

function isKnownLagosArea(area: string): boolean {
  const normalized = area.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return LAGOS_AREA_GROUPS.some((group) =>
    group.areas.some(
      (item) => item.toLowerCase() === normalized
    )
  );
}

function looksLikeHouseNumber(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return (
    /^\d+[a-z]?\b/.test(normalized) ||
    /^(shop|house|building|block|plot|suite|unit|flat)\b/.test(
      normalized
    )
  );
}

/**
 * Parse the address order used by ReMarket:
 *
 * House number, Street, Area, City, Nigeria
 *
 * Also supports older addresses where no house number
 * was stored.
 */
function parseLocationAddress(
  address: string | null | undefined,
  area: string
): {
  houseNumber: string;
  street: string;
  city: string;
} {
  const fallback = {
    houseNumber: "",
    street: "",
    city: "",
  };

  const trimmedAddress =
    typeof address === "string" ? address.trim() : "";

  if (!trimmedAddress) {
    return fallback;
  }

  const parts = trimmedAddress
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return fallback;
  }

  const withoutCountry =
    parts[parts.length - 1].toLowerCase() ===
    DEFAULT_COUNTRY.toLowerCase()
      ? parts.slice(0, -1)
      : parts;

  const normalizedArea = area.trim().toLowerCase();

  let areaIndex = -1;

  // Avoid requiring the ES2023 Array.findLastIndex type.
  if (normalizedArea) {
    for (
      let index = 0;
      index < withoutCountry.length;
      index += 1
    ) {
      if (
        withoutCountry[index].toLowerCase() ===
        normalizedArea
      ) {
        areaIndex = index;
      }
    }
  }

  if (areaIndex < 0) {
    return {
      houseNumber: "",
      street: withoutCountry.join(", "),
      city: "",
    };
  }

  const beforeArea = withoutCountry.slice(0, areaIndex);
  const afterArea = withoutCountry.slice(areaIndex + 1);

  const city = afterArea.join(", ");

  if (beforeArea.length === 0) {
    return {
      houseNumber: "",
      street: "",
      city,
    };
  }

  if (beforeArea.length === 1) {
    return {
      houseNumber: "",
      street: beforeArea[0],
      city,
    };
  }

  if (looksLikeHouseNumber(beforeArea[0])) {
    return {
      houseNumber: beforeArea[0],
      street: beforeArea.slice(1).join(", "),
      city,
    };
  }

  return {
    houseNumber: "",
    street: beforeArea.join(", "),
    city,
  };
}

function buildLocationAddressPreview(
  area: string,
  houseNumber: string,
  street: string,
  city: string
): string {
  return [
    houseNumber.trim(),
    street.trim(),
    area.trim(),
    city.trim(),
    DEFAULT_COUNTRY,
  ]
    .filter(Boolean)
    .join(", ");
}

type SellerProductImage = {
  id: string;
  url: string;
  publicId: string | null;
  sortOrder: number;
};

type SellerProduct = {
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
  images: SellerProductImage[];
  status:
    | "ACTIVE"
    | "INACTIVE"
    | "PENDING";
  deletedAt: string | null;
  category: SellerCategory | null;
};

type SellerBusiness = {
  id: string;
  name: string;
  ownerName: string | null;
  description: string | null;
  status:
    | "ACTIVE"
    | "INACTIVE"
    | "PENDING";
  verification:
    | "VERIFIED"
    | "UNVERIFIED";
  availability:
    | "AVAILABLE"
    | "ASK_SELLER"
    | "UNAVAILABLE";
  phone: string | null;
  imageUrl: string | null;
  socialLinks: SellerSocialLink[];
  priceMin: number | null;
  priceMax: number | null;
  deletedAt: string | null;
  location: {
    id: string;
    area: string;
    address: string | null;
    verification:
      | "VERIFIED"
      | "UNVERIFIED";
  } | null;
  categories: {
    category: SellerCategory;
  }[];
  products: SellerProduct[];
};

type DeletionRequest = {
  id: string;
  businessId: string;
  reason: string | null;
  status:
    | "PENDING"
    | "APPROVED"
    | "REJECTED";
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type BusinessForm = {
  name: string;
  ownerName: string;
  description: string;
  area: string;
  houseNumber: string;
  street: string;
  city: string;
  categoryId: string;
  availability:
    | "AVAILABLE"
    | "ASK_SELLER"
    | "UNAVAILABLE";
  priceMin: string;
  priceMax: string;
};

type ProductForm = {
  name: string;
  description: string;
  categoryId: string;
  price: string;
  priceMin: string;
  priceMax: string;
  availability:
    | "AVAILABLE"
    | "ASK_SELLER"
    | "UNAVAILABLE";
  images: string[];
};

const INITIAL_BUSINESS_FORM: BusinessForm = {
  name: "",
  ownerName: "",
  description: "",
  area: "",
  houseNumber: "",
  street: "",
  city: "",
  categoryId: "",
  availability: "ASK_SELLER",
  priceMin: "",
  priceMax: "",
};

const INITIAL_PRODUCT_FORM: ProductForm = {
  name: "",
  description: "",
  categoryId: "",
  price: "",
  priceMin: "",
  priceMax: "",
  availability: "ASK_SELLER",
  images: [],
};

async function readJsonSafely<T>(
  response: Response
): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function getResponseError(
  data: unknown,
  fallback: string
): string {
  if (
    typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }

  return fallback;
}

export default function SellerDashboard() {
  const router = useRouter();

  const [business, setBusiness] =
    useState<SellerBusiness | null>(null);

  const [categories, setCategories] =
    useState<SellerCategory[]>([]);

  const [deletionRequest, setDeletionRequest] =
    useState<DeletionRequest | null>(null);

  const [loading, setLoading] = useState(true);
  const [dashboardLoadFailed, setDashboardLoadFailed] =
    useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [redirecting, setRedirecting] = useState(false);

  const [savingBusiness, setSavingBusiness] =
    useState(false);
  const [creatingProduct, setCreatingProduct] =
    useState(false);
  const [updatingProduct, setUpdatingProduct] =
    useState(false);
  const [deletingProductId, setDeletingProductId] =
    useState<string | null>(null);
  const [
    submittingDeletionRequest,
    setSubmittingDeletionRequest,
  ] = useState(false);

  const [editingBusiness, setEditingBusiness] =
    useState(false);
  const [showProductForm, setShowProductForm] =
    useState(false);
  const [editingProductId, setEditingProductId] =
    useState<string | null>(null);
  const [showDeletionForm, setShowDeletionForm] =
    useState(false);

  const [deletionReason, setDeletionReason] =
    useState("");
  const [categoryChanged, setCategoryChanged] =
    useState(false);

  const [socialValues, setSocialValues] =
    useState<Record<SocialPlatform, string>>({
      WHATSAPP: "",
      INSTAGRAM: "",
      TIKTOK: "",
      FACEBOOK: "",
      PHONE: "",
      DIRECTIONS: "",
    });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [businessForm, setBusinessForm] =
    useState<BusinessForm>(INITIAL_BUSINESS_FORM);

  const [productForm, setProductForm] =
    useState<ProductForm>(INITIAL_PRODUCT_FORM);

  // Exclude soft-deleted products from the seller's visible list
  // and from the active-product limit.
  const dashboardProducts =
    business?.products?.filter(
      (product) => !product.deletedAt
    ) ?? [];

  const activeProductCount =
    dashboardProducts.filter(
      (product) => product.status === "ACTIVE"
    ).length;

  const reachedProductLimit =
    activeProductCount >= MAX_ACTIVE_PRODUCTS;

  const remainingProductSlots = Math.max(
    0,
    MAX_ACTIVE_PRODUCTS - activeProductCount
  );

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      setDashboardLoadFailed(false);
      setRedirecting(false);
      setError("");

      try {
        const businessResponse = await fetch(
          "/api/seller/business",
          {
            cache: "no-store",
          }
        );

        if (
          businessResponse.status === 401 ||
          businessResponse.status === 403
        ) {
          if (!cancelled) {
            setRedirecting(true);
            router.replace("/seller/login");
          }

          return;
        }

        if (!businessResponse.ok) {
          throw new Error(
            "Unable to load seller business."
          );
        }

        const businessData =
          await readJsonSafely<{
            business?: SellerBusiness | null;
          }>(businessResponse);

        if (
          !businessData ||
          !Object.prototype.hasOwnProperty.call(
            businessData,
            "business"
          )
        ) {
          throw new Error(
            "The seller business response was invalid."
          );
        }

        const loadedBusiness =
          businessData.business ?? null;

        // Categories and deletion status are secondary data.
        // A failed secondary request should not prevent access
        // to the main seller dashboard.
        const [
          categoriesResponse,
          deletionRequestResponse,
        ] = await Promise.all([
          fetch("/api/categories", {
            cache: "no-store",
          }).catch(() => null),

          fetch(
            "/api/seller/business/deletion-request",
            {
              cache: "no-store",
            }
          ).catch(() => null),
        ]);

        let categoryData:
          | {
              categories?: SellerCategory[];
            }
          | null = null;

        if (categoriesResponse?.ok) {
          categoryData =
            await readJsonSafely<{
              categories?: SellerCategory[];
            }>(categoriesResponse);
        }

        let deletionData:
          | {
              request?: DeletionRequest | null;
            }
          | null = null;

        if (deletionRequestResponse?.ok) {
          deletionData =
            await readJsonSafely<{
              request?: DeletionRequest | null;
            }>(deletionRequestResponse);
        }

        if (cancelled) {
          return;
        }

        setBusiness(loadedBusiness);

        setCategories(
          Array.isArray(categoryData?.categories)
            ? categoryData.categories
            : []
        );

        setDeletionRequest(
          deletionData?.request ?? null
        );

        if (loadedBusiness) {
          const parsedLocation =
            parseLocationAddress(
              loadedBusiness.location?.address,
              loadedBusiness.location?.area ?? ""
            );

          setSocialValues(
            getSocialValues(
              loadedBusiness.socialLinks,
              loadedBusiness.phone
            )
          );

          setBusinessForm({
            name: loadedBusiness.name ?? "",
            ownerName: loadedBusiness.ownerName ?? "",
            description: loadedBusiness.description ?? "",
            area: loadedBusiness.location?.area ?? "",
            houseNumber: parsedLocation.houseNumber,
            street: parsedLocation.street,
            city: parsedLocation.city,
            categoryId:
              loadedBusiness.categories?.[0]?.category?.id ??
              "",
            availability:
              loadedBusiness.availability ?? "ASK_SELLER",
            priceMin:
              loadedBusiness.priceMin !== null
                ? String(loadedBusiness.priceMin)
                : "",
            priceMax:
              loadedBusiness.priceMax !== null
                ? String(loadedBusiness.priceMax)
                : "",
          });
        }

        setDashboardLoadFailed(false);
      } catch (loadError) {
        console.error(
          "Seller dashboard load error:",
          loadError
        );

        if (!cancelled) {
          setError(
            "Unable to load your seller dashboard. Please try again."
          );
          setDashboardLoadFailed(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [router, loadAttempt]);

  function updateBusinessField<
    K extends keyof BusinessForm
  >(
    field: K,
    value: BusinessForm[K]
  ) {
    setBusinessForm((current) => ({
      ...current,
      [field]: value,
    }));

    if (error) {
      setError("");
    }

    if (success) {
      setSuccess("");
    }
  }

  function updateProductField<
    K extends keyof ProductForm
  >(
    field: K,
    value: ProductForm[K]
  ) {
    setProductForm((current) => ({
      ...current,
      [field]: value,
    }));

    if (error) {
      setError("");
    }

    if (success) {
      setSuccess("");
    }
  }

  function updateSocial(
    platform: SocialPlatform,
    value: string
  ) {
    setSocialValues((current) => ({
      ...current,
      [platform]: value,
    }));

    if (error) {
      setError("");
    }

    if (success) {
      setSuccess("");
    }
  }

  function getBusinessFormValues() {
    const priceMin =
      businessForm.priceMin.trim() === ""
        ? null
        : Number(businessForm.priceMin);

    const priceMax =
      businessForm.priceMax.trim() === ""
        ? null
        : Number(businessForm.priceMax);

    return {
      priceMin,
      priceMax,
    };
  }

  function validateBusinessPrices() {
    const { priceMin, priceMax } =
      getBusinessFormValues();

    if (
      priceMin !== null &&
      (!Number.isInteger(priceMin) || priceMin < 0)
    ) {
      setError(
        "Minimum price must be a valid whole number."
      );
      return false;
    }

    if (
      priceMax !== null &&
      (!Number.isInteger(priceMax) || priceMax < 0)
    ) {
      setError(
        "Maximum price must be a valid whole number."
      );
      return false;
    }

    if (
      priceMin !== null &&
      priceMax !== null &&
      priceMin > priceMax
    ) {
      setError(
        "Minimum price cannot be greater than maximum price."
      );
      return false;
    }

    return true;
  }

  function validateBusinessLocation() {
    const area = businessForm.area.trim();
    const street = businessForm.street.trim();

    if (!area) {
      setError("Business area is required.");
      return false;
    }

    /*
     * Preserve a legacy saved area when editing an existing
     * business. New businesses must use an area from the list.
     */
    const currentSavedArea =
      business?.location?.area?.trim().toLowerCase() ?? "";

    const isCurrentSavedArea =
      area.toLowerCase() === currentSavedArea;

    if (
      !isKnownLagosArea(area) &&
      !isCurrentSavedArea
    ) {
      setError(
        "Select a business area from the Lagos area list."
      );
      return false;
    }

    if (!street) {
      setError(
        "Street, road, or close is required."
      );
      return false;
    }

    return true;
  }

  function startEditingBusiness() {
    if (!business) {
      return;
    }

    setError("");
    setSuccess("");

    const parsedLocation =
      parseLocationAddress(
        business.location?.address,
        business.location?.area ?? ""
      );

    setSocialValues(
      getSocialValues(
        business.socialLinks,
        business.phone
      )
    );

    setBusinessForm({
      name: business.name ?? "",
      ownerName: business.ownerName ?? "",
      description: business.description ?? "",
      area: business.location?.area ?? "",
      houseNumber: parsedLocation.houseNumber,
      street: parsedLocation.street,
      city: parsedLocation.city,
      categoryId:
        business.categories?.[0]?.category?.id ?? "",
      availability:
        business.availability ?? "ASK_SELLER",
      priceMin:
        business.priceMin !== null
          ? String(business.priceMin)
          : "",
      priceMax:
        business.priceMax !== null
          ? String(business.priceMax)
          : "",
    });

    setCategoryChanged(false);
    setEditingBusiness(true);
  }

  function cancelEditingBusiness() {
    if (!business) {
      return;
    }

    const parsedLocation =
      parseLocationAddress(
        business.location?.address,
        business.location?.area ?? ""
      );

    setError("");
    setSuccess("");

    setSocialValues(
      getSocialValues(
        business.socialLinks,
        business.phone
      )
    );

    setBusinessForm({
      name: business.name ?? "",
      ownerName: business.ownerName ?? "",
      description: business.description ?? "",
      area: business.location?.area ?? "",
      houseNumber: parsedLocation.houseNumber,
      street: parsedLocation.street,
      city: parsedLocation.city,
      categoryId:
        business.categories?.[0]?.category?.id ?? "",
      availability:
        business.availability ?? "ASK_SELLER",
      priceMin:
        business.priceMin !== null
          ? String(business.priceMin)
          : "",
      priceMax:
        business.priceMax !== null
          ? String(business.priceMax)
          : "",
    });

    setCategoryChanged(false);
    setEditingBusiness(false);
  }

  /**
   * Build the address payload using ReMarket's existing
   * address fields. No browser location or coordinates
   * are collected by the Seller Dashboard.
   */
  function buildBusinessLocationPayload() {
    return {
      area: businessForm.area.trim(),
      houseNumber: businessForm.houseNumber.trim(),
      street: businessForm.street.trim(),
      city: businessForm.city.trim(),
    };
  }

  async function createBusiness(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (savingBusiness) {
      return;
    }

    setError("");
    setSuccess("");

    if (!validateBusinessLocation()) {
      return;
    }

    if (!validateBusinessPrices()) {
      return;
    }

    const { priceMin, priceMax } =
      getBusinessFormValues();

    const locationPayload =
      buildBusinessLocationPayload();

    setSavingBusiness(true);

    try {
      const response = await fetch(
        "/api/seller/business",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: businessForm.name,
            ownerName: businessForm.ownerName,
            description: businessForm.description,
            ...locationPayload,
            socialLinks: buildSocialLinks(socialValues),
            categoryIds: businessForm.categoryId
              ? [businessForm.categoryId]
              : [],
            availability: businessForm.availability,
            priceMin,
            priceMax,
          }),
        }
      );

      const data =
        await readJsonSafely<{
          business?: SellerBusiness | null;
          error?: unknown;
        }>(response);

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        router.replace("/seller/login");
        return;
      }

      if (!response.ok) {
        setError(
          getResponseError(
            data,
            "Unable to create your business."
          )
        );
        return;
      }

      const createdBusiness =
        data?.business ?? null;

      if (!createdBusiness) {
        setError(
          "The business was submitted, but the server did not return the created business. Refresh the dashboard before trying again."
        );
        return;
      }

      setBusiness(createdBusiness);

      const parsedLocation =
        parseLocationAddress(
          createdBusiness.location?.address,
          createdBusiness.location?.area ?? ""
        );

      setBusinessForm({
        name: createdBusiness.name ?? "",
        ownerName: createdBusiness.ownerName ?? "",
        description: createdBusiness.description ?? "",
        area: createdBusiness.location?.area ?? "",
        houseNumber: parsedLocation.houseNumber,
        street: parsedLocation.street,
        city: parsedLocation.city,
        categoryId:
          createdBusiness.categories?.[0]?.category?.id ??
          "",
        availability:
          createdBusiness.availability ?? "ASK_SELLER",
        priceMin:
          createdBusiness.priceMin !== null
            ? String(createdBusiness.priceMin)
            : "",
        priceMax:
          createdBusiness.priceMax !== null
            ? String(createdBusiness.priceMax)
            : "",
      });

      setSocialValues(
        getSocialValues(
          createdBusiness.socialLinks,
          createdBusiness.phone
        )
      );

      setSuccess(
        "Your business has been created successfully."
      );
    } catch (createError) {
      console.error(
        "Seller business creation error:",
        createError
      );

      setError(
        "Something went wrong. Please try again."
      );
    } finally {
      setSavingBusiness(false);
    }
  }

  async function updateBusiness(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (savingBusiness || !business) {
      return;
    }

    setError("");
    setSuccess("");

    if (!validateBusinessLocation()) {
      return;
    }

    if (!validateBusinessPrices()) {
      return;
    }

    const { priceMin, priceMax } =
      getBusinessFormValues();

    const locationPayload =
      buildBusinessLocationPayload();

    setSavingBusiness(true);

    try {
      const body: Record<string, unknown> = {
        name: businessForm.name,
        ownerName: businessForm.ownerName,
        description: businessForm.description,
        ...locationPayload,
        socialLinks: buildSocialLinks(socialValues),
        availability: businessForm.availability,
        priceMin,
        priceMax,
      };

      if (categoryChanged) {
        body.categoryIds = businessForm.categoryId
          ? [businessForm.categoryId]
          : [];
      }

      const response = await fetch(
        "/api/seller/business",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      const data =
        await readJsonSafely<{
          business?: SellerBusiness | null;
          error?: unknown;
        }>(response);

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        router.replace("/seller/login");
        return;
      }

      if (!response.ok) {
        setError(
          getResponseError(
            data,
            "Unable to update your business."
          )
        );
        return;
      }

      const updatedBusiness =
        data?.business ?? null;

      if (!updatedBusiness) {
        setError(
          "The server did not return the updated business. Refresh the dashboard to verify your changes."
        );
        return;
      }

      setBusiness(updatedBusiness);

      const parsedLocation =
        parseLocationAddress(
          updatedBusiness.location?.address,
          updatedBusiness.location?.area ?? ""
        );

      setBusinessForm((current) => ({
        ...current,
        area: updatedBusiness.location?.area ?? "",
        houseNumber: parsedLocation.houseNumber,
        street: parsedLocation.street,
        city: parsedLocation.city,
      }));

      setSocialValues(
        getSocialValues(
          updatedBusiness.socialLinks,
          updatedBusiness.phone
        )
      );

      setCategoryChanged(false);
      setEditingBusiness(false);

      setSuccess(
        "Your business has been updated successfully."
      );
    } catch (updateError) {
      console.error(
        "Seller business update error:",
        updateError
      );

      setError(
        "Something went wrong. Please try again."
      );
    } finally {
      setSavingBusiness(false);
    }
  }

  function resetProductForm() {
    setProductForm(INITIAL_PRODUCT_FORM);
  }

  function openProductForm() {
    if (
      reachedProductLimit ||
      creatingProduct ||
      updatingProduct
    ) {
      return;
    }

    setError("");
    setSuccess("");
    setEditingProductId(null);
    resetProductForm();
    setShowProductForm(true);
  }

  function closeProductForm() {
    if (creatingProduct || updatingProduct) {
      return;
    }

    setError("");
    resetProductForm();
    setEditingProductId(null);
    setShowProductForm(false);
  }

  function startEditingProduct(
    product: SellerProduct
  ) {
    setError("");
    setSuccess("");

    setProductForm({
      name: product.name ?? "",
      description: product.description ?? "",
      categoryId: product.category?.id ?? "",
      price:
        product.price !== null
          ? String(product.price)
          : "",
      priceMin:
        product.priceMin !== null
          ? String(product.priceMin)
          : "",
      priceMax:
        product.priceMax !== null
          ? String(product.priceMax)
          : "",
      availability: product.availability ?? "ASK_SELLER",
      images: Array.isArray(product.images)
        ? product.images
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((image) => image.url)
        : product.imageUrl
          ? [product.imageUrl]
          : [],
    });

    setEditingProductId(product.id);
    setShowProductForm(true);
  }

  function validateProductPrices() {
    const price =
      productForm.price.trim() === ""
        ? null
        : Number(productForm.price);

    const priceMin =
      productForm.priceMin.trim() === ""
        ? null
        : Number(productForm.priceMin);

    const priceMax =
      productForm.priceMax.trim() === ""
        ? null
        : Number(productForm.priceMax);

    if (
      price !== null &&
      (!Number.isInteger(price) || price < 0)
    ) {
      setError("Price must be a valid whole number.");
      return false;
    }

    if (
      priceMin !== null &&
      (!Number.isInteger(priceMin) || priceMin < 0)
    ) {
      setError(
        "Minimum price must be a valid whole number."
      );
      return false;
    }

    if (
      priceMax !== null &&
      (!Number.isInteger(priceMax) || priceMax < 0)
    ) {
      setError(
        "Maximum price must be a valid whole number."
      );
      return false;
    }

    if (
      priceMin !== null &&
      priceMax !== null &&
      priceMin > priceMax
    ) {
      setError(
        "Minimum price cannot be greater than maximum price."
      );
      return false;
    }

    return true;
  }

  function getProductFormValues() {
    const price =
      productForm.price.trim() === ""
        ? null
        : Number(productForm.price);

    const priceMin =
      productForm.priceMin.trim() === ""
        ? null
        : Number(productForm.priceMin);

    const priceMax =
      productForm.priceMax.trim() === ""
        ? null
        : Number(productForm.priceMax);

    return {
      price,
      priceMin,
      priceMax,
    };
  }

  async function createProduct(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      creatingProduct ||
      !business ||
      reachedProductLimit
    ) {
      return;
    }

    setError("");
    setSuccess("");

    if (!productForm.name.trim()) {
      setError("Product name is required.");
      return;
    }

    if (!validateProductPrices()) {
      return;
    }

    const { price, priceMin, priceMax } =
      getProductFormValues();

    setCreatingProduct(true);

    try {
      const response = await fetch(
        "/api/seller/products",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: productForm.name,
            description: productForm.description,
            categoryId: productForm.categoryId || null,
            price,
            priceMin,
            priceMax,
            availability: productForm.availability,
            images: productForm.images,
          }),
        }
      );

      const data =
        await readJsonSafely<{
          error?: unknown;
        }>(response);

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        router.replace("/seller/login");
        return;
      }

      if (!response.ok) {
        setError(
          getResponseError(
            data,
            "Unable to create product."
          )
        );
        return;
      }

      await reloadBusiness();

      resetProductForm();
      setShowProductForm(false);

      setSuccess("Product added successfully.");
    } catch (productError) {
      console.error(
        "Seller product creation error:",
        productError
      );

      setError(
        "Something went wrong. Please try again."
      );
    } finally {
      setCreatingProduct(false);
    }
  }

  async function updateProduct(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (updatingProduct || !editingProductId) {
      return;
    }

    setError("");
    setSuccess("");

    if (!productForm.name.trim()) {
      setError("Product name is required.");
      return;
    }

    if (!validateProductPrices()) {
      return;
    }

    const { price, priceMin, priceMax } =
      getProductFormValues();

    setUpdatingProduct(true);

    try {
      const response = await fetch(
        `/api/seller/products/${editingProductId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: productForm.name,
            description: productForm.description,
            categoryId: productForm.categoryId || null,
            price,
            priceMin,
            priceMax,
            availability: productForm.availability,
            images: productForm.images,
          }),
        }
      );

      const data =
        await readJsonSafely<{
          error?: unknown;
        }>(response);

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        router.replace("/seller/login");
        return;
      }

      if (!response.ok) {
        setError(
          getResponseError(
            data,
            "Unable to update product."
          )
        );
        return;
      }

      await reloadBusiness();

      resetProductForm();
      setEditingProductId(null);
      setShowProductForm(false);

      setSuccess("Product updated successfully.");
    } catch (productError) {
      console.error(
        "Seller product update error:",
        productError
      );

      setError(
        "Something went wrong. Please try again."
      );
    } finally {
      setUpdatingProduct(false);
    }
  }

  async function deleteProduct(
    product: SellerProduct
  ) {
    if (deletingProductId) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${product.name}" from your active products?`
    );

    if (!confirmed) {
      return;
    }

    setError("");
    setSuccess("");
    setDeletingProductId(product.id);

    try {
      const response = await fetch(
        `/api/seller/products/${product.id}`,
        {
          method: "DELETE",
        }
      );

      const data =
        await readJsonSafely<{
          error?: unknown;
        }>(response);

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        router.replace("/seller/login");
        return;
      }

      if (!response.ok) {
        setError(
          getResponseError(
            data,
            "Unable to delete product."
          )
        );
        return;
      }

      await reloadBusiness();

      if (editingProductId === product.id) {
        resetProductForm();
        setEditingProductId(null);
        setShowProductForm(false);
      }

      setSuccess("Product deleted successfully.");
    } catch (deleteError) {
      console.error(
        "Seller product deletion error:",
        deleteError
      );

      setError(
        "Something went wrong. Please try again."
      );
    } finally {
      setDeletingProductId(null);
    }
  }

  function openDeletionForm() {
    setError("");
    setSuccess("");
    setDeletionReason("");
    setShowDeletionForm(true);
  }

  function closeDeletionForm() {
    if (submittingDeletionRequest) {
      return;
    }

    setDeletionReason("");
    setShowDeletionForm(false);
    setError("");
  }

  async function submitDeletionRequest(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      submittingDeletionRequest ||
      !business
    ) {
      return;
    }

    setError("");
    setSuccess("");
    setSubmittingDeletionRequest(true);

    try {
      const response = await fetch(
        "/api/seller/business/deletion-request",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            reason: deletionReason.trim(),
          }),
        }
      );

      const data =
        await readJsonSafely<{
          request?: DeletionRequest | null;
          error?: unknown;
        }>(response);

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        router.replace("/seller/login");
        return;
      }

      if (!response.ok) {
        setError(
          getResponseError(
            data,
            "Unable to submit deletion request."
          )
        );
        return;
      }

      setDeletionRequest(data?.request ?? null);
      setDeletionReason("");
      setShowDeletionForm(false);

      setSuccess(
        "Your business deletion request has been submitted for admin review."
      );
    } catch (requestError) {
      console.error(
        "Seller deletion request error:",
        requestError
      );

      setError(
        "Something went wrong. Please try again."
      );
    } finally {
      setSubmittingDeletionRequest(false);
    }
  }

  async function reloadBusiness() {
    const response = await fetch(
      "/api/seller/business",
      {
        cache: "no-store",
      }
    );

    if (
      response.status === 401 ||
      response.status === 403
    ) {
      router.replace("/seller/login");
      return;
    }

    if (!response.ok) {
      throw new Error("Unable to reload business.");
    }

    const data =
      await readJsonSafely<{
        business?: SellerBusiness | null;
      }>(response);

    if (
      !data ||
      !Object.prototype.hasOwnProperty.call(
        data,
        "business"
      )
    ) {
      throw new Error(
        "The seller business response was invalid."
      );
    }

    setBusiness(data.business ?? null);
  }

  async function logout() {
    await signOut({
      callbackUrl: "/seller/login",
    });
  }

  function getDeletionStatusClasses(
    status: DeletionRequest["status"]
  ) {
    switch (status) {
      case "PENDING":
        return "bg-[#FFF5D9] text-[#9A6700]";

      case "APPROVED":
        return "bg-[#E7F0FF] text-[#3566B8]";

      case "REJECTED":
        return "bg-[#FFF0EE] text-[#C5402D]";
    }
  }

  function getBusinessStatusClasses(
    status: SellerBusiness["status"]
  ) {
    switch (status) {
      case "ACTIVE":
        return "bg-[#DDF5EA] text-[#137A59]";

      case "PENDING":
        return "bg-[#FFF5D9] text-[#9A6700]";

      case "INACTIVE":
        return "bg-gray-100 text-gray-600";
    }
  }

  function getProductStatusClasses(
    status: SellerProduct["status"]
  ) {
    switch (status) {
      case "ACTIVE":
        return "bg-[#DDF5EA] text-[#137A59]";

      case "PENDING":
        return "bg-[#FFF5D9] text-[#9A6700]";

      case "INACTIVE":
        return "bg-gray-100 text-gray-600";
    }
  }

  /**
   * Full-viewport loading state.
   */
  if (loading || redirecting) {
    return (
      <main className="flex min-h-dvh w-full items-center justify-center bg-[#FFFDFC] px-4">
        <div className="flex items-center gap-3 text-sm font-medium text-gray-600">
          <LoaderCircle
            aria-hidden="true"
            className="h-5 w-5 animate-spin text-[#FF5A36]"
          />

          {redirecting
            ? "Redirecting to login..."
            : "Loading seller dashboard..."}
        </div>
      </main>
    );
  }

  /**
   * Full-viewport error state.
   */
  if (dashboardLoadFailed) {
    return (
      <main className="flex min-h-dvh w-full items-center justify-center bg-[#FFFDFC] px-4 py-8">
        <section className="w-full max-w-[480px] rounded-[22px] border border-[#E8E4DE] bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#FFF0EE] text-[#E33B22]">
            <AlertCircle
              aria-hidden="true"
              className="h-6 w-6"
            />
          </div>

          <h1 className="mt-4 text-xl font-bold text-[#17202A]">
            Unable to load your dashboard
          </h1>

          <p
            role="alert"
            className="mt-2 text-sm leading-6 text-gray-500"
          >
            {error ||
              "Your business information could not be loaded."}
          </p>

          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setLoadAttempt((attempt) => attempt + 1);
            }}
            className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 text-sm font-bold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/25"
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-dvh w-full overflow-x-clip bg-[#FFFDFC]">
      {/* Full viewport: no outer maximum-width container or page gutter. */}

      <div className="min-h-dvh w-full">
        <div className="min-h-dvh w-full overflow-hidden bg-[#FFFDFC]">

          {/* HEADER */}

          <header className="flex min-h-[66px] w-full items-center justify-between gap-3 border-b border-[#EAE6DF] bg-white px-4 sm:px-6 lg:px-8">
            <Link
              href="/seller"
              className="flex shrink-0 items-center gap-2.5"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF5A36] text-white shadow-sm">
                <Store className="h-5 w-5" />
              </div>

              <div>
                <p className="text-sm font-bold tracking-tight text-[#17202A]">
                  ReMarket
                </p>

                <p className="text-[10px] leading-none text-gray-400">
                  Seller Portal
                </p>
              </div>
            </Link>

            {/* DESKTOP NAVIGATION */}

            <nav className="hidden items-center gap-2 lg:flex">
              <Link
                href="/seller"
                className="inline-flex items-center gap-2 rounded-xl bg-[#FFF0E9] px-3 py-2.5 text-xs font-bold text-[#FF5A36] transition hover:bg-[#FFE7DD]"
              >
                <Store className="h-4 w-4" />
                Dashboard
              </Link>

              <Link
                href="/seller/profile"
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-600 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
              >
                <UserRound className="h-4 w-4" />
                Profile
              </Link>

              <Link
                href="/seller/claims"
                className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-600 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
              >
                <ShieldCheck className="h-4 w-4" />
                Claims
              </Link>
            </nav>

            <div className="flex shrink-0 items-center gap-2">
              <div className="hidden items-center gap-1.5 md:flex lg:hidden">
                <Link
                  href="/seller/profile"
                  aria-label="Seller profile"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E8E4DE] bg-white text-gray-600 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
                >
                  <UserRound className="h-4 w-4" />
                </Link>

                <Link
                  href="/seller/claims"
                  aria-label="Business claims"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E8E4DE] bg-white text-gray-600 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
                >
                  <ShieldCheck className="h-4 w-4" />
                </Link>
              </div>

              <NotificationBell />

              <button
                type="button"
                onClick={logout}
                className="flex items-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-3.5 py-2.5 text-xs font-semibold text-gray-700 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
              >
                <LogOut className="h-4 w-4" />

                <span className="hidden sm:inline">
                  Log out
                </span>
              </button>
            </div>
          </header>

          {/* MAIN DASHBOARD CONTENT */}

          <div className="w-full min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-10">
            <div className="w-full min-w-0">

              {/* DASHBOARD HEADING */}

              <div className="mb-7">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#FF5A36]">
                  Seller Dashboard
                </p>

                <h1 className="mt-2 text-2xl font-bold tracking-tight text-[#17202A] sm:text-3xl">
                  Manage your business
                </h1>

                <p className="mt-2 max-w-[650px] text-sm leading-6 text-gray-500">
                  Manage your local business and the products customers can discover on ReMarket.
                </p>
              </div>

              {/* ERROR FEEDBACK */}

              {error && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="mb-5 flex items-start gap-3 rounded-2xl border border-[#FFB8B0] bg-[#FFF0EE] px-4 py-4"
                >
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#E33B22]" />

                  <p className="text-sm text-[#E33B22]">
                    {error}
                  </p>
                </div>
              )}

              {/* SUCCESS FEEDBACK */}

              {success && (
                <div
                  role="status"
                  aria-live="polite"
                  className="mb-5 flex items-start gap-3 rounded-2xl border border-[#BDE8D8] bg-[#EFFBF6] px-4 py-4"
                >
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#137A59]" />

                  <p className="text-sm text-[#137A59]">
                    {success}
                  </p>
                </div>
              )}

              {/* EXISTING BUSINESS */}

              {business && !editingBusiness && (
                <section className="w-full min-w-0">
                  <div className="w-full min-w-0 rounded-[22px] border border-[#E8E4DE] bg-white p-5 shadow-sm sm:p-6">
                    <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-start gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#FFF0EB] text-[#FF5A36]">
                          <Store className="h-7 w-7" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="break-words text-xl font-bold text-[#17202A]">
                              {business.name}
                            </h2>

                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${getBusinessStatusClasses(
                                business.status
                              )}`}
                            >
                              {business.status}
                            </span>

                            {business.verification ===
                              "VERIFIED" && (
                              <span className="rounded-full bg-[#E7F0FF] px-2.5 py-1 text-[10px] font-bold text-[#3566B8]">
                                Verified
                              </span>
                            )}
                          </div>

                          <p className="mt-1 break-words text-sm text-gray-500">
                            {business.description ||
                              "Your ReMarket business profile."}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={startEditingBusiness}
                          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-4 py-2.5 text-xs font-bold text-gray-700 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18]"
                        >
                          <Pencil className="h-4 w-4" />
                          Edit business
                        </button>

                        <Link
                          href={`/seller/${business.id}`}
                          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-bold text-white transition hover:opacity-90"
                        >
                          View public page
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>

                    {/* BUSINESS SUMMARY CARDS */}

                    <div className="mt-6 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="min-w-0 rounded-2xl bg-[#FCFAF6] p-4">
                        <div className="flex items-center gap-2 text-gray-400">
                          <MapPin className="h-4 w-4 shrink-0" />

                          <span className="text-[10px] font-semibold uppercase tracking-wide">
                            Business address
                          </span>
                        </div>

                        <p className="mt-2 break-words text-sm font-semibold text-gray-800">
                          {business.location?.area || "Not set"}
                        </p>

                        <p className="mt-1 break-words text-[11px] leading-5 text-gray-500">
                          {business.location?.address ||
                            "Add your street address to help customers find your business."}
                        </p>
                      </div>

                      <div className="min-w-0 rounded-2xl bg-[#FCFAF6] p-4">
                        <div className="flex items-center gap-2 text-gray-400">
                          <Phone className="h-4 w-4 shrink-0" />

                          <span className="text-[10px] font-semibold uppercase tracking-wide">
                            Phone
                          </span>
                        </div>

                        <p className="mt-2 break-words text-sm font-semibold text-gray-800">
                          {business.phone || "Not set"}
                        </p>
                      </div>

                      <div className="min-w-0 rounded-2xl bg-[#FCFAF6] p-4">
                        <div className="flex items-center gap-2 text-gray-400">
                          <Package className="h-4 w-4 shrink-0" />

                          <span className="text-[10px] font-semibold uppercase tracking-wide">
                            Products
                          </span>
                        </div>

                        <p className="mt-2 text-sm font-semibold text-gray-800">
                          {activeProductCount}/{MAX_ACTIVE_PRODUCTS}
                        </p>
                      </div>

                      <div className="min-w-0 rounded-2xl bg-[#FCFAF6] p-4">
                        <div className="flex items-center gap-2 text-gray-400">
                          <Store className="h-4 w-4 shrink-0" />

                          <span className="text-[10px] font-semibold uppercase tracking-wide">
                            Availability
                          </span>
                        </div>

                        <p className="mt-2 break-words text-sm font-semibold text-gray-800">
                          {business.availability.replace("_", " ")}
                        </p>
                      </div>
                    </div>

                    {/* BUSINESS CATEGORIES */}

                    {business.categories.length > 0 && (
                      <div className="mt-5">
                        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
                          Categories
                        </p>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {business.categories.map(
                            ({ category }) => (
                              <span
                                key={category.id}
                                className="rounded-full border border-[#E8E4DE] bg-white px-3 py-1.5 text-xs font-medium text-gray-700"
                              >
                                {category.name}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    )}

                    {/* CONTACT & SOCIAL LINKS */}

                    <div className="mt-5 border-t border-[#EAE6DF] pt-5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
                        Contact & social links
                      </p>

                      {business.socialLinks.length > 0 ? (
                        <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                          {business.socialLinks.map((link) => {
                            const label =
                              SOCIAL_PLATFORMS.find(
                                (platform) =>
                                  platform.value === link.platform
                              )?.label ?? link.platform;

                            return (
                              <div
                                key={link.id}
                                className="min-w-0 rounded-2xl bg-[#FCFAF6] p-4"
                              >
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                                  {label}
                                </p>

                                <p className="mt-2 break-words text-sm font-semibold text-gray-800">
                                  {link.handle}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-2 text-xs text-gray-500">
                          No contact or social links have been added yet.
                        </p>
                      )}
                    </div>

                    {/* BUSINESS DELETION */}

                    <div className="mt-6 border-t border-[#EAE6DF] pt-5">
                      <div className="rounded-2xl border border-[#F1D5D0] bg-[#FFF9F7] p-4">
                        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0EE] text-[#C5402D]">
                              <AlertTriangle className="h-5 w-5" />
                            </div>

                            <div className="min-w-0">
                              <h3 className="text-sm font-bold text-[#17202A]">
                                Business deletion
                              </h3>

                              <p className="mt-1 max-w-[600px] text-xs leading-5 text-gray-500">
                                Business deletion requires admin approval. Submitting a request does not delete your business immediately.
                              </p>
                            </div>
                          </div>

                          {deletionRequest && (
                            <span
                              className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold ${getDeletionStatusClasses(
                                deletionRequest.status
                              )}`}
                            >
                              {deletionRequest.status}
                            </span>
                          )}
                        </div>

                        {deletionRequest?.status === "PENDING" && (
                          <p className="mt-3 text-xs text-[#9A6700]">
                            Your deletion request is currently waiting for admin review.
                          </p>
                        )}

                        {deletionRequest?.status === "APPROVED" && (
                          <p className="mt-3 text-xs text-[#3566B8]">
                            Your deletion request has been approved by an admin.
                          </p>
                        )}

                        {deletionRequest?.status === "REJECTED" && (
                          <p className="mt-3 text-xs text-[#C5402D]">
                            Your previous deletion request was rejected. You may submit a new request.
                          </p>
                        )}

                        {(!deletionRequest ||
                          deletionRequest.status === "REJECTED") && (
                          <button
                            type="button"
                            onClick={openDeletionForm}
                            className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-[#E5B9B1] bg-white px-4 py-2.5 text-xs font-bold text-[#C5402D] transition hover:bg-[#FFF0EE]"
                          >
                            <Trash2 className="h-4 w-4" />
                            Request business deletion
                          </button>
                        )}

                        {showDeletionForm && (
                          <form
                            onSubmit={submitDeletionRequest}
                            className="mt-4 rounded-2xl border border-[#F0CEC8] bg-white p-4"
                          >
                            <h4 className="text-sm font-bold text-[#17202A]">
                              Request business deletion
                            </h4>

                            <p className="mt-1 text-xs leading-5 text-gray-500">
                              Tell the admin why you want this business removed.
                            </p>

                            <label
                              htmlFor="deletion-reason"
                              className="mb-2 mt-4 block text-xs font-bold text-gray-700"
                            >
                              Reason
                            </label>

                            <textarea
                              id="deletion-reason"
                              value={deletionReason}
                              onChange={(event) =>
                                setDeletionReason(event.target.value)
                              }
                              rows={4}
                              maxLength={1000}
                              placeholder="Optional reason for your request"
                              disabled={submittingDeletionRequest}
                              className="w-full resize-none rounded-xl border border-[#D9DEE5] bg-white px-4 py-3 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                            />

                            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                              <button
                                type="button"
                                onClick={closeDeletionForm}
                                disabled={submittingDeletionRequest}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 transition hover:bg-[#FFF7ED] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <X className="h-4 w-4" />
                                Cancel
                              </button>

                              <button
                                type="submit"
                                disabled={submittingDeletionRequest}
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#C5402D] px-4 py-2.5 text-xs font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {submittingDeletionRequest ? (
                                  <>
                                    <LoaderCircle className="h-4 w-4 animate-spin" />
                                    Submitting...
                                  </>
                                ) : (
                                  <>
                                    <Trash2 className="h-4 w-4" />
                                    Submit request
                                  </>
                                )}
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {/* EDIT BUSINESS */}

              {business && editingBusiness && (
                <section className="w-full min-w-0 rounded-[22px] border border-[#E8E4DE] bg-white shadow-sm">
                  <div className="flex min-w-0 flex-col gap-4 border-b border-[#EAE6DF] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#FF5A36]">
                        Business settings
                      </p>

                      <h2 className="mt-1 text-lg font-bold text-[#17202A]">
                        Edit your business
                      </h2>

                      <p className="mt-1 text-xs text-gray-500">
                        Update the information customers see on ReMarket.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={cancelEditingBusiness}
                      disabled={savingBusiness}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 transition hover:bg-[#FFF7ED] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <X className="h-4 w-4" />
                      Cancel
                    </button>
                  </div>

                  <form
                    onSubmit={updateBusiness}
                    className="w-full min-w-0 space-y-5 px-5 py-6 sm:px-6"
                  >
                    <div className="grid min-w-0 gap-5 sm:grid-cols-2">
                      <div className="min-w-0">
                        <label
                          htmlFor="edit-business-name"
                          className="mb-2 block text-xs font-bold text-gray-700"
                        >
                          Business name
                        </label>

                        <input
                          id="edit-business-name"
                          type="text"
                          value={businessForm.name}
                          onChange={(event) =>
                            updateBusinessField(
                              "name",
                              event.target.value
                            )
                          }
                          maxLength={150}
                          required
                          disabled={savingBusiness}
                          className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                        />
                      </div>

                      <div className="min-w-0">
                        <label
                          htmlFor="edit-owner-name"
                          className="mb-2 block text-xs font-bold text-gray-700"
                        >
                          Owner name
                        </label>

                        <input
                          id="edit-owner-name"
                          type="text"
                          value={businessForm.ownerName}
                          onChange={(event) =>
                            updateBusinessField(
                              "ownerName",
                              event.target.value
                            )
                          }
                          maxLength={100}
                          disabled={savingBusiness}
                          className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                        />
                      </div>
                    </div>

                    <div className="min-w-0">
                      <label
                        htmlFor="edit-description"
                        className="mb-2 block text-xs font-bold text-gray-700"
                      >
                        Description
                      </label>

                      <textarea
                        id="edit-description"
                        value={businessForm.description}
                        onChange={(event) =>
                          updateBusinessField(
                            "description",
                            event.target.value
                          )
                        }
                        rows={4}
                        maxLength={2000}
                        disabled={savingBusiness}
                        className="w-full min-w-0 resize-none rounded-xl border border-[#D9DEE5] bg-white px-4 py-3 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                      />
                    </div>

                    {/* ADDRESS FIELDS */}

                    <div className="grid min-w-0 gap-5 sm:grid-cols-2">
                      <div className="min-w-0">
                        <label
                          htmlFor="edit-area"
                          className="mb-2 block text-xs font-bold text-gray-700"
                        >
                          Business area
                        </label>

                        <select
                          id="edit-area"
                          value={businessForm.area}
                          onChange={(event) =>
                            updateBusinessField(
                              "area",
                              event.target.value
                            )
                          }
                          required
                          disabled={savingBusiness}
                          className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-gray-50"
                        >
                          <option value="">Select area</option>

                          {!isKnownLagosArea(businessForm.area) &&
                            businessForm.area && (
                              <option value={businessForm.area}>
                                {businessForm.area} (saved area)
                              </option>
                            )}

                          {LAGOS_AREA_GROUPS.map((group) => (
                            <optgroup
                              key={group.lga}
                              label={group.lga}
                            >
                              {group.areas.map((item) => (
                                <option
                                  key={item}
                                  value={item}
                                >
                                  {item}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>

                      <div className="min-w-0">
                        <label
                          htmlFor="edit-city"
                          className="mb-2 block text-xs font-bold text-gray-700"
                        >
                          City
                        </label>

                        <input
                          id="edit-city"
                          type="text"
                          value={businessForm.city}
                          onChange={(event) =>
                            updateBusinessField(
                              "city",
                              event.target.value
                            )
                          }
                          placeholder="Lagos"
                          maxLength={100}
                          disabled={savingBusiness}
                          className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-gray-50"
                        />
                      </div>
                    </div>

                    <div className="grid min-w-0 gap-5 sm:grid-cols-2">
                      <div className="min-w-0">
                        <label
                          htmlFor="edit-house-number"
                          className="mb-2 block text-xs font-bold text-gray-700"
                        >
                          House / Shop / Building number
                        </label>

                        <input
                          id="edit-house-number"
                          type="text"
                          value={businessForm.houseNumber}
                          onChange={(event) =>
                            updateBusinessField(
                              "houseNumber",
                              event.target.value
                            )
                          }
                          placeholder="e.g. 12 or Shop 4"
                          maxLength={100}
                          disabled={savingBusiness}
                          className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-gray-50"
                        />
                      </div>

                      <div className="min-w-0">
                        <label
                          htmlFor="edit-street"
                          className="mb-2 block text-xs font-bold text-gray-700"
                        >
                          Street / Road / Close
                        </label>

                        <input
                          id="edit-street"
                          type="text"
                          value={businessForm.street}
                          onChange={(event) =>
                            updateBusinessField(
                              "street",
                              event.target.value
                            )
                          }
                          placeholder="e.g. Agidingbi Road"
                          maxLength={200}
                          required
                          disabled={savingBusiness}
                          className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-gray-50"
                        />
                      </div>
                    </div>

                    {/* ADDRESS PREVIEW */}

                    <div className="w-full min-w-0 rounded-2xl border border-[#E8E4DE] bg-[#FCFAF6] p-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0EB] text-[#FF5A36]">
                          <MapPin className="h-5 w-5" />
                        </div>

                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#17202A]">
                            Address preview
                          </p>

                          <p className="mt-2 break-words text-[11px] leading-5 text-gray-600">
                            {buildLocationAddressPreview(
                              businessForm.area,
                              businessForm.houseNumber,
                              businessForm.street,
                              businessForm.city
                            ) || "Complete the location fields above."}
                          </p>

                          <p className="mt-2 text-[10px] leading-5 text-gray-400">
                            Country: Nigeria
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* CONTACT & SOCIAL LINKS */}

                    <div className="w-full min-w-0 rounded-2xl border border-[#E8E4DE] bg-[#FCFAF6] p-4">
                      <div>
                        <p className="text-xs font-bold text-[#17202A]">
                          Contact & social links
                        </p>

                        <p className="mt-1 text-[10px] leading-5 text-gray-500">
                          Add the contact methods customers can use to reach your business. Phone is managed here as the Phone social link.
                        </p>
                      </div>

                      <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
                        {SOCIAL_PLATFORMS.map(
                          ({ value, label }) => (
                            <div key={value} className="min-w-0">
                              <label
                                htmlFor={`edit-social-${value.toLowerCase()}`}
                                className="mb-2 block text-xs font-bold text-gray-700"
                              >
                                {label}
                              </label>

                              <input
                                id={`edit-social-${value.toLowerCase()}`}
                                type={
                                  value === "PHONE"
                                    ? "tel"
                                    : "text"
                                }
                                value={socialValues[value]}
                                onChange={(event) =>
                                  updateSocial(
                                    value,
                                    event.target.value
                                  )
                                }
                                placeholder={
                                  value === "PHONE" ||
                                  value === "WHATSAPP"
                                    ? "080..."
                                    : value === "DIRECTIONS"
                                      ? "https://maps.google.com/..."
                                      : "@username or URL"
                                }
                                disabled={savingBusiness}
                                className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                              />
                            </div>
                          )
                        )}
                      </div>
                    </div>

                    {/* CATEGORY, AVAILABILITY AND PRICE */}

                    <div className="grid min-w-0 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                      <div className="min-w-0">
                        <label
                          htmlFor="edit-category"
                          className="mb-2 block text-xs font-bold text-gray-700"
                        >
                          Category
                        </label>

                        <select
                          id="edit-category"
                          value={businessForm.categoryId}
                          onChange={(event) => {
                            updateBusinessField(
                              "categoryId",
                              event.target.value
                            );

                            setCategoryChanged(true);
                          }}
                          disabled={savingBusiness}
                          className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                        >
                          <option value="">Select category</option>

                          {categories.map((category) => (
                            <option
                              key={category.id}
                              value={category.id}
                            >
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="min-w-0">
                        <label
                          htmlFor="edit-availability"
                          className="mb-2 block text-xs font-bold text-gray-700"
                        >
                          Availability
                        </label>

                        <select
                          id="edit-availability"
                          value={businessForm.availability}
                          onChange={(event) =>
                            updateBusinessField(
                              "availability",
                              event.target.value as BusinessForm["availability"]
                            )
                          }
                          disabled={savingBusiness}
                          className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                        >
                          <option value="ASK_SELLER">
                            Ask seller
                          </option>

                          <option value="AVAILABLE">
                            Available
                          </option>

                          <option value="UNAVAILABLE">
                            Unavailable
                          </option>
                        </select>
                      </div>

                      <div className="grid min-w-0 grid-cols-2 gap-3">
                        <div className="min-w-0">
                          <label
                            htmlFor="edit-price-min"
                            className="mb-2 block text-xs font-bold text-gray-700"
                          >
                            Min price
                          </label>

                          <input
                            id="edit-price-min"
                            type="number"
                            min="0"
                            step="1"
                            value={businessForm.priceMin}
                            onChange={(event) =>
                              updateBusinessField(
                                "priceMin",
                                event.target.value
                              )
                            }
                            disabled={savingBusiness}
                            className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-3 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                          />
                        </div>

                        <div className="min-w-0">
                          <label
                            htmlFor="edit-price-max"
                            className="mb-2 block text-xs font-bold text-gray-700"
                          >
                            Max price
                          </label>

                          <input
                            id="edit-price-max"
                            type="number"
                            min="0"
                            step="1"
                            value={businessForm.priceMax}
                            onChange={(event) =>
                              updateBusinessField(
                                "priceMax",
                                event.target.value
                              )
                            }
                            disabled={savingBusiness}
                            className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-3 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                          />
                        </div>
                      </div>
                    </div>

                    {/* SAVE BUSINESS */}

                    <div className="flex justify-end border-t border-[#EAE6DF] pt-5">
                      <button
                        type="submit"
                        disabled={savingBusiness}
                        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-6 text-sm font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                      >
                        {savingBusiness ? (
                          <>
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4" />
                            Save changes
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </section>
              )}

              {/* PRODUCTS */}

              {business && !editingBusiness && (
                <section className="mt-5 w-full min-w-0">
                  <div className="w-full min-w-0 rounded-[22px] border border-[#E8E4DE] bg-white shadow-sm">

                    {/* PRODUCTS HEADER */}

                    <div className="flex min-w-0 flex-col gap-4 border-b border-[#EAE6DF] px-5 py-5 sm:px-6">
                      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#FF5A36]">
                            Product management
                          </p>

                          <h2 className="mt-1 text-lg font-bold text-[#17202A]">
                            Your products
                          </h2>

                          <p className="mt-1 text-xs text-gray-500">
                            Add products customers can discover through your business page.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={
                            showProductForm
                              ? closeProductForm
                              : openProductForm
                          }
                          disabled={
                            reachedProductLimit &&
                            !showProductForm
                          }
                          className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
                            reachedProductLimit &&
                            !showProductForm
                              ? "cursor-not-allowed bg-gray-200 text-gray-500"
                              : "bg-[#FF5A36] text-white hover:opacity-90"
                          }`}
                        >
                          {showProductForm ? (
                            <>
                              <X className="h-4 w-4" />
                              Close
                            </>
                          ) : (
                            <>
                              <Plus className="h-4 w-4" />
                              Add product
                            </>
                          )}
                        </button>
                      </div>

                      {/* PRODUCT LIMIT */}

                      <div className="rounded-2xl border border-[#E8E4DE] bg-[#FCFAF6] p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <Package className="h-4 w-4 text-[#FF5A36]" />

                              <p className="text-xs font-bold text-[#17202A]">
                                Product slots
                              </p>
                            </div>

                            <p className="mt-1 text-[11px] text-gray-500">
                              {reachedProductLimit
                                ? "You have reached your active product limit."
                                : `${remainingProductSlots} active product ${
                                    remainingProductSlots === 1
                                      ? "slot"
                                      : "slots"
                                  } remaining.`}
                            </p>
                          </div>

                          <p
                            className={`text-sm font-bold ${
                              reachedProductLimit
                                ? "text-[#C5402D]"
                                : "text-[#9F2D18]"
                            }`}
                          >
                            {activeProductCount}/{MAX_ACTIVE_PRODUCTS}
                          </p>
                        </div>

                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#EAE6DF]">
                          <div
                            className={`h-full rounded-full transition-all ${
                              reachedProductLimit
                                ? "bg-[#C5402D]"
                                : "bg-[#FF5A36]"
                            }`}
                            style={{
                              width: `${Math.min(
                                100,
                                (activeProductCount /
                                  MAX_ACTIVE_PRODUCTS) *
                                  100
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* ADD / EDIT PRODUCT FORM */}

                    {showProductForm && (
                      <form
                        onSubmit={
                          editingProductId
                            ? updateProduct
                            : createProduct
                        }
                        className="w-full min-w-0 space-y-5 border-b border-[#EAE6DF] bg-[#FCFAF6] px-5 py-6 sm:px-6"
                      >
                        <div className="flex min-w-0 items-start justify-between gap-4">
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0EB] text-[#FF5A36]">
                              {editingProductId ? (
                                <Pencil className="h-5 w-5" />
                              ) : (
                                <Plus className="h-5 w-5" />
                              )}
                            </div>

                            <div className="min-w-0">
                              <h3 className="text-sm font-bold text-[#17202A]">
                                {editingProductId
                                  ? "Edit product"
                                  : "Add a product"}
                              </h3>

                              <p className="mt-1 text-xs text-gray-500">
                                {editingProductId
                                  ? "Update the information customers see for this product."
                                  : "Enter the basic information customers need to know."}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={closeProductForm}
                            disabled={
                              creatingProduct ||
                              updatingProduct
                            }
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#E8E4DE] bg-white text-gray-500 transition hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label="Close product form"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
                          <div className="min-w-0">
                            <label
                              htmlFor="product-name"
                              className="mb-2 block text-xs font-bold text-gray-700"
                            >
                              Product name
                            </label>

                            <input
                              id="product-name"
                              type="text"
                              value={productForm.name}
                              onChange={(event) =>
                                updateProductField(
                                  "name",
                                  event.target.value
                                )
                              }
                              placeholder="e.g. Native fabric"
                              maxLength={150}
                              required
                              disabled={
                                creatingProduct ||
                                updatingProduct
                              }
                              className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                            />
                          </div>

                          <div className="min-w-0">
                            <label
                              htmlFor="product-category"
                              className="mb-2 block text-xs font-bold text-gray-700"
                            >
                              Category
                            </label>

                            <select
                              id="product-category"
                              value={productForm.categoryId}
                              onChange={(event) =>
                                updateProductField(
                                  "categoryId",
                                  event.target.value
                                )
                              }
                              disabled={
                                creatingProduct ||
                                updatingProduct
                              }
                              className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                            >
                              <option value="">
                                Select category
                              </option>

                              {categories.map((category) => (
                                <option
                                  key={category.id}
                                  value={category.id}
                                >
                                  {category.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="min-w-0">
                          <label
                            htmlFor="product-description"
                            className="mb-2 block text-xs font-bold text-gray-700"
                          >
                            Description
                          </label>

                          <textarea
                            id="product-description"
                            value={productForm.description}
                            onChange={(event) =>
                              updateProductField(
                                "description",
                                event.target.value
                              )
                            }
                            rows={3}
                            maxLength={2000}
                            disabled={
                              creatingProduct ||
                              updatingProduct
                            }
                            placeholder="Describe the product"
                            className="w-full min-w-0 resize-none rounded-xl border border-[#D9DEE5] bg-white px-4 py-3 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                          />
                        </div>

                        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
                          <div className="min-w-0">
                            <label
                              htmlFor="product-price"
                              className="mb-2 block text-xs font-bold text-gray-700"
                            >
                              Price
                            </label>

                            <input
                              id="product-price"
                              type="number"
                              min="0"
                              step="1"
                              value={productForm.price}
                              onChange={(event) =>
                                updateProductField(
                                  "price",
                                  event.target.value
                                )
                              }
                              placeholder="Leave empty for range pricing"
                              disabled={
                                creatingProduct ||
                                updatingProduct
                              }
                              className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                            />
                          </div>

                          <div className="min-w-0">
                            <label
                              htmlFor="product-availability"
                              className="mb-2 block text-xs font-bold text-gray-700"
                            >
                              Availability
                            </label>

                            <select
                              id="product-availability"
                              value={productForm.availability}
                              onChange={(event) =>
                                updateProductField(
                                  "availability",
                                  event.target.value as ProductForm["availability"]
                                )
                              }
                              disabled={
                                creatingProduct ||
                                updatingProduct
                              }
                              className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                            >
                              <option value="ASK_SELLER">
                                Ask seller
                              </option>

                              <option value="AVAILABLE">
                                Available
                              </option>

                              <option value="UNAVAILABLE">
                                Unavailable
                              </option>
                            </select>
                          </div>
                        </div>

                        <div className="grid min-w-0 gap-5 xl:grid-cols-2">
                          <div className="grid min-w-0 grid-cols-2 gap-3">
                            <div className="min-w-0">
                              <label
                                htmlFor="product-price-min"
                                className="mb-2 block text-xs font-bold text-gray-700"
                              >
                                Min price
                              </label>

                              <input
                                id="product-price-min"
                                type="number"
                                min="0"
                                step="1"
                                value={productForm.priceMin}
                                onChange={(event) =>
                                  updateProductField(
                                    "priceMin",
                                    event.target.value
                                  )
                                }
                                placeholder="0"
                                disabled={
                                  creatingProduct ||
                                  updatingProduct
                                }
                                className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-3 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                              />
                            </div>

                            <div className="min-w-0">
                              <label
                                htmlFor="product-price-max"
                                className="mb-2 block text-xs font-bold text-gray-700"
                              >
                                Max price
                              </label>

                              <input
                                id="product-price-max"
                                type="number"
                                min="0"
                                step="1"
                                value={productForm.priceMax}
                                onChange={(event) =>
                                  updateProductField(
                                    "priceMax",
                                    event.target.value
                                  )
                                }
                                placeholder="0"
                                disabled={
                                  creatingProduct ||
                                  updatingProduct
                                }
                                className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-3 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                              />
                            </div>
                          </div>

                          <div className="min-w-0 rounded-2xl border border-[#E8E4DE] bg-white p-4">
                            <div>
                              <p className="text-xs font-bold text-[#17202A]">
                                Product images
                              </p>

                              <p className="mt-1 text-[10px] leading-4 text-gray-400">
                                The first image is the product cover.
                              </p>
                            </div>

                            <div className="mt-3 min-w-0">
                              <ProductImageUpload
                                value={productForm.images}
                                onChange={(images) =>
                                  updateProductField(
                                    "images",
                                    images
                                  )
                                }
                                disabled={
                                  creatingProduct ||
                                  updatingProduct
                                }
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex min-w-0 flex-col gap-3 border-t border-[#E5E0D8] pt-5 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs leading-5 text-gray-500">
                            {editingProductId
                              ? "Changes update this existing product."
                              : `${remainingProductSlots} active ${
                                  remainingProductSlots === 1
                                    ? "slot"
                                    : "slots"
                                } remaining.`}
                          </p>

                          <button
                            type="submit"
                            disabled={
                              creatingProduct ||
                              updatingProduct
                            }
                            className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-6 text-sm font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {creatingProduct ||
                            updatingProduct ? (
                              <>
                                <LoaderCircle className="h-4 w-4 animate-spin" />

                                {editingProductId
                                  ? "Saving..."
                                  : "Adding..."}
                              </>
                            ) : (
                              <>
                                {editingProductId ? (
                                  <CheckCircle2 className="h-4 w-4" />
                                ) : (
                                  <Plus className="h-4 w-4" />
                                )}

                                {editingProductId
                                  ? "Save changes"
                                  : "Add product"}
                              </>
                            )}
                          </button>
                        </div>
                      </form>
                    )}

                    {/* PRODUCT LIST */}

                    <div className="w-full min-w-0 p-5 sm:p-6">
                      {dashboardProducts.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-[#D9DEE5] bg-[#FCFAF6] px-5 py-10 text-center">
                          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-gray-400 shadow-sm">
                            <Package className="h-6 w-6" />
                          </div>

                          <h3 className="mt-4 text-sm font-bold text-[#17202A]">
                            No products yet
                          </h3>

                          <p className="mx-auto mt-1 max-w-[430px] text-xs leading-5 text-gray-500">
                            Add your first product so customers can see what your business sells.
                          </p>

                          <button
                            type="button"
                            onClick={openProductForm}
                            disabled={reachedProductLimit}
                            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Plus className="h-4 w-4" />
                            Add your first product
                          </button>
                        </div>
                      ) : (
                        <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                          {dashboardProducts.map((product) => (
                            <article
                              key={product.id}
                              className="min-w-0 overflow-hidden rounded-2xl border border-[#E8E4DE] bg-white"
                            >
                              <div className="h-[150px] overflow-hidden bg-[#FCFAF6]">
                                {product.images?.[0]?.url ||
                                product.imageUrl ? (
                                  <img
                                    src={
                                      product.images?.[0]?.url ??
                                      product.imageUrl ??
                                      ""
                                    }
                                    alt={product.name}
                                    loading="lazy"
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-gray-300">
                                    <Package className="h-10 w-10" />
                                  </div>
                                )}
                              </div>

                              <div className="min-w-0 p-4">
                                <div className="flex min-w-0 items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <h3 className="break-words text-sm font-bold text-[#17202A]">
                                      {product.name}
                                    </h3>

                                    <p className="mt-1 text-[11px] text-gray-500">
                                      {product.category?.name ??
                                        "No category"}
                                    </p>
                                  </div>

                                  <span
                                    className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${getProductStatusClasses(
                                      product.status
                                    )}`}
                                  >
                                    {product.status}
                                  </span>
                                </div>

                                <p className="mt-3 line-clamp-2 min-h-[34px] text-xs leading-5 text-gray-500">
                                  {product.description ||
                                    "No description added."}
                                </p>

                                <div className="mt-3 flex min-w-0 items-center justify-between gap-3">
                                  <div className="break-words text-sm font-bold text-[#9F2D18]">
                                    {product.price !== null
                                      ? `₦${product.price.toLocaleString()}`
                                      : product.priceMin !== null &&
                                          product.priceMax !== null
                                        ? `₦${product.priceMin.toLocaleString()} - ₦${product.priceMax.toLocaleString()}`
                                        : "Ask seller"}
                                  </div>

                                  <span className="shrink-0 text-right text-[10px] font-medium text-gray-400">
                                    {product.availability.replace(
                                      "_",
                                      " "
                                    )}
                                  </span>
                                </div>

                                <div className="mt-4 flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      startEditingProduct(product)
                                    }
                                    disabled={
                                      deletingProductId ===
                                      product.id
                                    }
                                    className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-[#E8E4DE] px-3 py-2.5 text-xs font-semibold text-gray-700 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    Edit
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      deleteProduct(product)
                                    }
                                    disabled={
                                      deletingProductId ===
                                      product.id
                                    }
                                    className="flex shrink-0 items-center justify-center rounded-xl border border-[#F1D5D0] px-3 py-2.5 text-xs font-semibold text-[#C5402D] transition hover:bg-[#FFF0EE] disabled:cursor-not-allowed disabled:opacity-50"
                                    aria-label={`Delete ${product.name}`}
                                  >
                                    {deletingProductId ===
                                    product.id ? (
                                      <LoaderCircle className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-4 w-4" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {/* CREATE BUSINESS */}

              {!business && (
                <section className="w-full min-w-0 rounded-[22px] border border-[#E8E4DE] bg-white shadow-sm">
                  <div className="border-b border-[#EAE6DF] px-5 py-5 sm:px-6">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF0EB] text-[#FF5A36]">
                        <Plus className="h-5 w-5" />
                      </div>

                      <div>
                        <h2 className="text-lg font-bold text-[#17202A]">
                          Add your business
                        </h2>

                        <p className="mt-1 text-xs text-gray-500">
                          Create your ReMarket business profile.
                        </p>
                      </div>
                    </div>
                  </div>

                  <form
                    onSubmit={createBusiness}
                    className="w-full min-w-0 space-y-5 px-5 py-6 sm:px-6"
                  >
                    <div className="grid min-w-0 gap-5 sm:grid-cols-2">
                      <div className="min-w-0">
                        <label
                          htmlFor="create-business-name"
                          className="mb-2 block text-xs font-bold text-gray-700"
                        >
                          Business name
                        </label>

                        <input
                          id="create-business-name"
                          type="text"
                          value={businessForm.name}
                          onChange={(event) =>
                            updateBusinessField(
                              "name",
                              event.target.value
                            )
                          }
                          maxLength={150}
                          placeholder="Your business name"
                          required
                          disabled={savingBusiness}
                          className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                        />
                      </div>

                      <div className="min-w-0">
                        <label
                          htmlFor="create-owner-name"
                          className="mb-2 block text-xs font-bold text-gray-700"
                        >
                          Owner name
                        </label>

                        <input
                          id="create-owner-name"
                          type="text"
                          value={businessForm.ownerName}
                          onChange={(event) =>
                            updateBusinessField(
                              "ownerName",
                              event.target.value
                            )
                          }
                          maxLength={100}
                          placeholder="Your name"
                          disabled={savingBusiness}
                          className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-gray-50"
                        />
                      </div>
                    </div>

                    <div className="min-w-0">
                      <label
                        htmlFor="create-description"
                        className="mb-2 block text-xs font-bold text-gray-700"
                      >
                        Description
                      </label>

                      <textarea
                        id="create-description"
                        value={businessForm.description}
                        onChange={(event) =>
                          updateBusinessField(
                            "description",
                            event.target.value
                          )
                        }
                        placeholder="Tell customers what your business offers"
                        rows={4}
                        maxLength={2000}
                        disabled={savingBusiness}
                        className="w-full min-w-0 resize-none rounded-xl border border-[#D9DEE5] bg-white px-4 py-3 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                      />
                    </div>

                    {/* ADDRESS FIELDS */}

                    <div className="grid min-w-0 gap-5 sm:grid-cols-2">
                      <div className="min-w-0">
                        <label
                          htmlFor="create-area"
                          className="mb-2 block text-xs font-bold text-gray-700"
                        >
                          Business area
                        </label>

                        <select
                          id="create-area"
                          value={businessForm.area}
                          onChange={(event) =>
                            updateBusinessField(
                              "area",
                              event.target.value
                            )
                          }
                          required
                          disabled={savingBusiness}
                          className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-gray-50"
                        >
                          <option value="">Select area</option>

                          {LAGOS_AREA_GROUPS.map((group) => (
                            <optgroup
                              key={group.lga}
                              label={group.lga}
                            >
                              {group.areas.map((item) => (
                                <option
                                  key={item}
                                  value={item}
                                >
                                  {item}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>

                      <div className="min-w-0">
                        <label
                          htmlFor="create-city"
                          className="mb-2 block text-xs font-bold text-gray-700"
                        >
                          City
                        </label>

                        <input
                          id="create-city"
                          type="text"
                          value={businessForm.city}
                          onChange={(event) =>
                            updateBusinessField(
                              "city",
                              event.target.value
                            )
                          }
                          placeholder="Lagos"
                          maxLength={100}
                          disabled={savingBusiness}
                          className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-gray-50"
                        />
                      </div>
                    </div>

                    <div className="grid min-w-0 gap-5 sm:grid-cols-2">
                      <div className="min-w-0">
                        <label
                          htmlFor="create-house-number"
                          className="mb-2 block text-xs font-bold text-gray-700"
                        >
                          House / Shop / Building number
                        </label>

                        <input
                          id="create-house-number"
                          type="text"
                          value={businessForm.houseNumber}
                          onChange={(event) =>
                            updateBusinessField(
                              "houseNumber",
                              event.target.value
                            )
                          }
                          placeholder="e.g. 12 or Shop 4"
                          maxLength={100}
                          disabled={savingBusiness}
                          className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-gray-50"
                        />
                      </div>

                      <div className="min-w-0">
                        <label
                          htmlFor="create-street"
                          className="mb-2 block text-xs font-bold text-gray-700"
                        >
                          Street / Road / Close
                        </label>

                        <input
                          id="create-street"
                          type="text"
                          value={businessForm.street}
                          onChange={(event) =>
                            updateBusinessField(
                              "street",
                              event.target.value
                            )
                          }
                          placeholder="e.g. Agidingbi Road"
                          maxLength={200}
                          required
                          disabled={savingBusiness}
                          className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-gray-50"
                        />
                      </div>
                    </div>

                    {/* ADDRESS PREVIEW */}

                    <div className="w-full min-w-0 rounded-2xl border border-[#E8E4DE] bg-[#FCFAF6] p-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0EB] text-[#FF5A36]">
                          <MapPin className="h-5 w-5" />
                        </div>

                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#17202A]">
                            Address preview
                          </p>

                          <p className="mt-2 break-words text-[11px] leading-5 text-gray-600">
                            {buildLocationAddressPreview(
                              businessForm.area,
                              businessForm.houseNumber,
                              businessForm.street,
                              businessForm.city
                            ) || "Complete the location fields above."}
                          </p>

                          <p className="mt-2 text-[10px] leading-5 text-gray-400">
                            Country: Nigeria
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* CONTACT & SOCIAL LINKS */}

                    <div className="w-full min-w-0 rounded-2xl border border-[#E8E4DE] bg-[#FCFAF6] p-4">
                      <div>
                        <p className="text-xs font-bold text-[#17202A]">
                          Contact & social links
                        </p>

                        <p className="mt-1 text-[10px] leading-5 text-gray-500">
                          Add the contact methods customers can use to reach your business. Phone is managed here as the Phone social link.
                        </p>
                      </div>

                      <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
                        {SOCIAL_PLATFORMS.map(
                          ({ value, label }) => (
                            <div key={value} className="min-w-0">
                              <label
                                htmlFor={`create-social-${value.toLowerCase()}`}
                                className="mb-2 block text-xs font-bold text-gray-700"
                              >
                                {label}
                              </label>

                              <input
                                id={`create-social-${value.toLowerCase()}`}
                                type={
                                  value === "PHONE"
                                    ? "tel"
                                    : "text"
                                }
                                value={socialValues[value]}
                                onChange={(event) =>
                                  updateSocial(
                                    value,
                                    event.target.value
                                  )
                                }
                                placeholder={
                                  value === "PHONE" ||
                                  value === "WHATSAPP"
                                    ? "080..."
                                    : value === "DIRECTIONS"
                                      ? "https://maps.google.com/..."
                                      : "@username or URL"
                                }
                                disabled={savingBusiness}
                                className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                              />
                            </div>
                          )
                        )}
                      </div>
                    </div>

                    {/* CATEGORY, AVAILABILITY AND PRICE */}

                    <div className="grid min-w-0 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                      <div className="min-w-0">
                        <label
                          htmlFor="create-category"
                          className="mb-2 block text-xs font-bold text-gray-700"
                        >
                          Category
                        </label>

                        <select
                          id="create-category"
                          value={businessForm.categoryId}
                          onChange={(event) =>
                            updateBusinessField(
                              "categoryId",
                              event.target.value
                            )
                          }
                          disabled={savingBusiness}
                          className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                        >
                          <option value="">Select category</option>

                          {categories.map((category) => (
                            <option
                              key={category.id}
                              value={category.id}
                            >
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="min-w-0">
                        <label
                          htmlFor="create-availability"
                          className="mb-2 block text-xs font-bold text-gray-700"
                        >
                          Availability
                        </label>

                        <select
                          id="create-availability"
                          value={businessForm.availability}
                          onChange={(event) =>
                            updateBusinessField(
                              "availability",
                              event.target.value as BusinessForm["availability"]
                            )
                          }
                          disabled={savingBusiness}
                          className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-gray-50"
                        >
                          <option value="ASK_SELLER">
                            Ask seller
                          </option>

                          <option value="AVAILABLE">
                            Available
                          </option>

                          <option value="UNAVAILABLE">
                            Unavailable
                          </option>
                        </select>
                      </div>

                      <div className="grid min-w-0 grid-cols-2 gap-3">
                        <div className="min-w-0">
                          <label
                            htmlFor="create-price-min"
                            className="mb-2 block text-xs font-bold text-gray-700"
                          >
                            Min price
                          </label>

                          <input
                            id="create-price-min"
                            type="number"
                            min="0"
                            step="1"
                            value={businessForm.priceMin}
                            onChange={(event) =>
                              updateBusinessField(
                                "priceMin",
                                event.target.value
                              )
                            }
                            placeholder="0"
                            disabled={savingBusiness}
                            className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-3 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-gray-50"
                          />
                        </div>

                        <div className="min-w-0">
                          <label
                            htmlFor="create-price-max"
                            className="mb-2 block text-xs font-bold text-gray-700"
                          >
                            Max price
                          </label>

                          <input
                            id="create-price-max"
                            type="number"
                            min="0"
                            step="1"
                            value={businessForm.priceMax}
                            onChange={(event) =>
                              updateBusinessField(
                                "priceMax",
                                event.target.value
                              )
                            }
                            placeholder="0"
                            disabled={savingBusiness}
                            className="h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-3 text-sm text-[#17202A] outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF5A36]/10 disabled:bg-gray-50"
                          />
                        </div>
                      </div>
                    </div>

                    {/* CREATE BUSINESS */}

                    <div className="flex min-w-0 flex-col gap-3 border-t border-[#EAE6DF] pt-5 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-xs leading-5 text-gray-500">
                        Your business will be linked to this seller account automatically.
                      </p>

                      <button
                        type="submit"
                        disabled={savingBusiness}
                        className="flex h-12 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-6 text-sm font-bold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                      >
                        {savingBusiness ? (
                          <>
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4" />
                            Create business
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </section>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}