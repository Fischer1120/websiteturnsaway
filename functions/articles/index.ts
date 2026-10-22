import { listArticles, toPublicArticle, toPublicArticleFolders } from "../_shared/content";
import { canonicalRedirect, escapeAttr, escapeHtml, formatDate, htmlPage } from "../_shared/html";
import type { FunctionContext } from "../_shared/responses";

export const onRequestGet = async (context: FunctionContext) => {
  const redirect = canonicalRedirect(context.request);
  if (redirect) return redirect;

  const data = await listArticles(context.env);
  const articles = data.articles.map((article) => toPublicArticle(article));
  const folders = toPublicArticleFolders(data.folders);
  const cards = articles.map((article) => {
    const title = article.title || article.slug;
    const image = article.coverImage
      ? `<img src="${escapeAttr(article.coverImage)}" alt="" loading="lazy" data-fallback-src="/assets/media/photo-placeholder.svg">`
      : `<span class="record-placeholder" aria-hidden="true">A</span>`;
    return `<a class="record-card" href="/articles/${escapeAttr(article.folder)}/${escapeAttr(article.slug)}"><span class="record-thumb">${image}</span><span class="record-body"><span class="chips"><span class="chip">article</span><span class="chip">${escapeHtml(article.folder)}</span></span><strong class="record-title">${escapeHtml(title)}</strong><span class="record-summary">${escapeHtml(article.subtitle || article.summary || "")}</span><span class="record-meta system-text">${escapeHtml(formatDate(article.publishedAt))}</span></span></a>`;
  }).join("");
  const folderRows = folders.map((folder) => `<a class="folder-row" href="/articles/${escapeAttr(folder.slug)}"><span class="path">/articles/${escapeHtml(folder.slug)}</span><span class="folder-copy"><strong>${escapeHtml(folder.label)}</strong><span>${escapeHtml(folder.description)}</span></span><span class="count">${folder.count} records</span></a>`).join("");
  const body = `<main id="main-content" class="content-stack" tabindex="-1"><section class="panel dark"><div class="section-heading"><div><p class="eyebrow">Articles / Live Index</p><h1>文章栏目</h1></div><p>文章以文件夹和固定 slug 归档；所有公开记录无需 JavaScript 即可阅读。</p></div><div class="record-grid">${cards || `<div class="empty-state">暂时没有公开文章。</div>`}</div><div class="folder-grid" aria-label="文章文件夹">${folderRows}</div></section></main>`;

  return htmlPage({
    title: "文章栏目",
    description: "按文件夹浏览 Website Turns Away 的公开文章。",
    currentSection: "articles",
    breadcrumbs: [{ label: "首页", href: "/" }, { label: "文章" }],
    body,
  });
};
