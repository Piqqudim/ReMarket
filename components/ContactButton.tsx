"use client";

import {
    ExternalLink,
  MessageCircle,
  Phone,
  Send,
} from "lucide-react";

type ContactPlatform =
  | "WHATSAPP"
  | "INSTAGRAM"
  | "TIKTOK"
  | "FACEBOOK"
  | "PHONE";

interface ContactButtonProps {
  platform: ContactPlatform | string;
  handle: string;
  label?: string;
  compact?: boolean;
}

function buildContactUrl(
  platform: ContactPlatform | string,
  handle: string
): string {
  const clean = handle.trim().replace(/^@/, "");

  if (!clean) {
    return "#";
  }

  switch (platform) {
    case "WHATSAPP": {
      if (clean.startsWith("http")) {
        return clean;
      }

      const phone = clean.replace(/\D/g, "");

      return phone
        ? `https://wa.me/${phone}`
        : "#";
    }

    case "INSTAGRAM":
      return clean.startsWith("http")
        ? clean
        : `https://instagram.com/${clean}`;

    case "TIKTOK":
      return clean.startsWith("http")
        ? clean
        : `https://tiktok.com/@${clean}`;

    case "FACEBOOK":
      return clean.startsWith("http")
        ? clean
        : `https://facebook.com/${clean}`;

    case "PHONE":
      return `tel:${clean.replace(
        /[^\d+]/g,
        ""
      )}`;

    default:
      return "#";
  }
}

function getIcon(platform: string) {
  switch (platform) {
    case "WHATSAPP":
      return MessageCircle;

    case "INSTAGRAM":
      return ExternalLink;

    case "FACEBOOK":
      return ExternalLink;

    case "PHONE":
      return Phone;

    case "TIKTOK":
      return Send;

    default:
      return MessageCircle;
  }
}

function getLabel(platform: string) {
  switch (platform) {
    case "WHATSAPP":
      return "WhatsApp";

    case "INSTAGRAM":
      return "Instagram";

    case "TIKTOK":
      return "TikTok";

    case "FACEBOOK":
      return "Facebook";

    case "PHONE":
      return "Call";

    default:
      return "Contact";
  }
}

export default function ContactButton({
  platform,
  handle,
  label,
  compact = false,
}: ContactButtonProps) {
  const url = buildContactUrl(
    platform,
    handle
  );

  const Icon = getIcon(platform);
  const text = label ?? getLabel(platform);

  return (
    <a
      href={url}
      target={
        platform === "PHONE"
          ? undefined
          : "_blank"
      }
      rel={
        platform === "PHONE"
          ? undefined
          : "noreferrer"
      }
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition ${
        compact
          ? "px-3 py-2 text-xs"
          : "px-4 py-2.5 text-sm"
      } ${
        platform === "WHATSAPP"
          ? "bg-[#25D366] text-white hover:bg-[#20bd5a]"
          : "border border-black/10 bg-white text-gray-700 hover:bg-[#FAF6EF]"
      }`}
    >
      <Icon
        aria-hidden
        className={
          compact
            ? "h-3.5 w-3.5"
            : "h-4 w-4"
        }
      />

      <span>{text}</span>
    </a>
  );
}