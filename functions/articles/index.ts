import { listArticles, toPublicArticle, toPublicArticleFolders } from "../_shared/content";
import { canonicalRedirect, escapeAttr, escapeHtml, formatDate, htmlPage } from "../_shared/html";
import type { FunctionContext } from "../_shared/responses";

export const onRequestGet = async (context: FunctionContext) => {
  const redirect = canonicalRedirect(context.request);
  if (redirect) return redirect;
  const data = await listArticles(context.env);
  const articles = data.articles.map((article) => toPublicArticle(article));
  const folders = toPublicArticleFolders(data.folders);
  return htmlPage("文章栏目", `<main class="panel"><div class="section-heading"><div><p class="eyebrow">Articles / Live Index</p><h1>文章栏目</h1></div><p>文章列表由运行时公开索引生成；页面不依赖 JavaScript 才能阅读。</p></div><div class="record-grid">${articles.map((article) => `<a class="record-card" href="/articles/${escapeAttr(article.folder)}/${escapeAttr(article.slug)}"><div class="record-thumb">${article.coverImage ? `<img src="${escapeAttr(article.coverImage)}" alt="${escapeAttr(article.title)}" loading="lazy">` : ""}</div><div class="record-body"><div class="chips"><span class="chip">article</span><span class="chip">${escapeHtml(article.folder)}</span></div><h2>${escapeHtml(article.title || article.slug)}</h2><p>${escapeHtml(article.subtitle || article.summary || "")}</p><p class="system-text">${escapeHtml(formatDate(article.publishedAt))}</p></div></a>`).join("")}</div><div class="folder-grid">${folders.map((folder) => `<a class="folder-row" href="/articles/${escapeAttr(folder.slug)}"><span class="path">/articles/${escapeHtml(folder.slug)}</span><span><strong>${escapeHtml(folder.label)}</strong><p>${escapeHtml(folder.description)}</p></span><span class="count">${folder.count} records</span></a>`).join("")}</div></main>`);
};
