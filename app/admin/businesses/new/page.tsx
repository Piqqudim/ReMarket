"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Home,
  Package,
  Plus,
  Store,
  Trash2,
  Users,
  X,
} from "lucide-react";

type Category = {
  id: string;
  name: string;
};

type SocialLink = {
  platform:
    | "WHATSAPP"
    | "INSTAGRAM"
    | "TIKTOK"
    | "FACEBOOK"
    | "PHONE"
    | "DIRECTIONS";
  handle: string;
};

const NAV_ITEMS = [
  {
    label: "Overview",
    href: "/admin",
    icon: Home,
  },
  {
    label: "Businesses",
    href: "/admin/businesses",
    icon: Store,
  },
  {
    label: "Products",
    href: "/admin/products",
    icon: Package,
  },
  {
    label: "Requests",
    href: "/admin/requests",
    icon: Users,
  },
];

const SOCIAL_PLATFORMS = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "PHONE", label: "Phone" },
  { value: "DIRECTIONS", label: "Directions" },
] as const;

export default function NewBusinessPage() {
  const router = useRouter();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] =
    useState(true);

  const [name, setName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [phone, setPhone] = useState("");
  const [description, setDescription] = useState("");

  const [area, setArea] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  const [availability, setAvailability] =
    useState("ASK_SELLER");

  const [verification, setVerification] =
    useState("UNVERIFIED");

  const [status, setStatus] = useState("ACTIVE");

  const [selectedCategories, setSelectedCategories] =
    useState<string[]>([]);

  const [socialLinks, setSocialLinks] =
    useState<SocialLink[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadCategories() {
      try {
        const response = await fetch(
          "/api/categories"
        );

        if (!response.ok) {
          throw new Error(
            "Unable to load categories"
          );
        }

        const data = await response.json();

        setCategories(
          Array.isArray(data)
            ? data
            : data.categories ?? []
        );
      } catch (err) {
        console.error(err);
        setError(
          "Unable to load categories."
        );
      } finally {
        setLoadingCategories(false);
      }
    }

    loadCategories();
  }, []);

  function toggleCategory(categoryName: string) {
    setSelectedCategories((current) =>
      current.includes(categoryName)
        ? current.filter(
            (item) => item !== categoryName
          )
        : [...current, categoryName]
    );
  }

  function addSocialLink() {
    setSocialLinks((current) => [
      ...current,
      {
        platform: "WHATSAPP",
        handle: "",
      },
    ]);
  }

  function removeSocialLink(index: number) {
    setSocialLinks((current) =>
      current.filter(
        (_, itemIndex) => itemIndex !== index
      )
    );
  }

  function updateSocialLink(
    index: number,
    field: "platform" | "handle",
    value: string
  ) {
    setSocialLinks((current) =>
      current.map((link, itemIndex) =>
        itemIndex === index
          ? {
              ...link,
              [field]: value,
            }
          : link
      )
    );
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");

    if (!name.trim()) {
      setError("Business name is required.");
      return;
    }

    if (!area.trim()) {
      setError("Business area is required.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        "/api/admin/businesses",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: name.trim(),
            ownerName:
              ownerName.trim() || undefined,
            phone: phone.trim() || undefined,
            description:
              description.trim() || undefined,

            area: area.trim(),

            lat: latitude
              ? Number(latitude)
              : undefined,

            lng: longitude
              ? Number(longitude)
              : undefined,

            categories: selectedCategories,

            availability,
            verification,
            status,

            socialLinks: socialLinks
              .filter(
                (link) => link.handle.trim()
              )
              .map((link) => ({
                platform: link.platform,
                handle: link.handle.trim(),
              })),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to create business."
        );
      }

      router.push("/admin/businesses");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create business."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FFF7ED] text-[#17202A]">
      <div className="mx-auto min-h-screen max-w-[1500px] px-3 py-3 sm:px-4">
        <div className="min-h-[calc(100vh-24px)] overflow-hidden rounded-[22px] border border-[#FF5A36] bg-[#FFFDFC] shadow-[0_10px_40px_rgba(159,45,24,0.08)]">

          {/* Header */}
          <header className="flex h-[66px] items-center justify-between border-b border-[#EAE6DF] bg-white px-4 sm:px-6">
            <Link
              href="/admin"
              className="flex items-center gap-2"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FF5A36] text-white">
                <Store size={19} />
              </div>

              <div>
                <p className="text-[15px] font-extrabold tracking-tight">
                  ReMarket
                </p>
                <p className="text-[10px] font-medium text-[#8B8178]">
                  Admin
                </p>
              </div>
            </Link>

            <Link
              href="/admin/businesses"
              className="flex items-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-3 py-2 text-sm font-semibold text-[#4A4039] transition hover:border-[#FF5A36] hover:text-[#9F2D18]"
            >
              <ArrowLeft size={16} />
              <span className="hidden sm:inline">
                Back to Businesses
              </span>
              <span className="sm:hidden">
                Back
              </span>
            </Link>
          </header>

          <div className="flex min-h-[calc(100vh-90px)]">

            {/* Sidebar */}
            <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] p-3 md:block">
              <div className="mb-5 px-2 pt-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#A49B92]">
                  Admin
                </p>
              </div>

              <nav className="space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;

                  const active =
                    item.label === "Businesses";

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={[
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
                        active
                          ? "bg-[#FFE3DA] text-[#9F2D18]"
                          : "text-[#675D55] hover:bg-white hover:text-[#9F2D18]",
                      ].join(" ")}
                    >
                      <Icon size={18} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </aside>

            {/* Main */}
            <main className="min-w-0 flex-1 p-4 pb-24 sm:p-6 md:pb-8">

              {/* Page heading */}
              <div className="mb-6">
                <Link
                  href="/admin/businesses"
                  className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-[#9F2D18] hover:underline"
                >
                  <ArrowLeft size={14} />
                  Businesses
                </Link>

                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                  <div>
                    <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                      Add Business
                    </h1>

                    <p className="mt-1 max-w-xl text-sm text-[#81776F]">
                      Add a local business to ReMarket
                      so buyers can discover and contact
                      them.
                    </p>
                  </div>

                  <div className="hidden rounded-xl bg-[#FFF0D9] px-3 py-2 text-xs font-semibold text-[#8D4A28] sm:block">
                    V1 Admin Onboarding
                  </div>
                </div>
              </div>

              {error && (
                <div className="mb-5 flex items-start gap-3 rounded-xl border border-[#F1B5A5] bg-[#FFF0ED] px-4 py-3 text-sm text-[#9F2D18]">
                  <X
                    size={18}
                    className="mt-0.5 shrink-0"
                  />
                  <span>{error}</span>
                </div>
              )}

              <form
                onSubmit={handleSubmit}
                className="space-y-5"
              >

                {/* Business information */}
                <section className="rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5">
                  <div className="mb-5 flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#9F2D18]">
                      <BriefcaseBusiness size={19} />
                    </div>

                    <div>
                      <h2 className="font-extrabold">
                        Business information
                      </h2>
                      <p className="mt-0.5 text-xs text-[#8B8178]">
                        Basic details about the seller.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field
                      label="Business name"
                      required
                      value={name}
                      onChange={setName}
                      placeholder="e.g. Mandy Treasures"
                    />

                    <Field
                      label="Owner name"
                      value={ownerName}
                      onChange={setOwnerName}
                      placeholder="e.g. Mandy"
                    />

                    <Field
                      label="Phone number"
                      value={phone}
                      onChange={setPhone}
                      placeholder="e.g. 08012345678"
                    />

                    <div className="sm:col-span-2">
                      <label className="mb-1.5 block text-xs font-bold text-[#4A4039]">
                        Description
                      </label>

                      <textarea
                        value={description}
                        onChange={(event) =>
                          setDescription(
                            event.target.value
                          )
                        }
                        rows={4}
                        placeholder="What does this business sell or offer?"
                        className="w-full resize-none rounded-xl border border-[#E3DED7] bg-[#FFFDFC] px-3.5 py-3 text-sm outline-none transition placeholder:text-[#B2AAA3] focus:border-[#FF5A36] focus:ring-2 focus:ring-[#FF5A36]/10"
                      />
                    </div>
                  </div>
                </section>

                {/* Location */}
                <section className="rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5">
                  <div className="mb-5">
                    <h2 className="font-extrabold">
                      Location
                    </h2>

                    <p className="mt-0.5 text-xs text-[#8B8178]">
                      This helps buyers find businesses
                      nearby.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="sm:col-span-3">
                      <Field
                        label="Area"
                        required
                        value={area}
                        onChange={setArea}
                        placeholder="e.g. LASU, Ikeja, Yaba"
                      />
                    </div>

                    <Field
                      label="Latitude"
                      value={latitude}
                      onChange={setLatitude}
                      placeholder="Optional"
                    />

                    <Field
                      label="Longitude"
                      value={longitude}
                      onChange={setLongitude}
                      placeholder="Optional"
                    />
                  </div>

                  <div className="mt-4 rounded-xl bg-[#F8F5F0] px-3.5 py-3 text-xs leading-5 text-[#81776F]">
                    Latitude and longitude are optional.
                    The area is enough for basic local
                    discovery.
                  </div>
                </section>

                {/* Categories */}
                <section className="rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5">
                  <div className="mb-5">
                    <h2 className="font-extrabold">
                      Categories
                    </h2>

                    <p className="mt-0.5 text-xs text-[#8B8178]">
                      Select everything this business
                      sells or offers.
                    </p>
                  </div>

                  {loadingCategories ? (
                    <div className="rounded-xl bg-[#F8F5F0] px-4 py-6 text-center text-sm text-[#81776F]">
                      Loading categories...
                    </div>
                  ) : categories.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#D8D0C8] px-4 py-6 text-center text-sm text-[#81776F]">
                      No categories available.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                      {categories.map(
                        (category) => {
                          const selected =
                            selectedCategories.includes(
                              category.name
                            );

                          return (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() =>
                                toggleCategory(
                                  category.name
                                )
                              }
                              className={[
                                "flex items-center justify-between rounded-xl border px-3 py-3 text-left text-sm font-semibold transition",
                                selected
                                  ? "border-[#FF5A36] bg-[#FFF0EA] text-[#9F2D18]"
                                  : "border-[#E8E4DE] bg-[#FFFDFC] text-[#675D55] hover:border-[#FFB29F]",
                              ].join(" ")}
                            >
                              <span>
                                {category.name}
                              </span>

                              {selected && (
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#FF5A36] text-white">
                                  <Check size={12} />
                                </span>
                              )}
                            </button>
                          );
                        }
                      )}
                    </div>
                  )}
                </section>

                {/* Business status */}
                <section className="rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5">
                  <div className="mb-5">
                    <h2 className="font-extrabold">
                      Business status
                    </h2>

                    <p className="mt-0.5 text-xs text-[#8B8178]">
                      Control how this business appears
                      on ReMarket.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-3">
                    <SelectField
                      label="Availability"
                      value={availability}
                      onChange={setAvailability}
                      options={[
                        {
                          value: "AVAILABLE",
                          label: "Available",
                        },
                        {
                          value: "ASK_SELLER",
                          label: "Ask seller",
                        },
                        {
                          value: "UNAVAILABLE",
                          label: "Unavailable",
                        },
                      ]}
                    />

                    <SelectField
                      label="Verification"
                      value={verification}
                      onChange={setVerification}
                      options={[
                        {
                          value: "UNVERIFIED",
                          label: "Unverified",
                        },
                        {
                          value: "VERIFIED",
                          label: "Verified",
                        },
                      ]}
                    />

                    <SelectField
                      label="Status"
                      value={status}
                      onChange={setStatus}
                      options={[
                        {
                          value: "ACTIVE",
                          label: "Active",
                        },
                        {
                          value: "INACTIVE",
                          label: "Inactive",
                        },
                        {
                          value: "PENDING",
                          label: "Pending",
                        },
                      ]}
                    />
                  </div>
                </section>

                {/* Social links */}
                <section className="rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5">
                  <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                    <div>
                      <h2 className="font-extrabold">
                        Contact & social links
                      </h2>

                      <p className="mt-0.5 text-xs text-[#8B8178]">
                        Add ways buyers can contact this
                        business.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={addSocialLink}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FFF0EA] px-3 py-2 text-xs font-bold text-[#9F2D18] transition hover:bg-[#FFE3DA]"
                    >
                      <Plus size={15} />
                      Add contact
                    </button>
                  </div>

                  {socialLinks.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#D8D0C8] px-4 py-7 text-center">
                      <p className="text-sm font-semibold text-[#675D55]">
                        No contact links added
                      </p>

                      <p className="mt-1 text-xs text-[#9B928A]">
                        Add WhatsApp, Instagram, phone,
                        or another contact method.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {socialLinks.map(
                        (link, index) => (
                          <div
                            key={index}
                            className="flex flex-col gap-2 rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] p-3 sm:flex-row"
                          >
                            <div className="relative sm:w-[190px]">
                              <select
                                value={
                                  link.platform
                                }
                                onChange={(event) =>
                                  updateSocialLink(
                                    index,
                                    "platform",
                                    event.target
                                      .value
                                  )
                                }
                                className="w-full appearance-none rounded-lg border border-[#E3DED7] bg-white px-3 py-2.5 pr-9 text-sm font-semibold outline-none focus:border-[#FF5A36]"
                              >
                                {SOCIAL_PLATFORMS.map(
                                  (platform) => (
                                    <option
                                      key={
                                        platform.value
                                      }
                                      value={
                                        platform.value
                                      }
                                    >
                                      {platform.label}
                                    </option>
                                  )
                                )}
                              </select>

                              <ChevronDown
                                size={15}
                                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8B8178]"
                              />
                            </div>

                            <input
                              value={link.handle}
                              onChange={(event) =>
                                updateSocialLink(
                                  index,
                                  "handle",
                                  event.target.value
                                )
                              }
                              placeholder="Phone number, username, or URL"
                              className="min-w-0 flex-1 rounded-lg border border-[#E3DED7] bg-white px-3 py-2.5 text-sm outline-none placeholder:text-[#B2AAA3] focus:border-[#FF5A36]"
                            />

                            <button
                              type="button"
                              onClick={() =>
                                removeSocialLink(
                                  index
                                )
                              }
                              className="flex h-10 items-center justify-center rounded-lg px-3 text-[#A49B92] transition hover:bg-[#FFF0ED] hover:text-[#9F2D18]"
                              aria-label="Remove contact"
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  )}
                </section>

                {/* Actions */}
                <div className="flex flex-col-reverse gap-3 border-t border-[#EAE6DF] pt-5 sm:flex-row sm:justify-end">
                  <Link
                    href="/admin/businesses"
                    className="flex h-11 items-center justify-center rounded-xl border border-[#E3DED7] bg-white px-5 text-sm font-bold text-[#675D55] transition hover:border-[#FF5A36] hover:text-[#9F2D18]"
                  >
                    Cancel
                  </Link>

                  <button
                    type="submit"
                    disabled={saving}
                    className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-6 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#E94B29] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Check size={17} />
                        Create Business
                      </>
                    )}
                  </button>
                </div>
              </form>
            </main>
          </div>

          {/* Mobile navigation */}
          <nav className="fixed bottom-3 left-3 right-3 z-50 flex rounded-2xl border border-[#E8E4DE] bg-white/95 p-2 shadow-[0_8px_30px_rgba(0,0,0,0.10)] backdrop-blur md:hidden">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active =
                item.label === "Businesses";

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-bold",
                    active
                      ? "bg-[#FFE3DA] text-[#9F2D18]"
                      : "text-[#8B8178]",
                  ].join(" ")}
                >
                  <Icon size={17} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- */
/* Reusable form components           */
/* ---------------------------------- */

function Field({
  label,
  required,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold text-[#4A4039]">
        {label}
        {required && (
          <span className="ml-1 text-[#FF5A36]">
            *
          </span>
        )}
      </label>

      <input
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        placeholder={placeholder}
        className="h-11 w-full rounded-xl border border-[#E3DED7] bg-[#FFFDFC] px-3.5 text-sm outline-none transition placeholder:text-[#B2AAA3] focus:border-[#FF5A36] focus:ring-2 focus:ring-[#FF5A36]/10"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: {
    value: string;
    label: string;
  }[];
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-bold text-[#4A4039]">
        {label}
      </label>

      <div className="relative">
        <select
          value={value}
          onChange={(event) =>
            onChange(event.target.value)
          }
          className="h-11 w-full appearance-none rounded-xl border border-[#E3DED7] bg-[#FFFDFC] px-3.5 pr-9 text-sm font-medium outline-none focus:border-[#FF5A36] focus:ring-2 focus:ring-[#FF5A36]/10"
        >
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
            >
              {option.label}
            </option>
          ))}
        </select>

        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8B8178]"
        />
      </div>
    </div>
  );
}