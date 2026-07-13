import { getPhoto, toPublicPhoto } from "../../_shared/content";
import { canonicalRedirect, escapeAttr, escapeHtml, formatDate, htmlPage, metaRows } from "../../_shared/html";
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
  const publicPhoto = toPublicPhoto(photo);
  const camera = publicPhoto.camera ? [publicPhoto.camera.make, publicPhoto.camera.model, publicPhoto.camera.lens].filter(Boolean).join(" / ") : "";
  return htmlPage(`${publicPhoto.title} - 图片`, `<main class="photo-detail"><section class="photo-main"><p class="eyebrow">Photo Record / ${escapeHtml(publicPhoto.folder)}/${escapeHtml(publicPhoto.id)}</p><h1>${escapeHtml(publicPhoto.title)}</h1><div class="photo-image"><img src="${escapeAttr(publicPhoto.imageUrl)}" alt="${escapeAttr(publicPhoto.alt || publicPhoto.title)}"></div><p class="photo-description">${escapeHtml(publicPhoto.description || "")}</p></section><aside class="sidecar"><h2>Photo metadata sidecar</h2>${metaRows([["Captured", formatDate(publicPhoto.capturedAt, true)], ["Location", publicPhoto.location.label], ["Precision", publicPhoto.location.precision], ["Folder", publicPhoto.folder], ["Camera", camera], ["ISO", publicPhoto.camera?.iso], ["Exposure", publicPhoto.camera ? `${publicPhoto.camera.aperture || ""} / ${publicPhoto.camera.shutter || ""}` : ""]])}</aside></main>`);
};
