import { getArticle, type ArticleRecord } from "../../_shared/content";
import { canonicalRedirect, escapeAttr, escapeHtml, formatDate, htmlPage, metaRows } from "../../_shared/html";
import { markdownToHtml as renderMarkdown } from "../../_shared/markdown";
import { param, type FunctionContext } from "../../_shared/responses";
import { isSlug } from "../../_shared/validators";

function tags(article: ArticleRecord) {
  if (!article.tags.length) return "";
  return `<div class="chips article-tags" aria-label="文章标签">${article.tags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("")}</div>`;
}

function errorPage(status: number, title: string, message: string) {
  return htmlPage({
    title,
    description: message,
    currentSection: "articles",
    breadcrumbs: [{ label: "首页", href: "/" }, { label: "文章", href: "/articles" }, { label: title }],
    body: `<main id="main-content" class="content-stack" tabindex="-1"><section class="panel error-panel" role="alert"><p class="eyebrow">Article Error / ${status}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a class="button secondary" href="/articles">返回文章栏目</a></section></main>`,
    status,
  });
}

export const onRequestGet = async (context: FunctionContext) => {
  const redirect = canonicalRedirect(context.request);
  if (redirect) return redirect;

  const folder = param(context.params.folder);
  const slug = param(context.params.slug);
  if (!isSlug(folder) || !isSlug(slug)) {
    return errorPage(400, "路径无效", "文章 folder 或 slug 不符合公开路径规则。");
  }

  const article = await getArticle(context.env, folder, slug);
  if (!article) {
    return errorPage(404, "没有找到文章", "这篇文章不存在，或尚未发布。");
  }

  const cover = article.coverImage
    ? `<figure class="article-cover immersive-cover"><img src="${escapeAttr(article.coverImage)}" alt="${escapeAttr(article.title)}" loading="eager" data-fallback-src="/assets/media/photo-placeholder.svg"></figure>`
    : "";
  const summary = article.summary && article.summary !== article.subtitle
    ? `<p class="article-summary">${escapeHtml(article.summary)}</p>`
    : "";
  const body = `<main id="main-content" class="reading-shell" tabindex="-1">
    <article class="article-prose">
      <p class="eyebrow">Article Record / ${escapeHtml(article.folder)}/${escapeHtml(article.slug)}</p>
      <h1>${escapeHtml(article.title)}</h1>
      ${article.subtitle ? `<p class="dek">${escapeHtml(article.subtitle)}</p>` : ""}
      ${summary}
      ${cover}
      ${tags(article)}
      <div class="article-body">${renderMarkdown(article.markdown)}</div>
    </article>
    <aside class="sidecar" aria-labelledby="reading-sidecar-title"><h2 id="reading-sidecar-title">阅读信息</h2>${metaRows([
      ["Folder", article.folder],
      ["Slug", article.slug],
      ["Published", formatDate(article.publishedAt, true)],
      ["Updated", formatDate(article.updatedAt, true)],
      ["Status", article.status],
    ])}</aside>
  </main>`;

  return htmlPage({
    title: article.title,
    description: article.summary || article.subtitle || article.title,
    currentSection: "articles",
    breadcrumbs: [
      { label: "首页", href: "/" },
      { label: "文章", href: "/articles" },
      { label: article.folder, href: `/articles/${article.folder}` },
      { label: article.title },
    ],
    body,
  });
};
