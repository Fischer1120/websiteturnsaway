import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";

import { onRequestGet as getPublicArticles } from "../functions/api/articles/index";
import { onRequestGet as getPublicImages } from "../functions/api/images/index";
import { onRequestGet as getPublicImageMap } from "../functions/api/images/map";
import { onRequestPost as createAdminArticle } from "../functions/api/admin/articles";
import { onRequestPost as uploadAdminImage } from "../functions/api/admin/images";
import { onRequestGet as getMedia } from "../functions/media/[[path]]";
import { onRequestGet as getArticleDetailPage } from "../functions/articles/[folder]/[slug]";
import { onRequestGet as getImagesPage } from "../functions/images/index";
import { onRequestGet as getImageDetailPage } from "../functions/images/[folder]/[photoId]";
import { onRequestGet as getPublicArticleDetail } from "../functions/api/articles/[folder]/[slug]";
import { markdownToHtml } from "../functions/_shared/markdown";
import { createArticle, deleteFolderRecord, patchArticle, patchPhoto, savePhotoMetadata } from "../functions/_shared/content";
import { deletePrefix, listAllObjects, withR2TransientRetry } from "../functions/_shared/r2";
import type { FunctionContext } from "../functions/_shared/responses";

const token = "codex-test-admin-token";
const createdKeys: string[] = [];
const fixturePrefixes = new Set<string>();

function trackArticleFixture(folder: string) {
  fixturePrefixes.add(`articles/${folder}/`);
  fixturePrefixes.add(`indexes/tombstones/articles/${folder}/`);
  fixturePrefixes.add(`indexes/migrations/articles/${folder}/`);
}

function trackImageFixture(folder: string) {
  fixturePrefixes.add(`images/${folder}/`);
  fixturePrefixes.add(`indexes/tombstones/images/${folder}/`);
}

function requestContext(request: Request, params: Record<string, string | string[]> = {}) {
  return { request, env, params } as unknown as FunctionContext;
}

function adminRequest(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return new Request(url, { ...init, headers });
}

function webpFixture(width = 320, height = 240) {
  const chunk = (type: string, payload: number[]) => {
    const bytes = new Uint8Array(8 + payload.length + (payload.length % 2));
    bytes.set([...type].map((value) => value.charCodeAt(0)), 0);
    new DataView(bytes.buffer).setUint32(4, payload.length, true);
    bytes.set(payload, 8);
    return bytes;
  };
  const body = new Uint8Array([
    ...chunk("VP8X", [0, 0, 0, 0, (width - 1) & 0xff, ((width - 1) >> 8) & 0xff, (width - 1) >> 16, (height - 1) & 0xff, ((height - 1) >> 8) & 0xff, (height - 1) >> 16]),
    ...chunk("VP8 ", [0, 0, 0, 0x9d, 0x01, 0x2a, width & 0xff, (width >> 8) & 0xff, height & 0xff, (height >> 8) & 0xff]),
  ]);
  const result = new Uint8Array(12 + body.length);
  result.set([..."RIFF"].map((value) => value.charCodeAt(0)), 0);
  new DataView(result.buffer).setUint32(4, result.length - 8, true);
  result.set([..."WEBP"].map((value) => value.charCodeAt(0)), 8);
  result.set(body, 12);
  return result;
}

async function readPayload(response: Response) {
  return (await response.json()) as {
    ok: boolean;
    data?: Record<string, unknown>;
    error?: { code: string; details?: Record<string, unknown> };
  };
}

afterEach(async () => {
  for (const prefix of fixturePrefixes) {
    for (const object of await listAllObjects(env.MEDIA_BUCKET, prefix)) {
      await env.MEDIA_BUCKET.delete(object.key);
    }
  }
  fixturePrefixes.clear();
  for (const key of new Set(createdKeys.splice(0))) {
    await env.MEDIA_BUCKET.delete(key);
  }
});

describe("CMS security and API contracts", () => {
  it("retries transient R2 throttling without retrying non-transient errors", async () => {
    let attempts = 0;
    const result = await withR2TransientRetry(async () => {
      attempts += 1;
      if (attempts < 3) throw Object.assign(new Error("throttled"), { status: 429 });
      return "ok";
    });
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("sanitizes unsafe Markdown destinations", () => {
    const html = markdownToHtml("[bad](javascript:alert(1)) ![bad](//evil.example/a.png)");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("//evil.example");
    expect(html).toContain('href="#"');
  });

  it("does not expose internal fields or exact GPS coordinates in public DTOs", async () => {
    const articleResponse = await getPublicArticles(requestContext(new Request("https://test.local/api/articles")));
    expect(articleResponse.headers.get("cache-control")).toBe("no-store");
    expect(articleResponse.headers.get("x-content-type-options")).toBe("nosniff");
    const articlePayload = await readPayload(articleResponse);
    const article = (articlePayload.data?.articles as Array<Record<string, unknown>>)[0];
    expect(article).not.toHaveProperty("objectKey");
    expect(article).not.toHaveProperty("jsonKey");
    expect(article).not.toHaveProperty("source");
    expect(article).not.toHaveProperty("markdown");

    const articleDetailResponse = await getPublicArticleDetail(
      requestContext(new Request("https://test.local/api/articles/notes/monolith-at-sunset"), {
        folder: "notes",
        slug: "monolith-at-sunset",
      }),
    );
    const articleDetailPayload = await readPayload(articleDetailResponse);
    expect(articleDetailPayload.data?.markdown).toContain("第一段路");

    const imageResponse = await getPublicImages(requestContext(new Request("https://test.local/api/images")));
    const imagePayload = await readPayload(imageResponse);
    const photo = (imagePayload.data?.photos as Array<Record<string, unknown>>)[0];
    expect(photo).not.toHaveProperty("objectKey");
    expect(photo).not.toHaveProperty("thumbKey");
    expect(photo).not.toHaveProperty("source");
    expect(photo.location).not.toHaveProperty("latitude");
    expect(photo.location).not.toHaveProperty("longitude");
    expect(JSON.stringify(photo)).not.toContain("gps");
    expect(JSON.stringify(photo)).not.toContain("exif");
  });

  it("isolates malformed article metadata from the public collection", async () => {
    const folder = `codex-fix-corrupt-${crypto.randomUUID().slice(0, 8)}`;
    trackArticleFixture(folder);
    await env.MEDIA_BUCKET.put(`articles/${folder}/broken/index.json`, "not-json");
    const response = await getPublicArticles(requestContext(new Request("https://test.local/api/articles")));
    expect(response.status).toBe(200);
    const payload = await readPayload(response);
    expect(payload.ok).toBe(true);
  });

  it("rejects stale article writes with a structured conflict", async () => {
    const folder = `codex-fix-stale-${crypto.randomUUID().slice(0, 8)}`;
    const slug = `article-${crypto.randomUUID().slice(0, 8)}`;
    trackArticleFixture(folder);
    const article = await createArticle(env, { folder, slug, title: "Before", status: "published", markdown: "body" });
    const updated = await patchArticle(env, folder, slug, { title: "After" });
    expect(updated?.title).toBe("After");
    await expect(
      patchArticle(env, folder, slug, { title: "Stale", expectedUpdatedAt: article.updatedAt } as never),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("recovers an interrupted article migration when the target record exists", async () => {
    const folder = `codex-fix-recover-${crypto.randomUUID().slice(0, 8)}`;
    const slug = `before-${crypto.randomUUID().slice(0, 8)}`;
    const nextFolder = `${folder}-next`;
    const nextSlug = `after-${crypto.randomUUID().slice(0, 8)}`;
    trackArticleFixture(folder);
    trackArticleFixture(nextFolder);
    const source = await createArticle(env, { folder, slug, title: "Source", status: "published", markdown: "body" });
    const target = await createArticle(env, { folder: nextFolder, slug: nextSlug, title: "Target", status: "published", markdown: "body" });
    await env.MEDIA_BUCKET.put(
      `indexes/migrations/articles/${folder}/${slug}.json`,
      JSON.stringify({ from: `${folder}/${slug}`, to: `${nextFolder}/${nextSlug}`, createdAt: new Date().toISOString() }),
    );
    const recovered = await patchArticle(env, folder, slug, {});
    expect(recovered?.folder).toBe(nextFolder);
    expect(recovered?.slug).toBe(nextSlug);
    expect(await env.MEDIA_BUCKET.get(source.objectKey)).toBeNull();
    expect(await env.MEDIA_BUCKET.get(target.jsonKey)).not.toBeNull();
  });

  it("rejects deletion of a non-empty folder", async () => {
    const folder = `codex-fix-nonempty-${crypto.randomUUID().slice(0, 8)}`;
    const slug = `article-${crypto.randomUUID().slice(0, 8)}`;
    trackArticleFixture(folder);
    await createArticle(env, { folder, slug, title: "Non-empty folder", status: "published", markdown: "body" });
    await expect(deleteFolderRecord(env, "articles", folder)).rejects.toMatchObject({ status: 409 });
  });

  it("deletes more than one thousand objects in bounded batches", async () => {
    const folder = `codex-fix-batch-${crypto.randomUUID().slice(0, 8)}`;
    const slug = `article-${crypto.randomUUID().slice(0, 8)}`;
    trackArticleFixture(folder);
    const prefix = `articles/${folder}/${slug}/assets/`;
    for (let index = 0; index < 1001; index += 1) {
      await env.MEDIA_BUCKET.put(`${prefix}${index}.png`, "x");
    }
    await deletePrefix(env.MEDIA_BUCKET, `articles/${folder}/${slug}/`);
    expect(await listAllObjects(env.MEDIA_BUCKET, prefix)).toHaveLength(0);
  });

  it("rejects anonymous access to index and non-public media keys", async () => {
    const key = `indexes/codex-fix-${crypto.randomUUID()}.json`;
    createdKeys.push(key);
    await env.MEDIA_BUCKET.put(key, "private index");

    const response = await getMedia(
      requestContext(new Request("https://test.local/media/${key}"), { path: key.split("/") }),
    );

    expect(response.status).toBe(404);
  });

  it("returns a structured 400 for an invalid explicit article status", async () => {
    const folder = `codex-fix-${crypto.randomUUID().slice(0, 8)}`;
    const slug = `status-${crypto.randomUUID().slice(0, 8)}`;
    const response = await createAdminArticle(
      requestContext(
        adminRequest("https://test.local/api/admin/articles", {
          method: "POST",
          body: JSON.stringify({ folder, slug, title: "Invalid status", status: "publsihed", markdown: "body" }),
        }),
      ),
    );
    const payload = await readPayload(response);
    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("invalid_request");
  });

  it("makes duplicate article POST create-only under concurrency", async () => {
    const folder = `codex-fix-${crypto.randomUUID().slice(0, 8)}`;
    trackArticleFixture(folder);
    const slug = `duplicate-${crypto.randomUUID().slice(0, 8)}`;
    const body = JSON.stringify({ folder, slug, title: "First writer wins", status: "draft", markdown: "body" });
    const responses = await Promise.all(
      [0, 1].map(() =>
        createAdminArticle(
          requestContext(
            adminRequest("https://test.local/api/admin/articles", {
              method: "POST",
              body,
            }),
          ),
        ),
      ),
    );
    const statuses = responses.map((response) => response.status).sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);
  });

  it("keeps twenty unique concurrent article creates visible", async () => {
    const folder = `codex-fix-${crypto.randomUUID().slice(0, 8)}`;
    trackArticleFixture(folder);
    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        createAdminArticle(
          requestContext(
            adminRequest("https://test.local/api/admin/articles", {
              method: "POST",
              body: JSON.stringify({ folder, slug: `article-${index}`, title: `Article ${index}`, status: "published", markdown: `body ${index}` }),
            }),
          ),
        ),
      ),
    );
    expect(responses.every((response) => response.status === 201)).toBe(true);
    const listed = await getPublicArticles(requestContext(new Request("https://test.local/api/articles")));
    const payload = await readPayload(listed);
    const articles = (payload.data?.articles as Array<Record<string, unknown>>).filter((article) => article.folder === folder);
    expect(articles).toHaveLength(20);
  });

  it("does not upload an article asset before the article exists", async () => {
    const folder = `codex-fix-${crypto.randomUUID().slice(0, 8)}`;
    trackArticleFixture(folder);
    const slug = `missing-${crypto.randomUUID().slice(0, 8)}`;
    const form = new FormData();
    form.set("file", new File(["fake"], "figure.png", { type: "image/png" }));
    const module = await import("../functions/api/admin/articles/[folder]/[slug]/assets");
    const response = await module.onRequestPost(
      requestContext(
        adminRequest(`https://test.local/api/admin/articles/${folder}/${slug}/assets`, {
          method: "POST",
          body: form,
        }),
        { folder, slug },
      ),
    );
    expect(response.status).toBe(404);
  });

  it("deep merges photo location metadata during a partial patch", async () => {
    const folder = `codex-fix-${crypto.randomUUID().slice(0, 8)}`;
    trackImageFixture(folder);
    const id = `photo-${crypto.randomUUID().slice(0, 8)}`;
    const objectKey = `images/${folder}/${id}/original.png`;
    const thumbKey = `images/${folder}/${id}/thumb.webp`;
    createdKeys.push(objectKey, thumbKey);
    await env.MEDIA_BUCKET.put(objectKey, "original");
    await env.MEDIA_BUCKET.put(thumbKey, "thumb");
    await savePhotoMetadata(env, {
      id,
      folder,
      title: "Before",
      objectKey,
      thumbKey,
      location: { label: "Shanghai", latitude: 31.2, longitude: 121.4, precision: "city" },
      visibility: "public",
    });

    const patched = await patchPhoto(env, folder, id, { title: "After", location: { label: "New label" } });
    expect(patched?.title).toBe("After");
    expect(patched?.location.latitude).toBe(31.2);
    expect(patched?.location.longitude).toBe(121.4);
  });

  it("turns malformed image metadata into a structured JSON 400", async () => {
    const form = new FormData();
    form.set("folder", "city-walk");
    form.set("metadata", "{");
    form.set("file", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "photo.png", { type: "image/png" }));
    form.set("display", new File([webpFixture()], "display.webp", { type: "image/webp" }));
    form.set("thumb", new File([webpFixture(180, 120)], "thumb.webp", { type: "image/webp" }));
    const response = await uploadAdminImage(
      requestContext(
        adminRequest("https://test.local/api/admin/images", {
          method: "POST",
          body: form,
        }),
      ),
    );
    const payload = await readPayload(response);
    expect(response.status).toBe(400);
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("invalid_request");
  });

  it("serves only safe public display/thumb aliases and immediately revokes private media", async () => {
    const folder = `codex-fix-${crypto.randomUUID().slice(0, 8)}`;
    trackImageFixture(folder);
    const id = `photo-${crypto.randomUUID().slice(0, 8)}`;
    const objectKey = `images/${folder}/${id}/original.png`;
    const displayKey = `images/${folder}/${id}/display.webp`;
    const thumbKey = `images/${folder}/${id}/thumb.webp`;
    createdKeys.push(objectKey, thumbKey);
    await env.MEDIA_BUCKET.put(objectKey, "original");
    await env.MEDIA_BUCKET.put(displayKey, webpFixture(640, 480), { httpMetadata: { contentType: "image/webp" } });
    await env.MEDIA_BUCKET.put(thumbKey, webpFixture(180, 120), { httpMetadata: { contentType: "image/webp" } });
    await savePhotoMetadata(env, { id, folder, title: "Public photo", objectKey, displayKey, thumbKey, visibility: "public", location: { label: "Shanghai", precision: "city" } });

    const originalResponse = await getMedia(requestContext(new Request("https://test.local/media"), { path: objectKey.split("/") }));
    expect(originalResponse.status).toBe(404);
    const displayResponse = await getMedia(requestContext(new Request("https://test.local/media"), { path: ["images", folder, id, "display.webp"] }));
    expect(displayResponse.status).toBe(200);
    expect(displayResponse.headers.get("content-type")).toBe("image/webp");
    expect(displayResponse.headers.get("x-content-type-options")).toBe("nosniff");
    expect(displayResponse.headers.get("cache-control")).toBe("no-store");
    const thumbResponse = await getMedia(requestContext(new Request("https://test.local/media"), { path: ["images", folder, id, "thumb.webp"] }));
    expect(thumbResponse.status).toBe(200);

    await patchPhoto(env, folder, id, { visibility: "private" });
    expect((await getMedia(requestContext(new Request("https://test.local/media"), { path: ["images", folder, id, "display.webp"] }))).status).toBe(404);
    expect((await getMedia(requestContext(new Request("https://test.local/media"), { path: ["images", folder, id, "thumb.webp"] }))).status).toBe(404);
  });

  it("returns only quantized public photo map points", async () => {
    const response = await getPublicImageMap(requestContext(new Request("https://test.local/api/images/map")));
    const payload = await readPayload(response);
    expect(response.status).toBe(200);
    const points = payload.data as unknown as Array<Record<string, unknown>>;
    expect(points.length).toBeGreaterThan(0);
    expect(JSON.stringify(points)).not.toContain("31.2304");
    expect(JSON.stringify(points)).not.toContain("121.4737");
    expect(points[0].location).toMatchObject({ precision: "city", accuracyMeters: 10000 });
    expect((points[0].location as Record<string, unknown>).latitude).toBe(31.2);
  });

  it("rejects reserved asset names, unsupported image extensions, and serves HEAD safely", async () => {
    const folder = `codex-fix-${crypto.randomUUID().slice(0, 8)}`;
    trackArticleFixture(folder);
    trackImageFixture(folder);
    const slug = `media-${crypto.randomUUID().slice(0, 8)}`;
    const article = await createArticle(env, { folder, slug, title: "Reserved asset checks", status: "published", markdown: "body" });
    const reservedKey = `articles/${folder}/${slug}/assets/index.json`;
    await env.MEDIA_BUCKET.put(reservedKey, "not public");
    const reserved = await getMedia(requestContext(new Request("https://test.local/media"), { path: reservedKey.split("/") }));
    expect(reserved.status).toBe(404);

    const photoId = `photo-${crypto.randomUUID().slice(0, 8)}`;
    const invalidKey = `images/${folder}/${photoId}/original.json`;
    await env.MEDIA_BUCKET.put(invalidKey, "not an image");
    const invalid = await getMedia(requestContext(new Request("https://test.local/media"), { path: invalidKey.split("/") }));
    expect(invalid.status).toBe(404);

    const assetKey = `articles/${folder}/${slug}/assets/figure.png`;
    await env.MEDIA_BUCKET.put(assetKey, "figure");
    const headModule = await import("../functions/media/[[path]]");
    const head = await headModule.onRequestHead(requestContext(new Request("https://test.local/media", { method: "HEAD" }), { path: assetKey.split("/") }));
    expect(head.status).toBe(200);
    expect(head.headers.get("x-content-type-options")).toBe("nosniff");
    void article;
  });

  it("migrates article assets with the article and invalidates the old public media path", async () => {
    const folder = `codex-fix-${crypto.randomUUID().slice(0, 8)}`;
    const slug = `before-${crypto.randomUUID().slice(0, 8)}`;
    const nextFolder = `${folder}-next`;
    trackArticleFixture(folder);
    trackArticleFixture(nextFolder);
    const nextSlug = `after-${crypto.randomUUID().slice(0, 8)}`;
    const article = await createArticle(env, { folder, slug, title: "Before migration", status: "published", markdown: "![figure](/media/articles/${folder}/${slug}/assets/figure.png)" });
    const oldAssetKey = `articles/${folder}/${slug}/assets/figure.png`;
    const nextAssetKey = `articles/${nextFolder}/${nextSlug}/assets/figure.png`;
    await env.MEDIA_BUCKET.put(oldAssetKey, "figure");
    const migrated = await patchArticle(env, folder, slug, { folder: nextFolder, slug: nextSlug, title: "After migration" });
    expect(migrated?.folder).toBe(nextFolder);
    expect((await getMedia(requestContext(new Request("https://test.local/media"), { path: oldAssetKey.split("/") }))).status).toBe(404);
    expect((await getMedia(requestContext(new Request("https://test.local/media"), { path: nextAssetKey.split("/") }))).status).toBe(200);
    expect((await env.MEDIA_BUCKET.get(nextAssetKey))?.size).toBe(6);
    void article;
  });

  it("renders a newly published article and hides it after it becomes a draft", async () => {
    const folder = `codex-fix-${crypto.randomUUID().slice(0, 8)}`;
    const slug = `published-${crypto.randomUUID().slice(0, 8)}`;
    trackArticleFixture(folder);
    await createArticle(env, {
      folder,
      slug,
      title: "Published route regression",
      status: "published",
      markdown: "## Browser body\n\nThe public route must render this content.",
    });

    const published = await getArticleDetailPage(
      requestContext(new Request(`https://test.local/articles/${folder}/${slug}`), { folder, slug }),
    );
    const publishedHtml = await published.text();
    expect(published.status).toBe(200);
    expect(published.headers.get("cache-control")).toBe("no-store");
    expect(publishedHtml).toContain("Published route regression");
    expect(publishedHtml).toContain("Browser body");
    expect(publishedHtml).not.toContain("LOADING / FETCHING CONTENT INDEX");

    await patchArticle(env, folder, slug, { status: "draft" });
    const draft = await getArticleDetailPage(
      requestContext(new Request(`https://test.local/articles/${folder}/${slug}`), { folder, slug }),
    );
    expect(draft.status).toBe(404);
  });

  it("does not serve draft article assets and renders public image pages without JavaScript", async () => {
    const folder = `codex-fix-${crypto.randomUUID().slice(0, 8)}`;
    trackArticleFixture(folder);
    const slug = `asset-${crypto.randomUUID().slice(0, 8)}`;
    const article = await createArticle(env, { folder, slug, title: "Public asset article", status: "published", markdown: "## Body\n\nA link: [example](https://example.com)." });
    const assetKey = `articles/${folder}/${slug}/assets/figure.png`;
    createdKeys.push(article.objectKey, article.jsonKey, assetKey);
    await env.MEDIA_BUCKET.put(assetKey, "figure");
    const publicAsset = await getMedia(requestContext(new Request("https://test.local/media"), { path: assetKey.split("/") }));
    expect(publicAsset.status).toBe(200);

    await patchArticle(env, folder, slug, { status: "draft" });
    const draftAsset = await getMedia(requestContext(new Request("https://test.local/media"), { path: assetKey.split("/") }));
    expect(draftAsset.status).toBe(404);

    const page = await getImagesPage(requestContext(new Request("https://test.local/images")));
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html).toContain("图片栏目");
    expect(html).not.toContain("LOADING / FETCHING CONTENT INDEX");

    const detail = await getImageDetailPage(requestContext(new Request("https://test.local/images/city-walk/20260531-184200-a1b2"), { folder: "city-walk", photoId: "20260531-184200-a1b2" }));
    const detailHtml = await detail.text();
    expect(detail.status).toBe(200);
    expect(detailHtml).toContain("粉色天空下的球体");
    expect(detailHtml).not.toContain("31.2304");
    expect(detailHtml).not.toContain("objectKey");
  });
});
