"use client";

import {
  CheckCircle2,
  Download,
  ImagePlus,
  Loader2,
  Palette,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
} from "react";
import type { ChangeEvent } from "react";

type FlyerFormat = "portrait" | "square" | "story";

type UploadedFlyer = {
  url: string;
  publicId: string | null;
};

type FlyerStudioProps = {
  /** Called after the generated JPG has been uploaded to the existing /api/upload endpoint. */
  onUseImage: (image: UploadedFlyer) => void | Promise<void>;
};

const FORMAT_OPTIONS: Array<{
  value: FlyerFormat;
  label: string;
  description: string;
  height: number;
}> = [
  {
    value: "portrait",
    label: "Feed post",
    description: "4:5 portrait",
    height: 1350,
  },
  {
    value: "square",
    label: "Square post",
    description: "1:1 square",
    height: 1080,
  },
  {
    value: "story",
    label: "Status / Story",
    description: "9:16 portrait",
    height: 1920,
  },
];

const FLYER_WIDTH = 1080;
const MAX_SOURCE_IMAGE_BYTES = 5 * 1024 * 1024;

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function fitSingleLine(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
) {
  const original = value.trim();
  if (context.measureText(original).width <= maxWidth) {
    return original;
  }

  let result = original;
  while (result && context.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1).trimEnd();
  }

  return `${result}…`;
}

function drawWrappedText(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = value.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;

    if (context.measureText(candidate).width <= maxWidth || !currentLine) {
      currentLine = candidate;
    } else {
      lines.push(currentLine);
      currentLine = word;

      if (lines.length === maxLines) {
        break;
      }
    }
  }

  if (currentLine && lines.length < maxLines) {
    lines.push(currentLine);
  }

  const usedAllWords = lines.join(" ").split(/\s+/).length >= words.length;

  if (!usedAllWords && lines.length > 0) {
    let last = lines[lines.length - 1];
    while (last && context.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1).trimEnd();
    }
    lines[lines.length - 1] = `${last}…`;
  }

  lines.forEach((line, index) => {
    context.fillText(line, x, y + index * lineHeight);
  });
}

function drawCropImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const imageRatio = image.width / image.height;
  const frameRatio = width / height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.width;
  let sourceHeight = image.height;

  if (imageRatio > frameRatio) {
    sourceWidth = image.height * frameRatio;
    sourceX = (image.width - sourceWidth) / 2;
  } else {
    sourceHeight = image.width / frameRatio;
    sourceY = (image.height - sourceHeight) / 2;
  }

  context.save();
  roundedRect(context, x, y, width, height, radius);
  context.clip();
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
  );
  context.restore();
}

export default function FlyerStudio({ onUseImage }: FlyerStudioProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<FlyerFormat>("portrait");
  const [businessName, setBusinessName] = useState("");
  const [supportingText, setSupportingText] = useState(
    "Your local business is now easier to discover.",
  );
  const [website, setWebsite] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState("");
  const [photoRendering, setPhotoRendering] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const selectedFormat = FORMAT_OPTIONS.find((item) => item.value === format)!;

  useEffect(() => {
    if (!open) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = FLYER_WIDTH;
    const height = selectedFormat.height;
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) return;

    let active = true;
    const unit = height / 1350;
    const margin = 76;
    const contentWidth = width - margin * 2;

    // ReMarket palette: warm cream, coral, dark coral and ink.
    context.fillStyle = "#FFF7ED";
    context.fillRect(0, 0, width, height);

    // Soft decorative shapes keep the flyer branded without needing stock artwork.
    context.fillStyle = "#FFE0D6";
    context.beginPath();
    context.arc(width - 34, 58 * unit, 210 * unit, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#FFF0D9";
    context.beginPath();
    context.arc(12, height * 0.8, 145 * unit, 0, Math.PI * 2);
    context.fill();

    // Wordmark.
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.font = `800 ${48 * unit}px Arial, sans-serif`;
    context.fillStyle = "#FF5A36";
    context.fillText("Re", margin, 96 * unit);
    const reWidth = context.measureText("Re").width;
    context.fillStyle = "#17202A";
    context.fillText("Market", margin + reWidth - 1, 96 * unit);

    context.font = `500 ${20 * unit}px Arial, sans-serif`;
    context.fillStyle = "#6F675F";
    context.fillText("Find it nearby", margin, 128 * unit);

    // Label pill.
    const pillY = height * 0.17;
    roundedRect(context, margin, pillY - 29 * unit, 276 * unit, 48 * unit, 24 * unit);
    context.fillStyle = "#FF5A36";
    context.fill();
    context.font = `800 ${19 * unit}px Arial, sans-serif`;
    context.fillStyle = "#FFFFFF";
    context.textAlign = "center";
    context.fillText("BUSINESS SPOTLIGHT", margin + 138 * unit, pillY + 2 * unit);

    // Main headline.
    context.textAlign = "center";
    context.font = `800 ${76 * unit}px Arial, sans-serif`;
    context.fillStyle = "#17202A";
    context.fillText("LIVE ON", width / 2, height * 0.285);
    context.font = `900 ${104 * unit}px Arial, sans-serif`;
    context.fillStyle = "#FF5A36";
    context.fillText("ReMarket", width / 2, height * 0.365);

    // Business name and editable supporting copy.
    const safeBusinessName = businessName.trim() || "Your Business Name";
    context.font = `800 ${37 * unit}px Arial, sans-serif`;
    context.fillStyle = "#17202A";
    context.fillText(
      fitSingleLine(context, safeBusinessName, contentWidth),
      width / 2,
      height * 0.415,
    );

    context.font = `500 ${23 * unit}px Arial, sans-serif`;
    context.fillStyle = "#6F675F";
    drawWrappedText(
      context,
      supportingText.trim() || "Find this business on ReMarket.",
      width / 2,
      height * 0.455,
      contentWidth - 30,
      31 * unit,
      2,
    );

    // Product/business photo frame.
    const photoX = margin;
    const photoY = height * 0.515;
    const photoWidth = contentWidth;
    const photoHeight = height * (format === "story" ? 0.285 : format === "square" ? 0.245 : 0.285);
    roundedRect(context, photoX, photoY, photoWidth, photoHeight, 30 * unit);
    context.fillStyle = "#FFFDFC";
    context.fill();
    context.strokeStyle = "#F4B5A4";
    context.lineWidth = 3 * unit;
    context.stroke();

    if (photoDataUrl) {
      setPhotoRendering(true);
      const image = new Image();
      image.onload = () => {
        if (!active) return;
        drawCropImage(
          context,
          image,
          photoX + 5 * unit,
          photoY + 5 * unit,
          photoWidth - 10 * unit,
          photoHeight - 10 * unit,
          26 * unit,
        );
        setPhotoRendering(false);
      };
      image.onerror = () => {
        if (!active) return;
        drawPhotoPlaceholder(context, photoX, photoY, photoWidth, photoHeight, unit);
        setPhotoRendering(false);
      };
      image.src = photoDataUrl;
    } else {
      setPhotoRendering(false);
      drawPhotoPlaceholder(context, photoX, photoY, photoWidth, photoHeight, unit);
    }

    // CTA.
    const ctaY = height * 0.855;
    const ctaWidth = 470 * unit;
    const ctaHeight = 72 * unit;
    roundedRect(context, (width - ctaWidth) / 2, ctaY - ctaHeight / 2, ctaWidth, ctaHeight, 36 * unit);
    context.fillStyle = "#9F2D18";
    context.fill();
    context.font = `800 ${25 * unit}px Arial, sans-serif`;
    context.textAlign = "center";
    context.fillStyle = "#FFFFFF";
    context.fillText("FIND IT NEARBY", width / 2, ctaY + 9 * unit);

    // Footer. URL is optional; no domain is assumed.
    context.font = `600 ${19 * unit}px Arial, sans-serif`;
    context.fillStyle = "#6F675F";
    const footer = website.trim() || "ReMarket  •  Local businesses, easier to find";
    context.fillText(fitSingleLine(context, footer, contentWidth), width / 2, height * 0.94);

    return () => {
      active = false;
    };
  }, [
    open,
    format,
    selectedFormat.height,
    businessName,
    supportingText,
    website,
    photoDataUrl,
  ]);

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    setError("");
    setDownloaded(false);
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Choose an image file to use on the flyer.");
      return;
    }

    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
      setError("Choose an image smaller than 5 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setPhotoDataUrl(reader.result);
        setPhotoName(file.name);
      } else {
        setError("Unable to read that image. Try another file.");
      }
    };
    reader.onerror = () => setError("Unable to read that image. Try another file.");
    reader.readAsDataURL(file);
  }

  function getFlyerBlob(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        reject(new Error("The flyer preview is not ready yet."));
        return;
      }

      if (photoRendering) {
        reject(new Error("The photo is still being prepared. Please try again in a moment."));
        return;
      }

      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Unable to generate the flyer image."));
          return;
        }
        resolve(blob);
      }, "image/jpeg", 0.92);
    });
  }

  async function downloadFlyer() {
    setError("");
    setDownloaded(false);

    try {
      const blob = await getFlyerBlob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = "remarket-live-on-remarket.jpg";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      setDownloaded(true);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Unable to download flyer.");
    }
  }

  async function useFlyerInContent() {
    setError("");
    setDownloaded(false);
    setUploading(true);

    try {
      const blob = await getFlyerBlob();
      const file = new File([blob], "remarket-live-on-remarket.jpg", {
        type: "image/jpeg",
      });
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      let data: unknown;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        const message =
          typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
            ? data.error
            : "Unable to upload the generated flyer.";
        throw new Error(message);
      }

      if (
        typeof data !== "object" ||
        data === null ||
        !("url" in data) ||
        typeof data.url !== "string" ||
        !data.url.trim()
      ) {
        throw new Error("The upload response did not include an image URL.");
      }

      const publicId =
        "publicId" in data && typeof data.publicId === "string"
          ? data.publicId
          : null;

      await onUseImage({
        url: data.url,
        publicId,
      });
      setOpen(false);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to use this flyer.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError("");
        }}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#FFB49F] bg-[#FFF0D9] px-4 py-2.5 text-sm font-bold text-[#9F2D18] transition hover:bg-[#FFE0D6]"
      >
        <Palette size={17} />
        Create a ReMarket flyer
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-[#17202A]/50 p-0 sm:items-center sm:p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !uploading) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="remarket-flyer-studio-title"
            className="max-h-[96vh] w-full max-w-6xl overflow-y-auto rounded-t-3xl bg-[#FFFDFC] shadow-2xl sm:rounded-3xl"
          >
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[#EAE6DF] bg-[#FFFDFC]/95 px-4 py-4 backdrop-blur sm:px-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#9F2D18]">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h2 id="remarket-flyer-studio-title" className="font-black text-[#17202A]">
                    ReMarket Flyer Studio
                  </h2>
                  <p className="text-xs text-[#8A8178]">Template: Live on ReMarket</p>
                </div>
              </div>
              <button
                type="button"
                disabled={uploading}
                onClick={() => setOpen(false)}
                aria-label="Close flyer studio"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-[#6F675F] hover:bg-[#FCFAF6] disabled:opacity-50"
              >
                <X size={19} />
              </button>
            </header>

            <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,1.1fr)]">
              <div className="space-y-4">
                <div>
                  <label htmlFor="flyer-format" className="mb-1.5 block text-xs font-bold text-[#6F675F]">
                    Flyer format
                  </label>
                  <select
                    id="flyer-format"
                    value={format}
                    onChange={(event) => setFormat(event.target.value as FlyerFormat)}
                    className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-white px-3 text-sm outline-none focus:border-[#FF5A36]"
                  >
                    {FORMAT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label} — {option.description}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="flyer-business-name" className="mb-1.5 block text-xs font-bold text-[#6F675F]">
                    Business or product name
                  </label>
                  <input
                    id="flyer-business-name"
                    value={businessName}
                    onChange={(event) => setBusinessName(event.target.value.slice(0, 100))}
                    maxLength={100}
                    placeholder="e.g. Mandy Treasures"
                    className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-white px-3 text-sm outline-none focus:border-[#FF5A36]"
                  />
                </div>

                <div>
                  <label htmlFor="flyer-supporting-text" className="mb-1.5 block text-xs font-bold text-[#6F675F]">
                    Supporting message
                  </label>
                  <textarea
                    id="flyer-supporting-text"
                    value={supportingText}
                    onChange={(event) => setSupportingText(event.target.value.slice(0, 140))}
                    maxLength={140}
                    rows={3}
                    placeholder="Tell people what they can discover."
                    className="w-full resize-y rounded-xl border border-[#EAE6DF] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#FF5A36]"
                  />
                  <p className="mt-1 text-right text-[11px] text-[#A39A91]">{supportingText.length}/140</p>
                </div>

                <div>
                  <label htmlFor="flyer-website" className="mb-1.5 block text-xs font-bold text-[#6F675F]">
                    Website or call-to-action URL (optional)
                  </label>
                  <input
                    id="flyer-website"
                    value={website}
                    onChange={(event) => setWebsite(event.target.value.slice(0, 100))}
                    maxLength={100}
                    placeholder="Enter your verified ReMarket URL"
                    className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-white px-3 text-sm outline-none focus:border-[#FF5A36]"
                  />
                </div>

                <div className="rounded-2xl border border-dashed border-[#E6B6A8] bg-[#FFF7ED] p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#9F2D18]">
                      <ImagePlus size={19} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[#17202A]">Add a business or product photo</p>
                      <p className="mt-1 text-xs leading-5 text-[#8A8178]">Optional. Use an image you have permission to share, up to 5 MB.</p>
                      {photoName && <p className="mt-2 truncate text-xs font-semibold text-[#287A4B]">{photoName}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-3 py-2 text-xs font-bold text-[#6F675F] hover:bg-[#FCFAF6]">
                          <UploadCloud size={14} />
                          {photoDataUrl ? "Change photo" : "Choose photo"}
                          <input type="file" accept="image/*" onChange={handlePhotoChange} className="sr-only" />
                        </label>
                        {photoDataUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setPhotoDataUrl(null);
                              setPhotoName("");
                            }}
                            className="rounded-xl px-3 py-2 text-xs font-bold text-[#9F2D18] hover:bg-[#FFE0D6]"
                          >
                            Remove photo
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl border border-[#F2C7BC] bg-[#FFF0ED] px-3 py-2.5 text-sm font-medium text-[#9F2D18]">
                    {error}
                  </div>
                )}

                {downloaded && (
                  <div className="flex items-center gap-2 rounded-xl border border-[#CBE7D7] bg-[#F1FBF5] px-3 py-2.5 text-sm font-semibold text-[#287A4B]">
                    <CheckCircle2 size={16} />
                    Flyer download started.
                  </div>
                )}

                <p className="text-[11px] leading-5 text-[#8A8178]">
                  This template creates a downloadable JPG. Using it in the content form uploads the generated image to the existing image-upload endpoint; it does not publish to social media.
                </p>
              </div>

              <div className="min-w-0">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-[#17202A]">Live preview</p>
                    <p className="mt-0.5 text-xs text-[#8A8178]">ReMarket-branded, editable template</p>
                  </div>
                  <span className="rounded-full bg-[#FCFAF6] px-2.5 py-1 text-[10px] font-bold text-[#6F675F]">JPG · {FLYER_WIDTH} × {selectedFormat.height}</span>
                </div>

                <div className="flex justify-center rounded-2xl border border-[#EAE6DF] bg-[#FCFAF6] p-3 sm:p-4">
                  <canvas
                    ref={canvasRef}
                    aria-label="Live preview of the Live on ReMarket flyer"
                    className="h-auto w-full max-w-[390px] rounded-lg shadow-md"
                    style={{ aspectRatio: `${FLYER_WIDTH} / ${selectedFormat.height}` }}
                  />
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void downloadFlyer()}
                    disabled={uploading || photoRendering}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-4 py-3 text-sm font-bold text-[#6F675F] transition hover:bg-[#FCFAF6] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download size={17} />
                    {photoRendering ? "Preparing photo…" : "Download flyer"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void useFlyerInContent()}
                    disabled={uploading || photoRendering}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#E94B29] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {uploading ? <Loader2 size={17} className="animate-spin" /> : <ImagePlus size={17} />}
                    {uploading ? "Uploading flyer…" : photoRendering ? "Preparing photo…" : "Use in content"}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function drawPhotoPlaceholder(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  unit: number,
) {
  context.save();
  roundedRect(context, x + 5 * unit, y + 5 * unit, width - 10 * unit, height - 10 * unit, 25 * unit);
  context.fillStyle = "#FFF0D9";
  context.fill();

  const centerX = x + width / 2;
  const centerY = y + height / 2;
  context.strokeStyle = "#FF8A6D";
  context.lineWidth = 5 * unit;
  context.beginPath();
  context.arc(centerX, centerY - 30 * unit, 42 * unit, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.moveTo(centerX - 19 * unit, centerY - 30 * unit);
  context.lineTo(centerX + 19 * unit, centerY - 30 * unit);
  context.moveTo(centerX, centerY - 49 * unit);
  context.lineTo(centerX, centerY - 11 * unit);
  context.stroke();

  context.textAlign = "center";
  context.fillStyle = "#9F2D18";
  context.font = `700 ${27 * unit}px Arial, sans-serif`;
  context.fillText("Add your photo", centerX, centerY + 58 * unit);
  context.font = `500 ${19 * unit}px Arial, sans-serif`;
  context.fillStyle = "#6F675F";
  context.fillText("Show customers what they can discover", centerX, centerY + 91 * unit);
  context.restore();
}
