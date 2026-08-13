import { requireAdmin } from "../../../../../../_shared/auth";
import { getPhoto, readSafePublicVariant } from "../../../../../../_shared/content";
import { fail, options, type FunctionContext } from "../../../../../../_shared/responses";
import { isPublicId, isSlug } from "../../../../../../_shared/validators";

export const onRequestGet = async (context: FunctionContext) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;
  if (!context.env.MEDIA_BUCKET) return fail(context.request, context.env, "storage_error", "MEDIA_BUCKET binding is not configured.", 503);

  const folder = Array.isArray(context.params.folder) ? context.params.folder[0] : context.params.folder || "";
  const photoId = Array.isArray(context.params.photoId) ? context.params.photoId[0] : context.params.photoId || "";
  const variant = Array.isArray(context.params.variant) ? context.params.variant[0] : context.params.variant || "";
  if (!isSlug(folder) || !isPublicId(photoId) || !["original", "display", "thumb"].includes(variant)) {
    return fail(context.request, context.env, "not_found", "Media object not found.", 404);
  }
  const photo = await getPhoto(context.env, folder, photoId, { includePrivate: true });
  if (!photo || photo.source === "seed") return fail(context.request, context.env, "not_found", "Media object not found.", 404);

  if (variant === "display" || variant === "thumb") {
    const safe = await readSafePublicVariant(context.env, photo, variant);
    if (!safe) return fail(context.request, context.env, "not_found", "Media object not found.", 404);
    return new Response(context.request.method === "HEAD" ? null : safe.bytes, {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(safe.bytes.byteLength),
        "Cache-Control": "no-store",
        ETag: safe.etag,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const object = await context.env.MEDIA_BUCKET.get(photo.objectKey);
  if (!object) return fail(context.request, context.env, "not_found", "Media object not found.", 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("ETag", object.httpEtag);
  return new Response(context.request.method === "HEAD" ? null : object.body, { headers });
};

export const onRequestOptions = async (context: FunctionContext) => options(context.request, context.env);
export const onRequestHead = onRequestGet;
