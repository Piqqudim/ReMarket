"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  LayoutDashboard,
  Package,
  Search,
  Store,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  availability: "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
  status: "ACTIVE" | "INACTIVE" | "PENDING";
  imageUrl: string | null;
  business: {
    id: string;
    name: string;
    area: string;
  };
  category: string | null;
  updatedAt: string;
};

const NAV_ITEMS = [
  {
    label: "Overview",
    href: "/admin",
    icon: LayoutDashboard,
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
];

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [availability, setAvailability] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function loadProducts() {
    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams();

      if (query.trim()) {
        params.set("q", query.trim());
      }

      if (status) {
        params.set("status", status);
      }

      if (availability) {
        params.set("availability", availability);
      }

      const response = await fetch(
        `/api/admin/products?${params.toString()}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to load products"
        );
      }

      setProducts(data.products);
    } catch (error) {
      console.error(error);
      setError("We couldn't load the products.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      loadProducts();
    }, 250);

    return () => clearTimeout(timer);
  }, [query, status, availability]);

  async function updateProduct(
    id: string,
    changes: Partial<Product>
  ) {
    try {
      setUpdatingId(id);
      setError("");

      const response = await fetch(
        `/api/admin/products/${id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(changes),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Unable to update product"
        );
      }

      setProducts((current) =>
        current.map((product) =>
          product.id === id
            ? {
                ...product,
                ...data.product,
              }
            : product
        )
      );
    } catch (error) {
      console.error(error);
      setError("We couldn't update that product.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#FFF7ED] px-3 py-3 sm:px-5 sm:py-5">
      <div className="mx-auto flex min-h-[calc(100vh-24px)] max-w-[1500px] overflow-hidden rounded-[22px] border border-[#FF5A36] bg-[#FFFDFC] shadow-sm sm:min-h-[calc(100vh-40px)]">
        {/* Sidebar */}
        <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] lg:block">
          <div className="flex h-[66px] items-center border-b border-[#EAE6DF] px-5">
            <Link
              href="/admin"
              className="text-xl font-black tracking-tight"
            >
              <span className="text-[#FF5A36]">Re</span>
              <span className="text-[#17202A]">Market</span>
            </Link>
          </div>

          <nav className="space-y-1 p-3">
            <p className="mb-3 px-3 pt-2 text-[11px] font-bold uppercase tracking-wider text-[#A39A91]">
              Admin
            </p>

            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    item.href === "/admin/products"
                      ? "bg-[#FFE0D6] text-[#9F2D18]"
                      : "text-[#6F675F] hover:bg-[#FFF0D9]"
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main */}
        <section className="min-w-0 flex-1">
          <header className="flex h-[66px] items-center justify-between border-b border-[#EAE6DF] px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <Link
                href="/admin"
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FCFAF6] text-[#6F675F] lg:hidden"
                aria-label="Back to admin"
              >
                <ArrowLeft size={17} />
              </Link>

              <div>
                <p className="text-xs font-medium text-[#8A8178]">
                  Admin
                </p>

                <h1 className="text-lg font-black text-[#17202A]">
                  Products
                </h1>
              </div>
            </div>

            <Link
              href="/"
              className="rounded-xl border border-[#EAE6DF] bg-white px-3 py-2 text-xs font-bold text-[#6F675F] transition hover:bg-[#FCFAF6]"
            >
              Marketplace
            </Link>
          </header>

          <div className="p-4 sm:p-6">
            {/* Mobile nav */}
            <div className="mb-5 flex gap-2 overflow-x-auto lg:hidden">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${
                      item.href === "/admin/products"
                        ? "bg-[#FF5A36] text-white"
                        : "bg-[#FCFAF6] text-[#6F675F]"
                    }`}
                  >
                    <Icon size={15} />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <div className="mb-6">
              <h2 className="text-2xl font-black tracking-tight text-[#17202A]">
                Manage products
              </h2>

              <p className="mt-1 text-sm text-[#8A8178]">
                Review and manage products listed by ReMarket businesses.
              </p>
            </div>

            {/* Filters */}
            <div className="mb-5 rounded-2xl border border-[#EAE6DF] bg-white p-3">
              <div className="flex flex-col gap-3 lg:flex-row">
                <div className="relative min-w-0 flex-1">
                  <Search
                    size={17}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A39A91]"
                  />

                  <input
                    value={query}
                    onChange={(event) =>
                      setQuery(event.target.value)
                    }
                    placeholder="Search products or businesses..."
                    className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] pl-10 pr-4 text-sm text-[#17202A] outline-none placeholder:text-[#A39A91] focus:border-[#FF5A36]"
                  />
                </div>

                <FilterSelect
                  value={status}
                  onChange={setStatus}
                  options={[
                    ["", "All status"],
                    ["ACTIVE", "Active"],
                    ["INACTIVE", "Inactive"],
                    ["PENDING", "Pending"],
                  ]}
                />

                <FilterSelect
                  value={availability}
                  onChange={setAvailability}
                  options={[
                    ["", "All availability"],
                    ["AVAILABLE", "Available"],
                    ["ASK_SELLER", "Ask seller"],
                    ["UNAVAILABLE", "Unavailable"],
                  ]}
                />
              </div>
            </div>

            {error && (
              <div className="mb-5 flex items-center justify-between rounded-2xl border border-[#F2C7BC] bg-[#FFF0ED] px-4 py-3">
                <p className="text-sm font-semibold text-[#9F2D18]">
                  {error}
                </p>

                <button
                  type="button"
                  onClick={() => setError("")}
                  aria-label="Dismiss error"
                  className="text-[#9F2D18]"
                >
                  <X size={17} />
                </button>
              </div>
            )}

            {loading ? (
              <div className="rounded-2xl border border-[#EAE6DF] bg-white p-10 text-center">
                <p className="text-sm font-medium text-[#8A8178]">
                  Loading products...
                </p>
              </div>
            ) : products.length === 0 ? (
              <div className="rounded-2xl border border-[#EAE6DF] bg-white p-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#DDF5EA] text-[#287A4B]">
                  <Package size={22} />
                </div>

                <h3 className="mt-4 font-black text-[#17202A]">
                  No products found
                </h3>

                <p className="mt-1 text-sm text-[#8A8178]">
                  Try changing your search or filters.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white">
                {/* Desktop */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[900px]">
                    <thead className="border-b border-[#EAE6DF] bg-[#FCFAF6]">
                      <tr>
                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-[#8A8178]">
                          Product
                        </th>

                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-[#8A8178]">
                          Business
                        </th>

                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-[#8A8178]">
                          Price
                        </th>

                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-[#8A8178]">
                          Availability
                        </th>

                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-[#8A8178]">
                          Status
                        </th>

                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide text-[#8A8178]">
                          Action
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-[#EAE6DF]">
                      {products.map((product) => (
                        <ProductRow
                          key={product.id}
                          product={product}
                          updating={
                            updatingId === product.id
                          }
                          onUpdate={updateProduct}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile */}
                <div className="divide-y divide-[#EAE6DF] md:hidden">
                  {products.map((product) => (
                    <ProductMobileCard
                      key={product.id}
                      product={product}
                      updating={
                        updatingId === product.id
                      }
                      onUpdate={updateProduct}
                    />
                  ))}
                </div>
              </div>
            )}

            <p className="mt-4 text-xs font-medium text-[#A39A91]">
              {products.length} product
              {products.length === 1 ? "" : "s"} shown
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function ProductRow({
  product,
  updating,
  onUpdate,
}: {
  product: Product;
  updating: boolean;
  onUpdate: (
    id: string,
    changes: Partial<Product>
  ) => void;
}) {
  return (
    <tr>
      <td className="px-4 py-4">
        <div className="flex items-center gap-3">
          <ProductImage product={product} />

          <div className="min-w-0">
            <p className="truncate font-bold text-[#17202A]">
              {product.name}
            </p>

            {product.category && (
              <p className="mt-1 text-xs text-[#8A8178]">
                {product.category}
              </p>
            )}
          </div>
        </div>
      </td>

      <td className="px-4 py-4">
        <p className="font-semibold text-[#17202A]">
          {product.business.name}
        </p>

        <p className="mt-1 text-xs text-[#8A8178]">
          {product.business.area}
        </p>
      </td>

      <td className="px-4 py-4 text-sm font-bold text-[#17202A]">
        <Price product={product} />
      </td>

      <td className="px-4 py-4">
        <AvailabilityButton
          product={product}
          updating={updating}
          onUpdate={onUpdate}
        />
      </td>

      <td className="px-4 py-4">
        <StatusButton
          product={product}
          updating={updating}
          onUpdate={onUpdate}
        />
      </td>

      <td className="px-4 py-4 text-right">
        <Link
          href={`/seller/${product.business.id}`}
          className="rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3 py-2 text-xs font-bold text-[#6F675F] hover:bg-[#FFF0D9]"
        >
          View seller
        </Link>
      </td>
    </tr>
  );
}

function ProductMobileCard({
  product,
  updating,
  onUpdate,
}: {
  product: Product;
  updating: boolean;
  onUpdate: (
    id: string,
    changes: Partial<Product>
  ) => void;
}) {
  return (
    <article className="p-4">
      <div className="flex gap-3">
        <ProductImage product={product} />

        <div className="min-w-0 flex-1">
          <h3 className="truncate font-black text-[#17202A]">
            {product.name}
          </h3>

          <p className="mt-1 text-xs text-[#8A8178]">
            {product.business.name}
          </p>

          <p className="mt-2 font-bold text-[#FF5A36]">
            <Price product={product} />
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <AvailabilityButton
          product={product}
          updating={updating}
          onUpdate={onUpdate}
        />

        <StatusButton
          product={product}
          updating={updating}
          onUpdate={onUpdate}
        />

        <Link
          href={`/seller/${product.business.id}`}
          className="rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3 py-2 text-xs font-bold text-[#6F675F]"
        >
          View seller
        </Link>
      </div>
    </article>
  );
}

function ProductImage({ product }: { product: Product }) {
  if (product.imageUrl) {
    return (
      <img
        src={product.imageUrl}
        alt=""
        className="h-12 w-12 shrink-0 rounded-xl object-cover"
      />
    );
  }

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#DDF5EA] text-[#287A4B]">
      <Package size={19} />
    </div>
  );
}

function Price({ product }: { product: Product }) {
  if (product.price != null) {
    return `₦${product.price.toLocaleString()}`;
  }

  if (
    product.priceMin != null &&
    product.priceMax != null
  ) {
    return `₦${product.priceMin.toLocaleString()} – ₦${product.priceMax.toLocaleString()}`;
  }

  if (product.priceMin != null) {
    return `From ₦${product.priceMin.toLocaleString()}`;
  }

  if (product.priceMax != null) {
    return `Up to ₦${product.priceMax.toLocaleString()}`;
  }

  return "Price on request";
}

function AvailabilityButton({
  product,
  updating,
  onUpdate,
}: {
  product: Product;
  updating: boolean;
  onUpdate: (
    id: string,
    changes: Partial<Product>
  ) => void;
}) {
  const next =
    product.availability === "AVAILABLE"
      ? "ASK_SELLER"
      : product.availability === "ASK_SELLER"
        ? "UNAVAILABLE"
        : "AVAILABLE";

  const label =
    product.availability === "AVAILABLE"
      ? "Available"
      : product.availability === "ASK_SELLER"
        ? "Ask seller"
        : "Unavailable";

  return (
    <button
      type="button"
      disabled={updating}
      onClick={() =>
        onUpdate(product.id, {
          availability: next,
        })
      }
      className="inline-flex items-center gap-1 rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3 py-2 text-[11px] font-bold text-[#6F675F] transition hover:bg-[#FFF0D9] disabled:opacity-50"
    >
      {label}
      <ChevronDown size={13} />
    </button>
  );
}

function StatusButton({
  product,
  updating,
  onUpdate,
}: {
  product: Product;
  updating: boolean;
  onUpdate: (
    id: string,
    changes: Partial<Product>
  ) => void;
}) {
  const active = product.status === "ACTIVE";

  return (
    <button
      type="button"
      disabled={updating}
      onClick={() =>
        onUpdate(product.id, {
          status: active ? "INACTIVE" : "ACTIVE",
        })
      }
      className={`rounded-full px-2.5 py-1 text-[11px] font-bold disabled:opacity-50 ${
        active
          ? "bg-[#E7F7EF] text-[#287A4B]"
          : "bg-[#F0ECE7] text-[#6F675F]"
      }`}
    >
      {active ? (
        <span className="flex items-center gap-1">
          <Check size={12} />
          Active
        </span>
      ) : (
        "Inactive"
      )}
    </button>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="h-11 min-w-[155px] appearance-none rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] pl-3 pr-9 text-sm font-medium text-[#6F675F] outline-none focus:border-[#FF5A36]"
      >
        {options.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <ChevronDown
        size={15}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8A8178]"
      />
    </div>
  );
}