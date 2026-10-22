"use client";

import {
  Bell,
  Check,
  CheckCheck,
  ChevronRight,
  LoaderCircle,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

type NotificationPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
type NotificationType =
  | "REQUEST_CREATED"
  | "REQUEST_MATCHED"
  | "REQUEST_RESPONDED"
  | "REQUEST_UPDATED"
  | "REQUEST_FULFILLED"
  | "REQUEST_CLOSED"
  | "REQUEST_UNFULFILLED"
  | "BUSINESS_APPROVED"
  | "BUSINESS_REJECTED"
  | "BUSINESS_UPDATED"
  | "BUSINESS_VERIFIED"
  | "BUSINESS_DEACTIVATED"
  | "BUSINESS_DELETION_REQUESTED"
  | "BUSINESS_DELETION_APPROVED"
  | "BUSINESS_DELETION_REJECTED"
  | "BUSINESS_REPORTED"
  | "CLAIM_SUBMITTED"
  | "CLAIM_APPROVED"
  | "CLAIM_REJECTED"
  | "PRODUCT_ADDED"
  | "PRODUCT_UPDATED"
  | "PRODUCT_REMOVED"
  | "PRODUCT_AVAILABILITY_CHANGED"
  | "REVIEW_RECEIVED"
  | "REVIEW_REPLIED"
  | "REVIEW_REPORTED"
  | "REVIEW_REMOVED"
  | "PAYMENT_SUCCESS"
  | "PAYMENT_FAILED"
  | "PREMIUM_ACTIVATED"
  | "PREMIUM_EXPIRING"
  | "PREMIUM_EXPIRED"
  | "SECURITY_ALERT"
  | "SYSTEM_ANNOUNCEMENT";

type NotificationData = {
  href?: unknown;
  businessId?: unknown;
  productId?: unknown;
  reviewId?: unknown;
  requestId?: unknown;
  claimId?: unknown;
  deletionRequestId?: unknown;
};

type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  data: NotificationData | null;
  readAt: string | null;
  announcementId: string | null;
  createdAt: string;
};

type NotificationsResponse = {
  notifications: Notification[];
  unreadCount: number;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

function formatNotificationTime(value: string): string {
  const createdAt = new Date(value);
  if (Number.isNaN(createdAt.getTime())) return "";

  const now = new Date();
  const difference = Math.max(0, now.getTime() - createdAt.getTime());
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (difference < minute) return "Just now";
  if (difference < hour) return `${Math.floor(difference / minute)}m ago`;
  if (difference < day) return `${Math.floor(difference / hour)}h ago`;
  if (difference < 7 * day) return `${Math.floor(difference / day)}d ago`;

  return createdAt.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: createdAt.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

function getNotificationHref(notification: Notification): string | null {
  const data = notification.data;

  // A producer-supplied internal URL takes priority. Reject external/protocol-relative URLs.
  if (
    data &&
    typeof data.href === "string" &&
    data.href.startsWith("/") &&
    !data.href.startsWith("//")
  ) {
    return data.href;
  }

  if (notification.type === "CLAIM_SUBMITTED") return "/admin/claims";
  if (notification.type === "BUSINESS_DELETION_REQUESTED") return "/admin/business-deletion-requests";
  if (notification.type === "REQUEST_CREATED") return "/admin/requests";

  if (notification.type === "BUSINESS_UPDATED") {
    const id = data?.businessId;
    return typeof id === "string" && id.trim()
      ? `/admin/businesses/${encodeURIComponent(id.trim())}`
      : "/admin/businesses";
  }

  if (
    notification.type === "PRODUCT_ADDED" ||
    notification.type === "PRODUCT_UPDATED" ||
    notification.type === "PRODUCT_REMOVED" ||
    notification.type === "PRODUCT_AVAILABILITY_CHANGED"
  ) {
    const id = data?.productId;
    return typeof id === "string" && id.trim()
      ? `/admin/products/${encodeURIComponent(id.trim())}`
      : "/admin/products";
  }

  if (notification.type === "CLAIM_APPROVED" || notification.type === "CLAIM_REJECTED") {
    const id = data?.businessId;
    if (typeof id === "string" && id.trim()) return `/seller/${encodeURIComponent(id.trim())}`;
  }

  const businessId = data?.businessId;
  if (typeof businessId === "string" && businessId.trim()) {
    return `/business/${encodeURIComponent(businessId.trim())}`;
  }

  const requestId = data?.requestId;
  if (typeof requestId === "string" && requestId.trim()) {
    return `/my-requests?request=${encodeURIComponent(requestId.trim())}`;
  }

  return null;
}

function getPriorityClasses(priority: NotificationPriority): string {
  if (priority === "CRITICAL") return "border-l-2 border-l-red-500";
  if (priority === "HIGH") return "border-l-2 border-l-[#FF5A36]";
  return "";
}

function getPriorityBadgeClasses(priority: NotificationPriority): string {
  if (priority === "CRITICAL") return "bg-[#FFE5E1] text-[#B53624]";
  if (priority === "HIGH") return "bg-[#FFF0EB] text-[#9F2D18]";
  return "bg-[#F7F3EE] text-gray-500";
}

export default function NotificationBell() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const desktopPanelRef = useRef<HTMLDivElement | null>(null);
  const mobileDialogRef = useRef<HTMLDivElement | null>(null);

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [authenticated, setAuthenticated] = useState(true);
  const [error, setError] = useState("");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [markingAll, setMarkingAll] = useState(false);

  useEffect(() => setMounted(true), []);

  const loadNotifications = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/notifications?limit=20", {
        method: "GET",
        cache: "no-store",
      });

      if (response.status === 401) {
        setAuthenticated(false);
        setNotifications([]);
        setUnreadCount(0);
        return;
      }

      if (!response.ok) throw new Error("Unable to load notifications.");

      const data = (await response.json()) as Partial<NotificationsResponse>;
      if (!Array.isArray(data.notifications)) {
        throw new Error("Invalid notification response.");
      }

      setAuthenticated(true);
      setNotifications(data.notifications as Notification[]);
      setUnreadCount(typeof data.unreadCount === "number" ? data.unreadCount : 0);
    } catch (loadError) {
      console.error("Notification load error:", loadError);
      setError("Unable to load notifications. Please try again.");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications(true);
  }, [loadNotifications]);

  useEffect(() => {
    if (!authenticated) return;
    const interval = window.setInterval(() => void loadNotifications(false), 30_000);
    return () => window.clearInterval(interval);
  }, [authenticated, loadNotifications]);

  useEffect(() => {
    if (!authenticated) return;
    const handleFocus = () => void loadNotifications(false);
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [authenticated, loadNotifications]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    // Use pointerdown and recognise the portalled panels, not only the bell wrapper.
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (containerRef.current?.contains(target)) return;
      if (desktopPanelRef.current?.contains(target)) return;
      if (mobileDialogRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  async function markAsRead(notificationId: string): Promise<boolean> {
    if (actionLoadingId || markingAll) return false;
    setActionLoadingId(notificationId);

    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "MARK_ONE", notificationId }),
      });

      if (response.status === 401) {
        setAuthenticated(false);
        return false;
      }
      if (!response.ok) throw new Error("Unable to mark notification as read.");

      setNotifications((current) =>
        current.map((notification) =>
          notification.id === notificationId
            ? { ...notification, readAt: new Date().toISOString() }
            : notification,
        ),
      );
      setUnreadCount((current) => Math.max(0, current - 1));
      return true;
    } catch (markError) {
      console.error("Mark notification read error:", markError);
      setError("Unable to update notification. Please try again.");
      return false;
    } finally {
      setActionLoadingId(null);
    }
  }

  async function markAllAsRead() {
    if (markingAll || unreadCount <= 0) return;
    setMarkingAll(true);
    setError("");

    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "MARK_ALL" }),
      });

      if (response.status === 401) {
        setAuthenticated(false);
        return;
      }
      if (!response.ok) throw new Error("Unable to mark all notifications as read.");

      const now = new Date().toISOString();
      setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? now })));
      setUnreadCount(0);
    } catch (markError) {
      console.error("Mark all notifications read error:", markError);
      setError("Unable to update notifications. Please try again.");
    } finally {
      setMarkingAll(false);
    }
  }

  async function handleNotificationClick(notification: Notification) {
    if (actionLoadingId || markingAll) return;

    if (notification.readAt === null) {
      const marked = await markAsRead(notification.id);
      if (!marked) return;
    }

    const href = getNotificationHref(notification);
    if (href) {
      setOpen(false);
      router.push(href);
    }
  }

  function closeNotifications() {
    if (actionLoadingId || markingAll) return;
    setOpen(false);
  }

  function renderNotificationItem(notification: Notification, mobile = false) {
    const unread = notification.readAt === null;
    const actionLoading = actionLoadingId === notification.id;

    return (
      <button
        key={notification.id}
        type="button"
        onClick={() => void handleNotificationClick(notification)}
        disabled={actionLoading || markingAll}
        className={`relative flex w-full min-w-0 items-start gap-3 border-b border-[#F0ECE7] text-left transition last:border-b-0 hover:bg-[#FFF9F4] disabled:cursor-wait ${
          mobile ? "px-4 py-4 sm:px-5" : "px-4 py-3.5"
        } ${getPriorityClasses(notification.priority)} ${unread ? "bg-[#FFF9F4]" : "bg-white"}`}
      >
        <span className="flex shrink-0 flex-col items-center pt-1.5">
          <span className={`${mobile ? "h-2.5 w-2.5" : "h-2 w-2"} rounded-full ${unread ? "bg-[#FF5A36]" : "bg-transparent"}`} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-start justify-between gap-3">
            <span className={`${mobile ? "text-[13px] leading-5" : "text-[11px] leading-4"} min-w-0 break-words ${unread ? "font-bold text-[#17202A]" : "font-semibold text-[#4E4843]"}`}>
              {notification.title || "ReMarket notification"}
            </span>
            <span className="shrink-0 whitespace-nowrap text-[9px] font-medium text-gray-400">
              {formatNotificationTime(notification.createdAt)}
            </span>
          </span>

          <span className={`${mobile ? "mt-1.5 text-[11px] leading-5" : "mt-1 text-[10px] leading-5"} block whitespace-normal break-words text-gray-500`}>
            {notification.message || "Open ReMarket to view this update."}
          </span>

          <span className="mt-3 flex items-center justify-between gap-3">
            <span className={`${mobile ? "px-2.5 py-1 text-[9px]" : "px-2 py-1 text-[8px]"} rounded-full font-bold uppercase tracking-wide ${getPriorityBadgeClasses(notification.priority)}`}>
              {notification.priority}
            </span>
            {actionLoading ? (
              <LoaderCircle className={`${mobile ? "h-4 w-4" : "h-3.5 w-3.5"} animate-spin text-[#FF5A36]`} />
            ) : (
              <ChevronRight className={`${mobile ? "h-4 w-4" : "h-3.5 w-3.5"} text-gray-300`} />
            )}
          </span>
        </span>
      </button>
    );
  }

  if (!authenticated) return null;

  const panel = open && mounted
    ? createPortal(
        <>
          {/* Desktop overlay sits below the panel and above the sticky header. */}
          <div
            className="fixed inset-0 z-[104] hidden lg:block"
            aria-hidden="true"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeNotifications();
            }}
          />

          {/* Desktop panel is portalled to body so ancestor button styles and header stacking cannot distort it. */}
          <div
            ref={desktopPanelRef}
            className="fixed right-3 top-[76px] z-[110] hidden max-h-[calc(100dvh-88px)] w-[min(380px,calc(100vw-24px))] flex-col overflow-hidden rounded-[20px] border border-[#EAE6DF] bg-[#FFFDFC] shadow-[0_18px_45px_rgba(44,32,24,0.18)] lg:flex"
            role="dialog"
            aria-label="Notifications"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#EAE6DF] bg-white px-4 py-3.5">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-[#17202A]">Notifications</h2>
                <p className="mt-0.5 text-[10px] text-gray-400">
                  {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                disabled={markingAll || unreadCount === 0}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-bold text-[#9F2D18] transition hover:bg-[#FFF7ED] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {markingAll ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                Mark all read
              </button>
            </div>

            {error && <p role="alert" className="shrink-0 border-b border-[#F1D5D0] bg-[#FFF3F1] px-4 py-2.5 text-[10px] font-medium text-[#B53624]">{error}</p>}

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {loading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-10 text-[11px] text-gray-500">
                  <LoaderCircle className="h-4 w-4 animate-spin text-[#FF5A36]" /> Loading notifications...
                </div>
              ) : notifications.length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FFF0EB] text-[#FF5A36]"><Bell className="h-5 w-5" /></div>
                  <p className="mt-3 text-sm font-bold text-[#17202A]">No notifications yet</p>
                  <p className="mt-1 text-[10px] leading-5 text-gray-400">Important updates from ReMarket will appear here.</p>
                </div>
              ) : notifications.map((notification) => renderNotificationItem(notification))}
            </div>

            {!loading && notifications.length > 0 && (
              <div className="flex shrink-0 items-center justify-center gap-2 border-t border-[#EAE6DF] bg-white px-4 py-2.5 text-[9px] font-medium text-gray-400">
                <Check className="h-3 w-3" /> Notifications update automatically
              </div>
            )}
          </div>

          {/* Mobile sheet is portalled to document.body, avoiding the sticky header's backdrop-filter containing block. */}
          <div
            className="fixed inset-0 z-[200] flex items-end bg-black/40 lg:hidden"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeNotifications();
            }}
          >
            <div
              ref={mobileDialogRef}
              className="flex max-h-[82dvh] w-full min-w-0 flex-col overflow-hidden rounded-t-[24px] border border-[#EAE6DF] bg-[#FFFDFC] pb-[env(safe-area-inset-bottom)] shadow-[0_-18px_45px_rgba(44,32,24,0.2)]"
              role="dialog"
              aria-modal="true"
              aria-label="Notifications"
            >
              <div className="flex shrink-0 justify-center bg-white pb-1 pt-2.5">
                <span className="h-1 w-10 rounded-full bg-[#D8D1CA]" />
              </div>

              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#EAE6DF] bg-white px-4 py-3.5 sm:px-5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFF0EB] text-[#FF5A36]"><Bell className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-[#17202A]">Notifications</h2>
                    <p className="mt-0.5 text-[10px] text-gray-400">
                      {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void markAllAsRead()}
                    disabled={markingAll || unreadCount === 0}
                    className="inline-flex items-center gap-1 rounded-xl px-2 py-2 text-[10px] font-bold text-[#9F2D18] transition hover:bg-[#FFF7ED] disabled:cursor-not-allowed disabled:opacity-40 sm:gap-1.5 sm:px-2.5"
                  >
                    {markingAll ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
                    <span>Mark all read</span>
                  </button>
                  <button
                    type="button"
                    onClick={closeNotifications}
                    disabled={Boolean(actionLoadingId) || markingAll}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#E8E4DE] bg-white text-gray-500 transition hover:bg-[#FFF7ED] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Close notifications"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {error && <p role="alert" className="shrink-0 border-b border-[#F1D5D0] bg-[#FFF3F1] px-4 py-3 text-[10px] font-medium leading-5 text-[#B53624] sm:px-5">{error}</p>}

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#FCFAF6]">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 px-5 py-12 text-[11px] text-gray-500">
                    <LoaderCircle className="h-5 w-5 animate-spin text-[#FF5A36]" /> Loading notifications...
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="px-6 py-12 text-center sm:py-14">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFF0EB] text-[#FF5A36]"><Bell className="h-6 w-6" /></div>
                    <p className="mt-4 text-base font-bold text-[#17202A]">No notifications yet</p>
                    <p className="mx-auto mt-1.5 max-w-[280px] text-[11px] leading-5 text-gray-400">Important updates from ReMarket will appear here.</p>
                    <button type="button" onClick={closeNotifications} className="mt-5 inline-flex items-center justify-center rounded-xl bg-[#FF5A36] px-4 py-2.5 text-[11px] font-bold text-white transition hover:opacity-90">Close</button>
                  </div>
                ) : (
                  <div className="divide-y divide-[#F0ECE7]">
                    {notifications.map((notification) => renderNotificationItem(notification, true))}
                  </div>
                )}
              </div>

              {!loading && notifications.length > 0 && (
                <div className="flex shrink-0 items-center justify-center gap-2 border-t border-[#EAE6DF] bg-white px-4 py-3 text-[9px] font-medium text-gray-400 sm:px-5">
                  <Check className="h-3 w-3" /> Notifications update automatically
                </div>
              )}
            </div>
          </div>
        </>,
        document.body,
      )
    : null;

  return (
    <>
      <div ref={containerRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => {
            const nextOpen = !open;
            setOpen(nextOpen);
            if (nextOpen) void loadNotifications(true);
          }}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#68615C] transition hover:bg-[#FFF7ED] hover:text-[#FF5A36] focus:outline-none focus:ring-4 focus:ring-[#FF694F]/10"
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <Bell size={18} strokeWidth={2} />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-h-[15px] min-w-[15px] items-center justify-center rounded-full bg-[#FF5A36] px-1 text-[8px] font-bold leading-none text-white ring-2 ring-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </div>
      {panel}
    </>
  );
}
