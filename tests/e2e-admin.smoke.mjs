async (page) => {
const baseUrl = "__BASE_URL__";
const token = "__E2E_ADMIN_TOKEN__";
const imagePath = "__E2E_IMAGE__";

if (!token) throw new Error("E2E_ADMIN_TOKEN is required for the local admin smoke test.");

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const folder = "notes";
const slug = `codex-fix-browser-${suffix}`;
let created = false;
const consoleErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  try {
    await page.goto(`${baseUrl}/admin`);
    await page.getByLabel("管理密码").fill(token);
    await page.getByRole("button", { name: "进入后台" }).click();

    const title = page.getByRole("textbox", { name: "标题", exact: true });
    const slugInput = page.getByRole("textbox", { name: "Slug" });
    const markdown = page.getByRole("textbox", { name: "Markdown 正文" });
    await title.fill("浏览器草稿保留");
    await slugInput.fill(slug);
    await markdown.fill("## 浏览器正文\n\n插图操作前后都必须保留。");
    const before = { title: await title.inputValue(), slug: await slugInput.inputValue(), markdown: await markdown.inputValue() };
    await page.getByRole("button", { name: "上传插图并插入" }).click();
    if (await title.inputValue() !== before.title || await slugInput.inputValue() !== before.slug || await markdown.inputValue() !== before.markdown) {
      throw new Error("empty asset upload changed the article draft");
    }

    await page.getByRole("combobox", { name: "状态" }).selectOption("published");
    await page.getByRole("button", { name: "创建文章" }).click();
    created = true;
    await page.waitForTimeout(250);

    await page.locator('input[type="file"]#article-asset-file').setInputFiles(imagePath);
    let assetRequests = 0;
    const requestListener = (request) => {
      if (request.method() === "POST" && request.url().includes(`/api/admin/articles/${folder}/${slug}/assets`)) assetRequests += 1;
    };
    page.on("request", requestListener);
    await Promise.all([
      page.getByRole("button", { name: "上传插图并插入" }).click(),
      page.getByRole("button", { name: "上传插图并插入" }).click(),
    ]);
    await page.waitForTimeout(400);
    page.off("request", requestListener);
    if (assetRequests !== 1) throw new Error(`expected one asset mutation, got ${assetRequests}`);
    if (!(await markdown.inputValue()).includes("screenshot-mobile.png")) throw new Error("successful asset upload removed Markdown");

    await page.evaluate(() => { window.confirm = () => true; });
    await page.getByRole("button", { name: "新建文章" }).click();
    await title.fill("冲突草稿标题");
    await slugInput.fill(slug);
    await markdown.fill("冲突正文");
    await page.getByRole("button", { name: "创建文章" }).click();
    if (!(await title.inputValue()).includes("冲突草稿标题") || await markdown.inputValue() !== "冲突正文") throw new Error("409 conflict cleared the draft");
    if (!(await page.getByRole("alert").textContent()).includes("冲突")) throw new Error("409 conflict was not readable");

    const responsivePage = await page.context().newPage();
    responsivePage.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    try {
      for (const width of [320, 375, 768, 1100]) {
        await responsivePage.setViewportSize({ width, height: 900 });
        await responsivePage.goto(`${baseUrl}/images`);
        const overflow = await responsivePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        if (overflow) throw new Error(`horizontal overflow at viewport width ${width}`);
      }
    } finally {
      await responsivePage.close();
    }

    const unexpectedConsoleErrors = consoleErrors.filter((message) => !message.includes("409 (Conflict)"));
    if (unexpectedConsoleErrors.length) throw new Error(`browser console errors: ${unexpectedConsoleErrors.join(" | ")}`);
    return [69, 50, 69, 95, 80, 65, 83, 83].map((code) => String.fromCharCode(code)).join("");
  } finally {
    if (created) {
      await page.evaluate(async ({ url, auth }) => {
        await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${auth}` } });
      }, { url: `${baseUrl}/api/admin/articles/${folder}/${slug}`, auth: token });
    }
  }
}
