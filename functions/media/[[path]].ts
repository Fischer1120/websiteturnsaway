import { getArticle, getPhoto, readSafePublicVariant } from "../_shared/content";
import { fail, type FunctionContext } from "../_shared/responses";
import { isSafeAssetFilename, isPublicId, isSlug } from "../_shared/validators";

function mediaKey(value: string | string[] | undefined) {
  const parts = Array.isArray(value) ? value : value ? [value] : [];
  const key = parts.join("/");
  if (!key || key.startsWith("/") || key.includes("..") || key.includes("\\")) return "";
  return key;
}

async function isPublicArticleMediaKey(context: FunctionContext, key: string) {
  const articleMatch = key.match(/^articles\/([^/]+)\/([^/]+)\/assets\/([a-zA-Z0-9._-]+)$/);
  if (articleMatch) {
    const [, folder, slug, filename] = articleMatch;
    if (!isSlug(folder) || !isSlug(slug)) return false;
    if (!isSafeAssetFilename(filename)) return false;
    const article = await getArticle(context.env, folder, slug);
    return Boolean(article);
  }

  return false;
}

export const onRequestGet = async (context: FunctionContext) => {
  if (!context.env.MEDIA_BUCKET) {
    return fail(context.request, context.env, "storage_error", "MEDIA_BUCKET binding is not configured.", 503);
  }

  const key = mediaKey(context.params.path as string | string[] | undefined);
  if (!key) {
    return fail(context.request, context.env, "not_found", "Media object not found.", 404);
  }

  const imageMatch = key.match(/^images\/([^/]+)\/([^/]+)\/(display|thumb)\.webp$/i);
  if (imageMatch) {
    const [, folder, photoId, variant] = imageMatch;
    if (!isSlug(folder) || !isPublicId(photoId)) return fail(context.request, context.env, "not_found", "Media object not found.", 404);
    const photo = await getPhoto(context.env, folder, photoId);
    if (!photo || photo.visibility !== "public") return fail(context.request, context.env, "not_found", "Media object not found.", 404);
    const safe = await readSafePublicVariant(context.env, photo, variant as "display" | "thumb");
    if (!safe) return fail(context.request, context.env, "not_found", "Media object not found.", 404);
    const headers = new Headers({
      "Content-Type": "image/webp",
      "Content-Length": String(safe.bytes.byteLength),
      "Cache-Control": "no-store",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
      ETag: safe.etag,
    });
    if (context.request.headers.get("If-None-Match") === safe.etag) return new Response(null, { status: 304, headers });
    return new Response(context.request.method === "HEAD" ? null : safe.bytes, { headers });
  }

  if (!(await isPublicArticleMediaKey(context, key))) {
    return fail(context.request, context.env, "not_found", "Media object not found.", 404);
  }

  const object = await context.env.MEDIA_BUCKET.get(key);
  if (!object) return fail(context.request, context.env, "not_found", "Media object not found.", 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("ETag", object.httpEtag);
  if (context.request.headers.get("If-None-Match") === object.httpEtag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(context.request.method === "HEAD" ? null : object.body, { headers });
};

export const onRequestHead = onRequestGet;
