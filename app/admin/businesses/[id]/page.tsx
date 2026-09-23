"use client";

import {
  useEffect,
  useState,

} from "react";

import {
  ArrowLeft,
  Image as ImageIcon,
  Loader2,
  Package,
  Pencil,
  Plus,
  Store,
  Trash2,
} from "lucide-react";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

import ImageUpload from "@/components/ImageUpload";

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
  status:
    | "ACTIVE"
    | "INACTIVE"
    | "PENDING";
  keywords: string[];
  category: {
    id: string;
    name: string;
  } | null;
  images: ProductImage[];
};

type Business = {
  id: string;
  name: string;
  ownerName: string | null;
  description: string | null;
  imageUrl: string | null;
  phone: string | null;
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
  location: {
    id: string;
    area: string;
    lat: number | null;
    long: number | null;
  } | null;
  categories: {
    id: string;
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
};

function formatPrice(
  product: Product
): string {
  if (
    product.price !==
    null
  ) {
    return `₦${product.price.toLocaleString()}`;
  }

  if (
    product.priceMin !==
      null &&
    product.priceMax !==
      null
  ) {
    return `₦${product.priceMin.toLocaleString()} - ₦${product.priceMax.toLocaleString()}`;
  }

  if (
    product.priceMin !==
    null
  ) {
    return `From ₦${product.priceMin.toLocaleString()}`;
  }

  if (
    product.priceMax !==
    null
  ) {
    return `Up to ₦${product.priceMax.toLocaleString()}`;
  }

  return "Ask seller";
}

export default function BusinessDetailsPage() {
  const router =
    useRouter();

  const params =
    useParams<{
      id: string;
    }>();

  const businessId =
    params.id;

  const [business, setBusiness] =
    useState<Business | null>(
      null
    );

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [name, setName] =
    useState("");

  const [ownerName, setOwnerName] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [phone, setPhone] =
    useState("");

  const [imageUrl, setImageUrl] =
    useState("");

  const [availability, setAvailability] =
    useState<
      | "AVAILABLE"
      | "ASK_SELLER"
      | "UNAVAILABLE"
    >("ASK_SELLER");

  const [status, setStatus] =
    useState<
      | "ACTIVE"
      | "INACTIVE"
      | "PENDING"
    >("ACTIVE");

  const [verification, setVerification] =
    useState<
      | "VERIFIED"
      | "UNVERIFIED"
    >("UNVERIFIED");

  async function loadBusiness() {
    setLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/admin/businesses/${businessId}`,
          {
            cache:
              "no-store",
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data?.error ===
            "string"
            ? data.error
            : "Unable to load business."
        );
      }

      const loadedBusiness =
        data.business as Business;

      setBusiness(
        loadedBusiness
      );

      setName(
        loadedBusiness.name
      );

      setOwnerName(
        loadedBusiness.ownerName ??
          ""
      );

      setDescription(
        loadedBusiness.description ??
          ""
      );

      setPhone(
        loadedBusiness.phone ??
          ""
      );

      setImageUrl(
        loadedBusiness.imageUrl ??
          ""
      );

      setAvailability(
        loadedBusiness.availability
      );

      setStatus(
        loadedBusiness.status
      );

      setVerification(
        loadedBusiness.verification
      );
    } catch (error) {
      console.error(
        "Business load error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to load business."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!businessId) {
      return;
    }

    void loadBusiness();
  }, [
    businessId,
  ]);

  async function saveBusiness(
    event: React.SubmitEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setSaving(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/admin/businesses/${businessId}`,
          {
            method:
              "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              name:
                name.trim(),
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
              availability,
              status,
              verification,
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

      setBusiness(
        data.business as Business
      );
    } catch (error) {
      console.error(
        "Business update error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to update business."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[#FFF7ED] p-6">
        <div className="mx-auto flex min-h-[70vh] max-w-[1100px] items-center justify-center">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading business...
          </div>
        </div>
      </main>
    );
  }

  if (!business) {
    return (
      <main className="min-h-screen bg-[#FFF7ED] p-6">
        <div className="mx-auto max-w-[1100px]">
          <Link
            href="/admin/businesses"
            className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to businesses
          </Link>

          <div className="mt-5 rounded-2xl border border-red-200 bg-white p-8 text-center">
            <Store className="mx-auto h-8 w-8 text-gray-300" />

            <p className="mt-3 text-sm font-bold text-gray-700">
              Business unavailable
            </p>

            <p className="mt-1 text-xs text-gray-400">
              {error ||
                "The business could not be loaded."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FFF7ED] p-4 sm:p-6">
      <div className="mx-auto max-w-[1100px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/admin/businesses"
            className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 transition hover:text-[#9F2D18]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to businesses
          </Link>

          <div className="flex gap-2">
            <Link
              href={`/seller/${business.id}`}
              target="_blank"
              className="rounded-xl border border-[#E8E4DE] bg-white px-3.5 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              View public page
            </Link>

            <Link
              href={`/admin/businesses/${business.id}/products/new`}
              className="inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-3.5 py-2.5 text-xs font-bold text-white hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Add product
            </Link>
          </div>
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_330px]">
          {/* BUSINESS FORM */}

          <div className="overflow-hidden rounded-[22px] border border-[#E8E4DE] bg-[#FFFDFC] shadow-sm">
            <div className="border-b border-[#EAE6DF] bg-white px-5 py-5 sm:px-7">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FF5A36] text-white">
                  <Pencil className="h-5 w-5" />
                </div>

                <div>
                  <h1 className="text-xl font-bold text-[#17202A]">
                    {business.name}
                  </h1>

                  <p className="mt-0.5 text-xs text-gray-500">
                    Business details
                  </p>
                </div>
              </div>
            </div>

            <form
              onSubmit={
                saveBusiness
              }
              className="space-y-6 p-5 sm:p-7"
            >
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
                  {error}
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-700">
                  Business image
                </label>

                <p className="mt-1 text-[10px] text-gray-400">
                  Optional.
                </p>

                <div className="mt-3 max-w-[520px]">
                  <ImageUpload
                    value={
                      imageUrl ||
                      undefined
                    }
                    onChange={
                      setImageUrl
                    }
                    disabled={
                      saving
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Business name
                  </label>

                  <input
                    value={name}
                    onChange={(
                      event
                    ) =>
                      setName(
                        event.target
                          .value
                      )
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82]"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Owner name
                  </label>

                  <input
                    value={
                      ownerName
                    }
                    onChange={(
                      event
                    ) =>
                      setOwnerName(
                        event.target
                          .value
                      )
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-gray-700">
                    Description
                  </label>

                  <textarea
                    rows={4}
                    value={
                      description
                    }
                    onChange={(
                      event
                    ) =>
                      setDescription(
                        event.target
                          .value
                      )
                    }
                    className="mt-2 w-full resize-none rounded-xl border border-[#E8E4DE] bg-white px-3 py-3 text-xs outline-none focus:border-[#FF9B82]"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Phone
                  </label>

                  <input
                    value={phone}
                    onChange={(
                      event
                    ) =>
                      setPhone(
                        event.target
                          .value
                      )
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82]"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Area
                  </label>

                  <input
                    value={
                      business.location
                        ?.area ??
                      ""
                    }
                    disabled
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-gray-50 px-3 text-xs text-gray-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Availability
                  </label>

                  <select
                    value={
                      availability
                    }
                    onChange={(
                      event
                    ) =>
                      setAvailability(
                        event.target
                          .value as typeof availability
                      )
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs"
                  >
                    <option value="AVAILABLE">
                      Available
                    </option>
                    <option value="ASK_SELLER">
                      Ask seller
                    </option>
                    <option value="UNAVAILABLE">
                      Unavailable
                    </option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Status
                  </label>

                  <select
                    value={status}
                    onChange={(
                      event
                    ) =>
                      setStatus(
                        event.target
                          .value as typeof status
                      )
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs"
                  >
                    <option value="ACTIVE">
                      Active
                    </option>
                    <option value="INACTIVE">
                      Inactive
                    </option>
                    <option value="PENDING">
                      Pending
                    </option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-gray-700">
                    Verification
                  </label>

                  <select
                    value={
                      verification
                    }
                    onChange={(
                      event
                    ) =>
                      setVerification(
                        event.target
                          .value as typeof verification
                      )
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs"
                  >
                    <option value="UNVERIFIED">
                      Unverified
                    </option>
                    <option value="VERIFIED">
                      Verified
                    </option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end border-t border-[#EAE6DF] pt-5">
                <button
                  type="submit"
                  disabled={
                    saving
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-bold text-white disabled:opacity-60"
                >
                  {saving && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}

                  {saving
                    ? "Saving..."
                    : "Save changes"}
                </button>
              </div>
            </form>
          </div>

          {/* PRODUCT SUMMARY */}

          <aside className="h-fit overflow-hidden rounded-[22px] border border-[#E8E4DE] bg-[#FFFDFC] shadow-sm">
            <div className="border-b border-[#EAE6DF] bg-white px-5 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#17202A]">
                    Products
                  </h2>

                  <p className="mt-0.5 text-[10px] text-gray-400">
                    {business.products.length}{" "}
                    total
                  </p>
                </div>

                <Package className="h-5 w-5 text-gray-400" />
              </div>
            </div>

            <div className="divide-y divide-[#F0ECE6]">
              {business.products.length ===
              0 ? (
                <div className="px-5 py-10 text-center">
                  <Package className="mx-auto h-7 w-7 text-gray-300" />

                  <p className="mt-2 text-xs font-semibold text-gray-600">
                    No products yet
                  </p>
                </div>
              ) : (
                business.products.map(
                  (product) => {
                    const productImage =
                      product.images?.[0]
                        ?.url ??
                      product.imageUrl ??
                      null;

                    return (
                      <Link
                        key={
                          product.id
                        }
                        href={`/admin/businesses/${business.id}/products/${product.id}/edit`}
                        className="flex gap-3 px-5 py-4 transition hover:bg-gray-50"
                      >
                        {productImage ? (
                          <img
                            src={
                              productImage
                            }
                            alt={
                              product.name
                            }
                            className="h-12 w-12 shrink-0 rounded-xl object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#FCFAF6] text-gray-400">
                            <ImageIcon className="h-5 w-5" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-bold text-[#17202A]">
                            {
                              product.name
                            }
                          </p>

                          <p className="mt-1 text-[10px] text-gray-400">
                            {formatPrice(
                              product
                            )}
                          </p>

                          <p className="mt-1 text-[9px] text-gray-400">
                            {
                              product.images
                                .length
                            }{" "}
                            image
                            {product.images
                              .length ===
                            1
                              ? ""
                              : "s"}
                          </p>
                        </div>
                      </Link>
                    );
                  }
                )
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}