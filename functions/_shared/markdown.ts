import MarkdownIt from "markdown-it";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

function safeUrl(value: string) {
  const trimmed = value.trim();
  if (/[\u0000-\u0020\u007f\\]/.test(trimmed)) return "#";
  if (trimmed.startsWith("#") || (trimmed.startsWith("/") && !trimmed.startsWith("//"))) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.hostname && !url.username && !url.password) return trimmed;
    } catch { /* Invalid destinations render as inert anchors. */ }
  }
  return "#";
}

// Both the public article and the editor preview use this renderer. Raw HTML
// stays text; URLs are checked again after Markdown has decoded entities.
const parser = new MarkdownIt({ html: false, linkify: false, typographer: false });
parser.validateLink = () => true;
// The visual editor serializes line breaks inside Markdown table cells as pure
// <br>. Accept only this inert tag; all other raw HTML remains escaped.
parser.inline.ruler.before("text", "editor_line_break", (state, silent) => {
  const match = /^<br\s*\/?>/i.exec(state.src.slice(state.pos));
  if (!match) return false;
  if (!silent) state.push("hardbreak", "br", 0);
  state.pos += match[0].length;
  return true;
});
const originalLinkOpen = parser.renderer.rules.link_open;
parser.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  token.attrSet("href", safeUrl(String(token.attrGet("href") || "")));
  return originalLinkOpen ? originalLinkOpen(tokens, index, options, env, renderer) : renderer.renderToken(tokens, index, options);
};
parser.renderer.rules.image = (tokens, index, _options, _env, renderer) => {
  const token = tokens[index];
  const alt = renderer.renderInlineAsText(token.children || [], _options, _env);
  const source = safeUrl(String(token.attrGet("src") || ""));
  const title = token.attrGet("title");
  const image = `<img src="${escapeHtml(source)}" alt="${escapeHtml(alt)}"${title ? ` title="${escapeHtml(title)}"` : ""} loading="lazy">`;
  return image + (token.meta?.standalone ? `<figcaption>${escapeHtml(title || alt)}</figcaption>` : "");
};

export function markdownToHtml(markdown: string) {
  const tokens = parser.parse(String(markdown || ""), {});
  // The archive already renders the article title above the body. Preserve H1
  // in stored Markdown while avoiding a repeated title on the public page.
  const visible = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "heading_open" && token.tag === "h1") {
      while (index < tokens.length && tokens[index].type !== "heading_close") index += 1;
      continue;
    }
    if (token.type === "paragraph_open" && tokens[index + 1]?.type === "inline" && tokens[index + 2]?.type === "paragraph_close") {
      const children = tokens[index + 1].children || [];
      if (children.length === 1 && children[0].type === "image") {
        token.tag = "figure";
        token.attrSet("class", "inline-figure");
        tokens[index + 2].tag = "figure";
        children[0].meta = { standalone: true };
      }
    }
    visible.push(token);
  }
  return parser.renderer.render(visible, parser.options, {});
}

export function getHeadings(markdown: string) {
  const tokens = parser.parse(String(markdown || ""), {});
  return tokens.flatMap((token, index) => token.type === "heading_open" && /^h[2-6]$/.test(token.tag) ? [tokens[index + 1]?.content || ""] : []);
}
