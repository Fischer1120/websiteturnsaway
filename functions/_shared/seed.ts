export const articles = [
  {
    title: "像世博会海报一样散步",
    subtitle: "在粉色天空下经过球体、金字塔和长阴影",
    folder: "travel",
    slug: "world-expo-dream",
    summary: "在粉色天空下经过一条被球体和金字塔标记的中央轴线。",
    coverImage: "/assets/media/world-expo-dream.svg",
    publishedAt: "2026-05-31T19:10:00+08:00",
    updatedAt: "2026-05-31T19:10:00+08:00",
    tags: ["travel", "sunset", "archive"],
    status: "published",
    markdown: "# 像世博会海报一样散步\n\n## 入口\n\n入口并不热闹，反而像一本旧导览册里被折过的页面。\n\n## 中央轴线\n\n每走几步，建筑的比例都会变化。\n\n## 夜色之前\n\n夜色真正落下之前，珊瑚色还停在建筑边缘。"
  },
  {
    title: "黄昏中的方碑",
    subtitle: "一次关于城市边缘与几何记忆的记录",
    folder: "notes",
    slug: "monolith-at-sunset",
    summary: "穿过一条笔直道路后，建筑像沉默的仪器一样排列在远处。",
    coverImage: "/assets/media/monolith-at-sunset.svg",
    publishedAt: "2026-05-31T18:42:00+08:00",
    updatedAt: "2026-05-31T18:42:00+08:00",
    tags: ["city", "geometry", "photo"],
    status: "published",
    markdown: "# 黄昏中的方碑\n\n## 第一段路\n\n路面在黄昏里变得像一张校准纸。\n\n## 广场尽头\n\n球体记录天空的颜色，金字塔记录入口的角度。\n\n## 折返\n\n文件夹名成为回家的路标。"
  }
];

export const photos = [
  {
    id: "20260531-184200-a1b2",
    folder: "city-walk",
    title: "粉色天空下的球体",
    description: "广场尽头的球体反射着珊瑚色晚霞，像一张旧世博会海报的边角。",
    objectKey: "images/city-walk/20260531-184200-a1b2/original.svg",
    thumbKey: "images/city-walk/20260531-184200-a1b2/thumb.svg",
    imageUrl: "/assets/media/sphere-photo.svg",
    thumbUrl: "/assets/media/sphere-photo.svg",
    capturedAt: "2026-05-31T18:42:00+08:00",
    location: { label: "Shanghai", latitude: 31.2304, longitude: 121.4737, precision: "city" },
    camera: { make: "Apple", model: "iPhone", lens: "26mm", iso: 64, aperture: "f/1.8", shutter: "1/120" },
    alt: "粉色天空下，一座巨大的球体建筑位于广场中央。",
    visibility: "public",
  },
  {
    id: "20260531-191000-c3d4",
    folder: "archive",
    title: "金字塔入口",
    description: "入口被长阴影压低，行人显得像比例尺。",
    objectKey: "images/archive/20260531-191000-c3d4/original.svg",
    thumbKey: "images/archive/20260531-191000-c3d4/thumb.svg",
    imageUrl: "/assets/media/pyramid-photo.svg",
    thumbUrl: "/assets/media/pyramid-photo.svg",
    capturedAt: "2026-05-31T19:10:00+08:00",
    location: { label: "Shanghai", latitude: 31.2304, longitude: 121.4737, precision: "city" },
    camera: { make: "Apple", model: "iPhone", lens: "26mm", iso: 80, aperture: "f/1.8", shutter: "1/90" },
    alt: "金字塔形入口在黄昏下投出长阴影。",
    visibility: "public",
  },
];

export function articleFolders() {
  return ["notes", "travel"].map((folder) => ({
    slug: folder,
    articles: articles.filter((article) => article.folder === folder),
  }));
}

export function imageFolders() {
  return ["city-walk", "archive"].map((folder) => ({
    slug: folder,
    photos: photos.filter((photo) => photo.folder === folder),
  }));
}
