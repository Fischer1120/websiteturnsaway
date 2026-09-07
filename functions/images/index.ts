import { listPhotos, listPublicPhotos, type FolderRecord, toPublicPhoto } from "../_shared/content";
import { canonicalRedirect, escapeAttr, escapeHtml, formatDate, htmlPage } from "../_shared/html";
import type { FunctionContext } from "../_shared/responses";

function photoCard(photo: ReturnType<typeof toPublicPhoto>) {
  const title = photo.title || photo.id;
  return `<a class="record-card" href="/images/${escapeAttr(photo.folder)}/${escapeAttr(photo.id)}"><span class="record-thumb"><img src="${escapeAttr(photo.thumbUrl || photo.imageUrl)}" alt="" loading="lazy" data-fallback-src="/assets/media/photo-placeholder.svg"></span><span class="record-body"><span class="chips"><span class="chip">photo</span><span class="chip">${escapeHtml(photo.folder)}</span></span><strong class="record-title">${escapeHtml(title)}</strong><span class="record-summary">${escapeHtml(photo.description || "")}</span><span class="record-meta system-text">${escapeHtml(formatDate(photo.capturedAt, true))} / ${escapeHtml(photo.location.label)}</span></span></a>`;
}

function folderRows(folders: Array<FolderRecord & { count?: number }>) {
  return `<div class="folder-grid" aria-label="图片文件夹">${folders.map((folder) => `<a class="folder-row" href="/images/${escapeAttr(folder.slug)}"><span class="path">/images/${escapeHtml(folder.slug)}</span><span class="folder-copy"><strong>${escapeHtml(folder.label)}</strong><span>${escapeHtml(folder.description)}</span></span><span class="count">${folder.count || 0} records</span></a>`).join("")}</div>`;
}

export const onRequestGet = async (context: FunctionContext) => {
  const redirect = canonicalRedirect(context.request);
  if (redirect) return redirect;

  const [data, raw] = await Promise.all([listPublicPhotos(context.env), listPhotos(context.env)]);
  const photos = data.photos;
  const withLocation = raw.photos.filter((photo) => Number.isFinite(photo.location.latitude) && Number.isFinite(photo.location.longitude)).length;
  const focus = new URL(context.request.url).searchParams.get("photo") || "";
  const cards = photos.map(photoCard).join("") || `<div class="empty-state">暂时没有公开图片。</div>`;
  const body = `<main id="main-content" class="content-stack" tabindex="-1" data-photo-map-page>
    <section class="panel dark" aria-labelledby="images-title">
      <div class="section-heading"><div><p class="eyebrow">Images / Live Metadata Index</p><h1 id="images-title">图片栏目</h1></div><p>${photos.length} 张公开照片；${withLocation} 张带有可公开的位置范围。照片列表始终可用，地图仅在打开后加载。</p></div>
      <div class="photo-view-switch" role="tablist" aria-label="图片浏览方式">
        <button id="photo-tab-photos" type="button" role="tab" aria-selected="true" aria-controls="photo-panel-photos" tabindex="0" data-photo-view="photos">照片</button>
        <button id="photo-tab-map" type="button" role="tab" aria-selected="false" aria-controls="photo-panel-map" tabindex="-1" data-photo-view="map">地图</button>
      </div>
      <section id="photo-panel-photos" class="photo-list-panel" role="tabpanel" aria-labelledby="photo-tab-photos" tabindex="-1" data-photo-list-panel>
        <div class="record-grid">${cards}</div>${folderRows(data.folders)}
      </section>
      <section id="photo-panel-map" class="photo-map-panel" role="tabpanel" aria-labelledby="photo-tab-map" tabindex="-1" data-photo-map-panel hidden>
        <div class="photo-map-shell" data-photo-map-root data-endpoint="/api/images/map" data-focus="${escapeAttr(focus)}">
          <div class="photo-map-intro"><p class="photo-map-note">打开地图会从 OpenStreetMap 加载第三方地图数据；地图只接收按所选精度量化后的位置。</p><p class="system-text">${withLocation} 有位置 / ${photos.length - withLocation} 无位置 · 每张照片单独标注公开精度</p></div>
          <div class="photo-map-feedback"><p class="photo-map-status" data-map-status role="status" aria-live="polite" hidden></p><div class="photo-map-error-actions"><button class="button secondary" type="button" data-map-retry hidden>重试加载</button><button class="button quiet" type="button" data-map-return hidden>返回照片列表</button></div></div>
          <button class="photo-map-reset button quiet" type="button" data-map-reset hidden disabled>复位视野</button>
          <div class="photo-map-canvas" data-map-canvas role="region" aria-label="公开照片地图" hidden></div>
        </div>
        <details class="photo-map-list"><summary>使用键盘或列表浏览照片</summary><div class="record-grid">${cards}</div></details>
      </section>
    </section>
  </main>`;

  return htmlPage({
    title: "图片栏目",
    description: "按文件夹或隐私友好的位置地图浏览 Website Turns Away 的公开图片。",
    currentSection: "images",
    breadcrumbs: [{ label: "首页", href: "/" }, { label: "图片" }],
    body,
  });
};
