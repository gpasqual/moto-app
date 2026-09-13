// Ride statistics from a stream of GPS fixes.
//
// Acceleration is derived from GPS speed (m/s) deltas, lightly smoothed. That is
// noisier than an accelerometer but immune to vibration and needs no alignment.
// A braking event starts when deceleration exceeds BRAKE_START and ends when it
// eases below BRAKE_END or the bike stops; the reported braking distance is the
// distance covered during the hardest braking event of the session.

const R_EARTH = 6371000;
const BRAKE_START = -1.0;   // m/s²
const BRAKE_END = -0.3;     // m/s²
const MOVING_SPEED = 1.0;   // m/s — below this we count as stopped
const MAX_ACC_ACCURACY = 60; // m — fixes worse than this don't feed stats
const ACCEL_CLAMP = 15;     // m/s² — reject GPS glitches

export function haversine(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(a));
}

export function bearing(lat1, lon1, lat2, lon2) {
  const toRad = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * toRad) * Math.cos(lat2 * toRad);
  const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) - Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos((lon2 - lon1) * toRad);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Append-only typed-array buffer that doubles when full.
class GrowBuf {
  constructor(Type = Float32Array, cap = 8192) { this.Type = Type; this.a = new Type(cap); this.n = 0; }
  push(v) {
    if (this.n === this.a.length) { const b = new this.Type(this.a.length * 2); b.set(this.a); this.a = b; }
    this.a[this.n++] = v;
  }
  trim() { return this.a.slice(0, this.n); }
}

export class Session {
  constructor() {
    this.id = `s_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    this.startTime = Date.now();
    this.endTime = null;
    this.distance = 0;       // m
    this.movingTime = 0;     // s
    this.maxSpeed = 0;       // m/s
    this.maxAccel = 0;       // m/s²
    this.maxBrake = 0;       // m/s² (magnitude)
    this.brakeDist = 0;      // m, distance of the hardest braking event
    this.maxLeanL = 0;       // deg
    this.maxLeanR = 0;       // deg
    this.track = [];         // [t, lat, lng, speed, lean, alt]
    // Raw IMU log at the sensor's native rate (~60 Hz): per event t (ms since start), lean (deg), accelerometer in
    // bike axes ax/ay/az (long/lat/vert, m/s²) and gyro gx/gy/gz (roll/pitch/yaw rate, deg/s). NaN where absent.
    // Kept in growable Float32 columns; averaging happens in the analytics viewer, not here.
    this._imu = { t: new GrowBuf(Uint32Array), lean: new GrowBuf(), ax: new GrowBuf(), ay: new GrowBuf(), az: new GrowBuf(), gx: new GrowBuf(), gy: new GrowBuf(), gz: new GrowBuf() };
    this.imuCount = 0;
    this.samplesSource = 'gps';  // 'imu' once real motion data has been recorded
    // The platform's sign convention for accelerometer/gyro is not knowable up front (iOS and Android differ),
    // so we learn it: correlate IMU longitudinal accel with the GPS speed derivative, and roll rate with d(lean)/dt.
    this._accCorr = 0; this._gyrCorr = 0; this._prevMotionLean = null;
    this._last = null;       // last accepted fix {t, lat, lng, speed}
    this._prevSpeed = null;
    this._accel = 0;
    this._brake = null;      // active braking event {dist, peak}
    this._bestPeak = 0;      // peak decel of the hardest braking event so far
    this.currentLean = 0;
  }

  get elapsed() { return ((this.endTime || Date.now()) - this.startTime) / 1000; }
  get accelSign() { return this._accCorr < 0 ? -1 : 1; }
  get gyroSign() { return this._gyrCorr < 0 ? -1 : 1; }

  // One raw motion event. a/w are bike-frame [long, lat, vert] / [roll, pitch, yaw] or null.
  addMotion(t, lean, a, w) {
    if (!a && !w) return;
    this.samplesSource = 'imu';
    if (a && Number.isFinite(this._accel)) this._accCorr += a[0] * this._accel;
    if (w && this._prevMotionLean != null) this._gyrCorr += w[0] * (lean - this._prevMotionLean);
    this._prevMotionLean = lean;
    const m = this._imu;
    m.t.push(Math.max(0, t - this.startTime)); m.lean.push(lean);
    m.ax.push(a ? a[0] : NaN); m.ay.push(a ? a[1] : NaN); m.az.push(a ? a[2] : NaN);
    m.gx.push(w ? w[0] : NaN); m.gy.push(w ? w[1] : NaN); m.gz.push(w ? w[2] : NaN);
    this.imuCount++;
  }
  _exportImu() {
    if (!this.imuCount) return null;
    const m = this._imu, out = {};
    for (const k of Object.keys(m)) out[k] = m[k].trim();
    out.rate = this.imuCount / Math.max(1, (out.t[this.imuCount - 1] - out.t[0]) / 1000);
    return out;
  }
  get avgSpeed() { return this.movingTime > 1 ? this.distance / this.movingTime : 0; }
  get accel() { return this._accel; }

  addLean(deg) {
    this.currentLean = deg;
    if (deg < 0 && -deg > this.maxLeanL) this.maxLeanL = -deg;
    if (deg > 0 && deg > this.maxLeanR) this.maxLeanR = deg;
  }

  // fix: {t (ms), lat, lng, speed (m/s|null), accuracy (m), alt}
  addFix(fix) {
    if (fix.accuracy != null && fix.accuracy > MAX_ACC_ACCURACY) return;
    const last = this._last;
    let speed = fix.speed;
    let dt = last ? (fix.t - last.t) / 1000 : 0;
    let dist = last ? haversine(last.lat, last.lng, fix.lat, fix.lng) : 0;

    if (last && dt <= 0) return; // duplicate / out-of-order

    if (speed == null || speed < 0 || !Number.isFinite(speed)) {
      speed = last && dt > 0 ? dist / dt : 0;
    }

    if (last) {
      // Ignore jitter while stationary so distance doesn't creep.
      if (speed < MOVING_SPEED && dist < Math.max(3, (fix.accuracy || 0) * 0.5)) dist = 0;
      this.distance += dist;
      if (speed >= MOVING_SPEED) this.movingTime += dt;

      let a = (speed - (this._prevSpeed ?? speed)) / dt;
      if (Math.abs(a) > ACCEL_CLAMP) a = 0;
      // 2-sample smoothing
      this._accel = 0.5 * this._accel + 0.5 * a;
      const acc = this._accel;
      if (acc > this.maxAccel) this.maxAccel = acc;
      if (-acc > this.maxBrake) this.maxBrake = -acc;

      // Braking event tracking
      if (this._brake) {
        this._brake.dist += dist;
        if (-acc > this._brake.peak) this._brake.peak = -acc;
        if (acc > BRAKE_END || speed < 0.3) {
          if (this._brake.peak >= this._bestPeak) { this.brakeDist = this._brake.dist; this._bestPeak = this._brake.peak; }
          this._brake = null;
        }
      } else if (acc < BRAKE_START) {
        this._brake = { dist, peak: -acc };
      }
    }

    if (speed > this.maxSpeed) this.maxSpeed = speed;
    this._prevSpeed = speed;
    this._last = { t: fix.t, lat: fix.lat, lng: fix.lng, speed };
    this.track.push([fix.t, +fix.lat.toFixed(6), +fix.lng.toFixed(6), +speed.toFixed(2), +this.currentLean.toFixed(1), fix.alt == null ? null : Math.round(fix.alt)]);
  }

  finish() {
    this.endTime = Date.now();
    return this.toJSON();
  }

  toJSON() {
    return {
      id: this.id, startTime: this.startTime, endTime: this.endTime || Date.now(),
      duration: this.elapsed, movingTime: this.movingTime, distance: this.distance,
      maxSpeed: this.maxSpeed, avgSpeed: this.avgSpeed, maxAccel: this.maxAccel, maxBrake: this.maxBrake,
      brakeDist: this.brakeDist, maxLeanL: this.maxLeanL, maxLeanR: this.maxLeanR, track: this.track,
      samplesSource: this.samplesSource, imuCount: this.imuCount, accelSign: this.accelSign, gyroSign: this.gyroSign,
      imu: this._exportImu(),
    };
  }
}

// ---- Demo simulator: a fake ride around a loop with realistic-ish speed and lean ----
export class RideSimulator {
  constructor(center = { lat: 45.4642, lng: 9.19 }) {
    this.center = center;
    this.t0 = performance.now();
    this.timer = null;
    this.onFix = null; this.onLean = null; this.onMotion = null;
    this.lat = center.lat; this.lng = center.lng;
    this.speed = 0; this.heading = 0; this._prevLean = 0;
  }
  start() {
    this.stop();
    let last = performance.now();
    let lastFix = 0;
    this.timer = setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000; last = now;
      const s = (now - this.t0) / 1000;
      // Speed profile: accelerate, cruise, brake hard, repeat (period 40s)
      const p = s % 40;
      let target;
      if (p < 12) target = 2 + p * 3.2;           // 0 -> ~40 m/s
      else if (p < 28) target = 25 + 6 * Math.sin(p);
      else if (p < 34) target = Math.max(0, 30 - (p - 28) * 5.5); // hard brake
      else target = 1;
      const prevSpeed = this.speed;
      this.speed += (target - this.speed) * Math.min(1, dt * 1.5);
      // Heading wanders; lean follows turn rate
      const turnRate = 18 * Math.sin(s / 6) + 10 * Math.sin(s / 2.3); // deg/s
      this.heading = (this.heading + turnRate * dt + 360) % 360;
      const lean = Math.max(-58, Math.min(58, Math.atan((this.speed * turnRate * Math.PI / 180) / 9.81) * 180 / Math.PI * 1.4));
      // Advance position
      const d = this.speed * dt;
      const br = this.heading * Math.PI / 180;
      this.lat += (d * Math.cos(br)) / 111320;
      this.lng += (d * Math.sin(br)) / (111320 * Math.cos(this.lat * Math.PI / 180));
      this.onLean && this.onLean(lean + (Math.random() - 0.5) * 0.6);
      if (this.onMotion && dt > 0) {
        const n = () => (Math.random() - 0.5) * 0.3;
        const yawRate = turnRate * (1 + n() * 0.2);
        this.onMotion(
          [Math.max(-9, Math.min(6, (this.speed - prevSpeed) / dt)) + n(), this.speed * yawRate * Math.PI / 180 + n(), n() * 2],
          [(lean - this._prevLean) / dt + n() * 4, n() * 3, yawRate]);
        this._prevLean = lean;
      }
      if (now - lastFix > 1000) {
        lastFix = now;
        this.onFix && this.onFix({
          t: Date.now(), lat: this.lat, lng: this.lng,
          speed: this.speed + (Math.random() - 0.5) * 0.4, heading: this.heading, accuracy: 5, alt: 120,
        });
      }
    }, 50);
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}
