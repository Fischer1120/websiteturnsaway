import { ok, type FunctionContext } from "../../_shared/responses";
import { readJson } from "../../_shared/r2";
import { articles, articleFolders } from "../../_shared/seed";

export const onRequestGet = async (context: FunctionContext) => {
  const r2Index = await readJson(context.env.MEDIA_BUCKET, "indexes/articles.json");
  return ok(context.request, context.env, r2Index || { folders: articleFolders(), articles });
};
