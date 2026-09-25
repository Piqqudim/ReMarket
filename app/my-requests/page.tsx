"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Home,
  ShoppingBag,
  ClipboardList,
  Heart,
  Search,
  MapPin,
  Store,
  CheckCircle2,
  Clock3,
  Phone,
  ArrowLeft,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Home", href: "/", icon: Home },
  { label: "Shop", href: "/shop", icon: ShoppingBag },
  { label: "Requests", href: "/my-requests", icon: ClipboardList },
  { label: "Saved", href: "/saved", icon: Heart },
];

type Request = {
  id: string;
  requestCode: string;
  query: string;
  category?: string | null;
  budget?: number | null;
  locationArea?: string | null;
  quantity?: number | null;
  description?: string | null;
  imageUrl?: string | null;
  status: string;
  buyerContact: string;
  createdAt: string;
  matches: {
    id: string;
    score: number;
    business: {
      id: string;
      name: string;
      area: string;
      verified: boolean;
    };
  }[];
};

const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  MATCHED: "Matched",
  CONTACTED: "Contacted",
  FULFILLED: "Fulfilled",
  UNFULFILLED: "Unfulfilled",
  CLOSED: "Closed",
};

function formatStatus(status: string) {
  return STATUS_LABELS[status] ?? status;
}

function statusClass(status: string) {
  switch (status) {
    case "MATCHED":
      return "bg-[#DDF5EA] text-[#237A50]";

    case "CONTACTED":
      return "bg-[#E7E5FF] text-[#5149A5]";

    case "FULFILLED":
      return "bg-[#DDF5EA] text-[#237A50]";

    case "UNFULFILLED":
      return "bg-[#FFE0D6] text-[#9F2D18]";

    case "CLOSED":
      return "bg-[#E4E9EF] text-[#5E6872]";

    default:
      return "bg-[#FFF0C7] text-[#8A6710]";
  }
}

export default function MyRequestsPage() {
  const [lookup, setLookup] = useState("");
  const [requests, setRequests] = useState<Request[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function findRequests(
    event: React.SubmitEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const value = lookup.trim();

    if (!value) {
      setError(
        "Enter your request code or WhatsApp number."
      );
      return;
    }

    setLoading(true);
    setError("");
    setSearched(false);

    try {
      const isCode =
        /^RM-[A-Z0-9]{4}$/i.test(value);

      const params = new URLSearchParams(
        isCode
          ? {
              code: value.toUpperCase(),
            }
          : {
              contact: value,
            }
      );

      const response = await fetch(
        `/api/request?${params.toString()}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to find your requests."
        );
      }

      const result = Array.isArray(
        data.requests
      )
        ? data.requests
        : data.request
          ? [data.request]
          : [];

      setRequests(result);
      setSearched(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to find your requests."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FFF7ED] px-3 py-3 sm:px-5 sm:py-5">
      <div className="mx-auto flex min-h-[calc(100vh-24px)] max-w-[1500px] flex-col overflow-hidden rounded-[22px] border border-[#FF5A36] bg-[#FFFDFC] shadow-sm sm:min-h-[calc(100vh-40px)]">
        <header className="flex h-[66px] shrink-0 items-center justify-between border-b border-[#EAE6DF] bg-white px-4 sm:px-6">
          <Link
            href="/"
            className="text-xl font-black tracking-tight text-[#17202A]"
          >
            Re<span className="text-[#FF5A36]">Market</span>
          </Link>

          <nav className="hidden items-center gap-7 md:flex">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex items-center gap-2 text-sm font-semibold transition ${
                    item.label === "Requests"
                      ? "text-[#FF5A36]"
                      : "text-[#6F675F] hover:text-[#17202A]"
                  }`}
                >
                  <Icon size={17} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Link
            href="/request"
            className="hidden items-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 sm:flex"
          >
            <ClipboardList size={17} />
            Request something
          </Link>
        </header>

        <div className="flex flex-1">
          <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] p-3 md:block">
            <div className="space-y-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.label === "Requests";

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${
                      active
                        ? "bg-[#FFE0D6] text-[#9F2D18]"
                        : "text-[#6F675F] hover:bg-white hover:text-[#17202A]"
                    }`}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <div className="mt-8 rounded-2xl bg-[#FFF0D9] p-4">
              <p className="text-sm font-bold text-[#9F2D18]">
                Track your request
              </p>

              <p className="mt-1 text-xs leading-5 text-[#7C5B4E]">
                Use your request code or contact number
                anytime.
              </p>
            </div>
          </aside>

          <main className="min-w-0 flex-1 overflow-y-auto pb-24 md:pb-8">
            <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
              <Link
                href="/"
                className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[#8A8178] hover:text-[#17202A]"
              >
                <ArrowLeft size={16} />
                Back home
              </Link>

              <div className="mb-6">
                <h1 className="text-2xl font-black tracking-tight text-[#17202A] sm:text-3xl">
                  My Requests
                </h1>

                <p className="mt-2 text-sm leading-6 text-[#7C746C]">
                  Track requests you have submitted without
                  creating an account.
                </p>
              </div>

              <form
                onSubmit={findRequests}
                className="rounded-2xl border border-[#EAE6DF] bg-white p-4 shadow-sm sm:p-5"
              >
                <label
                  htmlFor="request-lookup"
                  className="mb-2 block text-sm font-bold text-[#17202A]"
                >
                  Request code or WhatsApp number
                </label>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="relative flex-1">
                    <Search
                      size={18}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8A8178]"
                    />

                    <input
                      id="request-lookup"
                      value={lookup}
                      onChange={(e) =>
                        setLookup(e.target.value)
                      }
                      placeholder="e.g. RM-7K4P or 08012345678"
                      className="w-full rounded-xl border border-[#E8E4DE] bg-[#FCFAF6] py-3 pl-11 pr-4 text-sm outline-none placeholder:text-[#A69D94] focus:border-[#FF5A36] focus:bg-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-xl bg-[#FF5A36] px-6 py-3 text-sm font-bold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading
                      ? "Searching..."
                      : "Find my requests"}
                  </button>
                </div>

                <p className="mt-2 text-xs text-[#8A8178]">
                  Your request code is shown after you
                  submit a request.
                </p>

                {error && (
                  <div className="mt-4 rounded-xl border border-[#F5C4B3] bg-[#FFE0D6] px-4 py-3 text-sm font-medium text-[#9F2D18]">
                    {error}
                  </div>
                )}
              </form>

              {searched &&
                requests.length === 0 &&
                !error && (
                  <div className="mt-6 rounded-2xl border border-[#EAE6DF] bg-white p-8 text-center shadow-sm">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF0D9] text-[#FF5A36]">
                      <ClipboardList size={25} />
                    </div>

                    <h2 className="mt-4 font-black text-[#17202A]">
                      No requests found
                    </h2>

                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#8A8178]">
                      Check your request code or WhatsApp
                      number and try again.
                    </p>
                  </div>
                )}

              {requests.length > 0 && (
                <div className="mt-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-black text-[#17202A]">
                        Your requests
                      </h2>

                      <p className="mt-1 text-xs text-[#8A8178]">
                        {requests.length} request
                        {requests.length === 1 ? "" : "s"} found
                      </p>
                    </div>
                  </div>

                  {requests.map((request) => (
                    <RequestCard
                      key={request.id}
                      request={request}
                    />
                  ))}
                </div>
              )}
            </div>
          </main>
        </div>

        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#EAE6DF] bg-white px-3 py-2 md:hidden">
          <div className="mx-auto flex max-w-md items-center justify-around">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.label === "Requests";

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-semibold ${
                    active
                      ? "bg-[#FFE0D6] text-[#FF5A36]"
                      : "text-[#8A8178]"
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

function RequestCard({
  request,
}: {
  request: Request;
}) {
  return (
    <article className="rounded-2xl border border-[#EAE6DF] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-[#FCFAF6] px-3 py-1.5 text-xs font-black tracking-wide text-[#17202A]">
              {request.requestCode}
            </span>

            <span
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${statusClass(
                request.status
              )}`}
            >
              {formatStatus(request.status)}
            </span>
          </div>

          <h2 className="mt-3 text-lg font-black text-[#17202A]">
            {request.query}
          </h2>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#8A8178]">
            {request.category && (
              <span>{request.category}</span>
            )}

            {request.locationArea && (
              <span className="flex items-center gap-1">
                <MapPin size={13} />
                {request.locationArea}
              </span>
            )}

            {request.quantity && (
              <span>Qty: {request.quantity}</span>
            )}

            {request.budget != null && (
              <span>
                Budget: ₦
                {request.budget.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#8A8178]">
          <Clock3 size={14} />

          {new Date(
            request.createdAt
          ).toLocaleDateString()}
        </div>
      </div>

      {request.description && (
        <div className="mt-4 rounded-xl bg-[#FCFAF6] p-4">
          <p className="text-xs font-bold text-[#6F675F]">
            Details
          </p>

          <p className="mt-1 text-sm leading-6 text-[#7C746C]">
            {request.description}
          </p>
        </div>
      )}

      <div className="mt-5 border-t border-[#EAE6DF] pt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black text-[#17202A]">
            Matched sellers
          </h3>

          <span className="text-xs font-semibold text-[#8A8178]">
            {request.matches.length} found
          </span>
        </div>

        {request.matches.length === 0 ? (
          <div className="mt-3 rounded-xl bg-[#FCFAF6] p-4 text-center">
            <p className="text-sm font-semibold text-[#6F675F]">
              No seller matches yet
            </p>
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {request.matches.map((match) => (
              <Link
                key={match.id}
                href={`/seller/${match.business.id}`}
                className="group rounded-xl border border-[#EAE6DF] p-3 transition hover:border-[#FF5A36] hover:bg-[#FFF7ED]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#FF5A36]">
                    <Store size={18} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[#17202A]">
                      {match.business.name}
                    </p>

                    <p className="mt-1 flex items-center gap-1 text-xs text-[#8A8178]">
                      <MapPin size={12} />
                      {match.business.area}
                    </p>
                  </div>

                  {match.business.verified && (
                    <CheckCircle2
                      size={17}
                      className="shrink-0 text-[#FF5A36]"
                    />
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-[#8A8178]">
        <Phone size={13} />
        <span>
          Contact: {request.buyerContact}
        </span>
      </div>
    </article>
  );
}