export function isSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function isPublicId(value: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value) && value !== "." && value !== "..";
}

export function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:?\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function sanitizeFilename(value: string) {
  return value.replaceAll(/[^a-zA-Z0-9._-]/g, "-");
}

export function isSafeAssetFilename(value: string) {
  return !new Set(["index.md", "index.json", "metadata.json", "tombstones.json"]).has(value.toLowerCase());
}

export function isSafeImageType(type: string) {
  return ["image/jpeg", "image/png", "image/webp"].includes(type);
}

export function extensionForContentType(type: string) {
  switch (type) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    default:
      return "bin";
  }
}
