import { fail, ok, param, type FunctionContext } from "../../../_shared/responses";
import { readJson } from "../../../_shared/r2";
import { photos } from "../../../_shared/seed";
import { isSlug } from "../../../_shared/validators";

export const onRequestGet = async (context: FunctionContext) => {
  const folder = param(context.params.folder);
  if (!isSlug(folder)) {
    return fail(context.request, context.env, "invalid_request", "Invalid folder.", 400, { folder });
  }

  const r2Index = await readJson(context.env.MEDIA_BUCKET, `indexes/images/${folder}.json`);
  if (r2Index) return ok(context.request, context.env, r2Index);

  const folderPhotos = photos.filter((photo) => photo.folder === folder);
  if (folderPhotos.length === 0) {
    return fail(context.request, context.env, "not_found", "Image folder not found.", 404, { folder });
  }

  return ok(context.request, context.env, { folder, photos: folderPhotos });
};
