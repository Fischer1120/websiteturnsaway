# 03 Cloudflare 后端与 R2 流程

本文件定义 Cloudflare 后端、R2 存储、API 路由、上传预留和安全策略。实现 agent 开始编码前，应核对 Cloudflare 官方文档中的最新配置方式。

## 官方文档入口

- Cloudflare Pages Functions bindings: https://developers.cloudflare.com/pages/functions/bindings/
- Cloudflare Workers bindings: https://developers.cloudflare.com/workers/runtime-apis/bindings/
- Wrangler configuration: https://developers.cloudflare.com/workers/wrangler/configuration/
- R2 object uploads: https://developers.cloudflare.com/r2/objects/upload-objects/
- R2 multipart uploads from Workers: https://developers.cloudflare.com/r2/api/workers/workers-multipart-usage/

## 推荐后端形态

优先使用 Cloudflare Pages + Pages Functions：

- 前端静态资源和 API 在同一 Pages 项目内。
- R2 bucket 通过 binding 暴露给 Functions。
- API 路由靠 `functions/api/...` 或框架 adapter 管理。

如果项目后续需要独立扩展 API，可迁移为独立 Worker。API 路径和响应格式应保持一致。

## R2 bucket 规划

建议创建一个媒体 bucket：

```text
website-turns-away-media
```

绑定名：

```text
MEDIA_BUCKET
```

对象类型：

- 图片原图。
- 图片缩略图。
- 文章插图。
- 图片元数据 JSON。
- 上传后的文章 Markdown 或 JSON。
- 列表索引 JSON。

## 环境变量与 binding

需要预留：

```text
MEDIA_BUCKET            R2 bucket binding
PUBLIC_MEDIA_BASE_URL   可选，公开媒体域名
ADMIN_TOKEN_SECRET      管理接口鉴权密钥
ALLOWED_ORIGINS         管理后台允许来源
GEOCODING_API_KEY       可选，地点反查服务
```

示例配置形态，具体以官方文档最新写法为准：

```toml
name = "website-turns-away"
compatibility_date = "2026-05-31"

[[r2_buckets]]
binding = "MEDIA_BUCKET"
bucket_name = "website-turns-away-media"
```

## API 响应格式

成功响应：

```json
{
  "ok": true,
  "data": {}
}
```

失败响应：

```json
{
  "ok": false,
  "error": {
    "code": "invalid_request",
    "message": "Human readable message",
    "details": {}
  }
}
```

错误码建议：

```text
invalid_request
unauthorized
forbidden
not_found
payload_too_large
unsupported_media_type
storage_error
metadata_error
```

## 文章 API

```text
GET /api/articles
```

返回所有文章文件夹和文章摘要。

```text
GET /api/articles/:folder
```

返回某文件夹下文章摘要。

```text
GET /api/articles/:folder/:slug
```

返回文章 Markdown、frontmatter 和解析后目录。

```text
POST /api/admin/articles
```

预留上传或保存文章。第一版可以返回 `501 not_implemented`，但必须定义请求格式。

请求格式建议：

```json
{
  "folder": "notes",
  "slug": "monolith-at-sunset",
  "frontmatter": {
    "title": "黄昏中的方碑",
    "subtitle": "一次关于城市边缘与几何记忆的记录"
  },
  "markdown": "# 黄昏中的方碑\n\n## 第一段路\n\n正文。"
}
```

```text
POST /api/admin/articles/:folder/:slug/assets
```

上传文章插图到：

```text
articles/{folder}/{slug}/assets/{filename}
```

## 图片 API

```text
GET /api/images
```

返回图片文件夹和推荐图片。

```text
GET /api/images/:folder
```

返回某文件夹下图片摘要。

```text
GET /api/images/:folder/:photoId
```

返回图片详情和元数据。

```text
POST /api/admin/images
```

上传图片，保存原图和元数据。

支持 `multipart/form-data`：

```text
file: binary
folder: string
metadata: JSON string
```

保存对象：

```text
images/{folder}/{photoId}/original.{ext}
images/{folder}/{photoId}/metadata.json
```

```text
PATCH /api/admin/images/:folder/:photoId/metadata
```

更新图片标题、描述、地点标签、可见性等字段。

## 上传流程

小文件第一版流程：

1. 浏览器读取 EXIF。
2. 浏览器提交 `multipart/form-data` 到 Worker 或 Pages Function。
3. 后端验证鉴权、文件类型、大小和 folder。
4. 后端写入 R2。
5. 后端写入 `metadata.json`。
6. 后端更新 `indexes/images/{folder}.json` 和 `indexes/images.json`。
7. 返回图片详情 URL。

大文件或批量上传预留：

- 后端生成预签名上传 URL。
- 或使用 R2 multipart API。
- 上传完成后调用 finalize API 写入元数据和索引。

## 安全要求

- 所有 `/api/admin/*` 都必须鉴权。
- 不接受任意 R2 key，由后端根据 folder、slug、photoId 生成 key。
- 限制文件类型为安全图片格式，例如 JPEG、PNG、WebP。
- 限制文件大小，超限返回 `payload_too_large`。
- 所有用户可编辑文本都必须在渲染层做转义或可信 Markdown 清洗。
- 位置数据默认降精度展示。

## 缓存策略

- 图片原图和缩略图可以设置长缓存。
- `metadata.json` 和 `indexes/*.json` 设置短缓存或通过版本号失效。
- 文章详情可以静态生成，也可以按需从 R2 读取。

## 后续扩展预留

当文章和图片数量增多时，可增加：

- D1：保存文章、图片、文件夹、标签和搜索索引。
- KV：缓存列表索引。
- Queues：异步生成缩略图、清洗 EXIF、刷新索引。
- Images 或第三方图像服务：生成多尺寸图片。

第一版不要强依赖这些扩展，但类型定义和 API 命名应避免阻碍迁移。
