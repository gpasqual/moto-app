import { t, setLang, getLang, applyDom, aboutContent } from './i18n.js';
import { loadSettings, saveSettings, loadFavorites, saveFavorites, loadCalibration, saveCalibration, saveSession, deleteSession, clearSessions, listSessions, getSession } from './storage.js';
import { LeanEstimator } from './lean.js';
import { Session, RideSimulator, haversine } from './telemetry.js';
import { createGauge } from './gauge.js';
import { createChart, lowerBound } from './chart.js';
import { createMap } from './map.js';
import { geocode, fetchRoute, Guidance, instructionText, maneuverIcon, speak, nearbyPois, parseGpx, sessionToGpx } from './nav.js';

export const VERSION = '1.2.0';
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

// ---- Motion sampling (accelerometer + gyro projected into bike axes, averaged to 5 Hz while recording)
const motionWin = { a: [0, 0, 0], w: [0, 0, 0], nA: 0, nW: 0 };
function accumulateMotion(a, w) {
  if (a) { motionWin.a[0] += a[0]; motionWin.a[1] += a[1]; motionWin.a[2] += a[2]; motionWin.nA++; }
  if (w) { motionWin.w[0] += w[0]; motionWin.w[1] += w[1]; motionWin.w[2] += w[2]; motionWin.nW++; }
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
  accumulateMotion(a, w);
}
setInterval(() => {
  if (!S.recording) { motionWin.nA = motionWin.nW = 0; motionWin.a = [0, 0, 0]; motionWin.w = [0, 0, 0]; return; }
  const a = motionWin.nA ? motionWin.a.map(x => x / motionWin.nA) : null;
  const w = motionWin.nW ? motionWin.w.map(x => x / motionWin.nW) : null;
  motionWin.a = [0, 0, 0]; motionWin.w = [0, 0, 0]; motionWin.nA = motionWin.nW = 0;
  const speed = S.lastFix && S.lastFix.speed > 0 ? S.lastFix.speed : 0;
  S.stats.addSample(Date.now(), speed, S.stats.currentLean, a, w);
}, 200);

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
  S.stats.maxLeanL = 0; S.stats.maxLeanR = 0; paintLeanMax(); // a new reference invalidates earlier maxes
  S.lean.startCalibration(1200);
}
S.lean.onCalibrated = cal => {
  saveCalibration(cal);
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
    S.sim.onMotion = accumulateMotion;
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
async function exportGpx(s) {
  const full = s.track ? s : await getSession(s.id);
  const gpx = sessionToGpx(full);
  const fname = `ride-${new Date(full.startTime).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.gpx`;
  const file = new File([gpx], fname, { type: 'application/gpx+xml' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: fname }); return; } catch { /* cancelled */ return; }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a'); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
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
let chart = null, anData = null;
const anOn = new Set(CHANNEL_DEFS.filter(c => c.on).map(c => c.key));

// Per-channel arrays for a session: from the 5 Hz IMU samples when present, else derived from the GPS track.
function analyticsData(s) {
  const spd = v => v * (imperial() ? 2.23694 : 3.6);
  const out = { t: [], speed: [], lean: [], ax: [], ay: [], az: [], gx: [], gy: [], gz: [], imu: s.samplesSource === 'imu' && s.samples?.length > 0 };
  if (s.samples && s.samples.length) {
    const aS = s.accelSign || 1, gS = s.gyroSign || 1;
    const sg = (v, k) => v == null ? null : v * k;
    for (const r of s.samples) {
      out.t.push(r[0] / 1000); out.speed.push(spd(r[1] || 0)); out.lean.push(r[2]);
      if (out.imu) {
        out.ax.push(sg(r[3], aS)); out.ay.push(sg(r[4], aS)); out.az.push(sg(r[5], aS));
        out.gx.push(sg(r[6], gS)); out.gy.push(sg(r[7], gS)); out.gz.push(sg(r[8], gS));
      }
    }
  }
  // Speed comes from the 1 Hz GPS fixes themselves (a smooth line rather than a 5 Hz staircase).
  if (s.track && s.track.length) { out.speedT = s.track.map(p => (p[0] - s.startTime) / 1000); out.speed = s.track.map(p => spd(p[3])); }
  if (!out.imu) {
    // GPS fallback: accel from the speed derivative, lateral accel from the balanced-turn relation g·tan(lean)
    if (!out.t.length) for (const p of s.track) { out.t.push((p[0] - s.startTime) / 1000); out.lean.push(p[4]); }
    if (!out.speedT) { out.speedT = out.t; }
    const spdAt = i => { const k = lowerBound(out.speedT, out.t[i]); return out.speed[Math.min(out.speed.length - 1, k)] || 0; };
    const toMs = imperial() ? 1 / 2.23694 : 1 / 3.6;
    out.ax = []; out.ay = [];
    for (let i = 0; i < out.t.length; i++) {
      const j = Math.max(0, i - 1), k = Math.min(out.t.length - 1, i + 1), dt = out.t[k] - out.t[j];
      out.ax.push(dt > 0 ? (spdAt(k) - spdAt(j)) * toMs / dt : 0);
      out.ay.push(9.81 * Math.tan(Math.max(-60, Math.min(60, out.lean[i])) * Math.PI / 180));
    }
  }
  return out;
}
function anChannels() {
  return CHANNEL_DEFS.filter(c => anOn.has(c.key) && (!c.imu || anData.imu))
    .map(c => ({ key: c.key, name: t(c.name), unit: c.key === 'speed' ? speedUnit() : c.unit, color: c.color, symmetric: !!c.symmetric,
      t: c.key === 'speed' && anData.speedT ? anData.speedT : anData.t, v: anData[c.key] }));
}
function openAnalytics(s) {
  anData = analyticsData(s);
  $('anTitle').textContent = fmtDate(s.startTime);
  $('anSource').textContent = anData.imu ? t('srcImu') : t('srcGps');
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
  openSheet('sheetAnalytics');
  const dur = Math.max(1, anData.t.length ? anData.t[anData.t.length - 1] : s.duration);
  if (!chart) chart = createChart($('anCanvas'), { channels: anChannels(), duration: dur });
  else chart.setData(anChannels(), dur);
  setTimeout(() => chart.render(), 60);
}
$('btnDetailGpx').addEventListener('click', () => S.detailSession && exportGpx(S.detailSession));
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
