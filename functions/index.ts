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
  const title = article.title || article.slug;
  const image = article.coverImage
    ? `<img src="${escapeAttr(article.coverImage)}" alt="" loading="lazy" data-fallback-src="/assets/media/photo-placeholder.svg">`
    : `<span class="record-placeholder" aria-hidden="true">A</span>`;
  return `<a class="record-card" href="/articles/${escapeAttr(article.folder)}/${escapeAttr(article.slug)}"><span class="record-thumb">${image}</span><span class="record-body"><span class="chips"><span class="chip">article</span><span class="chip">${escapeHtml(article.folder)}</span></span><strong class="record-title">${escapeHtml(title)}</strong><span class="record-summary">${escapeHtml(article.subtitle || article.summary || "")}</span><span class="record-meta system-text">${escapeHtml(formatDate(article.publishedAt))}</span></span></a>`;
}

function photoCard(photo: ReturnType<typeof toPublicPhoto>) {
  const title = photo.title || photo.id;
  return `<a class="record-card" href="/images/${escapeAttr(photo.folder)}/${escapeAttr(photo.id)}"><span class="record-thumb"><img src="${escapeAttr(photo.thumbUrl || photo.imageUrl)}" alt="" loading="lazy" data-fallback-src="/assets/media/photo-placeholder.svg"></span><span class="record-body"><span class="chips"><span class="chip">photo</span><span class="chip">${escapeHtml(photo.folder)}</span></span><strong class="record-title">${escapeHtml(title)}</strong><span class="record-summary">${escapeHtml(photo.description || "")}</span><span class="record-meta system-text">${escapeHtml(formatDate(photo.capturedAt, true))} / ${escapeHtml(photo.location.label)}</span></span></a>`;
}

function folderRows(basePath: "/articles" | "/images", folders: Array<{ slug: string; label: string; description: string; count?: number }>) {
  return `<div class="folder-grid" aria-label="${basePath === "/articles" ? "文章" : "图片"}文件夹">${folders
    .map((folder) => `<a class="folder-row" href="${basePath}/${escapeAttr(folder.slug)}"><span class="path">${basePath}/${escapeHtml(folder.slug)}</span><span class="folder-copy"><strong>${escapeHtml(folder.label)}</strong><span>${escapeHtml(folder.description)}</span></span><span class="count">${folder.count || 0} records</span></a>`)
    .join("")}</div>`;
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

  const body = `<main id="main-content" class="content-stack" tabindex="-1">
    <section class="hero" data-orbital-hero aria-labelledby="home-title">
      <div class="panel hero-copy">
        <p class="eyebrow">Welcome / Archive Station</p>
        <h1 id="home-title">一座观测站，用来存放转身后的证据。</h1>
        <p class="hero-dek">文章、图片、文件夹与元数据在这里被精确归档。真实内容保持原貌，界面只留下冷白表面、石墨轨道与克制的信号色。</p>
        <div class="hero-actions"><a class="button primary" href="/articles">浏览文章</a><a class="button secondary" href="/images">浏览图片与地图</a></div>
        <div class="archive-readout" aria-label="公开档案统计"><span><strong>${articles.length}</strong> articles</span><span><strong>${photos.length}</strong> photos</span><span><strong>${articleFolders.length + photoFolders.length}</strong> folders</span></div>
      </div>
      <figure class="panel hero-visual" data-orbital-stage>
        <img src="/assets/media/orbital-monolith-cover.svg" alt="球体、轨道、方碑和金字塔组成的观测站图像" fetchpriority="high" data-orbital-art>
        <figcaption class="system-text">ORBITAL MONOLITH / ARCHIVE SIGNAL 02</figcaption>
      </figure>
    </section>
    <section class="panel dark" id="articles" aria-labelledby="articles-title">
      <div class="section-heading"><div><p class="eyebrow">Article Records</p><h2 id="articles-title">文章</h2></div><p>${articles.length} 条公开文章，按发布时间排列。</p></div>
      <div class="record-grid">${articles.map(articleCard).join("") || `<div class="empty-state">暂时没有公开文章。</div>`}</div>
      ${folderRows("/articles", articleFolders)}
    </section>
    <section class="panel dark" id="images" aria-labelledby="images-title">
      <div class="section-heading"><div><p class="eyebrow">Photo Records</p><h2 id="images-title">图片</h2></div><p>${photos.length} 张公开图片，可按文件夹或地图浏览。</p></div>
      <div class="record-grid">${photos.map(photoCard).join("") || `<div class="empty-state">暂时没有公开图片。</div>`}</div>
      ${folderRows("/images", photoFolders)}
    </section>
  </main>`;

  return htmlPage({
    title: "Website Turns Away",
    description: "Orbital Archive v2：文章、图片、文件夹与元数据构成的个人档案站。",
    currentSection: "home",
    breadcrumbs: [{ label: "首页" }],
    body,
  });
};
