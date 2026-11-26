import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import { v2 as cloudinary } from "cloudinary";

import { requireAdmin } from "@/lib/admin-auth";
import { checkPublicRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_REQUEST_SIZE = 6 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type SupportedImageType = "image/jpeg" | "image/png" | "image/webp";

function noStoreHeaders(rateLimitHeaders?: Headers): Headers {
  const headers = new Headers(rateLimitHeaders);
  headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

function jsonError(message: string, status: number, rateLimitHeaders?: Headers) {
  return NextResponse.json({ error: message }, {
    status,
    headers: noStoreHeaders(rateLimitHeaders),
  });
}

function detectImageType(bytes: Uint8Array): SupportedImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 &&
    bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d &&
    bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 &&
    bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 &&
    bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

function configureCloudinary(): boolean {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) return false;

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  return true;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.authorized) return auth.response;

  const rateLimit = checkPublicRateLimit(request, "admin-category-upload");
  if (!rateLimit.allowed) {
    return jsonError("Too many category image uploads. Please try again shortly.", 429, rateLimit.headers);
  }

  if (!configureCloudinary()) {
    return jsonError("Image storage is not configured. Contact the system administrator.", 503, rateLimit.headers);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_SIZE) {
    return jsonError("Upload request is too large. Images must be 5 MB or smaller.", 413, rateLimit.headers);
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return jsonError("Choose an image file to upload.", 400, rateLimit.headers);
    }

    if (file.size === 0) {
      return jsonError("The selected image is empty.", 400, rateLimit.headers);
    }

    if (file.size > MAX_FILE_SIZE) {
      return jsonError("The image must be 5 MB or smaller.", 400, rateLimit.headers);
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return jsonError("Only JPEG, PNG and WebP images are allowed.", 400, rateLimit.headers);
    }

    const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const detectedType = detectImageType(signature);
    if (!detectedType || detectedType !== file.type) {
      return jsonError("The uploaded file does not match a supported image format.", 400, rateLimit.headers);
    }

    const uploadResult = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: "ReMarket/Categories",
          resource_type: "image",
          overwrite: false,
          unique_filename: true,
        },
        (error, result) => {
          if (error) return reject(error);
          if (!result?.secure_url || !result.public_id) {
            return reject(new Error("Cloudinary returned an incomplete upload result."));
          }
          resolve({ secure_url: result.secure_url, public_id: result.public_id });
        },
      );

      const fileStream = Readable.fromWeb(file.stream() as any);
      fileStream.on("error", (error) => uploadStream.destroy(error));
      uploadStream.on("error", reject);
      fileStream.pipe(uploadStream);
    });

    return NextResponse.json(
      { success: true, url: uploadResult.secure_url, publicId: uploadResult.public_id },
      { status: 201, headers: noStoreHeaders(rateLimit.headers) },
    );
  } catch (error) {
    console.error("Admin category image upload failed:", error);
    return jsonError("Unable to upload the category image. Please try again.", 500, rateLimit.headers);
  }
}
