// app/request/page.tsx

"use client";

import {
  useEffect,
  useState,
} from "react";

import Link from "next/link";

import {
  ArrowLeft,
  ClipboardList,
  MapPin,
  Search,
  Send,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Store,
  MessageCircle,
} from "lucide-react";

type Category = {
  id: string;
  name: string;
};

type RequestForm = {
  query: string;
  categoryId: string;
  locationArea: string;
  budget: string;
  quantity: string;
  description: string;
  buyerContact: string;
};

const INITIAL_FORM: RequestForm = {
  query: "",
  categoryId: "",
  locationArea: "",
  budget: "",
  quantity: "",
  description: "",
  buyerContact: "",
};

export default function RequestPage() {
  const [form, setForm] =
    useState<RequestForm>(
      INITIAL_FORM
    );

  const [categories, setCategories] =
    useState<Category[]>([]);

  const [loadingCategories, setLoadingCategories] =
    useState(true);

  const [submitting, setSubmitting] =
    useState(false);

  const [submitted, setSubmitted] =
    useState(false);

  const [error, setError] =
    useState("");

  const [requestId, setRequestId] =
    useState<string | null>(null);

  /*
   * Load categories
   */
  useEffect(() => {
    const controller =
      new AbortController();

    async function loadCategories() {
      try {
        setLoadingCategories(true);

        const response = await fetch(
          "/api/categories",
          {
            cache: "no-store",
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          throw new Error(
            "Unable to load categories"
          );
        }

        const data =
          await response.json();

        setCategories(
          data.categories ?? []
        );
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }

        console.error(
          "Category loading error:",
          error
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoadingCategories(false);
        }
      }
    }

    loadCategories();

    return () => {
      controller.abort();
    };
  }, []);

  function updateField(
    field: keyof RequestForm,
    value: string
  ) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    setError("");

    const query =
      form.query.trim();

    if (!query) {
      setError(
        "Tell us what you're looking for."
      );
      return;
    }

    const budget =
      form.budget.trim()
        ? Number(
            form.budget.replace(
              /,/g,
              ""
            )
          )
        : undefined;

    const quantity =
      form.quantity.trim()
        ? Number(form.quantity)
        : undefined;

    if (
      budget !== undefined &&
      (!Number.isFinite(budget) ||
        budget < 0)
    ) {
      setError(
        "Please enter a valid budget."
      );
      return;
    }

    if (
      quantity !== undefined &&
      (!Number.isInteger(quantity) ||
        quantity <= 0)
    ) {
      setError(
        "Please enter a valid quantity."
      );
      return;
    }

    try {
      setSubmitting(true);

      const response = await fetch(
        "/api/requests",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            query,

            categoryId:
              form.categoryId || undefined,

            locationArea:
              form.locationArea.trim() ||
              undefined,

            budget,

            quantity,

            description:
              form.description.trim() ||
              undefined,

            buyerContact:
              form.buyerContact.trim() ||
              undefined,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
            "Unable to submit your request."
        );
      }

      setRequestId(
        data.request?.id ??
          data.id ??
          null
      );

      setSubmitted(true);
    } catch (error) {
      console.error(
        "Request submission error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
          : "Unable to submit your request."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setForm(INITIAL_FORM);
    setSubmitted(false);
    setRequestId(null);
    setError("");
  }

  return (
    <main className="min-h-screen bg-[#FAF6EF] text-[#2F2A26]">
      {/* =========================
          DESKTOP SIDEBAR
      ========================== */}

      <aside className="fixed left-0 top-0 hidden h-screen w-[250px] border-r border-[#E8DED2] bg-[#FFFDF9] lg:flex lg:flex-col">
        <div className="px-7 py-7">
          <Link
            href="/"
            className="flex items-center gap-3"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F0997B] text-white">
              <Store size={20} />
            </div>

            <div>
              <p className="text-[17px] font-bold">
                LocalMarket
              </p>

              <p className="text-xs text-[#8A8179]">
                Find it nearby
              </p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 px-4">
          <Link
            href="/"
            className="mb-1 flex rounded-2xl px-4 py-3 text-sm font-medium text-[#746B63] hover:bg-[#FAF1E8]"
          >
            Home
          </Link>

          <Link
            href="/shop"
            className="mb-1 flex rounded-2xl px-4 py-3 text-sm font-medium text-[#746B63] hover:bg-[#FAF1E8]"
          >
            Shop
          </Link>

          <Link
            href="/request"
            className="mb-1 flex rounded-2xl bg-[#FCE3D9] px-4 py-3 text-sm font-semibold text-[#B85635]"
          >
            Requests
          </Link>

          <Link
            href="/saved"
            className="flex rounded-2xl px-4 py-3 text-sm font-medium text-[#746B63] hover:bg-[#FAF1E8]"
          >
            Saved
          </Link>
        </nav>

        <div className="border-t border-[#E8DED2] p-5">
          <Link
            href="/near-me"
            className="flex items-center gap-3 rounded-2xl bg-[#F7EEE6] px-4 py-3"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white">
              <MapPin
                size={17}
                className="text-[#E97959]"
              />
            </div>

            <div>
              <p className="text-sm font-semibold">
                Near Me
              </p>

              <p className="text-xs text-[#8A8179]">
                See what's closest
              </p>
            </div>
          </Link>
        </div>
      </aside>

      {/* =========================
          MAIN CONTENT
      ========================== */}

      <div className="lg:pl-[250px]">
        {/* Mobile header */}

        <header className="border-b border-[#E8DED2] bg-[#FFFDF9] lg:hidden">
          <div className="flex h-[64px] items-center gap-3 px-4">
            <Link
              href="/"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#E5DCD1] bg-white"
              aria-label="Back home"
            >
              <ArrowLeft size={18} />
            </Link>

            <div>
              <p className="text-sm font-bold">
                Request something
              </p>

              <p className="text-[11px] text-[#8A8179]">
                LocalMarket
              </p>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
          {/* Desktop back link */}

          <Link
            href="/"
            className="mb-6 hidden items-center gap-2 text-sm font-medium text-[#756C64] hover:text-[#D86E4E] lg:inline-flex"
          >
            <ArrowLeft size={16} />
            Back home
          </Link>

          {/* =========================
              HERO
          ========================== */}

          <section className="mb-8 rounded-[28px] bg-[#F0997B] px-6 py-8 text-white sm:px-8 sm:py-10 lg:px-10">
            <div className="max-w-2xl">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
                <ClipboardList size={24} />
              </div>

              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Tell us what you need
              </h1>

              <p className="mt-3 max-w-xl text-sm leading-6 text-white/85 sm:text-base">
                Describe what you're looking
                for and we'll help you find
                matching local sellers.
              </p>
            </div>
          </section>

          {/* =========================
              SUCCESS
          ========================== */}

          {submitted ? (
            <section className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
              <div className="rounded-[28px] border border-[#E8DED2] bg-white p-7 text-center sm:p-10">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
                  <CheckCircle2
                    size={32}
                    className="text-emerald-600"
                  />
                </div>

                <h2 className="mt-6 text-2xl font-bold">
                  Request submitted
                </h2>

                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#756C64]">
                  We've received your request.
                  We'll use the details you
                  provided to look for matching
                  local sellers.
                </p>

                {requestId && (
                  <div className="mx-auto mt-5 w-fit rounded-xl bg-[#FAF6EF] px-4 py-2 text-xs text-[#81786F]">
                    Request ID:{" "}
                    <span className="font-semibold">
                      {requestId}
                    </span>
                  </div>
                )}

                <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="rounded-xl bg-[#F0997B] px-5 py-3 text-sm font-bold text-white"
                  >
                    Make another request
                  </button>

                  <Link
                    href="/shop"
                    className="rounded-xl border border-[#E3D9CF] bg-white px-5 py-3 text-sm font-semibold text-[#5F5750]"
                  >
                    Browse shops
                  </Link>
                </div>
              </div>

              <HowItWorks />
            </section>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
              {/* =========================
                  REQUEST FORM
              ========================== */}

              <section className="rounded-[28px] border border-[#E8DED2] bg-white p-5 shadow-sm sm:p-7">
                <form
                  onSubmit={
                    handleSubmit
                  }
                  className="space-y-6"
                >
                  {/* Main request */}

                  <div>
                    <label
                      htmlFor="query"
                      className="mb-2 block text-sm font-bold"
                    >
                      What are you looking
                      for?{" "}
                      <span className="text-[#D86E4E]">
                        *
                      </span>
                    </label>

                    <div className="relative">
                      <Search
                        size={18}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9A9188]"
                      />

                      <input
                        id="query"
                        type="text"
                        value={
                          form.query
                        }
                        onChange={(
                          event
                        ) =>
                          updateField(
                            "query",
                            event.target
                              .value
                          )
                        }
                        placeholder="e.g. White sneakers size 42"
                        className="h-12 w-full rounded-2xl border border-[#E3D9CF] bg-[#FFFDF9] pl-11 pr-4 text-sm outline-none transition focus:border-[#F0997B] focus:ring-4 focus:ring-[#F0997B]/10"
                        required
                      />
                    </div>

                    <p className="mt-2 text-xs text-[#8A8179]">
                      Be as specific as you
                      can so we can find a
                      better match.
                    </p>
                  </div>

                  {/* Category */}

                  <div>
                    <label
                      htmlFor="category"
                      className="mb-2 block text-sm font-bold"
                    >
                      Category{" "}
                      <span className="font-normal text-[#9A9188]">
                        (optional)
                      </span>
                    </label>

                    <select
                      id="category"
                      value={
                        form.categoryId
                      }
                      onChange={(
                        event
                      ) =>
                        updateField(
                          "categoryId",
                          event.target
                            .value
                        )
                      }
                      className="h-12 w-full appearance-none rounded-2xl border border-[#E3D9CF] bg-[#FFFDF9] px-4 text-sm text-[#4F4842] outline-none transition focus:border-[#F0997B] focus:ring-4 focus:ring-[#F0997B]/10"
                    >
                      <option value="">
                        Select category
                      </option>

                      {loadingCategories ? (
                        <option disabled>
                          Loading categories...
                        </option>
                      ) : (
                        categories.map(
                          (
                            category
                          ) => (
                            <option
                              key={
                                category.id
                              }
                              value={
                                category.id
                              }
                            >
                              {
                                category.name
                              }
                            </option>
                          )
                        )
                      )}
                    </select>
                  </div>

                  {/* Location */}

                  <div>
                    <label
                      htmlFor="location"
                      className="mb-2 block text-sm font-bold"
                    >
                      Your location{" "}
                      <span className="font-normal text-[#9A9188]">
                        (optional)
                      </span>
                    </label>

                    <div className="relative">
                      <MapPin
                        size={18}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9A9188]"
                      />

                      <input
                        id="location"
                        type="text"
                        value={
                          form.locationArea
                        }
                        onChange={(
                          event
                        ) =>
                          updateField(
                            "locationArea",
                            event.target
                              .value
                          )
                        }
                        placeholder="e.g. Lagos, Surulere"
                        className="h-12 w-full rounded-2xl border border-[#E3D9CF] bg-[#FFFDF9] pl-11 pr-4 text-sm outline-none transition focus:border-[#F0997B] focus:ring-4 focus:ring-[#F0997B]/10"
                      />
                    </div>
                  </div>

                  {/* Budget + Quantity */}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="budget"
                        className="mb-2 block text-sm font-bold"
                      >
                        Budget{" "}
                        <span className="font-normal text-[#9A9188]">
                          (optional)
                        </span>
                      </label>

                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#8A8179]">
                          ₦
                        </span>

                        <input
                          id="budget"
                          type="text"
                          inputMode="numeric"
                          value={
                            form.budget
                          }
                          onChange={(
                            event
                          ) =>
                            updateField(
                              "budget",
                              event.target
                                .value
                                .replace(
                                  /[^\d,]/g,
                                  ""
                                )
                            )
                          }
                          placeholder="e.g. 20000"
                          className="h-12 w-full rounded-2xl border border-[#E3D9CF] bg-[#FFFDF9] pl-9 pr-4 text-sm outline-none transition focus:border-[#F0997B] focus:ring-4 focus:ring-[#F0997B]/10"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="quantity"
                        className="mb-2 block text-sm font-bold"
                      >
                        Quantity{" "}
                        <span className="font-normal text-[#9A9188]">
                          (optional)
                        </span>
                      </label>

                      <input
                        id="quantity"
                        type="number"
                        min="1"
                        value={
                          form.quantity
                        }
                        onChange={(
                          event
                        ) =>
                          updateField(
                            "quantity",
                            event.target
                              .value
                          )
                        }
                        placeholder="e.g. 2"
                        className="h-12 w-full rounded-2xl border border-[#E3D9CF] bg-[#FFFDF9] px-4 text-sm outline-none transition focus:border-[#F0997B] focus:ring-4 focus:ring-[#F0997B]/10"
                      />
                    </div>
                  </div>

                  {/* Description */}

                  <div>
                    <label
                      htmlFor="description"
                      className="mb-2 block text-sm font-bold"
                    >
                      More details{" "}
                      <span className="font-normal text-[#9A9188]">
                        (optional)
                      </span>
                    </label>

                    <textarea
                      id="description"
                      value={
                        form.description
                      }
                      onChange={(
                        event
                      ) =>
                        updateField(
                          "description",
                          event.target
                            .value
                        )
                      }
                      placeholder="Add colour, size, brand, preferred style, or anything else that matters..."
                      rows={4}
                      className="w-full resize-none rounded-2xl border border-[#E3D9CF] bg-[#FFFDF9] px-4 py-3 text-sm leading-6 outline-none transition focus:border-[#F0997B] focus:ring-4 focus:ring-[#F0997B]/10"
                    />
                  </div>

                  {/* Contact */}

                  <div>
                    <label
                      htmlFor="contact"
                      className="mb-2 block text-sm font-bold"
                    >
                      How can we reach you?{" "}
                      <span className="font-normal text-[#9A9188]">
                        (optional)
                      </span>
                    </label>

                    <div className="relative">
                      <MessageCircle
                        size={18}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9A9188]"
                      />

                      <input
                        id="contact"
                        type="text"
                        value={
                          form.buyerContact
                        }
                        onChange={(
                          event
                        ) =>
                          updateField(
                            "buyerContact",
                            event.target
                              .value
                          )
                        }
                        placeholder="WhatsApp number or phone number"
                        className="h-12 w-full rounded-2xl border border-[#E3D9CF] bg-[#FFFDF9] pl-11 pr-4 text-sm outline-none transition focus:border-[#F0997B] focus:ring-4 focus:ring-[#F0997B]/10"
                      />
                    </div>

                    <p className="mt-2 text-xs text-[#8A8179]">
                      Only add this if you'd
                      like sellers to contact
                      you directly.
                    </p>
                  </div>

                  {/* Error */}

                  {error && (
                    <div className="flex items-start gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                      <AlertCircle
                        size={18}
                        className="mt-0.5 shrink-0"
                      />

                      <p>{error}</p>
                    </div>
                  )}

                  {/* Submit */}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#F0997B] px-5 text-sm font-bold text-white shadow-sm transition hover:bg-[#E9896A] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? (
                      <>
                        <Loader2
                          size={18}
                          className="animate-spin"
                        />
                        Finding sellers...
                      </>
                    ) : (
                      <>
                        <Send size={17} />
                        Submit request
                      </>
                    )}
                  </button>
                </form>
              </section>

              {/* =========================
                  HOW IT WORKS
              ========================== */}

              <HowItWorks />
            </div>
          )}
        </div>
      </div>

      {/* =========================
          MOBILE BOTTOM NAV
      ========================== */}

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#E8DED2] bg-[#FFFDF9]/95 px-3 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-around">
          <Link
            href="/"
            className="flex flex-col items-center gap-1 px-4 py-2 text-[11px] font-medium text-[#81786F]"
          >
            <span>Home</span>
          </Link>

          <Link
            href="/shop"
            className="flex flex-col items-center gap-1 px-4 py-2 text-[11px] font-medium text-[#81786F]"
          >
            <Store size={18} />
            <span>Shop</span>
          </Link>

          <Link
            href="/request"
            className="flex flex-col items-center gap-1 px-4 py-2 text-[11px] font-bold text-[#D86E4E]"
          >
            <ClipboardList size={18} />
            <span>Requests</span>
          </Link>

          <Link
            href="/saved"
            className="flex flex-col items-center gap-1 px-4 py-2 text-[11px] font-medium text-[#81786F]"
          >
            <span>Saved</span>
          </Link>
        </div>
      </nav>
    </main>
  );
}

/* =========================================================
   HOW IT WORKS
========================================================= */

function HowItWorks() {
  const steps = [
    {
      number: "1",
      icon: ClipboardList,
      title: "Tell us what you need",
      description:
        "Share the details of what you're looking for.",
    },
    {
      number: "2",
      icon: Search,
      title: "We match you",
      description:
        "We find local sellers who can help.",
    },
    {
      number: "3",
      icon: MessageCircle,
      title: "You connect",
      description:
        "Get in touch and make your purchase.",
    },
  ];

  return (
    <aside className="h-fit rounded-[28px] border border-[#E8DED2] bg-[#FFF8F1] p-6 sm:p-7">
      <h2 className="text-lg font-bold">
        How it works
      </h2>

      <p className="mt-1 text-sm text-[#81786F]">
        A simple way to find something
        that's not easy to discover.
      </p>

      <div className="mt-7 space-y-6">
        {steps.map((step) => {
          const Icon = step.icon;

          return (
            <div
              key={step.number}
              className="flex gap-4"
            >
              <div className="relative flex shrink-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[#D86E4E] shadow-sm">
                  <Icon size={18} />
                </div>

                {step.number !== "3" && (
                  <div className="absolute left-1/2 top-10 h-6 w-px -translate-x-1/2 bg-[#E5D5C8]" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-[#D86E4E]">
                    0{step.number}
                  </span>

                  <h3 className="text-sm font-bold">
                    {step.title}
                  </h3>
                </div>

                <p className="mt-1 text-xs leading-5 text-[#81786F]">
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-center rounded-2xl bg-[#FCE8DE] px-4 py-5">
        <div className="relative">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-[#E97959] shadow-sm">
            <MapPin size={25} />
          </div>

          <div className="absolute -right-4 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[#F0997B] text-white">
            <CheckCircle2 size={15} />
          </div>
        </div>
      </div>
    </aside>
  );
}