// Auto-zero of the lean angle from straight riding.
//
// Idea: the longest stretches of a ride are straights, and on a straight the true lean is ~0°.
// Whenever GPS says we are going straight at speed (heading not changing, speed above a floor)
// and the lean reading is steady, we accumulate a "straight segment". The duration-weighted
// median of the segment means is the calibration offset; the app removes it from the reference
// (LeanEstimator.applyRollOffset), so the correction persists like a manual CAL.
//
// Corrections are only released 1 s into a steady straight, never mid-corner, and capped per step.

export class AutoZero {
  constructor(opts = {}) {
    this.minSpeed = opts.minSpeed ?? 8;        // m/s (~29 km/h)
    this.maxHeadingRate = opts.maxHeadingRate ?? 1.5; // deg/s, above this it is a bend
    this.minDuration = opts.minDuration ?? 6;  // s of steady straight to count a segment
    this.maxDev = opts.maxDev ?? 3;            // deg, a sample this far from the window mean ends the segment
    this.settle = opts.settle ?? 1500;         // ms ignored after a straight begins (lean still returning to 0)
    this.minTotal = opts.minTotal ?? 20;       // s of straights before the first estimate
    this.minSegments = opts.minSegments ?? 3;
    this.threshold = opts.threshold ?? 0.3;    // deg, ignore smaller offsets
    this.maxStep = opts.maxStep ?? 3;          // deg, cap per correction
    this.keep = opts.keep ?? 30;               // segments remembered
    this.reset();
  }

  reset() {
    this.segments = [];       // { dur, mean }
    this.win = null;          // accumulating straight window
    this.straight = false;
    this.straightSince = null;
    this._lastFix = null;
    this._blockUntil = 0;
    this.pending = null;      // correction waiting for a calm moment
    this.applied = 0;         // total applied this session (deg)
  }

  // GPS fix: decides whether we are on a straight. heading in degrees, t in ms.
  addFix(speed, heading, t) {
    let straight = false;
    if (speed != null && speed >= this.minSpeed && heading != null && this._lastFix && this._lastFix.heading != null) {
      const dt = (t - this._lastFix.t) / 1000;
      if (dt > 0 && dt < 5) {
        let dh = Math.abs(heading - this._lastFix.heading) % 360;
        if (dh > 180) dh = 360 - dh;
        straight = dh / dt <= this.maxHeadingRate;
      }
    }
    this._lastFix = { t, heading, speed };
    if (straight && !this.straight) this.straightSince = t;
    if (!straight) this._closeWindow(t);
    this.straight = straight;
  }

  // Lean sample (~60 Hz), already calibrated. Returns a correction in degrees to apply now, or null.
  addLean(lean, t) {
    if (!this.straight || !Number.isFinite(lean) || t < this._blockUntil || t - this.straightSince < this.settle) return this._release(t);
    const w = this.win;
    if (!w) {
      this.win = { t0: t, sum: lean, n: 1 };
      return this._release(t);
    }
    if (Math.abs(lean - w.sum / w.n) > this.maxDev) {
      // Lean is leaving the steady value (corner entry, lane change): the straight ends here. GPS will
      // only notice the heading change a second later, so close the segment now and pause briefly.
      this._closeWindow(t);
      this._blockUntil = t + this.settle;
      return null;
    }
    w.sum += lean; w.n++;
    return this._release(t);
  }

  _closeWindow(t) {
    const w = this.win;
    this.win = null;
    if (!w) return;
    const dur = (t - w.t0) / 1000;
    if (dur < this.minDuration) return;
    this.segments.push({ dur, mean: w.sum / w.n });
    if (this.segments.length > this.keep) this.segments.shift();
    const est = this.estimate();
    if (est != null && Math.abs(est) >= this.threshold) this.pending = Math.max(-this.maxStep, Math.min(this.maxStep, est));
  }

  // Duration-weighted median of segment means.
  estimate() {
    const segs = this.segments;
    if (segs.length < this.minSegments) return null;
    const total = segs.reduce((a, s) => a + s.dur, 0);
    if (total < this.minTotal) return null;
    const sorted = [...segs].sort((a, b) => a.mean - b.mean);
    let acc = 0;
    for (const s of sorted) {
      acc += s.dur;
      if (acc >= total / 2) return s.mean;
    }
    return sorted[sorted.length - 1].mean;
  }

  // Hand out a pending correction only 1 s into a steady straight window (a calm moment, never mid-corner).
  _release(t) {
    if (this.pending == null || !this.straight || !this.win || t - this.win.t0 < 1000) return null;
    const c = this.pending;
    this.pending = null;
    this.applied += c;
    // Segment means were measured before the correction: shift them so the next estimate starts from zero.
    for (const s of this.segments) s.mean -= c;
    this.win = null;
    return c;
  }
}
