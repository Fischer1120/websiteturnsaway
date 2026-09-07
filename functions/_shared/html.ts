export type SiteSection = "home" | "articles" | "images" | "admin";

export type Breadcrumb = {
  label: string;
  href?: string;
};

export type PublicPageOptions = {
  title: string;
  description: string;
  currentSection: SiteSection;
  breadcrumbs: Breadcrumb[];
  body: string;
  status?: number;
};

const siteSections: Array<{ id: SiteSection; href: string; label: string }> = [
  { id: "home", href: "/", label: "首页" },
  { id: "articles", href: "/articles", label: "文章" },
  { id: "images", href: "/images", label: "图片" },
  { id: "admin", href: "/admin", label: "管理入口" },
];

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

export function siteHeader(currentSection: SiteSection) {
  const links = siteSections
    .map((item) => {
      const current = item.id === currentSection ? ' aria-current="page"' : "";
      return `<a class="nav-link" href="${item.href}"${current}>${item.label}</a>`;
    })
    .join("");
  return `<header class="topbar"><a class="brand" href="/" aria-label="Website Turns Away 首页"><span class="brand-mark" aria-hidden="true"><span></span></span><span class="brand-copy"><strong>Website Turns Away</strong><small>Orbital Archive v2</small></span></a><nav class="primary-nav" aria-label="主导航">${links}</nav></header>`;
}

function breadcrumbItems(breadcrumbs: Breadcrumb[]) {
  return breadcrumbs
    .map((item, index) => {
      const current = index === breadcrumbs.length - 1;
      const label = escapeHtml(item.label);
      const content = !current && item.href
        ? `<a href="${escapeAttr(item.href)}">${label}</a>`
        : `<span${current ? ' aria-current="page"' : ""}>${label}</span>`;
      return `<li>${content}</li>`;
    })
    .join("");
}

function contextNavigation(section: SiteSection, breadcrumbs: Breadcrumb[]) {
  const sectionInfo = siteSections.find((item) => item.id === section) || siteSections[0];
  const items = breadcrumbItems(breadcrumbs.length ? breadcrumbs : [{ label: sectionInfo.label }]);
  const trail = `<nav class="context-trail" aria-label="当前位置"><p class="context-kicker">Archive context</p><ol>${items}</ol></nav>`;
  return `<aside class="context-rail" aria-label="当前栏目"><span class="context-index" aria-hidden="true">${String(siteSections.indexOf(sectionInfo)).padStart(2, "0")}</span><span class="context-section">${escapeHtml(sectionInfo.label)}</span>${trail}</aside><details class="context-disclosure"><summary><span>当前位置</span><strong>${escapeHtml(breadcrumbs.at(-1)?.label || sectionInfo.label)}</strong></summary>${trail}</details>`;
}

export function htmlPage(options: PublicPageOptions) {
  const {
    title,
    description,
    currentSection,
    breadcrumbs,
    body,
    status = 200,
  } = options;
  const documentTitle = title === "Website Turns Away"
    ? "Website Turns Away — Orbital Archive v2"
    : `${title} — Website Turns Away`;

  return new Response(`<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${escapeAttr(description)}">
    <meta name="referrer" content="strict-origin-when-cross-origin">
    <meta name="theme-color" content="#080A0D">
    <title>${escapeHtml(documentTitle)}</title>
    <link rel="stylesheet" href="/assets/site.css">
    <script src="/assets/site-ui.js" defer></script>
  </head>
  <body data-site-section="${currentSection}">
    <a class="skip-link" href="#main-content">跳到正文</a>
    <div class="site-frame">
      ${siteHeader(currentSection)}
      <div class="layout-grid">
        ${contextNavigation(currentSection, breadcrumbs)}
        ${body}
      </div>
      <footer class="footer"><span class="system-text">ORBITAL ARCHIVE v2</span><span>Cloudflare Pages Functions + R2 live content</span></footer>
    </div>
  </body>
</html>`, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.tile.openstreetmap.org; connect-src 'self' https://*.tile.openstreetmap.org; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
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
  return `<dl class="meta-list">${rows
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== "")
    .map(([label, value]) => `<div class="meta-row"><dt class="meta-label">${escapeHtml(label)}</dt><dd class="meta-value">${escapeHtml(value)}</dd></div>`)
    .join("")}</dl>`;
}
