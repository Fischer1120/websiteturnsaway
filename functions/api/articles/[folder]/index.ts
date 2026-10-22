import { fail, failFromError, ok, param, type FunctionContext } from "../../../_shared/responses";
import { listArticles, toPublicArticle } from "../../../_shared/content";
import { isSlug } from "../../../_shared/validators";

export const onRequestGet = async (context: FunctionContext) => {
  try {
  const folder = param(context.params.folder);
  if (!isSlug(folder)) {
    return fail(context.request, context.env, "invalid_request", "Invalid folder.", 400, { folder });
  }

  const folderArticles = (await listArticles(context.env)).articles.filter((article) => article.folder === folder);
  if (folderArticles.length === 0) {
    return fail(context.request, context.env, "not_found", "Article folder not found.", 404, { folder });
  }

    return ok(context.request, context.env, { folder, articles: folderArticles.map((article) => toPublicArticle(article)) });
  } catch (error) {
    return failFromError(context.request, context.env, error, "Could not read article folder.");
  }
};
