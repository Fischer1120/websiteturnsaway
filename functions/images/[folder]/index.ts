import { listPublicPhotos } from "../../_shared/content";
import { canonicalRedirect, escapeAttr, escapeHtml, formatDate, htmlPage } from "../../_shared/html";
import { param, type FunctionContext } from "../../_shared/responses";
import { isSlug } from "../../_shared/validators";

function errorPage(status: number, title: string, message: string, folder?: string) {
  return htmlPage({
    title,
    description: message,
    currentSection: "images",
    breadcrumbs: [{ label: "首页", href: "/" }, { label: "图片", href: "/images" }, { label: folder || title }],
    body: `<main id="main-content" class="content-stack" tabindex="-1"><section class="panel error-panel" role="alert"><p class="eyebrow">Image Folder Error / ${status}</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a class="button secondary" href="/images">返回图片栏目</a></section></main>`,
    status,
  });
}

export const onRequestGet = async (context: FunctionContext) => {
  const redirect = canonicalRedirect(context.request);
  if (redirect) return redirect;

  const folder = param(context.params.folder);
  if (!isSlug(folder)) {
    return errorPage(400, "路径无效", "图片 folder 不符合公开路径规则。");
  }

  const data = await listPublicPhotos(context.env);
  const record = data.folders.find((item) => item.slug === folder);
  if (!record) {
    return errorPage(404, "没有找到分组", "这个图片分组不存在，或暂时没有公开图片。", folder);
  }

  const cards = record.items.map((photo) => `<a class="record-card" href="/images/${escapeAttr(photo.folder)}/${escapeAttr(photo.id)}"><span class="record-thumb"><img src="${escapeAttr(photo.thumbUrl || photo.imageUrl)}" alt="" loading="lazy" data-fallback-src="/assets/media/photo-placeholder.svg"></span><span class="record-body"><span class="chips"><span class="chip">photo</span><span class="chip">${escapeHtml(formatDate(photo.capturedAt, true))}</span></span><strong class="record-title">${escapeHtml(photo.title || photo.id)}</strong><span class="record-summary">${escapeHtml(photo.description || "")}</span><span class="record-meta system-text">${escapeHtml(photo.location.label)}</span></span></a>`).join("");
  const body = `<main id="main-content" class="content-stack" tabindex="-1"><section class="panel dark"><div class="section-heading"><div><p class="eyebrow">Image Folder / ${escapeHtml(folder)}</p><h1>${escapeHtml(record.label)}</h1></div><p>${escapeHtml(record.description)}</p></div><div class="record-grid">${cards}</div></section></main>`;
  return htmlPage({
    title: `${record.label} - 图片文件夹`,
    description: record.description,
    currentSection: "images",
    breadcrumbs: [{ label: "首页", href: "/" }, { label: "图片", href: "/images" }, { label: record.label }],
    body,
  });
};
