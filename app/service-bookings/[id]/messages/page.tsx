
"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, LoaderCircle, MessageSquare, RefreshCw, Send, ShieldCheck } from "lucide-react";

type BookingStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "COMPLETED";

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
  booking: { id: string; status: BookingStatus; service: { id: string; name: string } };
  currentUser: { id: string; name: string | null; role: "BUYER" | "SELLER" };
  messages: ChatMessage[];
  hasMore: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getError(data: unknown, fallback: string): string {
  return isRecord(data) && typeof data.error === "string" ? data.error : fallback;
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

function formatStatus(status: BookingStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export default function ServiceBookingMessagesPage() {
  const params = useParams<{ id: string }>();
  const bookingId = params.id;

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [hasMore, setHasMore] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  const loadConversation = useCallback(async (signal?: AbortSignal) => {
    if (!signal) setRefreshing(true);
    setError("");

    try {
      const response = await fetch(
        `/api/service-bookings/${encodeURIComponent(bookingId)}/messages`,
        {
          cache: "no-store",
          ...(signal ? { signal } : {}),
        },
      );

      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getError(data, "Unable to load this conversation."));
      }

      if (!isRecord(data) || !isRecord(data.booking) || !isRecord(data.currentUser) || !Array.isArray(data.messages)) {
        throw new Error("The conversation response is incomplete.");
      }

      const rawBooking = data.booking;
      const rawService = isRecord(rawBooking.service) ? rawBooking.service : {};
      const rawUser = data.currentUser;

      const validStatuses: BookingStatus[] = [
        "PENDING", "ACCEPTED", "DECLINED", "CANCELLED", "COMPLETED",
      ];

      const rawStatus = rawBooking.status;
      if (
        typeof rawBooking.id !== "string" ||
        typeof rawService.id !== "string" ||
        typeof rawService.name !== "string" ||
        typeof rawUser.id !== "string" ||
        (rawUser.role !== "BUYER" && rawUser.role !== "SELLER") ||
        typeof rawStatus !== "string" ||
        !validStatuses.includes(rawStatus as BookingStatus)
      ) {
        throw new Error("The conversation information is invalid.");
      }

      const messages: ChatMessage[] = data.messages
        .filter(isRecord)
        .filter((item) =>
          typeof item.id === "string" &&
          typeof item.body === "string" &&
          typeof item.senderId === "string" &&
          typeof item.createdAt === "string",
        )
        .map((item) => ({
          id: item.id as string,
          body: item.body as string,
          senderId: item.senderId as string,
          senderName: typeof item.senderName === "string" ? item.senderName : "ReMarket user",
          isOwnMessage: item.isOwnMessage === true,
          readAt: typeof item.readAt === "string" ? item.readAt : null,
          createdAt: item.createdAt as string,
        }));

      if (signal?.aborted) return;

      setConversation({
        booking: {
          id: rawBooking.id,
          status: rawStatus as BookingStatus,
          service: { id: rawService.id, name: rawService.name },
        },
        currentUser: {
          id: rawUser.id,
          name: typeof rawUser.name === "string" ? rawUser.name : null,
          role: rawUser.role,
        },
        messages,
        hasMore: data.hasMore === true,
      });

      setHasMore(data.hasMore === true);
    } catch (loadError) {
      if (signal?.aborted) return;
      setError(loadError instanceof Error ? loadError.message : "Unable to load this conversation.");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [bookingId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadConversation(controller.signal);
    return () => controller.abort();
  }, [loadConversation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation?.messages.length]);

  const canSend = conversation?.booking.status === "ACCEPTED" ||
    conversation?.booking.status === "COMPLETED";

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const message = draft.trim();
    if (!message || !canSend || sending) return;

    setSending(true);
    setError("");

    try {
      const response = await fetch(
        `/api/service-bookings/${encodeURIComponent(bookingId)}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        },
      );

      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(getError(data, "Unable to send your message."));
      }

      if (!isRecord(data) || !isRecord(data.messageRecord)) {
        throw new Error("Your message was sent, but the response was incomplete. Refresh the conversation.");
      }

      const item = data.messageRecord;

      if (
        typeof item.id !== "string" ||
        typeof item.body !== "string" ||
        typeof item.senderId !== "string" ||
        typeof item.createdAt !== "string"
      ) {
        throw new Error("Your message was sent, but its response was invalid. Refresh the conversation.");
      }

      const newMessage: ChatMessage = {
        id: item.id,
        body: item.body,
        senderId: item.senderId,
        senderName: typeof item.senderName === "string" ? item.senderName : "You",
        isOwnMessage: true,
        readAt: typeof item.readAt === "string" ? item.readAt : null,
        createdAt: item.createdAt,
      };

      setConversation((current) => current
        ? { ...current, messages: [...current.messages, newMessage] }
        : current);
      setDraft("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send your message.");
    } finally {
      setSending(false);
    }
  }

  const backHref = conversation?.currentUser.role === "SELLER"
    ? "/seller#service-bookings"
    : "/account";

  const status = conversation?.booking.status;

  return (
    <main className="min-h-dvh bg-[#FFF7ED] px-3 py-5 text-[#292421] sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[85dvh] max-w-3xl flex-col overflow-hidden rounded-3xl border border-[#EAE6DF] bg-white shadow-sm">
        <header className="border-b border-[#EAE6DF] p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <Link
              href={backHref}
              aria-label="Back to bookings"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#EAE6DF] text-[#6F675F] hover:bg-[#FFF7ED]"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>

            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[#FF5A36]">
                ReMarket · Service booking
              </p>
              <h1 className="mt-1 truncate text-base font-extrabold sm:text-lg">
                {conversation?.booking.service.name || "Booking conversation"}
              </h1>
              {status && (
                <span className="mt-1 inline-flex rounded-full bg-[#FFF5D9] px-2.5 py-1 text-[10px] font-bold text-[#9A6700]">
                  {formatStatus(status)}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => void loadConversation()}
              disabled={loading || refreshing}
              aria-label="Refresh conversation"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#EAE6DF] text-[#6F675F] hover:bg-[#FFF7ED] disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          </div>
        </header>

        {error && (
          <div role="alert" className="mx-4 mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-xs leading-5 text-red-700 sm:mx-5">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 p-10 text-sm text-[#81766D]">
            <LoaderCircle className="h-5 w-5 animate-spin text-[#FF5A36]" />
            Loading conversation...
          </div>
        ) : !conversation ? (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <MessageSquare className="h-10 w-10 text-[#C4A99F]" />
            <h2 className="mt-4 text-base font-bold">Conversation unavailable</h2>
            <p className="mt-2 max-w-sm text-xs leading-5 text-[#81766D]">
              {error || "This conversation could not be found or you do not have access to it."}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link href="/buyer/login" className="rounded-xl border border-[#EAE6DF] px-4 py-2.5 text-xs font-bold">
                Buyer sign in
              </Link>
              <Link href="/seller/login" className="rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-bold text-white">
                Seller sign in
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 space-y-4 overflow-y-auto bg-[#FCFAF6] p-4 sm:p-6">
              <div className="mx-auto max-w-md rounded-2xl border border-[#EAE6DF] bg-white p-4 text-center">
                <ShieldCheck className="mx-auto h-5 w-5 text-[#9F2D18]" />
                <p className="mt-2 text-xs font-bold">Booking conversation</p>
                <p className="mt-1 text-[11px] leading-5 text-[#81766D]">
                  Messages here relate only to this service booking. Keep booking arrangements within this conversation.
                </p>
              </div>

              {hasMore && (
                <p className="text-center text-[10px] text-[#A49A91]">
                  Showing the latest 100 messages.
                </p>
              )}

              {conversation.messages.length === 0 ? (
                <div className="py-12 text-center">
                  <MessageSquare className="mx-auto h-8 w-8 text-[#C4A99F]" />
                  <p className="mt-3 text-sm font-bold text-[#514940]">No messages yet</p>
                  <p className="mt-1 text-xs text-[#81766D]">
                    Your booking conversation will appear here.
                  </p>
                </div>
              ) : (
                conversation.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.isOwnMessage ? "justify-end" : "justify-start"}`}
                  >
                    <div className={`max-w-[88%] sm:max-w-[75%] ${
                      message.isOwnMessage
                        ? "rounded-2xl rounded-br-sm bg-[#FF5A36] text-white"
                        : "rounded-2xl rounded-bl-sm border border-[#EAE6DF] bg-white text-[#292421]"
                    } px-4 py-3 shadow-sm`}>
                      <p className={`mb-1 text-[10px] font-bold ${
                        message.isOwnMessage ? "text-white/75" : "text-[#9F2D18]"
                      }`}>
                        {message.isOwnMessage ? "You" : message.senderName}
                      </p>
                      <p className="whitespace-pre-wrap break-words text-sm leading-6">
                        {message.body}
                      </p>
                      <p className={`mt-2 text-right text-[9px] ${
                        message.isOwnMessage ? "text-white/70" : "text-[#A49A91]"
                      }`}>
                        {formatTime(message.createdAt)}
                        {message.isOwnMessage && (
                          <span> · {message.readAt ? "Read" : "Sent"}</span>
                        )}
                      </p>
                    </div>
                  </div>
                ))
              )}

              <div ref={bottomRef} />
            </div>

            <div className="border-t border-[#EAE6DF] bg-white p-4 sm:p-5">
              {!canSend ? (
                <div className="rounded-xl bg-[#FFF5D9] p-3 text-center text-xs leading-5 text-[#8A6200]">
                  {status === "PENDING"
                    ? "Messaging becomes available when the provider accepts this booking."
                    : "This booking is no longer accepting messages."}
                </div>
              ) : (
                <form onSubmit={sendMessage}>
                  <label htmlFor="booking-message" className="mb-2 block text-xs font-bold text-[#514940]">
                    Your message
                  </label>
                  <textarea
                    id="booking-message"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="Write a message about this booking..."
                    disabled={sending}
                    className="w-full resize-y rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] p-3 text-sm outline-none focus:border-[#FF5A36] disabled:opacity-60"
                  />
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="text-[10px] text-[#A49A91]">{draft.length}/2000</span>
                    <button
                      type="submit"
                      disabled={sending || !draft.trim()}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 text-xs font-bold text-white transition hover:bg-[#E94C2A] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {sending
                        ? <LoaderCircle className="h-4 w-4 animate-spin" />
                        : <Send className="h-4 w-4" />}
                      {sending ? "Sending..." : "Send message"}
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
