import { isSlug, sanitizeFilename } from "./validators";

export const R2_CAS_RETRIES = 5;
export const R2_TRANSIENT_RETRIES = 4;
const R2_RETRY_BASE_MS = 100;
const R2_RETRY_MAX_MS = 1_000;

function isRetryableR2Error(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: unknown; code?: unknown; message?: unknown };
  return candidate.status === 429 || candidate.code === 429 || String(candidate.message || "").includes("429");
}

function retryDelay(attempt: number) {
  const exponential = Math.min(R2_RETRY_MAX_MS, R2_RETRY_BASE_MS * 2 ** attempt);
  return Math.round(exponential * (0.75 + Math.random() * 0.5));
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function withR2TransientRetry<T>(operation: () => Promise<T>, retries = R2_TRANSIENT_RETRIES) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableR2Error(error) || attempt >= retries - 1) throw error;
      await sleep(retryDelay(attempt));
    }
  }
}

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

export function imageDisplayKey(folder: string, photoId: string) {
  assertPublicPath(folder, "folder");
  return `images/${folder}/${photoId}/display.webp`;
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
  // A configurable origin could bypass the visibility checks in functions/media.
  // Keep mutable CMS media behind the authenticated/visibility-aware route.
  void env;
  return `/media/${key.replace(/^\/+/, "")}`;
}

export type R2JsonObject<T> = {
  value: T;
  etag: string;
};

export async function readJsonObject<T>(bucket: R2Bucket | undefined, key: string) {
  if (!bucket) return undefined;
  const object = await bucket.get(key);
  if (!object) return undefined;
  return { value: await object.json<T>(), etag: object.etag } satisfies R2JsonObject<T>;
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

export async function putJsonIfAbsent(bucket: R2Bucket, key: string, value: unknown) {
  return withR2TransientRetry(() => bucket.put(key, JSON.stringify(value, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    onlyIf: new Headers({ "If-None-Match": "*" }),
  }));
}

export async function putJsonIfMatch(bucket: R2Bucket, key: string, etag: string, value: unknown) {
  return withR2TransientRetry(() => bucket.put(key, JSON.stringify(value, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    onlyIf: { etagMatches: etag },
  }));
}

export async function updateJsonCas<T>(
  bucket: R2Bucket,
  key: string,
  update: (current: T | undefined) => T,
  retries = R2_CAS_RETRIES,
) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const current = await readJsonObject<T>(bucket, key);
    const next = update(current?.value);
    const result = current
      ? await putJsonIfMatch(bucket, key, current.etag, next)
      : await putJsonIfAbsent(bucket, key, next);
    if (result) return next;
  }
  return null;
}

export async function putJsonCas(
  bucket: R2Bucket,
  key: string,
  value: unknown,
  retries = R2_CAS_RETRIES,
) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const current = await readJsonObject<unknown>(bucket, key);
    const result = await withR2TransientRetry(() => bucket.put(key, JSON.stringify(value, null, 2), {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      onlyIf: current
        ? { etagMatches: current.etag }
        : new Headers({ "If-None-Match": "*" }),
    }));
    if (result) return result;
  }
  return null;
}

export async function listAllObjects(bucket: R2Bucket, prefix: string) {
  const objects: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix, ...(cursor ? { cursor } : {}) });
    objects.push(...listed.objects);
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return objects;
}

export async function deletePrefix(bucket: R2Bucket, prefix: string) {
  const keys = (await listAllObjects(bucket, prefix)).map((object) => object.key);
  for (let offset = 0; offset < keys.length; offset += 1_000) {
    const batch = keys.slice(offset, offset + 1_000);
    await withR2TransientRetry(() => bucket.delete(batch));
  }
}

export function assertPublicPath(value: string, name: string) {
  if (!isSlug(value)) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
}
