"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Camera, ImagePlus, LoaderCircle, Trash2, Upload } from "lucide-react";

type CategoryImageUploadProps = {
  value: string;
  onChange: (url: string) => void;
  disabled?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
};

type UploadResponse = {
  url?: unknown;
  error?: unknown;
};

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function readError(value: unknown): string | null {
  if (typeof value === "object" && value !== null && "error" in value) {
    const error = (value as UploadResponse).error;
    return typeof error === "string" && error.trim() ? error : null;
  }
  return null;
}

export default function CategoryImageUpload({
  value,
  onChange,
  disabled = false,
  onUploadingChange,
}: CategoryImageUploadProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  function uploadFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("file", file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/admin/categories/image");
      xhr.setRequestHeader("Accept", "application/json");
      xhr.responseType = "text";

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          setProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
        }
      };

      xhr.onerror = () => reject(new Error("The upload could not reach the server. Check your connection and try again."));
      xhr.onabort = () => reject(new Error("The upload was cancelled."));
      xhr.onload = () => {
        let data: unknown = {};
        try {
          data = JSON.parse(xhr.responseText || "{}");
        } catch {
          reject(new Error("The upload service returned an invalid response."));
          return;
        }

        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(readError(data) ?? "Unable to upload the category image."));
          return;
        }

        const url = typeof data === "object" && data !== null && "url" in data
          ? (data as UploadResponse).url
          : null;
        if (typeof url !== "string" || !url.startsWith("https://")) {
          reject(new Error("The upload service did not return a secure image URL."));
          return;
        }

        resolve(url);
      };

      xhr.send(formData);
    });
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    if (!ACCEPTED_TYPES.has(file.type)) {
      setError("Choose a JPEG, PNG or WebP image.");
      return;
    }
    if (file.size === 0) {
      setError("The selected image is empty.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("The image must be 5 MB or smaller.");
      return;
    }

    setUploading(true);
    onUploadingChange?.(true);
    setProgress(0);
    try {
      const url = await uploadFile(file);
      onChange(url);
      setProgress(100);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload the category image.");
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[#E8DED3] bg-[#FCF8F3] p-4" aria-label="Category image upload">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="grid h-28 w-28 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#EAE2D9] bg-white">
          {value ? (
            // Category images are public URLs returned by the authenticated upload route.
            <img src={value} alt="Category image preview" className="h-full w-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-[#9A8E83]">
              <ImagePlus className="h-7 w-7" aria-hidden="true" />
              <span className="text-xs font-semibold">No image</span>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-[#342C25]">Category image</p>
          <p className="mt-1 text-sm leading-5 text-[#786D63]">
            Upload a clear image to represent this category. JPEG, PNG or WebP, up to 5 MB.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || uploading}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-3.5 py-2 text-sm font-bold text-white transition hover:bg-[#E94F2D] disabled:cursor-not-allowed disabled:opacity-55"
            >
              {uploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : value ? <Upload className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
              {uploading ? "Uploading…" : value ? "Replace image" : "Upload image"}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => { onChange(""); setError(""); setProgress(0); }}
                disabled={disabled || uploading}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-[#E5DAD0] bg-white px-3.5 py-2 text-sm font-semibold text-[#6F6258] transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-55"
              >
                <Trash2 className="h-4 w-4" /> Remove image
              </button>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            disabled={disabled || uploading}
            className="sr-only"
            aria-label="Choose category image file"
          />
          {uploading && (
            <div className="mt-3 max-w-sm" role="status" aria-live="polite">
              <div className="mb-1 flex items-center justify-between text-xs font-semibold text-[#786D63]">
                <span>Uploading category image</span><span>{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#EAE2D9]" role="progressbar" aria-label="Image upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                <div className="h-full rounded-full bg-[#FF5A36] transition-[width]" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
          {error && <p className="mt-2 text-sm font-medium text-rose-700" role="alert">{error}</p>}
        </div>
      </div>
    </section>
  );
}
