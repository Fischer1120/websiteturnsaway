export function isSlug(value: string) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export function isPublicId(value: string) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value);
}

export function sanitizeFilename(value: string) {
  return value.replaceAll(/[^a-zA-Z0-9._-]/g, "-");
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
