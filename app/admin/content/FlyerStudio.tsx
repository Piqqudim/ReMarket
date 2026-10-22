"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import type { ChangeEvent } from "react";
import {
  CheckCircle2,
  Download,
  ImagePlus,
  Loader2,
  Palette,
  Sparkles,
  UploadCloud,
  X,
  WandSparkles,
  Layers3,
  Scan,
  RectangleHorizontal,
  RectangleVertical,
  Square,
} from "lucide-react";

type FlyerFormat = "portrait" | "square" | "story";
type FlyerTemplate = "spotlight" | "product" | "playful" | "fresh" | "midnight";
type ImageFit = "fit" | "fill";

type UploadedFlyer = {
  url: string;
  publicId: string | null;
};

type FlyerStudioProps = {
  /** Called after the generated JPG has been uploaded to the existing /api/upload endpoint. */
  onUseImage: (image: UploadedFlyer) => void | Promise<void>;
};

type TemplateOption = {
  value: FlyerTemplate;
  label: string;
  subtitle: string;
  previewClass: string;
};

const FORMAT_OPTIONS: Array<{
  value: FlyerFormat;
  label: string;
  description: string;
  height: number;
  icon: typeof RectangleVertical;
}> = [
  {
    value: "portrait",
    label: "Feed post",
    description: "4:5 portrait",
    height: 1350,
    icon: RectangleVertical,
  },
  {
    value: "square",
    label: "Square post",
    description: "1:1 square",
    height: 1080,
    icon: Square,
  },
  {
    value: "story",
    label: "Status / Story",
    description: "9:16 portrait",
    height: 1920,
    icon: RectangleHorizontal,
  },
];

const TEMPLATE_OPTIONS: TemplateOption[] = [
  {
    value: "spotlight",
    label: "Local spotlight",
    subtitle: "Warm, bold and branded",
    previewClass: "bg-[#FFF0E8] text-[#9F2D18]",
  },
  {
    value: "product",
    label: "Product hero",
    subtitle: "Let the photo lead",
    previewClass: "bg-[#17202A] text-white",
  },
  {
    value: "playful",
    label: "Good-find club",
    subtitle: "Playful shapes and lively type",
    previewClass: "bg-[#F0E8FF] text-[#6743A5]",
  },
  {
    value: "fresh",
    label: "Fresh discovery",
    subtitle: "Fresh, bright and modern",
    previewClass: "bg-[#E3F5E9] text-[#176B4A]",
  },
  {
    value: "midnight",
    label: "Night market",
    subtitle: "High contrast for a bold post",
    previewClass: "bg-[#23233C] text-[#FFF7ED]",
  },
];

const FLYER_WIDTH = 1080;
const MAX_SOURCE_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_SOURCE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const COLORS = {
  ink: "#17202A",
  coral: "#FF5A36",
  deepCoral: "#9F2D18",
  cream: "#FFF7ED",
  white: "#FFFDFC",
  muted: "#6F675F",
  paleCoral: "#FFE0D6",
  paleGold: "#FFF0D9",
  green: "#DDF5E7",
  deepGreen: "#176B4A",
  purple: "#6743A5",
  palePurple: "#EFE6FF",
  midnight: "#23233C",
  lime: "#D9F76A",
};

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
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
  if (context.measureText(original).width <= maxWidth) return original;

  let result = original;
  while (result.length > 1 && context.measureText(`${result}…`).width > maxWidth) {
    result = result.slice(0, -1).trimEnd();
  }
  return `${result}…`;
}

function wrapLines(
  context: CanvasRenderingContext2D,
  value: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (!words.length || maxLines < 1) return [];

  const lines: string[] = [];
  let wordIndex = 0;

  while (wordIndex < words.length && lines.length < maxLines) {
    let current = "";
    while (wordIndex < words.length) {
      const candidate = current ? `${current} ${words[wordIndex]}` : words[wordIndex];
      if (context.measureText(candidate).width <= maxWidth || !current) {
        current = candidate;
        wordIndex += 1;
      } else {
        break;
      }
    }
    lines.push(current);
  }

  if (wordIndex < words.length && lines.length) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && context.measureText(`${last}…`).width > maxWidth) {
      last = last.slice(0, -1).trimEnd();
    }
    lines[lines.length - 1] = `${last}…`;
  }

  return lines;
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
  const lines = wrapLines(context, value, maxWidth, maxLines);
  lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
  return lines.length;
}

function drawPill(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  background: string,
  foreground: string,
  fontSize = 19,
) {
  context.save();
  context.font = `800 ${fontSize}px Arial, sans-serif`;
  const width = context.measureText(text).width + 42;
  const height = fontSize + 24;
  roundedRect(context, x, y, width, height, height / 2);
  context.fillStyle = background;
  context.fill();
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillStyle = foreground;
  context.fillText(text, x + 21, y + height / 2 + 1);
  context.restore();
  return { width, height };
}

function drawBrand(
  context: CanvasRenderingContext2D,
  dark = false,
) {
  const margin = 72;
  context.save();
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.font = "900 43px Arial, sans-serif";
  context.fillStyle = COLORS.coral;
  context.fillText("Re", margin, 91);
  const reWidth = context.measureText("Re").width;
  context.fillStyle = dark ? COLORS.white : COLORS.ink;
  context.fillText("Market", margin + reWidth - 2, 91);

  context.font = "500 19px Arial, sans-serif";
  context.fillStyle = dark ? "#D6D5E4" : COLORS.muted;
  context.fillText("Find it nearby", margin, 122);

  // A restrained brand marker on the opposite corner.
  roundedRect(context, FLYER_WIDTH - margin - 42, 56, 42, 42, 13);
  context.fillStyle = dark ? COLORS.lime : COLORS.paleCoral;
  context.fill();
  context.fillStyle = dark ? COLORS.midnight : COLORS.deepCoral;
  context.textAlign = "center";
  context.font = "900 27px Arial, sans-serif";
  context.fillText("R", FLYER_WIDTH - margin - 21, 85);
  context.restore();
}

function drawCropImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const imageRatio = image.naturalWidth / image.naturalHeight;
  const frameRatio = width / height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.naturalWidth;
  let sourceHeight = image.naturalHeight;

  if (imageRatio > frameRatio) {
    sourceWidth = image.naturalHeight * frameRatio;
    sourceX = (image.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = image.naturalWidth / frameRatio;
    sourceY = (image.naturalHeight - sourceHeight) / 2;
  }

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function drawPhoto(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  imageFit: ImageFit,
  frameColor: string,
  dark = false,
) {
  context.save();
  context.shadowColor = dark ? "rgba(0,0,0,0.25)" : "rgba(23,32,42,0.12)";
  context.shadowBlur = 22;
  context.shadowOffsetY = 10;
  roundedRect(context, x, y, width, height, radius);
  context.fillStyle = frameColor;
  context.fill();
  context.shadowColor = "transparent";
  context.shadowBlur = 0;
  context.shadowOffsetY = 0;
  context.save();
  roundedRect(context, x, y, width, height, radius);
  context.clip();
  context.fillStyle = frameColor;
  context.fillRect(x, y, width, height);

  if (image && image.naturalWidth > 0 && image.naturalHeight > 0) {
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    const inset = imageFit === "fit" ? 20 : 0;
    const innerX = x + inset;
    const innerY = y + inset;
    const innerWidth = width - inset * 2;
    const innerHeight = height - inset * 2;

    if (imageFit === "fill") {
      drawCropImage(context, image, innerX, innerY, innerWidth, innerHeight);
    } else {
      // FIT preserves the whole source image so logos, products and portraits aren't cut off.
      const scale = Math.min(innerWidth / image.naturalWidth, innerHeight / image.naturalHeight);
      const renderedWidth = image.naturalWidth * scale;
      const renderedHeight = image.naturalHeight * scale;
      const imageX = innerX + (innerWidth - renderedWidth) / 2;
      const imageY = innerY + (innerHeight - renderedHeight) / 2;
      context.drawImage(image, imageX, imageY, renderedWidth, renderedHeight);
    }
  } else {
    drawPhotoPlaceholder(context, x, y, width, height, 1, frameColor, dark);
  }

  context.restore();
  context.strokeStyle = dark ? "rgba(255,255,255,0.26)" : "rgba(159,45,24,0.17)";
  context.lineWidth = 2;
  roundedRect(context, x, y, width, height, radius);
  context.stroke();
  context.restore();
}

function drawPhotoPlaceholder(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  scale: number,
  frameColor: string,
  dark = false,
) {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const accent = dark ? COLORS.lime : COLORS.coral;
  context.save();
  context.fillStyle = frameColor;
  context.fillRect(x, y, width, height);
  context.strokeStyle = accent;
  context.lineWidth = 4 * scale;
  context.beginPath();
  context.arc(centerX, centerY - 24 * scale, 34 * scale, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.moveTo(centerX - 15 * scale, centerY - 24 * scale);
  context.lineTo(centerX + 15 * scale, centerY - 24 * scale);
  context.moveTo(centerX, centerY - 39 * scale);
  context.lineTo(centerX, centerY - 9 * scale);
  context.stroke();
  context.textAlign = "center";
  context.fillStyle = dark ? COLORS.white : COLORS.deepCoral;
  context.font = `800 ${25 * scale}px Arial, sans-serif`;
  context.fillText("Your photo goes here", centerX, centerY + 38 * scale);
  context.font = `500 ${16 * scale}px Arial, sans-serif`;
  context.fillStyle = dark ? "#D6D5E4" : COLORS.muted;
  context.fillText("Show them what you offer", centerX, centerY + 67 * scale);
  context.restore();
}

function drawStar(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  outerRadius: number,
  innerRadius: number,
  fill: string,
) {
  context.save();
  context.beginPath();
  for (let point = 0; point < 10; point += 1) {
    const radius = point % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + (point * Math.PI) / 5;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (point === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  context.restore();
}

function drawFlyer(
  canvas: HTMLCanvasElement,
  config: {
    format: FlyerFormat;
    template: FlyerTemplate;
    businessName: string;
    supportingText: string;
    website: string;
    imageFit: ImageFit;
  },
  height: number,
  image: HTMLImageElement | null,
) {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not prepare the flyer preview.");

  const width = FLYER_WIDTH;
  const margin = 72;
  const contentWidth = width - margin * 2;
  const isStory = config.format === "story";
  const isSquare = config.format === "square";
  const dark = config.template === "product" || config.template === "midnight";

  const palette = (() => {
    switch (config.template) {
      case "product":
        return {
          background: "#17202A",
          secondary: "#273440",
          foreground: COLORS.white,
          muted: "#D0D7DD",
          accent: COLORS.coral,
          accentText: COLORS.white,
          photoFrame: "#FFFDFC",
          pill: "#FF5A36",
          cta: "#FF5A36",
          ctaText: COLORS.white,
          footer: "#D0D7DD",
          label: "THE PRODUCT SPOTLIGHT",
          headline: ["THE ONE YOU'VE", "BEEN LOOKING FOR"],
          ctaLabel: "FIND YOUR NEXT FAVOURITE",
        };
      case "playful":
        return {
          background: "#F0E8FF",
          secondary: "#FFE0D6",
          foreground: "#28213A",
          muted: "#665A7B",
          accent: "#6743A5",
          accentText: COLORS.white,
          photoFrame: COLORS.white,
          pill: "#6743A5",
          cta: "#17202A",
          ctaText: COLORS.white,
          footer: "#665A7B",
          label: "GOOD-FIND CLUB ✦",
          headline: ["HEY, YOUR NEXT", "FAVOURITE IS HERE"],
          ctaLabel: "GO ON, TAKE A LOOK",
        };
      case "fresh":
        return {
          background: "#E7F6EC",
          secondary: "#CBEAD5",
          foreground: "#17382A",
          muted: "#537564",
          accent: "#176B4A",
          accentText: COLORS.white,
          photoFrame: COLORS.white,
          pill: "#176B4A",
          cta: COLORS.coral,
          ctaText: COLORS.white,
          footer: "#537564",
          label: "FRESH FROM YOUR NEIGHBOURHOOD",
          headline: ["LOCAL FINDS.", "FRESH FEELING."],
          ctaLabel: "DISCOVER SOMETHING NEARBY",
        };
      case "midnight":
        return {
          background: "#23233C",
          secondary: "#3A3659",
          foreground: "#FFF7ED",
          muted: "#D1CDE2",
          accent: "#D9F76A",
          accentText: "#23233C",
          photoFrame: "#FFFDFC",
          pill: "#D9F76A",
          cta: "#D9F76A",
          ctaText: "#23233C",
          footer: "#D1CDE2",
          label: "THE NEIGHBOURHOOD LINE-UP",
          headline: ["A LITTLE CLOSER.", "A LOT MORE YOU."],
          ctaLabel: "FIND IT NEARBY",
        };
      default:
        return {
          background: "#FFF7ED",
          secondary: "#FFE0D6",
          foreground: COLORS.ink,
          muted: COLORS.muted,
          accent: COLORS.coral,
          accentText: COLORS.white,
          photoFrame: COLORS.white,
          pill: COLORS.coral,
          cta: COLORS.deepCoral,
          ctaText: COLORS.white,
          footer: COLORS.muted,
          label: "LOCAL BUSINESS SPOTLIGHT",
          headline: ["GOOD THINGS ARE", "CLOSER THAN YOU THINK"],
          ctaLabel: "FIND IT NEARBY",
        };
    }
  })();

  context.clearRect(0, 0, width, height);
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, palette.background);
  gradient.addColorStop(1, palette.secondary);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  // Each template gets its own personality through patterns and shapes.
  if (config.template === "spotlight") {
    context.fillStyle = "#FFE0D6";
    context.beginPath();
    context.arc(width - 28, 80, 195, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#FFF0D9";
    context.beginPath();
    context.arc(30, height * 0.78, 130, 0, Math.PI * 2);
    context.fill();
    drawStar(context, width - 112, 300, 25, 11, COLORS.coral);
  } else if (config.template === "product") {
    context.fillStyle = "#273440";
    context.beginPath();
    context.arc(width - 15, height * 0.35, 245, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "rgba(255,90,54,0.16)";
    context.beginPath();
    context.arc(20, height * 0.8, 210, 0, Math.PI * 2);
    context.fill();
    drawStar(context, width - 105, height * 0.31, 31, 14, COLORS.coral);
  } else if (config.template === "playful") {
    context.fillStyle = "#FFE0D6";
    context.beginPath();
    context.arc(width - 35, 210, 150, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#DCCBFF";
    context.beginPath();
    context.arc(36, height * 0.73, 130, 0, Math.PI * 2);
    context.fill();
    drawStar(context, 930, 355, 32, 15, "#6743A5");
    drawStar(context, 145, height * 0.41, 21, 10, COLORS.coral);
  } else if (config.template === "fresh") {
    context.fillStyle = "#CBEAD5";
    context.beginPath();
    context.arc(width - 20, 100, 190, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#A5D8B8";
    context.lineWidth = 7;
    for (let i = 0; i < 5; i += 1) {
      context.beginPath();
      context.arc(75 + i * 25, height * 0.72, 35 + i * 7, Math.PI * 1.1, Math.PI * 1.8);
      context.stroke();
    }
    drawStar(context, 930, 320, 27, 12, COLORS.coral);
  } else {
    context.fillStyle = "#3A3659";
    for (let i = 0; i < 6; i += 1) {
      context.beginPath();
      context.arc(850 + (i % 3) * 65, 175 + Math.floor(i / 3) * 65, 4 + (i % 2) * 2, 0, Math.PI * 2);
      context.fill();
    }
    drawStar(context, 933, 350, 28, 12, COLORS.lime);
    context.strokeStyle = "rgba(217,247,106,0.45)";
    context.lineWidth = 3;
    context.beginPath();
    context.arc(35, height * 0.78, 125, -0.8, 0.8);
    context.stroke();
  }

  drawBrand(context, dark);

  const pillY = isStory ? 170 : 157;
  context.textAlign = "left";
  drawPill(context, palette.label, margin, pillY, palette.pill, config.template === "midnight" ? palette.accentText : COLORS.white, 17);

  const headlineY = isStory ? 365 : isSquare ? 270 : 300;
  context.save();
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.fillStyle = palette.foreground;
  const firstSize = config.template === "spotlight" ? 61 : 65;
  context.font = `800 ${firstSize}px Arial, sans-serif`;
  context.fillText(fitSingleLine(context, palette.headline[0], contentWidth), width / 2, headlineY);
  context.fillStyle = palette.accent;
  context.font = `900 71px Arial, sans-serif`;
  context.fillText(fitSingleLine(context, palette.headline[1], contentWidth), width / 2, headlineY + 73);

  const safeBusinessName = config.businessName.trim() || "Your Business Name";
  context.fillStyle = palette.foreground;
  context.font = "800 38px Arial, sans-serif";
  context.fillText(fitSingleLine(context, safeBusinessName, contentWidth), width / 2, headlineY + 137);

  context.fillStyle = palette.muted;
  context.font = "500 24px Arial, sans-serif";
  drawWrappedText(
    context,
    config.supportingText.trim() || "Find this business on ReMarket.",
    width / 2,
    headlineY + 179,
    contentWidth - 30,
    32,
    2,
  );
  context.restore();

  // The image holder uses a generous, responsive frame. "Fit" shows the entire photo;
  // "Fill" crops to the frame for a full-bleed look. Fit is the safer default.
  const photoTop = isStory ? Math.round(height * 0.445) : isSquare ? 490 : 626;
  const photoHeight = isStory ? Math.round(height * 0.275) : isSquare ? 265 : 380;
  const photoX = config.template === "product" ? 102 : config.template === "playful" ? 87 : margin;
  const photoWidth = width - photoX * 2;
  const photoRadius = config.template === "playful" ? 46 : config.template === "midnight" ? 18 : 30;
  drawPhoto(
    context,
    image,
    photoX,
    photoTop,
    photoWidth,
    photoHeight,
    photoRadius,
    config.imageFit,
    palette.photoFrame,
    dark,
  );

  if (config.template === "playful") {
    drawStar(context, photoX + 25, photoTop + 24, 22, 10, COLORS.coral);
    drawStar(context, photoX + photoWidth - 22, photoTop + photoHeight - 24, 21, 9, COLORS.purple);
  }
  if (config.template === "midnight") {
    context.save();
    context.fillStyle = COLORS.lime;
    roundedRect(context, photoX + 22, photoTop + 20, 120, 12, 6);
    context.fill();
    context.restore();
  }

  const ctaY = isStory ? height * 0.86 : isSquare ? height * 0.86 : height * 0.86;
  const ctaWidth = 600;
  const ctaHeight = 78;
  roundedRect(context, (width - ctaWidth) / 2, ctaY - ctaHeight / 2, ctaWidth, ctaHeight, 39);
  context.fillStyle = palette.cta;
  context.fill();
  context.save();
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = palette.ctaText;
  context.font = "900 24px Arial, sans-serif";
  context.fillText(fitSingleLine(context, palette.ctaLabel, ctaWidth - 50), width / 2, ctaY + 1);
  context.restore();

  // The optional footer is user-provided; no website/domain is fabricated.
  context.save();
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.fillStyle = palette.footer;
  context.font = "600 18px Arial, sans-serif";
  const footer = config.website.trim() || "Shop local. Find it nearby.";
  context.fillText(fitSingleLine(context, footer, contentWidth), width / 2, height - 47);
  context.font = "500 14px Arial, sans-serif";
  context.fillText("ReMarket  •  Find it nearby", width / 2, height - 22);
  context.restore();
}

export default function FlyerStudio({ onUseImage }: FlyerStudioProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<FlyerFormat>("portrait");
  const [template, setTemplate] = useState<FlyerTemplate>("spotlight");
  const [imageFit, setImageFit] = useState<ImageFit>("fit");
  const [businessName, setBusinessName] = useState("");
  const [supportingText, setSupportingText] = useState("Your local business is now easier to discover.");
  const [website, setWebsite] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoName, setPhotoName] = useState("");
  const [previewRendering, setPreviewRendering] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const selectedFormat = FORMAT_OPTIONS.find((item) => item.value === format) ?? FORMAT_OPTIONS[0];

  useEffect(() => {
    if (!open) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    let active = true;
    setPreviewRendering(true);
    canvas.width = FLYER_WIDTH;
    canvas.height = selectedFormat.height;

    const config = {
      format,
      template,
      businessName,
      supportingText,
      website,
      imageFit,
    };

    const render = (image: HTMLImageElement | null) => {
      if (!active) return;
      try {
        drawFlyer(canvas, config, selectedFormat.height, image);
      } catch (renderError) {
        console.error("Flyer preview rendering error:", renderError);
        setError(renderError instanceof Error ? renderError.message : "Unable to render flyer preview.");
      } finally {
        if (active) setPreviewRendering(false);
      }
    };

    if (photoDataUrl) {
      const image = new Image();
      image.onload = () => render(image);
      image.onerror = () => {
        render(null);
        if (active) setError("That photo could not be prepared. Try uploading a JPG, PNG or WebP image.");
      };
      image.src = photoDataUrl;
    } else {
      render(null);
    }

    return () => {
      active = false;
    };
  }, [open, format, template, businessName, supportingText, website, photoDataUrl, imageFit, selectedFormat.height]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !uploading) setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, uploading]);

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    setError("");
    setDownloaded(false);
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;

    if (!ALLOWED_SOURCE_TYPES.includes(file.type)) {
      setError("Choose a JPG, PNG or WebP image.");
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
      if (previewRendering) {
        reject(new Error("The flyer is still being prepared. Please try again in a moment."));
        return;
      }
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Unable to generate the flyer image."));
          return;
        }
        resolve(blob);
      }, "image/jpeg", 0.94);
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
      anchor.download = `remarket-${template}-${format}.jpg`;
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
      const file = new File([blob], `remarket-${template}-${format}.jpg`, { type: "image/jpeg" });
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
        const message = isRecord(data) && typeof data.error === "string"
          ? data.error
          : "Unable to upload the generated flyer.";
        throw new Error(message);
      }

      if (!isRecord(data) || typeof data.url !== "string" || !isHttpUrl(data.url.trim())) {
        throw new Error("The upload response did not include a valid image URL.");
      }

      const publicId = typeof data.publicId === "string" ? data.publicId : null;
      await onUseImage({ url: data.url.trim(), publicId });
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
          setDownloaded(false);
        }}
        className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#FFB49F] bg-[#FFF0D9] px-4 py-2.5 text-sm font-bold text-[#9F2D18] transition hover:bg-[#FFE0D6]"
      >
        <Palette size={17} />
        Create a ReMarket flyer
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-[#17202A]/60 p-0 sm:items-center sm:p-3"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !uploading) setOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="remarket-flyer-studio-title"
            className="flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden rounded-none bg-[#FFFDFC] shadow-2xl sm:h-auto sm:max-h-[94dvh] sm:max-w-7xl sm:rounded-3xl"
          >
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-[#EAE6DF] bg-[#FFFDFC]/95 px-4 py-3 backdrop-blur sm:px-6 sm:py-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFE0D6] text-[#9F2D18]">
                  <Sparkles size={20} />
                </div>
                <div className="min-w-0">
                  <h2 id="remarket-flyer-studio-title" className="truncate font-black text-[#17202A]">
                    ReMarket Flyer Studio
                  </h2>
                  <p className="text-xs text-[#8A8178]">Five templates · ready to share</p>
                </div>
              </div>
              <button
                type="button"
                disabled={uploading}
                onClick={() => setOpen(false)}
                aria-label="Close flyer studio"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[#6F675F] hover:bg-[#FCFAF6] disabled:opacity-50"
              >
                <X size={19} />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              <div className="grid min-w-0 grid-cols-1 gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(290px,0.85fr)_minmax(0,1.15fr)] lg:gap-6 lg:p-6">
                <div className="min-w-0 space-y-5">
                  <section>
                    <div className="mb-2 flex items-center gap-2">
                      <WandSparkles size={16} className="text-[#FF5A36]" />
                      <h3 className="text-sm font-black text-[#17202A]">Choose your vibe</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
                      {TEMPLATE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setTemplate(option.value);
                            setError("");
                            setDownloaded(false);
                          }}
                          aria-pressed={template === option.value}
                          className={`min-w-0 rounded-2xl border p-3 text-left transition ${
                            template === option.value
                              ? "border-[#FF5A36] bg-[#FFF7ED] ring-2 ring-[#FF5A36]/15"
                              : "border-[#EAE6DF] bg-white hover:border-[#F1B7A7]"
                          }`}
                        >
                          <span className={`flex h-12 items-center justify-between rounded-xl px-3 ${option.previewClass}`}>
                            <span className="text-base font-black">Aa</span>
                            <span className="h-5 w-5 rounded-full border-2 border-current opacity-75" />
                          </span>
                          <span className="mt-2 block text-xs font-extrabold text-[#17202A]">{option.label}</span>
                          <span className="mt-1 block text-[10px] leading-4 text-[#8A8178]">{option.subtitle}</span>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <div>
                      <label htmlFor="flyer-format" className="mb-1.5 block text-xs font-bold text-[#6F675F]">Format</label>
                      <select
                        id="flyer-format"
                        value={format}
                        onChange={(event) => {
                          setFormat(event.target.value as FlyerFormat);
                          setError("");
                        }}
                        className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-white px-3 text-sm outline-none focus:border-[#FF5A36]"
                      >
                        {FORMAT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label} — {option.description}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="flyer-image-fit" className="mb-1.5 block text-xs font-bold text-[#6F675F]">Photo display</label>
                      <select
                        id="flyer-image-fit"
                        value={imageFit}
                        onChange={(event) => {
                          setImageFit(event.target.value as ImageFit);
                          setError("");
                        }}
                        className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-white px-3 text-sm outline-none focus:border-[#FF5A36]"
                      >
                        <option value="fit">Fit whole photo (no crop)</option>
                        <option value="fill">Fill frame (crop edges)</option>
                      </select>
                    </div>
                  </section>

                  <section className="space-y-3 rounded-2xl border border-[#EAE6DF] bg-white p-4">
                    <div>
                      <label htmlFor="flyer-business-name" className="mb-1.5 block text-xs font-bold text-[#6F675F]">Business or product name</label>
                      <input
                        id="flyer-business-name"
                        value={businessName}
                        onChange={(event) => {
                          setBusinessName(event.target.value.slice(0, 100));
                          setDownloaded(false);
                        }}
                        maxLength={100}
                        placeholder="e.g. Mandy Treasures"
                        className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3 text-sm outline-none focus:border-[#FF5A36]"
                      />
                    </div>

                    <div>
                      <label htmlFor="flyer-supporting-text" className="mb-1.5 block text-xs font-bold text-[#6F675F]">Supporting message</label>
                      <textarea
                        id="flyer-supporting-text"
                        value={supportingText}
                        onChange={(event) => {
                          setSupportingText(event.target.value.slice(0, 140));
                          setDownloaded(false);
                        }}
                        maxLength={140}
                        rows={3}
                        placeholder="Tell people what they can discover."
                        className="w-full resize-y rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3 py-2.5 text-sm outline-none focus:border-[#FF5A36]"
                      />
                      <p className="mt-1 text-right text-[11px] text-[#A39A91]">{supportingText.length}/140</p>
                    </div>

                    <div>
                      <label htmlFor="flyer-website" className="mb-1.5 block text-xs font-bold text-[#6F675F]">Website or call-to-action URL (optional)</label>
                      <input
                        id="flyer-website"
                        value={website}
                        onChange={(event) => {
                          setWebsite(event.target.value.slice(0, 100));
                          setDownloaded(false);
                        }}
                        maxLength={100}
                        placeholder="Enter your verified ReMarket URL"
                        className="h-11 w-full rounded-xl border border-[#EAE6DF] bg-[#FCFAF6] px-3 text-sm outline-none focus:border-[#FF5A36]"
                      />
                    </div>
                  </section>

                  <section className="rounded-2xl border border-dashed border-[#E6B6A8] bg-[#FFF7ED] p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#9F2D18]">
                        <ImagePlus size={19} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-[#17202A]">Business or product photo</p>
                        <p className="mt-1 text-xs leading-5 text-[#8A8178]">JPG, PNG or WebP, up to 5 MB. Fit keeps the whole image visible.</p>
                        {photoName && <p className="mt-2 truncate text-xs font-semibold text-[#287A4B]">{photoName}</p>}
                        <div className="mt-3 flex flex-wrap gap-2">
                          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-3 py-2 text-xs font-bold text-[#6F675F] hover:bg-[#FCFAF6]">
                            <UploadCloud size={14} />
                            {photoDataUrl ? "Change photo" : "Choose photo"}
                            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoChange} className="sr-only" />
                          </label>
                          {photoDataUrl && (
                            <button
                              type="button"
                              onClick={() => {
                                setPhotoDataUrl(null);
                                setPhotoName("");
                                setError("");
                                setDownloaded(false);
                              }}
                              className="rounded-xl px-3 py-2 text-xs font-bold text-[#9F2D18] hover:bg-[#FFE0D6]"
                            >Remove photo</button>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>

                  {error && (
                    <div role="alert" className="rounded-xl border border-[#F2C7BC] bg-[#FFF0ED] px-3 py-2.5 text-sm font-medium text-[#9F2D18]">{error}</div>
                  )}
                  {downloaded && (
                    <div role="status" className="flex items-center gap-2 rounded-xl border border-[#CBE7D7] bg-[#F1FBF5] px-3 py-2.5 text-sm font-semibold text-[#287A4B]">
                      <CheckCircle2 size={16} /> Flyer download started.
                    </div>
                  )}
                  <p className="text-[11px] leading-5 text-[#8A8178]">Download a JPG or use it in the existing content form. This studio uploads the image; it does not publish to social media automatically.</p>
                </div>

                <div className="min-w-0 lg:sticky lg:top-0 lg:self-start">
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-[#17202A]">Live preview</p>
                      <p className="mt-0.5 text-xs text-[#8A8178]">Your photo is rendered at its real aspect ratio.</p>
                    </div>
                    <span className="rounded-full bg-[#FCFAF6] px-2.5 py-1 text-[10px] font-bold text-[#6F675F]">JPG · {FLYER_WIDTH} × {selectedFormat.height}</span>
                  </div>

                  <div className="flex min-h-[280px] justify-center overflow-hidden rounded-2xl border border-[#EAE6DF] bg-[radial-gradient(circle_at_top,#FFFFFF_0%,#F1E8DF_100%)] p-3 sm:p-4">
                    <canvas
                      ref={canvasRef}
                      aria-label="Live preview of the selected ReMarket flyer"
                      className="h-auto w-full max-w-[430px] rounded-lg shadow-xl"
                      style={{ aspectRatio: `${FLYER_WIDTH} / ${selectedFormat.height}`, maxHeight: "58dvh", objectFit: "contain" }}
                    />
                  </div>
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#EAE6DF] bg-white p-3">
                    <Scan size={16} className="mt-0.5 shrink-0 text-[#FF5A36]" />
                    <p className="text-xs leading-5 text-[#6F675F]">
                      <span className="font-bold">Photo tip:</span> Choose <span className="font-bold">Fit whole photo</span> for logos, full outfits and product shots you don't want cropped. Use <span className="font-bold">Fill frame</span> for a dramatic full-bleed look.
                    </p>
                  </div>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => void downloadFlyer()}
                      disabled={uploading || previewRendering}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#EAE6DF] bg-white px-4 py-3 text-sm font-bold text-[#6F675F] transition hover:bg-[#FCFAF6] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {previewRendering ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
                      {previewRendering ? "Preparing preview…" : "Download JPG"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void useFlyerInContent()}
                      disabled={uploading || previewRendering}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#FF5A36] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#E94B29] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {uploading ? <Loader2 size={17} className="animate-spin" /> : <Layers3 size={17} />}
                      {uploading ? "Uploading flyer…" : previewRendering ? "Preparing preview…" : "Use in content"}
                    </button>
                  </div>
                  <p className="mt-3 text-center text-[11px] leading-5 text-[#8A8178]">Tip: switch templates before downloading to compare different looks for the same business.</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
