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

type ProductImageUploadProps = {
  value?: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
};

const MAX_SIZE = 5 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export default function ProductImageUpload({
  value = [],
  onChange,
  disabled = false,
}: ProductImageUploadProps) {
  const inputRef =
    useRef<HTMLInputElement | null>(null);

  const [uploading, setUploading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function uploadFile(file: File) {
    setError("");

    if (!ALLOWED_TYPES.has(file.type)) {
      setError(
        "Only JPEG, PNG, and WebP images are allowed."
      );

      return null;
    }

    if (file.size === 0) {
      setError(
        "The selected image is empty."
      );

      return null;
    }

    if (file.size > MAX_SIZE) {
      setError(
        "Each image must be 5MB or smaller."
      );

      return null;
    }

    const formData = new FormData();

    formData.append("file", file);

    const response = await fetch(
      "/api/upload",
      {
        method: "POST",
        body: formData,
      }
    );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        typeof data?.error === "string"
          ? data.error
          : "Image upload failed."
      );
    }

    if (
      typeof data?.url !== "string" ||
      !data.url
    ) {
      throw new Error(
        "Upload did not return an image URL."
      );
    }

    return data.url as string;
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

    setError("");
    setUploading(true);

    try {
      const uploadedUrls: string[] = [];

      for (const file of files) {
        const url =
          await uploadFile(file);

        if (url) {
          uploadedUrls.push(url);
        }
      }

      if (uploadedUrls.length > 0) {
        onChange([
          ...value,
          ...uploadedUrls,
        ]);
      }
    } catch (error) {
      console.error(
        "Product image upload error:",
        error
      );

      setError(
        error instanceof Error
          ? error.message
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
    const nextImages = value.filter(
      (_, imageIndex) =>
        imageIndex !== index
    );

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
                alt={`Product image ${index + 1}`}
                className="aspect-square w-full object-cover"
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
                aria-label={`Remove product image ${
                  index + 1
                }`}
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
              ? "Add more product images"
              : "Add product images"}
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
          The first image is used as the
          product cover.
        </p>
      )}

      {error && (
        <p className="text-[11px] font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}