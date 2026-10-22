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
npm run check
npm run build
npx tsc --noEmit --ignoreDeprecations 6.0
npm test
```

Cloudflare Pages Functions 本地预览：

```bash
npm run build
npm run pages:dev
```

本地 Pages Functions 验收（使用隔离的 local R2，不写生产 bucket）：

```bash
BASE_URL=http://127.0.0.1:8791 node tests/route-matrix.mjs
E2E_ADMIN_TOKEN=<local-test-token> BASE_URL=http://127.0.0.1:8791 ./tests/e2e-admin.smoke.sh
```

测试数据统一使用 `codex-fix-*` 标识；不要把真实 `ADMIN_TOKEN_SECRET` 写入命令记录、测试文件或仓库。

## 文章编辑

后台默认使用可视化编辑，可在“编辑”“源码”和“预览”之间切换。工具栏支持标题、加粗、列表、引用、链接、代码和表格，`Ctrl/⌘ S` 保存当前表单。专注写作可用 `Esc` 退出。发布设置包含分组、文章地址、摘要、封面、标签和公开状态，新文章默认为草稿。

修改会自动备份到当前浏览器的本机存储，刷新后可通过“恢复草稿”取回。备份与登录会话所用的管理身份关联；本机备份不会更新服务器。只有点击创建或保存成功后，文章才会写入服务器。浏览器禁用存储或空间不足时，会提示及时保存。清除浏览器站点数据会清除备份。

插图上传前需保存文章。图片插入光标位置后仍需保存正文。预览和公开文章使用同一套 Markdown 渲染；原文含有可视化编辑暂不支持的语法时，会保留源码供编辑。

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
