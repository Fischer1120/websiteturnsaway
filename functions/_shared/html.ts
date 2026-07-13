export function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeAttr(value: unknown) {
  return escapeHtml(value);
}

export function formatDate(value: string, withTime = false) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: withTime ? "short" : undefined,
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

export const publicPageCss = `
:root{--ink:#182434;--paper:#f4ecd9;--coral:#d96f57;--amber:#d6ad54;--mist:#96aaa4;--line:rgba(244,236,217,.22);font-family:"Avenir Next","Segoe UI",Arial,sans-serif;color:var(--paper);background:var(--ink)}
*{box-sizing:border-box}body{min-width:320px;margin:0;background:linear-gradient(rgba(244,236,217,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(244,236,217,.03) 1px,transparent 1px),radial-gradient(circle at 78% 0%,rgba(217,111,87,.22),transparent 34rem),var(--ink);background-size:22px 22px,22px 22px,auto,auto}a{color:inherit;text-decoration:none}img{display:block;max-width:100%}.site-frame{width:min(1280px,100%);margin:0 auto;padding:14px}.topbar{position:sticky;top:0;z-index:20;display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:10px;align-items:stretch;padding:10px;border:1px solid var(--line);background:rgba(24,36,52,.9);backdrop-filter:blur(14px)}.brand{display:flex;align-items:center;gap:10px;font-family:Georgia,"Times New Roman",serif;font-weight:700}.brand-mark{display:grid;width:34px;height:34px;place-items:center;border:2px solid var(--paper);background:var(--paper)}.brand-mark:before{width:18px;height:18px;content:"";border:2px solid var(--ink);border-radius:50%;background:linear-gradient(135deg,var(--amber),var(--coral) 58%,var(--mist))}.system-strip{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}.system-strip a{display:inline-flex;min-height:34px;align-items:center;justify-content:center;padding:0 12px;border:1px solid var(--line);background:rgba(244,236,217,.08);font-size:.78rem;font-weight:700}.panel{margin-top:14px;border:1px solid var(--line);background:rgba(244,236,217,.06)}.section-heading{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:end;padding:18px;border-bottom:1px solid var(--line)}.section-heading p{max-width:34rem;margin:0;color:rgba(244,236,217,.72);line-height:1.65}.eyebrow,.system-text{font-family:"Courier New",Courier,monospace}.eyebrow{margin:0 0 10px;color:var(--coral);font-size:.76rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase}h1{margin:0;font-family:Georgia,"Times New Roman",serif;font-size:clamp(2.8rem,8vw,7rem);line-height:.9}.record-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:18px}.record-card{display:grid;grid-template-columns:150px minmax(0,1fr);min-height:170px;border:1px solid var(--line);background:rgba(244,236,217,.9);color:var(--ink)}.record-thumb{min-height:170px;background:rgba(24,36,52,.14)}.record-thumb img{width:100%;height:100%;object-fit:cover}.record-body{padding:16px}.record-body h2{margin:10px 0;font-family:Georgia,"Times New Roman",serif;font-size:clamp(1.45rem,2.8vw,2.2rem);line-height:1.02}.record-body p{margin:0 0 10px;color:rgba(24,36,52,.72);line-height:1.65}.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{display:inline-flex;min-height:24px;align-items:center;padding:0 8px;border:1px solid rgba(24,36,52,.28);background:rgba(244,236,217,.74);font-family:"Courier New",Courier,monospace;font-size:.72rem;font-weight:700;text-transform:uppercase}.sidecar{padding:18px;border-left:1px solid var(--line);background:rgba(244,236,217,.9);color:var(--ink)}.photo-detail{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:14px;padding:18px}.photo-main{padding:18px;background:rgba(244,236,217,.9);color:var(--ink)}.photo-main h1{font-size:clamp(2.4rem,7vw,6rem)}.photo-image{margin-top:24px}.photo-image img{width:100%;max-height:72vh;object-fit:contain;background:rgba(24,36,52,.12)}.photo-description{color:rgba(24,36,52,.72);line-height:1.75}.meta-list{display:grid;gap:8px}.meta-row{display:grid;grid-template-columns:96px minmax(0,1fr);gap:10px;padding:10px 0;border-top:1px solid rgba(24,36,52,.24)}.meta-label{color:var(--coral);font-family:"Courier New",Courier,monospace;font-size:.72rem;font-weight:700;text-transform:uppercase}.meta-value{overflow-wrap:anywhere;color:rgba(24,36,52,.74);line-height:1.55}.folder-grid{display:grid;gap:8px;padding:18px}.folder-row{display:grid;grid-template-columns:minmax(140px,.35fr) minmax(0,1fr) auto;gap:12px;align-items:center;padding:14px;border:1px solid var(--line);background:rgba(244,236,217,.08)}.folder-row p{margin:4px 0 0;color:rgba(244,236,217,.7)}.folder-row .path,.count{font-family:"Courier New",Courier,monospace;font-size:.76rem}.footer{margin-top:14px;padding:18px;border:1px solid var(--line);color:rgba(244,236,217,.64)}@media(max-width:860px){.topbar,.section-heading,.photo-detail{grid-template-columns:1fr}.record-grid{grid-template-columns:1fr}.sidecar{border-left:0;border-top:1px solid var(--line)}}@media(max-width:560px){.site-frame{padding:8px}.record-card,.folder-row{grid-template-columns:1fr}.record-thumb{min-height:180px}}
`;

export function siteHeader() {
  return `<header class="topbar" aria-label="主导航"><a class="brand" href="/" aria-label="Website Turns Away 首页"><span class="brand-mark" aria-hidden="true"></span><span>Website Turns Away</span></a><nav class="system-strip"><a href="/">首页</a><a href="/articles">文章</a><a href="/images">图片</a><a href="/admin">管理入口</a></nav></header>`;
}

export function htmlPage(title: string, body: string, status = 200) {
  return new Response(`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="description" content="${escapeAttr(title)}"><title>${escapeHtml(title)} - Website Turns Away</title><style>${publicPageCss}</style></head><body><div class="site-frame">${siteHeader()}${body}<footer class="footer system-text">ORBITAL MONOLITH INDEX / CLOUDFLARE PAGES FUNCTIONS + R2 LIVE CONTENT</footer></div></body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export function canonicalRedirect(request: Request) {
  const url = new URL(request.url);
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
    return Response.redirect(url, 308);
  }
  return undefined;
}

export function metaRows(rows: Array<[string, unknown]>) {
  return `<div class="meta-list">${rows.filter(([, value]) => value !== undefined && value !== null && String(value) !== "").map(([label, value]) => `<div class="meta-row"><span class="meta-label">${escapeHtml(label)}</span><span class="meta-value">${escapeHtml(value)}</span></div>`).join("")}</div>`;
}
