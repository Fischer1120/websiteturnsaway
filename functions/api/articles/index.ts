import { ok, type FunctionContext } from "../../_shared/responses";
import { listArticles } from "../../_shared/content";

export const onRequestGet = async (context: FunctionContext) => {
  return ok(context.request, context.env, await listArticles(context.env));
};
