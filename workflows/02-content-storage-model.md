# 02 内容与文件夹存储模型

本文件定义文章、图片、文件夹和元数据的组织方式。目标是让前端、后端和未来上传后台使用同一套模型。

## 命名规则

- `folder` 使用小写英文、数字和短横线，例如 `notes`, `city-walk`, `archive-2026`。
- `slug` 使用小写英文、数字和短横线，例如 `monolith-at-sunset`。
- 图片 ID 可使用 `yyyyMMdd-HHmmss-shortid` 或 UUID。
- 对外 URL 不使用中文路径，显示名称可以使用中文。

## 仓库内种子内容

建议结构：

```text
content/
  articles/
    travel/
      first-walk/
        index.md
        images/
          sunset-monolith.jpg
          station-pyramid.jpg
    notes/
      geometry-and-memory/
        index.md
  images/
    city-walk/
      20260531-184200-a1b2/
        original.jpg
        metadata.json
      20260531-191000-c3d4/
        original.jpg
        metadata.json
```

种子内容用于开发、设计方案演示和测试。后续上传内容进入 R2，结构应与本地结构保持映射关系。

## R2 对象 key 规则

建议 R2 key：

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

说明：

- 文章插图存放在对应文章目录的 `assets/` 下。
- 图片栏目中的摄影作品放在 `images/{folder}/{photoId}/` 下。
- 每张图片必须有一个 `metadata.json`。
- `indexes/` 目录保存列表页所需索引，减少运行期遍历成本。

## 文章格式

文章使用 Markdown 或 MDX。第一版优先 Markdown，必要时允许 MDX 组件。

示例：

```markdown
---
title: "黄昏中的方碑"
subtitle: "一次关于城市边缘与几何记忆的记录"
folder: "notes"
slug: "monolith-at-sunset"
summary: "穿过一条笔直道路后，建筑像沉默的仪器一样排列在远处。"
coverImage: "./images/sunset-monolith.jpg"
publishedAt: "2026-05-31T18:42:00+08:00"
updatedAt: "2026-05-31T18:42:00+08:00"
tags: ["city", "geometry", "photo"]
status: "published"
---

# 黄昏中的方碑

## 第一段路

正文可以插入图片：

![黄昏中的几何建筑](./images/sunset-monolith.jpg "长阴影把广场切成两半")

## 第二段路

继续正文。
```

结构要求：

- `title` 为文章标题。
- `subtitle` 为副标题。
- 正文中允许 `#`, `##`, `###`，但页面渲染时应避免出现多个视觉主标题。
- 插图必须有 alt，建议有 caption。
- `coverImage` 可以是相对路径，也可以是 R2 URL 或 R2 key。

## 图片元数据格式

每张图片对应一个 `metadata.json`：

```json
{
  "id": "20260531-184200-a1b2",
  "folder": "city-walk",
  "title": "粉色天空下的球体",
  "description": "广场尽头的球体反射着珊瑚色晚霞，像一张旧世博会海报的边角。",
  "objectKey": "images/city-walk/20260531-184200-a1b2/original.jpg",
  "thumbKey": "images/city-walk/20260531-184200-a1b2/thumb.jpg",
  "capturedAt": "2026-05-31T18:42:00+08:00",
  "location": {
    "label": "Shanghai",
    "latitude": 31.2304,
    "longitude": 121.4737,
    "precision": "city"
  },
  "camera": {
    "make": "Apple",
    "model": "iPhone",
    "lens": "26mm",
    "iso": 64,
    "aperture": "f/1.8",
    "shutter": "1/120"
  },
  "alt": "粉色天空下，一座巨大的球体建筑位于广场中央。",
  "visibility": "public"
}
```

## EXIF 读取流程

上传图片时必须尝试读取：

- 拍摄时间：EXIF `DateTimeOriginal` 或等价字段。
- 拍摄地点：EXIF GPS 经纬度。
- 相机信息：make、model、lens、iso、aperture、shutter。

推荐流程：

1. 浏览器端上传前读取 EXIF，生成初始元数据。
2. 用户可以编辑地点显示名称和文本描述。
3. 后端接收文件和元数据，保存原图到 R2。
4. 后端保存 `metadata.json`。
5. 列表索引异步或同步更新。

隐私要求：

- 如果 EXIF 中有精确 GPS，默认展示城市级或地点标签，不直接暴露精确坐标。
- 管理界面应允许删除位置。
- 如果无 EXIF 时间，允许用户手动填写。

## 图片页面展示规则

图片详情页布局必须满足：

- 主区域展示大图。
- 侧边栏展示拍摄时间、地点、相机信息、所属文件夹。
- 图片下方展示 `description`。
- `description` 为空时，不显示空白描述区域。
- 移动端侧边信息应移动到图片下方，顺序为图片、元数据、描述。

## 文章插图与图片栏目关系

文章插图和图片栏目作品可以复用同一个 R2 原图，但在模型上要区分：

- 文章插图服务于正文叙事。
- 图片栏目作品服务于独立摄影展示。
- 如果同一张图同时出现在文章和图片栏目，应在文章 frontmatter 或正文中引用图片作品的 `photoId`。

推荐引用方式：

```markdown
<PhotoRef folder="city-walk" id="20260531-184200-a1b2" caption="这张图也收录在图片栏目。" />
```

如果第一版不使用 MDX，可先用普通 Markdown 图片语法，并在构建时解析相对路径。
