import { requireAdmin } from "../../_shared/auth";
import { listPhotos, savePhotoUpload } from "../../_shared/content";
import { fail, ok, options, type FunctionContext } from "../../_shared/responses";
import { extensionForContentType, isSafeImageType, isSlug } from "../../_shared/validators";

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_THUMB_BYTES = 2 * 1024 * 1024;

export const onRequestOptions = async (context: FunctionContext) => {
  return options(context.request, context.env);
};

export const onRequestGet = async (context: FunctionContext) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  return ok(context.request, context.env, await listPhotos(context.env, { includePrivate: true }));
};

export const onRequestPost = async (context: FunctionContext) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  if (!context.env.MEDIA_BUCKET) {
    return fail(context.request, context.env, "storage_error", "MEDIA_BUCKET binding is not configured.", 503);
  }

  const form = await context.request.formData();
  const file = form.get("file");
  const thumb = form.get("thumb");
  const folder = String(form.get("folder") || "");
  const metadataText = String(form.get("metadata") || "{}");

  if (!(file instanceof File) || !isSlug(folder)) {
    return fail(context.request, context.env, "invalid_request", "Expected file and valid folder.", 400);
  }

  if (!isSafeImageType(file.type)) {
    return fail(context.request, context.env, "unsupported_media_type", "Only JPEG, PNG and WebP are allowed.", 415);
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return fail(context.request, context.env, "payload_too_large", "Image file must be 15 MB or smaller.", 413);
  }

  if (thumb && (!(thumb instanceof File) || thumb.type !== "image/webp")) {
    return fail(context.request, context.env, "unsupported_media_type", "Thumbnail must be a WebP file.", 415);
  }

  if (thumb instanceof File && thumb.size > MAX_THUMB_BYTES) {
    return fail(context.request, context.env, "payload_too_large", "Thumbnail must be 2 MB or smaller.", 413);
  }

  const metadata = JSON.parse(metadataText) as Record<string, unknown>;
  const ext = extensionForContentType(file.type);
  try {
    const photo = await savePhotoUpload(context.env, folder, file, thumb instanceof File ? thumb : undefined, metadata, ext);
    return ok(context.request, context.env, photo, 201);
  } catch (error) {
    return fail(context.request, context.env, "invalid_request", error instanceof Error ? error.message : "Could not upload image.", 400);
  }
};
