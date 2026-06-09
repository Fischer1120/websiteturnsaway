import { fail, ok, param, type FunctionContext } from "../../../_shared/responses";
import { imageMetadataKey, readJson } from "../../../_shared/r2";
import { photos } from "../../../_shared/seed";
import { isSlug } from "../../../_shared/validators";

export const onRequestGet = async (context: FunctionContext) => {
  const folder = param(context.params.folder);
  const photoId = param(context.params.photoId);
  if (!isSlug(folder) || !photoId) {
    return fail(context.request, context.env, "invalid_request", "Invalid image path.", 400, {
      folder,
      photoId,
    });
  }

  const r2Metadata = await readJson(context.env.MEDIA_BUCKET, imageMetadataKey(folder, photoId));
  if (r2Metadata) return ok(context.request, context.env, r2Metadata);

  const photo = photos.find((item) => item.folder === folder && item.id === photoId);
  if (!photo) {
    return fail(context.request, context.env, "not_found", "Photo not found.", 404, { folder, photoId });
  }

  return ok(context.request, context.env, photo);
};
