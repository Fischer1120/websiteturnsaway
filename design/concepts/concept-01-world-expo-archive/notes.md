# World Expo Archive

## Design Decisions

- Anchor: 将 `design/prompt.md` 中的 world exposition poster、巨型球体、金字塔、方碑和 navy/coral 解释为 1970s 世博会导览系统。
- Palette: 海军蓝 `#142b46` 做结构线与导航，珊瑚橙 `#ef775f` 做动线强调，旧纸米色 `#f5ead4` 做底，日光黄 `#f4c76a` 与鼠尾草绿 `#8aa79a` 做展馆分区。
- Typography: 标题使用 Georgia 系列的展览海报感，正文使用 Optima/Candara 一类人文无衬线，元数据使用 Courier New 模拟导览编号。
- Layout: 首页为欢迎词加大幅展馆地图；文章和图片并列为 Pavilion；文件夹入口像展馆票券；详情页保留文章主栏与照片元数据侧栏。
- Motion: 悬停采用轻微位移和硬阴影变化，模拟印刷导览卡被抬起；不使用外部资源和复杂动画。

## Requirement Coverage

- 首页欢迎词: 第一屏大标题“把每一次转身，登记成一座未来展馆。”
- 导航栏: 顶部 sticky 导航包含首页、文章、图片、文章详情、图片详情。
- 文章栏目: `Article Pavilion` 展示两篇示例文章。
- 图片栏目: `Photo Pavilion` 展示两张示例图片。
- 文件夹存储呈现: 文章文件夹 `/articles/notes`、`/articles/travel` 与图片文件夹 `/images/city-walk`、`/images/archive` 作为入口。
- 文章插图: 文章详情内有 CSS 几何插图和 caption。
- 图片拍摄时间和地点侧边展示: 图片详情右侧展示 Captured、Location、Folder、Camera、R2 Key。
- 图片描述下方展示: 大图下方展示图片描述；移动端顺序为图片、元数据、描述。

## Open Questions

- 后续最终实现时需要确认真实封面图和摄影原图的视觉裁切策略。
- 如果文章数量很多，需要确认展馆式卡片是否改为更紧凑的列表视图。
