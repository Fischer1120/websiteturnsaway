import { requireAdmin } from "../../../../_shared/auth";
import { deletePhoto, getPhoto, patchPhoto } from "../../../../_shared/content";
import { fail, ok, options, param, type FunctionContext } from "../../../../_shared/responses";
import { isPublicId, isSlug } from "../../../../_shared/validators";

export const onRequestOptions = async (context: FunctionContext) => {
  return options(context.request, context.env);
};

export const onRequestGet = async (context: FunctionContext) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  const folder = param(context.params.folder);
  const photoId = param(context.params.photoId);
  if (!isSlug(folder) || !isPublicId(photoId)) {
    return fail(context.request, context.env, "invalid_request", "Invalid image path.", 400, { folder, photoId });
  }

  const photo = await getPhoto(context.env, folder, photoId, { includePrivate: true });
  if (!photo) {
    return fail(context.request, context.env, "not_found", "Photo not found.", 404, { folder, photoId });
  }

  return ok(context.request, context.env, photo);
};

export const onRequestPatch = async (context: FunctionContext) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  const folder = param(context.params.folder);
  const photoId = param(context.params.photoId);
  if (!isSlug(folder) || !isPublicId(photoId)) {
    return fail(context.request, context.env, "invalid_request", "Invalid image path.", 400, { folder, photoId });
  }

  const body = await context.request.json<Record<string, unknown>>().catch(() => undefined);
  if (!body) {
    return fail(context.request, context.env, "invalid_request", "Expected image metadata patch JSON.", 400);
  }

  try {
    const photo = await patchPhoto(context.env, folder, photoId, body);
    if (!photo) {
      return fail(context.request, context.env, "not_found", "Photo not found.", 404, { folder, photoId });
    }
    return ok(context.request, context.env, photo);
  } catch (error) {
    return fail(context.request, context.env, "invalid_request", error instanceof Error ? error.message : "Could not update image.", 400);
  }
};

export const onRequestDelete = async (context: FunctionContext) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  const folder = param(context.params.folder);
  const photoId = param(context.params.photoId);
  if (!isSlug(folder) || !isPublicId(photoId)) {
    return fail(context.request, context.env, "invalid_request", "Invalid image path.", 400, { folder, photoId });
  }

  try {
    await deletePhoto(context.env, folder, photoId);
    return ok(context.request, context.env, { folder, photoId });
  } catch (error) {
    return fail(context.request, context.env, "invalid_request", error instanceof Error ? error.message : "Could not delete image.", 400);
  }
};
