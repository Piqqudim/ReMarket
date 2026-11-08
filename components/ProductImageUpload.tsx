"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import {
  Camera,
  Image as ImageIcon,
  Loader2,
  X,
} from "lucide-react";

type UploadedImage = {
  url: string;
  publicId: string;
};

type ProductImageUploadProps = {
  value?: string[];
  onChange: (urls: string[]) => void;
  onUploadComplete?: (images: UploadedImage[]) => void;
  disabled?: boolean;
};

type UploadResponse = {
  url?: unknown;
  publicId?: unknown;
  error?: unknown;
};

const MAX_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function isUploadResponse(
  value: unknown
): value is UploadResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getUploadError(
  data: unknown,
  fallback: string
): string {
  if (
    isUploadResponse(data) &&
    typeof data.error === "string" &&
    data.error.trim()
  ) {
    return data.error;
  }

  return fallback;
}

export default function ProductImageUpload({
  value = [],
  onChange,
  onUploadComplete,
  disabled = false,
}: ProductImageUploadProps) {
  const inputRef =
    useRef<HTMLInputElement | null>(null);

  const valueRef = useRef<string[]>(value);

  valueRef.current = value;

  const [uploading, setUploading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function uploadFile(
    file: File
  ): Promise<UploadedImage> {
    if (!ALLOWED_TYPES.has(file.type)) {
      throw new Error(
        "Only JPEG, PNG, and WebP images are allowed."
      );
    }

    if (file.size === 0) {
      throw new Error(
        "The selected image is empty."
      );
    }

    if (file.size > MAX_SIZE) {
      throw new Error(
        "Each image must be 5MB or smaller."
      );
    }

    const formData = new FormData();

    formData.append("file", file);

    const response = await fetch(
      "/api/upload",
      {
        method: "POST",
        body: formData,
        cache: "no-store",
      }
    );

    let data: unknown;

    try {
      data = await response.json();
    } catch {
      throw new Error(
        "The image server returned an invalid response. Please try again."
      );
    }

    if (!response.ok) {
      throw new Error(
        getUploadError(
          data,
          "Image upload failed."
        )
      );
    }

    if (
      !isUploadResponse(data) ||
      typeof data.url !== "string" ||
      !data.url.trim()
    ) {
      throw new Error(
        "The upload did not return a valid image URL."
      );
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(data.url);
    } catch {
      throw new Error(
        "The upload returned an invalid image URL."
      );
    }

    if (
      parsedUrl.protocol !== "https:" &&
      parsedUrl.protocol !== "http:"
    ) {
      throw new Error(
        "The uploaded image URL is not supported."
      );
    }

    if (
      typeof data.publicId !== "string" ||
      !data.publicId.trim()
    ) {
      throw new Error(
        "The upload did not return the image reference. Please try again."
      );
    }

    return {
      url: data.url,
      publicId: data.publicId,
    };
  }

  async function handleChange(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const files = Array.from(
      event.target.files ?? []
    );

    if (files.length === 0) {
      return;
    }

    if (disabled || uploading) {
      event.target.value = "";
      return;
    }

    setError("");
    setUploading(true);

    const uploadedImages: UploadedImage[] = [];
    const failedFiles: string[] = [];

    try {
      /*
       * Upload sequentially to avoid sending
       * too many simultaneous Cloudinary requests.
       *
       * A failed image does not cancel the
       * remaining uploads.
       */
      for (const file of files) {
        try {
          const uploadedImage =
            await uploadFile(file);

          uploadedImages.push(uploadedImage);
        } catch (uploadError) {
          console.error(
            `Image upload failed for ${file.name}:`,
            uploadError
          );

          failedFiles.push(
            uploadError instanceof Error
              ? uploadError.message
              : `${file.name} could not be uploaded.`
          );
        }
      }

      /*
       * Preserve every successfully uploaded image,
       * even when another upload in the batch failed.
       */
      if (uploadedImages.length > 0) {
        const existingUrls = valueRef.current;

        const newImages = uploadedImages.filter(
          (image) =>
            !existingUrls.includes(image.url)
        );

        const nextUrls = [
          ...existingUrls,
          ...newImages.map((image) => image.url),
        ];

        valueRef.current = nextUrls;

        onChange(nextUrls);

        /*
         * Optional callback for components that
         * need Cloudinary public IDs as well as URLs.
         *
         * Existing product forms can continue using
         * only onChange.
         */
        if (onUploadComplete && newImages.length > 0) {
          onUploadComplete(newImages);
        }
      }

      if (failedFiles.length > 0) {
        const uniqueErrors = Array.from(
          new Set(failedFiles)
        );

        setError(
          uploadedImages.length > 0
            ? `${uploadedImages.length} image(s) uploaded successfully. ${uniqueErrors.join(" ")}`
            : uniqueErrors.join(" ")
        );
      }
    } catch (uploadError) {
      console.error(
        "Product image upload error:",
        uploadError
      );

      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Image upload failed."
      );
    } finally {
      setUploading(false);

      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  function removeImage(index: number) {
    if (disabled || uploading) {
      return;
    }

    const nextImages = value.filter(
      (_, imageIndex) =>
        imageIndex !== index
    );

    valueRef.current = nextImages;

    onChange(nextImages);

    setError("");
  }

  return (
    <div className="space-y-4">
      {value.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {value.map((url, index) => (
            <div
              key={`${url}-${index}`}
              className="group relative overflow-hidden rounded-2xl border border-[#E8E4DE] bg-[#FCFAF6]"
            >
              <img
                src={url}
                alt={`Listing image ${index + 1}`}
                className="aspect-square w-full object-cover"
                loading="lazy"
              />

              {index === 0 && (
                <div className="absolute left-2 top-2 rounded-full bg-white/95 px-2.5 py-1 text-[9px] font-bold text-[#9F2D18] shadow-sm">
                  Cover
                </div>
              )}

              <button
                type="button"
                disabled={
                  disabled || uploading
                }
                onClick={() =>
                  removeImage(index)
                }
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-gray-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={`Remove image ${index + 1}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={
          disabled || uploading
        }
        onClick={() =>
          inputRef.current?.click()
        }
        className="flex min-h-32 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-[#D8D0C8] bg-[#FCFAF6] px-4 py-6 text-center transition hover:border-[#FF9B82] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FFE8E1] text-[#9F2D18]">
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : value.length > 0 ? (
            <ImageIcon className="h-5 w-5" />
          ) : (
            <Camera className="h-5 w-5" />
          )}
        </div>

        <p className="mt-3 text-xs font-bold text-gray-700">
          {uploading
            ? "Uploading image..."
            : value.length > 0
              ? "Add more images"
              : "Add listing images"}
        </p>

        <p className="mt-1 text-[10px] text-gray-400">
          JPEG, PNG or WebP · Max 5MB each
        </p>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={handleChange}
        disabled={
          disabled || uploading
        }
        className="hidden"
      />

      {value.length > 0 && (
        <p className="text-[10px] text-gray-400">
          The first image is used as the listing cover.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="text-[11px] font-medium text-red-600"
        >
          {error}
        </p>
      )}
    </div>
  );
}