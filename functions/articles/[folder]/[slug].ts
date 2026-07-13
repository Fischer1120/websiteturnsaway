import { getArticle, type ArticleRecord } from "../../_shared/content";
import { markdownToHtml as renderMarkdown } from "../../_shared/markdown";
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

function formatDate(value: string, withTime = false) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: withTime ? "short" : undefined,
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function metaRow(label: string, value: unknown) {
  if (value === undefined || value === null || String(value) === "") return "";
  return `<div class="meta-row"><span class="meta-label">${escapeHtml(label)}</span><span class="meta-value">${escapeHtml(value)}</span></div>`;
}

function tags(article: ArticleRecord) {
  if (!article.tags.length) return "";
  return `<div class="chips">${article.tags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("")}</div>`;
}

const pageCss = `
:root{--ink:#182434;--paper:#f4ecd9;--coral:#d96f57;--amber:#d6ad54;--mist:#96aaa4;--line:rgba(244,236,217,.2);color-scheme:dark;font-family:"Avenir Next","Segoe UI",Arial,sans-serif;background:var(--ink);color:var(--paper)}
*{box-sizing:border-box}body{min-width:320px;margin:0;background:linear-gradient(rgba(244,236,217,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(244,236,217,.03) 1px,transparent 1px),radial-gradient(circle at 76% 0%,rgba(217,111,87,.24),transparent 34rem),radial-gradient(circle at 10% 86%,rgba(150,170,164,.16),transparent 30rem),var(--ink);background-size:22px 22px,22px 22px,auto,auto,auto}a{color:inherit;text-decoration:none}img{display:block;max-width:100%}code,.article-path,.system-text,.meta-label{font-family:"Courier New",Courier,monospace}.site-frame{width:min(1440px,100%);margin:0 auto;padding:14px}.topbar{position:sticky;top:0;z-index:20;display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:10px;align-items:stretch;padding:10px;border:1px solid var(--line);background:rgba(24,36,52,.84);backdrop-filter:blur(14px)}.brand{display:flex;min-width:0;align-items:center;gap:10px;font-family:Georgia,"Times New Roman",serif;font-weight:700}.brand-mark{display:grid;flex:0 0 auto;width:34px;height:34px;place-items:center;border:2px solid var(--paper);background:var(--paper)}.brand-mark:before{width:18px;height:18px;content:"";border:2px solid var(--ink);border-radius:50%;background:linear-gradient(135deg,var(--amber),var(--coral) 58%,var(--mist))}.system-strip{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}.system-strip a{display:inline-flex;min-height:34px;align-items:center;justify-content:center;padding:0 12px;border:1px solid var(--line);background:rgba(244,236,217,.08);font-size:.78rem;font-weight:700}.reading-shell{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:14px;margin-top:14px}.article-prose,.sidecar{border:1px solid var(--line);background:rgba(244,236,217,.9);color:var(--ink)}.article-prose{min-height:calc(100vh - 150px);padding:clamp(22px,5vw,72px)}.article-path{margin:0 0 18px;color:var(--coral);font-size:.76rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}h1{max-width:960px;margin:0;font-family:Georgia,"Times New Roman",serif;font-size:clamp(3rem,8vw,8.4rem);line-height:.88;letter-spacing:0}.dek{max-width:780px;margin:22px 0 0;color:rgba(24,36,52,.72);font-size:clamp(1.02rem,1.7vw,1.28rem);line-height:1.75}.immersive-cover{margin:36px 0 10px}.immersive-cover img,.inline-figure img{width:100%;border:1px solid rgba(24,36,52,.42);object-fit:cover}.immersive-cover img{max-height:68vh;aspect-ratio:16/9}.article-body{max-width:74ch;margin-top:34px}.article-body h2,.article-body h3{margin:38px 0 12px;font-family:Georgia,"Times New Roman",serif}.article-body h2{font-size:clamp(1.8rem,3.4vw,3rem)}.article-body h3{font-size:clamp(1.36rem,2.3vw,2rem)}.article-body p{margin:0 0 20px;color:rgba(24,36,52,.82);font-size:1.04rem;line-height:1.95}.inline-figure{margin:34px 0}.inline-figure figcaption{margin-top:10px;color:rgba(24,36,52,.62);font-size:.92rem;line-height:1.7}.sidecar{position:sticky;top:78px;align-self:start;padding:16px}.sidecar h2{margin:0 0 16px;font-family:Georgia,"Times New Roman",serif;font-size:1.35rem}.chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 16px}.chip{display:inline-flex;min-height:24px;align-items:center;padding:0 8px;border:1px solid rgba(24,36,52,.28);background:rgba(244,236,217,.74);font-family:"Courier New",Courier,monospace;font-size:.72rem;font-weight:700;text-transform:uppercase}.meta-list{display:grid;gap:8px}.meta-row{display:grid;grid-template-columns:96px minmax(0,1fr);gap:10px;padding:10px 0;border-top:1px solid rgba(24,36,52,.24)}.meta-label{color:var(--coral);font-size:.72rem;font-weight:700;text-transform:uppercase}.meta-value{overflow-wrap:anywhere;color:rgba(24,36,52,.74);line-height:1.55}.footer{margin-top:14px;padding:18px;border:1px solid var(--line);color:rgba(244,236,217,.64)}@media(max-width:980px){.reading-shell,.topbar{grid-template-columns:1fr}.sidecar{position:static}}@media(max-width:680px){.site-frame{padding:8px}.article-prose{padding:22px 16px}h1{font-size:clamp(2.8rem,16vw,4.8rem)}.meta-row{grid-template-columns:1fr}}
`;

function articlePage(article: ArticleRecord) {
  const cover = article.coverImage ? `<figure class="article-cover immersive-cover"><img src="${escapeAttr(article.coverImage)}" alt="${escapeAttr(article.title)}" loading="eager"></figure>` : "";
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="description" content="${escapeAttr(article.summary || article.subtitle || article.title)}"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(article.title)} - Website Turns Away</title><style>${pageCss}</style></head><body><div class="site-frame"><header class="topbar" aria-label="主导航"><a class="brand" href="/" aria-label="Website Turns Away 首页"><span class="brand-mark" aria-hidden="true"></span><span>Website Turns Away</span></a><nav class="system-strip"><a href="/">首页</a><a href="/articles">文章</a><a href="/images">图片</a><a href="/admin">管理入口</a></nav></header><main class="reading-shell"><article class="article-prose"><p class="article-path">Article Record / ${escapeHtml(article.folder)}/${escapeHtml(article.slug)}</p><h1>${escapeHtml(article.title)}</h1>${article.subtitle ? `<p class="dek">${escapeHtml(article.subtitle)}</p>` : ""}${article.summary ? `<p class="dek">${escapeHtml(article.summary)}</p>` : ""}${cover}<div class="article-body">${renderMarkdown(article.markdown)}</div></article><aside class="sidecar"><h2>Reading sidecar</h2>${tags(article)}<div class="meta-list">${metaRow("Folder", article.folder)}${metaRow("Slug", article.slug)}${metaRow("Published", formatDate(article.publishedAt, true))}${metaRow("Updated", formatDate(article.updatedAt, true))}${metaRow("Status", article.status)}</div></aside></main><footer class="footer system-text">ORBITAL MONOLITH INDEX / CLOUDFLARE PAGES FUNCTIONS + R2 LIVE ARTICLE</footer></div></body></html>`;
}

function errorPage(status: number, title: string, message: string) {
  return new Response(`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(title)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#182434;color:#f4ecd9;font-family:"Avenir Next","Segoe UI",Arial,sans-serif}.panel{width:min(760px,calc(100% - 28px));border:1px solid rgba(244,236,217,.22);padding:32px;background:rgba(244,236,217,.06)}p{color:rgba(244,236,217,.72);line-height:1.7}.eyebrow{color:#d96f57;font-family:"Courier New",Courier,monospace;font-size:.76rem;font-weight:700;text-transform:uppercase}h1{margin:0;font-family:Georgia,"Times New Roman",serif;font-size:clamp(2.6rem,8vw,6rem);line-height:.9}a{color:inherit}</style></head><body><main class="panel"><p class="eyebrow">Article Error</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a href="/articles">返回文章栏目</a></main></body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export const onRequestGet = async (context: FunctionContext) => {
  const redirect = canonicalRedirect(context.request);
  if (redirect) return redirect;
  const folder = param(context.params.folder);
  const slug = param(context.params.slug);
  if (!isSlug(folder) || !isSlug(slug)) {
    return errorPage(400, "路径无效", "文章 folder 或 slug 不符合公开路径规则。");
  }

  const article = await getArticle(context.env, folder, slug);
  if (!article) {
    return errorPage(404, "没有找到文章", "这篇文章不存在，或尚未发布。");
  }

  return new Response(articlePage(article), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
