import { ApiError } from "./responses";

export type WebPInspection = {
  width: number;
  height: number;
  chunks: string[];
  hasAlpha: boolean;
};

function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function uint24(bytes: Uint8Array, start: number) {
  return bytes[start] | (bytes[start + 1] << 8) | (bytes[start + 2] << 16);
}

function dimensionsFromVp8(bytes: Uint8Array, start: number, length: number) {
  if (length < 10 || bytes[start + 3] !== 0x9d || bytes[start + 4] !== 0x01 || bytes[start + 5] !== 0x2a) {
    throw new Error("Invalid VP8 frame.");
  }
  return {
    width: (bytes[start + 6] | (bytes[start + 7] << 8)) & 0x3fff,
    height: (bytes[start + 8] | (bytes[start + 9] << 8)) & 0x3fff,
  };
}

function dimensionsFromVp8l(bytes: Uint8Array, start: number, length: number) {
  if (length < 5 || bytes[start] !== 0x2f) throw new Error("Invalid VP8L frame.");
  const bits = (bytes[start + 1] | (bytes[start + 2] << 8) | (bytes[start + 3] << 16) | (bytes[start + 4] << 24)) >>> 0;
  return {
    width: (bits & 0x3fff) + 1,
    height: ((bits >>> 14) & 0x3fff) + 1,
  };
}

export function inspectWebP(input: ArrayBuffer | Uint8Array, maxEdge = Number.POSITIVE_INFINITY): WebPInspection {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < 20 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") {
    throw new Error("Invalid WebP RIFF header.");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(4, true) !== bytes.byteLength - 8) throw new Error("Invalid WebP RIFF length.");

  const chunks: string[] = [];
  const allowed = new Set(["VP8X", "VP8 ", "VP8L", "ALPH", "ICCP"]);
  let offset = 12;
  let vp8Dimensions: { width: number; height: number } | undefined;
  let vp8xDimensions: { width: number; height: number } | undefined;
  let hasAlpha = false;
  let imageChunks = 0;

  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) throw new Error("Truncated WebP chunk header.");
    const type = ascii(bytes, offset, 4);
    const length = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const paddedEnd = dataEnd + (length % 2);
    if (dataEnd < dataStart || paddedEnd > bytes.byteLength) throw new Error("Truncated WebP chunk.");
    if (["EXIF", "XMP ", "ANIM", "ANMF"].includes(type)) throw new Error("Metadata or animation chunk is not allowed.");
    if (!allowed.has(type)) throw new Error("Unsupported WebP chunk.");
    chunks.push(type);

    if (type === "VP8X") {
      if (length !== 10 || vp8xDimensions) throw new Error("Invalid VP8X chunk.");
      const flags = bytes[dataStart];
      if (flags & 0xcf) throw new Error("WebP metadata, animation, fragment, or reserved flags are not allowed.");
      vp8xDimensions = { width: uint24(bytes, dataStart + 4) + 1, height: uint24(bytes, dataStart + 7) + 1 };
      hasAlpha = Boolean(flags & 0x10);
    } else if (type === "VP8 ") {
      if (vp8Dimensions || imageChunks > 0) throw new Error("WebP contains multiple image frames.");
      vp8Dimensions = dimensionsFromVp8(bytes, dataStart, length);
      imageChunks += 1;
    } else if (type === "VP8L") {
      if (vp8Dimensions || imageChunks > 0) throw new Error("WebP contains multiple image frames.");
      vp8Dimensions = dimensionsFromVp8l(bytes, dataStart, length);
      imageChunks += 1;
    } else if (type === "ALPH") {
      hasAlpha = true;
    }

    offset = paddedEnd;
  }

  const dimensions = vp8xDimensions || vp8Dimensions;
  if (!dimensions || imageChunks !== 1 || dimensions.width < 1 || dimensions.height < 1) {
    throw new Error("WebP does not contain one valid image frame.");
  }
  if (vp8Dimensions && vp8xDimensions && (vp8Dimensions.width > vp8xDimensions.width || vp8Dimensions.height > vp8xDimensions.height)) {
    throw new Error("WebP frame dimensions exceed the canvas.");
  }
  if (dimensions.width > maxEdge || dimensions.height > maxEdge) throw new Error("WebP dimensions exceed the allowed limit.");
  return { ...dimensions, chunks, hasAlpha };
}

export function isSafePublicWebP(input: ArrayBuffer | Uint8Array, maxBytes: number, maxEdge: number) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength > maxBytes) return false;
  try {
    inspectWebP(bytes, maxEdge);
    return true;
  } catch {
    return false;
  }
}

export function validatePublicWebP(input: ArrayBuffer | Uint8Array, field: string, maxBytes: number, maxEdge: number) {
  if (!isSafePublicWebP(input, maxBytes, maxEdge)) {
    throw new ApiError("unsupported_media_type", `${field} must be a metadata-free, non-animated WebP within the allowed dimensions.`, 415, { field });
  }
}

export function hasImageMagic(type: string, input: ArrayBuffer | Uint8Array) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/png") {
    return bytes.length >= 8 && bytes.slice(0, 8).every((value, index) => value === [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a][index]);
  }
  if (type === "image/webp") {
    return bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP";
  }
  return false;
}
