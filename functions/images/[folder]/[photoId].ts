import { getPhoto, getPublicPhoto } from "../../_shared/content";
import { canonicalRedirect, escapeAttr, escapeHtml, formatDate, htmlPage, mapLoaderScript, metaRows } from "../../_shared/html";
import { param, type FunctionContext } from "../../_shared/responses";
import { isPublicId, isSlug } from "../../_shared/validators";

export const onRequestGet = async (context: FunctionContext) => {
  const redirect = canonicalRedirect(context.request);
  if (redirect) return redirect;
  const folder = param(context.params.folder);
  const photoId = param(context.params.photoId);
  if (!isSlug(folder) || !isPublicId(photoId)) return htmlPage("路径无效", `<main class="panel"><div class="section-heading"><h1>路径无效</h1><p>图片 folder 或 photoId 不符合公开路径规则。</p></div></main>`, 400);
  const photo = await getPhoto(context.env, folder, photoId);
  if (!photo) return htmlPage("没有找到图片", `<main class="panel"><div class="section-heading"><h1>没有找到图片</h1><p>这张图片不存在，或尚未公开。</p></div></main>`, 404);
  const publicPhoto = await getPublicPhoto(context.env, folder, photoId);
  if (!publicPhoto) return htmlPage("没有找到图片", `<main class="panel"><div class="section-heading"><h1>没有找到图片</h1><p>这张图片不存在，或尚未公开。</p></div></main>`, 404);
  const camera = publicPhoto.camera ? [publicPhoto.camera.make, publicPhoto.camera.model, publicPhoto.camera.lens].filter(Boolean).join(" / ") : "";
  const hasLocation = Number.isFinite(photo.location.latitude) && Number.isFinite(photo.location.longitude);
  const precisionText = publicPhoto.location.precision === "exact" ? "精确 · 约 1 m" : publicPhoto.location.precision === "approximate" ? "附近 · 约 1 km" : "城市级 · 约 10 km";
  const mapBlock = hasLocation ? `<section class="photo-map-shell detail" data-photo-detail-map data-photo-map-root data-endpoint="/api/images/map?photo=${encodeURIComponent(`${folder}/${photoId}`)}" data-focus="${escapeAttr(`${folder}/${photoId}`)}"><p class="photo-map-note">${escapeHtml(publicPhoto.location.label || "公开位置")} / ${escapeHtml(precisionText)}。地图会在你点击后从 OpenStreetMap 加载第三方地图数据。</p><button class="button secondary" type="button" data-map-load>加载地图</button><p class="photo-map-status" data-map-status role="status" aria-live="polite" hidden></p><button class="photo-map-reset" type="button" data-map-reset>复位视野</button><div class="photo-map-canvas" data-map-canvas role="application" aria-label="照片位置地图"></div><a class="button secondary" href="/images?view=map&amp;photo=${encodeURIComponent(`${folder}/${photoId}`)}">在全部照片地图中查看</a></section>` : "";
  return htmlPage(`${publicPhoto.title} - 图片`, `<main class="photo-detail"><section class="photo-main"><p class="eyebrow">Photo Record / ${escapeHtml(publicPhoto.folder)}/${escapeHtml(publicPhoto.id)}</p><h1>${escapeHtml(publicPhoto.title)}</h1><div class="photo-image"><img src="${escapeAttr(publicPhoto.imageUrl)}" alt="${escapeAttr(publicPhoto.alt || publicPhoto.title)}" onerror="this.onerror=null;this.src='/assets/media/photo-placeholder.svg'"></div><p class="photo-description">${escapeHtml(publicPhoto.description || "")}</p>${mapBlock}</section><aside class="sidecar"><h2>Photo metadata sidecar</h2>${metaRows([["Captured", formatDate(publicPhoto.capturedAt, true)], ["Location", publicPhoto.location.label], ["Precision", publicPhoto.location.precision], ["Folder", publicPhoto.folder], ["Camera", camera], ["ISO", publicPhoto.camera?.iso], ["Exposure", publicPhoto.camera ? `${publicPhoto.camera.aperture || ""} / ${publicPhoto.camera.shutter || ""}` : ""]])}</aside></main>`, 200, hasLocation ? mapLoaderScript() : "");
};
