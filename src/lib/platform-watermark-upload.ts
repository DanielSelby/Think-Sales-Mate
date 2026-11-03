import sanitizeHtml from "sanitize-html";

const MAX_WATERMARK_SIZE_BYTES = 2 * 1024 * 1024;
const SVG_ALLOWED_TAGS = [
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "defs", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "title", "desc",
];
const SVG_ALLOWED_ATTRIBUTES = [
  "xmlns", "viewBox", "width", "height", "x", "y", "x1", "x2", "y1", "y2", "cx", "cy",
  "r", "rx", "ry", "d", "points", "fill", "fill-opacity", "fill-rule", "stroke",
  "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin", "opacity",
  "transform", "preserveAspectRatio", "offset", "stop-color", "stop-opacity",
  "gradientUnits", "gradientTransform", "spreadMethod", "clip-path", "clipPathUnits",
  "mask", "maskUnits",
];

export type ValidatedWatermarkImage = {
  extension: "png" | "svg" | "webp";
  contentType: "image/png" | "image/svg+xml" | "image/webp";
  bytes: Buffer;
};

function isPng(bytes: Buffer) {
  if (bytes.length < 45 ||
      !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      bytes.readUInt32BE(8) !== 13 ||
      bytes.toString("ascii", 12, 16) !== "IHDR" ||
      bytes.toString("ascii", bytes.length - 8, bytes.length - 4) !== "IEND" ||
      bytes.readUInt32BE(bytes.length - 12) !== 0) {
    return false;
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  return width > 0 && width <= 10000 && height > 0 && height <= 10000;
}

function isWebp(bytes: Buffer) {
  if (bytes.length < 21 ||
      bytes.toString("ascii", 0, 4) !== "RIFF" ||
      bytes.readUInt32LE(4) !== bytes.length - 8 ||
      bytes.toString("ascii", 8, 12) !== "WEBP") {
    return false;
  }
  const chunkType = bytes.toString("ascii", 12, 16);
  const chunkLength = bytes.readUInt32LE(16);
  const minimumChunkLength = chunkType === "VP8L" ? 5 : 10;
  return ["VP8 ", "VP8L", "VP8X"].includes(chunkType) &&
    chunkLength >= minimumChunkLength &&
    chunkLength <= bytes.length - 20;
}

function sanitizeSvg(bytes: Buffer) {
  const source = bytes.toString("utf8");
  if (!Buffer.from(source, "utf8").equals(bytes)) {
    throw new Error("SVG files must use valid UTF-8 encoding.");
  }
  if (source.includes("\u0000") || /<!DOCTYPE|<!ENTITY/i.test(source)) {
    throw new Error("SVG files must not contain doctypes or entities.");
  }
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/i.test(source) ||
      !/<svg\b[^>]*\bxmlns=["']http:\/\/www\.w3\.org\/2000\/svg["']/i.test(source)) {
    throw new Error("Upload a valid SVG document with the standard SVG namespace.");
  }

  const sanitized = sanitizeHtml(source, {
    allowedTags: SVG_ALLOWED_TAGS,
    allowedAttributes: { "*": SVG_ALLOWED_ATTRIBUTES },
    allowedSchemes: [],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    nonTextTags: ["script", "style", "textarea", "option", "foreignobject", "iframe", "object", "embed"],
    parser: { lowerCaseTags: false, lowerCaseAttributeNames: false },
  });
  if (!/<svg\b[^>]*\bxmlns=["']http:\/\/www\.w3\.org\/2000\/svg["']/i.test(sanitized) ||
      /<(?:script|foreignobject|iframe|object|embed)\b|\bon[a-z]+\s*=/i.test(sanitized)) {
    throw new Error("The SVG could not be safely sanitized.");
  }
  const externalReference = /url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/i;
  const paintAttributes = sanitized.matchAll(/\b(?:fill|stroke|clip-path|mask)\s*=\s*["']([^"']*)["']/gi);
  for (const [, value] of paintAttributes) {
    if (externalReference.test(value)) throw new Error("SVG references must stay within the uploaded image.");
  }
  return Buffer.from(sanitized, "utf8");
}

export function validateAndSanitizeWatermarkImage(
  fileName: string,
  contentType: string,
  bytes: Buffer,
): ValidatedWatermarkImage {
  if (bytes.length === 0 || bytes.length > MAX_WATERMARK_SIZE_BYTES) {
    throw new Error("Watermark images must be between 1 byte and 2 MB.");
  }

  const extension = fileName.toLowerCase().split(".").pop();
  if (extension === "png" && contentType === "image/png" && isPng(bytes)) {
    return { extension: "png", contentType: "image/png", bytes };
  }
  if (extension === "webp" && contentType === "image/webp" && isWebp(bytes)) {
    return { extension: "webp", contentType: "image/webp", bytes };
  }
  if (extension === "svg" && contentType === "image/svg+xml") {
    return { extension: "svg", contentType: "image/svg+xml", bytes: sanitizeSvg(bytes) };
  }
  throw new Error("Choose a valid PNG, SVG, or WebP image with a matching file type.");
}
