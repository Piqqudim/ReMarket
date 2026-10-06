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
  /*
   * Lightweight public reads.
   */
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

  /*
   * Request lookup is protected more aggressively
   * because it can expose buyer request information.
   */
  "request-read": {
    limit: 20,
    windowMs: 60_000,
  },

  /*
   * Creating requests is more expensive because it
   * triggers database writes and matching.
   */
  "request-create": {
    limit: 5,
    windowMs: 60_000,
  },

  /*
   * Uploads are expensive because they consume server
   * memory and Cloudinary resources.
   */
  upload: {
    limit: 10,
    windowMs: 5 * 60_000,
  },

  /*
   * Analytics writes should be restricted to prevent
   * artificial inflation of event tables.
   */
  "contact-event": {
    limit: 30,
    windowMs: 60_000,
  },

  "business-view-event": {
    limit: 60,
    windowMs: 60_000,
  },
};

/*
 * ------------------------------------------------
 * IN-MEMORY RATE-LIMIT STORE
 * ------------------------------------------------
 *
 * This deliberately does not use Prisma/Postgres.
 *
 * Public abuse protection should not create more
 * database traffic, especially with ReMarket's
 * existing connection-pool constraints.
 *
 * Important:
 * In-memory limits are per running application
 * instance. They are still useful protection on
 * each instance, but a distributed rate limiter can
 * be introduced later if ReMarket needs globally
 * consistent limits across many instances.
 */

const store = new Map<
  string,
  RateLimitState
>();

const MAX_STORE_ENTRIES = 10_000;

function getClientIp(
  request: NextRequest
): string {
  /*
   * Vercel/proxy environments commonly provide
   * x-real-ip and/or x-forwarded-for.
   *
   * Prefer x-real-ip when available.
   */
  const realIp =
    request.headers.get(
      "x-real-ip"
    )?.trim();

  if (realIp) {
    return realIp;
  }

  const forwardedFor =
    request.headers.get(
      "x-forwarded-for"
    );

  if (forwardedFor) {
    const firstIp =
      forwardedFor
        .split(",")[0]
        ?.trim();

    if (firstIp) {
      return firstIp;
    }
  }

  /*
   * All requests without a detectable address
   * share this fallback bucket.
   *
   * This is preferable to trusting a browser-supplied
   * custom identifier as an IP substitute.
   */
  return "unknown";
}

function cleanupExpiredEntries(
  now: number
): void {
  for (const [
    key,
    state,
  ] of store) {
    if (state.resetAt <= now) {
      store.delete(key);
    }
  }
}

function enforceStoreLimit(): void {
  if (
    store.size <=
    MAX_STORE_ENTRIES
  ) {
    return;
  }

  /*
   * Map iteration order is insertion order.
   * Remove the oldest entries until the store
   * returns to a safe bounded size.
   */
  const entriesToRemove =
    store.size -
    MAX_STORE_ENTRIES;

  let removed = 0;

  for (const key of store.keys()) {
    store.delete(key);
    removed += 1;

    if (
      removed >=
      entriesToRemove
    ) {
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
  const headers =
    new Headers();

  headers.set(
    "X-RateLimit-Limit",
    String(limit)
  );

  headers.set(
    "X-RateLimit-Remaining",
    String(
      Math.max(
        0,
        remaining
      )
    )
  );

  headers.set(
    "X-RateLimit-Reset",
    String(
      Math.ceil(
        resetAt / 1000
      )
    )
  );

  if (
    retryAfterSeconds > 0
  ) {
    headers.set(
      "Retry-After",
      String(
        retryAfterSeconds
      )
    );
  }

  return headers;
}

export function checkPublicRateLimit(
  request: NextRequest,
  scope: PublicRateLimitScope
): RateLimitResult {
  const config =
    PUBLIC_RATE_LIMITS[
      scope
    ];

  const now =
    Date.now();

  /*
   * Periodically clean expired entries.
   *
   * Running cleanup on each rate-limit check keeps
   * the implementation self-contained and avoids
   * background timers in serverless environments.
   */
  cleanupExpiredEntries(
    now
  );

  const clientIp =
    getClientIp(request);

  const key =
    `${scope}:${clientIp}`;

  const existing =
    store.get(key);

  if (
    !existing ||
    existing.resetAt <= now
  ) {
    const resetAt =
      now +
      config.windowMs;

    store.set(key, {
      count: 1,
      resetAt,
    });

    enforceStoreLimit();

    return {
      allowed: true,
      limit: config.limit,
      remaining:
        Math.max(
          0,
          config.limit - 1
        ),
      resetAt,
      retryAfterSeconds: 0,
      headers:
        makeHeaders(
          config.limit,
          config.limit - 1,
          resetAt,
          0
        ),
    };
  }

  existing.count += 1;

  const remaining =
    Math.max(
      0,
      config.limit -
        existing.count
    );

  const allowed =
    existing.count <=
    config.limit;

  const retryAfterSeconds =
    allowed
      ? 0
      : Math.max(
          1,
          Math.ceil(
            (existing.resetAt -
              now) /
              1000
          )
        );

  enforceStoreLimit();

  return {
    allowed,
    limit: config.limit,
    remaining,
    resetAt:
      existing.resetAt,
    retryAfterSeconds,
    headers:
      makeHeaders(
        config.limit,
        remaining,
        existing.resetAt,
        retryAfterSeconds
      ),
  };
}