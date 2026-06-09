import { isSlug, sanitizeFilename } from "./validators";

export function articleKey(folder: string, slug: string) {
  assertPublicPath(folder, "folder");
  assertPublicPath(slug, "slug");
  return `articles/${folder}/${slug}/index.md`;
}

export function articleAssetKey(folder: string, slug: string, filename: string) {
  assertPublicPath(folder, "folder");
  assertPublicPath(slug, "slug");
  return `articles/${folder}/${slug}/assets/${sanitizeFilename(filename)}`;
}

export function imageOriginalKey(folder: string, photoId: string, ext: string) {
  assertPublicPath(folder, "folder");
  return `images/${folder}/${photoId}/original.${ext}`;
}

export function imageThumbKey(folder: string, photoId: string, ext: string) {
  assertPublicPath(folder, "folder");
  return `images/${folder}/${photoId}/thumb.${ext}`;
}

export function imageMetadataKey(folder: string, photoId: string) {
  assertPublicPath(folder, "folder");
  return `images/${folder}/${photoId}/metadata.json`;
}

export async function readJson<T>(bucket: R2Bucket | undefined, key: string) {
  if (!bucket) return undefined;
  const object = await bucket.get(key);
  if (!object) return undefined;
  return object.json<T>();
}

export function assertPublicPath(value: string, name: string) {
  if (!isSlug(value)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
}
