"use client";

export type AvailabilityStatus =
  | "AVAILABLE"
  | "ASK_SELLER"
  | "UNAVAILABLE";

interface AvailabilityDotProps {
  status?: AvailabilityStatus | string | null;
  showLabel?: boolean;
}

const STATUS_CONFIG: Record<
  AvailabilityStatus,
  {
    label: string;
    dot: string;
    text: string;
    bg: string;
  }
> = {
  AVAILABLE: {
    label: "Available",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
    bg: "bg-emerald-50",
  },

  ASK_SELLER: {
    label: "Ask seller",
    dot: "bg-amber-500",
    text: "text-amber-700",
    bg: "bg-amber-50",
  },

  UNAVAILABLE: {
    label: "Unavailable",
    dot: "bg-gray-400",
    text: "text-gray-600",
    bg: "bg-gray-100",
  },
};

export default function AvailabilityDot({
  status,
  showLabel = true,
}: AvailabilityDotProps) {
  const normalizedStatus: AvailabilityStatus =
    status === "AVAILABLE" ||
    status === "ASK_SELLER" ||
    status === "UNAVAILABLE"
      ? status
      : "ASK_SELLER";

  const config = STATUS_CONFIG[normalizedStatus];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${config.bg} ${config.text}`}
      title={config.label}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${config.dot}`}
      />

      {showLabel && (
        <span>{config.label}</span>
      )}
    </span>
  );
}