import { isSlug, sanitizeFilename } from "./validators";

export function articleKey(folder: string, slug: string) {
  assertPublicPath(folder, "folder");
  assertPublicPath(slug, "slug");
  return `articles/${folder}/${slug}/index.md`;
}

export function articleJsonKey(folder: string, slug: string) {
  assertPublicPath(folder, "folder");
  assertPublicPath(slug, "slug");
  return `articles/${folder}/${slug}/index.json`;
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

export function mediaUrl(env: { PUBLIC_MEDIA_BASE_URL?: string }, key: string) {
  const base = (env.PUBLIC_MEDIA_BASE_URL || "").replace(/\/+$/, "");
  return base ? `${base}/${key.replace(/^\/+/, "")}` : `/media/${key.replace(/^\/+/, "")}`;
}

export async function readJson<T>(bucket: R2Bucket | undefined, key: string) {
  if (!bucket) return undefined;
  const object = await bucket.get(key);
  if (!object) return undefined;
  return object.json<T>();
}

export async function putJson(bucket: R2Bucket, key: string, value: unknown) {
  await bucket.put(key, JSON.stringify(value, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
}

export async function deletePrefix(bucket: R2Bucket, prefix: string) {
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix, cursor });
    const keys = listed.objects.map((object) => object.key);
    if (keys.length > 0) {
      await bucket.delete(keys);
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

export function assertPublicPath(value: string, name: string) {
  if (!isSlug(value)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
}
