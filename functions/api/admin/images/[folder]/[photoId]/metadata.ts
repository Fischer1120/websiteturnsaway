import { requireAdmin } from "../../../../../_shared/auth";
import { fail, ok, options, param, type FunctionContext } from "../../../../../_shared/responses";
import { imageMetadataKey } from "../../../../../_shared/r2";
import { isSlug } from "../../../../../_shared/validators";

export const onRequestOptions = async (context: FunctionContext) => {
  return options(context.request, context.env);
};

export const onRequestPatch = async (context: FunctionContext) => {
  const authError = requireAdmin(context);
  if (authError) return authError;

  if (!context.env.MEDIA_BUCKET) {
    return fail(context.request, context.env, "storage_error", "MEDIA_BUCKET binding is not configured.", 503);
  }

  const folder = param(context.params.folder);
  const photoId = param(context.params.photoId);
  if (!isSlug(folder) || !photoId) {
    return fail(context.request, context.env, "invalid_request", "Invalid image path.", 400);
  }

  const key = imageMetadataKey(folder, photoId);
  const current = await context.env.MEDIA_BUCKET.get(key);
  if (!current) {
    return fail(context.request, context.env, "not_found", "Photo metadata not found.", 404, { key });
  }

  const patch = await context.request.json<Record<string, unknown>>().catch(() => undefined);
  if (!patch) {
    return fail(context.request, context.env, "invalid_request", "Expected JSON metadata patch.", 400);
  }

  const existing = await current.json<Record<string, unknown>>();
  const next = {
    ...existing,
    ...patch,
    id: photoId,
    folder,
    objectKey: existing.objectKey,
    thumbKey: existing.thumbKey,
  };

  await context.env.MEDIA_BUCKET.put(key, JSON.stringify(next, null, 2), {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });

  return ok(context.request, context.env, { key, metadata: next });
};
