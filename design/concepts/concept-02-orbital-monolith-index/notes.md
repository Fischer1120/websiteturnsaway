# Orbital Monolith Index

## Design Decisions

- Anchor: 将 `design/prompt.md` 的巨型几何体和 mathematical composition 转译为档案馆/观测站界面，强调索引、校准线、时间戳和 sidecar metadata。
- Palette: 深墨蓝 `#182434` 做仪器框架，旧纸色 `#f4ecd9` 与档案米色 `#e9deca` 做底，珊瑚 `#d96f57` 做状态强调，琥珀 `#d6ad54` 与雾绿 `#96aaa4` 做辅助。
- Typography: 标题使用 Georgia 保留复古海报重量；正文使用 Avenir Next/Segoe UI；路径、时间、R2 key 全部使用 Courier New，形成高密度档案感。
- Layout: 左侧索引脊柱 + 右侧内容区；首页是欢迎面板和观测仪器图；列表为紧凑 record card；文件夹入口为表格行；详情页强调元数据侧栏。
- Motion: 极克制，仅在导航、记录卡、文件夹行上使用背景状态变化和小幅位移，符合长期内容归档的工具感。

## Requirement Coverage

- 首页欢迎词: 第一屏标题“一座观测站，用来存放转身后的证据。”
- 导航栏: 顶部导航与左侧 Route Matrix 双导航。
- 文章栏目: `Article records` 中展示两篇示例文章。
- 图片栏目: `Photo records` 中展示两张示例图片。
- 文件夹存储呈现: 文章文件夹和图片文件夹以表格行展示，并包含 R2 index sidecar 入口。
- 文章插图: 文章详情中有几何插图和 caption。
- 图片拍摄时间和地点侧边展示: 图片详情右侧 `Photo metadata sidecar` 展示时间、地点、文件夹、相机与 object key。
- 图片描述下方展示: 图片详情下方独立描述区，移动端顺序调整为图片、元数据、描述。

## Open Questions

- 需要确认最终站点是否偏向大量内容长期归档；如果是，此方案的信息密度最适合扩展。
- 需要确认是否为图片列表增加真实 EXIF 字段筛选，当前原型仅展示字段布局。
