# Website Turns Away 网站维护说明书

本文档用于维护当前 Astro + Cloudflare Pages Functions + R2 版本的网站。最终视觉方向为 **B 方案：Orbital Monolith Index**。

## 当前线上状态

上线信息：

- 正式域名：`https://zero-bytes-turns-away.red`
- Cloudflare Pages 项目：`website-turns-away`
- Pages 默认域名：`https://website-turns-away.pages.dev`
- 最新部署别名：`https://e63ee05b.website-turns-away.pages.dev`
- R2 正式 bucket：`website-turns-away-media`
- R2 预览 bucket：`website-turns-away-media-preview`
- 自定义域名状态：`active`
- DNS 记录：`zero-bytes-turns-away.red CNAME website-turns-away.pages.dev`，Cloudflare 代理开启
- `ADMIN_TOKEN_SECRET` 已在 Cloudflare Pages 项目中设置，值不要写入仓库

上线后已验证：

```text
GET https://zero-bytes-turns-away.red
GET https://zero-bytes-turns-away.red/api/articles
GET https://zero-bytes-turns-away.red/api/images
```

均返回成功响应。未携带管理 token 访问 `/api/admin/*` 应返回 `unauthorized`。

## 1. 本地运行

```bash
npm install
npm run dev
```

默认本地地址为：

```text
http://localhost:4321
```

构建与检查：

```bash
npm run check
npm run build
```

Cloudflare Pages Functions 本地预览：

```bash
npm run build
npm run pages:dev
```

## 2. 目录说明

```text
content/
  articles/       本地种子文章，按 folder/slug/index.md 存放
  images/         本地种子图片 metadata.json sidecar
public/assets/    示例视觉资产
src/
  components/     Route Matrix、RecordCard、FolderRows、MetadataSidecar
  layouts/        全站 HTML 布局
  lib/content.ts  内容读取、Markdown 渲染、folder 索引、R2 key 工具
  pages/          Astro 静态页面
functions/
  api/            Cloudflare Pages Functions API
  _shared/        API 响应、鉴权、R2 key、seed fallback
design/concepts/  三套设计方案与审核截图
workflows/        项目实施工作流文档
```

## 3. 添加文章

文章路径格式：

```text
content/articles/{folder}/{slug}/index.md
```

命名规则：

- `folder` 和 `slug` 使用小写英文、数字和短横线。
- frontmatter 必须包含 `title`、`subtitle`、`summary`、`coverImage`、`publishedAt`、`updatedAt`。
- 正文支持 `##` 和 `###` 标题。
- 正文插图使用 Markdown 图片语法，并填写 alt 与 caption。

示例：

```markdown
---
title: "黄昏中的方碑"
subtitle: "一次关于城市边缘与几何记忆的记录"
folder: "notes"
slug: "monolith-at-sunset"
summary: "穿过一条笔直道路后，建筑像沉默的仪器一样排列在远处。"
coverImage: "/assets/media/monolith-at-sunset.svg"
publishedAt: "2026-05-31T18:42:00+08:00"
updatedAt: "2026-05-31T18:42:00+08:00"
tags: ["city", "geometry", "photo"]
status: "published"
---
```

新增 folder 后，如果需要中文/英文显示名，请更新：

```text
src/lib/content.ts
```

中的 `folderNames`。

## 4. 添加图片

图片 metadata 路径格式：

```text
content/images/{folder}/{photoId}/metadata.json
```

必须字段：

- `id`
- `folder`
- `title`
- `description`
- `objectKey`
- `thumbKey`
- `imageUrl`
- `thumbUrl`
- `capturedAt`
- `location.label`
- `location.precision`
- `alt`
- `visibility`

位置隐私策略：

- 默认展示城市级地点，例如 `Shanghai`。
- 即使 metadata 内有经纬度，前端也只展示 `location.label` 和 `precision`。
- 后续管理后台应允许删除或降精度处理 GPS 信息。

## 5. R2 对象规则

当前 key 规则：

```text
articles/{folder}/{slug}/index.md
articles/{folder}/{slug}/assets/{filename}

images/{folder}/{photoId}/original.{ext}
images/{folder}/{photoId}/thumb.{ext}
images/{folder}/{photoId}/metadata.json

indexes/articles.json
indexes/articles/{folder}.json
indexes/images.json
indexes/images/{folder}.json
```

不要让客户端直接提交任意 R2 key。管理 API 会根据 `folder`、`slug`、`photoId` 和文件类型生成 key。

## 6. API 维护

公开 API：

```text
GET /api/articles
GET /api/articles/:folder
GET /api/articles/:folder/:slug
GET /api/images
GET /api/images/:folder
GET /api/images/:folder/:photoId
```

管理 API：

```text
POST  /api/admin/articles
POST  /api/admin/articles/:folder/:slug/assets
POST  /api/admin/images
PATCH /api/admin/images/:folder/:photoId/metadata
```

所有管理 API 都需要：

```text
Authorization: Bearer <ADMIN_TOKEN_SECRET>
```

统一响应格式：

```json
{
  "ok": true,
  "data": {}
}
```

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

## 7. Cloudflare 配置

R2 bucket 名称：

```text
website-turns-away-media
website-turns-away-media-preview
```

Wrangler 配置位于：

```text
wrangler.toml
```

需要设置的 secret：

```bash
wrangler pages secret put ADMIN_TOKEN_SECRET --project-name=website-turns-away
```

该 secret 只保存在 Cloudflare，不要提交到 git，也不要写进维护文档。

如果使用公开媒体域名，可设置：

```text
PUBLIC_MEDIA_BASE_URL
```

当前 `PUBLIC_MEDIA_BASE_URL` 为空，示例媒体走 `public/assets/media/`，R2 上传接口已预留。

## 8. 部署

首次部署前：

1. 在 Cloudflare 创建 Pages 项目：`website-turns-away`。
2. 创建 R2 bucket：`website-turns-away-media` 与 `website-turns-away-media-preview`。
3. 确认 `MEDIA_BUCKET` binding。
4. 设置 `ADMIN_TOKEN_SECRET`。
5. 运行构建。

部署命令：

```bash
npm run pages:deploy
```

实际等价命令：

```bash
npm run build
npx wrangler pages deploy dist --project-name=website-turns-away --branch=main
```

如果只更新了 Pages secret，需要重新部署一次让新 secret 生效。

自定义域名配置：

1. 在 Pages 项目 `website-turns-away` 的 Custom domains 中添加 `zero-bytes-turns-away.red`。
2. 在 Cloudflare DNS 中确认根域记录为 CNAME：`zero-bytes-turns-away.red` -> `website-turns-away.pages.dev`。
3. 保持代理状态开启。
4. 等待 Pages 自定义域名状态变为 `active`。

部署后检查：

- 首页可访问。
- `https://zero-bytes-turns-away.red` 返回 HTTP 200。
- `/articles` 和 `/images` 可访问。
- 文章详情包含标题、副标题、二级标题和插图。
- 图片详情包含大图、右侧拍摄时间/地点和下方描述。
- `/api/articles` 和 `/api/images` 返回统一 JSON。
- `/api/admin/*` 未带 token 时返回 `unauthorized`。

## 9. 视觉维护

B 方案视觉关键词：

- 深墨蓝仪器框架。
- 旧纸色、档案米色、珊瑚、琥珀和雾绿。
- 左侧 Route Matrix。
- 高密度 record card。
- 文件夹表格行。
- 图片详情 sidecar metadata。
- 克制动效，不使用普通蓝紫科技渐变。

维护样式时优先修改：

```text
src/styles/global.css
```

保持卡片圆角不超过 8px，避免页面退化为普通博客模板。

## 10. 后续扩展建议

- 用 D1 存储文章、图片、标签和搜索索引。
- 用 KV 缓存 `indexes/*.json`。
- 用 Queues 异步生成缩略图和刷新索引。
- 给 `/admin` 增加真实登录、上传表单、EXIF 读取和元数据编辑器。
- 对 Markdown 渲染增加更完整的清洗与组件能力。
