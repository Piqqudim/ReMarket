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
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  Download,
  ExternalLink,
  FileText,
  ImagePlus,
  LayoutDashboard,
  Loader2,
  Megaphone,
  Package,
  Palette,
  RefreshCw,
  Sparkles,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Share2,
  Store,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import FlyerStudio from "./FlyerStudio";

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
    label: "Announcements",
    href: "/admin/announcements",
    icon: Bell,
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
  const [sharingContentId, setSharingContentId] =
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

        const responseData = data as {
          contents: AdminContent[];
          pagination: Pagination;
        };

        setContents(responseData.contents);
        setPagination(responseData.pagination);
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
    window.setTimeout(() => {
      document.getElementById("content-composer")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 60);
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

    window.setTimeout(() => {
      document.getElementById("content-composer")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 60);
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

      if (!wasEditing && pagination.page !== 1) {
        setPageToFirstPage();
      } else {
        await loadContents(wasEditing ? pagination.page : 1);
      }
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

  function getSharingText(content: AdminContent): string {
    const caption = content.caption.trim();
    const destination = content.linkUrl?.trim();

    if (!destination || caption.includes(destination)) {
      return caption;
    }

    return `${caption}\n\n${destination}`;
  }

  async function copyTextToClipboard(value: string) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    textarea.style.pointerEvents = "none";
    document.body.appendChild(textarea);
    textarea.select();

    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);

    if (!copied) {
      throw new Error("Copying is not supported by this browser. Select and copy the caption manually.");
    }
  }

  async function copyContentCaption(content: AdminContent) {
    clearMessages();

    try {
      await copyTextToClipboard(getSharingText(content));
      setSuccess("Caption copied, including the destination link when provided.");
    } catch (copyError) {
      setError(
        copyError instanceof Error
          ? copyError.message
          : "Unable to copy the caption."
      );
    }
  }

  async function downloadContentImage(content: AdminContent) {
    clearMessages();

    if (!content.imageUrl) {
      setError("This content does not have an image to download.");
      return;
    }

    try {
      const response = await fetch(content.imageUrl);
      if (!response.ok) {
        throw new Error("The image host did not allow the download.");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const safeTitle = content.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "remarket-content";
      const extension = blob.type === "image/png"
        ? "png"
        : blob.type === "image/webp"
          ? "webp"
          : "jpg";

      anchor.href = objectUrl;
      anchor.download = `${safeTitle}.${extension}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);

      setSuccess("Image download started.");
    } catch (downloadError) {
      console.error("Content image download error:", downloadError);
      setError(
        "The image could not be downloaded directly. Use Open image below, then save it from your browser."
      );
    }
  }

  async function openPlatformShare(
    content: AdminContent,
    platform: ContentPlatform
  ) {
    clearMessages();

    const sharingText = getSharingText(content);
    const rawDestination = content.linkUrl?.trim();
    const destination = rawDestination
      ? new URL(rawDestination, window.location.origin).toString()
      : null;

    let shareUrl: string;
    switch (platform) {
      case "WHATSAPP":
        shareUrl = `https://wa.me/?text=${encodeURIComponent(sharingText)}`;
        break;
      case "FACEBOOK":
        shareUrl = destination
          ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(destination)}`
          : "https://www.facebook.com/";
        break;
      case "LINKEDIN":
        shareUrl = destination
          ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(destination)}`
          : "https://www.linkedin.com/";
        break;
      case "INSTAGRAM":
        shareUrl = "https://www.instagram.com/";
        break;
      case "TIKTOK":
        shareUrl = "https://www.tiktok.com/upload";
        break;
    }

    // Open the platform directly in the click handler to reduce popup blocking.
    window.open(shareUrl, "_blank", "noopener,noreferrer");

    try {
      await copyTextToClipboard(sharingText);
      if (platform === "WHATSAPP") {
        setSuccess("WhatsApp opened with your caption and link. Attach the flyer separately if you want to send the image too.");
      } else if ((platform === "FACEBOOK" || platform === "LINKEDIN") && destination) {
        setSuccess(`${platform === "FACEBOOK" ? "Facebook" : "LinkedIn"} opened for link sharing. Your caption was copied; paste it into the post and attach the flyer if needed.`);
      } else if (platform === "INSTAGRAM") {
        setSuccess("Instagram opened and your caption was copied. Download the flyer and attach it to your post or Story.");
      } else if (platform === "TIKTOK") {
        setSuccess("TikTok's upload page opened and your caption was copied. Attach your image or video in TikTok.");
      } else {
        setSuccess(`${platform === "FACEBOOK" ? "Facebook" : "LinkedIn"} opened and your caption was copied. Add a destination link in Edit content to enable direct link sharing.`);
      }
    } catch (copyError) {
      console.error("Copy caption during platform sharing failed:", copyError);
      setSuccess("The platform opened, but your caption could not be copied automatically. Use Copy caption, then paste it into your post.");
    }
  }


  return (
    <main className="min-h-dvh w-full overflow-x-clip bg-[#F5F0EA] text-[#17202A]">
      <div className="flex min-h-dvh w-full">
        <aside className="sticky top-0 hidden h-dvh w-[232px] shrink-0 flex-col border-r border-white/10 bg-[#17202A] text-white lg:flex">
          <div className="border-b border-white/10 px-5 py-6">
            <Link href="/admin" className="flex items-center gap-3" aria-label="ReMarket admin home">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#FF5A36] text-lg font-black text-white shadow-[0_10px_30px_rgba(255,90,54,0.25)]">R</span>
              <span className="min-w-0">
                <span className="block text-lg font-black tracking-tight text-white">ReMarket</span>
                <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">Content studio</span>
              </span>
            </Link>
          </div>

          <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-5" aria-label="Admin navigation">
            <p className="mb-3 px-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/35">Workspace</p>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = item.href === "/admin/content";
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${
                    active
                      ? "bg-[#FF5A36] text-white shadow-[0_10px_24px_rgba(255,90,54,0.2)]"
                      : "text-white/65 hover:bg-white/[0.08] hover:text-white"
                  }`}
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                  {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white" />}
                </Link>
              );
            })}
          </nav>

          <div className="m-3 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-[#FFB49F]"><Palette size={17} /></div>
            <p className="mt-3 text-sm font-bold text-white">Make the message count.</p>
            <p className="mt-1 text-xs leading-5 text-white/50">Create, prepare and share ReMarket stories from one place.</p>
            <div className="mt-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-white/35"><span className="h-1.5 w-1.5 rounded-full bg-[#68D6A2]" /> Manual publishing workflow</div>
          </div>
        </aside>

        <section className="min-h-dvh min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex min-h-[70px] items-center justify-between gap-3 border-b border-[#EAE6DF] bg-[#FFFDFC]/95 px-4 backdrop-blur-xl sm:px-6 xl:px-8">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/admin"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FCFAF6] text-[#6F675F] lg:hidden"
                aria-label="Back to admin"
              >
                <ChevronLeft size={18} />
              </Link>

              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#9F2D18]">Admin workspace</p>
                <h1 className="truncate text-base font-black tracking-tight text-[#17202A] sm:text-lg">Content Studio</h1>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full border border-[#E8DED3] bg-white px-3 py-2 text-[11px] font-bold text-[#6F675F] sm:inline-flex"><span className="h-1.5 w-1.5 rounded-full bg-[#68B58C]" /> Studio ready</span>
              <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-[#E8DED3] bg-white px-3 py-2.5 text-xs font-bold text-[#6F675F] transition hover:border-[#FFB49F] hover:text-[#9F2D18] sm:px-4">
                <ExternalLink size={14} />
                <span className="hidden sm:inline">Marketplace</span>
                <span className="sm:hidden">Visit</span>
              </Link>
            </div>
          </header>

          <nav className="sticky top-[70px] z-20 border-b border-[#EAE6DF] bg-[#FFFDFC]/95 px-3 py-2 backdrop-blur-xl lg:hidden" aria-label="Admin navigation">
            <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = item.href === "/admin/content";
                return (
                  <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold transition ${active ? "bg-[#FF5A36] text-white shadow-sm" : "bg-[#F5F0EA] text-[#6F675F] hover:bg-[#FFE0D6]"}`}>
                    <Icon size={15} />{item.label}
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="mx-auto w-full max-w-[1760px] min-w-0 px-3 py-5 pb-24 sm:px-5 sm:py-6 md:px-7 xl:px-9 xl:py-8">
            <section className="relative mb-6 overflow-hidden rounded-[28px] bg-[#17202A] text-white shadow-[0_22px_70px_rgba(23,32,42,0.13)]">
              <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full border-[36px] border-[#FF5A36]/20" />
              <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 right-[24%] h-52 w-52 rounded-full bg-[#FF5A36]/10 blur-2xl" />
              <div className="relative grid min-w-0 gap-6 p-5 sm:p-7 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-center xl:p-8">
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.08] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.17em] text-[#FFC1AD]"><Sparkles size={13} /> Content lab / ReMarket</span>
                  <h2 className="mt-4 max-w-3xl text-3xl font-black leading-[1.05] tracking-tight sm:text-4xl xl:text-5xl">Make the scroll <span className="text-[#FF815F]">stop.</span></h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65 sm:text-base">Design a flyer, shape the message, and prepare a post that gives people a reason to discover what is nearby.</p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-2 rounded-xl bg-white/[0.08] px-3 py-2 text-[11px] font-bold text-white/80"><span className="text-[#FF8D70]">01</span> Design</span>
                    <span className="inline-flex items-center gap-2 rounded-xl bg-white/[0.08] px-3 py-2 text-[11px] font-bold text-white/80"><span className="text-[#FF8D70]">02</span> Write</span>
                    <span className="inline-flex items-center gap-2 rounded-xl bg-white/[0.08] px-3 py-2 text-[11px] font-bold text-white/80"><span className="text-[#FF8D70]">03</span> Share manually</span>
                  </div>
                </div>
                <div className="min-w-0 rounded-[22px] border border-white/10 bg-white/[0.06] p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div><p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-white/45">Studio snapshot</p><p className="mt-1 text-sm font-bold text-white">Your content library</p></div>
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF5A36] text-white"><Palette size={18} /></div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-black/15 p-3"><p className="text-[10px] font-bold text-white/45">Library total</p><p className="mt-1 text-2xl font-black tabular-nums">{pagination.total}</p><p className="mt-1 text-[10px] text-white/45">Saved content items</p></div>
                    <div className="rounded-2xl bg-black/15 p-3"><p className="text-[10px] font-bold text-white/45">On this page</p><p className="mt-1 text-2xl font-black tabular-nums">{contents.length}</p><p className="mt-1 text-[10px] text-white/45">Up to {PAGE_SIZE} items</p></div>
                  </div>
                  <button type="button" onClick={startCreate} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-3 text-sm font-extrabold text-white transition hover:bg-[#FF704F] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF5A36]/30"><Plus size={17} /> Create a new post <ChevronRight size={16} /></button>
                  <p className="mt-3 text-center text-[10px] leading-5 text-white/40">Manual publishing · No automatic social posting</p>
                </div>
              </div>
            </section>


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
                id="content-composer"
                onSubmit={submitContent}
                className="mb-8 scroll-mt-28 overflow-hidden rounded-[26px] border border-[#E6D8CC] bg-white p-4 shadow-[0_18px_50px_rgba(23,32,42,0.07)] sm:p-6 xl:p-7"
              >
                <div className="mb-6 flex items-start justify-between gap-3 rounded-2xl bg-[#17202A] p-4 text-white sm:p-5">
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#FFB49F]"><Sparkles size={12} /> Composer workspace</span>
                    <h3 className="mt-1 text-lg font-black text-white">
                      {editingId
                        ? "Edit content"
                        : "Create content"}
                    </h3>
                    <p className="mt-1 max-w-2xl text-sm leading-5 text-white/60">
                      {editingId ? "Refine your existing content and keep its sharing setup in sync." : "Create the visual, write the message, then select where you plan to share it."}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={closeForm}
                    disabled={saving || uploadingImage}
                    aria-label="Close content form"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
                  >
                    <X size={17} />
                  </button>
                </div>

                <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
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
                        className="w-full resize-y rounded-2xl border border-[#EAE6DF] bg-[#FCFAF6] px-3.5 py-3 text-sm leading-6 text-[#17202A] outline-none transition focus:border-[#FF5A36] focus:bg-white focus:ring-4 focus:ring-[#FF5A36]/10"
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
                      <div className="mb-2 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs font-bold text-[#6F675F]">
                          Image{" "}
                          <span className="font-medium text-[#A39A91]">
                            (optional)
                          </span>
                        </p>
                        <FlyerStudio
                          onUseImage={({ url, publicId }) => {
                            setForm((current) => ({
                              ...current,
                              imageUrl: url,
                              imagePublicId: publicId ?? "",
                            }));
                            setError("");
                            setSuccess(
                              "Flyer attached. Add a caption, select platforms, and save the content."
                            );
                          }}
                        />
                      </div>

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


            <section className="mb-5 rounded-[22px] border border-[#E8DED3] bg-white p-3 shadow-sm sm:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#FFF0ED] text-[#9F2D18]"><Search size={15} /></span><div><h3 className="text-sm font-black text-[#17202A]">Content library</h3><p className="mt-0.5 text-[10px] text-[#8A8178]">Search, filter and prepare saved posts</p></div></div>
                <button type="button" onClick={() => void loadContents(pagination.page)} disabled={loading} className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3 text-xs font-bold text-[#6F675F] transition hover:border-[#FFB49F] hover:text-[#9F2D18] disabled:opacity-50"><RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh</button>
              </div>
              <div className="flex min-w-0 flex-col gap-3 sm:flex-row">
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
            </section>

            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div><p className="text-sm font-bold text-[#17202A]">{query.trim() || statusFilter ? "Filtered results" : "Recent work"}</p><p className="mt-0.5 text-xs text-[#81776F]">{loading ? "Loading content..." : `${pagination.total} item${pagination.total === 1 ? "" : "s"} in the library`}</p></div>

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
              <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-2 2xl:gap-5">
                {contents.map((content) => (
                  <article
                    key={content.id}
                    className="group min-w-0 overflow-hidden rounded-[24px] border border-[#E7DCD2] bg-white shadow-[0_4px_18px_rgba(23,32,42,0.035)] transition duration-200 hover:-translate-y-0.5 hover:border-[#F1B6A5] hover:shadow-[0_18px_42px_rgba(23,32,42,0.09)]"
                  >
                    <div className="flex min-w-0 flex-col gap-4 p-3 sm:p-4">
                      <div className="relative h-[190px] w-full shrink-0 overflow-hidden rounded-[18px] border border-[#EAE6DF] bg-[#F6F1EA] sm:h-[230px]">
                        {content.imageUrl ? (
                          <img
                            src={content.imageUrl}
                            alt=""
                            className="h-full w-full object-contain p-2 transition duration-300 group-hover:scale-[1.01]"
                          />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-2 text-[#C0B6AC]">
                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-[#FF5A36] shadow-sm"><ImagePlus size={23} /></span>
                            <span className="text-xs font-semibold text-[#8A8178]">No artwork attached yet</span>
                          </div>
                        )}
                        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-white/60 bg-white/90 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[#5F544B] shadow-sm backdrop-blur"><span className={`h-1.5 w-1.5 rounded-full ${content.status === "READY" ? "bg-[#279768]" : content.status === "ARCHIVED" ? "bg-[#8B8178]" : "bg-[#E5A52D]"}`} />{content.status === "READY" ? "Ready to share" : content.status === "ARCHIVED" ? "Archived" : "Draft"}</span>
                        <span className="absolute bottom-3 right-3 rounded-lg bg-[#17202A]/85 px-2 py-1 text-[9px] font-extrabold tracking-wider text-white backdrop-blur">REMARKET STUDIO</span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="min-w-0 break-words text-lg font-black leading-snug tracking-tight text-[#17202A]">
                            {content.title}
                          </h3>

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

                      <div className="flex min-w-0 flex-row flex-wrap gap-2 border-t border-[#F0E7DF] pt-3 sm:pt-4">
                        <button
                          type="button"
                          onClick={() => startEdit(content)}
                          className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-3 text-xs font-bold text-[#6F675F] transition hover:bg-[#FCFAF6]"
                        >
                          <Pencil size={14} />
                          Edit
                        </button>


                        <button
                          type="button"
                          aria-expanded={sharingContentId === content.id}
                          onClick={() => {
                            clearMessages();
                            setSharingContentId((current) =>
                              current === content.id ? null : content.id
                            );
                          }}
                          className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-[#FFB49F] bg-[#FFF0ED] px-3 text-xs font-extrabold text-[#9F2D18] transition hover:bg-[#FFE0D6]"
                        >
                          <Share2 size={14} />
                          {sharingContentId === content.id ? "Close share tools" : "Share"}
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
                            className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3 text-xs font-bold text-[#6F675F] transition hover:bg-[#FFF0D9] disabled:opacity-50"
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
                            className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3 text-xs font-bold text-[#6F675F] transition hover:bg-[#FFF0D9] disabled:opacity-50"
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

                    {sharingContentId === content.id && (
                      <div className="border-t border-[#EAE6DF] bg-gradient-to-br from-[#FFF7ED] to-white p-4 sm:p-5">
                        <div className="mb-3 flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#9F2D18]">
                            <Share2 size={17} />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm font-black text-[#17202A]">Manual sharing tools</h4>
                            <p className="mt-1 text-xs leading-5 text-[#81776F]">
                              Copy the caption, download the flyer, then open a platform. ReMarket does not publish this post automatically.
                              {content.status !== "READY" && " This item is not marked Ready to share yet."}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void copyContentCaption(content)}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-3.5 text-xs font-extrabold text-white transition hover:bg-[#E94B29]"
                          >
                            <Copy size={15} />
                            Copy caption + link
                          </button>

                          <button
                            type="button"
                            disabled={!content.imageUrl}
                            onClick={() => void downloadContentImage(content)}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-3.5 text-xs font-bold text-[#6F675F] transition hover:bg-[#FFF0D9] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Download size={15} />
                            Download image
                          </button>

                          {content.imageUrl && (
                            <a
                              href={content.imageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-3.5 text-xs font-bold text-[#6F675F] transition hover:bg-[#FFF0D9]"
                            >
                              <ExternalLink size={15} />
                              Open image
                            </a>
                          )}
                        </div>

                        <div className="mt-4">
                          <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-[#A39A91]">
                            Open a selected platform
                          </p>
                          {content.platforms.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {content.platforms.map((platform) => {
                                const label = PLATFORMS.find((item) => item.value === platform)?.label ?? platform;
                                return (
                                  <button
                                    key={platform}
                                    type="button"
                                    onClick={() => void openPlatformShare(content, platform)}
                                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-3.5 text-xs font-bold text-[#17202A] transition hover:border-[#FF5A36] hover:bg-[#FFF0ED]"
                                  >
                                    <ExternalLink size={14} />
                                    {platform === "WHATSAPP" ? "Share on" : "Open"} {label}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="rounded-xl border border-dashed border-[#D9D1C8] bg-white px-3 py-3 text-xs leading-5 text-[#81776F]">
                              No platforms are selected. Choose Edit, select the intended platforms, and save the content to add platform shortcuts here.
                            </p>
                          )}
                        </div>

                        {(content.platforms.includes("FACEBOOK") || content.platforms.includes("LINKEDIN")) && !content.linkUrl && (
                          <p className="mt-3 text-[11px] leading-5 text-[#8A8178]">
                            Tip: add a public destination link using Edit content for Facebook and LinkedIn to open their link-sharing dialogs. Without one, those buttons open the platform home page.
                          </p>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}

            {!loading && pagination.totalPages > 1 && (
              <div className="mt-5 flex items-center justify-between gap-2 rounded-2xl border border-[#EAE6DF] bg-white p-3 shadow-sm sm:gap-3 sm:p-4">
                <button
                  type="button"
                  disabled={pagination.page <= 1}
                  onClick={() => {
                    const nextPage = pagination.page - 1;
                    setPagination((current) => ({
                      ...current,
                      page: nextPage,
                    }));
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
