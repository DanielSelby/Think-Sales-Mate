export type WatermarkPosition =
  | "center"
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";
export type WatermarkDisplayStyle = "normal" | "3d";

export type PlatformWatermarkConfiguration = {
  imageUrl: string | null;
  storagePath: string | null;
  enabled: boolean;
  opacity: number;
  position: WatermarkPosition;
  displayStyle: WatermarkDisplayStyle;
  desktopSize: number;
  mobileSize: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

const WATERMARK_POSITIONS: WatermarkPosition[] = [
  "center",
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

export function parsePlatformWatermark(
  value: unknown,
  updatedAt: string | null = null,
  updatedBy: string | null = null,
): PlatformWatermarkConfiguration {
  const settings = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const storagePath = typeof settings.storage_path === "string" &&
    /^watermarks\/[A-Za-z0-9._-]+\.(png|svg|webp)$/i.test(settings.storage_path)
    ? settings.storage_path
    : null;
  const imageUrl = storagePath && typeof settings.image_url === "string" ? settings.image_url : null;
  const position = typeof settings.position === "string" &&
    WATERMARK_POSITIONS.includes(settings.position as WatermarkPosition)
    ? settings.position as WatermarkPosition
    : "center";
  const displayStyle: WatermarkDisplayStyle = settings.display_style === "3d" ? "3d" : "normal";
  const opacity = typeof settings.opacity === "number" && Number.isFinite(settings.opacity)
    ? Math.min(0.5, Math.max(0.01, settings.opacity))
    : 0.04;
  const desktopSize = typeof settings.desktop_size === "number" && Number.isFinite(settings.desktop_size)
    ? Math.min(800, Math.max(100, Math.round(settings.desktop_size)))
    : 320;
  const mobileSize = typeof settings.mobile_size === "number" && Number.isFinite(settings.mobile_size)
    ? Math.min(400, Math.max(60, Math.round(settings.mobile_size)))
    : 200;

  return {
    imageUrl,
    storagePath,
    enabled: settings.enabled === true && Boolean(imageUrl),
    opacity,
    position,
    displayStyle,
    desktopSize,
    mobileSize,
    updatedAt,
    updatedBy,
  };
}
