import { fail, ok, param, type FunctionContext } from "../../../_shared/responses";
import { getArticle } from "../../../_shared/content";
import { isSlug } from "../../../_shared/validators";

export const onRequestGet = async (context: FunctionContext) => {
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

  return ok(context.request, context.env, article);
};
