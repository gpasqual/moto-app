import { t, setLang, getLang, applyDom, aboutContent } from './i18n.js';
import { loadSettings, saveSettings, loadFavorites, saveFavorites, loadCalibration, saveCalibration, saveSession, deleteSession, clearSessions, listSessions, getSession, getImu } from './storage.js';
import { LeanEstimator, leanInFrame } from './lean.js';
import { Session, RideSimulator, haversine } from './telemetry.js';
import { createGauge } from './gauge.js';
import { createChart, lowerBound } from './chart.js';
import { createMap } from './map.js';
import { geocode, fetchRoute, Guidance, instructionText, maneuverIcon, speak, nearbyPois, parseGpx, sessionToGpx } from './nav.js';

export const VERSION = '1.4.0';
const APP_NAME = 'MOTO-NG';
const APP_URL = 'https://gpasqual.github.io/moto-app/';
const REPO_URL = 'https://github.com/gpasqual/moto-app';
const $ = id => document.getElementById(id);

// ---------------- State ----------------
const S = {
  settings: loadSettings(),
  stats: new Session(),      // always-live stats; Play/Stop bookends what gets saved
  recording: false,
  lean: new LeanEstimator(),
  map: null, gauge: null,
  lastFix: null, heading: 0,
  gpsWatch: null,
  motionAttached: false, motionGranted: false,
  sim: null,
  route: null,               // route previewed in the navigator
  routeName: '',
  guidance: null,            // active turn-by-turn
  wakeLock: null,
  selectMode: false, selected: new Set(),
  calBefore: null,
  detailMap: null, detailSession: null,
};

// ---------------- Units / formatting ----------------
const imperial = () => S.settings.units === 'imperial';
const fmtSpeed = ms => Math.round(ms * (imperial() ? 2.23694 : 3.6));
const fmtSpeed1 = ms => (ms * (imperial() ? 2.23694 : 3.6)).toFixed(1);
const speedUnit = () => t(imperial() ? 'mph' : 'kmh');
function fmtDist(m, short = false) {
  if (imperial()) {
    const ft = m * 3.28084;
    if (ft < 1000) return `${Math.round(ft / 10) * 10} ${t('ft')}`;
    const mi = m / 1609.344;
    return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} ${t('mi')}`;
  }
  if (m < 1000) return `${short ? Math.round(m / 10) * 10 : Math.round(m)} ${t('m')}`;
  const km = m / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} ${t('km')}`;
}
function fmtDistVoice(m) {
  // Rounded for speech: 50 m steps below 1 km
  if (imperial()) { const ft = m * 3.28084; if (ft < 1000) return `${Math.round(ft / 50) * 50} feet`; const mi = m / 1609.344; return `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} miles`; }
  if (m < 1000) return `${Math.max(50, Math.round(m / 50) * 50)} ${getLang() === 'it' ? 'metri' : 'meters'}`;
  const km = m / 1000; return `${km < 10 ? km.toFixed(1).replace('.0', '') : Math.round(km)} ${getLang() === 'it' ? 'chilometri' : 'kilometers'}`;
}
const fmtSmallDist = m => imperial() ? `${(m * 3.28084).toFixed(1)}` : m.toFixed(1);
function fmtElapsed(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}
const fmtClock = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
function fmtDuration(sec) {
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} min` : t('hmm', { h: Math.floor(m / 60), m: String(m % 60).padStart(2, '0') });
}
function fmtDate(ts) {
  return new Date(ts).toLocaleString(getLang() === 'it' ? 'it-IT' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

let toastTimer = null;
function toast(msg, ms = 2600) {
  const el = $('toast'); el.textContent = msg; el.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

// ---------------- Settings application ----------------
function applySettings(prev = {}) {
  const s = S.settings;
  setLang(s.lang);
  applyDom();
  document.documentElement.dataset.accent = s.accent;
  document.querySelectorAll('.u-speed').forEach(e => e.textContent = speedUnit());
  document.querySelectorAll('.u-dist').forEach(e => e.textContent = t(imperial() ? 'ft' : 'm'));
  $('speedUnit').textContent = speedUnit(); $('pillUnit').textContent = speedUnit();
  $('mountHint').textContent = t(s.mount === 'bars' ? 'posHint' : 'posHintFrame');
  S.lean.setMount(s.mount); S.lean.setInvert(s.invertLean);
  if (S.map) {
    if (prev.mapStyle !== s.mapStyle) S.map.setStyle(s.mapStyle);
    $('mapPanel').classList.toggle('dark', s.mapStyle === 'dark');
    if (prev.follow !== s.follow) S.map.setFollow(s.follow);
  }
  if (prev.demo !== s.demo) setDemo(s.demo);
  if (prev.keepAwake !== s.keepAwake) updateWakeLock();
  $('appVersion').textContent = VERSION;
  // Reflect into settings controls
  $('setAccent').value = s.accent; $('setMount').value = s.mount; $('setInvert').checked = s.invertLean; $('setAutoCal').checked = s.autoCal;
  $('setLang').value = s.lang; $('setUnits').value = s.units; $('setVoice').checked = s.voice; $('setMapStyle').value = s.mapStyle;
  $('setFollow').checked = s.follow; $('setAwake').checked = s.keepAwake; $('setDemo').checked = s.demo;
  $('optTolls').checked = s.avoidTolls; $('optMotorways').checked = s.avoidMotorways; $('optFerries').checked = s.avoidFerries;
  renderStats();
}
function updateSetting(key, value) {
  const prev = { ...S.settings };
  S.settings[key] = value;
  saveSettings(S.settings);
  applySettings(prev);
}

// ---------------- GPS ----------------
function startGps() {
  if (S.gpsWatch != null || !('geolocation' in navigator)) return;
  $('gpsStatus').textContent = t('gpsWaiting'); $('gpsStatus').classList.add('warn');
  S.gpsWatch = navigator.geolocation.watchPosition(pos => {
    const c = pos.coords;
    onFix({ t: pos.timestamp || Date.now(), lat: c.latitude, lng: c.longitude, speed: c.speed, heading: c.heading, accuracy: c.accuracy, alt: c.altitude });
  }, err => {
    $('gpsStatus').textContent = err.code === 1 ? t('gpsDenied') : t('gpsWaiting');
    $('gpsStatus').classList.add('warn');
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
}
function stopGps() {
  if (S.gpsWatch != null) { navigator.geolocation.clearWatch(S.gpsWatch); S.gpsWatch = null; }
}

function onFix(fix) {
  S.lastFix = fix;
  const moving = fix.speed != null && fix.speed > 1.5;
  if (moving && fix.heading != null && Number.isFinite(fix.heading)) S.heading = fix.heading;
  S.map.setPosition(fix.lat, fix.lng, S.heading, fix.accuracy);
  const gs = $('gpsStatus');
  if (fix.accuracy != null && fix.accuracy > 30) { gs.textContent = t('gpsAcc', { n: Math.round(fix.accuracy) }); gs.classList.add('warn'); }
  else { gs.textContent = ''; gs.classList.remove('warn'); }

  S.stats.addFix(fix);
  if (S.recording) S.map.addTrackPoint(fix.lat, fix.lng);
  if (S.guidance) updateGuidance(fix);
  renderStats();
  updateCompass();
}

function updateCompass() {
  $('compass').querySelector('.compass-dial').style.transform = `rotate(${-S.heading}deg)`;
}

// ---------------- Motion / lean ----------------
function needsMotionPermission() {
  return typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';
}
async function requestMotion(fromGesture) {
  if (S.motionAttached) return true;
  if (needsMotionPermission()) {
    if (!fromGesture) { $('sensorOverlay').classList.remove('hidden'); return false; }
    try {
      const r = await DeviceOrientationEvent.requestPermission();
      if (r !== 'granted') { toast(t('sensorsDenied'), 5000); return false; }
      // Accelerometer/gyro for the analytics time history (separate permission on iOS; optional)
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try { await DeviceMotionEvent.requestPermission(); } catch { /* analytics will fall back to GPS-derived data */ }
      }
    } catch { toast(t('sensorsDenied'), 5000); return false; }
  }
  attachMotion();
  return true;
}
function attachMotion() {
  if (S.motionAttached) return;
  S.motionAttached = true;
  $('sensorOverlay').classList.add('hidden');
  window.addEventListener('deviceorientation', onOrientation, { passive: true });
  window.addEventListener('devicemotion', onDeviceMotion, { passive: true });
}

// ---- Screen orientation: keep the lean reference aligned when the phone is turned portrait <-> landscape
function currentScreenAngle() {
  if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
  if (typeof window.orientation === 'number') return (window.orientation + 360) % 360;
  return 0;
}
let orientTimer = null;
function onScreenRotate() {
  clearTimeout(orientTimer);
  orientTimer = setTimeout(() => {
    if (S.settings.demo) return;
    S.lean.setScreenAngle(currentScreenAngle());
    // Turning the phone in hand sweeps the reading through big angles: drop maxes gained in the last 2 s.
    const snap = maxSnapshots.find(x => performance.now() - x.t >= 2000);
    if (snap) { S.stats.maxLeanL = snap.L; S.stats.maxLeanR = snap.R; paintLeanMax(); }
    S.map.invalidate();
  }, 350);
}
if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', onScreenRotate);
window.addEventListener('orientationchange', onScreenRotate);
const maxSnapshots = []; // newest first, ~3 s of {t, L, R}
setInterval(() => {
  maxSnapshots.unshift({ t: performance.now(), L: S.stats.maxLeanL, R: S.stats.maxLeanR });
  if (maxSnapshots.length > 8) maxSnapshots.length = 8;
}, 500);
function paintLeanMax() {
  $('leanL').textContent = `${Math.round(S.stats.maxLeanL)}°`;
  $('leanR').textContent = `${Math.round(S.stats.maxLeanR)}°`;
}

// ---- Motion logging (accelerometer + gyro projected into bike axes, every event, while recording)
function logMotion(a, w) {
  if (S.recording) S.stats.addMotion(Date.now(), S.stats.currentLean, a, w);
}
function onDeviceMotion(e) {
  if (S.settings.demo || !S.recording || !S.lean.cal) return;
  const { f, r, g0 } = S.lean.cal;
  const dot = (v, u) => v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
  let a = null, w = null;
  const acc = e.acceleration;
  if (acc && acc.x != null) {
    const v = [acc.x, acc.y, acc.z];
    a = [dot(v, f), dot(v, r), -dot(v, g0)]; // long (+fwd), lat (+right), vert (+up) — sign learned per session
  }
  const rr = e.rotationRate;
  if (rr && rr.alpha != null) {
    const v = [rr.beta, rr.gamma, rr.alpha]; // rates about phone x, y, z
    w = [dot(v, f), dot(v, r), -dot(v, g0)]; // roll, pitch, yaw
  }
  logMotion(a, w);
}

let lastLeanPaint = 0;
function onOrientation(e) {
  if (S.settings.demo) return;
  if (e.beta == null || e.gamma == null) return;
  if (!S.motionGranted) {
    S.motionGranted = true;
    if (!S.lean.cal && S.settings.autoCal) { $('btnCal').classList.add('busy'); S.lean.startCalibration(1200); }
  }
  // Compass heading while stationary (iOS only exposes webkitCompassHeading)
  if (e.webkitCompassHeading != null && (!S.lastFix || (S.lastFix.speed || 0) < 1.5)) {
    S.heading = e.webkitCompassHeading; updateCompass();
    S.lastFix && S.map.setPosition(S.lastFix.lat, S.lastFix.lng, S.heading, S.lastFix.accuracy);
  }
  const ang = S.lean.update(e.beta, e.gamma);
  if (ang == null) return;
  applyLean(ang, S.lean.valid);
}
function applyLean(ang, valid = true) {
  if (valid) S.stats.addLean(ang); // implausible angles (phone being handled/turned) never feed the maxes
  // Sensor events arrive at ~60 Hz; repaint at most every 40 ms.
  const now = performance.now();
  if (now - lastLeanPaint < 40) return;
  lastLeanPaint = now;
  S.gauge.setAngle(ang);
  $('leanL').textContent = `${Math.round(S.stats.maxLeanL)}°`;
  $('leanR').textContent = `${Math.round(S.stats.maxLeanR)}°`;
  $('pillLean').textContent = `${Math.round(Math.abs(ang))}°`;
}
async function calibrate() {
  if (S.settings.demo) { toast(t('calibrated')); return; }
  const ok = await requestMotion(true);
  if (!ok) return;
  $('btnCal').classList.add('busy'); $('btnCal').textContent = t('calibrating');
  S.calBefore = S.lean.cal; // remembered so the session maxes can be corrected for the reference shift
  S.lean.startCalibration(1200);
}
// After a re-CAL the old maxes are off by exactly the roll shift between the two references, so shift them back.
// A shift beyond 30° means the phone was moved/turned, not touched up: those maxes were meaningless.
function correctMaxesForRecal(newCal) {
  const old = S.calBefore; S.calBefore = null;
  if (!old || !newCal) return;
  let delta = leanInFrame(old, newCal.g0); // what the old reference read for the new "upright"
  if (S.settings.invertLean) delta = -delta;
  if (Math.abs(delta) > 30) { S.stats.maxLeanL = 0; S.stats.maxLeanR = 0; }
  else {
    S.stats.maxLeanR = Math.max(0, S.stats.maxLeanR - delta);
    S.stats.maxLeanL = Math.max(0, S.stats.maxLeanL + delta);
  }
  paintLeanMax();
}
S.lean.onCalibrated = cal => {
  saveCalibration(cal);
  if (S.calBefore) correctMaxesForRecal(S.lean.cal);
  if ($('btnCal').classList.contains('busy')) {
    $('btnCal').classList.remove('busy'); $('btnCal').textContent = t('cal');
    toast(t('calibrated'));
  }
};

// ---------------- Session ----------------
function startRecording() {
  S.stats = new Session();
  S.recording = true;
  S.map.clearTrack();
  $('btnStart').classList.add('recording');
  $('btnStart').innerHTML = '<svg><use href="#i-stop"/></svg>';
  updateWakeLock();
  renderStats();
}
async function stopRecording() {
  if (!S.recording) return;
  const choice = await ask(t('stopTitle'), [
    { label: t('saveSession'), value: 'save', style: 'primary' },
    { label: t('discard'), value: 'discard', style: 'danger' },
    { label: t('keepRecording'), value: null, style: 'cancel' },
  ]);
  if (!choice) return; // keep recording
  S.recording = false;
  const data = S.stats.finish();
  $('btnStart').classList.remove('recording');
  $('btnStart').innerHTML = '<svg><use href="#i-play"/></svg>';
  updateWakeLock();
  if (choice === 'discard') { toast(t('sessionDiscarded')); return; }
  try { await saveSession(data); toast(t('sessionSaved')); }
  catch (e) { console.error(e); toast(t('saveFailed'), 4000); }
}
async function resetStats() {
  if (!await confirmSheet(t('resetConfirm'), t('yesReset'))) return;
  const wasRec = S.recording;
  S.stats = new Session();
  if (wasRec) S.map.clearTrack();
  renderStats();
  $('leanL').textContent = '0°'; $('leanR').textContent = '0°';
}

function renderStats() {
  const st = S.stats;
  const spd = S.lastFix && S.lastFix.speed != null && S.lastFix.speed > 0 ? S.lastFix.speed : 0;
  $('speedVal').textContent = fmtSpeed(spd);
  $('pillSpeed').textContent = fmtSpeed(spd);
  $('speedMax').textContent = fmtSpeed(st.maxSpeed);
  $('stAvg').textContent = fmtSpeed1(st.avgSpeed);
  $('stAcc').textContent = st.maxAccel.toFixed(1);
  $('stBrake').textContent = st.maxBrake.toFixed(1);
  $('stBrakeDist').textContent = fmtSmallDist(st.brakeDist);
  $('nvTotal').textContent = st.distance > 0 ? fmtDist(st.distance, true) : '--';
}
function renderClock() {
  $('nvTime').textContent = S.recording ? fmtElapsed(S.stats.elapsed) : '--';
}
setInterval(renderClock, 500);

// ---------------- Wake lock ----------------
async function updateWakeLock() {
  const want = S.settings.keepAwake && document.visibilityState === 'visible';
  try {
    if (want && !S.wakeLock && 'wakeLock' in navigator) {
      S.wakeLock = await navigator.wakeLock.request('screen');
      S.wakeLock.addEventListener('release', () => { S.wakeLock = null; });
    } else if (!want && S.wakeLock) { await S.wakeLock.release(); S.wakeLock = null; }
  } catch { S.wakeLock = null; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') updateWakeLock(); });

// ---------------- Demo ----------------
function setDemo(on) {
  if (on) {
    stopGps();
    const c = S.lastFix ? { lat: S.lastFix.lat, lng: S.lastFix.lng } : undefined;
    S.sim = new RideSimulator(c);
    S.sim.onFix = onFix;
    S.sim.onLean = applyLean;
    S.sim.onMotion = logMotion;
    S.sim.start();
    $('sensorOverlay').classList.add('hidden');
    $('gpsStatus').textContent = 'DEMO'; $('gpsStatus').classList.add('warn');
  } else {
    if (S.sim) { S.sim.stop(); S.sim = null; }
    $('gpsStatus').textContent = '';
    startGps();
    if (!S.motionAttached) requestMotion(false);
  }
}

// ---------------- Sheets ----------------
function openSheet(id) { $(id).classList.remove('hidden'); }
function closeSheet(id) { $(id).classList.add('hidden'); }
document.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => closeSheet(el.closest('.sheet').id)));

// In-app action sheet instead of the browser's OK/Cancel dialog. Resolves with the chosen button's value, or null.
// buttons: [{ label, value, style: 'primary' | 'danger' | 'plain' | 'cancel' }]
let dialogResolve = null;
function ask(title, buttons) {
  return new Promise(resolve => {
    dialogResolve = resolve;
    $('toast').classList.add('hidden'); // don't let a toast overlap the choices
    $('dlgTitle').textContent = title;
    const box = $('dlgButtons'); box.innerHTML = '';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = `menu-item ${b.style || 'plain'}`;
      btn.innerHTML = '<span></span>'; btn.firstChild.textContent = b.label;
      btn.addEventListener('click', () => { closeSheet('sheetDialog'); dialogResolve = null; resolve(b.value ?? null); });
      box.appendChild(btn);
    }
    openSheet('sheetDialog');
  });
}
document.querySelector('[data-dialog-cancel]').addEventListener('click', () => { closeSheet('sheetDialog'); if (dialogResolve) { dialogResolve(null); dialogResolve = null; } });
const confirmSheet = async (title, yesLabel) => (await ask(title, [{ label: yesLabel, value: true, style: 'danger' }, { label: t('cancel'), value: null, style: 'cancel' }])) === true;

// ---------------- Navigation ----------------
function speakIf(text) { if (S.settings.voice) speak(text); }

async function routeTo(dest, name) {
  if (!S.lastFix) { toast(t('noGpsForRoute')); return; }
  toast(t('routing'), 8000);
  try {
    const r = await fetchRoute({ lat: S.lastFix.lat, lng: S.lastFix.lng }, dest, routeOptions());
    S.route = r; S.routeName = name || dest.name || '';
    S.map.setRoute(r.geometry, dest);
    $('routeName').textContent = `${t('routeTo')} ${S.routeName}`;
    $('routeStats').textContent = `${fmtDist(r.total)} · ${fmtDuration(r.duration)}`;
    $('routeFoot').classList.remove('hidden');
    $('toast').classList.add('hidden');
    S.map.fitRoute();
  } catch (e) {
    console.error(e); toast(t('routeError'));
  }
}
function routeOptions() {
  return { avoidTolls: S.settings.avoidTolls, avoidMotorways: S.settings.avoidMotorways, avoidFerries: S.settings.avoidFerries };
}
function makeGuidance(route) {
  return new Guidance(route, {
    speak: speakIf, formatDist: fmtDistVoice,
    onReroute: async () => {
      toast(t('rerouting'));
      try {
        const r = await fetchRoute({ lat: S.lastFix.lat, lng: S.lastFix.lng }, route.dest, routeOptions());
        S.route = r; S.map.setRoute(r.geometry, r.dest);
        S.guidance = makeGuidance(r);
      } catch { /* keep guiding on the old route */ }
    },
    onArrive: () => { setTimeout(endNavigation, 4000); },
  });
}
function startNavigation() {
  if (!S.route) return;
  S.guidance = makeGuidance(S.route);
  closeSheet('sheetNav');
  $('navBanner').classList.remove('hidden');
  S.map.setFollow(true);
  updateWakeLock();
  if (S.lastFix) updateGuidance(S.lastFix);
}
async function endNavigation(confirmFirst = false) {
  if (confirmFirst && !await confirmSheet(t('endNavConfirm'), t('yesEnd'))) return;
  S.guidance = null; S.route = null;
  S.map.clearRoute();
  $('navBanner').classList.add('hidden');
  $('routeFoot').classList.add('hidden');
  $('nvEta').textContent = '--:--'; $('nvRemain').textContent = '--';
  try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch { /* ignore */ }
}
function updateGuidance(fix) {
  const g = S.guidance.update(fix.lat, fix.lng, fix.speed || 0);
  if (!g) return;
  const b = $('navBanner');
  b.classList.toggle('offroute', g.offRoute);
  if (g.next) {
    $('nbIcon').innerHTML = maneuverIcon(g.next.key);
    $('nbDist').textContent = fmtDist(g.distToNext, true);
    $('nbInstr').textContent = instructionText(g.next);
    b.classList.toggle('arrive', g.next.key === 'arrive');
  }
  $('nvRemain').textContent = fmtDist(g.remaining, true);
  $('nvEta').textContent = fmtClock(new Date(Date.now() + g.etaSec * 1000));
}

// Search
let searchTimer = null, searchSeq = 0;
function renderResults(list, opts = {}) {
  const box = $('navResults');
  box.innerHTML = '';
  if (opts.title) {
    const h = document.createElement('div'); h.className = 'results-title';
    h.innerHTML = `<span>${opts.title}</span>`;
    if (opts.showOnMap) { const bb = document.createElement('button'); bb.textContent = t('close'); bb.onclick = () => { S.map.clearPois(); box.classList.add('hidden'); $('navEmpty').classList.remove('hidden'); }; h.appendChild(bb); }
    box.appendChild(h);
  }
  if (!list.length) { const e = document.createElement('div'); e.className = 'empty'; e.textContent = opts.emptyText || t('noResults'); box.appendChild(e); }
  for (const r of list) {
    const btn = document.createElement('button'); btn.className = 'result';
    btn.innerHTML = `<svg><use href="#${opts.icon || 'i-pin'}"/></svg><span class="r-text"><b></b><small></small></span><span class="r-dist"></span>`;
    btn.querySelector('b').textContent = r.name; btn.querySelector('small').textContent = r.label || '';
    btn.querySelector('.r-dist').textContent = r.dist != null ? fmtDist(r.dist, true) : '';
    btn.addEventListener('click', () => {
      box.querySelectorAll('.result').forEach(x => x.classList.remove('selected')); btn.classList.add('selected');
      routeTo({ lat: r.lat, lng: r.lng, name: r.name }, r.name);
    });
    box.appendChild(btn);
  }
  box.classList.remove('hidden'); $('navEmpty').classList.add('hidden');
}
async function doSearch(q) {
  const seq = ++searchSeq;
  if (!q.trim()) { $('navResults').classList.add('hidden'); $('navEmpty').classList.remove('hidden'); return; }
  $('navResults').innerHTML = `<div class="empty">${t('searching')}</div>`; $('navResults').classList.remove('hidden'); $('navEmpty').classList.add('hidden');
  try {
    const near = S.lastFix ? { lat: S.lastFix.lat, lng: S.lastFix.lng } : null;
    const res = await geocode(q, near, getLang());
    if (seq !== searchSeq) return;
    renderResults(res);
  } catch (e) { if (seq === searchSeq) renderResults([]); }
}
$('navSearch').addEventListener('input', e => {
  const v = e.target.value; $('navClear').classList.toggle('hidden', !v);
  clearTimeout(searchTimer); searchTimer = setTimeout(() => doSearch(v), 650);
});
$('navSearch').addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(searchTimer); doSearch(e.target.value); e.target.blur(); } });
$('navClear').addEventListener('click', () => { $('navSearch').value = ''; $('navClear').classList.add('hidden'); doSearch(''); });

// Quick actions
$('qSave').addEventListener('click', () => {
  const target = S.route ? { lat: S.route.dest.lat, lng: S.route.dest.lng, def: S.routeName } : (S.lastFix ? { lat: S.lastFix.lat, lng: S.lastFix.lng, def: t('currentLocation') } : null);
  if (!target) { toast(t('noGpsForRoute')); return; }
  const name = prompt(t('savePlacePrompt'), target.def);
  if (!name) return;
  const favs = loadFavorites(); favs.unshift({ name, lat: target.lat, lng: target.lng, at: Date.now() }); saveFavorites(favs);
  toast(`★ ${name}`);
});
$('qFav').addEventListener('click', () => {
  const near = S.lastFix;
  const favs = loadFavorites().map(f => ({ ...f, dist: near ? haversine(near.lat, near.lng, f.lat, f.lng) : null }));
  renderResults(favs, { title: t('favorites'), icon: 'i-star', emptyText: t('noFavorites'), showOnMap: true });
});
$('qGpx').addEventListener('click', () => $('gpxFile').click());
$('gpxFile').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const gpx = parseGpx(await f.text());
    if (!gpx.points.length) throw new Error('empty');
    const last = gpx.points[gpx.points.length - 1];
    S.route = null; $('routeFoot').classList.add('hidden');
    S.map.setRoute(gpx.points, { lat: last[0], lng: last[1] });
    S.map.fitRoute();
    toast(t('gpxLoaded', { n: gpx.points.length }));
    closeSheet('sheetNav');
  } catch { toast(t('gpxError')); }
  e.target.value = '';
});
$('qRoutes').addEventListener('click', () => toast(t('comingSoon')));
const POI_GLYPH = { fuel: '⛽', restaurants: '🍴', hotels: '🛏', parking: 'P' };
async function poi(kind, titleKey, icon) {
  if (!S.lastFix) { toast(t('noGpsForRoute')); return; }
  $('navResults').innerHTML = `<div class="empty">${t('searching')}</div>`; $('navResults').classList.remove('hidden'); $('navEmpty').classList.add('hidden');
  try {
    const list = await nearbyPois(kind, { lat: S.lastFix.lat, lng: S.lastFix.lng });
    renderResults(list, { title: `${t('nearby')} · ${t(titleKey)}`, icon, showOnMap: true });
    S.map.setPois(list.map(p => ({ ...p, glyph: POI_GLYPH[kind] })), p => routeTo({ lat: p.lat, lng: p.lng, name: p.name }, p.name));
  } catch { renderResults([]); }
}
$('qFuel').addEventListener('click', () => poi('fuel', 'fuel', 'i-fuel'));
$('qFood').addEventListener('click', () => poi('restaurants', 'restaurants', 'i-food'));
$('qHotel').addEventListener('click', () => poi('hotels', 'hotels', 'i-bed'));
$('qParking').addEventListener('click', () => poi('parking', 'parking', 'i-parking'));
$('btnStartNav').addEventListener('click', startNavigation);
$('btnEndNav').addEventListener('click', () => endNavigation(true));
for (const [id, key] of [['optTolls', 'avoidTolls'], ['optMotorways', 'avoidMotorways'], ['optFerries', 'avoidFerries']]) {
  $(id).addEventListener('change', e => { updateSetting(key, e.target.checked); if (S.route && !S.guidance) routeTo(S.route.dest, S.routeName); });
}

// ---------------- History ----------------
async function renderHistory() {
  const list = await listSessions();
  const box = $('historyList');
  box.innerHTML = '';
  $('historyFoot').classList.toggle('hidden', !S.selectMode);
  $('btnSelect').textContent = S.selectMode ? t('cancel') : t('select');
  if (!list.length) { box.innerHTML = `<div class="empty">${t('noSessions')}</div>`; return; }
  const wrap = document.createElement('div'); wrap.className = 'history-wrap';
  for (const s of list) {
    const card = document.createElement('div'); card.className = 'session-card';
    const sel = S.selected.has(s.id);
    card.innerHTML = `
      <div class="s-ic ${sel ? 'sel' : ''}"><svg><use href="#${sel ? 'i-check' : 'i-moto'}"/></svg></div>
      <div>
        <div class="s-date">${fmtDate(s.startTime)}</div>
        <div class="s-stats">
          <span><svg><use href="#i-gauge"/></svg>${fmtSpeed(s.maxSpeed)} ${speedUnit()}</span>
          <span><svg><use href="#i-clock"/></svg>${fmtElapsed(s.duration)}</span>
          <span><svg><use href="#i-road"/></svg>${fmtDist(s.distance)}</span>
        </div>
        <div class="s-stats" style="margin-top:6px">
          <span><svg class="c-blue"><use href="#i-turn-left"/></svg>${Math.round(s.maxLeanL)}°</span>
          <span><svg class="c-orange"><use href="#i-turn-right"/></svg>${Math.round(s.maxLeanR)}°</span>
          <span><svg class="c-green"><use href="#i-bolt"/></svg>${s.maxAccel.toFixed(1)} m/s²</span>
        </div>
      </div>
      <div class="s-actions"><button class="s-share" aria-label="Share"><svg><use href="#i-share"/></svg></button><svg class="s-chev"><use href="#i-chev"/></svg></div>`;
    card.querySelector('.s-share').addEventListener('click', e => { e.stopPropagation(); exportGpx(s); });
    card.addEventListener('click', () => {
      if (S.selectMode) { if (S.selected.has(s.id)) S.selected.delete(s.id); else S.selected.add(s.id); renderHistory(); }
      else openDetail(s);
    });
    wrap.appendChild(card);
  }
  box.appendChild(wrap);
  $('btnDeleteSel').textContent = t('deleteN', { n: S.selected.size });
  $('btnDeleteSel').disabled = S.selected.size === 0;
}
$('btnSelect').addEventListener('click', () => { S.selectMode = !S.selectMode; S.selected.clear(); renderHistory(); });
$('btnDeleteSel').addEventListener('click', async () => {
  if (!S.selected.size || !await confirmSheet(t('deleteConfirm', { n: S.selected.size }), t('yesDelete'))) return;
  for (const id of S.selected) await deleteSession(id);
  S.selected.clear(); S.selectMode = false; renderHistory();
});
// Share a file through the OS share sheet (iOS: AirDrop / Save to Files / Dropbox), or download it.
async function shareFile(file) {
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name }); } catch { /* cancelled */ }
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
// Full session export for the PC video pipeline: summary + GPS track + raw IMU columns, gzipped JSON.
async function exportJson(s) {
  toast(t('exporting'), 10000);
  const full = s.track ? s : await getSession(s.id);
  let imu = null;
  if (full.samplesSource === 'imu' && full.imuCount) { try { imu = await getImu(full.id); } catch { /* no raw log */ } }
  const cols = imu ? ['t', 'lean', 'ax', 'ay', 'az', 'gx', 'gy', 'gz'] : null;
  const round = (arr, d) => { const k = 10 ** d, out = new Array(arr.length); for (let i = 0; i < arr.length; i++) { const v = arr[i]; out[i] = Number.isFinite(v) ? Math.round(v * k) / k : null; } return out; };
  const payload = {
    format: 'moto-ng-session', formatVersion: 1, app: APP_NAME, appVersion: VERSION,
    id: full.id, startTime: full.startTime, endTime: full.endTime, startTimeIso: new Date(full.startTime).toISOString(),
    duration: full.duration, movingTime: full.movingTime, distance: full.distance,
    maxSpeed: full.maxSpeed, avgSpeed: full.avgSpeed, maxAccel: full.maxAccel, maxBrake: full.maxBrake, brakeDist: full.brakeDist,
    maxLeanL: full.maxLeanL, maxLeanR: full.maxLeanR,
    accelSign: full.accelSign || 1, gyroSign: full.gyroSign || 1,
    trackColumns: ['t_ms', 'lat', 'lng', 'speed_ms', 'lean_deg', 'alt_m'], track: full.track,
    imu: imu ? { rate: imu.rate, columns: cols, note: 't in ms since startTime; a* m/s² long/lat/vert, g* deg/s roll/pitch/yaw, bike axes, raw platform sign (apply accelSign/gyroSign)',
      t: Array.from(imu.t), lean: round(imu.lean, 1), ax: round(imu.ax, 3), ay: round(imu.ay, 3), az: round(imu.az, 3), gx: round(imu.gx, 2), gy: round(imu.gy, 2), gz: round(imu.gz, 2) } : null,
    samples: !imu && full.samples ? full.samples : undefined,
  };
  const json = JSON.stringify(payload);
  const base = `moto-ng-${new Date(full.startTime).toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
  let file;
  if (typeof CompressionStream === 'function') {
    const gz = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
    file = new File([await new Response(gz).blob()], `${base}.json.gz`, { type: 'application/gzip' });
  } else {
    file = new File([json], `${base}.json`, { type: 'application/json' });
  }
  $('toast').classList.add('hidden');
  await shareFile(file);
}
async function exportGpx(s) {
  const full = s.track ? s : await getSession(s.id);
  const gpx = sessionToGpx(full);
  const fname = `ride-${new Date(full.startTime).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.gpx`;
  await shareFile(new File([gpx], fname, { type: 'application/gpx+xml' }));
}
function openDetail(s) {
  S.detailSession = s;
  $('detailTitle').textContent = fmtDate(s.startTime);
  const cells = [
    [t('distance'), fmtDist(s.distance)], [t('duration'), fmtElapsed(s.duration)], [t('movingTime'), fmtElapsed(s.movingTime)],
    [`${t('max')} ${speedUnit()}`, fmtSpeed(s.maxSpeed)], [`${t('avgSpeed')} ${speedUnit()}`, fmtSpeed1(s.avgSpeed)],
    [`${t('maxAccel')} m/s²`, s.maxAccel.toFixed(1)], [`${t('maxBrake')} m/s²`, s.maxBrake.toFixed(1)], [`${t('brakeDist')} ${t(imperial() ? 'ft' : 'm')}`, fmtSmallDist(s.brakeDist)],
    ['◀ ' + t('leanSection'), `${Math.round(s.maxLeanL)}°`], [t('leanSection') + ' ▶', `${Math.round(s.maxLeanR)}°`],
  ];
  $('detailGrid').innerHTML = cells.map(([k, v]) => `<div class="detail-cell"><small>${k}</small><b>${v}</b></div>`).join('');
  openSheet('sheetDetail');
  if (!S.detailMap) {
    S.detailMap = L.map($('detailMap'), { zoomControl: false, attributionControl: false, dragging: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(S.detailMap);
    S.detailTrack = L.polyline([], { color: '#ff7b1c', weight: 4 }).addTo(S.detailMap);
  }
  const pts = s.track.map(p => [p[1], p[2]]);
  S.detailTrack.setLatLngs(pts);
  $('detailMap').classList.toggle('hidden', pts.length === 0); // no GPS fixes recorded: nothing to map
  setTimeout(() => { S.detailMap.invalidateSize(); if (pts.length) S.detailMap.fitBounds(S.detailTrack.getBounds(), { padding: [20, 20] }); }, 80);
}
$('btnDetailShare').addEventListener('click', () => S.detailSession && exportGpx(S.detailSession));
$('btnDetailAnalytics').addEventListener('click', () => S.detailSession && openAnalytics(S.detailSession));

// ---------------- Analytics ----------------
const CHANNEL_DEFS = [
  { key: 'speed', name: 'chSpeed', color: '#f3f3f6', on: true },
  { key: 'lean', name: 'chLean', unit: '°', color: '#e9e94a', on: true, symmetric: true },
  { key: 'ax', name: 'chLong', unit: 'm/s²', color: '#35e07a', on: true, symmetric: true },
  { key: 'ay', name: 'chLat', unit: 'm/s²', color: '#3aa0ff', on: true, symmetric: true },
  { key: 'az', name: 'chVert', unit: 'm/s²', color: '#a970ff', on: false, imu: true },
  { key: 'gx', name: 'chRoll', unit: '°/s', color: '#ff7b1c', on: false, imu: true, symmetric: true },
  { key: 'gy', name: 'chPitch', unit: '°/s', color: '#ff4d4d', on: false, imu: true, symmetric: true },
  { key: 'gz', name: 'chYaw', unit: '°/s', color: '#ffd23a', on: false, imu: true, symmetric: true },
];
const SMOOTH_STEPS = [0, 0.05, 0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 3]; // seconds; 0 = raw
let chart = null, anData = null;
const anOn = new Set(CHANNEL_DEFS.filter(c => c.on).map(c => c.key));

// Centred moving average over `win` seconds; NaN gaps are skipped. Assumes roughly uniform sampling.
function smooth(t, v, win) {
  const n = v.length;
  if (!win || n < 3) return v;
  const rate = (n - 1) / Math.max(1e-3, t[n - 1] - t[0]);
  const k = Math.round(win * rate);
  if (k < 2) return v;
  const half = k >> 1, out = new Float32Array(n);
  let sum = 0, cnt = 0, lo = 0, hi = -1; // window [lo, hi]
  for (let i = 0; i < n; i++) {
    const wantHi = Math.min(n - 1, i + half), wantLo = Math.max(0, i - half);
    while (hi < wantHi) { hi++; const x = v[hi]; if (Number.isFinite(x)) { sum += x; cnt++; } }
    while (lo < wantLo) { const x = v[lo]; if (Number.isFinite(x)) { sum -= x; cnt--; } lo++; }
    out[i] = cnt ? sum / cnt : NaN;
  }
  return out;
}

// Normalise a session's data into raw per-channel arrays (seconds / values), whatever its vintage:
//   imu (native-rate Float32 columns) > samples (5 Hz rows, v1.2.0) > GPS track (derived)
async function analyticsData(s) {
  const spdF = imperial() ? 2.23694 : 3.6;
  const out = { t: null, imu: false, rate: 0, ch: {} };
  const aS = s.accelSign || 1, gS = s.gyroSign || 1;
  const scaled = (arr, k) => { const o = new Float32Array(arr.length); for (let i = 0; i < arr.length; i++) o[i] = arr[i] * k; return o; };
  let imu = null;
  if (s.samplesSource === 'imu' && s.imuCount) { try { imu = await getImu(s.id); } catch { /* fall through */ } }
  if (imu && imu.t && imu.t.length) {
    out.imu = true; out.rate = imu.rate || imu.t.length / Math.max(1, (imu.t[imu.t.length - 1] - imu.t[0]) / 1000);
    out.t = scaled(imu.t, 0.001);
    out.ch = { lean: imu.lean, ax: scaled(imu.ax, aS), ay: scaled(imu.ay, aS), az: scaled(imu.az, aS), gx: scaled(imu.gx, gS), gy: scaled(imu.gy, gS), gz: scaled(imu.gz, gS) };
  } else if (s.samples && s.samples.length) {
    out.imu = s.samplesSource === 'imu'; out.rate = 5;
    const col = (i, k = 1) => Float32Array.from(s.samples, r => r[i] == null ? NaN : r[i] * k);
    out.t = Float32Array.from(s.samples, r => r[0] / 1000);
    out.ch = { lean: col(2), ax: col(3, aS), ay: col(4, aS), az: col(5, aS), gx: col(6, gS), gy: col(7, gS), gz: col(8, gS) };
  }
  // Speed always from the 1 Hz GPS fixes
  const trk = s.track || [];
  out.speedT = Float32Array.from(trk, p => (p[0] - s.startTime) / 1000);
  out.ch.speed = Float32Array.from(trk, p => p[3] * spdF);
  if (!out.imu) {
    // GPS fallback: accel from the speed derivative, lateral accel from the balanced-turn relation g·tan(lean)
    if (!out.t) { out.t = out.speedT; out.ch.lean = Float32Array.from(trk, p => p[4]); out.rate = 1; }
    const n = out.t.length, ax = new Float32Array(n), ay = new Float32Array(n);
    const spdAt = i => { const k = Math.min(trk.length - 1, lowerBound(out.speedT, out.t[i])); return trk.length ? trk[k][3] : 0; };
    for (let i = 0; i < n; i++) {
      const j = Math.max(0, i - 1), k = Math.min(n - 1, i + 1), dt = out.t[k] - out.t[j];
      ax[i] = dt > 0 ? (spdAt(k) - spdAt(j)) / dt : 0;
      ay[i] = 9.81 * Math.tan(Math.max(-60, Math.min(60, out.ch.lean[i])) * Math.PI / 180);
    }
    out.ch.ax = ax; out.ch.ay = ay;
  }
  return out;
}
function anChannels() {
  const win = S.settings.anSmooth || 0;
  return CHANNEL_DEFS.filter(c => anOn.has(c.key) && (!c.imu || anData.imu) && anData.ch[c.key])
    .map(c => {
      const tt = c.key === 'speed' ? anData.speedT : anData.t;
      return { key: c.key, name: t(c.name), unit: c.key === 'speed' ? speedUnit() : c.unit, color: c.color, symmetric: !!c.symmetric,
        t: tt, v: smooth(tt, anData.ch[c.key], win) };
    });
}
function smoothLabel() { const w = S.settings.anSmooth || 0; return w ? `${w} s` : t('raw'); }
async function openAnalytics(s) {
  anData = await analyticsData(s);
  $('anTitle').textContent = fmtDate(s.startTime);
  $('anSource').textContent = anData.imu ? t('srcImu', { n: Math.round(anData.rate) }) : t('srcGps');
  const chips = $('anChips'); chips.innerHTML = '';
  for (const c of CHANNEL_DEFS) {
    if (c.imu && !anData.imu) continue;
    const b = document.createElement('button'); b.className = 'chip' + (anOn.has(c.key) ? ' on' : ''); b.style.setProperty('--chip', c.color);
    b.textContent = t(c.name);
    b.addEventListener('click', () => {
      if (anOn.has(c.key)) { if (anOn.size > 1) anOn.delete(c.key); } else anOn.add(c.key);
      b.classList.toggle('on', anOn.has(c.key)); chart.setChannels(anChannels());
    });
    chips.appendChild(b);
  }
  const sl = $('anSmooth');
  sl.max = SMOOTH_STEPS.length - 1;
  let idx = SMOOTH_STEPS.indexOf(S.settings.anSmooth || 0); if (idx < 0) idx = 3;
  sl.value = idx; $('anSmoothVal').textContent = smoothLabel();
  openSheet('sheetAnalytics');
  const dur = Math.max(1, anData.t.length ? anData.t[anData.t.length - 1] : s.duration);
  if (!chart) chart = createChart($('anCanvas'), { channels: anChannels(), duration: dur });
  else chart.setData(anChannels(), dur);
  setTimeout(() => chart.render(), 60);
}
$('anSmooth').addEventListener('input', e => {
  S.settings.anSmooth = SMOOTH_STEPS[+e.target.value] || 0; saveSettings(S.settings);
  $('anSmoothVal').textContent = smoothLabel();
  if (chart && anData) chart.setChannels(anChannels());
});
$('btnDetailGpx').addEventListener('click', () => S.detailSession && exportGpx(S.detailSession));
$('btnDetailJson').addEventListener('click', () => S.detailSession && exportJson(S.detailSession));
$('btnDetailDelete').addEventListener('click', async () => {
  if (!S.detailSession || !await confirmSheet(t('deleteConfirm', { n: 1 }), t('yesDelete'))) return;
  await deleteSession(S.detailSession.id); closeSheet('sheetDetail'); renderHistory();
});

// ---------------- UI wiring ----------------
$('btnStart').addEventListener('click', async () => {
  if (S.recording) { stopRecording(); return; }
  await requestMotion(true);
  startRecording();
});
$('btnReset').addEventListener('click', resetStats);
$('btnMenu').addEventListener('click', () => openSheet('sheetMenu'));
$('miNav').addEventListener('click', () => { closeSheet('sheetMenu'); openSheet('sheetNav'); });
$('miHistory').addEventListener('click', () => { closeSheet('sheetMenu'); S.selectMode = false; S.selected.clear(); renderHistory(); openSheet('sheetHistory'); });
$('miSettings').addEventListener('click', () => { closeSheet('sheetMenu'); openSheet('sheetSettings'); });
$('btnSearch').addEventListener('click', () => openSheet('sheetNav'));
$('btnLocate').addEventListener('click', () => { S.map.setFollow(true); });
$('btnExpand').addEventListener('click', () => { $('app').classList.toggle('map-expanded'); S.map.invalidate(); });
$('compass').addEventListener('click', () => { S.map.setFollow(true); });
$('btnCal').addEventListener('click', calibrate);
$('sensorOverlay').addEventListener('click', () => requestMotion(true));

// Settings controls
$('setAccent').addEventListener('change', e => updateSetting('accent', e.target.value));
$('setMount').addEventListener('change', e => updateSetting('mount', e.target.value));
$('setInvert').addEventListener('change', e => updateSetting('invertLean', e.target.checked));
$('setAutoCal').addEventListener('change', e => updateSetting('autoCal', e.target.checked));
$('setLang').addEventListener('change', e => updateSetting('lang', e.target.value));
$('setUnits').addEventListener('change', e => updateSetting('units', e.target.value));
$('setVoice').addEventListener('change', e => updateSetting('voice', e.target.checked));
$('setMapStyle').addEventListener('change', e => updateSetting('mapStyle', e.target.value));
$('setFollow').addEventListener('change', e => updateSetting('follow', e.target.checked));
$('setAwake').addEventListener('change', e => updateSetting('keepAwake', e.target.checked));
$('setDemo').addEventListener('change', e => updateSetting('demo', e.target.checked));
$('btnTestVoice').addEventListener('click', () => speak(t('testVoiceText')));
$('btnAbout').addEventListener('click', () => { renderAbout(); openSheet('sheetAbout'); });
$('btnAboutShare').addEventListener('click', shareApp);

// ---------------- About ----------------
async function shareApp() {
  if (navigator.share) {
    try { await navigator.share({ title: APP_NAME, text: `${APP_NAME} — ${aboutContent().tagline}`, url: APP_URL }); } catch { /* cancelled */ }
    return;
  }
  try { await navigator.clipboard.writeText(APP_URL); toast(t('copied')); } catch { prompt('URL', APP_URL); }
}
function renderAbout() {
  const c = aboutContent();
  const box = $('aboutBody');
  const esc = v => String(v).replace(/[<>&]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch]));
  const section = s => {
    let h = `<div class="about-section"><h3>${esc(s.h)}</h3>`;
    for (const p of s.p || []) h += `<p>${esc(p)}</p>`;
    if (s.li) h += `<ul>${s.li.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    if (s.kv) h += `<dl>${s.kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;
    return h + '</div>';
  };
  let qr = '';
  try { const q = window.qrcode(0, 'M'); q.addData(APP_URL); q.make(); qr = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true }); } catch { /* no QR */ }
  box.innerHTML = `
    <div class="about-hero">
      <img src="icons/icon-192.png" alt="" class="about-icon">
      <div class="about-name">${APP_NAME}</div>
      <div class="about-ver">${t('version')} ${VERSION}</div>
      <p class="about-tag">${esc(c.tagline)}</p>
    </div>
    <div class="about-qr">${qr}<div class="about-url">${APP_URL.replace('https://', '')}</div>
      <div class="about-btns"><button class="big-btn accent" id="aboutShareBtn">${t('shareLink')}</button><button class="big-btn" id="aboutCopyBtn">${t('copyLink')}</button></div>
    </div>
    ${section(c.install)}${section(c.offline)}${section(c.privacy)}${section(c.firstRide)}${section(c.numbers)}${section(c.services)}${section(c.credits)}
    <div class="about-section"><p><a class="about-link" href="${REPO_URL}" target="_blank" rel="noopener">${t('sourceCode')}: github.com/gpasqual/moto-app</a></p></div>
    <div style="height:40px"></div>`;
  $('aboutShareBtn').addEventListener('click', shareApp);
  $('aboutCopyBtn').addEventListener('click', async () => { try { await navigator.clipboard.writeText(APP_URL); toast(t('copied')); } catch { prompt('URL', APP_URL); } });
}
$('btnClearHistory').addEventListener('click', async () => { if (await confirmSheet(t('clearConfirm'), t('yesDeleteAll'))) { await clearSessions(); toast('OK'); } });

// First user gesture: wake lock needs one on some browsers.
document.addEventListener('pointerdown', () => updateWakeLock(), { once: true });

// ---------------- Init ----------------
function init() {
  S.gauge = createGauge($('gauge'));
  S.map = createMap($('map'), {
    style: S.settings.mapStyle, follow: S.settings.follow,
    onFollowChange: f => $('btnLocate').classList.toggle('off', !f),
  });
  const cal = loadCalibration();
  S.lean.setMount(S.settings.mount);
  if (cal && cal.mount === S.settings.mount) { S.lean.restore(cal); S.lean.setScreenAngle(currentScreenAngle()); }
  else S.lean.setScreenAngle(currentScreenAngle());
  applySettings({ ...S.settings });
  if (S.settings.demo) setDemo(true);
  else {
    startGps();
    requestMotion(false); // attaches directly where no permission prompt is needed; otherwise shows the overlay
  }
  updateWakeLock();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
