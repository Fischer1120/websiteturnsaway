export type ArticleStatus = "published" | "draft";

export type Article = {
  title: string;
  subtitle: string;
  folder: string;
  slug: string;
  summary: string;
  coverImage: string;
  publishedAt: string;
  updatedAt: string;
  tags: string[];
  status: ArticleStatus;
  markdown: string;
  html: string;
  headings: string[];
  url: string;
};

export type PhotoMetadata = {
  id: string;
  folder: string;
  title: string;
  description: string;
  objectKey: string;
  thumbKey: string;
  imageUrl: string;
  thumbUrl: string;
  capturedAt: string;
  location: {
    label: string;
    latitude?: number;
    longitude?: number;
    precision: "city" | "approximate" | "exact" | string;
  };
  camera?: {
    make?: string;
    model?: string;
    lens?: string;
    iso?: number;
    aperture?: string;
    shutter?: string;
  };
  alt: string;
  visibility: "public" | "private";
};

export type FolderSummary<T> = {
  slug: string;
  label: string;
  description: string;
  count: number;
  items: T[];
};

const articleFiles = import.meta.glob("../../content/articles/*/*/index.md", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Record<string, string>;

const photoFiles = import.meta.glob("../../content/images/*/*/metadata.json", {
  eager: true,
  import: "default",
}) as Record<string, PhotoMetadata>;

const folderNames: Record<string, { label: string; description: string }> = {
  notes: {
    label: "Notes",
    description: "几何记忆、短札和观察记录",
  },
  travel: {
    label: "Travel",
    description: "路线、散步和城市边缘",
  },
  "city-walk": {
    label: "City Walk",
    description: "按拍摄时间归档的城市照片",
  },
  archive: {
    label: "Archive",
    description: "安静存放的旧照片和年度归档",
  },
};

function parseFrontmatter(raw: string) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error("Article is missing frontmatter.");
  }

  const data: Record<string, unknown> = {};
  for (const line of match[1].split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    data[key] = parseFrontmatterValue(value);
  }

  return { data, body: match[2].trim() };
}

function parseFrontmatterValue(value: string) {
  if (value.startsWith("[") && value.endsWith("]")) {
    return JSON.parse(value);
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderInlineMarkdown(value: string) {
  return escapeHtml(value).replaceAll(/`([^`]+)`/g, "<code>$1</code>");
}

function markdownToHtml(markdown: string) {
  const html: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      continue;
    }

    const image = line.match(/^!\[(.*?)\]\((.*?)(?:\s+"(.*?)")?\)$/);
    if (image) {
      flushParagraph();
      html.push(
        `<figure class="inline-figure"><img src="${escapeHtml(image[2])}" alt="${escapeHtml(
          image[1],
        )}" loading="lazy" /><figcaption>${escapeHtml(image[3] || image[1])}</figcaption></figure>`,
      );
      continue;
    }

    if (line.startsWith("### ")) {
      flushParagraph();
      html.push(`<h3>${renderInlineMarkdown(line.slice(4))}</h3>`);
      continue;
    }

    if (line.startsWith("## ")) {
      flushParagraph();
      html.push(`<h2>${renderInlineMarkdown(line.slice(3))}</h2>`);
      continue;
    }

    if (line.startsWith("# ")) {
      flushParagraph();
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  return html.join("\n");
}

function getHeadings(markdown: string) {
  return markdown
    .split("\n")
    .filter((line) => line.startsWith("## "))
    .map((line) => line.replace(/^##\s+/, "").trim());
}

function sortByDateDesc<T extends { publishedAt?: string; capturedAt?: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    const aDate = new Date(a.publishedAt || a.capturedAt || 0).getTime();
    const bDate = new Date(b.publishedAt || b.capturedAt || 0).getTime();
    return bDate - aDate;
  });
}

export function assertSlug(value: string, field = "slug") {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(`Invalid ${field}: ${value}`);
  }
}

export function articleAssetKey(folder: string, slug: string, filename: string) {
  assertSlug(folder, "folder");
  assertSlug(slug, "slug");
  return `articles/${folder}/${slug}/assets/${filename.replaceAll(/[^a-zA-Z0-9._-]/g, "-")}`;
}

export function imageOriginalKey(folder: string, photoId: string, ext: string) {
  assertSlug(folder, "folder");
  return `images/${folder}/${photoId}/original.${ext.replace(/^\./, "")}`;
}

export function imageMetadataKey(folder: string, photoId: string) {
  assertSlug(folder, "folder");
  return `images/${folder}/${photoId}/metadata.json`;
}

export function getFolderLabel(folder: string) {
  return folderNames[folder]?.label || folder;
}

export function getFolderDescription(folder: string) {
  return folderNames[folder]?.description || "未命名归档";
}

export function getArticles(): Article[] {
  return sortByDateDesc(
    Object.values(articleFiles).map((raw) => {
      const { data, body } = parseFrontmatter(raw);
      const article = data as Omit<Article, "markdown" | "html" | "headings" | "url">;
      return {
        ...article,
        markdown: body,
        html: markdownToHtml(body),
        headings: getHeadings(body),
        url: `/articles/${article.folder}/${article.slug}`,
      };
    }),
  );
}

export function getArticle(folder: string, slug: string) {
  return getArticles().find((article) => article.folder === folder && article.slug === slug);
}

export function getArticleFolders(): FolderSummary<Article>[] {
  const folders = new Map<string, Article[]>();
  for (const article of getArticles()) {
    folders.set(article.folder, [...(folders.get(article.folder) || []), article]);
  }

  return [...folders.entries()].map(([slug, items]) => ({
    slug,
    label: getFolderLabel(slug),
    description: getFolderDescription(slug),
    count: items.length,
    items: sortByDateDesc(items),
  }));
}

export function getPhotos(): PhotoMetadata[] {
  return sortByDateDesc(Object.values(photoFiles).filter((photo) => photo.visibility === "public"));
}

export function getPhoto(folder: string, photoId: string) {
  return getPhotos().find((photo) => photo.folder === folder && photo.id === photoId);
}

export function getPhotoFolders(): FolderSummary<PhotoMetadata>[] {
  const folders = new Map<string, PhotoMetadata[]>();
  for (const photo of getPhotos()) {
    folders.set(photo.folder, [...(folders.get(photo.folder) || []), photo]);
  }

  return [...folders.entries()].map(([slug, items]) => ({
    slug,
    label: getFolderLabel(slug),
    description: getFolderDescription(slug),
    count: items.length,
    items: sortByDateDesc(items),
  }));
}

export function formatDate(value: string, withTime = false) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: withTime ? "short" : undefined,
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

export function getR2KeyRules() {
  return {
    article: "articles/{folder}/{slug}/index.md",
    articleAsset: "articles/{folder}/{slug}/assets/{filename}",
    imageOriginal: "images/{folder}/{photoId}/original.{ext}",
    imageThumb: "images/{folder}/{photoId}/thumb.{ext}",
    imageMetadata: "images/{folder}/{photoId}/metadata.json",
    articleIndex: "indexes/articles.json",
    imageIndex: "indexes/images.json",
  };
}
