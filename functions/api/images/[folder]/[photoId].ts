import { fail, ok, param, type FunctionContext } from "../../../_shared/responses";
import { getPhoto } from "../../../_shared/content";
import { isPublicId, isSlug } from "../../../_shared/validators";

export const onRequestGet = async (context: FunctionContext) => {
  const folder = param(context.params.folder);
  const photoId = param(context.params.photoId);
  if (!isSlug(folder) || !isPublicId(photoId)) {
    return fail(context.request, context.env, "invalid_request", "Invalid image path.", 400, {
      folder,
      photoId,
    });
  }

  const photo = await getPhoto(context.env, folder, photoId);
  if (!photo) {
    return fail(context.request, context.env, "not_found", "Photo not found.", 404, { folder, photoId });
  }

  return ok(context.request, context.env, photo);
};
