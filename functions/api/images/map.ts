import { listPublicPhotoMap } from "../../_shared/content";
import { fail, failFromError, ok, type FunctionContext } from "../../_shared/responses";
import { isPublicId, isSlug } from "../../_shared/validators";

export const onRequestGet = async (context: FunctionContext) => {
  try {
    const value = new URL(context.request.url).searchParams.get("photo");
    if (!value) return ok(context.request, context.env, await listPublicPhotoMap(context.env));
    const decoded = decodeURIComponent(value);
    const [folder, id, ...rest] = decoded.split("/");
    if (rest.length || !isSlug(folder || "") || !isPublicId(id || "")) {
      return fail(context.request, context.env, "invalid_request", "Invalid photo filter.", 400);
    }
    return ok(context.request, context.env, await listPublicPhotoMap(context.env, { folder, id }));
  } catch (error) {
    if (error instanceof URIError) return fail(context.request, context.env, "invalid_request", "Invalid photo filter.", 400);
    return failFromError(context.request, context.env, error, "Could not read photo map.");
  }
};
