import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";

const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" rel="noreferrer">OpenStreetMap contributors</a>';

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function precisionLabel(point) {
  const labels = { city: "城市级 · 约 10 km", approximate: "附近 · 约 1 km", exact: "精确 · 约 1 m" };
  return labels[point.location?.precision] || "位置范围受保护";
}

function markerIcon(point, count = 1) {
  const label = count > 1 ? `${count} 张` : point.title;
  return L.divIcon({
    className: "photo-map-marker-wrap",
    html: `<span class="photo-map-marker" title="${String(label).replaceAll('"', "&quot;")}"><span>${count > 1 ? count : "•"}</span></span>`,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
    popupAnchor: [0, -24],
  });
}

function popupHtml(point) {
  const escape = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  return `<article class="photo-map-popup"><img src="${escape(point.thumbUrl)}" alt="" loading="lazy"><div><strong>${escape(point.title || point.id)}</strong><span>${escape(point.location?.label || "")}</span><span>${escape(precisionLabel(point))}</span><a href="${escape(point.href)}">打开照片</a></div></article>`;
}

function setStatus(root, message, isError = false) {
  const status = root.querySelector("[data-map-status]");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("is-error", isError);
  status.hidden = !message;
}

function focusPoint(map, point, marker) {
  const zoom = point.location.precision === "exact" ? 15 : point.location.precision === "approximate" ? 12 : 10;
  if (reducedMotion()) map.setView([point.location.latitude, point.location.longitude], zoom);
  else map.flyTo([point.location.latitude, point.location.longitude], zoom, { duration: 0.35 });
  marker.openPopup();
}

function accuracyCircle(map, point) {
  const colors = { city: "#d96f57", approximate: "#d6ad54", exact: "#96aaa4" };
  const circle = L.circle([point.location.latitude, point.location.longitude], {
    radius: point.location.accuracyMeters,
    color: colors[point.location.precision] || colors.city,
    fillColor: colors[point.location.precision] || colors.city,
    fillOpacity: 0.1,
    opacity: 0.7,
    weight: 1,
    interactive: false,
  });
  circle.addTo(map);
}

async function mount(root) {
  if (root.dataset.mapMounted === "true") return root._wtaMap;
  root.dataset.mapMounted = "true";
  const canvas = root.querySelector("[data-map-canvas]");
  if (!canvas) return undefined;
  setStatus(root, "正在读取照片地图……");
  try {
    const response = await fetch(root.dataset.endpoint || "/api/images/map", { cache: "no-store", headers: { Accept: "application/json" } });
    const payload = await response.json();
    if (!response.ok || !payload?.ok) throw new Error("map_api");
    const points = Array.isArray(payload.data) ? payload.data : [];
    const map = L.map(canvas, { zoomControl: true, scrollWheelZoom: false, attributionControl: true, zoomAnimation: !reducedMotion() });
    L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19, crossOrigin: true }).addTo(map);
    const cluster = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 46, animate: !reducedMotion() });
    const markers = new Map();
    const bounds = [];
    for (const point of points) {
      if (!point?.location || !Number.isFinite(point.location.latitude) || !Number.isFinite(point.location.longitude)) continue;
      accuracyCircle(map, point);
      const marker = L.marker([point.location.latitude, point.location.longitude], { icon: markerIcon(point), title: point.title || point.id, alt: point.title || point.id, keyboard: true });
      marker.bindPopup(popupHtml(point), { maxWidth: 300, closeButton: true });
      marker.on("keydown", (event) => {
        if (event.originalEvent.key === "Enter" || event.originalEvent.key === " ") marker.openPopup();
      });
      cluster.addLayer(marker);
      markers.set(`${point.folder}/${point.id}`, { marker, point });
      bounds.push([point.location.latitude, point.location.longitude]);
    }
    map.addLayer(cluster);
    if (bounds.length) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 12, animate: !reducedMotion() });
    else map.setView([20, 0], 2);
    const focus = root.dataset.focus;
    if (focus && markers.has(focus)) {
      const target = markers.get(focus);
      cluster.zoomToShowLayer(target.marker, () => focusPoint(map, target.point, target.marker));
    }
    root.querySelector("[data-map-reset]")?.addEventListener("click", () => {
      if (bounds.length) map.fitBounds(bounds, { padding: [28, 28], maxZoom: 12, animate: !reducedMotion() });
      else map.setView([20, 0], 2);
    });
    root.querySelector("[data-map-retry]")?.remove();
    setStatus(root, `${points.length} 张照片已加载。地图仅使用受保护的位置范围。`);
    root._wtaMap = map;
    return map;
  } catch {
    root.dataset.mapMounted = "false";
    setStatus(root, "地图暂时无法加载；照片列表仍可正常浏览。", true);
    if (!root.querySelector("[data-map-retry]")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button secondary";
      button.dataset.mapRetry = "true";
      button.textContent = "重试地图";
      button.addEventListener("click", () => mount(root));
      root.querySelector("[data-map-status]")?.insertAdjacentElement("afterend", button);
    }
    return undefined;
  }
}

globalThis.WTAPhotoMap = { mount };
