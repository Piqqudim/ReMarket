"use client";

import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  Loader2,
  MapPin,
  Package,
  RotateCcw,
  Save,
  Store,
  Trash2,
  X,
} from "lucide-react";

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
    lat: number | null;
    long: number | null;
  } | null;

  categories: Category[];

  socialLinks: SocialLink[];

  products: Product[];
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
        link.platform === platform
    )?.handle ?? ""
  );
}

export default function BusinessDetailsPage() {
  const params =
    useParams<{
      id: string;
    }>();

  const router = useRouter();

  const businessId = params.id;

  const [business, setBusiness] =
    useState<Business | null>(
      null
    );

  const [categories, setCategories] =
    useState<Category[]>([]);

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

  const [showDeleteConfirmation, setShowDeleteConfirmation] =
    useState(false);

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

      if (
        !categoriesResponse.ok
      ) {
        throw new Error(
          "Unable to load categories."
        );
      }

      setBusiness(
        businessData.business ?? null
      );

      setCategories(
        Array.isArray(
          categoriesData.categories
        )
          ? categoriesData.categories
          : []
      );
    } catch (loadError) {
      console.error(
        "Business details load error:",
        loadError
      );

      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load business."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBusiness();
  }, [businessId]);

  async function deleteBusiness() {
    if (!business) {
      return;
    }

    try {
      setDeleting(true);
      setError("");
      setSuccess("");

      const response = await fetch(
        `/api/admin/businesses/${business.id}`,
        {
          method: "DELETE",
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Unable to delete business."
        );
      }

      setBusiness((current) =>
        current
          ? {
              ...current,
              deletedAt:
                data.business?.deletedAt ??
                new Date().toISOString(),
            }
          : current
      );

      setShowDeleteConfirmation(false);
      setSuccess(
        `${business.name} was moved to deleted businesses.`
      );
    } catch (deleteError) {
      console.error(
        "Business delete error:",
        deleteError
      );

      setError(
        deleteError instanceof Error
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

      const response = await fetch(
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
          typeof data?.error === "string"
            ? data.error
            : "Unable to restore business."
        );
      }

      setBusiness((current) =>
        current
          ? {
              ...current,
              ...(data.business ?? {}),
              deletedAt: null,
            }
          : current
      );

      setSuccess(
        `${business.name} was restored successfully.`
      );
    } catch (restoreError) {
      console.error(
        "Business restore error:",
        restoreError
      );

      setError(
        restoreError instanceof Error
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
          setShowDeleteConfirmation(true)
        }
        onRestore={() => {
          void restoreBusiness();
        }}
      />

      {showDeleteConfirmation && (
        <DeleteConfirmationModal
          business={business}
          loading={deleting}
          onCancel={() =>
            setShowDeleteConfirmation(false)
          }
          onConfirm={() => {
            void deleteBusiness();
          }}
        />
      )}
    </>
  );
}

type BusinessEditorProps = {
  business: Business;
  categories: Category[];
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

  const [ownerName, setOwnerName] =
    useState(
      business.ownerName ?? ""
    );

  const [description, setDescription] =
    useState(
      business.description ?? ""
    );

  const [phone, setPhone] =
    useState(
      business.phone ?? ""
    );

  const [imageUrl, setImageUrl] =
    useState(
      business.imageUrl ?? ""
    );

  const [area, setArea] =
    useState(
      business.location?.area ?? ""
    );

  const [lat, setLat] =
    useState(
      business.location?.lat ===
        null ||
      business.location?.lat ===
        undefined
        ? ""
        : String(
            business.location.lat
          )
    );

  const [long, setLong] =
    useState(
      business.location?.long ===
        null ||
      business.location?.long ===
        undefined
        ? ""
        : String(
            business.location.long
          )
    );

  const [priceMin, setPriceMin] =
    useState(
      formatPrice(
        business.priceMin
      )
    );

  const [priceMax, setPriceMax] =
    useState(
      formatPrice(
        business.priceMax
      )
    );

  const [availability, setAvailability] =
    useState<
      | "AVAILABLE"
      | "ASK_SELLER"
      | "UNAVAILABLE"
    >(
      business.availability
    );

  const [status, setStatus] =
    useState<
      | "ACTIVE"
      | "INACTIVE"
      | "PENDING"
    >(
      business.status
    );

  const [verification, setVerification] =
    useState<
      | "VERIFIED"
      | "UNVERIFIED"
    >(
      business.verification
    );

  const [selectedCategoryIds, setSelectedCategoryIds] =
    useState<string[]>(
      business.categories.map(
        (category) =>
          category.id
      )
    );

  const [socialValues, setSocialValues] =
    useState<
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

  function toggleCategory(
    categoryId: string
  ) {
    setSelectedCategoryIds(
      (current) =>
        current.includes(categoryId)
          ? current.filter(
              (id) =>
                id !== categoryId
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
    setSocialValues(
      (current) => ({
        ...current,
        [platform]: value,
      })
    );
  }

  async function submit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setSaving(true);
    setError("");
    setSuccess("");

    const trimmedName =
      name.trim();

    const trimmedArea =
      area.trim();

    if (!trimmedName) {
      setError(
        "Business name is required."
      );
      setSaving(false);
      return;
    }

    if (!trimmedArea) {
      setError(
        "Business area is required."
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
      parsedPriceMin !== null &&
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
      parsedPriceMax !== null &&
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
      parsedPriceMin !== null &&
      parsedPriceMax !== null &&
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
      parsedLat !== null &&
      (!Number.isFinite(
        parsedLat
      ) ||
        parsedLat < -90 ||
        parsedLat > 90)
    ) {
      setError(
        "Latitude must be between -90 and 90."
      );
      setSaving(false);
      return;
    }

    if (
      parsedLong !== null &&
      (!Number.isFinite(
        parsedLong
      ) ||
        parsedLong < -180 ||
        parsedLong > 180)
    ) {
      setError(
        "Longitude must be between -180 and 180."
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

              area:
                trimmedArea,

              lat:
                parsedLat,

              long:
                parsedLong,

              priceMin:
                parsedPriceMin,

              priceMax:
                parsedPriceMax,

              /*
               * Keep existing values unchanged
               * for a deleted business.
               */
              availability,

              status,

              verification,

              categoryIds:
                selectedCategoryIds,

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

      setSuccess(
        "Business changes saved successfully."
      );

      setBusinessEditorStateFromResponse(
        data.business
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

  function setBusinessEditorStateFromResponse(
    updatedBusiness: Partial<Business> | undefined
  ) {
    if (!updatedBusiness) {
      return;
    }

    if (
      typeof updatedBusiness.name ===
      "string"
    ) {
      setName(
        updatedBusiness.name
      );
    }

    if (
      typeof updatedBusiness.ownerName ===
      "string" ||
      updatedBusiness.ownerName === null
    ) {
      setOwnerName(
        updatedBusiness.ownerName ?? ""
      );
    }

    if (
      typeof updatedBusiness.description ===
      "string" ||
      updatedBusiness.description ===
      null
    ) {
      setDescription(
        updatedBusiness.description ??
          ""
      );
    }

    if (
      typeof updatedBusiness.phone ===
      "string" ||
      updatedBusiness.phone === null
    ) {
      setPhone(
        updatedBusiness.phone ??
          ""
      );
    }

    if (
      typeof updatedBusiness.imageUrl ===
      "string" ||
      updatedBusiness.imageUrl ===
        null
    ) {
      setImageUrl(
        updatedBusiness.imageUrl ??
          ""
      );
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
                  href={`/business/${business.id}`}
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
                    {business.verification}
                  </span>

                  <span className="rounded-full bg-[#F3F0EB] px-2.5 py-1 text-[10px] font-bold text-[#6F675F]">
                    {business.products.length}{" "}
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
                  onChange={setOwnerName}
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
                  onChange={setPhone}
                  type="tel"
                />

                <Field
                  label="Image URL"
                  value={imageUrl}
                  onChange={
                    setImageUrl
                  }
                  type="url"
                />
              </div>
            </section>

            <section className="border-t border-[#EAE6DF] pt-6">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-[#9F2D18]" />

                <h2 className="text-sm font-bold text-[#17202A]">
                  Business location
                </h2>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <Field
                  label="Area"
                  value={area}
                  onChange={setArea}
                  required
                />

                <Field
                  label="Latitude"
                  value={lat}
                  onChange={setLat}
                  type="number"
                  step="any"
                  placeholder="Optional"
                />

                <Field
                  label="Longitude"
                  value={long}
                  onChange={setLong}
                  type="number"
                  step="any"
                  placeholder="Optional"
                />
              </div>

              <p className="mt-2 text-[10px] text-[#A39A91]">
                The saved area and coordinates
                are used by ReMarket location
                features.
              </p>
            </section>

            <section className="border-t border-[#EAE6DF] pt-6">
              <h2 className="text-sm font-bold text-[#17202A]">
                Price range
              </h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  label="Minimum price"
                  value={priceMin}
                  onChange={setPriceMin}
                  type="number"
                  step="1"
                  min="0"
                />

                <Field
                  label="Maximum price"
                  value={priceMax}
                  onChange={setPriceMax}
                  type="number"
                  step="1"
                  min="0"
                />
              </div>
            </section>

            <section className="border-t border-[#EAE6DF] pt-6">
              <h2 className="text-sm font-bold text-[#17202A]">
                Business state
              </h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <SelectField
                  label="Availability"
                  value={availability}
                  onChange={(value) =>
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
                  onChange={(value) =>
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
                  value={verification}
                  onChange={(value) =>
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

            <section className="border-t border-[#EAE6DF] pt-6">
              <h2 className="text-sm font-bold text-[#17202A]">
                Categories
              </h2>

              <div className="mt-4 flex flex-wrap gap-2">
                {categories.map(
                  (category) => {
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
            </section>

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

            <div className="flex flex-col-reverse gap-2 border-t border-[#EAE6DF] pt-5 sm:flex-row sm:justify-end">
              <Link
                href="/admin/businesses"
                className="rounded-xl border border-[#EAE6DF] bg-white px-5 py-3 text-center text-xs font-bold text-[#6F675F] transition hover:bg-[#FCFAF6]"
              >
                Back to businesses
              </Link>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-bold text-white transition hover:bg-[#E94F2D] disabled:cursor-not-allowed disabled:opacity-60"
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
          placeholder={placeholder}
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
          placeholder={placeholder}
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
              {
                option.label
              }
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
            <AlertTriangle size={21} />
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
            onClick={onCancel}
            className="h-10 rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-4 text-sm font-bold text-[#6F675F] transition hover:bg-[#FFF0D9] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
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