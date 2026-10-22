import { fail, failFromError, ok, param, type FunctionContext } from "../../../_shared/responses";
import { getArticle, toPublicArticle } from "../../../_shared/content";
import { isSlug } from "../../../_shared/validators";

export const onRequestGet = async (context: FunctionContext) => {
  try {
  const folder = param(context.params.folder);
  const slug = param(context.params.slug);
  if (!isSlug(folder) || !isSlug(slug)) {
    return fail(context.request, context.env, "invalid_request", "Invalid article path.", 400, {
      folder,
      slug,
    });
  }

  const article = await getArticle(context.env, folder, slug);
  if (!article) {
    return fail(context.request, context.env, "not_found", "Article not found.", 404, { folder, slug });
  }

    return ok(context.request, context.env, toPublicArticle(article, { includeMarkdown: true }));
  } catch (error) {
    return failFromError(context.request, context.env, error, "Could not read article.");
  }
};
