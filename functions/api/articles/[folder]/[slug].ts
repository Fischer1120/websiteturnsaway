import { fail, ok, param, type FunctionContext } from "../../../_shared/responses";
import { articleKey, readJson } from "../../../_shared/r2";
import { articles } from "../../../_shared/seed";
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

  const r2Article = await readJson(context.env.MEDIA_BUCKET, articleKey(folder, slug).replace(/\.md$/, ".json"));
  if (r2Article) return ok(context.request, context.env, r2Article);

  const article = articles.find((item) => item.folder === folder && item.slug === slug);
  if (!article) {
    return fail(context.request, context.env, "not_found", "Article not found.", 404, { folder, slug });
  }

  return ok(context.request, context.env, article);
};
