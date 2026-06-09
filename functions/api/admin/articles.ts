import { requireAdmin } from "../../_shared/auth";
import { fail, ok, options, type FunctionContext } from "../../_shared/responses";
import { articleKey } from "../../_shared/r2";
import { isSlug } from "../../_shared/validators";

export const onRequestOptions = async (context: FunctionContext) => {
  return options(context.request, context.env);
};

export const onRequestPost = async (context: FunctionContext) => {
  const authError = requireAdmin(context);
  if (authError) return authError;

  if (!context.env.MEDIA_BUCKET) {
    return fail(context.request, context.env, "storage_error", "MEDIA_BUCKET binding is not configured.", 503);
  }

  const body = await context.request.json<Record<string, unknown>>().catch(() => undefined);
  if (!body || typeof body.folder !== "string" || typeof body.slug !== "string" || typeof body.markdown !== "string") {
    return fail(context.request, context.env, "invalid_request", "Expected folder, slug and markdown.", 400);
  }

  if (!isSlug(body.folder) || !isSlug(body.slug)) {
    return fail(context.request, context.env, "invalid_request", "Invalid folder or slug.", 400);
  }

  const key = articleKey(body.folder, body.slug);
  await context.env.MEDIA_BUCKET.put(key, body.markdown, {
    httpMetadata: { contentType: "text/markdown; charset=utf-8" },
  });

  return ok(context.request, context.env, { key, folder: body.folder, slug: body.slug }, 201);
};
