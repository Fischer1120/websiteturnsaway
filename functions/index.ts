import {
  listArticles,
  listPublicPhotos,
  toPublicArticle,
  toPublicArticleFolders,
  toPublicPhoto,
} from "./_shared/content";
import { canonicalRedirect, escapeAttr, escapeHtml, formatDate, htmlPage } from "./_shared/html";
import type { FunctionContext } from "./_shared/responses";

function articleCard(article: ReturnType<typeof toPublicArticle>) {
  return `<a class="record-card" href="/articles/${escapeAttr(article.folder)}/${escapeAttr(article.slug)}"><div class="record-thumb">${article.coverImage ? `<img src="${escapeAttr(article.coverImage)}" alt="${escapeAttr(article.title)}" loading="lazy">` : ""}</div><div class="record-body"><div class="chips"><span class="chip">article</span><span class="chip">${escapeHtml(article.folder)}</span></div><h2>${escapeHtml(article.title || article.slug)}</h2><p>${escapeHtml(article.subtitle || article.summary || "")}</p><p class="system-text">${escapeHtml(formatDate(article.publishedAt))}</p></div></a>`;
}

function photoCard(photo: ReturnType<typeof toPublicPhoto>) {
  return `<a class="record-card" href="/images/${escapeAttr(photo.folder)}/${escapeAttr(photo.id)}"><div class="record-thumb"><img src="${escapeAttr(photo.thumbUrl || photo.imageUrl)}" alt="${escapeAttr(photo.alt || photo.title)}" loading="lazy"></div><div class="record-body"><div class="chips"><span class="chip">photo</span><span class="chip">${escapeHtml(photo.folder)}</span></div><h2>${escapeHtml(photo.title || photo.id)}</h2><p>${escapeHtml(photo.description || "")}</p><p class="system-text">${escapeHtml(formatDate(photo.capturedAt, true))} / ${escapeHtml(photo.location.label)}</p></div></a>`;
}

export const onRequestGet = async (context: FunctionContext) => {
  const redirect = canonicalRedirect(context.request);
  if (redirect) return redirect;

  const [articlesData, photosData] = await Promise.all([
    listArticles(context.env),
    listPublicPhotos(context.env),
  ]);
  const articles = articlesData.articles.map((article) => toPublicArticle(article));
  const photos = photosData.photos;
  const articleFolders = toPublicArticleFolders(articlesData.folders);
  const photoFolders = photosData.folders;

  const body = `<main class="content-stack"><section class="panel"><div class="section-heading"><div><p class="eyebrow">Welcome / Live Archive Station</p><h1>Website Turns Away</h1></div><p>首页、文章栏目、分组页和详情页都从同一套运行时公开数据生成；draft/private 内容不会出现在这里。</p></div><div class="hero-actions"><a class="button primary" href="/articles">文章栏目</a><a class="button secondary" href="/images">图片栏目</a></div></section><section class="panel"><div class="section-heading"><div><p class="eyebrow">Article Records</p><h2>文章</h2></div><p>${articles.length} 条公开文章</p></div><div class="record-grid">${articles.map(articleCard).join("") || `<div class="empty-state">暂时没有公开文章。</div>`}</div><div class="folder-grid">${articleFolders.map((folder) => `<a class="folder-row" href="/articles/${escapeAttr(folder.slug)}"><span class="path">/articles/${escapeHtml(folder.slug)}</span><span><strong>${escapeHtml(folder.label)}</strong><p>${escapeHtml(folder.description)}</p></span><span class="count">${folder.count} records</span></a>`).join("")}</div></section><section class="panel"><div class="section-heading"><div><p class="eyebrow">Photo Records</p><h2>图片</h2></div><p>${photos.length} 条公开图片</p></div><div class="record-grid">${photos.map(photoCard).join("") || `<div class="empty-state">暂时没有公开图片。</div>`}</div><div class="folder-grid">${photoFolders.map((folder) => `<a class="folder-row" href="/images/${escapeAttr(folder.slug)}"><span class="path">/images/${escapeHtml(folder.slug)}</span><span><strong>${escapeHtml(folder.label)}</strong><p>${escapeHtml(folder.description)}</p></span><span class="count">${folder.count} records</span></a>`).join("")}</div></section></main>`;
  return htmlPage("Website Turns Away", body);
};
