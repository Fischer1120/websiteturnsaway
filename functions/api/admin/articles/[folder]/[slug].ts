import { requireAdmin } from "../../../../_shared/auth";
import { deleteArticle, getArticle, patchArticle } from "../../../../_shared/content";
import { fail, ok, options, param, type FunctionContext } from "../../../../_shared/responses";
import { isSlug } from "../../../../_shared/validators";

export const onRequestOptions = async (context: FunctionContext) => {
  return options(context.request, context.env);
};

export const onRequestGet = async (context: FunctionContext) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  const folder = param(context.params.folder);
  const slug = param(context.params.slug);
  if (!isSlug(folder) || !isSlug(slug)) {
    return fail(context.request, context.env, "invalid_request", "Invalid article path.", 400, { folder, slug });
  }

  const article = await getArticle(context.env, folder, slug, { includePrivate: true });
  if (!article) {
    return fail(context.request, context.env, "not_found", "Article not found.", 404, { folder, slug });
  }

  return ok(context.request, context.env, article);
};

export const onRequestPatch = async (context: FunctionContext) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  const folder = param(context.params.folder);
  const slug = param(context.params.slug);
  if (!isSlug(folder) || !isSlug(slug)) {
    return fail(context.request, context.env, "invalid_request", "Invalid article path.", 400, { folder, slug });
  }

  const body = await context.request.json<Record<string, unknown>>().catch(() => undefined);
  if (!body) {
    return fail(context.request, context.env, "invalid_request", "Expected article patch JSON.", 400);
  }

  try {
    const article = await patchArticle(context.env, folder, slug, body);
    if (!article) {
      return fail(context.request, context.env, "not_found", "Article not found.", 404, { folder, slug });
    }
    return ok(context.request, context.env, article);
  } catch (error) {
    return fail(context.request, context.env, "invalid_request", error instanceof Error ? error.message : "Could not update article.", 400);
  }
};

export const onRequestDelete = async (context: FunctionContext) => {
  const authError = await requireAdmin(context);
  if (authError) return authError;

  const folder = param(context.params.folder);
  const slug = param(context.params.slug);
  if (!isSlug(folder) || !isSlug(slug)) {
    return fail(context.request, context.env, "invalid_request", "Invalid article path.", 400, { folder, slug });
  }

  try {
    await deleteArticle(context.env, folder, slug);
    return ok(context.request, context.env, { folder, slug });
  } catch (error) {
    return fail(context.request, context.env, "invalid_request", error instanceof Error ? error.message : "Could not delete article.", 400);
  }
};
