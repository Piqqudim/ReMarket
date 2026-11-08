
import {
  NotificationPriority,
  NotificationType,
  Prisma,
} from "@prisma/client";

import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { prisma } from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { checkPublicRateLimit } from "@/lib/rate-limit";
import { createNotification } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/*
 * ---------------------------------------------------------
 * CONFIGURATION
 * ---------------------------------------------------------
 */

const MAX_BODY_SIZE = 12_000;
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_PHONE_LENGTH = 32;
const MAX_ADDRESS_LENGTH = 500;
const MAX_BOOKING_QUANTITY = 1_000;

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;
const MAX_DATABASE_OFFSET = 2_147_483_647;

const ALLOWED_FULFILLMENT_TYPES = [
  "AT_PROVIDER",
  "AT_CUSTOMER",
  "REMOTE",
  "FLEXIBLE",
] as const;

type FulfillmentType =
  (typeof ALLOWED_FULFILLMENT_TYPES)[number];

/*
 * ---------------------------------------------------------
 * BOOKING INCLUDE
 * ---------------------------------------------------------
 */

const bookingInclude = {
  service: {
    select: {
      id: true,
      name: true,
      description: true,

      price: true,
      priceMin: true,
      priceMax: true,

      durationMinutes: true,

      bookingType: true,
      fulfillmentType: true,
      availability: true,

      imageUrl: true,

      category: {
        select: {
          id: true,
          name: true,
          iconKey: true,
        },
      },

      images: {
        select: {
          id: true,
          url: true,
          sortOrder: true,
        },

        orderBy: [
          { sortOrder: "asc" },
          { createdAt: "asc" },
        ],
      },

      business: {
        select: {
          id: true,
          name: true,
          ownerName: true,
          imageUrl: true,
          verification: true,

          location: {
            select: {
              area: true,
              street: true,
            },
          },
        },
      },
    },
  },

  _count: {
    select: {
      messages: true,
    },
  },
} satisfies Prisma.ServiceBookingInclude;

type BookingRecord = Prisma.ServiceBookingGetPayload<{
  include: typeof bookingInclude;
}>;

/*
 * ---------------------------------------------------------
 * SERVICE SELECT FOR BOOKING CREATION
 * ---------------------------------------------------------
 *
 * The service and seller are revalidated inside the same
 * transaction that creates the booking.
 *
 * This ensures the saved sellerId comes from the actual
 * service owner rather than a value submitted by the client.
 * ---------------------------------------------------------
 */

const serviceForBookingSelect = {
  id: true,
  name: true,

  bookingType: true,
  availability: true,
  fulfillmentType: true,

  business: {
    select: {
      id: true,
      name: true,
      ownerId: true,

      owner: {
        select: {
          id: true,
          role: true,
        },
      },
    },
  },
} satisfies Prisma.ServiceSelect;

type ServiceForBooking =
  Prisma.ServiceGetPayload<{
    select: typeof serviceForBookingSelect;
  }>;

/*
 * ---------------------------------------------------------
 * TRANSACTION RESULT
 * ---------------------------------------------------------
 */

type BookingCreationOutcome =
  | {
      success: true;
      booking: BookingRecord;
      sellerId: string;
      serviceName: string;
    }
  | {
      success: false;
      message: string;
      status: number;
    };

/*
 * ---------------------------------------------------------
 * RESPONSE HEADERS
 * ---------------------------------------------------------
 */

function responseHeaders(
  baseHeaders?: HeadersInit
): Headers {
  const headers = new Headers(baseHeaders);

  headers.set(
    "Cache-Control",
    "private, no-store, max-age=0, must-revalidate"
  );

  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");

  return headers;
}

function jsonError(
  message: string,
  status: number,
  headers?: HeadersInit
) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status,
      headers: responseHeaders(headers),
    }
  );
}

/*
 * ---------------------------------------------------------
 * GENERAL HELPERS
 * ---------------------------------------------------------
 */

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function clean(value: unknown): string {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function isFulfillmentType(
  value: unknown
): value is FulfillmentType {
  return (
    typeof value === "string" &&
    ALLOWED_FULFILLMENT_TYPES.includes(
      value as FulfillmentType
    )
  );
}

function parseOptionalString(
  value: unknown,
  maximumLength: number
): string | null | "INVALID" {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (typeof value !== "string") {
    return "INVALID";
  }

  const result = value.trim();

  if (!result) {
    return null;
  }

  if (result.length > maximumLength) {
    return "INVALID";
  }

  return result;
}

/*
 * ---------------------------------------------------------
 * REQUEST BODY SIZE PROTECTION
 * ---------------------------------------------------------
 */

class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body is too large.");
    this.name = "RequestBodyTooLargeError";
  }
}

async function readLimitedRequestBody(
  request: NextRequest,
  maximumBytes: number
): Promise<string> {
  const stream = request.body;

  if (!stream) {
    return "";
  }

  const reader = stream.getReader();

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      totalBytes += value.byteLength;

      if (totalBytes > maximumBytes) {
        try {
          await reader.cancel();
        } catch {
          // The stream may already be closed.
        }

        throw new RequestBodyTooLargeError();
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const completeBody = new Uint8Array(totalBytes);

  let offset = 0;

  for (const chunk of chunks) {
    completeBody.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder("utf-8", {
    fatal: true,
  }).decode(completeBody);
}

/*
 * ---------------------------------------------------------
 * PHONE HELPERS
 * ---------------------------------------------------------
 */

function normalizeNigerianPhone(
  value: string
): string {
  let phone = value.trim().replace(/[^\d+]/g, "");

  if (!phone) {
    return "";
  }

  if (phone.startsWith("00")) {
    phone = phone.slice(2);
  }

  if (phone.startsWith("+")) {
    phone = phone.slice(1);
  }

  if (phone.startsWith("234")) {
    return `+${phone}`;
  }

  if (phone.startsWith("0")) {
    return `+234${phone.slice(1)}`;
  }

  return `+234${phone}`;
}

function isValidNigerianPhone(
  value: string
): boolean {
  return /^\+234\d{10}$/.test(
    normalizeNigerianPhone(value)
  );
}

/*
 * ---------------------------------------------------------
 * QUANTITY VALIDATION
 * ---------------------------------------------------------
 */

function parseBookingQuantity(
  value: unknown
): number | null {
  if (
    value === undefined ||
    value === null
  ) {
    return 1;
  }

  let quantity: number;

  if (typeof value === "number") {
    quantity = value;
  } else if (
    typeof value === "string" &&
    value.trim()
  ) {
    quantity = Number(value.trim());
  } else {
    return null;
  }

  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    quantity > MAX_BOOKING_QUANTITY
  ) {
    return null;
  }

  return quantity;
}

/*
 * ---------------------------------------------------------
 * DATE VALIDATION
 * ---------------------------------------------------------
 *
 * Date-only or timezone-less datetime input is interpreted
 * as Lagos local time (UTC+01:00).
 *
 * Datetimes that already include Z or an explicit timezone
 * offset are preserved.
 *
 * This avoids treating a Lagos datetime-local value as UTC
 * merely because the server runs in a UTC environment.
 * ---------------------------------------------------------
 */

function parseRequestedDate(
  value: unknown
): Date | null | "INVALID" {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  if (
    typeof value !== "string" ||
    value.length > 50
  ) {
    return "INVALID";
  }

  const input = value.trim();

  const match = input.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/i
  );

  if (!match) {
    return "INVALID";
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const hours = Number(match[4]);
  const minutes = Number(match[5]);
  const seconds = Number(match[6] ?? "0");

  const timeZone = match[8] ?? null;

  /*
   * Validate the calendar date.
   *
   * JavaScript Date can normalize some invalid dates,
   * so validate the day against the actual month length.
   */

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59 ||
    seconds < 0 ||
    seconds > 59
  ) {
    return "INVALID";
  }

  const daysInMonth = new Date(
    Date.UTC(year, month, 0)
  ).getUTCDate();

  if (day > daysInMonth) {
    return "INVALID";
  }

  /*
   * Validate an explicitly supplied timezone offset.
   */

  if (
    timeZone &&
    timeZone.toUpperCase() !== "Z"
  ) {
    const offsetMatch = timeZone.match(
      /^([+-])(\d{2}):(\d{2})$/
    );

    if (!offsetMatch) {
      return "INVALID";
    }

    const offsetHours = Number(offsetMatch[2]);
    const offsetMinutes = Number(offsetMatch[3]);

    if (
      offsetHours > 23 ||
      offsetMinutes > 59
    ) {
      return "INVALID";
    }
  }

  /*
   * Append Nigeria's UTC+01:00 offset when the buyer
   * supplies a datetime without an explicit timezone.
   */

  let normalizedInput = input;

  if (!timeZone) {
    if (!match[6]) {
      normalizedInput += ":00";
    }

    normalizedInput += "+01:00";
  }

  const date = new Date(normalizedInput);

  if (
    Number.isNaN(date.getTime()) ||
    date.getTime() <= Date.now()
  ) {
    return "INVALID";
  }

  return date;
}

/*
 * ---------------------------------------------------------
 * BOOKING REFERENCE
 * ---------------------------------------------------------
 */

function generateBookingCode(): string {
  // 80 bits of randomness.
  return (
    `RM-SVC-${randomBytes(10)
      .toString("hex")
      .toUpperCase()}`
  );
}

/*
 * ---------------------------------------------------------
 * AUTHENTICATION
 * ---------------------------------------------------------
 */

async function getAuthenticatedAccount() {
  const session = await getServerSession(authOptions);

  const sessionUser = session?.user as
    | {
        id?: unknown;
      }
    | undefined;

  if (
    typeof sessionUser?.id !== "string" ||
    !sessionUser.id
  ) {
    return {
      account: null,
      error: "Please sign in to continue.",
      status: 401,
    } as const;
  }

  const account = await prisma.user.findUnique({
    where: {
      id: sessionUser.id,
    },

    select: {
      id: true,
      role: true,
    },
  });

  if (!account) {
    return {
      account: null,
      error: "Your account could not be found.",
      status: 401,
    } as const;
  }

  return {
    account,
    error: null,
    status: 200,
  } as const;
}

/*
 * ---------------------------------------------------------
 * PAGINATION
 * ---------------------------------------------------------
 */

function parsePagination(
  searchParams: URLSearchParams
) {
  const rawPage = searchParams.get("page");
  const rawPageSize = searchParams.get("pageSize");

  const page =
    rawPage === null
      ? DEFAULT_PAGE
      : Number(rawPage);

  const requestedPageSize =
    rawPageSize === null
      ? DEFAULT_PAGE_SIZE
      : Number(rawPageSize);

  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(requestedPageSize) ||
    requestedPageSize < 1
  ) {
    return null;
  }

  const pageSize = Math.min(
    requestedPageSize,
    MAX_PAGE_SIZE
  );

  const skip = (page - 1) * pageSize;

  if (
    !Number.isSafeInteger(skip) ||
    skip > MAX_DATABASE_OFFSET
  ) {
    return null;
  }

  return {
    page,
    pageSize,
    skip,
  };
}

/*
 * ---------------------------------------------------------
 * BOOKING RESPONSE FORMAT
 * ---------------------------------------------------------
 */

function formatBooking(
  booking: BookingRecord
) {
  return {
    id: booking.id,
    bookingCode: booking.bookingCode,

    serviceId: booking.serviceId,

    bookingType: booking.bookingType,
    status: booking.status,

    requestedFor:
      booking.requestedFor?.toISOString() ?? null,

    scheduledFor:
      booking.scheduledFor?.toISOString() ?? null,

    quantity: booking.quantity,
    contactPhone: booking.contactPhone,
    buyerMessage: booking.buyerMessage,

    fulfillmentType: booking.fulfillmentType,
    fulfillmentAddress: booking.fulfillmentAddress,

    quotedPrice: booking.quotedPrice,
    quoteMessage: booking.quoteMessage,

    quoteSentAt:
      booking.quoteSentAt?.toISOString() ?? null,

    agreedPrice: booking.agreedPrice,

    quoteAcceptedAt:
      booking.quoteAcceptedAt?.toISOString() ?? null,

    currency: booking.currency,

    declineReason: booking.declineReason,
    cancellationReason: booking.cancellationReason,

    acceptedAt:
      booking.acceptedAt?.toISOString() ?? null,

    declinedAt:
      booking.declinedAt?.toISOString() ?? null,

    cancelledAt:
      booking.cancelledAt?.toISOString() ?? null,

    startedAt:
      booking.startedAt?.toISOString() ?? null,

    completedAt:
      booking.completedAt?.toISOString() ?? null,

    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),

    messageCount: booking._count.messages,

    service: {
      id: booking.service.id,
      name: booking.service.name,
      description: booking.service.description,

      price: booking.service.price,
      priceMin: booking.service.priceMin,
      priceMax: booking.service.priceMax,

      durationMinutes:
        booking.service.durationMinutes,

      bookingType:
        booking.service.bookingType,

      fulfillmentType:
        booking.service.fulfillmentType,

      availability:
        booking.service.availability,

      imageUrl:
        booking.service.imageUrl,

      category: booking.service.category,
      images: booking.service.images,

      seller: {
        id: booking.service.business.id,
        name: booking.service.business.name,
        ownerName: booking.service.business.ownerName,
        imageUrl: booking.service.business.imageUrl,

        verification:
          booking.service.business.verification,

        verified:
          booking.service.business.verification === "VERIFIED",

        location:
          booking.service.business.location,
      },
    },
  };
}

/*
 * =========================================================
 * GET /api/service-bookings
 * =========================================================
 *
 * Returns the authenticated BUYER's own bookings.
 *
 * The status summary covers all bookings, independently
 * of pagination.
 *
 * Sellers use a separate seller booking endpoint.
 * =========================================================
 */

export async function GET(
  request: NextRequest
) {
  const rateLimit = checkPublicRateLimit(
    request,
    "request-read"
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        bookings: [],
        total: 0,
        error:
          "Too many booking requests. Please try again shortly.",
      },
      {
        status: 429,
        headers: responseHeaders(rateLimit.headers),
      }
    );
  }

  try {
    /*
     * AUTHENTICATION
     */

    const {
      account,
      error,
      status,
    } = await getAuthenticatedAccount();

    if (!account) {
      return jsonError(
        error ?? "Authentication required.",
        status,
        rateLimit.headers
      );
    }

    if (account.role !== "BUYER") {
      return jsonError(
        "Only buyer accounts can access this booking history.",
        403,
        rateLimit.headers
      );
    }

    /*
     * PAGINATION
     */

    const pagination = parsePagination(
      request.nextUrl.searchParams
    );

    if (!pagination) {
      return jsonError(
        "Invalid pagination parameters.",
        400,
        rateLimit.headers
      );
    }

    /*
     * BUYER OWNERSHIP
     */

    const where: Prisma.ServiceBookingWhereInput = {
      buyerId: account.id,
    };

    /*
     * FETCH BOOKINGS AND ALL-TIME STATUS COUNTS
     */

    const [
      total,
      bookings,
      statusCounts,
    ] = await Promise.all([
      prisma.serviceBooking.count({
        where,
      }),

      prisma.serviceBooking.findMany({
        where,

        include: bookingInclude,

        orderBy: [
          {
            createdAt: "desc",
          },
          {
            id: "desc",
          },
        ],

        skip: pagination.skip,
        take: pagination.pageSize,
      }),

      prisma.serviceBooking.groupBy({
        by: ["status"],

        where,

        _count: {
          _all: true,
        },
      }),
    ]);

    /*
     * BUILD STATUS SUMMARY
     */

    const counts: Record<string, number> = {
      PENDING: 0,
      AWAITING_BUYER: 0,
      ACCEPTED: 0,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      DECLINED: 0,
      CANCELLED: 0,
    };

    for (const item of statusCounts) {
      counts[item.status] = item._count._all;
    }

    const summaryTotal = Object.values(counts).reduce(
      (sum, count) => sum + count,
      0
    );

    /*
     * PAGINATION METADATA
     */

    const totalPages = Math.ceil(
      total / pagination.pageSize
    );

    /*
     * SUCCESS RESPONSE
     */

    return NextResponse.json(
      {
        bookings: bookings.map(formatBooking),

        summary: {
          total: summaryTotal,
          ...counts,
        },

        page: pagination.page,
        pageSize: pagination.pageSize,

        total,
        totalPages,

        hasNextPage:
          pagination.page < totalPages,

        hasPreviousPage:
          pagination.page > 1 && totalPages > 0,
      },
      {
        headers: responseHeaders(rateLimit.headers),
      }
    );
  } catch (error) {
    console.error(
      "Get service bookings API error:",
      error
    );

    return jsonError(
      "Unable to load your bookings.",
      500,
      rateLimit.headers
    );
  }
}

/*
 * =========================================================
 * POST /api/service-bookings
 * =========================================================
 *
 * Creates:
 *
 * 1. A service booking.
 * 2. An initial conversation message, if supplied.
 * 3. An in-app notification for the seller.
 *
 * The booking and initial message are created in one
 * serializable database transaction.
 *
 * Notification delivery happens after that transaction.
 * =========================================================
 */

export async function POST(
  request: NextRequest
) {
  const rateLimit = checkPublicRateLimit(
    request,
    "request-create"
  );

  if (!rateLimit.allowed) {
    return jsonError(
      "Too many booking requests. Please try again shortly.",
      429,
      rateLimit.headers
    );
  }

  try {
    /*
     * AUTHENTICATION
     */

    const {
      account,
      error,
      status,
    } = await getAuthenticatedAccount();

    if (!account) {
      return jsonError(
        error ?? "Authentication required.",
        status,
        rateLimit.headers
      );
    }

    if (account.role !== "BUYER") {
      return jsonError(
        "Only buyer accounts can create service bookings.",
        403,
        rateLimit.headers
      );
    }

    /*
     * BODY SIZE VALIDATION
     */

    const contentLengthHeader =
      request.headers.get("content-length");

    if (contentLengthHeader !== null) {
      const contentLength = Number(
        contentLengthHeader
      );

      if (
        !Number.isSafeInteger(contentLength) ||
        contentLength < 0 ||
        contentLength > MAX_BODY_SIZE
      ) {
        return jsonError(
          "Request body is too large or invalid.",
          413,
          rateLimit.headers
        );
      }
    }

    /*
     * READ BODY
     */

    let rawBody: string;

    try {
      rawBody = await readLimitedRequestBody(
        request,
        MAX_BODY_SIZE
      );
    } catch (bodyError) {
      if (
        bodyError instanceof RequestBodyTooLargeError
      ) {
        return jsonError(
          "Request body is too large.",
          413,
          rateLimit.headers
        );
      }

      return jsonError(
        "Unable to read the request body. Ensure it is valid UTF-8.",
        400,
        rateLimit.headers
      );
    }

    /*
     * PARSE JSON
     */

    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return jsonError(
        "Invalid request body.",
        400,
        rateLimit.headers
      );
    }

    if (!isRecord(body)) {
      return jsonError(
        "Invalid request body.",
        400,
        rateLimit.headers
      );
    }

    /*
     * SERVICE ID
     */

    const serviceId = clean(body.serviceId);

    if (
      !serviceId ||
      serviceId.length > 100
    ) {
      return jsonError(
        "A valid service ID is required.",
        400,
        rateLimit.headers
      );
    }

    /*
     * BUYER MESSAGE
     */

    const buyerMessageResult = parseOptionalString(
      body.buyerMessage,
      MAX_MESSAGE_LENGTH
    );

    if (buyerMessageResult === "INVALID") {
      return jsonError(
        `Your booking message cannot exceed ${MAX_MESSAGE_LENGTH} characters.`,
        400,
        rateLimit.headers
      );
    }

    const buyerMessage = buyerMessageResult;

    /*
     * CONTACT PHONE
     */

    const rawPhoneResult = parseOptionalString(
      body.contactPhone,
      MAX_PHONE_LENGTH
    );

    if (rawPhoneResult === "INVALID") {
      return jsonError(
        "Your contact number is invalid or too long.",
        400,
        rateLimit.headers
      );
    }

    const rawPhone = rawPhoneResult;

    if (
      rawPhone &&
      !isValidNigerianPhone(rawPhone)
    ) {
      return jsonError(
        "Enter a valid Nigerian phone number.",
        400,
        rateLimit.headers
      );
    }

    const contactPhone = rawPhone
      ? normalizeNigerianPhone(rawPhone)
      : null;

    /*
     * QUANTITY
     */

    const quantity = parseBookingQuantity(
      body.quantity
    );

    if (quantity === null) {
      return jsonError(
        `Quantity must be a whole number between 1 and ${MAX_BOOKING_QUANTITY}.`,
        400,
        rateLimit.headers
      );
    }

    /*
     * REQUESTED DATE
     */

    const requestedFor = parseRequestedDate(
      body.requestedFor
    );

    if (requestedFor === "INVALID") {
      return jsonError(
        "Enter a valid future requested date and time.",
        400,
        rateLimit.headers
      );
    }

    /*
     * FULFILLMENT ADDRESS
     */

    const fulfillmentAddressResult =
      parseOptionalString(
        body.fulfillmentAddress,
        MAX_ADDRESS_LENGTH
      );

    if (
      fulfillmentAddressResult === "INVALID"
    ) {
      return jsonError(
        "The fulfillment address is invalid or too long.",
        400,
        rateLimit.headers
      );
    }

    const fulfillmentAddress =
      fulfillmentAddressResult;

    /*
     * REQUESTED FULFILLMENT METHOD
     */

    let requestedFulfillment: FulfillmentType | null = null;

    if (
      body.fulfillmentType !== undefined &&
      body.fulfillmentType !== null &&
      body.fulfillmentType !== ""
    ) {
      if (!isFulfillmentType(body.fulfillmentType)) {
        return jsonError(
          "Invalid fulfillment method.",
          400,
          rateLimit.headers
        );
      }

      requestedFulfillment = body.fulfillmentType;
    }

    /*
     * BOOKING REFERENCE
     */

    const bookingCode = generateBookingCode();

    /*
     * CREATE BOOKING AND INITIAL MESSAGE
     *
     * The service, business and seller are revalidated
     * inside the transaction.
     *
     * sellerId is always derived from the database.
     * The browser cannot assign a booking to another seller.
     */

    const creationResult =
      await prisma.$transaction(
        async (
          tx
        ): Promise<BookingCreationOutcome> => {
          /*
           * LOAD THE CURRENT ACTIVE SERVICE
           */

          const service =
            await tx.service.findFirst({
              where: {
                id: serviceId,
                status: "ACTIVE",
                deletedAt: null,

                business: {
                  is: {
                    status: "ACTIVE",
                    deletedAt: null,
                  },
                },
              },

              select: serviceForBookingSelect,
            });

          if (!service) {
            return {
              success: false,
              message:
                "This service is no longer available.",
              status: 404,
            };
          }

          /*
           * CHECK SERVICE AVAILABILITY
           *
           * ASK_SELLER is allowed because the buyer is
           * submitting a request for the seller to review.
           */

          if (service.availability === "UNAVAILABLE") {
            return {
              success: false,
              message:
                "This service is currently unavailable for booking.",
              status: 409,
            };
          }

          /*
           * RESOLVE SELLER
           */

          const seller = service.business.owner;
          const sellerId = service.business.ownerId;

          if (
            !seller ||
            !sellerId ||
            seller.id !== sellerId ||
            seller.role !== "SELLER"
          ) {
            return {
              success: false,
              message:
                "This service provider has not enabled account-based bookings yet.",
              status: 409,
            };
          }

          /*
           * PREVENT SELF-BOOKING
           */

          if (sellerId === account.id) {
            return {
              success: false,
              message:
                "You cannot book your own service.",
              status: 403,
            };
          }

          /*
           * VALIDATE BOOKING TYPE
           *
           * The merchant's configured booking type is
           * authoritative. Buyers cannot override it.
           */

          const bookingType = service.bookingType;

          if (
            bookingType === "APPOINTMENT" &&
            !requestedFor
          ) {
            return {
              success: false,
              message:
                "Please select your preferred appointment date and time.",
              status: 400,
            };
          }

          /*
           * RECHECK DATE
           *
           * A selected date could have passed between
           * request validation and transaction execution.
           */

          if (
            requestedFor &&
            requestedFor.getTime() <= Date.now()
          ) {
            return {
              success: false,
              message:
                "The requested date must be in the future.",
              status: 400,
            };
          }

          /*
           * RESOLVE FULFILLMENT METHOD
           */

          let fulfillmentType: FulfillmentType;

          if (
            service.fulfillmentType === "FLEXIBLE"
          ) {
            fulfillmentType =
              requestedFulfillment ?? "FLEXIBLE";
          } else {
            if (
              requestedFulfillment &&
              requestedFulfillment !==
                service.fulfillmentType
            ) {
              return {
                success: false,
                message:
                  "The selected fulfillment method is not supported by this service.",
                status: 400,
              };
            }

            fulfillmentType =
              service.fulfillmentType;
          }

          /*
           * VALIDATE FULFILLMENT ADDRESS
           *
           * An address is required for AT_CUSTOMER.
           * An address is not stored for other methods.
           */

          if (
            fulfillmentType === "AT_CUSTOMER" &&
            !fulfillmentAddress
          ) {
            return {
              success: false,
              message:
                "Please provide the address where the service should be delivered.",
              status: 400,
            };
          }

          if (
            fulfillmentType !== "AT_CUSTOMER" &&
            fulfillmentAddress
          ) {
            return {
              success: false,
              message:
                "A delivery address can only be supplied when the service is delivered at your location.",
              status: 400,
            };
          }

          /*
           * CREATE BOOKING
           */

          const created =
            await tx.serviceBooking.create({
              data: {
                bookingCode,

                serviceId: service.id,

                buyerId: account.id,
                sellerId,

                bookingType,
                status: "PENDING",

                requestedFor,
                quantity,

                contactPhone,
                buyerMessage,

                fulfillmentType,

                fulfillmentAddress:
                  fulfillmentType === "AT_CUSTOMER"
                    ? fulfillmentAddress
                    : null,

                currency: "NGN",
              },

              select: {
                id: true,
              },
            });

          /*
           * CREATE INITIAL CONVERSATION MESSAGE
           *
           * The original enquiry is also saved in
           * buyerMessage on the booking record.
           *
           * Saving it here creates the initial entry
           * in the booking's message history.
           */

          if (buyerMessage) {
            await tx.serviceBookingMessage.create({
              data: {
                bookingId: created.id,
                senderId: account.id,
                body: buyerMessage,
              },
            });
          }

          /*
           * LOAD COMPLETE CREATED BOOKING
           */

          const createdBooking =
            await tx.serviceBooking.findUnique({
              where: {
                id: created.id,
              },

              include: bookingInclude,
            });

          if (!createdBooking) {
            return {
              success: false,
              message:
                "Your booking could not be retrieved after creation.",
              status: 500,
            };
          }

          return {
            success: true,
            booking: createdBooking,
            sellerId,
            serviceName: service.name,
          };
        },

        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
        }
      );

    /*
     * HANDLE VALIDATION FAILURE
     */

    if (!creationResult.success) {
      return jsonError(
        creationResult.message,
        creationResult.status,
        rateLimit.headers
      );
    }

    /*
     * NOTIFY SELLER
     *
     * The booking has already been committed.
     *
     * A notification failure must not undo a successfully
     * created booking or its initial conversation message.
     */

    const booking = creationResult.booking;
    const sellerId = creationResult.sellerId;

    try {
      await createNotification({
        userId: sellerId,

        type: NotificationType.SERVICE_BOOKING_CREATED,

        title: "New service booking",

        message:
          `A buyer has requested your service: ${creationResult.serviceName}.`,

        priority: NotificationPriority.HIGH,

        data: {
          bookingId: booking.id,
          bookingCode: booking.bookingCode,
          serviceId: booking.serviceId,
          serviceName: creationResult.serviceName,
          href: "/seller#service-bookings",
        },

        dedupeKey:
          `service-booking:${booking.id}:` +
          `created:seller:${sellerId}`,
      });
    } catch (notificationError) {
      console.error(
        "Service booking notification error:",
        notificationError
      );
    }

    /*
     * SUCCESS RESPONSE
     */

    return NextResponse.json(
      {
        message:
          "Your booking request has been submitted.",

        booking: formatBooking(booking),
      },

      {
        status: 201,
        headers: responseHeaders(rateLimit.headers),
      }
    );
  } catch (error) {
    console.error(
      "Create service booking API error:",
      error
    );

    if (
      error instanceof Prisma.PrismaClientKnownRequestError
    ) {
      if (error.code === "P2002") {
        return jsonError(
          "A booking reference conflict occurred. Please try again.",
          409,
          rateLimit.headers
        );
      }

      if (error.code === "P2034") {
        return jsonError(
          "The service or booking changed while your request was being processed. Please try again.",
          409,
          rateLimit.headers
        );
      }
    }

    return jsonError(
      "Unable to submit your booking. Please try again.",
      500,
      rateLimit.headers
    );
  }
}
