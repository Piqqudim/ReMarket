"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CheckCircle2,
  Info,
  Loader2,
  Mail,
  MessageCircle,
  Phone,
  Radio,
  ShieldCheck,
  Smartphone,
  Store,
  UserRound,
} from "lucide-react";

type SessionUser = {
  id?: string;
  name?: string | null;
  email?: string | null;
  role?: string;
};

type NotificationPreferenceSetting = {
  notificationType: string;
  inApp: boolean;
  push: boolean;
  email: boolean;
  whatsapp: boolean;
  sms: boolean;
  customized: boolean;
  updatedAt: string | null;
};

type ApiResponse = {
  error?: unknown;
  message?: unknown;
  preferences?: unknown;
  preference?: unknown;
};

const CATEGORY_ORDER = [
  "Service bookings",
  "ReMarket announcements",
  "Requests",
  "Marketplace activity",
  "Account and other updates",
];

const CHANNELS = [
  {
    key: "push",
    label: "Push notifications",
    description: "Alerts sent by your browser or device.",
    icon: Smartphone,
  },
  {
    key: "email",
    label: "Email",
    description: "Updates delivered to your email address.",
    icon: Mail,
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    description: "Updates delivered through WhatsApp.",
    icon: MessageCircle,
  },
  {
    key: "sms",
    label: "SMS",
    description: "Updates delivered as text messages.",
    icon: Phone,
  },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isPreference(
  value: unknown
): value is NotificationPreferenceSetting {
  return (
    isRecord(value) &&
    typeof value.notificationType === "string" &&
    typeof value.inApp === "boolean" &&
    typeof value.push === "boolean" &&
    typeof value.email === "boolean" &&
    typeof value.whatsapp === "boolean" &&
    typeof value.sms === "boolean" &&
    typeof value.customized === "boolean" &&
    (typeof value.updatedAt === "string" ||
      value.updatedAt === null)
  );
}

function getErrorMessage(
  value: unknown,
  fallback: string
): string {
  if (
    isRecord(value) &&
    typeof value.error === "string" &&
    value.error.trim()
  ) {
    return value.error;
  }

  return fallback;
}

function formatNotificationType(type: string): string {
  const knownLabels: Record<string, string> = {
    SYSTEM_ANNOUNCEMENT: "ReMarket announcements",
    SERVICE_BOOKING_CREATED: "New service booking requests",
    SERVICE_BOOKING_UPDATED: "Booking status updates",
    SERVICE_BOOKING_MESSAGE: "Booking conversation messages",
  };

  if (knownLabels[type]) {
    return knownLabels[type];
  }

  return type
    .split("_")
    .filter(Boolean)
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1).toLowerCase()
    )
    .join(" ");
}

function getNotificationDescription(type: string): string {
  const descriptions: Record<string, string> = {
    SYSTEM_ANNOUNCEMENT:
      "Important announcements, platform news and updates from ReMarket.",

    SERVICE_BOOKING_CREATED:
      "When a buyer requests your service or when a new service booking is submitted.",

    SERVICE_BOOKING_UPDATED:
      "When a booking is accepted, declined, cancelled or marked as completed.",

    SERVICE_BOOKING_MESSAGE:
      "When the other participant sends a message in a service booking conversation.",
  };

  return (
    descriptions[type] ??
    "In-app updates related to your ReMarket account and activity."
  );
}

function getPreferenceGroup(type: string): string {
  if (type.startsWith("SERVICE_BOOKING_")) {
    return "Service bookings";
  }

  if (type.startsWith("SYSTEM_")) {
    return "ReMarket announcements";
  }

  if (type.includes("REQUEST")) {
    return "Requests";
  }

  if (
    /BUSINESS|PRODUCT|REVIEW|CLAIM/.test(type)
  ) {
    return "Marketplace activity";
  }

  return "Account and other updates";
}

export default function NotificationSettingsPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const user = session?.user as SessionUser | undefined;
  const role = user?.role;

  const displayName =
    user?.name?.trim() || "ReMarket user";

  const accountLabel =
    role === "SELLER"
      ? "Seller account"
      : role === "ADMIN"
        ? "Admin account"
        : "Buyer account";

  const backHref =
    role === "SELLER"
      ? "/seller/profile"
      : role === "ADMIN"
        ? "/admin"
        : "/profile";

  const [preferences, setPreferences] = useState<
    NotificationPreferenceSetting[]
  >([]);

  const [loading, setLoading] = useState(true);
  const [savingTypes, setSavingTypes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  /*
   * ---------------------------------------------------------
   * LOAD PREFERENCES
   * ---------------------------------------------------------
   */

  const loadPreferences = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        "/api/notifications/preferences",
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data: unknown = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            data,
            "Unable to load notification preferences."
          )
        );
      }

      if (
        !isRecord(data) ||
        !Array.isArray(data.preferences)
      ) {
        throw new Error(
          "The server returned an invalid preferences response."
        );
      }

      const validPreferences =
        data.preferences.filter(isPreference);

      setPreferences(validPreferences);
    } catch (loadError) {
      console.error(
        "Notification preferences load error:",
        loadError
      );

      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load notification preferences."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(
        `/buyer/login?callbackUrl=${encodeURIComponent(
          "/settings/notifications"
        )}`
      );

      return;
    }

    if (status === "authenticated") {
      void loadPreferences();
    }
  }, [status, router, loadPreferences]);

  /*
   * ---------------------------------------------------------
   * UPDATE ONE PREFERENCE
   * ---------------------------------------------------------
   *
   * The page saves each toggle immediately.
   * Other notification channels are not editable yet.
   */

  async function updateInAppPreference(
    notificationType: string,
    enabled: boolean
  ) {
    if (savingTypes.includes(notificationType)) {
      return;
    }

    setError("");
    setSuccess("");

    setSavingTypes((current) => [
      ...current,
      notificationType,
    ]);

    try {
      const response = await fetch(
        "/api/notifications/preferences",
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            notificationType,
            inApp: enabled,
          }),
        }
      );

      const data: unknown = await response
        .json()
        .catch(() => null);

      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            data,
            "Unable to update this notification preference."
          )
        );
      }

      if (
        !isRecord(data) ||
        !isPreference(data.preference)
      ) {
        throw new Error(
          "The server did not return the updated preference."
        );
      }

      const updatedPreference = data.preference;

      setPreferences((current) =>
        current.map((item) =>
          item.notificationType === notificationType
            ? {
                ...item,
                ...updatedPreference,
              }
            : item
        )
      );

      setSuccess(
        `${formatNotificationType(notificationType)} preference saved.`
      );
    } catch (updateError) {
      console.error(
        "Notification preference update error:",
        updateError
      );

      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update this preference. Please try again."
      );
    } finally {
      setSavingTypes((current) =>
        current.filter(
          (item) => item !== notificationType
        )
      );
    }
  }

  /*
   * ---------------------------------------------------------
   * GROUP PREFERENCES
   * ---------------------------------------------------------
   */

  const groupedPreferences = useMemo(() => {
    const groups: Record<
      string,
      NotificationPreferenceSetting[]
    > = {};

    for (const preference of preferences) {
      const group = getPreferenceGroup(
        preference.notificationType
      );

      if (!groups[group]) {
        groups[group] = [];
      }

      groups[group].push(preference);
    }

    return CATEGORY_ORDER
      .filter((group) => groups[group]?.length)
      .map((group) => ({
        label: group,
        items: groups[group],
      }));
  }, [preferences]);

  const enabledCount = useMemo(
    () => preferences.filter((item) => item.inApp).length,
    [preferences]
  );

  const disabledCount = preferences.length - enabledCount;

  /*
   * ---------------------------------------------------------
   * AUTHENTICATION LOADING
   * ---------------------------------------------------------
   */

  if (
    status === "loading" ||
    status === "unauthenticated"
  ) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#FCFAF6] px-4">
        <div
          className="flex items-center gap-2 text-sm text-[#756B61]"
          role="status"
        >
          <Loader2
            className="h-4 w-4 animate-spin text-[#FF5A36]"
            aria-hidden="true"
          />
          Loading your account...
        </div>
      </main>
    );
  }

  /*
   * ---------------------------------------------------------
   * PAGE
   * ---------------------------------------------------------
   */

  return (
    <main className="min-h-dvh bg-[#FCFAF6] px-3 py-4 text-[#17202A] sm:px-6 sm:py-8">
      <div className="mx-auto w-full max-w-5xl">
        <Link
          href={backHref}
          className="mb-5 inline-flex min-h-10 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-[#756B61] transition hover:text-[#9F2D18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF5A36]"
        >
          <ArrowLeft
            className="h-4 w-4"
            aria-hidden="true"
          />
          Back to profile
        </Link>

        <section className="overflow-hidden rounded-[26px] border border-[#EAE6DF] bg-white shadow-[0_8px_30px_rgba(23,32,42,0.04)]">
          {/* PAGE HEADER */}

          <div className="relative overflow-hidden bg-[#17202A] px-5 py-7 text-white sm:px-8 sm:py-9">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-14 -top-20 h-64 w-64 rounded-full border-[28px] border-white/5"
            />

            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-24 right-24 h-44 w-44 rounded-full bg-[#FF5A36]/20 blur-3xl"
            />

            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#FF5A36] text-white shadow-lg shadow-black/10">
                <Bell
                  className="h-8 w-8"
                  aria-hidden="true"
                />
              </div>

              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#FFD3C6]">
                  {accountLabel}
                </p>

                <h1 className="mt-1 break-words text-2xl font-bold tracking-tight sm:text-3xl">
                  Notification settings
                </h1>

                <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">
                  Choose which ReMarket activities can send you
                  in-app notifications. Your choices are saved
                  automatically.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-5 p-4 sm:p-7 lg:grid-cols-[minmax(0,1fr)_280px]">
            {/* MAIN SETTINGS */}

            <div className="min-w-0 space-y-5">
              {success && (
                <div
                  role="status"
                  className="flex items-start gap-3 rounded-xl border border-[#BFE3CE] bg-[#EEF9F2] px-4 py-3 text-sm font-semibold text-[#287A4B]"
                >
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{success}</span>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-xl border border-[#F1D0C8] bg-[#FFF0ED] px-4 py-3 text-sm font-semibold text-[#9F2D18]"
                >
                  <Info
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    {error}
                  </span>
                </div>
              )}

              <section
                className="rounded-2xl border border-[#EAE6DF] bg-[#FFFDFC] p-4 sm:p-5"
                aria-labelledby="in-app-heading"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF0E9] text-[#9F2D18]">
                    <Radio
                      className="h-5 w-5"
                      aria-hidden="true"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2
                      id="in-app-heading"
                      className="text-base font-bold"
                    >
                      In-app notifications
                    </h2>

                    <p className="mt-1 text-xs leading-5 text-[#756B61]">
                      Control the notifications that appear in
                      your ReMarket notification centre.
                    </p>
                  </div>
                </div>

                {loading ? (
                  <div
                    className="flex items-center justify-center gap-2 py-12 text-sm text-[#756B61]"
                    role="status"
                  >
                    <Loader2 className="h-5 w-5 animate-spin text-[#FF5A36]" />
                    Loading your preferences...
                  </div>
                ) : preferences.length === 0 ? (
                  <div className="mt-5 rounded-xl bg-[#FCFAF6] px-4 py-8 text-center">
                    <Bell className="mx-auto h-7 w-7 text-[#A39A91]" />

                    <p className="mt-3 text-sm font-bold text-[#17202A]">
                      No notification categories found
                    </p>

                    <p className="mt-1 text-xs leading-5 text-[#756B61]">
                      We couldn't find any notification categories
                      for your account.
                    </p>

                    <button
                      type="button"
                      onClick={() => void loadPreferences()}
                      className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl bg-[#FF5A36] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#E94A28]"
                    >
                      Try again
                    </button>
                  </div>
                ) : (
                  <div className="mt-5 space-y-6">
                    {groupedPreferences.map((group) => (
                      <div key={group.label}>
                        <h3 className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.13em] text-[#8A8178]">
                          {group.label}
                        </h3>

                        <div className="divide-y divide-[#EAE6DF] rounded-xl border border-[#EAE6DF] bg-white">
                          {group.items.map((item) => {
                            const saving =
                              savingTypes.includes(
                                item.notificationType
                              );

                            return (
                              <div
                                key={item.notificationType}
                                className="flex items-start justify-between gap-4 p-4"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-bold text-[#17202A]">
                                      {formatNotificationType(
                                        item.notificationType
                                      )}
                                    </p>

                                    {item.customized && (
                                      <span className="rounded-full bg-[#F2EEE8] px-2 py-0.5 text-[9px] font-bold text-[#756B61]">
                                        Customized
                                      </span>
                                    )}
                                  </div>

                                  <p className="mt-1 text-xs leading-5 text-[#756B61]">
                                    {getNotificationDescription(
                                      item.notificationType
                                    )}
                                  </p>

                                  <p
                                    className={`mt-2 text-[10px] font-bold ${
                                      item.inApp
                                        ? "text-[#287A4B]"
                                        : "text-[#8A8178]"
                                    }`}
                                  >
                                    {item.inApp
                                      ? "Notifications enabled"
                                      : "Notifications disabled"}
                                  </p>
                                </div>

                                <div className="flex shrink-0 items-center gap-2 pt-1">
                                  {saving && (
                                    <Loader2
                                      className="h-4 w-4 animate-spin text-[#FF5A36]"
                                      aria-label="Saving preference"
                                    />
                                  )}

                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={item.inApp}
                                    aria-label={`${
                                      item.inApp ? "Disable" : "Enable"
                                    } ${formatNotificationType(
                                      item.notificationType
                                    )}`}
                                    disabled={saving}
                                    onClick={() =>
                                      void updateInAppPreference(
                                        item.notificationType,
                                        !item.inApp
                                      )
                                    }
                                    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/20 disabled:cursor-not-allowed disabled:opacity-60 ${
                                      item.inApp
                                        ? "border-[#FF5A36] bg-[#FF5A36]"
                                        : "border-[#D7D0C8] bg-[#EAE6DF]"
                                    }`}
                                  >
                                    <span
                                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
                                        item.inApp
                                          ? "translate-x-[22px]"
                                          : "translate-x-[3px]"
                                      }`}
                                    />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* EXTERNAL DELIVERY CHANNELS */}

              <section
                className="rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5"
                aria-labelledby="channels-heading"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F2EEE8] text-[#6F675F]">
                    <Smartphone
                      className="h-5 w-5"
                      aria-hidden="true"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2
                      id="channels-heading"
                      className="text-base font-bold"
                    >
                      Other notification channels
                    </h2>

                    <p className="mt-1 text-xs leading-5 text-[#756B61]">
                      These delivery options are not connected yet.
                      ReMarket currently supports in-app notifications.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {CHANNELS.map((channel) => {
                    const Icon = channel.icon;

                    return (
                      <div
                        key={channel.key}
                        className="flex items-start gap-3 rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] p-3.5"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F0EBE4] text-[#8A8178]">
                          <Icon
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-[#51473F]">
                            {channel.label}
                          </p>

                          <p className="mt-1 text-[10px] leading-4 text-[#8A8178]">
                            {channel.description}
                          </p>

                          <span className="mt-2 inline-flex rounded-full bg-[#F0EBE4] px-2 py-1 text-[9px] font-bold text-[#756B61]">
                            Coming later
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* IMPORTANT INFORMATION */}

              <section className="rounded-2xl border border-[#F1D5D0] bg-[#FFF9F7] p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#9F2D18]">
                    <ShieldCheck
                      className="h-5 w-5"
                      aria-hidden="true"
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-bold text-[#17202A]">
                      Your settings do not stop ReMarket activities
                    </h2>

                    <p className="mt-1 text-xs leading-5 text-[#756B61]">
                      Turning off a notification only controls
                      whether ReMarket creates that in-app alert.
                      It does not cancel bookings, prevent messages
                      from being saved, or stop other account
                      activities.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            {/* SIDEBAR */}

            <aside className="min-w-0 space-y-4">
              <section className="rounded-2xl border border-[#EAE6DF] bg-[#FFFDFC] p-4 sm:p-5">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#8A8178]">
                  Your account
                </p>

                <div className="mt-3 flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFE0D6] text-[#9F2D18]">
                    <UserRound
                      className="h-5 w-5"
                      aria-hidden="true"
                    />
                  </div>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#17202A]">
                      {displayName}
                    </p>

                    <p className="truncate text-xs text-[#756B61]">
                      {accountLabel}
                    </p>
                  </div>
                </div>

                <Link
                  href={backHref}
                  className="mt-4 flex min-h-10 items-center justify-between gap-2 border-t border-[#EAE6DF] pt-3 text-xs font-bold text-[#9F2D18] transition hover:text-[#FF5A36]"
                >
                  Back to your account
                  <ArrowRight
                    className="h-4 w-4"
                    aria-hidden="true"
                  />
                </Link>
              </section>

              <section className="rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5">
                <div className="flex items-center gap-2">
                  <Bell
                    className="h-4 w-4 text-[#9F2D18]"
                    aria-hidden="true"
                  />

                  <h2 className="text-sm font-bold text-[#17202A]">
                    Preference summary
                  </h2>
                </div>

                {loading ? (
                  <div className="mt-5 flex items-center gap-2 text-xs text-[#756B61]">
                    <Loader2 className="h-4 w-4 animate-spin text-[#FF5A36]" />
                    Loading...
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-xl bg-[#FCFAF6] p-3.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#8A8178]">
                        Enabled categories
                      </p>

                      <p className="mt-1 text-2xl font-black text-[#287A4B]">
                        {enabledCount}
                      </p>
                    </div>

                    <div className="rounded-xl bg-[#FCFAF6] p-3.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-[#8A8178]">
                        Disabled categories
                      </p>

                      <p className="mt-1 text-2xl font-black text-[#6F675F]">
                        {disabledCount}
                      </p>
                    </div>

                    <p className="text-[10px] leading-5 text-[#8A8178]">
                      These totals reflect your in-app notification
                      preferences.
                    </p>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-[#EAE6DF] bg-[#FCFAF6] p-4">
                <div className="flex items-center gap-2">
                  <Store
                    className="h-4 w-4 text-[#9F2D18]"
                    aria-hidden="true"
                  />

                  <h2 className="text-xs font-bold text-[#17202A]">
                    About notification settings
                  </h2>
                </div>

                <p className="mt-2 text-xs leading-5 text-[#756B61]">
                  Each category can be controlled independently.
                  Changes are saved immediately, so there is no
                  separate save button.
                </p>
              </section>
            </aside>
          </div>
        </section>

        <footer className="mt-5 flex flex-col gap-2 px-1 text-[10px] leading-5 text-[#8A8178] sm:flex-row sm:items-center sm:justify-between">
          <span>
            ReMarket · Notification preferences
          </span>

          <Link
            href="/"
            className="font-semibold text-[#9F2D18] hover:text-[#FF5A36]"
          >
            Back to marketplace
          </Link>
        </footer>
      </div>
    </main>
  );
}