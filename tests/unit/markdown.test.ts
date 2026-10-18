import { describe, expect, it } from "vitest";
import { getHeadings, markdownToHtml } from "../../functions/_shared/markdown";

describe("shared article Markdown renderer", () => {
  it("renders visual editor formatting including nested lists and tables", () => {
    const html = markdownToHtml("## A heading\n\n**bold** and *italic* and ~~removed~~\n\n- outer\n  - inner\n\n> quoted\n\n```js\nconst x = '<script>';\n```\n\n| Name | Value |\n| --- | --- |\n| one | two |\n\n---");
    for (const element of ["h2", "strong", "em", "s", "ul", "blockquote", "pre", "table", "th", "td", "hr"]) expect(html).toMatch(new RegExp(`<${element}(?:>|\\s)`));
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect((html.match(/<ul>/g) || []).length).toBe(2);
  });

  it("escapes raw HTML and sanitizes decoded link and image destinations", () => {
    const html = markdownToHtml('<img src=x onerror="alert(1)">\n\n[bad](javascript:alert(1))\n\n[encoded](jav&#x61;script:alert(1))\n\n![remote](//evil.example/a.png)\n\n[backslash](/\\\\evil.example)\n\n[ok](https://example.com/a?x=1&y=2)\n\n[anchor](#section)');
    expect(html).not.toMatch(/<img[^>]+onerror/);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("//evil.example");
    expect(html).toContain('href="#"');
    expect(html).toContain('href="#section"');
    expect(html).toContain('href="https://example.com/a?x=1&amp;y=2"');
  });

  it("keeps captioned local images and avoids double escaping alt text", () => {
    const html = markdownToHtml('![A & B](/media/example.webp "Picture & caption")');
    expect(html).toContain('<figure class="inline-figure">');
    expect(html).toContain('alt="A &amp; B"');
    expect(html).toContain('<figcaption>Picture &amp; caption</figcaption>');
    expect(html).not.toContain("&amp;amp;");
  });

  it("renders pure editor table line breaks while keeping attributed HTML inert", () => {
    const html = markdownToHtml('| Column |\n| --- |\n| First<br>Second |\n\n<br onclick="alert(1)">\n\n`<br>`');
    expect(html).toMatch(/First<br>\s*Second/);
    expect(html).not.toContain('<br onclick=');
    expect(html).toContain('&lt;br onclick=');
    expect(html).toContain('<code>&lt;br&gt;</code>');
  });

  it("omits duplicate H1 in publication and excludes fenced headings from the outline", () => {
    const markdown = '# Article title\n\n## Real heading\n\n```md\n## Not a heading\n```\n\n#### Deep heading';
    expect(markdownToHtml(markdown)).not.toContain("<h1>");
    expect(getHeadings(markdown)).toEqual(["Real heading", "Deep heading"]);
  });
});
