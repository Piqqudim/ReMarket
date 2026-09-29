"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import Link from "next/link";

import {
  ArrowLeft,
  Briefcase,
  Building2,
  Camera,
  Car,
  Check,
  ChevronDown,
  Coffee,
  Cpu,
  Dumbbell,
  Gift,
  Heart,
  Home,
  Laptop,
  Layers3,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Plus,
  Scissors,
  Shirt,
  Smartphone,
  Sparkles,
  Store,
  Utensils,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";

import {
  DEFAULT_CATEGORIES,
  getCategoryIcon,
  type ReMarketCategory,
} from "@/lib/categories";

type Category = {
  id: string;
  name: string;
  iconKey: string;
  isActive: boolean;
  sortOrder: number;
  _count: {
    business: number;
    products: number;
    requests: number;
  };
};

type IconDefinition = {
  key: string;
  label: string;
  icon: LucideIcon;
};

const ICONS: IconDefinition[] = [
  {
    key: "Store",
    label: "Store",
    icon: Store,
  },
  {
    key: "Shirt",
    label: "Fashion",
    icon: Shirt,
  },
  {
    key: "Smartphone",
    label: "Phone",
    icon: Smartphone,
  },
  {
    key: "Laptop",
    label: "Laptop",
    icon: Laptop,
  },
  {
    key: "Cpu",
    label: "Electronics",
    icon: Cpu,
  },
  {
    key: "Utensils",
    label: "Food",
    icon: Utensils,
  },
  {
    key: "Coffee",
    label: "Cafe",
    icon: Coffee,
  },
  {
    key: "Sparkles",
    label: "Beauty",
    icon: Sparkles,
  },
  {
    key: "Scissors",
    label: "Salon",
    icon: Scissors,
  },
  {
    key: "Layers3",
    label: "Textiles",
    icon: Layers3,
  },
  {
    key: "Wrench",
    label: "Services",
    icon: Wrench,
  },
  {
    key: "Briefcase",
    label: "Business",
    icon: Briefcase,
  },
  {
    key: "Building2",
    label: "Building",
    icon: Building2,
  },
  {
    key: "Home",
    label: "Home",
    icon: Home,
  },
  {
    key: "Car",
    label: "Automotive",
    icon: Car,
  },
  {
    key: "MapPin",
    label: "Location",
    icon: MapPin,
  },
  {
    key: "Package",
    label: "Package",
    icon: Package,
  },
  {
    key: "Gift",
    label: "Gift",
    icon: Gift,
  },
  {
    key: "Dumbbell",
    label: "Fitness",
    icon: Dumbbell,
  },
  {
    key: "Camera",
    label: "Camera",
    icon: Camera,
  },
  {
    key: "Heart",
    label: "Care",
    icon: Heart,
  },
];

function getIcon(
  iconKey?: string | null
): LucideIcon {
  return getCategoryIcon(iconKey);
}

function createFallbackAdminCategories(): Category[] {
  return DEFAULT_CATEGORIES.map(
    (category: ReMarketCategory) => ({
      id: category.id,
      name: category.name,
      iconKey: category.iconKey,
      isActive: true,
      sortOrder:
        DEFAULT_CATEGORIES.findIndex(
          (item) => item.id === category.id
        ),
      _count: {
        business: 0,
        products: 0,
        requests: 0,
      },
    })
  );
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] =
    useState<Category[]>(
      createFallbackAdminCategories()
    );

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  const [success, setSuccess] =
    useState("");

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [name, setName] =
    useState("");

  const [iconKey, setIconKey] =
    useState("Store");

  const [sortOrder, setSortOrder] =
    useState("0");

  const [isActive, setIsActive] =
    useState(true);

  const [showIconPicker, setShowIconPicker] =
    useState(false);

  const [usingFallback, setUsingFallback] =
    useState(false);

  async function loadCategories() {
    setLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          "/api/admin/categories",
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
            : "Unable to load categories."
        );
      }

      if (
        Array.isArray(
          data?.categories
        )
      ) {
        setCategories(
          data.categories
        );
        setUsingFallback(false);
        return;
      }

      setCategories(
        createFallbackAdminCategories()
      );
      setUsingFallback(true);
    } catch (loadError) {
      console.error(
        "Admin categories load error:",
        loadError
      );

      setCategories(
        createFallbackAdminCategories()
      );

      setUsingFallback(true);

      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load categories."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCategories();
  }, []);

  const sortedCategories =
    useMemo(
      () =>
        [...categories].sort(
          (a, b) => {
            if (
              a.sortOrder !==
              b.sortOrder
            ) {
              return (
                a.sortOrder -
                b.sortOrder
              );
            }

            return a.name.localeCompare(
              b.name
            );
          }
        ),
      [categories]
    );

  function resetForm() {
    setEditingId(null);
    setName("");
    setIconKey("Store");
    setSortOrder("0");
    setIsActive(true);
    setShowIconPicker(false);
  }

  function startEdit(
    category: Category
  ) {
    if (usingFallback) {
      return;
    }

    setEditingId(category.id);
    setName(category.name);
    setIconKey(
      category.iconKey ||
        "Store"
    );
    setSortOrder(
      String(category.sortOrder)
    );
    setIsActive(
      category.isActive
    );
    setShowIconPicker(false);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function submitForm(
    event: React.SubmitEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (usingFallback) {
      setError(
        "Categories could not be loaded from the Admin database. Try again before saving."
      );
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    const trimmedName =
      name.trim();

    const parsedSortOrder =
      Number(sortOrder);

    if (!trimmedName) {
      setError(
        "Category name is required."
      );
      setSaving(false);
      return;
    }

    if (
      !Number.isInteger(
        parsedSortOrder
      ) ||
      parsedSortOrder < 0
    ) {
      setError(
        "Sort order must be a whole number of 0 or greater."
      );
      setSaving(false);
      return;
    }

    try {
      const payload = {
        name: trimmedName,
        iconKey,
        sortOrder:
          parsedSortOrder,
        isActive,
      };

      const endpoint =
        editingId
          ? `/api/admin/categories/${editingId}`
          : "/api/admin/categories";

      const response =
        await fetch(
          endpoint,
          {
            method:
              editingId
                ? "PATCH"
                : "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify(
              payload
            ),
          }
        );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data?.error ===
            "string"
            ? data.error
            : "Unable to save category."
        );
      }

      setSuccess(
        editingId
          ? "Category updated successfully."
          : "Category created successfully."
      );

      resetForm();

      await loadCategories();
    } catch (submitError) {
      console.error(
        "Admin category save error:",
        submitError
      );

      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to save category."
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleCategory(
    category: Category
  ) {
    if (usingFallback) {
      setError(
        "Categories could not be loaded from the Admin database. Try again before changing a category."
      );
      return;
    }

    setError("");
    setSuccess("");

    try {
      const response =
        await fetch(
          `/api/admin/categories/${category.id}`,
          {
            method:
              "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              isActive:
                !category.isActive,
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
            : "Unable to update category."
        );
      }

      setCategories(
        (current) =>
          current.map(
            (item) =>
              item.id ===
              category.id
                ? data.category
                : item
          )
      );

      setSuccess(
        `${category.name} is now ${
          !category.isActive
            ? "active"
            : "inactive"
        }.`
      );
    } catch (toggleError) {
      console.error(
        "Admin category toggle error:",
        toggleError
      );

      setError(
        toggleError instanceof Error
          ? toggleError.message
          : "Unable to update category."
      );
    }
  }

  const SelectedIcon =
    getIcon(iconKey);

  return (
    <main className="min-h-screen bg-[#FFF7ED] p-4 sm:p-6">
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600 hover:text-[#9F2D18]"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to admin
            </Link>

            <h1 className="mt-3 text-2xl font-bold text-[#17202A]">
              Categories
            </h1>

            <p className="mt-1 text-sm text-gray-500">
              Manage the categories customers see
              across ReMarket.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-4 py-3 text-xs font-semibold text-gray-600">
            <Package className="h-4 w-4 text-[#FF5A36]" />

            {categories.length} categories
          </div>
        </div>

        {usingFallback && (
          <div className="mt-5 flex items-start gap-3 rounded-xl border border-[#F2C7BC] bg-[#FFF5F2] px-4 py-3">
            <div className="mt-0.5">
              <Store className="h-4 w-4 text-[#FF5A36]" />
            </div>

            <div>
              <p className="text-xs font-bold text-[#9F2D18]">
                Showing default categories
              </p>

              <p className="mt-1 text-[11px] leading-5 text-[#9F2D18]">
                The Admin category API could not
                be loaded. These defaults are only
                a fallback and cannot be edited
                until the database categories are
                available.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <Check className="h-4 w-4" />
            {success}
          </div>
        )}

        <section className="mt-6 overflow-visible rounded-[22px] border border-[#E8E4DE] bg-[#FFFDFC] shadow-sm">
          <div className="border-b border-[#EAE6DF] bg-white px-5 py-5 sm:px-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                  {editingId
                    ? "Edit category"
                    : "Add category"}
                </p>

                <h2 className="mt-1 text-lg font-bold text-[#17202A]">
                  {editingId
                    ? "Update category"
                    : "Create a new category"}
                </h2>
              </div>

              {editingId && (
                <button
                  type="button"
                  onClick={
                    resetForm
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:border-[#FFB49F] hover:text-[#9F2D18]"
                >
                  <X className="h-4 w-4" />
                  Cancel edit
                </button>
              )}
            </div>
          </div>

          <form
            onSubmit={
              submitForm
            }
            className="p-5 sm:p-6"
          >
            <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr_0.7fr_auto] lg:items-end">
              <div>
                <label className="text-xs font-semibold text-gray-700">
                  Category name
                </label>

                <input
                  type="text"
                  value={name}
                  onChange={(
                    event
                  ) =>
                    setName(
                      event.target
                        .value
                    )
                  }
                  placeholder="e.g. Furniture"
                  maxLength={50}
                  required
                  disabled={
                    usingFallback
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-sm text-[#17202A] outline-none transition focus:border-[#FF8F73] focus:ring-2 focus:ring-[#FFE1D8] disabled:cursor-not-allowed disabled:bg-[#F3F0EB]"
                />
              </div>

              <div className="relative">
                <label className="text-xs font-semibold text-gray-700">
                  Icon
                </label>

                <button
                  type="button"
                  disabled={
                    usingFallback
                  }
                  onClick={() =>
                    setShowIconPicker(
                      (current) =>
                        !current
                    )
                  }
                  className="mt-2 flex h-11 w-full items-center justify-between rounded-xl border border-[#E8E4DE] bg-white px-3 text-sm text-[#17202A] hover:border-[#FFB49F] disabled:cursor-not-allowed disabled:bg-[#F3F0EB]"
                >
                  <span className="flex items-center gap-2">
                    <SelectedIcon className="h-5 w-5 text-[#9F2D18]" />

                    {
                      ICONS.find(
                        (
                          item
                        ) =>
                          item.key ===
                          iconKey
                      )?.label
                    }
                  </span>

                  <ChevronDown className="h-4 w-4 text-gray-400" />
                </button>

                {showIconPicker && (
                  <div className="absolute left-0 right-0 z-30 mt-2 max-h-[280px] overflow-y-auto rounded-xl border border-[#E8E4DE] bg-white p-2 shadow-xl">
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                      {ICONS.map(
                        (
                          item
                        ) => {
                          const Icon =
                            item.icon;

                          const selected =
                            item.key ===
                            iconKey;

                          return (
                            <button
                              key={
                                item.key
                              }
                              type="button"
                              onClick={() => {
                                setIconKey(
                                  item.key
                                );
                                setShowIconPicker(
                                  false
                                );
                              }}
                              title={
                                item.label
                              }
                              className={`flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 transition ${
                                selected
                                  ? "bg-[#FFE0D6] text-[#9F2D18]"
                                  : "text-gray-600 hover:bg-[#FFF7ED]"
                              }`}
                            >
                              <Icon className="h-5 w-5" />

                              <span className="w-full truncate text-[10px] font-medium">
                                {
                                  item.label
                                }
                              </span>
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700">
                  Sort order
                </label>

                <input
                  type="number"
                  min={0}
                  step={1}
                  value={
                    sortOrder
                  }
                  onChange={(
                    event
                  ) =>
                    setSortOrder(
                      event.target
                        .value
                    )
                  }
                  disabled={
                    usingFallback
                  }
                  className="mt-2 h-11 w-full rounded-xl border border-[#E8E4DE] bg-white px-3 text-sm text-[#17202A] outline-none transition focus:border-[#FF8F73] focus:ring-2 focus:ring-[#FFE1D8] disabled:cursor-not-allowed disabled:bg-[#F3F0EB]"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-700">
                  Status
                </label>

                <button
                  type="button"
                  disabled={
                    usingFallback
                  }
                  onClick={() =>
                    setIsActive(
                      (current) =>
                        !current
                    )
                  }
                  className={`flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    isActive
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-gray-200 bg-gray-50 text-gray-500"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isActive
                        ? "bg-green-500"
                        : "bg-gray-400"
                    }`}
                  />

                  {isActive
                    ? "Active"
                    : "Inactive"}
                </button>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="submit"
                disabled={
                  saving ||
                  usingFallback
                }
                className="inline-flex items-center gap-2 rounded-xl bg-[#FF5A36] px-5 py-3 text-xs font-bold text-white transition hover:bg-[#E94F2D] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : editingId ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}

                {saving
                  ? "Saving..."
                  : editingId
                    ? "Save changes"
                    : "Create category"}
              </button>
            </div>
          </form>
        </section>

        <section className="mt-6 overflow-hidden rounded-[22px] border border-[#E8E4DE] bg-[#FFFDFC] shadow-sm">
          <div className="border-b border-[#EAE6DF] bg-white px-5 py-5 sm:px-6">
            <h2 className="text-lg font-bold text-[#17202A]">
              All categories
            </h2>

            <p className="mt-1 text-xs text-gray-500">
              Inactive categories stay in the
              database but are hidden from buyer
              category selection.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center px-5 py-14">
              <Loader2 className="h-6 w-6 animate-spin text-[#FF5A36]" />
            </div>
          ) : sortedCategories.length === 0 ? (
            <div className="px-5 py-14 text-center">
              <Store className="mx-auto h-9 w-9 text-gray-300" />

              <p className="mt-3 text-sm font-semibold text-gray-600">
                No categories yet
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#EAE6DF]">
              {sortedCategories.map(
                (
                  category
                ) => {
                  const Icon =
                    getIcon(
                      category.iconKey
                    );

                  return (
                    <div
                      key={
                        category.id
                      }
                      className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#9F2D18]">
                          <Icon className="h-5 w-5" />
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-bold text-[#17202A]">
                              {
                                category.name
                              }
                            </p>

                            <span
                              className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                                category.isActive
                                  ? "bg-green-50 text-green-700"
                                  : "bg-gray-100 text-gray-500"
                              }`}
                            >
                              {category.isActive
                                ? "Active"
                                : "Inactive"}
                            </span>
                          </div>

                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-400">
                            <span>
                              Order{" "}
                              {
                                category.sortOrder
                              }
                            </span>

                            <span>
                              {
                                category
                                  ._count
                                  .business
                              }{" "}
                              businesses
                            </span>

                            <span>
                              {
                                category
                                  ._count
                                  .products
                              }{" "}
                              products
                            </span>

                            <span>
                              {
                                category
                                  ._count
                                  .requests
                              }{" "}
                              requests
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={
                            usingFallback
                          }
                          onClick={() =>
                            toggleCategory(
                              category
                            )
                          }
                          className={`rounded-xl border px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50 ${
                            category.isActive
                              ? "border-gray-200 bg-white text-gray-600 hover:border-red-200 hover:text-red-600"
                              : "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                          }`}
                        >
                          {category.isActive
                            ? "Deactivate"
                            : "Activate"}
                        </button>

                        <button
                          type="button"
                          disabled={
                            usingFallback
                          }
                          onClick={() =>
                            startEdit(
                              category
                            )
                          }
                          className="inline-flex items-center gap-2 rounded-xl border border-[#E8E4DE] bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:border-[#FFB49F] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Pencil className="h-4 w-4" />
                          Edit
                        </button>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}