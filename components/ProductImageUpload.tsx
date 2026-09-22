"use client";

import {
  useRef,
  useState,
} from "react";

import {
  Camera,
  X,
} from "lucide-react";

type ImageUploadProps = {
  value?: string;
  onChange: (
    url: string
  ) => void;
  disabled?: boolean;
};

const MAX_SIZE =
  5 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export default function ImageUpload({
  value,
  onChange,
  disabled = false,
}: ImageUploadProps) {
  const inputRef =
    useRef<HTMLInputElement | null>(
      null
    );

  const [uploading, setUploading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function handleFile(
    file: File
  ) {
    setError("");

    if (!ALLOWED_TYPES.has(file.type)) {
      setError(
        "Only JPEG, PNG, and WebP images are allowed."
      );
      return;
    }

    if (file.size === 0) {
      setError(
        "The selected image is empty."
      );
      return;
    }

    if (file.size > MAX_SIZE) {
      setError(
        "The image must be 5MB or smaller."
      );
      return;
    }

    setUploading(true);

    try {
      const formData =
        new FormData();

      formData.append(
        "file",
        file
      );

      const response =
        await fetch(
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
          typeof data?.error ===
            "string"
            ? data.error
            : "Image upload failed."
        );
      }

      if (
        typeof data?.url !==
        "string" ||
        !data.url
      ) {
        throw new Error(
          "Upload did not return an image URL."
        );
      }

      onChange(data.url);
    } catch (error) {
      console.error(
        "Image upload error:",
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

  function handleChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    void handleFile(file);
  }

  function removeImage() {
    onChange("");
    setError("");
  }

  return (
    <div className="space-y-3">
      {value ? (
        <div className="relative overflow-hidden rounded-2xl border border-[#E8E4DE] bg-[#FCFAF6]">
          <img
            src={value}
            alt="Business"
            className="h-48 w-full object-cover"
          />

          <button
            type="button"
            disabled={
              disabled || uploading
            }
            onClick={
              removeImage
            }
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/95 text-gray-700 shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Remove image"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={
            disabled || uploading
          }
          onClick={() =>
            inputRef.current?.click()
          }
          className="flex h-48 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-[#D8D0C8] bg-[#FCFAF6] text-center transition hover:border-[#FF9B82] hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FFE8E1] text-[#9F2D18]">
            <Camera className="h-5 w-5" />
          </div>

          <p className="mt-3 text-xs font-bold text-gray-700">
            {uploading
              ? "Uploading image..."
              : "Add business image"}
          </p>

          <p className="mt-1 text-[10px] text-gray-400">
            JPEG, PNG or WebP · Max 5MB
          </p>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleChange}
        disabled={
          disabled || uploading
        }
        className="hidden"
      />

      {error && (
        <p className="text-[11px] font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}