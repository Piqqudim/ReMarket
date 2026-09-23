"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  ArrowLeft,
  Loader2,
  Plus,
  Store,
} from "lucide-react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import ImageUpload from "@/components/ImageUpload";

type Category = {
  id: string;
  name: string;
};

type SocialLinkInput = {
  platform:
    | "WHATSAPP"
    | "INSTAGRAM"
    | "TIKTOK"
    | "FACEBOOK"
    | "PHONE"
    | "DIRECTIONS";
  handle: string;
};

export default function NewBusinessPage() {
  const router =
    useRouter();

  const [name, setName] =
    useState("");

  const [ownerName, setOwnerName] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [area, setArea] =
    useState("");

  const [lat, setLat] =
    useState("");

  const [lng, setLng] =
    useState("");

  const [phone, setPhone] =
    useState("");

  const [priceMin, setPriceMin] =
    useState("");

  const [priceMax, setPriceMax] =
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

  const [imageUrl, setImageUrl] =
    useState("");

  const [categories, setCategories] =
    useState<Category[]>([]);

  const [selectedCategoryIds, setSelectedCategoryIds] =
    useState<string[]>([]);

  const [socialLinks, setSocialLinks] =
    useState<SocialLinkInput[]>(
      []
    );

  const [loadingCategories, setLoadingCategories] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    const controller =
      new AbortController();

    async function loadCategories() {
      try {
        const response =
          await fetch(
            "/api/categories",
            {
              cache:
                "no-store",
              signal:
                controller.signal,
            }
          );

        if (!response.ok) {
          throw new Error(
            "Unable to load categories."
          );
        }

        const data =
          await response.json();

        setCategories(
          Array.isArray(
            data.categories
          )
            ? data.categories
            : []
        );
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name ===
            "AbortError"
        ) {
          return;
        }

        console.error(
          "Categories error:",
          error
        );
      } finally {
        if (
          !controller.signal.aborted
        ) {
          setLoadingCategories(
            false
          );
        }
      }
    }

    void loadCategories();

    return () => {
      controller.abort();
    };
  }, []);

  function toggleCategory(
    categoryId: string
  ) {
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

  function addSocialLink() {
    setSocialLinks(
      (current) => [
        ...current,
        {
          platform:
            "WHATSAPP",
          handle: "",
        },
      ]
    );
  }

  function updateSocialLink(
    index: number,
    field:
      | "platform"
      | "handle",
    value: string
  ) {
    setSocialLinks(
      (current) =>
        current.map(
          (link, linkIndex) =>
            linkIndex ===
            index
              ? {
                  ...link,
                  [field]:
                    value,
                }
              : link
        )
    );
  }

  function removeSocialLink(
    index: number
  ) {
    setSocialLinks(
      (current) =>
        current.filter(
          (
            _,
            linkIndex
          ) =>
            linkIndex !==
            index
        )
    );
  }

  async function submit(
    event: React.SubmitEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");

    const trimmedName =
      name.trim();

    const trimmedArea =
      area.trim();

    if (!trimmedName) {
      setError(
        "Business name is required."
      );
      return;
    }

    if (!trimmedArea) {
      setError(
        "Business area is required."
      );
      return;
    }

    setSaving(true);

    try {
      const response =
        await fetch(
          "/api/admin/businesses",
          {
            method: "POST",
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
              area:
                trimmedArea,
              lat:
                lat.trim() ||
                null,
              lng:
                lng.trim() ||
                null,
              phone:
                phone.trim() ||
                null,
              priceMin:
                priceMin.trim() ||
                null,
              priceMax:
                priceMax.trim() ||
                null,
              availability,
              status,
              verification,
              imageUrl:
                imageUrl.trim() ||
                null,
              categoryIds:
                selectedCategoryIds,
              socialLinks:
                socialLinks.filter(
                  (link) =>
                    link.handle.trim()
                ),
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
            : "Unable to create business."
        );
      }

      const createdBusinessId =
        data.business?.id ??
        data.id;

      if (
        typeof createdBusinessId !==
        "string"
      ) {
        throw new Error(
          "Business was created but no business ID was returned."
        );
      }

      router.push(
        `/admin/businesses/${createdBusinessId}`
      );
    } catch (error) {
      console.error(
        "Create business error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to create business."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#FFF7ED] p-4 sm:p-6">
      <div className="mx-auto max-w-[1100px]">
        <Link
          href="/admin/businesses"
          className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 transition hover:text-[#9F2D18]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to businesses
        </Link>

        <div className="mt-5 overflow-hidden rounded-[22px] border border-[#E8E4DE] bg-[#FFFDFC] shadow-sm">
          <div className="border-b border-[#EAE6DF] bg-white px-5 py-5 sm:px-7">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FF5A36] text-white">
                <Store className="h-5 w-5" />
              </div>

              <div>
                <h1 className="text-xl font-bold text-[#17202A]">
                  Add business
                </h1>

                <p className="mt-0.5 text-xs text-gray-500">
                  Add a local business to ReMarket.
                </p>
              </div>
            </div>
          </div>

          <form
            onSubmit={submit}
            className="space-y-7 p-5 sm:p-7"
          >
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
                {error}
              </div>
            )}

            {/* BUSINESS DETAILS */}

            <section>
              <h2 className="text-sm font-bold text-[#17202A]">
                Business details
              </h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Business name
                  </label>

                  <input
                    value={name}
                    onChange={(event) =>
                      setName(
                        event.target.value
                      )
                    }
                    placeholder="e.g. Mandy Treasures"
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Owner name
                  </label>

                  <input
                    value={ownerName}
                    onChange={(event) =>
                      setOwnerName(
                        event.target.value
                      )
                    }
                    placeholder="Optional"
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-gray-700">
                    Description
                  </label>

                  <textarea
                    value={description}
                    onChange={(event) =>
                      setDescription(
                        event.target.value
                      )
                    }
                    placeholder="What does this business sell or offer?"
                    rows={4}
                    className="mt-2 w-full resize-none rounded-xl border border-[#E8E4DE] bg-white px-3 py-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10"
                  />
                </div>
              </div>
            </section>

            {/* IMAGE */}

            <section>
              <h2 className="text-sm font-bold text-[#17202A]">
                Business image
              </h2>

              <p className="mt-1 text-[11px] text-gray-500">
                Optional. This appears on buyer-facing business cards.
              </p>

              <div className="mt-4 max-w-[520px]">
                <ImageUpload
                  value={
                    imageUrl ||
                    undefined
                  }
                  onChange={
                    setImageUrl
                  }
                  disabled={saving}
                />
              </div>
            </section>

            {/* LOCATION */}

            <section>
              <h2 className="text-sm font-bold text-[#17202A]">
                Location
              </h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div className="sm:col-span-3">
                  <label className="text-xs font-semibold text-gray-700">
                    Area
                  </label>

                  <input
                    value={area}
                    onChange={(event) =>
                      setArea(
                        event.target.value
                      )
                    }
                    placeholder="e.g. Ogba"
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Latitude
                  </label>

                  <input
                    value={lat}
                    onChange={(event) =>
                      setLat(
                        event.target.value
                      )
                    }
                    placeholder="Optional"
                    inputMode="decimal"
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Longitude
                  </label>

                  <input
                    value={lng}
                    onChange={(event) =>
                      setLng(
                        event.target.value
                      )
                    }
                    placeholder="Optional"
                    inputMode="decimal"
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10"
                  />
                </div>
              </div>
            </section>

            {/* CATEGORIES */}

            <section>
              <h2 className="text-sm font-bold text-[#17202A]">
                Categories
              </h2>

              {loadingCategories ? (
                <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading categories...
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  {categories.map(
                    (item) => {
                      const active =
                        selectedCategoryIds.includes(
                          item.id
                        );

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            toggleCategory(
                              item.id
                            )
                          }
                          className={`rounded-full border px-3 py-2 text-[11px] font-semibold transition ${
                            active
                              ? "border-[#FFB09B] bg-[#FFF1ED] text-[#9F2D18]"
                              : "border-[#E8E4DE] bg-white text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {item.name}
                        </button>
                      );
                    }
                  )}
                </div>
              )}
            </section>

            {/* CONTACT / PRICING */}

            <section>
              <h2 className="text-sm font-bold text-[#17202A]">
                Contact and pricing
              </h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Phone
                  </label>

                  <input
                    value={phone}
                    onChange={(event) =>
                      setPhone(
                        event.target.value
                      )
                    }
                    placeholder="Optional"
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Minimum price
                  </label>

                  <input
                    value={priceMin}
                    onChange={(event) =>
                      setPriceMin(
                        event.target.value
                      )
                    }
                    inputMode="numeric"
                    placeholder="Optional"
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Maximum price
                  </label>

                  <input
                    value={priceMax}
                    onChange={(event) =>
                      setPriceMax(
                        event.target.value
                      )
                    }
                    inputMode="numeric"
                    placeholder="Optional"
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82] focus:ring-4 focus:ring-[#FF5A36]/10"
                  />
                </div>
              </div>
            </section>

            {/* STATUS */}

            <section>
              <h2 className="text-sm font-bold text-[#17202A]">
                Status
              </h2>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Availability
                  </label>

                  <select
                    value={
                      availability
                    }
                    onChange={(event) =>
                      setAvailability(
                        event.target
                          .value as typeof availability
                      )
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82]"
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
                    Business status
                  </label>

                  <select
                    value={status}
                    onChange={(event) =>
                      setStatus(
                        event.target
                          .value as typeof status
                      )
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82]"
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

                <div>
                  <label className="text-xs font-semibold text-gray-700">
                    Verification
                  </label>

                  <select
                    value={
                      verification
                    }
                    onChange={(event) =>
                      setVerification(
                        event.target
                          .value as typeof verification
                      )
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs outline-none focus:border-[#FF9B82]"
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
            </section>

            {/* SOCIAL LINKS */}

            <section>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#17202A]">
                    Social and contact links
                  </h2>

                  <p className="mt-1 text-[11px] text-gray-500">
                    Optional direct-contact details.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    addSocialLink
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#E8E4DE] bg-white px-3 py-2 text-[11px] font-semibold text-gray-700 hover:border-[#FFB09B] hover:text-[#9F2D18]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add link
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {socialLinks.map(
                  (link, index) => (
                    <div
                      key={index}
                      className="grid gap-2 sm:grid-cols-[180px_1fr_auto]"
                    >
                      <select
                        value={
                          link.platform
                        }
                        onChange={(
                          event
                        ) =>
                          updateSocialLink(
                            index,
                            "platform",
                            event.target
                              .value
                          )
                        }
                        className="h-11 rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs"
                      >
                        <option value="WHATSAPP">
                          WhatsApp
                        </option>

                        <option value="INSTAGRAM">
                          Instagram
                        </option>

                        <option value="TIKTOK">
                          TikTok
                        </option>

                        <option value="FACEBOOK">
                          Facebook
                        </option>

                        <option value="PHONE">
                          Phone
                        </option>

                        <option value="DIRECTIONS">
                          Directions
                        </option>
                      </select>

                      <input
                        value={
                          link.handle
                        }
                        onChange={(
                          event
                        ) =>
                          updateSocialLink(
                            index,
                            "handle",
                            event.target
                              .value
                          )
                        }
                        placeholder="Handle, number or value"
                        className="h-11 rounded-xl border border-[#E8E4DE] bg-white px-3 text-xs"
                      />

                      <button
                        type="button"
                        onClick={() =>
                          removeSocialLink(
                            index
                          )
                        }
                        className="h-11 rounded-xl border border-[#E8E4DE] px-3 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                      >
                        Remove
                      </button>
                    </div>
                  )
                )}
              </div>
            </section>

            {/* ACTIONS */}

            <div className="flex justify-end gap-2 border-t border-[#EAE6DF] pt-5">
              <Link
                href="/admin/businesses"
                className="rounded-xl border border-[#E8E4DE] bg-white px-4 py-3 text-xs font-bold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </Link>

              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}

                {saving
                  ? "Creating..."
                  : "Create business"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}