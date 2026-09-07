(function () {
  const root = document.getElementById("admin-root");
  if (!root) return;

  const TAB_IDS = ["articles", "images", "folders"];
  const TAB_LABELS = {
    articles: "文章",
    images: "图片",
    folders: "分组",
  };
  const API_TIMEOUT_MS = 15_000;
  const MARKDOWN_PREVIEW_DELAY_MS = 150;
  const MAX_ORIGINAL_IMAGE_BYTES = 15 * 1024 * 1024;

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
    pending: new Map(),
    mobileView: { articles: "list", images: "list", folders: "list" },
    listScroll: { articles: 0, images: 0, folders: 0 },
    photoExifPending: false,
    photoExifStatus: "",
    photoExifStatusKind: "",
    photoSelectionToken: 0,
    photoTouched: new Set(),
    photoAutoFields: new Set(),
    photoExifFields: {},
  };

  let markdownPreviewTimer = 0;

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
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("'", "&#39;");
  }

  function escapeMarkdownLabel(value) {
    return String(value ?? "")
      .replaceAll("\\", "\\\\")
      .replaceAll("[", "\\[")
      .replaceAll("]", "\\]")
      .replaceAll('"', "\\\"")
      .replaceAll("\n", " ")
      .trim();
  }

  function safeLocalMediaUrl(value) {
    const candidate = String(value ?? "").trim();
    if (!candidate.startsWith("/") || candidate.startsWith("//")) return "";
    try {
      const url = new URL(candidate, window.location.origin);
      if (url.origin !== window.location.origin) return "";
      if (!url.pathname.startsWith("/media/") && !url.pathname.startsWith("/assets/")) return "";
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return "";
    }
  }

  function nowLocal() {
    const date = new Date();
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  function toIsoLocal(value) {
    if (!value) return new Date().toISOString();
    const parsed = new Date(value);
    return Number.isNaN(parsed.valueOf()) ? value : parsed.toISOString();
  }

  function fromIso(value) {
    if (!value) return nowLocal();
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return nowLocal();
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

    for (const rawLine of String(markdown ?? "").split("\n")) {
      const line = rawLine.trim();
      if (!line) {
        flush();
        continue;
      }
      const image = line.match(/^!\[(.*?)\]\((.*?)(?:\s+"(.*?)")?\)$/);
      if (image) {
        flush();
        const source = safeLocalMediaUrl(image[2]);
        if (source) {
          html.push(
            `<figure class="inline-figure"><img src="${escapeAttr(source)}" alt="${escapeAttr(
              image[1],
            )}" loading="lazy"><figcaption>${escapeHtml(image[3] || image[1])}</figcaption></figure>`,
          );
        } else {
          html.push(`<p class="system-text">${escapeHtml(`[图片地址不可预览] ${image[1] || image[2]}`)}</p>`);
        }
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
        mountLogin({ focus: true });
      }
      throw error;
    }
    return payload.data;
  }

  function formatApiError(error) {
    if (!(error instanceof ApiError)) return error?.message || "请求失败，请稍后重试。";
    if (error.status === 409) return `保存冲突：${error.message} 请保留草稿后刷新再试。`;
    if (error.status === 413 || error.status === 415) return error.message;
    if (error.status >= 500 || error.status === 0) return `${error.message} 草稿和登录状态已保留，可重试。`;
    return error.message;
  }

  function setActionStatus(scope, message, kind = "") {
    const region = document.getElementById(`${scope}-action-status`);
    if (!region) return;
    region.textContent = message;
    region.dataset.kind = kind;
    region.hidden = !message;
  }

  function setStatus(message, isError = false, { focus = false, scope = "" } = {}) {
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
    if (scope) setActionStatus(scope, message, isError ? "error" : "success");
    if (focus && isError) requestAnimationFrame(() => error?.focus());
  }

  function setDirty(value = true) {
    state.dirty = value;
    updateDirtyUi();
  }

  function updateDirtyUi() {
    const text = state.dirty ? "未保存" : "已同步";
    root.dataset.unsaved = state.dirty ? "true" : "false";
    root.querySelectorAll(".save-indicator").forEach((indicator) => {
      indicator.textContent = text;
      indicator.classList.toggle("unsaved", state.dirty);
    });
    const form = currentForm();
    if (form) form.dataset.unsaved = state.dirty ? "true" : "false";
  }

  function isBusy() {
    return state.pending.size > 0;
  }

  function isScopeBusy(scope) {
    return [...state.pending.values()].some((entry) => entry.scope === scope);
  }

  function setTemporaryDisabled(control, disabled) {
    if (!(control instanceof HTMLButtonElement || control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return;
    if (disabled) {
      if (control.dataset.busyDisabled === undefined) control.dataset.busyDisabled = control.disabled ? "true" : "false";
      control.disabled = true;
      return;
    }
    if (control.dataset.busyDisabled !== undefined) {
      control.disabled = control.dataset.busyDisabled === "true";
      delete control.dataset.busyDisabled;
    }
  }

  function updateBusyUi() {
    const busy = isBusy();
    root.setAttribute("aria-busy", busy ? "true" : "false");
    const pendingRegion = document.getElementById("admin-pending-region");
    if (pendingRegion) {
      const entries = [...state.pending.values()];
      pendingRegion.hidden = !entries.length;
      pendingRegion.textContent = entries.at(-1)?.message || "";
      pendingRegion.dataset.kind = entries.length ? "pending" : "";
    }

    root.querySelectorAll("[data-navigation-control]").forEach((control) => setTemporaryDisabled(control, busy));
    root.querySelectorAll("[data-mutation]").forEach((control) => {
      const scope = control.dataset.scope || "";
      const mutation = control.dataset.mutation || "";
      const shouldDisable = state.pending.has(mutation) || (scope && isScopeBusy(scope));
      setTemporaryDisabled(control, shouldDisable);
      if (state.pending.has(mutation)) {
        if (!control.dataset.idleLabel) control.dataset.idleLabel = control.textContent;
        control.textContent = control.dataset.pendingLabel || "处理中…";
        control.setAttribute("aria-busy", "true");
      } else {
        if (control.dataset.idleLabel) {
          control.textContent = control.dataset.idleLabel;
          delete control.dataset.idleLabel;
        }
        control.removeAttribute("aria-busy");
      }
    });

    const scopedLocks = [
      ["login", "#login-form input, #login-form button"],
      ["article-save", "#article-form input, #article-form select, #article-form textarea, #article-form button"],
      ["article-asset", "#article-asset-file, #article-form [name='markdown']"],
      ["image-save", "#image-form input, #image-form select, #image-form textarea, #image-form button"],
      ["folder-save", "#folder-form input, #folder-form select, #folder-form textarea, #folder-form button"],
    ];
    for (const [key, selector] of scopedLocks) {
      root.querySelectorAll(selector).forEach((control) => setTemporaryDisabled(control, state.pending.has(key)));
    }

    const imageSubmit = root.querySelector('[data-mutation="image-save"]');
    if (imageSubmit && !state.pending.has("image-save")) setTemporaryDisabled(imageSubmit, state.photoExifPending);
    root.querySelectorAll("form").forEach((form) => {
      const scope = form.dataset.scope;
      form.setAttribute("aria-busy", scope && isScopeBusy(scope) ? "true" : "false");
    });
  }

  async function runMutation(key, { scope, message }, action) {
    if (state.pending.has(key) || isScopeBusy(scope)) return undefined;
    state.pending.set(key, { scope, message });
    setActionStatus(scope, message, "pending");
    updateBusyUi();
    try {
      return await action();
    } finally {
      state.pending.delete(key);
      updateBusyUi();
    }
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

  function kindForTab(tab = state.tab) {
    return tab === "articles" ? "article" : tab === "images" ? "photo" : "folder";
  }

  function editingForKind(kind) {
    return kind === "article" ? state.editingArticle : kind === "photo" ? state.editingPhoto : state.editingFolder;
  }

  function clearDraftForTab(tab = state.tab) {
    const kind = kindForTab(tab);
    state.drafts[kind] = null;
  }

  function currentForm() {
    return document.getElementById(
      state.tab === "articles" ? "article-form" : state.tab === "images" ? "image-form" : "folder-form",
    );
  }

  function captureListScroll(tab = state.tab) {
    const list = document.querySelector(`#admin-panel-${tab} .admin-list`);
    if (list) state.listScroll[tab] = list.scrollTop;
  }

  function restoreListScroll(tab = state.tab) {
    const list = document.querySelector(`#admin-panel-${tab} .admin-list`);
    if (list) list.scrollTop = state.listScroll[tab] || 0;
  }

  async function reconcileAfterMutation(kind, record, { deleted = false, message = "已保存。" } = {}) {
    captureListScroll();
    let refreshError = null;
    try {
      await loadAll();
    } catch (error) {
      refreshError = error;
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
    } else {
      state.editingFolder = deleted ? null : { ...record, kind: record.kind || state.editingFolder?.kind };
      state.drafts.folder = null;
    }
    state.mobileView[state.tab] = deleted ? "list" : "editor";
    setDirty(false);

    if (refreshError) {
      renderEditor(state.tab);
      setStatus(`${message} 但列表刷新失败：${refreshError.message || "请稍后刷新"}`, true, { focus: true, scope: kind });
      return false;
    }

    setStatus(message, false, { scope: kind });
    renderWorkspace({
      focusSelector: deleted
        ? "[data-list-items] .admin-list-item, [data-action^='new-']"
        : `[data-mutation="${kind === "article" ? "article-save" : kind === "photo" ? "image-save" : "folder-save"}"]`,
    });
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
        (item.folder === desired.folder && item.slug === desired.slug)
        || (item.folder === previous?.folder && item.slug === previous?.slug),
      );
      if (!record) return false;
      state.editingArticle = record;
      state.drafts.article = null;
    } else if (kind === "photo") {
      if (!previous) return false;
      const record = state.photos.find((item) => item.folder === previous.folder && item.id === previous.id);
      if (!record) return false;
      state.editingPhoto = record;
      state.drafts.photo = null;
    } else {
      return false;
    }
    state.mobileView[state.tab] = "editor";
    setDirty(false);
    setStatus("请求超时，但服务端已保存；界面已同步。", false, { scope: kind });
    renderWorkspace({ focusSelector: `[data-mutation="${kind === "article" ? "article-save" : "image-save"}"]` });
    return true;
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
    state.mobileView[state.tab] = "list";
    setDirty(false);
    setStatus("请求超时，但服务端已删除；界面已同步。", false, { scope: kind });
    renderWorkspace({ focusSelector: "[data-list-items] .admin-list-item, [data-action^='new-']" });
    return true;
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
      <form class="admin-login" id="login-form" data-scope="login">
        <label class="visually-hidden"><span>管理员用户名</span><input name="username" value="admin" autocomplete="username" tabindex="-1"></label>
        <label>
          <span>管理密码</span>
          <input name="token" type="password" autocomplete="current-password" placeholder="ADMIN_TOKEN_SECRET" required>
        </label>
        <button class="button primary" data-mutation="login" data-scope="login" data-pending-label="正在验证…" type="submit">进入后台</button>
        <p id="login-action-status" class="admin-message${state.error ? " error" : ""}" role="alert" tabindex="-1" ${state.error ? "" : "hidden"}>${escapeHtml(state.error)}</p>
      </form>
    `;
  }

  function appChrome() {
    return `
      <div class="section-heading">
        <div>
          <p class="eyebrow">Admin Console / R2 CMS</p>
          <h1>内容管理</h1>
        </div>
        <p>当前会话已登录；所有保存动作都会写入 R2，并刷新公开索引。</p>
      </div>
      <div class="admin-toolbar">
        <div class="admin-tabs" role="tablist" aria-label="后台内容类型" aria-orientation="horizontal">
          ${TAB_IDS.map((id) => `<button id="admin-tab-${id}" class="admin-tab" role="tab" aria-selected="false" aria-controls="admin-panel-${id}" data-tab="${id}" data-navigation-control type="button" tabindex="-1">${TAB_LABELS[id]}</button>`).join("")}
        </div>
        <span id="admin-unsaved-indicator" class="save-indicator" role="status" aria-live="polite">已同步</span>
        <button class="button secondary" data-action="logout" data-navigation-control type="button">退出</button>
      </div>
      <p id="admin-status-region" class="admin-message success" role="status" aria-live="polite" ${state.status ? "" : "hidden"}>${escapeHtml(state.status)}</p>
      <p id="admin-error-region" class="admin-message error" role="alert" tabindex="-1" ${state.error ? "" : "hidden"}>${escapeHtml(state.error)}</p>
      <p id="admin-pending-region" class="admin-message" role="status" aria-live="polite" hidden></p>
      <div id="admin-panels">
        ${TAB_IDS.map((id) => `<section id="admin-panel-${id}" role="tabpanel" aria-labelledby="admin-tab-${id}" tabindex="0" ${id === state.tab ? "" : "hidden"}><div data-panel-body="${id}"></div></section>`).join("")}
      </div>
      <dialog class="admin-dialog" id="admin-confirm-dialog" aria-labelledby="admin-confirm-title" aria-describedby="admin-confirm-message">
        <form method="dialog">
          <h2 id="admin-confirm-title">请确认</h2>
          <p id="admin-confirm-message"></p>
          <div class="dialog-actions">
            <button class="button secondary" value="cancel" type="submit">取消</button>
            <button class="button danger" id="admin-confirm-submit" value="confirm" type="submit">确认</button>
          </div>
        </form>
      </dialog>
    `;
  }

  function folderOptions(kind, selected) {
    const folders = [...(state.folders[kind] || [])];
    if (selected && !folders.some((folder) => folder.slug === selected)) folders.unshift({ slug: selected, label: selected });
    return folders
      .map((folder) => `<option value="${escapeAttr(folder.slug)}" ${folder.slug === selected ? "selected" : ""}>${escapeHtml(folder.label || folder.slug)} / ${escapeHtml(folder.slug)}</option>`)
      .join("");
  }

  function editorHeader(title) {
    return `
      <div class="admin-list-heading">
        <button class="admin-mini-action" data-action="back-to-list" type="button">返回列表</button>
        <strong>${escapeHtml(title)}</strong>
        <span class="save-indicator">${state.dirty ? "未保存" : "已同步"}</span>
      </div>
    `;
  }

  function articleForm() {
    const article = state.drafts.article || state.editingArticle || {
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
    return `${editorHeader(editing ? "编辑文章" : "新建文章")}
      <form class="admin-form" id="article-form" data-scope="article" ${state.dirty ? 'data-unsaved="true"' : ""}>
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
          <button class="button secondary" data-action="upload-article-asset" data-mutation="article-asset" data-scope="article" data-pending-label="正在上传…" type="button">上传插图并插入</button>
        </div>
        <div class="form-actions">
          <button class="button primary" data-mutation="article-save" data-scope="article" data-pending-label="正在保存…" type="submit">${editing ? "保存文章" : "创建文章"}</button>
          <button class="button secondary" data-action="new-article" data-navigation-control type="button">新建</button>
          ${editing ? '<button class="button danger" data-action="delete-article" data-mutation="article-delete" data-scope="article" data-pending-label="正在删除…" type="button">删除</button>' : ""}
        </div>
        <p id="article-action-status" class="admin-progress" role="status" aria-live="polite" hidden></p>
        <div class="admin-preview article-body" id="article-preview">${markdownToHtml(article.markdown)}</div>
      </form>`;
  }

  function imageForm() {
    const photo = state.drafts.photo || state.editingPhoto || {
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
    const previewUrl = safeLocalMediaUrl(photo.thumbUrl || photo.imageUrl);
    return `${editorHeader(editing ? "编辑图片" : "上传图片")}
      <form class="admin-form" id="image-form" data-scope="photo" ${state.dirty ? 'data-unsaved="true"' : ""}>
        <div class="form-grid two">
          <label><span>标题</span><input name="title" value="${escapeAttr(photo.title)}" required></label>
          <label><span>分组</span><select name="folder" ${editing ? "disabled" : ""} aria-describedby="image-folder-help">${folderOptions("images", photo.folder)}</select></label>
          <label><span>拍摄时间</span><input name="capturedAt" type="datetime-local" value="${escapeAttr(fromIso(photo.capturedAt))}"></label>
          <label><span>可见性</span><select name="visibility"><option value="public" ${photo.visibility !== "private" ? "selected" : ""}>public</option><option value="private" ${photo.visibility === "private" ? "selected" : ""}>private</option></select></label>
          <label><span>地点</span><input name="locationLabel" value="${escapeAttr(photo.location?.label)}"></label>
          <label><span>纬度</span><input name="latitude" type="number" inputmode="decimal" step="any" min="-90" max="90" value="${escapeAttr(photo.location?.latitude ?? "")}" placeholder="31.2304"></label>
          <label><span>经度</span><input name="longitude" type="number" inputmode="decimal" step="any" min="-180" max="180" value="${escapeAttr(photo.location?.longitude ?? "")}" placeholder="121.4737"></label>
          <label><span>位置精度</span><select name="locationPrecision"><option value="city" ${photo.location?.precision === "city" ? "selected" : ""}>city</option><option value="approximate" ${photo.location?.precision === "approximate" ? "selected" : ""}>approximate</option><option value="exact" ${photo.location?.precision === "exact" ? "selected" : ""}>exact</option></select></label>
          <label><span>相机</span><input name="cameraMake" value="${escapeAttr(photo.camera?.make)}" placeholder="Apple"></label>
          <label><span>型号</span><input name="cameraModel" value="${escapeAttr(photo.camera?.model)}" placeholder="iPhone"></label>
          <label><span>镜头</span><input name="cameraLens" value="${escapeAttr(photo.camera?.lens)}" placeholder="26mm"></label>
          <label><span>ISO</span><input name="cameraIso" type="number" min="0" value="${escapeAttr(photo.camera?.iso ?? "")}"></label>
          <label><span>光圈</span><input name="cameraAperture" value="${escapeAttr(photo.camera?.aperture)}" placeholder="f/1.8"></label>
          <label><span>快门</span><input name="cameraShutter" value="${escapeAttr(photo.camera?.shutter)}" placeholder="1/120"></label>
        </div>
        <label><span>Alt 文本</span><input name="alt" value="${escapeAttr(photo.alt)}"></label>
        <label><span>描述</span><textarea name="description" rows="4">${escapeHtml(photo.description)}</textarea></label>
        <div class="form-actions location-actions"><button class="button secondary" data-action="clear-location" type="button">清除位置</button><span class="system-text">精度决定公开地图显示范围；新读取的 GPS 默认 city。</span></div>
        ${editing ? '<p id="image-folder-help" class="system-text">图片移动暂未实现；保存时保留原分组。</p>' : ""}
        ${editing ? "" : `<label><span>原图</span><input name="file" type="file" accept="image/jpeg,image/png,image/webp" required><span id="image-exif-status" class="system-text" role="status" aria-live="polite" data-status="${escapeAttr(state.photoExifStatusKind)}">${escapeHtml(state.photoExifStatus)}</span></label>`}
        ${editing && previewUrl ? `<div class="admin-photo-preview"><img src="${escapeAttr(previewUrl)}" alt="${escapeAttr(photo.alt || photo.title)}"></div>` : ""}
        <div class="form-actions">
          <button class="button primary" data-mutation="image-save" data-scope="photo" data-pending-label="正在处理…" type="submit">${editing ? "保存图片元数据" : "上传图片"}</button>
          <button class="button secondary" data-action="new-photo" data-navigation-control type="button">新建</button>
          ${editing ? '<button class="button danger" data-action="delete-photo" data-mutation="image-delete" data-scope="photo" data-pending-label="正在删除…" type="button">删除</button>' : ""}
        </div>
        <div id="image-processing-region" class="admin-progress" role="status" aria-live="polite" hidden>
          <progress id="image-processing-progress" max="4" value="0"></progress>
          <span id="image-processing-label"></span>
        </div>
        <p id="photo-action-status" class="admin-progress" role="status" aria-live="polite" hidden></p>
      </form>`;
  }

  function folderForm() {
    const folder = state.drafts.folder || state.editingFolder || { kind: "articles", slug: "", label: "", description: "", order: 999 };
    const editing = Boolean(state.editingFolder);
    return `${editorHeader(editing ? "编辑分组" : "新建分组")}
      <form class="admin-form compact" id="folder-form" data-scope="folder" ${state.dirty ? 'data-unsaved="true"' : ""}>
        <div class="form-grid two">
          <label><span>类型</span><select name="kind" ${editing ? "disabled" : ""}><option value="articles" ${folder.kind === "articles" ? "selected" : ""}>文章分组</option><option value="images" ${folder.kind === "images" ? "selected" : ""}>图片分组</option></select></label>
          <label><span>Slug</span><input name="slug" value="${escapeAttr(folder.slug)}" pattern="[a-z0-9]+(-[a-z0-9]+)*" ${editing ? "readonly" : ""} required></label>
          <label><span>显示名</span><input name="label" value="${escapeAttr(folder.label)}" required></label>
          <label><span>排序</span><input name="order" type="number" value="${escapeAttr(folder.order)}"></label>
        </div>
        <label><span>描述</span><textarea name="description" rows="3">${escapeHtml(folder.description)}</textarea></label>
        <div class="form-actions">
          <button class="button primary" data-mutation="folder-save" data-scope="folder" data-pending-label="正在保存…" type="submit">保存分组</button>
          <button class="button secondary" data-action="new-folder" data-navigation-control type="button">新建</button>
          ${editing ? '<button class="button danger" data-action="delete-folder" data-mutation="folder-delete" data-scope="folder" data-pending-label="正在删除…" type="button">删除分组</button>' : ""}
        </div>
        <p id="folder-action-status" class="admin-progress" role="status" aria-live="polite" hidden></p>
      </form>`;
  }

  function articleIsSelected(article) {
    return state.editingArticle?.folder === article.folder && state.editingArticle?.slug === article.slug;
  }

  function photoIsSelected(photo) {
    return state.editingPhoto?.folder === photo.folder && state.editingPhoto?.id === photo.id;
  }

  function folderIsSelected(kind, folder) {
    return state.editingFolder?.kind === kind && state.editingFolder?.slug === folder.slug;
  }

  function articleListItems() {
    if (!state.articles.length) return '<p class="empty-state">还没有文章。</p>';
    return state.articles.map((article) => {
      const selected = articleIsSelected(article);
      return `<button class="admin-list-item${selected ? " active" : ""}" data-edit-article data-folder="${escapeAttr(article.folder)}" data-record-id="${escapeAttr(article.slug)}" data-navigation-control aria-pressed="${selected}" type="button"><strong>${escapeHtml(article.title || article.slug)}</strong><span>${escapeHtml(article.folder)} / ${escapeHtml(article.slug)} / ${escapeHtml(article.status)}</span></button>`;
    }).join("");
  }

  function photoListItems() {
    if (!state.photos.length) return '<p class="empty-state">还没有图片。</p>';
    return state.photos.map((photo) => {
      const selected = photoIsSelected(photo);
      return `<button class="admin-list-item${selected ? " active" : ""}" data-edit-photo data-folder="${escapeAttr(photo.folder)}" data-record-id="${escapeAttr(photo.id)}" data-navigation-control aria-pressed="${selected}" type="button"><strong>${escapeHtml(photo.title || photo.id)}</strong><span>${escapeHtml(photo.folder)} / ${escapeHtml(photo.id)} / ${escapeHtml(photo.visibility)}</span></button>`;
    }).join("");
  }

  function folderListItems() {
    const groups = [
      ["articles", "文章分组", state.folders.articles || []],
      ["images", "图片分组", state.folders.images || []],
    ];
    return groups.map(([kind, label, folders]) => `
      <div class="admin-list-heading"><strong>${label}</strong><span>${folders.length} groups</span></div>
      ${folders.length ? folders.map((folder) => {
        const selected = folderIsSelected(kind, folder);
        return `<button class="admin-list-item${selected ? " active" : ""}" data-edit-folder data-folder-kind="${kind}" data-record-id="${escapeAttr(folder.slug)}" data-navigation-control aria-pressed="${selected}" type="button"><strong>${escapeHtml(folder.label || folder.slug)}</strong><span>${escapeHtml(folder.slug)} / ${escapeHtml(folder.description || "")}</span></button>`;
      }).join("") : '<p class="empty-state">还没有分组。</p>'}
    `).join("");
  }

  function workbenchView(tab) {
    const count = tab === "articles"
      ? `${state.articles.length} records`
      : tab === "images"
        ? `${state.photos.length} records`
        : `${(state.folders.articles?.length || 0) + (state.folders.images?.length || 0)} groups`;
    const heading = tab === "articles" ? "文章记录" : tab === "images" ? "图片记录" : "分组记录";
    const newAction = tab === "articles" ? "new-article" : tab === "images" ? "new-photo" : "new-folder";
    const newLabel = tab === "articles" ? "新建文章" : tab === "images" ? "上传图片" : "新建分组";
    const listItems = tab === "articles" ? articleListItems() : tab === "images" ? photoListItems() : folderListItems();
    const form = tab === "articles" ? articleForm() : tab === "images" ? imageForm() : folderForm();
    return `
      <div class="admin-workbench${state.mobileView[tab] === "editor" ? " is-editing" : ""}" data-workbench="${tab}" data-view="${state.mobileView[tab]}">
        <aside class="admin-list" aria-label="${heading}">
          <div class="admin-list-heading"><strong>${heading}</strong><button class="admin-mini-action" data-action="${newAction}" data-navigation-control type="button">${newLabel}</button><span>${count}</span></div>
          <div data-list-items="${tab}">${listItems}</div>
        </aside>
        <section class="admin-editor" data-editor="${tab}" data-mobile-secondary="true" aria-label="${TAB_LABELS[tab]}编辑器">${form}</section>
      </div>
    `;
  }

  function updateTabUi() {
    for (const id of TAB_IDS) {
      const tab = document.getElementById(`admin-tab-${id}`);
      const panel = document.getElementById(`admin-panel-${id}`);
      const active = id === state.tab;
      if (tab) {
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", active ? "true" : "false");
        tab.tabIndex = active ? 0 : -1;
      }
      if (panel) panel.hidden = !active;
    }
  }

  function renderWorkspace({ focusSelector = "" } = {}) {
    clearTimeout(markdownPreviewTimer);
    captureListScroll();
    updateTabUi();
    const body = document.querySelector(`[data-panel-body="${state.tab}"]`);
    if (!body) return;
    body.innerHTML = workbenchView(state.tab);
    restoreListScroll();
    setStatus(state.status || state.error || "", Boolean(state.error));
    updateDirtyUi();
    updateBusyUi();
    if (focusSelector) requestAnimationFrame(() => body.querySelector(focusSelector)?.focus());
  }

  function renderEditor(tab = state.tab, { focus = false } = {}) {
    clearTimeout(markdownPreviewTimer);
    const editor = document.querySelector(`#admin-panel-${tab} [data-editor="${tab}"]`);
    if (!editor) return;
    editor.innerHTML = tab === "articles" ? articleForm() : tab === "images" ? imageForm() : folderForm();
    const workbench = editor.closest(".admin-workbench");
    if (workbench) {
      workbench.dataset.view = state.mobileView[tab];
      workbench.classList.toggle("is-editing", state.mobileView[tab] === "editor");
    }
    updateListSelection(tab);
    updateDirtyUi();
    updateBusyUi();
    if (focus) requestAnimationFrame(() => editor.querySelector("input:not([type='hidden']), select, textarea, button")?.focus());
  }

  function updateListSelection(tab = state.tab) {
    document.querySelectorAll(`#admin-panel-${tab} .admin-list-item`).forEach((button) => {
      let selected = false;
      if (tab === "articles") selected = state.editingArticle?.folder === button.dataset.folder && state.editingArticle?.slug === button.dataset.recordId;
      if (tab === "images") selected = state.editingPhoto?.folder === button.dataset.folder && state.editingPhoto?.id === button.dataset.recordId;
      if (tab === "folders") selected = state.editingFolder?.kind === button.dataset.folderKind && state.editingFolder?.slug === button.dataset.recordId;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }

  function mountLogin({ focus = false } = {}) {
    clearTimeout(markdownPreviewTimer);
    root.innerHTML = loginView();
    root.setAttribute("aria-busy", "false");
    updateBusyUi();
    if (focus) requestAnimationFrame(() => document.querySelector('#login-form [name="token"]')?.focus());
  }

  function mountApp() {
    root.innerHTML = appChrome();
    renderWorkspace();
  }

  function requestConfirmation({ title, message, confirmLabel = "确认" }) {
    const dialog = document.getElementById("admin-confirm-dialog");
    if (!globalThis.HTMLDialogElement || !(dialog instanceof globalThis.HTMLDialogElement) || typeof dialog.showModal !== "function") {
      return Promise.resolve(window.confirm(message));
    }
    const titleElement = document.getElementById("admin-confirm-title");
    const messageElement = document.getElementById("admin-confirm-message");
    const confirmButton = document.getElementById("admin-confirm-submit");
    if (titleElement) titleElement.textContent = title;
    if (messageElement) messageElement.textContent = message;
    if (confirmButton) confirmButton.textContent = confirmLabel;
    dialog.returnValue = "";
    return new Promise((resolve) => {
      const form = dialog.querySelector("form");
      const handleSubmit = (event) => {
        event.preventDefault();
        dialog.close(event.submitter?.value || "cancel");
      };
      form?.addEventListener("submit", handleSubmit);
      dialog.addEventListener("close", () => {
        form?.removeEventListener("submit", handleSubmit);
        resolve(dialog.returnValue === "confirm");
      }, { once: true });
      try {
        dialog.showModal();
        requestAnimationFrame(() => dialog.querySelector('[value="cancel"]')?.focus());
      } catch {
        resolve(window.confirm(message));
      }
    });
  }

  async function confirmDiscard(message = "当前草稿尚未保存，确定放弃修改吗？") {
    if (!state.dirty) return true;
    return requestConfirmation({ title: "放弃未保存的修改？", message, confirmLabel: "放弃修改" });
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

  function photoPayload(form) {
    const data = new FormData(form);
    const latitudeText = formString(data, "latitude");
    const longitudeText = formString(data, "longitude");
    const latitude = latitudeText === "" ? (state.editingPhoto ? null : undefined) : Number(latitudeText);
    const longitude = longitudeText === "" ? (state.editingPhoto ? null : undefined) : Number(longitudeText);
    const isoText = formString(data, "cameraIso");
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
        ...(latitude !== undefined && Number.isFinite(latitude) ? { latitude } : {}),
        ...(longitude !== undefined && Number.isFinite(longitude) ? { longitude } : {}),
      },
      camera: {
        make: formString(data, "cameraMake"),
        model: formString(data, "cameraModel"),
        lens: formString(data, "cameraLens"),
        iso: isoText === "" ? undefined : Number(isoText),
        aperture: formString(data, "cameraAperture"),
        shutter: formString(data, "cameraShutter"),
      },
      ...(state.editingPhoto?.updatedAt ? { expectedUpdatedAt: state.editingPhoto.updatedAt } : {}),
    };
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

  function fieldNameForError(error) {
    const field = String(error?.details?.field || "");
    return {
      "location.label": "locationLabel",
      "location.latitude": "latitude",
      "location.longitude": "longitude",
      "camera.make": "cameraMake",
      "camera.model": "cameraModel",
      "camera.lens": "cameraLens",
      "camera.iso": "cameraIso",
      "camera.aperture": "cameraAperture",
      "camera.shutter": "cameraShutter",
      metadata: "file",
      display: "file",
      thumb: "file",
    }[field] || field;
  }

  function reportFormError(error, scope, form) {
    const message = formatApiError(error);
    setStatus(message, true, { scope });
    const fieldName = fieldNameForError(error);
    const field = fieldName ? form?.elements.namedItem(fieldName) : null;
    if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
      field.setCustomValidity(message);
      field.setAttribute("aria-invalid", "true");
      field.focus();
      return;
    }
    requestAnimationFrame(() => document.getElementById("admin-error-region")?.focus());
  }

  function scheduleMarkdownPreview(markdown) {
    clearTimeout(markdownPreviewTimer);
    markdownPreviewTimer = window.setTimeout(() => {
      const preview = document.getElementById("article-preview");
      if (preview) preview.innerHTML = markdownToHtml(markdown);
    }, MARKDOWN_PREVIEW_DELAY_MS);
  }

  function resetPhotoAutomation() {
    state.photoSelectionToken += 1;
    state.photoExifPending = false;
    state.photoExifStatus = "";
    state.photoExifStatusKind = "";
    state.photoTouched = new Set();
    state.photoAutoFields = new Set();
    state.photoExifFields = {};
  }

  function setPhotoExifStatus(message, kind = "") {
    state.photoExifStatus = message;
    state.photoExifStatusKind = kind;
    const status = document.getElementById("image-exif-status");
    if (status) {
      status.textContent = message;
      status.dataset.status = kind;
    }
  }

  function markPhotoTouched(name) {
    if (!name || name === "file") return;
    state.photoTouched.add(name);
    state.photoAutoFields.delete(name);
  }

  function canAutofillPhotoField(input, name) {
    if (!input || state.photoTouched.has(name)) return false;
    const current = String(input.value || "").trim();
    if (state.editingPhoto && current) return false;
    return !current || state.photoAutoFields.has(name) || (!state.editingPhoto && name === "capturedAt");
  }

  function assignExifField(form, name, value) {
    if (value === undefined || value === null || value === "") return false;
    const input = form.elements.namedItem(name);
    if (!(input instanceof HTMLInputElement) || !canAutofillPhotoField(input, name)) return false;
    input.value = String(value);
    state.photoAutoFields.add(name);
    return true;
  }

  function applyExifFields(form, fields) {
    let applied = 0;
    applied += assignExifField(form, "capturedAt", fields.capturedAt ? fromIso(fields.capturedAt) : undefined) ? 1 : 0;
    applied += assignExifField(form, "cameraMake", fields.cameraMake) ? 1 : 0;
    applied += assignExifField(form, "cameraModel", fields.cameraModel) ? 1 : 0;
    if (fields.lensModel) applied += assignExifField(form, "cameraLens", fields.lensModel) ? 1 : 0;
    else if (fields.focalLength) applied += assignExifField(form, "cameraLens", fields.focalLength) ? 1 : 0;
    applied += assignExifField(form, "cameraIso", fields.cameraIso) ? 1 : 0;
    applied += assignExifField(form, "cameraAperture", fields.cameraAperture) ? 1 : 0;
    applied += assignExifField(form, "cameraShutter", fields.cameraShutter) ? 1 : 0;
    if (fields.latitude !== undefined && fields.longitude !== undefined) {
      applied += assignExifField(form, "latitude", fields.latitude) ? 1 : 0;
      applied += assignExifField(form, "longitude", fields.longitude) ? 1 : 0;
    }
    state.drafts.photo = photoPayload(form);
    setDirty();
    return applied;
  }

  function photoSelectionMatches(token) {
    if (token !== state.photoSelectionToken) throw new Error("文件选择已变化，请重新选择后提交。");
  }

  async function readSelectedPhoto(form, file) {
    const token = ++state.photoSelectionToken;
    state.photoExifPending = true;
    state.photoExifFields = {};
    setPhotoExifStatus("正在读取 EXIF……", "reading");
    updateBusyUi();
    try {
      const result = await globalThis.WTAExif?.read(file);
      photoSelectionMatches(token);
      const fields = result?.fields || {};
      state.photoExifFields = fields;
      if (result?.status === "recognized") {
        const applied = applyExifFields(form, fields);
        setPhotoExifStatus(`已识别 EXIF${applied ? `，自动填入 ${applied} 项` : "；已有或手填内容已保留"}。`, "recognized");
      } else if (result?.status === "missing") {
        setPhotoExifStatus("未找到可用 EXIF；仍可手动填写并上传。", "missing");
      } else {
        setPhotoExifStatus("EXIF 读取失败；仍可手动填写并上传。", "failed");
      }
    } catch (error) {
      if (token === state.photoSelectionToken) {
        state.photoExifFields = {};
        setPhotoExifStatus(error?.message || "EXIF 读取失败；仍可手动填写并上传。", "failed");
      }
    } finally {
      if (token === state.photoSelectionToken) {
        state.photoExifPending = false;
        updateBusyUi();
      }
    }
  }

  function orientedDimensions(width, height, orientation) {
    return orientation >= 5 && orientation <= 8 ? { width: height, height: width } : { width, height };
  }

  function drawWithOrientation(context, source, width, height, orientation) {
    switch (orientation) {
      case 2:
        context.translate(width, 0);
        context.scale(-1, 1);
        break;
      case 3:
        context.translate(width, height);
        context.rotate(Math.PI);
        break;
      case 4:
        context.translate(0, height);
        context.scale(1, -1);
        break;
      case 5:
        context.translate(height, 0);
        context.rotate(Math.PI / 2);
        context.scale(1, -1);
        break;
      case 6:
        context.translate(height, 0);
        context.rotate(Math.PI / 2);
        break;
      case 7:
        context.translate(height, 0);
        context.rotate(Math.PI / 2);
        context.scale(-1, 1);
        break;
      case 8:
        context.translate(0, width);
        context.rotate(-Math.PI / 2);
        break;
      default:
        break;
    }
    context.drawImage(source, 0, 0, width, height);
  }

  async function loadImageSource(file, orientation) {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, orientation: 1, cleanup: () => bitmap.close?.() };
    } catch {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.decoding = "async";
      image.src = url;
      try {
        if (image.decode) await image.decode();
        else await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
        });
      } catch (error) {
        URL.revokeObjectURL(url);
        throw error;
      }
      const dimensions = orientedDimensions(image.naturalWidth, image.naturalHeight, orientation || 1);
      return {
        source: image,
        width: dimensions.width,
        height: dimensions.height,
        rawWidth: image.naturalWidth,
        rawHeight: image.naturalHeight,
        orientation: orientation || 1,
        cleanup: () => URL.revokeObjectURL(url),
      };
    }
  }

  async function createImageAsset(image, max, quality, name) {
    const ratio = Math.min(1, max / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("无法创建图片画布。");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    if (image.orientation === 1) {
      context.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    } else {
      context.save();
      const ratioX = canvas.width / image.width;
      const ratioY = canvas.height / image.height;
      context.scale(ratioX, ratioY);
      drawWithOrientation(context, image.source, image.rawWidth, image.rawHeight, image.orientation);
      context.restore();
    }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    canvas.width = 1;
    canvas.height = 1;
    if (!blob) throw new Error("无法生成 WebP 图片。");
    return new File([blob], name, { type: "image/webp" });
  }

  function setImageProgress(value, label) {
    const region = document.getElementById("image-processing-region");
    const progress = document.getElementById("image-processing-progress");
    const text = document.getElementById("image-processing-label");
    if (region) region.hidden = false;
    if (progress) progress.value = value;
    if (text) text.textContent = label;
  }

  function hideImageProgress() {
    const region = document.getElementById("image-processing-region");
    if (region) region.hidden = true;
  }

  async function activateTab(nextTab, { focusTab = false } = {}) {
    if (!TAB_IDS.includes(nextTab) || isBusy()) return;
    if (nextTab === state.tab) {
      if (focusTab) document.getElementById(`admin-tab-${nextTab}`)?.focus();
      return;
    }
    if (!await confirmDiscard()) return;
    clearDraftForTab();
    setDirty(false);
    state.tab = nextTab;
    state.error = "";
    state.status = "";
    renderWorkspace();
    if (focusTab) document.getElementById(`admin-tab-${nextTab}`)?.focus();
  }

  async function selectRecord(button) {
    if (isBusy()) return;
    const tab = state.tab;
    const same = tab === "articles"
      ? state.editingArticle?.folder === button.dataset.folder && state.editingArticle?.slug === button.dataset.recordId
      : tab === "images"
        ? state.editingPhoto?.folder === button.dataset.folder && state.editingPhoto?.id === button.dataset.recordId
        : state.editingFolder?.kind === button.dataset.folderKind && state.editingFolder?.slug === button.dataset.recordId;
    if (!same && !await confirmDiscard()) return;
    if (!same) {
      clearDraftForTab(tab);
      setDirty(false);
      if (tab === "articles") state.editingArticle = state.articles.find((article) => article.folder === button.dataset.folder && article.slug === button.dataset.recordId) || null;
      if (tab === "images") {
        state.editingPhoto = state.photos.find((photo) => photo.folder === button.dataset.folder && photo.id === button.dataset.recordId) || null;
        resetPhotoAutomation();
      }
      if (tab === "folders") {
        const folder = state.folders[button.dataset.folderKind]?.find((item) => item.slug === button.dataset.recordId);
        state.editingFolder = folder ? { ...folder, kind: button.dataset.folderKind } : null;
      }
    }
    state.mobileView[tab] = "editor";
    renderEditor(tab, { focus: window.matchMedia("(max-width: 760px)").matches });
  }

  async function startNew(tab) {
    if (isBusy()) return;
    const alreadyNew = !editingForKind(kindForTab(tab));
    if (!alreadyNew && !await confirmDiscard()) return;
    if (!alreadyNew) clearDraftForTab(tab);
    if (!alreadyNew) setDirty(false);
    if (tab === "articles") state.editingArticle = null;
    if (tab === "images") {
      state.editingPhoto = null;
      resetPhotoAutomation();
    }
    if (tab === "folders") state.editingFolder = null;
    state.mobileView[tab] = "editor";
    renderEditor(tab, { focus: true });
  }

  async function saveArticle(form) {
    const previous = state.editingArticle;
    const payload = articlePayload(form);
    await runMutation("article-save", { scope: "article", message: previous ? "正在保存文章…" : "正在创建文章…" }, async () => {
      try {
        const path = previous ? `/api/admin/articles/${previous.folder}/${previous.slug}` : "/api/admin/articles";
        const article = await api(path, { method: previous ? "PATCH" : "POST", body: JSON.stringify(payload) });
        state.editingArticle = article;
        await reconcileAfterMutation("article", article, { message: "文章已保存。" });
      } catch (error) {
        if (error.code === "timeout" && await reconcileAfterTimeout("article", previous, payload)) return;
        reportFormError(error, "article", form);
      }
    });
  }

  async function uploadArticleAsset() {
    const form = document.getElementById("article-form");
    if (!form) return;
    const payload = articlePayload(form);
    const input = document.getElementById("article-asset-file");
    const file = input?.files?.[0];
    if (!file) {
      setStatus("请选择要上传的插图。", true, { scope: "article" });
      input?.focus();
      return;
    }
    if (!payload.folder || !payload.slug) {
      setStatus("请先填写文章分组和 slug。", true, { scope: "article" });
      form.elements.namedItem("slug")?.focus();
      return;
    }
    const textarea = form.elements.namedItem("markdown");
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    const start = Number.isInteger(textarea.selectionStart) ? textarea.selectionStart : textarea.value.length;
    const end = Number.isInteger(textarea.selectionEnd) ? textarea.selectionEnd : start;
    const selectedLabel = textarea.value.slice(start, end).trim();
    const body = new FormData();
    body.set("file", file);
    await runMutation("article-asset", { scope: "article", message: "正在上传插图…" }, async () => {
      try {
        const result = await api(`/api/admin/articles/${payload.folder}/${payload.slug}/assets`, { method: "POST", body });
        const source = safeLocalMediaUrl(result.url);
        if (!source) throw new Error("服务端返回了不可用的插图地址。");
        const label = escapeMarkdownLabel(selectedLabel || file.name);
        const title = escapeMarkdownLabel(file.name);
        const token = `![${label}](${source} "${title}")`;
        const before = textarea.value.slice(0, start);
        const after = textarea.value.slice(end);
        const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
        const suffix = after && !after.startsWith("\n") ? "\n\n" : "";
        textarea.setRangeText(`${prefix}${token}${suffix}`, start, end, "end");
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        input.value = "";
        textarea.focus();
        setStatus("插图已上传并插入正文。", false, { scope: "article" });
      } catch (error) {
        reportFormError(error, "article", form);
      }
    });
  }

  async function deleteArticle() {
    if (!state.editingArticle || isBusy()) return;
    const confirmed = await requestConfirmation({ title: "删除文章？", message: "删除后无法从后台恢复这篇文章。", confirmLabel: "删除文章" });
    if (!confirmed) return;
    const target = state.editingArticle;
    await runMutation("article-delete", { scope: "article", message: "正在删除文章…" }, async () => {
      try {
        await api(`/api/admin/articles/${target.folder}/${target.slug}`, { method: "DELETE" });
        await reconcileAfterMutation("article", target, { deleted: true, message: "文章已删除。" });
      } catch (error) {
        if (error.code === "timeout" && await reconcileDeleteAfterTimeout("article", target)) return;
        reportFormError(error, "article", document.getElementById("article-form"));
      }
    });
  }

  async function savePhoto(form) {
    if (state.photoExifPending) {
      setStatus("EXIF 仍在读取，请稍候。", true, { scope: "photo" });
      document.getElementById("image-exif-status")?.focus();
      return;
    }
    const previous = state.editingPhoto;
    const metadata = photoPayload(form);
    const file = form.elements.namedItem("file")?.files?.[0];
    if (!previous && !file) {
      setStatus("请选择图片文件。", true, { scope: "photo" });
      form.elements.namedItem("file")?.focus();
      return;
    }
    if (file && file.size > MAX_ORIGINAL_IMAGE_BYTES) {
      const error = new ApiError("Image file must be 15 MB or smaller.", 413, "payload_too_large", { field: "file" });
      reportFormError(error, "photo", form);
      return;
    }
    await runMutation("image-save", { scope: "photo", message: previous ? "正在保存图片元数据…" : "正在处理图片…" }, async () => {
      let decoded;
      try {
        if (previous) {
          const photo = await api(`/api/admin/images/${previous.folder}/${previous.id}`, { method: "PATCH", body: JSON.stringify(metadata) });
          state.editingPhoto = photo;
          await reconcileAfterMutation("photo", photo, { message: "图片元数据已保存。" });
          return;
        }

        const token = state.photoSelectionToken;
        const orientation = Number(state.photoExifFields.orientation || 1);
        setImageProgress(1, "1 / 4 · 正在解码原图");
        decoded = await loadImageSource(file, orientation);
        photoSelectionMatches(token);
        setImageProgress(2, "2 / 4 · 正在生成展示图");
        const display = await createImageAsset(decoded, 2560, 0.88, "display.webp");
        photoSelectionMatches(token);
        setImageProgress(3, "3 / 4 · 正在生成缩略图");
        const thumb = await createImageAsset(decoded, 900, 0.82, "thumb.webp");
        photoSelectionMatches(token);
        const body = new FormData();
        body.set("folder", metadata.folder);
        body.set("metadata", JSON.stringify(metadata));
        body.set("file", file);
        body.set("display", display);
        body.set("thumb", thumb);
        setImageProgress(4, "4 / 4 · 正在上传文件");
        const photo = await api("/api/admin/images", { method: "POST", body });
        state.editingPhoto = photo;
        await reconcileAfterMutation("photo", photo, { message: "图片已上传。" });
      } catch (error) {
        hideImageProgress();
        if (error.code === "timeout" && await reconcileAfterTimeout("photo", previous, metadata)) return;
        reportFormError(error, "photo", form);
      } finally {
        decoded?.cleanup();
      }
    });
  }

  async function deletePhoto() {
    if (!state.editingPhoto || isBusy()) return;
    const confirmed = await requestConfirmation({ title: "删除图片？", message: "删除后无法从后台恢复这张图片。", confirmLabel: "删除图片" });
    if (!confirmed) return;
    const target = state.editingPhoto;
    await runMutation("image-delete", { scope: "photo", message: "正在删除图片…" }, async () => {
      try {
        await api(`/api/admin/images/${target.folder}/${target.id}`, { method: "DELETE" });
        await reconcileAfterMutation("photo", target, { deleted: true, message: "图片已删除。" });
      } catch (error) {
        if (error.code === "timeout" && await reconcileDeleteAfterTimeout("photo", target)) return;
        reportFormError(error, "photo", document.getElementById("image-form"));
      }
    });
  }

  async function saveFolder(form) {
    const payload = folderPayload(form);
    await runMutation("folder-save", { scope: "folder", message: state.editingFolder ? "正在保存分组…" : "正在创建分组…" }, async () => {
      try {
        const folder = await api("/api/admin/folders", { method: state.editingFolder ? "PATCH" : "POST", body: JSON.stringify(payload) });
        await reconcileAfterMutation("folder", { ...folder, kind: payload.kind }, { message: "分组已保存。" });
      } catch (error) {
        reportFormError(error, "folder", form);
      }
    });
  }

  async function deleteFolder() {
    if (!state.editingFolder || isBusy()) return;
    const confirmed = await requestConfirmation({
      title: "删除分组？",
      message: "仅空分组可以删除；非空分组会被服务端拒绝。",
      confirmLabel: "删除分组",
    });
    if (!confirmed) return;
    const target = state.editingFolder;
    await runMutation("folder-delete", { scope: "folder", message: "正在删除分组…" }, async () => {
      try {
        await api("/api/admin/folders", { method: "DELETE", body: JSON.stringify(target) });
        await reconcileAfterMutation("folder", target, { deleted: true, message: "分组已删除。" });
      } catch (error) {
        reportFormError(error, "folder", document.getElementById("folder-form"));
      }
    });
  }

  async function submitLogin(form) {
    state.token = formString(new FormData(form), "token");
    await runMutation("login", { scope: "login", message: "正在验证管理密码…" }, async () => {
      try {
        await loadAll();
        sessionStorage.setItem("adminToken", state.token);
        state.authed = true;
        state.dirty = false;
        state.drafts = { article: null, photo: null, folder: null };
        state.error = "";
        state.status = "登录成功。";
        mountApp();
      } catch (error) {
        state.authed = false;
        if (error.status === 401) {
          sessionStorage.removeItem("adminToken");
          state.token = "";
          state.error = "管理密码不正确。";
        } else {
          state.error = error.message || "暂时无法连接后台，请稍后重试。";
        }
        setActionStatus("login", state.error, "error");
        const region = document.getElementById("login-action-status");
        region?.classList.add("error");
        region?.focus();
      }
    });
  }

  async function handleSubmit(event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (form.id === "login-form") await submitLogin(form);
    if (form.id === "article-form") await saveArticle(form);
    if (form.id === "image-form") await savePhoto(form);
    if (form.id === "folder-form") await saveFolder(form);
  }

  async function handleClick(event) {
    const button = event.target.closest("button");
    if (!button || !root.contains(button) || button.disabled) return;
    if (button.dataset.tab) {
      await activateTab(button.dataset.tab);
      return;
    }
    if (button.matches("[data-edit-article], [data-edit-photo], [data-edit-folder]")) {
      await selectRecord(button);
      return;
    }
    const action = button.dataset.action;
    if (!action) return;
    if (action === "logout") {
      if (isBusy() || !await confirmDiscard("当前草稿尚未保存，确定退出吗？")) return;
      sessionStorage.removeItem("adminToken");
      state.token = "";
      state.authed = false;
      state.status = "";
      state.error = "";
      clearDraftForTab();
      setDirty(false);
      mountLogin({ focus: true });
      return;
    }
    if (action === "back-to-list") {
      state.mobileView[state.tab] = "list";
      const workbench = button.closest(".admin-workbench");
      if (workbench) {
        workbench.dataset.view = "list";
        workbench.classList.remove("is-editing");
        requestAnimationFrame(() => workbench.querySelector(".admin-list-item[aria-pressed='true'], [data-action^='new-']")?.focus());
      }
      return;
    }
    if (action === "new-article") return startNew("articles");
    if (action === "new-photo") return startNew("images");
    if (action === "new-folder") return startNew("folders");
    if (action === "upload-article-asset") return uploadArticleAsset();
    if (action === "delete-article") return deleteArticle();
    if (action === "delete-photo") return deletePhoto();
    if (action === "delete-folder") return deleteFolder();
    if (action === "clear-location") {
      const form = document.getElementById("image-form");
      if (!form) return;
      ["locationLabel", "latitude", "longitude"].forEach((name) => {
        const input = form.elements.namedItem(name);
        if (input instanceof HTMLInputElement) input.value = "";
        markPhotoTouched(name);
      });
      const precision = form.elements.namedItem("locationPrecision");
      if (precision instanceof HTMLSelectElement) precision.value = "city";
      markPhotoTouched("locationPrecision");
      state.drafts.photo = photoPayload(form);
      setDirty();
    }
  }

  function handleInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    target.setCustomValidity("");
    target.removeAttribute("aria-invalid");
    const form = target.form;
    if (!form) return;
    if (form.id === "article-form") {
      state.drafts.article = articlePayload(form);
      setDirty();
      if (target.name === "markdown") scheduleMarkdownPreview(target.value);
    }
    if (form.id === "image-form" && target.name !== "file") {
      markPhotoTouched(target.name);
      state.drafts.photo = photoPayload(form);
      setDirty();
    }
    if (form.id === "folder-form") {
      state.drafts.folder = folderPayload(form);
      setDirty();
    }
  }

  function handleChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    const form = target.form;
    if (form?.id !== "image-form") return;
    if (target.name === "file") {
      const file = target.files?.[0];
      if (file) readSelectedPhoto(form, file);
      else {
        state.photoSelectionToken += 1;
        state.photoExifPending = false;
        state.photoExifFields = {};
        setPhotoExifStatus("", "");
        updateBusyUi();
      }
      return;
    }
    markPhotoTouched(target.name);
    state.drafts.photo = photoPayload(form);
    setDirty();
  }

  async function handleKeydown(event) {
    const tab = event.target.closest('[role="tab"][data-tab]');
    if (!tab || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = TAB_IDS.indexOf(tab.dataset.tab);
    let nextIndex = currentIndex;
    if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = TAB_IDS.length - 1;
    else if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % TAB_IDS.length;
    else nextIndex = (currentIndex - 1 + TAB_IDS.length) % TAB_IDS.length;
    await activateTab(TAB_IDS[nextIndex], { focusTab: true });
  }

  root.addEventListener("submit", handleSubmit);
  root.addEventListener("click", handleClick);
  root.addEventListener("input", handleInput);
  root.addEventListener("change", handleChange);
  root.addEventListener("keydown", handleKeydown);

  window.addEventListener("beforeunload", (event) => {
    if (!state.dirty) return;
    event.preventDefault();
  });

  if (state.token) {
    loadAll()
      .then(() => {
        state.authed = true;
        mountApp();
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
        mountLogin({ focus: true });
      });
  } else {
    mountLogin();
  }
})();
