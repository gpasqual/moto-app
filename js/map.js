// Leaflet map: position arrow, accuracy ring, session track, navigation route.
/* global L */

// OpenStreetMap standard tiles (no API key). "dark" reuses them with a CSS invert filter on the tile pane.
const OSM = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

export function createMap(container, opts = {}) {
  const map = L.map(container, {
    zoomControl: false, attributionControl: true,
    center: [45.4642, 9.19], zoom: 15,
    inertia: true, tap: false,
  });
  map.attributionControl.setPrefix('');

  L.tileLayer(OSM.url, { attribution: OSM.attribution, maxZoom: 19, crossOrigin: true }).addTo(map);
  function setStyle(style) {
    container.classList.toggle('map-dark', style === 'dark');
  }
  setStyle(opts.style || 'light');

  const posIcon = L.divIcon({ className: 'pos-marker', html: '<div class="pos-glow"></div><div class="pos-arrow"></div>', iconSize: [44, 44], iconAnchor: [22, 22] });
  const posMarker = L.marker([0, 0], { icon: posIcon, interactive: false, zIndexOffset: 1000 });
  const accCircle = L.circle([0, 0], { radius: 0, color: 'var(--accent)', weight: 1, opacity: 0.4, fillOpacity: 0.08, interactive: false });
  const track = L.polyline([], { color: '#ff7b1c', weight: 4, opacity: 0.85, lineJoin: 'round' }).addTo(map);
  const route = L.polyline([], { color: '#2f7cff', weight: 6, opacity: 0.8, lineJoin: 'round' }).addTo(map);
  const routeCasing = L.polyline([], { color: '#0b2a5e', weight: 10, opacity: 0.6, lineJoin: 'round' }).addTo(map);
  routeCasing.bringToBack();
  let destMarker = null;
  const poiLayer = L.layerGroup().addTo(map);

  let follow = opts.follow !== false;
  let hasFix = false;
  let lastLatLng = null;
  const onFollowChange = opts.onFollowChange || (() => {});

  // Dragging the map means the rider wants to look around: stop following until the locate button is tapped.
  map.on('dragstart', () => { if (follow) { follow = false; onFollowChange(false); } });

  function setPosition(lat, lng, heading, accuracy) {
    lastLatLng = [lat, lng];
    if (!hasFix) {
      hasFix = true;
      posMarker.addTo(map); accCircle.addTo(map);
      map.setView([lat, lng], 16, { animate: false });
    }
    posMarker.setLatLng([lat, lng]);
    const arrow = posMarker.getElement()?.querySelector('.pos-arrow');
    if (arrow) arrow.style.transform = `rotate(${heading || 0}deg)`;
    accCircle.setLatLng([lat, lng]);
    accCircle.setRadius(accuracy || 0);
    if (follow) map.panTo([lat, lng], { animate: true, duration: 0.5, easeLinearity: 0.6, noMoveStart: true });
  }

  return {
    map,
    setStyle,
    setPosition,
    setFollow(v) { follow = v; if (v && lastLatLng) map.setView(lastLatLng, Math.max(map.getZoom(), 15)); onFollowChange(follow); },
    get follow() { return follow; },
    recenter() { this.setFollow(true); },
    addTrackPoint(lat, lng) { track.addLatLng([lat, lng]); },
    setTrack(points) { track.setLatLngs(points); },
    clearTrack() { track.setLatLngs([]); },
    setRoute(latlngs, dest) {
      route.setLatLngs(latlngs); routeCasing.setLatLngs(latlngs);
      if (destMarker) { map.removeLayer(destMarker); destMarker = null; }
      if (dest) {
        destMarker = L.marker([dest.lat, dest.lng], { icon: L.divIcon({ className: 'dest-marker', html: '<div class="dest-pin"></div>', iconSize: [26, 34], iconAnchor: [13, 34] }), interactive: false }).addTo(map);
      }
    },
    clearRoute() { route.setLatLngs([]); routeCasing.setLatLngs([]); if (destMarker) { map.removeLayer(destMarker); destMarker = null; } },
    fitRoute() { const b = route.getBounds(); if (b.isValid()) { follow = false; onFollowChange(false); map.fitBounds(b, { padding: [30, 30] }); } },
    fitTrack() { const b = track.getBounds(); if (b.isValid()) map.fitBounds(b, { padding: [24, 24] }); },
    setPois(list, onPick) {
      poiLayer.clearLayers();
      for (const p of list) {
        const m = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'poi-marker', html: `<div class="poi-dot">${p.glyph || '•'}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) });
        m.on('click', () => onPick && onPick(p));
        m.addTo(poiLayer);
      }
    },
    clearPois() { poiLayer.clearLayers(); },
    invalidate() { setTimeout(() => map.invalidateSize(), 50); },
    get hasFix() { return hasFix; },
  };
}
