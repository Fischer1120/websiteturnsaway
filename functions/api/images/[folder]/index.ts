import { fail, ok, param, type FunctionContext } from "../../../_shared/responses";
import { listPhotos } from "../../../_shared/content";
import { isSlug } from "../../../_shared/validators";

export const onRequestGet = async (context: FunctionContext) => {
  const folder = param(context.params.folder);
  if (!isSlug(folder)) {
    return fail(context.request, context.env, "invalid_request", "Invalid folder.", 400, { folder });
  }

  const folderPhotos = (await listPhotos(context.env)).photos.filter((photo) => photo.folder === folder);
  if (folderPhotos.length === 0) {
    return fail(context.request, context.env, "not_found", "Image folder not found.", 404, { folder });
  }

  return ok(context.request, context.env, { folder, photos: folderPhotos });
};
