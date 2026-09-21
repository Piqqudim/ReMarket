"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleOff,
  LayoutDashboard,
  Package,
  Search,
  Store,
  X,
  Plus
} from "lucide-react";
import { useEffect, useState } from "react";

type Business = {
  id: string;
  name: string;
  ownerName: string | null;
  description: string | null;
  area: string;
  status: "ACTIVE" | "INACTIVE" | "PENDING";
  verification: "VERIFIED" | "UNVERIFIED";
  availability: "AVAILABLE" | "ASK_SELLER" | "UNAVAILABLE";
  phone: string | null;
  categories: string[];
  productCount: number;
  onboardedAt: string;
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

export default function AdminBusinessesPage() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [verification, setVerification] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [updatingId, setUpdatingId] = useState<string | null>(null);

  async function loadBusinesses() {
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

      if (verification) {
        params.set("verification", verification);
      }

      const response = await fetch(
        `/api/admin/businesses?${params.toString()}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load businesses");
      }

      setBusinesses(data.businesses);
    } catch (error) {
      console.error(error);
      setError("We couldn't load the businesses.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      loadBusinesses();
    }, 250);

    return () => clearTimeout(timer);
  }, [query, status, verification]);

  async function updateBusiness(
    id: string,
    changes: Partial<Business>
  ) {
    try {
      setUpdatingId(id);
      setError("");

      const response = await fetch(`/api/admin/businesses/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(changes),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to update business");
      }

      setBusinesses((current) =>
        current.map((business) =>
          business.id === id
            ? {
                ...business,
                ...data.business,
              }
            : business
        )
      );
    } catch (error) {
      console.error(error);
      setError("We couldn't update that business.");
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
                    item.href === "/admin/businesses"
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
          {/* Header */}
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
                  Businesses
                </h1>
              </div>
            </div>

            <Link
              href="/"
              className="rounded-xl border border-[#EAE6DF] bg-white px-3 py-2 text-xs font-bold text-[#6F675F] transition hover:bg-[#FCFAF6]"
            >
              Marketplace
            </Link>
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
               Businesses
              </h1>

           <p className="mt-1 text-sm text-[#81776F]">
                Manage businesses listed on ReMarket.
           </p>
             </div>

           <Link
          href="/admin/businesses/new"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#E94B29]"
             >
             <Plus size={17} />
             Add Business
           </Link>
            </div>
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
                      item.href === "/admin/businesses"
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

            {/* Page heading */}
            <div className="mb-6">
              <h2 className="text-2xl font-black tracking-tight text-[#17202A]">
                Manage businesses
              </h2>

              <p className="mt-1 text-sm text-[#8A8178]">
                Search, verify and manage sellers on ReMarket.
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
                    placeholder="Search businesses..."
                    className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] pl-10 pr-4 text-sm text-[#17202A] outline-none transition placeholder:text-[#A39A91] focus:border-[#FF5A36]"
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
                  value={verification}
                  onChange={setVerification}
                  options={[
                    ["", "All verification"],
                    ["VERIFIED", "Verified"],
                    ["UNVERIFIED", "Unverified"],
                  ]}
                />
              </div>
            </div>

            {error && (
              <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-[#F2C7BC] bg-[#FFF0ED] px-4 py-3">
                <p className="text-sm font-semibold text-[#9F2D18]">
                  {error}
                </p>

                <button
                  type="button"
                  onClick={() => setError("")}
                  className="text-[#9F2D18]"
                  aria-label="Dismiss error"
                >
                  <X size={17} />
                </button>
              </div>
            )}

            {/* Businesses */}
            {loading ? (
              <div className="rounded-2xl border border-[#EAE6DF] bg-white p-10 text-center">
                <p className="text-sm font-medium text-[#8A8178]">
                  Loading businesses...
                </p>
              </div>
            ) : businesses.length === 0 ? (
              <div className="rounded-2xl border border-[#EAE6DF] bg-white p-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFE0D6] text-[#FF5A36]">
                  <Store size={22} />
                </div>

                <h3 className="mt-4 font-black text-[#17202A]">
                  No businesses found
                </h3>

                <p className="mt-1 text-sm text-[#8A8178]">
                  Try changing your search or filters.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white">
                {/* Desktop table */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[850px]">
                    <thead className="border-b border-[#EAE6DF] bg-[#FCFAF6]">
                      <tr>
                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-[#8A8178]">
                          Business
                        </th>

                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-[#8A8178]">
                          Location
                        </th>

                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-[#8A8178]">
                          Products
                        </th>

                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-[#8A8178]">
                          Verification
                        </th>

                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-[#8A8178]">
                          Status
                        </th>

                        <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wide text-[#8A8178]">
                          Actions
                        </th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-[#EAE6DF]">
                      {businesses.map((business) => (
                        <BusinessRow
                          key={business.id}
                          business={business}
                          updating={
                            updatingId === business.id
                          }
                          onUpdate={updateBusiness}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="divide-y divide-[#EAE6DF] md:hidden">
                  {businesses.map((business) => (
                    <BusinessMobileCard
                      key={business.id}
                      business={business}
                      updating={
                        updatingId === business.id
                      }
                      onUpdate={updateBusiness}
                    />
                  ))}
                </div>
              </div>
            )}

            <p className="mt-4 text-xs font-medium text-[#A39A91]">
              {businesses.length} business
              {businesses.length === 1 ? "" : "es"} shown
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function BusinessRow({
  business,
  updating,
  onUpdate,
}: {
  business: Business;
  updating: boolean;
  onUpdate: (
    id: string,
    changes: Partial<Business>
  ) => void;
}) {
  return (
    <tr>
      <td className="px-4 py-4">
        <div>
          <p className="font-bold text-[#17202A]">
            {business.name}
          </p>

          {business.ownerName && (
            <p className="mt-1 text-xs text-[#8A8178]">
              {business.ownerName}
            </p>
          )}
        </div>
      </td>

      <td className="px-4 py-4 text-sm text-[#6F675F]">
        {business.area}
      </td>

      <td className="px-4 py-4 text-sm font-semibold text-[#17202A]">
        {business.productCount}
      </td>

      <td className="px-4 py-4">
        <VerificationButton
          business={business}
          updating={updating}
          onUpdate={onUpdate}
        />
      </td>

      <td className="px-4 py-4">
        <StatusButton
          business={business}
          updating={updating}
          onUpdate={onUpdate}
        />
      </td>

      <td className="px-4 py-4 text-right">
        <AvailabilityButton
          business={business}
          updating={updating}
          onUpdate={onUpdate}
        />
      </td>
    </tr>
  );
}

function BusinessMobileCard({
  business,
  updating,
  onUpdate,
}: {
  business: Business;
  updating: boolean;
  onUpdate: (
    id: string,
    changes: Partial<Business>
  ) => void;
}) {
  return (
    <article className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-black text-[#17202A]">
            {business.name}
          </h3>

          <p className="mt-1 text-xs text-[#8A8178]">
            {business.area}
          </p>
        </div>

        <span className="shrink-0 rounded-full bg-[#FCFAF6] px-2.5 py-1 text-[11px] font-bold text-[#6F675F]">
          {business.productCount} products
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {business.categories.slice(0, 3).map((category) => (
          <span
            key={category}
            className="rounded-full bg-[#FCFAF6] px-2.5 py-1 text-[11px] font-medium text-[#6F675F]"
          >
            {category}
          </span>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <VerificationButton
          business={business}
          updating={updating}
          onUpdate={onUpdate}
        />

        <StatusButton
          business={business}
          updating={updating}
          onUpdate={onUpdate}
        />

        <AvailabilityButton
          business={business}
          updating={updating}
          onUpdate={onUpdate}
        />
      </div>
    </article>
  );
}

function VerificationButton({
  business,
  updating,
  onUpdate,
}: {
  business: Business;
  updating: boolean;
  onUpdate: (
    id: string,
    changes: Partial<Business>
  ) => void;
}) {
  const verified = business.verification === "VERIFIED";

  return (
    <button
      type="button"
      disabled={updating}
      onClick={() =>
        onUpdate(business.id, {
          verification: verified
            ? "UNVERIFIED"
            : "VERIFIED",
        })
      }
      className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        verified
          ? "bg-[#E7F7EF] text-[#287A4B]"
          : "bg-[#FFF0D9] text-[#9F5A18]"
      }`}
    >
      {verified ? (
        <span className="flex items-center gap-1">
          <Check size={12} />
          Verified
        </span>
      ) : (
        "Unverified"
      )}
    </button>
  );
}

function StatusButton({
  business,
  updating,
  onUpdate,
}: {
  business: Business;
  updating: boolean;
  onUpdate: (
    id: string,
    changes: Partial<Business>
  ) => void;
}) {
  const active = business.status === "ACTIVE";

  return (
    <button
      type="button"
      disabled={updating}
      onClick={() =>
        onUpdate(business.id, {
          status: active ? "INACTIVE" : "ACTIVE",
        })
      }
      className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "bg-[#E7F7EF] text-[#287A4B]"
          : "bg-[#F0ECE7] text-[#6F675F]"
      }`}
    >
      {active ? "Active" : "Inactive"}
    </button>
  );
}

function AvailabilityButton({
  business,
  updating,
  onUpdate,
}: {
  business: Business;
  updating: boolean;
  onUpdate: (
    id: string,
    changes: Partial<Business>
  ) => void;
}) {
  const next =
    business.availability === "AVAILABLE"
      ? "ASK_SELLER"
      : business.availability === "ASK_SELLER"
        ? "UNAVAILABLE"
        : "AVAILABLE";

  const label =
    business.availability === "AVAILABLE"
      ? "Available"
      : business.availability === "ASK_SELLER"
        ? "Ask seller"
        : "Unavailable";

  return (
    <button
      type="button"
      disabled={updating}
      onClick={() =>
        onUpdate(business.id, {
          availability: next,
        })
      }
      className="inline-flex items-center gap-1 rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3 py-2 text-[11px] font-bold text-[#6F675F] transition hover:bg-[#FFF0D9] disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
      <ChevronDown size={13} />
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
        onChange={(event) => onChange(event.target.value)}
        className="h-11 min-w-[155px] appearance-none rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] pl-3 pr-9 text-sm font-medium text-[#6F675F] outline-none focus:border-[#FF5A36]"
      >
        {options.map(([optionValue, label]) => (
          <option key={optionValue} value={optionValue}>
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