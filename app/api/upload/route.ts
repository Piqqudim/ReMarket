import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import { v2 as cloudinary } from "cloudinary";

import { checkPublicRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MAX_SIZE = 5 * 1024 * 1024;

/*
 * Multipart/form-data contains some overhead
 * around the actual file, so allow a little more
 * than the 5MB file limit at the request level.
 */
const MAX_REQUEST_BODY_SIZE =
  6 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
} = process.env;

if (
  !CLOUDINARY_CLOUD_NAME ||
  !CLOUDINARY_API_KEY ||
  !CLOUDINARY_API_SECRET
) {
  throw new Error(
    "Missing Cloudinary environment variables."
  );
}

cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

/*
 * -----------------------------------------
 * FILE SIGNATURE VALIDATION
 * -----------------------------------------
 *
 * Do not rely only on File.type because it is
 * supplied by the client.
 *
 * JPEG:
 * FF D8 FF
 *
 * PNG:
 * 89 50 4E 47 0D 0A 1A 0A
 *
 * WebP:
 * RIFF .... WEBP
 */

function detectImageType(
  bytes: Uint8Array
):
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | null {
  /*
   * JPEG
   */
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  /*
   * PNG
   */
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  /*
   * WebP
   *
   * Bytes 0-3  = RIFF
   * Bytes 8-11 = WEBP
   */
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

function getResponseHeaders(
  rateLimitHeaders: Headers
): Headers {
  const headers =
    new Headers(rateLimitHeaders);

  headers.set(
    "Cache-Control",
    "no-store"
  );

  return headers;
}

export async function POST(
  request: NextRequest
) {
  const rateLimit =
    checkPublicRateLimit(
      request,
      "upload"
    );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error:
          "Too many uploads. Please try again shortly.",
      },
      {
        status: 429,
        headers: getResponseHeaders(
          rateLimit.headers
        ),
      }
    );
  }

  try {
    /*
     * Reject obviously oversized requests before
     * Next parses multipart/form-data.
     *
     * The actual file limit is still checked below.
     */
    const contentLengthHeader =
      request.headers.get(
        "content-length"
      );

    if (contentLengthHeader) {
      const contentLength =
        Number(contentLengthHeader);

      if (
        Number.isFinite(
          contentLength
        ) &&
        contentLength >
          MAX_REQUEST_BODY_SIZE
      ) {
        return NextResponse.json(
          {
            error:
              "Upload request is too large.",
          },
          {
            status: 413,
            headers:
              getResponseHeaders(
                rateLimit.headers
              ),
          }
        );
      }
    }

    const formData =
      await request.formData();

    /*
     * Only one file is expected.
     */
    const file =
      formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        {
          error:
            "No valid file provided.",
        },
        {
          status: 400,
          headers:
            getResponseHeaders(
              rateLimit.headers
            ),
        }
      );
    }

    /*
     * Basic size checks before reading file data.
     */
    if (file.size === 0) {
      return NextResponse.json(
        {
          error:
            "The uploaded image is empty.",
        },
        {
          status: 400,
          headers:
            getResponseHeaders(
              rateLimit.headers
            ),
        }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        {
          error:
            "Each image must be 5MB or smaller.",
        },
        {
          status: 400,
          headers:
            getResponseHeaders(
              rateLimit.headers
            ),
        }
      );
    }

    /*
     * The client MIME type is still useful as an
     * initial check, but it is NOT trusted as the
     * final file-type validation.
     */
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          error:
            "Only JPEG, PNG, and WebP images are allowed.",
        },
        {
          status: 400,
          headers:
            getResponseHeaders(
              rateLimit.headers
            ),
        }
      );
    }

    /*
     * Read only the first 12 bytes to determine the
     * actual file format.
     *
     * This avoids buffering the whole image into RAM.
     */
    const signatureBuffer =
      await file
        .slice(0, 12)
        .arrayBuffer();

    const detectedType =
      detectImageType(
        new Uint8Array(
          signatureBuffer
        )
      );

    if (!detectedType) {
      return NextResponse.json(
        {
          error:
            "The uploaded file is not a supported image.",
        },
        {
          status: 400,
          headers:
            getResponseHeaders(
              rateLimit.headers
            ),
        }
      );
    }

    /*
     * Require the declared MIME type to agree with
     * the actual file signature.
     */
    if (detectedType !== file.type) {
      return NextResponse.json(
        {
          error:
            "The uploaded image type could not be verified.",
        },
        {
          status: 400,
          headers:
            getResponseHeaders(
              rateLimit.headers
            ),
        }
      );
    }

    /*
     * -----------------------------------------
     * CLOUDINARY UPLOAD
     * -----------------------------------------
     *
     * Stream the file instead of converting the
     * complete image to a Buffer first.
     */
    const result =
      await new Promise<{
        secure_url: string;
        public_id: string;
      }>((resolve, reject) => {
        const uploadStream =
          cloudinary.uploader.upload_stream(
            {
              folder: "ReMarket",
              resource_type: "image",
            },
            (
              uploadError,
              uploadResult
            ) => {
              if (uploadError) {
                reject(uploadError);
                return;
              }

              if (!uploadResult) {
                reject(
                  new Error(
                    "Cloudinary returned no result."
                  )
                );

                return;
              }

              if (
                !uploadResult.secure_url ||
                !uploadResult.public_id
              ) {
                reject(
                  new Error(
                    "Cloudinary returned an incomplete result."
                  )
                );

                return;
              }

              resolve({
                secure_url:
                  uploadResult.secure_url,

                public_id:
                  uploadResult.public_id,
              });
            }
          );

        try {
          const nodeStream =
            Readable.fromWeb(
              file.stream() as any
            );

          nodeStream.on(
            "error",
            (streamError) => {
              uploadStream.destroy(
                streamError
              );

              reject(streamError);
            }
          );

          uploadStream.on(
            "error",
            reject
          );

          nodeStream.pipe(
            uploadStream
          );
        } catch (streamError) {
          uploadStream.destroy();

          reject(streamError);
        }
      });

    return NextResponse.json(
      {
        url: result.secure_url,

        publicId:
          result.public_id,
      },
      {
        status: 201,
        headers:
          getResponseHeaders(
            rateLimit.headers
          ),
      }
    );
  } catch (error) {
    console.error(
      "Image upload error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Image upload failed.",
      },
      {
        status: 500,
        headers:
          getResponseHeaders(
            rateLimit.headers
          ),
      }
    );
  }
}