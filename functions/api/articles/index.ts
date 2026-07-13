import { listPublicArticles } from "../../_shared/content";
import { failFromError, ok, type FunctionContext } from "../../_shared/responses";

export const onRequestGet = async (context: FunctionContext) => {
  try {
    return ok(context.request, context.env, await listPublicArticles(context.env));
  } catch (error) {
    return failFromError(context.request, context.env, error, "Could not read articles.");
  }
};
