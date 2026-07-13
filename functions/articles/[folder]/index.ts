import { listArticles, toPublicArticle, type PublicArticleRecord } from "../../_shared/content";
import { canonicalRedirect } from "../../_shared/html";
import { param, type FunctionContext } from "../../_shared/responses";
import { isSlug } from "../../_shared/validators";

function escapeHtml(value: unknown) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value: unknown) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function formatDate(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function articleCard(article: PublicArticleRecord) {
  const image = article.coverImage
    ? `<div class="record-thumb"><img src="${escapeAttr(article.coverImage)}" alt="${escapeAttr(article.title)}" loading="lazy"></div>`
    : `<div class="record-thumb empty"></div>`;
  return `<a class="record-card" href="/articles/${escapeAttr(article.folder)}/${escapeAttr(article.slug)}">${image}<div class="record-body"><div class="chips"><span class="chip">${escapeHtml(article.folder)}</span><span class="chip">${escapeHtml(article.status)}</span></div><h2>${escapeHtml(article.title || article.slug)}</h2>${article.subtitle ? `<p class="subtitle">${escapeHtml(article.subtitle)}</p>` : ""}${article.summary ? `<p>${escapeHtml(article.summary)}</p>` : ""}<p class="system-text">${escapeHtml(formatDate(article.publishedAt))}</p></div></a>`;
}

const pageCss = `
:root{--ink:#182434;--paper:#f4ecd9;--coral:#d96f57;--amber:#d6ad54;--mist:#96aaa4;--line:rgba(244,236,217,.22);color-scheme:dark;font-family:"Avenir Next","Segoe UI",Arial,sans-serif;background:var(--ink);color:var(--paper)}
*{box-sizing:border-box}body{min-width:320px;margin:0;background:linear-gradient(rgba(244,236,217,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(244,236,217,.03) 1px,transparent 1px),radial-gradient(circle at 78% 0%,rgba(217,111,87,.22),transparent 34rem),var(--ink);background-size:22px 22px,22px 22px,auto,auto}a{color:inherit;text-decoration:none}img{display:block;max-width:100%}.site-frame{width:min(1280px,100%);margin:0 auto;padding:14px}.topbar{position:sticky;top:0;z-index:20;display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:10px;align-items:stretch;padding:10px;border:1px solid var(--line);background:rgba(24,36,52,.84);backdrop-filter:blur(14px)}.brand{display:flex;align-items:center;gap:10px;font-family:Georgia,"Times New Roman",serif;font-weight:700}.brand-mark{display:grid;width:34px;height:34px;place-items:center;border:2px solid var(--paper);background:var(--paper)}.brand-mark:before{width:18px;height:18px;content:"";border:2px solid var(--ink);border-radius:50%;background:linear-gradient(135deg,var(--amber),var(--coral) 58%,var(--mist))}.system-strip{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}.system-strip a{display:inline-flex;min-height:34px;align-items:center;justify-content:center;padding:0 12px;border:1px solid var(--line);background:rgba(244,236,217,.08);font-size:.78rem;font-weight:700}.panel{margin-top:14px;border:1px solid var(--line);background:rgba(244,236,217,.06)}.section-heading{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:end;padding:18px;border-bottom:1px solid var(--line)}.eyebrow,.system-text{font-family:"Courier New",Courier,monospace}.eyebrow{margin:0 0 10px;color:var(--coral);font-size:.76rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}h1{margin:0;font-family:Georgia,"Times New Roman",serif;font-size:clamp(2.8rem,8vw,7rem);line-height:.9}.section-heading p{max-width:34rem;margin:0;color:rgba(244,236,217,.72);line-height:1.65}.record-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:18px}.record-card{display:grid;grid-template-columns:150px minmax(0,1fr);min-height:170px;border:1px solid var(--line);background:rgba(244,236,217,.9);color:var(--ink)}.record-thumb{min-height:170px;background:rgba(24,36,52,.14)}.record-thumb img{width:100%;height:100%;object-fit:cover}.record-body{padding:16px}.record-body h2{margin:10px 0;font-family:Georgia,"Times New Roman",serif;font-size:clamp(1.45rem,2.8vw,2.2rem);line-height:1.02}.record-body p{margin:0 0 10px;color:rgba(24,36,52,.72);line-height:1.65}.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{display:inline-flex;min-height:24px;align-items:center;padding:0 8px;border:1px solid rgba(24,36,52,.28);background:rgba(244,236,217,.74);font-family:"Courier New",Courier,monospace;font-size:.72rem;font-weight:700;text-transform:uppercase}.footer{margin-top:14px;padding:18px;border:1px solid var(--line);color:rgba(244,236,217,.64)}@media(max-width:860px){.topbar,.section-heading,.record-card{grid-template-columns:1fr}.record-grid{grid-template-columns:1fr}}
`;

function page(folder: string, articles: PublicArticleRecord[], label: string, description: string) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(label)} - 文章文件夹</title><style>${pageCss}</style></head><body><div class="site-frame"><header class="topbar" aria-label="主导航"><a class="brand" href="/" aria-label="Website Turns Away 首页"><span class="brand-mark" aria-hidden="true"></span><span>Website Turns Away</span></a><nav class="system-strip"><a href="/">首页</a><a href="/articles">文章</a><a href="/images">图片</a><a href="/admin">管理入口</a></nav></header><main class="panel"><div class="section-heading"><div><p class="eyebrow">Article Folder / ${escapeHtml(folder)}</p><h1>${escapeHtml(label)}</h1></div><p>${escapeHtml(description)}</p></div><div class="record-grid">${articles.map(articleCard).join("")}</div></main><footer class="footer system-text">ORBITAL MONOLITH INDEX / CLOUDFLARE PAGES FUNCTIONS + R2 LIVE FOLDER</footer></div></body></html>`;
}

function errorPage(status: number, title: string, message: string) {
  return new Response(`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(title)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#182434;color:#f4ecd9;font-family:"Avenir Next","Segoe UI",Arial,sans-serif}.panel{width:min(760px,calc(100% - 28px));border:1px solid rgba(244,236,217,.22);padding:32px;background:rgba(244,236,217,.06)}p{color:rgba(244,236,217,.72);line-height:1.7}.eyebrow{color:#d96f57;font-family:"Courier New",Courier,monospace;font-size:.76rem;font-weight:700;text-transform:uppercase}h1{margin:0;font-family:Georgia,"Times New Roman",serif;font-size:clamp(2.6rem,8vw,6rem);line-height:.9}a{color:inherit}</style></head><body><main class="panel"><p class="eyebrow">Article Folder Error</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a href="/articles">返回文章栏目</a></main></body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export const onRequestGet = async (context: FunctionContext) => {
  const redirect = canonicalRedirect(context.request);
  if (redirect) return redirect;
  const folder = param(context.params.folder);
  if (!isSlug(folder)) {
    return errorPage(400, "路径无效", "文章 folder 不符合公开路径规则。");
  }

  const data = await listArticles(context.env);
  const folderRecord = data.folders.find((item) => item.slug === folder);
  const articles = data.articles.filter((article) => article.folder === folder);
  if (!folderRecord || articles.length === 0) {
    return errorPage(404, "没有找到分组", "这个文章分组不存在，或暂时没有公开文章。");
  }

  return new Response(page(folder, articles.map((article) => toPublicArticle(article)), folderRecord.label, folderRecord.description), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
