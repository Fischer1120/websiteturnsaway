import { listArticles, toPublicArticle, type PublicArticleRecord } from "../../_shared/content";
import { canonicalRedirect, escapeAttr, escapeHtml, formatDate, htmlPage } from "../../_shared/html";
import { param, type FunctionContext } from "../../_shared/responses";
import { isSlug } from "../../_shared/validators";

function articleCard(article: PublicArticleRecord) {
  const title = article.title || article.slug;
  const image = article.coverImage
    ? `<img src="${escapeAttr(article.coverImage)}" alt="" loading="lazy" data-fallback-src="/assets/media/photo-placeholder.svg">`
    : `<span class="record-placeholder" aria-hidden="true">A</span>`;
  return `<a class="record-card" href="/articles/${escapeAttr(article.folder)}/${escapeAttr(article.slug)}"><span class="record-thumb">${image}</span><span class="record-body"><span class="chips"><span class="chip">article</span><span class="chip">${escapeHtml(formatDate(article.publishedAt))}</span></span><strong class="record-title">${escapeHtml(title)}</strong>${article.subtitle ? `<span class="record-subtitle">${escapeHtml(article.subtitle)}</span>` : ""}${article.summary ? `<span class="record-summary">${escapeHtml(article.summary)}</span>` : ""}</span></a>`;
}

function errorPage(status: number, title: string, message: string, folder?: string) {
  return htmlPage({
    title,
    description: message,
    currentSection: "articles",
    breadcrumbs: [
      { label: "首页", href: "/" },
      { label: "文章", href: "/articles" },
      { label: folder || title },
    ],
    body: `<main id="main-content" class="content-stack" tabindex="-1"><section class="panel error-panel" role="alert"><p class="eyebrow">Article Folder Error / ${status}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a class="button secondary" href="/articles">返回文章栏目</a></section></main>`,
    status,
  });
}

export const onRequestGet = async (context: FunctionContext) => {
  const redirect = canonicalRedirect(context.request);
  if (redirect) return redirect;

  const folder = param(context.params.folder);
  if (!isSlug(folder)) {
    return errorPage(400, "路径无效", "文章 folder 不符合公开路径规则。");
  }

  const data = await listArticles(context.env);
  const folderRecord = data.folders.find((item) => item.slug === folder);
  const articles = data.articles.filter((article) => article.folder === folder);
  if (!folderRecord || articles.length === 0) {
    return errorPage(404, "没有找到分组", "这个文章分组不存在，或暂时没有公开文章。", folder);
  }

  const publicArticles = articles.map((article) => toPublicArticle(article));
  const body = `<main id="main-content" class="content-stack" tabindex="-1"><section class="panel dark"><div class="section-heading"><div><p class="eyebrow">Article Folder / ${escapeHtml(folder)}</p><h1>${escapeHtml(folderRecord.label)}</h1></div><p>${escapeHtml(folderRecord.description)}</p></div><div class="record-grid">${publicArticles.map(articleCard).join("")}</div></section></main>`;
  return htmlPage({
    title: `${folderRecord.label} - 文章文件夹`,
    description: folderRecord.description,
    currentSection: "articles",
    breadcrumbs: [
      { label: "首页", href: "/" },
      { label: "文章", href: "/articles" },
      { label: folderRecord.label },
    ],
    body,
  });
};
