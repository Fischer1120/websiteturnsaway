# Pastel Observatory

## Design Decisions

- Anchor: 将 `design/prompt.md` 的 pastel sunset colors、elegant retro future atmosphere 和几何建筑转译为更温暖的私人观测室，而不是冷硬的科技界面。
- Palette: 深海军蓝 `#17304c` 做结构和夜色，珊瑚 `#f17d65`、粉玫瑰 `#f3a7a0`、杏黄 `#f7c982` 做日落层次，珍珠白 `#fff1df` 与薄荷绿 `#9fc4ae` 平衡温度。
- Typography: 标题使用 Palatino/Georgia 形成温暖 editorial 气质，正文使用 Gill Sans/Trebuchet MS，路径和元数据使用 Courier New。
- Layout: 首页为欢迎词与沉浸式日落观测图；文章与图片以阅读架形式并列；文件夹入口为轻量入口卡；详情页把阅读和图片观看放大。
- Motion: 仅在主视觉球体上使用轻微垂直呼吸动效，并尊重 `prefers-reduced-motion`；卡片悬停为温和上移。

## Requirement Coverage

- 首页欢迎词: 第一屏标题“欢迎来到一间面向黄昏的观测室。”
- 导航栏: 顶部导航包含首页、文章、图片、文章详情、图片详情。
- 文章栏目: `Article shelf` 展示两篇示例文章。
- 图片栏目: `Image shelf` 展示两张示例图片。
- 文件夹存储呈现: 文章文件夹和图片文件夹入口均以卡片呈现，并包含 admin/upload 预留入口。
- 文章插图: 文章详情正文中包含几何插图与说明文字。
- 图片拍摄时间和地点侧边展示: 图片详情右侧显示 Captured、Location、Folder、Camera、Object key。
- 图片描述下方展示: 大图下方显示描述，移动端顺序为图片、元数据、描述。

## Open Questions

- 需要确认最终网站欢迎语是否保留这种更个人化、温暖的语气。
- 如果未来图片数量很多，此方案可能需要补一个更紧凑的相册索引模式。
