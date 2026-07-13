import { getArticle, getPhoto } from "../_shared/content";
import { fail, type FunctionContext } from "../_shared/responses";
import { isSafeAssetFilename, isPublicId, isSlug } from "../_shared/validators";

function mediaKey(value: string | string[] | undefined) {
  const parts = Array.isArray(value) ? value : value ? [value] : [];
  const key = parts.join("/");
  if (!key || key.startsWith("/") || key.includes("..") || key.includes("\\")) return "";
  return key;
}

const PUBLIC_IMAGE_EXTENSIONS = /^(?:jpg|jpeg|png|webp)$/i;

async function isPublicMediaKey(context: FunctionContext, key: string) {
  const articleMatch = key.match(/^articles\/([^/]+)\/([^/]+)\/assets\/([a-zA-Z0-9._-]+)$/);
  if (articleMatch) {
    const [, folder, slug, filename] = articleMatch;
    if (!isSlug(folder) || !isSlug(slug)) return false;
    if (!isSafeAssetFilename(filename)) return false;
    const article = await getArticle(context.env, folder, slug);
    return Boolean(article);
  }

  const imageMatch = key.match(/^images\/([^/]+)\/([^/]+)\/(original|thumb)\.([a-zA-Z0-9]+)$/i);
  if (imageMatch) {
    const [, folder, photoId, variant, ext] = imageMatch;
    if (!isSlug(folder) || !isPublicId(photoId)) return false;
    if (!PUBLIC_IMAGE_EXTENSIONS.test(ext)) return false;
    const photo = await getPhoto(context.env, folder, photoId);
    if (!photo || photo.visibility !== "public") return false;
    const expectedKey = variant === "original" ? photo.objectKey : photo.thumbKey;
    return expectedKey === `images/${folder}/${photoId}/${variant}.${ext}`;
  }

  return false;
}

export const onRequestGet = async (context: FunctionContext) => {
  if (!context.env.MEDIA_BUCKET) {
    return fail(context.request, context.env, "storage_error", "MEDIA_BUCKET binding is not configured.", 503);
  }

  const key = mediaKey(context.params.path as string | string[] | undefined);
  if (!key || !(await isPublicMediaKey(context, key))) {
    return fail(context.request, context.env, "not_found", "Media object not found.", 404);
  }

  const object = await context.env.MEDIA_BUCKET.get(key);
  if (!object) {
    return fail(context.request, context.env, "not_found", "Media object not found.", 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("ETag", object.httpEtag);
  if (context.request.headers.get("If-None-Match") === object.httpEtag) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(object.body, { headers });
};

export const onRequestHead = onRequestGet;
