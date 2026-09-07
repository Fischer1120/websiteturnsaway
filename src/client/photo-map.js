import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noreferrer">OpenStreetMap contributors</a>';
const TILE_READY_TIMEOUT = 12_000;

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function mapError(kind, message) {
  return Object.assign(new Error(message), { kind });
}

function safeInternalPath(value, fallback) {
  const path = String(value ?? "");
  return path.startsWith("/") && !path.startsWith("//") ? path : fallback;
}

function precisionLabel(point) {
  const labels = { city: "城市级 · 约 10 km", approximate: "附近 · 约 1 km", exact: "精确 · 约 1 m" };
  return labels[point.location?.precision] || "位置范围受保护";
}

function markerIcon(point) {
  const label = point.title || point.id || "照片位置";
  return L.divIcon({
    className: "photo-map-marker-wrap",
    html: `<span class="photo-map-marker" title="${escapeHtml(label)}"><span aria-hidden="true">•</span></span>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -24],
  });
}

function popupHtml(point) {
  const fallback = "/assets/media/photo-placeholder.svg";
  const thumbUrl = safeInternalPath(point.thumbUrl, fallback);
  const href = safeInternalPath(point.href, "/images");
  return `<article class="photo-map-popup"><img src="${escapeHtml(thumbUrl)}" alt="" loading="lazy" data-fallback-src="${fallback}"><div><strong>${escapeHtml(point.title || point.id)}</strong><span>${escapeHtml(point.location?.label || "")}</span><span>${escapeHtml(precisionLabel(point))}</span><a href="${escapeHtml(href)}">打开照片</a></div></article>`;
}

function setStatus(root, message, isError = false) {
  const status = root.querySelector("[data-map-status]");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-error", isError);
  status.classList.toggle("error", isError);
  status.hidden = !message;
}

function focusPoint(map, point, marker) {
  const zoom = point.location.precision === "exact" ? 15 : point.location.precision === "approximate" ? 12 : 10;
  if (reducedMotion()) map.setView([point.location.latitude, point.location.longitude], zoom);
  else map.flyTo([point.location.latitude, point.location.longitude], zoom, { duration: 0.32 });
  marker.openPopup();
}

function accuracyCircle(map, point) {
  const colors = { city: "#F06D52", approximate: "#79D7E5", exact: "#F5F7FA" };
  const color = colors[point.location.precision] || colors.city;
  const radius = Number.isFinite(point.location.accuracyMeters) && point.location.accuracyMeters > 0
    ? point.location.accuracyMeters
    : 10_000;
  L.circle([point.location.latitude, point.location.longitude], {
    radius,
    color,
    fillColor: color,
    fillOpacity: 0.08,
    opacity: 0.7,
    weight: 1,
    interactive: false,
  }).addTo(map);
}

function waitForFirstTile(layer) {
  return new Promise((resolve, reject) => {
    let timer;
    const cleanup = () => {
      window.clearTimeout(timer);
      layer.off("tileload", loaded);
      layer.off("tileerror", failed);
    };
    const loaded = () => {
      cleanup();
      resolve();
    };
    const failed = () => {
      cleanup();
      reject(mapError("tile", "map_tile_failed"));
    };
    layer.once("tileload", loaded);
    layer.once("tileerror", failed);
    timer = window.setTimeout(() => {
      cleanup();
      reject(mapError("tile", "map_tile_timeout"));
    }, TILE_READY_TIMEOUT);
  });
}

function pointKey(point) {
  return `${point.folder}/${point.id}`;
}

function pointControls(root, key) {
  return Array.from(root.querySelectorAll("[data-map-point], [data-map-key], [data-photo-map-key]")).filter(
    (control) => (control.dataset.mapPoint || control.dataset.mapKey || control.dataset.photoMapKey) === key,
  );
}

function setSelectedPoint(root, key = "", markers = root._wtaMarkers) {
  for (const control of root.querySelectorAll("[data-map-point], [data-map-key], [data-photo-map-key]")) {
    const controlKey = control.dataset.mapPoint || control.dataset.mapKey || control.dataset.photoMapKey;
    control.setAttribute("aria-pressed", String(Boolean(key) && controlKey === key));
  }
  if (!markers) return;
  for (const [markerKey, target] of markers) {
    const pressed = String(Boolean(key) && markerKey === key);
    const element = target.marker.getElement?.();
    element?.setAttribute("aria-pressed", pressed);
    element?.querySelector(".photo-map-marker")?.setAttribute("aria-pressed", pressed);
  }
}

function bindPointControls(root, map, cluster, markers) {
  for (const [key, target] of markers) {
    const select = () => {
      setSelectedPoint(root, key, markers);
      cluster.zoomToShowLayer(target.marker, () => focusPoint(map, target.point, target.marker));
    };
    target.marker.on("popupopen", () => setSelectedPoint(root, key, markers));
    for (const control of pointControls(root, key)) {
      control.setAttribute("aria-pressed", "false");
      control.addEventListener("click", select);
    }
  }
}

function fitOverview(map, bounds) {
  if (bounds.length) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 12, animate: !reducedMotion() });
  else map.setView([20, 0], 2, { animate: !reducedMotion() });
}

async function mount(root) {
  if (root.dataset.mapMounted === "true" && root._wtaMap) return root._wtaMap;
  root.dataset.mapMounted = "true";
  const canvas = root.querySelector("[data-map-canvas]");
  if (!canvas) {
    root.dataset.mapMounted = "false";
    throw mapError("resource", "map_canvas_missing");
  }

  let map;
  try {
    setStatus(root, "正在读取受保护的照片位置……");
    let response;
    try {
      response = await fetch(root.dataset.endpoint || "/api/images/map", {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
    } catch {
      throw mapError("api", "map_api_unreachable");
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw mapError("api", "map_api_invalid_json");
    }
    if (!response.ok || !payload?.ok) throw mapError("api", "map_api_failed");

    const points = Array.isArray(payload.data) ? payload.data : [];
    map = L.map(canvas, {
      zoomControl: true,
      scrollWheelZoom: false,
      attributionControl: true,
      zoomAnimation: !reducedMotion(),
    });
    const tileLayer = L.tileLayer(TILE_URL, {
      attribution: ATTRIBUTION,
      maxZoom: 19,
      crossOrigin: true,
    });
    const tilesReady = waitForFirstTile(tileLayer);
    tileLayer.addTo(map);

    const cluster = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 46,
      animate: !reducedMotion(),
    });
    const markers = new Map();
    const bounds = [];

    for (const point of points) {
      if (
        !point?.location
        || !Number.isFinite(point.location.latitude)
        || !Number.isFinite(point.location.longitude)
        || Math.abs(point.location.latitude) > 90
        || Math.abs(point.location.longitude) > 180
      ) continue;
      accuracyCircle(map, point);
      const marker = L.marker([point.location.latitude, point.location.longitude], {
        icon: markerIcon(point),
        title: point.title || point.id,
        alt: point.title || point.id,
        keyboard: true,
      });
      marker.bindPopup(popupHtml(point), { maxWidth: 300, closeButton: true });
      marker.on("keydown", (event) => {
        const originalEvent = event.originalEvent;
        if (originalEvent && (originalEvent.key === "Enter" || originalEvent.key === " ")) {
          originalEvent.preventDefault();
          marker.openPopup();
        }
      });
      cluster.addLayer(marker);
      markers.set(pointKey(point), { marker, point });
      bounds.push([point.location.latitude, point.location.longitude]);
    }

    map.addLayer(cluster);
    fitOverview(map, bounds);
    map.invalidateSize({ animate: false });
    bindPointControls(root, map, cluster, markers);

    const reset = root.querySelector("[data-map-reset]");
    if (reset) {
      if (root._wtaResetHandler) reset.removeEventListener("click", root._wtaResetHandler);
      root._wtaResetHandler = () => {
        setSelectedPoint(root, "", markers);
        fitOverview(map, bounds);
      };
      reset.addEventListener("click", root._wtaResetHandler);
    }

    const focus = root.dataset.focus;
    if (focus && markers.has(focus)) {
      const target = markers.get(focus);
      setSelectedPoint(root, focus, markers);
      cluster.zoomToShowLayer(target.marker, () => focusPoint(map, target.point, target.marker));
    }

    await tilesReady;
    tileLayer.on("tileerror", () => {
      if (root.dataset.mapState !== "ready") return;
      root.dataset.mapMounted = "false";
      root._wtaMap = undefined;
      map.remove();
      root.dispatchEvent(new CustomEvent("wta:map-error", { detail: { kind: "tile" } }));
    });

    setStatus(root, `${markers.size} 张照片已加载。地图仅使用受保护的位置范围。`);
    root.dataset.mapReadyMessage = `${markers.size} 张照片已加载。地图仅使用受保护的位置范围。`;
    root._wtaMap = map;
    root._wtaMarkers = markers;
    return map;
  } catch (error) {
    if (map) map.remove();
    root.dataset.mapMounted = "false";
    root._wtaMap = undefined;
    if (error?.kind) throw error;
    throw mapError("resource", "map_mount_failed");
  }
}

function resize(root) {
  const map = root?._wtaMap;
  if (!map) return;
  requestAnimationFrame(() => map.invalidateSize({ animate: false }));
}

function focus(root, key) {
  const map = root?._wtaMap;
  const target = root?._wtaMarkers?.get(key);
  if (!map || !target) return false;
  setSelectedPoint(root, key);
  focusPoint(map, target.point, target.marker);
  return true;
}

function destroy(root) {
  root?._wtaMap?.remove();
  if (root) {
    root.dataset.mapMounted = "false";
    root._wtaMap = undefined;
    root._wtaMarkers = undefined;
  }
}

globalThis.WTAPhotoMap = { destroy, focus, mount, resize };
