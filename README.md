# Website Turns Away

一个个人档案式网站，用于展示文章与图片。当前视觉方向为 **Orbital Monolith Index**：复古未来主义、几何建筑、深色仪器面板与高密度索引卡片。

## 线上地址

- 正式域名：<https://zero-bytes-turns-away.red>
- Cloudflare Pages 项目：`website-turns-away`
- Pages 默认域名：<https://website-turns-away.pages.dev>

## 技术栈

- 前端：Astro + TypeScript
- 后端：Cloudflare Pages Functions
- 部署：Cloudflare Pages
- 存储：Cloudflare R2，绑定名为 `MEDIA_BUCKET`
- 内容：本地种子内容位于 `content/articles` 与 `content/images`

## 本地运行

安装依赖：

```bash
npm install
```

启动开发服务器：

```bash
npm run dev
```

默认地址：

```text
http://localhost:4321
```

构建与类型检查：

```bash
npm run build
```

Cloudflare Pages Functions 本地预览：

```bash
npm run build
npm run pages:dev
```

## 部署

```bash
npm run pages:deploy
```

部署前需要确认：

- Cloudflare Pages 项目存在：`website-turns-away`
- R2 buckets 已创建：`website-turns-away-media`、`website-turns-away-media-preview`
- `wrangler.toml` 中存在 `MEDIA_BUCKET` binding
- Cloudflare Pages secret 已设置：`ADMIN_TOKEN_SECRET`
- 自定义域名 DNS 指向 `website-turns-away.pages.dev`

## 目录结构

```text
content/                文章与图片 metadata 的本地种子内容
design/                 视觉提示词与三套设计方案
docs/                   网站维护说明书
functions/              Cloudflare Pages Functions API
public/assets/media/    示例图片与封面资源
src/                    Astro 页面、组件、样式和内容工具
workflows/              项目实施流程文档
wrangler.toml           Cloudflare Pages 与 R2 配置
```

## API

公开接口：

```text
GET /api/articles
GET /api/articles/:folder
GET /api/articles/:folder/:slug
GET /api/images
GET /api/images/:folder
GET /api/images/:folder/:photoId
```

管理接口：

```text
POST  /api/admin/articles
POST  /api/admin/articles/:folder/:slug/assets
POST  /api/admin/images
PATCH /api/admin/images/:folder/:photoId/metadata
```

管理接口必须携带：

```text
Authorization: Bearer <ADMIN_TOKEN_SECRET>
```

不要把 `ADMIN_TOKEN_SECRET` 写入仓库或文档。

## 维护文档

详细维护说明见：

[docs/website-maintenance-manual.md](docs/website-maintenance-manual.md)
