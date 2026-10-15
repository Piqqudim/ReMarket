
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

const TITLE_MAX_LENGTH = 120;
const CAPTION_MAX_LENGTH = 5000;
const URL_MAX_LENGTH = 2048;
const PUBLIC_ID_MAX_LENGTH = 255;

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const ALLOWED_FIELDS = new Set([
  "title",
  "caption",
  "imageUrl",
  "imagePublicId",
  "linkUrl",
  "platforms",
  "status",
]);

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
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

  const supported = new Set<string>(
    Object.values(AdminContentPlatform)
  );

  for (const platform of value) {
    if (
      typeof platform !== "string" ||
      !supported.has(platform)
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
 * Allows absolute HTTP(S) URLs.
 * Destination links may also use safe relative paths, e.g. /shop.
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
 * GET /api/admin/content/[id]
 *
 * Returns one content item for the admin editor.
 */
export async function GET(
  _request: NextRequest,
  context: RouteContext
) {
  const auth = await requireAdminOrRespond();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id } = await context.params;

  if (!id || !id.trim() || id.length > 128) {
    return jsonNoStore(
      { error: "A valid content ID is required." },
      400
    );
  }

  try {
    const content = await prisma.adminContent.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!content) {
      return jsonNoStore(
        { error: "Content not found." },
        404
      );
    }

    return jsonNoStore({ content });
  } catch (error) {
    console.error("Admin content item GET error:", error);

    return jsonNoStore(
      { error: "Unable to load content." },
      500
    );
  }
}

/**
 * PATCH /api/admin/content/[id]
 *
 * Updates provided fields only.
 * To archive or restore an item, set status to ARCHIVED,
 * DRAFT, or READY.
 *
 * READY means prepared for manual sharing, not published.
 */
export async function PATCH(
  request: NextRequest,
  context: RouteContext
) {
  const auth = await requireAdminOrRespond();

  if (!auth.authorized) {
    return auth.response;
  }

  const { id } = await context.params;

  if (!id || !id.trim() || id.length > 128) {
    return jsonNoStore(
      { error: "A valid content ID is required." },
      400
    );
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

    const keys = Object.keys(body);

    if (keys.length === 0) {
      return jsonNoStore(
        { error: "Provide at least one field to update." },
        400
      );
    }

    const unknownFields = keys.filter(
      (key) => !ALLOWED_FIELDS.has(key)
    );

    if (unknownFields.length > 0) {
      return jsonNoStore(
        {
          error: `Unsupported field(s): ${unknownFields.join(", ")}.`,
        },
        400
      );
    }

    const existing = await prisma.adminContent.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        caption: true,
        imageUrl: true,
        imagePublicId: true,
        linkUrl: true,
        platforms: true,
        status: true,
      },
    });

    if (!existing) {
      return jsonNoStore(
        { error: "Content not found." },
        404
      );
    }

    const data: Prisma.AdminContentUpdateInput = {};

    if ("title" in body) {
      const title = cleanString(body.title);

      if (!title) {
        return jsonNoStore(
          { error: "Content title cannot be empty." },
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

      data.title = title;
    }

    if ("caption" in body) {
      const caption = cleanString(body.caption);

      if (!caption) {
        return jsonNoStore(
          { error: "Content caption cannot be empty." },
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

      data.caption = caption;
    }

    if ("imageUrl" in body) {
      const parsed = parseOptionalString(
        body.imageUrl,
        "Image URL",
        URL_MAX_LENGTH
      );

      if (!parsed.ok) {
        return jsonNoStore(
          { error: parsed.error },
          400
        );
      }

      if (
        parsed.value &&
        !isValidUrl(parsed.value)
      ) {
        return jsonNoStore(
          {
            error: "Image URL must be a valid HTTP or HTTPS URL.",
          },
          400
        );
      }

      data.imageUrl = parsed.value;

      // Avoid retaining a Cloudinary ID for a different image URL.
      if (parsed.value !== existing.imageUrl) {
        data.imagePublicId = null;
      }
    }

    if ("imagePublicId" in body) {
      const parsed = parseOptionalString(
        body.imagePublicId,
        "Image public ID",
        PUBLIC_ID_MAX_LENGTH
      );

      if (!parsed.ok) {
        return jsonNoStore(
          { error: parsed.error },
          400
        );
      }

      data.imagePublicId = parsed.value;
    }

    if ("linkUrl" in body) {
      const parsed = parseOptionalString(
        body.linkUrl,
        "Destination link",
        URL_MAX_LENGTH
      );

      if (!parsed.ok) {
        return jsonNoStore(
          { error: parsed.error },
          400
        );
      }

      if (
        parsed.value &&
        !isValidUrl(parsed.value, true)
      ) {
        return jsonNoStore(
          {
            error: "Destination link must be a valid HTTP(S) URL or a safe relative path.",
          },
          400
        );
      }

      data.linkUrl = parsed.value;
    }

    let effectivePlatforms = existing.platforms;

    if ("platforms" in body) {
      const platforms = parsePlatforms(body.platforms);

      if (platforms === null) {
        return jsonNoStore(
          {
            error: "Platforms must be an array of supported social platforms.",
          },
          400
        );
      }

      effectivePlatforms = platforms;
      data.platforms = platforms;
    }

    let effectiveStatus = existing.status;

    if ("status" in body) {
      if (!isAdminContentStatus(body.status)) {
        return jsonNoStore(
          { error: "Invalid content status." },
          400
        );
      }

      effectiveStatus = body.status;
      data.status = body.status;
    }

    if (
      effectiveStatus === AdminContentStatus.READY &&
      effectivePlatforms.length === 0
    ) {
      return jsonNoStore(
        {
          error: "Select at least one sharing platform before marking content as READY.",
        },
        400
      );
    }

    const effectiveImageUrl =
      "imageUrl" in data
        ? data.imageUrl
        : existing.imageUrl;

    const effectiveImagePublicId =
      "imagePublicId" in data
        ? data.imagePublicId
        : existing.imagePublicId;

    if (
      effectiveImagePublicId &&
      !effectiveImageUrl
    ) {
      return jsonNoStore(
        {
          error: "An image URL is required when an image public ID is provided.",
        },
        400
      );
    }

    const content = await prisma.adminContent.update({
      where: { id },
      data,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return jsonNoStore({
      success: true,
      content,
    });
  } catch (error) {
    console.error("Admin content item PATCH error:", error);

    return jsonNoStore(
      { error: "Unable to update content." },
      500
    );
  }
}
