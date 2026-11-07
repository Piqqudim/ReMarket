
"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import Link from "next/link";
import { useParams } from "next/navigation";

import {
  ArrowLeft,
  LoaderCircle,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";

/*
 * =========================================================
 * TYPES
 * =========================================================
 */

type BookingStatus =
  | "PENDING"
  | "AWAITING_BUYER"
  | "ACCEPTED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "DECLINED"
  | "CANCELLED";

type ChatMessage = {
  id: string;
  body: string;
  senderId: string;
  senderName: string;
  isOwnMessage: boolean;
  readAt: string | null;
  createdAt: string;
};

type Conversation = {
  booking: {
    id: string;
    status: BookingStatus;
    service: {
      id: string;
      name: string;
    };
  };

  currentUser: {
    id: string;
    name: string | null;
    role: "BUYER" | "SELLER";
  };

  messages: ChatMessage[];

  total: number;

  hasMore: boolean;

  nextCursor: string | null;

  canSendMessage: boolean;
};

type LoadConversationOptions = {
  silent?: boolean;
  showLoading?: boolean;
};

type ScrollRestorePosition = {
  scrollHeight: number;
  scrollTop: number;
};

/*
 * =========================================================
 * CONSTANTS
 * =========================================================
 */

const MESSAGE_ENABLED_STATUSES: BookingStatus[] = [
  "PENDING",
  "AWAITING_BUYER",
  "ACCEPTED",
  "IN_PROGRESS",
  "COMPLETED",
];

const BOOKING_STATUS_LABELS: Record<
  BookingStatus,
  string
> = {
  PENDING: "Pending",
  AWAITING_BUYER: "Awaiting buyer",
  ACCEPTED: "Accepted",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
};

const MAX_MESSAGE_LENGTH = 2_000;
const REFRESH_INTERVAL = 15_000;
const BOTTOM_SCROLL_THRESHOLD = 100;

/*
 * =========================================================
 * GENERAL HELPERS
 * =========================================================
 */

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getError(
  data: unknown,
  fallback: string,
): string {
  return (
    isRecord(data) &&
    typeof data.error === "string"
  )
    ? data.error
    : fallback;
}

function isBookingStatus(
  value: unknown,
): value is BookingStatus {
  return (
    value === "PENDING" ||
    value === "AWAITING_BUYER" ||
    value === "ACCEPTED" ||
    value === "IN_PROGRESS" ||
    value === "COMPLETED" ||
    value === "DECLINED" ||
    value === "CANCELLED"
  );
}

function formatTime(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("en-NG", {
        dateStyle: "medium",
        timeStyle: "short",
      });
}

function formatStatus(
  status: BookingStatus,
): string {
  return BOOKING_STATUS_LABELS[status];
}

/*
 * =========================================================
 * MESSAGE HELPERS
 * =========================================================
 */

/**
 * Keep messages in chronological order.
 *
 * The secondary ID comparison gives deterministic ordering
 * when messages have the same timestamp.
 */

function compareMessages(
  first: ChatMessage,
  second: ChatMessage,
): number {
  const firstTime = new Date(
    first.createdAt,
  ).getTime();

  const secondTime = new Date(
    second.createdAt,
  ).getTime();

  if (firstTime !== secondTime) {
    return firstTime - secondTime;
  }

  return first.id.localeCompare(second.id);
}

/**
 * Merge messages from different pages without duplicates.
 *
 * Later copies replace earlier copies, which is useful
 * when readAt changes during automatic refresh.
 */

function mergeMessages(
  ...groups: ChatMessage[][]
): ChatMessage[] {
  const messageMap = new Map<
    string,
    ChatMessage
  >();

  for (const group of groups) {
    for (const message of group) {
      messageMap.set(message.id, message);
    }
  }

  return Array.from(
    messageMap.values(),
  ).sort(compareMessages);
}

/*
 * =========================================================
 * RESPONSE PARSING
 * =========================================================
 */

function parseConversation(
  data: unknown,
): Conversation {
  if (
    !isRecord(data) ||
    !isRecord(data.booking) ||
    !isRecord(data.currentUser) ||
    !Array.isArray(data.messages)
  ) {
    throw new Error(
      "The conversation response is incomplete.",
    );
  }

  const rawBooking = data.booking;

  const rawService = isRecord(
    rawBooking.service,
  )
    ? rawBooking.service
    : null;

  const rawUser = data.currentUser;

  if (
    typeof rawBooking.id !== "string" ||
    !rawService ||
    typeof rawService.id !== "string" ||
    typeof rawService.name !== "string" ||
    typeof rawUser.id !== "string" ||
    (
      rawUser.role !== "BUYER" &&
      rawUser.role !== "SELLER"
    ) ||
    !isBookingStatus(rawBooking.status)
  ) {
    throw new Error(
      "The conversation information is invalid.",
    );
  }

  const messages: ChatMessage[] = [];

  for (const item of data.messages) {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.body !== "string" ||
      typeof item.senderId !== "string" ||
      typeof item.createdAt !== "string"
    ) {
      continue;
    }

    messages.push({
      id: item.id,
      body: item.body,
      senderId: item.senderId,

      senderName:
        typeof item.senderName === "string"
          ? item.senderName
          : "ReMarket user",

      isOwnMessage:
        typeof item.isOwnMessage === "boolean"
          ? item.isOwnMessage
          : item.senderId === rawUser.id,

      readAt:
        typeof item.readAt === "string"
          ? item.readAt
          : null,

      createdAt: item.createdAt,
    });
  }

  const status = rawBooking.status;

  /*
   * IMPORTANT:
   *
   * The conversation API returns canSendMessage
   * inside booking, not at the top level.
   *
   * The top-level fallback is retained for compatibility
   * with an older API response.
   */

  const canSendMessage =
    typeof rawBooking.canSendMessage === "boolean"
      ? rawBooking.canSendMessage
      : typeof data.canSendMessage === "boolean"
        ? data.canSendMessage
        : MESSAGE_ENABLED_STATUSES.includes(status);

  const total =
    typeof data.total === "number" &&
    Number.isSafeInteger(data.total) &&
    data.total >= 0
      ? data.total
      : messages.length;

  const nextCursor =
    typeof data.nextCursor === "string" &&
    data.nextCursor.trim()
      ? data.nextCursor
      : null;

  return {
    booking: {
      id: rawBooking.id,
      status,

      service: {
        id: rawService.id,
        name: rawService.name,
      },
    },

    currentUser: {
      id: rawUser.id,

      name:
        typeof rawUser.name === "string"
          ? rawUser.name
          : null,

      role: rawUser.role,
    },

    messages: messages.sort(compareMessages),

    total,

    hasMore: data.hasMore === true,

    nextCursor,

    canSendMessage,
  };
}

/*
 * =========================================================
 * SENT MESSAGE PARSING
 * =========================================================
 */

function parseSentMessage(
  value: unknown,
): ChatMessage {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.body !== "string" ||
    typeof value.senderId !== "string" ||
    typeof value.createdAt !== "string"
  ) {
    throw new Error(
      "Your message was sent, but its response was incomplete.",
    );
  }

  return {
    id: value.id,
    body: value.body,
    senderId: value.senderId,

    senderName:
      typeof value.senderName === "string"
        ? value.senderName
        : "You",

    isOwnMessage: true,

    readAt:
      typeof value.readAt === "string"
        ? value.readAt
        : null,

    createdAt: value.createdAt,
  };
}

/*
 * =========================================================
 * COMPONENT
 * =========================================================
 */

export default function ServiceBookingMessagesPage() {
  const params = useParams<{
    id: string;
  }>();

  const bookingId =
    typeof params.id === "string"
      ? params.id
      : "";

  /*
   * -------------------------------------------------------
   * STATE
   * -------------------------------------------------------
   */

  const [conversation, setConversation] =
    useState<Conversation | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [refreshing, setRefreshing] =
    useState(false);

  const [loadingOlder, setLoadingOlder] =
    useState(false);

  const [sending, setSending] =
    useState(false);

  const [error, setError] =
    useState("");

  const [draft, setDraft] =
    useState("");

  /*
   * -------------------------------------------------------
   * REFS
   * -------------------------------------------------------
   */

  const messagesContainerRef =
    useRef<HTMLDivElement | null>(null);

  const activeLoadRef =
    useRef<AbortController | null>(null);

  const olderLoadRef =
    useRef<AbortController | null>(null);

  const loadSequenceRef =
    useRef(0);

  const loadInProgressRef =
    useRef(false);

  const loadingOlderRef =
    useRef(false);

  const sendingRef =
    useRef(false);

  const hasLoadedOlderRef =
    useRef(false);

  const bottomPinnedRef =
    useRef(true);

  const scrollRestoreRef =
    useRef<ScrollRestorePosition | null>(null);

  /*
   * =======================================================
   * LOAD LATEST CONVERSATION
   * =======================================================
   *
   * This loads the latest message page.
   *
   * Previously loaded older messages are preserved.
   * =======================================================
   */

  const loadConversation = useCallback(
    async (
      options: LoadConversationOptions = {},
    ): Promise<boolean> => {
      const silent = options.silent === true;

      const showLoading =
        options.showLoading === true;

      if (!bookingId) {
        if (!silent) {
          setError("Invalid booking ID.");
          setLoading(false);
        }

        return false;
      }

      /*
       * Do not refresh while an older page is being loaded.
       */

      if (loadingOlderRef.current) {
        return false;
      }

      /*
       * Automatic refreshes do not overlap.
       *
       * Manual refreshes replace an existing request.
       */

      if (loadInProgressRef.current) {
        if (silent) {
          return false;
        }

        activeLoadRef.current?.abort();
      }

      const controller = new AbortController();

      activeLoadRef.current = controller;

      const requestId =
        ++loadSequenceRef.current;

      loadInProgressRef.current = true;

      if (showLoading) {
        setLoading(true);
      } else if (!silent) {
        setRefreshing(true);
      }

      if (!silent) {
        setError("");
      }

      try {
        const response = await fetch(
          `/api/service-bookings/${encodeURIComponent(
            bookingId,
          )}/messages`,
          {
            method: "GET",
            cache: "no-store",
            signal: controller.signal,
          },
        );

        if (
          controller.signal.aborted ||
          requestId !== loadSequenceRef.current
        ) {
          return false;
        }

        const data: unknown =
          await response.json().catch(() => null);

        if (
          controller.signal.aborted ||
          requestId !== loadSequenceRef.current
        ) {
          return false;
        }

        if (!response.ok) {
          throw new Error(
            getError(
              data,
              "Unable to load this conversation.",
            ),
          );
        }

        const parsedConversation =
          parseConversation(data);

        if (
          controller.signal.aborted ||
          requestId !== loadSequenceRef.current
        ) {
          return false;
        }

        /*
         * Merge fresh messages with previously loaded
         * messages instead of replacing the conversation.
         */

        setConversation((current) => {
          if (!current) {
            return parsedConversation;
          }

          const merged = mergeMessages(
            current.messages,
            parsedConversation.messages,
          );

          /*
           * If older pages have already been loaded,
           * retain their current pagination cursor.
           *
           * Otherwise use the latest server cursor.
           */

          const preserveOlderPagination =
            hasLoadedOlderRef.current;

          return {
            ...parsedConversation,

            messages: merged,

            hasMore: preserveOlderPagination
              ? current.hasMore
              : parsedConversation.hasMore,

            nextCursor: preserveOlderPagination
              ? current.nextCursor
              : parsedConversation.nextCursor,
          };
        });

        return true;
      } catch (loadError) {
        if (
          controller.signal.aborted ||
          requestId !== loadSequenceRef.current
        ) {
          return false;
        }

        console.error(
          "Booking conversation load error:",
          loadError,
        );

        if (!silent) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load this conversation.",
          );
        }

        return false;
      } finally {
        if (
          requestId === loadSequenceRef.current
        ) {
          loadInProgressRef.current = false;

          activeLoadRef.current = null;

          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [bookingId],
  );

  /*
   * =======================================================
   * INITIAL LOAD
   * =======================================================
   */

  useEffect(() => {
    hasLoadedOlderRef.current = false;
    bottomPinnedRef.current = true;

    void loadConversation({
      showLoading: true,
    });

    return () => {
      activeLoadRef.current?.abort();
      olderLoadRef.current?.abort();

      loadSequenceRef.current += 1;

      loadInProgressRef.current = false;
      loadingOlderRef.current = false;
    };
  }, [loadConversation]);

  /*
   * =======================================================
   * AUTOMATIC REFRESH
   * =======================================================
   *
   * Refreshes every 15 seconds while the page is visible.
   *
   * This also updates read receipts for recent messages.
   * =======================================================
   */

  useEffect(() => {
    const refreshAutomatically = () => {
      if (
        document.visibilityState !== "visible" ||
        sendingRef.current ||
        loadInProgressRef.current ||
        loadingOlderRef.current
      ) {
        return;
      }

      void loadConversation({
        silent: true,
      });
    };

    const interval = window.setInterval(
      refreshAutomatically,
      REFRESH_INTERVAL,
    );

    const handleFocus = () => {
      refreshAutomatically();
    };

    const handleVisibilityChange = () => {
      if (
        document.visibilityState === "visible"
      ) {
        refreshAutomatically();
      }
    };

    window.addEventListener(
      "focus",
      handleFocus,
    );

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    return () => {
      window.clearInterval(interval);

      window.removeEventListener(
        "focus",
        handleFocus,
      );

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, [loadConversation]);

  /*
   * =======================================================
   * LOAD OLDER MESSAGES
   * =======================================================
   *
   * Calls:
   *
   * GET /api/service-bookings/[id]/messages?before=CURSOR
   *
   * Older messages are added before the existing messages.
   * =======================================================
   */

  async function loadOlderMessages() {
    if (
      !conversation ||
      !conversation.hasMore ||
      !conversation.nextCursor ||
      loadingOlderRef.current ||
      loadInProgressRef.current
    ) {
      return;
    }

    const cursor = conversation.nextCursor;

    const container =
      messagesContainerRef.current;

    /*
     * Save the scroll position before inserting older
     * messages so the current visible message remains
     * in the same position.
     */

    if (container) {
      scrollRestoreRef.current = {
        scrollHeight: container.scrollHeight,
        scrollTop: container.scrollTop,
      };
    }

    loadingOlderRef.current = true;

    setLoadingOlder(true);
    setError("");

    const controller = new AbortController();

    olderLoadRef.current = controller;

    try {
      const query = new URLSearchParams({
        before: cursor,
      });

      const response = await fetch(
        `/api/service-bookings/${encodeURIComponent(
          bookingId,
        )}/messages?${query.toString()}`,
        {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        },
      );

      const data: unknown =
        await response.json().catch(() => null);

      if (controller.signal.aborted) {
        scrollRestoreRef.current = null;
        return;
      }

      if (!response.ok) {
        throw new Error(
          getError(
            data,
            "Unable to load older messages.",
          ),
        );
      }

      const olderConversation =
        parseConversation(data);

      hasLoadedOlderRef.current = true;

      setConversation((current) => {
        if (!current) {
          return olderConversation;
        }

        const merged = mergeMessages(
          olderConversation.messages,
          current.messages,
        );

        return {
          ...olderConversation,

          messages: merged,

          total: olderConversation.total,

          hasMore: olderConversation.hasMore,

          nextCursor: olderConversation.nextCursor,
        };
      });
    } catch (loadError) {
      scrollRestoreRef.current = null;

      if (controller.signal.aborted) {
        return;
      }

      console.error(
        "Load older booking messages error:",
        loadError,
      );

      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load older messages.",
      );
    } finally {
      if (olderLoadRef.current === controller) {
        olderLoadRef.current = null;
      }

      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }

  /*
   * =======================================================
   * SCROLL RESTORATION
   * =======================================================
   *
   * 1. Preserve the visible position when loading older
   *    messages.
   *
   * 2. Scroll to the bottom when a new message arrives
   *    only if the user was already near the bottom.
   * =======================================================
   */

  const firstMessageId =
    conversation?.messages[0]?.id ?? null;

  const lastMessageId =
    conversation?.messages[
      conversation.messages.length - 1
    ]?.id ?? null;

  useLayoutEffect(() => {
    const container =
      messagesContainerRef.current;

    if (!container) {
      return;
    }

    /*
     * Restore position after loading older messages.
     */

    const restore = scrollRestoreRef.current;

    if (restore) {
      const heightDifference =
        container.scrollHeight -
        restore.scrollHeight;

      container.scrollTop =
        restore.scrollTop + heightDifference;

      scrollRestoreRef.current = null;

      bottomPinnedRef.current = false;

      return;
    }

    /*
     * Only auto-scroll when the user was already
     * following the latest messages.
     */

    if (bottomPinnedRef.current) {
      container.scrollTop =
        container.scrollHeight;
    }
  }, [
    firstMessageId,
    lastMessageId,
  ]);

  /*
   * =======================================================
   * SCROLL POSITION TRACKING
   * =======================================================
   */

  function handleMessagesScroll() {
    const container =
      messagesContainerRef.current;

    if (!container) {
      return;
    }

    const distanceFromBottom =
      container.scrollHeight -
      container.scrollTop -
      container.clientHeight;

    bottomPinnedRef.current =
      distanceFromBottom <=
      BOTTOM_SCROLL_THRESHOLD;
  }

  /*
   * =======================================================
   * SEND MESSAGE
   * =======================================================
   */

  async function sendMessage(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const message = draft.trim();

    if (
      !message ||
      message.length > MAX_MESSAGE_LENGTH ||
      !conversation?.canSendMessage ||
      sendingRef.current
    ) {
      return;
    }

    sendingRef.current = true;

    setSending(true);
    setError("");

    /*
     * Stop an outstanding latest-page request.
     * It must not overwrite the state after sending.
     */

    activeLoadRef.current?.abort();

    activeLoadRef.current = null;

    loadSequenceRef.current += 1;

    loadInProgressRef.current = false;

    try {
      const response = await fetch(
        `/api/service-bookings/${encodeURIComponent(
          bookingId,
        )}/messages`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            message,
          }),
        },
      );

      const data: unknown =
        await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(
          getError(
            data,
            "Unable to send your message.",
          ),
        );
      }

      /*
       * The server has confirmed that the message
       * was successfully saved.
       */

      if (
        !isRecord(data) ||
        !isRecord(data.messageRecord)
      ) {
        setDraft("");

        setError(
          "Your message was sent, but its response was incomplete. Refresh the conversation to see it.",
        );

        await loadConversation({
          silent: true,
        });

        return;
      }

      const newMessage = parseSentMessage(
        data.messageRecord,
      );

      /*
       * Force the conversation to the latest message
       * after the user sends a message.
       */

      bottomPinnedRef.current = true;

      /*
       * Add the message immediately without duplicating
       * an existing message.
       */

      setConversation((current) => {
        if (!current) {
          return current;
        }

        const alreadyExists =
          current.messages.some(
            (item) => item.id === newMessage.id,
          );

        if (alreadyExists) {
          return current;
        }

        return {
          ...current,

          messages: mergeMessages(
            current.messages,
            [newMessage],
          ),

          total: current.total + 1,
        };
      });

      setDraft("");

      /*
       * Retrieve the authoritative server copy.
       *
       * This also updates message read receipts.
       */

      await loadConversation({
        silent: true,
      });
    } catch (sendError) {
      console.error(
        "Send booking message error:",
        sendError,
      );

      setError(
        sendError instanceof Error
          ? sendError.message
          : "Unable to send your message.",
      );
    } finally {
      sendingRef.current = false;

      setSending(false);
    }
  }

  /*
   * =======================================================
   * BOOKING PERMISSIONS
   * =======================================================
   */

  const status = conversation?.booking.status;

  const canSend =
    conversation?.canSendMessage === true;

  const isClosed =
    status === "DECLINED" ||
    status === "CANCELLED";

  const backHref =
    conversation?.currentUser.role === "SELLER"
      ? "/seller#service-bookings"
      : "/bookings";

  /*
   * =======================================================
   * RENDER
   * =======================================================
   */

  return (
    <main className="min-h-dvh bg-[#FFF7ED] px-3 py-5 text-[#292421] sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[85dvh] max-w-3xl flex-col overflow-hidden rounded-3xl border border-[#EAE6DF] bg-white shadow-sm">

        {/* ------------------------------------------------- */}
        {/* HEADER                                            */}
        {/* ------------------------------------------------- */}

        <header className="border-b border-[#EAE6DF] p-4 sm:p-5">
          <div className="flex items-center gap-3">

            <Link
              href={backHref}
              aria-label="Back to bookings"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#EAE6DF] text-[#6F675F] transition hover:bg-[#FFF7ED]"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>

            <div className="min-w-0 flex-1">

              <p className="text-[10px] font-bold uppercase tracking-wider text-[#FF5A36]">
                ReMarket · Service booking
              </p>

              <h1 className="mt-1 truncate text-base font-extrabold sm:text-lg">
                {conversation?.booking.service.name ||
                  "Booking conversation"}
              </h1>

              {status && (
                <span className="mt-1 inline-flex rounded-full bg-[#FFF5D9] px-2.5 py-1 text-[10px] font-bold text-[#9A6700]">
                  {formatStatus(status)}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                void loadConversation();
              }}
              disabled={
                loading ||
                refreshing ||
                loadingOlder ||
                sending
              }
              aria-label="Refresh conversation"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#EAE6DF] text-[#6F675F] transition hover:bg-[#FFF7ED] disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  refreshing ? "animate-spin" : ""
                }`}
              />
            </button>
          </div>
        </header>

        {/* ------------------------------------------------- */}
        {/* ERROR MESSAGE                                     */}
        {/* ------------------------------------------------- */}

        {error && (
          <div
            role="alert"
            className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-xs leading-5 text-red-700 sm:mx-5"
          >
            {error}
          </div>
        )}

        {/* ------------------------------------------------- */}
        {/* INITIAL LOADING                                    */}
        {/* ------------------------------------------------- */}

        {loading && !conversation ? (
          <div className="flex flex-1 items-center justify-center gap-2 p-10 text-sm text-[#81766D]">
            <LoaderCircle className="h-5 w-5 animate-spin text-[#FF5A36]" />
            Loading conversation...
          </div>
        ) : !conversation ? (

          /* ----------------------------------------------- */
          /* CONVERSATION UNAVAILABLE                         */
          /* ----------------------------------------------- */

          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">

            <MessageSquare className="h-10 w-10 text-[#C4A99F]" />

            <h2 className="mt-4 text-base font-bold">
              Conversation unavailable
            </h2>

            <p className="mt-2 max-w-sm text-xs leading-5 text-[#81766D]">
              {error ||
                "This conversation could not be found or you do not have access to it."}
            </p>

            <div className="mt-5 flex flex-wrap justify-center gap-2">

              <Link
                href="/buyer/login"
                className="rounded-xl border border-[#EAE6DF] px-4 py-2.5 text-xs font-bold"
              >
                Buyer sign in
              </Link>

              <Link
                href="/seller/login"
                className="rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-bold text-white"
              >
                Seller sign in
              </Link>
            </div>
          </div>
        ) : (

          /* ----------------------------------------------- */
          /* CONVERSATION                                     */
          /* ----------------------------------------------- */

          <>

            {/* ============================================= */}
            {/* MESSAGE HISTORY                               */}
            {/* ============================================= */}

            <div
              ref={messagesContainerRef}
              onScroll={handleMessagesScroll}
              className="flex-1 space-y-4 overflow-y-auto bg-[#FCFAF6] p-4 sm:p-6"
            >

              {/* INFORMATION CARD */}

              <div className="mx-auto max-w-md rounded-2xl border border-[#EAE6DF] bg-white p-4 text-center">

                <ShieldCheck className="mx-auto h-5 w-5 text-[#9F2D18]" />

                <p className="mt-2 text-xs font-bold">
                  Booking conversation
                </p>

                <p className="mt-1 text-[11px] leading-5 text-[#81766D]">
                  Messages here relate only to this service booking.
                  Keep booking arrangements within this conversation.
                </p>

                <p className="mt-2 text-[10px] text-[#A49A91]">
                  {conversation.total.toLocaleString("en-NG")} messages
                </p>
              </div>

              {/* LOAD OLDER MESSAGES */}

              {conversation.hasMore && (
                <div className="flex justify-center py-1">

                  <button
                    type="button"
                    onClick={() => {
                      void loadOlderMessages();
                    }}
                    disabled={
                      loadingOlder ||
                      loading ||
                      refreshing
                    }
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-4 py-2 text-xs font-bold text-[#6F675F] transition hover:border-[#FF5A36] hover:text-[#9F2D18] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loadingOlder ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Loading older messages...
                      </>
                    ) : (
                      <>
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Load older messages
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* EMPTY CONVERSATION */}

              {conversation.messages.length === 0 ? (
                <div className="py-12 text-center">

                  <MessageSquare className="mx-auto h-8 w-8 text-[#C4A99F]" />

                  <p className="mt-3 text-sm font-bold text-[#514940]">
                    No messages yet
                  </p>

                  <p className="mt-1 text-xs text-[#81766D]">
                    Your booking conversation will appear here.
                  </p>
                </div>
              ) : (

                /* ----------------------------------------- */
                /* MESSAGE LIST                              */
                /* ----------------------------------------- */

                conversation.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.isOwnMessage
                        ? "justify-end"
                        : "justify-start"
                    }`}
                  >

                    <div
                      className={`max-w-[88%] px-4 py-3 shadow-sm sm:max-w-[75%] ${
                        message.isOwnMessage
                          ? "rounded-2xl rounded-br-sm bg-[#FF5A36] text-white"
                          : "rounded-2xl rounded-bl-sm border border-[#EAE6DF] bg-white text-[#292421]"
                      }`}
                    >

                      {/* SENDER */}

                      <p
                        className={`mb-1 text-[10px] font-bold ${
                          message.isOwnMessage
                            ? "text-white/75"
                            : "text-[#9F2D18]"
                        }`}
                      >
                        {message.isOwnMessage
                          ? "You"
                          : message.senderName}
                      </p>

                      {/* MESSAGE BODY */}

                      <p className="whitespace-pre-wrap break-words text-sm leading-6">
                        {message.body}
                      </p>

                      {/* TIME AND READ STATUS */}

                      <p
                        className={`mt-2 text-right text-[9px] ${
                          message.isOwnMessage
                            ? "text-white/70"
                            : "text-[#A49A91]"
                        }`}
                      >
                        {formatTime(message.createdAt)}

                        {message.isOwnMessage && (
                          <span>
                            {" · "}
                            {message.readAt
                              ? "Read"
                              : "Sent"}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                ))
              )}

            </div>

            {/* ============================================= */}
            {/* MESSAGE COMPOSER                             */}
            {/* ============================================= */}

            <div className="border-t border-[#EAE6DF] bg-white p-4 sm:p-5">

              {!canSend ? (

                <div className="rounded-xl bg-[#FFF5D9] p-3 text-center text-xs leading-5 text-[#8A6200]">
                  {isClosed
                    ? "This booking is closed. You can still read your previous messages."
                    : "Messaging is currently unavailable for this booking."}
                </div>

              ) : (

                <form onSubmit={sendMessage}>

                  <label
                    htmlFor="booking-message"
                    className="mb-2 block text-xs font-bold text-[#514940]"
                  >
                    Your message
                  </label>

                  <textarea
                    id="booking-message"
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.target.value);
                    }}
                    rows={3}
                    maxLength={MAX_MESSAGE_LENGTH}
                    placeholder="Write a message about this booking..."
                    disabled={sending}
                    className="w-full resize-y rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] p-3 text-sm outline-none transition focus:border-[#FF5A36] disabled:opacity-60"
                  />

                  <div className="mt-2 flex items-center justify-between gap-3">

                    <span className="text-[10px] text-[#A49A91]">
                      {draft.length}/{MAX_MESSAGE_LENGTH}
                    </span>

                    <button
                      type="submit"
                      disabled={
                        sending ||
                        !draft.trim() ||
                        draft.trim().length > MAX_MESSAGE_LENGTH
                      }
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 text-xs font-bold text-white transition hover:bg-[#E94C2A] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sending ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}

                      {sending
                        ? "Sending..."
                        : "Send message"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
