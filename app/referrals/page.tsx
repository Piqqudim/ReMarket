
"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import Link from "next/link";

import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Copy,
  Gift,
  LoaderCircle,
  Share2,
  Users,
} from "lucide-react";

type JsonRecord = Record<string, unknown>;

type ReferralHistoryItem = {
  id: string;
  role: string;
  status: string;
  createdAt: string | null;
  qualifiedAt: string | null;
};

type ReferralRewardItem = {
  id: string;
  type: string;
  status: string;
  quantity: number;
  milestone: number | null;
  grantedAt: string | null;
};

type ReferralDashboardData = {
  referralCode: string;
  totalReferrals: number;
  pendingReferrals: number;
  qualifiedReferrals: number;
  rejectedReferrals: number;
  referrals: ReferralHistoryItem[];
  rewards: ReferralRewardItem[];
};

type AccountRole = "BUYER" | "SELLER";

function asRecord(
  value: unknown
): JsonRecord | null {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return value as JsonRecord;
  }

  return null;
}

function asArray(
  value: unknown
): unknown[] {
  return Array.isArray(value) ? value : [];
}

function firstString(
  record: JsonRecord | null,
  keys: string[]
): string | null {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];

    if (
      typeof value === "string" &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return null;
}

function firstNumber(
  record: JsonRecord | null,
  keys: string[],
  fallback: number
): number {
  if (!record) {
    return fallback;
  }

  for (const key of keys) {
    const value = record[key];

    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return Math.max(0, value);
    }
  }

  return fallback;
}

function formatDate(
  value: string | null
): string {
  if (!value) {
    return "Not available";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function readableLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase()
    );
}

function normalizeDashboard(
  payload: unknown
): ReferralDashboardData {
  const response = asRecord(payload);
  const dashboard =
    asRecord(response?.dashboard) ?? response;

  const stats = asRecord(dashboard?.stats);

  const rawReferrals = asArray(
    dashboard?.referrals ??
      dashboard?.referralHistory
  );

  const rawRewards = asArray(
    dashboard?.rewards ??
      dashboard?.referralRewards
  );

  const referrals: ReferralHistoryItem[] =
    rawReferrals.map((value, index) => {
      const item = asRecord(value);

      return {
        id:
          firstString(item, ["id"]) ??
          `referral-${index}`,

        role:
          firstString(item, [
            "referredRole",
            "role",
          ]) ?? "ACCOUNT",

        status:
          firstString(item, ["status"]) ??
          "PENDING",

        createdAt:
          firstString(item, ["createdAt"]),

        qualifiedAt:
          firstString(item, ["qualifiedAt"]),
      };
    });

  const rewards: ReferralRewardItem[] =
    rawRewards.map((value, index) => {
      const item = asRecord(value);

      return {
        id:
          firstString(item, ["id"]) ??
          `reward-${index}`,

        type:
          firstString(item, ["type"]) ??
          "REFERRAL_REWARD",

        status:
          firstString(item, ["status"]) ??
          "GRANTED",

        quantity: firstNumber(
          item,
          ["quantity"],
          1
        ),

        milestone:
          typeof item?.milestone === "number"
            ? item.milestone
            : null,

        grantedAt:
          firstString(item, [
            "grantedAt",
            "createdAt",
          ]),
      };
    });

  return {
    referralCode:
      firstString(dashboard, [
        "referralCode",
        "code",
      ]) ?? "",

    totalReferrals: firstNumber(
      stats,
      ["totalReferrals", "total", "totalCount"],
      referrals.length
    ),

    pendingReferrals: firstNumber(
      stats,
      ["pendingReferrals", "pending", "pendingCount"],
      referrals.filter(
        (item) => item.status === "PENDING"
      ).length
    ),

    qualifiedReferrals: firstNumber(
      stats,
      [
        "qualifiedReferrals",
        "qualified",
        "qualifiedCount",
      ],
      referrals.filter(
        (item) => item.status === "QUALIFIED"
      ).length
    ),

    rejectedReferrals: firstNumber(
      stats,
      ["rejectedReferrals", "rejected", "rejectedCount"],
      referrals.filter(
        (item) => item.status === "REJECTED"
      ).length
    ),

    referrals,
    rewards,
  };
}

function statusClass(status: string): string {
  switch (status) {
    case "QUALIFIED":
    case "GRANTED":
      return "bg-[#EAF8EF] text-[#197449]";

    case "REJECTED":
    case "REVOKED":
      return "bg-[#FFF0EE] text-[#C33C2A]";

    default:
      return "bg-[#FFF5E7] text-[#98631C]";
  }
}

function rewardDescription(
  reward: ReferralRewardItem
): string {
  switch (reward.type) {
    case "PRODUCT_SLOTS":
      return `${reward.quantity} bonus product slot${
        reward.quantity === 1 ? "" : "s"
      }`;

    case "BUYER_MILESTONE":
      return reward.milestone
        ? `Buyer referral milestone ${reward.milestone}`
        : "Buyer referral milestone";

    default:
      return readableLabel(reward.type);
  }
}

export default function ReferralDashboardPage() {
  const [dashboard, setDashboard] =
    useState<ReferralDashboardData | null>(null);

  const [role, setRole] =
    useState<AccountRole | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copyMessage, setCopyMessage] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [referralResponse, sessionResponse] =
        await Promise.all([
          fetch("/api/referrals", {
            method: "GET",
            cache: "no-store",
            credentials: "same-origin",
          }),

          fetch("/api/auth/session", {
            method: "GET",
            cache: "no-store",
            credentials: "same-origin",
          }),
        ]);

      const referralPayload: unknown =
        await referralResponse
          .json()
          .catch(() => null);

      const sessionPayload: unknown =
        await sessionResponse
          .json()
          .catch(() => null);

      if (referralResponse.status === 401) {
        setError("Please sign in to view your referrals.");
        return;
      }

      if (!referralResponse.ok) {
        const responseRecord =
          asRecord(referralPayload);

        setError(
          firstString(responseRecord, ["error"]) ??
            "Unable to load your referral dashboard."
        );

        return;
      }

      const sessionRecord =
        asRecord(sessionPayload);

      const sessionUser =
        asRecord(sessionRecord?.user);

      const sessionRole =
        firstString(sessionUser, ["role"]);

      if (
        sessionRole === "BUYER" ||
        sessionRole === "SELLER"
      ) {
        setRole(sessionRole);
      } else {
        setRole(null);
      }

      setDashboard(
        normalizeDashboard(referralPayload)
      );
    } catch (loadError) {
      console.error(
        "Referral dashboard loading error:",
        loadError
      );

      setError(
        "Something went wrong while loading your referrals."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const referralLink =
    typeof window !== "undefined" &&
    dashboard?.referralCode &&
    role
      ? `${window.location.origin}${
          role === "SELLER"
            ? "/seller/signup"
            : "/buyer/signup"
        }?ref=${encodeURIComponent(
          dashboard.referralCode
        )}`
      : "";

  async function copyReferralLink() {
    if (!referralLink) {
      setCopyMessage(
        "Your referral link is not available yet."
      );
      return;
    }

    try {
      await navigator.clipboard.writeText(referralLink);
      setCopyMessage("Referral link copied!");
    } catch {
      setCopyMessage(
        "Unable to copy automatically. Select and copy the link below."
      );
    }
  }

  const shareMessage =
    role === "SELLER"
      ? "Join ReMarket and make your business easier to discover. Sign up using my referral link:"
      : "Discover local businesses and products on ReMarket. Create your buyer account using my referral link:";

  const whatsappLink = referralLink
    ? `https://wa.me/?text=${encodeURIComponent(
        `${shareMessage} ${referralLink}`
      )}`
    : "";

  const backHref =
    role === "SELLER" ? "/seller" : "/";

  return (
    <main className="min-h-screen bg-[#FCFAF6] px-4 py-6 text-[#111C27] sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <Link
          href={backHref}
          className="mb-7 inline-flex items-center gap-2 rounded-lg text-sm font-medium text-[#718096] transition-colors hover:text-[#FF563F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF563F]"
        >
          <ArrowLeft
            aria-hidden="true"
            className="h-4 w-4"
          />
          Back
        </Link>

        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[#FF563F]">
            ReMarket referrals
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Refer. Grow. Earn.
          </h1>

          <p className="mt-3 max-w-2xl leading-7 text-[#718096]">
            Invite people to ReMarket and track your
            referrals and any rewards you have earned.
          </p>
        </header>

        {loading ? (
          <div
            role="status"
            className="flex min-h-52 items-center justify-center gap-3 rounded-2xl border border-[#EAE6DF] bg-white"
          >
            <LoaderCircle
              aria-hidden="true"
              className="h-5 w-5 animate-spin text-[#FF563F]"
            />
            <span className="text-sm text-[#718096]">
              Loading your referral dashboard...
            </span>
          </div>
        ) : error ? (
          <section
            role="alert"
            className="rounded-2xl border border-[#FFB8B0] bg-white p-6 sm:p-8"
          >
            <div className="flex items-start gap-3">
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 text-[#E33B22]"
              />

              <div>
                <h2 className="font-semibold">
                  Unable to load referrals
                </h2>

                <p className="mt-2 text-sm leading-6 text-[#718096]">
                  {error}
                </p>

                {error.toLowerCase().includes("sign in") && (
                  <Link
                    href="/buyer/login"
                    className="mt-4 inline-flex items-center gap-2 font-semibold text-[#FF563F] hover:underline"
                  >
                    Sign in
                    <ArrowRight
                      aria-hidden="true"
                      className="h-4 w-4"
                    />
                  </Link>
                )}

                <button
                  type="button"
                  onClick={() => void loadDashboard()}
                  className="mt-4 block rounded-lg border border-[#D9DEE5] px-4 py-2 text-sm font-semibold transition-colors hover:bg-[#FCFAF6]"
                >
                  Try again
                </button>
              </div>
            </div>
          </section>
        ) : dashboard ? (
          <>
            {/* REFERRAL LINK */}

            <section className="rounded-2xl border border-[#EAE6DF] bg-white p-5 sm:p-8">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF0DC] text-[#FF563F]">
                  <Share2
                    aria-hidden="true"
                    className="h-5 w-5"
                  />
                </div>

                <div>
                  <h2 className="text-lg font-semibold">
                    Your referral link
                  </h2>

                  <p className="mt-1 text-sm text-[#718096]">
                    Share this link with people you want
                    to invite to ReMarket.
                  </p>
                </div>
              </div>

              {dashboard.referralCode ? (
                <>
                  <div className="mt-6">
                    <label
                      htmlFor="referralCode"
                      className="mb-2 block text-sm font-medium text-[#718096]"
                    >
                      Your referral code
                    </label>

                    <div className="flex items-center gap-3">
                      <div
                        id="referralCode"
                        className="min-w-0 flex-1 break-all rounded-xl border border-[#D9DEE5] bg-[#FCFAF6] px-4 py-3 font-mono text-base font-semibold tracking-wide"
                      >
                        {dashboard.referralCode}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(
                              dashboard.referralCode
                            )
                            .then(() => {
                              setCopyMessage(
                                "Referral code copied!"
                              );
                            })
                            .catch(() => {
                              setCopyMessage(
                                "Unable to copy automatically."
                              );
                            });
                        }}
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#D9DEE5] text-[#718096] transition-colors hover:bg-[#FCFAF6] hover:text-[#FF563F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF563F]"
                        aria-label="Copy referral code"
                        title="Copy referral code"
                      >
                        <Copy
                          aria-hidden="true"
                          className="h-5 w-5"
                        />
                      </button>
                    </div>
                  </div>

                  {referralLink ? (
                    <div className="mt-5">
                      <label
                        htmlFor="referralLink"
                        className="mb-2 block text-sm font-medium text-[#718096]"
                      >
                        Signup link
                      </label>

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <input
                          id="referralLink"
                          readOnly
                          value={referralLink}
                          onFocus={(event) =>
                            event.currentTarget.select()
                          }
                          className="h-12 min-w-0 flex-1 rounded-xl border border-[#D9DEE5] bg-[#FCFAF6] px-4 text-sm text-[#536273] outline-none focus:border-[#FF694F] focus:ring-4 focus:ring-[#FF694F]/10"
                        />

                        <button
                          type="button"
                          onClick={() => {
                            void copyReferralLink();
                          }}
                          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#FF563F] px-5 font-semibold text-white transition-colors hover:bg-[#F44D37] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF563F]/30"
                        >
                          <Copy
                            aria-hidden="true"
                            className="h-4 w-4"
                          />
                          Copy link
                        </button>
                      </div>

                      {whatsappLink && (
                        <a
                          href={whatsappLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-flex items-center gap-2 rounded-xl border border-[#D9DEE5] px-4 py-3 text-sm font-semibold transition-colors hover:bg-[#FCFAF6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF563F]"
                        >
                          <Share2
                            aria-hidden="true"
                            className="h-4 w-4 text-[#FF563F]"
                          />
                          Share on WhatsApp
                          <ArrowRight
                            aria-hidden="true"
                            className="h-4 w-4"
                          />
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm leading-6 text-[#718096]">
                      Your account type could not be
                      confirmed, so a signup link could
                      not be generated. Refresh after
                      signing in again.
                    </p>
                  )}

                  {copyMessage && (
                    <p
                      role="status"
                      aria-live="polite"
                      className="mt-3 text-sm text-[#197449]"
                    >
                      {copyMessage}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-5 text-sm leading-6 text-[#718096]">
                  No referral code was returned by the
                  referral API. Check that the dashboard
                  service is returning the generated code.
                </p>
              )}
            </section>

            {/* REFERRAL STATS */}

            <section className="mt-6">
              <h2 className="mb-4 text-lg font-semibold">
                Referral progress
              </h2>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                <div className="rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FFF0DC] text-[#FF563F]">
                    <Users
                      aria-hidden="true"
                      className="h-5 w-5"
                    />
                  </div>

                  <p className="mt-4 text-2xl font-semibold tabular-nums">
                    {dashboard.totalReferrals}
                  </p>

                  <p className="mt-1 text-sm text-[#718096]">
                    Total referrals
                  </p>
                </div>

                <div className="rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FFF5E7] text-[#98631C]">
                    <Clock3
                      aria-hidden="true"
                      className="h-5 w-5"
                    />
                  </div>

                  <p className="mt-4 text-2xl font-semibold tabular-nums">
                    {dashboard.pendingReferrals}
                  </p>

                  <p className="mt-1 text-sm text-[#718096]">
                    Pending
                  </p>
                </div>

                <div className="rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#EAF8EF] text-[#197449]">
                    <CheckCircle2
                      aria-hidden="true"
                      className="h-5 w-5"
                    />
                  </div>

                  <p className="mt-4 text-2xl font-semibold tabular-nums">
                    {dashboard.qualifiedReferrals}
                  </p>

                  <p className="mt-1 text-sm text-[#718096]">
                    Qualified
                  </p>
                </div>

                <div className="rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FFF0EE] text-[#C33C2A]">
                    <CircleAlert
                      aria-hidden="true"
                      className="h-5 w-5"
                    />
                  </div>

                  <p className="mt-4 text-2xl font-semibold tabular-nums">
                    {dashboard.rejectedReferrals}
                  </p>

                  <p className="mt-1 text-sm text-[#718096]">
                    Rejected
                  </p>
                </div>
              </div>
            </section>

            {/* REWARDS */}

            <section className="mt-8">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFF0DC] text-[#FF563F]">
                  <Gift
                    aria-hidden="true"
                    className="h-5 w-5"
                  />
                </div>

                <div>
                  <h2 className="text-lg font-semibold">
                    Your rewards
                  </h2>

                  <p className="mt-1 text-sm text-[#718096]">
                    Rewards are shown here after they
                    have been recorded by ReMarket.
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white">
                {dashboard.rewards.length > 0 ? (
                  <div className="divide-y divide-[#EAE6DF]">
                    {dashboard.rewards.map((reward) => (
                      <div
                        key={reward.id}
                        className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FCFAF6] text-[#FF563F]">
                            <Gift
                              aria-hidden="true"
                              className="h-4 w-4"
                            />
                          </div>

                          <div>
                            <p className="font-semibold">
                              {rewardDescription(reward)}
                            </p>

                            <p className="mt-1 text-sm text-[#718096]">
                              Granted{" "}
                              {formatDate(reward.grantedAt)}
                            </p>
                          </div>
                        </div>

                        <span
                          className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                            reward.status
                          )}`}
                        >
                          {readableLabel(reward.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-5 py-8 text-center">
                    <Gift
                      aria-hidden="true"
                      className="mx-auto h-7 w-7 text-[#B1A79B]"
                    />

                    <p className="mt-3 font-semibold">
                      No rewards yet
                    </p>

                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#718096]">
                      Share your referral link. Any
                      rewards you qualify for will appear
                      here when they are granted.
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* REFERRAL HISTORY */}

            <section className="mt-8">
              <h2 className="mb-4 text-lg font-semibold">
                Referral history
              </h2>

              <div className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white">
                {dashboard.referrals.length > 0 ? (
                  <div className="divide-y divide-[#EAE6DF]">
                    {dashboard.referrals.map((referral) => (
                      <div
                        key={referral.id}
                        className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="font-semibold">
                            {readableLabel(referral.role)} referral
                          </p>

                          <p className="mt-1 text-sm text-[#718096]">
                            Joined{" "}
                            {formatDate(referral.createdAt)}
                          </p>

                          {referral.qualifiedAt && (
                            <p className="mt-1 text-sm text-[#718096]">
                              Qualified{" "}
                              {formatDate(referral.qualifiedAt)}
                            </p>
                          )}
                        </div>

                        <span
                          className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusClass(
                            referral.status
                          )}`}
                        >
                          {readableLabel(referral.status)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-5 py-8 text-center">
                    <Users
                      aria-hidden="true"
                      className="mx-auto h-7 w-7 text-[#B1A79B]"
                    />

                    <p className="mt-3 font-semibold">
                      No referrals yet
                    </p>

                    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#718096]">
                      Share your referral link to start
                      building your referral history.
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* HOW REWARDS WORK */}

            <section className="mt-8 rounded-2xl border border-[#EAE6DF] bg-white p-5 sm:p-7">
              <h2 className="text-lg font-semibold">
                How referrals work
              </h2>

              {role === "SELLER" ? (
                <p className="mt-3 text-sm leading-7 text-[#718096]">
                  Refer another seller using your link.
                  Under the current referral rules, a
                  qualifying seller referral can grant
                  3 additional product slots. Rewards
                  depend on successful qualification and
                  a recorded grant.
                </p>
              ) : (
                <p className="mt-3 text-sm leading-7 text-[#718096]">
                  Invite other buyers to join ReMarket.
                  Under the current referral rules,
                  buyer rewards are tied to qualifying
                  buyer referrals in groups of three.
                  Check this dashboard for rewards
                  actually recorded for your account.
                </p>
              )}

              <p className="mt-3 text-xs leading-5 text-[#8491A3]">
                Creating an account does not automatically
                mean a referral has qualified. Eligibility
                is determined by ReMarket's referral rules.
              </p>
            </section>
          </>
        ) : (
          <section className="rounded-2xl border border-[#EAE6DF] bg-white p-6">
            <p className="text-sm text-[#718096]">
              No referral dashboard data is available.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
