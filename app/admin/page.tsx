"use client";

import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  Contact,
  LayoutDashboard,
  Package,
  Phone,
  Store,
  Users,
  MapPin,
  ExternalLink,
} from "lucide-react";
import { useEffect, useState } from "react";

type ContactActivity = {
  WHATSAPP: number;
  PHONE: number;
  INSTAGRAM: number;
  TIKTOK: number;
  FACEBOOK: number;
  DIRECTIONS: number;
};

const DEFAULT_CONTACT_ACTIVITY: ContactActivity = {
  WHATSAPP: 0,
  PHONE: 0,
  INSTAGRAM: 0,
  TIKTOK: 0,
  FACEBOOK: 0,
  DIRECTIONS: 0,
};

type Overview = {
  stats: {
    businesses: number;
    products: number;
    requests: number;
    matches: number;
    contacts: number;
  };

  contactActivity: ContactActivity;

  recentRequests: {
    id: string;
    requestCode: string;
    query: string;
    status: string;
    category?: {
      id: string;
      name: string;
    } | null;
    createdAt: string;
    matchCount: number;
  }[];

  recentBusinesses: {
    id: string;
    name: string;
    verification: string;
    status: string;
    availability?: string | null;
    area: string | null;
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

function verificationClass(verification: string) {
  switch (verification) {
    case "VERIFIED":
      return "bg-[#E7F7EF] text-[#287A4B]";

    case "PENDING":
      return "bg-[#FFF0D9] text-[#9F5A18]";

    case "REJECTED":
      return "bg-[#FCE8E6] text-[#B42318]";

    default:
      return "bg-[#F0ECE7] text-[#6F675F]";
  }
}

function ContactActivityCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Contact;
}) {
  return (
    <div className="rounded-2xl border border-[#E8DED3] bg-white p-5">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#9F2D18]">
          <Icon className="h-5 w-5" />
        </div>

        <span className="text-2xl font-semibold text-[#2E241F]">
          {value}
        </span>
      </div>

      <p className="mt-4 text-sm font-medium text-[#6F675F]">
        {label}
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  href,
}: {
  label: string;
  value: number;
  icon: typeof Store;
  href?: string;
}) {
  const content = (
    <div className="rounded-2xl border border-[#E8DED3] bg-white p-5 transition hover:border-[#D8C9BC]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#6F675F]">
            {label}
          </p>

          <p className="mt-2 text-3xl font-semibold tracking-tight text-[#2E241F]">
            {value}
          </p>
        </div>

        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E8] text-[#9F2D18]">
          <Icon className="h-5 w-5" />
        </div>
      </div>

      {href && (
        <div className="mt-4 flex items-center gap-1 text-xs font-medium text-[#9F2D18]">
          View details
          <ArrowRight className="h-3.5 w-3.5" />
        </div>
      )}
    </div>
  );

  if (!href) {
    return content;
  }

  return (
    <Link href={href}>
      {content}
    </Link>
  );
}

export default function AdminPage() {
  const [data, setData] = useState<Overview | null>(null);

  const [contactActivity, setContactActivity] =
    useState<ContactActivity>(
      DEFAULT_CONTACT_ACTIVITY,
    );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadOverview() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          "/api/admin/overview",
          {
            cache: "no-store",
          },
        );

        if (!response.ok) {
          const body = await response.text();

          console.error(
            "Admin overview request failed:",
            response.status,
            body,
          );

          throw new Error(
            `Admin overview failed (${response.status}): ${body}`,
          );
        }

        const result: Overview =
          await response.json();

        setData(result);

        setContactActivity(
          result.contactActivity ??
            DEFAULT_CONTACT_ACTIVITY,
        );
      } catch (error) {
        console.error(error);

        setError(
          "We couldn't load the admin dashboard.",
        );
      } finally {
        setLoading(false);
      }
    }

    loadOverview();
  }, []);

  return (
    <div className="min-h-screen bg-[#FAF6EF] text-[#2E241F]">
      <div className="flex min-h-screen">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 border-r border-[#E8DED3] bg-[#FFFDFC] lg:block">
          <div className="sticky top-0 flex h-screen flex-col">
            <div className="border-b border-[#E8DED3] px-6 py-6">
              <Link
                href="/admin"
                className="flex items-center gap-3"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#9F2D18] text-sm font-bold text-white">
                  R
                </div>

                <div>
                  <p className="font-semibold text-[#2E241F]">
                    ReMarket
                  </p>

                  <p className="text-xs text-[#8B8178]">
                    Admin
                  </p>
                </div>
              </Link>
            </div>

            <nav className="flex-1 px-4 py-6">
              <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-[#9A9087]">
                Dashboard
              </p>

              <div className="space-y-1">
                {ADMIN_NAV.map((item) => {
                  const Icon = item.icon;
                  const active =
                    item.href === "/admin";

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${
                        active
                          ? "bg-[#FFF0E8] text-[#9F2D18]"
                          : "text-[#6F675F] hover:bg-[#F7F1EB] hover:text-[#2E241F]"
                      }`}
                    >
                      <Icon className="h-4 w-4" />

                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </nav>

            <div className="border-t border-[#E8DED3] px-6 py-5">
              <p className="text-xs text-[#9A9087]">
                ReMarket Admin
              </p>

              <p className="mt-1 text-sm font-medium text-[#4B4038]">
                Platform overview
              </p>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {/* Header */}
            <div className="mb-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-[#9F2D18]">
                    Admin Dashboard
                  </p>

                  <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#2E241F] sm:text-3xl">
                    Overview
                  </h1>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#766C63]">
                    Monitor businesses, products,
                    buyer requests, matches, and
                    seller contact activity across
                    ReMarket.
                  </p>
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mb-6 rounded-2xl border border-[#F1C5BF] bg-[#FFF4F2] px-5 py-4">
                <p className="text-sm font-medium text-[#B42318]">
                  {error}
                </p>
              </div>
            )}

            {/* Loading */}
            {loading ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
                  {Array.from({
                    length: 5,
                  }).map((_, index) => (
                    <div
                      key={index}
                      className="h-32 animate-pulse rounded-2xl border border-[#E8DED3] bg-white"
                    />
                  ))}
                </div>

                <div className="h-64 animate-pulse rounded-2xl border border-[#E8DED3] bg-white" />

                <div className="grid gap-6 xl:grid-cols-2">
                  <div className="h-80 animate-pulse rounded-2xl border border-[#E8DED3] bg-white" />

                  <div className="h-80 animate-pulse rounded-2xl border border-[#E8DED3] bg-white" />
                </div>
              </div>
            ) : data ? (
              <>
                {/* Stats */}
                <section>
                  <div className="grid grid-cols-2 gap-4 xl:grid-cols-5">
                    <StatCard
                      label="Businesses"
                      value={data.stats.businesses}
                      icon={Store}
                      href="/admin/businesses"
                    />

                    <StatCard
                      label="Products"
                      value={data.stats.products}
                      icon={Package}
                      href="/admin/products"
                    />

                    <StatCard
                      label="Requests"
                      value={data.stats.requests}
                      icon={ClipboardList}
                      href="/admin/requests"
                    />

                    <StatCard
                      label="Matches"
                      value={data.stats.matches}
                      icon={Users}
                    />

                    <StatCard
                      label="Seller contacts"
                      value={data.stats.contacts}
                      icon={Contact}
                    />
                  </div>
                </section>

                {/* Contact Activity */}
                <section className="mt-6">
                  <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-[#2E241F]">
                        Contact activity
                      </h2>

                      <p className="text-sm text-[#766C63]">
                        How buyers are contacting sellers.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
                    <ContactActivityCard
                      label="WhatsApp"
                      value={
                        contactActivity.WHATSAPP
                      }
                      icon={Contact}
                    />

                    <ContactActivityCard
                      label="Phone"
                      value={
                        contactActivity.PHONE
                      }
                      icon={Phone}
                    />

                    <ContactActivityCard
                      label="Instagram"
                      value={
                        contactActivity.INSTAGRAM
                      }
                      icon={ExternalLink}
                    />

                    <ContactActivityCard
                      label="TikTok"
                      value={
                        contactActivity.TIKTOK
                      }
                      icon={Contact}
                    />

                    <ContactActivityCard
                      label="Facebook"
                      value={
                        contactActivity.FACEBOOK
                      }
                      icon={ExternalLink}
                    />

                    <ContactActivityCard
                      label="Directions"
                      value={
                        contactActivity.DIRECTIONS
                      }
                      icon={MapPin}
                    />
                  </div>
                </section>

                {/* Recent data */}
                <section className="mt-6 grid gap-6 xl:grid-cols-2">
                  {/* Recent Requests */}
                  <div className="rounded-2xl border border-[#E8DED3] bg-white">
                    <div className="flex items-center justify-between border-b border-[#E8DED3] px-5 py-4">
                      <div>
                        <h2 className="font-semibold text-[#2E241F]">
                          Recent requests
                        </h2>

                        <p className="mt-1 text-xs text-[#8B8178]">
                          Latest buyer requests
                        </p>
                      </div>

                      <Link
                        href="/admin/requests"
                        className="flex items-center gap-1 text-xs font-medium text-[#9F2D18] hover:underline"
                      >
                        View all
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>

                    <div className="divide-y divide-[#E8DED3]">
                      {data.recentRequests.length ===
                      0 ? (
                        <div className="px-5 py-10 text-center">
                          <ClipboardList className="mx-auto h-8 w-8 text-[#B8AEA5]" />

                          <p className="mt-3 text-sm font-medium text-[#6F675F]">
                            No requests yet
                          </p>
                        </div>
                      ) : (
                        data.recentRequests.map(
                          (request) => (
                            <div
                              key={request.id}
                              className="px-5 py-4"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-[#2E241F]">
                                    {request.query}
                                  </p>

                                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#8B8178]">
                                    <span>
                                      {
                                        request.requestCode
                                      }
                                    </span>

                                    {request.category
                                      ?.name && (
                                      <>
                                        <span>
                                          •
                                        </span>

                                        <span>
                                          {
                                            request
                                              .category
                                              .name
                                          }
                                        </span>
                                      </>
                                    )}

                                    <span>
                                      •
                                    </span>

                                    <span>
                                      {
                                        request.matchCount
                                      }{" "}
                                      {request.matchCount ===
                                      1
                                        ? "match"
                                        : "matches"}
                                    </span>
                                  </div>
                                </div>

                                <span
                                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(
                                    request.status,
                                  )}`}
                                >
                                  {request.status}
                                </span>
                              </div>

                              <p className="mt-2 text-xs text-[#9A9087]">
                                {formatDate(
                                  request.createdAt,
                                )}
                              </p>
                            </div>
                          ),
                        )
                      )}
                    </div>
                  </div>

                  {/* Recent Businesses */}
                  <div className="rounded-2xl border border-[#E8DED3] bg-white">
                    <div className="flex items-center justify-between border-b border-[#E8DED3] px-5 py-4">
                      <div>
                        <h2 className="font-semibold text-[#2E241F]">
                          Recent businesses
                        </h2>

                        <p className="mt-1 text-xs text-[#8B8178]">
                          Latest onboarded sellers
                        </p>
                      </div>

                      <Link
                        href="/admin/businesses"
                        className="flex items-center gap-1 text-xs font-medium text-[#9F2D18] hover:underline"
                      >
                        View all
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>

                    <div className="divide-y divide-[#E8DED3]">
                      {data.recentBusinesses.length ===
                      0 ? (
                        <div className="px-5 py-10 text-center">
                          <Store className="mx-auto h-8 w-8 text-[#B8AEA5]" />

                          <p className="mt-3 text-sm font-medium text-[#6F675F]">
                            No businesses yet
                          </p>
                        </div>
                      ) : (
                        data.recentBusinesses.map(
                          (business) => (
                            <div
                              key={business.id}
                              className="px-5 py-4"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-[#2E241F]">
                                    {business.name}
                                  </p>

                                  <p className="mt-1 text-xs text-[#8B8178]">
                                    {business.area ??
                                      "Area not provided"}
                                  </p>
                                </div>

                                <div className="flex shrink-0 flex-col items-end gap-1.5">
                                  <span
                                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${verificationClass(
                                      business.verification,
                                    )}`}
                                  >
                                    {
                                      business.verification
                                    }
                                  </span>

                                  <span
                                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(
                                      business.status,
                                    )}`}
                                  >
                                    {
                                      business.status
                                    }
                                  </span>
                                </div>
                              </div>

                              <p className="mt-2 text-xs text-[#9A9087]">
                                Onboarded{" "}
                                {formatDate(
                                  business.onboardedAt,
                                )}
                              </p>
                            </div>
                          ),
                        )
                      )}
                    </div>
                  </div>
                </section>
              </>
            ) : null}
          </div>
        </main>
      </div>
    </div>
  );
}