import { requireAdmin } from "../../../../../_shared/auth";
import { fail, ok, options, param, type FunctionContext } from "../../../../../_shared/responses";
import { articleAssetKey, mediaUrl } from "../../../../../_shared/r2";
import { isSafeImageType, isSlug } from "../../../../../_shared/validators";

const MAX_ASSET_BYTES = 8 * 1024 * 1024;

export const onRequestOptions = async (context: FunctionContext) => {
  return options(context.request, context.env);
};

export const onRequestPost = async (context: FunctionContext) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  if (!context.env.MEDIA_BUCKET) {
    return fail(context.request, context.env, "storage_error", "MEDIA_BUCKET binding is not configured.", 503);
  }

  const folder = param(context.params.folder);
  const slug = param(context.params.slug);
  if (!isSlug(folder) || !isSlug(slug)) {
    return fail(context.request, context.env, "invalid_request", "Invalid article path.", 400, { folder, slug });
  }

  const form = await context.request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return fail(context.request, context.env, "invalid_request", "Expected multipart field file.", 400);
  }

  if (!isSafeImageType(file.type)) {
    return fail(context.request, context.env, "unsupported_media_type", "Only JPEG, PNG and WebP are allowed.", 415);
  }

  if (file.size > MAX_ASSET_BYTES) {
    return fail(context.request, context.env, "payload_too_large", "Article asset must be 8 MB or smaller.", 413);
  }

  const key = articleAssetKey(folder, slug, file.name);
  await context.env.MEDIA_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
  });

  return ok(context.request, context.env, { key, url: mediaUrl(context.env, key), size: file.size, type: file.type }, 201);
};
