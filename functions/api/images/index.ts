import { ok, type FunctionContext } from "../../_shared/responses";
import { readJson } from "../../_shared/r2";
import { imageFolders, photos } from "../../_shared/seed";

export const onRequestGet = async (context: FunctionContext) => {
  const r2Index = await readJson(context.env.MEDIA_BUCKET, "indexes/images.json");
  return ok(context.request, context.env, r2Index || { folders: imageFolders(), photos });
};
