const DAY_MS = 24 * 60 * 60 * 1000;
const LAGOS_OFFSET_MS = 60 * 60 * 1000;

export type AnalyticsPeriod = {
  from: Date;
  to: Date;
};

export type AnalyticsPeriodResult =
  | { valid: true; period: AnalyticsPeriod }
  | { valid: false; error: string };

function parseDateOnly(
  value: string,
  isEndDate: boolean
): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));

  // Reject impossible dates such as 2026-02-31 instead of allowing
  // JavaScript to roll them into the following month.
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    return null;
  }

  const nextDay = isEndDate
    ? DAY_MS
    : 0;

  // Africa/Lagos is UTC+01:00. A date-only end value is inclusive,
  // so its exclusive database boundary is midnight the next day.
  return new Date(
    Date.UTC(year, month - 1, day) +
      nextDay -
      LAGOS_OFFSET_MS
  );
}

function parseDateTime(value: string): Date | null {
  // Require an explicit timezone for timestamps. This avoids interpreting
  // a timezone-free timestamp differently across server environments.
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDateBound(
  value: string,
  isEndDate: boolean
): Date | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return parseDateOnly(trimmed, isEndDate);
  }

  return parseDateTime(trimmed);
}

/**
 * Resolves an optional from/to query into a half-open date range [from, to).
 * Date-only values are interpreted as Africa/Lagos calendar dates. A date-only
 * `to` is inclusive; timestamp `to` values are treated as exclusive instants.
 */
export function parseAnalyticsPeriod(
  searchParams: URLSearchParams,
  defaultDays = 30,
  now = new Date()
): AnalyticsPeriodResult {
  const fromValue = searchParams.get("from");
  const toValue = searchParams.get("to");

  const to = toValue === null
    ? now
    : parseDateBound(toValue, true);

  if (!to) {
    return {
      valid: false,
      error: "Invalid 'to' date. Use YYYY-MM-DD or a timestamp with a timezone.",
    };
  }

  const from = fromValue === null
    ? new Date(to.getTime() - defaultDays * DAY_MS)
    : parseDateBound(fromValue, false);

  if (!from) {
    return {
      valid: false,
      error: "Invalid 'from' date. Use YYYY-MM-DD or a timestamp with a timezone.",
    };
  }

  if (from.getTime() >= to.getTime()) {
    return {
      valid: false,
      error: "The analytics start date must be before the end date.",
    };
  }

  return {
    valid: true,
    period: { from, to },
  };
}

export function getNigeriaTodayPeriod(
  now = new Date()
): AnalyticsPeriod {
  const lagosTime = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const startOfLagosDayUtc =
    Date.UTC(
      lagosTime.getUTCFullYear(),
      lagosTime.getUTCMonth(),
      lagosTime.getUTCDate()
    ) - LAGOS_OFFSET_MS;

  return {
    from: new Date(startOfLagosDayUtc),
    to: new Date(startOfLagosDayUtc + DAY_MS),
  };
}
