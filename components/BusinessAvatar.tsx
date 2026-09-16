"use client";

import { Store } from "lucide-react";

interface BusinessAvatarProps {
  name: string;
  imageUrl?: string | null;
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASSES = {
  sm: "h-10 w-10 rounded-xl",
  md: "h-12 w-12 rounded-xl",
  lg: "h-16 w-16 rounded-2xl",
};

const ICON_SIZES = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-7 w-7",
};

export default function BusinessAvatar({
  name,
  imageUrl,
  size = "md",
}: BusinessAvatarProps) {
  const initial =
    name.trim().charAt(0).toUpperCase() || "L";

  if (imageUrl) {
    return (
      <div
        className={`shrink-0 overflow-hidden bg-[#FFF0EA] ${SIZE_CLASSES[size]}`}
      >
        <img
          src={imageUrl}
          alt={`${name} logo`}
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex shrink-0 items-center justify-center bg-[#FFF0EA] font-bold text-[#D86646] ${SIZE_CLASSES[size]}`}
      aria-label={`${name} avatar`}
    >
      <span className={ICON_SIZES[size]}>
        {initial}
      </span>
    </div>
  );
}