import { describe, expect, it } from "vitest";
import { parsePlatformWatermark } from "./platform-watermark";
import { validateAndSanitizeWatermarkImage } from "./platform-watermark-upload";

describe("platform watermark configuration", () => {
  it("uses safe defaults and bounds persisted display values", () => {
    const config = parsePlatformWatermark({
      enabled: true,
      image_url: "https://assets.example/watermark.png",
      storage_path: "watermarks/current.png",
      opacity: 0.9,
      desktop_size: 1200,
      mobile_size: 20,
      position: "unsupported",
    });

    expect(config).toMatchObject({
      enabled: true,
      opacity: 0.5,
      desktopSize: 800,
      mobileSize: 60,
      position: "center",
    });
    expect(parsePlatformWatermark({ image_url: "https://example.com/image.png" }).enabled).toBe(false);
  });

  it.each(["top-center", "bottom-center"] as const)("accepts the %s position", (position) => {
    expect(parsePlatformWatermark({ position }).position).toBe(position);
  });

  it("uses normal watermark display by default and supports 3D", () => {
    expect(parsePlatformWatermark({}).displayStyle).toBe("normal");
    expect(parsePlatformWatermark({ display_style: "3d" }).displayStyle).toBe("3d");
    expect(parsePlatformWatermark({ display_style: "unknown" }).displayStyle).toBe("normal");
  });
});

describe("platform watermark image validation", () => {
  it("accepts a PNG only when the file signature, extension, and MIME type agree", () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN5sAAAAASUVORK5CYII=", "base64");
    expect(validateAndSanitizeWatermarkImage("brand.png", "image/png", png).extension).toBe("png");
    expect(() => validateAndSanitizeWatermarkImage("brand.png", "image/png", Buffer.from("not a png"))).toThrow();
    expect(() => validateAndSanitizeWatermarkImage("brand.svg", "image/png", png)).toThrow();
  });

  it("checks the RIFF and WebP image chunk before accepting WebP uploads", () => {
    const webp = Buffer.alloc(25);
    webp.write("RIFF", 0, "ascii");
    webp.writeUInt32LE(webp.length - 8, 4);
    webp.write("WEBP", 8, "ascii");
    webp.write("VP8L", 12, "ascii");
    webp.writeUInt32LE(5, 16);
    expect(validateAndSanitizeWatermarkImage("brand.webp", "image/webp", webp).extension).toBe("webp");
    expect(() => validateAndSanitizeWatermarkImage("brand.webp", "image/webp", Buffer.from("RIFFWEBP"))).toThrow();
  });

  it("removes script and event-handler content from SVG uploads", () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script><path d="M0 0" onload="alert(1)" fill="red"/></svg>',
    );
    const result = validateAndSanitizeWatermarkImage("brand.svg", "image/svg+xml", svg);
    const sanitized = result.bytes.toString("utf8");

    expect(sanitized).toContain("<svg");
    expect(sanitized).toContain("<path");
    expect(sanitized).not.toMatch(/script|alert|onload/i);
  });

  it("rejects SVG references to remote resources", () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><path fill="url(https://example.com/image.svg#paint)" d="M0 0"/></svg>',
    );
    expect(() => validateAndSanitizeWatermarkImage("brand.svg", "image/svg+xml", svg)).toThrow(/stay within/i);
  });
});
