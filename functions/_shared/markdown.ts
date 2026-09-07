function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeUrl(value: string) {
  const trimmed = value.trim();
  if ((trimmed.startsWith("/") && !trimmed.startsWith("//")) || /^https?:\/\//i.test(trimmed)) return trimmed;
  return "#";
}

function inlineMarkdown(value: string) {
  let html = escapeHtml(value);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/!\[([^\]]*)\]\(([^\s)]+)(?:\s+\"([^\"]*)\")?\)/g, (_match, alt, url, title) => {
    const caption = title || alt;
    return `<img src="${escapeHtml(safeUrl(url))}" alt="${escapeHtml(alt)}" loading="lazy">${caption ? `<span class="image-caption">${escapeHtml(caption)}</span>` : ""}`;
  });
  html = html.replace(/\[([^\]]+)\]\(([^\s)]+)(?:\s+\"([^\"]*)\")?\)/g, (_match, label, url, title) => {
    const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
    return `<a href="${escapeHtml(safeUrl(url))}"${titleAttr}>${label}</a>`;
  });
  return html;
}

export function markdownToHtml(markdown: string) {
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: "ul" | "ol" | undefined;
  let code: string[] | undefined;

  const closeList = () => {
    if (!list) return;
    html.push(`</${list}>`);
    list = undefined;
  };
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${inlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  for (const rawLine of String(markdown || "").split("\n")) {
    const line = rawLine.trimEnd();
    if (code) {
      if (line.trim() === "```") {
        html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        code = undefined;
      } else {
        code.push(line);
      }
      continue;
    }
    if (line.trim().startsWith("```")) {
      flushParagraph();
      closeList();
      code = [];
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = Number(heading[1].length);
      if (level > 1) html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      closeList();
      html.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }
    const ordered = line.match(/^\d+\.\s+(.+)$/);
    const unordered = line.match(/^[-*+]\s+(.+)$/);
    if (ordered || unordered) {
      flushParagraph();
      const nextList = ordered ? "ol" : "ul";
      if (list !== nextList) {
        closeList();
        html.push(`<${nextList}>`);
        list = nextList;
      }
      html.push(`<li>${inlineMarkdown((ordered || unordered)?.[1] || "")}</li>`);
      continue;
    }
    closeList();
    const imageOnly = line.match(/^!\[([^\]]*)\]\(([^\s)]+)(?:\s+\"([^\"]*)\")?\)$/);
    if (imageOnly) {
      flushParagraph();
      const caption = imageOnly[3] || imageOnly[1];
      html.push(`<figure class="inline-figure"><img src="${escapeHtml(safeUrl(imageOnly[2]))}" alt="${escapeHtml(imageOnly[1])}" loading="lazy"><figcaption>${escapeHtml(caption)}</figcaption></figure>`);
      continue;
    }
    paragraph.push(line.trim());
  }
  if (code) html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
  flushParagraph();
  closeList();
  return html.join("\n");
}

export function getHeadings(markdown: string) {
  return String(markdown || "")
    .split("\n")
    .filter((line) => /^#{2,3}\s+/.test(line))
    .map((line) => line.replace(/^#{2,3}\s+/, "").trim());
}
