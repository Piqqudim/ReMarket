import { NextRequest, NextResponse } from "next/server";
import { NotificationChannel, NotificationDeliveryStatus } from "@prisma/client";
import { requireAdmin } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store, max-age=0, must-revalidate" };
function reply(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: noStore }); }

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return reply({ error: "Forbidden." }, auth.response.status);
  try {
    const params = request.nextUrl.searchParams;
    const channelValue = params.get("channel")?.toUpperCase() ?? "ALL";
    const statusValue = params.get("status")?.toUpperCase() ?? "ALL";
    const pageRaw = Number(params.get("page") ?? 1);
    const page = Number.isSafeInteger(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 100_000) : 1;
   const allowedChannels: NotificationChannel[] = [
  NotificationChannel.EMAIL,
  NotificationChannel.PUSH,
];
    const allowedStatuses = Object.values(NotificationDeliveryStatus);
    if (channelValue !== "ALL" && !allowedChannels.includes(channelValue as NotificationChannel)) return reply({ error: "Invalid channel filter." }, 400);
    if (statusValue !== "ALL" && !allowedStatuses.includes(statusValue as NotificationDeliveryStatus)) return reply({ error: "Invalid delivery status filter." }, 400);
    const where = {
      ...(channelValue === "ALL" ? { channel: { in: allowedChannels } } : { channel: channelValue as NotificationChannel }),
      ...(statusValue === "ALL" ? {} : { status: statusValue as NotificationDeliveryStatus }),
    };
    const [deliveries, total, queued, failed, processing] = await Promise.all([
      prisma.notificationDelivery.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * 40,
        take: 40,
        select: {
          id: true, channel: true, status: true, attemptCount: true, nextAttemptAt: true,
          lastAttemptAt: true, sentAt: true, failedAt: true, providerMessageId: true, error: true, createdAt: true,
          notification: { select: { type: true, title: true, user: { select: { id: true, name: true } } } },
          attempts: { orderBy: { attemptNumber: "desc" }, take: 3, select: { attemptNumber: true, status: true, error: true, createdAt: true, providerMessageId: true } },
        },
      }),
      prisma.notificationDelivery.count({ where }),
      prisma.notificationDelivery.count({ where: { channel: { in: [NotificationChannel.EMAIL, NotificationChannel.PUSH] }, status: NotificationDeliveryStatus.PENDING } }),
      prisma.notificationDelivery.count({ where: { channel: { in: [NotificationChannel.EMAIL, NotificationChannel.PUSH] }, status: NotificationDeliveryStatus.FAILED } }),
      prisma.notificationDelivery.count({ where: { channel: { in: [NotificationChannel.EMAIL, NotificationChannel.PUSH] }, status: NotificationDeliveryStatus.PROCESSING } }),
    ]);
    return reply({ deliveries, total, page, pageSize: 40, totalPages: Math.ceil(total / 40), summary: { queued, failed, processing } });
  } catch (error) {
    console.error("ADMIN_NOTIFICATION_DELIVERIES_GET_ERROR:", error);
    return reply({ error: "Unable to load notification delivery history." }, 500);
  }
}
