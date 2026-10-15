
"use client";

import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  Archive,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  ImagePlus,
  LayoutDashboard,
  Loader2,
  Megaphone,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Store,
  Trash2,
  Upload,
  X,
} from "lucide-react";

type ContentPlatform =
  | "WHATSAPP"
  | "INSTAGRAM"
  | "FACEBOOK"
  | "TIKTOK"
  | "LINKEDIN";

type ContentStatus =
  | "DRAFT"
  | "READY"
  | "ARCHIVED";

type AdminContent = {
  id: string;
  title: string;
  caption: string;
  imageUrl: string | null;
  imagePublicId: string | null;
  linkUrl: string | null;
  platforms: ContentPlatform[];
  status: ContentStatus;
  createdAt: string;
  updatedAt: string;
  createdBy: {
    id: string;
    name: string | null;
  };
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const PAGE_SIZE = 12;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const PLATFORMS: {
  value: ContentPlatform;
  label: string;
}[] = [
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "FACEBOOK", label: "Facebook" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "LINKEDIN", label: "LinkedIn" },
];

const NAV_ITEMS = [
  {
    label: "Overview",
    href: "/admin",
    icon: LayoutDashboard,
  },
  {
    label: "Businesses",
    href: "/admin/businesses",
    icon: Store,
  },
  {
    label: "Products",
    href: "/admin/products",
    icon: Package,
  },
  {
    label: "Requests",
    href: "/admin/requests",
    icon: ClipboardList,
  },
  {
    label: "Content",
    href: "/admin/content",
    icon: Megaphone,
  },
  {
    label: "Deletion requests",
    href: "/admin/business-deletion-requests",
    icon: Trash2,
  },
];

const EMPTY_PAGINATION: Pagination = {
  page: 1,
  pageSize: PAGE_SIZE,
  total: 0,
  totalPages: 0,
};

function getErrorMessage(
  data: unknown,
  fallback: string
): string {
  if (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    return data.error;
  }

  return fallback;
}

function formatDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getStatusStyle(status: ContentStatus) {
  switch (status) {
    case "READY":
      return "bg-[#DDF5EA] text-[#137A59]";

    case "ARCHIVED":
      return "bg-[#EAE6DF] text-[#6F675F]";

    default:
      return "bg-[#FFF0C7] text-[#8A671D]";
  }
}

function getStatusLabel(status: ContentStatus): string {
  switch (status) {
    case "READY":
      return "Ready to share";
    case "ARCHIVED":
      return "Archived";
    default:
      return "Draft";
  }
}

function emptyForm() {
  return {
    title: "",
    caption: "",
    imageUrl: "",
    imagePublicId: "",
    linkUrl: "",
    platforms: [] as ContentPlatform[],
    status: "DRAFT" as ContentStatus,
  };
}

export default function AdminContentPage() {
  const [contents, setContents] = useState<AdminContent[]>([]);
  const [pagination, setPagination] =
    useState<Pagination>(EMPTY_PAGINATION);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "" | ContentStatus
  >("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(
    null
  );
  const [form, setForm] = useState(emptyForm());

  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [changingStatusId, setChangingStatusId] =
    useState<string | null>(null);

  const loadContents = useCallback(
    async (targetPage = pagination.page) => {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(PAGE_SIZE),
        });

        if (query.trim()) {
          params.set("q", query.trim());
        }

        if (statusFilter) {
          params.set("status", statusFilter);
        }

        const response = await fetch(
          `/api/admin/content?${params.toString()}`,
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const data: unknown = await response.json();

        if (!response.ok) {
          throw new Error(
            getErrorMessage(
              data,
              "Unable to load admin content."
            )
          );
        }

        if (
          !data ||
          typeof data !== "object" ||
          !("contents" in data) ||
          !Array.isArray(data.contents) ||
          !("pagination" in data) ||
          !data.pagination ||
          typeof data.pagination !== "object"
        ) {
          throw new Error(
            "The server returned an invalid content response."
          );
        }

        const paginationData =
          data.pagination as Pagination;

        setContents(data.contents as AdminContent[]);
        setPagination(paginationData);
      } catch (loadError) {
        console.error("Admin content load error:", loadError);

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load admin content."
        );
      } finally {
        setLoading(false);
      }
    },
    [pagination.page, query, statusFilter]
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadContents();
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [loadContents]);

  function clearMessages() {
    setError("");
    setSuccess("");
  }

  function startCreate() {
    clearMessages();
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  }

  function startEdit(content: AdminContent) {
    clearMessages();
    setEditingId(content.id);

    setForm({
      title: content.title,
      caption: content.caption,
      imageUrl: content.imageUrl ?? "",
      imagePublicId: content.imagePublicId ?? "",
      linkUrl: content.linkUrl ?? "",
      platforms: content.platforms,
      status: content.status,
    });

    setFormOpen(true);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function closeForm() {
    if (saving || uploadingImage) {
      return;
    }

    setFormOpen(false);
    setEditingId(null);
    setForm(emptyForm());
    clearMessages();
  }

  function togglePlatform(platform: ContentPlatform) {
    setForm((current) => ({
      ...current,
      platforms: current.platforms.includes(platform)
        ? current.platforms.filter(
            (item) => item !== platform
          )
        : [...current.platforms, platform],
    }));
  }

  async function uploadImage(file: File) {
    clearMessages();

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
      setError("The image must be 5MB or smaller.");
      return;
    }

    setUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data: unknown = await response.json();

      if (
        !response.ok ||
        !data ||
        typeof data !== "object" ||
        !("url" in data) ||
        typeof data.url !== "string"
      ) {
        throw new Error(
          getErrorMessage(
            data,
            "Unable to upload the image."
          )
        );
      }

      const publicId =
        "publicId" in data &&
        typeof data.publicId === "string"
          ? data.publicId
          : "";

      setForm((current) => ({
        ...current,
        imageUrl: data.url as string,
        imagePublicId: publicId,
      }));

      setSuccess(
        "Image uploaded. Save the content to attach it."
      );
    } catch (uploadError) {
      console.error("Admin content image upload error:", uploadError);

      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to upload the image."
      );
    } finally {
      setUploadingImage(false);
    }
  }

  async function submitContent(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    clearMessages();

    if (saving || uploadingImage) {
      return;
    }

    const title = form.title.trim();
    const caption = form.caption.trim();

    if (!title) {
      setError("Enter a title for this content.");
      return;
    }

    if (!caption) {
      setError("Enter a caption or message.");
      return;
    }

    if (
      form.status === "READY" &&
      form.platforms.length === 0
    ) {
      setError(
        "Select at least one platform before marking content ready."
      );
      return;
    }

    setSaving(true);

    try {
      const payload = {
        title,
        caption,
        imageUrl: form.imageUrl.trim() || null,
        imagePublicId: form.imagePublicId.trim() || null,
        linkUrl: form.linkUrl.trim() || null,
        platforms: form.platforms,
        status: form.status,
      };

      const response = await fetch(
        editingId
          ? `/api/admin/content/${editingId}`
          : "/api/admin/content",
        {
          method: editingId ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data: unknown = await response.json();

      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            data,
            "Unable to save content."
          )
        );
      }

      const wasEditing = Boolean(editingId);

      setFormOpen(false);
      setEditingId(null);
      setForm(emptyForm());

      setSuccess(
        wasEditing
          ? "Content updated successfully."
          : "Content created successfully."
      );

      if (!wasEditing) {
        setPageToFirstPage();
      }

      await loadContents(wasEditing ? pagination.page : 1);
    } catch (saveError) {
      console.error("Admin content save error:", saveError);

      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save content."
      );
    } finally {
      setSaving(false);
    }
  }

  function setPageToFirstPage() {
    setPagination((current) => ({
      ...current,
      page: 1,
    }));
  }

  async function changeContentStatus(
    content: AdminContent,
    nextStatus: ContentStatus
  ) {
    clearMessages();
    setChangingStatusId(content.id);

    try {
      const response = await fetch(
        `/api/admin/content/${content.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: nextStatus,
          }),
        }
      );

      const data: unknown = await response.json();

      if (!response.ok) {
        throw new Error(
          getErrorMessage(
            data,
            "Unable to update content status."
          )
        );
      }

      setSuccess(
        nextStatus === "ARCHIVED"
          ? "Content archived."
          : nextStatus === "READY"
            ? "Content marked ready to share."
            : "Content moved to drafts."
      );

      await loadContents();
    } catch (statusError) {
      console.error(
        "Admin content status update error:",
        statusError
      );

      setError(
        statusError instanceof Error
          ? statusError.message
          : "Unable to update content status."
      );
    } finally {
      setChangingStatusId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#FFF7ED] px-3 py-3 sm:px-5 sm:py-5">
      <div className="mx-auto flex min-h-[calc(100vh-24px)] max-w-[1500px] overflow-hidden rounded-[22px] border border-[#FF5A36] bg-[#FFFDFC] shadow-sm sm:min-h-[calc(100vh-40px)]">
        <aside className="hidden w-[190px] shrink-0 border-r border-[#EAE6DF] bg-[#FCFAF6] lg:block">
          <div className="flex h-[66px] items-center border-b border-[#EAE6DF] px-5">
            <Link
              href="/admin"
              className="text-xl font-black tracking-tight"
            >
              <span className="text-[#FF5A36]">Re</span>
              <span className="text-[#17202A]">Market</span>
            </Link>
          </div>

          <nav className="space-y-1 p-3">
            <p className="mb-3 px-3 pt-2 text-[11px] font-bold uppercase tracking-wider text-[#A39A91]">
              Admin
            </p>

            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.href === "/admin/content";

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                    active
                      ? "bg-[#FFE0D6] text-[#9F2D18]"
                      : "text-[#6F675F] hover:bg-[#FFF0D9]"
                  }`}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex h-[66px] items-center justify-between border-b border-[#EAE6DF] px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/admin"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FCFAF6] text-[#6F675F] lg:hidden"
                aria-label="Back to admin"
              >
                <ChevronLeft size={18} />
              </Link>

              <div>
                <p className="text-xs font-medium text-[#8A8178]">
                  Admin
                </p>
                <h1 className="text-lg font-black text-[#17202A]">
                  Content Creation
                </h1>
              </div>
            </div>

            <Link
              href="/"
              className="rounded-xl border border-[#EAE6DF] bg-white px-3 py-2 text-xs font-bold text-[#6F675F] transition hover:bg-[#FCFAF6]"
            >
              Marketplace
            </Link>
          </header>

          <div className="p-4 sm:p-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-[#17202A] sm:text-3xl">
                  Social content
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-[#81776F]">
                  Prepare captions and images for ReMarket&apos;s
                  social channels. Content is saved here for manual
                  sharing; it is not published automatically.
                </p>
              </div>

              <button
                type="button"
                onClick={startCreate}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 text-sm font-extrabold text-white shadow-sm transition hover:bg-[#E94B29]"
              >
                <Plus size={17} />
                Create content
              </button>
            </div>

            {success && (
              <div className="mb-5 flex items-center gap-3 rounded-2xl border border-[#BFE3CE] bg-[#EEF9F2] px-4 py-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D9F1E3] text-[#287A4B]">
                  <Check size={15} />
                </div>
                <p className="min-w-0 flex-1 text-sm font-semibold text-[#287A4B]">
                  {success}
                </p>
                <button
                  type="button"
                  onClick={() => setSuccess("")}
                  aria-label="Dismiss success message"
                  className="text-[#287A4B]"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {error && (
              <div className="mb-5 flex items-start justify-between gap-3 rounded-2xl border border-[#F2C7BC] bg-[#FFF0ED] px-4 py-3">
                <p className="text-sm font-semibold text-[#9F2D18]">
                  {error}
                </p>
                <button
                  type="button"
                  onClick={() => setError("")}
                  aria-label="Dismiss error"
                  className="shrink-0 text-[#9F2D18]"
                >
                  <X size={17} />
                </button>
              </div>
            )}

            {formOpen && (
              <form
                onSubmit={submitContent}
                className="mb-6 rounded-2xl border border-[#EAE6DF] bg-white p-4 sm:p-6"
              >
                <div className="mb-5 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-[#17202A]">
                      {editingId
                        ? "Edit content"
                        : "Create content"}
                    </h3>
                    <p className="mt-1 text-sm text-[#81776F]">
                      Write once and select the channels you intend
                      to share it on.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={closeForm}
                    disabled={saving || uploadingImage}
                    aria-label="Close content form"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#EAE6DF] text-[#6F675F] hover:bg-[#FCFAF6] disabled:opacity-50"
                  >
                    <X size={17} />
                  </button>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                  <div className="space-y-4">
                    <div>
                      <label
                        htmlFor="content-title"
                        className="mb-1.5 block text-xs font-bold text-[#6F675F]"
                      >
                        Internal title
                      </label>
                      <input
                        id="content-title"
                        required
                        maxLength={120}
                        value={form.title}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            title: event.target.value,
                          }))
                        }
                        placeholder="e.g. Discover local fashion stores"
                        className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3.5 text-sm text-[#17202A] outline-none focus:border-[#FF5A36]"
                      />
                      <p className="mt-1 text-right text-[11px] text-[#A39A91]">
                        {form.title.length}/120
                      </p>
                    </div>

                    <div>
                      <label
                        htmlFor="content-caption"
                        className="mb-1.5 block text-xs font-bold text-[#6F675F]"
                      >
                        Caption or message
                      </label>
                      <textarea
                        id="content-caption"
                        required
                        maxLength={5000}
                        rows={7}
                        value={form.caption}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            caption: event.target.value,
                          }))
                        }
                        placeholder="Write the message to share with your audience..."
                        className="w-full resize-y rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3.5 py-3 text-sm leading-6 text-[#17202A] outline-none focus:border-[#FF5A36]"
                      />
                      <p className="mt-1 text-right text-[11px] text-[#A39A91]">
                        {form.caption.length}/5000
                      </p>
                    </div>

                    <div>
                      <label
                        htmlFor="content-link"
                        className="mb-1.5 block text-xs font-bold text-[#6F675F]"
                      >
                        Destination link{" "}
                        <span className="font-medium text-[#A39A91]">
                          (optional)
                        </span>
                      </label>
                      <input
                        id="content-link"
                        type="text"
                        maxLength={2048}
                        value={form.linkUrl}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            linkUrl: event.target.value,
                          }))
                        }
                        placeholder="https://... or /shop"
                        className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3.5 text-sm text-[#17202A] outline-none focus:border-[#FF5A36]"
                      />
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <p className="mb-2 text-xs font-bold text-[#6F675F]">
                        Image{" "}
                        <span className="font-medium text-[#A39A91]">
                          (optional)
                        </span>
                      </p>

                      <div className="rounded-2xl border border-dashed border-[#D9D1C8] bg-[#FCFAF6] p-4">
                        {form.imageUrl ? (
                          <div className="space-y-3">
                            <div className="overflow-hidden rounded-xl border border-[#EAE6DF] bg-white">
                              <img
                                src={form.imageUrl}
                                alt="Content preview"
                                className="max-h-64 w-full object-contain"
                              />
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#FF5A36] px-3 py-2.5 text-xs font-bold text-white transition hover:bg-[#E94B29]">
                                {uploadingImage ? (
                                  <Loader2
                                    size={15}
                                    className="animate-spin"
                                  />
                                ) : (
                                  <Upload size={15} />
                                )}
                                Change image
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/webp"
                                  disabled={uploadingImage || saving}
                                  className="sr-only"
                                  onChange={(event) => {
                                    const file =
                                      event.target.files?.[0];
                                    event.target.value = "";
                                    if (file) {
                                      void uploadImage(file);
                                    }
                                  }}
                                />
                              </label>

                              <button
                                type="button"
                                disabled={uploadingImage || saving}
                                onClick={() =>
                                  setForm((current) => ({
                                    ...current,
                                    imageUrl: "",
                                    imagePublicId: "",
                                  }))
                                }
                                className="inline-flex items-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-3 py-2.5 text-xs font-bold text-[#6F675F] hover:bg-[#FFF0ED]"
                              >
                                <X size={15} />
                                Remove image
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="py-5 text-center">
                            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFE0D6] text-[#FF5A36]">
                              <ImagePlus size={24} />
                            </div>

                            <p className="mt-3 text-sm font-bold text-[#17202A]">
                              Add a content image
                            </p>
                            <p className="mt-1 text-xs leading-5 text-[#8A8178]">
                              JPEG, PNG or WebP. Maximum 5MB.
                            </p>

                            <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-2.5 text-xs font-bold text-white transition hover:bg-[#E94B29]">
                              {uploadingImage ? (
                                <Loader2
                                  size={15}
                                  className="animate-spin"
                                />
                              ) : (
                                <Upload size={15} />
                              )}
                              {uploadingImage
                                ? "Uploading..."
                                : "Choose image"}
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                disabled={uploadingImage || saving}
                                className="sr-only"
                                onChange={(event) => {
                                  const file =
                                    event.target.files?.[0];
                                  event.target.value = "";
                                  if (file) {
                                    void uploadImage(file);
                                  }
                                }}
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-bold text-[#6F675F]">
                        Intended sharing platforms
                      </p>

                      <div className="grid grid-cols-2 gap-2">
                        {PLATFORMS.map((platform) => {
                          const selected =
                            form.platforms.includes(platform.value);

                          return (
                            <label
                              key={platform.value}
                              className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm font-semibold transition ${
                                selected
                                  ? "border-[#FF5A36] bg-[#FFF0ED] text-[#9F2D18]"
                                  : "border-[#EAE6DF] bg-[#FCFAF6] text-[#6F675F] hover:bg-[#FFF7ED]"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                disabled={saving}
                                onChange={() =>
                                  togglePlatform(platform.value)
                                }
                                className="h-4 w-4 accent-[#FF5A36]"
                              />
                              <span>{platform.label}</span>
                            </label>
                          );
                        })}
                      </div>

                      <p className="mt-2 text-xs leading-5 text-[#8A8178]">
                        Selecting a platform records where you
                        intend to share the content. It does not
                        publish the content there.
                      </p>
                    </div>

                    <div>
                      <label
                        htmlFor="content-status"
                        className="mb-1.5 block text-xs font-bold text-[#6F675F]"
                      >
                        Content status
                      </label>
                      <select
                        id="content-status"
                        value={form.status}
                        disabled={saving}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            status: event.target.value as ContentStatus,
                          }))
                        }
                        className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3.5 text-sm text-[#17202A] outline-none focus:border-[#FF5A36]"
                      >
                        <option value="DRAFT">Draft</option>
                        <option value="READY">
                          Ready to share
                        </option>
                        <option value="ARCHIVED">
                          Archived
                        </option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col-reverse gap-2 border-t border-[#EAE6DF] pt-5 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeForm}
                    disabled={saving || uploadingImage}
                    className="h-11 rounded-xl border border-[#EAE6DF] bg-white px-5 text-sm font-bold text-[#6F675F] transition hover:bg-[#FCFAF6] disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={saving || uploadingImage}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-5 text-sm font-extrabold text-white transition hover:bg-[#E94B29] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? (
                      <Loader2
                        size={16}
                        className="animate-spin"
                      />
                    ) : (
                      <Check size={16} />
                    )}
                    {saving
                      ? "Saving..."
                      : editingId
                        ? "Save changes"
                        : "Create content"}
                  </button>
                </div>
              </form>
            )}

            <div className="mb-5 flex gap-2 overflow-x-auto lg:hidden">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/admin/content";

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${
                      active
                        ? "bg-[#FF5A36] text-white"
                        : "bg-[#FCFAF6] text-[#6F675F]"
                    }`}
                  >
                    <Icon size={15} />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <div className="mb-5 rounded-2xl border border-[#EAE6DF] bg-white p-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative min-w-0 flex-1">
                  <Search
                    size={17}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A39A91]"
                  />
                  <input
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPagination((current) => ({
                        ...current,
                        page: 1,
                      }));
                    }}
                    placeholder="Search titles and captions..."
                    className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] pl-10 pr-4 text-sm text-[#17202A] outline-none transition placeholder:text-[#A39A91] focus:border-[#FF5A36]"
                  />
                </div>

                <select
                  aria-label="Filter content by status"
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(
                      event.target.value as "" | ContentStatus
                    );
                    setPagination((current) => ({
                      ...current,
                      page: 1,
                    }));
                  }}
                  className="h-11 rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3 text-sm font-medium text-[#6F675F] outline-none focus:border-[#FF5A36]"
                >
                  <option value="">All statuses</option>
                  <option value="DRAFT">Draft</option>
                  <option value="READY">Ready to share</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-[#81776F]">
                {loading
                  ? "Loading content..."
                  : `${pagination.total} item${
                      pagination.total === 1 ? "" : "s"
                    } found`}
              </p>

              {pagination.totalPages > 1 && (
                <p className="text-xs text-[#8A8178]">
                  Page {pagination.page} of{" "}
                  {pagination.totalPages}
                </p>
              )}
            </div>

            {loading ? (
              <div className="rounded-2xl border border-[#EAE6DF] bg-white p-12 text-center">
                <Loader2
                  size={26}
                  className="mx-auto animate-spin text-[#FF5A36]"
                />
                <p className="mt-3 text-sm font-medium text-[#8A8178]">
                  Loading your content library...
                </p>
              </div>
            ) : contents.length === 0 ? (
              <div className="rounded-2xl border border-[#EAE6DF] bg-white px-6 py-12 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#FFE0D6] text-[#FF5A36]">
                  <FileText size={25} />
                </div>
                <h3 className="mt-4 font-black text-[#17202A]">
                  No content found
                </h3>
                <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-[#8A8178]">
                  {query.trim() || statusFilter
                    ? "Try changing your search or status filter."
                    : "Create your first social post to start building the ReMarket content library."}
                </p>

                {!query.trim() && !statusFilter && (
                  <button
                    type="button"
                    onClick={startCreate}
                    className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-[#FF5A36] px-4 text-sm font-bold text-white hover:bg-[#E94B29]"
                  >
                    <Plus size={16} />
                    Create content
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {contents.map((content) => (
                  <article
                    key={content.id}
                    className="overflow-hidden rounded-2xl border border-[#EAE6DF] bg-white"
                  >
                    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
                      <div className="h-28 w-full shrink-0 overflow-hidden rounded-xl bg-[#FCFAF6] sm:h-28 sm:w-36">
                        {content.imageUrl ? (
                          <img
                            src={content.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[#C0B6AC]">
                            <ImagePlus size={28} />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="break-words text-base font-black text-[#17202A]">
                            {content.title}
                          </h3>

                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${getStatusStyle(
                              content.status
                            )}`}
                          >
                            {getStatusLabel(content.status)}
                          </span>
                        </div>

                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#6F675F]">
                          {content.caption.length > 240
                            ? `${content.caption.slice(0, 240)}…`
                            : content.caption}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {content.platforms.length > 0 ? (
                            content.platforms.map((platform) => {
                              const label =
                                PLATFORMS.find(
                                  (item) => item.value === platform
                                )?.label ?? platform;

                              return (
                                <span
                                  key={platform}
                                  className="rounded-lg border border-[#EAE6DF] bg-[#FCFAF6] px-2 py-1 text-[10px] font-bold text-[#6F675F]"
                                >
                                  {label}
                                </span>
                              );
                            })
                          ) : (
                            <span className="text-[11px] text-[#A39A91]">
                              No platforms selected
                            </span>
                          )}
                        </div>

                        <p className="mt-3 text-[11px] text-[#A39A91]">
                          Updated {formatDate(content.updatedAt)}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-row flex-wrap gap-2 sm:w-36 sm:flex-col">
                        <button
                          type="button"
                          onClick={() => startEdit(content)}
                          className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-3 text-xs font-bold text-[#6F675F] transition hover:bg-[#FCFAF6] sm:flex-none"
                        >
                          <Pencil size={14} />
                          Edit
                        </button>

                        {content.status === "ARCHIVED" ? (
                          <button
                            type="button"
                            disabled={
                              changingStatusId === content.id
                            }
                            onClick={() =>
                              void changeContentStatus(
                                content,
                                "DRAFT"
                              )
                            }
                            className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3 text-xs font-bold text-[#6F675F] transition hover:bg-[#FFF0D9] disabled:opacity-50 sm:flex-none"
                          >
                            {changingStatusId === content.id ? (
                              <Loader2
                                size={14}
                                className="animate-spin"
                              />
                            ) : (
                              <RotateCcw size={14} />
                            )}
                            Restore draft
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={
                              changingStatusId === content.id
                            }
                            onClick={() =>
                              void changeContentStatus(
                                content,
                                "ARCHIVED"
                              )
                            }
                            className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3 text-xs font-bold text-[#6F675F] transition hover:bg-[#FFF0D9] disabled:opacity-50 sm:flex-none"
                          >
                            {changingStatusId === content.id ? (
                              <Loader2
                                size={14}
                                className="animate-spin"
                              />
                            ) : (
                              <Archive size={14} />
                            )}
                            Archive
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}

            {!loading && pagination.totalPages > 1 && (
              <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-[#EAE6DF] bg-white p-3">
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() => {
                    const nextPage = pagination.page - 1;
                    setPagination((current) => ({
                      ...current,
                      page: nextPage,
                    }));
                    void loadContents(nextPage);
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#EAE6DF] px-3 text-xs font-bold text-[#6F675F] hover:bg-[#FCFAF6] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={15} />
                  Previous
                </button>

                <span className="text-xs font-semibold text-[#8A8178]">
                  {pagination.page} / {pagination.totalPages}
                </span>

                <button
                  type="button"
                  disabled={
                    pagination.page >= pagination.totalPages
                  }
                  onClick={() => {
                    const nextPage = pagination.page + 1;
                    setPagination((current) => ({
                      ...current,
                      page: nextPage,
                    }));
                    void loadContents(nextPage);
                  }}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#EAE6DF] px-3 text-xs font-bold text-[#6F675F] hover:bg-[#FCFAF6] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                  <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
