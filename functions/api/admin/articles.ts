import { requireAdmin } from "../../_shared/auth";
import { listArticles, saveArticle } from "../../_shared/content";
import { fail, ok, options, type FunctionContext } from "../../_shared/responses";

export const onRequestOptions = async (context: FunctionContext) => {
  return options(context.request, context.env);
};

export const onRequestGet = async (context: FunctionContext) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  return ok(context.request, context.env, await listArticles(context.env, { includePrivate: true }));
};

export const onRequestPost = async (context: FunctionContext) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  const body = await context.request.json<Record<string, unknown>>().catch(() => undefined);
  if (!body) {
    return fail(context.request, context.env, "invalid_request", "Expected article JSON payload.", 400);
  }

  try {
    const article = await saveArticle(context.env, body);
    return ok(context.request, context.env, article, 201);
  } catch (error) {
    return fail(context.request, context.env, "invalid_request", error instanceof Error ? error.message : "Could not save article.", 400);
  }
};
