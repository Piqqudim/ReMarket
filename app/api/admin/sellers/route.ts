import { Role, UserAccountStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 100_000;
const MAX_SEARCH_LENGTH = 200;
const VALID_STATUSES = ["ALL", UserAccountStatus.ACTIVE, UserAccountStatus.SUSPENDED] as const;
type SellerStatusFilter = (typeof VALID_STATUSES)[number];

const noStore = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status, headers: noStore });
}

function parsePositiveInteger(value: string | null, fallback: number, maximum: number): number | null {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : null;
}

function isSellerStatusFilter(value: string): value is SellerStatusFilter {
  return VALID_STATUSES.some((status) => status === value);
}

/** GET /api/admin/sellers?page=1&pageSize=25&q=search&status=ALL|ACTIVE|SUSPENDED */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) {
    auth.response.headers.set("Cache-Control", noStore["Cache-Control"]);
    auth.response.headers.set("Pragma", noStore.Pragma);
    auth.response.headers.set("Expires", "0");
    return auth.response;
  }

  try {
    const params = request.nextUrl.searchParams;
    const page = parsePositiveInteger(params.get("page"), 1, MAX_PAGE);
    const pageSize = parsePositiveInteger(params.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const search = (params.get("q") ?? "").trim();
    const rawStatus = (params.get("status") ?? "ALL").trim().toUpperCase();

    if (page === null || pageSize === null) {
      return jsonError("Invalid pagination. Page must be positive and pageSize must be between 1 and 100.", 400);
    }
    if (search.length > MAX_SEARCH_LENGTH) {
      return jsonError(`Search must not exceed ${MAX_SEARCH_LENGTH} characters.`, 400);
    }
    if (!isSellerStatusFilter(rawStatus)) {
      return jsonError("Status must be ALL, ACTIVE or SUSPENDED.", 400);
    }

    const skip = (page - 1) * pageSize;
    if (!Number.isSafeInteger(skip)) return jsonError("The requested page is too large.", 400);

    const where = {
      role: Role.SELLER,
      ...(rawStatus !== "ALL" ? { accountStatus: rawStatus } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
              { business: { is: { name: { contains: search, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    };

    const [sellers, total, activeCount, suspendedCount] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          accountStatus: true,
          suspendedAt: true,
          createdAt: true,
          _count: { select: { sellerOrders: true } },
          business: {
            select: {
              id: true,
              name: true,
              status: true,
              verification: true,
              deletedAt: true,
              location: { select: { area: true } },
            },
          },
        },
      }),
      prisma.user.count({ where }),
      prisma.user.count({ where: { role: Role.SELLER, accountStatus: UserAccountStatus.ACTIVE } }),
      prisma.user.count({ where: { role: Role.SELLER, accountStatus: UserAccountStatus.SUSPENDED } }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    return NextResponse.json({
      success: true,
      sellers: sellers.map(({ _count, business, ...seller }) => ({
        ...seller,
        sellerOrderCount: _count.sellerOrders,
        business: business
          ? {
              id: business.id,
              name: business.name,
              status: business.status,
              verification: business.verification,
              deletedAt: business.deletedAt,
              area: business.location?.area ?? null,
            }
          : null,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasPreviousPage: page > 1,
        hasNextPage: page < totalPages,
      },
      counts: {
        total: activeCount + suspendedCount,
        active: activeCount,
        suspended: suspendedCount,
      },
      filters: { q: search, status: rawStatus },
      generatedAt: new Date().toISOString(),
    }, { status: 200, headers: noStore });
  } catch (error) {
    console.error("Admin sellers GET error:", error);
    return jsonError("Unable to load sellers.", 500);
  }
}
