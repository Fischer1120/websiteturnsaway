# 04 前端设计子 agent 流程

本文件定义前端设计 agent 的输入、输出和三个设计方案生成流程。该步骤只做设计方案和可视化原型，不做最终生产实现。

## 必须使用的 agent

前端设计必须开启子 agent，并指定使用 `web-design-engineer`。该子 agent 的任务是产出三个可比较的界面方案，而不是只给文字描述。

如果当前运行环境没有可用的子 agent 工具，总协调 agent 应暂停并说明原因，不应把设计和审核混在同一个角色中完成。

## 必读输入

设计子 agent 必须读取：

- 根索引：[../index.md](../index.md)
- 视觉提示词：[../design/prompt.md](../design/prompt.md)
- 架构范围：[01-overall-architecture.md](01-overall-architecture.md)
- 内容模型：[02-content-storage-model.md](02-content-storage-model.md)

## 视觉方向

`design/prompt.md` 是硬性风格源。设计必须体现：

- 复古未来主义。
- 巨型几何体：球体、金字塔、方碑、单体建筑。
- 1970s speculative future 与 world exposition poster 气质。
- 电影长阴影、粉彩日落、navy blue 与 coral orange。
- 高度图形化、干净、数学构图、轻微 vintage print grain。

避免：

- 泛蓝紫渐变科技 SaaS 风。
- 纯黑赛博朋克风。
- 普通博客模板。
- 大量圆角卡片堆叠。
- 与提示词无关的装饰性 blob、orb 或廉价背景渐变。

## 共同功能要求

三个方案都必须包含：

- 首页欢迎词。
- 主导航栏。
- 文章栏目。
- 图片栏目。
- 文章文件夹入口。
- 图片文件夹或相册入口。
- 文章详情示例，包含标题、副标题、二级标题和正文插图。
- 图片详情示例，包含大图、侧边拍摄时间与地点、图片下方文本描述。
- 移动端布局说明或截图。

## 示例内容

设计 agent 可使用以下示例内容，不需要等待真实内容：

文章示例：

1. `notes/monolith-at-sunset`
   - 标题：黄昏中的方碑
   - 副标题：一次关于城市边缘与几何记忆的记录
   - 二级标题：第一段路、广场尽头、折返

2. `travel/world-expo-dream`
   - 标题：像世博会海报一样散步
   - 副标题：在粉色天空下经过球体、金字塔和长阴影
   - 二级标题：入口、中央轴线、夜色之前

图片示例：

1. `city-walk/20260531-184200-a1b2`
   - 标题：粉色天空下的球体
   - 拍摄时间：2026-05-31 18:42
   - 地点：Shanghai
   - 描述：广场尽头的球体反射着珊瑚色晚霞，像一张旧世博会海报的边角。

2. `archive/20260531-191000-c3d4`
   - 标题：金字塔入口
   - 拍摄时间：2026-05-31 19:10
   - 地点：Shanghai
   - 描述：入口被长阴影压低，行人显得像比例尺。

## 三个方案方向

设计 agent 应生成三个彼此有明显差异的方案：

1. 方案 A：World Expo Archive
   - 更像 1970s 世界博览会导览系统。
   - 首页强调大幅几何建筑视觉和清晰分区。
   - 文章与图片像展馆索引一样组织。

2. 方案 B：Orbital Monolith Index
   - 更克制、更像档案馆和观测站。
   - 导航、列表、元数据展示更精密。
   - 适合长期存放大量文章和图片。

3. 方案 C：Pastel Observatory
   - 更温暖、更具日落粉彩和空气感。
   - 首页欢迎词更具个人表达。
   - 图片详情页更强调沉浸式观看。

三个方案都必须保持同一提示词来源，但要在布局、信息密度、动效、导航组织和内容呈现方式上拉开差异。

## 输出目录建议

```text
design/concepts/
  concept-01-world-expo-archive/
    index.html
    notes.md
    screenshot-desktop.png
    screenshot-mobile.png
  concept-02-orbital-monolith-index/
    index.html
    notes.md
    screenshot-desktop.png
    screenshot-mobile.png
  concept-03-pastel-observatory/
    index.html
    notes.md
    screenshot-desktop.png
    screenshot-mobile.png
```

如果使用 React 或 Astro 原型，也应保证每个方案可以被独立预览。

## 每个方案的 notes.md

每个方案必须附带 `notes.md`：

```markdown
# Concept Name

## Design Decisions

- Anchor: 来自 design/prompt.md 的具体解释
- Palette: 主色、辅助色、中性色、强调色
- Typography: 标题、正文、元数据字体策略
- Layout: 首页、文章列表、图片列表、详情页结构
- Motion: 过渡、悬停、滚动或切换方式

## Requirement Coverage

- 首页欢迎词:
- 导航栏:
- 文章栏目:
- 图片栏目:
- 文件夹存储呈现:
- 文章插图:
- 图片拍摄时间和地点侧边展示:
- 图片描述下方展示:

## Open Questions

- 需要用户确认的地方
```

## 设计质量约束

- 文本不能溢出按钮、卡片、导航或侧栏。
- 固定格式元素需要稳定尺寸，避免 hover 或动态内容导致布局跳动。
- 卡片圆角不超过 8px，除非有明确视觉理由。
- 首页不是营销落地页，而是可使用的网站主界面。
- 不使用无意义装饰图形替代真实内容区域。
- 图片和文章案例必须真实出现在界面里，不能只写在说明中。
- 桌面和移动端都要检查。

## 交付前自检

设计 agent 完成每个方案后，必须自检：

- 是否一眼能看出复古未来主义几何建筑方向。
- 是否出现文章与图片双栏目。
- 是否能看出文件夹组织。
- 是否有文章详情结构。
- 是否有图片详情元数据侧边栏和描述区。
- 是否能被审核 agent 独立打开和检查。
