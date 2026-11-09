"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
} from "react";

import {
  AlertCircle,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  ImageIcon,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";

import ProductImageUpload from "@/components/ProductImageUpload";
import { validateProductPricing } from "@/lib/product-pricing";

/* Keep service management available for a future release. */
const SERVICES_FEATURE_ENABLED = false;

const MAX_SERVICE_IMAGES = 20;
const MAX_DESCRIPTION_LENGTH = 4000;
const MAX_KEYWORDS = 30;
const MAX_KEYWORD_LENGTH = 80;
const MAX_KEYWORDS_TOTAL_LENGTH = 1500;
const MAX_PRISMA_INT = 2_147_483_647;

const inputClass =
  "h-12 w-full min-w-0 rounded-xl border border-[#D9DEE5] " +
  "bg-white px-4 text-sm text-[#17202A] outline-none transition " +
  "placeholder:text-gray-400 focus:border-[#FF694F] " +
  "focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50";

const labelClass =
  "mb-2 block text-xs font-bold text-gray-700";

const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl " +
  "bg-[#FF5A36] px-4 py-2.5 text-xs font-bold text-white " +
  "transition hover:opacity-90 disabled:cursor-not-allowed " +
  "disabled:opacity-60";

const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl " +
  "border border-[#E8E4DE] bg-white px-4 py-2.5 " +
  "text-xs font-bold text-gray-700 transition hover:bg-[#FFF7ED] " +
  "hover:text-[#9F2D18] disabled:cursor-not-allowed " +
  "disabled:opacity-50";

type Category = {
  id: string;
  name: string;
};

type Availability =
  | "AVAILABLE"
  | "ASK_SELLER"
  | "UNAVAILABLE";

type FulfillmentType =
  | "AT_PROVIDER"
  | "AT_CUSTOMER"
  | "REMOTE"
  | "FLEXIBLE";

type ServiceImage = {
  id: string;
  url: string;
  publicId: string | null;
  sortOrder: number;
};

type UploadedImage = {
  url: string;
  publicId: string;
};

type SellerService = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  durationMinutes: number | null;
  availability: Availability;
  fulfillmentType: FulfillmentType;
  keywords: string[];
  imageUrl: string | null;
  status: string;
  category: Category | null;
  images: ServiceImage[];
};

type ServiceForm = {
  name: string;
  description: string;
  categoryId: string;
  price: string;
  priceMin: string;
  priceMax: string;
  durationMinutes: string;
  availability: Availability;
  fulfillmentType: FulfillmentType;
  keywords: string;
  images: string[];
};

type ServiceImagePayload = {
  url: string;
  publicId: string | null;
  sortOrder: number;
};

const INITIAL_FORM: ServiceForm = {
  name: "",
  description: "",
  categoryId: "",
  price: "",
  priceMin: "",
  priceMax: "",
  durationMinutes: "",
  availability: "ASK_SELLER",
  fulfillmentType: "FLEXIBLE",
  keywords: "",
  images: [],
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getError(
  value: unknown,
  fallback: string,
): string {
  if (!isRecord(value)) return fallback;

  if (typeof value.error === "string" && value.error.trim()) {
    return value.error;
  }

  if (
    typeof value.message === "string" &&
    value.message.trim()
  ) {
    return value.message;
  }

  return fallback;
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim() &&
    Number.isFinite(Number(value))
  ) {
    return Number(value);
  }

  return null;
}

function normalizeService(
  value: unknown,
): SellerService | null {
  if (!isRecord(value) || typeof value.id !== "string") {
    return null;
  }

  const rawCategory = isRecord(value.category)
    ? value.category
    : null;

  const category = rawCategory
    ? {
        id:
          typeof rawCategory.id === "string"
            ? rawCategory.id
            : "",
        name:
          typeof rawCategory.name === "string"
            ? rawCategory.name
            : "",
      }
    : null;

  const images: ServiceImage[] = Array.isArray(value.images)
    ? value.images
        .filter(isRecord)
        .map((image) => ({
          id: typeof image.id === "string" ? image.id : "",
          url: typeof image.url === "string" ? image.url : "",
          publicId:
            typeof image.publicId === "string"
              ? image.publicId
              : null,
          sortOrder:
            typeof image.sortOrder === "number" &&
            Number.isFinite(image.sortOrder)
              ? image.sortOrder
              : 0,
        }))
        .filter((image) => image.url)
    : [];

  const availability: Availability =
    value.availability === "AVAILABLE" ||
    value.availability === "UNAVAILABLE"
      ? value.availability
      : "ASK_SELLER";

  const allowedFulfillment: FulfillmentType[] = [
    "AT_PROVIDER",
    "AT_CUSTOMER",
    "REMOTE",
    "FLEXIBLE",
  ];

  const fulfillmentType = allowedFulfillment.includes(
    value.fulfillmentType as FulfillmentType,
  )
    ? (value.fulfillmentType as FulfillmentType)
    : "FLEXIBLE";

  return {
    id: value.id,
    name: typeof value.name === "string" ? value.name : "Service",
    description:
      typeof value.description === "string"
        ? value.description
        : null,
    price: numberOrNull(value.price),
    priceMin: numberOrNull(value.priceMin),
    priceMax: numberOrNull(value.priceMax),
    durationMinutes: numberOrNull(value.durationMinutes),
    availability,
    fulfillmentType,
    keywords: Array.isArray(value.keywords)
      ? value.keywords.filter(
          (item): item is string => typeof item === "string",
        )
      : [],
    imageUrl:
      typeof value.imageUrl === "string" ? value.imageUrl : null,
    status: typeof value.status === "string" ? value.status : "ACTIVE",
    category,
    images,
  };
}

function formatPrice(service: SellerService): string {
  if (service.price !== null) {
    return `₦${service.price.toLocaleString("en-NG")}`;
  }

  if (service.priceMin !== null && service.priceMax !== null) {
    return (
      `₦${service.priceMin.toLocaleString("en-NG")} – ` +
      `₦${service.priceMax.toLocaleString("en-NG")}`
    );
  }

  if (service.priceMin !== null) {
    return `From ₦${service.priceMin.toLocaleString("en-NG")}`;
  }

  if (service.priceMax !== null) {
    return `Up to ₦${service.priceMax.toLocaleString("en-NG")}`;
  }

  return "Price not set";
}

const fulfillmentLabels: Record<FulfillmentType, string> = {
  AT_PROVIDER: "At provider",
  AT_CUSTOMER: "At customer location",
  REMOTE: "Online / remotely",
  FLEXIBLE: "Flexible",
};

function formatAvailability(value: Availability): string {
  if (value === "AVAILABLE") return "Available";
  if (value === "UNAVAILABLE") return "Unavailable";
  return "Ask seller";
}

export default function SellerServiceManager({
  categories,
}: {
  categories: Category[];
}) {
  const [services, setServices] = useState<SellerService[]>([]);
  const [form, setForm] = useState<ServiceForm>(INITIAL_FORM);
  const [imagePublicIds, setImagePublicIds] = useState<
    Record<string, string>
  >({});
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const updateField = <K extends keyof ServiceForm>(
    field: K,
    value: ServiceForm[K],
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
    setSuccess("");
  };

  function handleUploadedImages(images: UploadedImage[]) {
    setImagePublicIds((current) => {
      const next = { ...current };
      for (const image of images) {
        if (image.url && image.publicId) {
          next[image.url] = image.publicId;
        }
      }
      return next;
    });
  }

  const resetImageMetadata = () => setImagePublicIds({});

  const loadServices = useCallback(
    async (showSpinner = true) => {
      if (!SERVICES_FEATURE_ENABLED) return;

      if (showSpinner) setLoading(true);
      else setRefreshing(true);
      setError("");

      try {
        const response = await fetch("/api/seller/services", {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        const data: unknown = await response.json().catch(() => null);

        if (response.status === 401 || response.status === 403) {
          throw new Error(
            "Your seller session has expired. Please sign in again.",
          );
        }

        if (!response.ok) {
          throw new Error(getError(data, "Unable to load services."));
        }

        if (!isRecord(data) || !Array.isArray(data.services)) {
          throw new Error("The service response was invalid.");
        }

        setServices(
          data.services
            .map(normalizeService)
            .filter(
              (item): item is SellerService => item !== null,
            ),
        );
      } catch (loadError) {
        console.error("Seller service loading error:", loadError);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load services.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!SERVICES_FEATURE_ENABLED) return;
    void loadServices();
  }, [loadServices]);

  function scrollToEditor() {
    window.setTimeout(() => {
      document.getElementById("service-editor")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  }

  function openAddForm() {
    setEditingId(null);
    setForm(INITIAL_FORM);
    resetImageMetadata();
    setError("");
    setSuccess("");
    setShowForm(true);
    scrollToEditor();
  }

  function openEditForm(service: SellerService) {
    const sortedImages = [...service.images].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    const imageUrls = sortedImages.length
      ? sortedImages.map((image) => image.url)
      : service.imageUrl
        ? [service.imageUrl]
        : [];
    const publicIds: Record<string, string> = {};

    for (const image of sortedImages) {
      if (image.url && image.publicId) {
        publicIds[image.url] = image.publicId;
      }
    }

    setImagePublicIds(publicIds);
    setEditingId(service.id);
    setForm({
      name: service.name,
      description: service.description ?? "",
      categoryId: service.category?.id ?? "",
      price: service.price === null ? "" : String(service.price),
      priceMin:
        service.priceMin === null ? "" : String(service.priceMin),
      priceMax:
        service.priceMax === null ? "" : String(service.priceMax),
      durationMinutes:
        service.durationMinutes === null
          ? ""
          : String(service.durationMinutes),
      availability: service.availability,
      fulfillmentType: service.fulfillmentType,
      keywords: service.keywords.join(", "),
      images: imageUrls,
    });
    setError("");
    setSuccess("");
    setShowForm(true);
    scrollToEditor();
  }

  function closeForm() {
    if (saving) return;
    setShowForm(false);
    setEditingId(null);
    setForm(INITIAL_FORM);
    resetImageMetadata();
    setError("");
  }

  function getFormPayload() {
    return {
      price: form.price.trim() ? Number(form.price) : null,
      priceMin: form.priceMin.trim()
        ? Number(form.priceMin)
        : null,
      priceMax: form.priceMax.trim()
        ? Number(form.priceMax)
        : null,
      durationMinutes: form.durationMinutes.trim()
        ? Number(form.durationMinutes)
        : null,
    };
  }

  function validateForm(): boolean {
    if (!form.name.trim()) {
      setError("Service name is required.");
      return false;
    }

    if (form.name.trim().length > 200) {
      setError("Service name cannot exceed 200 characters.");
      return false;
    }

    const {
      price,
      priceMin,
      priceMax,
      durationMinutes,
    } = getFormPayload();

    for (const amount of [price, priceMin, priceMax]) {
      if (
        amount !== null &&
        (!Number.isSafeInteger(amount) ||
          amount < 0 ||
          amount > MAX_PRISMA_INT)
      ) {
        setError("Prices must be valid whole numbers.");
        return false;
      }
    }

    const pricingError = validateProductPricing(
      price,
      priceMin,
      priceMax,
    );
    if (pricingError) {
      setError(pricingError);
      return false;
    }

    if (
      durationMinutes !== null &&
      (!Number.isSafeInteger(durationMinutes) ||
        durationMinutes <= 0 ||
        durationMinutes > MAX_PRISMA_INT)
    ) {
      setError("Duration must be a whole number greater than zero.");
      return false;
    }

    const keywords = form.keywords
      .split(",")
      .map((word) => word.trim())
      .filter(Boolean);

    if (
      keywords.length > MAX_KEYWORDS ||
      keywords.some((word) => word.length > MAX_KEYWORD_LENGTH)
    ) {
      setError(
        `Use up to ${MAX_KEYWORDS} keywords, ` +
          `with no more than ${MAX_KEYWORD_LENGTH} characters each.`,
      );
      return false;
    }

    const keywordLength = keywords.reduce(
      (total, word) => total + word.length,
      0,
    );
    if (keywordLength > MAX_KEYWORDS_TOTAL_LENGTH) {
      setError("Your combined keywords are too long.");
      return false;
    }

    if (form.description.length > MAX_DESCRIPTION_LENGTH) {
      setError("Service description cannot exceed 4,000 characters.");
      return false;
    }

    if (form.images.length > MAX_SERVICE_IMAGES) {
      setError(
        `You can upload a maximum of ${MAX_SERVICE_IMAGES} images.`,
      );
      return false;
    }

    return true;
  }

  function buildImagePayload(): ServiceImagePayload[] {
    return form.images.map((url, index) => ({
      url,
      publicId: imagePublicIds[url] ?? null,
      sortOrder: index,
    }));
  }

  async function saveService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setError("");
    setSuccess("");
    if (!validateForm()) return;

    const {
      price,
      priceMin,
      priceMax,
      durationMinutes,
    } = getFormPayload();

    const keywords = form.keywords
      .split(",")
      .map((word) => word.trim())
      .filter(Boolean);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      categoryId: form.categoryId || null,
      price,
      priceMin,
      priceMax,
      durationMinutes,
      availability: form.availability,
      fulfillmentType: form.fulfillmentType,
      keywords,
      images: buildImagePayload(),
    };

    const currentEditingId = editingId;
    setSaving(true);

    try {
      const response = await fetch(
        currentEditingId
          ? `/api/seller/services/${encodeURIComponent(currentEditingId)}`
          : "/api/seller/services",
        {
          method: currentEditingId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      const data: unknown = await response.json().catch(() => null);
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          "Your seller session has expired. Please sign in again.",
        );
      }
      if (!response.ok) {
        throw new Error(
          getError(
            data,
            currentEditingId
              ? "Unable to update service."
              : "Unable to create service.",
          ),
        );
      }

      setShowForm(false);
      setEditingId(null);
      setForm(INITIAL_FORM);
      resetImageMetadata();
      await loadServices(false);
      setSuccess(
        currentEditingId
          ? "Service updated successfully."
          : "Service added successfully.",
      );
    } catch (saveError) {
      console.error("Seller service save error:", saveError);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save service.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteService(service: SellerService) {
    if (deletingId || saving) return;

    const confirmed = window.confirm(
      `Remove "${service.name}" from your services? ` +
        "Existing booking records will be preserved.",
    );
    if (!confirmed) return;

    setDeletingId(service.id);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        `/api/seller/services/${encodeURIComponent(service.id)}`,
        {
          method: "DELETE",
          headers: { Accept: "application/json" },
        },
      );
      const data: unknown = await response.json().catch(() => null);

      if (response.status === 401 || response.status === 403) {
        throw new Error(
          "Your seller session has expired. Please sign in again.",
        );
      }
      if (!response.ok) {
        throw new Error(getError(data, "Unable to delete service."));
      }

      setServices((current) =>
        current.filter((item) => item.id !== service.id),
      );

      if (editingId === service.id) {
        setShowForm(false);
        setEditingId(null);
        setForm(INITIAL_FORM);
        resetImageMetadata();
      }
      setSuccess("Service removed successfully.");
    } catch (deleteError) {
      console.error("Seller service deletion error:", deleteError);
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete service.",
      );
    } finally {
      setDeletingId("");
    }
  }

  /* The feature stays disabled until this flag is enabled. */
  if (!SERVICES_FEATURE_ENABLED) {
    return (
      <section
        id="services-section"
        className={
          "mt-5 overflow-hidden rounded-[22px] " +
          "border border-[#E8E4DE] bg-white shadow-sm"
        }
      >
        <div className="border-b border-[#EAE6DF] px-5 py-5 sm:px-6">
          <p
            className={
              "text-xs font-semibold uppercase " +
              "tracking-[0.12em] text-[#FF5A36]"
            }
          >
            Coming soon
          </p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-[#401B13]">
              Service management
            </h2>
            <BriefcaseBusiness className="h-6 w-6 text-[#FF5A36]" />
          </div>
          <p className="mt-1 text-xs leading-5 text-gray-500">
            We&apos;re preparing a better way for customers to
            discover and book your services.
          </p>
        </div>

        <div className="px-5 py-10 text-center sm:px-6 sm:py-14">
          <div
            className={
              "mx-auto flex h-16 w-16 items-center " +
              "justify-center rounded-2xl bg-[#FFF0E9] text-[#9F2D18]"
            }
          >
            <Clock3 className="h-8 w-8" />
          </div>
          <span
            className={
              "mt-5 inline-flex rounded-full " +
              "bg-[#FFF0E9] px-3 py-1.5 text-[10px] " +
              "font-extrabold uppercase tracking-wider text-[#9F2D18]"
            }
          >
            Coming soon
          </span>
          <h3 className="mt-4 text-xl font-black text-[#401B13]">
            Services are on the way!
          </h3>
          <p
            className={
              "mx-auto mt-3 max-w-md text-xs leading-6 " +
              "text-[#756B61]"
            }
          >
            Soon, you will be able to publish your services,
            manage customer bookings and connect with customers
            directly through ReMarket.
          </p>
          <button
            type="button"
            disabled
            title="Service management will be available later."
            className={
              "mt-6 inline-flex min-h-11 items-center " +
              "justify-center gap-2 rounded-xl bg-[#EAE6DF] " +
              "px-6 py-3 text-xs font-bold text-[#91877E] " +
              "cursor-not-allowed"
            }
          >
            <Plus className="h-4 w-4" />
            Add service — Coming soon
          </button>
          <p className="mt-4 text-[10px] text-[#91877E]">
            Your product listings and seller dashboard remain available.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      id="services-section"
      className={
        "mt-5 scroll-mt-24 overflow-visible " +
        "rounded-[22px] border border-[#E8E4DE] bg-white shadow-sm"
      }
    >
      <div className="border-b border-[#EAE6DF] px-5 py-5 sm:px-6">
        <div
          className={
            "flex flex-col gap-4 sm:flex-row " +
            "sm:items-center sm:justify-between"
          }
        >
          <div>
            <p
              className={
                "text-xs font-semibold uppercase " +
                "tracking-[0.12em] text-[#FF5A36]"
              }
            >
              Service management
            </p>
            <h2 className="mt-1 text-lg font-bold">Your services</h2>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              Add and manage services customers can discover and book.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadServices(false)}
              disabled={loading || refreshing || saving || !!deletingId}
              className={secondaryButtonClass}
            >
              <RefreshCw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
            <button
              type="button"
              onClick={showForm ? closeForm : openAddForm}
              disabled={saving || !!deletingId}
              className={primaryButtonClass}
            >
              {showForm ? (
                <>
                  <X className="h-4 w-4" />
                  Close form
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add service
                </>
              )}
            </button>
          </div>
        </div>

        <div
          className={
            "mt-4 flex items-center gap-2 rounded-xl " +
            "bg-[#FCFAF6] px-3 py-3"
          }
        >
          <BriefcaseBusiness className="h-4 w-4 text-[#FF5A36]" />
          <p className="text-xs text-gray-600">
            <strong>{services.length}</strong>{" "}
            {services.length === 1 ? "service" : "services"} listed.
            <span className="ml-1 text-gray-400">
              Services do not use product listing slots.
            </span>
          </p>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {(error || success) && (
          <div
            role={error ? "alert" : "status"}
            className={
              "mb-4 flex items-start gap-2 rounded-xl px-3 py-3 text-xs " +
              (error
                ? "border border-[#F1D5D0] bg-[#FFF0EE] text-[#C5402D]"
                : "border border-[#BDE8D8] bg-[#EFFBF6] text-[#137A59]")
            }
          >
            {error ? (
              <AlertCircle className="h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            )}
            <span>{error || success}</span>
          </div>
        )}

        {showForm && (
          <form
            id="service-editor"
            onSubmit={saveService}
            className={
              "mb-6 scroll-mt-24 space-y-5 rounded-2xl " +
              "border border-[#E8E4DE] bg-[#FCFAF6] p-4 sm:p-5"
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold">
                  {editingId ? "Edit service" : "Add a new service"}
                </h3>
                <p className="mt-1 text-xs leading-5 text-gray-500">
                  Update the details customers see for this service.
                </p>
              </div>
              <button
                type="button"
                onClick={closeForm}
                disabled={saving}
                aria-label="Close service form"
                className={
                  "flex h-9 w-9 items-center justify-center " +
                  "rounded-xl border border-[#E8E4DE] bg-white text-gray-500"
                }
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="service-name" className={labelClass}>
                  Service name *
                </label>
                <input
                  id="service-name"
                  className={inputClass}
                  value={form.name}
                  onChange={(event) =>
                    updateField("name", event.target.value)
                  }
                  placeholder="e.g. Large format printing"
                  maxLength={200}
                  required
                  disabled={saving}
                />
              </div>
              <div>
                <label
                  htmlFor="service-category"
                  className={labelClass}
                >
                  Category
                </label>
                <select
                  id="service-category"
                  className={inputClass}
                  value={form.categoryId}
                  onChange={(event) =>
                    updateField("categoryId", event.target.value)
                  }
                  disabled={saving}
                >
                  <option value="">Select category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                {categories.length === 0 && (
                  <p className="mt-1 text-[10px] text-amber-700">
                    No categories are available. You can save without one.
                  </p>
                )}
              </div>
            </div>

            <div>
              <label
                htmlFor="service-description"
                className={labelClass}
              >
                Description
              </label>
              <textarea
                id="service-description"
                className={
                  "w-full resize-y rounded-xl border " +
                  "border-[#D9DEE5] bg-white px-4 py-3 text-sm " +
                  "outline-none focus:border-[#FF694F] " +
                  "focus:ring-4 focus:ring-[#FF694F]/10 disabled:bg-gray-50"
                }
                value={form.description}
                onChange={(event) =>
                  updateField("description", event.target.value)
                }
                placeholder="Explain what the service includes."
                rows={4}
                maxLength={MAX_DESCRIPTION_LENGTH}
                disabled={saving}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {([
                ["price", "Exact price (₦)", "Fixed price"],
                ["priceMin", "Minimum price (₦)", "Starting price"],
                ["priceMax", "Maximum price (₦)", "Upper limit"],
                ["durationMinutes", "Duration (minutes)", "Optional"],
              ] as const).map(([field, label, placeholder]) => (
                <div key={field}>
                  <label
                    htmlFor={`service-${field}`}
                    className={labelClass}
                  >
                    {label}
                  </label>
                  <input
                    id={`service-${field}`}
                    className={inputClass}
                    type="number"
                    min={field === "durationMinutes" ? "1" : "0"}
                    max={MAX_PRISMA_INT}
                    step="1"
                    value={form[field]}
                    onChange={(event) =>
                      updateField(field, event.target.value)
                    }
                    placeholder={placeholder}
                    disabled={saving}
                  />
                </div>
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="service-availability"
                  className={labelClass}
                >
                  Availability
                </label>
                <select
                  id="service-availability"
                  className={inputClass}
                  value={form.availability}
                  onChange={(event) =>
                    updateField(
                      "availability",
                      event.target.value as Availability,
                    )
                  }
                  disabled={saving}
                >
                  <option value="AVAILABLE">Available</option>
                  <option value="ASK_SELLER">Ask seller</option>
                  <option value="UNAVAILABLE">Unavailable</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="service-fulfillment"
                  className={labelClass}
                >
                  Where is the service provided?
                </label>
                <select
                  id="service-fulfillment"
                  className={inputClass}
                  value={form.fulfillmentType}
                  onChange={(event) =>
                    updateField(
                      "fulfillmentType",
                      event.target.value as FulfillmentType,
                    )
                  }
                  disabled={saving}
                >
                  <option value="FLEXIBLE">Flexible</option>
                  <option value="AT_PROVIDER">
                    At my business location
                  </option>
                  <option value="AT_CUSTOMER">
                    At customer&apos;s location
                  </option>
                  <option value="REMOTE">Online / remotely</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="service-keywords" className={labelClass}>
                Search keywords
              </label>
              <input
                id="service-keywords"
                className={inputClass}
                value={form.keywords}
                onChange={(event) =>
                  updateField("keywords", event.target.value)
                }
                placeholder="printing, banners, flyers, branding"
                disabled={saving}
              />
              <p className="mt-1 text-[10px] text-gray-400">
                Separate keywords with commas. Up to 30 keywords.
              </p>
            </div>

            <div className="rounded-2xl border border-[#E8E4DE] bg-white p-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-[#FF5A36]" />
                <p className="text-xs font-bold">Service images</p>
              </div>
              <p className="mt-1 text-[10px] text-gray-500">
                Add examples of your work. First image is the cover.
              </p>
              <p className="mt-1 text-[10px] text-gray-400">
                {form.images.length}/{MAX_SERVICE_IMAGES} images selected.
              </p>
              <div className="mt-3 min-w-0">
                <ProductImageUpload
                  value={form.images}
                  onChange={(images) => updateField("images", images)}
                  onUploadComplete={handleUploadedImages}
                  disabled={saving}
                />
              </div>
            </div>

            <div
              className={
                "flex flex-col gap-3 border-t " +
                "border-[#EAE6DF] pt-4 sm:flex-row sm:items-center " +
                "sm:justify-between"
              }
            >
              <p className="text-[10px] leading-5 text-gray-500">
                Your service will be saved as active.
              </p>
              <button
                type="submit"
                disabled={saving}
                className={
                  `${primaryButtonClass} min-h-11 w-full px-6 sm:w-auto`
                }
              >
                {saving ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : editingId ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Save changes
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Add service
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div
            className={
              "flex items-center justify-center gap-2 py-10 " +
              "text-sm text-gray-500"
            }
          >
            <LoaderCircle className="h-5 w-5 animate-spin text-[#FF5A36]" />
            Loading services...
          </div>
        ) : services.length === 0 ? (
          <div
            className={
              "rounded-2xl border border-dashed " +
              "border-[#D9DEE5] bg-[#FCFAF6] px-5 py-10 text-center"
            }
          >
            <BriefcaseBusiness className="mx-auto h-9 w-9 text-gray-300" />
            <h3 className="mt-3 text-sm font-bold">No services yet</h3>
            <p
              className={
                "mx-auto mt-1 max-w-md text-xs leading-5 " +
                "text-gray-500"
              }
            >
              Add your first service for nearby customers to discover.
            </p>
            <button
              type="button"
              onClick={openAddForm}
              className={`${primaryButtonClass} mt-4 min-h-10`}
            >
              <Plus className="h-4 w-4" />
              Add your first service
            </button>
          </div>
        ) : (
          <div
            className={
              "grid gap-4 sm:grid-cols-2 xl:grid-cols-3 " +
              "2xl:grid-cols-4"
            }
          >
            {services.map((service) => {
              const cover =
                service.images
                  .slice()
                  .sort((a, b) => a.sortOrder - b.sortOrder)[0]?.url ||
                service.imageUrl;

              return (
                <article
                  key={service.id}
                  className={
                    "flex min-w-0 flex-col overflow-hidden " +
                    "rounded-2xl border border-[#E8E4DE] bg-white"
                  }
                >
                  <div
                    className={
                      "flex h-[170px] items-center " +
                      "justify-center overflow-hidden bg-[#FCFAF6]"
                    }
                  >
                    {cover ? (
                      <img
                        src={cover}
                        alt={service.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <BriefcaseBusiness className="h-10 w-10 text-gray-300" />
                    )}
                  </div>

                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="break-words text-sm font-bold">
                          {service.name}
                        </h3>
                        <p className="mt-1 text-[11px] text-gray-500">
                          {service.category?.name || "No category"}
                        </p>
                      </div>
                      <span
                        className={
                          "shrink-0 rounded-full px-2 py-1 text-[9px] " +
                          "font-bold " +
                          (service.status === "ACTIVE"
                            ? "bg-[#DDF5EA] text-[#137A59]"
                            : "bg-[#FFF0EE] text-[#C5402D]")
                        }
                      >
                        {service.status}
                      </span>
                    </div>

                    <p
                      className={
                        "mt-3 line-clamp-3 min-h-[54px] " +
                        "text-xs leading-5 text-gray-500"
                      }
                    >
                      {service.description || "No description added."}
                    </p>
                    <p className="mt-3 text-sm font-bold text-[#9F2D18]">
                      {formatPrice(service)}
                    </p>

                    <div
                      className={
                        "mt-3 grid gap-2 border-t " +
                        "border-[#F0ECE6] pt-3"
                      }
                    >
                      <p className="text-[11px] text-gray-500">
                        Availability: <strong className="text-gray-700">
                          {formatAvailability(service.availability)}
                        </strong>
                      </p>
                      <p className="text-[11px] text-gray-500">
                        Fulfilment: <strong className="text-gray-700">
                          {fulfillmentLabels[service.fulfillmentType]}
                        </strong>
                      </p>
                      {service.durationMinutes !== null && (
                        <p
                          className={
                            "flex items-center gap-1.5 " +
                            "text-[11px] text-gray-500"
                          }
                        >
                          <Clock3 className="h-3.5 w-3.5" />
                          {service.durationMinutes} minutes
                        </p>
                      )}
                    </div>

                    {service.keywords.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {service.keywords.slice(0, 5).map((keyword) => (
                          <span
                            key={keyword}
                            className={
                              "rounded-full bg-[#FCFAF6] px-2 py-1 " +
                              "text-[9px] text-gray-500"
                            }
                          >
                            {keyword}
                          </span>
                        ))}
                      </div>
                    )}

                    <div
                      className={
                        "mt-auto flex gap-2 border-t " +
                        "border-[#F0ECE6] pt-4"
                      }
                    >
                      <button
                        type="button"
                        onClick={() => openEditForm(service)}
                        disabled={saving || !!deletingId}
                        className={
                          `${secondaryButtonClass} min-h-10 min-w-0 flex-1`
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteService(service)}
                        disabled={saving || !!deletingId}
                        aria-label={`Delete ${service.name}`}
                        className={
                          "inline-flex min-h-10 items-center gap-2 " +
                          "rounded-xl border border-[#F1D5D0] px-3 " +
                          "text-xs font-bold text-[#C5402D] " +
                          "hover:bg-[#FFF0EE] disabled:opacity-50"
                        }
                      >
                        {deletingId === service.id ? (
                          <LoaderCircle className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        <span className="hidden sm:inline">Delete</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
