import { requireAdmin } from "../../../../../_shared/auth";
import { patchPhoto } from "../../../../../_shared/content";
import { fail, ok, options, param, type FunctionContext } from "../../../../../_shared/responses";
import { isPublicId, isSlug } from "../../../../../_shared/validators";

export const onRequestOptions = async (context: FunctionContext) => {
  return options(context.request, context.env);
};

export const onRequestPatch = async (context: FunctionContext) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  const folder = param(context.params.folder);
  const photoId = param(context.params.photoId);
  if (!isSlug(folder) || !isPublicId(photoId)) {
    return fail(context.request, context.env, "invalid_request", "Invalid image path.", 400);
  }

  const patch = await context.request.json<Record<string, unknown>>().catch(() => undefined);
  if (!patch) {
    return fail(context.request, context.env, "invalid_request", "Expected JSON metadata patch.", 400);
  }

  const photo = await patchPhoto(context.env, folder, photoId, patch);
  if (!photo) {
    return fail(context.request, context.env, "not_found", "Photo metadata not found.", 404, { folder, photoId });
  }
  return ok(context.request, context.env, photo);
};
