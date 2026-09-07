(() => {
  const root = document.documentElement;
  const screens = [...document.querySelectorAll("[data-screen]")];
  const screenLinks = [...document.querySelectorAll("[data-screen-link]")];
  const mainNavLinks = [...document.querySelectorAll(".primary-nav [data-screen-link]")];
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const validScreens = new Set(["home", "article", "images", "admin"]);
  let currentScreen = "home";

  const screenTitles = {
    home: "Orbital Archive v2 · Website Turns Away",
    article: "黄昏中的方碑 · Orbital Archive v2",
    images: "图片与地图 · Orbital Archive v2",
    admin: "内容工作台 · Orbital Archive v2",
  };

  function routeFromHash() {
    const route = window.location.hash.replace(/^#/, "");
    if (!route) return { screen: "home", imageView: "photos" };
    const [screen, view] = route.split("/");
    if (!validScreens.has(screen)) return null;
    return {
      screen,
      imageView: view === "map" ? "map" : "photos",
    };
  }

  function writeHash(screen, imageView = "photos", replace = false) {
    const next = `#${screen}${screen === "images" && imageView === "map" ? "/map" : ""}`;
    if (window.location.hash === next) return;
    try {
      window.history[replace ? "replaceState" : "pushState"](null, "", next);
    } catch {
      window.location.hash = next;
    }
  }

  function focusScreenHeading(screen) {
    const heading = screen.querySelector("h1");
    if (!heading) return;
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }

  function showScreen(name, options = {}) {
    const nextName = validScreens.has(name) ? name : "home";
    const nextScreen = screens.find((screen) => screen.dataset.screen === nextName);
    if (!nextScreen) return;

    const update = () => {
      screens.forEach((screen) => {
        const active = screen === nextScreen;
        screen.hidden = !active;
        screen.classList.toggle("is-active", active);
        if (active && screen.dataset.entered !== "true") {
          screen.dataset.entered = "true";
          screen.classList.add("is-entering");
          window.setTimeout(() => screen.classList.remove("is-entering"), 520);
        } else if (!active) screen.classList.remove("is-entering");
      });
      mainNavLinks.forEach((link) => {
        if (link.dataset.screenLink === nextName) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
      currentScreen = nextName;
      document.title = screenTitles[nextName];
    };

    if (document.startViewTransition && root.dataset.motion === "on" && !prefersReducedMotion.matches) {
      document.startViewTransition(update);
    } else {
      update();
    }

    if (options.updateHash !== false) writeHash(nextName, options.imageView);
    window.scrollTo(0, 0);
    if (options.focus) window.setTimeout(() => focusScreenHeading(nextScreen), 20);
  }

  screenLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const name = link.dataset.screenLink;
      const tweakJump = Boolean(link.closest(".tweak-jumps"));
      showScreen(name, { focus: true, updateHash: name !== "images" });
      if (name === "images") setImageTab(tweakJump ? "map" : "photos", { focus: false, updateHash: true });
      closeTweaks(false);
    });
  });

  const imageTabs = [...document.querySelectorAll("[data-image-tab]")];
  const imagePanels = [...document.querySelectorAll("[data-image-panel]")];
  const imageTabLinks = [...document.querySelectorAll("[data-image-tab-link]")];

  function setImageTab(name, options = {}) {
    const nextName = name === "map" ? "map" : "photos";
    imageTabs.forEach((tab) => {
      const selected = tab.dataset.imageTab === nextName;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && options.focus) tab.focus();
    });
    imagePanels.forEach((panel) => {
      panel.hidden = panel.dataset.imagePanel !== nextName;
    });
    if (currentScreen !== "images") showScreen("images", { focus: false, updateHash: false });
    if (options.updateHash !== false) writeHash("images", nextName);
    if (nextName === "map") beginMapLoad();
  }

  imageTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => setImageTab(tab.dataset.imageTab, { focus: false }));
    tab.addEventListener("keydown", (event) => {
      let nextIndex = index;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % imageTabs.length;
      else if (event.key === "ArrowLeft") nextIndex = (index - 1 + imageTabs.length) % imageTabs.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = imageTabs.length - 1;
      else return;
      event.preventDefault();
      setImageTab(imageTabs[nextIndex].dataset.imageTab, { focus: true });
    });
  });

  imageTabLinks.forEach((button) => {
    button.addEventListener("click", () => setImageTab(button.dataset.imageTabLink, { focus: true }));
  });

  const mapState = document.querySelector("[data-map-state]");
  const mapViews = {
    idle: document.querySelector("[data-map-placeholder]"),
    loading: document.querySelector("[data-map-loading]"),
    error: document.querySelector("[data-map-error]"),
    ready: document.querySelector("[data-map-ready]"),
  };
  let mapTimer = 0;

  function setMapState(name, moveFocus = false) {
    if (!mapState || !mapViews[name]) return;
    window.clearTimeout(mapTimer);
    mapState.dataset.mapState = name;
    Object.entries(mapViews).forEach(([key, view]) => {
      view.hidden = key !== name;
    });
    if (moveFocus) {
      const target = name === "error" ? document.querySelector("[data-map-retry]") : mapViews[name];
      window.setTimeout(() => target?.focus({ preventScroll: true }), 20);
    }
  }

  function beginMapLoad(force = false, moveFocus = false) {
    if (!mapState || (mapState.dataset.mapState === "ready" && !force)) return;
    setMapState("loading", moveFocus);
    mapTimer = window.setTimeout(() => setMapState("ready"), prefersReducedMotion.matches ? 80 : 620);
  }

  document.querySelector("[data-map-retry]")?.addEventListener("click", () => beginMapLoad(true, true));
  document.querySelector("[data-map-fail]")?.addEventListener("click", () => setMapState("error", true));
  document.querySelector("[data-map-reset]")?.addEventListener("click", () => {
    document.querySelectorAll(".map-marker").forEach((marker) => marker.classList.remove("is-selected"));
    [...mapRecords, ...mapMarkers].forEach((control) => control.setAttribute("aria-pressed", "false"));
  });

  const mapRecords = [...document.querySelectorAll("[data-map-record]")];
  const mapMarkers = [...document.querySelectorAll(".map-marker")];
  function selectMapRecord(name) {
    mapMarkers.forEach((marker) => {
      const selected = marker.classList.contains(`marker-${name}`);
      marker.classList.toggle("is-selected", selected);
      marker.setAttribute("aria-pressed", String(selected));
    });
    mapRecords.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.mapRecord === name)));
  }
  mapRecords.forEach((button) => button.addEventListener("click", () => selectMapRecord(button.dataset.mapRecord)));
  mapMarkers.forEach((button) => {
    button.addEventListener("click", () => selectMapRecord(button.classList.contains("marker-one") ? "one" : "two"));
  });

  const adminTabs = [...document.querySelectorAll("[data-admin-tab]")];
  const adminPanels = [...document.querySelectorAll("[data-admin-panel]")];
  function setAdminTab(name, focus = false) {
    adminTabs.forEach((tab) => {
      const selected = tab.dataset.adminTab === name;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    });
    adminPanels.forEach((panel) => {
      panel.hidden = panel.dataset.adminPanel !== name;
    });
  }

  adminTabs.forEach((tab, index) => {
    tab.addEventListener("click", () => setAdminTab(tab.dataset.adminTab));
    tab.addEventListener("keydown", (event) => {
      let nextIndex = index;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % adminTabs.length;
      else if (event.key === "ArrowLeft") nextIndex = (index - 1 + adminTabs.length) % adminTabs.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = adminTabs.length - 1;
      else return;
      event.preventDefault();
      setAdminTab(adminTabs[nextIndex].dataset.adminTab, true);
    });
  });

  const recordData = {
    monolith: {
      title: "黄昏中的方碑",
      subtitle: "一次关于城市边缘与几何记忆的记录",
      folder: "notes",
      status: "published",
      markdown: "# 黄昏中的方碑\n\n## 第一段路\n\n路面在黄昏里变得像一张校准纸。\n\n## 广场尽头\n\n球体记录天空的颜色，金字塔记录入口的角度。\n\n## 折返\n\n文件夹名成为回家的路标。",
    },
    expo: {
      title: "像世博会海报一样散步",
      subtitle: "在粉色天空下经过球体、金字塔和长阴影",
      folder: "travel",
      status: "published",
      markdown: "# 像世博会海报一样散步\n\n## 入口\n\n入口并不热闹，反而像一本旧导览册里被折过的页面。\n\n## 中央轴线\n\n每走几步，建筑的比例都会变化。",
    },
    draft: {
      title: "未命名的中央轴线（演示草稿）",
      subtitle: "尚未完成的观察记录",
      folder: "notes",
      status: "draft",
      markdown: "# 未命名的中央轴线\n\n这是一条只用于覆盖后台草稿状态的演示记录。",
    },
  };
  const adminForm = document.querySelector("[data-admin-form]");
  const adminWorkspace = document.querySelector("[data-admin-workspace]");
  const recordButtons = [...document.querySelectorAll("[data-record]")];
  const saveStatus = document.querySelector("[data-save-status]");
  const saveButton = document.querySelector("[data-save-button]");
  const deleteButton = document.querySelector("[data-delete-record]");
  const editorTitle = document.querySelector("[data-editor-title]");
  let selectedRecord = "monolith";
  let dirty = false;
  let pendingRecord = null;

  function setDirty(nextDirty) {
    dirty = nextDirty;
    if (!saveStatus) return;
    saveStatus.innerHTML = nextDirty
      ? '<span class="unsaved-dot"></span>未保存'
      : '<span class="status-dot"></span>已同步';
  }

  function loadRecord(name) {
    const data = recordData[name];
    if (!data || !adminForm) return;
    selectedRecord = name;
    recordButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.record === name)));
    adminForm.elements.title.value = data.title;
    adminForm.elements.subtitle.value = data.subtitle;
    adminForm.elements.folder.value = data.folder;
    adminForm.elements.status.value = data.status;
    markdown.value = data.markdown;
    renderMarkdownPreview();
    editorTitle.textContent = `编辑：${data.title}`;
    setDirty(false);
    adminWorkspace?.classList.add("is-editing");
    window.setTimeout(() => editorTitle?.focus({ preventScroll: true }), 20);
  }

  recordButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const name = button.dataset.record;
      if (name === selectedRecord) {
        adminWorkspace?.classList.add("is-editing");
        editorTitle?.focus({ preventScroll: true });
        return;
      }
      if (dirty) {
        pendingRecord = name;
        openConfirm({
          title: "放弃未保存的修改？",
          copy: "当前文章的改动还没有保存。切换记录会放弃这些改动。",
          confirmLabel: "放弃并切换",
          onConfirm: () => loadRecord(pendingRecord),
        });
      } else loadRecord(name);
    });
  });

  adminForm?.addEventListener("input", () => setDirty(true));
  adminForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    adminForm.setAttribute("aria-busy", "true");
    saveButton.disabled = true;
    deleteButton.disabled = true;
    saveButton.textContent = "正在保存…";
    saveStatus.innerHTML = '<span class="status-dot"></span>正在保存';
    window.setTimeout(() => {
      recordData[selectedRecord] = {
        ...recordData[selectedRecord],
        title: adminForm.elements.title.value,
        subtitle: adminForm.elements.subtitle.value,
        folder: adminForm.elements.folder.value,
        status: adminForm.elements.status.value,
        markdown: markdown.value,
      };
      const selectedButton = recordButtons.find((button) => button.dataset.record === selectedRecord);
      if (selectedButton) selectedButton.querySelector("strong").textContent = recordData[selectedRecord].title;
      editorTitle.textContent = `编辑：${recordData[selectedRecord].title}`;
      adminForm.removeAttribute("aria-busy");
      saveButton.disabled = false;
      deleteButton.disabled = false;
      saveButton.textContent = "保存更改";
      setDirty(false);
    }, 820);
  });

  document.querySelector("[data-admin-back]")?.addEventListener("click", () => {
    adminWorkspace?.classList.remove("is-editing");
    const selected = recordButtons.find((button) => button.dataset.record === selectedRecord);
    selected?.focus();
  });

  const markdown = document.querySelector("#article-markdown");
  const markdownPreview = document.querySelector("[data-markdown-preview]");
  let previewTimer = 0;
  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
    })[character]);
  }
  function renderMarkdownPreview() {
    if (!markdown || !markdownPreview) return;
    const html = escapeHtml(markdown.value)
      .split(/\n{2,}/)
      .map((block) => {
        if (block.startsWith("## ")) return `<h2>${block.slice(3)}</h2>`;
        if (block.startsWith("# ")) return `<h1>${block.slice(2)}</h1>`;
        return `<p>${block.replace(/\n/g, "<br>")}</p>`;
      })
      .join("");
    markdownPreview.innerHTML = html;
  }
  markdown?.addEventListener("input", () => {
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(renderMarkdownPreview, 150);
  });
  renderMarkdownPreview();

  document.querySelector("[data-insert-image]")?.addEventListener("click", () => {
    if (!markdown) return;
    const start = markdown.selectionStart ?? markdown.value.length;
    const end = markdown.selectionEnd ?? start;
    const insertion = "![黄昏中的几何建筑](../assets/observation-04.webp)";
    markdown.setRangeText(insertion, start, end, "end");
    markdown.dispatchEvent(new Event("input", { bubbles: true }));
    markdown.focus();
  });

  const uploadInput = document.querySelector("[data-image-upload]");
  const uploadStatus = document.querySelector("[data-upload-status]");
  uploadInput?.addEventListener("change", () => {
    const file = uploadInput.files?.[0];
    if (!file) return;
    uploadStatus.textContent = `正在解码一次：${file.name}`;
    window.setTimeout(() => { uploadStatus.textContent = "正在生成 display（阶段 1/2）"; }, 260);
    window.setTimeout(() => { uploadStatus.textContent = "正在生成 thumb（阶段 2/2）"; }, 560);
    window.setTimeout(() => { uploadStatus.textContent = "本地处理完成；v0 未上传"; }, 880);
  });

  const confirmDialog = document.querySelector("[data-confirm-dialog]");
  const dialogTitle = document.querySelector("[data-dialog-title]");
  const dialogCopy = document.querySelector("[data-dialog-copy]");
  const dialogConfirm = document.querySelector("[data-dialog-confirm]");
  let confirmAction = null;

  function openConfirm({ title, copy, confirmLabel, onConfirm }) {
    if (!confirmDialog || typeof confirmDialog.showModal !== "function") {
      if (window.confirm(copy)) onConfirm();
      return;
    }
    dialogTitle.textContent = title;
    dialogCopy.textContent = copy;
    dialogConfirm.textContent = confirmLabel;
    confirmAction = onConfirm;
    confirmDialog.returnValue = "";
    confirmDialog.showModal();
  }

  confirmDialog?.addEventListener("close", () => {
    if (confirmDialog.returnValue === "confirm") confirmAction?.();
    confirmAction = null;
  });

  deleteButton?.addEventListener("click", () => {
    openConfirm({
      title: "删除这篇文章？",
      copy: "删除会移除当前公开记录。这个 v0 只展示确认流程，不会真的修改数据。",
      confirmLabel: "确认删除",
      onConfirm: () => {
        const inlineError = document.querySelector("[data-inline-error]");
        inlineError.textContent = "v0 未执行删除：生产实现会在确认后调用现有 API。";
        inlineError.focus?.();
      },
    });
  });

  const tweaksPanel = document.querySelector("#tweaks-panel");
  const tweaksOpen = document.querySelector("[data-tweaks-open]");
  function openTweaks() {
    tweaksPanel.hidden = false;
    tweaksPanel.querySelector("input, button")?.focus();
  }
  function closeTweaks(restoreFocus = true) {
    if (!tweaksPanel || tweaksPanel.hidden) return;
    tweaksPanel.hidden = true;
    if (restoreFocus) tweaksOpen?.focus();
  }
  tweaksOpen?.addEventListener("click", openTweaks);
  document.querySelector("[data-tweaks-close]")?.addEventListener("click", () => closeTweaks());
  document.querySelectorAll('input[name="density"]').forEach((input) => {
    input.addEventListener("change", () => { root.dataset.density = input.value; });
  });
  document.querySelector("[data-motion-toggle]")?.addEventListener("change", (event) => {
    root.dataset.motion = event.target.checked ? "on" : "off";
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !tweaksPanel.hidden) closeTweaks();
  });

  const orbitalStage = document.querySelector("[data-orbital-stage]");
  let pointerFrame = 0;
  orbitalStage?.addEventListener("pointermove", (event) => {
    if (root.dataset.motion === "off" || prefersReducedMotion.matches || event.pointerType === "touch") return;
    const bounds = orbitalStage.getBoundingClientRect();
    const x = Math.max(-4, Math.min(4, ((event.clientX - bounds.left) / bounds.width - 0.5) * 8));
    const y = Math.max(-4, Math.min(4, ((event.clientY - bounds.top) / bounds.height - 0.5) * 8));
    window.cancelAnimationFrame(pointerFrame);
    pointerFrame = window.requestAnimationFrame(() => {
      orbitalStage.classList.add("is-tracking");
      orbitalStage.style.setProperty("--pointer-x", `${x.toFixed(2)}px`);
      orbitalStage.style.setProperty("--pointer-y", `${y.toFixed(2)}px`);
    });
  });
  orbitalStage?.addEventListener("pointerleave", () => {
    orbitalStage.classList.remove("is-tracking");
    orbitalStage.style.setProperty("--pointer-x", "0px");
    orbitalStage.style.setProperty("--pointer-y", "0px");
  });

  function restoreRoute() {
    const route = routeFromHash();
    if (!route) return;
    showScreen(route.screen, { updateHash: false, focus: false });
    if (route.screen === "images") setImageTab(route.imageView, { updateHash: false, focus: false });
  }

  window.addEventListener("popstate", restoreRoute);
  window.addEventListener("hashchange", restoreRoute);
  restoreRoute();
  if (!window.location.hash) writeHash("home", "photos", true);
})();
