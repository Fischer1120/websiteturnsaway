(function () {
  const shell = document.querySelector("[data-public-shell]");
  if (!shell) return;

  const kind = shell.getAttribute("data-kind");
  const pathParts = window.location.pathname.split("/").filter(Boolean);

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

  function formatDate(value, withTime) {
    if (!value) return "";
    return new Intl.DateTimeFormat("zh-CN", {
      dateStyle: "medium",
      timeStyle: withTime ? "short" : undefined,
      timeZone: "Asia/Shanghai",
    }).format(new Date(value));
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

  async function fetchJson(url) {
    const response = await fetch(url);
    const payload = await response.json().catch(() => undefined);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error?.message || `Request failed: ${response.status}`);
    }
    return payload.data;
  }

  function emptyPanel(title, message) {
    shell.innerHTML = `
      <section class="panel dark">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Empty State</p>
            <h1>${escapeHtml(title)}</h1>
          </div>
          <p>${escapeHtml(message)}</p>
        </div>
      </section>
    `;
  }

  function errorPanel(error) {
    shell.innerHTML = `
      <section class="panel dark">
        <div class="section-heading">
          <div>
            <p class="eyebrow">Content Error</p>
            <h1>读取失败</h1>
          </div>
          <p>${escapeHtml(error.message || error)}</p>
        </div>
      </section>
    `;
  }

  function recordCard(item, type) {
    const href =
      type === "article" ? `/articles/${item.folder}/${item.slug}` : `/images/${item.folder}/${item.id}`;
    const image = type === "article" ? item.coverImage : item.thumbUrl || item.imageUrl;
    const title = item.title || "Untitled";
    const subtitle = type === "article" ? item.subtitle : item.location?.label || "";
    const summary =
      type === "article"
        ? item.summary
        : `${formatDate(item.capturedAt, true)} / ${item.location?.label || ""} / ${item.description || ""}`;
    const date = type === "article" ? item.publishedAt : item.capturedAt;
    return `
      <a class="record-card" href="${escapeAttr(href)}">
        <div class="record-thumb">
          ${image ? `<img src="${escapeAttr(image)}" alt="${escapeAttr(title)}" loading="lazy">` : ""}
        </div>
        <div class="record-body">
          <div class="chips">
            <span class="chip">${escapeHtml(item.folder)}</span>
            <span class="chip">${escapeHtml(type)}</span>
          </div>
          <h3>${escapeHtml(title)}</h3>
          ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ""}
          <p>${escapeHtml(summary)}</p>
          <p class="system-text">${escapeHtml(formatDate(date, true))}</p>
        </div>
      </a>
    `;
  }

  function folderRows(folders, basePath) {
    if (!folders.length) return "";
    return `
      <div class="folder-grid">
        ${folders
          .map(
            (folder) => `
              <a class="folder-row" href="${basePath}/${escapeAttr(folder.slug)}">
                <strong>${escapeHtml(folder.label || folder.slug)}</strong>
                <p>${escapeHtml(folder.description || "未命名归档")}</p>
                <span class="count">${Number(folder.count || 0).toString().padStart(2, "0")} records</span>
              </a>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function rows(items) {
    return `
      <div class="meta-list">
        ${items
          .filter((item) => item.value !== undefined && item.value !== null && String(item.value) !== "")
          .map(
            (item) => `
              <div class="meta-row">
                <span class="meta-label">${escapeHtml(item.label)}</span>
                <span class="meta-value">${escapeHtml(item.value)}</span>
              </div>
            `,
          )
          .join("")}
      </div>
    `;
  }

  function renderArticleList(data, folderSlug) {
    const articles = folderSlug
      ? data.articles.filter((article) => article.folder === folderSlug)
      : data.articles;
    const folder = data.folders.find((item) => item.slug === folderSlug);
    if (!articles.length) {
      emptyPanel("没有文章", folderSlug ? "这个分组暂时没有公开文章。" : "暂时没有公开文章。");
      return;
    }
    shell.innerHTML = `
      <section class="panel dark">
        <div class="section-heading">
          <div>
            <p class="eyebrow">${folderSlug ? `/articles/${escapeHtml(folderSlug)}` : "Articles / Live Index"}</p>
            <h1>${escapeHtml(folder?.label || "文章栏目")}</h1>
          </div>
          <p>${escapeHtml(folder?.description || "文章以 folder 和 slug 建立稳定地址。")}</p>
        </div>
        <div class="record-grid">
          ${articles.map((article) => recordCard(article, "article")).join("")}
        </div>
        ${folderSlug ? "" : folderRows(data.folders, "/articles")}
      </section>
    `;
  }

  function renderArticleDetail(article) {
    shell.innerHTML = `
      <article class="panel article-detail">
        <div class="article-prose">
          <p class="eyebrow">Article Record / ${escapeHtml(article.folder)}/${escapeHtml(article.slug)}</p>
          <h1>${escapeHtml(article.title)}</h1>
          <p class="subtitle">${escapeHtml(article.subtitle)}</p>
          <div class="article-body">${markdownToHtml(article.markdown)}</div>
        </div>
        <aside class="sidecar">
          <h2>Article sidecar</h2>
          ${rows([
            { label: "Folder", value: article.folder },
            { label: "Slug", value: article.slug },
            { label: "Published", value: formatDate(article.publishedAt, true) },
            { label: "Updated", value: formatDate(article.updatedAt, true) },
            { label: "Status", value: article.status },
            { label: "R2 Key", value: article.objectKey },
          ])}
        </aside>
      </article>
    `;
  }

  function renderImageList(data, folderSlug) {
    const photos = folderSlug ? data.photos.filter((photo) => photo.folder === folderSlug) : data.photos;
    const folder = data.folders.find((item) => item.slug === folderSlug);
    if (!photos.length) {
      emptyPanel("没有图片", folderSlug ? "这个分组暂时没有公开图片。" : "暂时没有公开图片。");
      return;
    }
    shell.innerHTML = `
      <section class="panel dark">
        <div class="section-heading">
          <div>
            <p class="eyebrow">${folderSlug ? `/images/${escapeHtml(folderSlug)}` : "Images / Live Index"}</p>
            <h1>${escapeHtml(folder?.label || "图片栏目")}</h1>
          </div>
          <p>${escapeHtml(folder?.description || "图片按相册文件夹组织。")}</p>
        </div>
        <div class="record-grid">
          ${photos.map((photo) => recordCard(photo, "photo")).join("")}
        </div>
        ${folderSlug ? "" : folderRows(data.folders, "/images")}
      </section>
    `;
  }

  function renderImageDetail(photo) {
    const camera = photo.camera ? [photo.camera.make, photo.camera.model, photo.camera.lens].filter(Boolean).join(" / ") : "";
    shell.innerHTML = `
      <section class="panel photo-detail" aria-labelledby="photo-title">
        <div class="photo-main">
          <p class="eyebrow">Photo Record / ${escapeHtml(photo.folder)}/${escapeHtml(photo.id)}</p>
          <h1 id="photo-title">${escapeHtml(photo.title)}</h1>
          <div class="photo-image">
            <img src="${escapeAttr(photo.imageUrl)}" alt="${escapeAttr(photo.alt || photo.title)}">
          </div>
          ${photo.description ? `<p class="photo-description">${escapeHtml(photo.description)}</p>` : ""}
        </div>
        <aside class="sidecar">
          <h2>Photo metadata sidecar</h2>
          ${rows([
            { label: "Captured", value: formatDate(photo.capturedAt, true) },
            { label: "Location", value: photo.location?.label },
            { label: "Precision", value: photo.location?.precision },
            { label: "Folder", value: photo.folder },
            { label: "Camera", value: camera },
            { label: "ISO", value: photo.camera?.iso },
            { label: "Exposure", value: photo.camera ? `${photo.camera.aperture || ""} / ${photo.camera.shutter || ""}` : "" },
            { label: "Object Key", value: photo.objectKey },
          ])}
        </aside>
      </section>
    `;
  }

  async function renderArticles() {
    if (pathParts.length >= 3) {
      renderArticleDetail(await fetchJson(`/api/articles/${pathParts[1]}/${pathParts[2]}`));
      return;
    }
    const data = await fetchJson(pathParts.length === 2 ? `/api/articles/${pathParts[1]}` : "/api/articles");
    renderArticleList(
      pathParts.length === 2 ? { articles: data.articles, folders: [{ slug: data.folder, label: data.folder, description: "", count: data.articles.length }] } : data,
      pathParts[1],
    );
  }

  async function renderImages() {
    if (pathParts.length >= 3) {
      renderImageDetail(await fetchJson(`/api/images/${pathParts[1]}/${pathParts[2]}`));
      return;
    }
    const data = await fetchJson(pathParts.length === 2 ? `/api/images/${pathParts[1]}` : "/api/images");
    renderImageList(
      pathParts.length === 2 ? { photos: data.photos, folders: [{ slug: data.folder, label: data.folder, description: "", count: data.photos.length }] } : data,
      pathParts[1],
    );
  }

  (kind === "articles" ? renderArticles() : renderImages()).catch(errorPanel);
})();
