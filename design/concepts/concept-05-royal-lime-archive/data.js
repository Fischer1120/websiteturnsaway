window.ArchivePrototype = window.ArchivePrototype || {};
window.ArchivePrototype.seed = {
  "articles": [
    {
      "id": "monolith-at-sunset",
      "folder": "notes",
      "slug": "monolith-at-sunset",
      "title": "黄昏中的方碑",
      "subtitle": "一次关于城市边缘与几何记忆的记录",
      "summary": "穿过一条笔直道路后，建筑像沉默的仪器一样排列在远处。",
      "date": "2026-05-31T18:42:00+08:00",
      "updatedAt": "2026-05-31T18:42:00+08:00",
      "cover": "./assets/monolith-at-sunset.svg",
      "markdown": "# 黄昏中的方碑\n\n## 第一段路\n\n路面在黄昏里变得像一张校准纸。球体悬在方碑左侧，阴影拖得很长，像把一座广场切成了几块可被归档的区域。\n\n![黄昏中的几何建筑](./assets/monolith-at-sunset.svg \"长阴影把广场切成两半\")\n\n## 广场尽头\n\n我没有急着解释这些建筑。它们更像一些观测仪器：球体记录天空的颜色，金字塔记录入口的角度，方碑记录时间怎样从人的肩膀旁边移开。\n\n## 折返\n\n折返时天空从珊瑚色降到海军蓝，文件夹名成为回家的路标：`notes` 用来存放判断，`travel` 用来存放路线，`city-walk` 用来存放时间。"
    },
    {
      "id": "world-expo-dream",
      "folder": "travel",
      "slug": "world-expo-dream",
      "title": "像世博会海报一样散步",
      "subtitle": "在粉色天空下经过球体、金字塔和长阴影",
      "summary": "在粉色天空下经过一条被球体和金字塔标记的中央轴线。",
      "date": "2026-05-31T19:10:00+08:00",
      "updatedAt": "2026-05-31T19:10:00+08:00",
      "cover": "./assets/world-expo-dream.svg",
      "markdown": "# 像世博会海报一样散步\n\n## 入口\n\n入口并不热闹，反而像一本旧导览册里被折过的页面。路径、时间和地点排成一条清楚的线。\n\n![世博会轴线上的球体与金字塔](./assets/world-expo-dream.svg \"中央轴线让天空、球体和入口保持同一个方向\")\n\n## 中央轴线\n\n每走几步，建筑的比例都会变化。球体不再只是景观，它像一个索引节点，提醒你照片、文章和文件夹可以共享同一段路。\n\n## 夜色之前\n\n夜色真正落下之前，珊瑚色还停在建筑边缘。那一刻最适合写入 `travel/world-expo-dream`，因为路线本身就是这篇文章的结构。"
    }
  ],
  "images": [
    {
      "id": "20260531-191000-c3d4",
      "folder": "archive",
      "title": "金字塔入口",
      "description": "入口被长阴影压低，行人显得像比例尺。",
      "capturedAt": "2026-05-31T19:10:00+08:00",
      "location": "Shanghai",
      "precision": "city",
      "camera": "Apple iPhone · 26mm · f/1.8 · ISO 80 · 1/90",
      "image": "./assets/pyramid-photo.svg",
      "alt": "金字塔形入口在黄昏下投出长阴影。"
    },
    {
      "id": "20260531-184200-a1b2",
      "folder": "city-walk",
      "title": "粉色天空下的球体",
      "description": "广场尽头的球体反射着珊瑚色晚霞，像一张旧世博会海报的边角。",
      "capturedAt": "2026-05-31T18:42:00+08:00",
      "location": "Shanghai",
      "precision": "city",
      "camera": "Apple iPhone · 26mm · f/1.8 · ISO 64 · 1/120",
      "image": "./assets/sphere-photo.svg",
      "alt": "粉色天空下，一座巨大的球体建筑位于广场中央。"
    }
  ],
  "folders": [
    {
      "id": "articles-notes",
      "type": "articles",
      "slug": "notes",
      "name": "城市边缘与几何记忆"
    },
    {
      "id": "articles-travel",
      "type": "articles",
      "slug": "travel",
      "name": "散步与中央轴线"
    },
    {
      "id": "images-city-walk",
      "type": "images",
      "slug": "city-walk",
      "name": "城市步行影像"
    },
    {
      "id": "images-archive",
      "type": "images",
      "slug": "archive",
      "name": "入口与建筑档案"
    }
  ]
};
window.ArchivePrototype.data = structuredClone(window.ArchivePrototype.seed);
