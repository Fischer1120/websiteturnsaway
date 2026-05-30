# 06 实现、测试与部署顺序

本文件定义用户人工选定设计方案后的实现顺序。设计方案未全部通过审核且用户未确认前，不得执行本流程。

## 阶段 0：确认输入

开始实现前，总协调 agent 必须确认：

- 用户已从三个设计方案中选定一个方向，或明确要求融合哪些部分。
- 选定方案的审核报告为通过。
- 后端与内容模型没有未解决的阻塞问题。
- Cloudflare 账号、R2 bucket 和部署权限已经可用，或用户明确要求先做本地版本。

## 阶段 1：项目脚手架

推荐选择之一：

1. Astro + TypeScript
   - 适合文章和图片内容网站。
   - 静态页面友好。
   - 可按需添加 React 组件。

2. Vite + React + TypeScript
   - 适合交互更多的前端。
   - 后续后台编辑器更直接。

如果没有额外要求，优先 Astro + TypeScript。

基础目录建议：

```text
src/
  components/
  layouts/
  pages/
  styles/
  lib/
content/
  articles/
  images/
functions/
  api/
public/
  assets/
```

## 阶段 2：内容模型落地

实现：

- 文章 frontmatter 类型。
- 图片 metadata 类型。
- folder 和 slug 校验。
- 本地种子内容读取。
- R2 key 生成工具。
- 列表索引生成工具。

必须先完成内容类型，再写 UI 页面。

## 阶段 3：后端 API

实现最小可用 API：

```text
GET /api/articles
GET /api/articles/:folder
GET /api/articles/:folder/:slug
GET /api/images
GET /api/images/:folder
GET /api/images/:folder/:photoId
```

预留管理 API：

```text
POST /api/admin/articles
POST /api/admin/articles/:folder/:slug/assets
POST /api/admin/images
PATCH /api/admin/images/:folder/:photoId/metadata
```

管理 API 第一版可以受限或返回未实现，但必须包含：

- 路由。
- 鉴权检查。
- 请求 schema。
- 错误格式。
- R2 key 规划。

## 阶段 4：前端页面实现

按用户选定方案实现：

1. 全局布局和导航。
2. 首页。
3. 文章列表。
4. 文章文件夹页。
5. 文章详情页。
6. 图片列表。
7. 图片文件夹页。
8. 图片详情页。
9. 管理入口占位页。

实现时必须保留设计方案中的视觉语言。若由于技术约束需要改动，应记录在实现说明中。

## 阶段 5：图片与文章体验

文章详情必须支持：

- 标题。
- 副标题。
- 二级标题。
- 文章插图。
- 图片 alt 和 caption。

图片详情必须支持：

- 大图。
- 侧边元数据。
- 拍摄时间。
- 地点标签。
- 相机信息，如存在。
- 图片下方文本描述。

移动端顺序：

```text
图片
元数据
描述
相关图片或返回入口
```

## 阶段 6：本地验证

必须执行：

- 类型检查。
- 单元测试或最小 API 测试。
- 构建。
- 桌面浏览器检查。
- 移动 viewport 检查。
- 文章详情和图片详情人工走查。

建议检查点：

```text
首页导航可用
文章列表可进入文件夹
文章文件夹可进入详情
文章插图正常显示
图片列表可进入文件夹
图片文件夹可进入详情
图片侧边元数据正常显示
图片描述位于图片下方
移动端无重叠和文字溢出
```

## 阶段 7：Cloudflare 部署

部署前：

- 创建 R2 bucket。
- 配置 Pages 或 Worker binding。
- 配置环境变量。
- 确认管理接口鉴权。
- 上传种子图片或示例对象。

部署后：

- 打开线上首页。
- 检查 API。
- 检查 R2 图片加载。
- 检查缓存头。
- 检查 404 页面。

## 阶段 8：交付记录

实现 agent 最终应更新：

- 实际技术栈。
- Cloudflare 项目名。
- R2 bucket 名。
- 本地启动命令。
- 部署命令。
- 已实现 API。
- 未完成但已预留的后台上传能力。
- 设计方案到最终实现的差异。
