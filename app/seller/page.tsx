"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import ProductImageUpload from "@/components/ProductImageUpload";
import NotificationBell from "@/components/NotificationBell";
import {
  Store,
  MapPin,
  Bell,
  ChevronDown,
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
  Share2,
  Copy,
  ArrowRight,
  Circle,
  ClipboardCheck,
} from "lucide-react";

const MAX_ACTIVE_PRODUCTS = 10;
const DEFAULT_COUNTRY = "Nigeria";

type Availability = "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
type RecordStatus = "ACTIVE" | "INACTIVE" | "PENDING";
type VerificationStatus = "VERIFIED" | "UNVERIFIED";

type SellerCategory = { id: string; name: string };
type SocialPlatform =
  | "WHATSAPP"
  | "INSTAGRAM"
  | "TIKTOK"
  | "FACEBOOK"
  | "PHONE"
  | "DIRECTIONS";
type BusinessSharePlatform = "WHATSAPP" | "FACEBOOK" | "LINKEDIN" | "X";
type SellerSocialLink = { id: string; platform: SocialPlatform; handle: string };
type SellerProductImage = { id: string; url: string; publicId: string | null; sortOrder: number };
type SellerProduct = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  availability: Availability;
  imageUrl: string | null;
  images: SellerProductImage[];
  status: RecordStatus;
  deletedAt: string | null;
  category: SellerCategory | null;
};
type SellerBusiness = {
  id: string;
  name: string;
  ownerName: string | null;
  description: string | null;
  status: RecordStatus;
  verification: VerificationStatus;
  availability: Availability;
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
    verification: VerificationStatus;
  } | null;
  categories: { category: SellerCategory }[];
  products: SellerProduct[];
};
type DeletionRequest = {
  id: string;
  businessId: string;
  reason: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
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
  availability: Availability;
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
  availability: Availability;
  images: string[];
};

type ApiBusinessResponse = { business?: SellerBusiness | null; error?: unknown };
type ApiCategoriesResponse = { categories?: SellerCategory[] };
type ApiDeletionResponse = { request?: DeletionRequest | null; error?: unknown };
type ApiErrorResponse = { error?: unknown };
type ApiSellerProductsResponse = {
  maxActiveProducts?: unknown;
  baseMaxActiveProducts?: unknown;
  referralBonusSlots?: unknown;
  error?: unknown;
};
type ProductCapacity = {
  maxActiveProducts: number;
  baseMaxActiveProducts: number;
  referralBonusSlots: number;
};

const SOCIAL_PLATFORMS: { value: SocialPlatform; label: string }[] = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "PHONE", label: "Phone" },
  { value: "DIRECTIONS", label: "Directions" },
];

const LAGOS_AREA_GROUPS = [
  { lga: "Agege", areas: ["Agege", "Orile Agege", "Dopemu", "Oko-Oba", "Isale Odo", "Keke"] },
  { lga: "Ajeromi-Ifelodun", areas: ["Ajegunle", "Tolu", "Olodi", "Alaba Oro", "Awodi-Ora", "Layeni", "Mosafejo"] },
  { lga: "Alimosho", areas: ["Alimosho", "Egbeda", "Akowonjo", "Shasha", "Idimu", "Egbe", "Ikotun", "Ijegun", "Igando", "Iyana-Ipaja", "Ayobo", "Abule Egba", "Aboru", "Meiran", "Oke-Odo", "Pleasure"] },
  { lga: "Amuwo-Odofin", areas: ["Amuwo", "Festac", "Mile 2", "Satellite Town", "Kirikiri", "Irede", "Ibeshe"] },
  { lga: "Apapa", areas: ["Apapa", "Apapa Wharf", "Iganmu", "Ijora", "Liverpool", "Tin Can"] },
  { lga: "Badagry", areas: ["Badagry", "Badagry West", "Olorunda", "Oko-Afo"] },
  { lga: "Epe", areas: ["Epe", "Eredo", "Ikosi-Ejinrin"] },
  { lga: "Eti-Osa", areas: ["Ikoyi", "Obalende", "Victoria Island", "Oniru", "Lekki Phase 1", "Ikate", "Jakande", "Osapa London", "Agungi", "Igbo-Efon", "Idado", "Chevron", "Ikota", "VGC", "Ajah", "Badore", "Sangotedo"] },
  { lga: "Ibeju-Lekki", areas: ["Ibeju-Lekki", "Abijo", "Awoyaya", "Lakowe", "Bogije", "Eleko", "Akodo"] },
  { lga: "Ifako-Ijaiye", areas: ["Ifako", "Ijaiye", "Ojokoro", "Oke-Ira", "Agbado"] },
  { lga: "Ikeja", areas: ["Ikeja", "Ikeja GRA", "Alausa", "Allen Avenue", "Oregun", "Opebi", "Ogba", "Ojodu", "Onigbongbo", "Computer Village", "Airport Road"] },
  { lga: "Ikorodu", areas: ["Ikorodu", "Ikorodu North", "Ikorodu West", "Igbogbo", "Baiyeku", "Ijede", "Imota", "Odogunyan", "Itamaga", "Agric"] },
  { lga: "Kosofe", areas: ["Kosofe", "Ketu", "Agboyi", "Ojota", "Gbagada", "Anthony", "Maryland", "Magodo", "Isheri", "Mile 12"] },
  { lga: "Lagos Island", areas: ["Lagos Island", "Idumota", "Balogun", "Marina", "Broad Street", "Isale Eko", "Lafiaji", "Onikan", "Epetedo", "Okepopo"] },
  { lga: "Lagos Mainland", areas: ["Yaba", "Ebute Metta", "Akoka", "Sabo", "Alagomeji", "Adekunle", "Abule Oja", "Onike", "Iwaya", "Makoko", "Jibowu", "Oyingbo", "Tejuosho"] },
  { lga: "Mushin", areas: ["Mushin", "Papa Ajao", "Idi-Araba", "Ilupeju", "Odi-Olowo", "Ojuwoye"] },
  { lga: "Ojo", areas: ["Ojo", "Iba", "Iyana-Iba", "Ajangbadi", "Oto-Awori", "Alaba"] },
  { lga: "Oshodi-Isolo", areas: ["Oshodi", "Isolo", "Ejigbo", "Okota", "Ajao Estate", "Mafoluku", "Ago Palace"] },
  { lga: "Shomolu", areas: ["Shomolu", "Bariga", "Pedro", "Onipanu", "Palmgrove", "Fadeyi"] },
  { lga: "Surulere", areas: ["Surulere", "Ojuelegba", "Lawanson", "Itire", "Aguda", "Coker", "Ijeshatedo"] },
] as const;

const INITIAL_BUSINESS_FORM: BusinessForm = {
  name: "", ownerName: "", description: "", area: "", houseNumber: "", street: "", city: "",
  categoryId: "", availability: "ASK_SELLER", priceMin: "", priceMax: "",
};
const INITIAL_PRODUCT_FORM: ProductForm = {
  name: "", description: "", categoryId: "", price: "", priceMin: "", priceMax: "",
  availability: "ASK_SELLER", images: [],
};
const INITIAL_SOCIAL_VALUES: Record<SocialPlatform, string> = {
  WHATSAPP: "", INSTAGRAM: "", TIKTOK: "", FACEBOOK: "", PHONE: "", DIRECTIONS: "",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonSafely<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function getResponseError(data: unknown, fallback: string): string {
  if (isRecord(data) && typeof data.error === "string" && data.error.trim()) {
    return data.error;
  }
  return fallback;
}

function parseProductCapacity(data: unknown): ProductCapacity | null {
  if (!isRecord(data)) return null;

  const maxActiveProducts = data.maxActiveProducts;
  const baseMaxActiveProducts = data.baseMaxActiveProducts;
  const referralBonusSlots = data.referralBonusSlots;

  if (
    typeof maxActiveProducts !== "number" ||
    !Number.isSafeInteger(maxActiveProducts) ||
    maxActiveProducts < 0 ||
    typeof baseMaxActiveProducts !== "number" ||
    !Number.isSafeInteger(baseMaxActiveProducts) ||
    baseMaxActiveProducts < 0 ||
    typeof referralBonusSlots !== "number" ||
    !Number.isSafeInteger(referralBonusSlots) ||
    referralBonusSlots < 0 ||
    baseMaxActiveProducts + referralBonusSlots !== maxActiveProducts
  ) {
    return null;
  }

  return {
    maxActiveProducts,
    baseMaxActiveProducts,
    referralBonusSlots,
  };
}

function getSocialValue(links: SellerSocialLink[] | undefined, platform: SocialPlatform): string {
  return links?.find((link) => link.platform === platform)?.handle ?? "";
}

function getSocialValues(links: SellerSocialLink[] | undefined, fallbackPhone?: string | null): Record<SocialPlatform, string> {
  return {
    WHATSAPP: getSocialValue(links, "WHATSAPP"),
    INSTAGRAM: getSocialValue(links, "INSTAGRAM"),
    TIKTOK: getSocialValue(links, "TIKTOK"),
    FACEBOOK: getSocialValue(links, "FACEBOOK"),
    PHONE: getSocialValue(links, "PHONE") || fallbackPhone?.trim() || "",
    DIRECTIONS: getSocialValue(links, "DIRECTIONS"),
  };
}

function buildSocialLinks(values: Record<SocialPlatform, string>) {
  return SOCIAL_PLATFORMS.map(({ value }) => ({ platform: value, handle: values[value].trim() })).filter((item) => item.handle);
}

function looksLikeHouseNumber(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return Boolean(normalized) && (/^\d+[a-z]?\b/.test(normalized) || /^(shop|house|building|block|plot|suite|unit|flat)\b/.test(normalized));
}

function parseLocationAddress(address: string | null | undefined, area: string): { houseNumber: string; street: string; city: string } {
  const trimmedAddress = typeof address === "string" ? address.trim() : "";
  if (!trimmedAddress) return { houseNumber: "", street: "", city: "" };
  const parts = trimmedAddress.split(",").map((part) => part.trim()).filter(Boolean);
  const withoutCountry = parts.at(-1)?.toLowerCase() === DEFAULT_COUNTRY.toLowerCase() ? parts.slice(0, -1) : parts;
  let areaIndex = -1;
  for (let index = 0; index < withoutCountry.length; index += 1) {
    if (area.trim() && withoutCountry[index].toLowerCase() === area.trim().toLowerCase()) areaIndex = index;
  }
  if (areaIndex < 0) return { houseNumber: "", street: withoutCountry.join(", "), city: "" };
  const beforeArea = withoutCountry.slice(0, areaIndex);
  const city = withoutCountry.slice(areaIndex + 1).join(", ");
  if (beforeArea.length === 0) return { houseNumber: "", street: "", city };
  if (beforeArea.length === 1) return { houseNumber: "", street: beforeArea[0], city };
  if (looksLikeHouseNumber(beforeArea[0])) return { houseNumber: beforeArea[0], street: beforeArea.slice(1).join(", "), city };
  return { houseNumber: "", street: beforeArea.join(", "), city };
}

function buildLocationAddressPreview(area: string, houseNumber: string, street: string, city: string): string {
  return [houseNumber.trim(), street.trim(), area.trim(), city.trim(), DEFAULT_COUNTRY].filter(Boolean).join(", ");
}

function getInitialBusinessForm(business: SellerBusiness): BusinessForm {
  const parsed = parseLocationAddress(business.location?.address, business.location?.area ?? "");
  return {
    name: business.name ?? "", ownerName: business.ownerName ?? "", description: business.description ?? "",
    area: business.location?.area ?? "", houseNumber: parsed.houseNumber, street: parsed.street, city: parsed.city,
    categoryId: business.categories?.[0]?.category?.id ?? "", availability: business.availability ?? "ASK_SELLER",
    priceMin: business.priceMin != null ? String(business.priceMin) : "",
    priceMax: business.priceMax != null ? String(business.priceMax) : "",
  };
}

function getBusinessStatusClasses(status: RecordStatus): string {
  if (status === "ACTIVE") return "bg-[#DDF5EA] text-[#137A59]";
  if (status === "PENDING") return "bg-[#FFF5D9] text-[#9A6700]";
  return "bg-gray-100 text-gray-600";
}
function getProductStatusClasses(status: RecordStatus): string {
  return getBusinessStatusClasses(status);
}
function getDeletionStatusClasses(status: DeletionRequest["status"]): string {
  if (status === "PENDING") return "bg-[#FFF5D9] text-[#9A6700]";
  if (status === "APPROVED") return "bg-[#E7F0FF] text-[#3566B8]";
  return "bg-[#FFF0EE] text-[#C5402D]";
}
function formatAvailability(value: Availability): string {
  if (value === "AVAILABLE") return "Available";
  if (value === "UNAVAILABLE") return "Unavailable";
  return "Ask seller";
}

const inputClass = "h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] bg-white px-4 text-sm text-[#17202A] outline-none transition placeholder:text-gray-400 focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:cursor-not-allowed disabled:bg-gray-50";
const labelClass = "mb-2 block text-xs font-bold text-gray-700";
const secondaryButtonClass = "inline-flex items-center justify-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-4 py-2.5 text-xs font-bold text-gray-700 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/20 disabled:cursor-not-allowed disabled:opacity-50";
const primaryButtonClass = "inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-bold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/25 disabled:cursor-not-allowed disabled:opacity-60";

export default function SellerDashboard() {
  const router = useRouter();
  const [business, setBusiness] = useState<SellerBusiness | null>(null);
  const [productCapacity, setProductCapacity] = useState<ProductCapacity>({
    maxActiveProducts: MAX_ACTIVE_PRODUCTS,
    baseMaxActiveProducts: MAX_ACTIVE_PRODUCTS,
    referralBonusSlots: 0,
  });
  const [categories, setCategories] = useState<SellerCategory[]>([]);
  const [deletionRequest, setDeletionRequest] = useState<DeletionRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashboardLoadFailed, setDashboardLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [redirecting, setRedirecting] = useState(false);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [updatingProduct, setUpdatingProduct] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [submittingDeletionRequest, setSubmittingDeletionRequest] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState(false);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [showDeletionForm, setShowDeletionForm] = useState(false);
  const [deletionReason, setDeletionReason] = useState("");
  const [categoryChanged, setCategoryChanged] = useState(false);
  const [socialValues, setSocialValues] = useState<Record<SocialPlatform, string>>(INITIAL_SOCIAL_VALUES);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [businessForm, setBusinessForm] = useState<BusinessForm>(INITIAL_BUSINESS_FORM);
  const [productForm, setProductForm] = useState<ProductForm>(INITIAL_PRODUCT_FORM);
  const [showShareOptions, setShowShareOptions] = useState(false);
  const [shareNotice, setShareNotice] = useState("");
  const [shareNoticeIsError, setShareNoticeIsError] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const dashboardProducts = useMemo(
    () => business?.products?.filter((product) => !product.deletedAt) ?? [],
    [business?.products],
  );
  const activeProductCount = dashboardProducts.filter((product) => product.status === "ACTIVE").length;
  const reachedProductLimit = activeProductCount >= productCapacity.maxActiveProducts;
  const remainingProductSlots = Math.max(0, productCapacity.maxActiveProducts - activeProductCount);
  const canShareBusiness = Boolean(business && business.status === "ACTIVE" && !business.deletedAt);

  const profileIsComplete = Boolean(
    business?.name.trim() && business.location?.area.trim() && business.location?.address?.trim() &&
    (business.phone?.trim() || business.socialLinks?.some((link) => link.platform === "PHONE" || link.platform === "WHATSAPP")),
  );
  const onboardingSteps = [
    { label: "Create your business profile", done: Boolean(business) },
    { label: "Add your location and contact details", done: profileIsComplete },
    { label: "Add your first product", done: dashboardProducts.length > 0 },
    { label: "Make your profile public", done: canShareBusiness },
  ];
  const completedSteps = onboardingSteps.filter((step) => step.done).length;
  const nextAction = !business
    ? { title: "Set up your business", description: "Start with the basics. You can complete the optional details later.", label: "Create business" }
    : dashboardProducts.length === 0
      ? { title: "Add your first product", description: "Give nearby customers something specific to discover.", label: "Add first product" }
      : !profileIsComplete
        ? { title: "Complete your business profile", description: "Add a street address and a contact method so customers know how to reach you.", label: "Complete profile" }
        : !canShareBusiness
          ? { title: "Check your business status", description: "Your profile can be shared once it is active and publicly visible.", label: "View status" }
          : { title: "Help more people find you", description: "Share your public business profile with customers and local communities.", label: "Share business" };

  const clearFeedback = useCallback(() => {
    setError("");
    setSuccess("");
  }, []);

  const loadDashboard = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setDashboardLoadFailed(false);
    setRedirecting(false);
    setError("");
    try {
      const businessResponse = await fetch("/api/seller/business", { cache: "no-store", signal });
      if (businessResponse.status === 401 || businessResponse.status === 403) {
        setRedirecting(true);
        router.replace("/seller/login");
        return;
      }
      if (!businessResponse.ok) throw new Error("Unable to load seller business.");
      const businessData = await readJsonSafely<ApiBusinessResponse>(businessResponse);
      if (!businessData || !Object.prototype.hasOwnProperty.call(businessData, "business")) {
        throw new Error("The seller business response was invalid.");
      }
      const loadedBusiness = businessData.business ?? null;
      const [categoriesResponse, deletionResponse, productsResponse] = await Promise.all([
        fetch("/api/categories", { cache: "no-store", signal }).catch(() => null),
        fetch("/api/seller/business/deletion-request", { cache: "no-store", signal }).catch(() => null),
        loadedBusiness
          ? fetch("/api/seller/products", { cache: "no-store", signal }).catch(() => null)
          : Promise.resolve(null),
      ]);
      const categoryData = categoriesResponse?.ok
        ? await readJsonSafely<ApiCategoriesResponse>(categoriesResponse)
        : null;
      const deletionData = deletionResponse?.ok
        ? await readJsonSafely<ApiDeletionResponse>(deletionResponse)
        : null;
      let loadedProductCapacity: ProductCapacity | null = null;
      if (loadedBusiness) {
        if (!productsResponse?.ok) {
          throw new Error("Unable to load product capacity. Please try again.");
        }
        const productsData = await readJsonSafely<ApiSellerProductsResponse>(productsResponse);
        loadedProductCapacity = parseProductCapacity(productsData);
        if (!loadedProductCapacity) {
          throw new Error("The seller product-capacity response was invalid.");
        }
      }
      if (signal.aborted) return;
      setBusiness(loadedBusiness);
      setProductCapacity(loadedProductCapacity ?? {
        maxActiveProducts: MAX_ACTIVE_PRODUCTS,
        baseMaxActiveProducts: MAX_ACTIVE_PRODUCTS,
        referralBonusSlots: 0,
      });
      setCategories(Array.isArray(categoryData?.categories) ? categoryData.categories : []);
      setDeletionRequest(deletionData?.request ?? null);
      if (loadedBusiness) {
        setBusinessForm(getInitialBusinessForm(loadedBusiness));
        setSocialValues(getSocialValues(loadedBusiness.socialLinks, loadedBusiness.phone));
      } else {
        setBusinessForm(INITIAL_BUSINESS_FORM);
        setSocialValues(INITIAL_SOCIAL_VALUES);
      }
      setDashboardLoadFailed(false);
    } catch (loadError) {
      if (signal.aborted) return;
      console.error("Seller dashboard load error:", loadError);
      setError("Unable to load your seller dashboard. Please try again.");
      setDashboardLoadFailed(true);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    void loadDashboard(controller.signal);
    return () => controller.abort();
  }, [loadDashboard, loadAttempt]);

  function updateBusinessField<K extends keyof BusinessForm>(field: K, value: BusinessForm[K]) {
    setBusinessForm((current) => ({ ...current, [field]: value }));
    clearFeedback();
  }
  function updateProductField<K extends keyof ProductForm>(field: K, value: ProductForm[K]) {
    setProductForm((current) => ({ ...current, [field]: value }));
    clearFeedback();
  }
  function updateSocial(platform: SocialPlatform, value: string) {
    setSocialValues((current) => ({ ...current, [platform]: value }));
    clearFeedback();
  }

  function getBusinessFormPrices() {
    const priceMin = businessForm.priceMin.trim() === "" ? null : Number(businessForm.priceMin);
    const priceMax = businessForm.priceMax.trim() === "" ? null : Number(businessForm.priceMax);
    return { priceMin, priceMax };
  }
  function validateBusinessPrices() {
    const { priceMin, priceMax } = getBusinessFormPrices();
    if (priceMin !== null && (!Number.isSafeInteger(priceMin) || priceMin < 0)) {
      setError("Minimum price must be a valid whole number."); return false;
    }
    if (priceMax !== null && (!Number.isSafeInteger(priceMax) || priceMax < 0)) {
      setError("Maximum price must be a valid whole number."); return false;
    }
    if (priceMin !== null && priceMax !== null && priceMin > priceMax) {
      setError("Minimum price cannot be greater than maximum price."); return false;
    }
    return true;
  }
  function validateBusinessLocation() {
    if (!businessForm.area.trim()) { setError("Business area is required."); return false; }
    if (!businessForm.street.trim()) { setError("Street, road, or close is required."); return false; }
    return true;
  }
  function buildBusinessLocationPayload() {
    return {
      area: businessForm.area.trim(),
      houseNumber: businessForm.houseNumber.trim(),
      street: businessForm.street.trim(),
      city: businessForm.city.trim(),
    };
  }

  function startEditingBusiness() {
    if (!business) return;
    clearFeedback();
    setBusinessForm(getInitialBusinessForm(business));
    setSocialValues(getSocialValues(business.socialLinks, business.phone));
    setCategoryChanged(false);
    setEditingBusiness(true);
  }
  function cancelEditingBusiness() {
    if (!business || savingBusiness) return;
    setBusinessForm(getInitialBusinessForm(business));
    setSocialValues(getSocialValues(business.socialLinks, business.phone));
    setCategoryChanged(false);
    setEditingBusiness(false);
    clearFeedback();
  }

  function applyBusinessToForm(updatedBusiness: SellerBusiness) {
    setBusiness(updatedBusiness);
    setBusinessForm(getInitialBusinessForm(updatedBusiness));
    setSocialValues(getSocialValues(updatedBusiness.socialLinks, updatedBusiness.phone));
  }

  async function createBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingBusiness) return;
    clearFeedback();
    if (!businessForm.name.trim()) { setError("Business name is required."); return; }
    if (!validateBusinessLocation() || !validateBusinessPrices()) return;
    const { priceMin, priceMax } = getBusinessFormPrices();
    setSavingBusiness(true);
    try {
      const response = await fetch("/api/seller/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: businessForm.name.trim(), ownerName: businessForm.ownerName.trim(), description: businessForm.description.trim(),
          ...buildBusinessLocationPayload(), socialLinks: buildSocialLinks(socialValues),
          categoryIds: businessForm.categoryId ? [businessForm.categoryId] : [],
          availability: businessForm.availability, priceMin, priceMax,
        }),
      });
      const data = await readJsonSafely<ApiBusinessResponse>(response);
      if (response.status === 401 || response.status === 403) { router.replace("/seller/login"); return; }
      if (!response.ok) { setError(getResponseError(data, "Unable to create your business.")); return; }
      const created = data?.business ?? null;
      if (!created) {
        setError("The server accepted the request but did not return your business. Refresh the dashboard before trying again.");
        setDashboardLoadFailed(true);
        return;
      }
      applyBusinessToForm(created);
      setSuccess("Your business has been created. Next, add your first product.");
      setShowShareOptions(false);
    } catch (createError) {
      console.error("Seller business creation error:", createError);
      setError("We could not confirm the save. Refresh your dashboard before submitting the business again.");
    } finally {
      setSavingBusiness(false);
    }
  }

  async function updateBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingBusiness || !business) return;
    clearFeedback();
    if (!businessForm.name.trim()) { setError("Business name is required."); return; }
    if (!validateBusinessLocation() || !validateBusinessPrices()) return;
    const { priceMin, priceMax } = getBusinessFormPrices();
    setSavingBusiness(true);
    try {
      const body: Record<string, unknown> = {
        name: businessForm.name.trim(), ownerName: businessForm.ownerName.trim(), description: businessForm.description.trim(),
        ...buildBusinessLocationPayload(), socialLinks: buildSocialLinks(socialValues),
        availability: businessForm.availability, priceMin, priceMax,
      };
      if (categoryChanged) body.categoryIds = businessForm.categoryId ? [businessForm.categoryId] : [];
      const response = await fetch("/api/seller/business", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await readJsonSafely<ApiBusinessResponse>(response);
      if (response.status === 401 || response.status === 403) { router.replace("/seller/login"); return; }
      if (!response.ok) { setError(getResponseError(data, "Unable to update your business.")); return; }
      const updated = data?.business ?? null;
      if (!updated) { setError("The server did not return the updated business. Refresh to verify your changes."); return; }
      applyBusinessToForm(updated);
      setCategoryChanged(false);
      setEditingBusiness(false);
      setSuccess("Your business has been updated successfully.");
    } catch (updateError) {
      console.error("Seller business update error:", updateError);
      setError("We could not confirm the update. Refresh your dashboard to verify your changes.");
    } finally {
      setSavingBusiness(false);
    }
  }

  function getBusinessShareUrl(): string {
    if (!business || typeof window === "undefined") return "";
    return new URL(`/seller/${encodeURIComponent(business.id)}`, window.location.origin).toString();
  }
  function setShareMessage(message: string, isError = false) {
    setShareNotice(message);
    setShareNoticeIsError(isError);
  }
  async function copyBusinessShareLink() {
    if (!business || !canShareBusiness) {
      setShareMessage("Your business must be active and publicly visible before it can be shared.", true); return;
    }
    const url = getBusinessShareUrl();
    if (!url) { setShareMessage("Unable to create the business link.", true); return; }
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setShareMessage("Business profile link copied successfully.");
      return;
    } catch { /* Use the compatibility fallback below. */ }
    let textarea: HTMLTextAreaElement | null = null;
    let copied = false;
    try {
      textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      copied = document.execCommand("copy");
    } catch { copied = false; } finally { textarea?.remove(); }
    setShareMessage(copied ? "Business profile link copied successfully." : "Copying failed. Open your public business page and copy its URL from the address bar.", !copied);
  }
  async function shareBusinessFromDevice() {
    if (!business || !canShareBusiness) {
      setShareMessage("Your business must be active and publicly visible before it can be shared.", true); return;
    }
    const url = getBusinessShareUrl();
    if (!url) { setShareMessage("Unable to create the business link.", true); return; }
    if (typeof navigator.share !== "function") { await copyBusinessShareLink(); return; }
    try {
      await navigator.share({ title: `${business.name} | ReMarket`, text: `Discover ${business.name} on ReMarket. Find it nearby.`, url });
      setShareNotice(""); setShareNoticeIsError(false);
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === "AbortError") return;
      await copyBusinessShareLink();
    }
  }
  function getBusinessShareTarget(platform: BusinessSharePlatform): string {
    if (!business || !canShareBusiness) return "";
    const url = getBusinessShareUrl();
    if (!url) return "";
    const encodedUrl = encodeURIComponent(url);
    const message = `Discover ${business.name} on ReMarket. Find it nearby.`;
    switch (platform) {
      case "WHATSAPP": return `https://wa.me/?text=${encodeURIComponent(`${message} ${url}`)}`;
      case "FACEBOOK": return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
      case "LINKEDIN": return `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`;
      case "X": return `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}&url=${encodedUrl}`;
    }
  }
  function openBusinessShareTarget(platform: BusinessSharePlatform) {
    const target = getBusinessShareTarget(platform);
    if (!target) { setShareMessage("Unable to create the sharing link.", true); return; }
    window.open(target, "_blank", "noopener,noreferrer");
    setShareMessage(`Continue sharing your business on ${platform}. If the new tab did not open, use Copy profile link instead.`);
  }

  function resetProductForm() { setProductForm(INITIAL_PRODUCT_FORM); }
  function openProductForm() {
    if (reachedProductLimit || creatingProduct || updatingProduct) return;
    clearFeedback(); setEditingProductId(null); resetProductForm(); setShowProductForm(true);
  }
  function closeProductForm() {
    if (creatingProduct || updatingProduct) return;
    setShowProductForm(false); setEditingProductId(null); resetProductForm(); clearFeedback();
  }
  function startEditingProduct(product: SellerProduct) {
    clearFeedback();
    setProductForm({
      name: product.name ?? "", description: product.description ?? "", categoryId: product.category?.id ?? "",
      price: product.price != null ? String(product.price) : "",
      priceMin: product.priceMin != null ? String(product.priceMin) : "",
      priceMax: product.priceMax != null ? String(product.priceMax) : "",
      availability: product.availability ?? "ASK_SELLER",
      images: Array.isArray(product.images) && product.images.length
        ? [...product.images].sort((a, b) => a.sortOrder - b.sortOrder).map((image) => image.url)
        : product.imageUrl ? [product.imageUrl] : [],
    });
    setEditingProductId(product.id); setShowProductForm(true);
  }
  function getProductFormPrices() {
    return {
      price: productForm.price.trim() === "" ? null : Number(productForm.price),
      priceMin: productForm.priceMin.trim() === "" ? null : Number(productForm.priceMin),
      priceMax: productForm.priceMax.trim() === "" ? null : Number(productForm.priceMax),
    };
  }
  function validateProductForm() {
    if (!productForm.name.trim()) { setError("Product name is required."); return false; }
    const { price, priceMin, priceMax } = getProductFormPrices();
    if (price !== null && (!Number.isSafeInteger(price) || price < 0)) { setError("Price must be a valid whole number."); return false; }
    if (priceMin !== null && (!Number.isSafeInteger(priceMin) || priceMin < 0)) { setError("Minimum price must be a valid whole number."); return false; }
    if (priceMax !== null && (!Number.isSafeInteger(priceMax) || priceMax < 0)) { setError("Maximum price must be a valid whole number."); return false; }
    if (priceMin !== null && priceMax !== null && priceMin > priceMax) { setError("Minimum price cannot be greater than maximum price."); return false; }
    if (price !== null && (priceMin !== null || priceMax !== null)) { setError("Use one price or a price range, not both."); return false; }
    return true;
  }

  const reloadBusiness = useCallback(async () => {
    const response = await fetch("/api/seller/business", { cache: "no-store" });
    if (response.status === 401 || response.status === 403) { router.replace("/seller/login"); throw new Error("Your session has expired. Please sign in again."); }
    if (!response.ok) throw new Error("Unable to refresh the dashboard.");
    const data = await readJsonSafely<ApiBusinessResponse>(response);
    if (!data || !Object.prototype.hasOwnProperty.call(data, "business")) throw new Error("The seller business response was invalid.");

    const refreshedBusiness = data.business ?? null;
    if (!refreshedBusiness) {
      setProductCapacity({
        maxActiveProducts: MAX_ACTIVE_PRODUCTS,
        baseMaxActiveProducts: MAX_ACTIVE_PRODUCTS,
        referralBonusSlots: 0,
      });
      setBusiness(null);
      return null;
    }

    const productsResponse = await fetch("/api/seller/products", { cache: "no-store" });
    if (productsResponse.status === 401 || productsResponse.status === 403) {
      router.replace("/seller/login");
      throw new Error("Your session has expired. Please sign in again.");
    }
    if (!productsResponse.ok) throw new Error("Unable to refresh product capacity.");

    const productsData = await readJsonSafely<ApiSellerProductsResponse>(productsResponse);
    const refreshedCapacity = parseProductCapacity(productsData);
    if (!refreshedCapacity) throw new Error("The seller product-capacity response was invalid.");

    setBusiness(refreshedBusiness);
    setProductCapacity(refreshedCapacity);
    return refreshedBusiness;
  }, [router]);

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creatingProduct || !business || reachedProductLimit) return;
    clearFeedback(); if (!validateProductForm()) return;
    const { price, priceMin, priceMax } = getProductFormPrices();
    setCreatingProduct(true);
    try {
      const response = await fetch("/api/seller/products", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: productForm.name.trim(), description: productForm.description.trim(), categoryId: productForm.categoryId || null, price, priceMin, priceMax, availability: productForm.availability, images: productForm.images }),
      });
      const data = await readJsonSafely<ApiErrorResponse>(response);
      if (response.status === 401 || response.status === 403) { router.replace("/seller/login"); return; }
      if (!response.ok) { setError(getResponseError(data, "Unable to create product.")); return; }
      // The create request succeeded. Do not ask the seller to submit it again if refreshing fails.
      setShowProductForm(false); setEditingProductId(null); resetProductForm();
      try {
        await reloadBusiness();
        setSuccess("Product added successfully. Add another product or share your business.");
      } catch (refreshError) {
        console.error("Product was created but dashboard refresh failed:", refreshError);
        setSuccess("Product saved successfully, but the dashboard could not refresh. Reload the page to see the latest product.");
      }
    } catch (productError) {
      console.error("Seller product creation error:", productError);
      setError("We could not confirm the product save. Refresh your dashboard before submitting it again.");
    } finally { setCreatingProduct(false); }
  }

  async function updateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (updatingProduct || !editingProductId) return;
    clearFeedback(); if (!validateProductForm()) return;
    const { price, priceMin, priceMax } = getProductFormPrices();
    setUpdatingProduct(true);
    try {
      const response = await fetch(`/api/seller/products/${encodeURIComponent(editingProductId)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: productForm.name.trim(), description: productForm.description.trim(), categoryId: productForm.categoryId || null, price, priceMin, priceMax, availability: productForm.availability, images: productForm.images }),
      });
      const data = await readJsonSafely<ApiErrorResponse>(response);
      if (response.status === 401 || response.status === 403) { router.replace("/seller/login"); return; }
      if (!response.ok) { setError(getResponseError(data, "Unable to update product.")); return; }
      const editedId = editingProductId;
      setShowProductForm(false); setEditingProductId(null); resetProductForm();
      try { await reloadBusiness(); setSuccess("Product updated successfully."); }
      catch (refreshError) { console.error("Product updated but dashboard refresh failed:", refreshError); setSuccess(`Product ${editedId ? "updated" : "saved"}, but the dashboard could not refresh. Reload the page to verify the change.`); }
    } catch (productError) {
      console.error("Seller product update error:", productError);
      setError("We could not confirm the product update. Refresh your dashboard to verify the change.");
    } finally { setUpdatingProduct(false); }
  }

  async function deleteProduct(product: SellerProduct) {
    if (deletingProductId) return;
    const confirmed = window.confirm(`Delete “${product.name}” from your active products?`);
    if (!confirmed) return;
    clearFeedback(); setDeletingProductId(product.id);
    try {
      const response = await fetch(`/api/seller/products/${encodeURIComponent(product.id)}`, { method: "DELETE" });
      const data = await readJsonSafely<ApiErrorResponse>(response);
      if (response.status === 401 || response.status === 403) { router.replace("/seller/login"); return; }
      if (!response.ok) { setError(getResponseError(data, "Unable to delete product.")); return; }
      if (editingProductId === product.id) { resetProductForm(); setEditingProductId(null); setShowProductForm(false); }
      try { await reloadBusiness(); setSuccess("Product deleted successfully."); }
      catch (refreshError) { console.error("Product deleted but dashboard refresh failed:", refreshError); setSuccess("Product deleted successfully, but the dashboard could not refresh. Reload the page to confirm the latest list."); }
    } catch (deleteError) {
      console.error("Seller product deletion error:", deleteError);
      setError("We could not confirm the deletion. Refresh your dashboard before trying again.");
    } finally { setDeletingProductId(null); }
  }

  function openDeletionForm() { clearFeedback(); setDeletionReason(""); setShowDeletionForm(true); }
  function closeDeletionForm() {
    if (submittingDeletionRequest) return;
    setDeletionReason(""); setShowDeletionForm(false); setError("");
  }
  async function submitDeletionRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingDeletionRequest || !business) return;
    clearFeedback(); setSubmittingDeletionRequest(true);
    try {
      const response = await fetch("/api/seller/business/deletion-request", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: deletionReason.trim() }),
      });
      const data = await readJsonSafely<ApiDeletionResponse>(response);
      if (response.status === 401 || response.status === 403) { router.replace("/seller/login"); return; }
      if (!response.ok) { setError(getResponseError(data, "Unable to submit deletion request.")); return; }
      setDeletionRequest(data?.request ?? null); setDeletionReason(""); setShowDeletionForm(false);
      setSuccess("Your business deletion request has been submitted for admin review. Your business is not deleted immediately.");
    } catch (requestError) {
      console.error("Seller deletion request error:", requestError);
      setError("We could not confirm your deletion request. Refresh the dashboard before submitting it again.");
    } finally { setSubmittingDeletionRequest(false); }
  }

  async function logout() { await signOut({ callbackUrl: "/seller/login" }); }

  function handleNextAction() {
    clearFeedback();
    if (!business) {
      document.getElementById("business-create-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("create-business-name")?.focus({ preventScroll: true });
      return;
    }
    if (dashboardProducts.length === 0 || !reachedProductLimit) {
      if (dashboardProducts.length === 0) { openProductForm(); document.getElementById("products-section")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    }
    if (!profileIsComplete) { startEditingBusiness(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (canShareBusiness) { setShowShareOptions(true); setShareNotice(""); setShareNoticeIsError(false); document.getElementById("business-overview")?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    document.getElementById("business-overview")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (loading || redirecting) {
    return <main className="flex min-h-dvh w-full items-center justify-center bg-[#FFFDFC] px-4"><div className="flex items-center gap-3 text-sm font-medium text-gray-600"><LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin text-[#FF5A36]" />{redirecting ? "Redirecting to login..." : "Loading seller dashboard..."}</div></main>;
  }
  if (dashboardLoadFailed) {
    return <main className="flex min-h-dvh w-full items-center justify-center bg-[#FFFDFC] px-4 py-8"><section className="w-full max-w-[480px] rounded-[22px] border border-[#E8E4DE] bg-white p-6 text-center shadow-sm sm:p-8"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#FFF0EE] text-[#E33B22]"><AlertCircle aria-hidden="true" className="h-6 w-6" /></div><h1 className="mt-4 text-xl font-bold text-[#17202A]">Unable to load your dashboard</h1><p role="alert" className="mt-2 text-sm leading-6 text-gray-500">{error || "Your business information could not be loaded."}</p><button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)} className={`${primaryButtonClass} mt-5`}>Try again</button></section></main>;
  }

  return (
    <main className="min-h-dvh w-full overflow-x-clip bg-[#FFFDFC] text-[#17202A]">
      <header className="sticky top-0 z-50 flex min-h-[66px] w-full items-center justify-between gap-3 border-b border-[#EAE6DF] bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
        <Link href="/seller" className="flex shrink-0 items-center gap-2.5" aria-label="ReMarket Seller Portal home">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF5A36] text-white shadow-sm"><Store className="h-5 w-5" /></span>
          <span><span className="block text-sm font-bold tracking-tight">ReMarket</span><span className="block text-[10px] leading-none text-gray-400">Seller Portal</span></span>
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Seller navigation">
          <Link href="/seller" className="inline-flex items-center gap-2 rounded-xl bg-[#FFF0E9] px-3 py-2.5 text-xs font-bold text-[#FF5A36]"><Store className="h-4 w-4" />Dashboard</Link>
          <Link href="/seller/profile" className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-600 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18]"><UserRound className="h-4 w-4" />Profile</Link>
          <Link href="/seller/claims" className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold text-gray-600 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18]"><ShieldCheck className="h-4 w-4" />Claims</Link>
        </nav>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-1.5 md:flex lg:hidden">
            <Link href="/seller/profile" aria-label="Seller profile" className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E8E4DE] bg-white text-gray-600 hover:bg-[#FFF7ED]"><UserRound className="h-4 w-4" /></Link>
            <Link href="/seller/claims" aria-label="Business claims" className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E8E4DE] bg-white text-gray-600 hover:bg-[#FFF7ED]"><ShieldCheck className="h-4 w-4" /></Link>
          </div>
          <div
            className="relative z-50 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#E8E4DE] bg-white shadow-sm [&_button]:!visible [&_button]:!flex [&_button]:!h-9 [&_button]:!w-9 [&_button]:!items-center [&_button]:!justify-center [&_button]:!rounded-lg [&_button]:!text-[#17202A] [&_button]:!opacity-100"
            aria-label="Notifications"
            title="Notifications"
          >
            {/* Visible fallback glyph; pointer events pass through to the real notification control. */}
            <span className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
              <Bell aria-hidden="true" className="h-5 w-5 text-[#17202A]" />
            </span>
            <span className="relative z-10 flex h-9 w-9 items-center justify-center">
              <NotificationBell />
            </span>
          </div>
          <button type="button" onClick={logout} className={`${secondaryButtonClass} !px-3`}><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Log out</span></button>
          <button type="button" onClick={() => setMobileNavOpen((open) => !open)} aria-expanded={mobileNavOpen} aria-label={mobileNavOpen ? "Close navigation" : "Open navigation"} className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#E8E4DE] text-gray-600 md:hidden"><span className="text-lg leading-none">{mobileNavOpen ? "×" : "☰"}</span></button>
        </div>
        {mobileNavOpen && <nav className="absolute left-0 right-0 top-full grid gap-1 border-b border-[#EAE6DF] bg-white p-3 shadow-lg md:hidden" aria-label="Mobile seller navigation"><Link onClick={() => setMobileNavOpen(false)} href="/seller" className="rounded-xl bg-[#FFF0E9] px-4 py-3 text-sm font-bold text-[#FF5A36]">Dashboard</Link><Link onClick={() => setMobileNavOpen(false)} href="/seller/profile" className="rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-[#FFF7ED]">Profile</Link><Link onClick={() => setMobileNavOpen(false)} href="/seller/claims" className="rounded-xl px-4 py-3 text-sm font-medium text-gray-700 hover:bg-[#FFF7ED]">Claims</Link></nav>}
      </header>

      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-10">
        <div className="mb-7 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#FF5A36]">Seller Dashboard</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">Manage your business</h1>
            <p className="mt-2 max-w-[700px] text-sm leading-6 text-gray-500">Keep your details up to date, add products and help nearby customers discover what you offer.</p>
          </div>
          {business && <div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ${getBusinessStatusClasses(business.status)}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{business.status}</span>{business.verification === "VERIFIED" && <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E7F0FF] px-3 py-1.5 text-[11px] font-bold text-[#3566B8]"><ShieldCheck className="h-3.5 w-3.5" />Verified</span>}</div>}
        </div>

        {error && <div role="alert" aria-live="polite" className="mb-5 flex items-start gap-3 rounded-2xl border border-[#FFB8B0] bg-[#FFF0EE] px-4 py-4"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#E33B22]" /><p className="text-sm text-[#C5402D]">{error}</p></div>}
        {success && <div role="status" aria-live="polite" className="mb-5 flex items-start gap-3 rounded-2xl border border-[#BDE8D8] bg-[#EFFBF6] px-4 py-4"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#137A59]" /><p className="text-sm text-[#137A59]">{success}</p></div>}

        {/* Guided workflow: one visible next action, with a compact progress path. */}
        <section className="mb-6 overflow-hidden rounded-[24px] border border-[#F1D4C8] bg-gradient-to-br from-[#FFF5EF] via-white to-[#FCFAF6] shadow-sm">
          <div className="grid gap-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:items-center lg:p-7">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#FF5A36] text-white shadow-sm"><ClipboardCheck className="h-6 w-6" /></div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#B94128]">Your next step</p>
                <h2 className="mt-1 text-lg font-bold sm:text-xl">{nextAction.title}</h2>
                <p className="mt-1 max-w-[600px] text-sm leading-6 text-gray-600">{nextAction.description}</p>
                <button type="button" onClick={handleNextAction} className={`${primaryButtonClass} mt-4 min-h-11 px-5`}>{nextAction.label}<ArrowRight className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="rounded-2xl border border-white/90 bg-white/85 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-bold">Getting started</p><p className="mt-1 text-[11px] text-gray-500">A quick guide to a useful seller profile</p></div><span className="text-sm font-bold text-[#9F2D18]">{completedSteps}/4</span></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#F0E5DF]"><div className="h-full rounded-full bg-[#FF5A36] transition-all duration-300" style={{ width: `${(completedSteps / onboardingSteps.length) * 100}%` }} /></div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {onboardingSteps.map((step) => <div key={step.label} className="flex min-w-0 items-start gap-2 text-xs"><span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${step.done ? "bg-[#DDF5EA] text-[#137A59]" : "border border-[#D9DEE5] text-gray-300"}`}>{step.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-2.5 w-2.5" />}</span><span className={step.done ? "text-gray-500 line-through decoration-gray-300" : "font-medium text-gray-700"}>{step.label}</span></div>)}
              </div>
            </div>
          </div>
        </section>

        {!business && <section id="business-create-form" className="scroll-mt-24 rounded-[22px] border border-[#E8E4DE] bg-white shadow-sm">
          <div className="border-b border-[#EAE6DF] px-5 py-5 sm:px-6"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF0EB] text-[#FF5A36]"><Plus className="h-5 w-5" /></div><div><h2 className="text-lg font-bold">Add your business</h2><p className="mt-1 text-xs text-gray-500">Start with the essential details. You can update the rest later.</p></div></div></div>
          <form onSubmit={createBusiness} className="space-y-6 px-5 py-6 sm:px-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <div><label htmlFor="create-business-name" className={labelClass}>Business name <span className="text-[#FF5A36]">*</span></label><input id="create-business-name" className={inputClass} type="text" value={businessForm.name} onChange={(event) => updateBusinessField("name", event.target.value)} maxLength={150} placeholder="Your business name" required disabled={savingBusiness} /></div>
              <div><label htmlFor="create-category" className={labelClass}>Category</label><select id="create-category" className={inputClass} value={businessForm.categoryId} onChange={(event) => updateBusinessField("categoryId", event.target.value)} disabled={savingBusiness}><option value="">Select category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div>
            </div>
            <details className="group rounded-2xl border border-[#E8E4DE] bg-[#FCFAF6] p-4" open>
              <summary className="cursor-pointer list-none text-sm font-bold"><span className="flex items-center justify-between gap-3">Location details <span className="text-[11px] font-medium text-gray-400">Area and street are required<ArrowRight className="inline h-4 w-4 rotate-90" /></span></span></summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div><label htmlFor="create-area" className={labelClass}>Area <span className="text-[#FF5A36]">*</span></label><AreaCombobox id="create-area" value={businessForm.area} onChange={(value) => updateBusinessField("area", value)} placeholder="Type or choose a Lagos area" required disabled={savingBusiness} /><p className="mt-1.5 text-[10px] leading-4 text-gray-500">Open the list to browse areas by LGA, or type to filter suggestions. A custom value is also allowed.</p></div>
                <div><label htmlFor="create-city" className={labelClass}>City</label><input id="create-city" className={inputClass} value={businessForm.city} onChange={(event) => updateBusinessField("city", event.target.value)} placeholder="e.g. Lagos or Epe" maxLength={100} disabled={savingBusiness} /></div>
                <div><label htmlFor="create-house-number" className={labelClass}>House / shop number</label><input id="create-house-number" className={inputClass} value={businessForm.houseNumber} onChange={(event) => updateBusinessField("houseNumber", event.target.value)} placeholder="e.g. 12 or Shop 4" maxLength={100} disabled={savingBusiness} /></div>
                <div><label htmlFor="create-street" className={labelClass}>Street / road / close <span className="text-[#FF5A36]">*</span></label><input id="create-street" className={inputClass} value={businessForm.street} onChange={(event) => updateBusinessField("street", event.target.value)} placeholder="e.g. Agidingbi Road" maxLength={200} required disabled={savingBusiness} /></div>
              </div>
              <div className="mt-4 rounded-xl border border-[#E8E4DE] bg-white p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Address preview</p><p className="mt-1 break-words text-xs leading-5 text-gray-600">{buildLocationAddressPreview(businessForm.area, businessForm.houseNumber, businessForm.street, businessForm.city)}</p></div>
            </details>
            <details className="rounded-2xl border border-[#E8E4DE] p-4">
              <summary className="cursor-pointer list-none text-sm font-bold">Optional profile details <span className="ml-1 text-xs font-normal text-gray-400">Description, owner and contact links</span></summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div><label htmlFor="create-owner-name" className={labelClass}>Owner name</label><input id="create-owner-name" className={inputClass} value={businessForm.ownerName} onChange={(event) => updateBusinessField("ownerName", event.target.value)} maxLength={100} placeholder="Your name" disabled={savingBusiness} /></div>
                <div><label htmlFor="create-availability" className={labelClass}>Availability</label><select id="create-availability" className={inputClass} value={businessForm.availability} onChange={(event) => updateBusinessField("availability", event.target.value as Availability)} disabled={savingBusiness}><option value="ASK_SELLER">Ask seller</option><option value="AVAILABLE">Available</option><option value="UNAVAILABLE">Unavailable</option></select></div>
                <div className="sm:col-span-2"><label htmlFor="create-description" className={labelClass}>Business description</label><textarea id="create-description" className="w-full resize-y rounded-xl border border-[#D9DEE5] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50" value={businessForm.description} onChange={(event) => updateBusinessField("description", event.target.value)} placeholder="Tell customers what your business offers" rows={3} maxLength={2000} disabled={savingBusiness} /></div>
                {SOCIAL_PLATFORMS.map(({ value, label }) => <div key={value}><label htmlFor={`create-social-${value.toLowerCase()}`} className={labelClass}>{label}</label><input id={`create-social-${value.toLowerCase()}`} className={inputClass} type={value === "PHONE" ? "tel" : "text"} value={socialValues[value]} onChange={(event) => updateSocial(value, event.target.value)} placeholder={value === "PHONE" || value === "WHATSAPP" ? "080..." : value === "DIRECTIONS" ? "https://maps.google.com/..." : "@username or URL"} disabled={savingBusiness} /></div>)}
              </div>
            </details>
            <details className="rounded-2xl border border-[#E8E4DE] p-4">
              <summary className="cursor-pointer list-none text-sm font-bold">Optional price range <span className="ml-1 text-xs font-normal text-gray-400">For businesses that quote prices</span></summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2"><div><label htmlFor="create-price-min" className={labelClass}>Minimum price (₦)</label><input id="create-price-min" className={inputClass} type="number" min="0" step="1" value={businessForm.priceMin} onChange={(event) => updateBusinessField("priceMin", event.target.value)} placeholder="Leave empty if not applicable" disabled={savingBusiness} /></div><div><label htmlFor="create-price-max" className={labelClass}>Maximum price (₦)</label><input id="create-price-max" className={inputClass} type="number" min="0" step="1" value={businessForm.priceMax} onChange={(event) => updateBusinessField("priceMax", event.target.value)} placeholder="Leave empty if not applicable" disabled={savingBusiness} /></div></div>
            </details>
            <div className="flex flex-col gap-3 border-t border-[#EAE6DF] pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-gray-500">You can edit these details after creating your profile.</p><button type="submit" disabled={savingBusiness} className={`${primaryButtonClass} min-h-12 w-full px-6 text-sm sm:w-auto`}>{savingBusiness ? <><LoaderCircle className="h-4 w-4 animate-spin" />Creating business...</> : <><Plus className="h-4 w-4" />Create business</>}</button></div>
          </form>
        </section>}

        {business && <>
          {/* Overview remains first, keeping the existing warm card-based visual language. */}
          <section id="business-overview" className="scroll-mt-24 rounded-[22px] border border-[#E8E4DE] bg-white p-5 shadow-sm sm:p-6 lg:p-7">
            <div className="flex min-w-0 flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="flex min-w-0 items-start gap-4"><div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#FFF0EB] text-[#FF5A36]"><Store className="h-7 w-7" /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-xl font-bold">{business.name}</h2><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${getBusinessStatusClasses(business.status)}`}>{business.status}</span>{business.verification === "VERIFIED" && <span className="rounded-full bg-[#E7F0FF] px-2.5 py-1 text-[10px] font-bold text-[#3566B8]">Verified</span>}</div><p className="mt-1 max-w-3xl break-words text-sm leading-6 text-gray-500">{business.description || "Add a short description to help customers understand what your business offers."}</p></div></div>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap xl:justify-end"><button type="button" onClick={startEditingBusiness} className={secondaryButtonClass}><Pencil className="h-4 w-4" />Edit details</button><Link href={`/seller/${encodeURIComponent(business.id)}`} className={`${primaryButtonClass} min-h-10`}><span>Public page</span><ExternalLink className="h-4 w-4" /></Link><button type="button" onClick={() => { setShowShareOptions((value) => !value); setShareNotice(""); setShareNoticeIsError(false); }} disabled={!canShareBusiness} aria-expanded={showShareOptions} aria-controls="business-share-options" title={canShareBusiness ? "Share your public business profile" : "Your business must be active and publicly visible before sharing"} className={`${secondaryButtonClass} col-span-2 sm:col-span-1 disabled:opacity-50`}><Share2 className="h-4 w-4" />Share business</button></div>
            </div>

            {showShareOptions && canShareBusiness && <div id="business-share-options" className="mt-5 rounded-2xl border border-[#E8E4DE] bg-[#FCFAF6] p-4 sm:p-5"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0EB] text-[#FF5A36]"><Share2 className="h-5 w-5" /></div><div className="min-w-0"><h3 className="text-sm font-bold">Share your business</h3><p className="mt-1 text-xs leading-5 text-gray-500">Help more customers discover {business.name} on ReMarket.</p></div><button type="button" onClick={() => { setShowShareOptions(false); setShareNotice(""); }} aria-label="Close sharing options" className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E8E4DE] bg-white text-gray-500 hover:text-[#9F2D18]"><X className="h-4 w-4" /></button></div><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => void shareBusinessFromDevice()} className={primaryButtonClass}><Share2 className="h-4 w-4" />More sharing options</button><button type="button" onClick={() => void copyBusinessShareLink()} className={secondaryButtonClass}><Copy className="h-4 w-4" />Copy profile link</button></div><div className="mt-4 border-t border-[#E8E4DE] pt-4"><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">Share directly</p><div className="mt-3 flex flex-wrap gap-2">{([ ["WHATSAPP", "WhatsApp"], ["FACEBOOK", "Facebook"], ["LINKEDIN", "LinkedIn"], ["X", "X"] ] as const).map(([platform, label]) => <button key={platform} type="button" onClick={() => openBusinessShareTarget(platform)} className={secondaryButtonClass}><ExternalLink className="h-3.5 w-3.5" />{label}</button>)}</div><p className="mt-4 break-all text-[11px] leading-5 text-gray-500">Profile link: <span className="font-medium text-[#9F2D18]">/seller/{business.id}</span></p></div>{shareNotice && <p role={shareNoticeIsError ? "alert" : "status"} aria-live="polite" className={`mt-3 rounded-xl px-3 py-2.5 text-xs leading-5 ${shareNoticeIsError ? "border border-[#F1D5D0] bg-[#FFF0EE] text-[#C5402D]" : "border border-[#BDE8D8] bg-[#EFFBF6] text-[#137A59]"}`}>{shareNotice}</p>}</div>}
            {!canShareBusiness && <p className="mt-3 text-xs leading-5 text-gray-500">Sharing becomes available when your business is active and publicly visible.</p>}

            <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="min-w-0 rounded-2xl bg-[#FCFAF6] p-4"><div className="flex items-center gap-2 text-gray-400"><MapPin className="h-4 w-4 shrink-0" /><span className="text-[10px] font-semibold uppercase tracking-wide">Business address</span></div><p className="mt-2 break-words text-sm font-semibold text-gray-800">{business.location?.area || "Not set"}</p><p className="mt-1 break-words text-[11px] leading-5 text-gray-500">{business.location?.address || "Add your street address to help customers find you."}</p></div>
              <div className="min-w-0 rounded-2xl bg-[#FCFAF6] p-4"><div className="flex items-center gap-2 text-gray-400"><Phone className="h-4 w-4 shrink-0" /><span className="text-[10px] font-semibold uppercase tracking-wide">Phone</span></div><p className="mt-2 break-words text-sm font-semibold text-gray-800">{business.phone || getSocialValue(business.socialLinks, "PHONE") || "Not set"}</p></div>
              <div className="min-w-0 rounded-2xl bg-[#FCFAF6] p-4"><div className="flex items-center gap-2 text-gray-400"><Package className="h-4 w-4 shrink-0" /><span className="text-[10px] font-semibold uppercase tracking-wide">Active products</span></div><p className="mt-2 text-sm font-semibold text-gray-800">{activeProductCount}/{productCapacity.maxActiveProducts}</p><p className="mt-1 text-[11px] text-gray-500">{remainingProductSlots} slots remaining</p></div>
              <div className="min-w-0 rounded-2xl bg-[#FCFAF6] p-4"><div className="flex items-center gap-2 text-gray-400"><Store className="h-4 w-4 shrink-0" /><span className="text-[10px] font-semibold uppercase tracking-wide">Availability</span></div><p className="mt-2 break-words text-sm font-semibold text-gray-800">{formatAvailability(business.availability)}</p></div>
            </div>
            {business.categories.length > 0 && <div className="mt-5"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Categories</p><div className="mt-2 flex flex-wrap gap-2">{business.categories.map(({ category }) => <span key={category.id} className="rounded-full border border-[#E8E4DE] bg-white px-3 py-1.5 text-xs font-medium text-gray-700">{category.name}</span>)}</div></div>}
            <div className="mt-5 border-t border-[#EAE6DF] pt-5"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Contact & social links</p>{business.socialLinks.length > 0 ? <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{business.socialLinks.map((link) => { const label = SOCIAL_PLATFORMS.find((platform) => platform.value === link.platform)?.label ?? link.platform; return <div key={link.id} className="min-w-0 rounded-2xl bg-[#FCFAF6] p-4"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p><p className="mt-2 break-words text-sm font-semibold text-gray-800">{link.handle}</p></div>; })}</div> : <p className="mt-2 text-xs text-gray-500">No contact or social links have been added yet.</p>}</div>

            <div className="mt-6 border-t border-[#EAE6DF] pt-5"><div className="rounded-2xl border border-[#F1D5D0] bg-[#FFF9F7] p-4"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex min-w-0 items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0EE] text-[#C5402D]"><AlertTriangle className="h-5 w-5" /></div><div className="min-w-0"><h3 className="text-sm font-bold">Business deletion</h3><p className="mt-1 max-w-[650px] text-xs leading-5 text-gray-500">Deletion requires admin approval. Submitting a request does not remove your business immediately.</p></div></div>{deletionRequest && <span className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold ${getDeletionStatusClasses(deletionRequest.status)}`}>{deletionRequest.status}</span>}</div>
              {deletionRequest?.status === "PENDING" && <p className="mt-3 text-xs text-[#9A6700]">Your request is waiting for admin review.</p>}{deletionRequest?.status === "APPROVED" && <p className="mt-3 text-xs text-[#3566B8]">Your deletion request was approved by an admin.</p>}{deletionRequest?.status === "REJECTED" && <p className="mt-3 text-xs text-[#C5402D]">Your previous request was rejected. You may submit a new request.</p>}
              {(!deletionRequest || deletionRequest.status === "REJECTED") && <button type="button" onClick={openDeletionForm} className={`${secondaryButtonClass} mt-4 !border-[#E5B9B1] !text-[#C5402D]`}><Trash2 className="h-4 w-4" />Request business deletion</button>}
              {showDeletionForm && <form onSubmit={submitDeletionRequest} className="mt-4 rounded-2xl border border-[#F0CEC8] bg-white p-4"><h4 className="text-sm font-bold">Request business deletion</h4><p className="mt-1 text-xs leading-5 text-gray-500">Tell the admin why you want this business removed.</p><label htmlFor="deletion-reason" className={`${labelClass} mt-4`}>Reason (optional)</label><textarea id="deletion-reason" className="w-full resize-none rounded-xl border border-[#D9DEE5] px-4 py-3 text-sm outline-none focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50" value={deletionReason} onChange={(event) => setDeletionReason(event.target.value)} rows={4} maxLength={1000} placeholder="Optional reason for your request" disabled={submittingDeletionRequest} /><div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={closeDeletionForm} disabled={submittingDeletionRequest} className={secondaryButtonClass}><X className="h-4 w-4" />Cancel</button><button type="submit" disabled={submittingDeletionRequest} className={"inline-flex items-center justify-center gap-2 rounded-xl bg-[#C5402D] px-4 py-2.5 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"}>{submittingDeletionRequest ? <><LoaderCircle className="h-4 w-4 animate-spin" />Submitting...</> : <><Trash2 className="h-4 w-4" />Submit request</>}</button></div></form>}
            </div></div>
          </section>

          {editingBusiness && <section className="mt-5 rounded-[22px] border border-[#E8E4DE] bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-[#EAE6DF] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#FF5A36]">Business settings</p><h2 className="mt-1 text-lg font-bold">Edit your business</h2><p className="mt-1 text-xs text-gray-500">Update the information customers see on ReMarket.</p></div><button type="button" onClick={cancelEditingBusiness} disabled={savingBusiness} className={secondaryButtonClass}><X className="h-4 w-4" />Cancel</button></div>
            <form onSubmit={updateBusiness} className="space-y-5 px-5 py-6 sm:px-6"><div className="grid gap-5 sm:grid-cols-2"><div><label htmlFor="edit-business-name" className={labelClass}>Business name</label><input id="edit-business-name" className={inputClass} value={businessForm.name} onChange={(event) => updateBusinessField("name", event.target.value)} maxLength={150} required disabled={savingBusiness} /></div><div><label htmlFor="edit-owner-name" className={labelClass}>Owner name</label><input id="edit-owner-name" className={inputClass} value={businessForm.ownerName} onChange={(event) => updateBusinessField("ownerName", event.target.value)} maxLength={100} disabled={savingBusiness} /></div></div>
              <div><label htmlFor="edit-description" className={labelClass}>Description</label><textarea id="edit-description" className="w-full resize-y rounded-xl border border-[#D9DEE5] px-4 py-3 text-sm outline-none focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50" value={businessForm.description} onChange={(event) => updateBusinessField("description", event.target.value)} rows={3} maxLength={2000} disabled={savingBusiness} /></div>
              <div className="grid gap-5 sm:grid-cols-2"><div><label htmlFor="edit-area" className={labelClass}>Business area</label><AreaCombobox id="edit-area" value={businessForm.area} onChange={(value) => updateBusinessField("area", value)} placeholder="Type or choose a Lagos area" required disabled={savingBusiness} /><p className="mt-1.5 text-[10px] leading-4 text-gray-500">Browse areas by LGA or type to filter the list.</p></div><div><label htmlFor="edit-city" className={labelClass}>City</label><input id="edit-city" className={inputClass} value={businessForm.city} onChange={(event) => updateBusinessField("city", event.target.value)} placeholder="Lagos or Epe" maxLength={100} disabled={savingBusiness} /></div><div><label htmlFor="edit-house-number" className={labelClass}>House / shop number</label><input id="edit-house-number" className={inputClass} value={businessForm.houseNumber} onChange={(event) => updateBusinessField("houseNumber", event.target.value)} placeholder="e.g. 12 or Shop 4" maxLength={100} disabled={savingBusiness} /></div><div><label htmlFor="edit-street" className={labelClass}>Street / road / close</label><input id="edit-street" className={inputClass} value={businessForm.street} onChange={(event) => updateBusinessField("street", event.target.value)} placeholder="e.g. Agidingbi Road" maxLength={200} required disabled={savingBusiness} /></div></div>
              <div className="rounded-2xl border border-[#E8E4DE] bg-[#FCFAF6] p-4"><div className="flex items-start gap-3"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-[#FF5A36]" /><div><p className="text-xs font-bold">Address preview</p><p className="mt-2 break-words text-xs leading-5 text-gray-600">{buildLocationAddressPreview(businessForm.area, businessForm.houseNumber, businessForm.street, businessForm.city)}</p><p className="mt-1 text-[10px] text-gray-400">Country: Nigeria</p></div></div></div>
              <div className="rounded-2xl border border-[#E8E4DE] bg-[#FCFAF6] p-4"><p className="text-xs font-bold">Contact & social links</p><p className="mt-1 text-[10px] leading-5 text-gray-500">Add useful ways for customers to reach your business.</p><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{SOCIAL_PLATFORMS.map(({ value, label }) => <div key={value}><label htmlFor={`edit-social-${value.toLowerCase()}`} className={labelClass}>{label}</label><input id={`edit-social-${value.toLowerCase()}`} className={inputClass} type={value === "PHONE" ? "tel" : "text"} value={socialValues[value]} onChange={(event) => updateSocial(value, event.target.value)} placeholder={value === "PHONE" || value === "WHATSAPP" ? "080..." : value === "DIRECTIONS" ? "https://maps.google.com/..." : "@username or URL"} disabled={savingBusiness} /></div>)}</div></div>
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4"><div><label htmlFor="edit-category" className={labelClass}>Category</label><select id="edit-category" className={inputClass} value={businessForm.categoryId} onChange={(event) => { updateBusinessField("categoryId", event.target.value); setCategoryChanged(true); }} disabled={savingBusiness}><option value="">Select category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div><div><label htmlFor="edit-availability" className={labelClass}>Availability</label><select id="edit-availability" className={inputClass} value={businessForm.availability} onChange={(event) => updateBusinessField("availability", event.target.value as Availability)} disabled={savingBusiness}><option value="ASK_SELLER">Ask seller</option><option value="AVAILABLE">Available</option><option value="UNAVAILABLE">Unavailable</option></select></div><div><label htmlFor="edit-price-min" className={labelClass}>Minimum price (₦)</label><input id="edit-price-min" type="number" min="0" step="1" className={inputClass} value={businessForm.priceMin} onChange={(event) => updateBusinessField("priceMin", event.target.value)} disabled={savingBusiness} /></div><div><label htmlFor="edit-price-max" className={labelClass}>Maximum price (₦)</label><input id="edit-price-max" type="number" min="0" step="1" className={inputClass} value={businessForm.priceMax} onChange={(event) => updateBusinessField("priceMax", event.target.value)} disabled={savingBusiness} /></div></div>
              <div className="flex justify-end border-t border-[#EAE6DF] pt-5"><button type="submit" disabled={savingBusiness} className={`${primaryButtonClass} min-h-12 w-full px-6 text-sm sm:w-auto`}>{savingBusiness ? <><LoaderCircle className="h-4 w-4 animate-spin" />Saving...</> : <><CheckCircle2 className="h-4 w-4" />Save changes</>}</button></div>
            </form>
          </section>}

          <section id="products-section" className="mt-5 scroll-mt-24 rounded-[22px] border border-[#E8E4DE] bg-white shadow-sm">
            <div className="border-b border-[#EAE6DF] px-5 py-5 sm:px-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#FF5A36]">Product management</p><h2 className="mt-1 text-lg font-bold">Your products</h2><p className="mt-1 text-xs leading-5 text-gray-500">Add the items and services customers can discover through your business page.</p></div><button type="button" onClick={showProductForm ? closeProductForm : openProductForm} disabled={(reachedProductLimit && !showProductForm) || editingBusiness} className={`${primaryButtonClass} min-h-11 shrink-0 disabled:bg-gray-200 disabled:text-gray-500`}>{showProductForm ? <><X className="h-4 w-4" />Close form</> : <><Plus className="h-4 w-4" />Add product</>}</button></div>
              <div className="mt-5 rounded-2xl border border-[#E8E4DE] bg-[#FCFAF6] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><Package className="h-4 w-4 text-[#FF5A36]" /><p className="text-xs font-bold">Active product slots</p></div><p className="mt-1 text-[11px] text-gray-500">{reachedProductLimit ? "You have reached your active product limit." : `${remainingProductSlots} active ${remainingProductSlots === 1 ? "slot" : "slots"} remaining.`}</p><p className="mt-1 text-[10px] leading-4 text-gray-400">{productCapacity.baseMaxActiveProducts} base slots{productCapacity.referralBonusSlots > 0 ? ` + ${productCapacity.referralBonusSlots} referral bonus ${productCapacity.referralBonusSlots === 1 ? "slot" : "slots"}` : " · No referral bonus slots yet"}</p></div><p className={`text-sm font-bold ${reachedProductLimit ? "text-[#C5402D]" : "text-[#9F2D18]"}`}>{activeProductCount}/{productCapacity.maxActiveProducts}</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#EAE6DF]"><div className={`h-full rounded-full transition-all ${reachedProductLimit ? "bg-[#C5402D]" : "bg-[#FF5A36]"}`} style={{ width: `${Math.min(100, (activeProductCount / Math.max(1, productCapacity.maxActiveProducts)) * 100)}%` }} /></div></div>
            </div>

            {showProductForm && <form onSubmit={editingProductId ? updateProduct : createProduct} className="space-y-5 border-b border-[#EAE6DF] bg-[#FCFAF6] px-5 py-6 sm:px-6"><div className="flex items-start justify-between gap-4"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0EB] text-[#FF5A36]">{editingProductId ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}</div><div><h3 className="text-sm font-bold">{editingProductId ? "Edit product" : "Add a product"}</h3><p className="mt-1 text-xs leading-5 text-gray-500">{editingProductId ? "Update the information customers see." : "Add the essentials first. You can add more products after saving."}</p></div></div><button type="button" onClick={closeProductForm} disabled={creatingProduct || updatingProduct} aria-label="Close product form" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E8E4DE] bg-white text-gray-500 hover:text-[#9F2D18] disabled:opacity-50"><X className="h-4 w-4" /></button></div>
              <div className="grid gap-5 sm:grid-cols-2"><div><label htmlFor="product-name" className={labelClass}>Product name <span className="text-[#FF5A36]">*</span></label><input id="product-name" className={inputClass} type="text" value={productForm.name} onChange={(event) => updateProductField("name", event.target.value)} placeholder="e.g. Native fabric" maxLength={150} required disabled={creatingProduct || updatingProduct} /></div><div><label htmlFor="product-category" className={labelClass}>Category</label><select id="product-category" className={inputClass} value={productForm.categoryId} onChange={(event) => updateProductField("categoryId", event.target.value)} disabled={creatingProduct || updatingProduct}><option value="">Select category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></div></div>
              <div><label htmlFor="product-description" className={labelClass}>Description <span className="font-normal text-gray-400">(optional)</span></label><textarea id="product-description" className="w-full resize-y rounded-xl border border-[#D9DEE5] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50" value={productForm.description} onChange={(event) => updateProductField("description", event.target.value)} rows={3} maxLength={2000} placeholder="Describe the product" disabled={creatingProduct || updatingProduct} /></div>
              <div className="grid gap-5 xl:grid-cols-2"><div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="product-price" className={labelClass}>Price (₦)</label><input id="product-price" className={inputClass} type="number" min="0" step="1" value={productForm.price} onChange={(event) => updateProductField("price", event.target.value)} placeholder="One price" disabled={creatingProduct || updatingProduct} /><p className="mt-1 text-[10px] text-gray-400">Leave empty to use a range or ask the seller.</p></div><div><label htmlFor="product-availability" className={labelClass}>Availability</label><select id="product-availability" className={inputClass} value={productForm.availability} onChange={(event) => updateProductField("availability", event.target.value as Availability)} disabled={creatingProduct || updatingProduct}><option value="ASK_SELLER">Ask seller</option><option value="AVAILABLE">Available</option><option value="UNAVAILABLE">Unavailable</option></select></div><div><label htmlFor="product-price-min" className={labelClass}>Minimum price (₦)</label><input id="product-price-min" className={inputClass} type="number" min="0" step="1" value={productForm.priceMin} onChange={(event) => updateProductField("priceMin", event.target.value)} placeholder="Optional" disabled={creatingProduct || updatingProduct} /></div><div><label htmlFor="product-price-max" className={labelClass}>Maximum price (₦)</label><input id="product-price-max" className={inputClass} type="number" min="0" step="1" value={productForm.priceMax} onChange={(event) => updateProductField("priceMax", event.target.value)} placeholder="Optional" disabled={creatingProduct || updatingProduct} /></div></div><div className="min-w-0 rounded-2xl border border-[#E8E4DE] bg-white p-4"><p className="text-xs font-bold">Product images</p><p className="mt-1 text-[10px] leading-4 text-gray-500">The first image becomes the cover image.</p><div className="mt-3 min-w-0"><ProductImageUpload value={productForm.images} onChange={(images) => updateProductField("images", images)} disabled={creatingProduct || updatingProduct} /></div></div></div>
              <div className="flex flex-col gap-3 border-t border-[#E5E0D8] pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-gray-500">{editingProductId ? "Changes update this existing product." : `${remainingProductSlots} active ${remainingProductSlots === 1 ? "slot" : "slots"} remaining.`}</p><button type="submit" disabled={creatingProduct || updatingProduct} className={`${primaryButtonClass} min-h-12 w-full px-6 text-sm sm:w-auto`}>{creatingProduct || updatingProduct ? <><LoaderCircle className="h-4 w-4 animate-spin" />{editingProductId ? "Saving..." : "Adding..."}</> : <>{editingProductId ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{editingProductId ? "Save changes" : "Add product"}</>}</button></div>
            </form>}

            <div className="p-5 sm:p-6">{dashboardProducts.length === 0 ? <div className="rounded-2xl border border-dashed border-[#D9DEE5] bg-[#FCFAF6] px-5 py-10 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-gray-400 shadow-sm"><Package className="h-6 w-6" /></div><h3 className="mt-4 text-sm font-bold">No products yet</h3><p className="mx-auto mt-1 max-w-[430px] text-xs leading-5 text-gray-500">Add your first product so customers can see what your business sells.</p><button type="button" onClick={openProductForm} disabled={reachedProductLimit || editingBusiness} className={`${primaryButtonClass} mt-4 min-h-10`}><Plus className="h-4 w-4" />Add your first product</button></div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{dashboardProducts.map((product) => { const cover = product.images?.slice().sort((a, b) => a.sortOrder - b.sortOrder)[0]?.url || product.imageUrl; const priceLabel = product.price != null ? `₦${product.price.toLocaleString("en-NG")}` : product.priceMin != null && product.priceMax != null ? `₦${product.priceMin.toLocaleString("en-NG")} – ₦${product.priceMax.toLocaleString("en-NG")}` : product.priceMin != null ? `From ₦${product.priceMin.toLocaleString("en-NG")}` : product.priceMax != null ? `Up to ₦${product.priceMax.toLocaleString("en-NG")}` : "Ask seller"; return <article key={product.id} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#E8E4DE] bg-white transition hover:border-[#F1B6A5] hover:shadow-sm"><div className="h-[170px] overflow-hidden bg-[#FCFAF6] sm:h-[180px]">{cover ? <img src={cover} alt={product.name} loading="lazy" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center text-gray-300"><Package className="h-10 w-10" /></div>}</div><div className="flex flex-1 flex-col p-4"><div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-bold">{product.name}</h3><p className="mt-1 text-[11px] text-gray-500">{product.category?.name ?? "No category"}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-bold ${getProductStatusClasses(product.status)}`}>{product.status}</span></div><p className="mt-3 line-clamp-2 min-h-[34px] text-xs leading-5 text-gray-500">{product.description || "No description added."}</p><div className="mt-3 flex min-w-0 items-start justify-between gap-3"><p className="break-words text-sm font-bold text-[#9F2D18]">{priceLabel}</p><span className="max-w-[46%] shrink-0 text-right text-[10px] font-medium text-gray-400">{formatAvailability(product.availability)}</span></div><div className="mt-auto flex gap-2 pt-4"><button type="button" onClick={() => startEditingProduct(product)} disabled={Boolean(deletingProductId) || editingBusiness} className={`${secondaryButtonClass} min-w-0 flex-1`}><Pencil className="h-3.5 w-3.5" />Edit</button><button type="button" onClick={() => void deleteProduct(product)} disabled={Boolean(deletingProductId) || editingBusiness} aria-label={`Delete ${product.name}`} className="inline-flex shrink-0 items-center justify-center rounded-xl border border-[#F1D5D0] px-3 py-2.5 text-xs font-semibold text-[#C5402D] transition hover:bg-[#FFF0EE] disabled:cursor-not-allowed disabled:opacity-50">{deletingProductId === product.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button></div></div></article>; })}</div>}</div>
          </section>
        </>}

        <footer className="mt-8 border-t border-[#EAE6DF] py-5"><div className="flex flex-col gap-2 text-[11px] text-gray-400 sm:flex-row sm:items-center sm:justify-between"><p>ReMarket Seller Portal · Find it nearby.</p><div className="flex flex-wrap gap-4"><Link href="/seller/profile" className="hover:text-[#9F2D18]">Profile settings</Link><Link href="/seller/claims" className="hover:text-[#9F2D18]">Business claims</Link><button type="button" onClick={() => void logout()} className="text-left hover:text-[#9F2D18]">Log out</button></div></div></footer>
      </div>
    </main>
  );
}

type AreaComboboxProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
};

/**
 * Searchable area dropdown used by both create and edit business forms.
 * It intentionally allows a custom typed value, matching the previous
 * datalist behavior while also showing options on click/focus.
 */
function AreaCombobox({
  id,
  value,
  onChange,
  placeholder = "Type or choose an area",
  required = false,
  disabled = false,
}: AreaComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filteredGroups = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase();

    return LAGOS_AREA_GROUPS
      .map((group) => ({
        lga: group.lga,
        areas: group.areas.filter((area) => {
          if (!query) return true;
          return (
            area.toLocaleLowerCase().includes(query) ||
            group.lga.toLocaleLowerCase().includes(query)
          );
        }),
      }))
      .filter((group) => group.areas.length > 0);
  }, [searchTerm]);

  const suggestions = useMemo(
    () => filteredGroups.flatMap((group) =>
      group.areas.map((area) => ({ lga: group.lga, area }))
    ),
    [filteredGroups]
  );

  useEffect(() => {
    if (!open) return;

    function handleOutsidePointerDown(event: PointerEvent) {
      if (
        wrapperRef.current &&
        event.target instanceof Node &&
        !wrapperRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
    };
  }, [open]);

  function showOptions(showAll = true) {
    if (showAll) setSearchTerm("");
    else setSearchTerm(value);
    setActiveIndex(0);
    setOpen(true);
  }

  function selectArea(area: string) {
    onChange(area);
    setSearchTerm("");
    setActiveIndex(0);
    setOpen(false);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        showOptions(true);
        return;
      }
      setActiveIndex((current) =>
        Math.min(current + 1, Math.max(0, suggestions.length - 1))
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
      return;
    }

    if (event.key === "Enter" && open && suggestions.length > 0) {
      event.preventDefault();
      selectArea(suggestions[activeIndex]?.area ?? suggestions[0].area);
    }
  }

  let optionIndex = 0;

  return (
    <div ref={wrapperRef} className="relative z-40 min-w-0">
      <div className="relative min-w-0">
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${id}-options`}
          aria-required={required}
          autoComplete="off"
          className={inputClass.replace("px-4", "pl-4 pr-12")}
          value={value}
          onFocus={() => showOptions(true)}
          onClick={() => {
            if (!open) showOptions(true);
          }}
          onChange={(event) => {
            onChange(event.target.value);
            setSearchTerm(event.target.value);
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          aria-label="Business area"
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={open ? "Close area suggestions" : "Open area suggestions"}
          aria-controls={`${id}-options`}
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (open) {
              setOpen(false);
            } else {
              showOptions(true);
              inputRef.current?.focus();
            }
          }}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-gray-500 transition hover:bg-[#FFF0E9] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {open && !disabled && (
        <div
          id={`${id}-options`}
          role="listbox"
          aria-label="Suggested business areas by local government area"
          className="absolute left-0 right-0 top-full z-[60] mt-2 max-h-72 overflow-y-auto overscroll-contain rounded-2xl border border-[#E8E4DE] bg-white p-2 shadow-[0_18px_45px_rgba(23,32,42,0.16)]"
        >
          <div className="sticky top-0 z-10 mb-1 flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400">
              {searchTerm.trim() ? "Matching areas" : "Browse by local government area"}
            </span>
            <span className="shrink-0 text-[10px] font-semibold text-[#9F2D18]">
              {suggestions.length} options
            </span>
          </div>

          {filteredGroups.length > 0 ? filteredGroups.map((group) => (
            <div key={group.lga} className="mb-2 last:mb-0">
              <p className="sticky top-9 z-[5] rounded-md bg-[#FCFAF6] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-gray-500">
                {group.lga}
              </p>
              <div className="mt-1 grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                {group.areas.map((area) => {
                  const currentIndex = optionIndex;
                  optionIndex += 1;
                  const selected = value.trim().toLocaleLowerCase() === area.toLocaleLowerCase();
                  const highlighted = currentIndex === activeIndex;

                  return (
                    <button
                      key={`${group.lga}-${area}`}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onMouseEnter={() => setActiveIndex(currentIndex)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectArea(area)}
                      className={`flex min-w-0 items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-xs transition ${
                        highlighted
                          ? "bg-[#FFF0E9] text-[#9F2D18]"
                          : selected
                            ? "bg-[#F1FBF6] font-bold text-[#137A59]"
                            : "text-gray-700 hover:bg-[#FCFAF6]"
                      }`}
                    >
                      <span className="min-w-0 break-words">{area}</span>
                      {selected && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )) : (
            <div className="px-3 py-5 text-center">
              <MapPin className="mx-auto h-5 w-5 text-gray-300" />
              <p className="mt-2 text-xs font-semibold text-gray-700">No suggested areas match</p>
              <p className="mt-1 text-[11px] leading-5 text-gray-500">
                You can keep “{value.trim() || searchTerm.trim()}” as a custom area.
              </p>
            </div>
          )}

          <div className="mt-2 border-t border-[#F0ECE6] px-2 py-2 text-[10px] leading-4 text-gray-400">
            Choose a suggestion or keep typing a custom area. Use ↑ and ↓ to move through suggestions and Enter to select.
          </div>
        </div>
      )}
    </div>
  );
}

