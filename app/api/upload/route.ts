import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

export const runtime = "nodejs";

const MAX_SIZE = 5 * 1024 * 1024;

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

export async function POST(
  request: NextRequest
) {
  try {
    const formData =
      await request.formData();

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
        }
      );
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          error:
            "Only JPEG, PNG, and WebP images are allowed.",
        },
        {
          status: 400,
        }
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        {
          error:
            "The uploaded image is empty.",
        },
        {
          status: 400,
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
        }
      );
    }

    const buffer = Buffer.from(
      await file.arrayBuffer()
    );

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

              resolve({
                secure_url:
                  uploadResult.secure_url,
                public_id:
                  uploadResult.public_id,
              });
            }
          );

        uploadStream.end(buffer);
      });

    return NextResponse.json(
      {
        url: result.secure_url,
        publicId:
          result.public_id,
      },
      {
        status: 201,
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
      }
    );
  }
}
