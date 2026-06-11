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
  };

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
    const response = await fetch(path, { ...options, headers });
    const payload = await response.json().catch(() => undefined);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error?.message || `Request failed: ${response.status}`);
    }
    return payload.data;
  }

  function setStatus(message, isError) {
    state.status = isError ? "" : message;
    state.error = isError ? message : "";
    render();
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

  function folderOptions(kind, selected) {
    return (state.folders[kind] || [])
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
        <div class="admin-tabs">
          ${tabs
            .map(([id, label]) => `<button class="admin-tab ${state.tab === id ? "active" : ""}" data-tab="${id}" type="button">${label}</button>`)
            .join("")}
        </div>
        <button class="button secondary" data-action="logout" type="button">退出</button>
      </div>
      ${state.status ? `<p class="admin-message success">${escapeHtml(state.status)}</p>` : ""}
      ${state.error ? `<p class="admin-message error">${escapeHtml(state.error)}</p>` : ""}
      ${content}
    `;
  }

  function articleForm() {
    const article =
      state.editingArticle || {
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
          <label><span>分组</span><select name="folder" ${editing ? "readonly" : ""}>${folderOptions("articles", article.folder)}</select></label>
          <label><span>Slug</span><input name="slug" value="${escapeAttr(article.slug)}" pattern="[a-z0-9]+(-[a-z0-9]+)*" ${editing ? "readonly" : ""} required></label>
          <label><span>发布时间</span><input name="publishedAt" type="datetime-local" value="${escapeAttr(fromIso(article.publishedAt))}"></label>
          <label><span>状态</span><select name="status"><option value="published" ${article.status !== "draft" ? "selected" : ""}>published</option><option value="draft" ${article.status === "draft" ? "selected" : ""}>draft</option></select></label>
        </div>
        <label><span>摘要</span><textarea name="summary" rows="2">${escapeHtml(article.summary)}</textarea></label>
        <label><span>封面图 URL</span><input name="coverImage" value="${escapeAttr(article.coverImage)}" placeholder="/media/articles/.../assets/cover.webp"></label>
        <label><span>标签（逗号分隔）</span><input name="tags" value="${escapeAttr(Array.isArray(article.tags) ? article.tags.join(", ") : article.tags || "")}"></label>
        <label><span>Markdown 正文</span><textarea class="code-editor" name="markdown" rows="16">${escapeHtml(article.markdown)}</textarea></label>
        <div class="asset-uploader">
          <input id="article-asset-file" type="file" accept="image/jpeg,image/png,image/webp">
          <button class="button secondary" data-action="upload-article-asset" type="button">上传插图并插入</button>
        </div>
        <div class="form-actions">
          <button class="button primary" type="submit">${editing ? "保存文章" : "创建文章"}</button>
          <button class="button secondary" data-action="new-article" type="button">新建</button>
          ${editing ? `<button class="button danger" data-action="delete-article" type="button">删除</button>` : ""}
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
            <span>${state.articles.length} records</span>
          </div>
          ${state.articles.length ? state.articles.map((article) => `
            <button class="admin-list-item" data-edit-article="${escapeAttr(article.folder)}/${escapeAttr(article.slug)}" type="button">
              <strong>${escapeHtml(article.title || article.slug)}</strong>
              <span>${escapeHtml(article.folder)} / ${escapeHtml(article.slug)} / ${escapeHtml(article.status)}</span>
            </button>
          `).join("") : `<p class="empty-state">还没有文章。</p>`}
        </aside>
        <section class="admin-editor">${articleForm()}</section>
      </div>
    `);
  }

  function imageForm() {
    const photo =
      state.editingPhoto || {
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
          <label><span>分组</span><select name="folder" ${editing ? "readonly" : ""}>${folderOptions("images", photo.folder)}</select></label>
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
        ${editing ? "" : `<label><span>原图</span><input name="file" type="file" accept="image/jpeg,image/png,image/webp" required></label>`}
        ${editing && photo.imageUrl ? `<div class="admin-photo-preview"><img src="${escapeAttr(photo.thumbUrl || photo.imageUrl)}" alt="${escapeAttr(photo.alt || photo.title)}"></div>` : ""}
        <div class="form-actions">
          <button class="button primary" type="submit">${editing ? "保存图片元数据" : "上传图片"}</button>
          <button class="button secondary" data-action="new-photo" type="button">新建</button>
          ${editing ? `<button class="button danger" data-action="delete-photo" type="button">删除</button>` : ""}
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
        <section class="admin-editor">${imageForm()}</section>
      </div>
    `);
  }

  function folderForm() {
    const folder = state.editingFolder || { kind: "articles", slug: "", label: "", description: "", order: 999 };
    return `
      <form class="admin-form compact" id="folder-form">
        <div class="form-grid two">
          <label><span>类型</span><select name="kind"><option value="articles" ${folder.kind === "articles" ? "selected" : ""}>文章分组</option><option value="images" ${folder.kind === "images" ? "selected" : ""}>图片分组</option></select></label>
          <label><span>Slug</span><input name="slug" value="${escapeAttr(folder.slug)}" pattern="[a-z0-9]+(-[a-z0-9]+)*" required></label>
          <label><span>显示名</span><input name="label" value="${escapeAttr(folder.label)}" required></label>
          <label><span>排序</span><input name="order" type="number" value="${escapeAttr(folder.order)}"></label>
        </div>
        <label><span>描述</span><textarea name="description" rows="3">${escapeHtml(folder.description)}</textarea></label>
        <div class="form-actions">
          <button class="button primary" type="submit">保存分组</button>
          <button class="button secondary" data-action="new-folder" type="button">新建</button>
          ${state.editingFolder ? `<button class="button danger" data-action="delete-folder" type="button">删除空分组</button>` : ""}
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
        <section class="admin-editor">${folderForm()}</section>
      </div>
    `);
  }

  function render() {
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
  }

  function bind() {
    document.getElementById("login-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      state.token = new FormData(event.currentTarget).get("token").toString();
      sessionStorage.setItem("adminToken", state.token);
      try {
        await loadAll();
        state.authed = true;
        state.error = "";
        state.status = "登录成功。";
        render();
      } catch (error) {
        state.authed = false;
        sessionStorage.removeItem("adminToken");
        state.error = error.message;
        render();
      }
    });

    root.querySelectorAll("[data-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        state.tab = button.getAttribute("data-tab");
        state.error = "";
        state.status = "";
        render();
      });
    });

    root.querySelector('[data-action="logout"]')?.addEventListener("click", () => {
      sessionStorage.removeItem("adminToken");
      state.token = "";
      state.authed = false;
      state.status = "";
      state.error = "";
      render();
    });

    bindArticles();
    bindImages();
    bindFolders();
  }

  function articlePayload(form) {
    const data = new FormData(form);
    return {
      title: data.get("title").toString(),
      subtitle: data.get("subtitle").toString(),
      summary: data.get("summary").toString(),
      folder: data.get("folder").toString(),
      slug: data.get("slug").toString(),
      coverImage: data.get("coverImage").toString(),
      publishedAt: toIsoLocal(data.get("publishedAt").toString()),
      tags: data.get("tags").toString().split(",").map((item) => item.trim()).filter(Boolean),
      status: data.get("status").toString(),
      markdown: data.get("markdown").toString(),
    };
  }

  function bindArticles() {
    root.querySelectorAll("[data-edit-article]").forEach((button) => {
      button.addEventListener("click", () => {
        const [folder, slug] = button.getAttribute("data-edit-article").split("/");
        state.editingArticle = state.articles.find((article) => article.folder === folder && article.slug === slug);
        render();
      });
    });

    root.querySelector('[data-action="new-article"]')?.addEventListener("click", () => {
      state.editingArticle = null;
      render();
    });

    const form = document.getElementById("article-form");
    form?.addEventListener("input", () => {
      const markdown = new FormData(form).get("markdown")?.toString() || "";
      const preview = document.getElementById("article-preview");
      if (preview) preview.innerHTML = markdownToHtml(markdown);
    });

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const payload = articlePayload(form);
        const path = state.editingArticle
          ? `/api/admin/articles/${state.editingArticle.folder}/${state.editingArticle.slug}`
          : "/api/admin/articles";
        const method = state.editingArticle ? "PATCH" : "POST";
        const article = await api(path, { method, body: JSON.stringify(payload) });
        await loadAll();
        state.editingArticle = article;
        setStatus("文章已保存。");
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    root.querySelector('[data-action="delete-article"]')?.addEventListener("click", async () => {
      if (!state.editingArticle || !confirm("确认删除这篇文章？")) return;
      try {
        await api(`/api/admin/articles/${state.editingArticle.folder}/${state.editingArticle.slug}`, { method: "DELETE" });
        await loadAll();
        state.editingArticle = null;
        setStatus("文章已删除。");
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    root.querySelector('[data-action="upload-article-asset"]')?.addEventListener("click", async () => {
      const payload = articlePayload(form);
      const input = document.getElementById("article-asset-file");
      const file = input?.files?.[0];
      if (!file) return setStatus("请选择要上传的插图。", true);
      if (!payload.folder || !payload.slug) return setStatus("请先填写文章分组和 slug。", true);
      const body = new FormData();
      body.set("file", file);
      try {
        const result = await api(`/api/admin/articles/${payload.folder}/${payload.slug}/assets`, { method: "POST", body });
        const textarea = form.querySelector('[name="markdown"]');
        const insert = `\n\n![${file.name}](${result.url} "${file.name}")\n`;
        const start = textarea.selectionStart || textarea.value.length;
        textarea.value = `${textarea.value.slice(0, start)}${insert}${textarea.value.slice(start)}`;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
        setStatus("插图已上传并插入正文。");
      } catch (error) {
        setStatus(error.message, true);
      }
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
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
    return new File([blob], "thumb.webp", { type: "image/webp" });
  }

  function photoPayload(form) {
    const data = new FormData(form);
    return {
      title: data.get("title").toString(),
      folder: data.get("folder").toString(),
      description: data.get("description").toString(),
      capturedAt: toIsoLocal(data.get("capturedAt").toString()),
      alt: data.get("alt").toString(),
      visibility: data.get("visibility").toString(),
      location: {
        label: data.get("locationLabel").toString(),
        precision: data.get("locationPrecision").toString(),
      },
      camera: {
        make: data.get("cameraMake").toString(),
        model: data.get("cameraModel").toString(),
        lens: data.get("cameraLens").toString(),
        iso: data.get("cameraIso") ? Number(data.get("cameraIso")) : undefined,
        aperture: data.get("cameraAperture").toString(),
        shutter: data.get("cameraShutter").toString(),
      },
    };
  }

  function bindImages() {
    root.querySelectorAll("[data-edit-photo]").forEach((button) => {
      button.addEventListener("click", () => {
        const [folder, id] = button.getAttribute("data-edit-photo").split("/");
        state.editingPhoto = state.photos.find((photo) => photo.folder === folder && photo.id === id);
        render();
      });
    });

    root.querySelector('[data-action="new-photo"]')?.addEventListener("click", () => {
      state.editingPhoto = null;
      render();
    });

    const form = document.getElementById("image-form");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const metadata = photoPayload(form);
        if (state.editingPhoto) {
          const photo = await api(`/api/admin/images/${state.editingPhoto.folder}/${state.editingPhoto.id}`, {
            method: "PATCH",
            body: JSON.stringify(metadata),
          });
          await loadAll();
          state.editingPhoto = photo;
          setStatus("图片元数据已保存。");
          return;
        }

        const file = form.querySelector('[name="file"]').files?.[0];
        if (!file) return setStatus("请选择图片文件。", true);
        const body = new FormData();
        body.set("folder", metadata.folder);
        body.set("metadata", JSON.stringify(metadata));
        body.set("file", file);
        body.set("thumb", await createThumb(file));
        const photo = await api("/api/admin/images", { method: "POST", body });
        await loadAll();
        state.editingPhoto = photo;
        setStatus("图片已上传。");
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    root.querySelector('[data-action="delete-photo"]')?.addEventListener("click", async () => {
      if (!state.editingPhoto || !confirm("确认删除这张图片？")) return;
      try {
        await api(`/api/admin/images/${state.editingPhoto.folder}/${state.editingPhoto.id}`, { method: "DELETE" });
        await loadAll();
        state.editingPhoto = null;
        setStatus("图片已删除。");
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }

  function folderPayload(form) {
    const data = new FormData(form);
    return {
      kind: data.get("kind").toString(),
      slug: data.get("slug").toString(),
      label: data.get("label").toString(),
      description: data.get("description").toString(),
      order: Number(data.get("order") || 999),
    };
  }

  function bindFolders() {
    root.querySelectorAll("[data-edit-folder]").forEach((button) => {
      button.addEventListener("click", () => {
        const [kind, slug] = button.getAttribute("data-edit-folder").split("/");
        const folder = state.folders[kind].find((item) => item.slug === slug);
        state.editingFolder = { ...folder, kind };
        render();
      });
    });

    root.querySelector('[data-action="new-folder"]')?.addEventListener("click", () => {
      state.editingFolder = null;
      render();
    });

    const form = document.getElementById("folder-form");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const payload = folderPayload(form);
        const folder = await api("/api/admin/folders", { method: state.editingFolder ? "PATCH" : "POST", body: JSON.stringify(payload) });
        await loadAll();
        state.editingFolder = { ...folder, kind: payload.kind };
        setStatus("分组已保存。");
      } catch (error) {
        setStatus(error.message, true);
      }
    });

    root.querySelector('[data-action="delete-folder"]')?.addEventListener("click", async () => {
      if (!state.editingFolder || !confirm("确认删除这个空分组？")) return;
      try {
        await api("/api/admin/folders", { method: "DELETE", body: JSON.stringify(state.editingFolder) });
        await loadAll();
        state.editingFolder = null;
        setStatus("分组已删除。");
      } catch (error) {
        setStatus(error.message, true);
      }
    });
  }

  if (state.token) {
    loadAll()
      .then(() => {
        state.authed = true;
        render();
      })
      .catch(() => {
        sessionStorage.removeItem("adminToken");
        state.token = "";
        render();
      });
  } else {
    render();
  }
})();
