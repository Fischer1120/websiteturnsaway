import { listPhotos, toPublicImageFolders, toPublicPhoto } from "../_shared/content";
import { canonicalRedirect, escapeAttr, escapeHtml, formatDate, htmlPage } from "../_shared/html";
import type { FunctionContext } from "../_shared/responses";

function photoCard(photo: ReturnType<typeof toPublicPhoto>) {
  return `<a class="record-card" href="/images/${escapeAttr(photo.folder)}/${escapeAttr(photo.id)}"><div class="record-thumb"><img src="${escapeAttr(photo.thumbUrl || photo.imageUrl)}" alt="${escapeAttr(photo.alt || photo.title)}" loading="lazy"></div><div class="record-body"><div class="chips"><span class="chip">photo</span><span class="chip">${escapeHtml(photo.folder)}</span></div><h2>${escapeHtml(photo.title || photo.id)}</h2><p>${escapeHtml(photo.description || "")}</p><p class="system-text">${escapeHtml(formatDate(photo.capturedAt, true))} / ${escapeHtml(photo.location.label)}</p></div></a>`;
}

function folderRows(folders: ReturnType<typeof toPublicImageFolders>) {
  return `<div class="folder-grid">${folders.map((folder) => `<a class="folder-row" href="/images/${escapeAttr(folder.slug)}"><span class="path">/images/${escapeHtml(folder.slug)}</span><span><strong>${escapeHtml(folder.label)}</strong><p>${escapeHtml(folder.description)}</p></span><span class="count">${folder.count} records</span></a>`).join("")}</div>`;
}

export const onRequestGet = async (context: FunctionContext) => {
  const redirect = canonicalRedirect(context.request);
  if (redirect) return redirect;
  const data = await listPhotos(context.env);
  const folders = toPublicImageFolders(data.folders);
  const photos = data.photos.map(toPublicPhoto);
  return htmlPage("图片栏目", `<main class="panel"><div class="section-heading"><div><p class="eyebrow">Images / Live Metadata Index</p><h1>图片栏目</h1></div><p>图片列表由运行时公开索引生成；页面不依赖 JavaScript 才能阅读。</p></div><div class="record-grid">${photos.map(photoCard).join("")}</div>${folderRows(folders)}</main>`);
};
