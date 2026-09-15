// Navigation: geocoding (Nominatim), routing (OSRM), guidance, POIs (Overpass), GPX.
import { t, speechLang } from './i18n.js';
import { haversine } from './telemetry.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const OSRM = 'https://router.project-osrm.org';
const OVERPASS = 'https://overpass-api.de/api/interpreter';

// ---------- Geocoding ----------
let lastGeocode = 0;
export async function geocode(query, near, lang) {
  // Nominatim usage policy: max 1 request/second.
  const wait = 1100 - (Date.now() - lastGeocode);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastGeocode = Date.now();
  const params = new URLSearchParams({ format: 'jsonv2', q: query, limit: '8', 'accept-language': lang || 'en', addressdetails: '0' });
  if (near) {
    params.set('viewbox', `${near.lng - 1},${near.lat + 1},${near.lng + 1},${near.lat - 1}`);
    params.set('bounded', '0');
  }
  const res = await fetch(`${NOMINATIM}/search?${params}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const rows = await res.json();
  return rows.map(r => ({
    name: r.name || r.display_name.split(',')[0],
    label: r.display_name,
    lat: +r.lat, lng: +r.lon,
    dist: near ? haversine(near.lat, near.lng, +r.lat, +r.lon) : null,
  }));
}

// ---------- Routing ----------
export async function fetchRoute(from, to, opts = {}) {
  const exclude = [];
  if (opts.avoidTolls) exclude.push('toll');
  if (opts.avoidMotorways) exclude.push('motorway');
  if (opts.avoidFerries) exclude.push('ferry');
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
  const base = `${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true&annotations=false`;
  let url = base + (exclude.length ? `&exclude=${exclude.join(',')}` : '');
  let res = await fetch(url);
  let data = res.ok ? await res.json() : null;
  if ((!data || data.code !== 'Ok') && exclude.length) {
    // The public demo server may reject some exclude combinations; retry without them.
    res = await fetch(base);
    data = res.ok ? await res.json() : null;
    if (data && data.code === 'Ok') data.excludeIgnored = true;
  }
  if (!data || data.code !== 'Ok' || !data.routes?.length) throw new Error('route');
  return buildRoute(data.routes[0], to, data.excludeIgnored);
}

function buildRoute(r, dest, excludeIgnored) {
  const geometry = r.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  const cum = new Array(geometry.length);
  cum[0] = 0;
  for (let i = 1; i < geometry.length; i++) {
    cum[i] = cum[i - 1] + haversine(geometry[i - 1][0], geometry[i - 1][1], geometry[i][0], geometry[i][1]);
  }
  const steps = [];
  let at = 0;
  for (const leg of r.legs) {
    for (const s of leg.steps) {
      const m = s.maneuver;
      steps.push({
        at,                                  // distance along route where the maneuver happens
        lat: m.location[1], lng: m.location[0],
        type: m.type, modifier: m.modifier, exit: m.exit,
        name: s.name || '', ref: s.ref || '',
        key: maneuverKey(m),
        announcedFar: false, announcedNear: false,
      });
      at += s.distance;
    }
  }
  return { geometry, cum, total: cum[cum.length - 1] || r.distance, duration: r.duration, steps, dest, excludeIgnored };
}

function maneuverKey(m) {
  const mod = m.modifier || 'straight';
  const side = mod.includes('left') ? 'left' : mod.includes('right') ? 'right' : null;
  switch (m.type) {
    case 'depart': return 'depart';
    case 'arrive': return 'arrive';
    case 'merge': return 'merge';
    case 'on ramp': return 'on_ramp';
    case 'off ramp': return 'off_ramp';
    case 'fork': return side ? `fork_${side}` : 'straight';
    case 'end of road': return side ? `end_of_road_${side}` : 'straight';
    case 'roundabout': case 'rotary': case 'roundabout turn': return m.exit ? 'roundabout' : 'roundabout_plain';
    default:
      if (mod === 'uturn') return 'uturn';
      if (mod === 'straight') return 'straight';
      return `turn_${mod.replace(' ', '_')}`;
  }
}

export function instructionText(step, withRoad = true) {
  let s = t(step.key, { n: step.exit });
  const road = step.ref ? (step.name ? `${step.ref} ${step.name}` : step.ref) : step.name;
  if (withRoad && road && step.key !== 'arrive' && step.key !== 'depart') s += ' ' + t('onto', { r: road });
  return s;
}

// Icon glyph for a maneuver key (SVG markup).
export function maneuverIcon(key) {
  const arrow = (rot) => `<svg viewBox="0 0 24 24" style="transform:rotate(${rot}deg)"><path d="M12 21V5M12 5l-6 6M12 5l6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const bent = (mirror) => `<svg viewBox="0 0 24 24" style="transform:scaleX(${mirror ? -1 : 1})"><path d="M8 21V11a4 4 0 0 1 4-4h7M15 3l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  switch (key) {
    case 'turn_left': case 'end_of_road_left': return bent(true);
    case 'turn_right': case 'end_of_road_right': return bent(false);
    case 'turn_slight_left': case 'fork_left': return arrow(-35);
    case 'turn_slight_right': case 'fork_right': case 'merge': case 'on_ramp': case 'off_ramp': return arrow(35);
    case 'turn_sharp_left': return arrow(-120);
    case 'turn_sharp_right': return arrow(120);
    case 'uturn': return `<svg viewBox="0 0 24 24"><path d="M16 21V8a4 4 0 0 0-8 0v5M5 10l3 3 3-3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case 'roundabout': case 'roundabout_plain': return `<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="5" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M12 8V2M12 2l-3 3M12 2l3 3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case 'arrive': return `<svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    default: return arrow(0);
  }
}

// ---------- Guidance ----------
export class Guidance {
  constructor(route, opts = {}) {
    this.route = route;
    this.idx = 0;             // last matched segment index
    this.progress = 0;        // m along route
    this.offRouteCount = 0;
    this.arrived = false;
    this.speak = opts.speak || (() => {});
    this.onReroute = opts.onReroute || (() => {});
    this.onArrive = opts.onArrive || (() => {});
    this.formatDist = opts.formatDist || (m => `${Math.round(m)} m`);
    // Depart announcement: first real maneuver
    const first = route.steps.find(s => s.key !== 'depart');
    if (first) this.speak(t('inDistance', { d: this.formatDist(first.at), i: instructionText(first) }));
  }

  // Returns { next, distToNext, remaining, eta, offRoute }
  update(lat, lng, speed) {
    const g = this.route.geometry;
    if (g.length < 2) return null;
    // Search near last index first, widen if needed
    const best = this._nearest(lat, lng, Math.max(0, this.idx - 30), Math.min(g.length - 1, this.idx + 60));
    let match = best;
    if (best.dist > 80) {
      const full = this._nearest(lat, lng, 0, g.length - 1);
      if (full.dist < best.dist) match = full;
    }
    // Do not let progress jump backwards by a lot (loops); accept small regressions
    if (match.progress >= this.progress - 40 || match.dist < 25) {
      this.idx = match.idx;
      this.progress = Math.max(0, match.progress);
    }
    const offRoute = match.dist > 60;
    this.offRouteCount = offRoute ? this.offRouteCount + 1 : 0;
    if (this.offRouteCount >= 4 && !this.arrived) { this.offRouteCount = 0; this.onReroute(); }

    const remaining = Math.max(0, this.route.total - this.progress);
    const steps = this.route.steps;
    let next = null, after = null;
    for (const s of steps) {
      if (s.key === 'depart') continue;
      if (!next) { if (s.at > this.progress - 15) next = s; }
      else if (s.at > next.at) { after = s; break; }
    }
    const distToNext = next ? Math.max(0, next.at - this.progress) : 0;

    if (next && !offRoute) {
      const v = Math.max(speed || 0, 5);
      const farM = Math.min(1200, Math.max(250, v * 18)); // ~18 s ahead
      if (!next.announcedFar && distToNext <= farM && distToNext > 90) {
        next.announcedFar = true;
        this.speak(t('inDistance', { d: this.formatDist(distToNext), i: instructionText(next) }));
      }
      if (!next.announcedNear && distToNext <= Math.max(40, v * 3)) {
        next.announcedNear = true; next.announcedFar = true;
        this.speak(instructionText(next, false));
      }
    }
    if (!this.arrived && remaining < 30 && match.dist < 60) {
      this.arrived = true;
      this.speak(t('arrived'));
      this.onArrive();
    }
    const avgV = this.route.duration > 0 ? this.route.total / this.route.duration : 15;
    const etaSec = remaining / Math.max(avgV, 3);
    return { next, after, distToNext, remaining, etaSec, offRoute, snapped: match.snapped };
  }

  _nearest(lat, lng, from, to) {
    const g = this.route.geometry, cum = this.route.cum;
    let best = { dist: Infinity, idx: from, progress: 0, snapped: null };
    const cosLat = Math.cos(lat * Math.PI / 180);
    for (let i = from; i < to; i++) {
      const [aLat, aLng] = g[i], [bLat, bLng] = g[i + 1];
      // Equirectangular projection in metres, local
      const ax = (aLng - lng) * cosLat * 111320, ay = (aLat - lat) * 111320;
      const bx = (bLng - lng) * cosLat * 111320, by = (bLat - lat) * 111320;
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let u = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
      u = Math.max(0, Math.min(1, u));
      const px = ax + u * dx, py = ay + u * dy;
      const d = Math.hypot(px, py);
      if (d < best.dist) {
        best = { dist: d, idx: i, progress: cum[i] + u * (cum[i + 1] - cum[i]), snapped: [aLat + u * (bLat - aLat), aLng + u * (bLng - aLng)] };
      }
    }
    return best;
  }
}

// ---------- Voice ----------
export function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = speechLang();
    u.rate = 1.0;
    window.speechSynthesis.speak(u);
  } catch { /* ignore */ }
}

// ---------- POIs ----------
const POI_QUERIES = {
  fuel: '["amenity"="fuel"]',
  restaurants: '["amenity"~"^(restaurant|fast_food|cafe)$"]',
  hotels: '["tourism"~"^(hotel|motel|guest_house|hostel)$"]',
  parking: '["amenity"~"^(motorcycle_parking|parking)$"]',
};
export async function nearbyPois(kind, near, radius = 8000) {
  const sel = POI_QUERIES[kind];
  if (!sel) return [];
  const q = `[out:json][timeout:20];(node${sel}(around:${radius},${near.lat},${near.lng});way${sel}(around:${radius},${near.lat},${near.lng}););out center 40;`;
  const res = await fetch(OVERPASS, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  if (!res.ok) throw new Error(`overpass ${res.status}`);
  const data = await res.json();
  return data.elements.map(e => {
    const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon;
    const tags = e.tags || {};
    return { name: tags.name || tags.brand || tags.operator || kind, lat, lng, dist: haversine(near.lat, near.lng, lat, lng), kind };
  }).filter(p => p.lat != null).sort((a, b) => a.dist - b.dist).slice(0, 25);
}

// ---------- GPX ----------
export function parseGpx(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('gpx');
  let pts = [...doc.querySelectorAll('trkpt')];
  if (!pts.length) pts = [...doc.querySelectorAll('rtept')];
  if (!pts.length) pts = [...doc.querySelectorAll('wpt')];
  const name = doc.querySelector('trk > name, rte > name, metadata > name')?.textContent || 'GPX';
  return { name, points: pts.map(p => [+p.getAttribute('lat'), +p.getAttribute('lon')]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1])) };
}

export function sessionToGpx(s) {
  const esc = v => String(v).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  const name = `Ride ${new Date(s.startTime).toISOString().slice(0, 16).replace('T', ' ')}`;
  const pts = s.track.map(([t, lat, lng, speed, lean, alt]) =>
    `      <trkpt lat="${lat}" lon="${lng}">${alt != null ? `<ele>${alt}</ele>` : ''}<time>${new Date(t).toISOString()}</time><extensions><speed>${speed}</speed><lean>${lean}</lean></extensions></trkpt>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="MOTO-NG" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(name)}</name><time>${new Date(s.startTime).toISOString()}</time></metadata>
  <trk><name>${esc(name)}</name>
    <desc>distance=${Math.round(s.distance)}m maxSpeed=${(s.maxSpeed * 3.6).toFixed(1)}km/h avgSpeed=${(s.avgSpeed * 3.6).toFixed(1)}km/h maxAccel=${s.maxAccel.toFixed(2)} maxBrake=${s.maxBrake.toFixed(2)} leanL=${Math.round(s.maxLeanL)} leanR=${Math.round(s.maxLeanR)}</desc>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>`;
}
