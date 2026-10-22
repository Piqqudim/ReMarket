
import { NextRequest } from "next/server";

type RateLimitConfig = {
  limit: number;
  windowMs: number;
};

type RateLimitState = {
  count: number;
  resetAt: number;
};

export type PublicRateLimitScope =
  | "categories"
  | "featured"
  | "search"
  | "near-me"
  | "recent-products"
  | "request-read"
  | "request-create"
  | "upload"
  | "contact-event"
  | "business-view-event";

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
  headers: Headers;
};

const PUBLIC_RATE_LIMITS: Record<
  PublicRateLimitScope,
  RateLimitConfig
> = {
  // Lightweight public reads.
  categories: {
    limit: 60,
    windowMs: 60_000,
  },

  featured: {
    limit: 30,
    windowMs: 60_000,
  },

  search: {
    limit: 60,
    windowMs: 60_000,
  },

  "near-me": {
    limit: 30,
    windowMs: 60_000,
  },

  // Recently added products: lightweight public read.
  "recent-products": {
    limit: 60,
    windowMs: 60_000,
  },

  // Request lookup may expose buyer request information.
  "request-read": {
    limit: 20,
    windowMs: 60_000,
  },

  // Request creation performs database writes and matching.
  "request-create": {
    limit: 5,
    windowMs: 60_000,
  },

  // Uploads consume server and media-provider resources.
  upload: {
    limit: 10,
    windowMs: 5 * 60_000,
  },

  // Analytics writes should not be easy to inflate artificially.
  "contact-event": {
    limit: 30,
    windowMs: 60_000,
  },

  "business-view-event": {
    limit: 60,
    windowMs: 60_000,
  },
};

/**
 * In-memory fixed-window rate limiter.
 *
 * This does not use Prisma or PostgreSQL, so checking a
 * rate limit does not create additional database traffic.
 *
 * Limits are local to each running application instance.
 * They are not shared globally across Vercel instances.
 */
const store = new Map<string, RateLimitState>();

const MAX_STORE_ENTRIES = 10_000;
const CLEANUP_INTERVAL_MS = 30_000;

let nextCleanupAt = 0;

function getClientIp(request: NextRequest): string {
  /*
   * Prefer the IP supplied by the hosting proxy.
   *
   * The deployment proxy must overwrite or sanitize
   * these headers. Otherwise, clients might spoof them
   * to bypass IP-based rate limiting.
   */
  const realIp = request.headers
    .get("x-real-ip")
    ?.trim();

  if (realIp) {
    return realIp;
  }

  const forwardedFor = request.headers.get(
    "x-forwarded-for"
  );

  if (forwardedFor) {
    const firstIp = forwardedFor
      .split(",")[0]
      ?.trim();

    if (firstIp) {
      return firstIp;
    }
  }

  // Requests without a detectable IP share one bucket.
  return "unknown";
}

function cleanupExpiredEntries(now: number): void {
  for (const [key, state] of store) {
    if (state.resetAt <= now) {
      store.delete(key);
    }
  }
}

/**
 * Run the cleanup scan periodically instead of scanning
 * the entire Map on every incoming request.
 */
function cleanupExpiredEntriesIfDue(now: number): void {
  if (now < nextCleanupAt) {
    return;
  }

  nextCleanupAt = now + CLEANUP_INTERVAL_MS;

  cleanupExpiredEntries(now);
}

function enforceStoreLimit(): void {
  if (store.size <= MAX_STORE_ENTRIES) {
    return;
  }

  /*
   * Map iteration follows insertion order.
   * Evict the oldest inserted buckets until the store
   * returns to its configured maximum size.
   */
  const entriesToRemove =
    store.size - MAX_STORE_ENTRIES;

  let removed = 0;

  for (const key of store.keys()) {
    store.delete(key);
    removed += 1;

    if (removed >= entriesToRemove) {
      break;
    }
  }
}

function makeHeaders(
  limit: number,
  remaining: number,
  resetAt: number,
  retryAfterSeconds: number
): Headers {
  const headers = new Headers();

  headers.set(
    "X-RateLimit-Limit",
    String(limit)
  );

  headers.set(
    "X-RateLimit-Remaining",
    String(Math.max(0, remaining))
  );

  headers.set(
    "X-RateLimit-Reset",
    String(Math.ceil(resetAt / 1000))
  );

  if (retryAfterSeconds > 0) {
    headers.set(
      "Retry-After",
      String(retryAfterSeconds)
    );
  }

  return headers;
}

export function checkPublicRateLimit(
  request: NextRequest,
  scope: PublicRateLimitScope
): RateLimitResult {
  const config = PUBLIC_RATE_LIMITS[scope];
  const now = Date.now();

  cleanupExpiredEntriesIfDue(now);

  const clientIp = getClientIp(request);
  const key = `${scope}:${clientIp}`;
  const existing = store.get(key);

  /*
   * Start a new fixed window when the client has no
   * existing bucket or the previous window has expired.
   */
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + config.windowMs;
    const count = 1;

    store.set(key, {
      count,
      resetAt,
    });

    enforceStoreLimit();

    const remaining = Math.max(
      0,
      config.limit - count
    );

    return {
      allowed: true,
      limit: config.limit,
      remaining,
      resetAt,
      retryAfterSeconds: 0,
      headers: makeHeaders(
        config.limit,
        remaining,
        resetAt,
        0
      ),
    };
  }

  existing.count += 1;

  const remaining = Math.max(
    0,
    config.limit - existing.count
  );

  const allowed =
    existing.count <= config.limit;

  const retryAfterSeconds = allowed
    ? 0
    : Math.max(
        1,
        Math.ceil(
          (existing.resetAt - now) / 1000
        )
      );

  enforceStoreLimit();

  return {
    allowed,
    limit: config.limit,
    remaining,
    resetAt: existing.resetAt,
    retryAfterSeconds,
    headers: makeHeaders(
      config.limit,
      remaining,
      existing.resetAt,
      retryAfterSeconds
    ),
  };
}
