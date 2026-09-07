import { getPhoto, getPublicPhoto } from "../../_shared/content";
import { canonicalRedirect, escapeAttr, escapeHtml, formatDate, htmlPage, metaRows } from "../../_shared/html";
import { param, type FunctionContext } from "../../_shared/responses";
import { isPublicId, isSlug } from "../../_shared/validators";

function errorPage(status: number, title: string, message: string) {
  return htmlPage({
    title,
    description: message,
    currentSection: "images",
    breadcrumbs: [{ label: "首页", href: "/" }, { label: "图片", href: "/images" }, { label: title }],
    body: `<main id="main-content" class="content-stack" tabindex="-1"><section class="panel error-panel" role="alert"><p class="eyebrow">Image Error / ${status}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a class="button secondary" href="/images">返回图片栏目</a></section></main>`,
    status,
  });
}

export const onRequestGet = async (context: FunctionContext) => {
  const redirect = canonicalRedirect(context.request);
  if (redirect) return redirect;

  const folder = param(context.params.folder);
  const photoId = param(context.params.photoId);
  if (!isSlug(folder) || !isPublicId(photoId)) {
    return errorPage(400, "路径无效", "图片 folder 或 photoId 不符合公开路径规则。");
  }

  const photo = await getPhoto(context.env, folder, photoId);
  if (!photo) {
    return errorPage(404, "没有找到图片", "这张图片不存在，或尚未公开。");
  }
  const publicPhoto = await getPublicPhoto(context.env, folder, photoId);
  if (!publicPhoto) {
    return errorPage(404, "没有找到图片", "这张图片不存在，或尚未公开。");
  }

  const camera = publicPhoto.camera
    ? [publicPhoto.camera.make, publicPhoto.camera.model, publicPhoto.camera.lens].filter(Boolean).join(" / ")
    : "";
  const hasLocation = Number.isFinite(photo.location.latitude) && Number.isFinite(photo.location.longitude);
  const precisionText = publicPhoto.location.precision === "exact"
    ? "精确 · 约 1 m"
    : publicPhoto.location.precision === "approximate"
      ? "附近 · 约 1 km"
      : "城市级 · 约 10 km";
  const focusId = `${folder}/${photoId}`;
  const mapBlock = hasLocation
    ? `<section class="photo-map-shell detail" aria-labelledby="photo-location-title" data-photo-detail-map data-photo-map-root data-endpoint="/api/images/map?photo=${encodeURIComponent(focusId)}" data-focus="${escapeAttr(focusId)}">
        <div class="photo-map-intro"><p class="eyebrow" id="photo-location-title">Public location</p><p class="photo-map-note">${escapeHtml(publicPhoto.location.label || "公开位置")} / ${escapeHtml(precisionText)}。点击后才会从 OpenStreetMap 加载第三方地图数据。</p></div>
        <button class="button secondary" type="button" data-map-load>加载地图</button>
        <div class="photo-map-feedback"><p class="photo-map-status" data-map-status role="status" aria-live="polite" hidden></p><div class="photo-map-error-actions"><button class="button secondary" type="button" data-map-retry hidden>重试加载</button><a class="button quiet" href="/images" data-map-return hidden>返回照片列表</a></div></div>
        <button class="photo-map-reset button quiet" type="button" data-map-reset hidden disabled>复位视野</button>
        <div class="photo-map-canvas" data-map-canvas role="region" aria-label="照片位置地图" hidden></div>
        <a class="text-link" href="/images?view=map&amp;photo=${encodeURIComponent(focusId)}">在全部照片地图中查看</a>
      </section>`
    : "";
  const body = `<main id="main-content" class="photo-detail" tabindex="-1">
    <section class="photo-main" aria-labelledby="photo-title">
      <p class="eyebrow">Photo Record / ${escapeHtml(publicPhoto.folder)}/${escapeHtml(publicPhoto.id)}</p>
      <h1 id="photo-title">${escapeHtml(publicPhoto.title)}</h1>
      <figure class="photo-image"><img src="${escapeAttr(publicPhoto.imageUrl)}" alt="${escapeAttr(publicPhoto.alt || publicPhoto.title)}" loading="eager" data-fallback-src="/assets/media/photo-placeholder.svg"></figure>
      ${publicPhoto.description ? `<p class="photo-description">${escapeHtml(publicPhoto.description)}</p>` : ""}
      ${mapBlock}
    </section>
    <aside class="sidecar" aria-labelledby="photo-sidecar-title"><h2 id="photo-sidecar-title">图片信息</h2>${metaRows([
      ["Captured", formatDate(publicPhoto.capturedAt, true)],
      ["Location", publicPhoto.location.label],
      ["Precision", publicPhoto.location.precision],
      ["Folder", publicPhoto.folder],
      ["Camera", camera],
      ["ISO", publicPhoto.camera?.iso],
      ["Exposure", publicPhoto.camera ? `${publicPhoto.camera.aperture || ""} / ${publicPhoto.camera.shutter || ""}` : ""],
    ])}</aside>
  </main>`;

  return htmlPage({
    title: publicPhoto.title,
    description: publicPhoto.description || publicPhoto.alt || publicPhoto.title,
    currentSection: "images",
    breadcrumbs: [
      { label: "首页", href: "/" },
      { label: "图片", href: "/images" },
      { label: publicPhoto.folder, href: `/images/${publicPhoto.folder}` },
      { label: publicPhoto.title },
    ],
    body,
  });
};
