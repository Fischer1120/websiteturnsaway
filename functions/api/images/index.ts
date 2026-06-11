import { ok, type FunctionContext } from "../../_shared/responses";
import { listPhotos } from "../../_shared/content";

export const onRequestGet = async (context: FunctionContext) => {
  return ok(context.request, context.env, await listPhotos(context.env));
};
