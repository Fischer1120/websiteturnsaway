(function () {
  const root = document.getElementById("admin-root");
  if (!root) return;

  const state = {
    token: sessionStorage.getItem("adminToken") || "",
    authed: false,
    tab: "articles",
    status: "",
    error: "",
    articles: [],
    photos: [],
    folders: { articles: [], images: [] },
    editingArticle: null,
    editingPhoto: null,
    editingFolder: null,
    drafts: { article: null, photo: null, folder: null },
    dirty: false,
    pending: new Set(),
  };

  const API_TIMEOUT_MS = 15_000;

  class ApiError extends Error {
    constructor(message, status = 0, code = "unknown", details = {}) {
      super(message);
      this.name = "ApiError";
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("'", "&#39;");
  }

  function nowLocal() {
    const date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  function toIsoLocal(value) {
    if (!value) return new Date().toISOString();
    return new Date(value).toISOString();
  }

  function fromIso(value) {
    if (!value) return nowLocal();
    const date = new Date(value);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  function renderInlineMarkdown(value) {
    return escapeHtml(value).replaceAll(/`([^`]+)`/g, "<code>$1</code>");
  }

  function markdownToHtml(markdown) {
    const html = [];
    let paragraph = [];
    const flush = () => {
      if (!paragraph.length) return;
      html.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
      paragraph = [];
    };

    for (const rawLine of String(markdown || "").split("\n")) {
      const line = rawLine.trim();
      if (!line) {
        flush();
        continue;
      }
      const image = line.match(/^!\[(.*?)\]\((.*?)(?:\s+"(.*?)")?\)$/);
      if (image) {
        flush();
        html.push(
          `<figure class="inline-figure"><img src="${escapeAttr(image[2])}" alt="${escapeAttr(
            image[1],
          )}" loading="lazy"><figcaption>${escapeHtml(image[3] || image[1])}</figcaption></figure>`,
        );
        continue;
      }
      if (line.startsWith("### ")) {
        flush();
        html.push(`<h3>${renderInlineMarkdown(line.slice(4))}</h3>`);
        continue;
      }
      if (line.startsWith("## ")) {
        flush();
        html.push(`<h2>${renderInlineMarkdown(line.slice(3))}</h2>`);
        continue;
      }
      if (line.startsWith("# ")) {
        flush();
        continue;
      }
      paragraph.push(line);
    }
    flush();
    return html.join("\n");
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${state.token}`);
    if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(path, { ...options, headers, cache: "no-store", signal: controller.signal });
    } catch (error) {
      if (error?.name === "AbortError") throw new ApiError("请求超时，正在查询服务端状态。", 0, "timeout");
      throw new ApiError("暂时无法连接服务端，请稍后重试。", 0, "network_error");
    } finally {
      clearTimeout(timeout);
    }
    const payload = await response.json().catch(() => undefined);
    if (!response.ok || !payload?.ok) {
      const error = new ApiError(
        payload?.error?.message || `Request failed: ${response.status}`,
        response.status,
        payload?.error?.code || "unknown",
        payload?.error?.details || {},
      );
      if (response.status === 401 && state.authed) {
        sessionStorage.removeItem("adminToken");
        state.token = "";
        state.authed = false;
        state.status = "";
        state.error = error.message;
        render();
      }
      throw error;
    }
    return payload.data;
  }

  function setStatus(message, isError) {
    state.status = isError ? "" : message;
    state.error = isError ? message : "";
    const success = document.getElementById("admin-status-region");
    const error = document.getElementById("admin-error-region");
    if (success) {
      success.textContent = state.status;
      success.hidden = !state.status;
    }
    if (error) {
      error.textContent = state.error;
      error.hidden = !state.error;
    }
  }

  function setDirty(value = true) {
    state.dirty = value;
  }

  function confirmDiscard(message = "当前草稿尚未保存，确定放弃修改吗？") {
    return !state.dirty || confirm(message);
  }

  function isBusy() {
    return state.pending.size > 0;
  }

  function updateBusyUi() {
    root.setAttribute("aria-busy", isBusy() ? "true" : "false");
    const pending = document.getElementById("admin-pending-region");
    if (pending) {
      pending.hidden = !isBusy();
      pending.textContent = isBusy() ? "正在保存，请稍候；切换、删除和退出已暂时锁定。" : "";
    }
    root.querySelectorAll("button, input, select, textarea").forEach((control) => {
      if (isBusy()) {
        if (!control.dataset.pendingDisabled) control.dataset.pendingDisabled = control.disabled ? "true" : "false";
        control.disabled = true;
      } else if (control.dataset.pendingDisabled) {
        control.disabled = control.dataset.pendingDisabled === "true";
        delete control.dataset.pendingDisabled;
      }
    });
  }

  async function runMutation(key, action) {
    if (state.pending.has(key)) return undefined;
    state.pending.add(key);
    updateBusyUi();
    try {
      return await action();
    } finally {
      state.pending.delete(key);
      updateBusyUi();
    }
  }

  function formatApiError(error) {
    if (!(error instanceof ApiError)) return error?.message || "请求失败，请稍后重试。";
    if (error.status === 409) return `保存冲突：${error.message} 请保留草稿后刷新再试。`;
    if (error.status === 413 || error.status === 415) return error.message;
    if (error.status >= 500 || error.status === 0) return `${error.message} 草稿和登录状态已保留，可重试。`;
    return error.message;
  }

  async function loadAll() {
    const [articles, photos, folders] = await Promise.all([
      api("/api/admin/articles"),
      api("/api/admin/images"),
      api("/api/admin/folders"),
    ]);
    state.articles = articles.articles || [];
    state.photos = photos.photos || [];
    state.folders = folders;
  }

  async function reconcileAfterMutation(kind, record, { deleted = false, message = "已保存。" } = {}) {
    try {
      await loadAll();
    } catch (error) {
      setStatus(`${message} 但列表刷新失败：${error.message || "请稍后刷新"}`, true);
      return false;
    }

    if (kind === "article") {
      state.editingArticle = deleted
        ? null
        : state.articles.find((item) => item.folder === record.folder && item.slug === record.slug) || record;
      state.drafts.article = null;
    } else if (kind === "photo") {
      state.editingPhoto = deleted
        ? null
        : state.photos.find((item) => item.folder === record.folder && item.id === record.id) || record;
      state.drafts.photo = null;
    } else if (kind === "folder") {
      state.editingFolder = deleted ? null : { ...record, kind: record.kind || state.editingFolder?.kind };
      state.drafts.folder = null;
    }
    state.dirty = false;
    setStatus(message, false);
    render();
    return true;
  }

  async function reconcileAfterTimeout(kind, previous, desired) {
    try {
      await loadAll();
    } catch {
      return false;
    }
    if (kind === "article") {
      const record = state.articles.find((item) =>
        (item.folder === desired.folder && item.slug === desired.slug) ||
        (item.folder === previous?.folder && item.slug === previous?.slug),
      );
      if (!record) return false;
      state.editingArticle = record;
      state.drafts.article = null;
      state.dirty = false;
      setStatus("请求超时，但服务端已保存；界面已同步。", false);
      render();
      return true;
    }
    if (kind === "photo") {
      if (!previous) return false;
      const record = state.photos.find((item) => item.folder === previous.folder && item.id === previous.id);
      if (!record) return false;
      state.editingPhoto = record;
      state.drafts.photo = null;
      state.dirty = false;
      setStatus("请求超时，但服务端已保存；界面已同步。", false);
      render();
      return true;
    }
    return false;
  }

  async function reconcileDeleteAfterTimeout(kind, target) {
    try {
      await loadAll();
    } catch {
      return false;
    }
    const exists = kind === "article"
      ? state.articles.some((item) => item.folder === target.folder && item.slug === target.slug)
      : state.photos.some((item) => item.folder === target.folder && item.id === target.id);
    if (exists) return false;
    if (kind === "article") state.editingArticle = null;
    if (kind === "photo") state.editingPhoto = null;
    state.drafts[kind] = null;
    state.dirty = false;
    setStatus("请求超时，但服务端已删除；界面已同步。", false);
    render();
    return true;
  }

  function folderOptions(kind, selected) {
    const folders = [...(state.folders[kind] || [])];
    if (selected && !folders.some((folder) => folder.slug === selected)) {
      folders.unshift({ slug: selected, label: selected });
    }
    return folders
      .map((folder) => `<option value="${escapeAttr(folder.slug)}" ${folder.slug === selected ? "selected" : ""}>${escapeHtml(folder.label || folder.slug)} / ${escapeHtml(folder.slug)}</option>`)
      .join("");
  }

  function loginView() {
    return `
      <div class="section-heading">
        <div>
          <p class="eyebrow">Admin Console</p>
          <h1>后台管理</h1>
        </div>
        <p>输入管理密码后，可以上传和管理文章、图片与分组。密码只保存在当前浏览器会话。</p>
      </div>
      <form class="admin-login" id="login-form">
        <label class="visually-hidden"><span>管理员用户名</span><input name="username" value="admin" autocomplete="username" tabindex="-1"></label>
        <label>
          <span>管理密码</span>
          <input name="token" type="password" autocomplete="current-password" placeholder="ADMIN_TOKEN_SECRET" required>
        </label>
        <button class="button primary" type="submit">进入后台</button>
        ${state.error ? `<p class="admin-message error">${escapeHtml(state.error)}</p>` : ""}
      </form>
    `;
  }

  function appChrome(content) {
    const tabs = [
      ["articles", "文章"],
      ["images", "图片"],
      ["folders", "分组"],
    ];
    return `
      <div class="section-heading">
        <div>
          <p class="eyebrow">Admin Console / R2 CMS</p>
          <h1>内容管理</h1>
        </div>
        <p>当前会话已登录；所有保存动作都会写入 R2，并刷新公开索引。</p>
      </div>
      <div class="admin-toolbar">
        <div class="admin-tabs" role="tablist" aria-label="后台内容类型">
          ${tabs
            .map(([id, label]) => `<button class="admin-tab ${state.tab === id ? "active" : ""}" role="tab" aria-selected="${state.tab === id}" aria-controls="admin-panel-${id}" data-tab="${id}" type="button">${label}</button>`)
            .join("")}
        </div>
        <button class="button secondary" data-action="logout" type="button">退出</button>
      </div>
      <p id="admin-status-region" class="admin-message success" role="status" aria-live="polite" ${state.status ? "" : "hidden"}>${escapeHtml(state.status)}</p>
      <p id="admin-error-region" class="admin-message error" role="alert" ${state.error ? "" : "hidden"}>${escapeHtml(state.error)}</p>
      <p id="admin-pending-region" class="admin-message" role="status" aria-live="polite" ${isBusy() ? "" : "hidden"}></p>
      ${content}
    `;
  }

  function articleForm() {
    const article =
      state.drafts.article || state.editingArticle || {
        title: "",
        subtitle: "",
        summary: "",
        folder: state.folders.articles?.[0]?.slug || "notes",
        slug: "",
        coverImage: "",
        publishedAt: nowLocal(),
        tags: "",
        status: "published",
        markdown: "# 新文章\n\n## 第一段\n\n从这里开始写。",
      };
    const editing = Boolean(state.editingArticle);
    return `
      <form class="admin-form" id="article-form">
        <div class="form-grid two">
          <label><span>标题</span><input name="title" value="${escapeAttr(article.title)}" required></label>
          <label><span>副标题</span><input name="subtitle" value="${escapeAttr(article.subtitle)}"></label>
          <label><span>分组</span><select name="folder">${folderOptions("articles", article.folder)}</select></label>
          <label><span>Slug</span><input name="slug" value="${escapeAttr(article.slug)}" pattern="[a-z0-9]+(-[a-z0-9]+)*" required></label>
          <label><span>发布时间</span><input name="publishedAt" type="datetime-local" value="${escapeAttr(fromIso(article.publishedAt))}"></label>
          <label><span>状态</span><select name="status"><option value="published" ${article.status !== "draft" ? "selected" : ""}>published</option><option value="draft" ${article.status === "draft" ? "selected" : ""}>draft</option></select></label>
        </div>
        <label><span>摘要</span><textarea name="summary" rows="2">${escapeHtml(article.summary)}</textarea></label>
        <label><span>封面图 URL</span><input name="coverImage" value="${escapeAttr(article.coverImage)}" placeholder="/media/articles/.../assets/cover.webp"></label>
        <label><span>标签（逗号分隔）</span><input name="tags" value="${escapeAttr(Array.isArray(article.tags) ? article.tags.join(", ") : article.tags || "")}"></label>
        <label><span>Markdown 正文</span><textarea class="code-editor" name="markdown" rows="16">${escapeHtml(article.markdown)}</textarea></label>
        <div class="asset-uploader">
          <input id="article-asset-file" type="file" accept="image/jpeg,image/png,image/webp">
          <button class="button secondary" data-action="upload-article-asset" data-mutation="article-asset" type="button">上传插图并插入</button>
        </div>
        <div class="form-actions">
          <button class="button primary" data-mutation="article-save" type="submit">${editing ? "保存文章" : "创建文章"}</button>
          <button class="button secondary" data-action="new-article" type="button">新建</button>
          ${editing ? `<button class="button danger" data-action="delete-article" data-mutation="article-delete" type="button">删除</button>` : ""}
        </div>
        <div class="admin-preview article-body" id="article-preview">${markdownToHtml(article.markdown)}</div>
      </form>
    `;
  }

  function articlesView() {
    return appChrome(`
      <div class="admin-workbench">
        <aside class="admin-list">
          <div class="admin-list-heading">
            <strong>文章记录</strong>
            <button class="admin-mini-action" data-action="new-article" type="button">新建文章</button>
            <span>${state.articles.length} records</span>
          </div>
          ${state.articles.length ? state.articles.map((article) => `
            <button class="admin-list-item" data-edit-article="${escapeAttr(article.folder)}/${escapeAttr(article.slug)}" type="button">
              <strong>${escapeHtml(article.title || article.slug)}</strong>
              <span>${escapeHtml(article.folder)} / ${escapeHtml(article.slug)} / ${escapeHtml(article.status)}</span>
            </button>
          `).join("") : `<p class="empty-state">还没有文章。</p>`}
        </aside>
        <section class="admin-editor" id="admin-panel-articles" role="tabpanel">${articleForm()}</section>
      </div>
    `);
  }

  function imageForm() {
    const photo =
      state.drafts.photo || state.editingPhoto || {
        id: "",
        title: "",
        description: "",
        folder: state.folders.images?.[0]?.slug || "city-walk",
        capturedAt: nowLocal(),
        alt: "",
        visibility: "public",
        location: { label: "", precision: "city" },
        camera: {},
      };
    const editing = Boolean(state.editingPhoto);
    return `
      <form class="admin-form" id="image-form">
        <div class="form-grid two">
          <label><span>标题</span><input name="title" value="${escapeAttr(photo.title)}" required></label>
          <label><span>分组</span><select name="folder" ${editing ? "disabled" : ""} aria-describedby="image-folder-help">${folderOptions("images", photo.folder)}</select></label>
          <label><span>拍摄时间</span><input name="capturedAt" type="datetime-local" value="${escapeAttr(fromIso(photo.capturedAt))}"></label>
          <label><span>可见性</span><select name="visibility"><option value="public" ${photo.visibility !== "private" ? "selected" : ""}>public</option><option value="private" ${photo.visibility === "private" ? "selected" : ""}>private</option></select></label>
          <label><span>地点</span><input name="locationLabel" value="${escapeAttr(photo.location?.label)}"></label>
          <label><span>位置精度</span><select name="locationPrecision"><option value="city" ${photo.location?.precision === "city" ? "selected" : ""}>city</option><option value="approximate" ${photo.location?.precision === "approximate" ? "selected" : ""}>approximate</option><option value="exact" ${photo.location?.precision === "exact" ? "selected" : ""}>exact</option></select></label>
          <label><span>相机</span><input name="cameraMake" value="${escapeAttr(photo.camera?.make)}" placeholder="Apple"></label>
          <label><span>型号</span><input name="cameraModel" value="${escapeAttr(photo.camera?.model)}" placeholder="iPhone"></label>
          <label><span>镜头</span><input name="cameraLens" value="${escapeAttr(photo.camera?.lens)}" placeholder="26mm"></label>
          <label><span>ISO</span><input name="cameraIso" type="number" value="${escapeAttr(photo.camera?.iso || "")}"></label>
          <label><span>光圈</span><input name="cameraAperture" value="${escapeAttr(photo.camera?.aperture)}" placeholder="f/1.8"></label>
          <label><span>快门</span><input name="cameraShutter" value="${escapeAttr(photo.camera?.shutter)}" placeholder="1/120"></label>
        </div>
        <label><span>Alt 文本</span><input name="alt" value="${escapeAttr(photo.alt)}"></label>
        <label><span>描述</span><textarea name="description" rows="4">${escapeHtml(photo.description)}</textarea></label>
        ${editing ? `<p id="image-folder-help" class="system-text">图片移动暂未实现；保存时保留原分组。</p>` : ""}
        ${editing ? "" : `<label><span>原图</span><input name="file" type="file" accept="image/jpeg,image/png,image/webp" required></label>`}
        ${editing && photo.imageUrl ? `<div class="admin-photo-preview"><img src="${escapeAttr(photo.thumbUrl || photo.imageUrl)}" alt="${escapeAttr(photo.alt || photo.title)}"></div>` : ""}
        <div class="form-actions">
          <button class="button primary" data-mutation="image-save" type="submit">${editing ? "保存图片元数据" : "上传图片"}</button>
          <button class="button secondary" data-action="new-photo" type="button">新建</button>
          ${editing ? `<button class="button danger" data-action="delete-photo" data-mutation="image-delete" type="button">删除</button>` : ""}
        </div>
      </form>
    `;
  }

  function imagesView() {
    return appChrome(`
      <div class="admin-workbench">
        <aside class="admin-list">
          <div class="admin-list-heading">
            <strong>图片记录</strong>
            <span>${state.photos.length} records</span>
          </div>
          ${state.photos.length ? state.photos.map((photo) => `
            <button class="admin-list-item" data-edit-photo="${escapeAttr(photo.folder)}/${escapeAttr(photo.id)}" type="button">
              <strong>${escapeHtml(photo.title || photo.id)}</strong>
              <span>${escapeHtml(photo.folder)} / ${escapeHtml(photo.id)} / ${escapeHtml(photo.visibility)}</span>
            </button>
          `).join("") : `<p class="empty-state">还没有图片。</p>`}
        </aside>
        <section class="admin-editor" id="admin-panel-images" role="tabpanel">${imageForm()}</section>
      </div>
    `);
  }

  function folderForm() {
    const folder = state.drafts.folder || state.editingFolder || { kind: "articles", slug: "", label: "", description: "", order: 999 };
    const editing = Boolean(state.editingFolder);
    return `
      <form class="admin-form compact" id="folder-form">
        <div class="form-grid two">
          <label><span>类型</span><select name="kind" ${editing ? "disabled" : ""}><option value="articles" ${folder.kind === "articles" ? "selected" : ""}>文章分组</option><option value="images" ${folder.kind === "images" ? "selected" : ""}>图片分组</option></select></label>
          <label><span>Slug</span><input name="slug" value="${escapeAttr(folder.slug)}" pattern="[a-z0-9]+(-[a-z0-9]+)*" ${editing ? "readonly" : ""} required></label>
          <label><span>显示名</span><input name="label" value="${escapeAttr(folder.label)}" required></label>
          <label><span>排序</span><input name="order" type="number" value="${escapeAttr(folder.order)}"></label>
        </div>
        <label><span>描述</span><textarea name="description" rows="3">${escapeHtml(folder.description)}</textarea></label>
        <div class="form-actions">
          <button class="button primary" data-mutation="folder-save" type="submit">保存分组</button>
          <button class="button secondary" data-action="new-folder" type="button">新建</button>
          ${state.editingFolder ? `<button class="button danger" data-action="delete-folder" data-mutation="folder-delete" type="button">删除分组</button>` : ""}
        </div>
      </form>
    `;
  }

  function foldersView() {
    const groups = [
      ["articles", "文章分组", state.folders.articles || []],
      ["images", "图片分组", state.folders.images || []],
    ];
    return appChrome(`
      <div class="admin-workbench">
        <aside class="admin-list">
          ${groups
            .map(
              ([kind, label, folders]) => `
              <div class="admin-list-heading"><strong>${label}</strong><span>${folders.length} groups</span></div>
              ${folders
                .map(
                  (folder) => `
                  <button class="admin-list-item" data-edit-folder="${kind}/${escapeAttr(folder.slug)}" type="button">
                    <strong>${escapeHtml(folder.label || folder.slug)}</strong>
                    <span>${escapeHtml(folder.slug)} / ${escapeHtml(folder.description || "")}</span>
                  </button>
                `,
                )
                .join("")}
            `,
            )
            .join("")}
        </aside>
        <section class="admin-editor" id="admin-panel-folders" role="tabpanel">${folderForm()}</section>
      </div>
    `);
  }

  function render() {
    root.setAttribute("aria-busy", isBusy() ? "true" : "false");
    if (!state.authed) {
      root.innerHTML = loginView();
    } else if (state.tab === "images") {
      root.innerHTML = imagesView();
    } else if (state.tab === "folders") {
      root.innerHTML = foldersView();
    } else {
      root.innerHTML = articlesView();
    }
    bind();
    setStatus(state.status || state.error || "", Boolean(state.error));
    updateBusyUi();
  }

  function bind() {
    document.getElementById("login-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      state.token = new FormData(event.currentTarget).get("token").toString();
      sessionStorage.setItem("adminToken", state.token);
      try {
        await loadAll();
        state.authed = true;
        state.dirty = false;
        state.drafts = { article: null, photo: null, folder: null };
        state.error = "";
        state.status = "登录成功。";
        render();
      } catch (error) {
        state.authed = false;
        if (error.status === 401) {
          sessionStorage.removeItem("adminToken");
          state.token = "";
          state.error = "管理密码不正确。";
        } else {
          state.error = error.message || "暂时无法连接后台，请稍后重试。";
        }
        render();
      }
    });

    root.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        if (isBusy()) return;
        if (!confirmDiscard()) return;
        state.tab = button.getAttribute("data-tab");
        state.error = "";
        state.status = "";
        state.dirty = false;
        state.drafts = { article: null, photo: null, folder: null };
        render();
      });
    });

    root.querySelector('[data-action="logout"]')?.addEventListener("click", () => {
      if (isBusy()) return;
      if (!confirmDiscard("当前草稿尚未保存，确定退出吗？")) return;
      sessionStorage.removeItem("adminToken");
      state.token = "";
      state.authed = false;
      state.status = "";
      state.error = "";
      state.dirty = false;
      render();
    });

    bindArticles();
    bindImages();
    bindFolders();
  }

  function formString(data, name, fallback = "") {
    const value = data.get(name);
    return value === null || value === undefined ? fallback : String(value);
  }

  function articlePayload(form) {
    const data = new FormData(form);
    return {
      title: formString(data, "title"),
      subtitle: formString(data, "subtitle"),
      summary: formString(data, "summary"),
      folder: formString(data, "folder"),
      slug: formString(data, "slug"),
      coverImage: formString(data, "coverImage"),
      publishedAt: toIsoLocal(formString(data, "publishedAt")),
      tags: formString(data, "tags").split(",").map((item) => item.trim()).filter(Boolean),
      status: formString(data, "status"),
      markdown: formString(data, "markdown"),
      ...(state.editingArticle?.updatedAt ? { expectedUpdatedAt: state.editingArticle.updatedAt } : {}),
    };
  }

  function bindArticles() {
    root.querySelectorAll("[data-edit-article]").forEach((button) => {
      button.addEventListener("click", () => {
        if (isBusy()) return;
        if (!confirmDiscard()) return;
        const [folder, slug] = button.getAttribute("data-edit-article").split("/");
        state.editingArticle = state.articles.find((article) => article.folder === folder && article.slug === slug);
        state.drafts.article = null;
        state.dirty = false;
        render();
      });
    });

    root.querySelectorAll('[data-action="new-article"]').forEach((button) => {
      button.addEventListener("click", () => {
        if (isBusy()) return;
        if (!confirmDiscard()) return;
        state.editingArticle = null;
        state.drafts.article = null;
        state.dirty = false;
        render();
      });
    });

    const form = document.getElementById("article-form");
    form?.addEventListener("input", () => {
      const currentForm = document.getElementById("article-form");
      if (!currentForm) return;
      state.drafts.article = articlePayload(currentForm);
      setDirty();
      const markdown = new FormData(currentForm).get("markdown")?.toString() || "";
      const preview = document.getElementById("article-preview");
      if (preview) preview.innerHTML = markdownToHtml(markdown);
    });

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const currentForm = document.getElementById("article-form");
      if (!currentForm) return;
      const previous = state.editingArticle;
      const payload = articlePayload(currentForm);
      await runMutation("article-save", async () => {
        try {
          const path = previous
            ? `/api/admin/articles/${previous.folder}/${previous.slug}`
            : "/api/admin/articles";
          const method = previous ? "PATCH" : "POST";
          const article = await api(path, { method, body: JSON.stringify(payload) });
          state.editingArticle = article;
          await reconcileAfterMutation("article", article, { message: "文章已保存。" });
        } catch (error) {
          if (error.code === "timeout" && await reconcileAfterTimeout("article", previous, payload)) return;
          setStatus(formatApiError(error), true);
        }
      });
    });

    root.querySelector('[data-action="delete-article"]')?.addEventListener("click", async () => {
      if (!state.editingArticle || !confirm("确认删除这篇文章？")) return;
      await runMutation("article-delete", async () => {
        const target = state.editingArticle;
        try {
          await api(`/api/admin/articles/${target.folder}/${target.slug}`, { method: "DELETE" });
          await reconcileAfterMutation("article", target, { deleted: true, message: "文章已删除。" });
        } catch (error) {
          if (error.code === "timeout" && await reconcileDeleteAfterTimeout("article", target)) return;
          setStatus(formatApiError(error), true);
        }
      });
    });

    root.querySelector('[data-action="upload-article-asset"]')?.addEventListener("click", async () => {
      const currentForm = document.getElementById("article-form");
      if (!currentForm) return;
      const payload = articlePayload(currentForm);
      const input = document.getElementById("article-asset-file");
      const file = input?.files?.[0];
      if (!file) return setStatus("请选择要上传的插图。", true);
      if (!payload.folder || !payload.slug) return setStatus("请先填写文章分组和 slug。", true);
      const body = new FormData();
      body.set("file", file);
      await runMutation("article-asset", async () => {
        try {
        const result = await api(`/api/admin/articles/${payload.folder}/${payload.slug}/assets`, { method: "POST", body });
        const textarea = currentForm.querySelector('[name="markdown"]');
        const insert = `\n\n![${file.name}](${result.url} "${file.name}")\n`;
        const start = textarea.selectionStart || textarea.value.length;
        textarea.value = `${textarea.value.slice(0, start)}${insert}${textarea.value.slice(start)}`;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        setStatus("插图已上传并插入正文。");
        } catch (error) {
          setStatus(formatApiError(error), true);
        }
      });
    });
  }

  async function createThumb(file) {
    const bitmap = await createImageBitmap(file);
    const max = 900;
    const ratio = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close?.();
      throw new Error("无法创建缩略图画布。");
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    bitmap.close?.();
    if (!blob) throw new Error("无法生成 WebP 缩略图。");
    return new File([blob], "thumb.webp", { type: "image/webp" });
  }

  function photoPayload(form) {
    const data = new FormData(form);
    return {
      title: formString(data, "title"),
      folder: formString(data, "folder", state.editingPhoto?.folder || ""),
      description: formString(data, "description"),
      capturedAt: toIsoLocal(formString(data, "capturedAt")),
      alt: formString(data, "alt"),
      visibility: formString(data, "visibility", "public"),
      location: {
        label: formString(data, "locationLabel"),
        precision: formString(data, "locationPrecision", "city"),
      },
      camera: {
        make: formString(data, "cameraMake"),
        model: formString(data, "cameraModel"),
        lens: formString(data, "cameraLens"),
        iso: data.get("cameraIso") ? Number(data.get("cameraIso")) : undefined,
        aperture: formString(data, "cameraAperture"),
        shutter: formString(data, "cameraShutter"),
      },
      ...(state.editingPhoto?.updatedAt ? { expectedUpdatedAt: state.editingPhoto.updatedAt } : {}),
    };
  }

  function bindImages() {
    root.querySelectorAll("[data-edit-photo]").forEach((button) => {
      button.addEventListener("click", () => {
        if (isBusy()) return;
        if (!confirmDiscard()) return;
        const [folder, id] = button.getAttribute("data-edit-photo").split("/");
        state.editingPhoto = state.photos.find((photo) => photo.folder === folder && photo.id === id);
        state.drafts.photo = null;
        state.dirty = false;
        render();
      });
    });

    root.querySelector('[data-action="new-photo"]')?.addEventListener("click", () => {
      if (isBusy()) return;
      if (!confirmDiscard()) return;
      state.editingPhoto = null;
      state.drafts.photo = null;
      state.dirty = false;
      render();
    });

    const form = document.getElementById("image-form");
    form?.addEventListener("input", () => {
      const currentForm = document.getElementById("image-form");
      if (!currentForm) return;
      state.drafts.photo = photoPayload(currentForm);
      setDirty();
    });
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const currentForm = document.getElementById("image-form");
      if (!currentForm) return;
      const previous = state.editingPhoto;
      const metadata = photoPayload(currentForm);
      const file = currentForm.querySelector('[name="file"]')?.files?.[0];
      await runMutation("image-save", async () => {
        try {
        if (previous) {
          const photo = await api(`/api/admin/images/${previous.folder}/${previous.id}`, {
            method: "PATCH",
            body: JSON.stringify(metadata),
          });
          state.editingPhoto = photo;
          await reconcileAfterMutation("photo", photo, { message: "图片元数据已保存。" });
          return;
        }

        if (!file) return setStatus("请选择图片文件。", true);
        const body = new FormData();
        body.set("folder", metadata.folder);
        body.set("metadata", JSON.stringify(metadata));
        body.set("file", file);
        body.set("thumb", await createThumb(file));
        const photo = await api("/api/admin/images", { method: "POST", body });
        state.editingPhoto = photo;
        await reconcileAfterMutation("photo", photo, { message: "图片已上传。" });
        } catch (error) {
          if (error.code === "timeout" && await reconcileAfterTimeout("photo", previous, metadata)) return;
          setStatus(formatApiError(error), true);
        }
      });
    });

    root.querySelector('[data-action="delete-photo"]')?.addEventListener("click", async () => {
      if (!state.editingPhoto || !confirm("确认删除这张图片？")) return;
      await runMutation("image-delete", async () => {
        const target = state.editingPhoto;
        try {
          await api(`/api/admin/images/${target.folder}/${target.id}`, { method: "DELETE" });
          await reconcileAfterMutation("photo", target, { deleted: true, message: "图片已删除。" });
        } catch (error) {
          if (error.code === "timeout" && await reconcileDeleteAfterTimeout("photo", target)) return;
          setStatus(formatApiError(error), true);
        }
      });
    });
  }

  function folderPayload(form) {
    const data = new FormData(form);
    return {
      kind: state.editingFolder?.kind || formString(data, "kind", "articles"),
      slug: formString(data, "slug"),
      label: formString(data, "label"),
      description: formString(data, "description"),
      order: Number(data.get("order") || 999),
    };
  }

  function bindFolders() {
    root.querySelectorAll("[data-edit-folder]").forEach((button) => {
      button.addEventListener("click", () => {
        if (isBusy()) return;
        if (!confirmDiscard()) return;
        const [kind, slug] = button.getAttribute("data-edit-folder").split("/");
        const folder = state.folders[kind].find((item) => item.slug === slug);
        state.editingFolder = { ...folder, kind };
        state.drafts.folder = null;
        state.dirty = false;
        render();
      });
    });

    root.querySelector('[data-action="new-folder"]')?.addEventListener("click", () => {
      if (isBusy()) return;
      if (!confirmDiscard()) return;
      state.editingFolder = null;
      state.drafts.folder = null;
      state.dirty = false;
      render();
    });

    const form = document.getElementById("folder-form");
    form?.addEventListener("input", () => {
      const currentForm = document.getElementById("folder-form");
      if (!currentForm) return;
      state.drafts.folder = folderPayload(currentForm);
      setDirty();
    });
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const currentForm = document.getElementById("folder-form");
      if (!currentForm) return;
      const payload = folderPayload(currentForm);
      await runMutation("folder-save", async () => {
        try {
        const folder = await api("/api/admin/folders", { method: state.editingFolder ? "PATCH" : "POST", body: JSON.stringify(payload) });
        await reconcileAfterMutation("folder", { ...folder, kind: payload.kind }, { message: "分组已保存。" });
        } catch (error) {
          setStatus(formatApiError(error), true);
        }
      });
    });

    root.querySelector('[data-action="delete-folder"]')?.addEventListener("click", async () => {
      if (isBusy() || !state.editingFolder || !confirm("确认删除这个空分组？非空分组会被拒绝删除。")) return;
      await runMutation("folder-delete", async () => {
        const target = state.editingFolder;
        try {
          await api("/api/admin/folders", { method: "DELETE", body: JSON.stringify(target) });
          await reconcileAfterMutation("folder", target, { deleted: true, message: "分组已删除。" });
        } catch (error) {
          setStatus(formatApiError(error), true);
        }
      });
    });
  }

  window.addEventListener("beforeunload", (event) => {
    if (!state.dirty) return;
    event.preventDefault();
  });

  if (state.token) {
    loadAll()
      .then(() => {
        state.authed = true;
        render();
      })
      .catch((error) => {
        state.authed = false;
        if (error.status === 401) {
          sessionStorage.removeItem("adminToken");
          state.token = "";
          state.error = "管理密码不正确。";
        } else {
          state.error = error.message || "暂时无法连接后台，请稍后重试。";
        }
        render();
      });
  } else {
    render();
  }
})();
