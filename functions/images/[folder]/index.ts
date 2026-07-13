import { listPhotos, toPublicPhoto } from "../../_shared/content";
import { canonicalRedirect, escapeAttr, escapeHtml, formatDate, htmlPage } from "../../_shared/html";
import { param, type FunctionContext } from "../../_shared/responses";
import { isSlug } from "../../_shared/validators";

export const onRequestGet = async (context: FunctionContext) => {
  const redirect = canonicalRedirect(context.request);
  if (redirect) return redirect;
  const folder = param(context.params.folder);
  if (!isSlug(folder)) return htmlPage("路径无效", `<main class="panel"><div class="section-heading"><h1>路径无效</h1><p>图片 folder 不符合公开路径规则。</p></div></main>`, 400);
  const data = await listPhotos(context.env);
  const record = data.folders.find((item) => item.slug === folder);
  if (!record) return htmlPage("没有找到分组", `<main class="panel"><div class="section-heading"><h1>没有找到分组</h1><p>这个图片分组不存在，或暂时没有公开图片。</p></div></main>`, 404);
  const photos = record.items.map(toPublicPhoto);
  return htmlPage(`${record.label} - 图片文件夹`, `<main class="panel"><div class="section-heading"><div><p class="eyebrow">/images/${escapeHtml(folder)}</p><h1>${escapeHtml(record.label)}</h1></div><p>${escapeHtml(record.description)}</p></div><div class="record-grid">${photos.map((photo) => `<a class="record-card" href="/images/${escapeAttr(photo.folder)}/${escapeAttr(photo.id)}"><div class="record-thumb"><img src="${escapeAttr(photo.thumbUrl || photo.imageUrl)}" alt="${escapeAttr(photo.alt || photo.title)}" loading="lazy"></div><div class="record-body"><div class="chips"><span class="chip">photo</span><span class="chip">${escapeHtml(formatDate(photo.capturedAt, true))}</span></div><h2>${escapeHtml(photo.title || photo.id)}</h2><p>${escapeHtml(photo.description || "")}</p></div></a>`).join("")}</div></main>`);
};
