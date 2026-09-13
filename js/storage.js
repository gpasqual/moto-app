// Settings + favorites live in localStorage (tiny). Sessions (with full GPS tracks) live in IndexedDB.
import { detectLang } from './i18n.js';

const SETTINGS_KEY = 'motospeed.settings.v1';
const FAV_KEY = 'motospeed.favorites.v1';
const CAL_KEY = 'motospeed.calibration.v1';

export const DEFAULT_SETTINGS = {
  lang: detectLang(),
  units: 'metric',          // 'metric' | 'imperial'
  accent: 'orange',
  mount: 'bars',            // 'bars' | 'frame' | 'bag'
  invertLean: false,
  autoCal: true,
  voice: true,
  mapStyle: 'light',        // 'light' | 'dark'
  follow: true,
  keepAwake: true,
  demo: false,
  avoidTolls: false,
  avoidMotorways: false,
  avoidFerries: false,
  anSmooth: 0.2,            // analytics smoothing window, seconds (0 = raw)
};

function readJson(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota / private mode */ }
}

export function loadSettings() { return { ...DEFAULT_SETTINGS, ...readJson(SETTINGS_KEY, {}) }; }
export function saveSettings(s) { writeJson(SETTINGS_KEY, s); }

export function loadFavorites() { return readJson(FAV_KEY, []); }
export function saveFavorites(list) { writeJson(FAV_KEY, list); }

export function loadCalibration() { return readJson(CAL_KEY, null); }
export function saveCalibration(cal) { writeJson(CAL_KEY, cal); }

// ---- IndexedDB sessions ----
// 'sessions' holds summaries + the 1 Hz GPS track (small, loaded for the history list).
// 'imu' holds the raw sensor log per session (tens of MB per hour), loaded only for analytics.
const DB_NAME = 'motospeed';
const STORE = 'sessions';
const IMU_STORE = 'imu';
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('startTime', 'startTime');
      }
      if (!db.objectStoreNames.contains(IMU_STORE)) db.createObjectStore(IMU_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(stores, mode, fn) {
  return openDb().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let result;
    try { result = fn(...stores.map(n => t.objectStore(n))); } catch (e) { reject(e); return; }
    t.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
    t.onerror = () => reject(t.error);
  }));
}

export function saveSession(session) {
  const { imu, ...summary } = session;
  return tx([STORE, IMU_STORE], 'readwrite', (s, m) => {
    s.put(summary);
    if (imu) m.put({ id: session.id, ...imu }); else m.delete(session.id);
  });
}
export function deleteSession(id) { return tx([STORE, IMU_STORE], 'readwrite', (s, m) => { s.delete(id); m.delete(id); }); }
export function clearSessions() { return tx([STORE, IMU_STORE], 'readwrite', (s, m) => { s.clear(); m.clear(); }); }
export function getSession(id) { return tx([STORE], 'readonly', s => s.get(id)); }
export function getImu(id) { return tx([IMU_STORE], 'readonly', m => m.get(id)); }
export function listSessions() {
  // Newest first. Tracks are included; the list view only reads summary fields.
  return tx([STORE], 'readonly', s => s.getAll()).then(all => (all || []).sort((a, b) => b.startTime - a.startTime));
}
