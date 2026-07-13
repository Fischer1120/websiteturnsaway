const baseUrl = process.env.BASE_URL || "http://127.0.0.1:8791";

const cases = [
  ["/articles", 200, "文章栏目"],
  ["/articles/", 308],
  ["/articles/travel", 200, "像世博会海报一样散步"],
  ["/articles/travel/", 308],
  ["/articles/travel/world-expo-dream", 200, "像世博会海报一样散步"],
  ["/articles/travel/world-expo-dream/", 308],
  ["/images", 200, "图片栏目"],
  ["/images/", 308],
  ["/images/city-walk", 200, "粉色天空下的球体"],
  ["/images/city-walk/", 308],
  ["/images/city-walk/20260531-184200-a1b2", 200, "粉色天空下的球体"],
  ["/images/city-walk/20260531-184200-a1b2/", 308],
  ["/articles/missing", 404],
  ["/images/missing", 404],
  ["/media/indexes/articles.json", 404],
  ["/media/indexes/tombstones.json", 404],
];

const failures = [];
for (const [path, expected, expectedText] of cases) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
  if (response.status !== expected) failures.push(`${path}: expected ${expected}, got ${response.status}`);
  if (expected === 308) {
    const location = response.headers.get("location");
    const expectedLocation = `${baseUrl}${path.slice(0, -1)}`;
    if (location !== expectedLocation) failures.push(`${path}: expected Location ${expectedLocation}, got ${location}`);
  }
  if (expected === 200) {
    const body = await response.text();
    if (body.includes("LOADING / FETCHING CONTENT INDEX")) failures.push(`${path}: static loading shell still present`);
    if (expectedText && !body.includes(expectedText)) failures.push(`${path}: expected HTML content ${expectedText}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`route matrix passed (${cases.length} cases)`);
}
