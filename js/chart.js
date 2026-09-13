// Touch-friendly time-history chart: one strip per channel, shared time axis.
// Drag = pan, pinch / wheel = zoom (time axis), tap = cursor readout, double-tap = reset.
//
// channels: [{ key, name, unit, color, t: number[] (seconds), v: (number|null)[] }]

const FONT = '11px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const PAD = { left: 8, right: 8, top: 6, bottom: 22, gap: 8 };
const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];

function fmtTime(s) {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = n => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}
export function lowerBound(arr, x) { // first index with arr[i] >= x
  let lo = 0, hi = arr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < x) lo = mid + 1; else hi = mid; }
  return lo;
}

export function createChart(canvas, opts = {}) {
  const ctx = canvas.getContext('2d');
  let channels = opts.channels || [];
  let duration = Math.max(1, opts.duration || 1);
  let view = { t0: 0, t1: duration };
  let cursor = null;
  let W = 0, H = 0, dpr = 1;
  let strips = [];

  function layout() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(3, window.devicePixelRatio || 1);
    W = Math.max(50, rect.width); H = Math.max(50, rect.height);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const plotL = () => PAD.left, plotR = () => W - PAD.right, plotW = () => plotR() - plotL();
  const xOf = t => plotL() + (t - view.t0) / (view.t1 - view.t0) * plotW();
  const tOf = x => view.t0 + (x - plotL()) / plotW() * (view.t1 - view.t0);

  function clampView() {
    let span = view.t1 - view.t0;
    span = Math.max(Math.min(2, duration), Math.min(duration, span));
    let t0 = Math.max(0, Math.min(duration - span, view.t0));
    view = { t0, t1: t0 + span };
  }

  function render() {
    if (!W) layout();
    ctx.clearRect(0, 0, W, H);
    const n = channels.length;
    const usable = H - PAD.top - PAD.bottom - PAD.gap * Math.max(0, n - 1);
    const sh = n ? usable / n : 0;
    strips = channels.map((c, i) => ({ c, y: PAD.top + i * (sh + PAD.gap), h: sh }));

    // Time ticks
    const span = view.t1 - view.t0;
    const targetTicks = Math.max(3, plotW() / 70);
    let step = TICK_STEPS[TICK_STEPS.length - 1];
    for (const s of TICK_STEPS) { if (span / s <= targetTicks) { step = s; break; } }
    const firstTick = Math.ceil(view.t0 / step) * step;

    ctx.font = FONT; ctx.textBaseline = 'middle';
    for (const s of strips) {
      const { c, y, h } = s;
      // panel
      ctx.fillStyle = '#15151b';
      roundRect(ctx, plotL(), y, plotW(), h, 8); ctx.fill();
      // visible range
      const i0 = Math.max(0, lowerBound(c.t, view.t0) - 1), i1 = Math.min(c.t.length, lowerBound(c.t, view.t1) + 1);
      let mn = Infinity, mx = -Infinity;
      for (let i = i0; i < i1; i++) { const v = c.v[i]; if (v == null) continue; if (v < mn) mn = v; if (v > mx) mx = v; }
      if (!Number.isFinite(mn)) { mn = -1; mx = 1; }
      if (c.symmetric) { const m = Math.max(Math.abs(mn), Math.abs(mx), 0.01); mn = -m; mx = m; }
      if (mx - mn < 1e-6) { mn -= 1; mx += 1; }
      const padV = (mx - mn) * 0.12; mn -= padV; mx += padV;
      const yOf = v => y + h - (v - mn) / (mx - mn) * h;
      s.yOf = yOf; s.mn = mn; s.mx = mx;
      // grid: vertical ticks
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
      for (let tk = firstTick; tk <= view.t1; tk += step) { const x = Math.round(xOf(tk)) + 0.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.stroke(); }
      // zero line
      if (mn < 0 && mx > 0) { ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(plotL(), Math.round(yOf(0)) + 0.5); ctx.lineTo(plotR(), Math.round(yOf(0)) + 0.5); ctx.stroke(); ctx.setLineDash([]); }
      // series (min/max per pixel column when dense, else polyline)
      ctx.save(); ctx.beginPath(); ctx.rect(plotL(), y, plotW(), h); ctx.clip();
      ctx.strokeStyle = c.color; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const samplesPerPx = (i1 - i0) / Math.max(1, plotW());
      ctx.beginPath();
      if (samplesPerPx > 2) {
        let col = -1, cmin = 0, cmax = 0, started = false;
        for (let i = i0; i < i1; i++) {
          const v = c.v[i]; if (v == null) continue;
          const x = Math.round(xOf(c.t[i]));
          if (x !== col) {
            if (col >= 0) { if (!started) { ctx.moveTo(col, yOf(cmax)); started = true; } ctx.lineTo(col, yOf(cmax)); ctx.lineTo(col, yOf(cmin)); }
            col = x; cmin = v; cmax = v;
          } else { if (v < cmin) cmin = v; if (v > cmax) cmax = v; }
        }
        if (col >= 0) { ctx.lineTo(col, yOf(cmax)); ctx.lineTo(col, yOf(cmin)); }
      } else {
        let pen = false;
        for (let i = i0; i < i1; i++) {
          const v = c.v[i];
          if (v == null) { pen = false; continue; }
          const x = xOf(c.t[i]), yy = yOf(v);
          if (!pen) { ctx.moveTo(x, yy); pen = true; } else ctx.lineTo(x, yy);
        }
      }
      ctx.stroke(); ctx.restore();
      // labels
      ctx.fillStyle = c.color; ctx.textAlign = 'left';
      ctx.fillText(`${c.name}${c.unit ? ' · ' + c.unit : ''}`, plotL() + 8, y + 10);
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.textAlign = 'right';
      ctx.fillText(fmtNum(mx - padV), plotR() - 6, y + 10);
      ctx.fillText(fmtNum(mn + padV), plotR() - 6, y + h - 9);
    }
    // time axis labels
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.textAlign = 'center';
    for (let tk = firstTick; tk <= view.t1; tk += step) ctx.fillText(fmtTime(tk), xOf(tk), H - 10);
    // cursor
    if (cursor != null && cursor >= view.t0 && cursor <= view.t1) {
      const x = Math.round(xOf(cursor)) + 0.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, H - PAD.bottom); ctx.stroke();
      for (const s of strips) {
        const { c } = s;
        const i = nearestIndex(c.t, cursor);
        if (i < 0 || c.v[i] == null) continue;
        const yy = s.yOf(c.v[i]);
        ctx.fillStyle = c.color; ctx.beginPath(); ctx.arc(xOf(c.t[i]), yy, 3.5, 0, Math.PI * 2); ctx.fill();
        const label = `${fmtNum(c.v[i])}${c.unit ? ' ' + c.unit : ''}`;
        const tw = ctx.measureText(label).width + 12;
        const bx = x + 8 + tw > plotR() ? x - 8 - tw : x + 8;
        ctx.fillStyle = 'rgba(8,8,10,0.92)'; roundRect(ctx, bx, s.y + s.h / 2 - 10, tw, 20, 6); ctx.fill();
        ctx.strokeStyle = c.color; ctx.lineWidth = 1; roundRect(ctx, bx, s.y + s.h / 2 - 10, tw, 20, 6); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.fillText(label, bx + 6, s.y + s.h / 2);
      }
      const tl = fmtTime(cursor), tw = ctx.measureText(tl).width + 12;
      const bx = Math.min(plotR() - tw, Math.max(plotL(), x - tw / 2));
      ctx.fillStyle = '#ff7b1c'; roundRect(ctx, bx, H - PAD.bottom + 2, tw, 18, 5); ctx.fill();
      ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.fillText(tl, bx + tw / 2, H - PAD.bottom + 11);
    }
  }
  function fmtNum(v) { const a = Math.abs(v); return a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2).replace(/\.?0+$/, ''); }
  function nearestIndex(t, x) {
    if (!t.length) return -1;
    const i = lowerBound(t, x);
    if (i <= 0) return 0; if (i >= t.length) return t.length - 1;
    return (x - t[i - 1]) < (t[i] - x) ? i - 1 : i;
  }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  // ---- interaction ----
  const pointers = new Map();
  let drag = null, pinch = null, moved = false, lastTap = 0;
  const local = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  function zoomAt(x, factor) {
    const tAt = tOf(x), span = (view.t1 - view.t0) * factor;
    const frac = (x - plotL()) / plotW();
    view = { t0: tAt - frac * span, t1: tAt + (1 - frac) * span }; clampView(); render();
  }
  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    const p = local(e); pointers.set(e.pointerId, p);
    if (pointers.size === 1) { drag = { x: p.x, t0: view.t0, t1: view.t1, at: performance.now() }; moved = false; pinch = null; }
    else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.max(10, Math.abs(a.x - b.x)), mid: (a.x + b.x) / 2, t0: view.t0, t1: view.t1 }; drag = null; moved = true;
    }
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e); pointers.set(e.pointerId, p);
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.max(10, Math.abs(a.x - b.x)), mid = (a.x + b.x) / 2;
      const span0 = pinch.t1 - pinch.t0, span = span0 * pinch.d / d;
      const tMid = pinch.t0 + (pinch.mid - plotL()) / plotW() * span0; // time under the original midpoint
      const frac = (mid - plotL()) / plotW();
      view = { t0: tMid - frac * span, t1: tMid + (1 - frac) * span }; clampView(); render();
    } else if (drag) {
      const dx = p.x - drag.x;
      if (Math.abs(dx) > 4) moved = true;
      if (moved) { const shift = -dx / plotW() * (drag.t1 - drag.t0); view = { t0: drag.t0 + shift, t1: drag.t1 + shift }; clampView(); render(); }
    }
    e.preventDefault();
  });
  const up = e => {
    if (!pointers.has(e.pointerId)) return;
    const p = pointers.get(e.pointerId); pointers.delete(e.pointerId);
    if (drag && !moved && performance.now() - drag.at < 500) {
      const now = performance.now();
      if (now - lastTap < 320) { reset(); lastTap = 0; }
      else { cursor = Math.max(view.t0, Math.min(view.t1, tOf(p.x))); lastTap = now; render(); opts.onCursor && opts.onCursor(cursor); }
    }
    if (pointers.size === 0) { drag = null; pinch = null; }
    else if (pointers.size === 1) { const q = [...pointers.values()][0]; drag = { x: q.x, t0: view.t0, t1: view.t1, at: 0 }; pinch = null; moved = true; }
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => { e.preventDefault(); zoomAt(local(e).x, Math.exp(e.deltaY * 0.0015)); }, { passive: false });
  canvas.addEventListener('dblclick', e => { e.preventDefault(); reset(); });

  function reset() { view = { t0: 0, t1: duration }; render(); }
  const ro = new ResizeObserver(() => { layout(); render(); });
  ro.observe(canvas);
  layout(); render();

  return {
    render, reset,
    setChannels(list) { channels = list; render(); },
    setData(list, dur) { channels = list; duration = Math.max(1, dur); view = { t0: 0, t1: duration }; cursor = null; render(); },
    setCursor(tSec) { cursor = tSec; render(); },
    destroy() { ro.disconnect(); },
  };
}
