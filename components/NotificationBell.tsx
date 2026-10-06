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

import { useRouter } from "next/navigation";

/*
 * ---------------------------------------------------------
 * TYPES
 * ---------------------------------------------------------
 */

type NotificationPriority =
  | "LOW"
  | "NORMAL"
  | "HIGH"
  | "CRITICAL";

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
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
};

/*
 * ---------------------------------------------------------
 * HELPERS
 * ---------------------------------------------------------
 */

function formatNotificationTime(
  value: string
): string {
  const createdAt =
    new Date(value);

  if (
    Number.isNaN(
      createdAt.getTime()
    )
  ) {
    return "";
  }

  const now =
    new Date();

  const difference =
    now.getTime() -
    createdAt.getTime();

  const minute =
    60 * 1000;

  const hour =
    60 * minute;

  const day =
    24 * hour;

  if (
    difference < minute
  ) {
    return "Just now";
  }

  if (
    difference < hour
  ) {
    const minutes =
      Math.floor(
        difference / minute
      );

    return `${minutes}m ago`;
  }

  if (
    difference < day
  ) {
    const hours =
      Math.floor(
        difference / hour
      );

    return `${hours}h ago`;
  }

  if (
    difference <
    7 * day
  ) {
    const days =
      Math.floor(
        difference / day
      );

    return `${days}d ago`;
  }

  return createdAt.toLocaleDateString(
    "en-NG",
    {
      day: "numeric",
      month: "short",
      year:
        createdAt.getFullYear() !==
        now.getFullYear()
          ? "numeric"
          : undefined,
    }
  );
}

/*
 * ---------------------------------------------------------
 * NOTIFICATION ROUTING
 * ---------------------------------------------------------
 *
 * Explicit href values supplied by the notification
 * producer always take priority.
 *
 * Type-specific fallbacks are only used where the
 * destination is already known from the existing
 * ReMarket routes.
 * ---------------------------------------------------------
 */

function getNotificationHref(
  notification: Notification
): string | null {
  const data =
    notification.data;

  /*
   * Explicit internal route supplied by the
   * notification producer.
   */
  if (
    data &&
    typeof data.href ===
      "string" &&
    data.href.startsWith("/") &&
    !data.href.startsWith("//")
  ) {
    return data.href;
  }

  /*
   * Admin claim submissions.
   *
   * CLAIM_SUBMITTED notifications are sent to admins.
   */
  if (
    notification.type ===
    "CLAIM_SUBMITTED"
  ) {
    return "/admin/claims";
  }

  /*
   * Admin business deletion requests.
   */
  if (
    notification.type ===
    "BUSINESS_DELETION_REQUESTED"
  ) {
    return "/admin/business-deletion-requests";
  }

  /*
   * Admin request creation notifications.
   */
  if (
    notification.type ===
    "REQUEST_CREATED"
  ) {
    return "/admin/requests";
  }

  /*
   * Admin seller/business update notification.
   */
  if (
    notification.type ===
    "BUSINESS_UPDATED"
  ) {
    return data &&
      typeof data.businessId ===
        "string" &&
      data.businessId.trim()
      ? `/admin/businesses/${data.businessId.trim()}`
      : "/admin/businesses";
  }

  /*
   * Admin product notifications.
   *
   * Existing producer routes already provide explicit
   * seller destinations where appropriate. This fallback
   * is therefore used only when a producer did not supply
   * one.
   */
  if (
    notification.type ===
      "PRODUCT_ADDED" ||
    notification.type ===
      "PRODUCT_UPDATED" ||
    notification.type ===
      "PRODUCT_REMOVED" ||
    notification.type ===
      "PRODUCT_AVAILABILITY_CHANGED"
  ) {
    if (
      data &&
      typeof data.productId ===
        "string" &&
      data.productId.trim()
    ) {
      return `/admin/products/${data.productId.trim()}`;
    }

    return "/admin/products";
  }

  /*
   * Claim approval/rejection notifications are sent to
   * sellers. The existing notification producer already
   * supplies /seller/[businessId], but keep a safe fallback
   * here in case an older notification record has no href.
   */
  if (
    notification.type ===
      "CLAIM_APPROVED" ||
    notification.type ===
      "CLAIM_REJECTED"
  ) {
    if (
      data &&
      typeof data.businessId ===
        "string" &&
      data.businessId.trim()
    ) {
      return `/seller/${data.businessId.trim()}`;
    }
  }

  /*
   * General business-related fallback.
   *
   * This remains useful for older notification records
   * that were created before explicit href values were
   * added.
   */
  if (
    data &&
    typeof data.businessId ===
      "string"
  ) {
    const businessId =
      data.businessId.trim();

    if (businessId) {
      return `/business/${businessId}`;
    }
  }

  /*
   * General request fallback.
   */
  if (
    data &&
    typeof data.requestId ===
      "string"
  ) {
    const requestId =
      data.requestId.trim();

    if (requestId) {
      return `/my-requests?request=${encodeURIComponent(
        requestId
      )}`;
    }
  }

  switch (
    notification.type
  ) {
    case "SYSTEM_ANNOUNCEMENT":
      return null;

    case "SECURITY_ALERT":
      return null;

    default:
      return null;
  }
}

function getPriorityClasses(
  priority: NotificationPriority
): string {
  switch (priority) {
    case "CRITICAL":
      return "border-l-2 border-l-red-500";

    case "HIGH":
      return "border-l-2 border-l-[#FF5A36]";

    case "NORMAL":
      return "";

    case "LOW":
      return "";
  }
}

function getPriorityBadgeClasses(
  priority: NotificationPriority
): string {
  switch (priority) {
    case "CRITICAL":
      return "bg-[#FFE5E1] text-[#B53624]";

    case "HIGH":
      return "bg-[#FFF0EB] text-[#9F2D18]";

    case "NORMAL":
      return "bg-[#F7F3EE] text-gray-500";

    case "LOW":
      return "bg-[#F7F3EE] text-gray-500";
  }
}

/*
 * ---------------------------------------------------------
 * COMPONENT
 * ---------------------------------------------------------
 */

export default function NotificationBell() {
  const router =
    useRouter();

  const containerRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const [open, setOpen] =
    useState(false);

  const [
    notifications,
    setNotifications,
  ] = useState<Notification[]>([]);

  const [
    unreadCount,
    setUnreadCount,
  ] = useState(0);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    authenticated,
    setAuthenticated,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const [
    actionLoadingId,
    setActionLoadingId,
  ] = useState<string | null>(
    null
  );

  const [
    markingAll,
    setMarkingAll,
  ] = useState(false);

  /*
   * -------------------------------------------------------
   * LOAD NOTIFICATIONS
   * -------------------------------------------------------
   */

  const loadNotifications =
    useCallback(
      async (
        showLoading = false
      ) => {
        if (showLoading) {
          setLoading(true);
        }

        setError("");

        try {
          const response =
            await fetch(
              "/api/notifications?limit=20",
              {
                method: "GET",
                cache: "no-store",
              }
            );

          if (
            response.status === 401
          ) {
            setAuthenticated(
              false
            );

            setNotifications(
              []
            );

            setUnreadCount(
              0
            );

            return;
          }

          if (!response.ok) {
            throw new Error(
              "Unable to load notifications."
            );
          }

          const data =
            (await response.json()) as NotificationsResponse;

          if (
            !Array.isArray(
              data.notifications
            )
          ) {
            throw new Error(
              "Invalid notification response."
            );
          }

          setAuthenticated(
            true
          );

          setNotifications(
            data.notifications
          );

          setUnreadCount(
            typeof data.unreadCount ===
              "number"
              ? data.unreadCount
              : 0
          );
        } catch (
          loadError
        ) {
          console.error(
            "Notification load error:",
            loadError
          );

          setError(
            "Unable to load notifications."
          );
        } finally {
          if (showLoading) {
            setLoading(false);
          }
        }
      },
      []
    );

  /*
   * -------------------------------------------------------
   * INITIAL LOAD
   * -------------------------------------------------------
   */

  useEffect(() => {
    void loadNotifications(
      true
    );
  }, [
    loadNotifications,
  ]);

  /*
   * -------------------------------------------------------
   * REFRESH PERIODICALLY
   * -------------------------------------------------------
   */

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    const interval =
      window.setInterval(
        () => {
          void loadNotifications(
            false
          );
        },
        30_000
      );

    return () => {
      window.clearInterval(
        interval
      );
    };
  }, [
    authenticated,
    loadNotifications,
  ]);

  /*
   * -------------------------------------------------------
   * REFRESH WHEN USER RETURNS TO TAB
   * -------------------------------------------------------
   */

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    function handleFocus() {
      void loadNotifications(
        false
      );
    }

    window.addEventListener(
      "focus",
      handleFocus
    );

    return () => {
      window.removeEventListener(
        "focus",
        handleFocus
      );
    };
  }, [
    authenticated,
    loadNotifications,
  ]);

  /*
   * -------------------------------------------------------
   * ESCAPE KEY
   * -------------------------------------------------------
   */

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(
      event: KeyboardEvent
    ) {
      if (
        event.key ===
        "Escape"
      ) {
        setOpen(false);
      }
    }

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [open]);

  /*
   * -------------------------------------------------------
   * CLOSE DESKTOP DROPDOWN WHEN CLICKING OUTSIDE
   * -------------------------------------------------------
   */

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(
      event: MouseEvent
    ) {
      const target =
        event.target;

      if (
        !(target instanceof
          Node)
      ) {
        return;
      }

      if (
        containerRef.current &&
        !containerRef.current.contains(
          target
        )
      ) {
        setOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handlePointerDown
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handlePointerDown
      );
    };
  }, [open]);

  /*
   * -------------------------------------------------------
   * MARK ONE AS READ
   * -------------------------------------------------------
   */

  async function markAsRead(
    notificationId: string
  ) {
    if (
      actionLoadingId ||
      markingAll
    ) {
      return;
    }

    setActionLoadingId(
      notificationId
    );

    try {
      const response =
        await fetch(
          "/api/notifications",
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              action: "MARK_ONE",
              notificationId,
            }),
          }
        );

      if (
        response.status === 401
      ) {
        setAuthenticated(
          false
        );

        return;
      }

      if (!response.ok) {
        throw new Error(
          "Unable to mark notification as read."
        );
      }

      setNotifications(
        (current) =>
          current.map(
            (
              notification
            ) =>
              notification.id ===
              notificationId
                ? {
                    ...notification,
                    readAt:
                      new Date().toISOString(),
                  }
                : notification
          )
      );

      setUnreadCount(
        (current) =>
          Math.max(
            current - 1,
            0
          )
      );
    } catch (
      markError
    ) {
      console.error(
        "Mark notification read error:",
        markError
      );

      setError(
        "Unable to update notification."
      );
    } finally {
      setActionLoadingId(
        null
      );
    }
  }

  /*
   * -------------------------------------------------------
   * MARK ALL AS READ
   * -------------------------------------------------------
   */

  async function markAllAsRead() {
    if (
      markingAll ||
      unreadCount <= 0
    ) {
      return;
    }

    setMarkingAll(true);
    setError("");

    try {
      const response =
        await fetch(
          "/api/notifications",
          {
            method: "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              action:
                "MARK_ALL",
            }),
          }
        );

      if (
        response.status === 401
      ) {
        setAuthenticated(
          false
        );

        return;
      }

      if (!response.ok) {
        throw new Error(
          "Unable to mark all notifications as read."
        );
      }

      const now =
        new Date().toISOString();

      setNotifications(
        (current) =>
          current.map(
            (
              notification
            ) => ({
              ...notification,
              readAt:
                notification.readAt ??
                now,
            })
          )
      );

      setUnreadCount(
        0
      );
    } catch (
      markError
    ) {
      console.error(
        "Mark all notifications read error:",
        markError
      );

      setError(
        "Unable to update notifications."
      );
    } finally {
      setMarkingAll(
        false
      );
    }
  }

  /*
   * -------------------------------------------------------
   * OPEN NOTIFICATION
   * -------------------------------------------------------
   */

  async function handleNotificationClick(
    notification: Notification
  ) {
    if (
      actionLoadingId ||
      markingAll
    ) {
      return;
    }

    const wasUnread =
      notification.readAt ===
      null;

    if (wasUnread) {
      await markAsRead(
        notification.id
      );
    }

    const href =
      getNotificationHref(
        notification
      );

    if (href) {
      setOpen(false);

      router.push(
        href
      );
    }
  }

  /*
   * -------------------------------------------------------
   * CLOSE
   * -------------------------------------------------------
   */

  function closeNotifications() {
    if (
      actionLoadingId ||
      markingAll
    ) {
      return;
    }

    setOpen(false);
  }

  /*
   * -------------------------------------------------------
   * DO NOT RENDER FOR UNAUTHENTICATED USERS
   * -------------------------------------------------------
   */

  if (!authenticated) {
    return null;
  }

  /*
   * -------------------------------------------------------
   * NOTIFICATION ITEM
   * -------------------------------------------------------
   */

  function renderNotificationItem(
    notification: Notification,
    mobile = false
  ) {
    const unread =
      notification.readAt ===
      null;

    const actionLoading =
      actionLoadingId ===
      notification.id;

    return (
      <button
        key={
          notification.id
        }
        type="button"
        onClick={() =>
          void handleNotificationClick(
            notification
          )
        }
        disabled={
          actionLoading ||
          markingAll
        }
        className={`
          relative
          flex
          w-full
          items-start
          gap-3
          border-b
          border-[#F0ECE7]
          text-left
          transition
          last:border-b-0
          hover:bg-[#FFF9F4]
          disabled:cursor-wait
          ${
            mobile
              ? "px-4 py-4 sm:px-5 sm:py-4"
              : "px-4 py-3.5"
          }
          ${getPriorityClasses(
            notification.priority
          )}
          ${
            unread
              ? "bg-[#FFF9F4]"
              : "bg-white"
          }
        `}
      >
        {/* Unread indicator */}

        <div
          className="
            flex
            shrink-0
            flex-col
            items-center
            pt-1.5
          "
        >
          <span
            className={`
              rounded-full
              ${
                mobile
                  ? "h-2.5 w-2.5"
                  : "h-2 w-2"
              }
              ${
                unread
                  ? "bg-[#FF5A36]"
                  : "bg-transparent"
              }
            `}
          />
        </div>

        {/* Content */}

        <div
          className="
            min-w-0
            flex-1
          "
        >
          <div
            className="
              flex
              items-start
              justify-between
              gap-3
            "
          >
            <p
              className={`
                min-w-0
                ${
                  mobile
                    ? "text-[13px] leading-5"
                    : "text-[11px] leading-4"
                }
                ${
                  unread
                    ? "font-bold text-[#17202A]"
                    : "font-semibold text-[#4E4843]"
                }
              `}
            >
              {
                notification.title
              }
            </p>

            <span
              className="
                shrink-0
                whitespace-nowrap
                text-[9px]
                font-medium
                text-gray-400
              "
            >
              {formatNotificationTime(
                notification.createdAt
              )}
            </span>
          </div>

          <p
            className={`
              ${
                mobile
                  ? "mt-1.5 text-[11px] leading-5"
                  : "mt-1 text-[10px] leading-5"
              }
              text-gray-500
            `}
          >
            {
              notification.message
            }
          </p>

          <div
            className="
              mt-3
              flex
              items-center
              justify-between
              gap-3
            "
          >
            <span
              className={`
                rounded-full
                ${
                  mobile
                    ? "px-2.5 py-1 text-[9px]"
                    : "px-2 py-1 text-[8px]"
                }
                font-bold
                uppercase
                tracking-wide
                ${getPriorityBadgeClasses(
                  notification.priority
                )}
              `}
            >
              {
                notification.priority
              }
            </span>

            {actionLoading ? (
              <LoaderCircle
                className={`
                  animate-spin
                  text-[#FF5A36]
                  ${
                    mobile
                      ? "h-4 w-4"
                      : "h-3.5 w-3.5"
                  }
                `}
              />
            ) : (
              <ChevronRight
                className={`
                  text-gray-300
                  ${
                    mobile
                      ? "h-4 w-4"
                      : "h-3.5 w-3.5"
                  }
                `}
              />
            )}
          </div>
        </div>
      </button>
    );
  }

  /*
   * -------------------------------------------------------
   * RENDER
   * -------------------------------------------------------
   */

  return (
    <div
      ref={containerRef}
      className="relative"
    >
      {/* Bell */}

      <button
        type="button"
        onClick={() =>
          setOpen(
            (current) =>
              !current
          )
        }
        className="
          relative
          flex
          h-9
          w-9
          items-center
          justify-center
          rounded-xl
          text-[#68615C]
          transition
          hover:bg-[#FFF7ED]
          hover:text-[#FF5A36]
          focus:outline-none
          focus:ring-4
          focus:ring-[#FF694F]/10
        "
        aria-label={
          unreadCount > 0
            ? `${unreadCount} unread notifications`
            : "Notifications"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell
          size={18}
          strokeWidth={2}
        />

        {unreadCount > 0 && (
          <span
            className="
              absolute
              -right-0.5
              -top-0.5
              flex
              min-h-[15px]
              min-w-[15px]
              items-center
              justify-center
              rounded-full
              bg-[#FF5A36]
              px-1
              text-[8px]
              font-bold
              leading-none
              text-white
              ring-2
              ring-white
            "
          >
            {unreadCount > 99
              ? "99+"
              : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* =====================================================
              DESKTOP NOTIFICATION DROPDOWN
              ===================================================== */}

          <div
            className="
              absolute
              right-0
              top-[calc(100%+10px)]
              z-50
              hidden
              w-[min(380px,calc(100vw-24px))]
              overflow-hidden
              rounded-[20px]
              border
              border-[#EAE6DF]
              bg-[#FFFDFC]
              shadow-[0_18px_45px_rgba(44,32,24,0.12)]
              lg:block
            "
            role="dialog"
            aria-label="Notifications"
          >
            {/* Header */}

            <div
              className="
                flex
                items-center
                justify-between
                border-b
                border-[#EAE6DF]
                bg-white
                px-4
                py-3.5
              "
            >
              <div>
                <h2
                  className="
                    text-sm
                    font-bold
                    text-[#17202A]
                  "
                >
                  Notifications
                </h2>

                <p
                  className="
                    mt-0.5
                    text-[10px]
                    text-gray-400
                  "
                >
                  {unreadCount > 0
                    ? `${unreadCount} unread`
                    : "You're all caught up"}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  void markAllAsRead()
                }
                disabled={
                  markingAll ||
                  unreadCount === 0
                }
                className="
                  inline-flex
                  items-center
                  gap-1.5
                  rounded-lg
                  px-2.5
                  py-2
                  text-[10px]
                  font-bold
                  text-[#9F2D18]
                  transition
                  hover:bg-[#FFF7ED]
                  disabled:cursor-not-allowed
                  disabled:opacity-40
                "
              >
                {markingAll ? (
                  <LoaderCircle
                    className="h-3.5 w-3.5 animate-spin"
                  />
                ) : (
                  <CheckCheck
                    className="h-3.5 w-3.5"
                  />
                )}

                Mark all read
              </button>
            </div>

            {/* Error */}

            {error && (
              <div
                className="
                  border-b
                  border-[#F1D5D0]
                  bg-[#FFF3F1]
                  px-4
                  py-2.5
                  text-[10px]
                  font-medium
                  text-[#B53624]
                "
              >
                {error}
              </div>
            )}

            {/* Loading */}

            {loading && (
              <div
                className="
                  flex
                  items-center
                  justify-center
                  gap-2
                  px-4
                  py-10
                  text-[11px]
                  text-gray-500
                "
              >
                <LoaderCircle
                  className="
                    h-4
                    w-4
                    animate-spin
                    text-[#FF5A36]
                  "
                />

                Loading notifications...
              </div>
            )}

            {/* Empty */}

            {!loading &&
              notifications.length ===
                0 && (
                <div
                  className="
                    px-5
                    py-10
                    text-center
                  "
                >
                  <div
                    className="
                      mx-auto
                      flex
                      h-11
                      w-11
                      items-center
                      justify-center
                      rounded-2xl
                      bg-[#FFF0EB]
                      text-[#FF5A36]
                    "
                  >
                    <Bell className="h-5 w-5" />
                  </div>

                  <p
                    className="
                      mt-3
                      text-sm
                      font-bold
                      text-[#17202A]
                    "
                  >
                    No notifications yet
                  </p>

                  <p
                    className="
                      mt-1
                      text-[10px]
                      leading-5
                      text-gray-400
                    "
                  >
                    Important updates from
                    ReMarket will appear here.
                  </p>
                </div>
              )}

            {/* Notification list */}

            {!loading &&
              notifications.length >
                0 && (
                <div
                  className="
                    max-h-[420px]
                    overflow-y-auto
                  "
                >
                  {notifications.map(
                    (
                      notification
                    ) =>
                      renderNotificationItem(
                        notification
                      )
                  )}
                </div>
              )}

            {/* Footer */}

            {!loading &&
              notifications.length >
                0 && (
                <div
                  className="
                    border-t
                    border-[#EAE6DF]
                    bg-white
                    px-4
                    py-2.5
                  "
                >
                  <div
                    className="
                      flex
                      items-center
                      justify-center
                      gap-2
                      text-[9px]
                      font-medium
                      text-gray-400
                    "
                  >
                    <Check className="h-3 w-3" />

                    Notifications update
                    automatically
                  </div>
                </div>
              )}
          </div>

          {/* =====================================================
              MOBILE NOTIFICATION BOTTOM SHEET
              ===================================================== */}

          <div
            className="
              fixed
              inset-0
              z-[100]
              flex
              items-end
              bg-black/30
              lg:hidden
            "
            role="presentation"
            onMouseDown={(
              event
            ) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                closeNotifications();
              }
            }}
          >
            <div
              className="
                flex
                max-h-[82vh]
                w-full
                flex-col
                overflow-hidden
                rounded-t-[24px]
                border
                border-[#EAE6DF]
                bg-[#FFFDFC]
                shadow-[0_-18px_45px_rgba(44,32,24,0.16)]
              "
              role="dialog"
              aria-modal="true"
              aria-label="Notifications"
            >
              {/* Mobile handle */}

              <div
                className="
                  flex
                  justify-center
                  bg-white
                  pt-2.5
                  pb-1
                "
              >
                <span
                  className="
                    h-1
                    w-10
                    rounded-full
                    bg-[#D8D1CA]
                  "
                />
              </div>

              {/* Mobile header */}

              <div
                className="
                  flex
                  items-center
                  justify-between
                  gap-3
                  border-b
                  border-[#EAE6DF]
                  bg-white
                  px-4
                  py-3.5
                  sm:px-5
                "
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div
                      className="
                        flex
                        h-9
                        w-9
                        shrink-0
                        items-center
                        justify-center
                        rounded-xl
                        bg-[#FFF0EB]
                        text-[#FF5A36]
                      "
                    >
                      <Bell className="h-5 w-5" />
                    </div>

                    <div className="min-w-0">
                      <h2
                        className="
                          text-base
                          font-bold
                          text-[#17202A]
                        "
                      >
                        Notifications
                      </h2>

                      <p
                        className="
                          mt-0.5
                          text-[10px]
                          text-gray-400
                        "
                      >
                        {unreadCount > 0
                          ? `${unreadCount} unread`
                          : "You're all caught up"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      void markAllAsRead()
                    }
                    disabled={
                      markingAll ||
                      unreadCount === 0
                    }
                    className="
                      inline-flex
                      items-center
                      gap-1.5
                      rounded-xl
                      px-2.5
                      py-2
                      text-[10px]
                      font-bold
                      text-[#9F2D18]
                      transition
                      hover:bg-[#FFF7ED]
                      disabled:cursor-not-allowed
                      disabled:opacity-40
                    "
                  >
                    {markingAll ? (
                      <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCheck className="h-3.5 w-3.5" />
                    )}

                    Mark all read
                  </button>

                  <button
                    type="button"
                    onClick={
                      closeNotifications
                    }
                    disabled={
                      Boolean(
                        actionLoadingId
                      ) ||
                      markingAll
                    }
                    className="
                      flex
                      h-9
                      w-9
                      shrink-0
                      items-center
                      justify-center
                      rounded-xl
                      border
                      border-[#E8E4DE]
                      bg-white
                      text-gray-500
                      transition
                      hover:bg-[#FFF7ED]
                      hover:text-[#9F2D18]
                      disabled:cursor-not-allowed
                      disabled:opacity-40
                    "
                    aria-label="Close notifications"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Mobile error */}

              {error && (
                <div
                  className="
                    border-b
                    border-[#F1D5D0]
                    bg-[#FFF3F1]
                    px-4
                    py-3
                    text-[10px]
                    font-medium
                    leading-5
                    text-[#B53624]
                    sm:px-5
                  "
                >
                  {error}
                </div>
              )}

              {/* Mobile content */}

              <div
                className="
                  min-h-0
                  flex-1
                  overflow-y-auto
                  overscroll-contain
                  bg-[#FCFAF6]
                "
              >
                {loading && (
                  <div
                    className="
                      flex
                      items-center
                      justify-center
                      gap-2
                      px-5
                      py-12
                      text-[11px]
                      text-gray-500
                    "
                  >
                    <LoaderCircle
                      className="
                        h-5
                        w-5
                        animate-spin
                        text-[#FF5A36]
                      "
                    />

                    Loading notifications...
                  </div>
                )}

                {!loading &&
                  notifications.length ===
                    0 && (
                    <div
                      className="
                        px-6
                        py-14
                        text-center
                      "
                    >
                      <div
                        className="
                          mx-auto
                          flex
                          h-14
                          w-14
                          items-center
                          justify-center
                          rounded-2xl
                          bg-[#FFF0EB]
                          text-[#FF5A36]
                        "
                      >
                        <Bell className="h-6 w-6" />
                      </div>

                      <p
                        className="
                          mt-4
                          text-base
                          font-bold
                          text-[#17202A]
                        "
                      >
                        No notifications yet
                      </p>

                      <p
                        className="
                          mx-auto
                          mt-1.5
                          max-w-[280px]
                          text-[11px]
                          leading-5
                          text-gray-400
                        "
                      >
                        Important updates from
                        ReMarket will appear here.
                      </p>

                      <button
                        type="button"
                        onClick={
                          closeNotifications
                        }
                        className="
                          mt-5
                          inline-flex
                          items-center
                          justify-center
                          rounded-xl
                          bg-[#FF5A36]
                          px-4
                          py-2.5
                          text-[11px]
                          font-bold
                          text-white
                          transition
                          hover:opacity-90
                        "
                      >
                        Close
                      </button>
                    </div>
                  )}

                {!loading &&
                  notifications.length >
                    0 && (
                    <div className="divide-y divide-[#F0ECE7]">
                      {notifications.map(
                        (
                          notification
                        ) =>
                          renderNotificationItem(
                            notification,
                            true
                          )
                      )}
                    </div>
                  )}
              </div>

              {/* Mobile footer */}

              {!loading &&
                notifications.length >
                  0 && (
                  <div
                    className="
                      border-t
                      border-[#EAE6DF]
                      bg-white
                      px-4
                      py-3
                      sm:px-5
                    "
                  >
                    <div
                      className="
                        flex
                        items-center
                        justify-center
                        gap-2
                        text-[9px]
                        font-medium
                        text-gray-400
                      "
                    >
                      <Check className="h-3 w-3" />

                      Notifications update
                      automatically
                    </div>
                  </div>
                )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}