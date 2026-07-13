import { articles as seedArticles, photos as seedPhotos } from "./seed";
import {
  articleJsonKey,
  articleKey,
  deletePrefix,
  imageMetadataKey,
  imageOriginalKey,
  imageThumbKey,
  listAllObjects,
  mediaUrl,
  putJsonIfMatch,
  putJsonIfAbsent,
  updateJsonCas,
  readJsonObject,
  readJson,
  withR2TransientRetry,
} from "./r2";
import { ApiError } from "./responses";
import { isFiniteNumber, isIsoDate, isPublicId, isRecord, isSlug } from "./validators";

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

export type PhotoLocation = {
  label: string;
  latitude?: number;
  longitude?: number;
  precision: "city" | "approximate" | "exact";
};

export type PhotoCamera = {
  make?: string;
  model?: string;
  lens?: string;
  iso?: number;
  aperture?: string;
  shutter?: string;
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
  updatedAt: string;
  location: PhotoLocation;
  camera?: PhotoCamera;
  alt: string;
  visibility: Visibility;
  source: "seed" | "r2";
};

export type PublicArticleRecord = Omit<ArticleRecord, "objectKey" | "jsonKey" | "source" | "markdown"> & {
  markdown?: string;
};
export type PublicPhotoRecord = Omit<PhotoRecord, "objectKey" | "thumbKey" | "source" | "location" | "updatedAt"> & {
  location: Omit<PhotoLocation, "latitude" | "longitude">;
};

export type PhotoPatch = Partial<Omit<PhotoRecord, "location" | "camera">> & {
  location?: Partial<PhotoLocation> & { latitude?: number | null; longitude?: number | null };
  camera?: Partial<PhotoCamera> | null;
  expectedUpdatedAt?: string;
};

type Tombstones = {
  articles: string[];
  images: string[];
};

type TombstoneRecord = {
  id: string;
  kind: FolderKind;
  deletedAt?: string;
  restoredAt?: string;
};

type FolderIndex = {
  updatedAt?: string;
  folders?: FolderRecord[];
  deleted?: string[];
};

type MigrationRecord = {
  from: string;
  to: string;
  createdAt: string;
};

const TOMBSTONE_KEY = "indexes/tombstones.json";
const TOMBSTONE_PREFIX = "indexes/tombstones/";
const MIGRATION_PREFIX = "indexes/migrations/";

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

function articleJsonKeyFromId(id: string) {
  const [folder, slug] = id.split("/");
  return articleJsonKey(folder, slug);
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

function validateStatus(value: unknown): ArticleStatus {
  if (value === undefined) return "published";
  if (value === "published" || value === "draft") return value;
  throw new ApiError("invalid_request", "status must be published or draft.", 400, { field: "status" });
}

function validateVisibility(value: unknown): Visibility {
  if (value === undefined) return "public";
  if (value === "public" || value === "private") return value;
  throw new ApiError("invalid_request", "visibility must be public or private.", 400, { field: "visibility" });
}

function validateDate(value: unknown, field: string, fallback: string) {
  if (value === undefined) return fallback;
  const date = String(value);
  if (!isIsoDate(date)) throw new ApiError("invalid_request", `${field} must be a valid ISO date.`, 400, { field });
  return date;
}

function validateArticleMetadata(input: Partial<ArticleRecord>) {
  if (input.folder !== undefined && !isSlug(String(input.folder))) {
    throw new ApiError("invalid_request", "Invalid article folder.", 400, { field: "folder" });
  }
  if (input.slug !== undefined && !isSlug(String(input.slug))) {
    throw new ApiError("invalid_request", "Invalid article slug.", 400, { field: "slug" });
  }
  validateStatus(input.status);
  if (input.publishedAt !== undefined) validateDate(input.publishedAt, "publishedAt", "");
  if (input.updatedAt !== undefined) validateDate(input.updatedAt, "updatedAt", "");
  if (input.tags !== undefined && !Array.isArray(input.tags) && typeof input.tags !== "string") {
    throw new ApiError("invalid_request", "tags must be an array or comma-separated string.", 400, { field: "tags" });
  }
}

function normalizeArticle(input: Partial<ArticleRecord>, source: "seed" | "r2"): ArticleRecord {
  validateArticleMetadata(input);
  const folder = String(input.folder || "");
  const slug = String(input.slug || "");
  const markdown = String(input.markdown || "");
  validateArticleSlug(folder, slug);
  const current = nowIso();
  return {
    title: String(input.title || ""),
    subtitle: String(input.subtitle || ""),
    folder,
    slug,
    summary: String(input.summary || ""),
    coverImage: String(input.coverImage || ""),
    publishedAt: validateDate(input.publishedAt, "publishedAt", current),
    updatedAt: validateDate(input.updatedAt, "updatedAt", current),
    tags: normalizeTags(input.tags),
    status: input.status === "draft" ? "draft" : "published",
    markdown,
    url: `/articles/${folder}/${slug}`,
    objectKey: articleKey(folder, slug),
    jsonKey: articleJsonKey(folder, slug),
    source,
  };
}

function validatePhotoMetadata(input: Partial<PhotoRecord>) {
  if (input.folder !== undefined && !isSlug(String(input.folder))) {
    throw new ApiError("invalid_request", "Invalid image folder.", 400, { field: "folder" });
  }
  if (input.id !== undefined && !isPublicId(String(input.id))) {
    throw new ApiError("invalid_request", "Invalid photoId.", 400, { field: "id" });
  }
  validateVisibility(input.visibility);
  if (input.capturedAt !== undefined) validateDate(input.capturedAt, "capturedAt", "");
  if (input.location !== undefined) {
    if (!isRecord(input.location)) throw new ApiError("invalid_request", "location must be an object.", 400, { field: "location" });
    if (input.location.label !== undefined && typeof input.location.label !== "string") {
      throw new ApiError("invalid_request", "location.label must be a string.", 400, { field: "location.label" });
    }
    if (input.location.latitude !== undefined && (!isFiniteNumber(input.location.latitude) || input.location.latitude < -90 || input.location.latitude > 90)) {
      throw new ApiError("invalid_request", "location.latitude must be between -90 and 90.", 400, { field: "location.latitude" });
    }
    if (input.location.longitude !== undefined && (!isFiniteNumber(input.location.longitude) || input.location.longitude < -180 || input.location.longitude > 180)) {
      throw new ApiError("invalid_request", "location.longitude must be between -180 and 180.", 400, { field: "location.longitude" });
    }
    if (input.location.precision !== undefined && !["city", "approximate", "exact"].includes(String(input.location.precision))) {
      throw new ApiError("invalid_request", "location.precision is invalid.", 400, { field: "location.precision" });
    }
  }
  if (input.camera !== undefined && !isRecord(input.camera)) {
    throw new ApiError("invalid_request", "camera must be an object.", 400, { field: "camera" });
  }
  if (isRecord(input.camera) && input.camera.iso !== undefined && (!isFiniteNumber(input.camera.iso) || input.camera.iso < 0)) {
    throw new ApiError("invalid_request", "camera.iso must be a non-negative number.", 400, { field: "camera.iso" });
  }
  for (const field of ["make", "model", "lens", "aperture", "shutter"] as const) {
    if (isRecord(input.camera) && input.camera[field] !== undefined && typeof input.camera[field] !== "string") {
      throw new ApiError("invalid_request", `camera.${field} must be a string.`, 400, { field: `camera.${field}` });
    }
  }
}

function normalizePhoto(env: Env, input: Partial<PhotoRecord>, source: "seed" | "r2"): PhotoRecord {
  validatePhotoMetadata(input);
  const folder = String(input.folder || "");
  const id = String(input.id || "");
  const objectKey = String(input.objectKey || "");
  const thumbKey = String(input.thumbKey || objectKey);
  validatePhotoPath(folder, id);
  const rawLocation: Record<string, unknown> = isRecord(input.location) ? input.location : {};
  const location: PhotoLocation = {
    label: String(rawLocation.label || ""),
    precision: (rawLocation.precision || "city") as "city" | "approximate" | "exact",
    ...(isFiniteNumber(rawLocation.latitude) ? { latitude: rawLocation.latitude } : {}),
    ...(isFiniteNumber(rawLocation.longitude) ? { longitude: rawLocation.longitude } : {}),
  };
  const rawCamera = isRecord(input.camera) ? input.camera : undefined;
  const camera: PhotoCamera | undefined = rawCamera
    ? {
        ...(typeof rawCamera.make === "string" ? { make: rawCamera.make } : {}),
        ...(typeof rawCamera.model === "string" ? { model: rawCamera.model } : {}),
        ...(typeof rawCamera.lens === "string" ? { lens: rawCamera.lens } : {}),
        ...(isFiniteNumber(rawCamera.iso) ? { iso: rawCamera.iso } : {}),
        ...(typeof rawCamera.aperture === "string" ? { aperture: rawCamera.aperture } : {}),
        ...(typeof rawCamera.shutter === "string" ? { shutter: rawCamera.shutter } : {}),
      }
    : undefined;
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
    updatedAt: String(input.updatedAt || input.capturedAt || nowIso()),
    location,
    camera,
    alt: String(input.alt || input.title || ""),
    visibility: validateVisibility(input.visibility),
    source,
  };
}

async function readTombstones(env: Env): Promise<Tombstones> {
  let legacy: Tombstones | undefined;
  try {
    legacy = await readJson<Tombstones>(env.MEDIA_BUCKET, TOMBSTONE_KEY);
  } catch (error) {
    console.error(JSON.stringify({ event: "tombstone_metadata_invalid", key: TOMBSTONE_KEY, message: String(error) }));
  }
  legacy ||= { articles: [], images: [] };
  const result: Tombstones = {
    articles: [...new Set(legacy.articles || [])],
    images: [...new Set(legacy.images || [])],
  };
  const restored = { articles: new Set<string>(), images: new Set<string>() };
  for (const object of await listAllObjects(env.MEDIA_BUCKET, TOMBSTONE_PREFIX)) {
    const match = object.key.match(/^indexes\/tombstones\/(articles|images)\/([^/]+)\/([^/]+)\.json$/u);
    if (!match) continue;
    try {
      const record = await readJson<TombstoneRecord>(env.MEDIA_BUCKET, object.key);
      const kind = match[1] as "articles" | "images";
      const id = `${match[2]}/${match[3]}`;
      if (record?.restoredAt) restored[kind].add(id);
      else if (record?.deletedAt) result[kind].push(id);
    } catch (error) {
      console.error(JSON.stringify({ event: "tombstone_metadata_invalid", key: object.key, message: String(error) }));
    }
  }
  result.articles = [...new Set(result.articles)].filter((id) => !restored.articles.has(id));
  result.images = [...new Set(result.images)].filter((id) => !restored.images.has(id));
  return result;
}

function tombstoneObjectKey(kind: FolderKind, id: string) {
  const [folder, slug] = id.split("/");
  if (!folder || !slug) throw new Error("Invalid tombstone identity.");
  return `${TOMBSTONE_PREFIX}${kind}/${folder}/${slug}.json`;
}

async function removeTombstone(env: Env, kind: FolderKind, id: string) {
  await env.MEDIA_BUCKET.delete(tombstoneObjectKey(kind, id));
  let legacy: { value: Tombstones; etag: string } | undefined;
  try {
    legacy = await readJsonObject<Tombstones>(env.MEDIA_BUCKET, TOMBSTONE_KEY);
  } catch (error) {
    console.error(JSON.stringify({ event: "tombstone_metadata_invalid", key: TOMBSTONE_KEY, message: String(error) }));
    return;
  }
  if (!legacy?.value?.[kind]?.includes(id)) return;
  await putJsonIfAbsent(env.MEDIA_BUCKET, tombstoneObjectKey(kind, id), {
    id,
    kind,
    restoredAt: nowIso(),
  } satisfies TombstoneRecord);
}

async function addTombstone(env: Env, kind: FolderKind, id: string) {
  const key = tombstoneObjectKey(kind, id);
  const current = await readJsonObject<TombstoneRecord>(env.MEDIA_BUCKET, key);
  if (current?.value?.restoredAt) {
    const written = await putJsonIfMatch(env.MEDIA_BUCKET, key, current.etag, { id, kind, deletedAt: nowIso() });
    if (written) return;
  }
  const written = await putJsonIfAbsent(env.MEDIA_BUCKET, key, { id, kind, deletedAt: nowIso() });
  if (written) return;
}

function migrationObjectKey(kind: FolderKind, id: string) {
  const [folder, slug] = id.split("/");
  if (!folder || !slug) throw new Error("Invalid migration identity.");
  return `${MIGRATION_PREFIX}${kind}/${folder}/${slug}.json`;
}

async function readMigrations(env: Env, kind: FolderKind) {
  const migrations: MigrationRecord[] = [];
  for (const object of await listAllObjects(env.MEDIA_BUCKET, `${MIGRATION_PREFIX}${kind}/`)) {
    if (!object.key.endsWith(".json")) continue;
    try {
      const migration = await readJson<MigrationRecord>(env.MEDIA_BUCKET, object.key);
      if (migration?.from && migration.to) migrations.push(migration);
    } catch (error) {
      console.error(JSON.stringify({ event: "migration_metadata_invalid", kind, key: object.key, message: String(error) }));
    }
  }
  return migrations;
}

async function removeMigration(env: Env, kind: FolderKind, fromId: string) {
  await env.MEDIA_BUCKET.delete(migrationObjectKey(kind, fromId));
}

async function readDeletedFolderSlugs(env: Env, kind: FolderKind) {
  let custom: { deleted?: string[] } | undefined;
  try {
    custom = await readJson<{ deleted?: string[] }>(env.MEDIA_BUCKET, folderIndexKey(kind));
  } catch (error) {
    console.error(JSON.stringify({ event: "folder_metadata_invalid", kind, key: folderIndexKey(kind), message: String(error) }));
  }
  return new Set(custom?.deleted || []);
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
    normalizePhoto(env, {
      ...photo,
      updatedAt: (photo as Partial<PhotoRecord>).updatedAt || photo.capturedAt,
      visibility: photo.visibility === "private" ? "private" : "public",
    } as Partial<PhotoRecord>, "seed"),
  );
}

async function uploadedArticles(env: Env) {
  const objects = await listAllObjects(env.MEDIA_BUCKET, "articles/");
  const records: ArticleRecord[] = [];
  for (const object of objects.filter((item) => /^articles\/[^/]+\/[^/]+\/index\.json$/u.test(item.key))) {
    try {
      const record = await readJson<ArticleRecord>(env.MEDIA_BUCKET, object.key);
      if (record) records.push(normalizeArticle(record, "r2"));
    } catch (error) {
      console.error(JSON.stringify({ event: "content_metadata_invalid", kind: "article", key: object.key, message: String(error) }));
    }
  }
  return records;
}

async function uploadedPhotos(env: Env) {
  const objects = await listAllObjects(env.MEDIA_BUCKET, "images/");
  const records: PhotoRecord[] = [];
  for (const object of objects.filter((item) => /^images\/[^/]+\/[^/]+\/metadata\.json$/u.test(item.key))) {
    try {
      const record = await readJson<PhotoRecord>(env.MEDIA_BUCKET, object.key);
      if (record) records.push(normalizePhoto(env, record, "r2"));
    } catch (error) {
      console.error(JSON.stringify({ event: "content_metadata_invalid", kind: "image", key: object.key, message: String(error) }));
    }
  }
  return records;
}

function folderRecordsFromIndex(kind: FolderKind, custom?: FolderIndex) {
  const defaults = kind === "articles" ? DEFAULT_ARTICLE_FOLDERS : DEFAULT_IMAGE_FOLDERS;
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

export async function listFolderRecords(env: Env, kind: FolderKind) {
  let custom: FolderIndex | undefined;
  try {
    custom = await readJson<FolderIndex>(env.MEDIA_BUCKET, folderIndexKey(kind));
  } catch (error) {
    console.error(JSON.stringify({ event: "folder_metadata_invalid", kind, key: folderIndexKey(kind), message: String(error) }));
  }
  return folderRecordsFromIndex(kind, custom);
}

export async function saveFolderRecord(env: Env, kind: FolderKind, folder: FolderRecord, options: { createOnly?: boolean } = {}) {
  if (!env.MEDIA_BUCKET) throw new Error("MEDIA_BUCKET binding is not configured.");
  validateFolderSlug(folder.slug);
  const next = {
    slug: folder.slug,
    label: folder.label || folder.slug,
    description: folder.description || "未命名归档",
    order: Number(folder.order || 999),
  };
  const saved = await updateJsonCas<FolderIndex>(env.MEDIA_BUCKET, folderIndexKey(kind), (current) => {
    const folders = folderRecordsFromIndex(kind, current);
    if (options.createOnly && folders.some((item) => item.slug === folder.slug)) {
      throw new ApiError("conflict", "A folder already uses this slug.", 409, { kind, slug: folder.slug });
    }
    return {
      updatedAt: nowIso(),
      folders: sortByDateDesc([...folders.filter((item) => item.slug !== next.slug), next]),
      deleted: (current?.deleted || []).filter((item) => item !== next.slug),
    };
  });
  if (!saved) {
    throw new ApiError("storage_error", "Folder index changed concurrently; retry the operation.", 503);
  }
  return next;
}

export async function deleteFolderRecord(env: Env, kind: FolderKind, slug: string) {
  if (!env.MEDIA_BUCKET) throw new Error("MEDIA_BUCKET binding is not configured.");
  validateFolderSlug(slug);
  const records = kind === "articles"
    ? (await listArticles(env, { includePrivate: true })).articles.filter((article) => article.folder === slug)
    : (await listPhotos(env, { includePrivate: true })).photos.filter((photo) => photo.folder === slug);
  if (records.length > 0) {
    throw new ApiError("conflict", "Cannot delete a non-empty folder.", 409, { kind, slug, count: records.length });
  }
  const saved = await updateJsonCas<FolderIndex>(env.MEDIA_BUCKET, folderIndexKey(kind), (current) => ({
    updatedAt: nowIso(),
    folders: folderRecordsFromIndex(kind, current).filter((folder) => folder.slug !== slug),
    deleted: [...new Set([...(current?.deleted || []), slug])],
  }));
  if (!saved) {
    throw new ApiError("storage_error", "Folder index changed concurrently; retry the operation.", 503);
  }
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

export function toPublicArticle(article: ArticleRecord, options: { includeMarkdown?: boolean } = {}): PublicArticleRecord {
  const { objectKey, jsonKey, source, markdown, ...publicArticle } = article;
  void objectKey;
  void jsonKey;
  void source;
  return options.includeMarkdown ? { ...publicArticle, markdown } : publicArticle;
}

export function toPublicPhoto(photo: PhotoRecord): PublicPhotoRecord {
  const { objectKey, thumbKey, source, location, camera, ...publicPhoto } = photo;
  const publicLocation = { label: location.label, precision: location.precision };
  const publicCamera = camera
    ? {
        ...(camera.make ? { make: camera.make } : {}),
        ...(camera.model ? { model: camera.model } : {}),
        ...(camera.lens ? { lens: camera.lens } : {}),
        ...(camera.iso !== undefined ? { iso: camera.iso } : {}),
        ...(camera.aperture ? { aperture: camera.aperture } : {}),
        ...(camera.shutter ? { shutter: camera.shutter } : {}),
      }
    : undefined;
  void objectKey;
  void thumbKey;
  void source;
  return { ...publicPhoto, location: publicLocation, ...(publicCamera ? { camera: publicCamera } : {}) };
}

export function toPublicArticleFolders(folders: Array<FolderRecord & { count?: number; items?: ArticleRecord[]; articles?: ArticleRecord[] }>) {
  return folders.map(({ items, articles, ...folder }) => ({
    ...folder,
    count: folder.count || 0,
    items: (items || articles || []).map((article) => toPublicArticle(article)),
  }));
}

export function toPublicImageFolders(folders: Array<FolderRecord & { count?: number; items?: PhotoRecord[]; photos?: PhotoRecord[] }>) {
  return folders.map(({ items, photos, ...folder }) => ({
    ...folder,
    count: folder.count || 0,
    items: (items || photos || []).map(toPublicPhoto),
  }));
}

export async function listPublicArticles(env: Env) {
  const data = await listArticles(env);
  return { folders: toPublicArticleFolders(data.folders), articles: data.articles.map((article) => toPublicArticle(article)) };
}

export async function listPublicPhotos(env: Env) {
  const data = await listPhotos(env);
  return { folders: toPublicImageFolders(data.folders), photos: data.photos.map(toPublicPhoto) };
}

export async function listArticles(env: Env, options: { includePrivate?: boolean } = {}) {
  const tombstones = await readTombstones(env);
  const migrations = await readMigrations(env, "articles");
  const map = new Map<string, ArticleRecord>();
  for (const article of seedArticleRecords()) map.set(articleId(article), article);
  for (const article of await uploadedArticles(env)) map.set(articleId(article), article);
  const deleted = new Set(tombstones.articles);
  for (const migration of migrations) {
    const targetExists = map.has(migration.to) && !deleted.has(migration.to);
    if (targetExists) {
      map.delete(migration.from);
      deleted.add(migration.from);
    } else {
      // A failed migration must not strand the source record behind a tombstone.
      deleted.delete(migration.from);
    }
  }
  for (const id of deleted) map.delete(id);
  const articles = sortByDateDesc([...map.values()]).filter(
    (article) => options.includePrivate || article.status === "published",
  );
  const folderRecords = await listFolderRecords(env, "articles");
  const deletedFolders = await readDeletedFolderSlugs(env, "articles");
  const missingFolders = articles
    .filter((article) => !deletedFolders.has(article.folder))
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

async function writeNewArticle(env: Env, article: ArticleRecord) {
  const markdown = await withR2TransientRetry(() => env.MEDIA_BUCKET.put(article.objectKey, serializeArticleMarkdown(article), {
    httpMetadata: { contentType: "text/markdown; charset=utf-8" },
    onlyIf: new Headers({ "If-None-Match": "*" }),
  }));
  if (!markdown) throw new ApiError("conflict", "An article already uses this folder and slug.", 409);

  const record = await putJsonIfAbsent(env.MEDIA_BUCKET, article.jsonKey, article);
  if (!record) {
    const current = await env.MEDIA_BUCKET.get(article.objectKey);
    if (current?.etag === markdown.etag) await env.MEDIA_BUCKET.delete(article.objectKey);
    throw new ApiError("conflict", "An article already uses this folder and slug.", 409);
  }
  return article;
}

export async function createArticle(env: Env, input: Partial<ArticleRecord>) {
  const folder = String(input.folder || "");
  const slug = String(input.slug || "");
  validateArticleSlug(folder, slug);
  if (await getArticle(env, folder, slug, { includePrivate: true })) {
    throw new ApiError("conflict", "An article already uses this folder and slug.", 409, { folder, slug });
  }
  const article = normalizeArticle({ ...input, folder, slug, updatedAt: nowIso() }, "r2");
  await writeNewArticle(env, article);
  await removeTombstone(env, "articles", articleId(article));
  return article;
}

async function sha256(bytes: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function copyArticleAssets(env: Env, oldFolder: string, oldSlug: string, nextFolder: string, nextSlug: string) {
  const oldPrefix = `articles/${oldFolder}/${oldSlug}/assets/`;
  const nextPrefix = `articles/${nextFolder}/${nextSlug}/assets/`;
  const created: Array<{ key: string; etag: string }> = [];
  for (const source of await listAllObjects(env.MEDIA_BUCKET, oldPrefix)) {
    const sourceObject = await env.MEDIA_BUCKET.get(source.key);
    if (!sourceObject) continue;
    const bytes = await sourceObject.arrayBuffer();
    const nextKey = `${nextPrefix}${source.key.slice(oldPrefix.length)}`;
    const write = await withR2TransientRetry(() => env.MEDIA_BUCKET.put(nextKey, bytes, {
      httpMetadata: sourceObject.httpMetadata,
      onlyIf: new Headers({ "If-None-Match": "*" }),
    }));
    if (!write) {
      const existing = await env.MEDIA_BUCKET.get(nextKey);
      if (!existing || existing.size !== bytes.byteLength || (await sha256(await existing.arrayBuffer())) !== (await sha256(bytes))) {
        throw new ApiError("storage_error", "Article asset migration verification failed.", 503, { key: nextKey });
      }
    } else {
      const verified = await env.MEDIA_BUCKET.get(nextKey);
      if (!verified || verified.size !== bytes.byteLength || (await sha256(await verified.arrayBuffer())) !== (await sha256(bytes))) {
        throw new ApiError("storage_error", "Article asset migration verification failed.", 503, { key: nextKey });
      }
      created.push({ key: nextKey, etag: write.etag });
    }
  }
  return { oldPrefix, nextPrefix, created };
}

function rewriteArticleReferences(value: string, oldFolder: string, oldSlug: string, nextFolder: string, nextSlug: string) {
  const oldPrefix = `articles/${oldFolder}/${oldSlug}/assets/`;
  const nextPrefix = `articles/${nextFolder}/${nextSlug}/assets/`;
  return value
    .replaceAll(`/media/${oldPrefix}`, `/media/${nextPrefix}`)
    .replaceAll(oldPrefix, nextPrefix);
}

async function updateArticleRecord(env: Env, article: ArticleRecord, previousEtag?: string) {
  const previousMarkdown = await env.MEDIA_BUCKET.get(article.objectKey);
  const previousMarkdownBody = previousMarkdown ? await previousMarkdown.arrayBuffer() : undefined;
  const projected = await withR2TransientRetry(() => env.MEDIA_BUCKET.put(article.objectKey, serializeArticleMarkdown(article), {
    httpMetadata: { contentType: "text/markdown; charset=utf-8" },
    onlyIf: previousMarkdown
      ? { etagMatches: previousMarkdown.etag }
      : new Headers({ "If-None-Match": "*" }),
  }));
  if (!projected) throw new ApiError("conflict", "The article changed while you were editing it.", 409);

  const record = previousEtag
    ? await putJsonIfMatch(env.MEDIA_BUCKET, article.jsonKey, previousEtag, article)
    : await putJsonIfAbsent(env.MEDIA_BUCKET, article.jsonKey, article);
  if (record) return;

  if (previousMarkdownBody) {
    const restored = await withR2TransientRetry(() => env.MEDIA_BUCKET.put(article.objectKey, previousMarkdownBody, {
      httpMetadata: { contentType: "text/markdown; charset=utf-8" },
      onlyIf: { etagMatches: projected.etag },
    }));
    if (!restored) {
      throw new ApiError("storage_error", "Article projections diverged while rolling back a concurrent edit.", 503);
    }
  } else {
    const current = await env.MEDIA_BUCKET.get(article.objectKey);
    if (current?.etag === projected.etag) await env.MEDIA_BUCKET.delete(article.objectKey);
  }
  throw new ApiError("conflict", "The article changed while you were editing it.", 409);
}

export async function patchArticle(env: Env, folder: string, slug: string, patch: Partial<ArticleRecord>) {
  validateArticleSlug(folder, slug);
  const currentId = articleId({ folder, slug });
  const inFlightMigration = (await readMigrations(env, "articles")).find((migration) => migration.from === currentId);
  if (inFlightMigration) {
    const target = await readJsonObject<ArticleRecord>(env.MEDIA_BUCKET, articleJsonKeyFromId(inFlightMigration.to));
    if (target) {
      const hasTargetFields = patch.folder !== undefined || patch.slug !== undefined;
      const requestedTarget = `${String(patch.folder || folder)}/${String(patch.slug || slug)}`;
      if (hasTargetFields && requestedTarget !== inFlightMigration.to) {
        throw new ApiError("conflict", "Another article migration is already in progress.", 409, {
          folder,
          slug,
          target: inFlightMigration.to,
        });
      }
      await addTombstone(env, "articles", currentId);
      await deletePrefix(env.MEDIA_BUCKET, `articles/${folder}/${slug}/`);
      await removeMigration(env, "articles", currentId);
      return target.value;
    }
  }
  const existing = await getArticle(env, folder, slug, { includePrivate: true });
  if (!existing) return undefined;

  const nextFolder = String(patch.folder || folder);
  const nextSlug = String(patch.slug || slug);
  validateArticleSlug(nextFolder, nextSlug);
  const nextId = `${nextFolder}/${nextSlug}`;
  const expectedUpdatedAt = typeof (patch as Record<string, unknown>).expectedUpdatedAt === "string"
    ? String((patch as Record<string, unknown>).expectedUpdatedAt)
    : undefined;
  if (expectedUpdatedAt && existing.updatedAt !== expectedUpdatedAt) {
    throw new ApiError("conflict", "The article changed while you were editing it.", 409, {
      expectedUpdatedAt,
      actualUpdatedAt: existing.updatedAt,
    });
  }
  const nextArticle = normalizeArticle(
    {
      ...existing,
      ...patch,
      folder: nextFolder,
      slug: nextSlug,
      markdown: rewriteArticleReferences(String(patch.markdown ?? existing.markdown), folder, slug, nextFolder, nextSlug),
      coverImage: rewriteArticleReferences(String(patch.coverImage ?? existing.coverImage), folder, slug, nextFolder, nextSlug),
      updatedAt: nowIso(),
    },
    "r2",
  );

  if (currentId === nextId) {
    const stored = await readJsonObject<ArticleRecord>(env.MEDIA_BUCKET, existing.jsonKey);
    if (stored) await updateArticleRecord(env, nextArticle, stored.etag);
    else await writeNewArticle(env, nextArticle);
    await removeTombstone(env, "articles", nextId);
    return nextArticle;
  }

  if (await getArticle(env, nextFolder, nextSlug, { includePrivate: true })) {
    throw new ApiError("conflict", "Another article already uses that folder and slug.", 409, {
      folder: nextFolder,
      slug: nextSlug,
    });
  }

  const migration: MigrationRecord = { from: currentId, to: nextId, createdAt: nowIso() };
  const migrationWritten = await putJsonIfAbsent(env.MEDIA_BUCKET, migrationObjectKey("articles", currentId), migration);
  if (!migrationWritten) {
    const currentMigration = await readJson<MigrationRecord>(env.MEDIA_BUCKET, migrationObjectKey("articles", currentId));
    if (!currentMigration || currentMigration.to !== nextId) {
      throw new ApiError("conflict", "Another migration is already in progress for this article.", 409, { folder, slug });
    }
  }
  const createdTargetObjects: Array<{ key: string; etag: string }> = [];
  try {
    const copied = await copyArticleAssets(env, folder, slug, nextFolder, nextSlug);
    createdTargetObjects.push(...copied.created);
    await writeNewArticle(env, nextArticle);
    await removeTombstone(env, "articles", nextId);
    await addTombstone(env, "articles", currentId);
    await deletePrefix(env.MEDIA_BUCKET, `articles/${folder}/${slug}/`);
    await removeMigration(env, "articles", currentId);
    return nextArticle;
  } catch (error) {
    const targetRecord = await readJsonObject<ArticleRecord>(env.MEDIA_BUCKET, articleJsonKey(nextFolder, nextSlug));
    if (!targetRecord) {
      for (const object of createdTargetObjects) {
        const current = await env.MEDIA_BUCKET.get(object.key);
        if (current?.etag === object.etag) await env.MEDIA_BUCKET.delete(object.key);
      }
      await env.MEDIA_BUCKET.delete(articleJsonKey(nextFolder, nextSlug));
      await env.MEDIA_BUCKET.delete(articleKey(nextFolder, nextSlug));
      await removeMigration(env, "articles", currentId);
    }
    throw error;
  }
}

export async function saveArticle(env: Env, input: Partial<ArticleRecord>) {
  return createArticle(env, input);
}

export async function deleteArticle(env: Env, folder: string, slug: string) {
  validateArticleSlug(folder, slug);
  const existing = await getArticle(env, folder, slug, { includePrivate: true });
  if (!existing) return;
  await addTombstone(env, "articles", `${folder}/${slug}`);
  if (existing.source === "r2") await deletePrefix(env.MEDIA_BUCKET, `articles/${folder}/${slug}/`);
  for (const migration of await readMigrations(env, "articles")) {
    if (migration.from === `${folder}/${slug}` || migration.to === `${folder}/${slug}`) {
      await removeMigration(env, "articles", migration.from);
    }
  }
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
  const deletedFolders = await readDeletedFolderSlugs(env, "images");
  const missingFolders = photos
    .filter((photo) => !deletedFolders.has(photo.folder))
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

export async function savePhotoMetadata(env: Env, input: Partial<PhotoRecord> & { expectedUpdatedAt?: string }, options: { createOnly?: boolean } = {}) {
  const folder = String(input.folder || "");
  const id = String(input.id || "");
  validatePhotoPath(folder, id);
  const existing = await getPhoto(env, folder, id, { includePrivate: true });
  const expectedUpdatedAt = typeof input.expectedUpdatedAt === "string"
    ? String(input.expectedUpdatedAt)
    : undefined;
  if (expectedUpdatedAt && existing?.updatedAt !== expectedUpdatedAt) {
    throw new ApiError("conflict", "The image changed while you were editing it.", 409, {
      expectedUpdatedAt,
      actualUpdatedAt: existing?.updatedAt,
    });
  }
  const photo = normalizePhoto(env, { ...existing, ...input, folder, id }, "r2");
  const key = imageMetadataKey(folder, id);
  const stored = await readJsonObject<PhotoRecord>(env.MEDIA_BUCKET, key);
  const written = options.createOnly
    ? await putJsonIfAbsent(env.MEDIA_BUCKET, key, photo)
    : stored
      ? await putJsonIfMatch(env.MEDIA_BUCKET, key, stored.etag, photo)
      : await putJsonIfAbsent(env.MEDIA_BUCKET, key, photo);
  if (!written) throw new ApiError(options.createOnly ? "conflict" : "conflict", "A photo already uses this folder and photoId.", 409);
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
  validateFolderSlug(folder);
  const id = String(metadata.id || `${new Date().toISOString().replaceAll(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`);
  validatePhotoPath(folder, id);
  const objectKey = imageOriginalKey(folder, id, ext);
  const thumbKey = thumb ? imageThumbKey(folder, id, "webp") : objectKey;
  if (await getPhoto(env, folder, id, { includePrivate: true })) {
    throw new ApiError("conflict", "A photo already uses this folder and photoId.", 409, { folder, photoId: id });
  }
  const created: Array<{ key: string; etag: string }> = [];
  try {
    const originalBytes = await file.arrayBuffer();
    const original = await withR2TransientRetry(() => env.MEDIA_BUCKET.put(objectKey, originalBytes, {
      httpMetadata: { contentType: file.type },
      onlyIf: new Headers({ "If-None-Match": "*" }),
    }));
    if (!original) throw new ApiError("conflict", "A photo already uses this folder and photoId.", 409, { folder, photoId: id });
    created.push({ key: objectKey, etag: original.etag });
    if (thumb) {
      const thumbBytes = await thumb.arrayBuffer();
      const thumbWrite = await withR2TransientRetry(() => env.MEDIA_BUCKET.put(thumbKey, thumbBytes, {
        httpMetadata: { contentType: "image/webp" },
        onlyIf: new Headers({ "If-None-Match": "*" }),
      }));
      if (!thumbWrite) throw new ApiError("storage_error", "Could not write image thumbnail.", 503);
      created.push({ key: thumbKey, etag: thumbWrite.etag });
    }
    return await savePhotoMetadata(env, {
      ...metadata,
      id,
      folder,
      objectKey,
      thumbKey,
      imageUrl: mediaUrl(env, objectKey),
      thumbUrl: mediaUrl(env, thumbKey),
    }, { createOnly: true });
  } catch (error) {
    for (const object of created) {
      const current = await env.MEDIA_BUCKET.get(object.key);
      if (current?.etag === object.etag) await env.MEDIA_BUCKET.delete(object.key);
    }
    throw error;
  }
}

export async function patchPhoto(env: Env, folder: string, id: string, patch: PhotoPatch) {
  const existing = await getPhoto(env, folder, id, { includePrivate: true });
  if (!existing) return undefined;
  const patchLocation = isRecord(patch.location) ? patch.location : {};
  const patchCamera = isRecord(patch.camera) ? patch.camera : undefined;
  const location = { ...existing.location, ...patchLocation };
  if (patchLocation.latitude === null) delete location.latitude;
  if (patchLocation.longitude === null) delete location.longitude;
  const camera = patchCamera ? { ...(existing.camera || {}), ...patchCamera } : existing.camera;
  return savePhotoMetadata(env, {
    ...existing,
    ...patch,
    folder,
    id,
    location,
    camera,
    objectKey: existing.objectKey,
    thumbKey: existing.thumbKey,
    imageUrl: mediaUrl(env, existing.objectKey),
    thumbUrl: mediaUrl(env, existing.thumbKey),
    expectedUpdatedAt: existing.updatedAt,
  });
}

export async function deletePhoto(env: Env, folder: string, id: string) {
  validatePhotoPath(folder, id);
  const existing = await getPhoto(env, folder, id, { includePrivate: true });
  if (!existing) return;
  await addTombstone(env, "images", `${folder}/${id}`);
  if (existing.source === "r2") await deletePrefix(env.MEDIA_BUCKET, `images/${folder}/${id}/`);
}
