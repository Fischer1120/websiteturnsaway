import { articles as seedArticles, photos as seedPhotos } from "./seed";
import {
  articleJsonKey,
  articleKey,
  deletePrefix,
  imageMetadataKey,
  imageOriginalKey,
  imageThumbKey,
  mediaUrl,
  putJson,
  readJson,
} from "./r2";
import type { Env } from "./responses";
import { isPublicId, isSlug } from "./validators";

export type ArticleStatus = "published" | "draft";
export type Visibility = "public" | "private";
export type FolderKind = "articles" | "images";

export type FolderRecord = {
  slug: string;
  label: string;
  description: string;
  order: number;
};

export type ArticleRecord = {
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
  url: string;
  objectKey: string;
  jsonKey: string;
  source: "seed" | "r2";
};

export type PhotoRecord = {
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
  visibility: Visibility;
  source: "seed" | "r2";
};

type ArticleIndex = {
  updatedAt?: string;
  articles?: ArticleRecord[];
  folders?: Array<FolderRecord & { count?: number; items?: ArticleRecord[]; articles?: ArticleRecord[] }>;
};

type ImageIndex = {
  updatedAt?: string;
  photos?: PhotoRecord[];
  folders?: Array<FolderRecord & { count?: number; items?: PhotoRecord[]; photos?: PhotoRecord[] }>;
};

type Tombstones = {
  articles: string[];
  images: string[];
};

const ARTICLE_INDEX_KEY = "indexes/articles.json";
const IMAGE_INDEX_KEY = "indexes/images.json";
const TOMBSTONE_KEY = "indexes/tombstones.json";

const DEFAULT_ARTICLE_FOLDERS: FolderRecord[] = [
  { slug: "notes", label: "Notes", description: "几何记忆、短札和观察记录", order: 10 },
  { slug: "travel", label: "Travel", description: "路线、散步和城市边缘", order: 20 },
];

const DEFAULT_IMAGE_FOLDERS: FolderRecord[] = [
  { slug: "city-walk", label: "City Walk", description: "按拍摄时间归档的城市照片", order: 10 },
  { slug: "archive", label: "Archive", description: "安静存放的旧照片和年度归档", order: 20 },
];

function folderIndexKey(kind: FolderKind) {
  return `indexes/folders/${kind}.json`;
}

function nowIso() {
  return new Date().toISOString();
}

function articleId(article: Pick<ArticleRecord, "folder" | "slug">) {
  return `${article.folder}/${article.slug}`;
}

function photoId(photo: Pick<PhotoRecord, "folder" | "id">) {
  return `${photo.folder}/${photo.id}`;
}

function sortByDateDesc<T extends { publishedAt?: string; capturedAt?: string; order?: number }>(items: T[]) {
  return [...items].sort((a, b) => {
    if (typeof a.order === "number" || typeof b.order === "number") {
      return (a.order || 9999) - (b.order || 9999);
    }
    const aDate = new Date(a.publishedAt || a.capturedAt || 0).getTime();
    const bDate = new Date(b.publishedAt || b.capturedAt || 0).getTime();
    return bDate - aDate;
  });
}

function normalizeTags(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeArticle(input: Partial<ArticleRecord>, source: "seed" | "r2"): ArticleRecord {
  const folder = String(input.folder || "");
  const slug = String(input.slug || "");
  const markdown = String(input.markdown || "");
  return {
    title: String(input.title || ""),
    subtitle: String(input.subtitle || ""),
    folder,
    slug,
    summary: String(input.summary || ""),
    coverImage: String(input.coverImage || ""),
    publishedAt: String(input.publishedAt || nowIso()),
    updatedAt: String(input.updatedAt || nowIso()),
    tags: normalizeTags(input.tags),
    status: input.status === "draft" ? "draft" : "published",
    markdown,
    url: `/articles/${folder}/${slug}`,
    objectKey: articleKey(folder, slug),
    jsonKey: articleJsonKey(folder, slug),
    source,
  };
}

function normalizePhoto(env: Env, input: Partial<PhotoRecord>, source: "seed" | "r2"): PhotoRecord {
  const folder = String(input.folder || "");
  const id = String(input.id || "");
  const objectKey = String(input.objectKey || "");
  const thumbKey = String(input.thumbKey || objectKey);
  return {
    id,
    folder,
    title: String(input.title || ""),
    description: String(input.description || ""),
    objectKey,
    thumbKey,
    imageUrl: input.imageUrl || (objectKey ? mediaUrl(env, objectKey) : ""),
    thumbUrl: input.thumbUrl || (thumbKey ? mediaUrl(env, thumbKey) : objectKey ? mediaUrl(env, objectKey) : ""),
    capturedAt: String(input.capturedAt || nowIso()),
    location: {
      label: String(input.location?.label || ""),
      latitude: input.location?.latitude,
      longitude: input.location?.longitude,
      precision: input.location?.precision || "city",
    },
    camera: input.camera,
    alt: String(input.alt || input.title || ""),
    visibility: input.visibility === "private" ? "private" : "public",
    source,
  };
}

async function readTombstones(env: Env): Promise<Tombstones> {
  return (await readJson<Tombstones>(env.MEDIA_BUCKET, TOMBSTONE_KEY)) || { articles: [], images: [] };
}

async function writeTombstones(env: Env, tombstones: Tombstones) {
  if (!env.MEDIA_BUCKET) return;
  await putJson(env.MEDIA_BUCKET, TOMBSTONE_KEY, {
    articles: [...new Set(tombstones.articles)].sort(),
    images: [...new Set(tombstones.images)].sort(),
  });
}

async function removeTombstone(env: Env, kind: FolderKind, id: string) {
  const tombstones = await readTombstones(env);
  const key = kind === "articles" ? "articles" : "images";
  tombstones[key] = tombstones[key].filter((item) => item !== id);
  await writeTombstones(env, tombstones);
}

async function addTombstone(env: Env, kind: FolderKind, id: string) {
  const tombstones = await readTombstones(env);
  const key = kind === "articles" ? "articles" : "images";
  tombstones[key] = [...new Set([...tombstones[key], id])];
  await writeTombstones(env, tombstones);
}

function validateFolderSlug(slug: string) {
  if (!isSlug(slug)) throw new Error("Invalid folder slug.");
}

function validateArticleSlug(folder: string, slug: string) {
  if (!isSlug(folder) || !isSlug(slug)) throw new Error("Invalid article path.");
}

function validatePhotoPath(folder: string, id: string) {
  if (!isSlug(folder) || !isPublicId(id)) throw new Error("Invalid image path.");
}

function serializeArticleMarkdown(article: ArticleRecord) {
  const frontmatter = [
    "---",
    `title: ${JSON.stringify(article.title)}`,
    `subtitle: ${JSON.stringify(article.subtitle)}`,
    `folder: ${JSON.stringify(article.folder)}`,
    `slug: ${JSON.stringify(article.slug)}`,
    `summary: ${JSON.stringify(article.summary)}`,
    `coverImage: ${JSON.stringify(article.coverImage)}`,
    `publishedAt: ${JSON.stringify(article.publishedAt)}`,
    `updatedAt: ${JSON.stringify(article.updatedAt)}`,
    `tags: ${JSON.stringify(article.tags)}`,
    `status: ${JSON.stringify(article.status)}`,
    "---",
    "",
  ].join("\n");
  return `${frontmatter}${article.markdown.trim()}\n`;
}

function seedArticleRecords() {
  return seedArticles.map((article) =>
    normalizeArticle({ ...article, status: article.status === "draft" ? "draft" : "published" }, "seed"),
  );
}

function seedPhotoRecords(env: Env) {
  return seedPhotos.map((photo) =>
    normalizePhoto(env, { ...photo, visibility: photo.visibility === "private" ? "private" : "public" }, "seed"),
  );
}

async function uploadedArticles(env: Env) {
  const index = await readJson<ArticleIndex>(env.MEDIA_BUCKET, ARTICLE_INDEX_KEY);
  return (index?.articles || []).map((article) => normalizeArticle(article, "r2"));
}

async function uploadedPhotos(env: Env) {
  const index = await readJson<ImageIndex>(env.MEDIA_BUCKET, IMAGE_INDEX_KEY);
  return (index?.photos || []).map((photo) => normalizePhoto(env, photo, "r2"));
}

export async function listFolderRecords(env: Env, kind: FolderKind) {
  const defaults = kind === "articles" ? DEFAULT_ARTICLE_FOLDERS : DEFAULT_IMAGE_FOLDERS;
  const custom = await readJson<{ folders?: FolderRecord[]; deleted?: string[] }>(env.MEDIA_BUCKET, folderIndexKey(kind));
  const deleted = new Set(custom?.deleted || []);
  const map = new Map<string, FolderRecord>();
  for (const folder of defaults) {
    if (!deleted.has(folder.slug)) map.set(folder.slug, folder);
  }
  for (const folder of custom?.folders || []) {
    if (!isSlug(folder.slug)) continue;
    map.set(folder.slug, {
      slug: folder.slug,
      label: folder.label || folder.slug,
      description: folder.description || "未命名归档",
      order: Number(folder.order || 999),
    });
  }
  return sortByDateDesc([...map.values()]);
}

export async function saveFolderRecord(env: Env, kind: FolderKind, folder: FolderRecord) {
  if (!env.MEDIA_BUCKET) throw new Error("MEDIA_BUCKET binding is not configured.");
  validateFolderSlug(folder.slug);
  const folders = await listFolderRecords(env, kind);
  const existing = await readJson<{ deleted?: string[] }>(env.MEDIA_BUCKET, folderIndexKey(kind));
  const next = {
    slug: folder.slug,
    label: folder.label || folder.slug,
    description: folder.description || "未命名归档",
    order: Number(folder.order || 999),
  };
  const merged = [...folders.filter((item) => item.slug !== next.slug), next];
  await putJson(env.MEDIA_BUCKET, folderIndexKey(kind), {
    updatedAt: nowIso(),
    folders: sortByDateDesc(merged),
    deleted: (existing?.deleted || []).filter((item) => item !== next.slug),
  });
  return next;
}

export async function deleteFolderRecord(env: Env, kind: FolderKind, slug: string) {
  if (!env.MEDIA_BUCKET) throw new Error("MEDIA_BUCKET binding is not configured.");
  validateFolderSlug(slug);
  const items =
    kind === "articles"
      ? (await listArticles(env, { includePrivate: true })).articles.filter((article) => article.folder === slug)
      : (await listPhotos(env, { includePrivate: true })).photos.filter((photo) => photo.folder === slug);
  if (items.length > 0) throw new Error("Folder is not empty.");
  const existing = await readJson<{ deleted?: string[] }>(env.MEDIA_BUCKET, folderIndexKey(kind));
  const folders = (await listFolderRecords(env, kind)).filter((folder) => folder.slug !== slug);
  await putJson(env.MEDIA_BUCKET, folderIndexKey(kind), {
    updatedAt: nowIso(),
    folders,
    deleted: [...new Set([...(existing?.deleted || []), slug])],
  });
}

function articleFolderSummaries(articles: ArticleRecord[], folders: FolderRecord[]) {
  return folders
    .map((folder) => {
      const items = sortByDateDesc(articles.filter((article) => article.folder === folder.slug));
      return { ...folder, count: items.length, items, articles: items };
    })
    .filter((folder) => folder.count > 0);
}

function imageFolderSummaries(photos: PhotoRecord[], folders: FolderRecord[]) {
  return folders
    .map((folder) => {
      const items = sortByDateDesc(photos.filter((photo) => photo.folder === folder.slug));
      return { ...folder, count: items.length, items, photos: items };
    })
    .filter((folder) => folder.count > 0);
}

async function writeArticleIndexes(env: Env, articles: ArticleRecord[]) {
  if (!env.MEDIA_BUCKET) throw new Error("MEDIA_BUCKET binding is not configured.");
  const folders = articleFolderSummaries(articles, await listFolderRecords(env, "articles"));
  await putJson(env.MEDIA_BUCKET, ARTICLE_INDEX_KEY, {
    updatedAt: nowIso(),
    articles,
    folders,
  });
  await Promise.all(
    folders.map((folder) =>
      putJson(env.MEDIA_BUCKET as R2Bucket, `indexes/articles/${folder.slug}.json`, {
        updatedAt: nowIso(),
        folder: folder.slug,
        articles: folder.articles || [],
      }),
    ),
  );
}

async function writeImageIndexes(env: Env, photos: PhotoRecord[]) {
  if (!env.MEDIA_BUCKET) throw new Error("MEDIA_BUCKET binding is not configured.");
  const folders = imageFolderSummaries(photos, await listFolderRecords(env, "images"));
  await putJson(env.MEDIA_BUCKET, IMAGE_INDEX_KEY, {
    updatedAt: nowIso(),
    photos,
    folders,
  });
  await Promise.all(
    folders.map((folder) =>
      putJson(env.MEDIA_BUCKET as R2Bucket, `indexes/images/${folder.slug}.json`, {
        updatedAt: nowIso(),
        folder: folder.slug,
        photos: folder.photos || [],
      }),
    ),
  );
}

export async function listArticles(env: Env, options: { includePrivate?: boolean } = {}) {
  const tombstones = await readTombstones(env);
  const map = new Map<string, ArticleRecord>();
  for (const article of seedArticleRecords()) map.set(articleId(article), article);
  for (const article of await uploadedArticles(env)) map.set(articleId(article), article);
  for (const id of tombstones.articles) map.delete(id);
  const articles = sortByDateDesc([...map.values()]).filter(
    (article) => options.includePrivate || article.status === "published",
  );
  const folderRecords = await listFolderRecords(env, "articles");
  const missingFolders = articles
    .filter((article) => !folderRecords.some((folder) => folder.slug === article.folder))
    .map((article, index) => ({
      slug: article.folder,
      label: article.folder,
      description: "未命名归档",
      order: 500 + index,
    }));
  const folders = articleFolderSummaries(articles, [...folderRecords, ...missingFolders]);
  return { folders, articles };
}

export async function getArticle(env: Env, folder: string, slug: string, options: { includePrivate?: boolean } = {}) {
  validateArticleSlug(folder, slug);
  return (await listArticles(env, options)).articles.find((article) => article.folder === folder && article.slug === slug);
}

export async function saveArticle(env: Env, input: Partial<ArticleRecord>) {
  if (!env.MEDIA_BUCKET) throw new Error("MEDIA_BUCKET binding is not configured.");
  const folder = String(input.folder || "");
  const slug = String(input.slug || "");
  validateArticleSlug(folder, slug);
  const existing = await getArticle(env, folder, slug, { includePrivate: true });
  const article = normalizeArticle(
    {
      ...existing,
      ...input,
      folder,
      slug,
      updatedAt: nowIso(),
      publishedAt: input.publishedAt || existing?.publishedAt || nowIso(),
    },
    "r2",
  );
  await env.MEDIA_BUCKET.put(article.objectKey, serializeArticleMarkdown(article), {
    httpMetadata: { contentType: "text/markdown; charset=utf-8" },
  });
  await putJson(env.MEDIA_BUCKET, article.jsonKey, article);
  const uploaded = (await uploadedArticles(env)).filter((item) => articleId(item) !== articleId(article));
  const articles = sortByDateDesc([...uploaded, article]);
  await writeArticleIndexes(env, articles);
  await removeTombstone(env, "articles", articleId(article));
  return article;
}

export async function patchArticle(env: Env, folder: string, slug: string, patch: Partial<ArticleRecord>) {
  const existing = await getArticle(env, folder, slug, { includePrivate: true });
  if (!existing) return undefined;
  return saveArticle(env, { ...existing, ...patch, folder, slug });
}

export async function deleteArticle(env: Env, folder: string, slug: string) {
  if (!env.MEDIA_BUCKET) throw new Error("MEDIA_BUCKET binding is not configured.");
  validateArticleSlug(folder, slug);
  await deletePrefix(env.MEDIA_BUCKET, `articles/${folder}/${slug}/`);
  const uploaded = (await uploadedArticles(env)).filter((article) => article.folder !== folder || article.slug !== slug);
  await writeArticleIndexes(env, uploaded);
  await addTombstone(env, "articles", `${folder}/${slug}`);
}

export async function listPhotos(env: Env, options: { includePrivate?: boolean } = {}) {
  const tombstones = await readTombstones(env);
  const map = new Map<string, PhotoRecord>();
  for (const photo of seedPhotoRecords(env)) map.set(photoId(photo), photo);
  for (const photo of await uploadedPhotos(env)) map.set(photoId(photo), photo);
  for (const id of tombstones.images) map.delete(id);
  const photos = sortByDateDesc([...map.values()]).filter(
    (photo) => options.includePrivate || photo.visibility === "public",
  );
  const folderRecords = await listFolderRecords(env, "images");
  const missingFolders = photos
    .filter((photo) => !folderRecords.some((folder) => folder.slug === photo.folder))
    .map((photo, index) => ({
      slug: photo.folder,
      label: photo.folder,
      description: "未命名归档",
      order: 500 + index,
    }));
  const folders = imageFolderSummaries(photos, [...folderRecords, ...missingFolders]);
  return { folders, photos };
}

export async function getPhoto(env: Env, folder: string, id: string, options: { includePrivate?: boolean } = {}) {
  validatePhotoPath(folder, id);
  return (await listPhotos(env, options)).photos.find((photo) => photo.folder === folder && photo.id === id);
}

export async function savePhotoMetadata(env: Env, input: Partial<PhotoRecord>) {
  if (!env.MEDIA_BUCKET) throw new Error("MEDIA_BUCKET binding is not configured.");
  const folder = String(input.folder || "");
  const id = String(input.id || "");
  validatePhotoPath(folder, id);
  const existing = await getPhoto(env, folder, id, { includePrivate: true });
  const photo = normalizePhoto(env, { ...existing, ...input, folder, id }, "r2");
  await putJson(env.MEDIA_BUCKET, imageMetadataKey(folder, id), photo);
  const uploaded = (await uploadedPhotos(env)).filter((item) => photoId(item) !== photoId(photo));
  const photos = sortByDateDesc([...uploaded, photo]);
  await writeImageIndexes(env, photos);
  await removeTombstone(env, "images", photoId(photo));
  return photo;
}

export async function savePhotoUpload(
  env: Env,
  folder: string,
  file: File,
  thumb: File | undefined,
  metadata: Partial<PhotoRecord>,
  ext: string,
) {
  if (!env.MEDIA_BUCKET) throw new Error("MEDIA_BUCKET binding is not configured.");
  validateFolderSlug(folder);
  const id = String(metadata.id || `${new Date().toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`);
  validatePhotoPath(folder, id);
  const objectKey = imageOriginalKey(folder, id, ext);
  const thumbKey = thumb ? imageThumbKey(folder, id, "webp") : objectKey;
  await env.MEDIA_BUCKET.put(objectKey, file.stream(), {
    httpMetadata: { contentType: file.type },
  });
  if (thumb) {
    await env.MEDIA_BUCKET.put(thumbKey, thumb.stream(), {
      httpMetadata: { contentType: "image/webp" },
    });
  }
  return savePhotoMetadata(env, {
    ...metadata,
    id,
    folder,
    objectKey,
    thumbKey,
    imageUrl: mediaUrl(env, objectKey),
    thumbUrl: mediaUrl(env, thumbKey),
  });
}

export async function patchPhoto(env: Env, folder: string, id: string, patch: Partial<PhotoRecord>) {
  const existing = await getPhoto(env, folder, id, { includePrivate: true });
  if (!existing) return undefined;
  return savePhotoMetadata(env, {
    ...existing,
    ...patch,
    folder,
    id,
    objectKey: existing.objectKey,
    thumbKey: existing.thumbKey,
    imageUrl: mediaUrl(env, existing.objectKey),
    thumbUrl: mediaUrl(env, existing.thumbKey),
  });
}

export async function deletePhoto(env: Env, folder: string, id: string) {
  if (!env.MEDIA_BUCKET) throw new Error("MEDIA_BUCKET binding is not configured.");
  validatePhotoPath(folder, id);
  await deletePrefix(env.MEDIA_BUCKET, `images/${folder}/${id}/`);
  const uploaded = (await uploadedPhotos(env)).filter((photo) => photo.folder !== folder || photo.id !== id);
  await writeImageIndexes(env, uploaded);
  await addTombstone(env, "images", `${folder}/${id}`);
}
