
import { randomBytes } from "node:crypto";

import {
  BusinessStatus,
  Prisma,
  ReferralRewardStatus,
  ReferralRewardType,
  ReferralStatus,
  Role,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * ReMarket referral rules.
 *
 * These are initial pilot defaults. Keep reward
 * quantities centralized so they can be configured
 * later without scattering constants across routes.
 */
export const REFERRAL_RULES = {
  CODE_LENGTH_BYTES: 8,
  CODE_GENERATION_ATTEMPTS: 8,
  QUALIFICATION_RETRIES: 3,

  PRODUCT_SLOTS_PER_QUALIFIED_MERCHANT: 3,
  BUYER_REFERRALS_PER_MILESTONE: 3,
  MIN_DISTINCT_BUYER_BUSINESS_VIEWS: 3,
  MIN_ACTIVE_PRODUCTS_FOR_MERCHANT_QUALIFICATION: 1,

  REFERRAL_HISTORY_LIMIT: 100,
  REWARD_HISTORY_LIMIT: 100,
} as const;

export type ReferralServiceErrorCode =
  | "INVALID_REFERRAL_CODE"
  | "REFERRER_NOT_ALLOWED"
  | "ACCOUNT_NOT_FOUND"
  | "ADMIN_CANNOT_REFER"
  | "ALREADY_REFERRED"
  | "REFERRAL_CODE_GENERATION_FAILED";

export class ReferralServiceError extends Error {
  readonly code: ReferralServiceErrorCode;

  constructor(
    code: ReferralServiceErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ReferralServiceError";
    this.code = code;
  }
}
type ReferralEligibleRole = Extract<
  Role,
  "BUYER" | "SELLER"
>;
function isPrismaErrorCode(
  error: unknown,
  code: string
): boolean {
  return (
    error instanceof
      Prisma.PrismaClientKnownRequestError &&
    error.code === code
  );
}

/**
 * Normalize a referral code received from a signup form.
 *
 * Generated codes contain uppercase hexadecimal characters.
 * The wider allowed alphabet supports future code formats.
 */
export function normalizeReferralCode(
  value: unknown
): string | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (typeof value !== "string") {
    throw new ReferralServiceError(
      "INVALID_REFERRAL_CODE",
      "Invalid referral code."
    );
  }

  const code = value
    .trim()
    .toUpperCase();

  if (!code) {
    return null;
  }

  if (
    code.length < 6 ||
    code.length > 32 ||
    !/^[A-Z0-9]+$/.test(code)
  ) {
    throw new ReferralServiceError(
      "INVALID_REFERRAL_CODE",
      "Invalid referral code."
    );
  }

  return code;
}

/**
 * Generate a cryptographically random referral code.
 *
 * Eight random bytes provide a 16-character hexadecimal
 * code. Database uniqueness is still enforced by Prisma.
 */
function generateReferralCode(): string {
  return randomBytes(
    REFERRAL_RULES.CODE_LENGTH_BYTES
  )
    .toString("hex")
    .toUpperCase();
}

/**
 * Ensure a BUYER or SELLER has a referral code.
 *
 * Safe to call repeatedly. If simultaneous dashboard
 * requests try to create a code, the unique constraint
 * and conditional update prevent overwriting an existing
 * code. Collisions are retried.
 */
export async function getOrCreateReferralCode(
  userId: string
): Promise<string> {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      role: true,
      referralCode: true,
    },
  });

  if (!user) {
    throw new ReferralServiceError(
      "ACCOUNT_NOT_FOUND",
      "Your account could not be found."
    );
  }

  if (user.role === Role.ADMIN) {
    throw new ReferralServiceError(
      "ADMIN_CANNOT_REFER",
      "Administrator accounts cannot participate in referrals."
    );
  }

  if (user.referralCode) {
    return user.referralCode;
  }

  for (
    let attempt = 0;
    attempt <
      REFERRAL_RULES.CODE_GENERATION_ATTEMPTS;
    attempt += 1
  ) {
    const candidate =
      generateReferralCode();

    try {
      const result =
        await prisma.user.updateMany({
          where: {
            id: userId,
            referralCode: null,
          },
          data: {
            referralCode: candidate,
          },
        });

      if (result.count === 1) {
        return candidate;
      }
    } catch (error) {
      // A generated code collided with another account.
      if (!isPrismaErrorCode(error, "P2002")) {
        throw error;
      }
    }

    // Another request may have generated this user's code.
    const refreshed =
      await prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          referralCode: true,
          role: true,
        },
      });

    if (!refreshed) {
      throw new ReferralServiceError(
        "ACCOUNT_NOT_FOUND",
        "Your account could not be found."
      );
    }

    if (refreshed.role === Role.ADMIN) {
      throw new ReferralServiceError(
        "ADMIN_CANNOT_REFER",
        "Administrator accounts cannot participate in referrals."
      );
    }

    if (refreshed.referralCode) {
      return refreshed.referralCode;
    }
  }

  throw new ReferralServiceError(
    "REFERRAL_CODE_GENERATION_FAILED",
    "Unable to generate a referral code. Please try again."
  );
}

/**
 * Record referral attribution during signup.
 *
 * IMPORTANT:
 * Call this function inside the same Prisma transaction
 * that creates the referred user. If validation fails,
 * the signup transaction must roll back.
 *
 * Example:
 *
 * await prisma.$transaction(async (tx) => {
 *   const user = await tx.user.create({ data: ... });
 *
 *   await attachReferralAtSignup(
 *     tx,
 *     referralCode,
 *     { id: user.id, role: user.role }
 *   );
 *
 *   return user;
 * });
 */
export async function attachReferralAtSignup(
  tx: Prisma.TransactionClient,
  rawReferralCode: unknown,
  referredUser: {
    id: string;
    role: Role;
  }
): Promise<void> {
  const referralCode =
    normalizeReferralCode(
      rawReferralCode
    );

  // Referral codes are optional.
  if (!referralCode) {
    return;
  }

  if (
    referredUser.role === Role.ADMIN
  ) {
    throw new ReferralServiceError(
      "ADMIN_CANNOT_REFER",
      "Administrator accounts cannot participate in referrals."
    );
  }

  const referrer =
    await tx.user.findUnique({
      where: {
        referralCode,
      },
      select: {
        id: true,
        role: true,
      },
    });

  if (!referrer) {
    throw new ReferralServiceError(
      "INVALID_REFERRAL_CODE",
      "This referral code is invalid. Check the code and try again."
    );
  }

  if (referrer.id === referredUser.id) {
    throw new ReferralServiceError(
      "REFERRER_NOT_ALLOWED",
      "You cannot refer your own account."
    );
  }

  if (
    referrer.role === Role.ADMIN
  ) {
    throw new ReferralServiceError(
      "REFERRER_NOT_ALLOWED",
      "This account cannot refer new users."
    );
  }

  const existingReferral =
    await tx.referral.findUnique({
      where: {
        referredUserId:
          referredUser.id,
      },
      select: {
        id: true,
      },
    });

  if (existingReferral) {
    throw new ReferralServiceError(
      "ALREADY_REFERRED",
      "This account already has referral attribution."
    );
  }

  await tx.referral.create({
    data: {
      referrerId: referrer.id,
      referredUserId: referredUser.id,
      referrerRole: referrer.role,
      referredRole: referredUser.role,
      status: ReferralStatus.PENDING,
    },
  });
}

/**
 * Check if a seller referral has met the qualification rules.
 *
 * Requirements:
 * - The referred user still has SELLER role.
 * - The seller owns a business.
 * - That business is active and not soft-deleted.
 * - The business has at least one active, non-deleted product.
 */
async function sellerMeetsQualification(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<boolean> {
  const business =
    await tx.business.findFirst({
      where: {
        ownerId: userId,
        status: BusinessStatus.ACTIVE,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

  if (!business) {
    return false;
  }

  const activeProductCount =
    await tx.product.count({
      where: {
        businessId: business.id,
        status: BusinessStatus.ACTIVE,
        deletedAt: null,
      },
    });

  return (
    activeProductCount >=
    REFERRAL_RULES.MIN_ACTIVE_PRODUCTS_FOR_MERCHANT_QUALIFICATION
  );
}

/**
 * Check if a buyer referral has met the qualification rules.
 *
 * Counts distinct active, non-deleted businesses viewed
 * while the buyer is authenticated.
 *
 * The event API must set BusinessViewEvent.userId from
 * the verified server session, not request-body input.
 */
async function buyerMeetsQualification(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<boolean> {
  const distinctViews =
    await tx.businessViewEvent.findMany({
      where: {
        userId,
        business: {
          is: {
            status: BusinessStatus.ACTIVE,
            deletedAt: null,
          },
        },
      },
      select: {
        businessId: true,
      },
      distinct: ["businessId"],
      take:
        REFERRAL_RULES.MIN_DISTINCT_BUYER_BUSINESS_VIEWS,
    });

  return (
    distinctViews.length >=
    REFERRAL_RULES.MIN_DISTINCT_BUYER_BUSINESS_VIEWS
  );
}

/**
 * Reward a referring seller with additional product slots.
 *
 * The reward ledger is the source of truth. Never accept
 * a bonus quantity from the client.
 */
async function grantMerchantProductSlots(
  tx: Prisma.TransactionClient,
  input: {
    referralId: string;
    referrerId: string;
  }
): Promise<void> {
  await tx.referralReward.createMany({
    data: [
      {
        userId: input.referrerId,
        referralId: input.referralId,
        type: ReferralRewardType.PRODUCT_SLOTS,
        status: ReferralRewardStatus.GRANTED,
        quantity:
          REFERRAL_RULES.PRODUCT_SLOTS_PER_QUALIFIED_MERCHANT,
        milestone: null,
        rewardKey:
          `referral:${input.referralId}:PRODUCT_SLOTS`,
      },
    ],
    skipDuplicates: true,
  });
}

/**
 * Award non-cash buyer milestones.
 *
 * For the pilot, one benefit is unlocked at each third
 * qualifying buyer-to-buyer referral: 3, 6, 9, and so on.
 *
 * The exact benefit (such as a badge or feature early access)
 * should be implemented by the appropriate buyer-facing
 * feature, rather than pretending this ledger alone activates
 * functionality that does not exist yet.
 */
async function grantBuyerMilestoneIfReached(
  tx: Prisma.TransactionClient,
  input: {
    referralId: string;
    referrerId: string;
  }
): Promise<void> {
  const qualifiedBuyerReferrals =
    await tx.referral.count({
      where: {
        referrerId: input.referrerId,
        referrerRole: Role.BUYER,
        referredRole: Role.BUYER,
        status: ReferralStatus.QUALIFIED,
      },
    });

  const milestoneInterval =
    REFERRAL_RULES.BUYER_REFERRALS_PER_MILESTONE;

  if (
    qualifiedBuyerReferrals === 0 ||
    qualifiedBuyerReferrals %
      milestoneInterval !==
      0
  ) {
    return;
  }

  await tx.referralReward.createMany({
    data: [
      {
        userId: input.referrerId,
        referralId: input.referralId,
        type: ReferralRewardType.BUYER_MILESTONE,
        status: ReferralRewardStatus.GRANTED,
        quantity: 1,
        milestone: qualifiedBuyerReferrals,
        rewardKey:
          `user:${input.referrerId}:BUYER_MILESTONE:${qualifiedBuyerReferrals}`,
      },
    ],
    skipDuplicates: true,
  });
}

/**
 * Qualify a referral once its referred user completes
 * the corresponding verified action.
 *
 * Call with:
 * - Role.SELLER after business/product creation or relevant
 *   business approval/status changes.
 * - Role.BUYER after an authenticated business-view event.
 *
 * Returns true only when this call changes the referral
 * from PENDING to QUALIFIED. Repeated calls are harmless.
 *
 * Rewards are intentionally role-specific:
 * - SELLER referring a qualified SELLER earns product slots.
 * - BUYER referring a qualified BUYER progresses buyer milestones.
 *
 * Cross-role referrals can be tracked, but do not earn a
 * role-inappropriate reward under these initial rules.
 */
export async function qualifyReferralForUser(
  referredUserId: string,
  expectedRole: ReferralEligibleRole
): Promise<boolean> {
  for (
    let attempt = 0;
    attempt <
      REFERRAL_RULES.QUALIFICATION_RETRIES;
    attempt += 1
  ) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const referral =
            await tx.referral.findUnique({
              where: {
                referredUserId,
              },
              select: {
                id: true,
                referrerId: true,
                referrerRole: true,
                referredRole: true,
                status: true,

                referrer: {
                  select: {
                    role: true,
                  },
                },

                referredUser: {
                  select: {
                    id: true,
                    role: true,
                  },
                },
              },
            });

          if (
            !referral ||
            referral.status !==
              ReferralStatus.PENDING
          ) {
            return false;
          }

          if (
            referral.referredRole !== expectedRole ||
            referral.referredUser.role !== expectedRole
          ) {
            return false;
          }

          /*
           * Do not grant rewards if the referrer's current
           * role no longer agrees with the recorded role.
           */
          if (
            referral.referrer.role === Role.ADMIN ||
            referral.referrer.role !==
              referral.referrerRole
          ) {
            return false;
          }

          let qualified = false;

          if (
            expectedRole === Role.SELLER
          ) {
            qualified =
              await sellerMeetsQualification(
                tx,
                referredUserId
              );
          } else {
            qualified =
              await buyerMeetsQualification(
                tx,
                referredUserId
              );
          }

          if (!qualified) {
            return false;
          }

          /*
           * Compare-and-set transition. This prevents another
           * request from qualifying the same referral twice.
           */
          const updateResult =
            await tx.referral.updateMany({
              where: {
                id: referral.id,
                status: ReferralStatus.PENDING,
              },
              data: {
                status: ReferralStatus.QUALIFIED,
                qualifiedAt: new Date(),
                rejectedAt: null,
                rejectionReason: null,
              },
            });

          if (updateResult.count !== 1) {
            return false;
          }

          /*
           * Qualification and reward creation are performed
           * in one transaction. A failed reward write rolls
           * back the referral status change.
           */
          if (
            referral.referrerRole === Role.SELLER &&
            referral.referredRole === Role.SELLER
          ) {
            await grantMerchantProductSlots(
              tx,
              {
                referralId: referral.id,
                referrerId: referral.referrerId,
              }
            );
          }

          if (
            referral.referrerRole === Role.BUYER &&
            referral.referredRole === Role.BUYER
          ) {
            await grantBuyerMilestoneIfReached(
              tx,
              {
                referralId: referral.id,
                referrerId: referral.referrerId,
              }
            );
          }

          return true;
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        }
      );
    } catch (error) {
      /*
       * Concurrent qualifying requests may cause a
       * serializable transaction conflict. Retry only
       * Prisma's transaction-conflict error.
       */
      if (
        isPrismaErrorCode(error, "P2034") &&
        attempt <
          REFERRAL_RULES.QUALIFICATION_RETRIES - 1
      ) {
        continue;
      }

      throw error;
    }
  }

  return false;
}

/**
 * Return the total number of granted bonus product slots.
 *
 * Integrate this into the existing server-side seller
 * product-capacity calculation. Keep the base plan limit
 * unchanged and add this total to it.
 */
export async function getGrantedProductSlotBonus(
  userId: string,
  tx?: Prisma.TransactionClient
): Promise<number> {
  const client = tx ?? prisma;

  const result =
    await client.referralReward.aggregate({
      where: {
        userId,
        type: ReferralRewardType.PRODUCT_SLOTS,
        status: ReferralRewardStatus.GRANTED,
      },
      _sum: {
        quantity: true,
      },
    });

  return Math.max(
    0,
    result._sum.quantity ?? 0
  );
}

/**
 * Return referral dashboard data without exposing
 * referred users' email addresses or password data.
 */
export async function getReferralDashboardSummary(
  userId: string
) {
  const user =
    await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        role: true,
      },
    });

  if (!user) {
    throw new ReferralServiceError(
      "ACCOUNT_NOT_FOUND",
      "Your account could not be found."
    );
  }

  if (user.role === Role.ADMIN) {
    throw new ReferralServiceError(
      "ADMIN_CANNOT_REFER",
      "Administrator accounts cannot participate in referrals."
    );
  }

  const referralCode =
    await getOrCreateReferralCode(userId);

  const [
    totalReferrals,
    pendingReferrals,
    qualifiedReferrals,
    rejectedReferrals,
    qualifiedBuyerReferrals,
    referrals,
    rewards,
    productSlotBonus,
  ] = await Promise.all([
    prisma.referral.count({
      where: {
        referrerId: userId,
      },
    }),

    prisma.referral.count({
      where: {
        referrerId: userId,
        status: ReferralStatus.PENDING,
      },
    }),

    prisma.referral.count({
      where: {
        referrerId: userId,
        status: ReferralStatus.QUALIFIED,
      },
    }),

    prisma.referral.count({
      where: {
        referrerId: userId,
        status: ReferralStatus.REJECTED,
      },
    }),

    prisma.referral.count({
      where: {
        referrerId: userId,
        referrerRole: Role.BUYER,
        referredRole: Role.BUYER,
        status: ReferralStatus.QUALIFIED,
      },
    }),

    prisma.referral.findMany({
      where: {
        referrerId: userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take:
        REFERRAL_RULES.REFERRAL_HISTORY_LIMIT,
      select: {
        id: true,
        referredRole: true,
        status: true,
        createdAt: true,
        qualifiedAt: true,
        rejectedAt: true,
        rejectionReason: true,
        referredUser: {
          select: {
            name: true,
            role: true,
            createdAt: true,
          },
        },
      },
    }),

    prisma.referralReward.findMany({
      where: {
        userId,
      },
      orderBy: {
        grantedAt: "desc",
      },
      take:
        REFERRAL_RULES.REWARD_HISTORY_LIMIT,
      select: {
        id: true,
        type: true,
        status: true,
        quantity: true,
        milestone: true,
        grantedAt: true,
      },
    }),

    getGrantedProductSlotBonus(userId),
  ]);

  const milestoneInterval =
    REFERRAL_RULES.BUYER_REFERRALS_PER_MILESTONE;

  const buyerMilestoneProgress =
    qualifiedBuyerReferrals %
    milestoneInterval;

  return {
    referralCode,

    stats: {
      totalReferrals,
      pendingReferrals,
      qualifiedReferrals,
      rejectedReferrals,

      qualifiedBuyerReferrals,

      buyerMilestoneProgress,

      buyerMilestoneTarget:
        milestoneInterval,

      buyerReferralsToNextMilestone:
        user.role === Role.BUYER
          ? milestoneInterval -
            buyerMilestoneProgress
          : null,

      bonusProductSlots:
        productSlotBonus,
    },

   referrals: referrals.map((referral) => ({
  id: referral.id,
  status: referral.status,
  referredRole: referral.referredRole,
  referredName: referral.referredUser.name,
  referredUserRole: referral.referredUser.role,
  createdAt: referral.createdAt,
  referredAt: referral.createdAt,
  qualifiedAt: referral.qualifiedAt,
  rejectedAt: referral.rejectedAt,
  rejectionReason: referral.rejectionReason,
})),

    rewards: rewards.map((reward) => ({
      id: reward.id,
      type: reward.type,
      status: reward.status,
      quantity: reward.quantity,
      milestone: reward.milestone,
      grantedAt: reward.grantedAt,
    })),
  };
}
