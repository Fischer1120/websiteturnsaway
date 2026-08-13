import { listPhotos, listPublicPhotos, type FolderRecord, toPublicPhoto } from "../_shared/content";
import { canonicalRedirect, escapeAttr, escapeHtml, formatDate, htmlPage, mapLoaderScript } from "../_shared/html";
import type { FunctionContext } from "../_shared/responses";

function photoCard(photo: ReturnType<typeof toPublicPhoto>) {
  return `<a class="record-card" href="/images/${escapeAttr(photo.folder)}/${escapeAttr(photo.id)}"><div class="record-thumb"><img src="${escapeAttr(photo.thumbUrl || photo.imageUrl)}" alt="${escapeAttr(photo.alt || photo.title)}" loading="lazy" onerror="this.onerror=null;this.src='/assets/media/photo-placeholder.svg'"></div><div class="record-body"><div class="chips"><span class="chip">photo</span><span class="chip">${escapeHtml(photo.folder)}</span></div><h2>${escapeHtml(photo.title || photo.id)}</h2><p>${escapeHtml(photo.description || "")}</p><p class="system-text">${escapeHtml(formatDate(photo.capturedAt, true))} / ${escapeHtml(photo.location.label)}</p></div></a>`;
}

function folderRows(folders: Array<FolderRecord & { count?: number }>) {
  return `<div class="folder-grid">${folders.map((folder) => `<a class="folder-row" href="/images/${escapeAttr(folder.slug)}"><span class="path">/images/${escapeHtml(folder.slug)}</span><span><strong>${escapeHtml(folder.label)}</strong><p>${escapeHtml(folder.description)}</p></span><span class="count">${folder.count} records</span></a>`).join("")}</div>`;
}

export const onRequestGet = async (context: FunctionContext) => {
  const redirect = canonicalRedirect(context.request);
  if (redirect) return redirect;
  const [data, raw] = await Promise.all([listPublicPhotos(context.env), listPhotos(context.env)]);
  const folders = data.folders;
  const photos = data.photos;
  const withLocation = raw.photos.filter((photo) => Number.isFinite(photo.location.latitude) && Number.isFinite(photo.location.longitude)).length;
  const focus = new URL(context.request.url).searchParams.get("photo") || "";
  const mapList = photos.map(photoCard).join("") || `<div class="empty-state">暂时没有公开图片。</div>`;
  const body = `<main class="panel" data-photo-map-page><div class="section-heading"><div><p class="eyebrow">Images / Live Metadata Index</p><h1>图片栏目</h1></div><p>${photos.length} 张公开照片；${withLocation} 张有可公开的位置范围。照片列表始终保留，地图按需加载。</p></div><div class="photo-view-switch" role="tablist" aria-label="照片视图"><button type="button" role="tab" aria-selected="true" data-photo-view="photos">照片</button><button type="button" role="tab" aria-selected="false" data-photo-view="map">地图</button></div><div data-photo-list-panel class="photo-list-panel"><div class="record-grid">${mapList}</div>${folderRows(folders)}</div><div data-photo-map-panel class="photo-map-panel" hidden><div class="photo-map-shell" data-photo-map-root data-endpoint="/api/images/map" data-focus="${escapeAttr(focus)}"><p class="photo-map-note">打开地图会从 OpenStreetMap 加载第三方地图数据；地图只使用按精度量化后的位置。<br><span class="system-text">${withLocation} 有位置 / ${photos.length - withLocation} 无位置 · 精度范围随每张照片显示</span></p><p class="photo-map-status" data-map-status role="status" aria-live="polite" hidden></p><button class="photo-map-reset" type="button" data-map-reset>复位视野</button><div class="photo-map-canvas" data-map-canvas role="application" aria-label="公开照片地图"></div></div><details class="photo-map-list"><summary>用键盘和列表浏览照片</summary><div class="record-grid">${mapList}</div></details></div></main>`;
  return htmlPage("图片栏目", body, 200, mapLoaderScript());
};
