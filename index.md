# Website Turns Away 实施方案索引

本文档是本项目的主工作索引。所有后续 agents 应先阅读本文件，再按目录进入 `workflows/` 中的独立流程文档执行任务。

## 项目目标

构建一个个人网站，包含主页面、欢迎词、导航栏、文章栏目和图片栏目。文章与图片都必须支持按文件夹组织。后端使用 Cloudflare Workers 或 Pages Functions，存储层使用 Cloudflare R2 保存需要上传的图片文件，并为后续文章与图片上传能力预留接口和数据结构。

## 推荐技术路线

- 前端：Astro 或 Vite + React + TypeScript，部署到 Cloudflare Pages。
- 后端：Cloudflare Pages Functions 或独立 Worker，优先使用 TypeScript，API 路由保持可迁移。
- 存储：Cloudflare R2 保存图片原图、文章插图、图片元数据 JSON 和上传后的文章内容。
- 内容格式：文章使用 Markdown 或 MDX，图片使用 R2 对象和 JSON sidecar 元数据。
- 设计流程：必须使用 `web-design-engineer` 子 agent 产出三个设计方案，再用独立审核子 agent 检查是否符合 `design/prompt.md`。

## 现有输入

- 视觉风格提示词：[design/prompt.md](design/prompt.md)
- 项目说明：[README.md](README.md)
- 已选定前端方案：[Orbital Monolith Index](design/concepts/concept-02-orbital-monolith-index/notes.md)
- 网站维护说明书：[docs/website-maintenance-manual.md](docs/website-maintenance-manual.md)

`design/prompt.md` 当前方向为复古未来主义几何建筑风格，关键词包括巨型球体、金字塔、方碑、1970s speculative future、world exposition poster、navy blue 与 coral orange、Moebius 与 Syd Mead 早期概念艺术气质。前端设计 agent 必须读取原文件，而不是只依赖本摘要。

## Agent 分工

1. 总协调 agent
   - 维护本文档与 `workflows/` 目录。
   - 拆分任务，确保每个 agent 只读取自己需要的流程文档。
   - 在设计方案未通过审核和人工复核前，不启动最终前端实现。

2. 后端 agent
   - 按 [03-cloudflare-backend-r2.md](workflows/03-cloudflare-backend-r2.md) 设计 Cloudflare API、R2 binding、上传预留接口和安全策略。
   - 后端实现时必须核对 Cloudflare 官方文档，避免使用过期配置。

3. 内容模型 agent
   - 按 [02-content-storage-model.md](workflows/02-content-storage-model.md) 建立文章、文章插图、图片文件夹和元数据规范。
   - 确保文章能插入图片，图片能展示拍摄时间、地点和文本描述。

4. 前端设计 agent
   - 必须使用 `web-design-engineer`。
   - 按 [04-frontend-design-agent.md](workflows/04-frontend-design-agent.md) 生成三个方案，每个方案都包含文章和图片案例。

5. 设计审核 agent
   - 独立于前端设计 agent。
   - 按 [05-design-review-and-human-check.md](workflows/05-design-review-and-human-check.md) 检查三个设计方案是否符合 `design/prompt.md`、功能要求和响应式要求。
   - 不合格方案必须退回重做。

6. 实现与部署 agent
   - 在三套方案均通过审核，并且用户人工选定方向后，按 [06-build-deploy-sequence.md](workflows/06-build-deploy-sequence.md) 开始实现。
   - 完成后按 [07-acceptance-checklist.md](workflows/07-acceptance-checklist.md) 验收。

## 工作流目录

按顺序执行：

1. [整体架构与页面范围](workflows/01-overall-architecture.md)
2. [内容与文件夹存储模型](workflows/02-content-storage-model.md)
3. [Cloudflare 后端与 R2 流程](workflows/03-cloudflare-backend-r2.md)
4. [前端设计子 agent 流程](workflows/04-frontend-design-agent.md)
5. [设计审核与人工复核流程](workflows/05-design-review-and-human-check.md)
6. [实现、测试与部署顺序](workflows/06-build-deploy-sequence.md)
7. [最终验收清单](workflows/07-acceptance-checklist.md)

## 硬性门禁

- 未读取 `design/prompt.md`，不得开始前端设计。
- 未产出三个独立设计方案，不得进入人工复核。
- 未经独立审核 agent 通过，不得向用户声明设计方案已完成。
- 未经用户人工复核确认，不得启动最终前端实现。
- 后端必须为未来上传文章和图片预留 API、权限、R2 key 规则和元数据结构。
- 图片详情必须支持展示拍摄时间、地点信息，并在图片下方展示文本描述。
- 文章详情必须支持标题、副标题、二级标题等结构，并支持在正文中插入图片。

## 最终交付物

- 可运行的网站项目。
- Cloudflare Pages 或 Workers 部署配置。
- R2 bucket binding 与对象 key 规则。
- 示例文章、示例图片和示例元数据。
- 三个前端设计方案与审核记录。
- 用户选定方案后的实现版本。
- 本文档及 `workflows/` 下所有流程文档的持续更新版本。

## 当前实现状态

- 用户已选择 B 方案：`Orbital Monolith Index`。
- 当前实现采用 Astro + TypeScript 静态前端，部署目标为 Cloudflare Pages。
- 后端 API 使用 Cloudflare Pages Functions，R2 binding 名称为 `MEDIA_BUCKET`。
- 本地种子内容位于 `content/articles/` 与 `content/images/`。
- 管理入口 `/admin` 和 `/api/admin/*` 已预留上传文章、上传文章插图、上传图片与编辑图片元数据流程。
- Cloudflare Pages 项目已创建：`website-turns-away`。
- 正式域名已绑定并验证通过：`https://zero-bytes-turns-away.red`。
- Pages 默认域名：`https://website-turns-away.pages.dev`。
- R2 bucket 已创建：`website-turns-away-media` 与 `website-turns-away-media-preview`。
- `ADMIN_TOKEN_SECRET` 已在 Cloudflare Pages 项目中设置，仓库中不保存 secret 值。
- 后续维护请优先阅读 [网站维护说明书](docs/website-maintenance-manual.md)。
