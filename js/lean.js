// Lean angle from device orientation.
//
// The browser gives us the OS sensor-fused attitude (gyro + accelerometer) as
// alpha/beta/gamma. From beta/gamma we build the world "down" unit vector
// expressed in the phone's own axes (x right, y up, z out of the screen).
// Using the fused attitude instead of the raw accelerometer matters on a bike:
// in a balanced corner the raw accelerometer points along the bike's axis and
// would read ~0° lean; the gyro-fused attitude keeps the real roll.
//
// Lean is then the signed rotation of "down" about the bike's forward axis,
// relative to the "down" vector captured at calibration (bike upright).
// The forward axis depends on how the phone is mounted:
//   bars  : portrait on the handlebar, screen facing the rider -> forward is -z
//   frame : portrait lying on the tank/frame, top pointing ahead -> forward is +y
//   bag   : same geometry as frame
// The raw forward axis is projected onto the plane perpendicular to the
// calibrated down vector, so the phone's viewing tilt does not matter.

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }

// World-down unit vector in phone coordinates from W3C beta (x-tilt) and gamma (y-tilt).
// Third row of the Z-X'-Y'' rotation matrix, negated. Independent of alpha (compass).
export function downFromOrientation(beta, gamma) {
  const b = (beta || 0) * RAD, g = (gamma || 0) * RAD;
  const cb = Math.cos(b), sb = Math.sin(b), cg = Math.cos(g), sg = Math.sin(g);
  return [cb * sg, -sb, -cb * cg];
}

const FORWARD_RAW = {
  bars: [0, 0, -1],
  frame: [0, 1, 0],
  bag: [0, 1, 0],
};

// Lean angle (degrees, +right) of a down vector `g` measured in calibration frame `cal`.
export function leanInFrame(cal, g) {
  const { g0, f, r } = cal;
  const gPerp = sub(g, scale(f, dot(g, f)));
  const a = Math.atan2(dot(gPerp, r), dot(gPerp, g0)) * DEG;
  return Number.isFinite(a) ? a : 0;
}

// A road bike cannot lean beyond this; larger readings are handling / mount artefacts.
export const MAX_VALID_LEAN = 70;

// Rotate a phone-frame vector about the screen normal (z) by `deg`.
function rotZ(v, deg) {
  const a = deg * RAD, c = Math.cos(a), s = Math.sin(a);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}
const normAngle = a => ((a % 360) + 360) % 360;

export class LeanEstimator {
  constructor() {
    this.mount = 'bars';
    this.invert = false;
    this.filtered = null;     // low-pass filtered down vector
    this.alpha = 0.25;        // EMA factor (~60 Hz input)
    this.cal = null;          // { g0, f, r }
    this.calSamples = null;   // accumulating during calibration
    this.angle = 0;           // degrees, +right / -left
    this.valid = true;        // false while |angle| exceeds MAX_VALID_LEAN
    this.hasData = false;
    // Screen orientation handling. Sensor axes are fixed to the phone's natural (portrait) frame, so
    // turning the phone to landscape looks like a 90° roll (bars mount) or swings the forward axis
    // (tank mount). We track the screen angle and rotate the calibration frame to match.
    this.screenAngle = 0;     // current screen.orientation.angle (0/90/180/270)
    this.axisRot = 0;         // rotation applied to the mount's forward axis, degrees about z
    this.pendingScreenAngle = null;
  }

  setMount(mount) {
    this.mount = FORWARD_RAW[mount] ? mount : 'bars';
    if (this.cal) this._deriveAxes(this.cal.g0);
  }
  setInvert(v) { this.invert = !!v; }

  // Restore a saved calibration ({ g0, axisRot, screenAngle, mount }).
  restore(saved) {
    if (!saved || !Array.isArray(saved.g0)) return false;
    this.axisRot = saved.axisRot || 0;
    this.screenAngle = saved.screenAngle || 0;
    this._deriveAxes(norm(saved.g0));
    return true;
  }
  exportCalibration() {
    return this.cal ? { g0: this.cal.g0, axisRot: this.axisRot, screenAngle: this.screenAngle, mount: this.mount, at: Date.now() } : null;
  }

  _deriveAxes(g0) {
    const fRaw = rotZ(FORWARD_RAW[this.mount], this.axisRot);
    let f = sub(fRaw, scale(g0, dot(fRaw, g0)));
    if (Math.hypot(...f) < 0.05) {
      // Degenerate: chosen forward axis is nearly vertical for this phone pose. Fall back to the other axis.
      const alt = rotZ(this.mount === 'bars' ? [0, 1, 0] : [0, 0, -1], this.axisRot);
      f = sub(alt, scale(g0, dot(alt, g0)));
    }
    f = norm(f);
    const r = cross(g0, f); // right-hand lateral axis: leaning toward r is positive (right)
    this.cal = { g0, f, r };
  }

  // The screen rotated (or the app started at a different orientation than the saved calibration).
  // Returns the rotation applied (degrees about z), or 0.
  setScreenAngle(angle) {
    angle = normAngle(Math.round(angle / 90) * 90);
    if (angle === this.screenAngle) { this.pendingScreenAngle = null; return 0; }
    if (!this.cal) { this.axisRot = -angle; this.screenAngle = angle; return 0; }
    if (!this.filtered) { this.pendingScreenAngle = angle; return 0; } // no sample yet: apply on first update()
    this.pendingScreenAngle = null;
    // Screen Orientation API: angle grows counter-clockwise, i.e. the phone was turned the other way.
    let delta = normAngle(angle - this.screenAngle); if (delta === 270) delta = -90;
    let rot = -delta;
    // Prefer what gravity says: which 90° step maps the old reference onto the current down vector?
    // Only decisive when the phone is not lying flat (rotating a flat phone about z leaves gravity unchanged).
    const g0 = this.cal.g0, g = this.filtered;
    if (Math.hypot(g0[0], g0[1]) > 0.3) {
      const cands = [90, -90, 180].map(d => { const v = rotZ(g0, d); return { d, err: Math.hypot(v[0] - g[0], v[1] - g[1], v[2] - g[2]) }; })
        .sort((a, b) => a.err - b.err);
      if (cands[0].err < 0.6 * cands[1].err) rot = cands[0].d;
    }
    this.axisRot += rot;
    this.screenAngle = angle;
    this._deriveAxes(rotZ(g0, rot));
    this.onCalibrated && this.onCalibrated(this.exportCalibration());
    return rot;
  }

  // Shift the reference so a reading of `deg` (as displayed, +right) becomes 0. Used by auto-zero.
  applyRollOffset(deg) {
    if (!this.cal || !Number.isFinite(deg) || deg === 0) return;
    const d = (this.invert ? -deg : deg) * RAD;
    const { g0, r } = this.cal;
    const g1 = norm([g0[0] * Math.cos(d) + r[0] * Math.sin(d), g0[1] * Math.cos(d) + r[1] * Math.sin(d), g0[2] * Math.cos(d) + r[2] * Math.sin(d)]);
    this._deriveAxes(g1);
    this.onCalibrated && this.onCalibrated(this.exportCalibration());
  }

  // Begin a calibration: average the next `ms` of samples, then lock in.
  startCalibration(ms = 1000) {
    this.calSamples = { sum: [0, 0, 0], n: 0, until: performance.now() + ms };
  }
  get calibrating() { return !!this.calSamples; }

  // Feed one orientation sample. Returns the current lean angle in degrees (or null if not calibrated).
  update(beta, gamma) {
    if (beta == null || gamma == null) return this.angle;
    const d = downFromOrientation(beta, gamma);
    this.hasData = true;
    if (!this.filtered) this.filtered = d;
    else {
      const a = this.alpha;
      this.filtered = norm([
        this.filtered[0] + a * (d[0] - this.filtered[0]),
        this.filtered[1] + a * (d[1] - this.filtered[1]),
        this.filtered[2] + a * (d[2] - this.filtered[2]),
      ]);
    }

    if (this.calSamples) {
      const c = this.calSamples;
      c.sum[0] += d[0]; c.sum[1] += d[1]; c.sum[2] += d[2]; c.n++;
      if (performance.now() >= c.until && c.n > 0) {
        this.axisRot = -this.screenAngle; // fresh reference in the current screen orientation
        this._deriveAxes(norm(c.sum));
        this.calSamples = null;
        this.pendingScreenAngle = null;
        this.onCalibrated && this.onCalibrated(this.exportCalibration());
      }
    }

    if (!this.cal) return null;
    if (this.pendingScreenAngle != null) this.setScreenAngle(this.pendingScreenAngle);
    const { g0, f, r } = this.cal;
    const g = this.filtered;
    const gPerp = sub(g, scale(f, dot(g, f)));
    let ang = Math.atan2(dot(gPerp, r), dot(gPerp, g0)) * DEG;
    if (this.invert) ang = -ang;
    if (!Number.isFinite(ang)) ang = 0;
    this.valid = Math.abs(ang) <= MAX_VALID_LEAN;
    this.angle = ang;
    return ang;
  }
}
