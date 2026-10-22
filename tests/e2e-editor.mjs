async (page) => {
  const baseUrl = "__BASE_URL__";
  const token = "__E2E_ADMIN_TOKEN__";
  const slug = `codex-fix-editor-${Date.now().toString(36)}`;
  const checks = [];
  let created = false;
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const markdown = page.locator('[name="markdown"]');
  const rich = page.getByRole('textbox', { name: '文章正文', exact: true });
  const save = page.locator('[data-mutation="article-save"]');
  const auth = { Authorization: `Bearer ${token}` };
  page.on('dialog', dialog => dialog.accept());
  try {
    await page.goto(`${baseUrl}/admin/`);
    if (await page.getByLabel('管理密码').count()) {
      await page.getByLabel('管理密码').fill(token);
      await page.getByRole('button', { name: '进入后台', exact: true }).click();
    }
    await page.locator('[data-writing-ready="true"]').waitFor();
    assert(await page.locator('[data-writing-workspace]').getAttribute('data-writing-mode') === 'rich', 'default editor is not visual');
    await page.locator('.article-settings summary').click();
    await page.locator('[name="title"]').fill('编辑器交互验证');
    await page.locator('[name="slug"]').fill(slug);
    await page.locator('[name="status"]').selectOption('published');
    const original = '# 原有标题\n\n## 正文章节\n\n**粗体**与*斜体*。\n\n| 项目 | 值 |\n| --- | --- |\n| 表格 | 可编辑 |';
    await page.getByRole('button', { name: '源码', exact: true }).click();
    await markdown.fill(original);
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    assert(await rich.locator('h1').textContent() === '原有标题', 'H1 was lost in visual editor');
    assert(await rich.locator('table').count() === 1, 'Markdown table did not hydrate');
    await page.getByRole('button', { name: '预览', exact: true }).click();
    assert(await page.locator('#article-preview strong').textContent() === '粗体', 'preview formatting differs');
    await page.getByRole('button', { name: '源码', exact: true }).click();
    assert(await markdown.inputValue() === original, 'mode switch rewrote original Markdown');
    const multilineTable = '| Column |\n| --- |\n| First<br>Second |';
    await markdown.fill(multilineTable);
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    assert(await rich.locator('table br').count() > 0, 'editor did not preserve table line breaks');
    await page.getByRole('button', { name: '预览', exact: true }).click();
    assert(await page.locator('#article-preview table br').count() > 0, 'preview escaped editor table line breaks');
    await page.getByRole('button', { name: '源码', exact: true }).click();
    assert(await markdown.inputValue() === multilineTable, 'table line-break round trip changed source');
    checks.push('lossless mode switching, table line breaks and shared preview');

    await markdown.fill('可视化写作');
    await page.getByRole('button', { name: '编辑', exact: true }).click();
    await rich.click();
    await rich.press('ControlOrMeta+A');
    await page.locator('[data-writing-action="bold"]').click();
    assert(await rich.locator('strong').textContent() === '可视化写作', 'toolbar did not format selection');
    await page.locator('[data-writing-action="undo"]').click();
    assert(await rich.locator('strong').count() === 0, 'toolbar undo did not restore content');
    await page.locator('[data-writing-action="redo"]').click();
    assert(await rich.locator('strong').count() === 1, 'toolbar redo did not restore formatting');
    checks.push('selection formatting and toolbar undo/redo');

    let releaseSave;
    await page.route('**/api/admin/articles', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      await new Promise(resolve => { releaseSave = resolve; });
      await route.fulfill({status:503, contentType:'application/json', body:JSON.stringify({ok:false,error:{message:'测试保存失败',code:'test_failure'}})});
    });
    await save.click();
    await page.waitForFunction(() => document.querySelector('#article-form').getAttribute('aria-busy') === 'true');
    assert(await rich.getAttribute('contenteditable') === 'false', 'pending save left rich editor editable');
    const pendingBackup = await page.evaluate(() => {
      window.dispatchEvent(new Event('beforeunload', {cancelable:true}));
      const key = Object.keys(localStorage).find(key => key.startsWith('wta:article-drafts:v1:'));
      return Object.values(JSON.parse(localStorage.getItem(key) || '{}'))[0]?.payload;
    });
    assert(pendingBackup?.title === '编辑器交互验证' && pendingBackup.slug === slug && pendingBackup.folder === 'notes' && pendingBackup.status === 'published', 'pending save backup omitted disabled metadata');
    releaseSave();
    await page.locator('#article-action-status[data-kind="error"]').waitFor();
    assert((await markdown.inputValue()).includes('可视化写作'), 'failed save lost the article');
    assert(await rich.getAttribute('contenteditable') === 'true', 'failed save did not unlock editor');
    await page.unroute('**/api/admin/articles');
    checks.push('pending save backup retains metadata and failure retains input');

    await rich.click();
    await rich.press('ControlOrMeta+s');
    await page.locator('#article-action-status').filter({hasText:'文章已保存'}).waitFor();
    created = true;
    const publicPage = await page.context().newPage();
    await publicPage.goto(`${baseUrl}/articles/notes/${slug}`);
    assert(await publicPage.locator('.article-body strong').count() > 0, 'published formatting missing');
    await publicPage.close();
    checks.push('keyboard save and published formatting');

    await rich.fill('刷新后恢复的中文草稿');
    await page.locator('[data-local-draft-status]').filter({hasText:'已备份到本机'}).waitFor();
    await page.reload();
    await page.locator('#article-draft-recovery').waitFor();
    await page.getByRole('button', {name:'恢复草稿', exact:true}).click();
    assert((await rich.textContent()).includes('刷新后恢复的中文草稿'), 'recovered draft lost body');
    assert(await page.locator('[name="title"]').inputValue() === '编辑器交互验证', 'recovered draft lost title');
    checks.push('reload recovery');

    const currentResponse = await page.request.get(`${baseUrl}/api/admin/articles`, {headers:auth});
    const records = (await currentResponse.json()).data.articles;
    const current = records.find(item => item.slug === slug);
    assert(Boolean(current), 'created article absent from admin list');
    const changed = await page.request.patch(`${baseUrl}/api/admin/articles/notes/${slug}`, {headers:auth, data:{...current,title:'服务器上的较新版本',expectedUpdatedAt:current.updatedAt}});
    assert(changed.ok(), 'test could not create a newer server revision');
    await save.click();
    await page.locator('#article-action-status[data-kind="error"]').waitFor();
    assert((await rich.textContent()).includes('刷新后恢复的中文草稿'), 'conflict lost restored draft');
    const version = (await (await page.request.get(`${baseUrl}/api/admin/articles`, {headers:auth})).json()).data.articles.find(item=>item.slug===slug);
    assert(version.title === '服务器上的较新版本', 'stale recovery overwrote newer server version');
    checks.push('restored draft respects server version conflict');

    await page.locator('[data-writing-action="focus"]').click();
    assert(await page.locator('.writing-workspace.is-focused').count() === 1, 'focus mode did not open');
    await page.keyboard.press('Escape');
    assert(await page.locator('.writing-workspace.is-focused').count() === 0, 'Escape did not exit focus mode');
    for (const width of [1440, 1024, 390, 320]) {
      await page.setViewportSize({width,height:1000});
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      assert(!overflow, `admin overflows at ${width}px`);
    }
    checks.push('focus mode and responsive editor');
    return {result:'E2E_EDITOR_PASS',checks};
  } finally {
    if (created) await page.request.delete(`${baseUrl}/api/admin/articles/notes/${slug}`, {headers:auth});
  }
}
