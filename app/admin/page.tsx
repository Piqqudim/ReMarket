"use client";

import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  LayoutDashboard,
  Package,
  Store,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

type Overview = {
  stats: {
    businesses: number;
    products: number;
    requests: number;
    matches: number;
  };
  recentRequests: {
    id: string;
    requestCode: string;
    query: string;
    status: string;
    createdAt: string;
  }[];
  recentBusinesses: {
    id: string;
    name: string;
    verification: string;
    status: string;
    area: string;
    onboardedAt: string;
  }[];
};

const ADMIN_NAV = [
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
  {
    label: "Requests",
    href: "/admin/requests",
    icon: ClipboardList,
  },
];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function statusClass(status: string) {
  switch (status) {
    case "MATCHED":
      return "bg-[#E7F7EF] text-[#287A4B]";

    case "FULFILLED":
      return "bg-[#E7F7EF] text-[#287A4B]";

    case "CLOSED":
      return "bg-[#F0ECE7] text-[#6F675F]";

    case "CONTACTED":
      return "bg-[#FFF0D9] text-[#9F5A18]";

    default:
      return "bg-[#FFF0D9] text-[#9F5A18]";
  }
}

export default function AdminPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadOverview() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch("/api/admin/overview");

        if (!response.ok) {
          throw new Error("Unable to load admin overview");
        }

        const result: Overview = await response.json();

        setData(result);
      } catch (error) {
        console.error(error);
        setError("We couldn't load the admin dashboard.");
      } finally {
        setLoading(false);
      }
    }

    loadOverview();
  }, []);

  return (
    <main className="min-h-screen bg-[#FFF7ED] px-3 py-3 sm:px-5 sm:py-5">
      <div className="mx-auto flex min-h-[calc(100vh-24px)] max-w-[1500px] overflow-hidden rounded-[22px] border border-[#FF5A36] bg-[#FFFDFC] shadow-sm sm:min-h-[calc(100vh-40px)]">
        {/* Sidebar */}
        <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] lg:block">
          <div className="flex h-[66px] items-center border-b border-[#EAE6DF] px-5">
            <Link href="/admin" className="text-xl font-black tracking-tight">
              <span className="text-[#FF5A36]">Re</span>
              <span className="text-[#17202A]">Market</span>
            </Link>
          </div>

          <div className="px-3 py-5">
            <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-wider text-[#A39A91]">
              Admin
            </p>

            <nav className="space-y-1">
              {ADMIN_NAV.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      item.href === "/admin"
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
          </div>
        </aside>

        {/* Main */}
        <section className="min-w-0 flex-1">
          {/* Header */}
          <header className="flex h-[66px] items-center justify-between border-b border-[#EAE6DF] px-4 sm:px-6">
            <div>
              <p className="text-xs font-medium text-[#8A8178]">
                ReMarket
              </p>

              <h1 className="text-lg font-black text-[#17202A]">
                Admin Dashboard
              </h1>
            </div>

            <Link
              href="/"
              className="rounded-xl border border-[#EAE6DF] bg-white px-3 py-2 text-xs font-bold text-[#6F675F] transition hover:bg-[#FCFAF6]"
            >
              View marketplace
            </Link>
          </header>

          <div className="p-4 sm:p-6">
            {/* Mobile nav */}
            <div className="mb-5 flex gap-2 overflow-x-auto lg:hidden">
              {ADMIN_NAV.map((item) => {
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${
                      item.href === "/admin"
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

            {/* Heading */}
            <div className="mb-6">
              <p className="text-sm font-medium text-[#8A8178]">
                Manage what is happening across ReMarket.
              </p>

              <h2 className="mt-1 text-2xl font-black tracking-tight text-[#17202A]">
                Good Day 👋
              </h2>
            </div>

            {loading && (
              <div className="rounded-2xl border border-[#EAE6DF] bg-white p-8 text-center">
                <p className="text-sm font-medium text-[#8A8178]">
                  Loading dashboard...
                </p>
              </div>
            )}

            {error && !loading && (
              <div className="rounded-2xl border border-[#F2C7BC] bg-[#FFF0ED] p-5">
                <p className="text-sm font-semibold text-[#9F2D18]">
                  {error}
                </p>
              </div>
            )}

            {data && !loading && !error && (
              <>
                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                  <StatCard
                    label="Businesses"
                    value={data.stats.businesses}
                    icon={Store}
                  />

                  <StatCard
                    label="Products"
                    value={data.stats.products}
                    icon={Package}
                  />

                  <StatCard
                    label="Requests"
                    value={data.stats.requests}
                    icon={ClipboardList}
                  />

                  <StatCard
                    label="Matches"
                    value={data.stats.matches}
                    icon={Users}
                  />
                </div>

                {/* Recent sections */}
                <div className="mt-6 grid gap-5 xl:grid-cols-2">
                  {/* Requests */}
                  <section className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white">
                    <div className="flex items-center justify-between border-b border-[#EAE6DF] px-4 py-4">
                      <div>
                        <h3 className="font-black text-[#17202A]">
                          Recent Requests
                        </h3>

                        <p className="mt-1 text-xs text-[#8A8178]">
                          Latest buyer activity
                        </p>
                      </div>

                      <Link
                        href="/admin/requests"
                        className="flex items-center gap-1 text-xs font-bold text-[#FF5A36]"
                      >
                        View all
                        <ArrowRight size={14} />
                      </Link>
                    </div>

                    <div className="divide-y divide-[#EAE6DF]">
                      {data.recentRequests.length === 0 ? (
                        <EmptyRow text="No requests yet." />
                      ) : (
                        data.recentRequests.map((request) => (
                          <div
                            key={request.id}
                            className="flex items-center justify-between gap-4 px-4 py-4"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-[#17202A]">
                                {request.query}
                              </p>

                              <p className="mt-1 text-xs text-[#8A8178]">
                                {request.requestCode} ·{" "}
                                {formatDate(request.createdAt)}
                              </p>
                            </div>

                            <span
                              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${statusClass(
                                request.status
                              )}`}
                            >
                              {request.status}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  {/* Businesses */}
                  <section className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white">
                    <div className="flex items-center justify-between border-b border-[#EAE6DF] px-4 py-4">
                      <div>
                        <h3 className="font-black text-[#17202A]">
                          Recent Businesses
                        </h3>

                        <p className="mt-1 text-xs text-[#8A8178]">
                          Latest seller activity
                        </p>
                      </div>

                      <Link
                        href="/admin/businesses"
                        className="flex items-center gap-1 text-xs font-bold text-[#FF5A36]"
                      >
                        View all
                        <ArrowRight size={14} />
                      </Link>
                    </div>

                    <div className="divide-y divide-[#EAE6DF]">
                      {data.recentBusinesses.length === 0 ? (
                        <EmptyRow text="No businesses yet." />
                      ) : (
                        data.recentBusinesses.map((business) => (
                          <div
                            key={business.id}
                            className="flex items-center justify-between gap-4 px-4 py-4"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-[#17202A]">
                                {business.name}
                              </p>

                              <p className="mt-1 text-xs text-[#8A8178]">
                                {business.area} ·{" "}
                                {formatDate(business.onboardedAt)}
                              </p>
                            </div>

                            <span
                              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                business.verification === "VERIFIED"
                                  ? "bg-[#E7F7EF] text-[#287A4B]"
                                  : "bg-[#FFF0D9] text-[#9F5A18]"
                              }`}
                            >
                              {business.verification}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Store;
}) {
  return (
    <div className="rounded-2xl border border-[#EAE6DF] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#FF5A36]">
          <Icon size={19} />
        </div>

        <span className="text-[11px] font-bold uppercase tracking-wide text-[#A39A91]">
          Total
        </span>
      </div>

      <p className="mt-5 text-2xl font-black text-[#17202A]">
        {value.toLocaleString()}
      </p>

      <p className="mt-1 text-sm font-medium text-[#8A8178]">{label}</p>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="px-4 py-8 text-center">
      <p className="text-sm font-medium text-[#8A8178]">{text}</p>
    </div>
  );
}