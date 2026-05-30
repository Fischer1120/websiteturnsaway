# 01 整体架构与页面范围

本文件定义网站的产品范围、页面结构、系统边界和 agent 执行顺序。所有实现 agent 应先确认本文件中的范围，再进入对应专题文档。

## 产品定位

Website Turns Away 是一个个人网站，核心内容为文章与图片。网站的第一屏应直接呈现可用体验：欢迎词、导航、文章入口和图片入口，而不是营销型落地页。

## 页面结构

必须包含以下页面或视图：

1. 首页 `/`
   - 欢迎词。
   - 主导航栏。
   - 文章栏目入口。
   - 图片栏目入口。
   - 推荐文章和推荐图片示例。

2. 文章列表 `/articles`
   - 按文件夹展示文章集合。
   - 支持进入某个文件夹查看文章。
   - 展示标题、副标题、摘要、发布时间、文件夹名和封面图。

3. 文章文件夹 `/articles/:folder`
   - 展示该文件夹下的文章。
   - 支持按时间或手动顺序排序。

4. 文章详情 `/articles/:folder/:slug`
   - 渲染标题、副标题、正文、二级标题、三级标题、引用、列表和代码块。
   - 正文中可以插入图片。
   - 插图可包含 alt、caption、拍摄说明或来源说明。

5. 图片列表 `/images`
   - 按文件夹或相册展示图片集合。
   - 每张图片展示缩略图、标题或短描述、拍摄时间。

6. 图片文件夹 `/images/:folder`
   - 展示该文件夹内图片。
   - 支持按拍摄时间排序。

7. 图片详情 `/images/:folder/:photoId`
   - 大图展示。
   - 侧边展示拍摄时间、地点、相机信息等元数据。
   - 图片下方展示文本描述。

8. 管理入口 `/admin`
   - 当前阶段只做路由和接口预留。
   - 后续用于上传文章、上传图片、编辑元数据和文本描述。

## 系统架构

推荐架构：

```text
Browser
  -> Cloudflare Pages static frontend
  -> Pages Functions or Worker API
  -> Cloudflare R2
```

静态页面由 Pages 托管。动态 API 由 Pages Functions 或独立 Worker 承担。R2 保存图片原图、缩略图、文章插图、文章上传文件和元数据 JSON。

## 数据分层

1. 仓库内种子内容
   - 用于开发和设计阶段。
   - 可放在 `content/articles/` 与 `content/images/`。
   - 便于版本控制示例文章和示例图片元数据。

2. R2 上传内容
   - 用于后续管理后台上传。
   - 图片原文件、文章插图和元数据必须放在 R2。
   - 上传后的文章可以先以 Markdown 或 JSON 存入 R2，后续需要搜索和复杂筛选时再迁移到 D1。

3. 生成索引
   - 构建期可生成静态索引。
   - 运行期可通过 API 从 R2 读取索引 JSON。
   - 如果内容增长，可以增加 KV 或 D1 做索引缓存。

## 推荐路由边界

前端路由：

```text
/
/articles
/articles/[folder]
/articles/[folder]/[slug]
/images
/images/[folder]
/images/[folder]/[photoId]
/admin
```

API 路由：

```text
GET  /api/articles
GET  /api/articles/:folder
GET  /api/articles/:folder/:slug
POST /api/admin/articles
POST /api/admin/articles/:folder/:slug/assets

GET  /api/images
GET  /api/images/:folder
GET  /api/images/:folder/:photoId
POST /api/admin/images
PATCH /api/admin/images/:folder/:photoId/metadata
```

## 实施原则

- 先设计内容模型，再写 API，再写页面。
- 前端设计先做三个方案，审核通过并经用户人工复核后再实现。
- 后端接口即使暂不完整实现，也必须保留路径、类型定义和错误格式。
- 图片上传和文章上传都应从第一版开始预留鉴权。
- 文件夹 slug 必须稳定，避免未来 URL 改动。

## 非目标

当前文档阶段不要求实现以下能力：

- 完整后台编辑器。
- 多用户权限系统。
- 全文搜索。
- 图片 AI 标注。
- 评论系统。
- 复杂地图视图。

这些能力可以在后续迭代中扩展，但第一版不应为了它们牺牲内容结构和视觉质量。
