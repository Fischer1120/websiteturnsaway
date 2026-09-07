const MAP_STYLE_URL = "/assets/photo-map.css";
const MAP_SCRIPT_URL = "/assets/photo-map.js";
const MAP_ASSET_TIMEOUT = 12_000;

let mapAssetPromise;

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function normalizedPath(pathname) {
  const value = pathname.replace(/\/+$/, "");
  return value || "/";
}

function isPrimaryActivation(event) {
  return event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

function setupCurrentNavigation() {
  const links = Array.from(
    document.querySelectorAll('[data-site-nav] a[href], .site-nav a[href], .primary-nav a[href], nav[aria-label="主导航"] a[href]'),
  );
  if (!links.length) return;

  const currentPath = normalizedPath(window.location.pathname);
  let currentLink;
  let currentScore = -1;

  for (const link of links) {
    const href = link.getAttribute("href");
    if (!href) continue;
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin) continue;
    const linkPath = normalizedPath(url.pathname);
    const exact = linkPath === currentPath;
    const section = linkPath !== "/" && currentPath.startsWith(`${linkPath}/`);
    const score = exact ? 10_000 + linkPath.length : section ? linkPath.length : -1;
    if (score > currentScore) {
      currentLink = link;
      currentScore = score;
    }
  }

  for (const link of links) link.removeAttribute("aria-current");
  currentLink?.setAttribute("aria-current", "page");
}

function setupDisclosures() {
  for (const details of document.querySelectorAll("details[data-context-disclosure], details.context-disclosure")) {
    const summary = details.querySelector(":scope > summary");
    if (!summary) continue;
    const sync = () => summary.setAttribute("aria-expanded", String(details.open));
    sync();
    details.addEventListener("toggle", sync);
  }
}

function setupImageFallbacks() {
  document.addEventListener(
    "error",
    (event) => {
      const image = event.target;
      if (!(image instanceof HTMLImageElement)) return;
      const fallback = image.dataset.fallbackSrc;
      if (!fallback) return;
      delete image.dataset.fallbackSrc;
      image.classList.add("is-fallback");
      image.src = fallback;
    },
    true,
  );
}

function setupPageMotion() {
  document.documentElement.dataset.uiReady = "true";
  if ("startViewTransition" in document) document.documentElement.classList.add("supports-view-transitions");
  if (prefersReducedMotion()) return;

  document.body.classList.add("is-page-entering");
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("is-page-entering")));
}

function setupOrbitalHero() {
  const hero = document.querySelector("[data-orbital-hero]");
  if (!hero) return;

  let hasEntered = false;
  try {
    hasEntered = sessionStorage.getItem("orbital-archive:hero-entered") === "true";
  } catch {
    hasEntered = false;
  }

  if (!hasEntered && !prefersReducedMotion()) {
    hero.dataset.entered = "false";
    requestAnimationFrame(() => requestAnimationFrame(() => (hero.dataset.entered = "true")));
    try {
      sessionStorage.setItem("orbital-archive:hero-entered", "true");
    } catch {
      // Session storage can be unavailable in hardened browsing modes.
    }
  } else {
    hero.dataset.entered = "true";
  }

  const stage = hero.querySelector("[data-orbital-stage]");
  const art = hero.querySelector("[data-orbital-art]");
  if (!stage || !art || prefersReducedMotion() || !window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) return;

  let frame;
  let nextX = 0;
  let nextY = 0;
  const render = () => {
    frame = undefined;
    stage.style.setProperty("--pointer-x", `${nextX.toFixed(2)}px`);
    stage.style.setProperty("--pointer-y", `${nextY.toFixed(2)}px`);
  };
  const queue = (x, y) => {
    nextX = Math.max(-4, Math.min(4, x));
    nextY = Math.max(-4, Math.min(4, y));
    if (frame === undefined) frame = requestAnimationFrame(render);
  };

  stage.addEventListener("pointermove", (event) => {
    const bounds = stage.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    queue(((event.clientX - bounds.left) / bounds.width - 0.5) * 8, ((event.clientY - bounds.top) / bounds.height - 0.5) * 8);
  });
  stage.addEventListener("pointerleave", () => queue(0, 0));
}

function waitForAsset(element, ready, kind) {
  if (ready()) return Promise.resolve(element);
  if (element._wtaAssetPromise) return element._wtaAssetPromise;

  element._wtaAssetPromise = new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      window.clearTimeout(timer);
      element.removeEventListener("load", loaded);
      element.removeEventListener("error", failed);
    };
    const loaded = () => {
      cleanup();
      if (!ready()) {
        reject(Object.assign(new Error(`${kind}_invalid`), { kind: "asset" }));
        return;
      }
      element.dataset.loaded = "true";
      resolve(element);
    };
    const failed = () => {
      cleanup();
      reject(Object.assign(new Error(`${kind}_failed`), { kind: "asset" }));
    };
    element.addEventListener("load", loaded, { once: true });
    element.addEventListener("error", failed, { once: true });
    timer = window.setTimeout(failed, MAP_ASSET_TIMEOUT);
  }).catch((error) => {
    delete element._wtaAssetPromise;
    if (element.isConnected) element.remove();
    throw error;
  });

  return element._wtaAssetPromise;
}

function loadMapStyle() {
  let link = document.querySelector('link[data-photo-map-asset="style"], link[href^="/assets/photo-map.css"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = MAP_STYLE_URL;
    link.dataset.photoMapAsset = "style";
    document.head.append(link);
  }
  return waitForAsset(link, () => link.dataset.loaded === "true" || Boolean(link.sheet), "map_style");
}

function loadMapScript() {
  if (globalThis.WTAPhotoMap?.mount) return Promise.resolve(globalThis.WTAPhotoMap);
  let script = document.querySelector('script[data-photo-map-asset="script"], script[src^="/assets/photo-map.js"]');
  if (!script) {
    script = document.createElement("script");
    script.src = MAP_SCRIPT_URL;
    script.async = true;
    script.dataset.photoMapAsset = "script";
    document.head.append(script);
  }
  return waitForAsset(script, () => Boolean(globalThis.WTAPhotoMap?.mount), "map_script").then(() => globalThis.WTAPhotoMap);
}

function loadMapAssets() {
  if (!mapAssetPromise) {
    mapAssetPromise = Promise.all([loadMapStyle(), loadMapScript()])
      .then(([, api]) => api)
      .catch((error) => {
        mapAssetPromise = undefined;
        throw error;
      });
  }
  return mapAssetPromise;
}

function mapElements(root) {
  return {
    canvas: root.querySelector("[data-map-canvas]"),
    load: root.querySelector("[data-map-load]"),
    reset: root.querySelector("[data-map-reset]"),
    retry: root.querySelector("[data-map-retry]"),
    returnButton: root.querySelector("[data-map-return]"),
    status: root.querySelector("[data-map-status]"),
  };
}

function mapControlsAreVisible(root) {
  const panel = root.closest("[data-photo-map-panel]");
  return !panel || !panel.hidden;
}

function setMapStatus(root, message, { error = false, focus = false } = {}) {
  const { status } = mapElements(root);
  if (!status) return;
  status.textContent = message;
  status.hidden = !message;
  status.classList.toggle("is-error", error);
  status.classList.toggle("error", error);
  status.classList.toggle("is-ready", root.dataset.mapState === "ready");
  status.setAttribute("role", error ? "alert" : "status");
  status.setAttribute("aria-live", error ? "assertive" : "polite");
  if (focus) {
    status.tabIndex = -1;
    status.focus({ preventScroll: true });
    status.scrollIntoView({ block: "nearest" });
  }
}

function setMapState(root, state, message = "") {
  const { canvas, load, reset, retry, returnButton, status } = mapElements(root);
  root.dataset.mapState = state;
  root.setAttribute("aria-busy", String(state === "loading"));

  if (canvas) {
    canvas.hidden = state !== "ready";
    canvas.toggleAttribute("inert", state !== "ready");
    canvas.setAttribute("aria-hidden", String(state !== "ready"));
    if (state !== "loading") canvas.style.removeProperty("opacity");
  }
  if (reset) {
    reset.hidden = state !== "ready";
    reset.disabled = state !== "ready";
  }
  if (load) {
    load.dataset.idleLabel ||= load.textContent.trim() || "加载地图";
    load.hidden = state === "ready" || state === "error";
    load.disabled = state === "loading";
    load.setAttribute("aria-busy", String(state === "loading"));
    load.textContent = state === "loading" ? "正在加载地图……" : load.dataset.idleLabel;
  }
  if (retry) retry.hidden = state !== "error";
  if (returnButton) returnButton.hidden = state !== "error";
  if (status) status.setAttribute("aria-busy", String(state === "loading"));
  if (message) setMapStatus(root, message, { error: state === "error" });
}

function prepareCanvasForMount(root) {
  const { canvas } = mapElements(root);
  if (!canvas) throw Object.assign(new Error("map_canvas_missing"), { kind: "resource" });
  canvas.hidden = false;
  canvas.toggleAttribute("inert", true);
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.opacity = "0";
}

function mapErrorMessage(error) {
  if (error?.kind === "asset") return "地图资源未能加载。你可以重试，或返回照片列表继续浏览。";
  if (error?.kind === "tile") return "地图瓦片暂时无法读取。你可以重试，或返回照片列表继续浏览。";
  if (error?.kind === "api") return "照片位置数据暂时无法读取。你可以重试，或返回照片列表继续浏览。";
  return "地图暂时无法加载。你可以重试，或返回照片列表继续浏览。";
}

async function activateMap(root, { focusError = false, focusLoading = false, focusReady = false } = {}) {
  if (root.dataset.mapState === "ready" && root._wtaMap) {
    requestAnimationFrame(() => root._wtaMap?.invalidateSize?.({ animate: false }));
    return root._wtaMap;
  }
  if (root._wtaMountPromise) return root._wtaMountPromise;

  setMapState(root, "loading", "正在加载受保护的照片位置与地图资源……");
  if (focusLoading) setMapStatus(root, "正在重新加载受保护的照片位置与地图资源……", { focus: true });
  root._wtaMountPromise = loadMapAssets()
    .then(async (api) => {
      prepareCanvasForMount(root);
      const map = await api.mount(root);
      if (!map) throw Object.assign(new Error("map_mount_failed"), { kind: "resource" });
      root._wtaMap = map;
      setMapState(root, "ready", root.dataset.mapReadyMessage || "地图已加载。位置范围已经过隐私保护处理。");
      requestAnimationFrame(() => map.invalidateSize?.({ animate: false }));
      if (focusReady && mapControlsAreVisible(root)) mapElements(root).reset?.focus({ preventScroll: true });
      return map;
    })
    .catch((error) => {
      root._wtaMap = undefined;
      setMapState(root, "error", mapErrorMessage(error));
      setMapStatus(root, mapErrorMessage(error), { error: true, focus: focusError && mapControlsAreVisible(root) });
      throw error;
    })
    .finally(() => {
      root._wtaMountPromise = undefined;
    });

  return root._wtaMountPromise;
}

function ensureMapActions(root, returnToPhotos) {
  const status = root.querySelector("[data-map-status]");
  if (!status) return;

  let retry = root.querySelector("[data-map-retry]");
  if (!retry) {
    retry = document.createElement("button");
    retry.type = "button";
    retry.className = "button secondary";
    retry.dataset.mapRetry = "true";
    retry.textContent = "重试地图";
    retry.hidden = true;
    status.insertAdjacentElement("afterend", retry);
  }
  if (!retry.dataset.mapActionReady) {
    retry.dataset.mapActionReady = "true";
    retry.addEventListener("click", () => activateMap(root, { focusError: true, focusLoading: true, focusReady: true }).catch(() => {}));
  }

  let returnButton = root.querySelector("[data-map-return]");
  if (!returnButton) {
    if (returnToPhotos) {
      returnButton = document.createElement("button");
      returnButton.type = "button";
      returnButton.textContent = "返回照片列表";
    } else {
      returnButton = document.createElement("a");
      returnButton.href = "/images";
      returnButton.textContent = "返回照片列表";
    }
    returnButton.className = "button secondary";
    returnButton.dataset.mapReturn = "true";
    returnButton.hidden = true;
    retry.insertAdjacentElement("afterend", returnButton);
  }
  if (returnToPhotos && !returnButton.dataset.mapActionReady) {
    returnButton.dataset.mapActionReady = "true";
    returnButton.addEventListener("click", returnToPhotos);
  }

  if (!root.dataset.mapErrorReady) {
    root.dataset.mapErrorReady = "true";
    root.addEventListener("wta:map-error", (event) => {
      root._wtaMap = undefined;
      setMapState(root, "error", mapErrorMessage(event.detail));
      setMapStatus(root, mapErrorMessage(event.detail), { error: true, focus: mapControlsAreVisible(root) });
    });
  }
}

function viewFromLocation() {
  const url = new URL(window.location.href);
  if (url.searchParams.get("view") === "map") return "map";
  if (["#map", "#images-map"].includes(url.hash)) return "map";
  return "photos";
}

function updateViewUrl(view) {
  const url = new URL(window.location.href);
  if (view === "map") url.searchParams.set("view", "map");
  else {
    url.searchParams.delete("view");
    url.searchParams.delete("photo");
  }
  if (["#map", "#images-map", "#photos", "#images-photos"].includes(url.hash)) url.hash = "";
  if (url.href !== window.location.href) history.pushState({ photoView: view }, "", url);
}

function setupPhotoMapPage(page, pageIndex) {
  const tabs = Array.from(page.querySelectorAll("[data-photo-view]"));
  const listPanel = page.querySelector("[data-photo-list-panel]");
  const mapPanel = page.querySelector("[data-photo-map-panel]");
  const root = page.querySelector("[data-photo-map-root]");
  if (tabs.length < 2 || !listPanel || !mapPanel || !root) return;

  const tablist = tabs[0].closest('[role="tablist"]') || tabs[0].parentElement;
  tablist?.setAttribute("role", "tablist");
  const suffix = pageIndex ? `-${pageIndex + 1}` : "";
  const panelByView = { photos: listPanel, map: mapPanel };

  for (const [index, tab] of tabs.entries()) {
    const view = tab.dataset.photoView === "map" ? "map" : "photos";
    const panel = panelByView[view];
    tab.id ||= `photo-${view}-tab${suffix}`;
    panel.id ||= `photo-${view}-panel${suffix}`;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", panel.id);
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    panel.tabIndex = panel.hasAttribute("tabindex") ? panel.tabIndex : -1;
    tab.dataset.photoTabIndex = String(index);
  }

  let currentView = "photos";
  const setView = (view, { updateUrl = false, focusTab = false } = {}) => {
    currentView = view === "map" ? "map" : "photos";
    page.dataset.photoView = currentView;
    listPanel.hidden = currentView !== "photos";
    mapPanel.hidden = currentView !== "map";
    for (const tab of tabs) {
      const selected = tab.dataset.photoView === currentView;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focusTab) tab.focus({ preventScroll: true });
    }
    if (updateUrl) updateViewUrl(currentView);
    if (currentView === "map") {
      const wasReady = root.dataset.mapState === "ready";
      const focus = new URL(window.location.href).searchParams.get("photo");
      if (focus) root.dataset.focus = focus;
      activateMap(root, { focusError: focusTab })
        .then(() => {
          if (focus && wasReady) globalThis.WTAPhotoMap?.focus?.(root, focus);
        })
        .catch(() => {});
    }
  };

  setMapState(root, "idle");
  ensureMapActions(root, () => setView("photos", { updateUrl: true, focusTab: true }));
  for (const tab of tabs) {
    tab.addEventListener("click", () => setView(tab.dataset.photoView, { updateUrl: true }));
    tab.addEventListener("keydown", (event) => {
      const current = tabs.indexOf(tab);
      let target = current;
      if (["ArrowRight", "ArrowDown"].includes(event.key)) target = (current + 1) % tabs.length;
      else if (["ArrowLeft", "ArrowUp"].includes(event.key)) target = (current - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") target = 0;
      else if (event.key === "End") target = tabs.length - 1;
      else return;
      event.preventDefault();
      setView(tabs[target].dataset.photoView, { updateUrl: true, focusTab: true });
    });
  }

  const restore = () => setView(viewFromLocation(), { updateUrl: false });
  window.addEventListener("popstate", restore);
  window.addEventListener("hashchange", restore);
  setView(viewFromLocation(), { updateUrl: false });
}

function setupPhotoDetailMap(root) {
  const load = root.querySelector("[data-map-load]");
  if (!load) return;
  ensureMapActions(root);
  setMapState(root, "idle");
  load.addEventListener("click", () => activateMap(root, { focusError: true, focusReady: true }).catch(() => {}));
}

function setupMapInteractions() {
  document.querySelectorAll("[data-photo-map-page]").forEach(setupPhotoMapPage);
  document.querySelectorAll("[data-photo-detail-map]").forEach(setupPhotoDetailMap);
}

function setupSafeNavigationMotion() {
  if (prefersReducedMotion()) return;
  document.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link || !isPrimaryActivation(event) || link.target || link.hasAttribute("download")) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
    document.documentElement.classList.add("is-navigating");
  });
  window.addEventListener("pageshow", () => document.documentElement.classList.remove("is-navigating"));
}

function boot() {
  setupCurrentNavigation();
  setupDisclosures();
  setupImageFallbacks();
  setupPageMotion();
  setupOrbitalHero();
  setupMapInteractions();
  setupSafeNavigationMotion();
}

globalThis.WTASiteUI = { activateMap, loadMapAssets };

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
else boot();
