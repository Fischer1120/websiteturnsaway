import { requireAdmin } from "../../_shared/auth";
import { fail, ok, options, type FunctionContext } from "../../_shared/responses";
import { imageMetadataKey, imageOriginalKey, imageThumbKey } from "../../_shared/r2";
import { extensionForContentType, isSafeImageType, isSlug } from "../../_shared/validators";

export const onRequestOptions = async (context: FunctionContext) => {
  return options(context.request, context.env);
};

export const onRequestPost = async (context: FunctionContext) => {
  const authError = requireAdmin(context);
  if (authError) return authError;

  if (!context.env.MEDIA_BUCKET) {
    return fail(context.request, context.env, "storage_error", "MEDIA_BUCKET binding is not configured.", 503);
  }

  const form = await context.request.formData();
  const file = form.get("file");
  const folder = String(form.get("folder") || "");
  const metadataText = String(form.get("metadata") || "{}");

  if (!(file instanceof File) || !isSlug(folder)) {
    return fail(context.request, context.env, "invalid_request", "Expected file and valid folder.", 400);
  }

  if (!isSafeImageType(file.type)) {
    return fail(context.request, context.env, "unsupported_media_type", "Only JPEG, PNG, WebP and SVG are allowed.", 415);
  }

  const metadata = JSON.parse(metadataText) as Record<string, unknown>;
  const photoId = String(metadata.id || `${new Date().toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`);
  const ext = extensionForContentType(file.type);
  const originalKey = imageOriginalKey(folder, photoId, ext);
  const thumbKey = imageThumbKey(folder, photoId, ext);
  const metaKey = imageMetadataKey(folder, photoId);

  const fullMetadata = {
    ...metadata,
    id: photoId,
    folder,
    objectKey: originalKey,
    thumbKey,
    visibility: metadata.visibility || "public",
  };

  await context.env.MEDIA_BUCKET.put(originalKey, file.stream(), {
    httpMetadata: { contentType: file.type },
  });
  await context.env.MEDIA_BUCKET.put(metaKey, JSON.stringify(fullMetadata, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });

  return ok(context.request, context.env, { photoId, objectKey: originalKey, metadataKey: metaKey }, 201);
};
