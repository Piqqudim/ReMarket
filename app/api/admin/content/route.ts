import {
  AdminContentPlatform,
  AdminContentStatus,
  Prisma,
} from "@prisma/client";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE_DEFAULT = 12;
const PAGE_SIZE_MAX = 50;
const TITLE_MAX_LENGTH = 120;
const CAPTION_MAX_LENGTH = 5000;
const URL_MAX_LENGTH = 2048;
const PUBLIC_ID_MAX_LENGTH = 255;
const SEARCH_MAX_LENGTH = 120;

// Keep offsets within a safe range for the database client.
const MAX_SKIP = 2_147_483_647;

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

function jsonNoStore(
  body: unknown,
  status = 200
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isAdminContentStatus(
  value: unknown
): value is AdminContentStatus {
  return (
    typeof value === "string" &&
    Object.values(AdminContentStatus).includes(
      value as AdminContentStatus
    )
  );
}

function parsePlatforms(
  value: unknown
): AdminContentPlatform[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const validPlatforms = new Set<string>(
    Object.values(AdminContentPlatform)
  );

  for (const platform of value) {
    if (
      typeof platform !== "string" ||
      !validPlatforms.has(platform)
    ) {
      return null;
    }
  }

  return Array.from(
    new Set(value as AdminContentPlatform[])
  );
}

type OptionalStringResult =
  | {
      ok: true;
      value: string | null;
    }
  | {
      ok: false;
      error: string;
    };

function parseOptionalString(
  value: unknown,
  fieldName: string,
  maxLength: number
): OptionalStringResult {
  if (value === undefined || value === null) {
    return {
      ok: true,
      value: null,
    };
  }

  if (typeof value !== "string") {
    return {
      ok: false,
      error: `${fieldName} must be a string.`,
    };
  }

  const cleaned = value.trim();

  if (!cleaned) {
    return {
      ok: true,
      value: null,
    };
  }

  if (cleaned.length > maxLength) {
    return {
      ok: false,
      error: `${fieldName} must not exceed ${maxLength} characters.`,
    };
  }

  return {
    ok: true,
    value: cleaned,
  };
}

/**
 * Accept absolute HTTP(S) URLs.
 * For destination links, also allow safe relative paths such
 * as /shop. Image URLs must be absolute URLs.
 */
function isValidUrl(
  value: string,
  allowRelative = false
): boolean {
  if (
    /[\u0000-\u001F\u007F]/.test(value) ||
    value.includes("\\")
  ) {
    return false;
  }

  if (
    allowRelative &&
    value.startsWith("/") &&
    !value.startsWith("//")
  ) {
    return true;
  }

  try {
    const parsed = new URL(value);

    return (
      (parsed.protocol === "https:" ||
        parsed.protocol === "http:") &&
      Boolean(parsed.hostname) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

function parsePositiveInteger(
  value: string | null,
  fallback: number
): number | null {
  if (value === null) {
    return fallback;
  }

  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1
  ) {
    return null;
  }

  return parsed;
}

async function requireAdminOrRespond() {
  const auth = await requireAdmin();

  if (!auth.authorized) {
    auth.response.headers.set(
      "Cache-Control",
      "private, no-store, max-age=0, must-revalidate"
    );
    auth.response.headers.set("Pragma", "no-cache");
    auth.response.headers.set("Expires", "0");

    return {
      authorized: false as const,
      response: auth.response,
    };
  }

  return {
    authorized: true as const,
    user: auth.user,
  };
}

/**
 * GET /api/admin/content
 *
 * Query parameters:
 * - page: positive integer, defaults to 1
 * - pageSize: positive integer, defaults to 12, maximum 50
 * - q: optional title/caption search
 * - status: optional DRAFT, READY, or ARCHIVED
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdminOrRespond();

  if (!auth.authorized) {
    return auth.response;
  }

  const searchParams = request.nextUrl.searchParams;

  const page = parsePositiveInteger(
    searchParams.get("page"),
    1
  );

  const pageSize = parsePositiveInteger(
    searchParams.get("pageSize"),
    PAGE_SIZE_DEFAULT
  );

  if (page === null) {
    return jsonNoStore(
      { error: "Page must be a positive integer." },
      400
    );
  }

  if (
    pageSize === null ||
    pageSize > PAGE_SIZE_MAX
  ) {
    return jsonNoStore(
      {
        error: `Page size must be between 1 and ${PAGE_SIZE_MAX}.`,
      },
      400
    );
  }

  const skip = (page - 1) * pageSize;

  if (
    !Number.isSafeInteger(skip) ||
    skip > MAX_SKIP
  ) {
    return jsonNoStore(
      { error: "Requested page is too large." },
      400
    );
  }

  const query = cleanString(
    searchParams.get("q")
  );

  if (query.length > SEARCH_MAX_LENGTH) {
    return jsonNoStore(
      {
        error: `Search must not exceed ${SEARCH_MAX_LENGTH} characters.`,
      },
      400
    );
  }

  const rawStatus = cleanString(
    searchParams.get("status")
  );

  let status: AdminContentStatus | undefined;

  if (rawStatus) {
    if (!isAdminContentStatus(rawStatus)) {
      return jsonNoStore(
        { error: "Invalid content status." },
        400
      );
    }

    status = rawStatus;
  }

  const where: Prisma.AdminContentWhereInput = {
    ...(status ? { status } : {}),
    ...(query
      ? {
          OR: [
            {
              title: {
                contains: query,
                mode: "insensitive",
              },
            },
            {
              caption: {
                contains: query,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
  };

  try {
    const [contents, total] = await Promise.all([
      prisma.adminContent.findMany({
        where,
        orderBy: [
          { updatedAt: "desc" },
          { createdAt: "desc" },
        ],
        skip,
        take: pageSize,
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),

      prisma.adminContent.count({ where }),
    ]);

    return jsonNoStore({
      contents,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Admin content GET error:", error);

    return jsonNoStore(
      { error: "Unable to load admin content." },
      500
    );
  }
}

/**
 * POST /api/admin/content
 *
 * Creates content for later manual sharing.
 * READY means prepared for sharing, not published.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminOrRespond();

  if (!auth.authorized) {
    return auth.response;
  }

  try {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return jsonNoStore(
        { error: "Invalid JSON request body." },
        400
      );
    }

    if (!isRecord(body)) {
      return jsonNoStore(
        { error: "Invalid request body." },
        400
      );
    }

    const title = cleanString(body.title);
    const caption = cleanString(body.caption);

    if (!title) {
      return jsonNoStore(
        { error: "Content title is required." },
        400
      );
    }

    if (title.length > TITLE_MAX_LENGTH) {
      return jsonNoStore(
        {
          error: `Title must not exceed ${TITLE_MAX_LENGTH} characters.`,
        },
        400
      );
    }

    if (!caption) {
      return jsonNoStore(
        { error: "Content caption is required." },
        400
      );
    }

    if (caption.length > CAPTION_MAX_LENGTH) {
      return jsonNoStore(
        {
          error: `Caption must not exceed ${CAPTION_MAX_LENGTH} characters.`,
        },
        400
      );
    }

    const parsedImageUrl = parseOptionalString(
      body.imageUrl,
      "Image URL",
      URL_MAX_LENGTH
    );

    if (!parsedImageUrl.ok) {
      return jsonNoStore(
        { error: parsedImageUrl.error },
        400
      );
    }

    const imageUrl = parsedImageUrl.value;

    if (
      imageUrl &&
      !isValidUrl(imageUrl)
    ) {
      return jsonNoStore(
        {
          error: "Image URL must be a valid HTTP or HTTPS URL.",
        },
        400
      );
    }

    const parsedImagePublicId = parseOptionalString(
      body.imagePublicId,
      "Image public ID",
      PUBLIC_ID_MAX_LENGTH
    );

    if (!parsedImagePublicId.ok) {
      return jsonNoStore(
        { error: parsedImagePublicId.error },
        400
      );
    }

    const imagePublicId =
      parsedImagePublicId.value;

    if (imagePublicId && !imageUrl) {
      return jsonNoStore(
        {
          error: "An image URL is required when an image public ID is provided.",
        },
        400
      );
    }

    const parsedLinkUrl = parseOptionalString(
      body.linkUrl,
      "Destination link",
      URL_MAX_LENGTH
    );

    if (!parsedLinkUrl.ok) {
      return jsonNoStore(
        { error: parsedLinkUrl.error },
        400
      );
    }

    const linkUrl = parsedLinkUrl.value;

    if (
      linkUrl &&
      !isValidUrl(linkUrl, true)
    ) {
      return jsonNoStore(
        {
          error: "Destination link must be a valid HTTP(S) URL or a safe relative path.",
        },
        400
      );
    }

    const platforms =
      body.platforms === undefined
        ? []
        : parsePlatforms(body.platforms);

    if (platforms === null) {
      return jsonNoStore(
        {
          error: "Platforms must be an array of supported social platforms.",
        },
        400
      );
    }

    const status =
      body.status === undefined
        ? AdminContentStatus.DRAFT
        : body.status;

    if (!isAdminContentStatus(status)) {
      return jsonNoStore(
        { error: "Invalid content status." },
        400
      );
    }

    if (
      status === AdminContentStatus.READY &&
      platforms.length === 0
    ) {
      return jsonNoStore(
        {
          error: "Select at least one sharing platform before marking content as READY.",
        },
        400
      );
    }

    const content = await prisma.adminContent.create({
      data: {
        title,
        caption,
        imageUrl,
        imagePublicId,
        linkUrl,
        platforms,
        status,
        createdById: auth.user.id,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return jsonNoStore(
      {
        success: true,
        content,
      },
      201
    );
  } catch (error) {
    console.error("Admin content POST error:", error);

    return jsonNoStore(
      { error: "Unable to create admin content." },
      500
    );
  }
}
