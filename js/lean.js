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

export class LeanEstimator {
  constructor() {
    this.mount = 'bars';
    this.invert = false;
    this.filtered = null;     // low-pass filtered down vector
    this.alpha = 0.25;        // EMA factor (~60 Hz input)
    this.cal = null;          // { g0, f, r }
    this.calSamples = null;   // accumulating during calibration
    this.angle = 0;           // degrees, +right / -left
    this.hasData = false;
  }

  setMount(mount) {
    this.mount = FORWARD_RAW[mount] ? mount : 'bars';
    if (this.cal) this._deriveAxes(this.cal.g0);
  }
  setInvert(v) { this.invert = !!v; }

  // Restore a saved calibration ({ g0: [x,y,z], mount }).
  restore(saved) {
    if (!saved || !Array.isArray(saved.g0)) return false;
    this._deriveAxes(norm(saved.g0));
    return true;
  }
  exportCalibration() { return this.cal ? { g0: this.cal.g0, mount: this.mount, at: Date.now() } : null; }

  _deriveAxes(g0) {
    const fRaw = FORWARD_RAW[this.mount];
    let f = sub(fRaw, scale(g0, dot(fRaw, g0)));
    if (Math.hypot(...f) < 0.05) {
      // Degenerate: chosen forward axis is nearly vertical for this phone pose. Fall back to the other axis.
      const alt = this.mount === 'bars' ? [0, 1, 0] : [0, 0, -1];
      f = sub(alt, scale(g0, dot(alt, g0)));
    }
    f = norm(f);
    const r = cross(g0, f); // right-hand lateral axis: leaning toward r is positive (right)
    this.cal = { g0, f, r };
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
        this._deriveAxes(norm(c.sum));
        this.calSamples = null;
        this.onCalibrated && this.onCalibrated(this.exportCalibration());
      }
    }

    if (!this.cal) return null;
    const { g0, f, r } = this.cal;
    const g = this.filtered;
    const gPerp = sub(g, scale(f, dot(g, f)));
    let ang = Math.atan2(dot(gPerp, r), dot(gPerp, g0)) * DEG;
    if (this.invert) ang = -ang;
    // Guard against wild values from a bad calibration; a bike never exceeds ~65° on the road.
    if (!Number.isFinite(ang)) ang = 0;
    this.angle = ang;
    return ang;
  }
}
